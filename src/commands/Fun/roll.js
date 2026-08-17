import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 3D dice rolling GIF from Giphy (verified working - shows 3D dice rolling animation)
const DICE_ROLLING_GIF = 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif';

// Unicode dice faces - Discord renders these as actual dice images
const DICE_EMOJIS = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Tung 3 xúc xắc kiểu Tài Xỉu (3d6)'),

  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    // Show rolling animation with 3D dice GIF
    const rollingEmbed = createEmbed({
      title: '🎲 Đang lắc 3 xúc xắc 3D...',
      description: '🎲 🎲 🎲',
      color: 'primary',
      image: DICE_ROLLING_GIF,
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [rollingEmbed] });

    // Let the 3D animation play for ~2.5 seconds
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Roll 3 dice (1-6 each)
    const diceResults = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];

    const total = diceResults.reduce((sum, val) => sum + val, 0);

    // Determine Tài/Xỉu
    // Tài: 11-18, Xỉu: 3-10
    const isTai = total >= 11;
    const resultText = isTai ? '🟢 **TÀI**' : '🔴 **XỈU**';
    const resultColor = isTai ? 'success' : 'error';

    // Build dice emoji display (3 dice side by side)
    const diceEmojiDisplay = diceResults.map(d => DICE_EMOJIS[d]).join('  ');

    // Final result embed with actual dice emojis
    const resultEmbed = createEmbed({
      title: '🎲 Kết quả Tung Xúc Xắc (3D)',
      description: `**${diceEmojiDisplay}**\n\n**Tổng điểm: ${total}**\n${resultText}`,
      color: resultColor,
      fields: [
        {
          name: '🎯 Xúc xắc 1',
          value: `${DICE_EMOJIS[diceResults[0]]} **${diceResults[0]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 2',
          value: `${DICE_EMOJIS[diceResults[1]]} **${diceResults[1]}**`,
          inline: true,
        },
        {
          name: '🎯 Xúc xắc 3',
          value: `${DICE_EMOJIS[diceResults[2]]} **${diceResults[2]}**`,
          inline: true,
        },
      ],
      footer: { text: 'Tài: 11-18 | Xỉu: 3-10' },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} - Result: ${diceResults.join(', ')} = ${total} (${isTai ? 'Tài' : 'Xỉu'}) in guild ${interaction.guildId}`);
  },
};