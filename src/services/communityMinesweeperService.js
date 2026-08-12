import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import EconomyService from './economyService.js';
import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const BOARD_SIZE = 5;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
const MINE_COUNT = 4;
const SAFE_CELL_COUNT = TOTAL_CELLS - MINE_COUNT;
const TOTAL_REWARD = 20_000;
const GAME_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

const activeGames = new Map();

export function parseMinesweeperInterval(value) {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  const milliseconds =
    (Number(hours) * 60 * 60 + Number(minutes) * 60 + Number(seconds)) * 1000;

  return milliseconds >= MIN_INTERVAL_MS ? milliseconds : null;
}

export function formatMinesweeperInterval(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export async function configureCommunityMinesweeper(client, guildId, channelId, intervalMs) {
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
    throw new Error('Khoảng thời gian không hợp lệ.');
  }

  const nextGameAt = Date.now() + intervalMs;
  await patchGuildConfig(client, guildId, {
    communityMinesweeper: {
      enabled: true,
      channelId,
      intervalMs,
      nextGameAt,
    },
  }, { source: 'caidatmin' });

  return { nextGameAt };
}

export async function disableCommunityMinesweeper(client, guildId) {
  await patchGuildConfig(client, guildId, {
    communityMinesweeper: {
      enabled: false,
      channelId: null,
      intervalMs: null,
      nextGameAt: null,
    },
  }, { source: 'caidatmin' });
}

export async function getCommunityMinesweeperConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const gameConfig = config.communityMinesweeper;

  if (!gameConfig || typeof gameConfig !== 'object') {
    return {
      enabled: false,
      channelId: null,
      intervalMs: null,
      nextGameAt: null,
    };
  }

  return {
    enabled: gameConfig.enabled === true,
    channelId: typeof gameConfig.channelId === 'string' ? gameConfig.channelId : null,
    intervalMs: Number.isInteger(gameConfig.intervalMs) ? gameConfig.intervalMs : null,
    nextGameAt: Number.isInteger(gameConfig.nextGameAt) ? gameConfig.nextGameAt : null,
  };
}

export async function checkCommunityMinesweeperGames(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const config = await getCommunityMinesweeperConfig(client, guildId);
      if (!config.enabled || !config.channelId || !config.intervalMs) continue;
      if (activeGames.has(guildId)) continue;
      if (config.nextGameAt && config.nextGameAt > Date.now()) continue;

      const channel = guild.channels.cache.get(config.channelId)
        ?? await guild.channels.fetch(config.channelId).catch(() => null);

      if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
        logger.warn('[COMMUNITY_MINESWEEPER] Configured channel is unavailable', {
          guildId,
          channelId: config.channelId,
        });

        await disableCommunityMinesweeper(client, guildId);
        continue;
      }

      const nextGameAt = Date.now() + config.intervalMs;
      await patchGuildConfig(client, guildId, {
        communityMinesweeper: {
          ...config,
          nextGameAt,
        },
      }, { source: 'community_minesweeper_scheduler' });

      await startCommunityMinesweeper(client, guild, channel);
    } catch (error) {
      logger.error('[COMMUNITY_MINESWEEPER] Scheduler check failed', {
        guildId,
        error: error.message,
      });
    }
  }
}

