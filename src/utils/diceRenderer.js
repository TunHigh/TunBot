import { Canvas } from '@napi-rs/canvas';
import GIFEncoder from 'gif-encoder-2';

/**
 * Premium Tài Xỉu Dice Renderer - True 3D Perspective
 * - Camera projection with focal length
 * - Face culling & painter's algorithm
 * - Hand-drawn organic pips (bezier curves)
 * - Dynamic face shading
 * - Physics-based tumble & settle
 * - Final frame hold
 */

const DEFAULTS = {
  width: 900,
  height: 500,
  fps: 30,
  duration: 1800,      // ms rolling
  resultPause: 500,    // ms hold final frame
  diceSize: 145,       // logical size (half-edge in 3D units)
  gap: 45,             // gap between dice centers
  background: '#111318',
  title: 'TÀI XỈU',
  showResultText: true,
  // 3D camera
  cameraZ: 420,
  focal: 300,
  // Colors
  faceLight: '#ffffff',
  faceMid: '#f5f6f8',
  faceDark: '#dfe3ea',
  faceShadow: '#e8ebef',
  faceShadowDark: '#c4cad3',
  outlineColor: '#aeb5bf',
  pipColor: '#151515',
  pipHighlight: '#ffffff',
  shadowColor: '#000000',
};

// ── 3D Math ──

