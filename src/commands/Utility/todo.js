import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Quản lý danh sách công việc cần làm của bạn")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Thêm công việc vào danh sách của bạn")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("Công việc cần thêm")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Xem danh sách công việc của bạn")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Đánh dấu công việc đã hoàn thành")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Số thứ tự công việc cần hoàn thành")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Xóa công việc khỏi danh sách của bạn")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Số thứ tự công việc cần xóa")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Quản lý danh sách dùng chung")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Tạo danh sách dùng chung mới")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Tên cho danh sách dùng chung")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Thêm thành viên vào danh sách dùng chung")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID của danh sách dùng chung")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("Người dùng cần thêm vào danh sách")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("Xem danh sách dùng chung")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID của danh sách dùng chung")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Thêm công việc vào danh sách dùng chung")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID của danh sách dùng chung")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("Công việc cần thêm")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Xóa công việc khỏi danh sách dùng chung")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID của danh sách dùng chung")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("Số thứ tự công việc cần xóa")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
                const subcommand = interaction.options.getSubcommand();
                const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Todo interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            return;
        }

        if (shareSubcommand) {
            switch (shareSubcommand) {
                case 'create': {
                    const listName = interaction.options.getString('name');
                    const listId = generateShareId();

                    await getOrCreateSharedList(listId, userId, listName);

                    const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                    const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                    if (!sharedListsArray.includes(listId)) {
                        sharedListsArray.push(listId);
                        await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                    }

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Đã Tạo Danh Sách Dùng Chung",
                                `Đã tạo danh sách dùng chung "${listName}" với ID: \`${listId}\`\n` +
                                `Dùng \`/todo share add list_id:${listId} user:@username\` để thêm thành viên.`
                            )
                        ]
                    });
                }

                case 'add': {
                    const listId = interaction.options.getString('list_id');
                    const memberToAdd = interaction.options.getUser('user');

                    const listData = await getOrCreateSharedList(listId);
                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách dùng chung.' });
                    }

                    if (listData.creatorId !== userId) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Chỉ người tạo danh sách mới có thể thêm thành viên.' });
                    }

                    if (!listData.members.includes(memberToAdd.id)) {
                        listData.members.push(memberToAdd.id);
                        await setInDb(`shared_todo_${listId}`, listData);

                        const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                        const memberListsArray = Array.isArray(memberLists) ? memberLists : [];
                        if (!memberListsArray.includes(listId)) {
                            memberListsArray.push(listId);
                            await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                        }

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed('Đã Thêm Thành Viên', 
                                    `Đã thêm ${memberToAdd.username} vào danh sách dùng chung "${listData.name}"`
                                )
                            ]
                        });
                    } else {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Người dùng này đã là thành viên của danh sách.' });
                    }
                }

                case 'view': {
                    const listId = interaction.options.getString('list_id');
                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách dùng chung.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
                    }

                    if (listData.tasks.length === 0) {
                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(',');

                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed(
                                        `📋 **${listData.name}**\n\n` +
                                        `👑 **Chủ Sở Hữu:** ${ownerName}\n` +
                                        `👥 **Thành Viên:** ${memberList}\n\n` +
                                        `*Danh sách hiện đang trống. Dùng nút "Thêm Công Việc" để thêm công việc nhé!*`,
                                        `Danh Sách Dùng Chung (ID: \`${listId}\`)`
                                    )
                                ],
                                components: [
                                    new ActionRowBuilder().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_add_${listId}`)
                                            .setLabel('Thêm Công Việc')
                                            .setStyle(ButtonStyle.Primary),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_complete_${listId}`)
                                            .setLabel('Hoàn Thành Công Việc')
                                            .setStyle(ButtonStyle.Success),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_remove_${listId}`)
                                            .setLabel('Xóa Công Việc')
                                            .setStyle(ButtonStyle.Danger)
                                    )
                                ]
                            });
                    }

                    const taskList = listData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                            (task.completed ? `• Hoàn thành bởi ${task.completedBy}` : '') + '`'
                        )
                        .join('\n');

                    const memberList = listData.members.map(memberId => {
                        const member = interaction.guild.members.cache.get(memberId);
                        return member ? member.user.username : `<@${memberId}>`;
                    }).join(',');

                    const owner = interaction.guild.members.cache.get(listData.creatorId);
                    const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                    const fullListDisplay = `📋 **${listData.name}**\n\n` +
                        `👑 **Chủ Sở Hữu:** ${ownerName}\n` +
                        `👥 **Thành Viên:** ${memberList}\n\n` +
                        `**Công Việc:**\n${taskList}`;

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(`Danh Sách Dùng Chung (ID: \`${listId}\`)`, fullListDisplay)
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_add_${listId}`)
                                    .setLabel('Thêm Công Việc')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_complete_${listId}`)
                                    .setLabel('Hoàn Thành Công Việc')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_remove_${listId}`)
                                    .setLabel('Xóa Công Việc')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    });
                }

                case 'addtask': {
                    const listId = interaction.options.getString('list_id');
                    const taskText = interaction.options.getString('task');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách dùng chung.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
                    }

                    const newTask = {
                        id: listData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString(),
                        createdBy: userId
                    };

                    listData.tasks.push(newTask);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('Đã Thêm Công Việc', `Đã thêm "${taskText}" vào danh sách dùng chung "${listData.name}"`)
                        ]
                    });
                }

                case 'remove': {
                    const listId = interaction.options.getString('list_id');
                    const taskNumber = interaction.options.getInteger('number');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách dùng chung.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
                    }

                    const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                    if (taskIndex === -1) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy công việc.' });
                    }

                    const [removedTask] = listData.tasks.splice(taskIndex, 1);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('Đã Xóa Công Việc', `Đã xóa "${removedTask.text}" khỏi danh sách dùng chung "${listData.name}".`)
                        ]
                    });
                }
            }
            return;
        }

        const dbKey = `todo_${userId}`;

        const userData = await getFromDb(dbKey, {
            tasks: [],
            nextId: 1
        });

        if (!userData.tasks) userData.tasks = [];
        if (!userData.nextId) userData.nextId = 1;

        switch (subcommand) {
            case 'add': {
                const taskText = interaction.options.getString('task');

                const newTask = {
                    id: userData.nextId++,
                    text: taskText,
                    completed: false,
                    createdAt: new Date().toISOString()
                };

                userData.tasks.push(newTask);
                await setInDb(dbKey, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Đã Thêm Công Việc",
                            `Đã thêm "${taskText}" vào danh sách công việc của bạn.`
                        ),
                    ],
                });
            }

            case 'list': {
                if (userData.tasks.length === 0) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Danh sách công việc của bạn đang trống!', "Danh Sách Công Việc Của Bạn")],
                    });
                }

                const taskList = userData.tasks
                    .map(task => 
                        `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                        `\`[${new Date(task.createdAt).toLocaleDateString()}\``
                    )
                    .join('\n');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Danh Sách Công Việc Của Bạn', taskList)
                    ],
                });
            }

            case 'complete': {
                const taskNumber = interaction.options.getInteger('number');
                const task = userData.tasks.find(t => t.id === taskNumber);

                if (!task) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy công việc.' });
                }

                if (task.completed) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Công việc #${task.id} đã hoàn thành rồi.` });
                }

                task.completed = true;
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Đã Hoàn Thành', `Đã đánh dấu "${task.text}" là hoàn thành!`)
                    ],
                });
            }

            case 'remove': {
                const taskNumber = interaction.options.getInteger('number');
                const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);

                if (taskIndex === -1) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy công việc.' });
                }

                const [removedTask] = userData.tasks.splice(taskIndex, 1);
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Đã Xóa Công Việc', `Đã xóa "${removedTask.text}" khỏi danh sách công việc của bạn.`)
                    ],
                });
            }

            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Lệnh con không hợp lệ.' });
        }
    },
};