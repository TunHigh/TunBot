import { Canvas, Path2D } from '@napi-rs/canvas';
import GIFEncoder from 'gif-encoder-2';

/**
 * Premium 2.5D Isometric Dice Renderer
 * High-quality procedural 3D dice rolling animation with advanced effects
 */
export class DiceRenderer {
  constructor(options = {}) {
    this.diceSize = options.diceSize || 140;
    this.spacing = options.spacing || 25;
    this.canvasWidth = this.diceSize * 3 + this.spacing * 2 + 60;
    this.canvasHeight = this.diceSize + 80;
    this.frameCount = options.frameCount || 75;
    this.fps = options.fps || 25;

    // Pre-computed face dot patterns for dice 1-6
    this.facePatterns = this.generateFacePatterns();

    // Premium color palette
    this.colors = {
      background: '#0d0d1a',
      backgroundAccent: '#1a1a3e',
      diceBase: '#fafafa',
      diceHighlight: '#ffffff',
      diceMidtone: '#d0d0d0',
      diceShadow: '#909090',
      diceDark: '#606060',
      dotColor: '#0d0d1a',
      dotShadow: '#000000',
      goldAccent: '#ffd700',
      goldDark: '#b8860b',
      tableDark: '#0a1a0a',
      tableMid: '#102810',
      tableLight: '#1a3a1a',
    };

    // Animation phases (normalized 0-1) - In-place spinning
    this.phases = {
      anticipation: 0.10,   // Wind up / shake
      spinFast: 0.45,       // Fast spinning in place
      spinSlow: 0.75,       // Decelerating spin
      settle: 1.0,          // Final settle
    };
  }

