import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getTopStreaks } from '../../services/streakService.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('streak-top')
  .setDescription('Xem top streak cao nhất trên server')
  .addIntegerOption((option) =>
    option
      .setName('gioi_han')
      .setDescription('Số lượng hiển thị (mặc định 10)')
      .setMinValue(1)
      .setMaxValue(25),
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

export async function execute(interaction, guildConfig, client) {
  try {
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
  } catch (error) {
    logger.error('Error in streak-top command:', error);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Lỗi',
          description: 'Đã xảy ra lỗi khi lấy bảng xếp hạng streak.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }
    return interaction.followUp({
      embeds: [createEmbed({
        title: '❌ Lỗi',
        description: 'Đã xảy ra lỗi khi lấy bảng xếp hạng streak.',
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