import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import {
  getStreakData,
  getUserStreaks,
  getTopStreaks,
  resetStreak,
  getTodayProgress,
  getDailyRequirements,
  MAX_STREAK_PARTNERS,
} from '../../services/streakService.js';
import { generateStreakCard } from '../../services/streakCard.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('chuoi')
  .setDescription('Xem chuỗi tin nhắn (streak) với bạn bè')
  .addUserOption((option) =>
    option
      .setName('nguoi_choi')
      .setDescription('Người chơi để xem streak chi tiết (mặc định: xem tất cả)')
      .setRequired(false),
  );

function getUserLabel(user) {
  return user?.globalName || user?.displayName || user?.username || 'Người chơi không xác định';
}

function getStreakEmoji(streak) {
  if (streak >= 150) return '💎';
  if (streak >= 90) return '🔥';
  if (streak >= 30) return '⭐';
  if (streak >= 7) return '✨';
  return '💫';
}

function buildPaginationComponents(page, totalPages, ownerId, prefix = 'streak') {
  if (totalPages <= 1) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}-page:previous:${ownerId}`)
        .setLabel('◀ Trước')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${prefix}-page:next:${ownerId}`)
        .setLabel('Sau ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    ),
  ];
}

async function buildStreakCardAttachment(client, streakData, viewerId) {
  const userId1 = streakData.userId1;
  const userId2 = streakData.userId2;
  const [user1, user2] = await Promise.all([
    client.users.fetch(userId1).catch(() => null),
    client.users.fetch(userId2).catch(() => null),
  ]);

  if (!user1 || !user2) {
    return null;
  }

  const progress = getTodayProgress(streakData, viewerId);
  const requirements = getDailyRequirements(streakData.currentStreak || 0);

  const buffer = await generateStreakCard({
    user1,
    user2,
    currentStreak: streakData.currentStreak || 0,
    longestStreak: streakData.longestStreak || 0,
    viewerProgress: progress.viewer,
    otherProgress: progress.other,
    requirements,
    date: progress.date,
  });

  return new AttachmentBuilder(buffer, { name: `streak-${userId1}-${userId2}.png` });
}

async function handleDefault(interaction, client) {
  const targetUser = interaction.options.getUser('nguoi_choi');
  const viewerId = interaction.user.id;

  // If a specific user is provided, show that streak card
  if (targetUser) {
    if (targetUser.bot) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Không thể xem streak',
          description: 'Bạn chỉ có thể xem streak với người dùng thật.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }

    if (targetUser.id === viewerId) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Không thể xem streak',
          description: 'Bạn không thể tạo hoặc xem streak với chính mình.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }

    const streak = await getStreakData(client, interaction.guildId, viewerId, targetUser.id);
    if (!streak) {
      return interaction.reply({
        embeds: [createEmbed({
          title: `💖 Streak với ${getUserLabel(targetUser)}`,
          description: 'Hai bạn chưa có streak.\nHãy nhắn tin và **mention nhau** để bắt đầu chuỗi nhé!',
          color: 'info',
          thumbnail: targetUser.displayAvatarURL(),
        })],
      });
    }

    const attachment = await buildStreakCardAttachment(client, streak, viewerId);
    if (!attachment) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Lỗi',
          description: 'Không thể tạo thẻ streak. Vui lòng thử lại sau.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }

    return interaction.reply({
      files: [attachment],
    });
  }

  // Default: show all streaks with pagination
  const streaks = await getUserStreaks(client, interaction.guildId, viewerId);
  if (streaks.length === 0) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '💖 Streak của bạn',
        description: 'Bạn chưa có streak nào. Hãy nhắn tin và mention bạn bè để bắt đầu!\n\n💡 **Mẹo:** Mỗi ngày cả hai cần đạt đủ tin nhắn và reply để giữ chuỗi.',
        color: 'info',
      })],
      ephemeral: true,
    });
  }

  // Show first streak card
  const firstStreak = streaks[0];
  const attachment = await buildStreakCardAttachment(client, firstStreak, viewerId);

  if (!attachment) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '❌ Lỗi',
        description: 'Không thể tạo thẻ streak. Vui lòng thử lại sau.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }

  const totalPages = streaks.length;
  const page = 0;

  const embed = createEmbed({
    title: `💖 Streak của ${getUserLabel(interaction.user)}`,
    description: `Cặp **1/${totalPages}** • Tổng cộng **${totalPages}** cặp streak (tối đa ${MAX_STREAK_PARTNERS})`,
    color: 'primary',
    footer: { text: 'Dùng nút ◀ ▶ để chuyển giữa các cặp streak • Mention/reply nhau mỗi ngày để giữ chuỗi!' },
  });

  const response = await interaction.reply({
    embeds: [embed],
    files: [attachment],
    components: buildPaginationComponents(page, totalPages, viewerId, 'streak'),
    fetchReply: true,
  });

  if (totalPages <= 1 || typeof response?.createMessageComponentCollector !== 'function') {
    return;
  }

  const collector = response.createMessageComponentCollector({
    time: 120_000,
    filter: (component) =>
      component.user.id === viewerId &&
      component.customId.startsWith('streak-page:'),
  });

  collector.on('collect', async (component) => {
    const [, direction] = component.customId.split(':');
    const newPage = direction === 'next'
      ? Math.min(totalPages - 1, page + 1)
      : Math.max(0, page - 1);

    const streakData = streaks[newPage];
    const newAttachment = await buildStreakCardAttachment(client, streakData, viewerId);

    if (!newAttachment) {
      return component.reply({
        embeds: [createEmbed({
          title: '❌ Lỗi',
          description: 'Không thể tải thẻ streak này.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }

    const newEmbed = createEmbed({
      title: `💖 Streak của ${getUserLabel(interaction.user)}`,
      description: `Cặp **${newPage + 1}/${totalPages}** • Tổng cộng **${totalPages}** cặp streak (tối đa ${MAX_STREAK_PARTNERS})`,
      color: 'primary',
      footer: { text: 'Dùng nút ◀ ▶ để chuyển giữa các cặp streak • Mention/reply nhau mỗi ngày để giữ chuỗi!' },
    });

    await component.update({
      embeds: [newEmbed],
      files: [newAttachment],
      components: buildPaginationComponents(newPage, totalPages, viewerId, 'streak'),
    });
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

export async function execute(interaction, guildConfig, client) {
  try {
    return handleDefault(interaction, client);
  } catch (error) {
    logger.error('Error in streak command:', error);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Lỗi streak',
          description: 'Đã xảy ra lỗi khi xử lý dữ liệu streak. Vui lòng thử lại sau.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }
    return interaction.followUp({
      embeds: [createEmbed({
        title: '❌ Lỗi streak',
        description: 'Đã xảy ra lỗi khi xử lý dữ liệu streak. Vui lòng thử lại sau.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }
}

export default {
  data,
  category: 'Fun',
  execute,
};