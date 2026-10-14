import type { SongResult } from '../../types';
import type { MediaId, OnlineMutationProvider, ProviderCollection } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { requestQqSongDetail } from './qqSongDetail';
import { hasQqSession, requestQq } from './qqTransport';

// src/services/onlineMusic/qqMutations.ts
// QQ 音乐的写入：往自建歌单加歌删歌、收藏歌单，以及查询收藏状态（qq-music-api 3.3.0）。
// 写入只送一次、不自动重试；后端回错误时结果可能已经生效，交给调用方重新读歌单确认，这里不重发。

// 后端只接受目录号 1–199、没有系统类型标记的自建歌单；「我喜欢」是 201，另有红心接口（尚未开放）。
const QQ_MAX_NORMAL_DIR_ID = 199;
// 一次写入最多 100 首。
const QQ_TRACKS_PER_WRITE = 100;

const positiveInteger = (value: unknown): number | null => {
    const number = typeof value === 'string' && /^\d{1,15}$/.test(value.trim()) ? Number(value) : value;
    return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null;
};

const playlistTid = (playlist: MediaId | ProviderCollection): number | null => (
    typeof playlist === 'object'
        ? positiveInteger(playlist.providerData?.tid ?? playlist.id)
        : positiveInteger(playlist)
);

/** 能不能往这个歌单里加歌删歌：本人的、普通目录、带得出 tid 的歌单。收藏的、「我喜欢」和系统目录都不行。 */
export const canEditQqPlaylistTracks = (playlist: ProviderCollection): boolean => {
    if (playlist.providerId !== 'qq' || playlist.type !== 'playlist' || playlist.isLiked) return false;
    const data = playlist.providerData;
    if (data?.owned !== true) return false;
    const dirId = Number(data.dirId);
    // 与后端同一条判定：没有类型标记，或标记正好是数字 0。
    const dirType = data.dirType;
    return Number.isInteger(dirId) && dirId >= 1 && dirId <= QQ_MAX_NORMAL_DIR_ID
        && (dirType === undefined || dirType === 0)
        // 只认上游给的 tid：没有 tid 的自建条目正规化时 id 会退成 dirId，拿它去写只会被后端拒收。
        && positiveInteger(data.tid) !== null;
};

const qqSongMidOf = (song: MediaId | SongResult): string => {
    if (typeof song !== 'object') return '';
    const sourceRef = song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'qq' ? song.sourceRef : undefined;
    return String(song.qqMid || sourceRef?.providerData?.songMid || sourceRef?.mediaId || '').trim();
};

/**
 * 写入要的是数字歌曲 id（songId），歌单与曲库里的歌正规化时都存了它。只有 songmid 的歌（老缓存、个别搜索结果）
 * 补查一次歌曲详情取回 id；仍拿不到就报错，不拿 songmid 去猜。
 */
const resolveQqSongId = async (song: MediaId | SongResult): Promise<number> => {
    if (typeof song !== 'object') {
        const id = positiveInteger(song);
        if (id !== null) return id;
    } else {
        const sourceRef = song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'qq' ? song.sourceRef : undefined;
        const id = positiveInteger(sourceRef?.providerData?.songId) ?? positiveInteger(song.id);
        if (id !== null) return id;
        const songMid = qqSongMidOf(song);
        const detail = songMid ? await requestQqSongDetail(songMid) : null;
        const detailId = detail ? positiveInteger(detail.id) : null;
        if (detailId !== null) return detailId;
    }
    throw new OnlineProviderError('invalid-response', 'QQ song has no numeric song id for a playlist write', 'qq');
};

const updatePlaylistTracks: NonNullable<OnlineMutationProvider['updatePlaylistTracks']> = async (operation, playlist, tracks) => {
    if (typeof playlist === 'object' && !canEditQqPlaylistTracks(playlist)) {
        throw new OnlineProviderError('unsupported', 'QQ playlist does not accept track mutations', 'qq');
    }
    const tid = playlistTid(playlist);
    if (tid === null) throw new OnlineProviderError('invalid-response', 'QQ playlist has no tid', 'qq');
    if (tracks.length === 0) return;

    // `type: 0` 是调用方明确确认的普通曲库歌曲；Folia 里能加进歌单的 QQ 歌都来自曲库，不沿用读取条目里的 type。
    const songIds = [...new Set(await Promise.all(tracks.map(resolveQqSongId)))];
    for (let start = 0; start < songIds.length; start += QQ_TRACKS_PER_WRITE) {
        const songs = songIds.slice(start, start + QQ_TRACKS_PER_WRITE).map(id => ({ id, type: 0 }));
        const response = await requestQq<any>('user_playlist_tracks', {}, { tid: String(tid), op: operation, songs });
        // changed:false 是上游明说这次没有改动，原因后端也分不出来（可能歌已经在 / 不在歌单里）。不当成功，
        // 免得界面说「已更新」或把没删掉的歌从列表里拿掉。
        if (response?.changed !== true) {
            throw new OnlineProviderError(
                'invalid-response',
                `QQMusicApi user_playlist_tracks reported no change (${operation})`,
                'qq',
                response,
            );
        }
    }
};

const subscribePlaylist: NonNullable<OnlineMutationProvider['subscribePlaylist']> = async (playlist, subscribed) => {
    const tid = playlistTid(playlist);
    if (tid === null) throw new OnlineProviderError('invalid-response', 'QQ playlist has no tid', 'qq');
    const response = await requestQq<any>('user_playlist_subscribe', {}, { tid: String(tid), subscribed });
    if (response?.subscribed !== subscribed) {
        throw new OnlineProviderError('invalid-response', 'QQMusicApi user_playlist_subscribe returned no confirmation', 'qq', response);
    }
};

/**
 * 查收藏状态。没登录就是没收藏；后端明确回 `unknown` 时报错而不是回 false：查不出来就别报一个结论，
 * 收藏按钮的状态留空（界面按未收藏显示，点了只会去收藏，不会误取消）。
 */
export const getQqSubscriptionStatus = async (type: 'playlist' | 'album', id: MediaId): Promise<boolean> => {
    if (!hasQqSession()) return false;
    const key = type === 'playlist' ? positiveInteger(id) : String(id ?? '').trim();
    if (key === null || key === '') return false;
    const response = await requestQq<any>('user_subscription_status', { type, ids: String(key) });
    const items = Array.isArray(response?.items) ? response.items : [];
    const status = items.find((item: any) => String(item?.id) === String(key))?.status;
    if (status === 'subscribed') return true;
    if (status === 'not-subscribed') return false;
    throw new OnlineProviderError('invalid-response', `QQ subscription status is ${String(status ?? 'missing')}`, 'qq', response);
};

export const qqMutations: OnlineMutationProvider = {
    canAddToPlaylist: canEditQqPlaylistTracks,
    canEditPlaylistTracks: canEditQqPlaylistTracks,
    updatePlaylistTracks,
    subscribePlaylist,
};
