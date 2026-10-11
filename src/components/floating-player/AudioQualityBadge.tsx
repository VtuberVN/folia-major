import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioQualityInfo } from '../../types/audioQuality';
import { formatAudioQualityInfo } from '../../utils/audioQualityInfo';

// src/components/floating-player/AudioQualityBadge.tsx
// Displays available source metadata without substituting the preferred download quality.
export default function AudioQualityBadge({ info }: { info?: AudioQualityInfo }) {
    const { t, i18n } = useTranslation();
    const details = formatAudioQualityInfo(info, i18n.resolvedLanguage ?? 'en');
    const label = details && info?.provenance === 'source' ? `${t('ui.audioQualitySource')} · ${details}` : details;
    if (!label) return null;
    return <div data-testid="audio-quality" title={`${t('ui.audioQualityInfo')}: ${label}`} aria-label={`${t('ui.audioQualityInfo')}: ${label}`}
        className="mt-0.5 truncate text-center font-mono text-[10px] font-normal opacity-60">{label}</div>;
}
