import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioQualityInfo } from '../../types/audioQuality';
import { formatAudioQualityInfo } from '../../utils/audioQualityInfo';
import { useWasapiStatusStore } from '../../stores/useWasapiStatusStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';

// src/components/floating-player/AudioQualityBadge.tsx
// Displays available source metadata without substituting the preferred download quality,
// with optional WASAPI quick toggle and click-to-view Signal Path drawer.
interface AudioQualityBadgeProps {
    info?: AudioQualityInfo;
    onOpenSignalPath?: () => void;
    showSignalPathAction?: boolean;
}

export default function AudioQualityBadge({
    info,
    onOpenSignalPath,
    showSignalPathAction = false,
}: AudioQualityBadgeProps) {
    const { t, i18n } = useTranslation();
    const wasapiMode = useWasapiStatusStore(state => state.mode);
    const wasapiExclusiveEnabled = useAudioSettingsStore(state => state.enableWasapiExclusive);
    const toggleWasapiExclusive = useAudioSettingsStore(state => state.handleToggleWasapiExclusive);
    const hasWasapi = typeof window !== 'undefined' && Boolean(window.electron?.wasapi);

    const details = formatAudioQualityInfo(info, i18n.resolvedLanguage ?? 'en');
    const label = details && info?.provenance === 'source' ? `${t('ui.audioQualitySource')} · ${details}` : details;
    if (!label) return null;

    const isExclusive = wasapiExclusiveEnabled || wasapiMode === 'exclusive';

    return (
        <div className="mt-0.5 flex items-center justify-center gap-1 px-0.5 max-w-full select-none">
            {hasWasapi && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleWasapiExclusive(!wasapiExclusiveEnabled);
                    }}
                    title={isExclusive ? t('options.wasapiModeExclusive', 'Exclusive') : t('options.wasapiModeShared', 'Shared')}
                    aria-label={`WASAPI: ${isExclusive ? t('options.wasapiModeExclusive', 'Exclusive') : t('options.wasapiModeShared', 'Shared')}`}
                    className={`shrink-0 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border transition-all cursor-pointer leading-none ${
                        isExclusive
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                            : 'border-white/10 bg-white/5 opacity-50 hover:opacity-90'
                    }`}
                >
                    {isExclusive ? 'WASAPI' : 'SHARED'}
                </button>
            )}

            {showSignalPathAction ? (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenSignalPath?.();
                    }}
                    title={`${t('signalPath.title', 'Signal path')}: ${label}`}
                    aria-label={`${t('signalPath.title', 'Signal path')}: ${label}`}
                    className="group/quality inline-flex items-center font-mono text-[9px] sm:text-[9.5px] tracking-tight font-normal opacity-60 hover:opacity-100 transition-opacity cursor-pointer truncate"
                    style={{ color: 'var(--text-primary)' }}
                >
                    <span className="truncate">{label}</span>
                </button>
            ) : (
                <div
                    data-testid="audio-quality"
                    title={`${t('ui.audioQualityInfo')}: ${label}`}
                    aria-label={`${t('ui.audioQualityInfo')}: ${label}`}
                    className="truncate text-center font-mono text-[9px] sm:text-[9.5px] tracking-tight font-normal opacity-60"
                >
                    {label}
                </div>
            )}
        </div>
    );
}
