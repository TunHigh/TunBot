import { Pool } from 'pg';
import { resolvePostgresPoolConfig } from '../../config/database/postgres.js';
import EconomyService from '../../services/economyService.js';


// ============================================================
// CONFIG
// ============================================================

const MAX_STREAKS = 5;

const DAILY_MESSAGES = 50;

const DAILY_REPLIES = 1;

const INVITE_MINUTES = 30;

const TIMEZONE =
    process.env.STREAK_TIMEZONE ||
    'Asia/Ho_Chi_Minh';


// ============================================================
// REWARD
// ============================================================

const REWARDS = {

    1: 100,

    2: 100,
    3: 100,
    4: 100,

    5: 200,

    6: 200,
    7: 200,

    8: 250,
    9: 250,
    10: 250,

    11: 300,
    12: 300,
    13: 300,
    14: 300,

    15: 500,

    16: 500,
    17: 500,
    18: 500,
    19: 500,
    20: 500,

    21: 600,
    22: 600,
    23: 600,
    24: 600,
    25: 600,
    26: 600,
    27: 600,
    28: 600,
    29: 600,

    30: 1000,

    60: 1500,

    90: 2000,

    120: 3000,

    150: 4000,

    180: 5000,
};


const DEFAULT_REWARD = 100;


// ============================================================
// DATABASE
// ============================================================

let pool = null;

let initialized = false;

let trackerStarted = false;


// ============================================================
// GET DATABASE
// ============================================================

function getPool() {

    if (pool) {
        return pool;
    }

    pool = new Pool(resolvePostgresPoolConfig());

    return pool;
}


// ============================================================
// TODAY
// ============================================================

function getToday() {

    return new Intl.DateTimeFormat(
        'en-CA',
        {
            timeZone:
                TIMEZONE,

            year:
                'numeric',

            month:
                '2-digit',

            day:
                '2-digit',
        }
    ).format(
        new Date()
    );
}


// ============================================================
// FORMAT DATE STRING
// ============================================================

function formatDateString(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
        return str.slice(0, 10);
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }
    return str.slice(0, 10);
}


// ============================================================
// REWARD
// ============================================================

export function getReward(
    day
) {
    return (
        REWARDS[day] ??
        DEFAULT_REWARD
    );
}


// ============================================================
// INITIALIZE
// ============================================================

export async function initStreak(
    client
) {

    if (initialized) {
        return;
    }

    const db =
        getPool();

    await db.query(`
        CREATE TABLE IF NOT EXISTS streaks (
            id BIGSERIAL PRIMARY KEY,

            guild_id TEXT NOT NULL,

            user1_id TEXT NOT NULL,
            user2_id TEXT NOT NULL,

            streak_days INTEGER NOT NULL DEFAULT 0,

            day_key DATE NOT NULL,

            user1_messages INTEGER NOT NULL DEFAULT 0,
            user2_messages INTEGER NOT NULL DEFAULT 0,

            user1_replies INTEGER NOT NULL DEFAULT 0,
            user2_replies INTEGER NOT NULL DEFAULT 0,

            last_completed_date DATE NULL,

            status TEXT NOT NULL DEFAULT 'active',

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT NOW(),

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT NOW(),

            UNIQUE(
                guild_id,
                user1_id,
                user2_id
            )
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS
        idx_streak_user1
        ON streaks(
            guild_id,
            user1_id,
            status
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS
        idx_streak_user2
        ON streaks(
            guild_id,
            user2_id,
            status
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS streak_invites (
            id BIGSERIAL PRIMARY KEY,

            guild_id TEXT NOT NULL,

            inviter_id TEXT NOT NULL,

            target_id TEXT NOT NULL,

            expires_at TIMESTAMPTZ
                NOT NULL,

            status TEXT NOT NULL
                DEFAULT 'pending',

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS
        idx_streak_invites
        ON streak_invites(
            guild_id,
            target_id,
            status
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS streak_rewards (
            id BIGSERIAL PRIMARY KEY,

            streak_id BIGINT NOT NULL,

            streak_day INTEGER NOT NULL,

            user_id TEXT NOT NULL,

            amount BIGINT NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT NOW(),

            UNIQUE(
                streak_id,
                streak_day,
                user_id
            )
        )
    `);

    initialized = true;

    console.log(
        '[STREAK] PostgreSQL initialized.'
    );
}


