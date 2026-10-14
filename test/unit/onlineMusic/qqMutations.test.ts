import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/onlineMusic/qqMutations.test.ts
// 写入路由的入参与回应取自 qq-music-api 3.3.0 的使用文档（「普通歌单增删歌曲」「收藏与查询收藏状态」）。

const requestMock = vi.hoisted(() => vi.fn());
const transportState = vi.hoisted(() => ({ hasSession: true }));

vi.mock('@/services/onlineMusic/qqTransport', () => ({
    hasQqSession: () => transportState.hasSession,
    requestQq: requestMock,
}));

import { canEditQqPlaylistTracks, getQqSubscriptionStatus, qqMutations } from '@/services/onlineMusic/qqMutations';
import { normalizeQqCollection, normalizeQqSong } from '@/services/onlineMusic/qqNormalize';
import type { ProviderCollection } from '@/types/onlineMusic';

// GetPlaylistByUin 的自建条目带 dirName（据此判为自建）；收藏条目是另一套字段。
const owned = (dirId: number, extra: Record<string, unknown> = {}) => normalizeQqCollection({ tid: 70001, dirId, dirName: '自建', songNum: 3, ...extra });
const favourite = normalizeQqCollection({ tid: 80001, dirId: 36, name: '收藏的歌单', songnum: 9, orderTime: 1 });

const song = (mid: string, id?: number) => normalizeQqSong({ mid, ...(id === undefined ? {} : { id }), name: mid, singer: [], album: {} });

describe('QQ playlist mutations', () => {
    beforeEach(() => {
        requestMock.mockReset();
        transportState.hasSession = true;
    });

    it('edits only the account\'s own ordinary playlists', () => {
        expect(canEditQqPlaylistTracks(owned(5))).toBe(true);
        expect(canEditQqPlaylistTracks(owned(5, { dirType: 0 }))).toBe(true);
        // 「我喜欢」是 201，要走红心接口（后端尚未开放）；系统目录与带类型标记的目录后端一律拒绝。
        expect(canEditQqPlaylistTracks(owned(201))).toBe(false);
        expect(canEditQqPlaylistTracks(owned(205))).toBe(false);
        expect(canEditQqPlaylistTracks(owned(5, { dirType: 2 }))).toBe(false);
        expect(canEditQqPlaylistTracks(favourite)).toBe(false);
        // 没有 tid 的自建条目 id 会退成 dirId，不能拿它当 tid 去写。
        expect(canEditQqPlaylistTracks(normalizeQqCollection({ dirId: 5, dirName: '没有 tid' }))).toBe(false);
        expect(canEditQqPlaylistTracks({ ...owned(5), providerId: 'netease' })).toBe(false);
        // 缓存回灌后仍认得出来。
        expect(canEditQqPlaylistTracks(normalizeQqCollection(owned(5)))).toBe(true);
    });

    it('marks own playlists as owned so the collection view offers editing instead of subscribing', () => {
        expect(owned(5).isOwned).toBe(true);
        expect(favourite.isOwned).toBeUndefined();
    });

    it('adds catalogue songs by numeric id, typed as ordinary songs, without repeating one', async () => {
        requestMock.mockResolvedValueOnce({ code: 200, changed: true });

        await qqMutations.updatePlaylistTracks!('add', owned(5), [song('mid-a', 101), song('mid-b', 102), song('mid-a', 101)]);

        expect(requestMock).toHaveBeenCalledWith('user_playlist_tracks', {}, {
            tid: '70001',
            op: 'add',
            songs: [{ id: 101, type: 0 }, { id: 102, type: 0 }],
        });
    });

    it('looks up the numeric id of a song that only carries its songmid', async () => {
        requestMock
            .mockResolvedValueOnce({ response: { songinfo: { data: { track_info: { mid: 'mid-only', id: 303, name: 'x', singer: [], album: {} } } } } })
            .mockResolvedValueOnce({ code: 200, changed: true });

        await qqMutations.updatePlaylistTracks!('del', owned(5), [song('mid-only')]);

        expect(requestMock).toHaveBeenNthCalledWith(1, 'song_info', { songmid: 'mid-only' });
        expect(requestMock).toHaveBeenNthCalledWith(2, 'user_playlist_tracks', {}, { tid: '70001', op: 'del', songs: [{ id: 303, type: 0 }] });
    });

    it('writes at most 100 songs at a time', async () => {
        requestMock.mockResolvedValue({ code: 200, changed: true });
        const tracks = Array.from({ length: 150 }, (_, index) => song(`mid-${index}`, index + 1));

        await qqMutations.updatePlaylistTracks!('add', owned(5), tracks);

        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(requestMock.mock.calls.map(call => (call[2] as { songs: unknown[] }).songs.length)).toEqual([100, 50]);
    });

    // changed:false 是上游明说没有改动，原因后端也分不出来：不能让界面说「已更新」，也不能把没删掉的歌从列表拿掉。
    it('refuses to report success when upstream says nothing changed', async () => {
        requestMock.mockResolvedValueOnce({ code: 200, changed: false });
        await expect(qqMutations.updatePlaylistTracks!('add', owned(5), [song('mid-a', 101)]))
            .rejects.toMatchObject({ code: 'invalid-response' });
    });

    it('never writes to a playlist it cannot edit', async () => {
        await expect(qqMutations.updatePlaylistTracks!('add', favourite, [song('mid-a', 101)]))
            .rejects.toMatchObject({ code: 'unsupported' });
        await expect(qqMutations.updatePlaylistTracks!('add', owned(201), [song('mid-a', 101)]))
            .rejects.toMatchObject({ code: 'unsupported' });
        expect(requestMock).not.toHaveBeenCalled();
    });

    it('subscribes and unsubscribes a playlist by tid and checks the confirmation', async () => {
        const recommended: ProviderCollection = normalizeQqCollection({ tid: 90001, title: '推荐' });
        requestMock.mockResolvedValueOnce({ code: 200, subscribed: true }).mockResolvedValueOnce({ code: 200 });

        await qqMutations.subscribePlaylist!(recommended, true);
        await expect(qqMutations.subscribePlaylist!(recommended, false)).rejects.toMatchObject({ code: 'invalid-response' });

        expect(requestMock).toHaveBeenNthCalledWith(1, 'user_playlist_subscribe', {}, { tid: '90001', subscribed: true });
        expect(requestMock).toHaveBeenNthCalledWith(2, 'user_playlist_subscribe', {}, { tid: '90001', subscribed: false });
    });
});

