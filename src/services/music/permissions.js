export const VOICE_CHANNEL_DENIAL =
    'Bạn cần ở trong cùng kênh thoại với bot để sử dụng điều khiển nhạc.';

export function canControlMusic(member, player) {
    const memberChannel = member?.voice?.channel;
    if (!memberChannel || !player?.voiceChannel) {
        return false;
    }
    return memberChannel.id === player.voiceChannel;
}

export function requireVoiceChannel(member) {
    return Boolean(member?.voice?.channel);
}
