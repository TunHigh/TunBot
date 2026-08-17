import { Canvas } from '@napi-rs/canvas';
import GIFEncoder from 'gif-encoder-2';

/**
 * Premium Tài Xỉu Dice Renderer
 * - Rounded dice with fake 3D perspective
 * - Inset marks with shadow/highlight
 * - Motion blur ghost frames
 * - Physics-based bounce & settle
 * - Final frame hold
 */

const DEFAULTS = {
  width: 900,
  height: 500,
  fps: 30,
  duration: 1800,      // ms rolling
  resultPause: 500,    // ms hold final frame
  diceSize: 145,
  gap: 45,
  radius: 25,          // corner radius
  depth: 27,           // fake 3D depth
  background: '#111318',
  diceTop: '#ffffff',
  diceMiddle: '#e8edf2',
  diceBottom: '#b9c2cb',
  markColor: '#25292e',
  shadowOpacity: 0.45,
  motionBlur: true,
  title: 'TÀI XỈU',
  showResultText: true,
};

// ── Math Helpers ──

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Rounded Rect Path ──

function roundedRectPath(ctx, x, y, width, height, radius) {
  radius = Math.min(radius, width / 2, height / 2);
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

// ── Dice Gradient ──

function createDiceGradient(ctx, x, y, width, height, config) {
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, config.diceTop);
  grad.addColorStop(0.45, config.diceMiddle);
  grad.addColorStop(1, config.diceBottom);
  return grad;
}

// ── Face Mark Positions ──

function getFaceMarks(value) {
  const positions = {
    1: [[0, 0]],
    2: [[-0.28, -0.28], [0.28, 0.28]],
    3: [[-0.28, -0.28], [0, 0], [0.28, 0.28]],
    4: [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]],
    5: [[-0.28, -0.28], [0.28, -0.28], [0, 0], [-0.28, 0.28], [0.28, 0.28]],
    6: [[-0.28, -0.31], [0.28, -0.31], [-0.28, 0], [0.28, 0], [-0.28, 0.31], [0.28, 0.31]],
  };
  return positions[value] || positions[1];
}

// ── Draw Inset Mark (oval with inset shadow + highlight) ──