describe('QQ subscription status', () => {
    beforeEach(() => {
        requestMock.mockReset();
        transportState.hasSession = true;
    });

    it('reads subscribed and not-subscribed for the one id it asked about', async () => {
        requestMock
            .mockResolvedValueOnce({ code: 200, type: 'playlist', items: [{ id: '90001', status: 'subscribed' }] })
            .mockResolvedValueOnce({ code: 200, type: 'album', items: [{ id: 'album-mid', status: 'not-subscribed' }] });

        await expect(getQqSubscriptionStatus('playlist', 90001)).resolves.toBe(true);
        await expect(getQqSubscriptionStatus('album', 'album-mid')).resolves.toBe(false);
        expect(requestMock).toHaveBeenNthCalledWith(1, 'user_subscription_status', { type: 'playlist', ids: '90001' });
    });

    // unknown 是「查不出来」，不给结论：收藏按钮状态留空，不把它说成任何一边。
    it('fails instead of guessing when the backend cannot tell', async () => {
        requestMock.mockResolvedValueOnce({ code: 200, type: 'playlist', items: [{ id: '90001', status: 'unknown' }] });
        await expect(getQqSubscriptionStatus('playlist', 90001)).rejects.toMatchObject({ code: 'invalid-response' });
    });

    it('answers not subscribed without asking when signed out or the id is not a playlist id', async () => {
        transportState.hasSession = false;
        await expect(getQqSubscriptionStatus('playlist', 90001)).resolves.toBe(false);
        transportState.hasSession = true;
        await expect(getQqSubscriptionStatus('playlist', 'not-a-tid')).resolves.toBe(false);
        expect(requestMock).not.toHaveBeenCalled();
    });
});
