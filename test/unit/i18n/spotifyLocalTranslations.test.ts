import { describe, expect, it } from 'vitest';
import en from '../../../src/i18n/locales/en';
import ind from '../../../src/i18n/locales/in';
import vi from '../../../src/i18n/locales/vi';
import zhCN from '../../../src/i18n/locales/zh-CN';

// test/unit/i18n/spotifyLocalTranslations.test.ts
// Keeps Spotify Web API and Local Stage labels complete across every bundled locale.

const locales = [
    ['en', en],
    ['zh-CN', zhCN],
    ['in', ind],
    ['vi', vi],
] as const;

const optionKeys = [
    'stageSourceLabel',
    'stageSourceSpotifyWebApi',
    'stageSourceSpotifyLocal',
    'spotifyWebApiTitle',
    'spotifyLocalTitle',
    'spotifyLocalDescription',
    'spotifyLocalNoSetup',
    'spotifyLocalBackendDescription',
    'spotifyLocalWaitingTitle',
    'spotifyLocalConnectionError',
] as const;

describe('Spotify Stage source translations', () => {
    it.each(locales)('defines Spotify Local option text in %s', (_language, locale) => {
        const options = locale.options as Record<string, string>;

        for (const key of optionKeys) {
            expect(options[key], `options.${key}`).toBeTruthy();
        }
    });

    it.each(locales)('defines Spotify Local command text in %s', (_language, locale) => {
        const commands = locale.commandPalette.commands as Record<string, { title?: string; description?: string }>;

        expect(commands['settings-spotify-local']?.title).toBeTruthy();
        expect(commands['settings-spotify-local']?.description).toBeTruthy();
    });

    it.each(locales)('keeps the two source labels unambiguous in %s', (_language, locale) => {
        expect(locale.options.stageSourceSpotifyWebApi).toBe('Spotify (Web API)');
        expect(locale.options.stageSourceSpotifyLocal).toBe('Spotify (Local)');
    });
});
