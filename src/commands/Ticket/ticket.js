import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Quản lý hệ thống vé hỗ trợ của máy chủ.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Cài đặt bảng tạo vé hỗ trợ trong một kênh được chỉ định.",
                )
                .addChannelOption((option) =>
                    option
.setName("panel_channel")
                        .setDescription(
                            "Kênh nơi bảng vé hỗ trợ sẽ được gửi đến.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "Nội dung chính/mô tả cho bảng vé hỗ trợ.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "Nhãn cho nút tạo vé hỗ trợ (mặc định: Tạo Vé Hỗ Trợ)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "Danh mục nơi các vé hỗ trợ mới sẽ được tạo (tùy chọn).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "Danh mục nơi các vé hỗ trợ đã đóng sẽ được chuyển đến (tùy chọn).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "Vai trò có thể truy cập vé hỗ trợ (tùy chọn).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Số vé hỗ trợ tối đa một người dùng có thể tạo (mặc định: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Gửi tin nhắn riêng cho người dùng khi vé của họ bị đóng (mặc định: bật)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Mở bảng điều khiển hệ thống vé hỗ trợ"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bạn cần quyền `Manage Channels` cho hành động này.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Máy chủ này đã có sẵn hệ thống vé hỗ trợ (bảng tại <#${existingConfig.ticketPanelChannelId}>).\n\nMỗi máy chủ chỉ hỗ trợ một hệ thống vé. Dùng \`/ticket dashboard\` để chỉnh sửa hoặc cập nhật hệ thống hiện tại, hoặc chọn **Xóa Hệ Thống** từ bảng điều khiển để xóa nó và bắt đầu lại từ đầu.` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
const panelMessage = interaction.options.getString("panel_message") || "Nhấn vào nút bên dưới để tạo vé hỗ trợ.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
"Tạo Vé Hỗ Trợ";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "Vé Hỗ Trợ", 
description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
.setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `Bảng tạo vé hỗ trợ đã được gửi đến ${panelChannel}.`;
                
                if (categoryChannel) {
                    successMessage += `Vé hỗ trợ mới sẽ được tạo trong danh mục **${categoryChannel.name}**.`;
                } else {
                    successMessage += 'Vé hỗ trợ mới sẽ được tạo trong danh mục "Vé Hỗ Trợ" mới.';
                }
                
                if (closedCategoryChannel) {
                    successMessage += `Vé hỗ trợ đã đóng sẽ được chuyển đến **${closedCategoryChannel.name}**.`;
                }
                
                if (staffRole) {
                    successMessage += `Vai trò **${staffRole.name}** sẽ có quyền truy cập vé hỗ trợ.`;
                }
                
                successMessage += `\n\n**Số Vé Tối Đa Mỗi Người:** ${maxTicketsPerUser}\n**DM Khi Đóng:** ${dmOnClose ? 'Bật' : 'Tắt'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Đã Cài Đặt Bảng Vé",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Cài Đặt Hệ Thống Vé Hỗ Trợ (Nhật Ký Cấu Hình)",
                    description: `Bảng vé hỗ trợ đã được cài đặt trong ${panelChannel} bởi ${interaction.user}.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Kênh Bảng Vé",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Danh Mục Vé",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "Chưa chỉ định.",
                            inline: true,
                        },
                        {
                            name: "Danh Mục Vé Đã Đóng",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "Chưa chỉ định.",
                            inline: true,
                        },
                        {
                            name: "Vai Trò Nhân Viên",
                            value: staffRole
                                ? staffRole.toString()
                                : "Chưa chỉ định.",
                            inline: true,
                        },
                        {
                            name: "Số Vé Tối Đa Mỗi Người",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM Khi Đóng",
                            value: dmOnClose ? 'Bật' : 'Tắt',
                            inline: true,
                        },
                        {
                            name: "Điều Hành Viên",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không thể gửi bảng vé hỗ trợ hoặc lưu cấu hình. Hãy kiểm tra quyền của bot (đặc biệt là quyền gửi tin nhắn trong kênh đích) và kết nối cơ sở dữ liệu.' }).catch(err => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};