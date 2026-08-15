import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from 'discord.js';
import { createEmbed, formatDuration } from '../../utils/embeds.js';
import { 
    getStreakData, 
    saveStreakData, 
    getUserStreaks, 
    getTopStreaks, 
    resetStreak,
    getPairKey 
} from '../../services/streakService.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Quản lý và xem chuỗi tin nhắn (streak) với người chơi khác')
    .addSubcommand(subcommand =>
        subcommand
            .setName('xem')
            .setDescription('Xem streak của bạn với một người chơi')
            .addUserOption(option =>
                option.setName('nguoi_choi')
                    .setDescription('Người chơi để xem streak')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('tatca')
            .setDescription('Xem tất cả streak của bạn')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('top')
            .setDescription('Xem top streak cao nhất trên server')
            .addIntegerOption(option =>
                option.setName('gioi_han')
                    .setDescription('Số lượng hiển thị (mặc định 10)')
                    .setMinValue(1)
                    .setMaxValue(25)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('reset')
            .setDescription('Reset streak với một người chơi (chỉ admin)')
            .addUserOption(option =>
                option.setName('nguoi_choi_1')
                    .setDescription('Người chơi thứ 1')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('nguoi_choi_2')
                    .setDescription('Người chơi thứ 2')
                    .setRequired(true)
            )
    );

export async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    try {
        switch (subcommand) {
            case 'xem': {
                const targetUser = interaction.options.getUser('nguoi_choi');
                if (targetUser.bot) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '❌ Lỗi', 
                            description: 'Không thể xem streak với bot!', 
                            color: 'error' 
                        })], 
                        ephemeral: true 
                    });
                }
                
                if (targetUser.id === userId) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '❌ Lỗi', 
                            description: 'Không thể xem streak với chính mình!', 
                            color: 'error' 
                        })], 
                        ephemeral: true 
                    });
                }

                const streakData = await getStreakData(client, guildId, userId, targetUser.id);
                
                if (!streakData) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '📊 Streak với ' + targetUser.displayName, 
                            description: 'Chưa có streak nào giữa bạn và người chơi này.\nHãy nhắn tin cho nhau hàng ngày để bắt đầu streak!', 
                            color: 'info',
                            thumbnail: targetUser.displayAvatarURL()
                        })], 
                        ephemeral: false 
                    });
                }

                const otherUserId = streakData.userId1 === userId ? streakData.userId2 : streakData.userId1;
                const otherUser = await client.users.fetch(otherUserId).catch(() => null);
                const otherUserName = otherUser ? otherUser.displayName : 'Người chơi không xác định';

                const embed = createEmbed({
                    title: `🔥 Streak với ${otherUserName}`,
                    color: streakData.currentStreak >= 7 ? 'warning' : streakData.currentStreak >= 3 ? 'success' : 'primary',
                    thumbnail: otherUser?.displayAvatarURL(),
                    fields: [
                        { name: '🔥 Streak hiện tại', value: `**${streakData.currentStreak}** ngày`, inline: true },
                        { name: '🏆 Streak cao nhất', value: `**${streakData.longestStreak}** ngày`, inline: true },
                        { name: '💬 Tổng tương tác', value: `**${streakData.totalInteractions}** lần`, inline: true },
                        { name: '📅 Lần tương tác cuối', value: streakData.lastInteractionDate, inline: true }
                    ],
                    footer: { text: 'Nhắn tin cho nhau mỗi ngày để duy trì streak!' }
                });

                return interaction.reply({ embeds: [embed] });
            }

            case 'tatca': {
                const userStreaks = await getUserStreaks(client, guildId, userId);
                
                if (userStreaks.length === 0) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '📊 Streak của bạn', 
                            description: 'Bạn chưa có streak nào với ai cả.\nHãy bắt đầu nhắn tin với bạn bè để tạo streak!', 
                            color: 'info' 
                        })], 
                        ephemeral: true 
                    });
                }

                // Create paginated embed
                const streaksPerPage = 5;
                const totalPages = Math.ceil(userStreaks.length / streaksPerPage);
                let currentPage = 0;

                const generateEmbed = async (page) => {
                    const start = page * streaksPerPage;
                    const end = start + streaksPerPage;
                    const pageStreaks = userStreaks.slice(start, end);

                    const fields = [];
                    for (let i = 0; i < pageStreaks.length; i++) {
                        const streak = pageStreaks[i];
                        const otherUser = await client.users.fetch(streak.otherUserId).catch(() => null);
                        const otherUserName = otherUser ? otherUser.displayName : 'Người chơi không xác định';
                        const streakEmoji = streak.currentStreak >= 7 ? '🔥' : streak.currentStreak >= 3 ? '⭐' : '💫';
                        
                        fields.push({
                            name: `${streakEmoji} ${otherUserName}`,
                            value: `Streak: **${streak.currentStreak}** ngày | Cao nhất: **${streak.longestStreak}** | Tương tác: **${streak.totalInteractions}**`,
                            inline: false
                        });
                    }

                    return createEmbed({
                        title: `📊 Tất cả Streak của ${interaction.user.displayName}`,
                        description: `Trang ${page + 1}/${totalPages} • Tổng: ${userStreaks.length} streak`,
                        color: 'primary',
                        fields,
                        footer: { text: 'Nhắn tin hàng ngày để duy trì streak!' }
                    });
                };

                const generateComponents = (page) => {
                    const row = new ActionRowBuilder();
                    
                    if (totalPages > 1) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`streak_prev_${userId}`)
                                .setLabel('◀ Trước')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page === 0),
                            new ButtonBuilder()
                                .setCustomId(`streak_next_${userId}`)
                                .setLabel('Sau ▶')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page === totalPages - 1)
                        );
                    }
                    
                    return [row];
                };

                const embed = await generateEmbed(0);
                const components = generateComponents(0);

                const reply = await interaction.reply({ 
                    embeds: [embed], 
                    components,
                    fetchReply: true 
                });

                // Store pagination state
                const collector = reply.createMessageComponentCollector({ 
                    time: 60000,
                    filter: i => i.user.id === userId && i.customId.startsWith('streak_')
                });

                collector.on('collect', async (i) => {
                    if (i.customId === `streak_prev_${userId}`) {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === `streak_next_${userId}`) {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }

                    const newEmbed = await generateEmbed(currentPage);
                    const newComponents = generateComponents(currentPage);
                    await i.update({ embeds: [newEmbed], components: newComponents });
                });

                collector.on('end', () => {
                    const disabledComponents = generateComponents(currentPage).map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(comp => {
                            newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
                        });
                        return newRow;
                    });
                    interaction.editReply({ components: disabledComponents }).catch(() => {});
                });

                break;
            }

            case 'top': {
                const limit = interaction.options.getInteger('gioi_han') || 10;
                const topStreaks = await getTopStreaks(client, guildId, limit);
                
                if (topStreaks.length === 0) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '🏆 Top Streak Server', 
                            description: 'Chưa có streak nào trên server này.', 
                            color: 'info' 
                        })], 
                        ephemeral: true 
                    });
                }

                const fields = [];
                for (let i = 0; i < topStreaks.length; i++) {
                    const streak = topStreaks[i];
                    const user1 = await client.users.fetch(streak.userId1).catch(() => null);
                    const user2 = await client.users.fetch(streak.userId2).catch(() => null);
                    const user1Name = user1 ? user1.displayName : 'Người chơi 1';
                    const user2Name = user2 ? user2.displayName : 'Người chơi 2';
                    
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const streakEmoji = streak.currentStreak >= 30 ? '💎' : streak.currentStreak >= 14 ? '🔥' : streak.currentStreak >= 7 ? '⭐' : '💫';
                    
                    fields.push({
                        name: `${medal} ${user1Name} & ${user2Name}`,
                        value: `${streakEmoji} Streak: **${streak.currentStreak}** ngày | Cao nhất: **${streak.longestStreak}** | Tương tác: **${streak.totalInteractions}**`,
                        inline: false
                    });
                }

                const embed = createEmbed({
                    title: `🏆 Top ${limit} Streak Cao Nhất`,
                    color: 'warning',
                    fields,
                    footer: { text: 'Cập nhật real-time • Nhắn tin hàng ngày để lên top!' }
                });

                return interaction.reply({ embeds: [embed] });
            }

            case 'reset': {
                // Check if user has admin permissions
                if (!interaction.memberPermissions.has('Administrator')) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '❌ Không có quyền', 
                            description: 'Chỉ Administrator mới có thể reset streak của người khác!', 
                            color: 'error' 
                        })], 
                        ephemeral: true 
                    });
                }

                const user1 = interaction.options.getUser('nguoi_choi_1');
                const user2 = interaction.options.getUser('nguoi_choi_2');

                if (user1.id === user2.id) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '❌ Lỗi', 
                            description: 'Không thể reset streak của cùng một người!', 
                            color: 'error' 
                        })], 
                        ephemeral: true 
                    });
                }

                const success = await resetStreak(client, guildId, user1.id, user2.id);
                
                if (success) {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: '✅ Đã Reset Streak', 
                            description: `Đã xóa streak giữa **${user1.displayName}** và **${user2.displayName}**.`, 
                            color: 'success' 
                        })] 
                    });
                } else {
                    return interaction.reply({ 
                        embeds: [createEmbed({ 
                            title: 'ℹ️ Không có Streak', 
                            description: `Không tìm thấy streak giữa **${user1.displayName}** và **${user2.displayName}**.`, 
                            color: 'info' 
                        })], 
                        ephemeral: true 
                    });
                }
            }
        }
    } catch (error) {
        logger.error('Error in streak command:', error);
        return interaction.reply({ 
            embeds: [createEmbed({ 
                title: '❌ Lỗi', 
                description: 'Đã xảy ra lỗi khi xử lý lệnh streak.', 
                color: 'error' 
            })], 
            ephemeral: true 
        });
    }
}