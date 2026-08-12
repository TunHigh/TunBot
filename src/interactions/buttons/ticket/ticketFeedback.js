import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Kém',
    '2': '⭐ 2 — Dưới trung bình',
    '3': '⭐ 3 — Trung bình',
    '4': '⭐ 4 — Tốt',
    '5': '⭐ 5 — Xuất sắc',
};

const feedbackHandler = {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        
        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Liên kết phản hồi không hợp lệ')
                        .setDescription('Liên kết phản hồi này có vẻ bị lỗi.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        try {
            await interaction.deferUpdate();
        } catch (err) {
            logger.warn('ticketFeedback: interaction expired before deferUpdate', { guildId, channelId, error: err.message });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Không tìm thấy Ticket')
                        .setDescription('Không thể tìm thấy ticket liên quan đến khảo sát này.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Không được phép')
                        .setDescription('Chỉ người tạo ticket mới có thể gửi phản hồi cho ticket này.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                    .setTitle('✅ Đã gửi phản hồi')
                    .setDescription(`Bạn đã đánh giá ticket này **${STAR_LABELS[String(ticketData.feedback.rating)]}**.\nCảm ơn phản hồi của bạn!`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(ratingStr, 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} sao`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err.message });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err.message });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Cảm ơn phản hồi của bạn!')
                    .setDescription(`Bạn đã đánh giá trải nghiệm hỗ trợ **${ratingLabel}**.\n\nPhản hồi của bạn đã được ghi nhận và giúp chúng tôi cải thiện dịch vụ!`)
                    .setColor(getColor('success'))
                    .setFooter({ text: 'Cảm ơn bạn đã sử dụng hệ thống hỗ trợ của chúng tôi.' })
                    .setTimestamp(),
            ],
            components: [],
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
};

const commentHandler = {
    name: 'ticket_feedback_comment',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Liên kết phản hồi không hợp lệ')
                        .setDescription('Hành động phản hồi này có vẻ bị lỗi.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
            .setTitle('Thêm phản hồi ticket');

        const commentInput = new TextInputBuilder()
            .setCustomId('feedback_comment')
            .setLabel('Phản hồi của bạn')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Chia sẻ điều bạn thấy tốt hoặc cách chúng tôi có thể cải thiện...')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

        await interaction.showModal(modal);
    },
};

const declineHandler = {
    name: 'ticket_feedback_decline',

    async execute(interaction) {
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👋 Không sao đâu!')
                    .setDescription('Bạn luôn có thể liên hệ lại nếu cần thêm hỗ trợ nhé.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
};

export default [feedbackHandler, commentHandler, declineHandler];