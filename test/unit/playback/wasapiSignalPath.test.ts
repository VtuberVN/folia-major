// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useSignalPathStore, publishSignalPath, clearSignalPath } from '../../../src/stores/useSignalPathStore';
import { useWasapiStatusStore, setWasapiMode } from '../../../src/stores/useWasapiStatusStore';
import { useAudioSettingsStore } from '../../../src/stores/useAudioSettingsStore';
import { buildSignalPath } from '../../../src/components/audio/buildSignalPath';

describe('WASAPI Exclusive & Signal Path', () => {
    beforeEach(() => {
        clearSignalPath();
        setWasapiMode('off');
        localStorage.clear();
    });

    describe('useSignalPathStore', () => {
        it('publishes and clears signal path telemetry', () => {
            expect(useSignalPathStore.getState().snapshot).toBeNull();

            publishSignalPath({
                backend: 'wasapi-exclusive',
                deviceId: 'DAC-1',
                sampleRate: 96000,
                channels: 2,
                bitsPerSample: 24,
                sourceCodec: 'FLAC',
                sourceSampleRate: 96000,
                sourceBitsPerSample: 24,
                sourceBitrate: 3000000,
                bitPerfect: true,
                outputFormat: 'PCM 24-bit',
            });

            const snapshot = useSignalPathStore.getState().snapshot;
            expect(snapshot).not.toBeNull();
            expect(snapshot?.backend).toBe('wasapi-exclusive');
            expect(snapshot?.sampleRate).toBe(96000);
            expect(snapshot?.bitPerfect).toBe(true);

            clearSignalPath();
            expect(useSignalPathStore.getState().snapshot).toBeNull();
        });

        it('handles failure codes', () => {
            useSignalPathStore.getState().setFailureCode('DEVICE_IN_USE');
            expect(useSignalPathStore.getState().failureCode).toBe('DEVICE_IN_USE');

            clearSignalPath();
            expect(useSignalPathStore.getState().failureCode).toBeNull();
        });
    });

    describe('buildSignalPath', () => {
        const dummyT = ((key: string, optionsOrFallback?: any) => {
            if (typeof optionsOrFallback === 'string') return optionsOrFallback;
            if (optionsOrFallback && typeof optionsOrFallback === 'object') {
                if (typeof optionsOrFallback.defaultValue === 'string') {
                    let str = optionsOrFallback.defaultValue;
                    for (const [k, v] of Object.entries(optionsOrFallback)) {
                        str = str.replace(`{{${k}}}`, String(v));
                    }
                    return str;
                }
                if (optionsOrFallback.device) {
                    return `WASAPI Exclusive · ${optionsOrFallback.device}`;
                }
            }
            return key;
        }) as any;

        it('builds signal path rows for bit-perfect WASAPI output', () => {
            const state = {
                backend: 'wasapi-exclusive' as const,
                deviceId: 'Topping DX3 Pro+',
                sampleRate: 96000,
                channels: 2,
                bitsPerSample: 24,
                sourceCodec: 'FLAC',
                sourceSampleRate: 96000,
                sourceBitsPerSample: 24,
                sourceBitrate: 2800000,
                bitPerfect: true,
                outputFormat: 'PCM 24-bit (WASAPI Exclusive)',
            };

            const result = buildSignalPath(state, 'wasapi-exclusive', dummyT);
            expect(result.brief).toContain('96 kHz / 24-bit');
            expect(result.rows).toHaveLength(6);

            const sourceRow = result.rows.find(r => r.title === 'Original source resolution');
            expect(sourceRow?.value).toContain('FLAC · 96 kHz · 24-bit');

            const processingRow = result.rows.find(r => r.title === 'Processing');
            expect(processingRow?.value).toContain('Bit-Perfect Direct');

            const conversionRow = result.rows.find(r => r.title === 'Sample-rate conversion');
            expect(conversionRow?.value).toContain('Bit-Perfect Direct');

            const outputRow = result.rows.find(r => r.title === 'Playback engine');
            expect(outputRow?.value).toContain('Topping DX3 Pro+');
        });

        it('builds signal path rows for shared browser output', () => {
            const state = {
                backend: 'browser' as const,
                deviceId: 'System Audio Mixer',
                sampleRate: 44100,
                channels: 2,
                bitsPerSample: 16,
                sourceCodec: 'AAC',
                sourceSampleRate: 44100,
                sourceBitsPerSample: 16,
                bitPerfect: false,
                outputFormat: 'System Audio Mixer (Shared)',
            };

            const result = buildSignalPath(state, 'browser', dummyT);
            expect(result.brief).toContain('44.1 kHz / 16-bit');
            const processingRow = result.rows.find(r => r.title === 'Processing');
            expect(processingRow?.value).toContain('System Audio Mixer (Shared)');
        });
    });

    describe('useWasapiStatusStore', () => {
        it('manages WASAPI mode and detail', () => {
            expect(useWasapiStatusStore.getState().mode).toBe('off');

            setWasapiMode('exclusive', 'DAC USB');
            expect(useWasapiStatusStore.getState().mode).toBe('exclusive');
            expect(useWasapiStatusStore.getState().detail).toBe('DAC USB');

            setWasapiMode('shared');
            expect(useWasapiStatusStore.getState().mode).toBe('shared');
        });
    });

    describe('useAudioSettingsStore WASAPI settings', () => {
        it('toggles WASAPI exclusive and remembers device ID', () => {
            const store = useAudioSettingsStore.getState();
            expect(store.enableWasapiExclusive).toBe(false);

            store.handleToggleWasapiExclusive(true);
            expect(useAudioSettingsStore.getState().enableWasapiExclusive).toBe(true);

            store.handleSetWasapiDeviceId('dac-endpoint-123');
            expect(useAudioSettingsStore.getState().wasapiDeviceId).toBe('dac-endpoint-123');

            store.handleSetShowAudioSignalPath(false);
            expect(useAudioSettingsStore.getState().showAudioSignalPath).toBe(false);

            // Clean up
            store.handleToggleWasapiExclusive(false);
            store.handleSetWasapiDeviceId('');
            store.handleSetShowAudioSignalPath(true);
        });
    });
});
