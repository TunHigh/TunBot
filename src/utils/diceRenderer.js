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
    this.canvasHeight = this.diceSize + 100;
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
      tableGreen: '#0f3d1a',
      tableGreenDark: '#0a2a12',
    };

    // Animation phases (normalized 0-1)
    this.phases = {
      anticipation: 0.08,   // Wind up
      throwUp: 0.22,        // Launch upward
      spinAir: 0.50,        // Tumbling in air
      fallDown: 0.72,       // Falling
      settle: 1.0,          // Bounce & settle
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
   * Returns position, rotation (3 axes), scale, and visible face
   */
  calculateDiceTransform(diceIndex, progress, finalFace, seed) {
    const rng = this.mulberry32(seed + diceIndex * 1000 + 42);

    const baseX = this.diceSize / 2 + 30 + diceIndex * (this.diceSize + this.spacing);
    const groundY = this.canvasHeight - this.diceSize / 2 - 35;

    // Per-dice variation
    const variation = rng();
    const variation2 = rng();
    const variation3 = rng();

    let x, y, rotX, rotY, rotZ, scale, currentFace, squash, wobble;

    if (progress < this.phases.anticipation) {
      // ─── Anticipation / Wind up ───
      const t = progress / this.phases.anticipation;
      const e = this.easeInOutCubic(t);
      
      x = baseX - e * 15 * (variation - 0.5);
      y = groundY + e * 8;
      rotX = -e * 0.3 * (variation2 - 0.5);
      rotY = e * 0.4 * (variation3 - 0.5);
      rotZ = 0;
      scale = 1 - e * 0.05;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1 - e * 0.1;
      wobble = 0;

    } else if (progress < this.phases.throwUp) {
      // ─── Throw Up ───
      const t = (progress - this.phases.anticipation) / (this.phases.throwUp - this.phases.anticipation);
      const e = this.easeOutBack(t);
      
      const throwHeight = this.canvasHeight * 0.65;
      x = baseX;
      y = groundY - e * throwHeight;
      rotX = (1 - e) * 0.3 * (variation2 - 0.5) + e * Math.PI * 2 * (2 + variation);
      rotY = (1 - e) * 0.4 * (variation3 - 0.5) + e * Math.PI * 2 * (1.5 + variation2);
      rotZ = e * Math.PI * 1.5 * (variation3 - 0.5);
      scale = 1 + e * 0.08;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1 + (1 - e) * 0.15;
      wobble = Math.sin(t * Math.PI * 8) * (1 - t) * 10;

    } else if (progress < this.phases.spinAir) {
      // ─── Spin in Air (tumbling) ───
      const t = (progress - this.phases.throwUp) / (this.phases.spinAir - this.phases.throwUp);
      const peakY = groundY - this.canvasHeight * 0.65;
      
      // Complex 3D tumbling
      const tumbleSpeedX = 4 + variation * 3;
      const tumbleSpeedY = 3.5 + variation2 * 2.5;
      const tumbleSpeedZ = 2.5 + variation3 * 2;
      
      x = baseX + Math.sin(t * Math.PI * 2.5) * 18 * (1 - t * 0.5);
      y = peakY + Math.sin(t * Math.PI) * 25;
      
      rotX = Math.PI * 2 * tumbleSpeedX * t + variation * Math.PI;
      rotY = Math.PI * 2 * tumbleSpeedY * t + variation2 * Math.PI;
      rotZ = Math.PI * 2 * tumbleSpeedZ * t + variation3 * Math.PI;
      
      scale = 1;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1;
      wobble = Math.sin(t * Math.PI * 12) * 8 * (1 - t * 0.3);

    } else if (progress < this.phases.fallDown) {
      // ─── Fall Down ───
      const t = (progress - this.phases.spinAir) / (this.phases.fallDown - this.phases.spinAir);
      const e = this.easeInOutCubic(t);
      const peakY = groundY - this.canvasHeight * 0.65;
      
      x = baseX + Math.sin(t * Math.PI * 1.5) * 12 * (1 - t);
      y = peakY + e * (groundY - peakY + 30);
      
      // Slowing rotation as it falls
      const slowFactor = 1 - e * 0.7;
      rotX = Math.PI * 2 * (4 + variation * 3) * (1 - e * 0.5) + variation * Math.PI;
      rotY = Math.PI * 2 * (3.5 + variation2 * 2.5) * (1 - e * 0.5) + variation2 * Math.PI;
      rotZ = Math.PI * 2 * (2.5 + variation3 * 2) * (1 - e * 0.5) + variation3 * Math.PI;
      
      scale = 1;
      currentFace = Math.floor(rng() * 6) + 1;
      squash = 1 + (1 - e) * 0.08;
      wobble = (1 - e) * 6;

    } else {
      // ─── Settle with Bounce ───
      const t = (progress - this.phases.fallDown) / (this.phases.settle - this.phases.fallDown);
      const bounceCount = 3;
      const bounce = Math.abs(Math.sin(t * Math.PI * bounceCount)) * Math.pow(1 - t, 1.5) * 22;
      
      x = baseX;
      y = groundY - bounce;
      
      // Final rotation settling to show correct face
      const settleFactor = this.easeOutElastic(t);
      rotX = Math.PI * 2 * Math.round((4 + variation * 3) * (1 - settleFactor * 0.3));
      rotY = Math.PI * 2 * Math.round((3.5 + variation2 * 2.5) * (1 - settleFactor * 0.3));
      rotZ = Math.PI * 2 * Math.round((2.5 + variation3 * 2) * (1 - settleFactor * 0.3));
      
      // Snap to final orientation in last 20%
      if (t > 0.8) {
        const snapT = (t - 0.8) / 0.2;
        rotX = rotX * (1 - snapT);
        rotY = rotY * (1 - snapT);
        rotZ = rotZ * (1 - snapT);
      }
      
      scale = 1;
      currentFace = t > 0.7 ? finalFace : Math.floor(rng() * 6) + 1;
      squash = 1 + Math.max(0, Math.sin(t * Math.PI * bounceCount * 2)) * 0.12 * (1 - t);
      wobble = Math.max(0, Math.sin(t * Math.PI * bounceCount)) * (1 - t) * 4;
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

    // Subtle animated particles/glitter during spin
    if (progress > this.phases.throwUp && progress < this.phases.fallDown) {
      this.drawAmbientParticles(ctx, progress);
    }

    // Table surface
    const tableY = this.canvasHeight - 35;
    const tableGrad = ctx.createLinearGradient(0, tableY, 0, this.canvasHeight);
    tableGrad.addColorStop(0, '#0f3d1a');
    tableGrad.addColorStop(0.5, '#0a2a12');
    tableGrad.addColorStop(1, '#051508');
    ctx.fillStyle = tableGrad;
    ctx.fillRect(0, tableY, this.canvasWidth, this.canvasHeight - tableY);

    // Table edge highlight
    ctx.beginPath();
    ctx.moveTo(0, tableY);
    ctx.lineTo(this.canvasWidth, tableY);
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gold accent line
    ctx.beginPath();
    ctx.moveTo(0, tableY + 2);
    ctx.lineTo(this.canvasWidth, tableY + 2);
    ctx.strokeStyle = 'rgba(255,215,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawAmbientParticles(ctx, progress) {
    const t = (progress - this.phases.throwUp) / (this.phases.fallDown - this.phases.throwUp);
    const particleCount = 12;
    
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 1000 + progress * 10000;
      const rng = this.mulberry32(seed);
      
      const x = rng() * this.canvasWidth;
      const y = rng() * (this.canvasHeight - 50) + 20;
      const size = 1 + rng() * 2;
      const alpha = (0.3 + rng() * 0.4) * (1 - Math.abs(t - 0.5) * 2);
      
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