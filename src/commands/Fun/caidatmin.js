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
  parseMinesweeperInterval,
} from '../../services/communityMinesweeperService.js';

const MIN_MINE_COUNT = 1;
const MAX_MINE_COUNT = 24;
const MIN_TOTAL_REWARD = 100;
const MAX_TOTAL_REWARD = 100_000_000;

export default {
  data: new SlashCommandBuilder()
    .setName('caidatmin')
    .setDescription('Cài đặt trò chơi dò mìn cộng đồng')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Đặt kênh, chu kỳ, số mìn và tổng thưởng')
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
      const mineCount = interaction.options.getInteger('mines');
      const totalReward = interaction.options.getInteger('reward');
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

      const { nextGameAt } = await configureCommunityMinesweeper(
        interaction.client,
        interaction.guildId,
        channel.id,
        intervalMs,
        mineCount,
        totalReward,
      );

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Đã Cài Đặt Săn Mìn Cộng Đồng',
            [
              `Kênh trò chơi: ${channel}`,
              `Chu kỳ: **${formatMinesweeperInterval(intervalMs)}**`,
              `Số mìn: **${mineCount}**`,
              `Tổng thưởng mỗi lượt: **$${totalReward.toLocaleString('en-US')}**`,
              'Người chơi chỉ được cộng wallet khi mở hết ô an toàn. Dẫm mìn sẽ hủy toàn bộ thưởng của lượt đó.',
              `Lượt đầu tiên sẽ xuất hiện <t:${Math.floor(nextGameAt / 1000)}:R>.`,
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
            `Chu kỳ: **${formatMinesweeperInterval(config.intervalMs)}**`,
            `Số mìn: **${config.mineCount}**`,
            `Tổng thưởng mỗi lượt: **$${config.totalReward.toLocaleString('en-US')}**`,
            config.nextGameAt
              ? `Lượt tiếp theo: <t:${Math.floor(config.nextGameAt / 1000)}:R>`
              : 'Lượt tiếp theo đang được lên lịch.',
            'Dẫm mìn sẽ kết thúc lượt và hủy toàn bộ thưởng tạm giữ.',
          ].join('\n'),
        ),
      ],
    });
  },
};