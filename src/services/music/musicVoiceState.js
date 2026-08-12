import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from './playerStore.js';
import { applyPause, applyResume, getPlayer } from './musicActions.js';

export async function handleMusicVoiceState(client, oldState, newState) {
    if (!client.riffy) {
        return;
    }

    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) {
        return;
    }

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) {
        return;
    }

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && !player.paused && player.playing) {
        guildData.autoPaused = true;
        await applyPause(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Đã Tạm Dừng', 'Kênh thoại trống. Đã tạm dừng nhạc cho đến khi có người vào.')] }).catch(() => null);
            }
        }
        return;
    }

    if (hasUsers && guildData.autoPaused && player.paused) {
        await applyResume(client, guildId);
        guildData.autoPaused = false;
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Đã Tiếp Tục', 'Có người đã vào kênh thoại. Phát nhạc tiếp tục.')] }).catch(() => null);
            }
        }
    }
}
