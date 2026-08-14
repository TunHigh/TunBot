import { Events, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';
import { getCommunityMinesweeperConfig, startCommunityMinesweeper, activeGames } from '../services/communityMinesweeperService.js';
import { recordMessage } from '../services/streakService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// Gift box system - track message counts per guild
const guildMessageCounts = new Map();
const activeGiftBoxes = new Map(); // guildId -> { message, collector, timeout }

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleLeveling(message, client);
      
      // Handle streak tracking
      await handleStreakTracking(message, client);
      
      // Handle gift box system
      await handleGiftBoxSystem(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Chế Độ Bảo Trì',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Tính Năng Đã Tắt',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Chỉ Dùng Slash Command',
          description: `${restriction.reason}\nHãy dùng \`/${resolvedCommandName}\` thay thế.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Lệnh Đã Bị Tắt',
        description: 'Lệnh này đã bị tắt trên server này.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Lệnh Đang Hồi Chiêu',
        description: `Lệnh này đang hồi chiêu. Vui lòng chờ ${formattedCooldown} rồi thử lại nhé.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ <@${message.author.id}> đã đếm sai số. Chuỗi đếm đã được đặt lại về **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);

    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);

    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    const result = await addXp(client, message.guild, message.member, finalXP);

    if (result?.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}

// Gift box system functions - now triggers Minesweeper game
async function handleGiftBoxSystem(message, client) {
  try {
    const guildId = message.guild.id;
    
    // Skip if message is from bot or system
    if (message.author.bot || message.system) return;
    
    // Skip if message is a command (starts with prefix or is slash command)
    const guildConfig = await getGuildConfig(client, guildId);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (message.content.startsWith(prefix)) return;
    
    // Get the community minesweeper config to check message threshold
    const config = await getCommunityMinesweeperConfig(client, guildId);
    if (!config.enabled || !config.channelId || !config.messageThreshold) {
      return;
    }
    
    // Only count messages in the configured channel
    if (message.channel.id !== config.channelId) {
      return;
    }
    
    // Increment message count for this guild
    const currentCount = guildMessageCounts.get(guildId) || 0;
    const newCount = currentCount + 1;
    guildMessageCounts.set(guildId, newCount);
    
    // Check if we should trigger a Minesweeper game
    if (newCount >= config.messageThreshold) {
      guildMessageCounts.set(guildId, 0); // Reset counter
      await triggerMinesweeperGame(message.channel, client, guildId, config);
    }
  } catch (error) {
    logger.error('Error in gift box system:', error);
  }
}

async function triggerMinesweeperGame(channel, client, guildId, config) {
  try {
    // Check if there's already an active game in this guild
    if (activeGames.has(guildId)) {
      return;
    }
    
    // Get the guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return;
    }
    
    // Start the community minesweeper game
    await startCommunityMinesweeper(client, guild, channel, config);
    
    logger.info('[COMMUNITY_MINESWEEPER] Game triggered by message threshold', {
      guildId,
      channelId: channel.id,
      messageThreshold: config.messageThreshold,
    });
  } catch (error) {
    logger.error('Error triggering Minesweeper game:', error);
  }
}

// Streak tracking system
async function handleStreakTracking(message, client) {
  try {
    // Skip if message is from bot or system
    if (message.author.bot || message.system) return;
    
    // Skip if message is a command (starts with prefix)
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (message.content.startsWith(prefix)) return;
    
    // An interaction can be a mention or a reply to the other person's message.
    const targetUserIds = new Set(
      message.mentions.users
        .filter((user) => !user.bot && user.id !== message.author.id)
        .map((user) => user.id),
    );

    if (message.reference?.messageId) {
      const repliedMessage = await message.fetchReference().catch(() => null);
      const repliedAuthor = repliedMessage?.author;

      if (repliedAuthor && !repliedAuthor.bot && repliedAuthor.id !== message.author.id) {
        targetUserIds.add(repliedAuthor.id);
      }
    }

    for (const targetUserId of targetUserIds) {
      await recordMessage(client, message.guild.id, message.author.id, targetUserId);
    }
  } catch (error) {
    logger.error('Error in streak tracking:', error);
  }
}
