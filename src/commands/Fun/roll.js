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

    await new Promise(resolve => setTimeout(resolve, 9000));

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
 * Enhanced with beautiful visual effects: gradients, shadows, glows, reflections
 */
async function createCombinedDiceImage(diceResults, diceDir, total, isTai) {
  const DICE_SIZE = 220;
  const GAP = 40;
  const CANVAS_WIDTH = DICE_SIZE * 3 + GAP * 2 + 80;
  const CANVAS_HEIGHT = DICE_SIZE + 180;

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // ===== ENHANCED BACKGROUND =====
  // Multi-layer gradient
  const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  bgGradient.addColorStop(0, '#0d0d1a');
  bgGradient.addColorStop(0.3, '#1a1a3e');
  bgGradient.addColorStop(0.6, '#16213e');
  bgGradient.addColorStop(1, '#0f0f23');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle radial glow in center
  const centerGlow = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 1.5);
  centerGlow.addColorStop(0, 'rgba(255, 215, 0, 0.08)');
  centerGlow.addColorStop(0.5, 'rgba(255, 140, 0, 0.04)');
  centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Decorative top accent line
  const topAccent = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  topAccent.addColorStop(0, 'transparent');
  topAccent.addColorStop(0.5, '#ffd700');
  topAccent.addColorStop(1, 'transparent');
  ctx.fillStyle = topAccent;
  ctx.fillRect(CANVAS_WIDTH * 0.15, 8, CANVAS_WIDTH * 0.7, 2);

  // ===== TITLE WITH GLOW EFFECT =====
  const titleY = 25;
  const titleText = 'TÀI XỈU';
  
  // Title glow using shadow (cleaner than multiple draw calls)
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Main title with gradient
  const titleGradient = ctx.createLinearGradient(0, titleY, 0, titleY + 50);
  titleGradient.addColorStop(0, '#fff8e7');
  titleGradient.addColorStop(0.3, '#ffd700');
  titleGradient.addColorStop(0.7, '#ffaa00');
  titleGradient.addColorStop(1, '#ff8800');
  ctx.fillStyle = titleGradient;
  ctx.fillText(titleText, CANVAS_WIDTH / 2, titleY);
  
  // Reset shadow
  ctx.shadowBlur = 0;

  // Title underline with gradient
  const underlineGradient = ctx.createLinearGradient(CANVAS_WIDTH / 2 - 100, 0, CANVAS_WIDTH / 2 + 100, 0);
  underlineGradient.addColorStop(0, 'transparent');
  underlineGradient.addColorStop(0.5, '#ffd700');
  underlineGradient.addColorStop(1, 'transparent');
  ctx.strokeStyle = underlineGradient;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2 - 100, 78);
  ctx.lineTo(CANVAS_WIDTH / 2 + 100, 78);
  ctx.stroke();

  // Subtle particles/dots near title
  ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 120;
    const px = CANVAS_WIDTH / 2 + Math.cos(angle) * radius;
    const py = 50 + Math.sin(angle) * 20;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== DICE WITH SHADOWS & REFLECTIONS =====
  const diceY = 90;
  const diceShadowOffset = 8;
  const diceShadowBlur = 20;

  for (let i = 0; i < 3; i++) {
    const value = diceResults[i];
    const pngPath = path.join(diceDir, `dice${value}.png`);
    const x = 40 + i * (DICE_SIZE + GAP);
    
    try {
      const image = await loadImage(pngPath);
      
      // Draw dice shadow (soft drop shadow)
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = diceShadowBlur;
      ctx.shadowOffsetX = diceShadowOffset;
      ctx.shadowOffsetY = diceShadowOffset;
      ctx.drawImage(image, x, diceY, DICE_SIZE, DICE_SIZE);
      ctx.restore();
      
      // Draw dice again on top (without shadow) for crisp edges
      ctx.drawImage(image, x, diceY, DICE_SIZE, DICE_SIZE);
      
      // Subtle reflection at bottom of dice
      const reflectionHeight = 30;
      const reflectionGradient = ctx.createLinearGradient(0, diceY + DICE_SIZE, 0, diceY + DICE_SIZE + reflectionHeight);
      reflectionGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      reflectionGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = reflectionGradient;
      ctx.fillRect(x, diceY + DICE_SIZE, DICE_SIZE, reflectionHeight);
      
    } catch (err) {
      // Fallback with enhanced styling
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x + diceShadowOffset, diceY + diceShadowOffset, DICE_SIZE, DICE_SIZE);
      
      // Dice body with gradient
      const diceGrad = ctx.createLinearGradient(x, diceY, x, diceY + DICE_SIZE);
      diceGrad.addColorStop(0, '#2a2a4a');
      diceGrad.addColorStop(0.5, '#1e1e3e');
      diceGrad.addColorStop(1, '#151530');
      ctx.fillStyle = diceGrad;
      ctx.fillRect(x, diceY, DICE_SIZE, DICE_SIZE);
      
      // Border glow
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x + 2, diceY + 2, DICE_SIZE - 4, DICE_SIZE - 4);
      ctx.shadowBlur = 0;
      
      // Number
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 100px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 15;
      ctx.fillText(value.toString(), x + DICE_SIZE / 2, diceY + DICE_SIZE / 2);
      ctx.shadowBlur = 0;
    }
  }

  // ===== RESULT TEXT WITH ENHANCED EFFECTS =====
  const resultY = diceY + DICE_SIZE + 45;
  const dice1 = diceResults[0];
  const dice2 = diceResults[1];
  const dice3 = diceResults[2];
  const resultText = `${dice1} · ${dice2} · ${dice3} = ${total}  →  ${isTai ? 'TÀI' : 'XỈU'}`;
  
  // Result background panel
  const panelY = resultY - 15;
  const panelHeight = 60;
  const panelWidth = CANVAS_WIDTH * 0.85;
  const panelX = (CANVAS_WIDTH - panelWidth) / 2;
  
  // Panel background with gradient
  const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
  panelGrad.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
  panelGrad.addColorStop(0.5, 'rgba(255, 140, 0, 0.1)');
  panelGrad.addColorStop(1, 'rgba(255, 215, 0, 0.05)');
  ctx.fillStyle = panelGrad;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  
  // Panel border
  const borderGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelWidth, panelY);
  borderGrad.addColorStop(0, '#ffd700');
  borderGrad.addColorStop(0.5, '#ff8800');
  borderGrad.addColorStop(1, '#ffd700');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
  
  // Inner glow lines
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 10, panelY);
  ctx.lineTo(panelX + 10, panelY + panelHeight);
  ctx.moveTo(panelX + panelWidth - 10, panelY);
  ctx.lineTo(panelX + panelWidth - 10, panelY + panelHeight);
  ctx.stroke();

  // Result text with glow effect using shadow
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Text glow using shadow
  const glowColor = isTai ? '#00ff88' : '#ff4444';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Main text with gradient
  const textGradient = ctx.createLinearGradient(0, resultY, 0, resultY + 45);
  textGradient.addColorStop(0, '#ffffff');
  textGradient.addColorStop(0.5, '#fff8e7');
  textGradient.addColorStop(1, '#ffd700');
  ctx.fillStyle = textGradient;
  ctx.fillText(resultText, CANVAS_WIDTH / 2, resultY);
  
  // Reset shadow
  ctx.shadowBlur = 0;

  // Decorative sparkles around result (static positions, no animation)
  ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
  const sparkleCount = isTai ? 6 : 4;
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (i / sparkleCount) * Math.PI * 2;
    const radius = 200;
    const sx = CANVAS_WIDTH / 2 + Math.cos(angle) * radius;
    const sy = resultY + 20 + Math.sin(angle) * 30;
    const size = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}
