import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Cá vược', emoji: '🐟', rarity: 'common' },
    { name: 'Cá hồi', emoji: '🐟', rarity: 'common' },
    { name: 'Cá hồi vân', emoji: '🐟', rarity: 'common' },
    { name: 'Cá ngừ', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Cá kiếm', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Bạch tuộc', emoji: '🐙', rarity: 'rare' },
    { name: 'Tôm hùm', emoji: '🦞', rarity: 'rare' },
    { name: 'Cá mập', emoji: '🦈', rarity: 'epic' },
    { name: 'Cá voi', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "Bạn quăng cần câu xuống làn nước trong vắt...",
    "Bạn kiên nhẫn chờ phao câu nổi lên...",
    "Sau vài phút chờ đợi, bạn cảm thấy có lực kéo...",
    "Mặt nước gợn sóng khi có gì đó cắn mồi...",
    "Bạn thu dây câu với độ chuẩn xác của dân chuyên...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Đi câu cá để kiếm tiền'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn mệt quá không câu được nữa. Nghỉ **${hours} giờ ${minutes} phút** trước khi câu tiếp nhé.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Thưởng Cần câu: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: 'Câu Cá Thành Công!',
                description: `${catchMessage}\n\nBạn đã câu được **${fishCaught.emoji} ${fishCaught.name}**! Bạn bán được **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "Số dư tiền mặt mới",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Độ hiếm",
                        value: fishCaught.rarity.charAt(0).toUpperCase() + fishCaught.rarity.slice(1),
                        inline: true,
                    }
                )
                .setFooter({ text: `Chuyến câu cá tiếp theo sau 45 phút nữa.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};