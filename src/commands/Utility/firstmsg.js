import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Lấy liên kết đến tin nhắn đầu tiên trong kênh này")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`FirstMsg interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'firstmsg'
            });
            return;
        }

        const messages = await interaction.channel.messages.fetch({
            limit: 1,
            after: '1',
            cache: false
        });

        const firstMessage = messages.first();

        if (!firstMessage) {
            logger.info(`FirstMsg - no messages found in channel`, {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId
            });
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Tin Nhắn Đầu Tiên', "Không tìm thấy tin nhắn nào trong kênh này!")],
            });
        }

        const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Tin Nhắn Đầu Tiên Trong #" + interaction.channel.name,
                    `Liên Kết Tin Nhắn: ${messageLink}`
                ),
            ],
        });

        logger.info(`FirstMsg command executed`, {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            messageId: firstMessage.id,
            guildId: interaction.guildId
        });
    },
};