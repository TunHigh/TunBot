// welcome.js

import { logger } from './logger.js';

const DEFAULT_TEMPLATES = {
    welcome: 'Chào mừng {user} đến với {server}!',
    goodbye: '{user.tag} đã rời khỏi máy chủ.'
};

function replaceAll(message, token, value) {
    if (value === undefined || value === null) {
        return message;
    }
    return message.split(token).join(String(value));
}

export function truncateForEmbedField(value, maxLength = 1024) {
    const text = String(value ?? '').trim();
    if (!text) {
        return '—';
    }
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function formatWelcomeMessage(message, data) {
    
    if (typeof message !== 'string') return '';
    if (!message) return '';
    if (!data || typeof data !== 'object') return message;

    const user = data?.user;
    const guild = data?.guild;

    if (!user || typeof user !== 'object') {
        logger.warn('Invalid user object passed to formatWelcomeMessage');
    }
    if (!guild || typeof guild !== 'object') {
        logger.warn('Invalid guild object passed to formatWelcomeMessage');
    }

    const tokens = {
        '{user}': user?.toString?.() || 'Người dùng',
        '{user.mention}': user?.toString?.() || 'Người dùng',
        '{user.tag}': user?.tag || 'Không xác định#0000',
        '{user.username}': user?.username || 'Không xác định',
        '{username}': user?.username || 'Không xác định',
        '{user.discriminator}': user?.discriminator || '0000',
        '{user.id}': user?.id || 'không rõ',
        '{server}': guild?.name || 'Máy chủ',
        '{server.name}': guild?.name || 'Máy chủ',
        '{guild.name}': guild?.name || 'Máy chủ',
        '{guild.id}': guild?.id || 'không rõ',
        '{guild.memberCount}': guild?.memberCount?.toString?.() || '0',
        '{memberCount}': guild?.memberCount?.toString?.() || '0',
        '{membercount}': guild?.memberCount?.toString?.() || '0'
    };

    let result = message;
    for (const [token, value] of Object.entries(tokens)) {
        if (value === undefined || value === null) continue;
        result = replaceAll(result, token, String(value));
    }

    return result;
}

export function getDefaultWelcomeMessage() {
    return DEFAULT_TEMPLATES.welcome;
}

export function getDefaultGoodbyeMessage() {
    return DEFAULT_TEMPLATES.goodbye;
}