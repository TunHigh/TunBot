import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Đánh bạc để có cơ hội thắng lớn hơn')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Số tiền mặt muốn đặt cược')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const betAmount = interaction.options.getInteger("amount");
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastGamble = userData.lastGamble || 0;
            let cloverCount = userData.inventory["lucky_clover"] || 0;
            let charmCount = userData.inventory["lucky_charm"] || 0;

            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Gamble cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn cần hạ nhiệt trước khi đánh bạc tiếp. Đợi **${minutes} phút ${seconds} giây** nhé.`,
                    { remaining, cooldownType: 'gamble' }
                );
            }

            if (userData.wallet < betAmount) {
                throw createError(
                    "Insufficient cash for gamble",
                    ErrorTypes.VALIDATION,
                    `Bạn chỉ có $${userData.wallet.toLocaleString()} tiền mặt, nhưng lại muốn đặt cược $${betAmount.toLocaleString()}.`,
                    { required: betAmount, current: userData.wallet }
                );
            }

            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;
            let usedCharm = false;

            if (cloverCount > 0) {
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **Cỏ May Mắn đã dùng:** Cơ hội thắng của bạn đã tăng!`;
                usedClover = true;
            }
            
            else if (charmCount > 0) {
                winChance += CHARM_WIN_BONUS;
                userData.inventory["lucky_charm"] -= 1;
                cloverMessage = `\n🍀 **Bùa May Mắn đã dùng (còn ${charmCount - 1} lượt):** Cơ hội thắng của bạn đã tăng!`;
                usedCharm = true;
            }

            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                // Net change: the bet is replaced by the payout (bet was at stake, not pre-deducted)
                cashChange = amountWon - betAmount;

                resultEmbed = successEmbed(
                    "🎉 Bạn Đã Thắng!",
                    `Bạn đã đánh cược **$${betAmount.toLocaleString()}** và biến nó thành **$${amountWon.toLocaleString()}**!${cloverMessage}`,
                );
            } else {
cashChange = -betAmount;

                resultEmbed = warningEmbed(
                    "💔 Bạn Đã Thua...",
                    `Xúc xắc không ủng hộ bạn. Bạn đã mất **$${betAmount.toLocaleString()}** tiền cược.`,
                );
            }

            userData.wallet = (userData.wallet || 0) + cashChange;
userData.lastGamble = now;

            await setEconomyData(client, guildId, userId, userData);

            const newCash = userData.wallet;

            resultEmbed.addFields({
                name: "Số dư tiền mặt mới",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `Bạn còn ${userData.inventory["lucky_clover"]} Cỏ May Mắn. Tỉ lệ thắng là ${Math.round(winChance * 100)}%.`,
                });
            } else if (usedCharm) {
                resultEmbed.setFooter({
                    text: `Bạn còn ${userData.inventory["lucky_charm"]} lượt Bùa May Mắn. Tỉ lệ thắng là ${Math.round(winChance * 100)}%.`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `Cược tiếp theo sau 5 phút nữa. Tỉ lệ thắng cơ bản: ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
};