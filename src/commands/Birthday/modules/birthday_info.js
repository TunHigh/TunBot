import { EmbedBuilder } from 'discord.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const guildId = interaction.guildId;

        const birthday = await getUserBirthday(client, guildId, userId);

        if (!birthday) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('No Birthday Found')
                .setDescription(targetUser.id === interaction.user.id 
                    ? 'You haven\'t set your birthday yet. Use `/birthday set` to add it!'
                    : `<@${userId}> hasn't set their birthday yet.`);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Birthday Info')
            .setDescription(`<@${userId}>'s birthday is **${birthday.monthName} ${birthday.day}**!`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
};