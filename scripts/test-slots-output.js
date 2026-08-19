// Test script: kiểm tra tỷ lệ thắng thực tế + tạo GIF mẫu
// Logic MỚI: random thuần túy, không ép kết quả
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const GIFEncoder = require('gif-encoder-2');

const assetsDir = path.join(process.cwd(), 'src', 'assets', 'slots');
const facade = await loadImage(path.join(assetsDir, 'slot-face.png'));
const reel = await loadImage(path.join(assetsDir, 'slot-reel.png'));

const rw = reel.width;
const rh = reel.height;
const item = 180;
const items = Math.floor(rh / item);

// === 1. Mô phỏng logic MỚI (random thuần túy) 1000 lần ===
let winCount = 0;
for (let i = 0; i < 1000; i++) {
    const s1 = Math.floor(Math.random() * (items - 1)) + 1;
    const s2 = Math.floor(Math.random() * (items - 1)) + 1;
    const s3 = Math.floor(Math.random() * (items - 1)) + 1;
    const s4 = Math.floor(Math.random() * (items - 1)) + 1;

    const isWin = (1 + s1) % 6 === (1 + s2) % 6 && (1 + s2) % 6 === (1 + s3) % 6 && (1 + s3) % 6 === (1 + s4) % 6;
    if (isWin) winCount++;
}

console.log('=== KẾT QUẢ MÔ PHỎNG 1000 LẦN QUAY (logic MỚI - random thuần túy) ===');
console.log(`Tỷ lệ thắng: ${winCount}/1000 = ${(winCount / 10).toFixed(1)}%`);
console.log(`Xác suất lý thuyết: ${(1 / 6 / 6 / 6 * 100).toFixed(2)}%`);
console.log('');

// === 3. Tạo GIF mẫu với kết quả RANDOM THUẦN TÚY ===
const s1 = Math.floor(Math.random() * (items - 1)) + 1;
const s2 = Math.floor(Math.random() * (items - 1)) + 1;
const s3 = Math.floor(Math.random() * (items - 1)) + 1;
const s4 = Math.floor(Math.random() * (items - 1)) + 1;

const isWin = (1 + s1) % 6 === (1 + s2) % 6 && (1 + s2) % 6 === (1 + s3) % 6 && (1 + s3) % 6 === (1 + s4) % 6;
console.log('=== GIF MẪU (random thuần túy) ===');
console.log(`Kết quả: s1=${s1}, s2=${s2}, s3=${s3}, s4=${s4}`);
console.log(`Thắng: ${isWin}`);
console.log('');

// Create GIF
const canvasWidth = facade.width;
const canvasHeight = facade.height;
const canvas = createCanvas(canvasWidth, canvasHeight);
const ctx = canvas.getContext('2d');

const spinFramesPerReel = [50, 60, 70, 80];
const totalFrames = Math.max(...spinFramesPerReel) + 1;
const frameDelay = 50;
const holdDelay = 1000;
const extraSpins = [3, 4, 5, 6];
const results = [s1, s2, s3, s4];
const reelHeight = items * item;
const windowHeightOriginal = 140;
const stripSourceHeight = windowHeightOriginal;

const reelAnimations = results.map((result, index) => {
    const finalPos = result * item - (stripSourceHeight - item) / 2;
    const startPos = Math.floor(Math.random() * reelHeight);
    const distanceToFinal = (startPos - finalPos + reelHeight) % reelHeight;
    const totalDistance = distanceToFinal + extraSpins[index] * reelHeight;
    return { finalPos, startPos, totalDistance };
});

function buildReelPositions(startPos, totalDistance, frames) {
    const accelF = Math.max(1, Math.round(frames * 0.10));
    const decelF = Math.max(1, Math.round(frames * 0.40));
    const cruiseF = frames - accelF - decelF;
    const weights = [];
    for (let i = 0; i < frames; i++) {
        let w;
        if (i < accelF) {
            w = (i + 0.5) / accelF;
        } else if (i < accelF + cruiseF) {
            w = 1;
        } else {
            const u = (i - accelF - cruiseF + 0.5) / decelF;
            w = (1 - u) * (1 - u) * (1 - u);
        }
        weights.push(w);
    }
    const totalW = weights.reduce((a, b) => a + b, 0);
    const positions = [startPos];
    let y = startPos;
    for (let i = 0; i < frames; i++) {
        y -= totalDistance * weights[i] / totalW;
        positions.push(y);
    }
    return positions;
}

const reelPaths = reelAnimations.map((anim, index) =>
    buildReelPositions(anim.startPos, anim.totalDistance, spinFramesPerReel[index])
);

const windowPositions = [
    { x: 109, width: 114 },
    { x: 252, width: 108 },
    { x: 392, width: 108 },
    { x: 529, width: 114 }
];
const baseY = 73;
const stripHeightOriginal = stripSourceHeight;

const encoder = new GIFEncoder(canvasWidth, canvasHeight, 'neuquant', false, totalFrames);
encoder.setQuality(1);
encoder.setDelay(frameDelay);
encoder.setRepeat(1);
encoder.start();

for (let i = 0; i < totalFrames; i++) {
    if (i === totalFrames - 1) {
        encoder.setDelay(holdDelay);
    } else {
        encoder.setDelay(frameDelay);
    }
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (let reelIndex = 0; reelIndex < 4; reelIndex++) {
        const path = reelPaths[reelIndex];
        const rawY = path[Math.min(i, path.length - 1)];
        const sourceY = Math.floor(((rawY % reelHeight) + reelHeight) % reelHeight);
        const winPos = windowPositions[reelIndex];
        let sy = sourceY;
        let remaining = stripHeightOriginal;
        let destY = baseY;
        while (remaining > 0) {
            const chunk = Math.min(remaining, rh - sy);
            ctx.drawImage(
                reel,
                0, sy, rw, chunk,
                winPos.x, destY, winPos.width, chunk
            );
            destY += chunk;
            sy = (sy + chunk) % rh;
            remaining -= chunk;
        }
    }
    ctx.drawImage(facade, 0, 0);
    encoder.addFrame(ctx);
}

encoder.finish();
const gifBuffer = encoder.out.getData();
const outputPath = path.join(process.cwd(), 'test-slots-output.gif');
fs.writeFileSync(outputPath, gifBuffer);
console.log(`✅ Đã xuất GIF: ${outputPath}`);
console.log(`Kích thước: ${(gifBuffer.length / 1024 / 1024).toFixed(2)}MB`);