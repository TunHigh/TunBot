import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import {
  getStreakData,
  getUserStreaks,
  getTopStreaks,
  resetStreak,
} from '../../services/streakService.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('chuoi')
  .setDescription('Quản lý và xem chuỗi tin nhắn (streak) với người chơi khác')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('xem')
      .setDescription('Xem streak của bạn với một người chơi')
      .addUserOption((option) =>
        option
          .setName('nguoi_choi')
          .setDescription('Người chơi để xem streak')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('tatca')
      .setDescription('Xem tất cả streak của bạn'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('top')
      .setDescription('Xem top streak cao nhất trên server')
      .addIntegerOption((option) =>
        option
          .setName('gioi_han')
          .setDescription('Số lượng hiển thị (mặc định 10)')
          .setMinValue(1)
          .setMaxValue(25),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reset')
      .setDescription('Reset streak với một người chơi (chỉ admin)')
      .addUserOption((option) =>
        option
          .setName('nguoi_choi_1')
          .setDescription('Người chơi thứ 1')
          .setRequired(true),
      )
      .addUserOption((option) =>
        option
          .setName('nguoi_choi_2')
          .setDescription('Người chơi thứ 2')
          .setRequired(true),
      ),
  );

function getUserLabel(user) {
  return user?.globalName || user?.displayName || user?.username || 'Người chơi không xác định';
}

function getStreakEmoji(streak) {
  if (streak >= 30) return '💎';
  if (streak >= 14) return '🔥';
  if (streak >= 7) return '⭐';
  return '💫';
}

function buildPaginationComponents(page, totalPages, ownerId) {
  if (totalPages <= 1) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`streak-page:previous:${ownerId}`)
        .setLabel('◀ Trước')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`streak-page:next:${ownerId}`)
        .setLabel('Sau ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    ),
  ];
}

async function buildAllStreaksEmbed(client, interaction, streaks, page, perPage) {
  const totalPages = Math.ceil(streaks.length / perPage);
  const pageStreaks = streaks.slice(page * perPage, (page + 1) * perPage);
  const fields = await Promise.all(
    pageStreaks.map(async (streak) => {
      const otherUser = await client.users.fetch(streak.otherUserId).catch(() => null);
      return {
        name: `${getStreakEmoji(streak.currentStreak)} ${getUserLabel(otherUser)}`,
        value: `Hiện tại: **${streak.currentStreak}** ngày • Cao nhất: **${streak.longestStreak}** ngày\n💬 **${streak.totalInteractions}** lần tương tác`,
        inline: false,
      };
    }),
  );

  return createEmbed({
    title: `💖 Tất cả streak của ${getUserLabel(interaction.user)}`,
    description: `Trang **${page + 1}/${totalPages}** • Tổng cộng **${streaks.length}** cặp streak`,
    color: 'primary',
    fields,
    footer: { text: 'Nhắn tin và mention nhau mỗi ngày để giữ chuỗi!' },
  });
}

async function handleView(interaction, client) {
  const targetUser = interaction.options.getUser('nguoi_choi');

  if (!targetUser || targetUser.bot) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '❌ Không thể xem streak',
        description: 'Bạn chỉ có thể xem streak với người dùng thật.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }

  if (targetUser.id === interaction.user.id) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '❌ Không thể xem streak',
        description: 'Bạn không thể tạo hoặc xem streak với chính mình.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }

  const streak = await getStreakData(client, interaction.guildId, interaction.user.id, targetUser.id);
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

  return interaction.reply({
    embeds: [createEmbed({
      title: `💖 Streak với ${getUserLabel(targetUser)}`,
      color: streak.currentStreak >= 7 ? 'warning' : 'primary',
      thumbnail: targetUser.displayAvatarURL(),
      fields: [
        { name: '🔥 Chuỗi hiện tại', value: `**${streak.currentStreak}** ngày`, inline: true },
        { name: '🏆 Kỷ lục', value: `**${streak.longestStreak}** ngày`, inline: true },
        { name: '💬 Tổng tương tác', value: `**${streak.totalInteractions}** lần`, inline: true },
        { name: '📅 Hoạt động gần nhất', value: streak.lastInteractionDate || 'Chưa rõ', inline: false },
      ],
      footer: { text: 'Mỗi ngày cả hai phải nhắn tin và mention nhau để giữ chuỗi!' },
    })],
  });
}

