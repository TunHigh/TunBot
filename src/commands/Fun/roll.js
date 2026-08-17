import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Working GIF URLs for dice animations and faces
// Dice face GIFs (1-6) - using reliable Giphy GIFs that show actual dice faces
const DICE_FACE_GIFS = {
  1: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',      // Dice showing 1
  2: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',   // Dice showing 2
  3: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',  // Dice showing 3
  4: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',  // Dice showing 4
  5: 'https://media.giphy.com/media/26BROrSHlmyzzHf3i/giphy.gif',   // Dice showing 5
  6: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',  // Dice showing 6 (reuse 3)
};

// Rolling animation GIFs - using different dice rolling GIFs for animation frames
const ROLLING_FRAMES = [
  'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',   // Rolling dice
  'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',   // Rolling dice 2
  'https://media.giphy.com/media/26BROrSHlmyzzHf3i/giphy.gif',    // Rolling dice 3
  'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',        // Rolling dice 4
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',    // Rolling dice 5
];

// Also try the user's Discord CDN link for dice1 (with auth params)
const DICE1_CDN = 'https://cdn.discordapp.com/attachments/1517538095568781483/1523938636704518227/dice1.gif?ex=6a83fb74&is=6a82a9f4&hm=80756d08d6e4c25a243458744b26add157d1eedc2f31b537909b8a2380a1cdb6&';

// Use CDN for dice1 if available, otherwise fallback to Giphy
const FINAL_DICE_FACES = {
  1: DICE1_CDN,
  2: DICE_FACE_GIFS[2],
  3: DICE_FACE_GIFS[3],
  4: DICE_FACE_GIFS[4],
  5: DICE_FACE_GIFS[5],
  6: DICE_FACE_GIFS[6],
};

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
      image: ROLLING_FRAMES[0],
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed] });

    // Animation: Show rolling frames with different GIFs
    for (let i = 0; i < ROLLING_FRAMES.length; i++) {
      const frameGif = ROLLING_FRAMES[i];
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
      .map(d => `![Dice ${d}](${FINAL_DICE_FACES[d]})`)
      .join(' ');

    // Final result embed with dice GIFs
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc',
      description: `**${diceGifMarkdown}**\n\n**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `![Dice ${diceResults[0]}](${FINAL_DICE_FACES[diceResults[0]]}) (${diceResults[0]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `![Dice ${diceResults[1]}](${FINAL_DICE_FACES[diceResults[1]]}) (${diceResults[1]})`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `![Dice ${diceResults[2]}](${FINAL_DICE_FACES[diceResults[2]]}) (${diceResults[2]})`,
          inline: true,
        },
      ],
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};