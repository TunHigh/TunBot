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

        const rw = reel.width;
        const rh = reel.height;
        const item = 180;
        const items = Math.floor(rh / item);

        // Random reel positions
        let s1 = Math.floor(Math.random() * (items - 1)) + 1;
        let s2 = Math.floor(Math.random() * (items - 1)) + 1;
        let s3 = Math.floor(Math.random() * (items - 1)) + 1;

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
            s1 = s1 === items ? s1 - 6 : s1;
            s2 = s2 === items ? s2 - 6 : s2;
            s3 = s3 === items ? s3 - 6 : s3;
        }

        // Create GIF animation
        const canvas = createCanvas(facade.width, facade.height);
        const ctx = canvas.getContext('2d');
        const speed = 6;
        const frameCount = Math.floor(item / speed);

        const encoder = new GIFEncoder(facade.width, facade.height, 'octree', false, frameCount);
        encoder.setDelay(50);
        encoder.start();

        for (let i = 1; i <= frameCount; i++) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, facade.width, facade.height);
            ctx.drawImage(reel, 25 + rw * 0, 100 - (speed * i * s1));
            ctx.drawImage(reel, 25 + rw * 1, 100 - (speed * i * s2));
            ctx.drawImage(reel, 25 + rw * 2, 100 - (speed * i * s3));
            ctx.drawImage(facade, 0, 0);
            encoder.addFrame(ctx);
        }

        encoder.finish();
        const gifBuffer = encoder.out.getData();

        // Determine win/loss
        const isWin = (1 + s1) % 6 === (1 + s2) % 6 && (1 + s2) % 6 === (1 + s3) % 6;
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
            name: 'Số dư tiền mặt mới',
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], files: [attachment] });
    }, { command: 'slots' })
};