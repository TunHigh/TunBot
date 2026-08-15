import {
    createCanvas,
    loadImage,
} from '@napi-rs/canvas';

// ============================================================
// DIMENSIONS
// ============================================================

const WIDTH = 1000;
const HEIGHT = 600;

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

function drawMilestoneIcon(ctx, index, x, y, reached) {
    ctx.save();
    ctx.fillStyle = reached ? '#ff66c4' : 'rgba(255, 255, 255, 0.25)';
    ctx.strokeStyle = reached ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;

    if (reached) {
        ctx.shadowColor = '#ff3399';
        ctx.shadowBlur = 10;
    }

    switch (index) {
        case 0: // 1 day - Triangle / Pyramid
            ctx.beginPath();
            ctx.moveTo(x, y - 13);
            ctx.lineTo(x + 11, y + 9);
            ctx.lineTo(x - 11, y + 9);
            ctx.closePath();
            ctx.fill();
            break;
        case 1: // 5 days - Hexagon Gem
            ctx.beginPath();
            ctx.moveTo(x, y - 13);
            ctx.lineTo(x + 9, y - 5);
            ctx.lineTo(x + 9, y + 6);
            ctx.lineTo(x, y + 13);
            ctx.lineTo(x - 9, y + 6);
            ctx.lineTo(x - 9, y - 5);
            ctx.closePath();
            ctx.fill();
            break;
        case 2: // 15 days - Square / Cube
            ctx.beginPath();
            roundRect(ctx, x - 9, y - 9, 18, 18, 3);
            ctx.fill();
            break;
        case 3: // 30 days - 5 Point Star
            drawStarPath(ctx, x, y, 5, 13, 6);
            ctx.fill();
            break;
        case 4: // 60 days - Diamond / Rhombus
            ctx.beginPath();
            ctx.moveTo(x, y - 14);
            ctx.lineTo(x + 11, y);
            ctx.lineTo(x, y + 14);
            ctx.lineTo(x - 11, y);
            ctx.closePath();
            ctx.fill();
            break;
        case 5: // 90 days - Gem Diamond
            ctx.beginPath();
            ctx.moveTo(x - 12, y - 5);
            ctx.lineTo(x, y - 13);
            ctx.lineTo(x + 12, y - 5);
            ctx.lineTo(x, y + 13);
            ctx.closePath();
            ctx.fill();
            break;
        case 6: // 120 days - Crown
            ctx.beginPath();
            ctx.moveTo(x - 11, y + 9);
            ctx.lineTo(x - 13, y - 7);
            ctx.lineTo(x - 5, y + 2);
            ctx.lineTo(x, y - 11);
            ctx.lineTo(x + 5, y + 2);
            ctx.lineTo(x + 13, y - 7);
            ctx.lineTo(x + 11, y + 9);
            ctx.closePath();
            ctx.fill();
            break;
        case 7: // 150 days - Flower Octagon
            drawStarPath(ctx, x, y, 8, 13, 8);
            ctx.fill();
            break;
        case 8: // 180 days - Burst Sparkle
            drawStarPath(ctx, x, y, 6, 14, 5);
            ctx.fill();
            break;
    }
    ctx.restore();
}

// ============================================================
// BACKGROUND & SCENERY
// ============================================================

function drawBackground(ctx) {
    // Ocean Gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 420);
    oceanGrad.addColorStop(0, '#53dbff');
    oceanGrad.addColorStop(0.3, '#1980d4');
    oceanGrad.addColorStop(0.7, '#0c4da3');
    oceanGrad.addColorStop(1, '#0b326d');

    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, WIDTH, 420);

    // Radiant Sun Rays
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(WIDTH / 2, 0);
        ctx.lineTo(WIDTH / 2 + i * 110, 420);
        ctx.lineTo(WIDTH / 2 + i * 110 + 45, 420);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Floating Bubbles
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    const bubbles = [
        [60, 80, 12], [100, 130, 6], [160, 60, 4], [220, 180, 9], [340, 100, 5],
        [660, 110, 6], [780, 70, 10], [840, 150, 5], [920, 90, 11], [950, 160, 7]
    ];
    for (const [bx, by, br] of bubbles) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    // Sea Plants / Coral at Bottom of Ocean (Y: 340 to 420)
    drawCoral(ctx);

    // Bottom Milestone Section (Dark Purple)
    const mileGrad = ctx.createLinearGradient(0, 420, 0, HEIGHT);
    mileGrad.addColorStop(0, '#240d3a');
    mileGrad.addColorStop(1, '#150624');
    ctx.fillStyle = mileGrad;
    ctx.fillRect(0, 420, WIDTH, HEIGHT - 420);

    // Background Stars in Bottom Panel
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    const stars = [
        [50, 450], [180, 435], [320, 445], [480, 430], [620, 445],
        [750, 435], [890, 450], [120, 570], [280, 580], [700, 575], [860, 580]
    ];
    for (const [sx, sy] of stars) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawCoral(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.6;

    // Left Plants
    ctx.fillStyle = '#1c915f';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(40 + i * 30, 420);
        ctx.quadraticCurveTo(30 + i * 30 + (i % 2 === 0 ? 15 : -15), 360, 45 + i * 30, 330);
        ctx.quadraticCurveTo(60 + i * 30, 360, 50 + i * 30, 420);
        ctx.closePath();
        ctx.fill();
    }

    // Right Plants
    ctx.fillStyle = '#8328ab';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(800 + i * 35, 420);
        ctx.quadraticCurveTo(790 + i * 35 + (i % 2 === 0 ? 15 : -15), 360, 805 + i * 35, 330);
        ctx.quadraticCurveTo(820 + i * 35, 360, 810 + i * 35, 420);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// ============================================================
