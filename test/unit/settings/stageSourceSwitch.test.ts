import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { buildSettingsDialogModel } from '../../../src/components/app/dialogs/buildSettingsDialogModel';

// test/unit/settings/stageSourceSwitch.test.ts
// Verifies that Integration settings consumes the authoritative Stage source status.

describe('settings Stage source switching', () => {
    it('applies the status returned by the dedicated source setter', async () => {
        const nextStatus = {
            enabled: false,
            modeEnabled: true,
            source: 'spotify-local' as const,
        };
        const setStageSource = vi.fn().mockResolvedValue(nextStatus);
        const setStageStatus = vi.fn();
        vi.stubGlobal('window', { electron: { setStageSource } });

        try {
            const model = buildSettingsDialogModel({
                state: { isOpen: true, initialTab: 'options', initialSubview: 'integration' },
                themeController: {} as never,
                themeParkInitialTheme: {} as never,
                loadLyricFilterPreview: vi.fn().mockResolvedValue(null),
                onSaveLyricFilterPattern: vi.fn(),
                activePlaybackContext: 'main',
                currentLyrics: null,
                lyricCurrentTime: {} as never,
                replayGainMode: 'off',
                onReplayGainModeChange: vi.fn(),
                setStageStatus,
                leaveStagePlayback: vi.fn(),
                clearStagePlaybackSession: vi.fn(),
                clearPersistedStagePlaybackCache: vi.fn().mockResolvedValue(undefined),
                loadStageSessionIntoPlayback: vi.fn().mockResolvedValue(undefined),
                onAudioOutputDeviceChange: vi.fn().mockReturnValue(true),
                onToggleTransparentPlayerBackground: vi.fn(),
            });

            await model?.onStageSourceChange?.('spotify-local');

            expect(setStageSource).toHaveBeenCalledWith('spotify-local');
            expect(setStageStatus).toHaveBeenCalledWith(nextStatus);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('handles a rejected source transition without updating stale status', async () => {
        const transitionError = new Error('Stage port is already in use');
        const setStageSource = vi.fn().mockRejectedValue(transitionError);
        const setStageStatus = vi.fn();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubGlobal('window', { electron: { setStageSource } });

        try {
            const model = buildSettingsDialogModel({
                state: { isOpen: true, initialTab: 'options', initialSubview: 'integration' },
                themeController: {} as never,
                themeParkInitialTheme: {} as never,
                loadLyricFilterPreview: vi.fn().mockResolvedValue(null),
                onSaveLyricFilterPattern: vi.fn(),
                activePlaybackContext: 'main',
                currentLyrics: null,
                lyricCurrentTime: {} as never,
                replayGainMode: 'off',
                onReplayGainModeChange: vi.fn(),
                setStageStatus,
                leaveStagePlayback: vi.fn(),
                clearStagePlaybackSession: vi.fn(),
                clearPersistedStagePlaybackCache: vi.fn().mockResolvedValue(undefined),
                loadStageSessionIntoPlayback: vi.fn().mockResolvedValue(undefined),
                onAudioOutputDeviceChange: vi.fn().mockReturnValue(true),
                onToggleTransparentPlayerBackground: vi.fn(),
            });

            await expect(model?.onStageSourceChange?.('stage-api')).resolves.toBeUndefined();

            expect(setStageStatus).not.toHaveBeenCalled();
            expect(consoleError).toHaveBeenCalledWith(
                '[buildSettingsDialogModel] Failed to change stage source:',
                transitionError,
            );
        } finally {
            consoleError.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('guards the legacy settings route with the same trusted sender check', async () => {
        const mainSource = await readFile(new URL('../../../electron/main.cjs', import.meta.url), 'utf8');
        const legacySourceBranch = mainSource.slice(
            mainSource.indexOf('if (key === STAGE_MODE_SOURCE_SETTING_KEY)'),
            mainSource.indexOf('let nextValue = value;'),
        );

        expect(legacySourceBranch).toContain('if (!isTrustedMainWindowContents(event.sender))');
        expect(legacySourceBranch).toContain("throw new Error('Untrusted renderer attempted to change the Stage source.')");
        expect(legacySourceBranch).toContain('await stageApi.setStageSource(value);');
    });
});
