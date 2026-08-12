import { MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';
import {
    buildNowPlayingEmbed,
    buildQueueEmbed,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;

export function getPlayer(client, guildId) {
    return client.riffy?.players?.get(guildId) || null;
}

export function assertRiffyAvailable(client) {
    if (!client.riffy) {
        throw new TitanBotError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Tính năng nhạc không khả dụng — Lavalink chưa được cấu hình.',
        );
    }
}

export function assertInVoice(member) {
    if (!requireVoiceChannel(member)) {
        throw new TitanBotError(
            'Not in voice channel',
            ErrorTypes.USER_INPUT,
            'Bạn cần ở trong một kênh thoại.',
        );
    }
}

export function assertCanControl(member, player) {
    if (!canControlMusic(member, player)) {
        throw new TitanBotError(
            'Wrong voice channel',
            ErrorTypes.PERMISSION,
            VOICE_CHANNEL_DENIAL,
        );
    }
}

export async function ensurePlayer(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

function isDuplicateTrack(player, track) {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing.info?.uri === uri);
}

export async function joinVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    const channel = interaction.member.voice.channel;
    let player = getPlayer(client, guildId);

    if (player && player.voiceChannel !== channel.id) {
        try {
            player.destroy();
        } catch {
            // player may already be gone
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);

    return successEmbed(
        'Đã Vào Kênh Thoại',
        `Đã kết nối với **${channel.name}**. Dùng /play để phát nhạc, hoặc /music để điều khiển.`,
    );
}

export async function playQuery(client, interaction, query) {
    if (YOUTUBE_URL_PATTERN.test(query)) {
        throw new TitanBotError(
            'YouTube URL blocked',
            ErrorTypes.USER_INPUT,
            'Không hỗ trợ liên kết YouTube. Hãy thử tìm bằng tên bài hát.',
        );
    }

    const { player, guildData } = await ensurePlayer(client, interaction);

    const result = await client.riffy.resolve({
        query,
        requester: interaction.user,
    });

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_LOADED') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.info.requester = interaction.user;
            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }
            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.paused) {
            player.play();
        }

        return {
            embed: successEmbed(
                'Đã Thêm Danh Sách Phát',
                `**${playlistInfo?.name || 'Danh sách phát'}**\nĐã thêm ${added}/${tracks.length} bài.${skipped ? ` Bỏ qua ${skipped} bài trùng.` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_LOADED'
    ) {
        const track = tracks?.[0];
        if (!track) {
            throw new TitanBotError('No results', ErrorTypes.USER_INPUT, 'Không tìm thấy kết quả cho từ khóa đó.');
        }

        if (isDuplicateTrack(player, track)) {
            throw new TitanBotError(
                'Duplicate track',
                ErrorTypes.USER_INPUT,
                `**${track.info.title}** đã có trong danh sách chờ hoặc đang phát.`,
            );
        }

        track.info.requester = interaction.user;

        const willPlayNow = !player.playing && !player.paused;
        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            player.play();
        }

        return {
            embed: successEmbed(
                willPlayNow ? 'Đang Phát' : 'Đã Thêm Bài Hát',
                willPlayNow
                    ? `**${track.info.title}**\n${track.info.author}`
                    : `**${track.info.title}**\n${track.info.author}\nVị trí: #${queuePosition} trong danh sách chờ`,
            ),
        };
    }

    throw new TitanBotError('No results', ErrorTypes.USER_INPUT, `Không tìm thấy kết quả. (loadType: ${loadType})`);
}

export async function skipTrack(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Hiện không có gì đang phát.');
    }
    assertCanControl(interaction.member, player);
    const title = player.current.info?.title || 'Không xác định';
    // Under track-loop, stop() would replay the same track. Clear it so the skip
    // advances; trackStart re-applies the stored loop mode to the next track.
    if (player.loop === 'track') {
        player.setLoop('none');
    }
    player.stop();
    return successEmbed('Đã Bỏ Qua', `Đã bỏ qua **${title}**.`);
}

