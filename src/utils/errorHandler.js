// errorHandler.js — the single entry point for all error handling.
//
// Rules:
// 1. Commands/handlers: throw TitanBotError (via createError) or let errors propagate;
//    interactionCreate routes them through handleInteractionError. For expected user-facing
//    failures (validation, cooldowns), use replyUserError.
//    Do NOT wrap a command's execute() body in a try/catch whose only purpose is to call
//    handleInteractionError — that is redundant because interactionCreate already catches
//    command.execute errors and calls handleInteractionError with COMMAND_ERROR_SUBTYPES.
//    Only keep a local try/catch when the catch does something more (custom recovery,
//    typed re-throw, status-code branching) or when it lives in a standalone handler
//    (collector callbacks, modal/component handlers) not reached via the command path.
// 2. Services: throw, never return { success: false }. Wrap exports with wrapServiceBoundary
//    (re-exported here) so unknown errors get typed with service/operation context.
// 3. Background tasks (cron, timers): wrap with handleTaskError / runSafeTask.
// 4. Set a specific userMessage when you know the cause; use ErrorTypes, don't invent titles.
// 5. Success/info/warning replies use successEmbed / infoEmbed / warningEmbed.

import { logger } from './logger.js';
import { buildUserErrorEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getErrorMetadata, getDefaultErrorCodeByType, resolveErrorCode, ErrorCodes } from './errorRegistry.js';
import { InteractionHelper } from './interactionHelper.js';

// Re-export so consumers only ever need to import from errorHandler.js
export { ErrorCodes, getErrorMetadata, resolveErrorCode, getDefaultErrorCodeByType } from './errorRegistry.js';
export { ensureTypedServiceError, wrapServiceBoundary, wrapServiceClassMethods } from './serviceErrorBoundary.js';

export const ErrorTypes = {
    VALIDATION: 'validation',
    PERMISSION: 'permission',
    CONFIGURATION: 'configuration',
    DATABASE: 'database',
    NETWORK: 'network',
    DISCORD_API: 'discord_api',
    USER_INPUT: 'user_input',
    RATE_LIMIT: 'rate_limit',
    UNKNOWN: 'unknown'
};

export class TitanBotError extends Error {
    constructor(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name = 'TitanBotError';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.errorCode || getDefaultErrorCodeByType(type);
        this.timestamp = new Date().toISOString();
    }
}

// Discord API error codes that indicate a permission problem rather than a bug.
const DISCORD_PERMISSION_CODES = new Set([
    50001, // Missing Access
    50013, // Missing Permissions
    50007, // Cannot send messages to this user (DMs closed)
    160002, // Cannot reply without permission to read message history
]);

// PostgreSQL / node-postgres error codes and errno values that indicate database trouble.
const DATABASE_ERROR_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
    '57014', // query_canceled (statement timeout)
    '53300', // too_many_connections
    '08006', '08001', '08003', // connection failures
    '40001', '40P01', // serialization failure / deadlock
]);

export function categorizeError(error) {
    if (error instanceof TitanBotError) {
        return error.type;
    }

    const message = error?.message?.toLowerCase() || '';
    const code = error?.code;

    if (typeof code === 'string' && DATABASE_ERROR_CODES.has(code)) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('rate limit') || code === 429) {
        return ErrorTypes.RATE_LIMIT;
    }

    if (DISCORD_PERMISSION_CODES.has(code)) {
        return ErrorTypes.PERMISSION;
    }

    // Remaining numeric codes in Discord's ranges (unknown entity 10xxx, request-level 5xxxx, etc.)
    if (typeof code === 'number' && code >= 10000) {
        return ErrorTypes.DISCORD_API;
    }

    if (error?.name === 'AbortError' || message.includes('network') || message.includes('fetch failed') || message.includes('enotconn')) {
        return ErrorTypes.NETWORK;
    }

    if (message.includes('permission') || message.includes('missing access') || message.includes('missing permissions')) {
        return ErrorTypes.PERMISSION;
    }

    if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return ErrorTypes.VALIDATION;
    }

    if (message.includes('config') || message.includes('not found')) {
        return ErrorTypes.CONFIGURATION;
    }

    return ErrorTypes.UNKNOWN;
}

