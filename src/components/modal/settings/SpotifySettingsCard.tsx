import React, { useEffect, useState } from 'react';
import { Check, Clock3, Copy, ExternalLink, Loader2, LogOut, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveSpotifyRateLimitRemainingSeconds } from '../../../services/spotifyProvider';
import { formatTime } from '../../../utils/appPlaybackHelpers';

// src/components/modal/settings/SpotifySettingsCard.tsx
// Manages the desktop-only Spotify Client ID and PKCE authorization flow.

type SpotifySettingsCardProps = {
    settingsCardClass: string;
    onCopyText: (text: string) => Promise<void>;
};

const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

const SpotifySettingsCard: React.FC<SpotifySettingsCardProps> = ({
    settingsCardClass,
    onCopyText,
}) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<ElectronSpotifyStatus | null>(null);
    const [clientId, setClientId] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [rateLimitRemainingSeconds, setRateLimitRemainingSeconds] = useState<number | null>(null);

    useEffect(() => {
        let disposed = false;
        let receivedStatusUpdate = false;
        const unsubscribe = window.electron?.onSpotifyStatusChanged?.((nextStatus) => {
            receivedStatusUpdate = true;
            setStatus(nextStatus);
            setClientId(nextStatus.clientId);
            setLocalError(null);
            setBusy(false);
        });

        void window.electron?.getSpotifyStatus?.().then((nextStatus) => {
            if (!disposed && !receivedStatusUpdate) {
                setStatus(nextStatus);
                setClientId(nextStatus.clientId);
                setLocalError(null);
            }
        }).catch((error) => {
            if (!disposed) {
                setLocalError(error instanceof Error ? error.message : String(error));
            }
        });

        return () => {
            disposed = true;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        const rateLimitedUntil = status?.rateLimitedUntil ?? null;
        const updateRemainingTime = () => {
            const nextRemaining = resolveSpotifyRateLimitRemainingSeconds(rateLimitedUntil);
            setRateLimitRemainingSeconds(current => current === nextRemaining ? current : nextRemaining);
            return nextRemaining;
        };
        const initialRemaining = updateRemainingTime();
        if (initialRemaining === null) {
            return;
        }

        const timer = window.setInterval(() => {
            if (updateRemainingTime() === null) {
                window.clearInterval(timer);
            }
        }, 1000);
        return () => window.clearInterval(timer);
    }, [status?.rateLimitedUntil]);

    const handleConnect = async () => {
        setBusy(true);
        setLocalError(null);
        try {
            const nextStatus = await window.electron?.connectSpotify?.(clientId);
            if (nextStatus) {
                setStatus(nextStatus);
            }
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };

    const handleDisconnect = async () => {
        setBusy(true);
        setLocalError(null);
        try {
            const nextStatus = await window.electron?.disconnectSpotify?.();
            if (nextStatus) {
                setStatus(nextStatus);
            }
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };

    const handleCopyRedirectUri = async () => {
        if (!status?.redirectUri) return;
        await onCopyText(status.redirectUri);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    const statusLabel = status?.authorizationPending
        ? t('options.spotifyAuthorizing')
        : status?.requiresReauthorization
            ? t('options.spotifyReconnectRequired')
            : status?.authenticated
            ? t('options.spotifyConnected')
            : t('options.spotifyDisconnected');
    const rateLimitActive = rateLimitRemainingSeconds !== null;
    const statusError = status?.error;
    const error = localError || (/^Spotify rate limit reached\.?$/i.test(statusError || '') ? null : statusError);

    return (
        <div className={`rounded-xl border p-3 space-y-4 ${settingsCardClass}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        <Music2 size={15} /> {t('options.spotifyWebApiTitle')}
                    </div>
                    <div className="mt-1 text-[11px] opacity-55" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.spotifyMirrorDescription')}
                    </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] ${status?.authenticated ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10'}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.16em] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.spotifyClientId')}
                </label>
                <input
                    type="text"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value.trim())}
                    placeholder={t('options.spotifyClientIdPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/25"
                    style={{ color: 'var(--text-primary)' }}
                />
            </div>

            <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.16em] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.spotifyRedirectUri')}
                </div>
                <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-black/20 px-3 py-2 text-[11px]" style={{ color: 'var(--text-primary)' }}>
                        {status?.redirectUri || 'http://127.0.0.1:43827/callback'}
                    </code>
                    <button
                        type="button"
                        onClick={() => void handleCopyRedirectUri()}
                        className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/15"
                        title={t('options.copyStageAddress')}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>
                <div className="text-[11px] opacity-55" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.spotifyRedirectInstruction')}
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {error}
                </div>
            )}

            {rateLimitActive && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <Clock3 size={14} className="shrink-0" />
                    <span>
                        {t('options.spotifyRateLimitCountdown', { time: formatTime(rateLimitRemainingSeconds) })}
                    </span>
                </div>
            )}

            {status?.requiresReauthorization && (
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {t('options.spotifyReconnectForControls')}
                </div>
            )}

            <div className="text-[11px] opacity-55" style={{ color: 'var(--text-secondary)' }}>
                {t('options.spotifyControlsRequirement')}
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void handleConnect()}
                    disabled={busy || status?.authorizationPending || !clientId}
                    className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:opacity-40"
                >
                    {(busy || status?.authorizationPending) && <Loader2 size={14} className="animate-spin" />}
                    {status?.authenticated ? t('options.spotifyReconnect') : t('options.spotifyConnect')}
                </button>
                {status?.authenticated && (
                    <button
                        type="button"
                        onClick={() => void handleDisconnect()}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs transition-colors hover:bg-white/15 disabled:opacity-40"
                    >
                        <LogOut size={14} /> {t('options.spotifyDisconnect')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void window.electron?.openExternalUrl?.(SPOTIFY_DASHBOARD_URL)}
                    className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs transition-colors hover:bg-white/15"
                >
                    <ExternalLink size={14} /> {t('options.spotifyOpenDashboard')}
                </button>
            </div>
        </div>
    );
};

export default SpotifySettingsCard;
