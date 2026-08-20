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

// Symbol rewards: [1 match, 2 matches, 3 matches, 4 matches] - bonus amount added to bet
// 1 match = no win (0), 2+ matches = bet back + bonus
const SYMBOL_REWARDS = {
    diamond: [0, 160, 240, 320],
    coin:    [0, 80, 120, 160],
    bell:    [0, 50, 75, 100],
    cherry:  [0, 20, 30, 40],
    lemon:   [0, 10, 15, 20],
    seven:   [0, 8, 12, 16]
};

// Map reel position to symbol name
// Reel positions 0-5 correspond to symbol types (1+s)%6:
// s=0 → type 1 (cherry), s=1 → type 2 (diamond), s=2 → type 3 (coin),
// s=3 → type 4 (gold/bell), s=4 → type 5 (seven), s=5 → type 0 (lemon)
const REEL_SYMBOLS = ['cherry', 'diamond', 'coin', 'bell', 'seven', 'lemon'];

const SYMBOL_EMOJIS = {
    diamond: '💎',
    coin: '🪙',
    bell: '🔔',
    cherry: '🍒',
    lemon: '🍋',
    seven: '<a:sl:1540044349407236187>'
};

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

        // Load slot assets - now using 6 individual symbol images
        const assetsDir = path.join(process.cwd(), 'src', 'assets', 'slots');
        const facade = await loadImage(path.join(assetsDir, 'slot-face.png'));
        
        // Load all 6 symbol images
        const symbolNames = ['cherry', 'diamond', 'coin', 'bell', 'seven', 'lemon'];
        const symbolImages = {};
        for (const name of symbolNames) {
            symbolImages[name] = await loadImage(path.join(assetsDir, `${name}.png`));
        }

        // Scale down canvas to reduce file size (Discord limit is 8MB)
        const scale = 0.7; // 70% size
        const canvasWidth = Math.round(facade.width * scale);  // ~526
        const canvasHeight = Math.round(facade.height * scale); // ~296
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Window positions on the facade (transparent windows) - scaled
        const windowPositions = [
            { x: Math.round(109 * scale), width: Math.round(114 * scale) },
            { x: Math.round(252 * scale), width: Math.round(108 * scale) },
            { x: Math.round(392 * scale), width: Math.round(108 * scale) },
            { x: Math.round(529 * scale), width: Math.round(114 * scale) }
        ];
        const baseY = Math.round(73 * scale);
        const windowHeight = Math.round(140 * scale);

        // Symbol dimensions (source images are 448x448)
        const symbolSourceSize = 448;
        // Scale factor to fit symbol into window height
        const symbolScale = windowHeight / symbolSourceSize;
        const symbolDisplayHeight = windowHeight;
        const symbolDisplayWidth = Math.round(symbolSourceSize * symbolScale);

        // Virtual reel: 6 symbols repeating, each taking windowHeight
        // Total virtual reel height = 6 * windowHeight
        const symbolsPerReel = 6;
        const virtualReelHeight = symbolsPerReel * windowHeight;

        // Random reel positions for 4 reels - completely random, no forced results
        const s1 = Math.floor(Math.random() * symbolsPerReel);
        const s2 = Math.floor(Math.random() * symbolsPerReel);
        const s3 = Math.floor(Math.random() * symbolsPerReel);
        const s4 = Math.floor(Math.random() * symbolsPerReel);

        // Animation parameters - optimized for file size
        const spinFramesPerReel = [28, 38, 48, 58]; // left reel stops first, right stops last - bigger gaps for suspense
        const totalFrames = Math.max(...spinFramesPerReel) + 1; // +1 frame to hold result
        const frameDelay = 50;               // ms/frame during spin
        const holdDelay = 1000;              // ms to hold final frame
        // Extra spins for each reel (left → right, rightmost spins most like real machine)
        const extraSpins = [5, 6, 7, 8]; // More full rotations for realistic feel
        const results = [s1, s2, s3, s4];

        // Calculate animation paths for each reel
        const reelAnimations = results.map((result, index) => {
            // Final position: center the result symbol in the window
            const finalPos = result * windowHeight - (windowHeight - symbolDisplayHeight) / 2;
            const startPos = Math.floor(Math.random() * virtualReelHeight);
            // Distance traveling down (decreasing sourceY) from start to final
            const distanceToFinal = (startPos - finalPos + virtualReelHeight) % virtualReelHeight;
            const totalDistance = distanceToFinal + extraSpins[index] * virtualReelHeight;
            return { finalPos, startPos, totalDistance };
        });

        // Speed profile like real machine: accelerate fast → cruise → decelerate smoothly to 0
        // 8%: accelerate 0→max | 40%: cruise at max | 52%: decelerate (cubic ease-out) - longer deceleration for suspense
        function buildReelPositions(startPos, totalDistance, frames) {
            const accelF = Math.max(1, Math.round(frames * 0.08));
            const decelF = Math.max(1, Math.round(frames * 0.52));
            const cruiseF = frames - accelF - decelF;

            // Speed weights per frame (not normalized)
            const weights = [];
            for (let i = 0; i < frames; i++) {
                let w;
                if (i < accelF) {
                    // Linear accelerate 0 → 1
                    w = (i + 0.5) / accelF;
                } else if (i < accelF + cruiseF) {
                    // Cruise at max speed
                    w = 1;
                } else {
                    // Decelerate (cubic ease-out) to 0 - longer, more dramatic slowdown
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
            return positions; // frames+1 points, last point = finalPos (stops exactly at result)
        }

        // Path for each reel - each reel has its own frame count (stops sequentially left → right)
        const reelPaths = reelAnimations.map((anim, index) =>
            buildReelPositions(anim.startPos, anim.totalDistance, spinFramesPerReel[index])
        );

        // Use lower quality (15) for smaller file size
        const encoder = new GIFEncoder(canvasWidth, canvasHeight, 'neuquant', false, totalFrames);
        encoder.setQuality(15); // Lower quality = smaller file
        encoder.setDelay(frameDelay);
        encoder.setRepeat(1); // 1 = spin once then stop at result frame
        encoder.start();

        for (let i = 0; i < totalFrames; i++) {
            // Last frame: hold longer to show result clearly
            if (i === totalFrames - 1) {
                encoder.setDelay(holdDelay);
            } else {
                encoder.setDelay(frameDelay);
            }

            // Clear canvas (transparent background for facade windows)
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);

            for (let reelIndex = 0; reelIndex < 4; reelIndex++) {
                // Continuous sourceY position on virtual reel - reel moves top to bottom
                // sourceY decreases → symbol moves top to bottom in window (like real machine)
                // Stopped reels (i > reel's frame count) hold final position
                const path = reelPaths[reelIndex];
                const rawY = path[Math.min(i, path.length - 1)];
                const sourceY = Math.floor(((rawY % virtualReelHeight) + virtualReelHeight) % virtualReelHeight);
                const winPos = windowPositions[reelIndex];

                // Draw the visible portion of the virtual reel strip in this window
                // The virtual reel is 6 symbols × windowHeight, repeating
                let sy = sourceY;
                let remaining = windowHeight;
                let destY = baseY;

                while (remaining > 0) {
                    // Which symbol index in the virtual reel (0-5)
                    const symbolIndex = Math.floor(sy / windowHeight) % symbolsPerReel;
                    const symbolName = REEL_SYMBOLS[symbolIndex];
                    const symbolImg = symbolImages[symbolName];

                    // Position within the current symbol (0 to windowHeight)
                    const symbolOffset = sy % windowHeight;
                    // How much of this symbol is visible
                    const chunk = Math.min(remaining, windowHeight - symbolOffset);

                    // Source coordinates in the 448x448 symbol image
                    // We need to crop the symbol to the visible chunk
                    const srcY = Math.round(symbolOffset / symbolScale);
                    const srcHeight = Math.round(chunk / symbolScale);

                    // Center the symbol horizontally in the window
                    const destX = winPos.x + Math.round((winPos.width - symbolDisplayWidth) / 2);
                    const destWidth = symbolDisplayWidth;

                    ctx.drawImage(
                        symbolImg,
                        0, srcY, symbolSourceSize, srcHeight,
                        destX, destY, destWidth, chunk
                    );

                    destY += chunk;
                    sy = (sy + chunk) % virtualReelHeight;
                    remaining -= chunk;
                }
            }

            // Draw scaled facade on top (has transparent windows)
            ctx.drawImage(facade, 0, 0, canvasWidth, canvasHeight);
            encoder.addFrame(ctx);
        }

        encoder.finish();
        const gifBuffer = encoder.out.getData();

        // Determine win/loss - count matching symbols
        const symbols = [s1, s2, s3, s4].map(s => REEL_SYMBOLS[s % 6]);
        const counts = {};
        for (const sym of symbols) {
            counts[sym] = (counts[sym] || 0) + 1;
        }

        // Find the best symbol (highest count, then highest reward value)
        let bestSymbol = null;
        let bestCount = 0;
        for (const [sym, count] of Object.entries(counts)) {
            if (count > bestCount || (count === bestCount && bestSymbol && SYMBOL_REWARDS[sym][0] > SYMBOL_REWARDS[bestSymbol][0])) {
                bestCount = count;
                bestSymbol = sym;
            }
        }

        // Calculate reward based on symbol and match count
        // 1 match = no win (lose bet), 2+ matches = bet back + bonus
        const bonus = SYMBOL_REWARDS[bestSymbol][bestCount - 1];
        let cashChange;
        let resultEmbed;

        if (bonus > 0) {
            const amountWon = betAmount + bonus;
            cashChange = bonus;
            resultEmbed = successEmbed(
                '🎰 Bạn Đã Thắng!',
                `Bạn đã đặt cược **$${betAmount.toLocaleString()}** và trúng **${bestCount} ${SYMBOL_EMOJIS[bestSymbol]} ${bestSymbol}**!\nNhận lại tiền cược + thưởng **$${bonus.toLocaleString()}** = **$${amountWon.toLocaleString()}**!`
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

        // Send GIF first, then result embed
        const attachment = new AttachmentBuilder(gifBuffer, { name: 'slots.gif' });
        
        // First message: just the GIF
        await interaction.followUp({ files: [attachment] });
        
        // Second message: result embed with balance
        resultEmbed.addFields({
            name: 'Số dư hiện tại',
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });
        
        await interaction.followUp({ embeds: [resultEmbed] });
    }, { command: 'slots' })
};