  generateFacePatterns() {
    return {
      1: [{ x: 0.5, y: 0.5 }],
      2: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.78 }],
      3: [{ x: 0.22, y: 0.22 }, { x: 0.5, y: 0.5 }, { x: 0.78, y: 0.78 }],
      4: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }],
      5: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.5, y: 0.5 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }],
      6: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.22, y: 0.5 }, { x: 0.78, y: 0.5 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }],
    };
  }

  // ── Advanced Easing Functions ─────────────────────────

  easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  // ── Seeded RNG ────────────────────────────────────────

  mulberry32(a) {
    return () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── 3D Rotation Tracking ──────────────────────────────

  /**
   * Calculate full 3D transform for a die at given progress
   * In-place spinning animation (no jumping)
   */
  calculateDiceTransform(diceIndex, progress, finalFace, seed) {
    const rng = this.mulberry32(seed + diceIndex * 1000 + 42);

    const baseX = this.diceSize / 2 + 30 + diceIndex * (this.diceSize + this.spacing);
    const groundY = this.canvasHeight - this.diceSize / 2 - 25;

    // Per-dice variation
    const variation = rng();
    const variation2 = rng();
    const variation3 = rng();

    let x, y, rotX, rotY, rotZ, scale, currentFace, squash, wobble;

    if (progress < this.phases.anticipation) {
      // ─── Anticipation / Shake ───
      const t = progress / this.phases.anticipation;
      const e = this.easeInOutCubic(t);
      
      // Subtle shake/wobble before spin
      x = baseX + Math.sin(t * Math.PI * 8) * 3 * e * (variation - 0.5);
      y = groundY;
      rotX = Math.sin(t * Math.PI * 6) * 0.15 * e * (variation2 - 0.5);
      rotY = Math.sin(t * Math.PI * 7) * 0.2 * e * (variation3 - 0.5);
      rotZ = Math.sin(t * Math.PI * 5) * 0.1 * e * (variation - 0.5);
      scale = 1;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1;
      wobble = Math.sin(t * Math.PI * 10) * 2 * e;

    } else if (progress < this.phases.spinFast) {
      // ─── Fast Spinning In Place ───
      const t = (progress - this.phases.anticipation) / (this.phases.spinFast - this.phases.anticipation);
      const e = this.easeOutQuart(t); // Fast start, then maintain speed
      
      x = baseX;
      y = groundY;
      
      // High-speed rotation on multiple axes
      const spinSpeedX = 8 + variation * 6;
      const spinSpeedY = 10 + variation2 * 8;
      const spinSpeedZ = 6 + variation3 * 4;
      
      rotX = Math.PI * 2 * spinSpeedX * t + variation * Math.PI;
      rotY = Math.PI * 2 * spinSpeedY * t + variation2 * Math.PI;
      rotZ = Math.PI * 2 * spinSpeedZ * t + variation3 * Math.PI;
      
      // Subtle vertical vibration from spin
      const vibrate = Math.sin(t * Math.PI * 30) * 1.5 * (1 - t * 0.3);
      y += vibrate;
      
      scale = 1;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1;
      wobble = Math.sin(t * Math.PI * 20) * 1.5 * (1 - t * 0.2);

    } else if (progress < this.phases.spinSlow) {
      // ─── Decelerating Spin ───
      const t = (progress - this.phases.spinFast) / (this.phases.spinSlow - this.phases.spinFast);
      const e = this.easeOutQuart(t); // Smooth deceleration
      
      x = baseX;
      y = groundY;
      
      // Rotation slowing down
      const spinSpeedX = 8 + variation * 6;
      const spinSpeedY = 10 + variation2 * 8;
      const spinSpeedZ = 6 + variation3 * 4;
      
      const totalSpinX = Math.PI * 2 * spinSpeedX * (this.phases.spinFast - this.phases.anticipation);
      const totalSpinY = Math.PI * 2 * spinSpeedY * (this.phases.spinFast - this.phases.anticipation);
      const totalSpinZ = Math.PI * 2 * spinSpeedZ * (this.phases.spinFast - this.phases.anticipation);
      
      const decelFactor = 1 - e;
      rotX = totalSpinX + totalSpinX * decelFactor * 0.5 + variation * Math.PI;
      rotY = totalSpinY + totalSpinY * decelFactor * 0.5 + variation2 * Math.PI;
      rotZ = totalSpinZ + totalSpinZ * decelFactor * 0.5 + variation3 * Math.PI;
      
      // Less vibration as it slows
      const vibrate = Math.sin(t * Math.PI * 15) * 1 * (1 - t);
      y += vibrate;
      
      scale = 1;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1;
      wobble = Math.sin(t * Math.PI * 10) * 1 * (1 - t);

    } else {
      // ─── Final Settle ───
      const t = (progress - this.phases.spinSlow) / (this.phases.settle - this.phases.spinSlow);
      const e = this.easeOutElastic(t);
      
      x = baseX;
      y = groundY;
      
      // Snap to final orientation showing correct face
      const finalRotX = Math.PI * 2 * Math.round((8 + variation * 6) * 0.5 + variation);
      const finalRotY = Math.PI * 2 * Math.round((10 + variation2 * 8) * 0.5 + variation2);
      const finalRotZ = Math.PI * 2 * Math.round((6 + variation3 * 4) * 0.5 + variation3);
      
      // Smoothly interpolate to zero rotation (upright)
      const snapProgress = Math.min(1, t * 1.5);
      rotX = finalRotX * (1 - snapProgress);
      rotY = finalRotY * (1 - snapProgress);
      rotZ = finalRotZ * (1 - snapProgress);
      
      // Tiny final bounce
      const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * Math.pow(1 - t, 2) * 3;
      y -= bounce;
      
      scale = 1;
      currentFace = t > 0.5 ? finalFace : Math.floor(rng() * 6) + 1;
      squash = 1 + Math.max(0, Math.sin(t * Math.PI * 4)) * 0.05 * (1 - t);
      wobble = Math.max(0, Math.sin(t * Math.PI * 2)) * (1 - t) * 1;
    }

    return { x, y, rotX, rotY, rotZ, scale, currentFace, squash, wobble };
  }

  // ── Premium Isometric Dice Drawing ────────────────────

  drawDice(ctx, cx, cy, faceValue, size, squash, wobble, rotX = 0, rotY = 0, rotZ = 0, scale = 1) {
    const iso = Math.PI / 6; // 30° isometric
    const s = size / 2 * 0.9;
    const cubeSize = s * 0.95;

    ctx.save();
    ctx.translate(cx + (wobble || 0), cy);
    ctx.scale((squash || 1) * scale, (2 - (squash || 1)) * scale);

    // ── Ground Shadow (dynamic based on height) ───
    const shadowAlpha = 0.3;
    const shadowBlur = 15;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = shadowBlur;
    ctx.beginPath();
    ctx.ellipse(0, cubeSize * 0.6, cubeSize * 0.85, cubeSize * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Build 3D cube faces with proper isometric projection ───
    const cosIso = Math.cos(iso);
    const sinIso = Math.sin(iso);
    const h = cubeSize * 0.5; // height factor

    // Face centers in 3D isometric space
    // Top face (diamond)
    const topFace = [
      { x: 0, y: -cubeSize - h },
      { x: cubeSize * cosIso, y: -cubeSize * sinIso - h },
      { x: 0, y: 0 - h },
      { x: -cubeSize * cosIso, y: -cubeSize * sinIso - h },
    ];

    // Left face
    const leftFace = [
      { x: -cubeSize * cosIso, y: -cubeSize * sinIso - h },
      { x: 0, y: -h },
      { x: 0, y: cubeSize - h },
      { x: -cubeSize * cosIso, y: cubeSize - cubeSize * sinIso - h },
    ];

    // Right face
    const rightFace = [
      { x: cubeSize * cosIso, y: -cubeSize * sinIso - h },
      { x: 0, y: -h },
      { x: 0, y: cubeSize - h },
      { x: cubeSize * cosIso, y: cubeSize - cubeSize * sinIso - h },
    ];

    // Determine visible faces based on 3D rotation
    // Simplified: always show top, left, right for isometric look
    const leftVal = this.getLeftFace(faceValue);
    const rightVal = this.getRightFace(faceValue);

    // ── Draw faces with premium shading ───
    this.drawPremiumFace(ctx, topFace, faceValue, 'top', cubeSize);
    this.drawPremiumFace(ctx, leftFace, leftVal, 'left', cubeSize);
    this.drawPremiumFace(ctx, rightFace, rightVal, 'right', cubeSize);

    // ── Draw edges with highlight/shadow ───
    this.drawEdges(ctx, topFace, leftFace, rightFace, cubeSize);

    // ── Draw dots (pips) with 3D depth ───
    this.drawPremiumDots(ctx, topFace, faceValue, cubeSize, 'top');
    this.drawPremiumDots(ctx, leftFace, leftVal, cubeSize, 'left');
    this.drawPremiumDots(ctx, rightFace, rightVal, cubeSize, 'right');

    ctx.restore();
  }

  drawPremiumFace(ctx, points, faceValue, faceType, cubeSize) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    // Premium multi-stop gradients for each face
    let grad;
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const h = cubeSize * 0.5;

    if (faceType === 'top') {
      grad = ctx.createRadialGradient(cx, cy - cubeSize * 0.3, 0, cx, cy - cubeSize * 0.3, cubeSize * 1.2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#f0f0f0');
      grad.addColorStop(0.7, '#d8d8d8');
      grad.addColorStop(1, '#c0c0c0');
    } else if (faceType === 'left') {
      grad = ctx.createLinearGradient(
        points[0].x, points[0].y,
        points[2].x, points[2].y
      );
      grad.addColorStop(0, '#e8e8e8');
      grad.addColorStop(0.5, '#c8c8c8');
      grad.addColorStop(1, '#a0a0a0');
    } else { // right
      grad = ctx.createLinearGradient(
        points[0].x, points[0].y,
        points[2].x, points[2].y
      );
      grad.addColorStop(0, '#f0f0f0');
      grad.addColorStop(0.5, '#d0d0d0');
      grad.addColorStop(1, '#b0b0b0');
    }

    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle inner glow on top face
    if (faceType === 'top') {
      ctx.save();
      ctx.clip();
      const glowGrad = ctx.createRadialGradient(cx, cy - cubeSize * 0.3, 0, cx, cy - cubeSize * 0.3, cubeSize);
      glowGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
      glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(cx - cubeSize, cy - cubeSize - h, cubeSize * 2, cubeSize * 2);
      ctx.restore();
    }
  }

  drawEdges(ctx, topFace, leftFace, rightFace, cubeSize) {
    // Outer edges with highlight/shadow for 3D depth
    const edges = [
      // Top face edges
      { pts: [topFace[0], topFace[1]], color: '#ffffff', width: 1.5 }, // top-right highlight
      { pts: [topFace[0], topFace[3]], color: '#909090', width: 1.5 }, // top-left shadow
      { pts: [topFace[1], topFace[2]], color: '#b0b0b0', width: 1 },   // right edge
      { pts: [topFace[3], topFace[2]], color: '#808080', width: 1 },   // left edge
      // Vertical edges
      { pts: [topFace[1], rightFace[1]], color: '#ffffff', width: 1.5 }, // right highlight
      { pts: [topFace[3], leftFace[1]], color: '#707070', width: 1.5 },  // left shadow
      { pts: [topFace[2], leftFace[2]], color: '#808080', width: 1 },    // back
      { pts: [topFace[2], rightFace[2]], color: '#a0a0a0', width: 1 },   // front
      // Bottom edges
      { pts: [leftFace[2], leftFace[3]], color: '#606060', width: 1 },
      { pts: [rightFace[2], rightFace[3]], color: '#808080', width: 1 },
      { pts: [leftFace[3], rightFace[3]], color: '#505050', width: 1.5 },
    ];

    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(edge.pts[0].x, edge.pts[0].y);
      ctx.lineTo(edge.pts[1].x, edge.pts[1].y);
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  drawPremiumDots(ctx, polygon, faceValue, cubeSize, faceType) {
    const dots = this.facePatterns[faceValue];
    if (!dots) return;

    const dotRadius = cubeSize * 0.085;
    const h = cubeSize * 0.5;

    for (const dot of dots) {
      const u = dot.x;
      const v = dot.y;

      // Bilinear interpolation on face polygon
      const p0 = polygon[0];
      const p1 = polygon[1];
      const p2 = polygon[2];
      const p3 = polygon[3];

      const topX = p0.x + (p1.x - p0.x) * u;
      const topY = p0.y + (p1.y - p0.y) * u;
      const botX = p3.x + (p2.x - p3.x) * u;
      const botY = p3.y + (p2.y - p3.y) * u;

      const dx = topX + (botX - topX) * v;
      const dy = topY + (botY - topY) * v;

      // Draw dot with 3D depth (shadow + highlight)
      ctx.save();

      // Dot shadow (slightly offset)
      ctx.beginPath();
      ctx.arc(dx + 1, dy + 1, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      // Dot main body with gradient
      const dotGrad = ctx.createRadialGradient(
        dx - dotRadius * 0.3, dy - dotRadius * 0.3, 0,
        dx, dy, dotRadius
      );
      dotGrad.addColorStop(0, '#2a2a2a');
      dotGrad.addColorStop(0.5, '#1a1a1a');
      dotGrad.addColorStop(1, '#0a0a0a');

      ctx.beginPath();
      ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = dotGrad;
      ctx.fill();

      // Dot highlight
      ctx.beginPath();
      ctx.arc(dx - dotRadius * 0.25, dy - dotRadius * 0.25, dotRadius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();

      ctx.restore();
    }
  }

  getLeftFace(topFace) {
    const map = { 1: 4, 2: 5, 3: 1, 4: 6, 5: 4, 6: 3 };
    return map[topFace] || 4;
  }

  getRightFace(topFace) {
    const map = { 1: 3, 2: 4, 3: 6, 4: 1, 5: 3, 6: 2 };
    return map[topFace] || 3;
  }

  // ── Premium Background ────────────────────────────────

  drawBackground(ctx, progress) {
    // Dark gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, this.canvasHeight);
    grad.addColorStop(0, '#0d0d1a');
    grad.addColorStop(0.3, '#1a1a3e');
    grad.addColorStop(0.6, '#0f1a2e');
    grad.addColorStop(1, '#0a0a15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Subtle animated particles during fast spin
    if (progress > this.phases.anticipation && progress < this.phases.spinSlow) {
      this.drawAmbientParticles(ctx, progress);
    }

    // Table surface - dark felt, no green border
    const tableY = this.canvasHeight - 25;
    const tableGrad = ctx.createLinearGradient(0, tableY, 0, this.canvasHeight);
    tableGrad.addColorStop(0, this.colors.tableLight);
    tableGrad.addColorStop(0.5, this.colors.tableMid);
    tableGrad.addColorStop(1, this.colors.tableDark);
    ctx.fillStyle = tableGrad;
    ctx.fillRect(0, tableY, this.canvasWidth, this.canvasHeight - tableY);

    // Subtle table texture lines
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const y = tableY + i * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvasWidth, y);
      ctx.stroke();
    }
  }

  drawAmbientParticles(ctx, progress) {
    const t = (progress - this.phases.anticipation) / (this.phases.spinSlow - this.phases.anticipation);
    const particleCount = 8;
    
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 1000 + progress * 10000;
      const rng = this.mulberry32(seed);
      
      const x = rng() * this.canvasWidth;
      const y = rng() * (this.canvasHeight - 40) + 15;
      const size = 1 + rng() * 1.5;
      const alpha = (0.2 + rng() * 0.3) * (1 - Math.abs(t - 0.5) * 1.5);
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.fill();
    }
  }

  // ── GIF Rendering ─────────────────────────────────────

  async renderRollAnimation(diceResults, seed = Date.now()) {
    const encoder = new GIFEncoder(this.canvasWidth, this.canvasHeight);
    encoder.setRepeat(0);
    encoder.setDelay(Math.round(1000 / this.fps));
    encoder.setQuality(8); // Higher quality

    encoder.start();

    for (let frame = 0; frame < this.frameCount; frame++) {
      const progress = frame / Math.max(1, this.frameCount - 1);

      const canvas = new Canvas(this.canvasWidth, this.canvasHeight);
      const ctx = canvas.getContext('2d');

      // Premium background
      this.drawBackground(ctx, progress);

      // Draw 3 dice with full 3D transforms
      for (let i = 0; i < 3; i++) {
        const t = this.calculateDiceTransform(i, progress, diceResults[i], seed);
        this.drawDice(ctx, t.x, t.y, t.currentFace, this.diceSize, t.squash, t.wobble, t.rotX, t.rotY, t.rotZ, t.scale);
      }

      // Subtle vignette
      this.drawVignette(ctx);

      encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
  }

  drawVignette(ctx) {
    const grad = ctx.createRadialGradient(
      this.canvasWidth / 2, this.canvasHeight / 2, 0,
      this.canvasWidth / 2, this.canvasHeight / 2, Math.max(this.canvasWidth, this.canvasHeight) * 0.7
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  async renderFinalFrame(diceResults) {
    const canvas = new Canvas(this.canvasWidth, this.canvasHeight);
    const ctx = canvas.getContext('2d');

    // Final frame background (cleaner)
    this.drawBackground(ctx, 1);

    for (let i = 0; i < 3; i++) {
      const x = this.diceSize / 2 + 30 + i * (this.diceSize + this.spacing);
      const y = this.canvasHeight - this.diceSize / 2 - 35;
      this.drawDice(ctx, x, y, diceResults[i], this.diceSize, 1, 0, 0, 0, 0, 1);
    }

    this.drawVignette(ctx);

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