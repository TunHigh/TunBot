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
  getCommunityMinesweeperConfig,
  isValidMinesweeperMessageThreshold,
} from '../../services/communityMinesweeperService.js';

const DEFAULT_MINE_COUNT = 8;
const MIN_MESSAGE_THRESHOLD = 1;
const MAX_MESSAGE_THRESHOLD = 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('caidatmin')
    .setDescription('Cài đặt trò chơi dò mìn cộng đồng')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Đặt kênh và số tin nhắn')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh văn bản để bot đăng trò chơi')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option
            .setName('messages')
            .setDescription('Số tin nhắn để tự động chạy game (mặc định 10)')
            .setMinValue(MIN_MESSAGE_THRESHOLD)
            .setMaxValue(MAX_MESSAGE_THRESHOLD)
            .setRequired(false),
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

    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      false;

    if (!isAdmin) {
      return replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Chỉ **Admin** mới có thể dùng lệnh này.',
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const mineCount = DEFAULT_MINE_COUNT;
      const messageThreshold = interaction.options.getInteger('messages') || 10;

      if (!channel?.isTextBased?.() || channel.type !== ChannelType.GuildText) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Vui lòng chọn một kênh văn bản hợp lệ.',
        });
      }

      if (!isValidMinesweeperMessageThreshold(messageThreshold)) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: `Số tin nhắn phải từ **${MIN_MESSAGE_THRESHOLD}** đến **${MAX_MESSAGE_THRESHOLD}**.`,
        });
      }

      // Use a default interval of 1 hour since we're not using time-based scheduling anymore
      const intervalMs = 60 * 60 * 1000; // 1 hour default
      const { nextGameAt } = await configureCommunityMinesweeper(
        interaction.client,
        interaction.guildId,
        channel.id,
        intervalMs,
        mineCount,
        0, // totalReward is now ignored, using random 1k-40k per cell
        messageThreshold,
      );

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Đã Cài Đặt Săn Mìn Cộng Đồng',
            [
              `Kênh trò chơi: ${channel}`,
              `Số mìn: **${mineCount}**`,
              `Thưởng mỗi ô tiền: **$1.000 - $40.000** (ngẫu nhiên)`,
              `Số tin nhắn để chạy game: **${messageThreshold}**`,
              'Người đầu tiên mở ô tiền hoặc lượt quay sẽ nhận kết quả và hòm quà đóng lại. Dẫm mìn sẽ hủy toàn bộ phần thưởng.',
              'Game sẽ tự động chạy khi đủ số tin nhắn trong kênh.',
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
        embeds: [infoEmbed('Dò Mìn Cộng Đồng', 'Trò chơi hiện chưa được bật. Dùng `/caidatmin setup` để cấu hình.')],
      });
    }

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'Săn Mìn Cộng Đồng',
          [
            `Kênh: <#${config.channelId}>`,
            `Số mìn: **${DEFAULT_MINE_COUNT}**`,
            `Thưởng mỗi ô tiền: **$1.000 - $40.000** (ngẫu nhiên)`,
            `Số tin nhắn để chạy game: **${config.messageThreshold}**`,
            'Người đầu tiên mở ô tiền hoặc lượt quay sẽ nhận kết quả và hòm quà đóng lại. Dẫm mìn sẽ hủy toàn bộ phần thưởng.',
          ].join('\n'),
        ),
      ],
    });
  },
};
