import { SlashCommandBuilder } from 'discord.js';
import {
  checkCommunityMinesweeperGames,
  getCommunityMinesweeperConfig,
  startCommunityMinesweeper,
} from '../../services/communityMinesweeperService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('minesweeper')
    .setDescription('Tạo một lượt săn mìn cộng đồng mới'),
  category: 'Fun',

  async execute(interaction, config, client) {
    const { guildId, guild } = interaction;

    const gameConfig = await getCommunityMinesweeperConfig(client, guildId);

    if (!gameConfig.enabled) {
      return interaction.reply({
        content: '❌ Trò chơi Minesweeper chưa được bật. Hãy liên hệ quản trị viên.',
        ephemeral: true,
      });
    }

    const channel = guild.channels.cache.get(gameConfig.channelId)
      ?? await guild.channels.fetch(gameConfig.channelId).catch(() => null);

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        content: '❌ Không tìm thấy kênh trò chơi.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const alreadyRunning = channel.messages.cache
      .find((msg) => msg.embeds[0]?.title?.includes('Săn Mìn Cộng Đồng')) || null;

    if (alreadyRunning) {
      return interaction.editReply({
        content: '❌ Một lượt chơi đang chạy. Hãy chờ nó kết thúc.',
      });
    }

    try {
      await startCommunityMinesweeper(client, guild, channel, gameConfig);
      return interaction.editReply({
        content: '✅ Một lượt chơi mới đã được bắt đầu!',
      });
    } catch (error) {
      return interaction.editReply({
        content: `❌ Có lỗi xảy ra: ${error.message}`,
      });
    }
  },
};
