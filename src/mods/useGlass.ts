import { useEffect, useLayoutEffect } from 'react';
import { clearAllGlass, makeGlass } from './liquidglass';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';

// src/mods/useGlass.ts
// React entry point for Liquid Glass effect.
// When enableLiquidGlass is true: scans and mounts makeGlass on layout commit before paint.
// When enableLiquidGlass is false: cleans up any existing glass and skips DOM scanning completely.
export const useGlass = (selector = '[data-glass]') => {
    const enableLiquidGlass = useThemeSettingsStore(state => state.enableLiquidGlass);

    useEffect(() => {
        if (!enableLiquidGlass) {
            clearAllGlass(selector);
        }
    }, [enableLiquidGlass, selector]);

    useLayoutEffect(() => {
        if (!enableLiquidGlass) return;
        if (typeof document === 'undefined') return;
        document.querySelectorAll<HTMLElement>(selector).forEach(makeGlass);
    });
};
