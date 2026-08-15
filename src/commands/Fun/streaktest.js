import {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
} from 'discord.js';

import {
    renderStreakCard,
} from './streakCanvas.js';

export default {
    data: new SlashCommandBuilder()
        .setName('streaktest')
        .setDescription('[Test Canvas] Xem trước và kiểm tra hình ảnh thẻ Streak Canvas')
        .addUserOption(option =>
            option
                .setName('partner')
                .setDescription('Chọn người dùng đồng hành để xem thử tên & avatar')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('days')
                .setDescription('Số ngày streak muốn thử nghiệm (mặc định: 6)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option
                .setName('user1_msg')
                .setDescription('Số tin nhắn của bạn (mặc định: 156)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option
                .setName('user2_msg')
                .setDescription('Số tin nhắn của đối phương (mặc định: 180)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option
                .setName('user1_reply')
                .setDescription('Số reply của bạn (mặc định: 2)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option
                .setName('user2_reply')
                .setDescription('Số reply của đối phương (mặc định: 2)')
                .setRequired(false)
                .setMinValue(0)
        ),

    category: 'Fun',

    async execute(interaction) {
        await interaction.deferReply();

        const partner = interaction.options.getUser('partner') || interaction.user;
        const days = interaction.options.getInteger('days') ?? 6;
        const user1Msg = interaction.options.getInteger('user1_msg') ?? 156;
        const user2Msg = interaction.options.getInteger('user2_msg') ?? 180;
        const user1Reply = interaction.options.getInteger('user1_reply') ?? 2;
        const user2Reply = interaction.options.getInteger('user2_reply') ?? 2;

        const user1Id = interaction.user.id;
        const user2Id = partner.id;

        const mockStreak = {
            id: 'test-999',
            guildId: interaction.guildId,
            user1Id,
            user2Id,
            streakDays: days,
            dayKey: '2026-08-15',
            user1Messages: user1Msg,
            user2Messages: user2Msg,
            user1Replies: user1Reply,
            user2Replies: user2Reply,
            lastCompletedDate: null,
            nextReward: 200,
        };

        try {
            const imageBuffer = await renderStreakCard(
                interaction.client,
                mockStreak,
                user1Id,
                user2Id
            );

            const attachment = new AttachmentBuilder(imageBuffer, { name: 'streak_test.png' });

            const embed = new EmbedBuilder()
                .setColor(0xe03875)
                .setTitle('🎨 Test Render Streak Canvas (Cập Nhật)')
                .setDescription(
                    `**Thông số xem trước:**\n` +
                    `👤 **Bạn (${interaction.user.username}):** ${user1Msg}/50 tin nhắn | ${user1Reply}/2 reply\n` +
                    `👤 **Partner (${partner.username}):** ${user2Msg}/50 tin nhắn | ${user2Reply}/2 reply\n` +
                    `🔥 **Số ngày Streak:** ${days} ngày`
                )
                .setImage('attachment://streak_test.png')
                .setFooter({ text: 'Dùng lệnh này để kiểm tra canvas chuẩn 100% theo mẫu mới.' });

            return interaction.editReply({
                embeds: [embed],
                files: [attachment],
            });
        } catch (error) {
            console.error('[STREAK TEST] Error rendering test canvas:', error);
            return interaction.editReply({
                content: `❌ Lỗi khi render canvas: \`${error.message}\``,
            });
        }
    },
};
