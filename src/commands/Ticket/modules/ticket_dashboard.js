import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getGuildTicketStats } from '../../../utils/database/tickets.js';
import { getUserTicketCount } from '../../../services/ticket.js';
import {
    getTicketPanelStatus,
    messageHasButtonCustomId,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildButtonRow(guildConfig, guildId, disabled = false, panelStatus = null) {
    const dmEnabled = guildConfig.dmOnClose !== false;
    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ticket_cfg_repost_${guildId}`)
                .setLabel('Đăng Lại Bảng Vé')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_dm_toggle_${guildId}`)
            .setLabel('DM Khi Đóng')
            .setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(dmEnabled ? '📬' : '📭')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_staff_role_btn_${guildId}`)
            .setLabel('Vai Trò Nhân Viên')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_delete_${guildId}`)
            .setLabel('Xóa Hệ Thống')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function persistPanelMessageId(client, guildId, guildConfig, messageId) {
    if (!messageId || guildConfig.ticketPanelMessageId === messageId) return;
    guildConfig.ticketPanelMessageId = messageId;
    if (client.db) {
        await setGuildConfig(client, guildId, guildConfig);
    }
}

function buildPanelEmbed(config) {
    return new EmbedBuilder()
        .setTitle('Vé Hỗ Trợ')
        .setDescription(config.ticketPanelMessage || 'Nhấn vào nút bên dưới để tạo vé hỗ trợ.')
        .setColor(getColor('info'));
}

function buildPanelButtonRow(config) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(config.ticketButtonLabel || 'Tạo Vé Hỗ Trợ')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );
}

async function repostTicketPanel(client, guild, guildConfig, guildId) {
    const channel = await guild.channels.fetch(guildConfig.ticketPanelChannelId).catch(() => null);
    if (!channel) {
        throw new TitanBotError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'Kênh bảng vé hỗ trợ đã cấu hình không còn tồn tại. Hãy đặt kênh bảng vé mới từ bảng điều khiển.',
        );
    }

    const sentPanel = await channel.send({
        embeds: [buildPanelEmbed(guildConfig)],
        components: [buildPanelButtonRow(guildConfig)],
    });

    await persistPanelMessageId(client, guildId, guildConfig, sentPanel.id);
    return sentPanel;
}

