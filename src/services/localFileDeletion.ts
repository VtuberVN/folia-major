// src/services/localFileDeletion.ts
// Deletes a song's local copy from disk: the downloaded file (via the download index), an absolute
// local-library path, and/or the media-cache entry. Used when removing a song from a playlist and
// the listener asked to delete the local file too.

import { getLocalSongs } from './db';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { isLocalPlaybackSong } from '../utils/appPlaybackGuards';
import type { SongResult } from '../types';

const isAbsoluteWindowsPath = (value: string): boolean =>
    /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

/** Resolves a local library song's absolute file path, or null when it only has a folder handle. */
const resolveLocalAbsolutePath = async (song: SongResult): Promise<string | null> => {
    const songId = (song as SongResult & { localRef?: { songId?: string } }).localRef?.songId;
    if (!songId) return null;
    try {
        const songs = await getLocalSongs();
        const record = songs.find((candidate) => candidate.id === songId);
        const path = record?.filePath;
        return path && isAbsoluteWindowsPath(path) ? path : null;
    } catch {
        return null;
    }
};

export const deleteLocalAudioForSong = async (song: SongResult): Promise<void> => {
    const bridge = window.electron?.download;
    if (!bridge?.deleteLocalAudio) return;

    const songId = String(song.id);
    const isLocal = isLocalPlaybackSong(song);

    let cacheKey: string | undefined;
    if (!isLocal) {
        try {
            cacheKey = getSongResourceCacheKey('audio', song);
        } catch {
            cacheKey = undefined;
        }
    }

    const filePath = isLocal ? await resolveLocalAbsolutePath(song) : null;

    try {
        const result = await bridge.deleteLocalAudio({
            songId,
            ...(cacheKey ? { cacheKey } : {}),
            ...(filePath ? { filePath } : {}),
        });
        // A local library song whose file is gone must also leave the library, or it lingers as a
        // broken entry pointing at a missing file.
        if (isLocal && filePath && result?.removed?.includes(filePath)) {
            const localSongId = (song as SongResult & { localRef?: { songId?: string } }).localRef?.songId;
            if (localSongId) {
                try {
                    const { deleteLocalSong } = await import('./localMusicService');
                    await deleteLocalSong(localSongId);
                } catch {
                    // Best effort.
                }
            }
        }
    } catch {
        // Best effort; a failure to delete must not block the playlist removal.
    }
};

export const deleteLocalAudioForSongs = async (songs: SongResult[]): Promise<void> => {
    await Promise.all(songs.map((song) => deleteLocalAudioForSong(song)));
};
