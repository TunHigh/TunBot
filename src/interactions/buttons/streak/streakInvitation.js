import { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getFromDb, setInDb } from '../../../utils/database/wrapper.js';

const INVITATION_KEY_PREFIX = 'guild:';
const INVITATION_KEY_SUFFIX = ':streak_invitations';

function getInvitationKey(guildId) {
  return `${INVITATION_KEY_PREFIX}${guildId}${INVITATION_KEY_SUFFIX}`;
}

function getInvitationId(inviterId, inviteeId) {
  return `${inviterId}:${inviteeId}`;
}

export const streakInviteAcceptHandler = {
  name: 'streak_invite_accept',
  async execute(interaction, client) {
    try {
      const [, inviterId, inviteeId] = interaction.customId.split(':');
      
      if (interaction.user.id !== inviteeId) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Không thể chấp nhận',
            description: 'Chỉ người được mời mới có thể chấp nhận lời mời này.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      const key = getInvitationKey(interaction.guildId);
      const invitations = await getFromDb(key, {});
      const invitationId = getInvitationId(inviterId, inviteeId);
      const invitation = invitations[invitationId];

      if (!invitation) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lời mời không tồn tại',
            description: 'Lời mời này đã hết hạn hoặc đã bị hủy.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (invitation.status !== 'pending') {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lời mời đã được xử lý',
            description: `Lời mời này đã được ${invitation.status === 'accepted' ? 'chấp nhận' : 'từ chối'} rồi.`,
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if streak already exists
      const { getStreakData, saveStreakData, getUserStreaks, MAX_STREAK_PARTNERS } = await import('../../../services/streakService.js');
      
      const existingStreak = await getStreakData(client, interaction.guildId, inviterId, inviteeId);
      if (existingStreak) {
        // Delete invitation
        delete invitations[invitationId];
        await setInDb(key, invitations);

        return interaction.reply({
          embeds: [createEmbed({
            title: 'ℹ️ Streak đã tồn tại',
            description: 'Hai bạn đã có streak với nhau rồi! Dùng `/chuoi` để xem.',
            color: 'info',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check streak partner limits
      const inviterStreaks = await getUserStreaks(client, interaction.guildId, inviterId);
      const inviteeStreaks = await getUserStreaks(client, interaction.guildId, inviteeId);
      
      if (inviterStreaks.length >= MAX_STREAK_PARTNERS || inviteeStreaks.length >= MAX_STREAK_PARTNERS) {
        delete invitations[invitationId];
        await setInDb(key, invitations);

        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Đã đạt giới hạn',
            description: `Mỗi người chỉ có thể giữ streak với tối đa ${MAX_STREAK_PARTNERS} người. Hãy xóa streak cũ trước khi tạo mới.`,
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Create the streak
      const [userId1, userId2] = [inviterId, inviteeId].sort();
      const streakData = {
        userId1,
        userId2,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: null,
        lastInteractionDate: null,
        lastInteractionTimestamp: Date.now(),
        totalInteractions: 0,
        dailyActivity: {},
        createdAt: Date.now(),
      };

      await saveStreakData(client, interaction.guildId, inviterId, inviteeId, streakData);

      // Update invitation status
      invitation.status = 'accepted';
      invitation.acceptedAt = Date.now();
      await setInDb(key, invitations);

      // Get user objects for display
      const [inviter, invitee] = await Promise.all([
        client.users.fetch(inviterId).catch(() => null),
        client.users.fetch(inviteeId).catch(() => null),
      ]);

      const inviterName = inviter?.globalName || inviter?.displayName || inviter?.username || 'Người chơi';
      const inviteeName = invitee?.globalName || invitee?.displayName || invitee?.username || 'Người chơi';

      // Update the original message
      await interaction.update({
        embeds: [createEmbed({
          title: '✅ Đã chấp nhận lời mời!',
          description: `**${inviterName}** và **${inviteeName}** giờ đã là bạn streak! 🎉\n\nHãy nhắn tin và **mention/reply nhau mỗi ngày** để giữ chuỗi nhé!`,
          color: 'success',
          thumbnail: invitee?.displayAvatarURL(),
        })],
        components: [],
      });

      // Send confirmation to inviter (if different channel)
      try {
        const inviterUser = await client.users.fetch(inviterId);
        await inviterUser.send({
          embeds: [createEmbed({
            title: '✅ Lời mời streak đã được chấp nhận!',
            description: `**${inviteeName}** đã chấp nhận lời mời giữ chuỗi với bạn! 🎉\n\nBây giờ hãy nhắn tin và mention nhau mỗi ngày để bắt đầu streak.`,
            color: 'success',
          })],
        }).catch(() => {}); // Ignore if DM fails
      } catch (e) {
        // Ignore DM errors
      }

    } catch (error) {
      logger.error('Error accepting streak invitation:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lỗi',
            description: 'Đã xảy ra lỗi khi chấp nhận lời mời. Vui lòng thử lại sau.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

export const streakInviteDeclineHandler = {
  name: 'streak_invite_decline',
  async execute(interaction, client) {
    try {
      const [, inviterId, inviteeId] = interaction.customId.split(':');
      
      if (interaction.user.id !== inviteeId) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Không thể từ chối',
            description: 'Chỉ người được mời mới có thể từ chối lời mời này.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      const key = getInvitationKey(interaction.guildId);
      const invitations = await getFromDb(key, {});
      const invitationId = getInvitationId(inviterId, inviteeId);
      const invitation = invitations[invitationId];

      if (!invitation) {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lời mời không tồn tại',
            description: 'Lời mời này đã hết hạn hoặc đã bị hủy.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (invitation.status !== 'pending') {
        return interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lời mời đã được xử lý',
            description: `Lời mời này đã được ${invitation.status === 'accepted' ? 'chấp nhận' : 'từ chối'} rồi.`,
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Update invitation status
      invitation.status = 'declined';
      invitation.declinedAt = Date.now();
      await setInDb(key, invitations);

      // Get user objects for display
      const [inviter, invitee] = await Promise.all([
        client.users.fetch(inviterId).catch(() => null),
        client.users.fetch(inviteeId).catch(() => null),
      ]);

      const inviterName = inviter?.globalName || inviter?.displayName || inviter?.username || 'Người chơi';
      const inviteeName = invitee?.globalName || invitee?.displayName || invitee?.username || 'Người chơi';

      // Update the original message
      await interaction.update({
        embeds: [createEmbed({
          title: '❌ Đã từ chối lời mời',
          description: `**${inviteeName}** đã từ chối lời mời giữ chuỗi từ **${inviterName}**.`,
          color: 'error',
        })],
        components: [],
      });

      // Notify inviter
      try {
        const inviterUser = await client.users.fetch(inviterId);
        await inviterUser.send({
          embeds: [createEmbed({
            title: '❌ Lời mời streak bị từ chối',
            description: `**${inviteeName}** đã từ chối lời mời giữ chuỗi của bạn.`,
            color: 'error',
          })],
        }).catch(() => {});
      } catch (e) {
        // Ignore DM errors
      }

    } catch (error) {
      logger.error('Error declining streak invitation:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [createEmbed({
            title: '❌ Lỗi',
            description: 'Đã xảy ra lỗi khi từ chối lời mời. Vui lòng thử lại sau.',
            color: 'error',
          })],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

export async function createStreakInvitation(client, guildId, inviterId, inviteeId) {
  const key = getInvitationKey(guildId);
  const invitations = await getFromDb(key, {});
  const invitationId = getInvitationId(inviterId, inviteeId);
  
  const invitation = {
    inviterId,
    inviteeId,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  
  invitations[invitationId] = invitation;
  await setInDb(key, invitations);
  return invitation;
}

export async function getStreakInvitation(client, guildId, inviterId, inviteeId) {
  const key = getInvitationKey(guildId);
  const invitations = await getFromDb(key, {});
  const invitationId = getInvitationId(inviterId, inviteeId);
  return invitations[invitationId] || null;
}

export function buildInvitationButtons(inviterId, inviteeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`streak_invite_accept:${inviterId}:${inviteeId}`)
      .setLabel('✅ Đồng ý')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`streak_invite_decline:${inviterId}:${inviteeId}`)
      .setLabel('❌ Từ chối')
      .setStyle(ButtonStyle.Danger),
  );
}