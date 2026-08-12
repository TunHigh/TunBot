import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb, getUserNotesKey, getUserNotesListKey } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Quản lý ghi chú người dùng phục vụ mục đích điều hành")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Thêm ghi chú cho một người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng cần thêm ghi chú")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Ghi chú cần thêm")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Loại ghi chú")
                        .addChoices(
                            { name: "Cảnh cáo", value: "warning" },
                            { name: "Tích cực", value: "positive" },
                            { name: "Trung lập", value: "neutral" },
                            { name: "Cảnh báo", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Xem ghi chú của một người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng cần xem ghi chú")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Xóa một ghi chú cụ thể của người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng cần xóa ghi chú")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Chỉ số của ghi chú cần xóa")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Xóa toàn bộ ghi chú của một người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng cần xóa ghi chú")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Vui lòng chọn một lệnh con hợp lệ.' });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Vui lòng chọn một lệnh con hợp lệ.' });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.' });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ghi chú phải có 1000 ký tự trở xuống.' });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ghi chú không được để trống.' });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Đã thêm ghi chú`,
                `Đã thêm ghi chú loại **${getNoteTypeDisplay(type)}** cho **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Người điều hành:** ${interaction.user.tag}\n` +
                `**Tổng số ghi chú:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Không có ghi chú",
                    `Không có ghi chú nào cho **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Ghi chú của ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Ghi chú #${index + 1}** (${getNoteTypeDisplay(note.type)}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Được thêm bởi ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(bị cắt ngắn)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Ghi chú người dùng (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Vui lòng cung cấp chỉ số ghi chú hợp lệ (1-${notes.length}).` });
    }

    // The view command displays notes sorted newest-first, so resolve the index
    // against the same ordering to delete the note the user actually sees.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Đã xóa ghi chú`,
                `Đã xóa ghi chú #${index + 1} khỏi **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Số ghi chú còn lại:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Không có ghi chú để xóa",
                    `Không có ghi chú nào của **${targetUser.tag}** để xóa.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Đã xóa ghi chú",
                `Đã xóa **${noteCount}** ghi chú của **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}

function getNoteTypeDisplay(type) {
    const display = {
        warning: "Cảnh cáo",
        positive: "Tích cực",
        neutral: "Trung lập",
        alert: "Cảnh báo"
    };
    
    return display[type] || type;
}