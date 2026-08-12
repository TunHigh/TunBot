import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Xem thông tin chi tiết về người dùng")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Người dùng cần xem (mặc định là bạn)"),
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`UserInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const embed = createEmbed({ title: `Thông Tin Người Dùng: ${user.username}` })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Có" : "Không", inline: true },
        {
          name: "Roles",
          value:
            member && member.roles.cache.size > 1
              ? member.roles.cache
                  .map((r) => r.name)
                  .slice(0, 5)
                  .join(",")
              : "Không có",
          inline: true,
        },
        {
          name: "Tạo Tài Khoản",
          value: `<t:${createdTimestamp}:R>`,
          inline: false,
        },
        {
          name: "Vào Server",
          value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Không ở trong server",
          inline: false,
        },
        {
          name: "Role Cao Nhất",
          value: member?.roles?.highest?.name || "Không có",
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`UserInfo command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  },
};