function rotX(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotZ(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

function rotate(p, rx, ry, rz) {
  p = rotX(p, rx);
  p = rotY(p, ry);
  p = rotZ(p, rz);
  return p;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v) {
  const l = Math.sqrt(dot(v, v)) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ── Cube Geometry (unit cube, scaled by diceSize) ──

function createCubeGeometry(size) {
  const S = size / 2;
  const vertices = [
    { x: -S, y: -S, z: -S }, // 0
    { x:  S, y: -S, z: -S }, // 1
    { x:  S, y:  S, z: -S }, // 2
    { x: -S, y:  S, z: -S }, // 3
    { x: -S, y: -S, z:  S }, // 4
    { x:  S, y: -S, z:  S }, // 5
    { x:  S, y:  S, z:  S }, // 6
    { x: -S, y:  S, z:  S }, // 7
  ];

  const faces = [
    {
      name: 'front',
      indices: [4, 5, 6, 7],
      normal: { x: 0, y: 0, z: 1 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 1, z: 0 },
    },
    {
      name: 'right',
      indices: [1, 5, 6, 2],
      normal: { x: 1, y: 0, z: 0 },
      u: { x: 0, y: 0, z: -1 },
      v: { x: 0, y: 1, z: 0 },
    },
    {
      name: 'top',
      indices: [0, 1, 5, 4],
      normal: { x: 0, y: -1, z: 0 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: 1 },
    },
    {
      name: 'back',
      indices: [0, 3, 2, 1],
      normal: { x: 0, y: 0, z: -1 },
      u: { x: -1, y: 0, z: 0 },
      v: { x: 0, y: 1, z: 0 },
    },
    {
      name: 'left',
      indices: [0, 4, 7, 3],
      normal: { x: -1, y: 0, z: 0 },
      u: { x: 0, y: 0, z: 1 },
      v: { x: 0, y: 1, z: 0 },
    },
    {
      name: 'bottom',
      indices: [3, 7, 6, 2],
      normal: { x: 0, y: 1, z: 0 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: -1 },
    },
  ];

  return { vertices, faces };
}

// ── Pip Positions (normalized -0.5 to 0.5) ──

const pipPositions = {
  1: [[0, 0]],
  2: [[-0.48, -0.48], [0.48, 0.48]],
  3: [[-0.48, -0.48], [0, 0], [0.48, 0.48]],
  4: [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]],
  5: [[-0.48, -0.48], [0.48, -0.48], [0, 0], [-0.48, 0.48], [0.48, 0.48]],
  6: [[-0.48, -0.5], [-0.48, 0], [-0.48, 0.5], [0.48, -0.5], [0.48, 0], [0.48, 0.5]],
};

// ── Hand-drawn Pip (organic oval via bezier) ──

function drawPip(ctx, x, y, radius, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  // Organic hand-drawn oval shape
  ctx.moveTo(-radius * 0.95, 0);
  ctx.bezierCurveTo(
    -radius * 0.85, -radius * 0.75,
    -radius * 0.15, -radius,
    radius * 0.55, -radius * 0.65
  );
  ctx.bezierCurveTo(
    radius * 1.0, -radius * 0.25,
    radius * 0.9, radius * 0.5,
    radius * 0.45, radius * 0.75
  );
  ctx.bezierCurveTo(
    -radius * 0.1, radius * 1.0,
    -radius * 0.85, radius * 0.7,
    -radius * 0.95, 0
  );
  ctx.closePath();

  ctx.fillStyle = '#151515';
  ctx.fill();

  // Tiny soft highlight
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(
    -radius * 0.25, -radius * 0.28,
    radius * 0.25, radius * 0.12,
    -0.25, 0, Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

// ── Draw pips on a 3D face ──

function drawFacePips(ctx, face, number, rx, ry, rz, cameraZ, focal, canvasW, canvasH) {
  const positions = pipPositions[number];
  const S = face.indices ? 1 : 1; // placeholder, we use face geometry

  // Face center slightly in front of surface
  const center = {
    x: face.normal.x * 1.002,
    y: face.normal.y * 1.002,
    z: face.normal.z * 1.002,
  };

  for (const [px, py] of positions) {
    // Local position on face
    let p = {
      x: center.x + face.u.x * px * 1.25 + face.v.x * py * 1.25,
      y: center.y + face.u.y * px * 1.25 + face.v.y * py * 1.25,
      z: center.z + face.u.z * px * 1.25 + face.v.z * py * 1.25,
    };

    // Rotate with cube
    p = rotate(p, rx, ry, rz);

    // Project to 2D
    const z = cameraZ - p.z;
    const scale = focal / z;
    const projX = canvasW / 2 + p.x * scale;
    const projY = canvasH / 2 + p.y * scale;

    const pipRadius = 5.2 * scale;

    // Subtle wobble based on position
    const wobble = Math.sin(p.x * 0.2 + p.y * 0.13) * 0.18;

    drawPip(ctx, projX, projY, pipRadius, wobble);
  }
}

// ── Face Gradient (lighting based on visibility) ──

function faceGradient(ctx, points, visibility, config) {
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
  const light = clamp(visibility, 0, 1);

  if (light > 0.7) {
    g.addColorStop(0, config.faceLight);
    g.addColorStop(0.55, config.faceMid);
    g.addColorStop(1, config.faceDark);
  } else if (light > 0.2) {
    g.addColorStop(0, config.faceMid);
    g.addColorStop(0.55, '#e8ebf0');
    g.addColorStop(1, '#cbd1db');
  } else {
    g.addColorStop(0, config.faceShadow);
    g.addColorStop(1, config.faceShadowDark);
  }
  return g;
}

// ── Render a single die at world position (offsetX, offsetY) ──

function renderDie(ctx, rx, ry, rz, diceValues, faceVisibility, config, offsetX, offsetY) {
  const { vertices, faces } = createCubeGeometry(config.diceSize);
  const camera = { x: 0, y: 0, z: config.cameraZ };
  const canvasW = config.width;
  const canvasH = config.height;

  // Transform vertices
  const transformed = vertices.map(v => rotate(v, rx, ry, rz));

  // Determine visible faces with depth sorting
  const visibleFaces = [];

  for (const face of faces) {
    const a = transformed[face.indices[0]];
    const b = transformed[face.indices[1]];
    const c = transformed[face.indices[2]];

    // Face normal in world space
    const normal = normalize(cross(sub(b, a), sub(c, a)));

    // Face center
    const center = face.indices
      .map(i => transformed[i])
      .reduce(
        (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4, z: acc.z + p.z / 4 }),
        { x: 0, y: 0, z: 0 }
      );

    // Vector to camera
    const toCamera = normalize({
      x: camera.x - center.x,
      y: camera.y - center.y,
      z: camera.z - center.z,
    });

    const visibility = dot(normal, toCamera);

    if (visibility <= 0) continue;

    // Project face vertices
    const points = face.indices.map(i => {
      const v = transformed[i];
      const z = config.cameraZ - v.z;
      const scale = config.focal / z;
      return {
        x: canvasW / 2 + v.x * scale + offsetX,
        y: canvasH / 2 + v.y * scale + offsetY,
        scale,
      };
    });

    visibleFaces.push({
      face,
      points,
      center,
      visibility,
      depth: center.z,
    });
  }

  // Painter's algorithm: far to near
  visibleFaces.sort((a, b) => a.depth - b.depth);

  // Render faces
  for (const item of visibleFaces) {
    const { face, points, visibility } = item;

    ctx.save();
    ctx.beginPath();

    // Rounded polygon edges via quadratic curves
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    // Close with curve
    const last = points[points.length - 1];
    const first = points[0];
    const mx = (last.x + first.x) / 2;
    const my = (last.y + first.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my);
    ctx.quadraticCurveTo(first.x, first.y, first.x, first.y);
    ctx.closePath();

    // Face shading
    ctx.fillStyle = faceGradient(ctx, points, visibility, config);
    ctx.fill();

    // Thin outline
    ctx.strokeStyle = config.outlineColor;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();

    // Draw pips on this face
    // Map face name to dice value index
    let valueIndex = -1;
    switch (face.name) {
      case 'front': valueIndex = 0; break;
      case 'right': valueIndex = 1; break;
      case 'top': valueIndex = 2; break;
      case 'back': valueIndex = 0; break;  // hidden usually
      case 'left': valueIndex = 1; break;  // hidden usually
      case 'bottom': valueIndex = 2; break; // hidden usually
    }

    // For visible faces, we need to know which die value to show
    // We'll pass the dice values array and determine based on face
    // Actually, each die has 3 visible faces typically: front, right, top
    // We'll map: front->dice[0], right->dice[1], top->dice[2] for the first die
    // But we need per-die values. Let's handle this differently.
  }
}

// ── Render all 3 dice ──

function renderDice(ctx, diceStates, diceValues, config) {
  const canvasW = config.width;
  const canvasH = config.height;

  // Clear
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = config.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Central glow
  const glow = ctx.createRadialGradient(
    canvasW / 2, canvasH * 0.47, 30,
    canvasW / 2, canvasH * 0.47, canvasW * 0.55
  );
  glow.addColorStop(0, 'rgba(255,255,255,0.075)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.025)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Floor glow
  const floor = ctx.createRadialGradient(
    canvasW / 2, canvasH * 0.83, 20,
    canvasW / 2, canvasH * 0.83, 360
  );
  floor.addColorStop(0, 'rgba(255,255,255,0.035)');
  floor.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 31px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(config.title, canvasW / 2, 60);
  const lineWidth = 90;
  const grad = ctx.createLinearGradient(
    canvasW / 2 - lineWidth, 0,
    canvasW / 2 + lineWidth, 0
  );
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(canvasW / 2 - lineWidth, 76, lineWidth * 2, 1);
  ctx.restore();

  // Positions for 3 dice
  const totalWidth = config.diceSize * 3 + config.gap * 2;
  const startX = (canvasW - totalWidth) / 2;
  const baseY = 185 - canvasH / 2; // offset from center

  // Render each die
  for (let i = 0; i < 3; i++) {
    const state = diceStates[i];
    const offsetX = startX + i * (config.diceSize + config.gap) - canvasW / 2;
    const offsetY = baseY - state.bounce - state.finalBounce;

    renderSingleDie(ctx, state, diceValues[i], config, offsetX, offsetY);
  }

  // Result text
  drawResultText(ctx, diceValues, config);
}

// ── Render a single die with all its faces ──

function renderSingleDie(ctx, state, value, config, offsetX, offsetY) {
  const { vertices, faces } = createCubeGeometry(config.diceSize);
  const canvasW = config.width;
  const canvasH = config.height;

  // Transform vertices
  const transformed = vertices.map(v => rotate(v, state.rx, state.ry, state.rz));

  const camera = { x: 0, y: 0, z: config.cameraZ };

  // Determine visible faces with depth sorting
  const visibleFaces = [];

  for (const face of faces) {
    const a = transformed[face.indices[0]];
    const b = transformed[face.indices[1]];
    const c = transformed[face.indices[2]];

    const normal = normalize(cross(sub(b, a), sub(c, a)));

    const center = face.indices
      .map(i => transformed[i])
      .reduce(
        (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4, z: acc.z + p.z / 4 }),
        { x: 0, y: 0, z: 0 }
      );

    const toCamera = normalize({
      x: camera.x - center.x,
      y: camera.y - center.y,
      z: camera.z - center.z,
    });

    const visibility = dot(normal, toCamera);

    if (visibility <= 0) continue;

    const points = face.indices.map(i => {
      const v = transformed[i];
      const z = config.cameraZ - v.z;
      const scale = config.focal / z;
      return {
        x: canvasW / 2 + v.x * scale + offsetX,
        y: canvasH / 2 + v.y * scale + offsetY,
        scale,
      };
    });

    visibleFaces.push({
      face,
      points,
      center,
      visibility,
      depth: center.z,
    });
  }

  // Painter's algorithm
  visibleFaces.sort((a, b) => a.depth - b.depth);

  // Shadow (draw first, behind everything)
  drawDieShadow(ctx, state, config, offsetX, offsetY);

  // Render faces
  for (const item of visibleFaces) {
    const { face, points, visibility } = item;

    ctx.save();
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    const last = points[points.length - 1];
    const first = points[0];
    const mx = (last.x + first.x) / 2;
    const my = (last.y + first.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my);
    ctx.quadraticCurveTo(first.x, first.y, first.x, first.y);
    ctx.closePath();

    ctx.fillStyle = faceGradient(ctx, points, visibility, config);
    ctx.fill();

    ctx.strokeStyle = config.outlineColor;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();

    // Draw pips on this face
    // Map face to value: we show the die's value on front, right, top
    // For a standard die, opposite faces sum to 7
    // But for Tài Xỉu we just show the rolled value on visible faces
    let faceValue = value;
    // Could show different faces, but for simplicity show same value
    // on all visible faces (or map properly)
    
    drawFacePips(ctx, face, faceValue, state.rx, state.ry, state.rz, 
                 config.cameraZ, config.focal, canvasW, canvasH);
  }
}

// ── Die Shadow ──

function drawDieShadow(ctx, state, config, offsetX, offsetY) {
  const canvasW = config.width;
  const canvasH = config.height;

  // Project bottom center
  const bottomCenter = rotate({ x: 0, y: config.diceSize / 2, z: 0 }, state.rx, state.ry, state.rz);
  const z = config.cameraZ - bottomCenter.z;
  const scale = config.focal / z;
  const shadowX = canvasW / 2 + bottomCenter.x * scale + offsetX;
  const shadowY = canvasH / 2 + bottomCenter.y * scale + offsetY + config.diceSize * 0.6 * scale;

  ctx.save();
  ctx.globalAlpha = 0.35 * state.shadowScale;
  ctx.filter = 'blur(12px)';
  ctx.beginPath();
  ctx.ellipse(
    shadowX,
    shadowY,
    config.diceSize * 0.45 * scale * state.shadowWidth,
    config.diceSize * 0.1 * scale,
    0, 0, Math.PI * 2
  );
  ctx.fillStyle = config.shadowColor;
  ctx.fill();
  ctx.restore();
}

// ── Result Text ──

function drawResultText(ctx, diceValues, config) {
  if (!config.showResultText) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '600 20px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.fillText('ĐANG LẮC...', config.width / 2, 450);
  ctx.restore();
}

function drawFinalResultText(ctx, diceValues, config) {
  if (!config.showResultText) return;

  const total = diceValues[0] + diceValues[1] + diceValues[2];
  const type = total >= 11 ? 'TÀI' : 'XỈU';

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 27px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(
    `${diceValues[0]}  •  ${diceValues[1]}  •  ${diceValues[2]}    =    ${total}    →    ${type}`,
    config.width / 2, 450
  );
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

    // Per-dice random initial state
    const diceStates = [0, 1, 2].map(i => {
      return {
        // Initial random orientation
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        // Spin speeds (radians per frame at full speed)
        spinX: (7 + Math.random() * 5) * Math.PI / 30,
        spinY: (8 + Math.random() * 6) * Math.PI / 30,
        spinZ: (4 + Math.random() * 4) * Math.PI / 30,
        // Bounce
        bouncePhase: Math.random() * Math.PI * 2,
        bounce: 0,
        finalBounce: 0,
        // Shadow
        shadowScale: 1,
        shadowWidth: 1,
        // Final settled orientation (slightly randomized)
        finalRx: Math.sin(i * 1.7) * 0.04,
        finalRy: Math.sin(i * 2.3) * 0.06,
        finalRz: Math.sin(i) * 0.025,
      };
    });

    // Rolling frames
    for (let frame = 0; frame < this.frameCount; frame++) {
      const rawProgress = frame / Math.max(1, this.frameCount - 1);

      const rollProgress = clamp(rawProgress / 0.72, 0, 1);
      const settleProgress = clamp((rawProgress - 0.72) / 0.28, 0, 1);

      const rollingEase = easeOutCubic(rollProgress);
      const settleEase = easeOutBack(settleProgress);

      // Update each die
      diceStates.forEach((state, index) => {
        const roll = 1 - rollingEase;

        // Spin during roll phase
        state.rx = lerp(state.rx + roll * state.spinX * 30, state.finalRx, settleEase);
        state.ry = lerp(state.ry + roll * state.spinY * 30, state.finalRy, settleEase);
        state.rz = lerp(state.rz + roll * state.spinZ * 30, state.finalRz, settleEase);

        // Bounce
        const bounceWave = Math.abs(Math.sin(frame * 0.68 + state.bouncePhase));
        state.bounce = bounceWave * 42 * (1 - rollingEase) * (1 - settleProgress);

        // Final settle bounce
        state.finalBounce = Math.sin(settleProgress * Math.PI * 3) * 8 * (1 - settleProgress);

        // Shadow
        state.shadowScale = 0.72 + (1 - state.bounce / 42) * 0.28;
        state.shadowWidth = 1 + state.bounce / 80;
      });

      renderDice(ctx, diceStates, diceResults, this.config);
      encoder.addFrame(ctx);
    }

    // Hold final frames
    for (let i = 0; i < this.pauseFrames; i++) {
      // Final settled state
      const finalStates = diceStates.map((state, index) => ({
        rx: state.finalRx,
        ry: state.finalRy,
        rz: state.finalRz,
        bounce: 0,
        finalBounce: 0,
        shadowScale: 1,
        shadowWidth: 1,
      }));

      // Clear and render
      ctx.clearRect(0, 0, this.config.width, this.config.height);
      ctx.fillStyle = this.config.background;
      ctx.fillRect(0, 0, this.config.width, this.config.height);

      // Glows
      const glow = ctx.createRadialGradient(
        this.config.width / 2, this.config.height * 0.47, 30,
        this.config.width / 2, this.config.height * 0.47, this.config.width * 0.55
      );
      glow.addColorStop(0, 'rgba(255,255,255,0.075)');
      glow.addColorStop(0.5, 'rgba(255,255,255,0.025)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.config.width, this.config.height);

      const floor = ctx.createRadialGradient(
        this.config.width / 2, this.config.height * 0.83, 20,
        this.config.width / 2, this.config.height * 0.83, 360
      );
      floor.addColorStop(0, 'rgba(255,255,255,0.035)');
      floor.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, this.config.width, this.config.height);

      // Title
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 31px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(this.config.title, this.config.width / 2, 60);
      const lineWidth = 90;
      const grad = ctx.createLinearGradient(
        this.config.width / 2 - lineWidth, 0,
        this.config.width / 2 + lineWidth, 0
      );
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(this.config.width / 2 - lineWidth, 76, lineWidth * 2, 1);
      ctx.restore();

      // Render dice at final positions
      const totalWidth = this.config.diceSize * 3 + this.config.gap * 2;
      const startX = (this.config.width - totalWidth) / 2;
      const baseY = 185 - this.config.height / 2;

      for (let index = 0; index < 3; index++) {
        const offsetX = startX + index * (this.config.diceSize + this.config.gap) - this.config.width / 2;
        const offsetY = baseY;
        renderSingleDie(ctx, finalStates[index], diceResults[index], this.config, offsetX, offsetY);
      }

      drawFinalResultText(ctx, diceResults, this.config);
      encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
  }

  async renderFinalFrame(diceResults) {
    const canvas = new Canvas(this.config.width, this.config.height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = this.config.background;
    ctx.fillRect(0, 0, this.config.width, this.config.height);

    // Glows
    const glow = ctx.createRadialGradient(
      this.config.width / 2, this.config.height * 0.47, 30,
      this.config.width / 2, this.config.height * 0.47, this.config.width * 0.55
    );
    glow.addColorStop(0, 'rgba(255,255,255,0.075)');
    glow.addColorStop(0.5, 'rgba(255,255,255,0.025)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.config.width, this.config.height);

    const floor = ctx.createRadialGradient(
      this.config.width / 2, this.config.height * 0.83, 20,
      this.config.width / 2, this.config.height * 0.83, 360
    );
    floor.addColorStop(0, 'rgba(255,255,255,0.035)');
    floor.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, this.config.width, this.config.height);

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 31px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(this.config.title, this.config.width / 2, 60);
    const lineWidth = 90;
    const grad = ctx.createLinearGradient(
      this.config.width / 2 - lineWidth, 0,
      this.config.width / 2 + lineWidth, 0
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(this.config.width / 2 - lineWidth, 76, lineWidth * 2, 1);
    ctx.restore();

    // Final dice states
    const finalStates = [0, 1, 2].map(i => ({
      rx: Math.sin(i * 1.7) * 0.04,
      ry: Math.sin(i * 2.3) * 0.06,
      rz: Math.sin(i) * 0.025,
      bounce: 0,
      finalBounce: 0,
      shadowScale: 1,
      shadowWidth: 1,
    }));

    const totalWidth = this.config.diceSize * 3 + this.config.gap * 2;
    const startX = (this.config.width - totalWidth) / 2;
    const baseY = 185 - this.config.height / 2;

    for (let index = 0; index < 3; index++) {
      const offsetX = startX + index * (this.config.diceSize + this.config.gap) - this.config.width / 2;
      const offsetY = baseY;
      renderSingleDie(ctx, finalStates[index], diceResults[index], this.config, offsetX, offsetY);
    }

    drawFinalResultText(ctx, diceResults, this.config);

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