import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Xin một chút tiền lẻ'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} phút` : `${seconds} giây`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn mệt mỏi vì đi xin tiền rồi! Thử lại sau **${timeMessage}** nhé.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `Một người lạ tốt bụng bỏ **$${amountWon.toLocaleString()}** vào cốc của bạn.`,
                    `Bạn thấy một chiếc ví bỏ quên! Bạn chộp lấy **$${amountWon.toLocaleString()}** rồi chạy mất hút.`,
                    `Có người thương hại và cho bạn **$${amountWon.toLocaleString()}**!`,
                    `Bạn nhặt được **$${amountWon.toLocaleString()}** dưới ghế đá công viên.`,
                ];

                replyEmbed = successEmbed(
                    'Xin Tiền Thành Công',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "Cảnh sát đuổi bạn đi. Bạn chẳng nhận được gì.",
                    "Ai đó hét lên 'Đi kiếm việc làm đi!' rồi bỏ đi.",
                    "Một con sóc cuỗm mất đồng xu duy nhất của bạn.",
                    "Bạn định xin tiền nhưng ngại quá nên bỏ cuộc.",
                ];

                replyEmbed = warningEmbed(
                    'Xin Tiền Thất Bại',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};