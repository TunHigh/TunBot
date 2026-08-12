import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Quản lý phát nhạc, danh sách chờ và phiên thoại')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Tạm dừng phát nhạc'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Tiếp tục phát nhạc'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Dừng phát nhạc và xóa danh sách chờ'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Trộn ngẫu nhiên danh sách chờ'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Đặt chế độ lặp lại')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Chế độ lặp lại')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tắt', value: 'none' },
                            { name: 'Bài hát', value: 'track' },
                            { name: 'Danh sách chờ', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Đặt âm lượng phát nhạc')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Âm lượng (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Tua đến một vị trí trong bài hát hiện tại')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Vị trí tính bằng giây').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Xóa một bài hát khỏi danh sách chờ')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Vị trí trong danh sách chờ').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Di chuyển một bài hát trong danh sách chờ')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Vị trí hiện tại').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('Vị trí mới').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Xóa toàn bộ danh sách chờ'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Ngắt kết nối bot khỏi kênh thoại'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('Bật/tắt chế độ 24/7 (ở lại kênh thoại khi không hoạt động)')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('Bật hoặc tắt chế độ 24/7').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'pause': {
                const embed = await pausePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'resume': {
                const embed = await resumePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'skip': {
                const embed = await skipTrack(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'stop': {
                const embed = await stopPlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'shuffle': {
                const embed = await shuffleQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'loop': {
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from'),
                    interaction.options.getInteger('to'),
                );
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'clear': {
                const embed = await clearQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'leave': {
                const embed = await leaveVoiceChannel(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case '247': {
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: 'Lệnh con không xác định.',
                });
        }
    },
};
