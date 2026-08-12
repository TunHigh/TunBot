import { SlashCommandBuilder } from 'discord.js';
import { Minesweeper } from 'discord-gamecord';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('minesweeper')
    .setDescription('Chơi trò chơi Minesweeper - Click chuột để lật các ô trừ các ô mìn.'),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const Game = new Minesweeper({
        message: interaction,
        embed: {
          title: '💣 Minesweeper',
          color: '#2ECC71',
          timestamp: true,
          description: 'Click vào nút để lật các ô ngoại trừ các ô mìn. Hãy cẩn thận!',
        },
        emojis: {
          flag: '🚩',
          mine: '💣',
        },
        mines: 4,
        timeoutTime: 60000,
        winMessage: 'Bạn đã chiến thắng! Bạn đã tránh được tất cả các mìn. 🎉',
        loseMessage: 'Bạn đã thua! Hãy cẩn thận hơn với các mìn lần sau. 💥',
        playerOnlyMessage: 'Chỉ <@{{author}}> mới có thể sử dụng các nút lệnh!',
        isSlashGame: true,
      });

      await Game.startGame();
      logger.debug(`Minesweeper command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Minesweeper command error:', error);
      return await replyUserError(interaction, { 
        type: ErrorTypes.UNKNOWN, 
        message: 'Có lỗi xảy ra khi khởi tạo trò chơi Minesweeper.' 
      });
    }
  },
};
