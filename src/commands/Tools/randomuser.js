import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Chọn ngẫu nhiên một người dùng trong server')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Giới hạn chọn người dùng có role này')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Bao gồm cả bot trong lựa chọn (mặc định: tắt)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('Chỉ chọn người dùng đang online (mặc định: tắt)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Mention người được chọn (mặc định: tắt)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`RandomUser interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        if (!interaction.guild) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Lệnh này chỉ dùng được trong server.',
            });
        }

        const role = interaction.options.getRole('role');
        const includeBots = interaction.options.getBoolean('bots') || false;
        const onlineOnly = interaction.options.getBoolean('online') || false;
        const shouldMention = interaction.options.getBoolean('mention') || false;

        let members = interaction.guild.members.cache.filter(member => {
            if (member.user.bot && !includeBots) return false;

            if (onlineOnly && member.presence?.status === 'offline') return false;

            if (role && !member.roles.cache.has(role.id)) return false;

            return true;
        });

        let memberArray = Array.from(members.values());

        if (!includeBots) {
            memberArray = memberArray.filter(member => !member.user.bot);
        }

        if (memberArray.length === 0) {
            let errorMessage = 'Không tìm thấy người dùng nào khớp bộ lọc của bạn:';
            if (role) errorMessage = `Không có người dùng nào có role **${role.name}**.`;
            if (onlineOnly) errorMessage = 'Không có người dùng nào đang online.';
            if (role && onlineOnly) errorMessage = `Không có thành viên **${role.name}** nào đang online.`;

            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: errorMessage + '\n\nHãy thử điều chỉnh bộ lọc của bạn.',
            });
        }

        const randomIndex = Math.floor(Math.random() * memberArray.length);
        const selectedMember = memberArray[randomIndex];

        const user = selectedMember.user;
        const joinDate = selectedMember.joinedAt;
        const roles = selectedMember.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const embed = successEmbed(
            '🎲 Người Dùng Ngẫu Nhiên Đã Chọn',
            shouldMention ? `${selectedMember}` : `**${user.username}**`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Tên Người Dùng', value: user.username, inline: true },
            { name: 'Bot', value: user.bot ? 'Có' : 'Không', inline: true },
            { name: `Roles (${roles.length})`, value: roles.length > 0 ? roles.slice(0, 5).join('') + (roles.length > 5 ? `+${roles.length - 5} nữa` : '') : 'Không có roles', inline: false }
        )
        .setColor('primary');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`randomuser_${interaction.user.id}_again`)
                    .setLabel('🎲 Chọn Người Dùng Khác')
                    .setStyle(ButtonStyle.Primary)
            );

        const response = await interaction.editReply({
            content: shouldMention ? `${selectedMember}, bạn đã được chọn!` : null,
            embeds: [embed],
            components: [row],
            allowedMentions: { users: shouldMention ? [user.id] : [] }
        });

        const filter = (i) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try {
                let newMembers = interaction.guild.members.cache.filter(member => {
                    if (member.user.bot && !includeBots) return false;

                    if (onlineOnly && member.presence?.status === 'offline') return false;

                    if (role && !member.roles.cache.has(role.id)) return false;

                    return true;
                });

                let newMemberArray = Array.from(newMembers.values());

                if (!includeBots) {
                    newMemberArray = newMemberArray.filter(member => !member.user.bot);
                }

                if (newMemberArray.length === 0) {
                    await replyUserError(i, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'Không tìm thấy người dùng nào khớp tiêu chí.',
                    });
                    return;
                }

                const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                const newSelectedMember = newMemberArray[newRandomIndex];
                const newUser = newSelectedMember.user;

                const newRoles = newSelectedMember.roles.cache
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => r.toString())
                    .slice(0, 10);

                const newEmbed = successEmbed(
                    '🎲 Người Dùng Ngẫu Nhiên Đã Chọn',
                    shouldMention ? `${newSelectedMember}` : `**${newUser.username}**`
                )
                .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: 'Tên Người Dùng', value: newUser.username, inline: true },
                    { name: 'Bot', value: newUser.bot ? 'Có' : 'Không', inline: true },
                    { name: `Roles (${newRoles.length})`, value: newRoles.length > 0 ? newRoles.slice(0, 5).join('') + (newRoles.length > 5 ? `+${newRoles.length - 5} nữa` : '') : 'Không có roles', inline: false }
                )
                .setColor(newSelectedMember.displayHexColor || '#3498db');

                await i.update({
                    content: shouldMention ? `${newSelectedMember}, bạn đã được chọn!` : null,
                    embeds: [newEmbed],
                    components: [row],
                    allowedMentions: { users: shouldMention ? [newUser.id] : [] }
                });

            } catch (error) {
                logger.error('Button interaction error:', error);
                await i.reply({
                    content: 'Đã xảy ra lỗi khi chọn người dùng khác.',
                    flags: ['Ephemeral']
                });
            }
        });

        collector.on('end', () => {
            const disabledRow = ActionRowBuilder.from(row).setComponents(
                ButtonBuilder.from(row.components[0]).setDisabled(true)
            );

            interaction.editReply({ components: [disabledRow] }).catch(console.error);
        });
    },
};