function formatCloseDuration(ms) {
    if (ms == null) return '`N/A`';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${minutes} phút`;
}

function buildDashboardEmbed(config, guild, panelStatus = null, ticketStats = null) {
    const panelChannel = config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : '`Chưa đặt`';
    const staffRole = config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : '`Chưa đặt`';
    const ticketLogsChannel = config.ticketLogsChannelId ? `<#${config.ticketLogsChannelId}>` : '`Chưa đặt`';
    const transcriptChannel = config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : '`Chưa đặt`';

    const openCategoryChannel = config.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;
    const openCategory = openCategoryChannel ? openCategoryChannel.toString() : '`Chưa đặt`';
    
    const closedCategoryChannel = config.ticketClosedCategoryId ? guild.channels.cache.get(config.ticketClosedCategoryId) : null;
    const closedCategory = closedCategoryChannel ? closedCategoryChannel.toString() : '`Chưa đặt`';

    const rawMsg = config.ticketPanelMessage || 'Nhấn vào nút bên dưới để tạo vé hỗ trợ.';
    const panelMsg = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const btnLabel = `\`${config.ticketButtonLabel || 'Tạo Vé Hỗ Trợ'}\``;

    let panelStatusValue = formatPanelStatusField(panelStatus);

    const openTickets = ticketStats ? String(ticketStats.openCount) : '`—`';
    const avgCloseTime = ticketStats ? formatCloseDuration(ticketStats.avgCloseTimeMs) : '`—`';
    const feedbackSummary = ticketStats?.feedbackCount
        ? `${ticketStats.avgRating}/5 (${ticketStats.feedbackCount} đánh giá)`
        : '`Chưa có đánh giá nào`';

    return new EmbedBuilder()
        .setTitle('🎫 Bảng Điều Khiển Hệ Thống Vé')
        .setDescription(`Quản lý cài đặt hệ thống vé hỗ trợ cho **${guild.name}**.\nChọn một tùy chọn bên dưới để thay đổi cài đặt.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Trạng Thái Bảng Vé', value: panelStatusValue, inline: false },
            { name: 'Kênh Bảng Vé', value: panelChannel, inline: true },
            { name: 'Vai Trò Nhân Viên', value: staffRole, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Danh Mục Vé Mở', value: openCategory, inline: true },
            { name: 'Danh Mục Vé Đã Đóng', value: closedCategory, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Nội Dung Bảng Vé', value: panelMsg, inline: false },
            { name: 'Nhãn Nút', value: btnLabel, inline: true },
            { name: 'Số Vé Tối Đa/Người', value: String(config.maxTicketsPerUser || 3), inline: true },
            { name: 'DM Khi Đóng', value: config.dmOnClose !== false ? 'Bật' : 'Tắt', inline: true },
            { name: 'Kênh Nhật Ký Vé', value: ticketLogsChannel, inline: true },
            { name: 'Kênh Biên Bản', value: transcriptChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Vé Đang Mở', value: openTickets, inline: true },
            { name: 'Thời Gian Đóng TB', value: avgCloseTime, inline: true },
            { name: 'Đánh Giá Phản Hồi', value: feedbackSummary, inline: true },
        )
        .setFooter({ text: 'Chọn tùy chọn bên dưới • Bảng điều khiển tự đóng sau 10 phút không hoạt động' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`ticket_config_${guildId}`)
        .setPlaceholder('Chọn một cài đặt để cấu hình...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Sửa Nội Dung Bảng Vé')
                .setDescription('Thay đổi nội dung hiển thị trên bảng tạo vé hỗ trợ')
                .setValue('panel_message')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Sửa Nhãn Nút')
                .setDescription('Thay đổi nhãn trên nút tạo vé hỗ trợ')
                .setValue('button_label')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Đổi Danh Mục Vé Mở')
                .setDescription('Danh mục nơi tạo vé hỗ trợ mới')
                .setValue('open_category')
                .setEmoji('📁'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Đổi Danh Mục Vé Đã Đóng')
                .setDescription('Danh mục nơi chuyển vé hỗ trợ đã đóng')
                .setValue('closed_category')
                .setEmoji('📂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Đặt Số Vé Tối Đa Mỗi Người')
                .setDescription('Giới hạn số vé mở tối đa mỗi người có thể sở hữu cùng lúc')
                .setValue('max_tickets')
                .setEmoji('🔢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Đặt Kênh Nhật Ký Vé')
                .setDescription('Kênh nhận phản hồi, sự kiện và nhật ký vé hỗ trợ')
                .setValue('logs_channel')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Đặt Kênh Biên Bản')
                .setDescription('Kênh nhận biên bản tự động khi vé bị xóa')
                .setValue('transcript_channel')
                .setEmoji('📜'),
        );
}

async function refreshDashboard(rootInteraction, guildConfig, guildId, client) {
    const panelStatus = client
        ? await getTicketPanelStatus(client, rootInteraction.guild, guildConfig)
        : null;
    const ticketStats = client ? await getGuildTicketStats(guildId) : null;

    if (panelStatus?.recoveredId) {
        await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
    }

    const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);
    const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(guildConfig, rootInteraction.guild, panelStatus, ticketStats)],
        components: [buttonRow, selectRow],
    }).catch(() => {});
}

async function updateLivePanel(client, guild, config, guildId) {
    if (!config.ticketPanelChannelId) return false;
    try {
        const panelStatus = await getTicketPanelStatus(client, guild, config);
        if (panelStatus.recoveredId) {
            await persistPanelMessageId(client, guildId, config, panelStatus.recoveredId);
        }
        if (!panelStatus.exists || !panelStatus.message) return false;

        await panelStatus.message.edit({
            embeds: [buildPanelEmbed(config)],
            components: [buildPanelButtonRow(config)],
        });
        return true;
    } catch (error) {
        logger.warn('Failed to update live ticket panel:', error.message);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.ticketPanelChannelId) {
                throw new TitanBotError(
                    'Ticket system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Hệ thống vé hỗ trợ chưa được cài đặt. Hãy chạy `/ticket setup` trước để cấu hình.',
                );
            }

            const panelStatus = await getTicketPanelStatus(client, interaction.guild, guildConfig);
            if (panelStatus.recoveredId) {
                await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
            }

            const ticketStats = await getGuildTicketStats(guildId);

            const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
            const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, panelStatus, ticketStats)],
                components: [buttonRow, selectRow],
                selectMenuId: `ticket_config_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `ticket_cfg_repost_${guildId}` ||
                    customId === `ticket_cfg_dm_toggle_${guildId}` ||
                    customId === `ticket_cfg_staff_role_btn_${guildId}` ||
                    customId === `ticket_cfg_delete_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'panel_message':
                            await handlePanelMessage(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'button_label':
                            await handleButtonLabel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'staff_role':
                            await handleStaffRole(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'open_category':
                            await handleOpenCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'closed_category':
                            await handleClosedCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'max_tickets':
                            await handleMaxTickets(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'logs_channel':
                            await handleLogsChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'transcript_channel':
                            await handleTranscriptChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `ticket_cfg_repost_${guildId}`) {
                        await handleRepostPanel(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_dm_toggle_${guildId}`) {
                        await handleDmOnClose(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_staff_role_btn_${guildId}`) {
                        await handleStaffRole(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_delete_${guildId}`) {
                        await handleDeleteSystem(btnInteraction, interaction, guildConfig, guildId, client);
                    }
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in ticket_config:', error);
            throw new TitanBotError(
                `Ticket config failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Không thể mở bảng điều khiển cấu hình vé hỗ trợ.',
            );
        }
    },
};

async function handlePanelMessage(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_panel_msg')
        .setTitle('📝 Sửa Nội Dung Bảng Vé')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_msg_input')
                    .setLabel('Nội Dung Bảng Vé')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        guildConfig.ticketPanelMessage ||
                            'Nhấn vào nút bên dưới để tạo vé hỗ trợ.',
                    )
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Nhấn vào nút bên dưới để tạo vé hỗ trợ.'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_panel_msg' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('panel_msg_input').trim();
    guildConfig.ticketPanelMessage = newMessage;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Đã Cập Nhật Nội Dung Bảng Vé',
                `Nội dung bảng vé đã được cập nhật.${
                    panelUpdated
                        ? '\nBảng vé hỗ trợ đang hiển thị cũng đã được làm mới.'
                        : '\n> **Lưu ý:** Không tìm thấy bảng vé đang hiển thị. Dùng **Đăng Lại Bảng Vé** trên bảng điều khiển để khôi phục.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleButtonLabel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_btn_label')
        .setTitle('🏷️ Sửa Nhãn Nút')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('btn_label_input')
                    .setLabel('Nhãn Nút (tối đa 80 ký tự)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(guildConfig.ticketButtonLabel || 'Tạo Vé Hỗ Trợ')
                    .setMaxLength(80)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Tạo Vé Hỗ Trợ'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_btn_label' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newLabel = submitted.fields.getTextInputValue('btn_label_input').trim();
    guildConfig.ticketButtonLabel = newLabel;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Đã Cập Nhật Nhãn Nút',
                `Nhãn nút đã được đổi thành \`${newLabel}\`.${
                    panelUpdated
                        ? '\nNút trên bảng vé hỗ trợ đang hiển thị cũng đã được cập nhật.'
                        : '\n> **Lưu ý:** Không tìm thấy bảng vé đang hiển thị. Dùng **Đăng Lại Bảng Vé** trên bảng điều khiển để khôi phục.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleStaffRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ticket_cfg_staff_role')
        .setPlaceholder('Chọn vai trò nhân viên...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(roleSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🛡️ Đổi Vai Trò Nhân Viên')
                .setDescription(
                    `**Hiện tại:** ${guildConfig.ticketStaffRoleId ? `<@&${guildConfig.ticketStaffRoleId}>` : '`Chưa đặt`'}\n\nChọn vai trò được cấp quyền nhân viên để quản lý vé hỗ trợ.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_staff_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        guildConfig.ticketStaffRoleId = role.id;
        await setGuildConfig(client, guildId, guildConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Đã Cập Nhật Vai Trò Nhân Viên', `Vai trò nhân viên đã được đặt thành ${role}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có vai trò nào được chọn. Vai trò nhân viên không thay đổi.',
            }).catch(() => {});
        }
    });
}

