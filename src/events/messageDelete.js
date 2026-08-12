import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Cleaned up reaction role database entry for manually deleted message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                title: 'Đã Gỡ Reaction Role',
                lines: [
                  formatLogLine('Kênh', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Không xác định'),
                  formatLogLine('ID Tin Nhắn', `\`${message.id}\``),
                  formatLogLine('Dọn Dẹp', 'Đã tự động xóa mục khỏi cơ sở dữ liệu'),
                ],
                quoted: true,
              }
            });
          } catch (logCleanupError) {
            logger.warn('Failed to log reaction role cleanup after manual message deletion:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Failed to clean up reaction role data for deleted message ${message.id}:`, reactionRoleCleanupError);
      }

      if (message.author?.bot) return;

      const metaLines = [
        formatLogLine('Kênh', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Không xác định'),
        formatLogLine('ID Tin Nhắn', `\`${message.id}\``),
        formatLogLine('Người gửi', message.author ? message.author.toString() : 'Không xác định'),
        formatLogLine('Tin nhắn tạo lúc', `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`),
      ];

      let messageBody = null;
      if (message.content) {
        messageBody = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH
          ? `${message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3)}...`
          : message.content;
      }

      if (message.attachments.size > 0) {
        metaLines.push(formatLogLine('Tệp đính kèm', String(message.attachments.size)));
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          title: 'Tin nhắn đã bị xóa',
          lines: metaLines,
          quoted: true,
          section: messageBody ? { title: 'Tin nhắn', body: messageBody || '*(tin nhắn trống)*' } : null,
          userId: message.author?.id,
          channelId: message.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};
