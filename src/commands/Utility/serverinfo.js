import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Xem thông tin chi tiết về server"),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`ServerInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'serverinfo'
      });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

    const embed = createEmbed({ title: `Thông Tin Server: ${guild.name}`, description: `ID Server: ${guild.id}` })
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Chủ Sở Hữu", value: owner.user.tag, inline: true },
        { name: "Thành Viên", value: `${guild.memberCount}`, inline: true },
        {
          name: "Kênh",
          value: `${guild.channels.cache.size}`,
          inline: true,
        },
        { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
        {
          name: "Boosts",
          value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})`,
          inline: true,
        },
        {
          name: "Ngày Tạo",
          value: `<t:${createdTimestamp}:R>`,
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`ServerInfo command executed`, {
      userId: interaction.user.id,
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount
    });
  },
};