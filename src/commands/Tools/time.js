import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Xem giờ hiện tại ở các múi giờ khác nhau')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('Múi giờ muốn xem (vd: UTC, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Múi giờ không hợp lệ. Vui lòng dùng mã múi giờ đúng (vd: UTC, America/New_York, Europe/London)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Giờ Hiện Tại',
                    `**${timezone}:** ${timeString}\n` +
                    `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                    `**ISO String:** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Không thể lấy giờ hiện tại. Vui lòng thử lại.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};