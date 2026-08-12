import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Gỡ cấm một người dùng khỏi server")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("ID (hoặc mention) của người dùng cần gỡ cấm")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Lý do gỡ cấm")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban',
            });
            return;
        }

        const rawTarget = interaction.options.getString("target");
        const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Vui lòng cung cấp ID hoặc mention hợp lệ.',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Không thể tìm thấy người dùng có ID \`${targetId}\`.`,
            });
        }

        const reason = interaction.options.getString("reason") || "Không có lý do";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "✅ Đã gỡ cấm người dùng",
                    `Đã gỡ cấm **${targetUser.tag}** khỏi server thành công.\n\n**Lý do:** ${reason}\n**Mã vụ việc:** #${result.caseId}`,
                ),
            ],
        });
    },
};
