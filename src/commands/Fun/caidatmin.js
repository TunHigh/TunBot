import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  configureCommunityMinesweeper,
  disableCommunityMinesweeper,
  formatMinesweeperInterval,
  getCommunityMinesweeperConfig,
  parseMinesweeperInterval,
} from '../../services/communityMinesweeperService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('caidatmin')
    .setDescription('Cài đặt trò chơi săn mìn cộng đồng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Đặt kênh và chu kỳ xuất hiện trò chơi')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh văn bản để bot đăng trò chơi')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('time')
            .setDescription('Chu kỳ HH:MM:SS, tối thiểu 00:01:00')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Xem cấu hình săn mìn cộng đồng'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Tắt trò chơi săn mìn cộng đồng'),
    ),
  category: 'Fun',

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.',
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const time = interaction.options.getString('time');
      const intervalMs = parseMinesweeperInterval(time);

      if (!channel?.isTextBased?.() || channel.type !== ChannelType.GuildText) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Vui lòng chọn một kênh văn bản hợp lệ.',
        });
      }

      if (!intervalMs) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Thời gian phải theo dạng **HH:MM:SS** và ít nhất là **00:01:00**.',
        });
      }

      const { nextGameAt } = await configureCommunityMinesweeper(
        interaction.client,
        interaction.guildId,
        channel.id,
        intervalMs,
      );

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Đã Cài Đặt Săn Mìn Cộng Đồng',
            [
              `Kênh trò chơi: ${channel}`,
              `Chu kỳ: **${formatMinesweeperInterval(intervalMs)}**`,
              'Mỗi lượt có tổng thưởng **$20,000**, chia ngẫu nhiên vào các ô không có mìn.',
              `Lượt đầu tiên sẽ xuất hiện ngẫu nhiên trước <t:${Math.floor(nextGameAt / 1000)}:R>.`,
            ].join('\n'),
          ),
        ],
      });
    }

    if (subcommand === 'disable') {
      await disableCommunityMinesweeper(interaction.client, interaction.guildId);

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Đã Tắt Săn Mìn Cộng Đồng', 'Bot sẽ không tạo thêm lượt săn mìn mới trong máy chủ này.')],
      });
    }

    const config = await getCommunityMinesweeperConfig(interaction.client, interaction.guildId);

    if (!config.enabled) {
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [infoEmbed('Săn Mìn Cộng Đồng', 'Trò chơi hiện chưa được bật. Dùng `/caidatmin setup` để cấu hình.')],
      });
    }

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'Săn Mìn Cộng Đồng',
          [
            `Kênh: <#${config.channelId}>`,
            `Chu kỳ: **${formatMinesweeperInterval(config.intervalMs)}**`,
            config.nextGameAt
              ? `Lượt tiếp theo: <t:${Math.floor(config.nextGameAt / 1000)}:R>`
              : 'Lượt tiếp theo đang được lên lịch.',
            'Tổng thưởng mỗi lượt: **$20,000**.',
          ].join('\n'),
        ),
      ],
    });
  },
};