import { createCanvas, loadImage } from '@napi-rs/canvas';
import canvas from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const { registerFont } = canvas;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CARD_WIDTH = 900;
const CARD_HEIGHT = 400;
const AVATAR_SIZE = 120;
const AVATAR_MARGIN = 40;
const PROGRESS_BAR_HEIGHT = 24;
const PROGRESS_BAR_WIDTH = 520;
const MILESTONES = [1, 5, 15, 30, 60, 90, 120, 150, 180];

// Colors
const OCEAN_DARK = '#0a1628';
const OCEAN_MID = '#112240';
const OCEAN_LIGHT = '#1e3a5f';
const ACCENT_CYAN = '#00d4ff';
const ACCENT_GOLD = '#ffd700';
const ACCENT_ORANGE = '#ff8c00';
const TEXT_WHITE = '#ffffff';
const TEXT_MUTED = '#8892a6';
const PROGRESS_BG = '#0d1b2a';
const PROGRESS_FILL = '#00d4ff';
const AVATAR_BORDER = '#00d4ff';

let fontLoaded = false;

async function ensureFont() {
  if (fontLoaded) return;
  try {
    // Try to register a system font that supports Vietnamese
    const fontPaths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      'C:\\Windows\\Fonts\\segoeui.ttf',
      'C:\\Windows\\Fonts\\arial.ttf',
    ];
    for (const fontPath of fontPaths) {
      try {
        registerFont(fontPath, { family: 'StreakFont' });
        fontLoaded = true;
        return;
      } catch {
        // continue
      }
    }
    // Fallback: canvas will use default font
    fontLoaded = true;
  } catch {
    fontLoaded = true;
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawOceanBackground(ctx) {
  // Base gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  gradient.addColorStop(0, OCEAN_DARK);
  gradient.addColorStop(0.5, OCEAN_MID);
  gradient.addColorStop(1, OCEAN_LIGHT);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle wave lines
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const y = 40 + i * 45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= CARD_WIDTH; x += 20) {
      const waveY = y + Math.sin((x * 0.02) + (i * 0.5)) * 8;
      ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }

  // Light rays from top
  const rayGradient = ctx.createRadialGradient(CARD_WIDTH * 0.8, -100, 0, CARD_WIDTH * 0.8, -100, CARD_WIDTH * 1.2);
  rayGradient.addColorStop(0, 'rgba(0, 212, 255, 0.06)');
  rayGradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
  ctx.fillStyle = rayGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

async function drawAvatar(ctx, avatarUrl, x, y, size, borderColor = AVATAR_BORDER) {
  try {
    const image = await loadImage(avatarUrl);
    ctx.save();
    // Clip to circle
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();

    // Border ring
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  } catch {
    // Fallback: draw placeholder circle
    ctx.fillStyle = OCEAN_MID;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawProgressBar(ctx, x, y, width, height, progress, label, requirement) {
  // Background
  ctx.fillStyle = PROGRESS_BG;
  drawRoundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();

  // Fill
  const fillWidth = Math.max(0, Math.min(width, width * progress));
  if (fillWidth > 0) {
    const fillGradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
    fillGradient.addColorStop(0, ACCENT_CYAN);
    fillGradient.addColorStop(1, '#0099cc');
    ctx.fillStyle = fillGradient;
    drawRoundedRect(ctx, x, y, fillWidth, height, height / 2);
    ctx.fill();
  }

  // Label
  ctx.font = 'bold 13px "StreakFont", sans-serif';
  ctx.fillStyle = TEXT_WHITE;
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 6);

  // Requirement text
  ctx.font = '12px "StreakFont", sans-serif';
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(requirement, x + width, y - 6);
}

function drawMilestoneMarkers(ctx, x, y, width, currentStreak) {
  const markerRadius = 6;
  const markerY = y + PROGRESS_BAR_HEIGHT / 2;

  ctx.font = '10px "StreakFont", sans-serif';
  ctx.textAlign = 'center';

  for (const milestone of MILESTONES) {
    const markerX = x + (milestone / 180) * width;
    const reached = currentStreak >= milestone;

    // Line from marker to bar
    ctx.strokeStyle = reached ? ACCENT_GOLD : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(markerX, markerY);
    ctx.lineTo(markerX, y - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marker circle
    ctx.fillStyle = reached ? ACCENT_GOLD : OCEAN_MID;
    ctx.strokeStyle = reached ? ACCENT_GOLD : TEXT_MUTED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Milestone number above
    ctx.fillStyle = reached ? ACCENT_GOLD : TEXT_MUTED;
    ctx.fillText(`${milestone}`, markerX, y - 26);
  }
}

function drawStreakFlame(ctx, x, y, size, streak) {
  // Simple flame icon using paths
  const colors = streak >= 150 ? ['#ff6b00', '#ffd700', '#fff8dc'] :
                 streak >= 90 ? ['#ff8c00', '#ffd700', '#fff8dc'] :
                 streak >= 30 ? ['#ffa500', '#ffd700', '#fff8dc'] :
                 ['#ff4500', '#ff8c00', '#ffd700'];

  for (let i = 0; i < 3; i++) {
    const scale = 1 - i * 0.15;
    const flameSize = size * scale;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x - flameSize * 0.4, y - flameSize * 0.3,
      x - flameSize * 0.5, y - flameSize * 0.8,
      x, y - flameSize
    );
    ctx.bezierCurveTo(
      x + flameSize * 0.5, y - flameSize * 0.8,
      x + flameSize * 0.4, y - flameSize * 0.3,
      x, y
    );
    ctx.fill();
  }
}

export async function generateStreakCard({
  user1,
  user2,
  currentStreak,
  longestStreak,
  viewerProgress,
  otherProgress,
  requirements,
  date,
}) {
  await ensureFont();

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  drawOceanBackground(ctx);

  // Card container with subtle border
  const cardX = 20;
  const cardY = 20;
  const cardW = CARD_WIDTH - 40;
  const cardH = CARD_HEIGHT - 40;
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  // Inner glow
  const innerGlow = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  innerGlow.addColorStop(0, 'rgba(0, 212, 255, 0.03)');
  innerGlow.addColorStop(1, 'rgba(0, 212, 255, 0)');
  ctx.fillStyle = innerGlow;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();

  // Avatars
  const avatarY = cardY + 50;
  const leftAvatarX = cardX + AVATAR_MARGIN;
  const rightAvatarX = cardX + cardW - AVATAR_MARGIN - AVATAR_SIZE;

  await drawAvatar(ctx, user1.displayAvatarURL({ extension: 'png', size: 256 }), leftAvatarX, avatarY, AVATAR_SIZE);
  await drawAvatar(ctx, user2.displayAvatarURL({ extension: 'png', size: 256 }), rightAvatarX, avatarY, AVATAR_SIZE);

  // VS text between avatars
  ctx.font = 'bold 20px "StreakFont", sans-serif';
  ctx.fillStyle = ACCENT_CYAN;
  ctx.textAlign = 'center';
  ctx.fillText('VS', CARD_WIDTH / 2, avatarY + AVATAR_SIZE / 2 + 7);

  // Streak counter (center top)
  const streakCenterY = avatarY + AVATAR_SIZE + 30;
  drawStreakFlame(ctx, CARD_WIDTH / 2 - 10, streakCenterY - 25, 28, currentStreak);

  ctx.font = 'bold 48px "StreakFont", sans-serif';
  ctx.fillStyle = ACCENT_GOLD;
  ctx.textAlign = 'center';
  ctx.fillText(`${currentStreak}`, CARD_WIDTH / 2, streakCenterY + 10);

  ctx.font = '16px "StreakFont", sans-serif';
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('ngày liên tiếp', CARD_WIDTH / 2, streakCenterY + 35);

  // Longest streak
  ctx.font = '13px "StreakFont", sans-serif';
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(`Kỷ lục cao nhất: ${longestStreak} ngày`, CARD_WIDTH / 2, streakCenterY + 55);

  // Progress bars section
  const progressStartY = streakCenterY + 90;
  const barX = (CARD_WIDTH - PROGRESS_BAR_WIDTH) / 2;

  // Viewer progress (messages)
  const viewerMsgPct = Math.min(1, viewerProgress.messages / requirements.messages);
  drawProgressBar(
    ctx,
    barX,
    progressStartY,
    PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_HEIGHT,
    viewerMsgPct,
    `💬 ${viewerProgress.messages} / ${requirements.messages} tin nhắn`,
    `Yêu cầu: ${requirements.messages}`,
  );

  // Viewer progress (replies)
  const viewerReplyPct = Math.min(1, viewerProgress.replies / requirements.replies);
  drawProgressBar(
    ctx,
    barX,
    progressStartY + 50,
    PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_HEIGHT,
    viewerReplyPct,
    `↩️ ${viewerProgress.replies} / ${requirements.replies} reply`,
    `Yêu cầu: ${requirements.replies}`,
  );

  // Other user progress (messages)
  const otherMsgPct = Math.min(1, otherProgress.messages / requirements.messages);
  drawProgressBar(
    ctx,
    barX,
    progressStartY + 110,
    PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_HEIGHT,
    otherMsgPct,
    `💬 ${otherProgress.messages} / ${requirements.messages} tin nhắn (đối phương)`,
    `Yêu cầu: ${requirements.messages}`,
  );

  // Other user progress (replies)
  const otherReplyPct = Math.min(1, otherProgress.replies / requirements.replies);
  drawProgressBar(
    ctx,
    barX,
    progressStartY + 160,
    PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_HEIGHT,
    otherReplyPct,
    `↩️ ${otherProgress.replies} / ${requirements.replies} reply (đối phương)`,
    `Yêu cầu: ${requirements.replies}`,
  );

  // Milestone markers on the first progress bar (messages)
  drawMilestoneMarkers(ctx, barX, progressStartY, PROGRESS_BAR_WIDTH, currentStreak);

  // Date
  ctx.font = '11px "StreakFont", sans-serif';
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(`Ngày: ${date}`, CARD_WIDTH - 30, CARD_HEIGHT - 20);

  // Watermark
  ctx.font = '10px "StreakFont", sans-serif';
  ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
  ctx.textAlign = 'left';
  ctx.fillText('TunBot Streak System', 30, CARD_HEIGHT - 20);

  return canvas.toBuffer('image/png');
}