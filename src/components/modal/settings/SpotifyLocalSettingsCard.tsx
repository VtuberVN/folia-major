import React from 'react';
import { AlertCircle, Music2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NowPlayingConnectionStatus } from '../../../types';

// src/components/modal/settings/SpotifyLocalSettingsCard.tsx
// Describes the configuration-free operating-system media-session Spotify source.

type SpotifyLocalSettingsCardProps = {
    connectionError: string | null;
    connectionStatus: NowPlayingConnectionStatus;
    errorBgColor: string;
    errorTextColor: string;
    isDaylight: boolean;
    settingsCardClass: string;
    successBgColor: string;
    successTextColor: string;
};

type SpotifyLocalStatusClassParams = Pick<
    SpotifyLocalSettingsCardProps,
    'connectionStatus' | 'errorBgColor' | 'errorTextColor' | 'isDaylight' | 'successBgColor' | 'successTextColor'
>;

export const getSpotifyLocalStatusClass = ({
    connectionStatus,
    errorBgColor,
    errorTextColor,
    isDaylight,
    successBgColor,
    successTextColor,
}: SpotifyLocalStatusClassParams) => {
    if (connectionStatus === 'connected') {
        return `border-green-500/20 ${successBgColor} ${successTextColor}`;
    }
    if (connectionStatus === 'connecting') {
        return isDaylight
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-700'
            : 'border-amber-400/20 bg-amber-500/15 text-amber-200';
    }
    if (connectionStatus === 'error') {
        return `border-red-500/20 ${errorBgColor} ${errorTextColor}`;
    }
    return isDaylight
        ? 'border-black/10 bg-black/[0.04] text-zinc-600'
        : 'border-white/10 bg-white/5 text-zinc-300';
};

const SpotifyLocalSettingsCard: React.FC<SpotifyLocalSettingsCardProps> = ({
    connectionError,
    connectionStatus,
    errorBgColor,
    errorTextColor,
    isDaylight,
    settingsCardClass,
    successBgColor,
    successTextColor,
}) => {
    const { t } = useTranslation();
    const statusLabel = connectionStatus === 'connected'
        ? t('status.connected')
        : connectionStatus === 'connecting'
            ? t('status.connecting')
            : connectionStatus === 'error'
                ? t('status.disconnected')
                : t('options.updateCheckDisabled');
    const statusClass = getSpotifyLocalStatusClass({
        connectionStatus,
        errorBgColor,
        errorTextColor,
        isDaylight,
        successBgColor,
        successTextColor,
    });
    const errorMessage = connectionError?.trim() || t('options.spotifyLocalConnectionError');

    return (
        <div className={`rounded-xl border p-3 space-y-3 ${settingsCardClass}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        <Music2 size={15} className="shrink-0" />
                        <span>{t('options.spotifyLocalTitle')}</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed opacity-55" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.spotifyLocalDescription')}
                    </div>
                </div>
                <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass}`}
                    aria-live="polite"
                >
                    {statusLabel}
                </span>
            </div>

            <div className="flex items-start gap-2 text-[11px] opacity-65" style={{ color: 'var(--text-secondary)' }}>
                <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0 space-y-1">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('options.spotifyLocalNoSetup')}
                    </div>
                    <div>{t('options.spotifyLocalBackendDescription')}</div>
                </div>
            </div>

            {connectionStatus === 'error' && (
                <div
                    className={`flex items-start gap-2 rounded-lg border border-red-500/20 px-3 py-2 text-xs ${errorBgColor} ${errorTextColor}`}
                    role="status"
                >
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 break-words">{errorMessage}</span>
                </div>
            )}
        </div>
    );
};

export default SpotifyLocalSettingsCard;
