import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

// test/unit/electron/windowState.test.ts
// Covers platform-specific behavior for the custom window expand control.

const require = createRequire(import.meta.url);
const { getWindowState, toggleWindowExpandControl } = require('../../../electron/windowState.cjs') as {
    getWindowState: (window: TestWindow | null, platform?: NodeJS.Platform) => {
        expandMode: 'fullscreen' | 'maximize';
        isFullScreen: boolean;
        isMaximized: boolean;
    };
    toggleWindowExpandControl: (window: TestWindow | null, platform?: NodeJS.Platform) => boolean;
};

type TestWindow = ReturnType<typeof createWindow>;

function createWindow({ destroyed = false, fullscreen = false, maximized = false } = {}) {
    return {
        isDestroyed: vi.fn(() => destroyed),
        isFullScreen: vi.fn(() => fullscreen),
        isMaximized: vi.fn(() => maximized),
        maximize: vi.fn(),
        setFullScreen: vi.fn(),
        unmaximize: vi.fn(),
    };
}

describe('window state', () => {
    it('uses native fullscreen for the expand control on macOS', () => {
        const window = createWindow();

        expect(toggleWindowExpandControl(window, 'darwin')).toBe(true);
        expect(window.setFullScreen).toHaveBeenCalledWith(true);
        expect(window.maximize).not.toHaveBeenCalled();
    });

    it('exits native fullscreen from the macOS expand control', () => {
        const window = createWindow({ fullscreen: true });

        expect(toggleWindowExpandControl(window, 'darwin')).toBe(false);
        expect(window.setFullScreen).toHaveBeenCalledWith(false);
        expect(window.unmaximize).not.toHaveBeenCalled();
    });

    it.each<NodeJS.Platform>(['win32', 'linux'])('maximizes the window on %s', platform => {
        const window = createWindow();

        expect(toggleWindowExpandControl(window, platform)).toBe(true);
        expect(window.maximize).toHaveBeenCalledOnce();
        expect(window.setFullScreen).not.toHaveBeenCalled();
    });

    it('restores a maximized non-macOS window', () => {
        const window = createWindow({ maximized: true });

        expect(toggleWindowExpandControl(window, 'win32')).toBe(false);
        expect(window.unmaximize).toHaveBeenCalledOnce();
    });

    it('reports native fullscreen mode on macOS', () => {
        const window = createWindow({ fullscreen: true, maximized: true });

        expect(getWindowState(window, 'darwin')).toEqual({
            expandMode: 'fullscreen',
            isFullScreen: true,
            isMaximized: true,
        });
    });

    it('reports maximize mode on other platforms', () => {
        expect(getWindowState(createWindow(), 'linux').expandMode).toBe('maximize');
    });

    it('ignores missing or destroyed windows', () => {
        const destroyedWindow = createWindow({ destroyed: true });

        expect(toggleWindowExpandControl(null, 'darwin')).toBe(false);
        expect(toggleWindowExpandControl(destroyedWindow, 'darwin')).toBe(false);
        expect(getWindowState(null, 'darwin')).toEqual({
            expandMode: 'fullscreen',
            isFullScreen: false,
            isMaximized: false,
        });
        expect(destroyedWindow.setFullScreen).not.toHaveBeenCalled();
    });
});
