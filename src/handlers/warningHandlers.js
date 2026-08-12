import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
const warningDeleteSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Chỉ quản trị viên đã xem các cảnh cáo này mới có thể xóa chúng.' });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Xóa Cảnh Cáo');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Số Cảnh Cáo (#1, #2, ...)')
        .setPlaceholder('Nhập số cảnh cáo cần xóa')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Warning delete specific button error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể mở biểu mẫu xóa cảnh cáo.' });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Chỉ quản trị viên đã xem các cảnh cáo này mới có thể xóa chúng.' });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'người dùng này';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Xóa Tất Cả Cảnh Cáo')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel(`Gõ "DELETE" để xóa tất cả cảnh cáo`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('DELETE')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Warning clear all button error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể mở biểu mẫu xác nhận.' });
    }
  }
};

async function warningDeleteModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Chỉ quản trị viên ban đầu mới có thể xóa cảnh cáo.' });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Hãy nhập một số cảnh cáo hợp lệ (ví dụ: 1, 2, 3).' });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Cảnh cáo #${warningNumber} không tồn tại. Người dùng này chỉ có ${warnings.length} cảnh cáo.` });
    }

    const warningToDelete = warnings[warningNumber - 1];
    await WarningService.removeWarning(guildId, targetUserId, warningToDelete.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'người dùng';

    logger.info(`[MODERATION] Warning deleted for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      warningId: warningToDelete.id,
      reason: warningToDelete.reason,
      warningNumber
    });

    await interaction.editReply({
      embeds: [successEmbed('✅ Đã Xóa Cảnh Cáo', `Cảnh cáo #${warningNumber} của **${targetName}** đã được xóa.\n\n**Lý do là:** ${warningToDelete.reason.substring(0, 100)}`)]
    });
  } catch (error) {
    logger.error('Warning delete modal handler error:', error);
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể xóa cảnh cáo.' });
  }
}

async function warningClearConfirmModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Chỉ quản trị viên ban đầu mới có thể xóa cảnh cáo.' });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn phải gõ chính xác "DELETE" để xác nhận xóa tất cả cảnh cáo.' });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarningService.clearWarnings(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'người dùng';

    logger.info(`[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.editReply({
      embeds: [successEmbed('✅ Đã Xóa Tất Cả Cảnh Cáo', `Tất cả cảnh cáo của **${targetName}** đã được xóa. Đã xóa **${count}** cảnh cáo.`)]
    });
  } catch (error) {
    logger.error('Warning clear confirm modal handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể xóa cảnh cáo.' });
    } else {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể xóa cảnh cáo.' });
    }
  }
}

export {
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  warningDeleteModalHandler,
  warningClearConfirmModalHandler,
};

export default {
  name: 'warning_delete_modal',
  execute: warningDeleteModalHandler
};