const UserMessages = {
    [ErrorTypes.VALIDATION]: {
        default: 'Vui lòng kiểm tra lại thông tin bạn nhập và thử lại nhé.',
        missing_required: 'Bạn đang thiếu một số thông tin bắt buộc. Kiểm tra lại các tùy chọn của lệnh và thử lại nhé.',
        invalid_format: 'Định dạng bạn cung cấp không đúng. Kiểm tra lại cách sử dụng lệnh và thử lại nhé.'
    },
    [ErrorTypes.PERMISSION]: {
        default: 'Bạn không có quyền thực hiện hành động này.',
        user_permission: 'Bạn không có quyền sử dụng lệnh này.',
        bot_permission: 'Mình không có quyền cần thiết để thực hiện điều đó trong kênh này.'
    },
    [ErrorTypes.CONFIGURATION]: {
        default: 'Tính năng này chưa được thiết lập. Hãy nhờ quản trị viên máy chủ cấu hình nhé.',
        missing_config: 'Tính năng này chưa được cấu hình. Hãy nhờ quản trị viên máy chủ thiết lập nhé.',
        invalid_config: 'Cấu hình máy chủ cho tính năng này không hợp lệ. Hãy nhờ quản trị viên máy chủ kiểm tra lại.'
    },
    [ErrorTypes.DATABASE]: {
        default: 'Đã xảy ra lỗi khi lưu dữ liệu. Vui lòng thử lại sau vài giây nữa nhé.',
        connection_failed: 'Mình không thể kết nối đến cơ sở dữ liệu. Vui lòng thử lại sau nhé.',
        timeout: 'Thao tác này mất quá nhiều thời gian. Vui lòng thử lại nhé.'
    },
    [ErrorTypes.NETWORK]: {
        default: 'Mình không thể kết nối đến dịch vụ bên ngoài. Vui lòng thử lại sau vài giây nữa nhé.',
        timeout: 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại nhé.',
        unreachable: 'Dịch vụ hiện không khả dụng. Vui lòng thử lại sau nhé.'
    },
    [ErrorTypes.DISCORD_API]: {
        default: 'Discord đã từ chối yêu cầu đó. Vui lòng thử lại sau vài giây nữa nhé.',
        rate_limit: 'Bạn đang thao tác quá nhanh. Chờ một chút rồi thử lại nhé.',
        forbidden: 'Mình không được phép làm điều đó ở đây. Kiểm tra quyền của vai trò bot nhé.'
    },
    [ErrorTypes.USER_INPUT]: {
        default: 'Có vấn đề với yêu cầu của bạn. Kiểm tra lại thông tin và thử lại nhé.',
        invalid_user: 'Mình không tìm thấy người dùng đó. Kiểm tra lại mention hoặc ID và thử lại nhé.',
        invalid_channel: 'Mình không tìm thấy kênh đó. Kiểm tra lại mention hoặc ID và thử lại nhé.'
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: 'Bạn đang thao tác quá nhanh. Chờ một chút rồi thử lại nhé.',
        command_cooldown: 'Lệnh này đang trong thời gian chờ. Đợi một chút rồi dùng lại nhé.',
        global_rate_limit: 'Discord đang giới hạn tốc độ yêu cầu. Chờ một chút rồi thử lại nhé.'
    },
    [ErrorTypes.UNKNOWN]: {
        default: 'Đã xảy ra lỗi. Vui lòng thử lại sau vài giây nữa nhé.',
        unexpected: 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau nhé.',
        warn_failed: 'Mình không thể cảnh cáo thành viên đó. Kiểm tra quyền và thứ bậc vai trò của mình, rồi thử lại nhé.',
        kick_failed: 'Mình không thể kick thành viên đó. Kiểm tra quyền và thứ bậc vai trò của mình, rồi thử lại nhé.',
        ban_failed: 'Mình không thể ban thành viên đó. Kiểm tra quyền và thứ bậc vai trò của mình, rồi thử lại nhé.',
        unban_failed: 'Mình không thể bỏ ban người dùng đó. Kiểm tra quyền của mình rồi thử lại nhé.',
        timeout_failed: 'Mình không thể tạm khóa thành viên đó. Kiểm tra quyền và thứ bậc vai trò của mình, rồi thử lại nhé.',
        untimeout_failed: 'Mình không thể gỡ tạm khóa. Kiểm tra quyền của mình rồi thử lại nhé.'
    }
};

