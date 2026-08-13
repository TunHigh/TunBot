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
  isValidMinesweeperMineCount,
  isValidMinesweeperReward,
  isValidMinesweeperMessageThreshold,
} from '../../services/communityMinesweeperService.js';

const MIN_MINE_COUNT = 1;
const MAX_MINE_COUNT = 24;
const MIN_TOTAL_REWARD = 100;
const MAX_TOTAL_REWARD = 100_000_000;
const MIN_MESSAGE_THRESHOLD = 1;
const MAX_MESSAGE_THRESHOLD = 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('caidatmin')
    .setDescription('Cài đặt trò chơi dò mìn cộng đồng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Đặt kênh, số mìn, tổng thưởng và ngưỡng tin nhắn')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Kênh văn bản để bot đăng trò chơi')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option
            .setName('mines')
            .setDescription('Số mìn trên bảng 5x5')
            .setMinValue(MIN_MINE_COUNT)
            .setMaxValue(MAX_MINE_COUNT)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('reward')
            .setDescription('Tổng tiền thưởng của mỗi lượt')
            .setMinValue(MIN_TOTAL_REWARD)
            .setMaxValue(MAX_TOTAL_REWARD)
            .setRequired(true),
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

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Bạn cần quyền **Quản lý máy chủ** để dùng lệnh này.',
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const mineCount = interaction.options.getInteger('mines');
      const totalReward = interaction.options.getInteger('reward');
      const messageThreshold = interaction.options.getInteger('messages') || 10;

      if (!channel?.isTextBased?.() || channel.type !== ChannelType.GuildText) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: 'Vui lòng chọn một kênh văn bản hợp lệ.',
        });
      }

      if (!isValidMinesweeperMineCount(mineCount)) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: `Số mìn phải từ **${MIN_MINE_COUNT}** đến **${MAX_MINE_COUNT}**.`,
        });
      }

      if (!isValidMinesweeperReward(totalReward)) {
        return replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message: `Tổng thưởng phải từ **$${MIN_TOTAL_REWARD.toLocaleString('en-US')}** đến **$${MAX_TOTAL_REWARD.toLocaleString('en-US')}**.`,
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
        totalReward,
        messageThreshold,
      );

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Đã Cài Đặt Săn Mìn Cộng Đồng',
            [
              `Kênh trò chơi: ${channel}`,
              `Số mìn: **${mineCount}**`,
              `Tổng thưởng mỗi lượt: **$${totalReward.toLocaleString('en-US')}**`,
              `Số tin nhắn để chạy game: **${messageThreshold}**`,
              'Người chơi chỉ được cộng wallet khi mở hết ô an toàn. Dẫm mìn sẽ hủy toàn bộ thưởng của lượt đó.',
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
            `Số mìn: **${config.mineCount}**`,
            `Tổng thưởng mỗi lượt: **$${config.totalReward.toLocaleString('en-US')}**`,
            `Số tin nhắn để chạy game: **${config.messageThreshold}**`,
            'Dẫm mìn sẽ kết thúc lượt và hủy toàn bộ thưởng tạm giữ.',
          ].join('\n'),
        ),
      ],
    });
  },
};
