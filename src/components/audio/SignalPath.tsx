import { AnimatePresence, motion, type MotionStyle } from 'framer-motion';
import { useReducedMotionFor } from '../../hooks/useReducedMotionFor';
import { audioGlass } from './audioGlass';
import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useSignalPathStore } from '../../stores/useSignalPathStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { buildSignalPath } from './buildSignalPath';
import './signalPath.css';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSignalPathTransition } from './useSignalPathTransition';
import type { AudioQualityInfo } from '../../types/audioQuality';
import type { PlayerState } from '../../types';
import { usePlayerBottomBarBottomPx } from '../../hooks/usePlayerBottomBarBottomPx';

export default function SignalPath({
    anchored = false,
    retracted = false,
    open: externalOpen,
    onClose: externalOnClose,
    audioQualityInfo,
    playerState,
    onOpenChange,
    hideTrigger = false,
}: {
    anchored?: boolean;
    retracted?: boolean;
    open?: boolean;
    onClose?: () => void;
    audioQualityInfo?: AudioQualityInfo;
    playerState?: PlayerState;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
}) {
    const { t } = useTranslation();
    const isDaylight = useThemeSettingsStore(state => state.isDaylight);
    const glassPanel = audioGlass(isDaylight);
    const reduced = useReducedMotionFor('uiMicroMotion');
    const glassButton = isDaylight
        ? 'bg-white/40 border-white/20 hover:bg-white/50'
        : 'bg-black/20 border-white/5 hover:bg-black/30';
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const snapshot = useSignalPathStore(state => state.snapshot);
    const failureCode = useSignalPathStore(state => state.failureCode);
    const enableWasapiExclusive = useAudioSettingsStore(state => state.enableWasapiExclusive);
    const enabled = useAudioSettingsStore(state => state.showAudioSignalPath);
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = typeof externalOpen === 'boolean';
    const open = isControlled ? externalOpen : internalOpen;

    const setOpen = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const nextValue = typeof value === 'function' ? value(open) : value;
        if (!isControlled) {
            setInternalOpen(nextValue);
        }
        if (!nextValue) {
            externalOnClose?.();
        }
        onOpenChange?.(nextValue);
    }, [isControlled, open, externalOnClose, onOpenChange]);

    const compact = useMediaQuery('(max-height: 760px)');
    const wide = useMediaQuery('(min-width: 600px)');
    const standaloneWide = useMediaQuery('(min-width: 1024px)');
    const standaloneBottom = usePlayerBottomBarBottomPx(standaloneWide ? 32 : 112);
    const columns = compact && wide;
    const panelRef = useSignalPathTransition(open, compact + ':' + columns);

    useEffect(() => {
        onOpenChange?.(open);
        return () => onOpenChange?.(false);
    }, [open, onOpenChange]);

    const container = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isControlled) {
            setInternalOpen(false);
        }
    }, [audioSrc, isControlled]);

    useEffect(() => {
        if (!open) return;
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        };
        const outside = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', key);
        window.addEventListener('pointerdown', outside);
        return () => {
            window.removeEventListener('keydown', key);
            window.removeEventListener('pointerdown', outside);
        };
    }, [open]);

    if (!enabled || !audioSrc) return null;
    if (hideTrigger && !open) return null;

    const selectedBackend = enableWasapiExclusive ? 'wasapi-exclusive' : 'browser';
    const { rows, brief } = buildSignalPath(snapshot, selectedBackend, t, audioQualityInfo, playerState);

    return (
        <motion.div
            ref={container}
            data-signal-path
            data-retracted={retracted}
            inert={retracted}
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
            className={`${anchored ? 'absolute bottom-full mb-1' : 'fixed'} left-1/2 -translate-x-1/2 z-[90] w-max max-w-[calc(100vw-24px)] pointer-events-auto audio-signal-drawer flex items-center gap-1.5`}
            style={{
                bottom: anchored ? undefined : standaloneBottom,
                WebkitAppRegion: 'no-drag',
                color: 'var(--text-primary)',
            } as MotionStyle}
        >
            <AnimatePresence>
                {open && (
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
                        ref={panelRef}
                        data-compact={compact}
                        data-columns={columns}
                        id="folia-signal-path"
                        role="region"
                        aria-label={t('signalPath.title', 'Signal path')}
                        className={`signal-path-panel absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 max-w-[calc(100vw-24px)] overflow-auto rounded-2xl border ${glassPanel} p-5 shadow-2xl backdrop-blur-2xl`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold">{t('signalPath.title', 'Signal path')}</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    trigger.current?.focus();
                                }}
                                aria-label={t('signalPath.close', 'Close')}
                                className="p-2 rounded-full hover:bg-white/10"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <ol className="signal-path-rows">
                            {rows.map((row, index) => (
                                <li key={row.title} className="relative pl-6 pb-5 last:pb-0">
                                    {index < rows.length - 1 && (
                                        <span className="absolute left-[5px] top-3 bottom-0 w-px bg-current opacity-15" />
                                    )}
                                    <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full bg-current opacity-70" />
                                    <div className="text-[11px] opacity-60 mb-1">{row.title}</div>
                                    <div className="text-sm break-words">{row.value}</div>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed opacity-60">
                            {t('signalPath.caveat', 'Bit-perfect direct playback bypasses system resampling.')}
                        </p>
                    </motion.section>
                )}
            </AnimatePresence>
            {!hideTrigger && (
                <button
                    ref={trigger}
                    type="button"
                    aria-expanded={open}
                    aria-controls="folia-signal-path"
                    onClick={() => setOpen(value => !value)}
                    className={`flex max-w-full items-center justify-center gap-2 rounded-full border ${glassButton} px-3 py-1 text-[11px] leading-tight font-medium shadow-lg backdrop-blur-xl transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current`}
                >
                    <AudioLines size={12} className="shrink-0 opacity-60" />
                    <span className="opacity-80">{failureCode ? t('signalPath.failed', 'Output failed') : brief}</span>
                </button>
            )}
        </motion.div>
    );
}