async function handleOpenCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_open_cat')
        .setPlaceholder('Chọn một danh mục...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📁 Đổi Danh Mục Vé Mở')
                .setDescription(
                    `**Hiện tại:** ${guildConfig.ticketCategoryId ? `<#${guildConfig.ticketCategoryId}>` : '`Chưa đặt`'}\n\nChọn danh mục nơi các vé hỗ trợ mới sẽ được tạo.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_open_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first();

        guildConfig.ticketCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    'Đã Cập Nhật Danh Mục Vé Mở',
                    `Các vé hỗ trợ mới giờ sẽ được tạo trong **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có danh mục nào được chọn. Cài đặt không thay đổi.',
            }).catch(() => {});
        }
    });
}

async function handleClosedCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_closed_cat')
        .setPlaceholder('Chọn một danh mục...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📂 Đổi Danh Mục Vé Đã Đóng')
                .setDescription(
                    `**Hiện tại:** ${guildConfig.ticketClosedCategoryId ? `<#${guildConfig.ticketClosedCategoryId}>` : '`Chưa đặt`'}\n\nChọn danh mục nơi các vé hỗ trợ đã đóng sẽ được chuyển đến.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_closed_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first();

        guildConfig.ticketClosedCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    'Đã Cập Nhật Danh Mục Vé Đã Đóng',
                    `Các vé hỗ trợ đã đóng giờ sẽ được chuyển đến **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có danh mục nào được chọn. Cài đặt không thay đổi.',
            }).catch(() => {});
        }
    });
}

async function handleMaxTickets(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets')
        .setTitle('Đặt Số Vé Tối Đa Mỗi Người')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('Số Vé Mở Tối Đa (1–10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('max_tickets_input').trim();
    const newMax = parseInt(raw, 10);

    if (Number.isNaN(newMax) || newMax < 1 || newMax > 10) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Số vé tối đa phải là một số nguyên trong khoảng **1** đến **10**.',
        });
        return;
    }

    guildConfig.maxTicketsPerUser = newMax;
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                'Đã Cập Nhật Số Vé Tối Đa',
                `Người dùng giờ có thể mở tối đa **${newMax}** vé cùng lúc.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDmOnClose(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferUpdate();

    const newState = guildConfig.dmOnClose === false;
    guildConfig.dmOnClose = newState;
    await setGuildConfig(client, guildId, guildConfig);

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'Đã Cập Nhật DM Khi Đóng',
                `Người dùng sẽ **${newState ? 'giờ' : 'không còn'}** nhận được tin nhắn riêng khi vé của họ bị đóng.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleLogsChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_logs_channel')
        .setPlaceholder('Chọn một kênh...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎫 Chọn Kênh Nhật Ký Vé')
                .setDescription('Chọn nơi nhận phản hồi vé, các sự kiện (mở, đóng, nhận xử lý...) và nhật ký khác.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_logs_channel',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async channelInteraction => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first();

        guildConfig.ticketLogsChannelId = channel.id;
        await setGuildConfig(client, guildId, guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('Đã Cập Nhật Kênh Nhật Ký', `Nhật ký vé hỗ trợ sẽ được gửi đến ${channel}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có kênh nào được chọn. Không có thay đổi nào.',
            }).catch(() => {});
        }
    });
}

