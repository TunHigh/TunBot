import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('hexcolor')
        .setDescription('Tạo màu hex ngẫu nhiên kèm bản xem trước')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Mã hex cụ thể (vd: #FF5733 hoặc FF5733)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                let hexColor = interaction.options.getString('color');
                let isRandom = false;

                if (!hexColor) {
                    isRandom = true;
                    hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                } else {
                    hexColor = hexColor.replace('#', '');
                    if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Vui lòng cung cấp mã hex hợp lệ.\n\n**Định dạng hợp lệ:**\n• `#FF5733` (có dấu #)\n• `FF5733` (không có dấu #)\n• `F57` (rút gọn 3 chữ số)\n\n**Không hợp lệ:** `#GG5733` (G không phải chữ số hex)' });
                    }

                    if (hexColor.length === 3) {
                        hexColor = hexColor.split('').map(c => c + c).join('');
                    }

                    hexColor = '#' + hexColor.toUpperCase();
                }

                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

                const colorPreviewUrl = `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;

                const colorName = getColorName(hexColor);

                const embed = successEmbed(
                    '🎨 Thông Tin Màu Sắc',
                    `**Hex:** \`${hexColor}\`\n` +
                    `**RGB:** \`rgb(${r}, ${g}, ${b})\`\n` +
                    `**HSL:** \`${rgbToHsl(r, g, b)}\`\n` +
                    `**Tên:** ${colorName || 'Màu Tùy Chỉnh'}`
                )
                    .setColor(hexColor)
                    .setImage(colorPreviewUrl);

                if (isRandom) {
                    embed.setFooter({ text: 'Màu được tạo ngẫu nhiên' });
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Không thể tạo thông tin màu sắc. Vui lòng thử lại.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getColorName(hex) {
    const colors = {
        '#FF0000': 'Đỏ',
        '#00FF00': 'Xanh lá',
        '#0000FF': 'Xanh dương',
        '#FFFF00': 'Vàng',
        '#FF00FF': 'Hồng cánh sen',
        '#00FFFF': 'Xanh lơ',
        '#000000': 'Đen',
        '#FFFFFF': 'Trắng',
        '#808080': 'Xám',
        '#FFA500': 'Cam',
        '#800080': 'Tím',
        '#A52A2A': 'Nâu',
        '#FFC0CB': 'Hồng',
        '#008000': 'Xanh lá đậm',
        '#000080': 'Xanh navy',
        '#FFD700': 'Vàng gold',
        '#C0C0C0': 'Bạc',
        '#FF6347': 'Đỏ cà chua',
        '#40E0D0': 'Xanh ngọc',
        '#E6E6FA': 'Tím oải hương'
    };
    
    if (colors[hex.toUpperCase()]) {
        return colors[hex.toUpperCase()];
    }
    
    const hexValue = parseInt(hex.replace('#', ''), 16);
    let closestColor = '';
    let minDistance = Infinity;
    
    for (const [colorHex, name] of Object.entries(colors)) {
        const colorValue = parseInt(colorHex.replace('#', ''), 16);
        const distance = Math.abs(hexValue - colorValue);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    
    return minDistance < 1000000 ? `Gần với ${closestColor}` : null;
}