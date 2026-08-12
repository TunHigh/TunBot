import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;
export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Tạo cuộc bình chọn đơn giản với tối đa 10 lựa chọn')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Câu hỏi bình chọn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('Lựa chọn thứ nhất')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Lựa chọn thứ hai')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Lựa chọn thứ ba (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Lựa chọn thứ tư (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('Lựa chọn thứ năm (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('Lựa chọn thứ sáu (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('Lựa chọn thứ bảy (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('Lựa chọn thứ tám (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('Lựa chọn thứ chín (tùy chọn)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('Lựa chọn thứ mười (tùy chọn)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Bình chọn ẩn danh (mặc định: tắt)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        const question = interaction.options.getString('question');
        const isAnonymous = interaction.options.getBoolean('anonymous') || false;

        const options = [];
        for (let i = 1; i <= MAX_OPTIONS; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        if (options.length < 2) {
            throw new Error("You must provide at least 2 options for the poll.");
        }

        let description = `**${question}**\n\n`;
        options.forEach((option, index) => {
            description += `${EMOJIS[index]} ${option}\n`;
        });

        if (isAnonymous) {
            description += '\n*Đây là cuộc bình chọn ẩn danh. Phiếu bầu không được gắn với người dùng.*';
        } else {
            description += '\n*Thả emoji để bình chọn nhé!*';
        }

        const embed = successEmbed(
            `📊 ${isAnonymous ? 'Ẩn Danh ' : ''}Bình Chọn`,
            description
        );

        const message = await interaction.channel.send({ embeds: [embed] });

        for (let i = 0; i < options.length; i++) {
            await message.react(EMOJIS[i]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ Đã tạo cuộc bình chọn thành công!',
        });
    },
};