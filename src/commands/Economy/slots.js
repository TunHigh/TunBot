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

        // Random reel positions cho 4 ô - RANDOM THUẦN TÚY, không ép kết quả
        // Mỗi reel quay độc lập, kết quả thắng/thua hoàn toàn ngẫu nhiên
        const s1 = Math.floor(Math.random() * (items - 1)) + 1;
        const s2 = Math.floor(Math.random() * (items - 1)) + 1;
        const s3 = Math.floor(Math.random() * (items - 1)) + 1;
        const s4 = Math.floor(Math.random() * (items - 1)) + 1;

        // Create GIF animation - quay nhiều vòng, nhanh rồi chậm dần, dừng ở kết quả (giống máy thật)
        // Dùng kích thước gốc 752x423 (không scale để ảnh không bị vỡ)
        const canvasWidth = facade.width;
        const canvasHeight = facade.height;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Tham số animation - quay nhiều vòng, chậm dần và chỉ chạy 1 lần
        // Mỗi reel có số frame riêng → dừng lần lượt từ trái → phải (như máy thật)
        const spinFramesPerReel = [50, 60, 70, 80]; // reel trái dừng trước, reel phải dừng sau
        const totalFrames = Math.max(...spinFramesPerReel) + 1; // +1 frame giữ kết quả
        const frameDelay = 50;               // ms/frame khi quay
        const holdDelay = 1000;              // ms giữ kết quả ở frame cuối
        // Số vòng quay thêm cho mỗi reel (trái → phải, reel phải nhất quay nhiều như máy thật)
        const extraSpins = [3, 4, 5, 6];
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

        // Speed profile giống máy thật: tăng tốc nhanh → quay đều tốc độ cao →
        // chậm dần về 0 ở cuối để dừng chính xác tại symbol kết quả
        // 10% đầu: tăng tốc từ 0 lên tối đa | 50% giữa: quay đều | 40% cuối: giảm tốc dần (cubic ease-out)
        function buildReelPositions(startPos, totalDistance, frames) {
            const accelF = Math.max(1, Math.round(frames * 0.08));
            const decelF = Math.max(1, Math.round(frames * 0.50));
            const cruiseF = frames - accelF - decelF;

            // Trọng số tốc độ từng frame (chưa chuẩn hóa)
            const weights = [];
            for (let i = 0; i < frames; i++) {
                let w;
                if (i < accelF) {
                    // Tăng tốc tuyến tính từ 0 → 1
                    w = (i + 0.5) / accelF;
                } else if (i < accelF + cruiseF) {
                    // Quay đều ở tốc độ tối đa
                    w = 1;
                } else {
                    // Chậm dần (cubic ease-out) về 0 - mượt hơn quadratic
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
            return positions; // frames+1 điểm, điểm cuối = finalPos (dừng đúng kết quả)
        }

        // Đường đi của từng reel - mỗi reel có số frame riêng (dừng lần lượt trái → phải)
        const reelPaths = reelAnimations.map((anim, index) =>
            buildReelPositions(anim.startPos, anim.totalDistance, spinFramesPerReel[index])
        );

        // Vị trí 4 cửa sổ trong suốt trên slot-face.png (từ phân tích ảnh mới 752x423)
        // Window 1: x=109, width=114 | Window 2: x=252, width=108
        // Window 3: x=392, width=108 | Window 4: x=529, width=114
        // Y range: 73-212 (height=140)
        const windowPositions = [
            { x: 109, width: 114 },
            { x: 252, width: 108 },
            { x: 392, width: 108 },
            { x: 529, width: 114 }
        ];
        const baseY = 73;
        const windowHeight = 140;
        const stripHeightOriginal = stripSourceHeight; // 140px

        const encoder = new GIFEncoder(canvasWidth, canvasHeight, 'neuquant', false, totalFrames);
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

                // Vẽ strip reel đầy width cửa sổ - không scale, không viền đen
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