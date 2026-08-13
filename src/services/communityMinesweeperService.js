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
const TOTAL_REWARD_MIN = 1000;
const TOTAL_REWARD_MAX = 40000;

// Cell types
const CELL_TYPES = {
  BOMB: 'bomb',           // 💣 - 8 bombs
  MONEY: 'money',         // 💰 - Money 1k-40k
  SPIN: 'spin',           // ⚪ - 1 spin chances
  EMPTY: 'empty',         // ❌ - Empty cell
};

// Cell type distribution for 25 cells (5x5)
const CELL_DISTRIBUTION = {
  [CELL_TYPES.BOMB]: 8,      // 8 bombs
  [CELL_TYPES.MONEY]: 3,     // 3 money reward cells
  [CELL_TYPES.SPIN]: 2,      // 2 spin cells
  [CELL_TYPES.EMPTY]: 12,    // 12 empty cells
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

      if (game.finished || game.resolved || game.revealed.has(index) || game.processing.has(index)) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      const cellType = game.cellTypeMap.get(index);
      game.processing.add(index);

      // Lock a money, spin, or bomb result before awaiting Discord's API.
      // The first special-cell interaction received by the bot owns the round.
      if (cellType !== CELL_TYPES.EMPTY) {
        game.resolved = true;
        game.revealed.add(index);
      }

      try {
        await interaction.deferUpdate();

        if (cellType === CELL_TYPES.EMPTY) {
          game.revealed.add(index);

          await game.message.edit({
            embeds: [buildEmbed(game)],
            components: buildComponents(game),
          });

          return;
        }

        if (cellType === CELL_TYPES.BOMB) {
          game.mineTriggeredBy = interaction.user;
          game.outcome = 'mine';
          collector.stop('mine');

          await sendGameResultReply(game, 'mine', interaction.user);
          return;
        }

        if (cellType === CELL_TYPES.MONEY) {
          const reward = game.moneyCells.get(index);
          game.pendingReward = reward;
          game.winners.push({ userId: interaction.user.id, reward });
          game.winningUser = interaction.user;
          game.outcome = 'money';
          collector.stop('money');

          await sendGameResultReply(game, 'money', interaction.user, reward);
          return;
        }

        if (cellType === CELL_TYPES.SPIN) {
          game.winners.push({ userId: interaction.user.id, reward: 0, spin: true });
          game.winningUser = interaction.user;
          game.outcome = 'spin';
          collector.stop('spin');

          await sendGameResultReply(game, 'spin', interaction.user);
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
      if (reason === 'money' && game.outcome === 'money') {
        const paidReward = await payPendingRewards(client, guild.id, game);
        status = paidReward === game.pendingReward
          ? `💸 ${game.winningUser} đã nhận **${paidReward.toLocaleString('en-US')} xu**.\nHòm quà đã đóng lại!`
          : `⚠️ Hòm quà đã đóng, nhưng chỉ cộng được **${paidReward.toLocaleString('en-US')}** / **${game.pendingReward.toLocaleString('en-US')} xu**.`;
      } else if (reason === 'spin' && game.outcome === 'spin') {
        status = `🎰✨ ${game.winningUser} nhận được **1 Lượt Quay Thưởng**.\nHòm quà đã đóng lại!`;
      } else if (reason === 'mine' || game.outcome === 'mine') {
        status = `💥 ${game.mineTriggeredBy ?? 'Một người chơi'} đã dẫm mìn.\nTất cả phần thưởng đã bị vô hiệu hóa!`;
      } else {
        status = '⌛ Hết giờ! Không có người chơi nào mở ô tiền hoặc lượt quay.';
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

async function sendGameResultReply(game, outcome, user, reward = 0) {
  let embed;

  switch (outcome) {
    case 'money':
      embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setDescription(
          `💸 ${user} TRÚNG TIỀN!\n`
          + `💰 Bạn nhận được: **${reward.toLocaleString('en-US')} xu**\n`
          + 'Hòm quà đã đóng lại!',
        );
      break;
    case 'spin':
      embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setDescription(
          `🎰✨ ${user} TRÚNG LƯỢT QUAY!\n`
          + 'Bạn nhận được: **1 Lượt Quay Thưởng**\n'
          + '🎊 Hòm quà đã đóng lại!',
        );
      break;
    case 'mine':
      embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('💥💥💥 BOOM! 💥💥💥')
        .setDescription(
          `🚨 ${user} ĐÃ DẪM PHẢI BOMB!\n`
          + '❌ Tất cả phần thưởng đã bị vô hiệu hóa!',
        );
      break;
    default:
      return;
  }

  await game.message.reply({ embeds: [embed] }).catch((error) => {
    logger.warn('[COMMUNITY_MINESWEEPER] Could not send game result reply', {
      guildId: game.guildId,
      outcome,
      error: error.message,
    });
  });
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
  const moneyIndexes = [];

  cellTypes.forEach((type, index) => {
    cellTypeMap.set(index, type);
    switch (type) {
      case CELL_TYPES.BOMB:
        mines.add(index);
        break;
      case CELL_TYPES.MONEY:
        moneyIndexes.push(index);
        break;
      case CELL_TYPES.SPIN:
        spinCells.add(index);
        break;
      case CELL_TYPES.EMPTY:
        emptyCells.add(index);
        break;
    }
  });

  const distributedRewards = createWeightedMoneyRewards(moneyIndexes);

  for (const [index, amount] of distributedRewards) {
    moneyCells.set(index, amount);
  }

  const totalPotentialReward = [...moneyCells.values()]
    .reduce((total, reward) => total + reward, 0);
  
  const safeIndexes = Array.from({ length: TOTAL_CELLS }, (_, index) => index)
    .filter((index) => !mines.has(index));

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    guildId,
    mineCount: mines.size,
    safeCellCount: safeIndexes.length,
    totalReward: totalPotentialReward,
    expiresAt: Date.now() + GAME_TIMEOUT_MS,
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
    resolved: false,
    winningUser: null,
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

function createWeightedMoneyRewards(moneyIndexes) {
  const rewards = new Map();
  const usedDisplayedAmounts = new Set();

  for (const index of moneyIndexes) {
    let reward = 1000;

    // A board only has three money cells, so rerolling lets their K labels
    // remain different while preserving the configured reward probabilities.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = randomMoneyReward();
      const displayedAmount = formatMoneyDisplay(candidate);

      reward = candidate;
      if (!usedDisplayedAmounts.has(displayedAmount)) {
        usedDisplayedAmounts.add(displayedAmount);
        break;
      }
    }

    rewards.set(index, reward);
  }

  return rewards;
}

function randomMoneyReward() {
  const roll = Math.random();
  let minimum;
  let maximum;

  // 65%: 1K–8K, 25%: 9K–16K, 8%: 17K–24K, 2%: 25K–40K.
  // This keeps low-value rewards common and makes high-value ones rare.
  if (roll < 0.65) {
    minimum = 1000;
    maximum = 8999;
  } else if (roll < 0.90) {
    minimum = 9000;
    maximum = 16999;
  } else if (roll < 0.98) {
    minimum = 17000;
    maximum = 24999;
  } else {
    minimum = 25000;
    maximum = 40000;
  }

  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function getSafeCellsRevealed(game) {
  return [...game.revealed].filter((index) => !game.mines.has(index)).length;
}

function buildEmbed(game, status = null, finished = false) {
  return new EmbedBuilder()
    .setColor(finished ? '#95A5A6' : '#F1C40F')
    .setTitle('💥💥 Dò Mìn Tới Rồi Cả Nhà💥💥')
    .setDescription(
      [
        '\u{1F4A3} = Bomb (8 quả)',
        '\u{1F4B0} = Tiền từ (1k-40k)',
        '\u{26AA} = Lượt quay (1 lượt)',
        '\u{274C} = Ô trống',
        '',
        finished
          ? '\u{23F1}\u{FE0F} Thời gian chơi đã kết thúc.'
          : `\u{23F1}\u{FE0F} Hết giờ: <t:${Math.floor(game.expiresAt / 1000)}:R>`,
        '\u{1F4AC} Tiếp tục chat để có hòm quà mới! Không SPAM.',
        `\u{1F4AC} Mỗi **${game.messageThreshold}** tin nhắn sẽ tự động thả 1 hòm quà mới.`,
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
  return `${Math.floor(amount / 1000)}K`;
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
            buttonEmoji = '\u{1F4A3}';
            break;
          case CELL_TYPES.MONEY:
            buttonStyle = ButtonStyle.Success;
            buttonLabel = formatMoneyDisplay(game.moneyCells.get(index));
            break;
          case CELL_TYPES.SPIN:
            buttonStyle = ButtonStyle.Primary;
            buttonEmoji = '\u{26AA}';
            break;
          case CELL_TYPES.EMPTY:
            buttonStyle = ButtonStyle.Secondary;
            buttonEmoji = '\u{274C}';
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