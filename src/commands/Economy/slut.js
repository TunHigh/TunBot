import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Livestream webcam", min: 120, max: 450, risk: 0.2 },
    { name: "Buổi nhảy riêng tư", min: 220, max: 700, risk: 0.25 },
    { name: "Tiếp viên CLB đêm khuya", min: 320, max: 900, risk: 0.3 },
    { name: "Hộ tống VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "Livestream độc quyền", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Buổi phát sóng của bạn bùng nổ và tiền tip đổ về như mưa.",
    "Một lượt đặt chỗ VIP trả cao hơn hẳn mức trung bình.",
    "Ca đêm của bạn kín khách và sinh lời đều đều.",
    "Các yêu cầu Premium ồ ạt tới và tiền nhận được tăng vọt.",
];

const FINE_OUTCOMES = [
    "Bảo vệ địa điểm phạt bạn vì vi phạm quy định.",
    "Một cảnh cáo vi phạm khiến nền tảng thu phí phạt.",
    "Bạn bị gắn cờ và phải nộp phạt.",
];

const ROBBED_OUTCOMES = [
    "Một khách giả mạo khiếu nại hoàn tiền cuỗm mất một phần thu nhập.",
    "Một lượt đặt chỗ lừa đảo rút sạch một khoản tiền của bạn.",
    "Bạn bị tài khoản lừa đảo chơi khăm và mất tiền.",
];

const LOSS_OUTCOMES = [
    "Buổi diễn thất bại và bạn phải bù chi phí vận hành.",
    "Bạn đốt tiền vào khâu chuẩn bị nhưng chẳng thu lại được gì.",
    "Ca làm trục trặc khiến bạn lỗ vốn.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} - Nhận Thưởng`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} - Bị Phạt`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} - Bị Cướp`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} - Thua Lỗ`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Làm một công việc nhạy cảm đầy rủi ro để nhận thưởng hoặc chịu lỗ'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn cần đợi thêm trước khi làm việc tiếp! Thử lại sau **${Math.ceil(remainingTime / 60000)}** phút nhé.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **Kết quả ròng:** ${amountLabel}`,
                `💳 **Số dư hiện tại:** $${userData.wallet.toLocaleString()}`,
                `📊 **Tổng phiên:** ${userData.totalSluts}`,
                `💵 **Tổng kiếm được:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **Tổng đã mất:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};