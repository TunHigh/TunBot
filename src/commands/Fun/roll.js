import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getDiceRenderer } from '../../utils/diceRenderer.js';

// Unicode dice faces - Discord renders these as actual dice images
const DICE_EMOJIS = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

// Initialize dice renderer (singleton)
const diceRenderer = getDiceRenderer({
  diceSize: 100,
  spacing: 15,
  frameCount: 25,
  fps: 25,
});

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

    // Generate procedural 3D dice rolling animation GIF
    // Using a seed based on the results for consistent animation
    const seed = Date.now();
    const gifBuffer = await diceRenderer.renderRollAnimation(diceResults, seed);
    
    // Create attachment from generated GIF
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'dice-roll.gif' });

    // Show rolling animation with generated GIF
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc 3 xúc xắc 3D...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: 'attachment://dice-roll.gif',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed], files: [attachment] });

    // Let the animation play for ~1.5 seconds (25 frames @ 25fps = 1s, plus buffer)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Build dice emoji display (3 dice side by side)
    const diceEmojiDisplay = diceResults.map(d => DICE_EMOJIS[d]).join('  ');

    // Final result embed with actual dice emojis
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc (3D Procedural)',
      description: `**${diceEmojiDisplay}**\n\n**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `${DICE_EMOJIS[diceResults[0]]} **${diceResults[0]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `${DICE_EMOJIS[diceResults[1]]} **${diceResults[1]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `${DICE_EMOJIS[diceResults[2]]} **${diceResults[2]}**`,
          inline: true,
        },
      ],
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10 | Rendered with @napi-rs/canvas' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], files: [] });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};