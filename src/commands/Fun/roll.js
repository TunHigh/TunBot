import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

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

    // Path to dice assets
    const diceDir = path.join(process.cwd(), 'src', 'assets', 'dice');

    // Create attachments for the 3 dice GIFs (rolling animation for each face)
    const gifAttachments = diceResults.map((value, index) => {
      const gifPath = path.join(diceDir, `dice${value}.gif`);
      return new AttachmentBuilder(gifPath, { name: `dice${index + 1}.gif` });
    });

    // Rolling animation GIF (rollthedice.gif)
    const rollingGifPath = path.join(diceDir, 'rollthedice.gif');
    const rollingAttachment = new AttachmentBuilder(rollingGifPath, { name: 'rollthedice.gif' });

    // Show rolling animation with rollthedice.gif
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc 3 xúc xắc...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: 'attachment://rollthedice.gif',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed], files: [rollingAttachment, ...gifAttachments] });

    // Wait for GIFs to finish playing (~9.3 seconds)
    await new Promise(resolve => setTimeout(resolve, 9300));

    // Create combined image with all 3 dice side by side using PNG files
    const combinedBuffer = await createCombinedDiceImage(diceResults, diceDir, total, isTai);
    const combinedAttachment = new AttachmentBuilder(combinedBuffer, { name: 'dice-combined.png' });

    // Final result embed with combined image showing all 3 dice
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
      image: 'attachment://dice-combined.png',
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    // Send combined image + all 3 GIFs as attachments
    await InteractionHelper.safeEditReply(interaction, { 
      embeds: [resultEmbed], 
      files: [combinedAttachment, ...gifAttachments] 
    });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};

/**
 * Create a combined image with 3 dice side by side using PNG files
 */
async function createCombinedDiceImage(diceResults, diceDir, total, isTai) {
  const DICE_SIZE = 200;
  const GAP = 20;
  const CANVAS_WIDTH = DICE_SIZE * 3 + GAP * 2;
  const CANVAS_HEIGHT = DICE_SIZE + 80; // Extra space for labels and result

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dark background matching the sample
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Load and draw each die using PNG files (static final face)
  for (let i = 0; i < 3; i++) {
    const value = diceResults[i];
    const pngPath = path.join(diceDir, `dice${value}.png`);
    
    try {
      const image = await loadImage(pngPath);
      const x = i * (DICE_SIZE + GAP);
      const y = 10;
      
      // Draw die image
      ctx.drawImage(image, x, y, DICE_SIZE, DICE_SIZE);
      
      // Draw label below each die
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Xúc xắc ${i + 1}: ${value}`, x + DICE_SIZE / 2, DICE_SIZE + 45);
    } catch (err) {
      // Fallback: draw a simple colored rectangle with number
      const x = i * (DICE_SIZE + GAP);
      const y = 10;
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, DICE_SIZE, DICE_SIZE);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, DICE_SIZE, DICE_SIZE);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value.toString(), x + DICE_SIZE / 2, y + DICE_SIZE / 2);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText(`Xúc xắc ${i + 1}`, x + DICE_SIZE / 2, DICE_SIZE + 20);
    }
  }

  // Draw total and result at bottom
  ctx.fillStyle = isTai ? '#00ff88' : '#ff4444';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Tổng: ${total} → ${isTai ? 'TÀI' : 'XỈU'}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 15);

  return canvas.toBuffer('image/png');
}
