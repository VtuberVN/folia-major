import { describe, expect, it } from 'vitest';
import { getSpotifyLocalStatusClass } from '../../../src/components/modal/settings/SpotifyLocalSettingsCard';

// test/unit/settings/spotifyLocalSettingsCard.test.ts
// Keeps Spotify Local status tones readable in both settings themes.

const sharedClasses = {
    errorBgColor: 'error-bg',
    errorTextColor: 'error-text',
    successBgColor: 'success-bg',
    successTextColor: 'success-text',
};

describe('Spotify Local settings status tones', () => {
    it('reuses the settings semantic classes for connected and error states', () => {
        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'connected',
            isDaylight: true,
        })).toContain('success-bg success-text');

        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'error',
            isDaylight: false,
        })).toContain('error-bg error-text');
    });

    it('uses contrasting amber text for each theme while connecting', () => {
        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'connecting',
            isDaylight: true,
        })).toContain('text-amber-700');

        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'connecting',
            isDaylight: false,
        })).toContain('text-amber-200');
    });

    it('keeps the disabled badge visible in both themes', () => {
        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'disabled',
            isDaylight: true,
        })).toContain('text-zinc-600');

        expect(getSpotifyLocalStatusClass({
            ...sharedClasses,
            connectionStatus: 'disabled',
            isDaylight: false,
        })).toContain('text-zinc-300');
    });
});
