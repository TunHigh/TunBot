import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Dice face emojis
const DICE_FACES = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

// Rolling animation frames
const ROLLING_FRAMES = ['🎲', '🎯', '🎲', '🎯', '🎲'];

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Tung 3 xúc xắc.'),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    // Initial rolling message
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc xúc xắc...',
      description: '🎲 🎲 🎲',
      color: 'primary',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed] });

    // Animation: Show rolling frames
    for (let i = 0; i < ROLLING_FRAMES.length; i++) {
      const frame = ROLLING_FRAMES[i];
      const animEmbed = createEmbed({
        title: '🎲 Đang lắc xúc xắc...',
        description: `${frame} ${frame} ${frame}`,
        color: 'primary',
      });
      await InteractionHelper.safeEditReply(interaction, { embeds: [animEmbed] });
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Roll 3 dice (1-6 each)
    const diceResults = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];

    const total = diceResults.reduce((sum, val) => sum + val, 0);

    // Determine Tài/Xỉu
    // Tài: 11-18, Xỉu: 3-10
    const isTai = total >= 11;
    const resultText = isTai ? '🟢 **TÀI**' : '🔴 **XỈU**';
    const resultColor = isTai ? 'success' : 'error';

    // Final result embed
    const diceEmojis = diceResults.map(d => DICE_FACES[d]).join(' ');
    
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc',
      description: `**${diceEmojis}**\n\n**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `${DICE_FACES[diceResults[0]]} (${diceResults[0]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `${DICE_FACES[diceResults[1]]} (${diceResults[1]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `${DICE_FACES[diceResults[2]]} (${diceResults[2]})`,
          inline: true,
        },
      ],
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};