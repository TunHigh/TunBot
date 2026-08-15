import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
    getStreakChannel,
    setStreakChannel,
} from './streakManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('caidatchuoi')
        .setDescription('Cài đặt kênh ghi nhận tin nhắn chuỗi giữ lửa')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Chọn kênh ghi nhận tin nhắn chuỗi')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kênh văn bản để ghi nhận tin nhắn chuỗi')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName('status').setDescription('Xem kênh đang ghi nhận tin nhắn chuỗi'),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName('disable').setDescription('Bỏ giới hạn kênh (ghi nhận ở mọi kênh)'),
        ),
    category: 'Fun',

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.',
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');

            if (!channel?.isTextBased?.() || channel.type !== ChannelType.GuildText) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Vui lòng chọn một kênh văn bản hợp lệ.',
                });
            }

            await setStreakChannel(interaction.client, interaction.guildId, channel.id);

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        'Đã Cài Đặt Kênh Chuỗi',
                        [
                            `📍 Kênh ghi nhận tin nhắn chuỗi giữ lửa: **${channel}**`,
                            'Từ giờ, chỉ tin nhắn trong kênh này được tính cho streak.',
                        ].join('\n'),
                    ),
                ],
            });
        }

        if (subcommand === 'disable') {
            await setStreakChannel(interaction.client, interaction.guildId, null);

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        'Đã Bỏ Giới Hạn Kênh',
                        'Tin nhắn streak sẽ được ghi nhận ở **mọi kênh** (mainchat) như trước.',
                    ),
                ],
            });
        }

        const channelId = await getStreakChannel(interaction.client, interaction.guildId);

        if (!channelId) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    infoEmbed(
                        'Cấu Hình Kênh Chuỗi',
                        'Chưa đặt kênh riêng. Tin nhắn streak hiện được ghi nhận ở **mọi kênh** (mainchat).\nDùng `/caidatchuoi setup` để chọn một kênh cụ thể.',
                    ),
                ],
            });
        }

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'Cấu Hình Kênh Chuỗi',
                    `📍 Kênh ghi nhận tin nhắn chuỗi hiện tại: **<#${channelId}>**`,
                ),
            ],
        });
    },
};
