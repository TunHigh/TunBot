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
const DEFAULT_MINE_COUNT = 8;
const MIN_MINE_COUNT = 1;
const MAX_MINE_COUNT = TOTAL_CELLS - 1;
const GAME_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const DEFAULT_MESSAGE_THRESHOLD = 10;
const MIN_MESSAGE_THRESHOLD = 1;
const MAX_MESSAGE_THRESHOLD = 1000;

// Money range for money cells
const MONEY_MIN = 1000;
const MONEY_MAX = 40000;

// Cell types
const CELL_TYPES = {
  BOMB: 'bomb',           // 💣 - 8 bombs
  MONEY: 'money',         // 💰 - Money 1k-40k
  SPIN: 'spin',           // ⚪ - 2 spin chances
  EMPTY: 'empty',         // ❌ - Empty cell
};

// Cell type distribution for 25 cells (5x5)
const CELL_DISTRIBUTION = {
  [CELL_TYPES.BOMB]: 8,      // 8 bombs
  [CELL_TYPES.MONEY]: 8,     // 8 money cells
  [CELL_TYPES.SPIN]: 2,      // 2 spin cells
  [CELL_TYPES.EMPTY]: 7,     // 7 empty cells
};

export const activeGames = new Map();

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

export function isValidMinesweeperMessageThreshold(value) {
  return Number.isInteger(value) && value >= MIN_MESSAGE_THRESHOLD && value <= MAX_MESSAGE_THRESHOLD;
}

