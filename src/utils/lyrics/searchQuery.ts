// src/utils/lyrics/searchQuery.ts
// Shared helpers for constructing lyric search queries from song metadata.

import { normalizeLyricMatchText } from './matchScore';

const MAX_ALBUM_QUERY_LENGTH = 48;

const normalizeArtistIdentity = (value: string): string => (
    normalizeLyricMatchText(value).replace(/\s+/gu, '')
);

const VIDEO_NOISE_REGEX = /[\(\[（【〔〈《「『]\s*(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|official|audio|mv|lyrics?|lyric\s*video|full\s*ver(?:sion)?|hd|4k|m\/v|clip\s*officiel)\s*[\)\]）】〕〉》」』]/giu;
const TRAILING_NOISE_REGEX = /\s*[-–—|/]\s*(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|mv|audio)\s*$/giu;
const TRAILING_VIDEO_TAG_REGEX = /\s+(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|mv)\s*$/giu;

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

import { cleanTitleWithRules, parseAndValidateFilterRules } from './titleNoiseFilter';
import { useLyricSettingsStore } from '../../stores/useLyricSettingsStore';

export const cleanTitleNoise = (title: string): string => {
    try {
        const state = useLyricSettingsStore.getState();
        if (state.titleNoiseFilterEnabled === false) {
            return title.trim();
        }
        const { validRules } = parseAndValidateFilterRules(state.titleNoiseFilterCustomKeywords || '');
        return cleanTitleWithRules(title, {
            useDefaultFilter: state.titleNoiseFilterDefaultEnabled !== false,
            customRules: validRules,
        });
    } catch {
        return cleanTitleWithRules(title);
    }
};

// Removes a duplicated "artist - title" prefix when the provider already supplies artists separately,
// and strips video/audio tags commonly found in online/YouTube titles.
export const normalizeSongTitleForLyricSearch = (
    title?: string | null,
    artist?: string | null,
): string => {
    const rawTitle = title?.trim() || '';
    if (!rawTitle) return '';

    let candidate = cleanTitleNoise(rawTitle) || rawTitle;

    const trimmedArtist = artist?.trim() || '';
    if (trimmedArtist) {
        // Check for "Artist「Title」" pattern
        const cornerBracketMatch = candidate.match(/^(.+?)\s*[「『]([^」』]+)[」』]/u);
        if (cornerBracketMatch && normalizeArtistIdentity(cornerBracketMatch[1]) === normalizeArtistIdentity(trimmedArtist)) {
            candidate = cornerBracketMatch[2].trim();
        } else {
            const separator = candidate.match(/^(.+?)\s+-\s+(.+)$/u);
            if (separator) {
                const prefixNorm = normalizeArtistIdentity(separator[1]);
                const artistNorm = normalizeArtistIdentity(trimmedArtist);
                if (prefixNorm === artistNorm || (prefixNorm && artistNorm && (prefixNorm.includes(artistNorm) || artistNorm.includes(prefixNorm)))) {
                    candidate = separator[2].trim();
                }
            }
        }
    }

    const cleaned = cleanTitleNoise(candidate);
    return cleaned || candidate;
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
