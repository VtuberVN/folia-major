// src/services/songDownloadService.ts
// Downloads the songs of a playlist/album to files on disk.
//
// Online and Navidrome tracks are streamed by the main process straight to the Downloads/Folia
// folder; local files (already on disk) are copied. The renderer only resolves the playable URL -
// which needs the signed-in provider credentials - and hands it to the main process, so the actual
// transfer and progress happen off the UI thread.

import { getLocalSongs } from './db';
import { omni } from './onlineMusic/omni';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { toSafePlaybackUrl } from '../utils/appPlaybackHelpers';
import { sanitizeDownloadFileName } from '../utils/downloadFileName';
import { useDownloadStore, setDownloadsVisible, type DownloadItem } from '../stores/useDownloadStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import type { AudioQualityPreference } from '../types/onlineMusic';
import type { SongResult } from '../types';

const DOWNLOAD_CONCURRENCY = 2;

const mimeForExtension = (extension: string): string => {
    switch (extension.toLowerCase()) {
        case '.flac': return 'audio/flac';
        case '.wav': return 'audio/wav';
        case '.m4a':
        case '.mp4': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        default: return 'audio/mpeg';
    }
};

const isAbsoluteWindowsPath = (value: string): boolean =>
    /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

const songLabel = (song: SongResult): string => {
    const artists = (song.artists || []).map((artist) => artist?.name).filter(Boolean).join(', ');
    return artists ? `${artists} - ${song.name}` : song.name;
};

const extensionFromPath = (value: string | undefined | null): string => {
    if (!value) return '';
    try {
        const pathname = /^https?:\/\//i.test(value) ? new URL(value).pathname : value;
        const match = /\.([a-z0-9]{2,5})$/i.exec(pathname);
        return match ? `.${match[1].toLowerCase()}` : '';
    } catch {
        return '';
    }
};

const resolveLocalFilePath = async (song: SongResult): Promise<string | null> => {
    const songId = (song as SongResult & { localRef?: { songId?: string } }).localRef?.songId;
    if (!songId) return null;
    const songs = await getLocalSongs();
    const record = songs.find((candidate) => candidate.id === songId);
    return record?.filePath ?? null;
};

type ResolvedDownload = {
    url?: string;
    sourcePath?: string;
    fileName: string;
};

const resolveDownload = async (
    song: SongResult,
    quality: AudioQualityPreference,
): Promise<ResolvedDownload | null> => {
    if (isLocalPlaybackSong(song)) {
        const filePath = await resolveLocalFilePath(song);
        if (filePath && isAbsoluteWindowsPath(filePath)) {
            const ext = extensionFromPath(filePath) || '.flac';
            return { sourcePath: filePath, fileName: sanitizeDownloadFileName(`${songLabel(song)}${ext}`) };
        }
        // A folder-granted local file has no OS path; it is already stored by the app.
        return null;
    }

    if (isNavidromePlaybackSong(song)) {
        const streamUrl = (song as SongResult & { navidromeData?: { streamUrl?: string } }).navidromeData?.streamUrl;
        if (!streamUrl) return null;
        const ext = extensionFromPath(streamUrl) || '.mp3';
        return { url: toSafePlaybackUrl(streamUrl) || streamUrl, fileName: sanitizeDownloadFileName(`${songLabel(song)}${ext}`) };
    }

    const source = await omni.getAudioSource(song, quality);
    if (!source?.url) return null;
    const url = toSafePlaybackUrl(source.url) || source.url;
    const ext = extensionFromPath(source.url) || (url.includes('flac') ? '.flac' : '.mp3');
    return { url, fileName: sanitizeDownloadFileName(`${songLabel(song)}${ext}`) };
};

let bridgeReady = false;

/** Ids the listener paused; the worker checks this so it never starts a paused job. */
const pausedIds = new Set<string>();

/**
 * Persists the songs that are not done yet, so the download window can offer to continue them after
 * the app is restarted. Done songs are dropped (their files are on disk and indexed by the main
 * process); queued/error/canceled songs keep their payload so they can be re-resolved and retried.
 */
export const persistDownloadQueue = (): void => {
    const bridge = window.electron?.download;
    if (!bridge?.saveQueue) return;
    const queue = useDownloadStore.getState().items
        .filter((item) => item.status !== 'done' && item.song)
        .map((item) => ({
            id: item.id,
            songId: item.songId,
            name: item.name,
            status: item.status,
            error: item.error,
            path: item.path,
            fileName: item.fileName,
            song: item.song,
            quality: item.quality,
        }));
    void bridge.saveQueue(queue);
};

