import { getFromDb, setInDb } from '../utils/database/wrapper.js';
import { logger } from '../utils/logger.js';

const STREAK_KEY_PREFIX = 'guild:';
const STREAK_KEY_SUFFIX = ':streaks';
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function getDateKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function getPreviousDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getActivityForDate(streakData, dateKey) {
  return streakData.dailyActivity?.[dateKey] || {};
}

function trimDailyActivity(dailyActivity, today) {
  const oldestAllowed = new Date(`${today}T12:00:00.000Z`);
  oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - 7);
  const cutoff = oldestAllowed.toISOString().slice(0, 10);

  return Object.fromEntries(
    Object.entries(dailyActivity || {}).filter(([dateKey]) => dateKey >= cutoff),
  );
}

export function getStreakKey(guildId) {
  return `${STREAK_KEY_PREFIX}${guildId}${STREAK_KEY_SUFFIX}`;
}

export function getPairKey(userId1, userId2) {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

export async function getStreakData(client, guildId, userId1, userId2) {
  try {
    const allStreaks = await getFromDb(getStreakKey(guildId), {});
    return allStreaks[getPairKey(userId1, userId2)] || null;
  } catch (error) {
    logger.error(`Error getting streak data for guild ${guildId}:`, error);
    return null;
  }
}

export async function saveStreakData(client, guildId, userId1, userId2, streakData) {
  try {
    const key = getStreakKey(guildId);
    const allStreaks = await getFromDb(key, {});
    allStreaks[getPairKey(userId1, userId2)] = {
      ...streakData,
      updatedAt: Date.now(),
    };
    await setInDb(key, allStreaks);
    return true;
  } catch (error) {
    logger.error(`Error saving streak data for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Records an interaction from authorId to targetUserId.
 * A day is completed only after both people have interacted with the other
 * at least once during that Vietnam-calendar day.
 */
export async function recordMessage(client, guildId, authorId, targetUserId) {
  if (!guildId || !authorId || !targetUserId || authorId === targetUserId) {
    return null;
  }

  try {
    const now = Date.now();
    const today = getDateKey(now);
    const existingStreak = await getStreakData(client, guildId, authorId, targetUserId);
    const pairKey = getPairKey(authorId, targetUserId);
    const [userId1, userId2] = pairKey.split(':');

    const baseData = existingStreak || {
      userId1,
      userId2,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
      lastInteractionDate: null,
      totalInteractions: 0,
      dailyActivity: {},
    };

    const dailyActivity = trimDailyActivity(baseData.dailyActivity, today);
    const todayActivity = {
      ...getActivityForDate(baseData, today),
      [authorId]: true,
    };
    dailyActivity[today] = todayActivity;

    const bothUsersInteracted = Boolean(todayActivity[userId1] && todayActivity[userId2]);
    const alreadyCompletedToday = baseData.lastCompletedDate === today;

    const newStreakData = {
      ...baseData,
      userId1,
      userId2,
      dailyActivity,
      lastInteractionDate: today,
      lastInteractionTimestamp: now,
      totalInteractions: (baseData.totalInteractions || 0) + 1,
    };

    if (bothUsersInteracted && !alreadyCompletedToday) {
      const previousCompletedDate = baseData.lastCompletedDate || baseData.lastInteractionDate;
      const isConsecutiveDay = previousCompletedDate === getPreviousDate(today);
      const currentStreak = isConsecutiveDay ? (baseData.currentStreak || 0) + 1 : 1;

      newStreakData.currentStreak = currentStreak;
      newStreakData.longestStreak = Math.max(baseData.longestStreak || 0, currentStreak);
      newStreakData.lastCompletedDate = today;

      logger.debug(`Streak day completed for ${userId1} and ${userId2} in guild ${guildId}`, {
        guildId,
        userId1,
        userId2,
        currentStreak,
      });
    }

    await saveStreakData(client, guildId, authorId, targetUserId, newStreakData);
    return newStreakData;
  } catch (error) {
    logger.error(`Error recording streak interaction for guild ${guildId}:`, error);
    return null;
  }
}

export async function getUserStreaks(client, guildId, userId) {
  try {
    const allStreaks = await getFromDb(getStreakKey(guildId), {});
    const userStreaks = [];

    for (const [pairKey, streakData] of Object.entries(allStreaks)) {
      const [userId1, userId2] = pairKey.split(':');
      if (userId1 === userId || userId2 === userId) {
        userStreaks.push({
          otherUserId: userId1 === userId ? userId2 : userId1,
          ...streakData,
        });
      }
    }

    return userStreaks.sort((a, b) => b.currentStreak - a.currentStreak);
  } catch (error) {
    logger.error(`Error getting user streaks for guild ${guildId}:`, error);
    return [];
  }
}

export async function getTopStreaks(client, guildId, limit = 10) {
  try {
    const allStreaks = await getFromDb(getStreakKey(guildId), {});
    const streaks = Object.entries(allStreaks).map(([pairKey, streakData]) => {
      const [userId1, userId2] = pairKey.split(':');
      return { userId1, userId2, ...streakData };
    });

    return streaks
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);
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

    if (!allStreaks[pairKey]) {
      return false;
    }

    delete allStreaks[pairKey];
    await setInDb(key, allStreaks);
    return true;
  } catch (error) {
    logger.error(`Error resetting streak for guild ${guildId}:`, error);
    return false;
  }
}