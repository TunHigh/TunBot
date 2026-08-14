import { getFromDb, setInDb } from '../utils/database/wrapper.js';
import { logger } from '../utils/logger.js';

const STREAK_KEY_PREFIX = 'guild:';
const STREAK_KEY_SUFFIX = ':streaks';

export function getStreakKey(guildId) {
    return `${STREAK_KEY_PREFIX}${guildId}${STREAK_KEY_SUFFIX}`;
}

export async function getStreakData(client, guildId, userId1, userId2) {
    try {
        const key = getStreakKey(guildId);
        const allStreaks = await getFromDb(key, {});
        const pairKey = getPairKey(userId1, userId2);
        return allStreaks[pairKey] || null;
    } catch (error) {
        logger.error(`Error getting streak data for guild ${guildId}:`, error);
        return null;
    }
}

export async function saveStreakData(client, guildId, userId1, userId2, streakData) {
    try {
        const key = getStreakKey(guildId);
        const allStreaks = await getFromDb(key, {});
        const pairKey = getPairKey(userId1, userId2);
        allStreaks[pairKey] = {
            ...streakData,
            updatedAt: Date.now()
        };
        await setInDb(key, allStreaks);
        return true;
    } catch (error) {
        logger.error(`Error saving streak data for guild ${guildId}:`, error);
        return false;
    }
}

export function getPairKey(userId1, userId2) {
    // Sort user IDs to ensure consistent key regardless of order
    const sorted = [userId1, userId2].sort();
    return `${sorted[0]}:${sorted[1]}`;
}

export async function recordMessage(client, guildId, authorId, mentionedUserId) {
    // Don't track self-mentions or bots
    if (authorId === mentionedUserId) return null;
    
    const now = Date.now();
    const today = new Date(now).toDateString();
    
    const existingStreak = await getStreakData(client, guildId, authorId, mentionedUserId);
    
    let newStreakData;
    if (!existingStreak) {
        // First interaction between these users
        newStreakData = {
            userId1: authorId,
            userId2: mentionedUserId,
            currentStreak: 1,
            longestStreak: 1,
            lastInteractionDate: today,
            lastInteractionTimestamp: now,
            totalInteractions: 1
        };
    } else {
        const lastDate = existingStreak.lastInteractionDate;
        
        if (lastDate === today) {
            // Already interacted today, just update timestamp and total count
            newStreakData = {
                ...existingStreak,
                lastInteractionTimestamp: now,
                totalInteractions: existingStreak.totalInteractions + 1
            };
        } else {
            // Check if it's consecutive day
            const lastInteractionDate = new Date(lastDate);
            const yesterday = new Date(now - 24 * 60 * 60 * 1000).toDateString();
            
            if (lastDate === yesterday) {
                // Consecutive day - increment streak
                const newStreak = existingStreak.currentStreak + 1;
                newStreakData = {
                    ...existingStreak,
                    currentStreak: newStreak,
                    longestStreak: Math.max(existingStreak.longestStreak, newStreak),
                    lastInteractionDate: today,
                    lastInteractionTimestamp: now,
                    totalInteractions: existingStreak.totalInteractions + 1
                };
            } else {
                // Streak broken - reset to 1
                newStreakData = {
                    ...existingStreak,
                    currentStreak: 1,
                    lastInteractionDate: today,
                    lastInteractionTimestamp: now,
                    totalInteractions: existingStreak.totalInteractions + 1
                };
            }
        }
    }
    
    await saveStreakData(client, guildId, authorId, mentionedUserId, newStreakData);
    return newStreakData;
}

export async function getUserStreaks(client, guildId, userId) {
    try {
        const key = getStreakKey(guildId);
        const allStreaks = await getFromDb(key, {});
        const userStreaks = [];
        
        for (const [pairKey, streakData] of Object.entries(allStreaks)) {
            const [userId1, userId2] = pairKey.split(':');
            if (userId1 === userId || userId2 === userId) {
                const otherUserId = userId1 === userId ? userId2 : userId1;
                userStreaks.push({
                    otherUserId,
                    ...streakData
                });
            }
        }
        
        // Sort by current streak descending
        userStreaks.sort((a, b) => b.currentStreak - a.currentStreak);
        return userStreaks;
    } catch (error) {
        logger.error(`Error getting user streaks for guild ${guildId}:`, error);
        return [];
    }
}

export async function getTopStreaks(client, guildId, limit = 10) {
    try {
        const key = getStreakKey(guildId);
        const allStreaks = await getFromDb(key, {});
        const streaksArray = [];
        
        for (const [pairKey, streakData] of Object.entries(allStreaks)) {
            const [userId1, userId2] = pairKey.split(':');
            streaksArray.push({
                userId1,
                userId2,
                ...streakData
            });
        }
        
        // Sort by current streak descending
        streaksArray.sort((a, b) => b.currentStreak - a.currentStreak);
        return streaksArray.slice(0, limit);
    } catch (error) {
        logger.error(`Error getting top streaks for guild ${guildId}:`, error);
        return [];
    }
}

export async function resetStreak(client, guildId, userId1, userId2) {
    try {
        const key = getStreakKey(guildId);
        const allStreaks = await getFromDb(key, {});
        const pairKey = getPairKey(userId1, userId2);
        
        if (allStreaks[pairKey]) {
            delete allStreaks[pairKey];
            await setInDb(key, allStreaks);
            return true;
        }
        return false;
    } catch (error) {
        logger.error(`Error resetting streak for guild ${guildId}:`, error);
        return false;
    }
}