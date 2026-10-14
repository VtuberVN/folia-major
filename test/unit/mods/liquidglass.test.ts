// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllGlass, makeGlass, removeGlass } from '../../../src/mods/liquidglass';

describe('liquidglass module', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // Mock ResizeObserver for test environment
        global.ResizeObserver = class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        } as unknown as typeof ResizeObserver;
    });

    it('creates and attaches glass filter to an element idempotently', () => {
        const el = document.createElement('div');
        el.setAttribute('data-glass', '');
        document.body.appendChild(el);

        const g1 = makeGlass(el);
        expect(g1).not.toBeNull();
        expect(g1?.id).toMatch(/^lg-\d+/);

        // Idempotency: calling again on the same element returns the existing instance
        const g2 = makeGlass(el);
        expect(g2).toBe(g1);
    });

    it('cleans up filter and inline styles when removeGlass is called', () => {
        const el = document.createElement('div');
        el.setAttribute('data-glass', '');
        document.body.appendChild(el);

        const glass = makeGlass(el);
        expect(glass).not.toBeNull();
        const filterId = glass!.id;
        expect(document.getElementById(filterId)).not.toBeNull();

        removeGlass(el);
        expect(document.getElementById(filterId)).toBeNull();
        expect(el.style.backdropFilter).toBe('');
    });

    it('clears all glass elements via clearAllGlass', () => {
        const el1 = document.createElement('div');
        el1.setAttribute('data-glass', '');
        const el2 = document.createElement('div');
        el2.setAttribute('data-glass', '');
        document.body.appendChild(el1);
        document.body.appendChild(el2);

        const g1 = makeGlass(el1);
        const g2 = makeGlass(el2);
        expect(g1).not.toBeNull();
        expect(g2).not.toBeNull();

        clearAllGlass('[data-glass]');
        expect(document.getElementById(g1!.id)).toBeNull();
        expect(document.getElementById(g2!.id)).toBeNull();
        expect(el1.style.backdropFilter).toBe('');
        expect(el2.style.backdropFilter).toBe('');
    });
});