// ============================================================
// NORMALIZE
// ============================================================

function normalize(
    row
) {

    if (!row) {
        return null;
    }

    return {

        id:
            String(row.id),

        guildId:
            row.guild_id,

        user1Id:
            row.user1_id,

        user2Id:
            row.user2_id,

        streakDays:
            Number(
                row.streak_days || 0
            ),

        dayKey:
            formatDateString(
                row.day_key
            ),

        user1Messages:
            Number(
                row.user1_messages || 0
            ),

        user2Messages:
            Number(
                row.user2_messages || 0
            ),

        user1Replies:
            Number(
                row.user1_replies || 0
            ),

        user2Replies:
            Number(
                row.user2_replies || 0
            ),

        lastCompletedDate:
            formatDateString(
                row.last_completed_date
            ),

        nextReward:
            getReward(
                Number(
                    row.streak_days || 0
                ) + 1
            ),
    };
}


// ============================================================
// SYNC STREAK DATE (NEW DAY RESET & BREAK CHECK)
// ============================================================

async function syncStreakDate(streak) {
    if (!streak) return null;

    const today = getToday();
    if (streak.dayKey === today) {
        return streak;
    }

    const db = getPool();
    let newStreakDays = streak.streakDays;

    if (streak.streakDays > 0) {
        if (!streak.lastCompletedDate) {
            newStreakDays = 0;
        } else {
            const todayDate = new Date(today + 'T00:00:00Z');
            const lastCompDate = new Date(streak.lastCompletedDate + 'T00:00:00Z');
            const diffDays = Math.round(
                (todayDate.getTime() - lastCompDate.getTime()) / (1000 * 3600 * 24)
            );

            if (diffDays > 1) {
                newStreakDays = 0;
            }
        }
    }

    const result = await db.query(`
        UPDATE streaks
        SET streak_days = $1,
            day_key = $2::date,
            user1_messages = 0,
            user2_messages = 0,
            user1_replies = 0,
            user2_replies = 0,
            updated_at = NOW()
        WHERE id = $3
        AND status = 'active'
        RETURNING *
    `, [
        newStreakDays,
        today,
        streak.id,
    ]);

    if (result.rows[0]) {
        return normalize(result.rows[0]);
    }

    return streak;
}


// ============================================================
// USER STREAKS
// ============================================================

export async function getUserStreaks(
    guildId,
    userId
) {

    const db =
        getPool();

    const result =
        await db.query(
            `
            SELECT *
            FROM streaks

            WHERE guild_id = $1

            AND status = 'active'

            AND (
                user1_id = $2
                OR user2_id = $2
            )

            ORDER BY id ASC
            `,
            [
                guildId,
                userId,
            ]
        );

    const normalizedList = result.rows.map(normalize);
    const syncedList = [];

    for (const item of normalizedList) {
        syncedList.push(await syncStreakDate(item));
    }

    return syncedList;
}


// ============================================================
// GET STREAK
// ============================================================

export async function getStreakById(
    guildId,
    streakId
) {

    const db =
        getPool();

    const result =
        await db.query(
            `
            SELECT *
            FROM streaks

            WHERE guild_id = $1
            AND id = $2

            LIMIT 1
            `,
            [
                guildId,
                streakId,
            ]
        );

    if (!result.rows[0]) return null;

    const normalized = normalize(result.rows[0]);
    return await syncStreakDate(normalized);
}


// ============================================================
// PARTNER
// ============================================================

export function getStreakPartner(
    streak,
    userId
) {

    return (
        streak.user1Id === userId
            ? streak.user2Id
            : streak.user1Id
    );
}


// ============================================================
// CREATE INVITE
// ============================================================

