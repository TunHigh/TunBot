import { getFromDb, setInDb } from '../utils/database/wrapper.js';
import { logger } from '../utils/logger.js';

const STREAK_KEY_PREFIX = 'guild:';
const STREAK_KEY_SUFFIX = ':streaks';
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const MAX_STREAK_PARTNERS = 5;
export const STREAK_MILESTONES = [1, 5, 15, 30, 60, 90, 120, 150, 180];

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

function trimDailyActivity(dailyActivity, today) {
  const oldestAllowed = new Date(`${today}T12:00:00.000Z`);
  oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - 7);
  const cutoff = oldestAllowed.toISOString().slice(0, 10);

  return Object.fromEntries(
    Object.entries(dailyActivity || {}).filter(([dateKey]) => dateKey >= cutoff),
  );
}

function createUserActivity() {
  return { messages: 0, replies: 0 };
}

export function getDailyRequirements(currentStreak = 0) {
  // The requirement grows whenever the pair reaches the displayed streak milestones.
  if (currentStreak >= 150) return { messages: 120, replies: 5 };
  if (currentStreak >= 120) return { messages: 100, replies: 4 };
  if (currentStreak >= 90) return { messages: 90, replies: 4 };
  if (currentStreak >= 60) return { messages: 75, replies: 3 };
  if (currentStreak >= 30) return { messages: 60, replies: 3 };
  if (currentStreak >= 15) return { messages: 50, replies: 2 };
  if (currentStreak >= 5) return { messages: 30, replies: 2 };
  return { messages: 20, replies: 1 };
}

export function getStreakKey(guildId) {
  return `${STREAK_KEY_PREFIX}${guildId}${STREAK_KEY_SUFFIX}`;
}

export function getPairKey(userId1, userId2) {
  return [userId1, userId2].sort().join(':');
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

export async function getUserStreaks(client, guildId, userId) {
  try {
    const allStreaks = await getFromDb(getStreakKey(guildId), {});
    return Object.entries(allStreaks)
      .map(([pairKey, streakData]) => {
        const [userId1, userId2] = pairKey.split(':');
        if (userId1 !== userId && userId2 !== userId) return null;
        return {
          otherUserId: userId1 === userId ? userId2 : userId1,
          ...streakData,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.currentStreak - a.currentStreak || b.updatedAt - a.updatedAt);
  } catch (error) {
    logger.error(`Error getting user streaks for guild ${guildId}:`, error);
    return [];
  }
}

export async function getTopStreaks(client, guildId, limit = 10) {
  try {
    const allStreaks = await getFromDb(getStreakKey(guildId), {});
    return Object.entries(allStreaks)
      .map(([pairKey, streakData]) => {
        const [userId1, userId2] = pairKey.split(':');
        return { userId1, userId2, ...streakData };
      })
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);
  } catch (error) {
    logger.error(`Error getting top streaks for guild ${guildId}:`, error);
    return [];
  }
}

export function getTodayProgress(streakData, viewerId) {
  const today = getDateKey();
  const activity = streakData?.dailyActivity?.[today] || {};
  const userId1 = streakData?.userId1;
  const userId2 = streakData?.userId2;
  const otherUserId = userId1 === viewerId ? userId2 : userId1;
  const requirements = getDailyRequirements(streakData?.currentStreak || 0);

  return {
    requirements,
    viewer: { ...createUserActivity(), ...(activity[viewerId] || {}) },
    other: { ...createUserActivity(), ...(activity[otherUserId] || {}) },
    date: today,
  };
}

/**
 * Records a directed interaction. A reply also counts as one message.
 * The day completes only after both people reach that day's message/reply target.
 */
export async function recordMessage(client, guildId, authorId, targetUserId, { isReply = false } = {}) {
  if (!guildId || !authorId || !targetUserId || authorId === targetUserId) return null;

  try {
    const now = Date.now();
    const today = getDateKey(now);
    const existingStreak = await getStreakData(client, guildId, authorId, targetUserId);

    if (!existingStreak) {
      const authorStreaks = await getUserStreaks(client, guildId, authorId);
      const targetStreaks = await getUserStreaks(client, guildId, targetUserId);
      if (authorStreaks.length >= MAX_STREAK_PARTNERS || targetStreaks.length >= MAX_STREAK_PARTNERS) {
        return { limitReached: true, currentStreak: 0 };
      }
    }

    const [userId1, userId2] = getPairKey(authorId, targetUserId).split(':');
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

    const requirements = getDailyRequirements(baseData.currentStreak || 0);
    const dailyActivity = trimDailyActivity(baseData.dailyActivity, today);
    const todayActivity = { ...(dailyActivity[today] || {}) };
    const authorActivity = {
      ...createUserActivity(),
      ...(todayActivity[authorId] || {}),
      messages: (todayActivity[authorId]?.messages || 0) + 1,
      replies: (todayActivity[authorId]?.replies || 0) + (isReply ? 1 : 0),
    };
    todayActivity[authorId] = authorActivity;
    dailyActivity[today] = todayActivity;

    const firstActivity = { ...createUserActivity(), ...(todayActivity[userId1] || {}) };
    const secondActivity = { ...createUserActivity(), ...(todayActivity[userId2] || {}) };
    const reachedTarget = (activity) =>
      activity.messages >= requirements.messages && activity.replies >= requirements.replies;
    const bothUsersCompleted = reachedTarget(firstActivity) && reachedTarget(secondActivity);
    const alreadyCompletedToday = baseData.lastCompletedDate === today;

    const nextData = {
      ...baseData,
      userId1,
      userId2,
      dailyActivity,
      lastInteractionDate: today,
      lastInteractionTimestamp: now,
      totalInteractions: (baseData.totalInteractions || 0) + 1,
    };

    if (bothUsersCompleted && !alreadyCompletedToday) {
      const isConsecutiveDay = baseData.lastCompletedDate === getPreviousDate(today);
      const currentStreak = isConsecutiveDay ? (baseData.currentStreak || 0) + 1 : 1;
      nextData.currentStreak = currentStreak;
      nextData.longestStreak = Math.max(baseData.longestStreak || 0, currentStreak);
      nextData.lastCompletedDate = today;
    }

    await saveStreakData(client, guildId, authorId, targetUserId, nextData);
    return nextData;
  } catch (error) {
    logger.error(`Error recording streak interaction for guild ${guildId}:`, error);
    return null;
  }
}

export async function resetStreak(client, guildId, userId1, userId2) {
  try {
    const key = getStreakKey(guildId);
    const allStreaks = await getFromDb(key, {});
    const pairKey = getPairKey(userId1, userId2);
    if (!allStreaks[pairKey]) return false;

    delete allStreaks[pairKey];
    await setInDb(key, allStreaks);
    return true;
  } catch (error) {
    logger.error(`Error resetting streak for guild ${guildId}:`, error);
    return false;
  }
}