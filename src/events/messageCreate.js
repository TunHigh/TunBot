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
import { getCommunityMinesweeperConfig } from '../services/communityMinesweeperService.js';
import EconomyService from '../services/economyService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// Gift box system - track message counts per guild
const guildMessageCounts = new Map();
const GIFT_BOX_THRESHOLD = 10;
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

// Gift box system functions
async function handleGiftBoxSystem(message, client) {
  try {
    const guildId = message.guild.id;
    
    // Skip if message is from bot or system
    if (message.author.bot || message.system) return;
    
    // Skip if message is a command (starts with prefix or is slash command)
    const guildConfig = await getGuildConfig(client, guildId);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (message.content.startsWith(prefix)) return;
    
    // Increment message count for this guild
    const currentCount = guildMessageCounts.get(guildId) || 0;
    const newCount = currentCount + 1;
    guildMessageCounts.set(guildId, newCount);
    
    // Check if we should spawn a gift box
    if (newCount >= GIFT_BOX_THRESHOLD) {
      guildMessageCounts.set(guildId, 0); // Reset counter
      await spawnGiftBox(message.channel, client, guildId);
    }
  } catch (error) {
    logger.error('Error in gift box system:', error);
  }
}

async function spawnGiftBox(channel, client, guildId) {
  try {
    // Check if there's already an active gift box in this guild
    if (activeGiftBoxes.has(guildId)) {
      return;
    }
    
    // Check if community minesweeper is enabled for this guild
    const config = await getCommunityMinesweeperConfig(client, guildId);
    if (!config.enabled) {
      return;
    }
    
    const giftBoxId = `giftbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    const embed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle('🎁 Hòm Quà Bí Mật!')
      .setDescription(
        'Một hòm quà bí mật đã xuất hiện! Nhấn nút bên dưới để mở và nhận thưởng.\n' +
        '⏰ Hòm quà sẽ biến mất sau 30 giây.'
      )
      .setFooter({ text: 'Mỗi 10 tin nhắn sẽ tự động thả 1 hòm quà mới' })
      .setTimestamp();
    
    const openButton = new ButtonBuilder()
      .setCustomId(`${giftBoxId}_open`)
      .setLabel('Mở Hòm Quà')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎁');
    
    const row = new ActionRowBuilder().addComponents(openButton);
    
    const giftBoxMessage = await channel.send({ embeds: [embed], components: [row] });
    
    // Create collector for the gift box
    const collector = giftBoxMessage.createMessageComponentCollector({
      time: 30000, // 30 seconds
      filter: (interaction) => interaction.customId.startsWith(giftBoxId),
    });
    
    // Store active gift box
    const timeout = setTimeout(() => {
      collector.stop('timeout');
    }, 30000);
    
    activeGiftBoxes.set(guildId, { message: giftBoxMessage, collector, timeout });
    
    collector.on('collect', async (interaction) => {
      try {
        if (interaction.customId.endsWith('_open')) {
          await interaction.deferUpdate();
          
          // Generate random reward
          const rewards = [
            { type: 'money', amount: Math.floor(Math.random() * 5000) + 1000, emoji: '💰', name: 'Tiền' },
            { type: 'spin', amount: 1, emoji: '⚪', name: 'Lượt Quay' },
            { type: 'xp', amount: Math.floor(Math.random() * 100) + 50, emoji: '✨', name: 'XP' },
          ];
          
          const reward = rewards[Math.floor(Math.random() * rewards.length)];
          
          // Give reward to user
          let rewardMessage = '';
          switch (reward.type) {
            case 'money':
              await EconomyService.addMoney(client, guildId, interaction.user.id, reward.amount, 'gift_box');
              rewardMessage = `🎉 ${interaction.user} đã mở hòm quà và nhận được **${reward.emoji} $${reward.amount.toLocaleString('en-US')}**!`;
              break;
            case 'spin':
              // Add spin chance to user (you might need to implement this)
              rewardMessage = `🎉 ${interaction.user} đã mở hòm quà và nhận được **${reward.emoji} ${reward.amount} Lượt Quay**!`;
              break;
            case 'xp':
              // Add XP to user (you might need to implement this)
              rewardMessage = `🎉 ${interaction.user} đã mở hòm quà và nhận được **${reward.emoji} ${reward.amount} XP**!`;
              break;
          }
          
          // Disable the button
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${giftBoxId}_open`)
              .setLabel('Đã Mở')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setEmoji('🎁')
          );
          
          await giftBoxMessage.edit({ 
            embeds: [embed.setDescription(`🎁 Hòm quà đã được mở bởi ${interaction.user}!\n${rewardMessage}`)], 
            components: [disabledRow] 
          });
          
          collector.stop('opened');
        }
      } catch (error) {
        logger.error('Error handling gift box interaction:', error);
      }
    });
    
    collector.on('end', async (collected, reason) => {
      activeGiftBoxes.delete(guildId);
      clearTimeout(timeout);
      
      if (reason === 'timeout') {
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${giftBoxId}_open`)
              .setLabel('Hết Hạn')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setEmoji('🎁')
          );
          
          await giftBoxMessage.edit({ 
            embeds: [embed.setDescription('⏰ Hòm quà đã hết hạn và biến mất!')], 
            components: [disabledRow] 
          });
        } catch (error) {
          logger.warn('Could not update expired gift box message:', error);
        }
      }
    });
    
  } catch (error) {
    logger.error('Error spawning gift box:', error);
  }
}

// Need to import EconomyService for gift box rewards
import EconomyService from '../services/economyService.js';