export async function createInvite(
    guildId,
    inviterId,
    targetId
) {

    const db =
        getPool();

    const inviter =
        await getUserStreaks(
            guildId,
            inviterId
        );

    if (
        inviter.length >=
        MAX_STREAKS
    ) {
        return {
            success: false,
            message:
                `Bạn đã đạt giới hạn ${MAX_STREAKS} người.`,
        };
    }

    const target =
        await getUserStreaks(
            guildId,
            targetId
        );

    if (
        target.length >=
        MAX_STREAKS
    ) {
        return {
            success: false,
            message:
                `Người được mời đã có ${MAX_STREAKS} streak.`,
        };
    }

    const [user1, user2] =
        BigInt(inviterId) <
        BigInt(targetId)
            ? [inviterId, targetId]
            : [targetId, inviterId];

    const existing =
        await db.query(
            `
            SELECT *
            FROM streaks

            WHERE guild_id = $1

            AND user1_id = $2
            AND user2_id = $3

            AND status = 'active'

            LIMIT 1
            `,
            [
                guildId,
                user1,
                user2,
            ]
        );

    if (
        existing.rowCount
    ) {
        return {
            success: false,
            message:
                'Hai người đang có streak với nhau.',
        };
    }

    await db.query(
        `
        UPDATE streak_invites

        SET status = 'cancelled'

        WHERE guild_id = $1

        AND inviter_id = $2
        AND target_id = $3

        AND status = 'pending'
        `,
        [
            guildId,
            inviterId,
            targetId,
        ]
    );

    const result =
        await db.query(
            `
            INSERT INTO streak_invites(
                guild_id,
                inviter_id,
                target_id,
                expires_at
            )

            VALUES(
                $1,
                $2,
                $3,
                NOW() +
                ($4 || ' minutes')::interval
            )

            RETURNING id
            `,
            [
                guildId,
                inviterId,
                targetId,
                INVITE_MINUTES,
            ]
        );

    return {
        success: true,

        inviteId:
            String(
                result.rows[0].id
            ),
    };
}


// ============================================================
// ACCEPT
// ============================================================

export async function acceptInvite(
    guildId,
    userId,
    inviteId
) {

    const db =
        getPool();

    const result =
        await db.query(
            `
            SELECT *
            FROM streak_invites

            WHERE id = $1

            AND guild_id = $2

            AND target_id = $3

            AND status = 'pending'

            AND expires_at > NOW()

            LIMIT 1
            `,
            [
                inviteId,
                guildId,
                userId,
            ]
        );

    if (!result.rowCount) {
        return {
            success: false,
            message:
                'Lời mời đã hết hạn hoặc đã được xử lý.',
        };
    }

    const invite =
        result.rows[0];

    const inviter =
        await getUserStreaks(
            guildId,
            invite.inviter_id
        );

    const target =
        await getUserStreaks(
            guildId,
            invite.target_id
        );

    if (
        inviter.length >=
        MAX_STREAKS ||
        target.length >=
        MAX_STREAKS
    ) {

        return {
            success: false,
            message:
                'Một trong hai người đã đạt giới hạn 5 streak.',
        };
    }

    const [
        user1,
        user2,
    ] =
        BigInt(
            invite.inviter_id
        ) <
        BigInt(
            invite.target_id
        )
            ? [
                invite.inviter_id,
                invite.target_id,
            ]
            : [
                invite.target_id,
                invite.inviter_id,
            ];

    const existingAnyStatus =
        await db.query(
            `
            SELECT *
            FROM streaks

            WHERE guild_id = $1

            AND user1_id = $2
            AND user2_id = $3

            LIMIT 1
            `,
            [
                guildId,
                user1,
                user2,
            ]
        );

    if (existingAnyStatus.rowCount) {
        const row = existingAnyStatus.rows[0];

        if (row.status === 'active') {
            return {
                success: false,
                message:
                    'Streak giữa hai người đã tồn tại.',
            };
        }

        await db.query(
            `
            UPDATE streaks
            SET streak_days = 0,
                day_key = $2::date,
                user1_messages = 0,
                user2_messages = 0,
                user1_replies = 0,
                user2_replies = 0,
                last_completed_date = NULL,
                status = 'active',
                updated_at = NOW()
            WHERE id = $1
            `,
            [
                row.id,
                getToday(),
            ]
        );
    } else {
        await db.query(
            `
            INSERT INTO streaks(
                guild_id,

                user1_id,
                user2_id,

                streak_days,

                day_key,

                user1_messages,
                user2_messages,

                user1_replies,
                user2_replies,

                status
            )

            VALUES(
                $1,
                $2,
                $3,

                0,

                $4::date,

                0,
                0,

                0,
                0,

                'active'
            )
            `,
            [
                guildId,
                user1,
                user2,
                getToday(),
            ]
        );
    }

    await db.query(
        `
        UPDATE streak_invites

        SET status = 'accepted'

        WHERE id = $1
        `,
        [
            inviteId,
        ]
    );

    return {
        success: true,

        partnerId:
            invite.inviter_id,
    };
}


