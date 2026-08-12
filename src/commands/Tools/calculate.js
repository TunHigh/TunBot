import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

const OPERATION_LABELS = {
    add: 'cộng',
    subtract: 'trừ',
    multiply: 'nhân',
    divide: 'chia',
};

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Tính toán một biểu thức toán học")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "Biểu thức toán học cần tính (vd: 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Calculate interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '**Chứa ký tự không được hỗ trợ.**\n\n' +
                    '✅ Được hỗ trợ: Số, số thập phân, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n' +
                    '❌ Không hỗ trợ: Dấu ngoặc vuông, ngoặc nhọn và các ký hiệu khác'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '**Chứa mã nguồn bị chặn.**\n\n' +
                        '🚫 **Đã chặn:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, vòng lặp, async/await\n\n' +
                        'Không cho phép cú pháp giống mã nguồn trong phép tính.'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "true" : "false";
            } else if (result === null || result === undefined) {
                formattedResult = "Không có kết quả";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;
            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId);
            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("Lịch Sử")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = successEmbed(
                "🧮 Kết Quả Tính Toán",
                `**Biểu thức:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Kết quả:** \`${formattedResult}\`\n\n` +
                    `*Dùng các nút bên dưới để thực hiện phép toán với kết quả.*`,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;
            const BUTTON_TIMEOUT = 300000;
            const collector =
                interaction.channel.createMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate().catch(console.error);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "Chưa có lịch sử tính toán nào.",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Lịch Sử Tính Toán Của Bạn**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });
                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;
                        case "subtract":
                            operator = "-";
                            break;
                        case "multiply":
                            operator = "*";
                            break;
                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;
                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Nhập một số để ${OPERATION_LABELS[operation]}`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Số cần ${OPERATION_LABELS[operation]} với ${formattedResult}`,
                                            placeholder: "Nhập một số...",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalError) {
                        logger.error("Failed to show modal:", modalError);
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "Không thể mở máy tính. Vui lòng thử lại.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                        return;
                    }

                } catch (error) {
                    logger.error("Button interaction error:", error);
                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Đã xảy ra lỗi khi xử lý yêu cầu của bạn.",
                            flags: ["Ephemeral"],
                        }).catch(console.error);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Máy Tính Đã Hết Hạn")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .editReply({
                            components: [disabledRow],
                            content:
                                "⏱️ Máy tính này đã hết hạn. Hãy dùng lại lệnh để thực hiện thêm phép tính.",
                        })
                        .catch(console.error);
                } else {
                    const disabledRow = ActionRowBuilder.from(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .editReply({ components: [disabledRow] })
                        .catch(console.error);
                }
            });
        } catch (error) {
            logger.error('Calculation error:', error);

            let errorMessage = 'Không thể tính biểu thức.';

            if (error.message.includes('Unexpected type')) {
                errorMessage +=
                    'Biểu thức chứa phép toán hoặc hàm không được hỗ trợ.';
            } else if (error.message.includes('Undefined symbol')) {
                errorMessage +=
                    'Biểu thức chứa biến hoặc hàm không xác định.';
            } else if (error.message.includes('Brackets not balanced')) {
                errorMessage += 'Biểu thức có dấu ngoặc không cân bằng.';
            } else if (
                error.message.includes('Unexpected operator') ||
                error.message.includes('Unexpected character')
            ) {
                errorMessage +=
                    'Biểu thức chứa phép toán hoặc ký tự không hợp lệ.';
            } else {
                errorMessage += 'Vui lòng kiểm tra lại cú pháp và thử lại.';
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: errorMessage,
            });
        }
    },
};