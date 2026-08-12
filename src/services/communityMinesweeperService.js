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
const DEFAULT_MINE_COUNT = 4;
const DEFAULT_TOTAL_REWARD = 20_000;
const MIN_MINE_COUNT = 1;
const MAX_MINE_COUNT = TOTAL_CELLS - 1;
const MIN_TOTAL_REWARD = 100;
const MAX_TOTAL_REWARD = 100_000_000;
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

export function isValidMinesweeperMineCount(value) {
  return Number.isInteger(value) && value >= MIN_MINE_COUNT && value <= MAX_MINE_COUNT;
}

export function isValidMinesweeperReward(value) {
  return Number.isInteger(value) && value >= MIN_TOTAL_REWARD && value <= MAX_TOTAL_REWARD;
}

export async function configureCommunityMinesweeper(
  client,
  guildId,
  channelId,
  intervalMs,
  mineCount,
  totalReward,
) {
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
    throw new Error('Khoảng thời gian không hợp lệ.');
  }

  if (!isValidMinesweeperMineCount(mineCount)) {
    throw new Error(`Số mìn phải từ ${MIN_MINE_COUNT} đến ${MAX_MINE_COUNT}.`);
  }

  if (!isValidMinesweeperReward(totalReward)) {
    throw new Error(`Tổng thưởng phải từ $${MIN_TOTAL_REWARD.toLocaleString('en-US')} đến $${MAX_TOTAL_REWARD.toLocaleString('en-US')}.`);
  }

  const nextGameAt = Date.now() + intervalMs;
  await patchGuildConfig(client, guildId, {
    communityMinesweeper: {
      enabled: true,
      channelId,
      intervalMs,
      mineCount,
      totalReward,
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
      mineCount: null,
      totalReward: null,
      nextGameAt: null,
    },
  }, { source: 'caidatmin' });
}

export async function getCommunityMinesweeperConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const gameConfig = config.communityMinesweeper;

  if (!gameConfig || typeof gameConfig !== 'object') {
    return getDisabledConfig();
  }

  return {
    enabled: gameConfig.enabled === true,
    channelId: typeof gameConfig.channelId === 'string' ? gameConfig.channelId : null,
    intervalMs: Number.isInteger(gameConfig.intervalMs) ? gameConfig.intervalMs : null,
    mineCount: isValidMinesweeperMineCount(gameConfig.mineCount)
      ? gameConfig.mineCount
      : DEFAULT_MINE_COUNT,
    totalReward: isValidMinesweeperReward(gameConfig.totalReward)
      ? gameConfig.totalReward
      : DEFAULT_TOTAL_REWARD,
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

      await startCommunityMinesweeper(client, guild, channel, config);
    } catch (error) {
      logger.error('[COMMUNITY_MINESWEEPER] Scheduler check failed', {
        guildId,
        error: error.message,
      });
    }
  }
}

export async function startCommunityMinesweeper(client, guild, channel, config) {
  if (activeGames.has(guild.id)) return null;

  const game = createGame(guild.id, config);
  activeGames.set(guild.id, game);

  try {
    game.message = await channel.send({
      embeds: [buildEmbed(game)],
      components: buildComponents(game),
    });

    const collector = game.message.createMessageComponentCollector({
      time: GAME_TIMEOUT_MS,
      filter: (interaction) => interaction.isButton()
        && interaction.customId.startsWith(`community_mines_${game.id}_`),
    });

    game.collector = collector;

    collector.on('collect', async (interaction) => {
      const index = Number(interaction.customId.split('_').at(-1));

      if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) {
        await interaction.reply({ content: 'Ô chơi không hợp lệ.', ephemeral: true }).catch(() => {});
        return;
      }

      if (game.finished || game.revealed.has(index) || game.processing.has(index)) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      game.processing.add(index);

      try {
        await interaction.deferUpdate();

        if (game.mines.has(index)) {
          game.revealed.add(index);
          game.mineTriggeredBy = interaction.user;
          game.outcome = 'mine';
          collector.stop('mine');

          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('💥 Dò Mìn — Trò Chơi Kết Thúc')
                .setDescription(
                  `${interaction.user} đã dẫm trúng mìn.\n`
                  + `Toàn bộ **$${game.pendingReward.toLocaleString('en-US')}** tiền thưởng đã mở bị hủy và **không ai được cộng wallet**.`,
                )
                .setTimestamp(),
            ],
          }).catch(() => {});

          return;
        }

        const reward = game.rewards.get(index);
        game.revealed.add(index);
        game.pendingReward += reward;
        game.winners.push({ userId: interaction.user.id, reward });

        await interaction.followUp({
          content: `💰 ${interaction.user} đã mở ô chứa **$${reward.toLocaleString('en-US')}**. Tiền đang được giữ tạm; chỉ được cộng vào wallet nếu cả cộng đồng mở hết ô an toàn mà không dẫm mìn.`,
          ephemeral: false,
        }).catch(() => {});

        await game.message.edit({
          embeds: [buildEmbed(game)],
          components: buildComponents(game),
        });

        if (getSafeCellsRevealed(game) === game.safeCellCount) {
          game.outcome = 'completed';
          collector.stop('completed');
        }
      } catch (error) {
        logger.error('[COMMUNITY_MINESWEEPER] Failed to process board cell', {
          guildId: guild.id,
          userId: interaction.user.id,
          index,
          error: error.message,
        });

        await interaction.followUp({
          content: 'Không thể xử lý ô chơi này. Vui lòng thử một ô khác.',
          ephemeral: true,
        }).catch(() => {});
      } finally {
        game.processing.delete(index);
      }
    });

    collector.on('end', async (_collected, reason) => {
      game.finished = true;
      activeGames.delete(guild.id);

      let status;
      if (reason === 'completed' && game.outcome === 'completed') {
        const paidReward = await payPendingRewards(client, guild.id, game);
        status = paidReward === game.totalReward
          ? `🎉 Đã mở hết ô an toàn! **$${paidReward.toLocaleString('en-US')}** đã được cộng vào wallet của người chơi.`
          : `⚠️ Đã mở hết ô an toàn, nhưng chỉ cộng được **$${paidReward.toLocaleString('en-US')}** / **$${game.totalReward.toLocaleString('en-US')}**. Hãy kiểm tra log bot.`;
      } else if (reason === 'mine' || game.outcome === 'mine') {
        status = `💥 ${game.mineTriggeredBy ?? 'Một người chơi'} đã dẫm mìn. Toàn bộ **$${game.pendingReward.toLocaleString('en-US')}** tiền thưởng đã bị hủy.`;
      } else {
        status = `⌛ Hết giờ! **$${game.pendingReward.toLocaleString('en-US')}** tiền thưởng tạm giữ đã hết hiệu lực và không được cộng vào ví của bạn.`;
      }

      await game.message.edit({
        embeds: [buildEmbed(game, status, true)],
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
      mineCount: game.mineCount,
      totalReward: game.totalReward,
    });

    return game;
  } catch (error) {
    activeGames.delete(guild.id);
    throw error;
  }
}

