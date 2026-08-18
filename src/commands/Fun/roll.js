import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Tung 3 xúc xắc'),

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
      title: '🎲 Đang Tung Xúc Xắc...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: 'attachment://rollthedice.gif',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed], files: [rollingAttachment, ...gifAttachments] });

    await new Promise(resolve => setTimeout(resolve, 8800));

    // Create combined image with all 3 dice side by side using PNG files
    const combinedBuffer = await createCombinedDiceImage(diceResults, diceDir, total, isTai);
    const combinedAttachment = new AttachmentBuilder(combinedBuffer, { name: 'dice-combined.png' });

    // Final result embed with combined image showing all 3 dice
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc',
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
 * Style matches the clean "TÀI XỈU" sample design
 */
async function createCombinedDiceImage(diceResults, diceDir, total, isTai) {
  const DICE_SIZE = 220;
  const GAP = 40;
  const CANVAS_WIDTH = DICE_SIZE * 3 + GAP * 2 + 80; // Extra padding
  const CANVAS_HEIGHT = DICE_SIZE + 180; // Top title + dice + bottom result (extra padding)

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f0f23');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw title "TÀI XỈU"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('TÀI XỈU', CANVAS_WIDTH / 2, 25);

  // Draw underline below title
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2 - 80, 75);
  ctx.lineTo(CANVAS_WIDTH / 2 + 80, 75);
  ctx.stroke();

  // Load and draw each die using PNG files
  const diceY = 90;
  for (let i = 0; i < 3; i++) {
    const value = diceResults[i];
    const pngPath = path.join(diceDir, `dice${value}.png`);
    const x = 40 + i * (DICE_SIZE + GAP);
    
    try {
      const image = await loadImage(pngPath);
      // Draw die image centered
      ctx.drawImage(image, x, diceY, DICE_SIZE, DICE_SIZE);
    } catch (err) {
      // Fallback: draw a simple colored rectangle with number
      ctx.fillStyle = '#333';
      ctx.fillRect(x, diceY, DICE_SIZE, DICE_SIZE);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, diceY, DICE_SIZE, DICE_SIZE);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 100px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value.toString(), x + DICE_SIZE / 2, diceY + DICE_SIZE / 2);
    }
  }

  // Draw bottom result line: "5 · 2 · 3 = 10 → XỈU"
  const resultY = diceY + DICE_SIZE + 45;
  const dice1 = diceResults[0];
  const dice2 = diceResults[1];
  const dice3 = diceResults[2];
  const resultText = `${dice1} · ${dice2} · ${dice3} = ${total}  →  ${isTai ? 'TÀI' : 'XỈU'}`;
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(resultText, CANVAS_WIDTH / 2, resultY);

  return canvas.toBuffer('image/png');
}
