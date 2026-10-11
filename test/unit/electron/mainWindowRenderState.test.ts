import { describe, expect, it } from 'vitest';
const { readMainWindowRenderState } = require('../../../electron/mainWindowRenderState.cjs');
describe('main window render state', () => {
    it.each([
        [false, true, false, true], [false, false, false, false],
        [false, true, true, false], [true, true, false, false],
    ])('accounts for destruction, visibility and minimization', (destroyed, visible, minimized, expected) => {
        const window = { isDestroyed: () => destroyed, isVisible: () => visible, isMinimized: () => minimized };
        expect(readMainWindowRenderState(window, false)).toEqual({ visible: expected, wallpaper: false });
    });
    it('preserves wallpaper activity without a visible main window', () => {
        expect(readMainWindowRenderState(null, true)).toEqual({ visible: false, wallpaper: true });
    });
});