function getDisabledConfig() {
  return {
    enabled: false,
    channelId: null,
    intervalMs: null,
    mineCount: DEFAULT_MINE_COUNT,
    totalReward: DEFAULT_TOTAL_REWARD,
    nextGameAt: null,
  };
}

function createGame(guildId, config) {
  const mines = new Set();

  while (mines.size < config.mineCount) {
    mines.add(Math.floor(Math.random() * TOTAL_CELLS));
  }

  const safeIndexes = Array.from({ length: TOTAL_CELLS }, (_, index) => index)
    .filter((index) => !mines.has(index));

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    guildId,
    mineCount: config.mineCount,
    safeCellCount: safeIndexes.length,
    totalReward: config.totalReward,
    mines,
    rewards: splitReward(config.totalReward, safeIndexes),
    revealed: new Set(),
    processing: new Set(),
    winners: [],
    pendingReward: 0,
    outcome: null,
    mineTriggeredBy: null,
    finished: false,
    message: null,
    collector: null,
  };
}

async function payPendingRewards(client, guildId, game) {
  let paidReward = 0;

  for (const winner of game.winners) {
    try {
      await EconomyService.addMoney(
        client,
        guildId,
        winner.userId,
        winner.reward,
        'community_minesweeper_completed',
      );
      paidReward += winner.reward;
    } catch (error) {
      logger.error('[COMMUNITY_MINESWEEPER] Failed to pay completed game reward', {
        guildId,
        userId: winner.userId,
        reward: winner.reward,
        error: error.message,
      });
    }
  }

  return paidReward;
}

function splitReward(total, safeIndexes) {
  const values = Array(safeIndexes.length).fill(0);

  for (let amount = total; amount > 0; amount -= 1) {
    values[Math.floor(Math.random() * values.length)] += 1;
  }

  shuffle(values);

  return new Map(safeIndexes.map((index, rewardIndex) => [index, values[rewardIndex]]));
}

function getSafeCellsRevealed(game) {
  return [...game.revealed].filter((index) => !game.mines.has(index)).length;
}

function buildEmbed(game, status = null, finished = false) {
  const safeCellsRevealed = getSafeCellsRevealed(game);
  const remainingSafeCells = game.safeCellCount - safeCellsRevealed;

  return new EmbedBuilder()
    .setColor(finished ? '#95A5A6' : '#F1C40F')
    .setTitle(`💣 Dò Mìn Cộng Đồng — Kho Báu $${game.totalReward.toLocaleString('en-US')}`)
    .setDescription(
      [
        'Mở hết tất cả ô an toàn để nhận tiền. Nếu bất kỳ ai dẫm mìn, trò chơi kết thúc và toàn bộ thưởng đã mở bị hủy.',
        '',
        `💣 Số mìn: **${game.mineCount}**`,
        `💰 Thưởng đang tạm giữ: **$${game.pendingReward.toLocaleString('en-US')}**`,
        `🧭 Ô an toàn chưa mở: **${remainingSafeCells}**`,
        status ? `\n${status}` : '',
      ].join('\n'),
    )
    .setFooter({
      text: finished
        ? 'Trò chơi đã kết thúc'
        : 'Tiền chỉ vào ví khi mở hết ô an toàn mà không dẫm mìn',
    })
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