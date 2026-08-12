import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Cấu hình cài đặt cửa hàng. (Cần quyền quản lý máy chủ)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Đặt vai trò Discord được trao khi mua vật phẩm Vai trò Premium trong cửa hàng.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Vai trò sẽ được trao khi mua Vai trò Premium.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};
