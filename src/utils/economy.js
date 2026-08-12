// economy.js

import { getColor, getEconomyKey as getEconomyStorageKey } from './database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeEconomyData } from './schemas.js';
import { logger } from './logger.js';
import { validateDiscordId, validateNumber } from './validation.js';
import { DEFAULT_ECONOMY_DATA } from './constants.js';
import { createError, ErrorTypes, wrapServiceBoundary } from './errorHandler.js';

const ECONOMY_CONFIG = BotConfig.economy || {};
const BASE_BANK_CAPACITY = ECONOMY_CONFIG.baseBankCapacity || 10000;
const BANK_CAPACITY_PER_LEVEL = ECONOMY_CONFIG.bankCapacityPerLevel || 5000;
const DAILY_AMOUNT = ECONOMY_CONFIG.dailyAmount || 100;
const WORK_MIN = ECONOMY_CONFIG.workMin || 10;
const WORK_MAX = ECONOMY_CONFIG.workMax || 100;
const COOLDOWNS = ECONOMY_CONFIG.cooldowns || {
daily: 24 * 60 * 60 * 1000,
work: 60 * 60 * 1000,
crime: 2 * 60 * 60 * 1000,
rob: 4 * 60 * 60 * 1000,
};

export function getEconomyKey(guildId, userId) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(userId, 'userId');
    
    if (!validGuildId || !validUserId) {
        throw new Error('Invalid guild ID or user ID');
    }
    
    return getEconomyStorageKey(validGuildId, validUserId);
}

export function getMaxBankCapacity(userData) {
    if (!userData) return BASE_BANK_CAPACITY;
    
    const bankLevel = userData.bankLevel || 0;
    let capacity = BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);

    const upgrades = userData.upgrades || {};
    const inventory = userData.inventory || {};

    if (upgrades['bank_upgrade_1']) {
        capacity = Math.floor(capacity * 1.5);
    }

    const bankNotes = inventory['bank_note'] || 0;
    capacity += (bankNotes * 10000);
    
    return capacity;
}

export function formatCurrency(amount) {
    const currencyName = ECONOMY_CONFIG.currency?.name || 'coins';
    return `${amount.toLocaleString()} ${currencyName}`;
}

export async function getEconomyData(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.get !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        const data = await client.db.get(key, {});
        const defaults = {
            ...DEFAULT_ECONOMY_DATA,
            wallet: ECONOMY_CONFIG.startingBalance ?? DEFAULT_ECONOMY_DATA.wallet,
        };
        
        return normalizeEconomyData(data, defaults);
    } catch (error) {
        logger.error(`Error getting economy data for user ${userId}`, error);
        return normalizeEconomyData({}, DEFAULT_ECONOMY_DATA);
    }
}

export async function setEconomyData(client, guildId, userId, data) {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        const normalized = normalizeEconomyData(data, DEFAULT_ECONOMY_DATA);
        await client.db.set(key, normalized);
        return true;
    } catch (error) {
        logger.error(`Error saving economy data for user ${userId}`, error);
        return false;
    }
}

export async function updateBalance(client, guildId, userId, options = {}) {
    const data = await getEconomyData(client, guildId, userId);
    
    if (options.wallet !== undefined) {
        data.wallet = Math.max(0, (data.wallet || 0) + options.wallet);
    }
    
    if (options.bank !== undefined) {
        const maxBank = getMaxBankCapacity(data);
        data.bank = Math.min(Math.max(0, (data.bank || 0) + options.bank), maxBank);
    }
    
    if (options.xp !== undefined) {
        data.xp = Math.max(0, (data.xp || 0) + options.xp);
        
        const xpNeeded = Math.floor(5 * Math.pow(data.level || 1, 2) + 50 * (data.level || 1) + 100);
        if (data.xp >= xpNeeded) {
            data.xp -= xpNeeded;
            data.level = (data.level || 1) + 1;
            data.leveledUp = true;
        }
    }
    
    await setEconomyData(client, guildId, userId, data);
    return data;
}

export function checkCooldown(userData, action) {
    const cooldownTime = COOLDOWNS[action] || 0;
    const lastUsed = userData[`last${action.charAt(0).toUpperCase() + action.slice(1)}`] || 0;
    const now = Date.now();
    const remaining = Math.max(0, (lastUsed + cooldownTime) - now);
    
    return {
        onCooldown: remaining > 0,
        remaining,
        formatted: formatCooldown(remaining)
    };
}