export function getUserMessage(error, context = {}) {
    const type = categorizeError(error);
    const messages = UserMessages[type] || UserMessages[ErrorTypes.UNKNOWN];

    if (error.userMessage) {
        return error.userMessage;
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[ErrorTypes.UNKNOWN][context.subtype]) {
        return UserMessages[ErrorTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildErrorLogData(interaction, error, errorType, context = {}) {
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || error?.context?.traceId;

    return {
        logData: {
            event: 'interaction.error',
            errorCode: resolvedErrorCode,
            remediationHint: errorMetadata.remediation,
            severity: errorMetadata.severity,
            retryable: errorMetadata.retryable,
            error: error.message,
            type: errorType,
            traceId,
            guildId: interaction?.guildId,
            userId: interaction?.user?.id,
            command: interaction?.commandName || context.command,
            interaction: interaction ? {
                type: interaction.type,
                commandName: interaction.commandName,
                customId: interaction.customId,
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId
            } : undefined,
            context
        },
        traceId,
        resolvedErrorCode,
        errorMetadata
    };
}

function logInteractionError(error, errorType, logData) {
    const isUserError = USER_ERROR_TYPES.has(errorType);
    const isExpectedError = Boolean(error?.context?.expected === true || error?.context?.suppressErrorLog === true);

    if (isUserError || isExpectedError) {
        if (errorType !== ErrorTypes.RATE_LIMIT) {
            logger.debug(`User Error [${errorType.toUpperCase()}]: ${error.userMessage || error.message}`, logData);
        }
    } else {
        logger.error(`System Error [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: error.stack
        });
    }
}

async function sendErrorResponse(interaction, embed, context = {}) {
    try {
        if (!interaction || !interaction.id) {
            logger.warn('Interaction was null or invalid when handling error', {
                event: 'interaction.error.invalid_interaction',
                errorCode: ErrorCodes.INTERACTION_INVALID,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_INVALID).remediation,
                traceId: context.traceId
            });
            return false;
        }

        const coordinator = InteractionHelper.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction expired before error handler could send response', {
                event: 'interaction.error.expired',
                errorCode: ErrorCodes.INTERACTION_EXPIRED,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_EXPIRED).remediation,
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command
            });
            return false;
        }

        const errorMessage = { embeds: [embed] };

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                await coordinator.edit(errorMessage);
            } else {
                await coordinator?.respond(errorMessage);
            }
            return true;
        }

        const useEphemeral = context.ephemeral !== false;

        if (interaction.replied) {
            // A visible reply already exists; don't overwrite it — follow up ephemerally.
            await interaction.followUp({ ...errorMessage, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            if (useEphemeral) {
                errorMessage.flags = MessageFlags.Ephemeral;
            }
            await interaction.reply(errorMessage);
        }

        return true;
    } catch (replyError) {
        if (replyError.code === 40060 || replyError.code === 10062 || replyError.code === 50027) {
            logger.warn('Interaction already acknowledged, expired, or token invalid; cannot send error response:', {
                event: 'interaction.error.response_unavailable',
                errorCode: String(replyError.code),
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command,
                code: replyError.code
            });
            return false;
        }

        logger.error('Failed to send error response:', {
            event: 'interaction.error.response_failed',
            errorCode: String(replyError.code || ErrorCodes.INTERACTION_RESPONSE_FAILED),
            remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_RESPONSE_FAILED).remediation,
            traceId: context.traceId,
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            command: interaction.commandName || context.command,
            error: replyError
        });
        return false;
    }
}

/**
 * Reply with a typed user-facing error (early-return validation, permission checks, etc.).
 */
export async function replyUserError(interaction, {
    type = ErrorTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
} = {}) {
    const errorType = type || ErrorTypes.UNKNOWN;
    const syntheticError = message
        ? createError('User error', errorType, message, { expected: true, ...context })
        : createError('User error', errorType, null, { expected: true, ...context });

    const userMessage = getUserMessage(syntheticError, { subtype, ...context });
    const { logData, traceId } = buildErrorLogData(interaction, syntheticError, errorType, {
        ...context,
        subtype,
        source: context.source || 'replyUserError'
    });

    logInteractionError(syntheticError, errorType, logData);

    const embed = buildUserErrorEmbed(errorType, userMessage);
    return sendErrorResponse(interaction, embed, { ...context, traceId, ephemeral, subtype });
}

const USER_ERROR_TYPES = new Set([
    ErrorTypes.VALIDATION,
    ErrorTypes.RATE_LIMIT,
    ErrorTypes.USER_INPUT,
    ErrorTypes.PERMISSION
]);

function buildErrorReference(resolvedErrorCode, traceId) {
    const shortTrace = traceId ? String(traceId).slice(0, 8) : null;
    return shortTrace ? `${resolvedErrorCode} · ${shortTrace}` : resolvedErrorCode;
}

export async function handleInteractionError(interaction, error, context = {}) {
    const errorType = categorizeError(error);
    const userMessage = getUserMessage(error, context);
    const { logData, traceId, resolvedErrorCode } = buildErrorLogData(interaction, error, errorType, context);

    logInteractionError(error, errorType, logData);

    // System errors get a reference code so users can report them and we can grep logs.
    const isUserError = USER_ERROR_TYPES.has(errorType) || error?.context?.expected === true;
    const description = isUserError
        ? userMessage
        : `${userMessage}\n\n-# Ref: \`${buildErrorReference(resolvedErrorCode, traceId)}\``;

    const embed = buildUserErrorEmbed(errorType, description);
    await sendErrorResponse(interaction, embed, { ...context, traceId });
}

/**
 * Central error handler for non-interaction contexts (cron jobs, timers, event
 * side-effects). Logs with the same structured fields as interaction errors.
 */
export function handleTaskError(taskName, error, context = {}) {
    const errorType = categorizeError(error);
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);

    logger.error(`Task Error [${taskName}] [${errorType.toUpperCase()}]`, {
        event: 'task.error',
        task: taskName,
        errorCode: resolvedErrorCode || ErrorCodes.TASK_ERROR,
        remediationHint: errorMetadata.remediation,
        severity: errorMetadata.severity,
        retryable: errorMetadata.retryable,
        type: errorType,
        error: error?.message || String(error),
        stack: error?.stack,
        context
    });
}

/**
 * Wrap a background task so it can never produce an unhandled rejection.
 * Usage: cron.schedule('* * * * *', runSafeTask('giveaways', () => checkGiveaways(client)))
 */
export function runSafeTask(taskName, fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleTaskError(taskName, error, context);
            return null;
        }
    };
}

export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalSubmit || arg.isStringSelectMenu || arg.isChatInputCommand || arg._isPrefixCommand)
            );

            // Slash commands are handled by interactionCreate — re-throw so the
            // central handler can attach trace context and command subtypes.
            if (interaction?.isChatInputCommand?.()) {
                throw error;
            }

            if (interaction) {
                await handleInteractionError(interaction, error, context);
            } else {
                logger.error('Error in non-interaction context:', error);
            }

            return null;
        }
    };
}

export function createError(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
    const normalizedContext = {
        ...context,
        errorCode: context?.errorCode || getDefaultErrorCodeByType(type)
    };

    return new TitanBotError(message, type, userMessage, normalizedContext);
}

export default {
    ErrorTypes,
    TitanBotError,
    categorizeError,
    getUserMessage,
    replyUserError,
    handleInteractionError,
    handleTaskError,
    runSafeTask,
    withErrorHandling,
    createError
};