async function handleTranscriptChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_transcript_channel')
        .setPlaceholder('Chọn một kênh...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📜 Chọn Kênh Biên Bản')
                .setDescription('Chọn nơi nhận biên bản tự động khi vé hỗ trợ bị xóa.')
                .setColor(getColor('info'))
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_transcript_channel',
        time: 60_000,
        max: 1
    });

    collector.on('collect', async channelInteraction => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first();

        guildConfig.ticketTranscriptChannelId = channel.id;
        await setGuildConfig(client, guildId, guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('Đã Cập Nhật Kênh Biên Bản', `Biên bản sẽ được gửi đến ${channel}`)],
            flags: MessageFlags.Ephemeral
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có kênh nào được chọn. Không có thay đổi nào.',
            }).catch(() => {});
        }
    });
}

async function handleCheckUser(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('ticket_cfg_check_user')
        .setPlaceholder('Chọn một người dùng để kiểm tra...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Kiểm Tra Vé Của Người Dùng')
                .setDescription('Chọn một người dùng để xem số vé đang mở của họ.')
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const userCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.UserSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_check_user',
        time: 60_000,
        max: 1,
    });

    userCollector.on('collect', async userInteraction => {
        await userInteraction.deferUpdate();
        const targetUser = userInteraction.users.first();
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        const openCount = await getUserTicketCount(guildId, targetUser.id);
        const atLimit = openCount >= maxTickets;

        await userInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`Kiểm Tra Vé — ${targetUser.username}`)
                    .setDescription(
                        `**Vé Đang Mở:** ${openCount} / ${maxTickets}\n` +
                            `**Còn Lại:** ${Math.max(0, maxTickets - openCount)}\n\n` +
                            (atLimit
                                ? '⚠️ Người dùng này đã đạt giới hạn vé.'
                                : '✅ Người dùng này vẫn có thể tạo thêm vé.'),
                    )
                    .setColor(atLimit ? getColor('error') : getColor('success'))
                    .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
                    .setTimestamp(),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });

    userCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Không có người dùng nào được chọn.',
            }).catch(() => {});
        }
    });
}

