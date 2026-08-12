import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { successEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../commands/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS = {
  audit: 'Nhật Ký Kiểm Duyệt',
  applications: 'Đơn Tuyển',
  reports: 'Báo Cáo',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Bạn cần quyền **Quản Lý Máy Chủ** để dùng tính năng này.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_back') {
        return handleBackToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction) {
  if (isCategoriesView(interaction)) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (isFilterView(interaction)) {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleBackToMain(interaction) {
  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleToggle(interaction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');
  if (!eventType) {
    return interaction.reply({ content: '❌ Loại sự kiện không hợp lệ.', ephemeral: true });
  }

  const status = await getLoggingStatus(interaction.client, interaction.guildId);
  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(interaction.client, interaction.guildId, !Boolean(status.enabled));
  } else if (eventType === 'all') {
    const newState = !Object.values(status.enabledEvents).every((v) => v !== false);
    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);
    await toggleEventLogging(interaction.client, interaction.guildId, [...allTypes, ...categoryTypes], newState);
  } else {
    const currentState = status.enabledEvents[eventType] !== false;
    await toggleEventLogging(interaction.client, interaction.guildId, eventType, !currentState);
  }

  if (onCategoriesView || (eventType !== 'audit_enabled' && eventType.includes('.*'))) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleAddFilterModal(interaction) {
  const filterType = interaction.customId.replace('log_dash_add_filter:', '');
  if (filterType !== 'user' && filterType !== 'channel') {
    return interaction.reply({ content: '❌ Loại bộ lọc không hợp lệ.', ephemeral: true });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal;
  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Chọn một người dùng cần bỏ qua…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('Người Dùng Cần Bỏ Qua')
      .setDescription('Chọn người dùng có hành động không nên được ghi log')
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Thêm Bộ Lọc Người Dùng')
      .addLabelComponents(userLabel);
  } else {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('ignore_channel')
      .setPlaceholder('Chọn một kênh cần bỏ qua…')
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice);

    const channelLabel = new LabelBuilder()
      .setLabel('Kênh Cần Bỏ Qua')
      .setDescription('Chọn kênh có sự kiện không nên được ghi log')
      .setChannelSelectMenuComponent(channelSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Thêm Bộ Lọc Kênh')
      .addLabelComponents(channelLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    let id;
    if (filterType === 'user') {
      id = modalSubmission.fields.getField('ignore_user')?.values?.[0];
    } else {
      id = modalSubmission.fields.getField('ignore_channel')?.values?.[0];
    }

    if (!id) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: `Vui lòng chọn ${filterType === 'user' ? 'một người dùng' : 'một kênh'} để bỏ qua.`,
      });
    }

    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'add', type: filterType, id });

    await modalSubmission.reply({
      embeds: [successEmbed('Đã Thêm Bộ Lọc', `${filterType === 'user' ? 'Người dùng' : 'Kênh'} \`${id}\` sẽ được bỏ qua trong nhật ký kiểm duyệt.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in add filter modal:', error);
  }
}

async function handleRemoveFilterModal(interaction) {
  const config = await getGuildConfig(interaction.client, interaction.guildId);
  const ignore = getIgnoreList(config);
  const options = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Người dùng ${userId}`)
        .setDescription('Xóa người dùng này khỏi danh sách bỏ qua')
        .setValue(`user:${userId}`),
    );
  }

  for (const channelId of ignore.channels || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Kênh ${channelId}`)
        .setDescription('Xóa kênh này khỏi danh sách bỏ qua')
        .setValue(`channel:${channelId}`),
    );
  }

  if (options.length === 0) {
    return replyUserError(interaction, {
      type: ErrorTypes.USER_INPUT,
      message: 'Không có bộ lọc bỏ qua nào để xóa.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Chọn một bộ lọc cần xóa…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Bộ Lọc Cần Xóa')
    .setDescription('Chọn một người dùng hoặc kênh để bỏ bỏ qua')
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Xóa Bộ Lọc Bỏ Qua')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const entry = modalSubmission.fields.getField('filter_entry')?.values?.[0];
    if (!entry) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: 'Vui lòng chọn một bộ lọc cần xóa.',
      });
    }

    const [type, id] = entry.split(':');
    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'remove', type, id });

    await modalSubmission.reply({
      embeds: [successEmbed('Đã Xóa Bộ Lọc', `Đã xóa ${type === 'user' ? 'người dùng' : 'kênh'} \`${id}\` khỏi danh sách bỏ qua.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in remove filter modal:', error);
  }
}

async function showChannelModal(interaction, destination) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_channel_modal:${destination}`;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('log_channel')
    .setPlaceholder('Chọn một kênh văn bản…')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);

  const channelLabel = new LabelBuilder()
    .setLabel(`${label}`)
    .setDescription(`Các log ${label.toLowerCase()} sẽ được gửi đến kênh này`)
    .setChannelSelectMenuComponent(channelSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Đặt Kênh ${label}`)
    .addLabelComponents(channelLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const channelId = modalSubmission.fields.getField('log_channel').values[0];
    const channel = interaction.guild.channels.cache.get(channelId)
      ?? await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      return modalSubmission.reply({
        content: '❌ Không tìm thấy kênh đó.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = channel.permissionsFor(interaction.guild.members.me);
    if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return modalSubmission.reply({
        content: '❌ Mình cần quyền Xem Kênh, Gửi Tin Nhắn và Nhúng Liên Kết trong kênh đó.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogChannel(interaction.client, interaction.guildId, destination, channel.id);

    await modalSubmission.reply({
      embeds: [successEmbed('Đã Cập Nhật Kênh', `Log của **${label}** sẽ được gửi tới ${channel}.`)],
      flags: MessageFlags.Ephemeral,
    });

    await refreshDashboardMessage(interaction, interaction.client);
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    await handleInteractionError(interaction, error, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_channel',
    });
  }
}

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ Bạn cần quyền **Quản Lý Máy Chủ** để dùng tính năng này.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showChannelModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');
    await setLogChannel(interaction.client, interaction.guildId, destination, null);
    const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:categories') {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (value === 'view:filters') {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  return interaction.reply({ content: '❌ Tùy chọn không xác định.', ephemeral: true });
}
