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
 * Enhanced with beautiful visual effects: gradients, shadows, glows
 * Background: dicebg.png
 */
async function createCombinedDiceImage(diceResults, diceDir, total, isTai) {
  const DICE_SIZE = 220;
  const GAP = 40;
  const CANVAS_WIDTH = DICE_SIZE * 3 + GAP * 2 + 80;
  const CANVAS_HEIGHT = DICE_SIZE + 220;

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  // ===== BACKGROUND: dicebg.png =====
  // Load and draw the background image, scaled to fill canvas
  const bgImagePath = path.join(diceDir, 'dicebg.png');
  try {
    const bgImage = await loadImage(bgImagePath);
    // Draw background image covering entire canvas (scale to fill)
    ctx.drawImage(bgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } catch (err) {
    // Fallback: purple gradient if image fails to load
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#1a0a2e');
    bgGradient.addColorStop(0.3, '#2d1b4e');
    bgGradient.addColorStop(0.6, '#3d1a5c');
    bgGradient.addColorStop(1, '#1a0a2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // Dark overlay to make text/elements pop (semi-transparent dark purple)
  const overlayGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  overlayGradient.addColorStop(0, 'rgba(10, 5, 20, 0.6)');
  overlayGradient.addColorStop(0.5, 'rgba(20, 10, 40, 0.5)');
  overlayGradient.addColorStop(1, 'rgba(10, 5, 20, 0.7)');
  ctx.fillStyle = overlayGradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle radial glow in center (purple/pink) - on top of overlay
  const centerGlow = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 1.5);
  centerGlow.addColorStop(0, 'rgba(180, 100, 255, 0.15)');
  centerGlow.addColorStop(0.5, 'rgba(255, 100, 200, 0.08)');
  centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Decorative top accent line (purple/pink)
  const topAccent = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  topAccent.addColorStop(0, 'transparent');
  topAccent.addColorStop(0.5, '#b864ff');
  topAccent.addColorStop(1, 'transparent');
  ctx.fillStyle = topAccent;
  ctx.fillRect(CANVAS_WIDTH * 0.15, 8, CANVAS_WIDTH * 0.7, 2);

  // ===== TITLE "KẾT QUẢ" WITH PURPLE GLOW =====
  const titleY = 25;
  const titleText = 'KẾT QUẢ';
  
  // Title glow using shadow
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#b864ff';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Main title with purple/pink gradient
  const titleGradient = ctx.createLinearGradient(0, titleY, 0, titleY + 50);
  titleGradient.addColorStop(0, '#f0e6ff');
  titleGradient.addColorStop(0.3, '#d4a5ff');
  titleGradient.addColorStop(0.7, '#b864ff');
  titleGradient.addColorStop(1, '#ff64c8');
  ctx.fillStyle = titleGradient;
  ctx.fillText(titleText, CANVAS_WIDTH / 2, titleY);
  
  // Reset shadow
  ctx.shadowBlur = 0;

  // Title underline with purple gradient
  const underlineGradient = ctx.createLinearGradient(CANVAS_WIDTH / 2 - 100, 0, CANVAS_WIDTH / 2 + 100, 0);
  underlineGradient.addColorStop(0, 'transparent');
  underlineGradient.addColorStop(0.5, '#b864ff');
  underlineGradient.addColorStop(1, 'transparent');
  ctx.strokeStyle = underlineGradient;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2 - 100, 78);
  ctx.lineTo(CANVAS_WIDTH / 2 + 100, 78);
  ctx.stroke();

  // Subtle particles/dots near title (purple)
  ctx.fillStyle = 'rgba(184, 100, 255, 0.4)';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 120;
    const px = CANVAS_WIDTH / 2 + Math.cos(angle) * radius;
    const py = 50 + Math.sin(angle) * 20;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== DICE WITH SHADOWS (NO REFLECTION - REMOVED BLACK BOX) =====
  const diceY = 78;
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
      
      // REMOVED: Reflection that caused black box
      
    } catch (err) {
      // Fallback with purple theme styling
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x + diceShadowOffset, diceY + diceShadowOffset, DICE_SIZE, DICE_SIZE);
      
      // Dice body with purple gradient
      const diceGrad = ctx.createLinearGradient(x, diceY, x, diceY + DICE_SIZE);
      diceGrad.addColorStop(0, '#2d1b4e');
      diceGrad.addColorStop(0.5, '#1f1035');
      diceGrad.addColorStop(1, '#150a25');
      ctx.fillStyle = diceGrad;
      ctx.fillRect(x, diceY, DICE_SIZE, DICE_SIZE);
      
      // Border glow (purple)
      ctx.strokeStyle = '#b864ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#b864ff';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x + 2, diceY + 2, DICE_SIZE - 4, DICE_SIZE - 4);
      ctx.shadowBlur = 0;
      
      // Number
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 100px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#b864ff';
      ctx.shadowBlur = 15;
      ctx.fillText(value.toString(), x + DICE_SIZE / 2, diceY + DICE_SIZE / 2);
      ctx.shadowBlur = 0;
    }
  }

  // ===== RESULT PANEL (REDESIGNED - COMPACT, ROUNDED, WITH BADGE) =====
  const dice1 = diceResults[0];
  const dice2 = diceResults[1];
  const dice3 = diceResults[2];

  // Result panel - positioned up, compact, and not touching the edges
  const panelY = diceY + DICE_SIZE + 28;
  const panelHeight = 62;
  const panelWidth = CANVAS_WIDTH * 0.76;
  const panelX = (CANVAS_WIDTH - panelWidth) / 2;

  // Panel shadow (soft drop)
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 4;

  // Rounded panel background with purple/pink gradient
  const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
  panelGrad.addColorStop(0, 'rgba(184, 100, 255, 0.25)');
  panelGrad.addColorStop(0.5, 'rgba(255, 100, 200, 0.15)');
  panelGrad.addColorStop(1, 'rgba(184, 100, 255, 0.12)');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
  ctx.fill();
  ctx.restore();

  // Panel border - purple/pink gradient with glow
  ctx.save();
  const borderGrad2 = ctx.createLinearGradient(panelX, panelY, panelX + panelWidth, panelY);
  borderGrad2.addColorStop(0, '#b864ff');
  borderGrad2.addColorStop(0.5, '#ff64c8');
  borderGrad2.addColorStop(1, '#b864ff');
  ctx.strokeStyle = borderGrad2;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#b864ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
  ctx.stroke();
  ctx.restore();

  // LEFT: dice values + total (white with purple glow)
  const textY = panelY + (panelHeight - 36) / 2;
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const leftText = `${dice1} · ${dice2} · ${dice3} = ${total}`;
  const leftX = panelX + 22;

  ctx.shadowColor = 'rgba(184, 100, 255, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(leftText, leftX, textY);
  ctx.shadowBlur = 0;

  // RIGHT: TÀI / XỈU pill badge
  const badgeText = isTai ? 'TÀI' : 'XỈU';
  const badgeColor = isTai ? '#00ff88' : '#ff4444';
  const badgeBg = isTai ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 68, 68, 0.15)';

  ctx.font = 'bold 22px Arial';
  const badgeTextWidth = ctx.measureText(badgeText).width;
  const badgePaddingX = 18;
  const badgeHeight = 36;
  const badgeWidth = badgeTextWidth + badgePaddingX * 2;
  const badgeX = panelX + panelWidth - badgeWidth - 16;
  const badgeY = panelY + (panelHeight - badgeHeight) / 2;

  // Badge background (pill shape with glow)
  ctx.save();
  ctx.shadowColor = badgeColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fill();
  ctx.restore();

  // Badge border
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();

  // Badge text
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = badgeColor;
  ctx.shadowBlur = 10;
  ctx.fillStyle = badgeColor;
  ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1);
  ctx.shadowBlur = 0;

  // Divider line between left text and badge
  const dividerX = badgeX - 14;
  ctx.strokeStyle = 'rgba(184, 100, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, panelY + 12);
  ctx.lineTo(dividerX, panelY + panelHeight - 12);
  ctx.stroke();

  // Decorative corner dots on panel
  ctx.fillStyle = 'rgba(184, 100, 255, 0.8)';
  const cornerDots = [
    { x: panelX + 14, y: panelY + 14 },
    { x: panelX + panelWidth - 14, y: panelY + 14 },
    { x: panelX + 14, y: panelY + panelHeight - 14 },
    { x: panelX + panelWidth - 14, y: panelY + panelHeight - 14 },
  ];
  for (const dot of cornerDots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Decorative sparkles around panel (purple/pink)
  ctx.fillStyle = 'rgba(184, 100, 255, 0.6)';
  const sparkleCount = isTai ? 10 : 7;
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (i / sparkleCount) * Math.PI * 2;
    const radius = 300;
    const sx = CANVAS_WIDTH / 2 + Math.cos(angle) * radius;
    const sy = panelY + panelHeight / 2 + Math.sin(angle) * 32;
    const size = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}
