import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// GIF URLs for dice animations and faces
const DICE_GIFS = {
  // Rolling animation GIF
  rolling: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
  // Dice face GIFs (1-6)
  faces: {
    1: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
    2: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    3: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
    4: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',
    5: 'https://media.giphy.com/media/26BROrSHlmyzzHf3i/giphy.gif',
    6: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
  },
  // Alternative dice face GIFs (more distinct)
  facesAlt: {
    1: 'https://i.gifer.com/7QXh.gif',
    2: 'https://i.gifer.com/7QXi.gif',
    3: 'https://i.gifer.com/7QXj.gif',
    4: 'https://i.gifer.com/7QXk.gif',
    5: 'https://i.gifer.com/7QXl.gif',
    6: 'https://i.gifer.com/7QXm.gif',
  },
};

// Use alternative set which has more distinct faces
const DICE_FACE_GIFS = DICE_GIFS.facesAlt;
const ROLLING_GIF = DICE_GIFS.rolling;

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Tung 3 xúc xắc kiểu Tài Xỉu (3d6)'),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    // Initial rolling message with animated GIF
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc xúc xắc...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: ROLLING_GIF,
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed] });

    // Animation: Show rolling frames with different GIFs
    const rollingFrames = [
      'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
      'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',
      'https://media.giphy.com/media/26BROrSHlmyzzHf3i/giphy.gif',
      'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
      'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    ];

    for (let i = 0; i < rollingFrames.length; i++) {
      const frameGif = rollingFrames[i];
      const animEmbed = createEmbed({
        title: '🎲 Đang lắc xúc xắc...',
        description: '🎲 🎲 🎲',
        color: 'primary',
        image: frameGif,
      });
      await InteractionHelper.safeEditReply(interaction, { embeds: [animEmbed] });
      await new Promise(resolve => setTimeout(resolve, 400));
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

    // Build dice GIF markdown for description (3 dice side by side)
    const diceGifMarkdown = diceResults
      .map(d => `![Dice ${d}](${DICE_FACE_GIFS[d]})`)
      .join(' ');

    // Final result embed with dice GIFs
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc',
      description: `**${diceGifMarkdown}**\n\n**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `![Dice ${diceResults[0]}](${DICE_FACE_GIFS[diceResults[0]]}) (${diceResults[0]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `![Dice ${diceResults[1]}](${DICE_FACE_GIFS[diceResults[1]]}) (${diceResults[1]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `![Dice ${diceResults[2]}](${DICE_FACE_GIFS[diceResults[2]]}) (${diceResults[2]})`,
          inline: true,
        },
      ],
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};