const ensureProgressBridge = () => {
    if (bridgeReady) return;
    const bridge = window.electron?.download;
    if (!bridge?.onProgress) return;
    bridgeReady = true;
    bridge.onProgress((progress) => {
        useDownloadStore.getState().patchItem(progress.id, {
            status: progress.status === 'downloading' ? 'downloading' : progress.status,
            received: progress.received,
            total: progress.total,
            ...(progress.name ? { name: progress.name } : {}),
            ...(progress.error ? { error: progress.error } : {}),
            ...(progress.path ? { path: progress.path } : {}),
        });
        if (progress.status === 'done' || progress.status === 'error' || progress.status === 'canceled' || progress.status === 'paused') {
            persistDownloadQueue();
        }
    });
};

const makeId = (index: number): string =>
    `dl-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;

type DownloadJob = {
    id: string;
    song: SongResult;
    quality: AudioQualityPreference;
};

/**
 * Runs the given jobs: skips songs already on disk, resolves playable sources sequentially
 * (providers rate-limit URL lookups) and transfers files with a small concurrency limit. The queue
 * is persisted as it progresses so an interrupted run can be continued later.
 */
const runDownloadJobs = async (jobs: DownloadJob[]): Promise<void> => {
    const bridge = window.electron?.download;
    if (!bridge || jobs.length === 0) return;
    ensureProgressBridge();
    setDownloadsVisible(true);

    const store = useDownloadStore.getState();
    // Running these jobs means they are no longer paused.
    for (const job of jobs) pausedIds.delete(job.id);
    store.upsertItems(jobs.map(({ id, song, quality }): DownloadItem => ({
        id,
        songId: String(song.id),
        name: song.name,
        status: 'queued',
        received: 0,
        total: 0,
        song,
        quality,
    })));
    // Reset any previous terminal state on these items back to an active one.
    for (const job of jobs) {
        useDownloadStore.getState().patchItem(job.id, {
            status: 'resolving',
            error: undefined,
            received: 0,
            total: 0,
        });
    }
    persistDownloadQueue();

    // Ask the main process what already exists so their URLs are never resolved (and the files are
    // never written twice) when a whole playlist is downloaded again.
    let downloaded: Record<string, { path: string; name: string } | null> = {};
    try {
        downloaded = (await bridge.checkDownloaded?.(jobs.map((job) => String(job.song.id)))) ?? {};
    } catch {
        downloaded = {};
    }

    const ready: Array<{ id: string; song: SongResult; resolved: ResolvedDownload }> = [];
    for (const job of jobs) {
        const existing = downloaded[String(job.song.id)];
        if (existing) {
            useDownloadStore.getState().patchItem(job.id, {
                status: 'done',
                path: existing.path,
                name: existing.name,
            });
            continue;
        }
        try {
            const resolved = await resolveDownload(job.song, job.quality);
            if (!resolved) {
                useDownloadStore.getState().patchItem(job.id, {
                    status: 'error',
                    error: 'unavailable',
                });
                continue;
            }
            useDownloadStore.getState().patchItem(job.id, {
                name: resolved.fileName.replace(/\.[a-z0-9]+$/i, ''),
                fileName: resolved.fileName,
                status: 'downloading',
            });
            ready.push({ id: job.id, song: job.song, resolved });
        } catch (error) {
            useDownloadStore.getState().patchItem(job.id, {
                status: 'error',
                error: String((error as Error)?.message || error),
            });
        }
    }
    persistDownloadQueue();

    let cursor = 0;
    const worker = async () => {
        while (cursor < ready.length) {
            const job = ready[cursor];
            cursor += 1;
            // Paused before this worker reached it: leave it for a later resume.
            if (pausedIds.has(job.id)) continue;
            const extension = /\.([a-z0-9]+)$/i.exec(job.resolved.fileName)?.[1] ?? '';
            try {
                const result = await bridge.start({
                    id: job.id,
                    songId: String(job.song.id),
                    url: job.resolved.url,
                    sourcePath: job.resolved.sourcePath,
                    fileName: job.resolved.fileName,
                    // Seed Folia's media cache for online/Navidrome tracks so they can be played
                    // offline and, crucially, fed to the WASAPI exclusive engine from disk.
                    ...(isLocalPlaybackSong(job.song) ? {} : {
                        cacheKey: getSongResourceCacheKey('audio', job.song),
                        mimeType: mimeForExtension(`.${extension}`),
                        limitBytes: useAudioSettingsStore.getState().mediaCacheLimitGb * 1024 * 1024 * 1024,
                    }),
                });
                if (result.paused) {
                    pausedIds.add(job.id);
                    useDownloadStore.getState().patchItem(job.id, { status: 'paused' });
                } else {
                    useDownloadStore.getState().patchItem(job.id, result.ok
                        ? { status: 'done', path: result.path, name: result.name ?? job.resolved.fileName }
                        : { status: result.canceled ? 'canceled' : 'error', error: result.error });
                }
            } catch (error) {
                useDownloadStore.getState().patchItem(job.id, {
                    status: 'error',
                    error: String((error as Error)?.message || error),
                });
            }
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, ready.length) }, () => worker()),
    );
    persistDownloadQueue();
};

/**
 * Downloads the given songs. Songs already downloaded are skipped by the main process, so
 * re-downloading a playlist never rewrites the files it already has.
 */
export const startSongDownloads = async (
    songs: SongResult[],
    quality: AudioQualityPreference,
): Promise<void> => {
    const seen = new Set<string>();
    const jobs: DownloadJob[] = [];
    songs.forEach((song) => {
        const key = String(song.id);
        if (seen.has(key)) return;
        seen.add(key);
        jobs.push({ id: makeId(jobs.length), song, quality });
    });
    if (jobs.length === 0) return;
    await runDownloadJobs(jobs);
};

/** Re-runs the songs left unfinished (paused, queued, errored or canceled) in the download list. */
export const resumeSongDownloads = async (): Promise<void> => {
    const resumable = useDownloadStore.getState().items.filter(
        (item) => item.song && (
            item.status === 'paused'
            || item.status === 'queued'
            || item.status === 'error'
            || item.status === 'canceled'
        ),
    );
    if (resumable.length === 0) return;
    const fallbackQuality = useAudioSettingsStore.getState().audioQuality;
    const jobs: DownloadJob[] = resumable.map((item) => ({
        id: item.id,
        song: item.song as SongResult,
        quality: item.quality ?? fallbackQuality,
    }));
    await runDownloadJobs(jobs);
};

/** Pauses one download; the main process keeps its partial file so a resume continues from there. */
export const pauseSongDownload = async (id: string): Promise<void> => {
    const bridge = window.electron?.download;
    const item = useDownloadStore.getState().items.find((candidate) => candidate.id === id);
    pausedIds.add(id);
    useDownloadStore.getState().patchItem(id, { status: 'paused' });
    persistDownloadQueue();
    if (item?.status === 'downloading' || item?.status === 'resolving') {
        await bridge?.pause?.(id);
    }
};

/** Pauses every unfinished download at once. */
export const pauseAllSongDownloads = async (): Promise<void> => {
    const bridge = window.electron?.download;
    const items = useDownloadStore.getState().items;
    for (const item of items) {
        if (item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading') {
            pausedIds.add(item.id);
            useDownloadStore.getState().patchItem(item.id, { status: 'paused' });
        }
    }
    persistDownloadQueue();
    await bridge?.pauseAll?.();
};

/** Resumes one paused download (its partial file makes this continue from where it stopped). */
export const resumeSongDownload = async (id: string): Promise<void> => {
    const item = useDownloadStore.getState().items.find((candidate) => candidate.id === id);
    if (!item?.song) return;
    const quality = item.quality ?? useAudioSettingsStore.getState().audioQuality;
    await runDownloadJobs([{ id: item.id, song: item.song as SongResult, quality }]);
};

/**
 * Restores the unfinished download queue saved by a previous session and surfaces the window, so
 * the listener can hit "continue" after a restart.
 */
export const initDownloadQueue = async (): Promise<void> => {
    const bridge = window.electron?.download;
    if (!bridge?.getQueue) return;
    ensureProgressBridge();
    let queue: ElectronDownloadQueueEntry[] = [];
    try {
        queue = await bridge.getQueue();
    } catch {
        return;
    }
    if (!Array.isArray(queue) || queue.length === 0) return;
    const items: DownloadItem[] = queue
        .filter((entry) => entry && entry.id && entry.song)
        .map((entry) => ({
            id: String(entry.id),
            songId: String(entry.songId ?? ''),
            name: String(entry.name ?? ''),
            status: 'queued' as const,
            received: 0,
            total: 0,
            error: entry.error,
            path: entry.path,
            fileName: entry.fileName,
            song: entry.song as SongResult,
            quality: entry.quality as AudioQualityPreference | undefined,
        }));
    if (items.length === 0) return;
    useDownloadStore.getState().upsertItems(items);
    setDownloadsVisible(true);
};

export const cancelSongDownload = async (id: string): Promise<void> => {
    pausedIds.delete(id);
    const item = useDownloadStore.getState().items.find((candidate) => candidate.id === id);
    await window.electron?.download?.cancel(id, item?.fileName);
};

export const openDownloadDirectory = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await window.electron?.download?.openDirectory();
    return { ok: Boolean(result?.ok), error: result?.error };
};
