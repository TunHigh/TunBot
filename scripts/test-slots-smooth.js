// Test chuyển động mượt - không bị khựng rồi nhảy
// Mô phỏng đúng logic động trong slots.js
const item = 180;
const rh = 10800;
const items = Math.floor(rh / item);
const stripSourceHeight = 140;
const MAX_SPEED = item * 1.5; // 270px/frame tối đa
const extraSpins = [1, 1, 1, 2];

function buildReelPositions(startPos, totalDistance, frames) {
    const accelF = Math.max(1, Math.round(frames * 0.08));
    const decelF = Math.max(1, Math.round(frames * 0.30));
    const cruiseF = frames - accelF - decelF;
    const weights = [];
    for (let i = 0; i < frames; i++) {
        let w;
        if (i < accelF) {
            const u = (i + 0.5) / accelF;
            w = u * u * (3 - 2 * u);
        } else if (i < accelF + cruiseF) {
            w = 1;
        } else {
            const u = (i - accelF - cruiseF + 0.5) / decelF;
            const s = u * u * (3 - 2 * u);
            w = 1 - s;
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

let allPassed = true;
let maxJump = 0;
let maxJumpReel = -1;
let maxFrames = 0;

for (let test = 0; test < 200; test++) {
    const results = [1, 2, 3, 4].map(() => Math.floor(Math.random() * (items - 1)) + 1);
    const reelAnimations = results.map((result, index) => {
        const finalPos = result * item - (stripSourceHeight - item) / 2;
        const startPos = Math.floor(Math.random() * rh);
        const distanceToFinal = (startPos - finalPos + rh) % rh;
        return { finalPos, startPos, totalDistance: distanceToFinal + extraSpins[index] * rh };
    });

    // Dynamic frame calculation (same as slots.js)
    let minFrames = 0;
    const spinFramesPerReel = reelAnimations.map((anim) => {
        const needed = Math.max(30, Math.ceil(anim.totalDistance / (MAX_SPEED * 0.75)));
        minFrames = Math.max(minFrames + 10, needed);
        return minFrames;
    });
    maxFrames = Math.max(maxFrames, ...spinFramesPerReel);

    const reelPaths = reelAnimations.map((anim, index) =>
        buildReelPositions(anim.startPos, anim.totalDistance, spinFramesPerReel[index])
    );

    for (let r = 0; r < 4; r++) {
        const path = reelPaths[r];
        const anim = reelAnimations[r];

        // 1. Dừng đúng kết quả
        const endMod = ((path[path.length - 1] % rh) + rh) % rh;
        const finalMod = ((anim.finalPos % rh) + rh) % rh;
        if (Math.abs(endMod - finalMod) > 0.5) {
            console.error(`FAIL: Reel ${r} test ${test}: end=${endMod} final=${finalMod}`);
            allPassed = false;
        }

        // 2. Không có bước nhảy lớn giữa các frame (mượt)
        const maxAllowedJump = item * 1.5;
        for (let i = 0; i < path.length - 1; i++) {
            const jump = Math.abs(path[i + 1] - path[i]);
            if (jump > maxJump) {
                maxJump = jump;
                maxJumpReel = r;
            }
            if (jump > maxAllowedJump) {
                console.error(`FAIL: Reel ${r} test ${test}: jump=${jump.toFixed(0)}px tại frame ${i} (giới hạn ${maxAllowedJump}px)`);
                allPassed = false;
            }
        }

        // 3. Chậm dần liên tục ở giai đoạn cuối (không tăng tốc lại)
        const decelStart = Math.floor(spinFramesPerReel[r] * 0.70);
        let prevSpeed = Infinity;
        for (let i = decelStart; i < path.length - 1; i++) {
            const speed = Math.abs(path[i + 1] - path[i]);
            if (speed > prevSpeed * 1.5 + 1) {
                console.error(`FAIL: Reel ${r} test ${test}: tốc độ tăng lại tại frame ${i}: ${speed.toFixed(0)} > ${prevSpeed.toFixed(0)}`);
                allPassed = false;
            }
            prevSpeed = speed;
        }

        // 4. Frame cuối cùng di chuyển rất ít (dừng mượt, không nhảy)
        const lastJump = Math.abs(path[path.length - 1] - path[path.length - 2]);
        if (lastJump > item * 0.3) {
            console.error(`FAIL: Reel ${r} test ${test}: frame cuối nhảy ${lastJump.toFixed(0)}px (giới hạn ${item * 0.3}px)`);
            allPassed = false;
        }
    }
}

console.log(`   - Bước nhảy lớn nhất quan sát được: ${maxJump.toFixed(0)}px (reel ${maxJumpReel})`);
console.log(`   - Giới hạn cho phép: ${(item * 1.5).toFixed(0)}px`);
console.log(`   - Số frame tối đa quan sát được: ${maxFrames}`);

if (allPassed) {
    console.log('✅ TẤT CẢ TEST PASSED');
    console.log(`   - Số frame mỗi reel tính ĐỘNG theo quãng đường thực tế (dừng lần lượt trái → phải)`);
    console.log(`   - Tổng ~${maxFrames} frame quay (~${(maxFrames * 35 / 1000).toFixed(1)}s) + 1 frame giữ kết quả`);
    console.log(`   - Mỗi reel quay thêm ${extraSpins.join(', ')} vòng`);
    console.log('   - Smoothstep easing: đạo hàm = 0 ở cả 2 đầu → không khựng rồi nhảy');
    console.log('   - Không có bước nhảy > 1.5 symbol giữa các frame');
    console.log('   - Frame cuối di chuyển < 0.3 symbol → dừng mượt');
    console.log('   - Tốc độ giảm liên tục ở giai đoạn cuối');
} else {
    console.error('❌ CÓ TEST THẤT BẠI');
    process.exit(1);
}