export async function startCommunityMinesweeper(client, guild, channel) {
  if (activeGames.has(guild.id)) return null;

  const game = createGame(guild.id);
  activeGames.set(guild.id, game);

  try {
    game.message = await channel.send({
      embeds: [buildEmbed(game)],
      components: buildComponents(game),
    });

    const collector = game.message.createMessageComponentCollector({
      time: GAME_TIMEOUT_MS,
      filter: (interaction) => interaction.isButton() && interaction.customId.startsWith(`community_mines_${game.id}_`),
    });

    game.collector = collector;

    collector.on('collect', async (interaction) => {
      const index = Number(interaction.customId.split('_').at(-1));

      if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) {
        return interaction.reply({ content: 'Ô chơi không hợp lệ.', ephemeral: true }).catch(() => {});
      }

      if (game.finished || game.revealed.has(index) || game.processing.has(index)) {
        return interaction.deferUpdate().catch(() => {});
      }

      game.processing.add(index);

      try {
        if (game.mines.has(index)) {
          game.revealed.add(index);
          await interaction.deferUpdate();
          await game.message.edit({
            embeds: [buildEmbed(game, `💥 ${interaction.user} đã dò trúng mìn! Ô này không có thưởng.`)],
            components: buildComponents(game),
          });
          return;
        }

        const reward = game.rewards.get(index);
        await interaction.deferUpdate();

        await EconomyService.addMoney(
          client,
          guild.id,
          interaction.user.id,
          reward,
          'community_minesweeper',
        );

        game.revealed.add(index);
        game.claimedReward += reward;
        game.winners.push({ userId: interaction.user.id, reward });

        await game.message.edit({
          embeds: [buildEmbed(game, `💰 ${interaction.user} nhận được **$${reward.toLocaleString('en-US')}** vào wallet!`)],
          components: buildComponents(game),
        });

        const safeCellsRevealed = [...game.revealed]
          .filter((revealedIndex) => !game.mines.has(revealedIndex))
          .length;

        if (safeCellsRevealed === SAFE_CELL_COUNT) {
          collector.stop('completed');
        }
      } catch (error) {
        logger.error('[COMMUNITY_MINESWEEPER] Failed to process board cell', {
          guildId: guild.id,
          userId: interaction.user.id,
          index,
          error: error.message,
        });

        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Không thể cộng tiền thưởng. Vui lòng thử một ô khác.',
            ephemeral: true,
          }).catch(() => {});
        } else {
          await interaction.followUp({
            content: 'Không thể cộng tiền thưởng. Vui lòng thử một ô khác.',
            ephemeral: true,
          }).catch(() => {});
        }
      } finally {
        game.processing.delete(index);
      }
    });

    collector.on('end', async (_collected, reason) => {
      game.finished = true;
      activeGames.delete(guild.id);

      const summary = reason === 'completed'
        ? `🎉 Toàn bộ **$${TOTAL_REWARD.toLocaleString('en-US')}** đã được tìm thấy!`
        : `⌛ Hết giờ! Đã trao **$${game.claimedReward.toLocaleString('en-US')}** / **$${TOTAL_REWARD.toLocaleString('en-US')}**.`;

      await game.message.edit({
        embeds: [buildEmbed(game, summary, true)],
        components: buildComponents(game, true),
      }).catch((error) => {
        logger.warn('[COMMUNITY_MINESWEEPER] Could not close game message', {
          guildId: guild.id,
          error: error.message,
        });
      });
    });

    logger.info('[COMMUNITY_MINESWEEPER] Game started', {
      guildId: guild.id,
      channelId: channel.id,
      totalReward: TOTAL_REWARD,
    });

    return game;
  } catch (error) {
    activeGames.delete(guild.id);
    throw error;
  }
}

function createGame(guildId) {
  const mines = new Set();

  while (mines.size < MINE_COUNT) {
    mines.add(Math.floor(Math.random() * TOTAL_CELLS));
  }

  const safeIndexes = Array.from({ length: TOTAL_CELLS }, (_, index) => index)
    .filter((index) => !mines.has(index));

  const rewards = splitReward(TOTAL_REWARD, safeIndexes);

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    guildId,
    mines,
    rewards,
    revealed: new Set(),
    processing: new Set(),
    winners: [],
    claimedReward: 0,
    finished: false,
    message: null,
    collector: null,
  };
}

function splitReward(total, safeIndexes) {
  const values = Array(safeIndexes.length).fill(100);
  let remaining = total - values.reduce((sum, value) => sum + value, 0);

  while (remaining > 0) {
    const slot = Math.floor(Math.random() * values.length);
    const maximumAddition = Math.min(remaining, 1_000);
    const addition = Math.max(1, Math.floor(Math.random() * maximumAddition) + 1);
    values[slot] += addition;
    remaining -= addition;
  }

  shuffle(values);

  return new Map(safeIndexes.map((index, rewardIndex) => [index, values[rewardIndex]]));
}

function buildEmbed(game, status = null, finished = false) {
  const remainingReward = TOTAL_REWARD - game.claimedReward;
  const remainingSafeCells = SAFE_CELL_COUNT - [...game.revealed].filter((index) => !game.mines.has(index)).length;

  return new EmbedBuilder()
    .setColor(finished ? '#95A5A6' : '#F1C40F')
    .setTitle('💣 Săn Mìn Cộng Đồng — Kho Báu $20,000')
    .setDescription(
      [
        'Tất cả thành viên đều có thể bấm ô để săn tiền thưởng.',
        'Mỗi ô an toàn sẽ cộng tiền trực tiếp vào **wallet** của người bấm. Ô mìn không có thưởng.',
        '',
        `💰 Còn lại: **$${remainingReward.toLocaleString('en-US')}**`,
        `🧭 Ô thưởng chưa tìm thấy: **${remainingSafeCells}**`,
        status ? `\n${status}` : '',
      ].join('\n'),
    )
    .setFooter({ text: finished ? 'Trò chơi đã kết thúc' : 'Trò chơi tự kết thúc sau 5 phút' })
    .setTimestamp();
}

function buildComponents(game, disabled = false) {
  const rows = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const actionRow = new ActionRowBuilder();

    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const index = row * BOARD_SIZE + column;
      const revealed = game.revealed.has(index);
      const mine = game.mines.has(index);

      const button = new ButtonBuilder()
        .setCustomId(`community_mines_${game.id}_${index}`)
        .setDisabled(disabled || revealed)
        .setStyle(revealed ? (mine ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Primary);

      if (revealed) {
        button.setLabel(mine ? '💣' : `$${game.rewards.get(index).toLocaleString('en-US')}`);
      } else {
        button.setLabel('\u200b');
      }

      actionRow.addComponents(button);
    }

    rows.push(actionRow);
  }

  return rows;
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
}