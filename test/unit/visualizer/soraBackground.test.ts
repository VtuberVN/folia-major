// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SoraBackground from '../../../src/components/visualizer/backgrounds/sora/SoraBackground';
import soraEntry from '../../../src/components/visualizer/backgrounds/sora/entry';
import { motionValue } from 'framer-motion';
import {
    DEFAULT_SORA_BACKGROUND_TUNING,
    SORA_CLASSIC_TUNING,
    type AudioBands,
    type SoraBackgroundTuning,
    type Theme,
} from '../../../src/types';
import { resolveStoredSoraBackgroundTuning } from '../../../src/stores/visualizerSettingsPersistence';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';

// test/unit/visualizer/soraBackground.test.ts
// Tests the 3D Sora background lifecycle, persistence clamp guards, and appearance codec round-trip.

const { mockRenderer, MockWebGLRenderer } = vi.hoisted(() => {
    const mockRenderer = {
        render: vi.fn(),
        setSize: vi.fn(),
        setPixelRatio: vi.fn(),
        dispose: vi.fn(),
    };
    class MockWebGLRenderer {
        render = mockRenderer.render;
        setSize = mockRenderer.setSize;
        setPixelRatio = mockRenderer.setPixelRatio;
        dispose = mockRenderer.dispose;
        domElement = document.createElement('canvas');
    }
    return { mockRenderer, MockWebGLRenderer };
});

vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return {
        ...actual,
        WebGLRenderer: MockWebGLRenderer,
    };
});

// Mock Canvas 2D context for procedural texture generation in jsdom
beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) => {
        if (contextId === '2d') {
            return {
                fillRect: vi.fn(),
                clearRect: vi.fn(),
                getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) })),
                putImageData: vi.fn(),
                createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) })),
                setTransform: vi.fn(),
                drawImage: vi.fn(),
                save: vi.fn(),
                fillText: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                closePath: vi.fn(),
                stroke: vi.fn(),
                translate: vi.fn(),
                scale: vi.fn(),
                rotate: vi.fn(),
                arc: vi.fn(),
                ellipse: vi.fn(),
                bezierCurveTo: vi.fn(),
                quadraticCurveTo: vi.fn(),
                fill: vi.fn(),
                measureText: vi.fn(() => ({ width: 0 })),
                transform: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
                createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
                createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            } as unknown as CanvasRenderingContext2D;
        }
        return null;
    }) as any;
});

let root: Root;
let host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let resize: () => void;
let disconnect: ReturnType<typeof vi.fn>;
const theme = { primaryColor: '#ff0000', accentColor: '#00ff00', secondaryColor: '#888888', backgroundColor: '#000000' } as unknown as Theme;

const render = (paused: boolean, tuning: SoraBackgroundTuning = DEFAULT_SORA_BACKGROUND_TUNING, strict = false, staticMode = false) => act(() => {
    const component = createElement(SoraBackground, { theme, isDaylight: false, paused, staticMode, tuning });
    root.render(strict ? createElement(StrictMode, null, component) : component);
});

const tick = (now: number) => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
});

beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    frames = new Map();
    let handle = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.set(++handle, callback);
        return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) { resize = callback; }
        observe() {}
        disconnect = disconnect;
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe('Sora 3D Celestial Engine scheduling and lifecycle', () => {
    it('honors blank mode and skips rendering canvas when blank is true', () => {
        act(() => root.render(soraEntry.render({
            theme,
            isDaylight: false,
            paused: false,
            staticMode: false,
            audioPower: motionValue(0),
            audioBands: {} as AudioBands,
            config: {
                sora: {
                    tuning: { ...DEFAULT_SORA_BACKGROUND_TUNING, blank: true },
                },
            } as any,
        })));
        expect(mockRenderer.render).not.toHaveBeenCalled();
    });

    it('renders on mount and animates across frames when active', () => {
        render(false);
        tick(16);
        expect(mockRenderer.render).toHaveBeenCalled();
        tick(32);
        expect(mockRenderer.render.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps ambient celestial animation running smoothly even when playback paused', () => {
        render(true);
        tick(16);
        expect(mockRenderer.render).toHaveBeenCalled();
        tick(32);
        expect(mockRenderer.render.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('pauses rendering loop when staticMode is true', () => {
        render(false, DEFAULT_SORA_BACKGROUND_TUNING, false, true);
        tick(16);
        expect(mockRenderer.render).toHaveBeenCalledTimes(1);
        tick(32);
        // Static mode draws once on mount and does not keep requesting animation frames
        expect(mockRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('disposes Three.js renderer and disconnects ResizeObserver on unmount under StrictMode', () => {
        render(false, DEFAULT_SORA_BACKGROUND_TUNING, true);
        tick(16);
        act(() => root.unmount());
        expect(mockRenderer.dispose).toHaveBeenCalled();
        expect(disconnect).toHaveBeenCalled();
        root = createRoot(host);
    });
});

describe('Sora tuning persistence and clamp validation', () => {
    it('clamps numeric fields into safe operational limits', () => {
        const resolved = resolveStoredSoraBackgroundTuning({
            camYaw: 999,
            camPitch: -100,
            camRoll: -300,
            starDriftAngle: 500,
            starDriftSpeed: 10,
            starCount: 10000,
            starScale: 50,
            galaxyRadius: 1000,
            galaxyRotX: 200,
            audioPulse: 10,
        });

        expect(resolved.camYaw).toBe(180);
        expect(resolved.camPitch).toBe(-90);
        expect(resolved.camRoll).toBe(-180);
        expect(resolved.starDriftAngle).toBe(360);
        expect(resolved.starDriftSpeed).toBe(5);
        expect(resolved.starCount).toBe(3000);
        expect(resolved.starScale).toBe(3.0);
        expect(resolved.galaxyRadius).toBe(300);
        expect(resolved.galaxyRotX).toBe(180);
        expect(resolved.audioPulse).toBe(3.0);
    });

    it('falls back safely when receiving invalid enum strings', () => {
        const resolved = resolveStoredSoraBackgroundTuning({
            starShape: 'invalid' as any,
            starPalette: 'invalid' as any,
            galaxyShape: 'invalid' as any,
            shootingPalette: 'invalid' as any,
        });

        expect(resolved.starShape).toBe('soft');
        expect(resolved.starPalette).toBe('real');
        expect(resolved.galaxyShape).toBe('spiral4');
        expect(resolved.shootingPalette).toBe('gold');
    });

    it('preserves Sora Classic preset without sub-galaxy or shooting stars', () => {
        const resolved = resolveStoredSoraBackgroundTuning(SORA_CLASSIC_TUNING);
        expect(resolved.showGalaxy).toBe(false);
        expect(resolved.enableShootingStars).toBe(false);
    });
});

describe('Sora appearance codec round-trip', () => {
    it('encodes and decodes full 3D celestial parameters accurately', () => {
        const customTuning: SoraBackgroundTuning = {
            ...DEFAULT_SORA_BACKGROUND_TUNING,
            camYaw: 45,
            camPitch: -20,
            camRoll: 15,
            autoCinematicCam: false,
            starShape: 'cross',
            starPalette: 'neon',
            starDriftAngle: 120,
            starDriftSpeed: 2.4,
            starCount: 1800,
            starScale: 1.4,
            depthSpread: 1.2,
            twinkle: 0.8,
            showGalaxy: true,
            galaxyShape: 'spiral4',
            galaxyRadius: 150,
            galaxyTwist: 1.8,
            galaxyArmWidth: 1.1,
            galaxyThickness: 0.5,
            galaxyChaos: 0.6,
            galaxyCore: 1.3,
            galaxySpin: 0.7,
            galaxyRotX: 45,
            galaxyRotY: -30,
            galaxyRotZ: 60,
            galaxyPosX: -120,
            galaxyPosY: 40,
            galaxyPosZ: -320,
            enableShootingStars: true,
            shootingFreq: 5,
            shootingTail: 60,
            shootingPalette: 'gold',
            audioPulse: 0.65,
        };

        const config = {
            soraBackgroundTuning: customTuning,
        } as any;

        const compressed = compressConfig(config);
        const decompressed = decompressConfig(compressed);

        expect(decompressed.soraBackgroundTuning?.camYaw).toBe(45);
        expect(decompressed.soraBackgroundTuning?.camPitch).toBe(-20);
        expect(decompressed.soraBackgroundTuning?.camRoll).toBe(15);
        expect(decompressed.soraBackgroundTuning?.autoCinematicCam).toBe(false);
        expect(decompressed.soraBackgroundTuning?.starShape).toBe('cross');
        expect(decompressed.soraBackgroundTuning?.starPalette).toBe('neon');
        expect(decompressed.soraBackgroundTuning?.starDriftAngle).toBe(120);
        expect(decompressed.soraBackgroundTuning?.starDriftSpeed).toBe(2.4);
        expect(decompressed.soraBackgroundTuning?.starCount).toBe(1800);
        expect(decompressed.soraBackgroundTuning?.galaxyShape).toBe('spiral4');
        expect(decompressed.soraBackgroundTuning?.galaxyRadius).toBe(150);
        expect(decompressed.soraBackgroundTuning?.galaxyThickness).toBe(0.5);
        expect(decompressed.soraBackgroundTuning?.galaxyChaos).toBe(0.6);
        expect(decompressed.soraBackgroundTuning?.galaxyRotX).toBe(45);
        expect(decompressed.soraBackgroundTuning?.galaxyRotY).toBe(-30);
        expect(decompressed.soraBackgroundTuning?.galaxyRotZ).toBe(60);
        expect(decompressed.soraBackgroundTuning?.shootingPalette).toBe('gold');
        expect(decompressed.soraBackgroundTuning?.audioPulse).toBe(0.65);
    });
});
