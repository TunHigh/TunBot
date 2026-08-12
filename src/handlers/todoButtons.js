import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
function buildSharedTodoViewPayload(listData, listId, guild) {
  const memberList = (listData.members || []).map(memberId => {
    const member = guild?.members?.cache?.get(memberId);
    return member ? member.user.username : `<@${memberId}>`;
  }).join(', ');

  const owner = guild?.members?.cache?.get(listData.creatorId);
  const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

  const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];

  if (tasks.length === 0) {
    return {
      embeds: [
        successEmbed(
          `📋 **${listData.name}**\n\n` +
          `👑 **Chủ sở hữu:** ${ownerName}\n` +
          `👥 **Thành viên:** ${memberList}\n\n` +
          '*Danh sách này hiện đang trống. Dùng nút "Thêm Nhiệm Vụ" để thêm nhiệm vụ nhé!*',
          `Danh Sách Chia Sẻ (ID: \`${listId}\`)`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shared_todo_add_${listId}`)
            .setLabel('Thêm Nhiệm Vụ')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shared_todo_complete_${listId}`)
            .setLabel('Hoàn Thành')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`shared_todo_remove_${listId}`)
            .setLabel('Xóa Nhiệm Vụ')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    };
  }

  const taskList = tasks
    .map(task =>
      `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
      `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
      (task.completed ? ` • Đã hoàn thành bởi <@${task.completedBy}>` : '') + '`'
    )
    .join('\n');

  return {
    embeds: [
      successEmbed(
        `📋 **${listData.name}**\n\n` +
        `👑 **Chủ sở hữu:** ${ownerName}\n` +
        `👥 **Thành viên:** ${memberList}\n\n` +
        `**Nhiệm vụ:**\n${taskList}`,
        `Danh Sách Chia Sẻ (ID: \`${listId}\`)`
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shared_todo_add_${listId}`)
          .setLabel('Thêm Nhiệm Vụ')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`shared_todo_complete_${listId}`)
          .setLabel('Hoàn Thành')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`shared_todo_remove_${listId}`)
          .setLabel('Xóa Nhiệm Vụ')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

async function refreshSharedTodoMessage(interaction, listId, messageId) {
  if (!messageId || !interaction.channel) {
    return;
  }

  const listKey = `shared_todo_${listId}`;
  const listData = await getFromDb(listKey, null);
  if (!listData) {
    return;
  }

  try {
    const targetMessage = await interaction.channel.messages.fetch(messageId);
    if (!targetMessage) {
      return;
    }

    const updatedPayload = buildSharedTodoViewPayload(listData, listId, interaction.guild);
    await targetMessage.edit(updatedPayload);
  } catch (error) {
    logger.warn('Unable to refresh shared todo view message', {
      listId,
      messageId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: error.message
    });
  }
}

const sharedTodoAddHandler = {
  name: 'shared_todo_add',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Thêm Nhiệm Vụ vào Danh Sách Chia Sẻ');

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel('Nhập mô tả nhiệm vụ')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(taskInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoCompleteHandler = {
  name: 'shared_todo_complete',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Hoàn Thành Nhiệm Vụ trong Danh Sách Chia Sẻ');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Nhập ID nhiệm vụ cần hoàn thành')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('ví dụ: 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Xóa Nhiệm Vụ khỏi Danh Sách Chia Sẻ');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Nhập ID nhiệm vụ cần xóa')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('ví dụ: 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoAddModalHandler = {
  name: 'shared_todo_add_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_add`, 5, 30000);
      if (!allowed) {
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Bạn đang thêm nhiệm vụ quá nhanh. Vui lòng chờ rồi thử lại.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      }

      if (!taskText || taskText.trim().length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Nội dung nhiệm vụ không thể để trống.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách chia sẻ.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
      }

      if (!listData.tasks) listData.tasks = [];
      if (!listData.nextId) listData.nextId = 1;

      const newTask = {
        id: listData.nextId++,
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        createdBy: userId
      };
      
      listData.tasks.push(newTask);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [successEmbed("Đã Thêm Nhiệm Vụ", `Đã thêm "${taskText}" vào danh sách chia sẻ.`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo add modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi khi thêm nhiệm vụ.' });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_complete`, 5, 30000);
      if (!allowed) {
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Bạn đang hoàn thành nhiệm vụ quá nhanh. Vui lòng chờ rồi thử lại.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID nhiệm vụ phải là một số dương.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách chia sẻ.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy nhiệm vụ.' });
      }

      if (task.completed) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Nhiệm vụ #${task.id} đã hoàn thành rồi.` });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);
      
      return interaction.reply({
        embeds: [successEmbed("Đã Hoàn Thành Nhiệm Vụ", `Đã đánh dấu "${task.text}" là hoàn thành!`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo complete modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi khi hoàn thành nhiệm vụ.' });
    }
  }
};

const sharedTodoRemoveModalHandler = {
  name: 'shared_todo_remove_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_remove`, 5, 30000);
      if (!allowed) {
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Bạn đang xóa nhiệm vụ quá nhanh. Vui lòng chờ rồi thử lại.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID danh sách chia sẻ không hợp lệ.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'ID nhiệm vụ phải là một số dương.' });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb(listKey, null);

      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy danh sách chia sẻ.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bạn không có quyền truy cập danh sách này.' });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Không tìm thấy nhiệm vụ.' });
      }

      const [removedTask] = listData.tasks.splice(taskIndex, 1);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [successEmbed('Đã Xóa Nhiệm Vụ', `Đã xóa "${removedTask.text}" khỏi danh sách chia sẻ.`)],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Error in shared todo remove modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Đã xảy ra lỗi khi xóa nhiệm vụ.' });
    }
  }
};

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler };