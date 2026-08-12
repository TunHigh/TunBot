import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Xem tất cả cảnh cáo của một người dùng")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Người dùng cần xem cảnh cáo"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warnings interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warnings',
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        const validWarnings = await WarningService.getWarnings(guildId, target.id);
        const totalWarns = validWarnings.length;

        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: `Cảnh cáo: ${target.tag}`,
                        description: "Người dùng này chưa có cảnh cáo nào.",
                    }).setColor(getColor('success')),
                ],
            });
            return;
        }

        const embed = createEmbed({
            title: `Cảnh cáo: ${target.tag}`,
            description: `Tổng số cảnh cáo: **${totalWarns}**`,
        }).setColor(getColor('warning'));

        const warningFields = validWarnings
            .map((w, i) => {
                const discordTimestamp = Math.floor(w.timestamp / 1000);
                return {
                    name: `[#${i + 1}] Lý do: ${w.reason.substring(0, 100)}`,
                    value: `**Người điều hành:** <@${w.moderatorId}>\n**Ngày:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                    inline: false,
                };
            })
            .slice(0, 25);

        embed.addFields(warningFields);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
                .setLabel('Xóa cảnh cáo cụ thể')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
                .setLabel('Xóa tất cả cảnh cáo')
                .setStyle(ButtonStyle.Danger),
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Warnings Viewed",
                target: `${target.tag} (${target.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `Đã xem ${totalWarns} cảnh cáo`,
                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnings: totalWarns,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
    },
};