export async function stopPlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Không có trình phát nhạc nào đang hoạt động.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    const queueLength = player.queue?.length || 0;

    if (queueLength >= 5 && guildData.stopConfirmPending !== interaction.user.id) {
        guildData.stopConfirmPending = interaction.user.id;
        setTimeout(() => {
            if (guildData.stopConfirmPending === interaction.user.id) {
                guildData.stopConfirmPending = null;
            }
        }, 15000);
        return successEmbed(
            'Xác Nhận Dừng',
            `Có **${queueLength}** bài trong danh sách chờ. Chạy lại **/music stop** trong vòng 15 giây để xác nhận.`,
        );
    }

    guildData.stopConfirmPending = null;
    await destroyPlayerSession(client, interaction.guild.id, player, guildData);
    return successEmbed('Đã Dừng', 'Đã dừng phát nhạc và xóa danh sách chờ.');
}

export async function applyPause(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || player.paused) {
        return false;
    }

    player.pause(true);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function applyResume(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || !player.paused) {
        return false;
    }

    player.pause(false);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function pausePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Hiện không có gì đang phát.');
    }
    assertCanControl(interaction.member, player);

    if (player.paused) {
        throw new TitanBotError('Already paused', ErrorTypes.USER_INPUT, 'Phát nhạc đã tạm dừng rồi.');
    }

    await applyPause(client, interaction.guild.id);
    return successEmbed('Đã Tạm Dừng', 'Phát nhạc đã tạm dừng.');
}

export async function resumePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Hiện không có gì đang phát.');
    }
    assertCanControl(interaction.member, player);

    if (!player.paused) {
        throw new TitanBotError('Not paused', ErrorTypes.USER_INPUT, 'Phát nhạc không ở trạng thái tạm dừng.');
    }

    await applyResume(client, interaction.guild.id);
    return successEmbed('Đã Tiếp Tục', 'Phát nhạc đã tiếp tục.');
}

export async function shuffleQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotError('Empty queue', ErrorTypes.USER_INPUT, 'Danh sách chờ đang trống.');
    }
    assertCanControl(interaction.member, player);
    player.queue.shuffle();
    getGuildMusicData(interaction.guild.id).shuffle = true;
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Trộn', 'Danh sách chờ đã được trộn ngẫu nhiên.');
}

export async function setLoopMode(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Không có trình phát nhạc nào đang hoạt động.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.loop = mode;
    player.setLoop(mode);

    const labels = { none: 'Tắt', track: 'Bài Hát', queue: 'Danh Sách Chờ' };
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Cập Nhật Lặp Lại', `Chế độ lặp lại đã được đặt thành **${labels[mode] || mode}**.`);
}

export async function toggleLoop(client, interaction) {
    const guildData = getGuildMusicData(interaction.guild.id);
    const next = guildData.loop === 'none' ? 'track' : guildData.loop === 'track' ? 'queue' : 'none';
    return setLoopMode(client, interaction, next);
}

export async function setVolume(client, interaction, volume) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Không có trình phát nhạc nào đang hoạt động.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.volume = Math.max(0, Math.min(100, volume));
    player.setVolume(guildData.volume);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Cập Nhật Âm Lượng', `Âm lượng đã được đặt thành **${guildData.volume}%**.`);
}

export async function adjustVolume(client, interaction, delta) {
    const guildData = getGuildMusicData(interaction.guild.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

export async function seekTrack(client, interaction, seconds) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Hiện không có gì đang phát.');
    }
    assertCanControl(interaction.member, player);

    const info = player.current.info || {};
    if (info.isStream || info.isSeekable === false) {
        throw new TitanBotError(
            'Not seekable',
            ErrorTypes.USER_INPUT,
            'Không thể tua bài hát này (có thể là phát trực tiếp).',
        );
    }

    const position = Math.max(0, seconds * 1000);
    if (info.length && position > info.length) {
        throw new TitanBotError(
            'Seek out of range',
            ErrorTypes.USER_INPUT,
            `Bạn chỉ có thể tua tối đa ${Math.floor(info.length / 1000)} giây cho bài hát này.`,
        );
    }

    player.seek(position);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Tua', `Đã tua đến **${seconds} giây**.`);
}

