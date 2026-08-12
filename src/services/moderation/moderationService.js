// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'this user';
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
    if (actor === 'moderator') {
      return (
        `Bạn không thể ${action} **${targetLabel}** — vai trò **${targetRole.name}** của họ ngang bằng hoặc cao hơn vai trò của bạn (**${actorRole.name}**). ` +
        `Trong **Server Settings → Roles**, hãy kéo vai trò điều hành của bạn lên trên **${targetRole.name}**.`
      );
    }

    return (
      `Tôi không thể ${action} **${targetLabel}** — vai trò của tôi **${actorRole.name}** ngang bằng hoặc thấp hơn vai trò của họ (**${targetRole.name}**). ` +
      `Trong **Server Settings → Roles**, hãy kéo vai trò bot của tôi lên trên **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);
      if (!botRole || !targetRole) {
        return `Thứ bậc vai trò của bot đã chặn ${action} đối với ${targetLabel}`;
      }
      return `Vai trò bot **${botRole.name}** quá thấp so với **${targetRole.name}** — hãy kéo vai trò bot lên cao hơn`;
    }

    const modRole = getHighestRole(moderator);
    if (!modRole || !targetRole) {
      return `Thứ bậc vai trò đã chặn ${action} đối với ${targetLabel}`;
    }
    return `Vai trò của bạn **${modRole.name}** quá thấp so với **${targetRole.name}** — hãy kéo vai trò của bạn lên cao hơn`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, error: 'Đối tượng điều hành không hợp lệ' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Không thể xác định thứ bậc vai trò. Hãy thử mention người dùng hoặc dùng lệnh slash.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return { valid: false, error: 'Đối tượng không hợp lệ' };
    }

    const botMember = target.guild?.members?.me;
    if (!botMember) {
      return { valid: false, error: 'Bot không có trong server này' };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Không thể xác định thứ bậc vai trò của bot. Hãy kiểm tra vai trò của tôi đã được cấu hình trong server này.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) {
      throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
    }

    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) {
      throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Cần có server, người dùng và người điều hành.'
        );
      }

      let targetMember = null;
      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'ban');
      } else {

        const isOwner = guild.ownerId === moderator.id;
        const hasHighPerms = moderator.permissions.has([
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
            throw new TitanBotError(
                'You do not have sufficient permissions to ban users who are not in the server.',
                ErrorTypes.PERMISSION,
                'Bạn cần quyền "Manage Server" hoặc "Administrator" để cấm người dùng hiện không ở trong server.'
            );
        }
      }

      await guild.members.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Banned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            deleteDays
          }
        }
      });

      logger.info(`User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Cần có server, thành viên và người điều hành.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'kick');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          `Tôi không thể đuổi **${targetLabel}**. Họ có thể có quyền **Administrator** hoặc một vai trò được quản lý/tích hợp. ` +
          'Hãy đảm bảo vai trò bot của tôi cao hơn vai trò của họ trong **Server Settings → Roles** và họ không có quyền Admin.'
        );
      }

      await member.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Kicked',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User kicked: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error kicking user:', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Cần có server, thành viên, người điều hành và thời lượng.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'timeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          `Tôi không thể khóa tạm thời **${targetLabel}**. Họ có thể có quyền **Administrator** hoặc một vai trò được quản lý/tích hợp. ` +
          'Hãy đảm bảo vai trò bot của tôi cao hơn vai trò của họ trong **Server Settings → Roles** và họ không có quyền Admin.'
        );
      }

      await member.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Timed Out',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} minutes`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(`User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (error) {
      logger.error('Error timing out user:', error);
      throw error;
    }
  }

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Khóa tạm thời được gỡ bởi người điều hành'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Cần có server, thành viên và người điều hành.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'remove the timeout from');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `Tôi không thể thao tác với **${targetLabel}**. Họ có thể có quyền **Administrator** hoặc một vai trò được quản lý/tích hợp. ` +
          'Hãy đảm bảo vai trò bot của tôi cao hơn vai trò của họ trong **Server Settings → Roles**.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} hiện không bị khóa tạm thời`
        );
      }

      await member.timeout(null, reason);

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Untimeouted',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Timeout removed: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Error removing timeout:', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Cần có server, người dùng và người điều hành.'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} hiện không bị cấm khỏi server này`
        );
      }

      await guild.members.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Unbanned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error unbanning user:', error);
      throw error;
    }
  }
}
