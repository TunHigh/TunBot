import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Gửi tiền từ ví tiền vào ngân hàng')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Số tiền muốn gửi (số hoặc "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getString("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }
            
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                depositAmount = parseInt(amountInput);

                if (isNaN(depositAmount) || depositAmount <= 0) {
                    throw createError(
                        "Invalid deposit amount",
                        ErrorTypes.VALIDATION,
                        `Vui lòng nhập một số hợp lệ hoặc 'all'. Bạn đã nhập: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "Zero deposit amount",
                    ErrorTypes.VALIDATION,
                    "Bạn không có tiền mặt để gửi.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `Bạn muốn gửi nhiều hơn số tiền đang có. Đang gửi toàn bộ tiền mặt còn lại: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw createError(
                    "Bank is full",
                    ErrorTypes.VALIDATION,
                    `Ngân hàng của bạn đã đầy (Sức chứa tối đa: $${maxBank.toLocaleString()}). Mua **Nâng cấp ngân hàng** để tăng hạn mức nhé.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            buildUserErrorEmbed(
                                'validation',
                                `Ngân hàng của bạn chỉ còn chỗ cho **$${depositAmount.toLocaleString()}** (Tối đa: $${maxBank.toLocaleString()}). Số còn lại vẫn nằm trong tiền mặt của bạn.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "No space or cash for deposit",
                    ErrorTypes.VALIDATION,
                    "Số tiền bạn muốn gửi bằng 0 hoặc vượt quá sức chứa của ngân hàng sau khi kiểm tra số dư tiền mặt.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                'Gửi Tiền Thành Công',
                `Bạn đã gửi **$${depositAmount.toLocaleString()}** vào ngân hàng thành công.`
            )
                .addFields(
                    {
                        name: "Số dư tiền mặt mới",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Số dư ngân hàng mới",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};