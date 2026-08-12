import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Xóa toàn bộ dữ liệu cá nhân của bạn khỏi bot (không thể hoàn tác)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC!** ⚠️\n\n` +
            `Thao tác này sẽ xóa vĩnh viễn **TOÀN BỘ** dữ liệu của bạn trong server này bao gồm:\n` +
            `• 💰 Số dư kinh tế (ví & ngân hàng)\n` +
            `• 📊 Levels và XP\n` +
            `• 🎒 Vật phẩm trong kho\n` +
            `• 🛍️ Các giao dịch mua trong shop\n` +
            `• 🎂 Thông tin sinh nhật\n` +
            `• 🔢 Dữ liệu bộ đếm\n` +
            `• 📋 Tất cả dữ liệu cá nhân khác\n\n` +
            `**Việc này không thể hoàn tác. Bạn có chắc chắn không?**`;

        const embed = warningEmbed('Xóa Toàn Bộ Dữ Liệu', warningMessage);

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Wipedata command executed - confirmation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};