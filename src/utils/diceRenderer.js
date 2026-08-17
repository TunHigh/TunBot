import { Canvas, Path2D } from '@napi-rs/canvas';
import GIFEncoder from 'gif-encoder-2';

/**
 * 2.5D Isometric Dice Renderer using @napi-rs/canvas + gif-encoder-2
 * Renders procedural 3D-looking dice rolling animation as GIF
 */
export class DiceRenderer {
  constructor(options = {}) {
    this.diceSize = options.diceSize || 128;
    this.spacing = options.spacing || 20;
    this.canvasWidth = this.diceSize * 3 + this.spacing * 2 + 40;
    this.canvasHeight = this.diceSize + 60;
    this.frameCount = options.frameCount || 45;
    this.fps = options.fps || 25;

    // Pre-computed face dot patterns for dice 1-6
    this.facePatterns = this.generateFacePatterns();

    // Colors
    this.colors = {
      background: '#1a1a2e',
      diceBase: '#ffffff',
      diceShadow: '#d0d0d0',
      diceDark: '#909090',
      dotColor: '#1a1a2e',
      highlight: '#f8f8f8',
    };
  }

  /**
   * Generate dot positions for each dice face (1-6)
   * Returns normalized coordinates (0-1) on a 3x3 grid
   */
  generateFacePatterns() {
    return {
      1: [{ x: 0.5, y: 0.5 }],
      2: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }],
      3: [{ x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }],
      4: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }],
      5: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }],
      6: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }],
    };
  }

  // ── Easing helpers ──────────────────────────────────

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // ── Seeded RNG ──────────────────────────────────────

  mulberry32(a) {
    return () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Animation transforms ────────────────────────────

  calculateDiceTransform(diceIndex, progress, finalFace, seed) {
    const rng = this.mulberry32(seed + diceIndex * 1000);

    const throwEnd = 0.25;
    const spinEnd = 0.55;
    const fallEnd = 0.82;

    let x, y, currentFace, squash, wobble;

    const baseX = this.diceSize / 2 + 20 + diceIndex * (this.diceSize + this.spacing);

    if (progress < throwEnd) {
      // ─── Throw up ───
      const t = progress / throwEnd;
      const e = this.easeOutCubic(t);
      x = baseX;
      y = this.canvasHeight - this.diceSize / 2 - 30 - e * (this.canvasHeight * 0.55);
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1 + e * 0.15;
      wobble = Math.sin(t * Math.PI * 6) * (1 - t) * 8;
    } else if (progress < spinEnd) {
      // ─── Spin in air ───
      const t = (progress - throwEnd) / (spinEnd - throwEnd);
      x = baseX + Math.sin(t * Math.PI * 3) * 12;
      y = this.canvasHeight - this.diceSize / 2 - 30 - this.canvasHeight * 0.55 + Math.sin(t * Math.PI * 5) * 8;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1;
      wobble = Math.sin(t * Math.PI * 8) * 6;
    } else if (progress < fallEnd) {
      // ─── Fall down ───
      const t = (progress - spinEnd) / (fallEnd - spinEnd);
      const e = this.easeOutCubic(t);
      x = baseX;
      y = this.canvasHeight - this.diceSize / 2 - 30 - this.canvasHeight * 0.55 * (1 - e);
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1 + (1 - e) * 0.1;
      wobble = (1 - e) * 5;
    } else {
      // ─── Settle ───
      const t = (progress - fallEnd) / (1 - fallEnd);
      const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 12;
      x = baseX;
      y = this.canvasHeight - this.diceSize / 2 - 30 - bounce;
      currentFace = finalFace;
      squash = 1 + Math.max(0, Math.sin(t * Math.PI * 2)) * 0.08 * (1 - t);
      wobble = 0;
    }

    return { x, y, currentFace, squash, wobble };
  }

  // ── Isometric dice drawing ──────────────────────────

  /**
   * Draw an isometric (2.5D) dice at position with the given face value on top
   */
  drawDice(ctx, cx, cy, faceValue, size, squash, wobble) {
    const iso = Math.PI / 6; // 30° isometric angle
    const s = size / 2;

    // 8 corners of a cube in isometric projection
    const topCenter = { x: 0, y: -s * 0.55 };
    const topLeft = { x: -s * Math.cos(iso), y: -s * 0.55 - s * Math.sin(iso) * 0.6 };
    const topRight = { x: s * Math.cos(iso), y: -s * 0.55 - s * Math.sin(iso) * 0.6 };
    const midLeft = { x: -s * Math.cos(iso), y: s * 0.05 - s * Math.sin(iso) * 0.6 };
    const midRight = { x: s * Math.cos(iso), y: s * 0.05 - s * Math.sin(iso) * 0.6 };
    const center = { x: 0, y: s * 0.05 };
    const bottomLeft = { x: -s * Math.cos(iso), y: s * 0.05 + s * 0.5 };
    const bottomRight = { x: s * Math.cos(iso), y: s * 0.05 + s * 0.5 };
    const bottomCenter = { x: 0, y: s * 0.05 + s * 0.5 + s * Math.sin(iso) * 0.6 };

    // Left face vertices
    const leftFace = [topLeft, topCenter, center, midLeft];
    // Right face vertices
    const rightFace = [topCenter, topRight, midRight, center];
    // Top face vertices
    const topFace = [topLeft, topRight, topCenter]; // diamond top

    // Actually let me rethink the isometric cube drawing
    // Standard isometric cube: top face (diamond), left face, right face

    const cubeSize = s * 0.85;

    // Top face (diamond)
    const topPath = [
      { x: 0, y: -cubeSize },                          // top point
      { x: cubeSize * Math.cos(iso), y: -cubeSize * Math.sin(iso) },  // right point
      { x: 0, y: 0 },                                   // center
      { x: -cubeSize * Math.cos(iso), y: -cubeSize * Math.sin(iso) }, // left point
    ];

    // Left face (parallelogram)
    const leftPath = [
      { x: -cubeSize * Math.cos(iso), y: -cubeSize * Math.sin(iso) },  // top
      { x: 0, y: 0 },                                                      // middle
      { x: 0, y: cubeSize },                                               // bottom
      { x: -cubeSize * Math.cos(iso), y: cubeSize - cubeSize * Math.sin(iso) },
    ];

    // Right face (parallelogram)
    const rightPath = [
      { x: cubeSize * Math.cos(iso), y: -cubeSize * Math.sin(iso) },
      { x: 0, y: 0 },
      { x: 0, y: cubeSize },
      { x: cubeSize * Math.cos(iso), y: cubeSize - cubeSize * Math.sin(iso) },
    ];

    ctx.save();
    ctx.translate(cx + (wobble || 0), cy);

    // Squash effect
    ctx.scale(squash || 1, 2 - (squash || 1));

    // Shadow on ground
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, cubeSize * 0.55, cubeSize * 0.8, cubeSize * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Determine which faces to show
    const leftVal = this.getLeftFace(faceValue);
    const rightVal = this.getRightFace(faceValue);

    // Draw top face
    this.drawFacePoly(ctx, topPath, faceValue, 'top', cubeSize);

    // Draw left face
    this.drawFacePoly(ctx, leftPath, leftVal, 'left', cubeSize);

    // Draw right face
    this.drawFacePoly(ctx, rightPath, rightVal, 'right', cubeSize);

    // Draw face outlines
    this.strokeFace(ctx, topPath, '#555555', 2);
    this.strokeFace(ctx, leftPath, '#555555', 2);
    this.strokeFace(ctx, rightPath, '#555555', 2);

    // Draw dots on each face
    this.drawDots(ctx, topPath, faceValue, cubeSize, 'top');
    this.drawDots(ctx, leftPath, leftVal, cubeSize, 'left');
    this.drawDots(ctx, rightPath, rightVal, cubeSize, 'right');

    ctx.restore();
  }

  /**
   * Fill a polygon face with gradient shading
   */
  drawFacePoly(ctx, points, faceValue, faceType, cubeSize) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    // Shading based on face type
    let baseColor;
    if (faceType === 'top') {
      baseColor = '#f0f0f0';
    } else if (faceType === 'left') {
      baseColor = '#c0c0c0';
    } else {
      baseColor = '#d8d8d8';
    }

    // Create gradient-like effect
    const grad = ctx.createLinearGradient(
      points[0].x, points[0].y,
      points[points.length - 1].x, points[points.length - 1].y
    );
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, faceType === 'top' ? '#d0d0d0' : faceType === 'left' ? '#a0a0a0' : '#b8b8b8');

    ctx.fillStyle = grad;
    ctx.fill();
  }

  strokeFace(ctx, points, color, width) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * Draw dots on a face polygon
   */
  drawDots(ctx, polygon, faceValue, cubeSize, faceType) {
    const dots = this.facePatterns[faceValue];
    if (!dots) return;

    const iso = Math.PI / 6;
    const dotRadius = cubeSize * 0.07;

    ctx.fillStyle = '#1a1a2e';

    for (const dot of dots) {
      // Map dot position to face polygon using bilinear interpolation
      const u = dot.x; // 0..1 horizontal
      const v = dot.y; // 0..1 vertical

      // For a parallelogram/rhombus face, use bilinear interpolation
      // Points order: top-left, top-right, bottom-right, bottom-left
      // polygon = [p0(top), p1(right), p2(bottom), p3(left)] for isometric faces

      const p0 = polygon[0];
      const p1 = polygon[1];
      const p2 = polygon[2];
      const p3 = polygon[3] || polygon[0]; // triangle fallback

      // Bilinear interpolation
      const topX = p0.x + (p1.x - p0.x) * u;
      const topY = p0.y + (p1.y - p0.y) * u;
      const botX = p3.x + (p2.x - p3.x) * u;
      const botY = p3.y + (p2.y - p3.y) * u;

      const dx = topX + (botX - topX) * v;
      const dy = topY + (botY - topY) * v;

      ctx.beginPath();
      ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Get left face value given top face (standard dice mapping)
   */
  getLeftFace(topFace) {
    const map = { 1: 4, 2: 5, 3: 1, 4: 6, 5: 4, 6: 3 };
    return map[topFace] || 4;
  }

  /**
   * Get right face value given top face (standard dice mapping)
   */
  getRightFace(topFace) {
    const map = { 1: 3, 2: 4, 3: 6, 4: 1, 5: 3, 6: 2 };
    return map[topFace] || 3;
  }

  // ── GIF rendering ───────────────────────────────────

  /**
   * Render the complete dice rolling animation as GIF buffer
   */
  async renderRollAnimation(diceResults, seed = Date.now()) {
    const encoder = new GIFEncoder(this.canvasWidth, this.canvasHeight);
    encoder.setRepeat(0);   // loop forever
    encoder.setDelay(Math.round(1000 / this.fps));
    encoder.setQuality(10);

    encoder.start();

    for (let frame = 0; frame < this.frameCount; frame++) {
      const progress = frame / Math.max(1, this.frameCount - 1);

      const canvas = new Canvas(this.canvasWidth, this.canvasHeight);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = this.colors.background;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

      // Draw a subtle title bar
      ctx.fillStyle = '#2a2a4e';
      ctx.fillRect(0, 0, this.canvasWidth, 30);

      // Draw 3 dice
      for (let i = 0; i < 3; i++) {
        const t = this.calculateDiceTransform(i, progress, diceResults[i], seed);
        this.drawDice(ctx, t.x, t.y, t.currentFace, this.diceSize, t.squash, t.wobble);
      }

      encoder.addFrame(ctx);
    }

    encoder.finish();

    return encoder.out.getData();
  }

  /**
   * Render a single static frame (final result) as PNG buffer
   */
  async renderFinalFrame(diceResults) {
    const canvas = new Canvas(this.canvasWidth, this.canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    for (let i = 0; i < 3; i++) {
      const x = this.diceSize / 2 + 20 + i * (this.diceSize + this.spacing);
      const y = this.canvasHeight - this.diceSize / 2 - 30;
      this.drawDice(ctx, x, y, diceResults[i], this.diceSize, 1, 0);
    }

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