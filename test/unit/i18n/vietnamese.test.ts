import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../../src/i18n/locales/en';
import vietnamese from '../../../src/i18n/locales/vi';

// test/unit/i18n/vietnamese.test.ts
// Guards Vietnamese resource coverage, interpolation, and persistent language selection.
function flatten(value: unknown, prefix = ''): Record<string, string> {
    if (typeof value === 'string') return { [prefix]: value };
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
        Object.entries(flatten(child, prefix ? `${prefix}.${key}` : key))));
}

const english = flatten(en);
const translated = flatten(vietnamese);
const placeholders = (text: string) => [...text.matchAll(/\{\{[^}]+\}\}/g)].map(match => match[0]).sort();

describe('Vietnamese resources', () => {
    it('covers every English key without blank translations', () => {
        expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
        for (const [key, source] of Object.entries(english)) {
            if (source.trim()) expect(translated[key]?.trim(), key).toBeTruthy();
        }
    });

    it('preserves interpolation tokens in every translated string', () => {
        for (const [key, source] of Object.entries(english)) {
            expect(placeholders(translated[key]), key).toEqual(placeholders(source));
        }
    });

    it('translates the player and exposes the native language name', () => {
        expect(vietnamese.player.play).toBe('Phát');
        expect(vietnamese.options.appLanguageViVN).toBe('Tiếng Việt');
        expect(vietnamese.commandPalette.commands['settings-language-vi'].title).toBe('Chuyển sang tiếng Việt');
    });
});

describe('Vietnamese language preference', () => {
    afterEach(() => { vitest.unstubAllGlobals(); vitest.resetModules(); });

    it('persists manual selection, updates HTML language, and synchronizes Electron', async () => {
        const values = new Map<string, string>();
        const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
        const setAppLocale = vitest.fn().mockResolvedValue('vi');
        vitest.stubGlobal('localStorage', storage);
        vitest.stubGlobal('window', { localStorage: storage, electron: { setAppLocale } });
        vitest.stubGlobal('document', { documentElement: { lang: 'en' } });
        vitest.stubGlobal('navigator', { language: 'vi-VN', languages: ['vi-VN'] });
        const config = await import('../../../src/i18n/config');
        expect(await config.applyAppLanguagePreference('vi')).toBe('vi');
        expect(values.get(config.APP_LANGUAGE_STORAGE_KEY)).toBe('vi');
        expect(config.readStoredAppLanguagePreference()).toBe('vi');
        expect(document.documentElement.lang).toBe('vi');
        expect(setAppLocale).toHaveBeenCalledWith('vi');
        expect(config.default.t('player.play')).toBe('Phát');
        expect(await config.applyAppLanguagePreference('system')).toBe('vi');
        expect(values.get(config.APP_LANGUAGE_STORAGE_KEY)).toBe('system');
    });
});
