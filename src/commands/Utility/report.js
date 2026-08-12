import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Báo cáo người dùng cho quản trị viên server, hoặc cấu hình nơi nhận báo cáo.')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Báo cáo người dùng cho đội ngũ quản trị server.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Người dùng bạn muốn báo cáo.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Lý do báo cáo (hãy mô tả chi tiết).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Đặt kênh nhận báo cáo người dùng. (Cần quyền Quản Lý Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Kênh văn bản sẽ nhận báo cáo.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'Utility',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'file') {
            return await report.execute(interaction, config, client);
        }

        if (subcommand === 'setchannel') {
            return await reportSetchannel.execute(interaction, config, client);
        }

        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Lệnh con không xác định.' });
    },
};