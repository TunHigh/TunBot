import { MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import { ErrorTypes, replyUserError, handleInteractionError } from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Thao tác này chỉ có thể dùng trong máy chủ.' }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Thiếu dữ liệu cho thao tác xóa counter.' }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Chỉ người khởi tạo thao tác xóa này mới có thể dùng các nút này.' }).catch(logger.error);
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          embeds: [createEmbed({
            title: '❌ Đã Hủy',
            description: 'Đã hủy xóa counter.',
            color: 'error'
          })],
          components: []
        }).catch(logger.error);
        return;
      }

      if (action !== 'confirm') {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Thao tác xóa counter không xác định.' }).catch(logger.error);
        return;
      }

      const { message } = await performDeletionByCounterId(client, interaction.guild, counterId);

      await interaction.editReply({
        embeds: [successEmbed(message)],
        components: []
      }).catch(logger.error);
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        handler: 'counter_delete',
        customId: interaction.customId,
      });
    }
  }
};

export default counterDeleteActionHandler;