export async function configureCommunityMinesweeper(
  client,
  guildId,
  channelId,
  intervalMs,
  mineCount,
  totalReward, // kept for backward compatibility but ignored
  messageThreshold = DEFAULT_MESSAGE_THRESHOLD,
) {
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
    throw new Error('Khoảng thời gian không hợp lệ.');
  }

  if (!isValidMinesweeperMineCount(mineCount)) {
    throw new Error(`Số mìn phải từ ${MIN_MINE_COUNT} đến ${MAX_MINE_COUNT}.`);
  }

  if (!isValidMinesweeperMessageThreshold(messageThreshold)) {
    throw new Error(`Ngưỡng tin nhắn phải từ ${MIN_MESSAGE_THRESHOLD} đến ${MAX_MESSAGE_THRESHOLD}.`);
  }

  const nextGameAt = Date.now() + intervalMs;
  await patchGuildConfig(client, guildId, {
    communityMinesweeper: {
      enabled: true,
      channelId,
      intervalMs,
      mineCount,
      totalReward: 0, // Not used anymore, rewards are random per cell
      messageThreshold,
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
      messageThreshold: null,
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
    totalReward: 0, // Not used anymore, rewards are random per cell
    messageThreshold: isValidMinesweeperMessageThreshold(gameConfig.messageThreshold)
      ? gameConfig.messageThreshold
      : DEFAULT_MESSAGE_THRESHOLD,
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

        const cellType = game.cellTypeMap.get(index);
        
        if (cellType === CELL_TYPES.BOMB) {
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

        let reward = 0;
        let rewardMessage = '';
        
        switch (cellType) {
          case CELL_TYPES.MONEY:
            reward = game.moneyCells.get(index);
            game.pendingReward += reward;
            game.winners.push({ userId: interaction.user.id, reward });
            rewardMessage = `💰 ${interaction.user} đã mở ô chứa **$${reward.toLocaleString('en-US')}**. Tiền đang được giữ tạm; chỉ được cộng vào wallet nếu cả cộng đồng mở hết ô an toàn mà không dẫm mìn.`;
            break;
          case CELL_TYPES.SPIN:
            reward = 0; // Spin doesn't give direct money, gives spin chance
            game.winners.push({ userId: interaction.user.id, reward: 0, spin: true });
            rewardMessage = `⚪ ${interaction.user} đã mở ô **Lượt Quay**! Bạn nhận được 1 lượt quay may mắn.`;
            break;
          case CELL_TYPES.EMPTY:
            reward = 0;
            rewardMessage = `❌ ${interaction.user} đã mở ô **Trống**. Ô này không có thưởng.`;
            break;
        }
        
        game.revealed.add(index);

        await interaction.followUp({
          content: rewardMessage,
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
        components: buildComponents(game, true, true),
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
    totalReward: 0,
    messageThreshold: DEFAULT_MESSAGE_THRESHOLD,
    nextGameAt: null,
  };
}

function createGame(guildId, config) {
  // Create cell types array based on distribution
  const cellTypes = [];
  
  // Add bombs (mines)
  for (let i = 0; i < CELL_DISTRIBUTION[CELL_TYPES.BOMB]; i++) {
    cellTypes.push(CELL_TYPES.BOMB);
  }
  
  // Add money cells
  for (let i = 0; i < CELL_DISTRIBUTION[CELL_TYPES.MONEY]; i++) {
    cellTypes.push(CELL_TYPES.MONEY);
  }
  
  // Add spin cells
  for (let i = 0; i < CELL_DISTRIBUTION[CELL_TYPES.SPIN]; i++) {
    cellTypes.push(CELL_TYPES.SPIN);
  }
  
  // Add empty cells
  for (let i = 0; i < CELL_DISTRIBUTION[CELL_TYPES.EMPTY]; i++) {
    cellTypes.push(CELL_TYPES.EMPTY);
  }
  
  // Shuffle the cell types
  shuffle(cellTypes);
  
  // Assign cell types to board positions
  const cellTypeMap = new Map();
  const mines = new Set();
  const moneyCells = new Map(); // index -> money amount
  const spinCells = new Set();
  const emptyCells = new Set();
  
  let totalPotentialReward = 0;
  
  cellTypes.forEach((type, index) => {
    cellTypeMap.set(index, type);
    switch (type) {
      case CELL_TYPES.BOMB:
        mines.add(index);
        break;
      case CELL_TYPES.MONEY:
        const amount = Math.floor(Math.random() * (MONEY_MAX - MONEY_MIN + 1)) + MONEY_MIN;
        moneyCells.set(index, amount);
        totalPotentialReward += amount;
        break;
      case CELL_TYPES.SPIN:
        spinCells.add(index);
        break;
      case CELL_TYPES.EMPTY:
        emptyCells.add(index);
        break;
    }
  });
  
  const safeIndexes = Array.from({ length: TOTAL_CELLS }, (_, index) => index)
    .filter((index) => !mines.has(index));

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    guildId,
    mineCount: mines.size,
    safeCellCount: safeIndexes.length,
    totalReward: totalPotentialReward,
    messageThreshold: config.messageThreshold || DEFAULT_MESSAGE_THRESHOLD,
    mines,
    cellTypeMap,
    moneyCells,
    spinCells,
    emptyCells,
    rewards: new Map(), // For backward compatibility
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
  return new EmbedBuilder()
    .setColor(finished ? '#95A5A6' : '#F1C40F')
    .setTitle('💣 Dò Mìn Cộng Đồng')
    .setDescription(
      [
        '💣 = Bomb (8 quả)',
        '💰 = Tiền từ (1k-40k)',
        '⚪ = Lượt quay (2 lượt)',
        '❌ = Ô trống',
        '',
        '💬 Tiếp tục chat để có hòm quà mới! Không SPAM.',
        `💬 Mỗi **${game.messageThreshold}** tin nhắn sẽ tự động thả 1 hòm quà mới.`,
        status ? `\n${status}` : '',
      ].join('\n'),
    )
    .setFooter({
      text: finished
        ? 'Trò chơi đã kết thúc'
        : 'Mở ô an toàn, tránh bom và nhận tiền thưởng',
    })
    .setTimestamp();
}

function formatMoneyDisplay(amount) {
  if (amount >= 1000000) {
    return `${Math.floor(amount / 1000000)}M`;
  }

  if (amount >= 1000) {
    return `${Math.floor(amount / 1000)}k`;
  }

  return amount.toString();
}

function buildComponents(game, disabled = false, revealAll = false) {
  const rows = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const actionRow = new ActionRowBuilder();

    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const index = row * BOARD_SIZE + column;
      const revealed = revealAll || game.revealed.has(index);
      const cellType = game.cellTypeMap.get(index);

      let buttonStyle = ButtonStyle.Primary;
      let buttonLabel = '\u200b';
      let buttonEmoji = null;

      if (revealed) {
        switch (cellType) {
          case CELL_TYPES.BOMB:
            buttonStyle = ButtonStyle.Danger;
            buttonEmoji = '💣';
            break;
          case CELL_TYPES.MONEY:
            buttonStyle = ButtonStyle.Success;
            buttonLabel = formatMoneyDisplay(game.moneyCells.get(index));
            buttonEmoji = '💰';
            break;
          case CELL_TYPES.SPIN:
            buttonStyle = ButtonStyle.Success;
            buttonEmoji = '⚪';
            break;
          case CELL_TYPES.EMPTY:
            buttonStyle = ButtonStyle.Secondary;
            buttonEmoji = '❌';
            break;
          default:
            buttonStyle = ButtonStyle.Success;
            buttonEmoji = '❓';
        }
      }

      const button = new ButtonBuilder()
        .setCustomId(`community_mines_${game.id}_${index}`)
        .setDisabled(disabled || revealed)
        .setStyle(buttonStyle)
        .setLabel(buttonLabel);

      if (buttonEmoji) {
        button.setEmoji(buttonEmoji);
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