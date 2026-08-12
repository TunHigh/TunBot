import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Quản lý hệ thống cấp độ')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Thiết lập hệ thống cấp độ — đồng thời bật nó')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kênh gửi thông báo lên cấp')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('XP tối thiểu nhận được mỗi tin nhắn (mặc định: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('XP tối đa nhận được mỗi tin nhắn (mặc định: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Tin nhắn lên cấp. Dùng {user} và {level} làm chỗ trống (có sẵn mặc định)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Số giây giữa mỗi lần cộng XP cho một người dùng (mặc định: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Mở bảng điều khiển cấu hình cấp độ tương tác'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} đã lên cấp {level}!';
            const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `XP tối thiểu (**${xpMin}**) không thể lớn hơn XP tối đa (**${xpMax}**).` });
            }

            if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `Mình cần quyền **SendMessages** và **EmbedLinks** trong ${channel} để gửi thông báo lên cấp.`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId);

            if (existingConfig.configured) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Hệ thống cấp độ đã được thiết lập trên máy chủ này (thông báo lên cấp sẽ gửi đến <#${existingConfig.levelUpChannel}>).\n\nDùng \`/level dashboard\` để chỉnh sửa cài đặt.` });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpChannel: channel.id,
                xpRange: { min: xpMin, max: xpMax },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

            await saveLevelingConfig(client, interaction.guildId, newConfig);

            logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                channelId: channel.id,
                xpMin,
                xpMax,
                xpCooldown,
                userId: interaction.user.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Đã Thiết Lập Hệ Thống Cấp Độ',
                        description:
                            `Hệ thống cấp độ hiện đã **bật** và sẵn sàng hoạt động.\n\n` +
                            `**Kênh Lên Cấp:** ${channel}\n` +
                            `**XP mỗi Tin Nhắn:** ${xpMin} – ${xpMax}\n` +
                            `**Thời Gian Chờ XP:** ${xpCooldown}s\n` +
                            `**Tin Nhắn Lên Cấp:** \`${message}\`\n\n` +
                            `Dùng \`/level dashboard\` để chỉnh sửa các cài đặt này bất cứ lúc nào.`,
                        color: 'success',
                    }),
                ],
            });
        }
    },
};