import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useTypographySettingsStore,
    SUBTITLE_ACTIVE_LYRICS_DISPLAY_STORAGE_KEY,
    SUBTITLE_UPCOMING_LYRICS_PREVIEW_STORAGE_KEY,
} from '@/stores/useTypographySettingsStore';

describe('typography subtitle toggles mutual exclusion', () => {
    let values: Map<string, string>;

    beforeEach(() => {
        values = new Map();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });

        useTypographySettingsStore.setState({
            subtitleActiveLyricsDisplay: false,
            subtitleUpcomingLyricsPreview: false,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('enabling active lyrics display automatically disables upcoming preview', () => {
        const store = useTypographySettingsStore.getState();

        // Start with upcoming preview enabled
        store.handleToggleSubtitleUpcomingLyricsPreview(true);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(true);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(false);
        expect(localStorage.getItem(SUBTITLE_UPCOMING_LYRICS_PREVIEW_STORAGE_KEY)).toBe('true');

        // Turn on active lyrics display
        store.handleToggleSubtitleActiveLyricsDisplay(true);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(true);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(false);
        expect(localStorage.getItem(SUBTITLE_ACTIVE_LYRICS_DISPLAY_STORAGE_KEY)).toBe('true');
        expect(localStorage.getItem(SUBTITLE_UPCOMING_LYRICS_PREVIEW_STORAGE_KEY)).toBe('false');
    });

    it('enabling upcoming preview automatically disables active lyrics display', () => {
        const store = useTypographySettingsStore.getState();

        // Start with active lyrics display enabled
        store.handleToggleSubtitleActiveLyricsDisplay(true);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(true);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(false);

        // Turn on upcoming preview
        store.handleToggleSubtitleUpcomingLyricsPreview(true);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(true);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(false);
        expect(localStorage.getItem(SUBTITLE_UPCOMING_LYRICS_PREVIEW_STORAGE_KEY)).toBe('true');
        expect(localStorage.getItem(SUBTITLE_ACTIVE_LYRICS_DISPLAY_STORAGE_KEY)).toBe('false');
    });

    it('can turn off either setting independently without turning on the other', () => {
        const store = useTypographySettingsStore.getState();

        store.handleToggleSubtitleActiveLyricsDisplay(true);
        store.handleToggleSubtitleActiveLyricsDisplay(false);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(false);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(false);

        store.handleToggleSubtitleUpcomingLyricsPreview(true);
        store.handleToggleSubtitleUpcomingLyricsPreview(false);
        expect(useTypographySettingsStore.getState().subtitleActiveLyricsDisplay).toBe(false);
        expect(useTypographySettingsStore.getState().subtitleUpcomingLyricsPreview).toBe(false);
    });
});