// ============================================================
// DECLINE
// ============================================================

export async function declineInvite(
    inviteId,
    userId
) {

    const db =
        getPool();

    const result =
        await db.query(
            `
            UPDATE streak_invites

            SET status = 'declined'

            WHERE id = $1

            AND target_id = $2

            AND status = 'pending'

            RETURNING id
            `,
            [
                inviteId,
                userId,
            ]
        );

    if (!result.rowCount) {
        return {
            success: false,
            message:
                'Lời mời không còn hiệu lực.',
        };
    }

    return {
        success: true,
    };
}


// ============================================================
// DELETE
// ============================================================

export async function deleteStreak(
    guildId,
    userId,
    streakId
) {

    const db =
        getPool();

    const result =
        await db.query(
            `
            UPDATE streaks

            SET status = 'deleted',

                updated_at = NOW()

            WHERE id = $1

            AND guild_id = $2

            AND (
                user1_id = $3
                OR user2_id = $3
            )

            AND status = 'active'

            RETURNING id
            `,
            [
                streakId,
                guildId,
                userId,
            ]
        );

    if (!result.rowCount) {
        return {
            success: false,
            message:
                'Không tìm thấy streak.',
        };
    }

    return {
        success: true,
    };
}


// ============================================================
// COMPLETE DAY
// ============================================================

async function completeStreak(
    client,
    streak
) {

    const db =
        getPool();

    const reward =
        getReward(
            streak.streakDays + 1
        );

    const result =
        await db.query(
            `
            UPDATE streaks

            SET streak_days =
                streak_days + 1,

                last_completed_date =
                    $2::date,

                updated_at = NOW()

            WHERE id = $1

            AND status = 'active'

            AND (
                last_completed_date IS NULL
                OR last_completed_date <> $2::date
            )

            RETURNING *
            `,
            [
                streak.id,
                getToday(),
            ]
        );

    if (!result.rowCount) {
        return;
    }

    const updated =
        normalize(
            result.rows[0]
        );

    const newDay =
        updated.streakDays;

    await giveReward(
        client,
        updated,
        updated.user1Id,
        newDay,
        reward
    );

    await giveReward(
        client,
        updated,
        updated.user2Id,
        newDay,
        reward
    );

    console.log(
        `[STREAK] ${updated.user1Id} + ${updated.user2Id} -> ${newDay} day`
    );

    // Thông báo vào system channel
    try {

        const guild =
            client.guilds.cache.get(
                updated.guildId
            );

        if (!guild) {
            return;
        }

        const channel =
            guild.systemChannel;

        if (!channel) {
            return;
        }

        await channel.send({
            content:
                `${mention(updated.user1Id)} và ` +
                `${mention(updated.user2Id)} ` +
                `đã đạt streak **${newDay} ngày**!\n\n` +

                `🏆 **${newDay} ngày** ` +
                `→ **+${reward.toLocaleString('vi-VN')} xu/người**`,
        });

    } catch (error) {

        console.error(
            '[STREAK] Notification error:',
            error
        );
    }
}


// ============================================================
// GIVE REWARD
// ============================================================

async function giveReward(
    client,
    streak,
    userId,
    day,
    amount
) {

    const db =
        getPool();

    const inserted =
        await db.query(
            `
            INSERT INTO streak_rewards(
                streak_id,
                streak_day,
                user_id,
                amount
            )

            VALUES(
                $1,
                $2,
                $3,
                $4
            )

            ON CONFLICT(
                streak_id,
                streak_day,
                user_id
            )

            DO NOTHING

            RETURNING id
            `,
            [
                streak.id,
                day,
                userId,
                amount,
            ]
        );

    if (!inserted.rowCount) {
        return;
    }

    try {

        await EconomyService.addMoney(
            client,
            streak.guildId,
            userId,
            amount,
            `streak_day_${day}`
        );

    } catch (error) {

        await db.query(
            `
            DELETE FROM streak_rewards

            WHERE streak_id = $1

            AND streak_day = $2

            AND user_id = $3
            `,
            [
                streak.id,
                day,
                userId,
            ]
        ).catch(() => {});

        throw error;
    }
}