function drawMark(ctx, cx, cy, size, angle = 0, scaleX = 1, scaleY = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(scaleX, scaleY);

  const width = size * 0.19;
  const height = size * 0.095;

  // Inset shadow
  ctx.beginPath();
  ctx.roundRect(-width / 2 + 1.5, -height / 2 + 2, width, height, height / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fill();

  // Dark inset body
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, height / 2);
  ctx.fillStyle = '#24282d';
  ctx.fill();

  // Tiny highlight
  ctx.beginPath();
  ctx.roundRect(-width * 0.35, -height * 0.28, width * 0.7, height * 0.18, height * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();

  ctx.restore();
}

// ── Draw Front Face (rounded, with perspective skew) ──

function drawFrontFace(ctx, x, y, size, value, config, skewX, skewY, rotation) {
  const p = size * 0.045;
  const points = [
    [x + p + skewX, y + p + skewY],
    [x + size - p + skewX, y + p],
    [x + size - p, y + size - p],
    [x + p, y + size - p + skewY],
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.lineTo(points[3][0], points[3][1]);
  ctx.closePath();
  ctx.clip();

  // Face gradient
  const grad = createDiceGradient(ctx, x, y, size, size, config);
  ctx.fillStyle = grad;
  ctx.fillRect(x - 20, y - 20, size + 40, size + 40);

  // Subtle light
  const light = ctx.createRadialGradient(
    x + size * 0.25, y + size * 0.15, 1,
    x + size * 0.25, y + size * 0.15, size * 0.8
  );
  light.addColorStop(0, 'rgba(255,255,255,0.60)');
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(x - 20, y - 20, size + 40, size + 40);

  // Draw marks
  const marks = getFaceMarks(value);
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  for (const [mx, my] of marks) {
    const px = centerX + mx * size;
    const py = centerY + my * size;

    // Perspective distortion on marks
    const sx = clamp(0.78 + Math.cos(rotation) * 0.22, 0.55, 1);
    const sy = clamp(0.85 + Math.sin(rotation) * 0.15, 0.65, 1);

    drawMark(ctx, px, py, size, rotation * 0.08, sx, sy);
  }

  ctx.restore();

  // Front border
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.lineTo(points[3][0], points[3][1]);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(80,88,98,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ── Draw Top Face (parallelogram) ──

function drawTopFace(ctx, x, y, size, depth, rotation, config) {
  const dx = Math.sin(rotation) * depth;
  const dy = Math.cos(rotation) * depth;

  const points = [
    [x, y],
    [x + size, y],
    [x + size + dx, y - dy],
    [x + dx, y - dy],
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  const grad = ctx.createLinearGradient(x, y - depth, x, y);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#edf1f4');
  grad.addColorStop(1, '#d1d8df');
  ctx.fillStyle = grad;
  ctx.fillRect(x - depth, y - depth, size + depth * 2, depth * 2);

  // Highlight
  const highlight = ctx.createLinearGradient(x, y - depth, x + size, y);
  highlight.addColorStop(0, 'rgba(255,255,255,0.65)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = highlight;
  ctx.fillRect(x - depth, y - depth, size + depth * 2, depth * 2);

  ctx.restore();

  // Top edge highlight
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[3][0], points[3][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ── Draw Right Face ──

function drawRightFace(ctx, x, y, size, depth, rotation, config) {
  const dx = Math.sin(rotation) * depth;
  const dy = Math.cos(rotation) * depth;

  const points = [
    [x + size, y],
    [x + size + dx, y - dy],
    [x + size + dx, y + size - dy],
    [x + size, y + size],
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  const grad = ctx.createLinearGradient(x + size, y, x + size + depth, y);
  grad.addColorStop(0, '#c8d0d8');
  grad.addColorStop(1, '#8d98a3');
  ctx.fillStyle = grad;
  ctx.fillRect(x + size - 5, y - depth, depth + 15, size + depth * 2);

  // Dark edge
  const edge = ctx.createLinearGradient(x + size, y, x + size + dx, y);
  edge.addColorStop(0, 'rgba(255,255,255,0.15)');
  edge.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = edge;
  ctx.fillRect(x + size, y - depth, depth + 10, size + depth * 2);

  ctx.restore();

  // Right edge
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.lineTo(points[3][0], points[3][1]);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(72,80,89,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ── Draw Complete Dice ──

function drawDice(ctx, x, y, size, value, state, config) {
  const depth = config.depth * state.depthScale;

  // Shadow
  ctx.save();
  ctx.globalAlpha = config.shadowOpacity * state.shadowScale;
  ctx.filter = 'blur(15px)';
  ctx.beginPath();
  ctx.ellipse(
    x + size / 2 + depth * 0.35,
    y + size + 17,
    size * 0.47 * state.shadowWidth,
    size * 0.115,
    0, 0, Math.PI * 2
  );
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.restore();

  // Motion blur ghost frames
  if (config.motionBlur && state.blur > 0) {
    for (let i = 3; i >= 1; i--) {
      const alpha = state.blur * (0.025 * i);
      ctx.save();
      ctx.globalAlpha = alpha;
      drawDiceBody(ctx, x - state.velocityX * i * 0.7, y - state.velocityY * i * 0.7, size, value, state, config);
      ctx.restore();
    }
  }

  drawDiceBody(ctx, x, y, size, value, state, config);
}

// ── Dice Body (top + right + front) ──

function drawDiceBody(ctx, x, y, size, value, state, config) {
  ctx.save();

  // Overall shadow
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 7;

  // Top
  drawTopFace(ctx, x, y, size, config.depth * state.depthScale, state.rotationY, config);

  // Right side
  drawRightFace(ctx, x, y, size, config.depth * state.depthScale, state.rotationY, config);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Front
  drawFrontFace(ctx, x, y, size, value, config, state.skewX, state.skewY, state.rotationZ);

  // Strong top highlight
  ctx.save();
  const highlight = ctx.createLinearGradient(x, y, x + size, y + size);
  highlight.addColorStop(0, 'rgba(255,255,255,0.38)');
  highlight.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  roundedRectPath(ctx, x + 4, y + 4, size - 8, size - 8, config.radius);
  ctx.fillStyle = highlight;
  ctx.fill();
  ctx.restore();

  // Edge highlight
  ctx.save();
  roundedRectPath(ctx, x + 2, y + 2, size - 4, size - 4, config.radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.48)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// ── Random Orientation ──

function randomOrientation() {
  return {
    rotationX: Math.random() * Math.PI * 2,
    rotationY: Math.random() * Math.PI * 2,
    rotationZ: Math.random() * Math.PI * 2,
  };
}

function randomFace() {
  return Math.floor(Math.random() * 6) + 1;
}

// ── Background ──

function drawBackground(ctx, config) {
  ctx.clearRect(0, 0, config.width, config.height);
  ctx.fillStyle = config.background;
  ctx.fillRect(0, 0, config.width, config.height);

  // Central glow
  const glow = ctx.createRadialGradient(
    config.width / 2, config.height * 0.47, 30,
    config.width / 2, config.height * 0.47, config.width * 0.55
  );
  glow.addColorStop(0, 'rgba(255,255,255,0.075)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.025)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, config.width, config.height);

  // Bottom floor glow
  const floor = ctx.createRadialGradient(
    config.width / 2, config.height * 0.83, 20,
    config.width / 2, config.height * 0.83, 360
  );
  floor.addColorStop(0, 'rgba(255,255,255,0.035)');
  floor.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, config.width, config.height);
}

// ── Title ──

function drawTitle(ctx, config) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 31px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(config.title, config.width / 2, 60);

  const lineWidth = 90;
  const grad = ctx.createLinearGradient(
    config.width / 2 - lineWidth, 0,
    config.width / 2 + lineWidth, 0
  );
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(config.width / 2 - lineWidth, 76, lineWidth * 2, 1);
  ctx.restore();
}

// ── Result Text ──

function drawResult(ctx, result, config, progress) {
  if (!config.showResultText) return;

  if (progress < 0.78) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 20px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    ctx.fillText('ĐANG LẮC...', config.width / 2, 450);
    ctx.restore();
    return;
  }

  const total = result[0] + result[1] + result[2];
  const type = total >= 11 ? 'TÀI' : 'XỈU';

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 27px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${result[0]}  •  ${result[1]}  •  ${result[2]}    =    ${total}    →    ${type}`, config.width / 2, 450);
  ctx.restore();
}

// ── Main Renderer Class ──

export class DiceRenderer {
  constructor(options = {}) {
    this.config = { ...DEFAULTS, ...options };
    this.frameCount = Math.max(1, Math.floor(this.config.duration / (1000 / this.config.fps)));
    this.pauseFrames = Math.floor(this.config.resultPause / (1000 / this.config.fps));
    this.totalFrames = this.frameCount + this.pauseFrames;
  }

  async renderRollAnimation(diceResults, seed = Date.now()) {
    // Validate
    if (!Array.isArray(diceResults) || diceResults.length !== 3) {
      throw new TypeError('result phải là [dice1, dice2, dice3]');
    }
    for (const v of diceResults) {
      if (!Number.isInteger(v) || v < 1 || v > 6) {
        throw new RangeError('Giá trị xúc xắc phải từ 1 đến 6.');
      }
    }

    const encoder = new GIFEncoder(this.config.width, this.config.height);
    encoder.setRepeat(0);
    encoder.setDelay(Math.round(1000 / this.config.fps));
    encoder.setQuality(6);
    encoder.start();

    const canvas = new Canvas(this.config.width, this.config.height);
    const ctx = canvas.getContext('2d');

    // Positions
    const totalWidth = this.config.diceSize * 3 + this.config.gap * 2;
    const startX = (this.config.width - totalWidth) / 2;
    const baseY = 185;

    // Per-dice random state
    const diceStates = [0, 1, 2].map(i => {
      const orient = randomOrientation();
      return {
        seed: Math.random() * 100,
        rotationX: orient.rotationX,
        rotationY: orient.rotationY,
        rotationZ: orient.rotationZ,
        spinX: 7 + Math.random() * 5,
        spinY: 8 + Math.random() * 6,
        spinZ: 4 + Math.random() * 4,
        bounce: 0,
        velocityX: 0,
        velocityY: 0,
        blur: 1,
        randomValue: randomFace(),
        finalValue: diceResults[i],
        phase: Math.random() * Math.PI * 2,
      };
    });

    // Render rolling frames
    for (let frame = 0; frame < this.frameCount; frame++) {
      const rawProgress = frame / Math.max(1, this.frameCount - 1);

      const rollProgress = clamp(rawProgress / 0.72, 0, 1);
      const settleProgress = clamp((rawProgress - 0.72) / 0.28, 0, 1);

      const rollingEase = easeOutCubic(rollProgress);
      const settleEase = easeOutBack(settleProgress);

      drawBackground(ctx, this.config);
      drawTitle(ctx, this.config);

      diceStates.forEach((state, index) => {
        const roll = 1 - rollingEase;

        // Spin
        const rotX = state.rotationX + roll * state.spinX * Math.PI;
        const rotY = state.rotationY + roll * state.spinY * Math.PI;
        const rotZ = state.rotationZ + roll * state.spinZ * Math.PI;

        // Settle rotation (stylized)
        const finalRotX = Math.sin(index * 1.7) * 0.04;
        const finalRotY = Math.sin(index * 2.3) * 0.06;
        const finalRotZ = Math.sin(index) * 0.025;

        state.rotationX = lerp(rotX, finalRotX, settleEase);
        state.rotationY = lerp(rotY, finalRotY, settleEase);
        state.rotationZ = lerp(rotZ, finalRotZ, settleEase);

        // Bounce
        const bounceWave = Math.abs(Math.sin(frame * 0.68 + state.phase));
        const bounce = bounceWave * 42 * (1 - rollingEase) * (1 - settleProgress);

        // Final bounce
        const finalBounce = Math.sin(settleProgress * Math.PI * 3) * 8 * (1 - settleProgress);

        // Skew
        state.skewX = Math.sin(state.rotationY) * this.config.depth * 0.45;
        state.skewY = Math.cos(state.rotationX) * this.config.depth * 0.30;

        // Depth
        state.depthScale = 0.85 + Math.abs(Math.cos(state.rotationY)) * 0.25;

        // Shadow
        state.shadowScale = 0.72 + (1 - bounce / 42) * 0.28;
        state.shadowWidth = 1 + bounce / 80;

        // Motion blur
        state.blur = roll;

        // Velocity
        state.velocityX = Math.sin(frame * 0.9 + state.phase) * 5 * roll;
        state.velocityY = Math.cos(frame * 0.8 + state.phase) * 4 * roll;

        // Visible value
        let visibleValue;
        if (rawProgress < 0.68) {
          const change = Math.floor(frame / 3);
          visibleValue = (Math.abs(Math.sin(state.seed + change * 12.9898 + index)) * 100000) % 6;
          visibleValue = Math.floor(visibleValue) + 1;
        } else {
          visibleValue = state.finalValue;
        }

        const x = startX + index * (this.config.diceSize + this.config.gap);
        const y = baseY - bounce - finalBounce;

        drawDice(ctx, x, y, this.config.diceSize, visibleValue, state, this.config);
      });

      drawResult(ctx, diceResults, this.config, rawProgress);
      encoder.addFrame(ctx);
    }

    // Hold final frame
    for (let i = 0; i < this.pauseFrames; i++) {
      drawBackground(ctx, this.config);
      drawTitle(ctx, this.config);

      for (let index = 0; index < 3; index++) {
        const x = startX + index * (this.config.diceSize + this.config.gap);
        const state = {
          rotationX: 0, rotationY: 0, rotationZ: 0,
          skewX: 0, skewY: 0,
          depthScale: 1, shadowScale: 1, shadowWidth: 1,
          blur: 0, velocityX: 0, velocityY: 0,
        };
        drawDice(ctx, x, baseY, this.config.diceSize, diceResults[index], state, this.config);
      }

      drawResult(ctx, diceResults, this.config, 1);
      encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
  }

  async renderFinalFrame(diceResults) {
    const canvas = new Canvas(this.config.width, this.config.height);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, this.config);
    drawTitle(ctx, this.config);

    const totalWidth = this.config.diceSize * 3 + this.config.gap * 2;
    const startX = (this.config.width - totalWidth) / 2;
    const baseY = 185;

    for (let index = 0; index < 3; index++) {
      const x = startX + index * (this.config.diceSize + this.config.gap);
      const state = {
        rotationX: 0, rotationY: 0, rotationZ: 0,
        skewX: 0, skewY: 0,
        depthScale: 1, shadowScale: 1, shadowWidth: 1,
        blur: 0, velocityX: 0, velocityY: 0,
      };
      drawDice(ctx, x, baseY, this.config.diceSize, diceResults[index], state, this.config);
    }

    drawResult(ctx, diceResults, this.config, 1);

    return canvas.toBuffer('image/png');
  }
}

// Singleton
let rendererInstance = null;

export function getDiceRenderer(options) {
  if (!rendererInstance) {
    rendererInstance = new DiceRenderer(options);
  }
  return rendererInstance;
}

export default DiceRenderer;