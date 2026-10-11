import { describe, expect, it, vi } from 'vitest';
import { createMainWindowRenderActivityStore, type MainWindowRenderBridge, type MainWindowRenderState } from '../../../src/hooks/mainWindowRenderActivity';

// Main-window visual suspension must never cut OBS's audio signal or wallpaper output.
function createBridge() {
    let windowListener: ((state: MainWindowRenderState) => void) | undefined;
    let obsListener: ((state: { enabled: boolean; clientCount: number }) => void) | undefined;
    let resolveWindow!: (state: MainWindowRenderState) => void;
    let resolveObs!: (state: { enabled: boolean; clientCount: number }) => void;
    const unsubscribeWindow = vi.fn();
    const unsubscribeObs = vi.fn();
    const bridge: MainWindowRenderBridge = {
        getMainWindowRenderState: vi.fn(() => new Promise<MainWindowRenderState>(resolve => { resolveWindow = resolve; })),
        getObsBrowserSourceStatus: vi.fn(() => new Promise<{ enabled: boolean; clientCount: number }>(resolve => { resolveObs = resolve; })),
        onMainWindowRenderStateChanged: vi.fn(callback => { windowListener = callback; return unsubscribeWindow; }),
        onObsBrowserSourceStatusChanged: vi.fn(callback => { obsListener = callback; return unsubscribeObs; }),
    };
    return { bridge, unsubscribeWindow, unsubscribeObs,
        window: (state: MainWindowRenderState) => windowListener!(state),
        obs: (enabled: boolean, clientCount: number) => obsListener!({ enabled, clientCount }),
        initialWindow: (state: MainWindowRenderState) => resolveWindow(state),
        initialObs: (enabled: boolean, clientCount: number) => resolveObs({ enabled, clientCount }),
    };
}

describe('main-window render activity', () => {
    it('suspends hidden/minimized visuals and FFT, resumes when shown', () => {
        const fake = createBridge();
        const store = createMainWindowRenderActivityStore(fake.bridge, undefined);
        const changed = vi.fn();
        const stop = store.subscribe(changed);
        fake.window({ visible: false, wallpaper: false });
        expect(store.getSnapshot()).toEqual({ renderEnabled: false, audioAnalysisEnabled: false });
        const snapshot = store.getSnapshot();
        fake.window({ visible: false, wallpaper: false });
        expect(store.getSnapshot()).toBe(snapshot);
        expect(changed).toHaveBeenCalledOnce();
        fake.window({ visible: true, wallpaper: false });
        expect(store.getSnapshot()).toEqual({ renderEnabled: true, audioAnalysisEnabled: true });
        stop();
    });

    it('keeps FFT for connected OBS but keeps hidden main visuals suspended', () => {
        const fake = createBridge();
        const store = createMainWindowRenderActivityStore(fake.bridge, undefined);
        const stop = store.subscribe(() => {});
        fake.window({ visible: false, wallpaper: false });
        fake.obs(true, 1);
        expect(store.getSnapshot()).toEqual({ renderEnabled: false, audioAnalysisEnabled: true });
        fake.obs(true, 0);
        expect(store.getSnapshot().audioAnalysisEnabled).toBe(false);
        fake.obs(false, 1);
        expect(store.getSnapshot().audioAnalysisEnabled).toBe(false);
        stop();
    });

    it('keeps both visuals and FFT active in wallpaper mode, including hidden native windows', () => {
        const fake = createBridge();
        const store = createMainWindowRenderActivityStore(fake.bridge, undefined);
        const stop = store.subscribe(() => {});
        fake.window({ visible: false, wallpaper: true });
        expect(store.getSnapshot()).toEqual({ renderEnabled: true, audioAnalysisEnabled: true });
        fake.window({ visible: false, wallpaper: false });
        expect(store.getSnapshot()).toEqual({ renderEnabled: false, audioAnalysisEnabled: false });
        stop();
    });

    it('ignores delayed initial IPC responses after newer events and after unsubscribe', async () => {
        const fake = createBridge();
        const store = createMainWindowRenderActivityStore(fake.bridge, undefined);
        const changed = vi.fn();
        const stop = store.subscribe(changed);
        fake.window({ visible: false, wallpaper: false });
        fake.obs(true, 2);
        fake.initialWindow({ visible: true, wallpaper: false });
        fake.initialObs(false, 0);
        await Promise.resolve();
        expect(store.getSnapshot()).toEqual({ renderEnabled: false, audioAnalysisEnabled: true });
        stop();
        expect(fake.unsubscribeWindow).toHaveBeenCalledOnce();
        expect(fake.unsubscribeObs).toHaveBeenCalledOnce();
        expect(changed).toHaveBeenCalledTimes(2);

        const other = createBridge();
        const disposed = createMainWindowRenderActivityStore(other.bridge, undefined);
        disposed.subscribe(changed)();
        other.initialWindow({ visible: false, wallpaper: false });
        await Promise.resolve();
        expect(disposed.getSnapshot().renderEnabled).toBe(true);
    });

    it('shares IPC subscriptions and only stops them after the last consumer leaves', () => {
        const fake = createBridge();
        const store = createMainWindowRenderActivityStore(fake.bridge, undefined);
        const first = store.subscribe(() => {});
        const second = store.subscribe(() => {});
        expect(fake.bridge.getMainWindowRenderState).toHaveBeenCalledOnce();
        first();
        expect(fake.unsubscribeWindow).not.toHaveBeenCalled();
        second();
        expect(fake.unsubscribeWindow).toHaveBeenCalledOnce();
    });

    it('uses document visibility for browsers and removes its event listener', () => {
        const visibility = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const store = createMainWindowRenderActivityStore(undefined, visibility);
        const stop = store.subscribe(() => {});
        visibility.hidden = true;
        visibility.addEventListener.mock.calls[0][1]();
        expect(store.getSnapshot()).toEqual({ renderEnabled: false, audioAnalysisEnabled: false });
        visibility.hidden = false;
        visibility.addEventListener.mock.calls[0][1]();
        expect(store.getSnapshot().renderEnabled).toBe(true);
        stop();
        expect(visibility.removeEventListener).toHaveBeenCalledWith('visibilitychange', visibility.addEventListener.mock.calls[0][1]);
    });
});