// FISH DRAWING
// ============================================================

function drawFish(ctx, x, y, scale = 1, flip = false, color = '#ffa524') {
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
    ctx.lineTo(24, -8);
    ctx.lineTo(24, 8);
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

    // Outer Glow Ring
    ctx.shadowColor = '#ff4d94';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d94';
    ctx.fill();

    // White Border
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
    ctx.shadowBlur = 10;

    roundRect(ctx, bx, by, width, height, height / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + 5);

    ctx.restore();
}

// ============================================================
// PROGRESS BAR DRAWING
// ============================================================

function drawProgressBar(ctx, x, y, width, height, ratio, startColor, endColor, fishColor) {
    ratio = Math.max(0, Math.min(1, ratio));
    const radius = height / 2;

    ctx.save();

    // Background Bar Track
    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = 'rgba(10, 35, 70, 0.65)';
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fill Bar
    if (ratio > 0) {
        const fillW = Math.max(radius * 2, width * ratio);
        roundRect(ctx, x, y, fillW, height, radius);
        const grad = ctx.createLinearGradient(x, y, x + fillW, y);
        grad.addColorStop(0, startColor);
        grad.addColorStop(1, endColor);
        ctx.fillStyle = grad;
        ctx.fill();

        // Fish icon at tip
        const fishX = x + fillW;
        drawFish(ctx, fishX, y + height / 2, 0.75, true, fishColor);
    } else {
        // Draw fish at start
        drawFish(ctx, x, y + height / 2, 0.75, true, fishColor);
    }

    ctx.restore();
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

    // 3. Draw Avatars (Left X: 110, Right X: 890, Y: 170)
    drawAvatar(ctx, avatar1, 110, 170, 52);
    drawAvatar(ctx, avatar2, 890, 170, 52);

    // 4. Center Badges (TIN NHẮN & REPLY)
    drawPillBadge(ctx, 'TIN NHẮN', WIDTH / 2, 235, 140, 36, '#ff4785', '#ff739d');
    drawPillBadge(ctx, 'REPLY', WIDTH / 2, 320, 140, 36, '#6b46e5', '#9866ff');

    // 5. Message Progress Section (Y: 235)
    // Left User 1 Message Count Text
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`${streak.user1Messages}/50`, 180, 220);

    // Right User 2 Message Count Text
    ctx.textAlign = 'right';
    ctx.fillText(`${streak.user2Messages}/50`, 820, 220);

    // Left Message Progress Bar (X: 180, Width: 230)
    drawProgressBar(
        ctx,
        180,
        224,
        230,
        22,
        streak.user1Messages / 50,
        '#ff4785',
        '#ff85a2',
        '#ffa524'
    );

    // Right Message Progress Bar (X: 590, Width: 230)
    drawProgressBar(
        ctx,
        590,
        224,
        230,
        22,
        streak.user2Messages / 50,
        '#2371ee',
        '#589bff',
        '#ffee24'
    );

    // 6. Reply Progress Section (Y: 320)
    // Left User 1 Reply Count Text
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`${streak.user1Replies}/1`, 180, 308);

    // Right User 2 Reply Count Text
    ctx.textAlign = 'right';
    ctx.fillText(`${streak.user2Replies}/1`, 820, 308);

    // Left Reply Progress Bar
    drawProgressBar(
        ctx,
        180,
        313,
        230,
        14,
        streak.user1Replies / 1,
        '#ff4785',
        '#ff85a2',
        '#ffa524'
    );

    // Right Reply Progress Bar
    drawProgressBar(
        ctx,
        590,
        313,
        230,
        14,
        streak.user2Replies / 1,
        '#2371ee',
        '#589bff',
        '#ffee24'
    );

    // 7. Bottom Milestones Panel Section (Y: 420 to 600)
    const milestones = [1, 5, 15, 30, 60, 90, 120, 150, 180];
    const startX = 90;
    const endX = 910;
    const gap = (endX - startX) / (milestones.length - 1);
    const iconY = 450;
    const textY = 478;

    // Draw Milestone Icons & Labels
    for (let i = 0; i < milestones.length; i++) {
        const day = milestones[i];
        const mx = startX + i * gap;
        const reached = streak.streakDays >= day;

        // Draw Vector Icon Shape
        drawMilestoneIcon(ctx, i, mx, iconY, reached);

        // Text Label under Icon
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = reached ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
        ctx.fillText(`${day} days`, mx, textY);
    }

    // Big Streak Days Text: "X NGÀY"
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffee55';
    ctx.shadowColor = '#ff9900';
    ctx.shadowBlur = 10;
    ctx.fillText(`${streak.streakDays} NGÀY`, WIDTH / 2, 515);
    ctx.shadowBlur = 0;

    // Milestone Progress Slider Track Bar (Y: 545)
    const sliderY = 545;
    ctx.save();

    // Background Slider Track Line
    ctx.beginPath();
    ctx.moveTo(startX, sliderY);
    ctx.lineTo(endX, sliderY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
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
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
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