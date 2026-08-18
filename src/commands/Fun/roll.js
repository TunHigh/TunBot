import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import path from 'path';

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Tung 3 xúc xắc kiểu Tài Xỉu (3d6)'),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    // Roll 3 dice (1-6 each) FIRST - so we know the final result for animation
    const diceResults = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];

    const total = diceResults.reduce((sum, val) => sum + val, 0);
    const isTai = total >= 11;
    const resultText = isTai ? '🟢 **TÀI**' : '🔴 **XỈU**';
    const resultColor = isTai ? 'success' : 'error';

    // Path to dice GIFs
    const diceDir = path.join(process.cwd(), 'src', 'assets', 'dice');

    // Create attachments for the 3 dice GIFs (rolling animation for each face)
    const attachments = diceResults.map((value, index) => {
      const gifPath = path.join(diceDir, `dice${value}.gif`);
      return new AttachmentBuilder(gifPath, { name: `dice${index + 1}.gif` });
    });

    // Show rolling animation with the 3 dice GIFs
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc 3 xúc xắc...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: 'attachment://dice1.gif', // Show first die as preview
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed], files: attachments });

    // Let the animation play (GIFs are ~2-3 seconds each)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Final result embed with all 3 dice GIFs
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc (Tài Xỉu)',
      description: `**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `**${diceResults[0]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `**${diceResults[1]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `**${diceResults[2]}**`,
          inline: true,
        },
      ],
      image: 'attachment://dice1.gif', // Show first die in embed
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], files: attachments });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};
