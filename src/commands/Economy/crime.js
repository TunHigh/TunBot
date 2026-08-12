import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: "Móc túi", value: 'pickpocketing', min: 100, max: 500, risk: 0.3 },
    { name: "Trộm nhà", value: 'burglary', min: 300, max: 1000, risk: 0.4 },
    { name: "Cướp ngân hàng", value: 'bank-heist', min: 1000, max: 5000, risk: 0.6 },
    { name: "Trộm tác phẩm nghệ thuật", value: 'art-theft', min: 2000, max: 10000, risk: 0.7 },
    { name: "Tội phạm mạng", value: 'cybercrime', min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Phạm tội để kiếm tiền (rủi ro cao)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Loại tội phạm muốn thực hiện')
                .setRequired(true)
                .addChoices(
                    { name: 'Móc túi', value: 'pickpocketing' },
                    { name: 'Trộm nhà', value: 'burglary' },
                    { name: 'Cướp ngân hàng', value: 'bank-heist' },
                    { name: 'Trộm tác phẩm nghệ thuật', value: 'art-theft' },
                    { name: 'Tội phạm mạng', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn đang ở tù, còn ${timeLeft} phút nữa mới được ra!`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn cần đợi thêm ${timeLeft} phút nữa trước khi phạm tội tiếp.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.value === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "Vui lòng chọn một loại tội phạm hợp lệ.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🕵️ Phạm Tội Thành Công!",
                    `Bạn đã thực hiện ${crime.name} thành công và kiếm được **${amountEarned}** xu!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                // Fine is based on the potential haul of the attempted crime
                const potentialHaul = Math.floor((crime.min + crime.max) / 2);
                const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = warningEmbed(
                    "🚔 Phạm Tội Thất Bại!",
                    `Bạn bị bắt khi đang cố ${crime.name} và bị tống vào tù! ` +
                    `Bạn bị phạt ${fine.toLocaleString()} xu và sẽ ngồi tù 2 giờ.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};