function formatCooldown(ms) {
    if (ms < 1000) return 'ngay bây giờ';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} ngày ${hours % 24} giờ`;
    if (hours > 0) return `${hours} giờ ${minutes % 60} phút`;
    if (minutes > 0) return `${minutes} phút ${seconds % 60} giây`;
    return `${seconds} giây`;
}

export function getWorkReward() {
    const amount = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const jobs = [
        'làm việc tại một cửa hàng đồ ăn nhanh',
        'làm lập trình viên',
        'làm công nhân xây dựng',
        'làm bác sĩ',
        'làm streamer',
        'làm YouTuber',
        'làm giáo viên',
        'làm thu ngân',
        'làm tài xế giao hàng',
        'làm freelancer'
    ];
    
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    
    return {
        amount,
        job,
        message: `Bạn đã ${job} và kiếm được ${formatCurrency(amount)}!`
    };
}

export function getCrimeOutcome() {
    const outcomes = [
        {
            success: true,
            amount: Math.floor(Math.random() * 200) + 50,
            message: 'Bạn trộm ngân hàng thành công và thoát được với {amount}!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 100) + 20,
            message: 'Bạn móc túi ai đó và lấy được {amount}!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 150) + 30,
            message: 'Bạn hack vào tài khoản ngân hàng và chuyển {amount} vào tài khoản của mình!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 100) + 50,
            message: 'Bạn bị bắt và phải nộp phạt {fine}!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 150) + 50,
            message: 'Cảnh sát đã bắt được bạn! Bạn phải trả {fine} để ra khỏi tù.' 
        },
        {
            success: false,
            fine: 0,
            message: 'Nỗ lực của bạn thất bại, nhưng bạn vẫn thoát được!' 
        }
    ];
    
    return outcomes[Math.floor(Math.random() * outcomes.length)];
}

export function getRobOutcome(targetBalance) {
    if (targetBalance <= 0) {
        return {
            success: false,
            amount: 0,
            message: 'Mục tiêu không có tiền để trộm!'
        };
    }
    
const success = Math.random() > 0.4;
    
    if (success) {
        const amount = Math.min(
Math.floor(Math.random() * (targetBalance * 0.3)) + 1,
            targetBalance
        );
        
        return {
            success: true,
            amount,
            message: `Bạn trộm thành công và lấy được {amount}!`
        };
    } else {
        const fine = Math.floor(Math.random() * 200) + 100;
        
        return {
            success: false,
            amount: 0,
            fine,
            message: `Bạn bị bắt! Bạn phải nộp phạt {fine}.`
        };
    }
}

export function formatShopItem(item, index) {
    return `**${index + 1}.** ${item.emoji} **${item.name}** - ${formatCurrency(item.price)}\n${item.description}\n`;
}

export const addMoney = wrapServiceBoundary(async function addMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Invalid amount',
            ErrorTypes.VALIDATION,
            'Số tiền phải là một số dương.',
            { guildId, userId, amount, operation: 'addMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Invalid money type',
            ErrorTypes.VALIDATION,
            'Loại phải là "wallet" hoặc "bank".',
            { guildId, userId, type, operation: 'addMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        const maxBank = getMaxBankCapacity(userData);
        if ((userData.bank || 0) + validAmount > maxBank) {
            throw createError(
                'Bank capacity exceeded',
                ErrorTypes.VALIDATION,
                `Vượt quá sức chứa ngân hàng. Hiện tại: ${userData.bank || 0}, Tối đa: ${maxBank}.`,
                { guildId, userId, current: userData.bank || 0, max: maxBank, operation: 'addMoney' }
            );
        }
        userData.bank = (userData.bank || 0) + validAmount;
    } else {
        userData.wallet = (userData.wallet || 0) + validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
        ...(type === 'bank' ? { maxBank: getMaxBankCapacity(userData) } : {}),
    };
}, {
    service: 'economy',
    operation: 'addMoney',
    userMessage: 'Không thể thêm tiền. Vui lòng thử lại.',
});

export const removeMoney = wrapServiceBoundary(async function removeMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Invalid amount',
            ErrorTypes.VALIDATION,
            'Số tiền phải là một số dương.',
            { guildId, userId, amount, operation: 'removeMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Invalid money type',
            ErrorTypes.VALIDATION,
            'Loại phải là "wallet" hoặc "bank".',
            { guildId, userId, type, operation: 'removeMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        if ((userData.bank || 0) < validAmount) {
            throw createError(
                'Insufficient bank funds',
                ErrorTypes.VALIDATION,
                `Không đủ tiền trong ngân hàng. Bạn có ${userData.bank || 0}, cần ${validAmount}.`,
                { guildId, userId, current: userData.bank || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.bank = (userData.bank || 0) - validAmount;
    } else {
        if ((userData.wallet || 0) < validAmount) {
            throw createError(
                'Insufficient wallet funds',
                ErrorTypes.VALIDATION,
                `Không đủ tiền mặt. Bạn có ${userData.wallet || 0}, cần ${validAmount}.`,
                { guildId, userId, current: userData.wallet || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.wallet = (userData.wallet || 0) - validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
    };
}, {
    service: 'economy',
    operation: 'removeMoney',
    userMessage: 'Không thể trừ tiền. Vui lòng thử lại.',
});

export function getShopInventory() {
    return [
        {
            id: 'fishing_rod',
            name: 'Cần Câu Cá',
            emoji: '🎣',
            price: 500,
            description: 'Câu cá để bán kiếm lời!',
            type: 'tool'
        },
        {
            id: 'hunting_rifle',
            name: 'Súng Săn',
            emoji: '🔫',
            price: 1000,
            description: 'Săn thú lấy thịt và lông!',
            type: 'tool'
        },
        {
            id: 'laptop',
            name: 'Laptop',
            emoji: '💻',
            price: 2000,
            description: 'Làm lập trình viên để nhận lương cao hơn!',
            type: 'tool',
            workMultiplier: 1.5
        },
        {
            id: 'bank_loan',
            name: 'Khoản Vay Ngân Hàng',
            emoji: '🏦',
            price: 5000,
            description: 'Tăng sức chứa ngân hàng của bạn thêm 50,000!',
            type: 'upgrade',
            effect: 'bank_capacity',
            value: 50000
        },
        {
            id: 'lottery_ticket',
            name: 'Vé Số',
            emoji: '🎫',
            price: 100,
            description: 'Cơ hội trúng thưởng lớn!',
            type: 'consumable',
            use: 'gamble'
        }
    ];
}