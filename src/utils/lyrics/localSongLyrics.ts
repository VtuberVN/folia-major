import type { ActiveLocalLyricsSource, LocalLyricsPriority, LocalSong, LyricData } from '../../types';
import { LyricParserFactory } from './LyricParserFactory';

// src/utils/lyrics/localSongLyrics.ts
// Resolves the lyric payload and its actual source from one local-song snapshot.

export type ResolvedLocalSongLyrics = {
    lyrics: LyricData | null;
    source: ActiveLocalLyricsSource | null;
};

export const selectLocalSongLyricsSource = (
    song: LocalSong,
    priority: LocalLyricsPriority,
): ActiveLocalLyricsSource | null => {
    if (song.lyricsSource) {
        if (song.lyricsSource === 'online' && (song.matchedLyrics || song.matchedIsPureMusic)) return 'online';
        if (song.lyricsSource === 'local' && song.localLyricsContent) return 'local';
        if (song.lyricsSource === 'embedded' && song.embeddedLyricsContent) return 'embedded';
        return null;
    }

    // 用户标记的纯音乐：没有显式选本地 / 内嵌时一律按纯音乐（空歌词），「不使用在线数据」等把来源清回自动也不例外。
    if (song.markedPureMusic) return 'online';
    if (priority === 'online' && song.matchedLyrics) return 'online';
    if (song.hasLocalLyrics && song.localLyricsContent) return 'local';
    if (song.hasEmbeddedLyrics && song.embeddedLyricsContent) return 'embedded';
    if (song.matchedLyrics) return 'online';
    return null;
};

/** Parses the payload selected by the explicit source or current automatic priority. */
export const resolveLocalSongLyrics = async (
    song: LocalSong,
    priority: LocalLyricsPriority,
): Promise<ResolvedLocalSongLyrics> => {
    const source = selectLocalSongLyricsSource(song, priority);
    if (source === 'online') {
        return { lyrics: song.matchedLyrics ?? null, source };
    }
    if (source === 'local') {
        const lyrics = await LyricParserFactory.parse({
            type: 'local',
            lrcContent: song.localLyricsContent!,
            tLrcContent: song.localTranslationLyricsContent,
            formatHint: song.localLyricsFormat,
        });
        return { lyrics, source };
    }
    if (source === 'embedded') {
        const lyrics = await LyricParserFactory.parse({
            type: 'embedded',
            textContent: song.embeddedLyricsContent!,
            translationContent: song.embeddedTranslationLyricsContent,
        });
        return { lyrics, source };
    }

    // Fallback: check if local song has cached AI Karaoke lyrics from disk
    if (typeof window !== 'undefined' && window.electron?.aiKaraoke?.getCachedResult) {
        try {
            const cached = await window.electron.aiKaraoke.getCachedResult(String(song.id));
            const lrcText = cached?.enhancedLrcText || cached?.lrcText;
            if (lrcText && lrcText.trim().length > 0) {
                const { parseLyricsByFormat } = await import('./parserCore');
                const { detectTimedLyricFormat } = await import('./formatDetection');
                const format = detectTimedLyricFormat(lrcText);
                const parsed = parseLyricsByFormat(format, lrcText);
                if (parsed && parsed.lines && parsed.lines.length > 0) {
                    return { lyrics: parsed, source: 'local' };
                }
            }
        } catch {
            // Best effort
        }
    }

    return { lyrics: null, source: null };
};