async function handleRepostPanel(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferUpdate();

    const panelStatus = await getTicketPanelStatus(client, rootInteraction.guild, guildConfig);
    if (panelStatus.exists) {
        await btnInteraction.followUp({
            embeds: [infoEmbed('Bảng Vé Đã Có Sẵn', 'Bảng vé hỗ trợ đã được đăng trong kênh đã cấu hình.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const sentPanel = await repostTicketPanel(client, rootInteraction.guild, guildConfig, guildId);

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'Đã Đăng Lại Bảng Vé',
                `Một bảng vé hỗ trợ mới đã được đăng trong <#${guildConfig.ticketPanelChannelId}>.${
                    sentPanel.url ? `\n[Mở tin nhắn bảng vé](${sentPanel.url})` : ''
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDeleteSystem(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    const deleteModal = new ModalBuilder()
        .setCustomId('ticket_delete_confirm_modal')
        .setTitle('Xóa Hệ Thống Vé Hỗ Trợ')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('delete_confirmation')
                    .setLabel('Nhập "DELETE" để xác nhận')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('DELETE')
                    .setMaxLength(6)
                    .setMinLength(6)
                    .setRequired(true)
            )
        );

    await btnInteraction.showModal(deleteModal);

    const submitted = await btnInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'ticket_delete_confirm_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const confirmation = submitted.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Bạn phải nhập chính xác "DELETE" để xác nhận xóa.' });
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    await submitted.deferUpdate();

    const keysToDelete = [
        'ticketPanelChannelId',
        'ticketPanelMessageId',
        'ticketStaffRoleId',
        'ticketCategoryId',
        'ticketClosedCategoryId',
        'ticketPanelMessage',
        'ticketButtonLabel',
        'maxTicketsPerUser',
        'dmOnClose',
    ];

    if (guildConfig.ticketPanelChannelId) {
        try {
            const panelChannel = await client.guilds.cache.get(guildId)?.channels.fetch(guildConfig.ticketPanelChannelId).catch(() => null);
            if (panelChannel) {
                if (guildConfig.ticketPanelMessageId) {
                    const panelMessage = await panelChannel.messages.fetch(guildConfig.ticketPanelMessageId).catch(() => null);
                    if (panelMessage) await panelMessage.delete().catch(() => {});
                } else {
                    
                    const messages = await panelChannel.messages.fetch({ limit: 50 }).catch(() => null);
                    if (messages) {
                        const found = messages.find(
                            m => m.author.id === client.user.id && messageHasButtonCustomId(m, 'create_ticket'),
                        );
                        if (found) await found.delete().catch(() => {});
                    }
                }
            }
        } catch (panelDeleteError) {
            logger.warn('Could not delete ticket panel message:', panelDeleteError.message);
        }
    }

    try {
        const { pgConfig } = await import('../../../config/database/postgres.js');
        if (client.db?.db?.pool && typeof client.db.db.isAvailable === 'function' && client.db.db.isAvailable()) {
            await client.db.db.pool.query(
                `DELETE FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
                [guildId]
            );
        }
    } catch (ticketDeleteError) {
        logger.warn('Could not clear ticket records from database:', ticketDeleteError.message);
    }

    for (const key of keysToDelete) {
        delete guildConfig[key];
    }
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.followUp({
        embeds: [
            successEmbed(
                '✅ Đã Xóa Hệ Thống Vé',
                'Toàn bộ cấu hình hệ thống vé hỗ trợ đã được xóa. Chạy `/ticket setup` để cài đặt lại.',
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('Đã Xóa Hệ Thống Vé Hỗ Trợ')
                .setDescription('Cấu hình hệ thống vé hỗ trợ đã được xóa.')
                .setColor(getColor('error'))
                .setTimestamp(),
        ],
        components: [],
    }).catch(() => {});
}