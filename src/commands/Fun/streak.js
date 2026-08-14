import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } from 'discord.js';
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
import { createStreakInvitation, buildInvitationButtons } from '../../interactions/buttons/streak/streakInvitation.js';

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

  // If a specific user is provided, send invitation to start streak
  if (targetUser) {
    if (targetUser.bot) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Không thể mời',
          description: 'Bạn không thể mời bot giữ chuỗi.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetUser.id === viewerId) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Không thể mời',
          description: 'Bạn không thể mời chính mình giữ chuỗi.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if streak already exists
    const existingStreak = await getStreakData(client, interaction.guildId, viewerId, targetUser.id);
    if (existingStreak) {
      // Show the existing streak card
      const attachment = await buildStreakCardAttachment(client, existingStreak, viewerId);
      if (!attachment) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lỗi',
            description: 'Không thể tạo thẻ streak. Vui lòng thử lại sau.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        files: [attachment],
      });
    }

    // Check streak partner limits
    const viewerStreaks = await getUserStreaks(client, interaction.guildId, viewerId);
    const targetStreaks = await getUserStreaks(client, interaction.guildId, targetUser.id);
    
    if (viewerStreaks.length >= MAX_STREAK_PARTNERS) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Đã đạt giới hạn',
          description: `Bạn đã giữ streak với tối đa ${MAX_STREAK_PARTNERS} người. Hãy xóa streak cũ trước khi mời người mới.`,
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }
    
    if (targetStreaks.length >= MAX_STREAK_PARTNERS) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Người kia đã đạt giới hạn',
          description: `${getUserLabel(targetUser)} đã giữ streak với tối đa ${MAX_STREAK_PARTNERS} người.`,
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Create invitation
    await createStreakInvitation(client, interaction.guildId, viewerId, targetUser.id);
    
    const viewerName = getUserLabel(interaction.user);
    const targetName = getUserLabel(targetUser);

    const embed = createEmbed({
      title: '💌 Lời mời giữ chuỗi (Streak)',
      description: `**${viewerName}** muốn mời **${targetName}** cùng giữ chuỗi tin nhắn! 🎉\n\n` +
        `📝 **Cách hoạt động:**\n` +
        `• Cả hai cần **mention/reply nhau mỗi ngày**\n` +
        `• Chuỗi sẽ tăng dần nếu duy trì liên tục\n` +
        `• Mất chuỗi nếu một ngày không tương tác\n\n` +
        `⏰ Lời mời hết hạn sau **24 giờ**`,
      color: 'primary',
      thumbnail: targetUser.displayAvatarURL(),
      footer: { text: `${targetName}, hãy chọn bên dưới để đồng ý hoặc từ chối` },
    });

    const buttons = buildInvitationButtons(viewerId, targetUser.id);

    return interaction.reply({
      embeds: [embed],
      components: [buttons],
      content: `<@${targetUser.id}>`,
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