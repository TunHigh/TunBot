import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. Nhấp chuột phải vào tên máy chủ này (điện thoại: chạm vào tên máy chủ ở phía trên).',
    '2. Mở **Cài đặt quyền riêng tư**.',
    '3. Bật **Cho phép nhận tin nhắn trực tiếp từ thành viên máy chủ**.',
    '4. Nhấp **Bắt đầu trình hướng dẫn cài đặt** lần nữa.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Đã Bắt Đầu Trình Hướng Dẫn Cài Đặt',
            'Hãy kiểm tra tin nhắn riêng (DM) của bạn — mình đã gửi câu hỏi cài đặt đầu tiên vào đó.\n\nTrả lời từng câu hỏi trong DM nhé. Gõ `skip` để giữ nguyên giá trị hiện tại.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `Mình không gửi được tin nhắn riêng cho bạn. Hãy bật DM từ máy chủ này rồi thử lại nhé.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`Chưa đặt`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Chưa đặt`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Chưa cấu hình`';
    }

    const typeLabels = ['Đang chơi', 'Đang phát trực tiếp', 'Đang nghe', 'Đang xem', '', 'Đang thi đấu'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Chính \`${colors.primary}\` · Thành công \`${colors.success}\``,
        `⚠️ Cảnh báo \`${colors.warning}\` · Lỗi \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Cấu hình Máy chủ',
        description: `Cài đặt chính cho **${guild.name}**. Chọn một mục bên dưới hoặc chạy trình hướng dẫn cài đặt.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Tiền tố Lệnh',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Vai Trò Quản Trị Viên',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Kênh Ghi Nhật Ký',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 Trạng Thái Bot',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Chủ Đề Embed',
                value: `${getThemeColorLines()}\n-# Màu sắc được đặt trong cấu hình bot và áp dụng trên toàn hệ thống.`,
                inline: false,
            },
            {
                name: '⚡ Truy Cập Lệnh',
                value: 'Dùng `/commands dashboard` để bật hoặc tắt lệnh và lệnh con.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Cài Đặt`,
                value: setupDone
                    ? 'Trình hướng dẫn đã hoàn tất — chạy lại bất cứ lúc nào để cập nhật cài đặt.'
                    : 'Chạy trình hướng dẫn cài đặt để cấu hình máy chủ nhanh chóng.',
                inline: false,
            },
        ],
        footer: 'Bảng điều khiển tự đóng sau 10 phút không hoạt động',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Chọn một cài đặt để chỉnh sửa...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Tiền tố Lệnh')
                    .setDescription('Đổi tiền tố lệnh văn bản')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Vai Trò Quản Trị Viên')
                    .setDescription('Vai trò dùng cho lệnh quản trị')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kênh Ghi Nhật Ký')
                    .setDescription('Kênh nhận tin nhắn nhật ký hệ thống')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Chạy Lại Trình Hướng Dẫn' : 'Bắt Đầu Trình Hướng Dẫn')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Câu Hỏi Cài Đặt ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'Bạn đã không trả lời kịp. Hãy chạy lại trình hướng dẫn cài đặt khi sẵn sàng nhé.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('Đã Hủy Cài Đặt', 'Trình hướng dẫn đã dừng. Các câu trả lời đã lưu vẫn được áp dụng.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `Đã lưu tiền tố lệnh là \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Đã xóa kênh ghi nhật ký.';
        }
        const channel = guild.channels.cache.get(value);
        return `Đã lưu kênh ghi nhật ký: ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Đã xóa vai trò quản trị viên.';
        }
        const role = guild.roles.cache.get(value);
        return `Đã lưu vai trò quản trị viên: ${role ?? `<@&${value}>`}.`;
    }

    return 'Đã lưu cài đặt.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('Không tìm thấy kênh đó trong máy chủ này hoặc kênh đó không phải kênh văn bản.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('Không tìm thấy vai trò đó trong máy chủ này.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('Trình Hướng Dẫn Đang Chạy', 'Bạn đã có một trình hướng dẫn cài đặt đang mở trong DM. Hãy trả lời ở đó để tiếp tục, hoặc gõ `cancel` để dừng.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'Giữ nguyên tiền tố lệnh hiện tại.',
            question: 'Máy chủ này nên dùng tiền tố lệnh nào?\nHiện tại: `' + (config.prefix || getCommandPrefix()) + '`\nTrả lời `skip` để giữ nguyên, hoặc `cancel` để dừng.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('Tiền tố phải dài 1-10 ký tự và không chứa khoảng trắng.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'Giữ nguyên kênh ghi nhật ký hiện tại.',
            question: 'Kênh nào nên nhận nhật ký của bot?\nGửi kênh được nhắc đến, ID kênh, `none` để xóa, `skip` để giữ nguyên giá trị hiện tại, hoặc `cancel` để dừng.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Hãy gửi một kênh hoặc ID kênh hợp lệ từ máy chủ này.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'Giữ nguyên vai trò quản trị viên hiện tại.',
            question: 'Quản trị viên nên có vai trò nào?\nGửi vai trò được nhắc đến, ID vai trò, `none` để xóa, `skip` để giữ nguyên giá trị hiện tại, hoặc `cancel` để dừng.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Hãy gửi một vai trò hoặc ID vai trò hợp lệ từ máy chủ này.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 Trình Hướng Dẫn Cài Đặt',
                    description: 'Trả lời từng câu hỏi trong DM này.\n\n• Gõ `skip` để giữ nguyên giá trị hiện tại\n• Gõ `cancel` để dừng trình hướng dẫn',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('Đã Bỏ Qua', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('Đã Lưu', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nVui lòng trả lời lại với một câu trả lời hợp lệ, \`skip\` hoặc \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'Đã Dừng Cài Đặt' : 'Đã Hủy Cài Đặt')
            : (errors.length > 0 ? 'Hoàn Tất Cài Đặt' : 'Hoàn Tất Cài Đặt');

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `Đã dừng cài đặt sớm. Đã lưu **${Object.keys(changes).length}** cài đặt trước khi dừng.`
                : 'Trình hướng dẫn đã dừng trước khi có thay đổi nào được lưu.')
            : (Object.keys(changes).length > 0
                ? `Đã cập nhật **${Object.keys(changes).length}** cài đặt.${errors.length > 0 ? ' Một số câu trả lời cần thử lại.' : ''}`
                : 'Không có thay đổi nào được áp dụng.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'Sự Cố', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Cập Nhật Kênh Ghi Nhật Ký');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Chọn một kênh văn bản...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Kênh Ghi Nhật Ký')
            .setDescription('Kênh sẽ nhận tin nhắn nhật ký hệ thống')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Cập Nhật Vai Trò Quản Trị Viên');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Chọn một vai trò quản trị viên...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Vai Trò Quản Trị Viên')
            .setDescription('Vai trò dùng cho lệnh quản trị')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Cập Nhật Tiền Tố Lệnh');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Tiền tố mới (1-10 ký tự, không có khoảng trắng)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Vui lòng chọn một kênh ghi nhật ký.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Vui lòng chọn một vai trò quản trị viên.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('Tiền tố phải dài 1-10 ký tự và không chứa khoảng trắng.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Đã đặt kênh ghi nhật ký: ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Đã đặt vai trò quản trị viên: ${role ?? `<@&${value}>`}.`;
    }

    return `Đã đặt tiền tố lệnh là \`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('Đã Cập Nhật Cấu Hình', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Vui lòng thử lại.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Mở bảng điều khiển cấu hình máy chủ và trình hướng dẫn cài đặt')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildButtonRow(guildConfig, interaction.guildId), buildSettingsSelect(interaction.guildId)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Config dashboard interaction error:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Không xử lý được lựa chọn của bạn. Vui lòng thử lại.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Config command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Không mở được bảng điều khiển cấu hình. Vui lòng thử lại.',
            });
        }
    },
};
