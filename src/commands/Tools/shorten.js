import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Rút gọn liên kết bằng is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("Liên kết cần rút gọn")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Đuôi liên kết tùy chỉnh (tùy chọn)")
                .setRequired(false)
        )
        .setDMPermission(false),
    category: "Tools",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferSuccess) {
            logger.warn(`Shorten interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        const url = interaction.options.getString("url");
        const custom = interaction.options.getString("custom");

        try {
            new URL(url);
        } catch (e) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Định dạng liên kết không hợp lệ. Phải có http:// hoặc https://',
            });
        }

        if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Đuôi liên kết chỉ được chứa chữ cái, chữ số, gạch dưới và gạch ngang.',
            });
        }

        let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
        if (custom) {
            apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
            response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'TitanBot URL Shortener/1.0'
                }
            });
        } catch (networkError) {
            const message = networkError?.name === 'AbortError'
                ? 'Dịch vụ rút gọn liên kết hết thời gian chờ. Vui lòng thử lại sau ít phút.'
                : 'Hiện không thể kết nối đến dịch vụ rút gọn liên kết. Vui lòng thử lại sau.';
            return replyUserError(interaction, {
                type: ErrorTypes.NETWORK,
                message,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Dịch vụ rút gọn trả về HTTP ${response.status}. Vui lòng thử lại sau.`,
            });
        }

        const shortUrl = await response.text();

        try {
            new URL(shortUrl);
        } catch (e) {
            if (shortUrl.includes("already exists")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Đuôi liên kết đó đã có người dùng. Hãy thử một đuôi khác.',
                });
            } else if (shortUrl.includes("invalid")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Liên kết không hợp lệ. Phải có http:// hoặc https://',
                });
            }
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Rút gọn liên kết thất bại: ${shortUrl}`,
            });
        }

        const embed = successEmbed('Đã Rút Gọn Liên Kết', `Liên kết rút gọn của bạn: ${shortUrl}`);
        embed.setColor(getColor('success'));
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
};