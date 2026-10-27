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

    describe('exclusiveSeekSignal & exclusiveClock', () => {
        it('tracks user seek flag and supports grace period', async () => {
            const { markUserSeek, clearUserSeek, isUserSeekInProgress } = await import('../../../src/services/exclusiveSeekSignal');
            expect(isUserSeekInProgress()).toBe(false);

            markUserSeek();
            expect(isUserSeekInProgress()).toBe(true);

            // Clearing with grace period retains active state immediately
            clearUserSeek(200);
            expect(isUserSeekInProgress()).toBe(true);

            // Clearing with 0 grace period immediately clears flag
            clearUserSeek(0);
            expect(isUserSeekInProgress()).toBe(false);
        });

        it('interpolates clock and reports running state', async () => {
            const { setExclusiveClock, getExclusiveClockSec, isExclusiveClockRunning, clearExclusiveClock } = await import('../../../src/services/exclusiveClock');
            expect(isExclusiveClockRunning()).toBe(false);

            const baseTime = 120.0;
            const now = 1000;
            setExclusiveClock(baseTime, now);
            expect(isExclusiveClockRunning()).toBe(true);

            // Interpolates 500ms forward
            expect(getExclusiveClockSec(now + 500)).toBeCloseTo(120.5, 2);

            clearExclusiveClock();
            expect(isExclusiveClockRunning()).toBe(false);
            expect(getExclusiveClockSec(now + 1000)).toBe(baseTime);
        });
    });

    describe('Queue Loop Modes (off, all, one)', async () => {
        const { nextQueueIndex, prevQueueIndex } = await import('../../../src/utils/playbackNeighbors');

        it('handles loopMode === off: stops at end of queue', () => {
            const queueLength = 3;
            expect(nextQueueIndex(queueLength, 0, 'off')).toBe(1);
            expect(nextQueueIndex(queueLength, 1, 'off')).toBe(2);
            expect(nextQueueIndex(queueLength, 2, 'off')).toBe(-1); // stop at queue end
        });

        it('handles loopMode === all: wraps back to index 0 at end of queue', () => {
            const queueLength = 3;
            expect(nextQueueIndex(queueLength, 0, 'all')).toBe(1);
            expect(nextQueueIndex(queueLength, 1, 'all')).toBe(2);
            expect(nextQueueIndex(queueLength, 2, 'all')).toBe(0); // loops queue
            expect(prevQueueIndex(queueLength, 0, 'all')).toBe(2); // loops backward
        });

        it('handles loopMode === one: nextQueueIndex behaves like off', () => {
            const queueLength = 3;
            expect(nextQueueIndex(queueLength, 0, 'one')).toBe(1);
            expect(nextQueueIndex(queueLength, 2, 'one')).toBe(-1);
        });
    });
});