export async function removeFromQueue(client, interaction, index) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotError('Empty queue', ErrorTypes.USER_INPUT, 'Danh sách chờ đang trống.');
    }
    assertCanControl(interaction.member, player);

    const queueIndex = index - 1;
    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new TitanBotError('Invalid index', ErrorTypes.USER_INPUT, `Vị trí trong danh sách chờ không hợp lệ. Danh sách chờ có ${player.queue.length} bài.`);
    }

    const removed = player.queue[queueIndex];
    player.queue.remove(queueIndex);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Xóa', `Đã xóa **${removed.info?.title || 'bài hát'}** khỏi danh sách chờ.`);
}

export async function moveInQueue(client, interaction, from, to) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotError('Empty queue', ErrorTypes.USER_INPUT, 'Danh sách chờ đang trống.');
    }
    assertCanControl(interaction.member, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
        throw new TitanBotError('Invalid index', ErrorTypes.USER_INPUT, 'Vị trí trong danh sách chờ không hợp lệ.');
    }

    const track = player.queue[fromIndex];
    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Di Chuyển', `Đã di chuyển **${track.info?.title || 'bài hát'}** đến vị trí #${to}.`);
}

export async function clearQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotError('Empty queue', ErrorTypes.USER_INPUT, 'Danh sách chờ đã trống rồi.');
    }
    assertCanControl(interaction.member, player);
    player.queue.clear();
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Đã Xóa Danh Sách Chờ', 'Toàn bộ bài hát trong danh sách chờ đã được xóa.');
}

export async function setTwentyFourSeven(client, interaction, enabled) {
    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.twentyFourSeven = enabled;
    return successEmbed(
        'Chế Độ 24/7',
        enabled
            ? 'Đã bật chế độ 24/7. Bot sẽ ở lại kênh thoại khi danh sách chờ kết thúc.'
            : 'Đã tắt chế độ 24/7. Bot sẽ rời đi sau 30 giây không hoạt động.',
    );
}

export function buildNowPlayingReply(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Hiện không có gì đang phát.');
    }
    const guildData = getGuildMusicData(guildId);
    return {
        embeds: [buildNowPlayingEmbed(player.current, player, guildData)],
    };
}

export function buildQueueReply(client, guildId, page = 0) {
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Không có trình phát nhạc nào đang hoạt động.');
    }

    const totalPages = Math.max(1, Math.ceil((player.queue?.length || 0) / getQueuePageSize()));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);

    return {
        embeds: [buildQueueEmbed(player.queue, player.current, safePage)],
        components: totalPages > 1 ? [buildQueuePaginationRow(safePage, totalPages)] : [],
        page: safePage,
        totalPages,
    };
}

export async function destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect = false } = {}) {
    clearUpdateInterval(guildData);
    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    guildData.previousTracks = [];
    guildData.stopConfirmPending = null;
    guildData.autoPaused = false;
    guildData.queuePages?.clear();

    if (guildData.playerMessageId && guildData.playerChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                const msg = await channel.messages.fetch(guildData.playerMessageId);
                await msg.delete();
            }
        } catch {
            // message already deleted
        }
    }

    guildData.playerMessageId = null;
    guildData.playerChannelId = null;

    if (player) {
        player.queue.clear();
        player.stop();
        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }
}

export async function leaveVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);

    const guildId = interaction.guild.id;
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'Tôi không ở trong kênh thoại.');
    }
    assertCanControl(interaction.member, player);

    const channel = interaction.guild.channels.cache.get(player.voiceChannel);
    const channelName = channel?.name || 'voice channel';
    const guildData = getGuildMusicData(guildId);

    await destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect: true });

    return successEmbed('Đã Rời Kênh Thoại', `Đã ngắt kết nối khỏi **${channelName}**.`);
}

export async function replyMusicSuccess(interaction, embed) {
    if (interaction.deferred || interaction.replied) {
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}
