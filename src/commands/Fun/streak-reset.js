import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { resetStreak } from '../../services/streakService.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('streak-reset')
  .setDescription('Reset streak giữa hai người chơi (chỉ Administrator)')
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
  );

function getUserLabel(user) {
  return user?.globalName || user?.displayName || user?.username || 'Người chơi không xác định';
}

export async function execute(interaction, guildConfig, client) {
  try {
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
  } catch (error) {
    logger.error('Error in streak-reset command:', error);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        embeds: [createEmbed({
          title: '❌ Lỗi',
          description: 'Đã xảy ra lỗi khi reset streak.',
          color: 'error',
        })],
        ephemeral: true,
      });
    }
    return interaction.followUp({
      embeds: [createEmbed({
        title: '❌ Lỗi',
        description: 'Đã xảy ra lỗi khi reset streak.',
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