import { expect, test } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

// test/ui/audioQuality.spec.ts
// Checks quality visibility in the real mini player, switching tracks, and the fork credit link.
test('shows current source quality in the mini player and discards it on song changes', async ({ page }) => {
    await page.addInitScript(([version, guideKey]) => {
        localStorage.setItem('folia_app_language', 'vi');
        localStorage.setItem('i18nextLng', 'vi');
        localStorage.setItem('static_mode', 'true');
        localStorage.setItem(guideKey, version);
    }, [APP_VERSION, GUIDE_VERSION_STORAGE_KEY]);
    await page.route('**/__mock_netease__/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/');
    await waitForAppMounted(page);
    await page.evaluate(async () => {
        const modulePath = '/src/stores/usePlaybackStore.ts';
        const { usePlaybackStore } = await import(modulePath);
        usePlaybackStore.setState({ currentSong: { id: 1, name: 'Audio Quality Test', artists: [], album: { id: 1, name: 'Test' }, durationMs: 180000, audioQualityInfo: { bitrate: 4800000, codec: 'FLAC', sampleRate: 96000, bitDepth: 24 } }, duration: 180, playerState: 'PAUSED' });
    });
    const quality = page.getByTestId('audio-quality');
    await expect(quality).toHaveText('4800 kbps · FLAC · 96 kHz · 24-bit');
    await page.locator('[data-ponder="player-bar"]').hover();
    await expect(page.getByText('Audio Quality Test', { exact: true }).first()).toBeVisible();
    await expect(quality).toHaveText('4800 kbps · FLAC · 96 kHz · 24-bit');
    await expect.poll(async () => (await page.locator('[data-ponder="player-bar"]').boundingBox())?.width ?? 0).toBeGreaterThan(450);
    await page.locator('[data-ponder="player-bar"]').screenshot({ path: 'test-results/audio-quality-mini-player.png' });

    await page.evaluate(async () => {
        const modulePath = '/src/stores/usePlaybackStore.ts';
        const { usePlaybackStore } = await import(modulePath);
        const currentSong = usePlaybackStore.getState().currentSong;
        usePlaybackStore.setState({ currentSong: { ...currentSong, audioQualityInfo: { bitrate: 4800000, codec: 'FLAC', provenance: 'source' } } });
    });
    await expect(quality).toHaveText('Nguồn gốc · 4800 kbps · FLAC');

    await page.evaluate(async () => {
        const modulePath = '/src/stores/usePlaybackStore.ts';
        const { usePlaybackStore } = await import(modulePath);
        usePlaybackStore.setState({ currentSong: { id: 2, name: 'Unknown Quality', artists: [], album: { id: 1, name: 'Test' }, durationMs: 180000 } });
    });
    await expect(quality).toHaveCount(0);
    await page.evaluate(async () => {
        const modulePath = '/src/stores/useSettingsModalStore.ts';
        const { useSettingsModalStore } = await import(modulePath);
        useSettingsModalStore.getState().openSettings('help');
    });
    await expect(page.getByRole('link', { name: 'VtuberVN/folia-major', exact: true })).toHaveAttribute('href', 'https://github.com/VtuberVN/folia-major');
    await page.evaluate(async () => {
        const settingsPath = '/src/stores/useSettingsModalStore.ts';
        const viewPath = '/src/stores/useAppViewStore.ts';
        const { useSettingsModalStore } = await import(settingsPath);
        const { useAppViewStore } = await import(viewPath);
        useSettingsModalStore.getState().closeSettings();
        useAppViewStore.setState({ view: 'player', isPanelOpen: true, panelTab: 'account' });
    });
    for (const name of ['Standard', 'Very High', 'Lossless', 'Hi-Res']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: 'test-results/quality-labels-english.png' });
});
