// loggingUi.js

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { EVENT_TYPES } from '../../services/loggingService.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((accumulator, eventType) => {
  const [category] = eventType.split('.');
  if (!accumulator[category]) {
    accumulator[category] = [];
  }
  accumulator[category].push(eventType);
  return accumulator;
}, {});

export const DASHBOARD_CATEGORIES = [
  'moderation',
  'message',
  'role',
  'member',
  'leveling',
  'reactionrole',
  'giveaway',
  'counter',
  'application',
  'report',
];

const DASHBOARD_CATEGORY_EMOJIS = {
  moderation: '🔨',
  message: '✉️',
  role: '🏷️',
  member: '👥',
  leveling: '📈',
  reactionrole: '🎭',
  giveaway: '🎁',
  counter: '📊',
  application: '📝',
  report: '🚨',
};

export const DASHBOARD_CATEGORY_LABELS = {
  moderation: 'Kiểm duyệt',
  message: 'Tin nhắn',
  role: 'Vai trò',
  member: 'Thành viên',
  leveling: 'Leveling',
  reactionrole: 'Reaction Roles',
  giveaway: 'Giveaways',
  counter: 'Bộ đếm',
  application: 'Đơn ứng tuyển',
  report: 'Báo cáo',
};

function createBackButton() {
  return new ButtonBuilder()
    .setCustomId('log_dash_back')
    .setLabel('Quay lại bảng điều khiển')
    .setStyle(ButtonStyle.Secondary);
}

function createCategoryToggleButtons(enabledEvents = {}, loggingEnabled = false) {
  const buttons = DASHBOARD_CATEGORIES.map((category) => {
    const wildcardDisabled = enabledEvents[`${category}.*`] === false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    const allEnabled = categoryEvents.length === 0
      ? true
      : categoryEvents.every((t) => enabledEvents[t] !== false);
    const isEnabled = loggingEnabled && !wildcardDisabled && allEnabled;
    const emoji = DASHBOARD_CATEGORY_EMOJIS[category] || '📌';
    const label = DASHBOARD_CATEGORY_LABELS[category] || category;

    return new ButtonBuilder()
      .setCustomId(`log_dash_toggle:${category}.*`)
      .setLabel(`${emoji} ${label}`)
      .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

export function createLoggingMainMenuSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('log_dash_menu')
      .setPlaceholder('Chọn một cài đặt để cấu hình…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Đặt kênh nhật ký kiểm duyệt')
          .setDescription('Kiểm duyệt, tin nhắn, thành viên, vai trò, v.v.')
          .setValue('set:audit')
          .setEmoji('🧾'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Đặt kênh đơn ứng tuyển')
          .setDescription('Đơn mới và cập nhật xét duyệt')
          .setValue('set:applications')
          .setEmoji('📝'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Đặt kênh báo cáo')
          .setDescription('Báo cáo người dùng gửi qua /report')
          .setValue('set:reports')
          .setEmoji('🚨'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Xóa kênh nhật ký kiểm duyệt')
          .setValue('clear:audit')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Xóa kênh đơn ứng tuyển')
          .setValue('clear:applications')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Xóa kênh báo cáo')
          .setValue('clear:reports')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Danh mục sự kiện')
          .setDescription('Bật/tắt các loại nhật ký được gửi')
          .setValue('view:categories')
          .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Quản lý bộ lọc bỏ qua')
          .setDescription('Bỏ qua nhật ký từ người dùng hoặc kênh cụ thể')
          .setValue('view:filters')
          .setEmoji('🔇'),
      ),
  );
}

export function createLoggingMainActionRow(loggingEnabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:audit_enabled')
      .setLabel('Nhật ký kiểm duyệt')
      .setStyle(loggingEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Làm mới')
      .setStyle(ButtonStyle.Primary),
  );
}

export function createLoggingDashboardComponents(_enabledEvents, loggingEnabled = false) {
  return [
    createLoggingMainMenuSelect(),
    createLoggingMainActionRow(loggingEnabled),
  ];
}

export function createLoggingCategoryViewComponents(enabledEvents, loggingEnabled = false) {
  const categoryRows = createCategoryToggleButtons(enabledEvents, loggingEnabled);

  const actionRow = new ActionRowBuilder().addComponents(
    createBackButton(),
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:all')
      .setLabel('Bật/tắt tất cả danh mục')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Làm mới')
      .setStyle(ButtonStyle.Primary),
  );

  return [...categoryRows, actionRow];
}

export function createLoggingFilterComponents() {
  return [
    new ActionRowBuilder().addComponents(
      createBackButton(),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:user')
        .setLabel('Thêm bộ lọc người dùng')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:channel')
        .setLabel('Thêm bộ lọc kênh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_remove_filter')
        .setLabel('Xóa bộ lọc')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export { EVENT_TYPES_BY_CATEGORY };
