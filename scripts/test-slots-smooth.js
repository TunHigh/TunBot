// Test chuyển động mượt - không bị khựng rồi nhảy
// Mô phỏng đúng logic trong slots.js (bản cũ + fix reel 2)
const item = 180;
const rh = 10800;
const items = Math.floor(rh / item);
const stripSourceHeight = 140;
const MAX_SPEED = item * 2.5; // 450px/frame tối đa (2.5 symbol)
const extraSpins = [1, 1, 1, 2];
const spinFrames = 100; // tất cả reel dùng chung số frame (giống bản cũ)

function buildReelPositions(startPos, totalDistance, frames) {
    const accelF = Math.max(1, Math.round(frames * 0.08));
    const decelF = Math.max(1, Math.round(frames * 0.30));
    const cruiseF = frames - accelF - decelF;
    const weights = [];
    for (let i = 0; i < frames; i++) {
        let w;
        if (i < accelF) {
            // Tăng tốc tuyến tính từ 0 → 1 (giống slots.js)
            w = (i + 0.5) / accelF;
        } else if (i < accelF + cruiseF) {
            // Quay đều ở tốc độ tối đa
            w = 1;
        } else {
            // Chậm dần (quadratic ease-out) về 0 (giống slots.js)
            const u = (i - accelF - cruiseF + 0.5) / decelF;
            w = (1 - u) * (1 - u);
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

    // Tất cả reel dùng chung spinFrames (giống bản cũ)
    maxFrames = Math.max(maxFrames, spinFrames);

    const reelPaths = reelAnimations.map((anim) =>
        buildReelPositions(anim.startPos, anim.totalDistance, spinFrames)
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
        const maxAllowedJump = item * 2.5;
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
        const decelStart = Math.floor(spinFrames * 0.70);
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
console.log(`   - Giới hạn cho phép: ${(item * 2.5).toFixed(0)}px`);
console.log(`   - Số frame tối đa quan sát được: ${maxFrames}`);

if (allPassed) {
    console.log('✅ TẤT CẢ TEST PASSED');
    console.log(`   - Tất cả reel dùng chung ${spinFrames} frame (giống bản cũ)`);
    console.log(`   - Tổng ~${maxFrames} frame quay (~${(maxFrames * 45 / 1000).toFixed(1)}s) + 1 frame giữ kết quả`);
    console.log(`   - Mỗi reel quay thêm ${extraSpins.join(', ')} vòng`);
    console.log('   - Quadratic ease-out: chậm dần mượt ở giai đoạn cuối');
    console.log('   - Không có bước nhảy > 2.5 symbol giữa các frame');
    console.log('   - Frame cuối di chuyển < 0.3 symbol → dừng mượt');
    console.log('   - Tốc độ giảm liên tục ở giai đoạn cuối');
} else {
    console.error('❌ CÓ TEST THẤT BẠI');
    process.exit(1);
}
