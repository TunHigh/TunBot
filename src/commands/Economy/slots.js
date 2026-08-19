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

        // Create GIF animation - quay nhanh rồi chậm dần, dừng từng ô trái → phải
        // Scale 45% để tối ưu tốc độ (1672x941 -> ~752x423)
        const scale = 0.45;
        const canvasWidth = Math.floor(facade.width * scale);
        const canvasHeight = Math.floor(facade.height * scale);
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        // Bật high quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Easing: bắt đầu nhanh, chậm dần về cuối
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        // Mỗi ô dừng tại frame khác nhau (trái → phải) - 4 ô
        // 15 frames quay, frame 16 = hold kết quả 1s
        const stopFrames = [8, 11, 13, 15];
        // Số vòng quay thêm trước khi dừng
        const extraSpins = [2, 2, 2, 3];
        const loopFrames = 15;
        const totalFrames = loopFrames + 1; // +1 frame hold kết quả
        const results = [s1, s2, s3, s4];
        const reelHeight = items * item; // 10800

        // Vị trí 4 cửa sổ trong suốt trên slot-face.png (từ phân tích ảnh mới 1672x941)
        // Window 1: x=230, width=240 | Window 2: x=550, width=240
        // Window 3: x=890, width=240 | Window 4: x=1210, width=240
        // Y range: 140-440 (height=300)
        const windowPositions = [
            { x: Math.floor(230 * scale), width: Math.floor(240 * scale) },
            { x: Math.floor(550 * scale), width: Math.floor(240 * scale) },
            { x: Math.floor(890 * scale), width: Math.floor(240 * scale) },
            { x: Math.floor(1210 * scale), width: Math.floor(240 * scale) }
        ];
        const baseY = Math.floor(140 * scale);
        const windowHeight = Math.floor(300 * scale); // 135px
        const symbolScaledHeight = Math.floor(item * scale); // 81px
        const yOffset = Math.floor((windowHeight - symbolScaledHeight) / 2); // căn giữa dọc

        const encoder = new GIFEncoder(canvasWidth, canvasHeight, 'octree', false, totalFrames);
        encoder.setDelay(50); // 50ms/frame = 20fps
        encoder.setRepeat(0); // 0 = lặp vô hạn (chuẩn GIF)
        encoder.start();

        for (let i = 1; i <= totalFrames; i++) {
            // Frame cuối: hold kết quả 1 giây
            if (i === totalFrames) {
                encoder.setDelay(1000);
            } else {
                encoder.setDelay(50);
            }

            // KHÔNG fill nền trắng - để trong suốt của facade hiển thị đúng
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);

            for (let reelIndex = 0; reelIndex < 4; reelIndex++) {
                const stopFrame = stopFrames[reelIndex];
                const t = Math.min(i / stopFrame, 1);
                const eased = easeOutCubic(t);
                // Tổng quãng đường: extraSpins vòng + vị trí kết quả
                const totalDistance = (extraSpins[reelIndex] * items + results[reelIndex]) * item;
                // Vị trí sourceY trên reel gốc (modulo reelHeight để loop)
                const sourceY = (Math.floor((totalDistance * eased) % reelHeight) * item) % rh;
                const winPos = windowPositions[reelIndex];

                // Chỉ vẽ 1 symbol cao tại cửa sổ slot (clipping) - căn giữa symbol trong cửa sổ
                ctx.drawImage(
                    reel,
                    0, sourceY, rw, item,  // source rect: 1 symbol cao
                    winPos.x, baseY + yOffset, winPos.width, symbolScaledHeight  // dest rect: cửa sổ slot
                );
            }

            // Draw facade scaled lên trên (có cửa sổ trong suốt)
            ctx.drawImage(facade, 0, 0, canvasWidth, canvasHeight);
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