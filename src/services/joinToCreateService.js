// joinToCreateService.js

import {
    getJoinToCreateConfig,
    saveJoinToCreateConfig,
    updateJoinToCreateConfig,
    getTemporaryChannelInfo,
    formatChannelName as formatChannelNameUtil
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const CHANNEL_NAME_MAX_LENGTH = 100;
const CHANNEL_VARIABLE_MAX_LENGTH = 32;
const CONTROL_AND_INVISIBLE_CHARS_REGEX = /[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g;
const ALLOWED_TEMPLATE_PLACEHOLDERS = new Set([
    '{username}',
    '{user_tag}',
    '{displayName}',
    '{display_name}',
    '{guildName}',
    '{guild_name}',
    '{channelName}',
    '{channel_name}'
]);

export function validateChannelNameTemplate(template) {
    if (!template || typeof template !== 'string') {
        throw new TitanBotError(
            'Invalid channel template: must be a non-empty string',
            ErrorTypes.VALIDATION,
            'Mẫu tên kênh phải là văn bản hợp lệ.'
        );
    }

    const normalizedTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();

    if (normalizedTemplate.length > CHANNEL_NAME_MAX_LENGTH) {
        throw new TitanBotError(
            'Channel template exceeds maximum length',
            ErrorTypes.VALIDATION,
            `Mẫu tên kênh không được vượt quá ${CHANNEL_NAME_MAX_LENGTH} ký tự.`
        );
    }

    if (/[@#:`]/.test(normalizedTemplate)) {
        throw new TitanBotError(
            'Channel template contains forbidden characters',
            ErrorTypes.VALIDATION,
            'Mẫu tên kênh không được chứa các ký tự @, #, : hoặc backtick.'
        );
    }

    const placeholders = normalizedTemplate.match(/\{[^}]+\}/g) || [];
    for (const placeholder of placeholders) {
        if (!ALLOWED_TEMPLATE_PLACEHOLDERS.has(placeholder)) {
            throw new TitanBotError(
                'Channel template contains unknown placeholders',
                ErrorTypes.VALIDATION,
                `Placeholder không hợp lệ: ${placeholder}. Các placeholder được phép là ${Array.from(ALLOWED_TEMPLATE_PLACEHOLDERS).join(', ')}`
            );
        }
    }

    return true;
}

export function validateBitrate(bitrate) {
    const bitrateNum = parseInt(bitrate);

    if (isNaN(bitrateNum)) {
        throw new TitanBotError(
            'Bitrate must be a valid number',
            ErrorTypes.VALIDATION,
            'Vui lòng nhập một số hợp lệ cho bitrate.'
        );
    }

    if (bitrateNum < 8 || bitrateNum > 384) {
        throw new TitanBotError(
            'Bitrate out of valid range',
            ErrorTypes.VALIDATION,
            'Bitrate phải nằm trong khoảng từ 8 đến 384 kbps.'
        );
    }

    return true;
}

export function validateUserLimit(limit) {
    const limitNum = parseInt(limit);

    if (isNaN(limitNum)) {
        throw new TitanBotError(
            'User limit must be a valid number',
            ErrorTypes.VALIDATION,
            'Vui lòng nhập một số hợp lệ cho giới hạn người dùng.'
        );
    }

    if (limitNum < 0 || limitNum > 99) {
        throw new TitanBotError(
            'User limit out of valid range',
            ErrorTypes.VALIDATION,
            'Giới hạn người dùng phải nằm trong khoảng từ 0 (không giới hạn) đến 99.'
        );
    }

    return true;
}

export function formatChannelName(template, variables) {
    try {
        const safeTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();
        validateChannelNameTemplate(safeTemplate);

        if (!variables || typeof variables !== 'object') {
            throw new TitanBotError(
                'Invalid variables object for channel formatting',
                ErrorTypes.VALIDATION
            );
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                sanitized[key] = 'Không xác định';
            } else {
                
                sanitized[key] = String(value)
                    .normalize('NFKC')
                    .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
                    .replace(/[@#:`\n\r\t]/g, '') 
                    .trim()
                    .substring(0, CHANNEL_VARIABLE_MAX_LENGTH);
            }
        }

        const replacements = {
            '{username}': sanitized.username || 'Người dùng',
            '{user_tag}': sanitized.userTag || 'Người dùng#0000',
            '{displayName}': sanitized.displayName || 'Người dùng',
            '{display_name}': sanitized.displayName || 'Người dùng',
            '{guildName}': sanitized.guildName || 'Server',
            '{guild_name}': sanitized.guildName || 'Server',
            '{channelName}': sanitized.channelName || 'Kênh thoại',
            '{channel_name}': sanitized.channelName || 'Kênh thoại',
        };

        let formatted = safeTemplate;
        for (const [placeholder, value] of Object.entries(replacements)) {
            formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        formatted = formatted
            .normalize('NFKC')
            .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
            .replace(/[@#:`\n\r\t]/g, '') 
            .replace(/\s+/g, ' ')
            .trim();

        if (formatted.length === 0) {
            formatted = 'Kênh thoại';
        } else if (formatted.length > CHANNEL_NAME_MAX_LENGTH) {
            formatted = formatted.substring(0, CHANNEL_NAME_MAX_LENGTH);
        }

        logger.debug(`Formatted channel name: "${formatted}" from template "${template}"`);
        return formatted;

    } catch (error) {
        logger.error('Error formatting channel name:', error);
        throw error;
    }
}

export async function initializeJoinToCreate(client, guildId, channelId, options = {}) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE,
                'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.'
            );
        }

        if (!guildId || !channelId) {
            throw new TitanBotError(
                'Missing required guild or channel ID',
                ErrorTypes.VALIDATION,
                'Thông tin máy chủ hoặc kênh không hợp lệ.'
            );
        }

        if (options.nameTemplate) {
            validateChannelNameTemplate(options.nameTemplate);
        }
        if (options.bitrate) {
            validateBitrate(options.bitrate / 1000); 
        }
        if (options.userLimit !== undefined) {
            validateUserLimit(options.userLimit);
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel already configured as Join to Create trigger',
                ErrorTypes.VALIDATION,
                'Kênh này đã được thiết lập làm kênh Join to Create rồi.'
            );
        }

        if (Array.isArray(config.triggerChannels) && config.triggerChannels.length > 0) {
            throw new TitanBotError(
                'Guild already has a Join to Create trigger configured',
                ErrorTypes.VALIDATION,
                'Máy chủ này đã có một kênh Join to Create được cấu hình. Hãy dùng `/jointocreate dashboard` để chỉnh sửa, hoặc gỡ bỏ kênh cũ trước khi tạo kênh mới.',
                {
                    guildId,
                    existingTriggerChannelId: config.triggerChannels[0],
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        config.triggerChannels.push(channelId);
        config.enabled = true;

        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }
            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit: options.userLimit !== undefined ? options.userLimit : config.userLimit,
                bitrate: options.bitrate || config.bitrate,
                categoryId: options.categoryId || null,
                createdAt: Date.now()
            };
        }

        const saveResult = await saveJoinToCreateConfig(client, guildId, config);
        if (!saveResult) {
            throw new TitanBotError(
                'Failed to save Join to Create configuration',
                ErrorTypes.DATABASE,
                'Không thể thiết lập hệ thống Join to Create. Vui lòng thử lại.'
            );
        }

        logger.info(`Initialized Join to Create for guild ${guildId} with trigger channel ${channelId}`);

        return config;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to initialize Join to Create: ${error.message}`,
            ErrorTypes.DATABASE,
            'Không thể thiết lập hệ thống Join to Create.'
        );
    }
}

export async function updateChannelConfig(client, guildId, channelId, updates) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE,
                'Dịch vụ cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (!config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel is not configured as a Join to Create trigger',
                ErrorTypes.VALIDATION,
                'Kênh này chưa được thiết lập làm kênh Join to Create.'
            );
        }

        if (updates.nameTemplate) {
            validateChannelNameTemplate(updates.nameTemplate);
        }
        if (updates.bitrate !== undefined) {
            validateBitrate(updates.bitrate / 1000);
        }
        if (updates.userLimit !== undefined) {
            validateUserLimit(updates.userLimit);
        }

        if (!config.channelOptions) {
            config.channelOptions = {};
        }

        config.channelOptions[channelId] = {
            ...config.channelOptions[channelId],
            ...updates,
            updatedAt: Date.now()
        };

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Updated Join to Create config for channel ${channelId} in guild ${guildId}`, {
            updates: Object.keys(updates)
        });

        return config.channelOptions[channelId];

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to update channel config: ${error.message}`,
            ErrorTypes.DATABASE,
            'Không thể cập nhật cấu hình.'
        );
    }
}

export async function removeTriggerChannel(client, guildId, channelId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE,
                'Dịch vụ cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        const index = config.triggerChannels.indexOf(channelId);
        if (index === -1) {
            throw new TitanBotError(
                'Channel not found in Join to Create triggers',
                ErrorTypes.VALIDATION,
                'Kênh này không được cấu hình làm kênh Join to Create.'
            );
        }

        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;

        if (config.channelOptions && config.channelOptions[channelId]) {
            delete config.channelOptions[channelId];
        }

        if (config.temporaryChannels) {
            for (const [tempChannelId, tempInfo] of Object.entries(config.temporaryChannels)) {
                if (tempInfo.triggerChannelId === channelId) {
                    delete config.temporaryChannels[tempChannelId];
                }
            }
        }

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Removed Join to Create trigger channel ${channelId} from guild ${guildId}`);

        return true;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to remove trigger channel: ${error.message}`,
            ErrorTypes.DATABASE,
            'Không thể gỡ bỏ kênh kích hoạt.'
        );
    }
}

export async function getConfiguration(client, guildId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE,
                'Dịch vụ cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.'
            );
        }

        return await getJoinToCreateConfig(client, guildId);

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to retrieve configuration: ${error.message}`,
            ErrorTypes.DATABASE,
            'Không thể tải cài đặt.'
        );
    }
}

