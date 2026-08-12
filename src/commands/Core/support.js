import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Nhận liên kết đến máy chủ hỗ trợ"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Tham Gia Máy Chủ Hỗ Trợ")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Cần Giúp Đỡ?", description: "Tham gia máy chủ hỗ trợ chính thức của chúng mình để nhận trợ giúp, báo lỗi hoặc gợi ý tính năng. Nếu bạn đang tùy chỉnh bot này, hãy nhớ đổi liên kết trong mã nhé!" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'Lỗi Hệ Thống', description: 'Không thể hiển thị thông tin hỗ trợ.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};