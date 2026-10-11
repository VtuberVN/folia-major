// src/utils/lyrics/searchQuery.ts
// Shared helpers for constructing lyric search queries from song metadata.

import { normalizeLyricMatchText } from './matchScore';

const MAX_ALBUM_QUERY_LENGTH = 48;

const normalizeArtistIdentity = (value: string): string => (
    normalizeLyricMatchText(value).replace(/\s+/gu, '')
);

// Strips karaoke, beat, official video tags and common noise from video/song titles.
export const cleanNoiseKeywordsForLyricSearch = (title: string): string => {
    let result = title;
    // 1. Remove bracketed noise: [Official MV], [Karaoke], [Beat], (Karaoke Beat), etc.
    result = result.replace(/\[(?:official|mv|karaoke|beat|instrumental|audio|video|hd|4k|remix|cover)[^\]]*\]/gi, ' ');
    result = result.replace(/\((?:official|mv|karaoke|beat|instrumental|audio|video|tone\s*(?:nam|nữ|chuẩn)|bản chuẩn|không lời|remix|cover)[^)]*\)/gi, ' ');
    // 2. Remove leading "Karaoke -", "Beat -", "Instrumental -", "Nhạc sống -"
    result = result.replace(/^(?:karaoke|beat|instrumental|nhạc sống)\s*[-–—:]\s*/gi, '');
    // 3. Remove trailing "- Karaoke", "- Beat", "- Tone Nam", etc.
    result = result.replace(/\s*[-–—:]\s*(?:karaoke|beat|instrumental|nhạc sống|tone\s*(?:nam|nữ)).*$/gi, '');
    // 4. Remove common standalone phrases
    result = result.replace(/\b(?:official\s*(?:music\s*video|mv|audio|video)|music\s*video|lyrics?\s*video)\b/gi, ' ');
    return result.replace(/\s+/g, ' ').trim();
};

// Removes a duplicated "artist - title" prefix when the provider already supplies artists separately.
export const normalizeSongTitleForLyricSearch = (
    title?: string | null,
    artist?: string | null,
): string => {
    const rawTitle = title?.trim() || '';
    if (!rawTitle) return '';
    const cleaned = cleanNoiseKeywordsForLyricSearch(rawTitle);
    const candidateTitle = cleaned || rawTitle;

    const trimmedArtist = artist?.trim() || '';
    if (!trimmedArtist) return candidateTitle;

    const separator = candidateTitle.match(/^(.+?)\s+-\s+(.+)$/u);
    if (!separator) return candidateTitle;

    const prefixNorm = normalizeArtistIdentity(separator[1]);
    const artistNorm = normalizeArtistIdentity(trimmedArtist);

    if (prefixNorm === artistNorm || (prefixNorm && artistNorm && (prefixNorm.includes(artistNorm) || artistNorm.includes(prefixNorm)))) {
        return separator[2].trim();
    }

    return candidateTitle;
};

// Keeps long anime/single album names useful for provider search by dropping catalog notes and credits first.
const normalizeAlbumForLyricSearch = (album?: string | null): string | null => {
    const trimmedAlbum = album?.trim();
    if (!trimmedAlbum) {
        return null;
    }

    if (trimmedAlbum.length <= MAX_ALBUM_QUERY_LENGTH) {
        return trimmedAlbum;
    }

    const compactAlbum = trimmedAlbum
        .replace(/\s*※.*$/u, '')
        .replace(/\s*(歌|歌唱|アーティスト|Artist)\s*[:：]?\s*.+$/iu, '')
        .trim();

    if (compactAlbum.length <= MAX_ALBUM_QUERY_LENGTH) {
        return compactAlbum;
    }

    return compactAlbum.slice(0, MAX_ALBUM_QUERY_LENGTH).trim();
};

export const buildLyricSearchQuery = (
    title?: string | null,
    artist?: string | null,
    album?: string | null
): string => {
    return [normalizeSongTitleForLyricSearch(title, artist), artist?.trim(), normalizeAlbumForLyricSearch(album)]
        .map(part => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' - ');
};

export const buildKugouLyricSearchQuery = (keyword: string): string => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
        return trimmedKeyword;
    }

    const structuredTitle = trimmedKeyword.split(/\s+-\s+/u)[0]?.trim();
    return structuredTitle || trimmedKeyword;
};
