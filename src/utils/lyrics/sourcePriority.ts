import type { LyricProviderSource } from '../../types';
import { LYRIC_SOURCE_IDS, isLyricProviderSource } from './lyricSources';

// src/utils/lyrics/sourcePriority.ts

export const DEFAULT_PREFERRED_LYRIC_SOURCE: LyricProviderSource = 'qq';

// Places the user preference first while retaining every fallback source exactly once.
export const buildLyricSourceOrder = (
    preferredSource: LyricProviderSource = DEFAULT_PREFERRED_LYRIC_SOURCE,
): LyricProviderSource[] => [
    preferredSource,
    ...LYRIC_SOURCE_IDS.filter(source => source !== preferredSource),
];

export const migratePreferredLyricSource = (
    versionedValue: unknown,
    legacyValue: unknown,
): LyricProviderSource => {
    if (versionedValue !== null && versionedValue !== undefined) {
        return isLyricProviderSource(versionedValue) ? versionedValue : DEFAULT_PREFERRED_LYRIC_SOURCE;
    }
    if (legacyValue === 'amll' || legacyValue === 'qq' || legacyValue === 'kugou' || legacyValue === 'zing' || legacyValue === 'nct') return legacyValue;
    return DEFAULT_PREFERRED_LYRIC_SOURCE;
};
