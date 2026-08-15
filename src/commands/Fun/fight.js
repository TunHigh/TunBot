import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Bắt đầu một trận chiến 1v1 mô phỏng bằng văn bản.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("Người bạn muốn đấu.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ Thử Thách Không Hợp Lệ",
        `**${challenger.username}**, bạn không thể tự đánh mình được! Đó là hòa ngay từ đầu rồi.`
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ Đối Thủ Không Hợp Lệ",
        "Bạn không thể đánh bot! Hãy thách đấu một người thật khác nhé."
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];
    log.push(
      `💥 **${challenger.username}** thách đấu **${opponent.username}**! (Đấu ${rounds} hiệp)`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker = rand(0, 1) === 0 ? challenger : opponent;
      const target = attacker.id === challenger.id ? opponent : challenger;
      const action = [
        "tung một cú đấm hoang dã",
        "ra đòn chí mạng",
        "niệm một phép yếu",
        "đỡ đòn và phản công",
      ][rand(0, 3)];
      log.push(
        `\n**Hiệp ${i}:** ${attacker.username} ${action} trúng ${target.username} gây ${rand(1, damage)} sát thương!`,
      );
    }

    const outcomeText = log.join("\n");
    const winnerText = `👑 **${winner.username}** đã đánh bại ${loser.username} và giành chiến thắng!`;
    const fullDescription = `${outcomeText}\n\n${winnerText}`;

    const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
      ? fullDescription
      : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 Trận Đấu Kết Thúc!",
      description
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
  },
};