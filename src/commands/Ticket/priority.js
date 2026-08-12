import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Đặt mức ưu tiên cho vé hỗ trợ hiện tại.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Mức ưu tiên cho vé hỗ trợ.")
                .setRequired(true)
                .addChoices(
                    { name: "Khẩn cấp", value: "urgent" },
                    { name: "Cao", value: "high" },
                    { name: "Trung bình", value: "medium" },
                    { name: "Thấp", value: "low" },
                    { name: "Không", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Lệnh này chỉ có thể dùng trong một kênh vé hỗ trợ hợp lệ.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bạn cần quyền `Manage Channels` hoặc `Ticket Staff Role` đã cấu hình để thay đổi mức ưu tiên vé.' });
        }

        const priorityLevel = interaction.options.getString("level");
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Đã Cập Nhật Ưu Tiên",
                    `Mức ưu tiên vé đã được đặt thành **${priorityLevel.toUpperCase()}**.`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};
