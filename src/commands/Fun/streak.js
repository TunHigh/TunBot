import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
} from 'discord.js';

import {
    initStreak,
    createInvite,
    acceptInvite,
    declineInvite,
    getUserStreaks,
    deleteStreak,
    getStreakById,
    getStreakPartner,
    startMessageTracker,
} from './streakManager.js';

import {
    renderStreakCard,
} from './streakCanvas.js';


// ============================================================
// BUTTON ROW
// ============================================================

function createNavigationRow(
    ownerId,
    streakId,
    page,
    total
) {
    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId(
                `streak:first:${ownerId}:${streakId}`
            )
            .setLabel('|<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),

        new ButtonBuilder()
            .setCustomId(
                `streak:prev:${ownerId}:${streakId}`
            )
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),

        new ButtonBuilder()
            .setCustomId(
                `streak:page:${ownerId}:${streakId}`
            )
            .setLabel(`${page + 1}/${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(
                `streak:next:${ownerId}:${streakId}`
            )
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= total - 1),

        new ButtonBuilder()
            .setCustomId(
                `streak:last:${ownerId}:${streakId}`
            )
            .setLabel('>|')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= total - 1),

        new ButtonBuilder()
            .setCustomId(
                `streak:delete:${ownerId}:${streakId}`
            )
            .setLabel('🗑️ Xóa')
            .setStyle(ButtonStyle.Danger)
    );
}


// ============================================================
// RENDER STREAK
// ============================================================

async function renderStreak(
    interaction,
    streaks,
    page = 0
) {
    if (!streaks.length) {
        const payload = {
            content: '💔 Bạn hiện không có streak nào.',
            embeds: [],
            files: [],
            components: [],
        };
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(payload);
        } else {
            return interaction.update(payload);
        }
    }

    page = Math.max(
        0,
        Math.min(
            page,
            streaks.length - 1
        )
    );

    const streak = streaks[page];

    const partnerId =
        getStreakPartner(
            streak,
            interaction.user.id
        );

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    const imageBuffer =
        await renderStreakCard(
            interaction.client,
            streak,
            interaction.user.id,
            partnerId
        );

    const attachment =
        new AttachmentBuilder(
            imageBuffer,
            {
                name: 'streak.png',
            }
        );

    const reward =
        streak.nextReward ?? 100;

    const embed =
        new EmbedBuilder()
            .setColor(0x24b8ec)
            .setDescription(
                `🔥 ${interaction.user} × <@${partnerId}>\n\n` +
                `🔥 **${streak.streakDays} ngày**\n` +
                `🏆 Ngày tiếp theo → **+${reward.toLocaleString('vi-VN')} xu/người**`
            );

    return interaction.editReply({
        content: '',
        embeds: [embed],
        files: [attachment],
        components: [
            createNavigationRow(
                interaction.user.id,
                streak.id,
                page,
                streaks.length
            ),
        ],
    });
}


// ============================================================
// COMMAND
// ============================================================

export default {

    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription(
            'Quản lý chuỗi giữ lửa'
        )
        .addUserOption(
            option =>
                option
                    .setName('user')
                    .setDescription(
                        'Mời người dùng giữ chuỗi với bạn'
                    )
                    .setRequired(false)
        ),
    category: 'Fun',

    async execute(interaction) {

        // Khởi tạo database
        await initStreak(
            interaction.client
        );

        // Khởi động message tracker
        startMessageTracker(
            interaction.client
        );


        const target =
            interaction.options.getUser(
                'user'
            );


        // ====================================================
        // /streak @user
        // ====================================================

        if (target) {

            if (
                target.id ===
                interaction.user.id
            ) {
                return interaction.reply({
                    content:
                        '❌ Bạn không thể giữ chuỗi với chính mình.',
                    ephemeral: true,
                });
            }

            if (target.bot) {
                return interaction.reply({
                    content:
                        '❌ Bạn không thể giữ chuỗi với bot.',
                    ephemeral: true,
                });
            }


            const result =
                await createInvite(
                    interaction.guildId,
                    interaction.user.id,
                    target.id
                );


            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }


            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `streak:accept:${result.inviteId}:${target.id}`
                            )
                            .setLabel(
                                '💖 Chấp nhận'
                            )
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `streak:decline:${result.inviteId}:${target.id}`
                            )
                            .setLabel(
                                '❌ Từ chối'
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );


            const embed =
                new EmbedBuilder()
                    .setColor(
                        0xff4d91
                    )
                    .setTitle(
                        '🔥 Lời mời giữ lửa'
                    )
                    .setDescription(
                        `${target}, ${interaction.user} đã gửi cho bạn lời mời giữ chuỗi!\n\n` +

                        `💬 Hai người cần chat đủ ` +
                        `**50 tin nhắn/người/ngày**.\n\n` +

                        `↩️ Mỗi người cần ít nhất ` +
                        `**1 reply/ngày**.\n\n` +

                        `⏰ Lời mời có hiệu lực trong **30 phút**.`
                    );


            return interaction.reply({
                content: `${target}`,
                embeds: [embed],
                components: [row],
            });
        }


        // ====================================================
        // /streak
        // ====================================================

        await interaction.deferReply();


        const streaks =
            await getUserStreaks(
                interaction.guildId,
                interaction.user.id
            );


        if (!streaks.length) {
            return interaction.editReply({
                content:
                    '💔 Bạn chưa có streak nào.\n\n' +
                    'Dùng `/streak @user` để mời người khác.',
                embeds: [],
                files: [],
                components: [],
            });
        }


        return renderStreak(
            interaction,
            streaks,
            0
        );
    },
};


// ============================================================
// BUTTON HANDLER
// ============================================================

export async function handleStreakButton(
    interaction
) {
    const id =
        interaction.customId;


    if (
        !id.startsWith(
            'streak:'
        )
    ) {
        return false;
    }


    const parts =
        id.split(':');

    const action =
        parts[1];


    // ========================================================
    // ACCEPT
    // ========================================================

    if (
        action === 'accept'
    ) {

        const inviteId =
            parts[2];

        const targetId =
            parts[3];


        if (
            interaction.user.id !==
            targetId
        ) {
            await interaction.reply({
                content:
                    '❌ Chỉ người được mời mới có thể chấp nhận.',
                ephemeral: true,
            });

            return true;
        }


        const result =
            await acceptInvite(
                interaction.guildId,
                interaction.user.id,
                inviteId
            );


        if (!result.success) {
            return interaction.update({
                content:
                    `❌ ${result.message}`,
                embeds: [],
                components: [],
            });
        }


        await interaction.update({
            content:
                `🔥 ${interaction.user} và ` +
                `<@${result.partnerId}> ` +
                `đã bắt đầu giữ lửa!`,
            embeds: [],
            components: [],
        });


        return true;
    }


    // ========================================================
    // DECLINE
    // ========================================================

    if (
        action === 'decline'
    ) {

        const inviteId =
            parts[2];

        const targetId =
            parts[3];


        if (
            interaction.user.id !==
            targetId
        ) {
            await interaction.reply({
                content:
                    '❌ Bạn không thể xử lý lời mời này.',
                ephemeral: true,
            });

            return true;
        }


        const result =
            await declineInvite(
                inviteId,
                interaction.user.id
            );


        return interaction.update({
            content:
                result.success
                    ? '❌ Bạn đã từ chối lời mời giữ lửa.'
                    : `❌ ${result.message}`,
            embeds: [],
            components: [],
        });
    }


    // ========================================================
    // NAVIGATION
    // ========================================================

    const ownerId =
        parts[2];

    const streakId =
        parts[3];


    if (
        interaction.user.id !==
        ownerId
    ) {
        await interaction.reply({
            content:
                '❌ Bạn không có quyền điều khiển card này.',
            ephemeral: true,
        });

        return true;
    }


    let streaks =
        await getUserStreaks(
            interaction.guildId,
            ownerId
        );


    let page =
        streaks.findIndex(
            s =>
                String(s.id) ===
                String(streakId)
        );


    if (page < 0) {
        page = 0;
    }


    // ========================================================
    // FIRST
    // ========================================================

    if (
        action === 'first'
    ) {
        page = 0;
    }


    // ========================================================
    // PREVIOUS
    // ========================================================

    if (
        action === 'prev'
    ) {
        page =
            Math.max(
                0,
                page - 1
            );
    }


    // ========================================================
    // NEXT
    // ========================================================

    if (
        action === 'next'
    ) {
        page =
            Math.min(
                streaks.length - 1,
                page + 1
            );
    }


    // ========================================================
    // LAST
    // ========================================================

    if (
        action === 'last'
    ) {
        page =
            streaks.length - 1;
    }


    // ========================================================
    // DELETE
    // ========================================================

    if (
        action === 'delete'
    ) {

        const streak =
            streaks[page];


        if (!streak) {
            return interaction.reply({
                content:
                    '❌ Không tìm thấy streak.',
                ephemeral: true,
            });
        }


        const partnerId =
            getStreakPartner(
                streak,
                ownerId
            );


        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `streak:confirmdelete:${ownerId}:${streak.id}`
                        )
                        .setLabel(
                            '🗑️ Xóa streak'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `streak:canceldelete:${ownerId}:${streak.id}`
                        )
                        .setLabel(
                            'Hủy'
                        )
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );


        return interaction.update({
            content:
                `⚠️ **Bạn có chắc muốn xóa streak với <@${partnerId}>?**\n\n` +
                `🔥 Streak hiện tại: **${streak.streakDays} ngày**\n\n` +
                `Sau khi xóa, chuỗi này sẽ kết thúc.`,
            embeds: [],
            files: [],
            components: [row],
        });
    }


    // ========================================================
    // CONFIRM DELETE
    // ========================================================

    if (
        action ===
        'confirmdelete'
    ) {

        const result =
            await deleteStreak(
                interaction.guildId,
                ownerId,
                streakId
            );


        return interaction.update({
            content:
                result.success
                    ? '🗑️ Đã xóa streak thành công.'
                    : `❌ ${result.message}`,
            embeds: [],
            files: [],
            components: [],
        });
    }


    // ========================================================
    // CANCEL DELETE
    // ========================================================

    if (
        action ===
        'canceldelete'
    ) {

        streaks =
            await getUserStreaks(
                interaction.guildId,
                ownerId
            );


        if (!streaks.length) {
            return interaction.update({
                content:
                    '💔 Bạn không còn streak nào.',
                embeds: [],
                files: [],
                components: [],
            });
        }


        page =
            streaks.findIndex(
                s =>
                    String(s.id) ===
                    String(streakId)
            );


        if (page < 0) {
            page = 0;
        }
    }


    // ========================================================
    // PAGE
    // ========================================================

    await renderStreak(
        interaction,
        streaks,
        page
    );


    return true;
}