async function handleAll(interaction, client) {
  const streaks = await getUserStreaks(client, interaction.guildId, interaction.user.id);
  if (streaks.length === 0) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '💖 Streak của bạn',
        description: 'Bạn chưa có streak nào. Hãy nhắn tin và mention bạn bè để bắt đầu!',
        color: 'info',
      })],
      ephemeral: true,
    });
  }

  const perPage = 5;
  const totalPages = Math.ceil(streaks.length / perPage);
  let page = 0;
  const embed = await buildAllStreaksEmbed(client, interaction, streaks, page, perPage);
  const response = await interaction.reply({
    embeds: [embed],
    components: buildPaginationComponents(page, totalPages, interaction.user.id),
    fetchReply: true,
  });

  if (totalPages <= 1 || typeof response?.createMessageComponentCollector !== 'function') {
    return;
  }

  const collector = response.createMessageComponentCollector({
    time: 60_000,
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId.startsWith('streak-page:'),
  });

  collector.on('collect', async (component) => {
    const [, direction] = component.customId.split(':');
    page = direction === 'next'
      ? Math.min(totalPages - 1, page + 1)
      : Math.max(0, page - 1);

    await component.update({
      embeds: [await buildAllStreaksEmbed(client, interaction, streaks, page, perPage)],
      components: buildPaginationComponents(page, totalPages, interaction.user.id),
    });
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

async function handleTop(interaction, client) {
  const limit = interaction.options.getInteger('gioi_han') || 10;
  const streaks = await getTopStreaks(client, interaction.guildId, limit);

  if (streaks.length === 0) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '🏆 Top streak server',
        description: 'Chưa có streak nào trên server này.',
        color: 'info',
      })],
      ephemeral: true,
    });
  }

  const fields = await Promise.all(
    streaks.map(async (streak, index) => {
      const [user1, user2] = await Promise.all([
        client.users.fetch(streak.userId1).catch(() => null),
        client.users.fetch(streak.userId2).catch(() => null),
      ]);
      const rank = ['🥇', '🥈', '🥉'][index] || `**#${index + 1}**`;
      return {
        name: `${rank} ${getUserLabel(user1)} & ${getUserLabel(user2)}`,
        value: `${getStreakEmoji(streak.currentStreak)} **${streak.currentStreak}** ngày • Kỷ lục **${streak.longestStreak}** ngày • 💬 ${streak.totalInteractions} tương tác`,
        inline: false,
      };
    }),
  );

  return interaction.reply({
    embeds: [createEmbed({
      title: `🏆 Top ${streaks.length} streak cao nhất`,
      color: 'warning',
      fields,
      footer: { text: 'Bảng xếp hạng theo chuỗi hiện tại.' },
    })],
  });
}

async function handleReset(interaction, client) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '❌ Không có quyền',
        description: 'Chỉ Administrator mới có thể reset streak.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }

  const user1 = interaction.options.getUser('nguoi_choi_1');
  const user2 = interaction.options.getUser('nguoi_choi_2');

  if (!user1 || !user2 || user1.id === user2.id) {
    return interaction.reply({
      embeds: [createEmbed({
        title: '❌ Dữ liệu không hợp lệ',
        description: 'Hãy chọn hai người dùng khác nhau.',
        color: 'error',
      })],
      ephemeral: true,
    });
  }

  const deleted = await resetStreak(client, interaction.guildId, user1.id, user2.id);
  return interaction.reply({
    embeds: [createEmbed({
      title: deleted ? '✅ Đã reset streak' : 'ℹ️ Không có streak',
      description: deleted
        ? `Đã xóa streak giữa **${getUserLabel(user1)}** và **${getUserLabel(user2)}**.`
        : `Không tìm thấy streak giữa **${getUserLabel(user1)}** và **${getUserLabel(user2)}**.`,
      color: deleted ? 'success' : 'info',
    })],
    ephemeral: !deleted,
  });
}

export async function execute(interaction, guildConfig, client) {
  try {
    switch (interaction.options.getSubcommand()) {
      case 'xem':
        return handleView(interaction, client);
      case 'tatca':
        return handleAll(interaction, client);
      case 'top':
        return handleTop(interaction, client);
      case 'reset':
        return handleReset(interaction, client);
      default:
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lệnh con không hợp lệ',
            description: 'Hãy dùng `xem`, `tatca`, `top` hoặc `reset`.',
            color: 'error',
          })],
          ephemeral: true,
        });
    }
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