export async function isTriggerChannel(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);
        return config.triggerChannels.includes(channelId);
    } catch (error) {
        logger.error(`Error checking if channel is trigger: ${error.message}`);
        return false;
    }
}

export async function getChannelConfiguration(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);

        if (!config.triggerChannels || !Array.isArray(config.triggerChannels) || !config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel is not a valid Join to Create trigger',
                ErrorTypes.VALIDATION,
                'Kênh này chưa được thiết lập làm kênh Join to Create.'
            );
        }

        return {
            ...config,
            channelConfig: config.channelOptions?.[channelId] || {}
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to get channel configuration: ${error.message}`,
            ErrorTypes.DATABASE,
            'Không thể tải cấu hình kênh. Vui lòng thử lại.'
        );
    }
}

export function hasManageGuildPermission(member) {
    try {
        if (!member || !member.permissions) {
            return false;
        }
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch (error) {
        logger.error('Error checking ManageGuild permission:', error);
        return false;
    }
}

export async function logConfigurationChange(client, guildId, userId, action, details) {
    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.COUNTER_CONFIG,
            data: {
                title: 'Join to Create Đã Cập Nhật',
                lines: [
                    formatLogLine('Thao tác', action),
                    formatLogLine('Chi tiết', typeof details === 'string' ? details : JSON.stringify(details)),
                ],
                userId,
            },
        });
    } catch (error) {
        logger.warn(`Failed to log Join to Create configuration change: ${error.message}`);
    }
}

export async function createTemporaryChannel(guild, member, options = {}) {
    try {
        if (!guild || !member) {
            throw new TitanBotError(
                'Invalid guild or member',
                ErrorTypes.VALIDATION
            );
        }

        const {
            nameTemplate,
            userLimit,
            bitrate,
            parentId
        } = options;

        if (nameTemplate) {
            validateChannelNameTemplate(nameTemplate);
        }
        if (userLimit !== undefined) {
            validateUserLimit(userLimit);
        }
        if (bitrate !== undefined) {
            validateBitrate(bitrate / 1000);
        }

        const channelName = formatChannelName(nameTemplate || 'Phòng của {username}', {
            username: member.user.username,
            displayName: member.displayName,
            userTag: member.user.tag,
            guildName: guild.name
        });

        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentId,
            userLimit: userLimit === 0 ? undefined : userLimit,
            bitrate: bitrate || 64000,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.MoveMembers]
                },
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                }
            ]
        });

        logger.info(`Created temporary voice channel ${tempChannel.name} (${tempChannel.id}) for user ${member.user.tag}`);

        return {
            id: tempChannel.id,
            name: tempChannel.name,
            ownerId: member.id
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to create temporary channel: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Không thể tạo kênh thoại tạm thời của bạn. Vui lòng liên hệ quản trị viên.'
        );
    }
}

export default {
    validateChannelNameTemplate,
    validateBitrate,
    validateUserLimit,
    formatChannelName,
    initializeJoinToCreate,
    updateChannelConfig,
    removeTriggerChannel,
    getConfiguration,
    isTriggerChannel,
    getChannelConfiguration,
    hasManageGuildPermission,
    logConfigurationChange,
    createTemporaryChannel
};