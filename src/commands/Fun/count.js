import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Quản lý trò chơi đếm số của máy chủ')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Bắt đầu trò chơi đếm số trong một kênh văn bản')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh diễn ra trò đếm số')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('Hệ thống đếm số sẽ dùng')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Tắt trò chơi đếm số cho máy chủ này'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Xem trạng thái trò chơi đếm số hiện tại'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Đặt lại chuỗi đếm hiện tại')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('Số sẽ bắt đầu sau khi đặt lại')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Hiển thị bảng xếp hạng trò chơi đếm số'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Vui lòng chọn một kênh văn bản cho trò chơi đếm số.' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Máy chủ này đã có kênh đếm số đang hoạt động: <#${config.channelId}>. Hãy tắt trò chơi hiện tại trước, hoặc dùng kênh có sẵn đó.` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Đã Bật Trò Chơi Đếm Số',
              `Trò chơi đếm số đang hoạt động trong ${channel} với hệ thống **${getCountingSystemLabel(system)}**. Người chơi phải đếm từ **1** và không được gửi hai số liên tiếp.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('Trò Chơi Đếm Số Đã Tắt', 'Trò chơi đếm số đã bị tắt cho máy chủ này rồi.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Đã Tắt Trò Chơi Đếm Số', 'Trò chơi đếm số đã được tắt.')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: 'Đã Bật', value: config.enabled ? 'Có' : 'Không', inline: true },
          { name: 'Kênh', value: config.channelId ? `<#${config.channelId}>` : 'Chưa cấu hình', inline: true },
          { name: 'Hệ Thống', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'Số Tiếp Theo', value: getExpectedCountValue(config), inline: true },
          { name: 'Chuỗi Hiện Tại', value: `${config.currentStreak}`, inline: true },
          { name: 'Chuỗi Tốt Nhất', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'Người Đếm Cuối', value: config.lastUserId ? `<@${config.lastUserId}>` : 'Không có', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Trạng Thái Trò Chơi Đếm Số',
              description: 'Tổng quan về trò chơi đếm số đang được cấu hình.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Hãy bật trò chơi đếm số trước bằng `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Đã Đặt Lại Trò Chơi Đếm Số',
              `Chuỗi đếm đã được đặt lại. Hãy bắt đầu lại với **${startNumber}** trong <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Bảng Xếp Hạng Trò Chơi Đếm Số',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'Chưa có lượt đếm nào được ghi nhận.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Vui lòng chọn một hành động hợp lệ cho trò chơi đếm số.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi khi quản lý trò chơi đếm số.' });
    }
  },
};
