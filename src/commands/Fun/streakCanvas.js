import {
    createCanvas,
    loadImage,
    GlobalFonts,
} from '@napi-rs/canvas';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    getRequiredMessages,
} from './streakManager.js';

// Register custom TTF font for guaranteed rendering across all operating systems & Docker
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fontPath = path.join(__dirname, '../../assets/fonts/StreakFont.ttf');

try {
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'StreakFont');
        console.log('[STREAK CANVAS] Custom font StreakFont.ttf registered successfully.');
    } else {
        console.warn('[STREAK CANVAS] Custom font not found at:', fontPath);
    }
} catch (error) {
    console.warn('[STREAK CANVAS] Could not register custom font:', error.message);
}

// Load system fonts fallback
try {
    GlobalFonts.loadSystemFonts();
} catch (error) {
    console.warn('[STREAK CANVAS] Could not load system fonts:', error.message);
}

// ============================================================
// DIMENSIONS
// ============================================================

const WIDTH = 1000;
const HEIGHT = 680;

// ============================================================
// HELPERS
// ============================================================

function roundRect(ctx, x, y, width, height, radius) {
    radius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function drawTextWithOutline(
    ctx,
    text,
    x,
    y,
    size,
    align = 'center',
    color = '#ffffff',
    strokeColor = 'rgba(0,0,0,0.85)',
    strokeWidth = 4
) {
    if (text === null || text === undefined || text === '') return;

    ctx.save();
    ctx.font = `bold ${Math.round(size)}px "StreakFont", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    if (strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(String(text), x, y);
    }

    ctx.fillStyle = color;
    ctx.fillText(String(text), x, y);
    ctx.restore();
}

function drawStarPath(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

// Draw 4-point sparkle star at (sx, sy) with given arm length
function draw4PointStar(ctx, sx, sy, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    // long arms
    for (let i = 0; i < 2; i++) {
        const ang = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(ang) * size * 0.28, sy + Math.sin(ang) * size * 0.28);
        ctx.lineTo(sx + Math.cos(ang) * size, sy + Math.sin(ang) * size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(ang) * size * 0.28, sy - Math.sin(ang) * size * 0.28);
        ctx.lineTo(sx - Math.cos(ang) * size, sy - Math.sin(ang) * size);
        ctx.stroke();
    }
    ctx.restore();
}

function drawSparkleField(ctx, cx, cy, reached) {
    if (!reached) return;
    ctx.save();
    // 3 sparkle stars scattered around the icon
    const positions = [
        [cx - 22, cy - 18, 5],
        [cx + 21, cy - 16, 4],
        [cx + 18, cy + 16, 3.5],
    ];
    for (const [sx, sy, size] of positions) {
        draw4PointStar(ctx, sx, sy, size, '#ffe566');
    }
    ctx.restore();
}

function drawMilestoneIcon(ctx, index, x, y, reached) {
    ctx.save();

    // Gradient fill for reached icons
    const makeGrad = () => {
        const g = ctx.createLinearGradient(x, y - 24, x, y + 24);
        g.addColorStop(0, '#ff85d6');
        g.addColorStop(1, '#e0009e');
        return g;
    };

    ctx.fillStyle = reached ? makeGrad() : 'rgba(255, 255, 255, 0.22)';
    ctx.strokeStyle = reached ? 'rgba(255,255,255,0.85)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = reached ? 2 : 1.2;

    if (reached) {
        ctx.shadowColor = '#ff3399';
        ctx.shadowBlur = 18;
    }

    // Scale factor: icons are 1.6× bigger than before
    const S = 1.6;

    switch (index) {
        case 0: { // 1 ngày - Triangle
            ctx.beginPath();
            ctx.moveTo(x, y - 20 * S);
            ctx.lineTo(x + 16 * S, y + 12 * S);
            ctx.lineTo(x - 16 * S, y + 12 * S);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 1: { // 5 ngày - Hexagon Gem
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const ang = (Math.PI / 3) * i - Math.PI / 6;
                const px = x + Math.cos(ang) * 18 * S;
                const py = y + Math.sin(ang) * 18 * S;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // inner highlight line
            if (reached) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, y - 14 * S);
                ctx.lineTo(x + 8 * S, y + 3 * S);
                ctx.lineTo(x - 8 * S, y + 3 * S);
                ctx.stroke();
                ctx.restore();
            }
            break;
        }
        case 2: { // 15 ngày - Rounded Square
            const sq = 19 * S;
            roundRect(ctx, x - sq / 2, y - sq / 2, sq, sq, 5);
            ctx.fill();
            ctx.stroke();
            if (reached) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 1;
                roundRect(ctx, x - sq / 2 + 4, y - sq / 2 + 4, sq - 8, sq - 8, 3);
                ctx.stroke();
                ctx.restore();
            }
            break;
        }
        case 3: { // 30 ngày - 5-Point Star
            drawStarPath(ctx, x, y, 5, 21 * S * 0.7, 9 * S * 0.7);
            ctx.fill();
            ctx.stroke();
            drawSparkleField(ctx, x, y, reached);
            break;
        }
        case 4: { // 60 ngày - Tall Diamond Gem
            ctx.beginPath();
            ctx.moveTo(x, y - 22 * S * 0.65);
            ctx.lineTo(x + 14 * S * 0.65, y - 6 * S * 0.65);
            ctx.lineTo(x + 14 * S * 0.65, y + 10 * S * 0.65);
            ctx.lineTo(x, y + 22 * S * 0.65);
            ctx.lineTo(x - 14 * S * 0.65, y + 10 * S * 0.65);
            ctx.lineTo(x - 14 * S * 0.65, y - 6 * S * 0.65);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            if (reached) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x - 8 * S * 0.65, y - 10 * S * 0.65);
                ctx.lineTo(x, y - 18 * S * 0.65);
                ctx.lineTo(x + 8 * S * 0.65, y - 10 * S * 0.65);
                ctx.stroke();
                ctx.restore();
            }
            drawSparkleField(ctx, x, y, reached);
            break;
        }
        case 5: { // 90 ngày - Wide Diamond
            ctx.beginPath();
            ctx.moveTo(x - 20 * S * 0.65, y - 5 * S * 0.65);
            ctx.lineTo(x, y - 22 * S * 0.65);
            ctx.lineTo(x + 20 * S * 0.65, y - 5 * S * 0.65);
            ctx.lineTo(x, y + 22 * S * 0.65);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            if (reached) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - 10 * S * 0.65, y - 5 * S * 0.65);
                ctx.lineTo(x, y - 22 * S * 0.65);
                ctx.lineTo(x + 10 * S * 0.65, y - 5 * S * 0.65);
                ctx.stroke();
                ctx.restore();
            }
            drawSparkleField(ctx, x, y, reached);
            break;
        }
        case 6: { // 120 ngày - Crown
            const cs = S * 0.65;
            ctx.beginPath();
            ctx.moveTo(x - 18 * cs, y + 14 * cs);
            ctx.lineTo(x - 20 * cs, y - 8 * cs);
            ctx.lineTo(x - 8 * cs, y + 4 * cs);
            ctx.lineTo(x, y - 18 * cs);
            ctx.lineTo(x + 8 * cs, y + 4 * cs);
            ctx.lineTo(x + 20 * cs, y - 8 * cs);
            ctx.lineTo(x + 18 * cs, y + 14 * cs);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // crown dots
            if (reached) {
                ctx.save();
                ctx.fillStyle = '#ffe566';
                ctx.shadowColor = '#ffe566';
                ctx.shadowBlur = 6;
                for (const [dx, dy] of [[-20 * cs, -8 * cs], [0, -18 * cs], [20 * cs, -8 * cs]]) {
                    ctx.beginPath();
                    ctx.arc(x + dx, y + dy, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
            drawSparkleField(ctx, x, y, reached);
            break;
        }
        case 7: { // 150 ngày - 8-Point Crystal
            drawStarPath(ctx, x, y, 8, 21 * S * 0.6, 13 * S * 0.6);
            ctx.fill();
            ctx.stroke();
            if (reached) {
                // long radiating lines
                ctx.save();
                ctx.strokeStyle = '#ffe566';
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                for (let i = 0; i < 4; i++) {
                    const ang = (i * Math.PI) / 4 + Math.PI / 8;
                    const r1 = 15 * S * 0.6;
                    const r2 = 24 * S * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
                    ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x - Math.cos(ang) * r1, y - Math.sin(ang) * r1);
                    ctx.lineTo(x - Math.cos(ang) * r2, y - Math.sin(ang) * r2);
                    ctx.stroke();
                }
                ctx.restore();
            }
            drawSparkleField(ctx, x, y, reached);
            break;
        }
        case 8: { // 180 ngày - Burst Star
            drawStarPath(ctx, x, y, 8, 22 * S * 0.6, 8 * S * 0.6);
            ctx.fill();
            ctx.stroke();
            if (reached) {
                // 8 long burst rays
                ctx.save();
                ctx.strokeStyle = '#ffe566';
                ctx.lineWidth = 1.8;
                ctx.lineCap = 'round';
                for (let i = 0; i < 8; i++) {
                    const ang = (i * Math.PI) / 4;
                    const r1 = 20 * S * 0.6;
                    const r2 = 32 * S * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
                    ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
                    ctx.stroke();
                }
                ctx.restore();
            }
            drawSparkleField(ctx, x, y, reached);
            break;
        }
    }
    ctx.restore();
}

// ============================================================
// BACKGROUND & SCENERY
// ============================================================

function drawBackground(ctx) {
    // Ocean Gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 480);
    oceanGrad.addColorStop(0, '#58d8ff');
    oceanGrad.addColorStop(0.3, '#1c8ce3');
    oceanGrad.addColorStop(0.7, '#0b56b5');
    oceanGrad.addColorStop(1, '#093a82');

    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, WIDTH, 480);

    // Sunbeams radiating from top center
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(WIDTH / 2, 0);
        ctx.lineTo(WIDTH / 2 + i * 110, 480);
        ctx.lineTo(WIDTH / 2 + i * 110 + 45, 480);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Floating Bubbles
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    const bubbles = [
        [50, 70, 14], [100, 140, 7], [160, 50, 5], [210, 200, 10],
        [340, 110, 6], [660, 120, 7], [780, 80, 11], [840, 160, 6], [940, 100, 12]
    ];
    for (const [bx, by, br] of bubbles) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    // Sea Plants / Coral at Bottom of Ocean (Y: 380 to 480)
    drawCoral(ctx);

    // Bottom Milestone Section (Dark Purple Gradient)
    const mileGrad = ctx.createLinearGradient(0, 480, 0, HEIGHT);
    mileGrad.addColorStop(0, '#2b0c42');
    mileGrad.addColorStop(1, '#140424');
    ctx.fillStyle = mileGrad;
    ctx.fillRect(0, 480, WIDTH, HEIGHT - 480);

    // Background Stars in Bottom Panel
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const stars = [
        [40, 510], [170, 495], [310, 505], [470, 490], [630, 505],
        [760, 495], [900, 510], [110, 650], [270, 660], [710, 655], [870, 660]
    ];
    for (const [sx, sy] of stars) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawCoral(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.65;

    // Left Green Seaweeds
    ctx.fillStyle = '#1e9e67';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(30 + i * 30, 480);
        ctx.quadraticCurveTo(20 + i * 30 + (i % 2 === 0 ? 15 : -15), 410, 35 + i * 30, 370);
        ctx.quadraticCurveTo(50 + i * 30, 410, 40 + i * 30, 480);
        ctx.closePath();
        ctx.fill();
    }

    // Right Purple Coral
    ctx.fillStyle = '#8e30b8';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(810 + i * 35, 480);
        ctx.quadraticCurveTo(800 + i * 35 + (i % 2 === 0 ? 15 : -15), 410, 815 + i * 35, 370);
        ctx.quadraticCurveTo(830 + i * 35, 410, 820 + i * 35, 480);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// ============================================================
// FISH DRAWING
// ============================================================

function drawFish(ctx, x, y, scale = 1, flip = false, color = '#ffa826') {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(25, -9);
    ctx.lineTo(25, 9);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-8, -3, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-9, -3, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ============================================================
// AVATAR DRAWING
// ============================================================

async function getAvatar(user) {
    if (!user) return null;
    try {
        const url = user.displayAvatarURL({ extension: 'png', size: 256 });
        return await loadImage(url);
    } catch {
        return null;
    }
}

function drawAvatar(ctx, img, x, y, radius) {
    ctx.save();

    // Outer Red/Pink Glow Ring
    ctx.shadowColor = '#ff4d94';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d94';
    ctx.fill();

    // Inner White Ring Border
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Avatar Image Clip
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    if (img) {
        ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = '#3a4454';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
}

// ============================================================
// PILL BADGE DRAWING
// ============================================================

function drawPillBadge(ctx, text, x, y, width, height, startColor, endColor) {
    ctx.save();
    const bx = x - width / 2;
    const by = y - height / 2;

    const grad = ctx.createLinearGradient(bx, by, bx + width, by);
    grad.addColorStop(0, startColor);
    grad.addColorStop(1, endColor);

    ctx.shadowColor = startColor;
    ctx.shadowBlur = 12;

    roundRect(ctx, bx, by, width, height, height / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // White Inner Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawTextWithOutline(ctx, text, x, y + 1, 20, 'center', '#ffffff', 'rgba(0,0,0,0.3)', 2);
    ctx.restore();
}

// ============================================================
// CONNECTED DUAL PROGRESS BAR WITH CENTER CHECKMARK
// ============================================================

function drawDualProgressBar(
    ctx,
    y,
    user1Val,
    user1Target,
    user2Val,
    user2Target
) {
    const leftStartX = 185;
    const rightEndX = 815;
    const centerX = 500;
    const barHeight = 26;
    const barRadius = 13;
    const checkRadius = 20;

    const user1Ratio = Math.max(0, Math.min(1, user1Val / user1Target));
    const user2Ratio = Math.max(0, Math.min(1, user2Val / user2Target));

    const bothCompleted = user1Val >= user1Target && user2Val >= user2Target;

    ctx.save();

    // ── Background Tracks ────────────────────────────────────────
    // Left track
    roundRect(ctx, leftStartX, y - barHeight / 2, centerX - leftStartX - checkRadius - 4, barHeight, barRadius);
    ctx.fillStyle = 'rgba(8, 25, 55, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Right track
    roundRect(ctx, centerX + checkRadius + 4, y - barHeight / 2, rightEndX - centerX - checkRadius - 4, barHeight, barRadius);
    ctx.fillStyle = 'rgba(8, 25, 55, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ── Left Fill Bar: fills from LEFT edge → toward center circle ──
    if (user1Ratio > 0) {
        const trackW = centerX - leftStartX - checkRadius - 4;
        const fillW = Math.max(barRadius * 2, trackW * user1Ratio);

        ctx.save();
        roundRect(ctx, leftStartX, y - barHeight / 2, trackW, barHeight, barRadius);
        ctx.clip();

        // fill starts at leftStartX and grows right
        roundRect(ctx, leftStartX, y - barHeight / 2, fillW, barHeight, barRadius);
        const grad1 = ctx.createLinearGradient(leftStartX, 0, leftStartX + trackW, 0);
        grad1.addColorStop(0, '#ff2d78');
        grad1.addColorStop(1, '#ff80b5');
        ctx.fillStyle = grad1;
        ctx.fill();
        ctx.restore();
    }

    // ── Right Fill Bar: fills from RIGHT edge → toward center circle ──
    if (user2Ratio > 0) {
        const trackX = centerX + checkRadius + 4;
        const trackW = rightEndX - centerX - checkRadius - 4;
        const fillW = Math.max(barRadius * 2, trackW * user2Ratio);

        ctx.save();
        roundRect(ctx, trackX, y - barHeight / 2, trackW, barHeight, barRadius);
        ctx.clip();

        // fill starts at rightEndX and grows left
        roundRect(ctx, trackX + trackW - fillW, y - barHeight / 2, fillW, barHeight, barRadius);
        const grad2 = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
        grad2.addColorStop(0, '#3fc4ff');
        grad2.addColorStop(1, '#79d8ff');
        ctx.fillStyle = grad2;
        ctx.fill();
        ctx.restore();
    }

    // ── Center Checkmark Circle ───────────────────────────────────
    // Always draw a clean circle outline as a "slot"
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, y, checkRadius, 0, Math.PI * 2);

    if (bothCompleted) {
        // Glowing green filled circle
        const ckGrad = ctx.createRadialGradient(centerX - 4, y - 4, 2, centerX, y, checkRadius);
        ckGrad.addColorStop(0, '#6effa0');
        ckGrad.addColorStop(1, '#17c85a');
        ctx.fillStyle = ckGrad;
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = 20;
        ctx.fill();

        // White border ring
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Draw checkmark path manually (no text rendering issues)
        ctx.beginPath();
        ctx.moveTo(centerX - 8, y);
        ctx.lineTo(centerX - 2, y + 7);
        ctx.lineTo(centerX + 9, y - 7);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    } else {
        // Empty dark slot with subtle ring
        ctx.fillStyle = 'rgba(5, 18, 45, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }

    ctx.restore();

    ctx.restore(); // outer save
}

// ============================================================
// MAIN CARD RENDER
// ============================================================

export async function renderStreakCard(client, streak, user1Id, user2Id) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Background Scene
    drawBackground(ctx);

    // 2. Fetch Users & Avatars
    let user1 = null;
    let user2 = null;

    try { user1 = await client.users.fetch(user1Id); } catch {}
    try { user2 = await client.users.fetch(user2Id); } catch {}

    const avatar1 = user1 ? await getAvatar(user1) : null;
    const avatar2 = user2 ? await getAvatar(user2) : null;

    // 3. Draw Avatars (Left X: 90, Right X: 910, Y: 150)
    drawAvatar(ctx, avatar1, 90, 150, 56);
    drawAvatar(ctx, avatar2, 910, 150, 56);

    // 4. Message Section (TIN NHẮN)
    const reqMessages = getRequiredMessages(streak.streakDays);

    // Pill Badge (bigger)
    drawPillBadge(ctx, 'TIN NHẮN', WIDTH / 2, 210, 160, 42, '#ff4785', '#ff739d');

    // Numbers Text (Left & Right) – bigger
    drawTextWithOutline(ctx, `${streak.user1Messages}/${reqMessages}`, 130, 255, 26, 'center', '#ffffff', '#000000', 5);
    drawTextWithOutline(ctx, `${streak.user2Messages}/${reqMessages}`, 870, 255, 26, 'center', '#ffffff', '#000000', 5);

    // Dual Progress Bar + Center Checkmark (Y: 255)
    drawDualProgressBar(
        ctx,
        255,
        streak.user1Messages,
        reqMessages,
        streak.user2Messages,
        reqMessages
    );

    // 5. Reply Section (REPLY)
    // Pill Badge (bigger)
    drawPillBadge(ctx, 'REPLY', WIDTH / 2, 335, 160, 42, '#6b46e5', '#9866ff');

    // Numbers Text (Left & Right) – bigger
    drawTextWithOutline(ctx, `${streak.user1Replies}/1`, 130, 380, 26, 'center', '#ffffff', '#000000', 5);
    drawTextWithOutline(ctx, `${streak.user2Replies}/1`, 870, 380, 26, 'center', '#ffffff', '#000000', 5);

    // Dual Progress Bar + Center Checkmark (Y: 380)
    drawDualProgressBar(
        ctx,
        380,
        streak.user1Replies,
        1,
        streak.user2Replies,
        1
    );

    // 6. Bottom Milestones Panel Section (Y: 480 to 680)
    const milestones = [1, 5, 15, 30, 60, 90, 120, 150, 180];
    const startX = 85;
    const endX = 915;
    const gap = (endX - startX) / (milestones.length - 1);
    const iconY = 525;
    const textY = 556;

    // Draw Milestone Icons & Labels
    for (let i = 0; i < milestones.length; i++) {
        const day = milestones[i];
        const mx = startX + i * gap;
        const reached = streak.streakDays >= day;

        // Draw Vector Icon Shape
        drawMilestoneIcon(ctx, i, mx, iconY, reached);

        // Text Label under Icon
        drawTextWithOutline(
            ctx,
            `${day} ngày`,
            mx,
            textY,
            15,
            'center',
            reached ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
            'transparent',
            0
        );
    }

    // Big Streak Days Text: "X NGÀY"
    drawTextWithOutline(
        ctx,
        `${streak.streakDays} NGÀY`,
        WIDTH / 2,
        595,
        30,
        'center',
        '#ffee55',
        '#7a3a00',
        4
    );

    // Milestone Progress Slider Track Bar (Y: 635)
    const sliderY = 635;
    ctx.save();

    // Background Slider Track Line
    ctx.beginPath();
    ctx.moveTo(startX, sliderY);
    ctx.lineTo(endX, sliderY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Calculate Progress Ratio along Slider
    let progressRatio = 0;
    const days = streak.streakDays;

    if (days >= 180) {
        progressRatio = 1;
    } else {
        let prevIndex = 0;
        let prevDay = 0;

        for (let i = 0; i < milestones.length; i++) {
            if (days >= milestones[i]) {
                prevIndex = i;
                prevDay = milestones[i];
            } else {
                break;
            }
        }

        if (prevIndex < milestones.length - 1) {
            const nextDay = milestones[prevIndex + (days < 1 ? 0 : 1)];
            const stepStartDay = prevIndex === 0 && days < 1 ? 0 : prevDay;
            const stepProgress = (days - stepStartDay) / (nextDay - stepStartDay);
            const stepBaseIndex = prevIndex === 0 && days < 1 ? 0 : prevIndex;
            progressRatio = (stepBaseIndex + Math.max(0, stepProgress)) / (milestones.length - 1);
        } else {
            progressRatio = 1;
        }
    }

    // Active Filled Progress Slider Line
    if (progressRatio > 0) {
        const fillX = startX + (endX - startX) * progressRatio;
        ctx.beginPath();
        ctx.moveTo(startX, sliderY);
        ctx.lineTo(fillX, sliderY);

        const sliderGrad = ctx.createLinearGradient(startX, sliderY, endX, sliderY);
        sliderGrad.addColorStop(0, '#ffee55');
        sliderGrad.addColorStop(1, '#ff66c4');
        ctx.strokeStyle = sliderGrad;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    // Milestone Nodes / Dots along Slider Line
    for (let i = 0; i < milestones.length; i++) {
        const day = milestones[i];
        const mx = startX + i * gap;
        const reached = days >= day;

        ctx.beginPath();
        ctx.arc(mx, sliderY, 8, 0, Math.PI * 2);

        if (reached) {
            ctx.fillStyle = '#ffee55';
            ctx.shadowColor = '#ffee55';
            ctx.shadowBlur = 10;
            ctx.fill();

            // Inner Ring
            ctx.beginPath();
            ctx.arc(mx, sliderY, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#240d3a';
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(mx, sliderY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#240d3a';
            ctx.fill();
        }
    }

    ctx.restore();

    return canvas.toBuffer('image/png');
}