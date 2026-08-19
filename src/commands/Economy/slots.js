import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createRequire } from 'module';
import path from 'path';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const require = createRequire(import.meta.url);
const GIFEncoder = require('gif-encoder-2');

const SLOT_COOLDOWN = 3 * 1000;
const WIN_RATE = 0.25;
const PAYOUT_MULTIPLIER = 2.0;

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Quay slots để thử vận may!')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Số tiền muốn đặt cược')
                .setRequired(true)
                .setMinValue(1)
        ),

    category: 'Economy',

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastSlots = userData.lastSlots || 0;

        if (now < lastSlots + SLOT_COOLDOWN) {
            const remaining = lastSlots + SLOT_COOLDOWN - now;
            const seconds = Math.ceil(remaining / 1000);
            throw createError(
                'Slots cooldown active',
                ErrorTypes.RATE_LIMIT,
                `Bạn cần đợi **${seconds} giây** trước khi quay tiếp.`,
                { remaining, cooldownType: 'slots' }
            );
        }

        if (userData.wallet < betAmount) {
            throw createError(
                'Insufficient cash for slots',
                ErrorTypes.VALIDATION,
                `Bạn chỉ có $${userData.wallet.toLocaleString()} tiền mặt, nhưng lại muốn đặt cược $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: userData.wallet }
            );
        }

        // Load slot assets
        const assetsDir = path.join(process.cwd(), 'src', 'assets', 'slots');
        const facade = await loadImage(path.join(assetsDir, 'slot-face.png'));
        const reel = await loadImage(path.join(assetsDir, 'slot-reel.png'));

        const rw = reel.width; // 151
        const rh = reel.height; // 10800
        const item = 180; // chiều cao mỗi symbol
        const items = Math.floor(rh / item); // 60 symbols

        // Random reel positions cho 4 ô
        let s1 = Math.floor(Math.random() * (items - 1)) + 1;
        let s2 = Math.floor(Math.random() * (items - 1)) + 1;
        let s3 = Math.floor(Math.random() * (items - 1)) + 1;
        let s4 = Math.floor(Math.random() * (items - 1)) + 1;

        // Win logic - 25% win rate (bisect equivalent of Python's bisect.bisect)
        if (Math.random() < WIN_RATE) {
            const symbolsWeights = [3.5, 7, 15, 25, 55];
            const x = Math.random() * 100;
            // bisect_right: returns insertion point to keep array sorted
            let pos = 0;
            while (pos < symbolsWeights.length && x >= symbolsWeights[pos]) {
                pos++;
            }
            const offset = Math.floor(items / 6);
            s1 = pos + (Math.floor(Math.random() * (offset - 1)) + 1) * 6;
            s2 = pos + (Math.floor(Math.random() * (offset - 1)) + 1) * 6;
            s3 = pos + (Math.floor(Math.random() * (offset - 1)) + 1) * 6;
            s4 = pos + (Math.floor(Math.random() * (offset - 1)) + 1) * 6;
            s1 = s1 === items ? s1 - 6 : s1;
            s2 = s2 === items ? s2 - 6 : s2;
            s3 = s3 === items ? s3 - 6 : s3;
            s4 = s4 === items ? s4 - 6 : s4;
        }

        // Create GIF animation - quay nhiều vòng, nhanh rồi chậm dần, dừng ở kết quả (giống máy thật)
        // Scale 40% (300x169) - Discord hiển thị embed ~400px nên không cần 752px
        // Giảm ~6 lần số pixels → encoding nhanh, bot không bị "đang suy nghĩ..." lâu
        const SCALE = 0.4;
        const canvasWidth = Math.floor(facade.width * SCALE);
        const canvasHeight = Math.floor(facade.height * SCALE);
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Tham số animation - quay nhiều vòng, chậm dần và chỉ chạy 1 lần
        // Mỗi reel có số frame riêng → dừng lần lượt từ trái → phải (như máy thật)
        // Số frame được tính ĐỘNG dựa trên quãng đường thực tế của từng reel
        // để đảm bảo tốc độ tối đa ≤ 1.5 symbol/frame (270px) → không bị giật/khựng
        const frameDelay = 30;               // ms/frame khi quay
        const holdDelay = 900;               // ms giữ kết quả ở frame cuối
        const MAX_SPEED = item * 2.5;        // 450px/frame tối đa (2.5 symbol) - quay nhanh như máy thật
        // Số vòng quay thêm cho mỗi reel (trái → phải, reel phải nhất quay nhiều như máy thật)
        // [1,1,1,2] = reel 1-3 quay thêm 1 vòng, reel 4 quay thêm 2 vòng
        // (tổng ~2-3 vòng mỗi reel tính cả quãng đường đến kết quả - vẫn giống máy thật)
        const extraSpins = [1, 1, 1, 2];
        const results = [s1, s2, s3, s4];
        const reelHeight = items * item; // 10800
        const windowHeightOriginal = 140; // chiều cao cửa sổ trong ảnh gốc

        // Vẽ reel đầy width cửa sổ, không scale để không có viền đen
        // Lấy chiều cao strip từ reel gốc = chiều cao cửa sổ (140px)
        const stripSourceHeight = windowHeightOriginal; // 140px

        // Tính toán vị trí bắt đầu và tổng quãng đường cho từng reel
        // Reel chạy từ trên xuống dưới (sourceY giảm dần), dừng tại symbol kết quả
        const reelAnimations = results.map((result, index) => {
            const finalPos = result * item - (stripSourceHeight - item) / 2;
            const startPos = Math.floor(Math.random() * reelHeight);
            // Quãng đường đi xuống (chiều giảm sourceY) từ start đến final
            const distanceToFinal = (startPos - finalPos + reelHeight) % reelHeight;
            const totalDistance = distanceToFinal + extraSpins[index] * reelHeight;
            return { finalPos, startPos, totalDistance };
        });

        // Số frame mỗi reel: tính từ quãng đường thực tế để tốc độ tối đa ≤ MAX_SPEED
        // Profile 8% tăng tốc + 62% quay đều + 30% giảm tốc:
        //   tổng quãng đường ≈ frames × cruiseSpeed × 0.81
        //   → frames = totalDistance / (MAX_SPEED × 0.75)
        // Dùng hệ số 0.75 (an toàn) thay vì 0.81 vì làm tròn accelF/decelF
        // có thể làm tổng trọng số thực < 0.81 → cruise speed vượt giới hạn
        // Đảm bảo frames tăng dần trái → phải để reel dừng lần lượt
        let minFrames = 0;
        const spinFramesPerReel = reelAnimations.map((anim, index) => {
            const needed = Math.max(30, Math.ceil(anim.totalDistance / (MAX_SPEED * 0.75)));
            minFrames = Math.max(minFrames + 10, needed);
            return minFrames;
        });
        const totalFrames = Math.max(...spinFramesPerReel) + 1; // +1 frame giữ kết quả

        // Speed profile giống máy thật: tăng tốc nhanh → quay đều tốc độ cao →
        // chậm dần về 0 ở cuối để dừng chính xác tại symbol kết quả
        // 8% đầu: tăng tốc (smoothstep) | 62% giữa: quay đều | 30% cuối: giảm tốc (smoothstep)
        // Smoothstep có đạo hàm = 0 ở cả 2 đầu → chuyển động liên tục, không bị khựng rồi nhảy
        function buildReelPositions(startPos, totalDistance, frames) {
            const accelF = Math.max(1, Math.round(frames * 0.08));
            const decelF = Math.max(1, Math.round(frames * 0.30));
            const cruiseF = frames - accelF - decelF;

            // Trọng số tốc độ từng frame (chưa chuẩn hóa)
            const weights = [];
            for (let i = 0; i < frames; i++) {
                let w;
                if (i < accelF) {
                    // Tăng tốc smoothstep từ 0 → 1 (mượt, không giật lúc khởi động)
                    const u = (i + 0.5) / accelF;
                    w = u * u * (3 - 2 * u);
                } else if (i < accelF + cruiseF) {
                    // Quay đều ở tốc độ tối đa
                    w = 1;
                } else {
                    // Chậm dần smoothstep từ 1 → 0 (đạo hàm = 0 ở cả 2 đầu,
                    // không bị dính rồi nhảy nốt quãng đường còn lại)
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
            return positions; // frames+1 điểm, điểm cuối = finalPos (dừng đúng kết quả)
        }

        // Đường đi của từng reel - mỗi reel có số frame riêng (dừng lần lượt trái → phải)
        const reelPaths = reelAnimations.map((anim, index) =>
            buildReelPositions(anim.startPos, anim.totalDistance, spinFramesPerReel[index])
        );

        // Vị trí 4 cửa sổ trong suốt trên slot-face.png (scale 40% từ ảnh gốc 752x423)
        // Window 1: x=43, width=45 | Window 2: x=100, width=43
        // Window 3: x=156, width=43 | Window 4: x=211, width=45
        // Y range: 29-85 (height=56)
        const windowPositions = [
            { x: Math.floor(109 * SCALE), width: Math.floor(114 * SCALE) },
            { x: Math.floor(252 * SCALE), width: Math.floor(108 * SCALE) },
            { x: Math.floor(392 * SCALE), width: Math.floor(108 * SCALE) },
            { x: Math.floor(529 * SCALE), width: Math.floor(114 * SCALE) }
        ];
        const baseY = Math.floor(73 * SCALE);
        const stripHeightOriginal = stripSourceHeight; // 140px (source reel gốc)

        // Dùng octree (nhanh hơn nhiều so với neuquant) + useOptimizer=true
        // (tái sử dụng palette khi frame giống frame trước ≥ 90% - frame giữ kết quả)
        const encoder = new GIFEncoder(canvasWidth, canvasHeight, 'octree', true, totalFrames);
        encoder.setQuality(1);
        encoder.setDelay(frameDelay);
        encoder.setRepeat(1); // 1 = chỉ quay 1 lần rồi dừng ở frame kết quả
        encoder.start();

        for (let i = 0; i < totalFrames; i++) {
            // Frame cuối: giữ kết quả lâu hơn để hiển thị rõ
            if (i === totalFrames - 1) {
                encoder.setDelay(holdDelay);
            } else {
                encoder.setDelay(frameDelay);
            }

            // KHÔNG fill nền trắng - để trong suốt của facade hiển thị đúng
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);

            for (let reelIndex = 0; reelIndex < 4; reelIndex++) {
                // Vị trí sourceY liên tục trên reel gốc - reel chạy từ trên xuống dưới
                // sourceY giảm dần → symbol di chuyển từ trên xuống dưới trong cửa sổ (giống máy quay thật)
                // Reel đã dừng (i > số frame của reel) sẽ giữ nguyên vị trí kết quả
                const path = reelPaths[reelIndex];
                const rawY = path[Math.min(i, path.length - 1)];
                const sourceY = Math.floor(((rawY % reelHeight) + reelHeight) % reelHeight);
                const winPos = windowPositions[reelIndex];

                // Vẽ strip reel đầy width cửa sổ - scale 50% theo SCALE, không viền đen
                let sy = sourceY;
                let remaining = stripHeightOriginal;
                let destY = baseY;
                while (remaining > 0) {
                    const chunk = Math.min(remaining, rh - sy);
                    ctx.drawImage(
                        reel,
                        0, sy, rw, chunk,
                        winPos.x, destY, winPos.width, chunk * SCALE
                    );
                    destY += chunk * SCALE;
                    sy = (sy + chunk) % rh;
                    remaining -= chunk;
                }
            }

            // Draw facade lên trên (có cửa sổ trong suốt)
            ctx.drawImage(facade, 0, 0);
            encoder.addFrame(ctx);
        }

        encoder.finish();
        const gifBuffer = encoder.out.getData();

        // Determine win/loss - 4 ô phải trùng nhau
        const isWin = (1 + s1) % 6 === (1 + s2) % 6 && (1 + s2) % 6 === (1 + s3) % 6 && (1 + s3) % 6 === (1 + s4) % 6;
        let cashChange = 0;
        let resultEmbed;

        if (isWin) {
            const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
            cashChange = amountWon - betAmount;
            resultEmbed = successEmbed(
                '🎰 Bạn Đã Thắng!',
                `Bạn đã đặt cược **$${betAmount.toLocaleString()}** và thắng **$${amountWon.toLocaleString()}**!`
            );
        } else {
            cashChange = -betAmount;
            resultEmbed = warningEmbed(
                '💔 Bạn Đã Thua...',
                `Vận may chưa mỉm cười với bạn. Bạn đã mất **$${betAmount.toLocaleString()}**.`
            );
        }

        userData.wallet = (userData.wallet || 0) + cashChange;
        userData.lastSlots = now;

        await setEconomyData(client, guildId, userId, userData);

        const attachment = new AttachmentBuilder(gifBuffer, { name: 'slots.gif' });
        resultEmbed.setImage('attachment://slots.gif');
        resultEmbed.addFields({
            name: 'Số dư hiện tại',
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], files: [attachment] });
    }, { command: 'slots' })
};