// ============================================================
// MESSAGE TRACKING
// ============================================================

export function startMessageTracker(
    client
) {

    if (trackerStarted) {
        return;
    }

    trackerStarted = true;

    client.on(
        'messageCreate',
        async message => {

            if (
                !message.guild ||
                message.author.bot
            ) {
                return;
            }

            try {

                await processMessage(
                    client,
                    message
                );

            } catch (error) {

                console.error(
                    '[STREAK] Message tracker error:',
                    error
                );
            }
        }
    );

    console.log(
        '[STREAK] Message tracker started.'
    );
}


// ============================================================
// PROCESS MESSAGE
// ============================================================

async function processMessage(
    client,
    message
) {

    const streaks =
        await getUserStreaks(
            message.guild.id,
            message.author.id
        );

    if (!streaks.length) {
        return;
    }

    const db =
        getPool();

    for (
        const streak
        of streaks
    ) {

        const isUser1 =
            streak.user1Id ===
            message.author.id;

        const isUser2 =
            streak.user2Id ===
            message.author.id;

        if (
            !isUser1 &&
            !isUser2
        ) {
            continue;
        }


        // ====================================================
        // MESSAGE
        // ====================================================

        const messageColumn =
            isUser1
                ? 'user1_messages'
                : 'user2_messages';

        const currentMessages =
            isUser1
                ? streak.user1Messages
                : streak.user2Messages;

        if (
            currentMessages <
            DAILY_MESSAGES
        ) {

            await db.query(
                `
                UPDATE streaks

                SET ${messageColumn} =
                    LEAST(
                        ${messageColumn} + 1,
                        $2
                    ),

                    updated_at = NOW()

                WHERE id = $1

                AND status = 'active'
                `,
                [
                    streak.id,
                    DAILY_MESSAGES,
                ]
            );
        }


        // ====================================================
        // REPLY
        // ====================================================

        if (
            message.reference?.messageId
        ) {

            const reference =
                await message.channel.messages
                    .fetch(
                        message.reference.messageId
                    )
                    .catch(
                        () => null
                    );

            if (
                reference &&
                reference.author &&
                reference.author.id !==
                message.author.id
            ) {

                const partner =
                    getStreakPartner(
                        streak,
                        message.author.id
                    );

                if (
                    reference.author.id ===
                    partner
                ) {

                    const replyColumn =
                        isUser1
                            ? 'user1_replies'
                            : 'user2_replies';

                    const currentReplies =
                        isUser1
                            ? streak.user1Replies
                            : streak.user2Replies;

                    if (
                        currentReplies <
                        DAILY_REPLIES
                    ) {

                        await db.query(
                            `
                            UPDATE streaks

                            SET ${replyColumn} =
                                LEAST(
                                    ${replyColumn} + 1,
                                    $2
                                ),

                                updated_at = NOW()

                            WHERE id = $1

                            AND status = 'active'
                            `,
                            [
                                streak.id,
                                DAILY_REPLIES,
                            ]
                        );
                    }
                }
            }
        }


        // ====================================================
        // CHECK
        // ====================================================

        const updated =
            await getStreakById(
                message.guild.id,
                streak.id
            );

        if (!updated) {
            continue;
        }

        if (
            updated.user1Messages >=
            DAILY_MESSAGES &&

            updated.user2Messages >=
            DAILY_MESSAGES &&

            updated.user1Replies >=
            DAILY_REPLIES &&

            updated.user2Replies >=
            DAILY_REPLIES
        ) {

            await completeStreak(
                client,
                updated
            );
        }
    }
}


// ============================================================
// MENTION
// ============================================================

function mention(
    id
) {
    return `<@${id}>`;
}