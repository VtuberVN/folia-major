// src/components/download/DownloadProgressWindow.tsx
// Floating, draggable progress window for song downloads. Hiding it collapses to a small pill so
// it can be brought back while work is still running.

import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Download, FolderOpen, Loader2, Pause, Play, Trash2, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DraggableDebugWindow from '../shared/DraggableDebugWindow';
import { useDownloadStore } from '../../stores/useDownloadStore';
import { useAppChromeStore } from '../../stores/useAppChromeStore';
import {
    cancelSongDownload,
    openDownloadDirectory,
    pauseAllSongDownloads,
    pauseSongDownload,
    persistDownloadQueue,
    resumeSongDownload,
    resumeSongDownloads,
} from '../../services/songDownloadService';

interface DownloadProgressWindowProps {
    isDaylight: boolean;
}

const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
};

const DownloadProgressWindow: React.FC<DownloadProgressWindowProps> = ({ isDaylight }) => {
    const { t } = useTranslation();
    const items = useDownloadStore((state) => state.items);
    const visible = useDownloadStore((state) => state.visible);
    const setVisible = useDownloadStore((state) => state.setVisible);
    const clearFinished = useDownloadStore((state) => state.clearFinished);
    const removeItem = useDownloadStore((state) => state.removeItem);
    // The minimized pill belongs to the player chrome: when that auto-hides (mouse away), the pill
    // hides with it and slides back in when the chrome is revealed.
    const isPlayerChromeHidden = useAppChromeStore((state) => state.isPlayerChromeHidden);

    const active = items.filter((item) => item.status === 'downloading' || item.status === 'resolving');
    const queued = items.filter((item) => item.status === 'queued');
    const paused = items.filter((item) => item.status === 'paused');
    // Anything not done and not in flight: what a "continue" would re-run.
    const resumable = items.filter((item) => (
        item.status === 'paused' || item.status === 'queued' || item.status === 'error' || item.status === 'canceled'
    ));
    const doneCount = items.filter((item) => item.status === 'done').length;
    const clearable = items.filter((item) => (
        item.status === 'done' || item.status === 'error' || item.status === 'canceled'
    )).length;
    const canContinue = active.length === 0 && resumable.length > 0;
    const canPauseAll = active.length > 0 || queued.length > 0;

    if (items.length === 0) return null;

    if (!visible) {
        if (active.length === 0 && queued.length === 0 && paused.length === 0) return null;
        return createPortal(
            <button
                onClick={() => setVisible(true)}
                aria-hidden={isPlayerChromeHidden}
                tabIndex={isPlayerChromeHidden ? -1 : 0}
                className={`fixed bottom-24 right-4 z-[290] flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-lg backdrop-blur-xl border border-white/15 bg-black/60 text-white hover:bg-black/70 transition-all duration-300 ${isPlayerChromeHidden ? 'opacity-0 translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'}`}
            >
                {active.length > 0
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Clock size={13} />}
                {active.length > 0
                    ? t('download.activeCount', { count: active.length + queued.length + paused.length })
                    : t('download.pendingCount', { count: queued.length + paused.length })}
            </button>,
            document.body,
        );
    }

    const onHide = () => setVisible(false);
    const removeAndDiscard = (id: string) => {
        void cancelSongDownload(id);
        removeItem(id);
        persistDownloadQueue();
    };

    return (
        <DraggableDebugWindow
            id="downloads"
            title={t('download.windowTitle')}
            isDaylight={isDaylight}
            onClose={onHide}
            defaultOffset={{ x: -24, y: 220 }}
            widthClass="w-[min(24rem,calc(100vw-2rem))]"
        >
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>{t('download.progress', { done: doneCount, total: items.length })}</span>
                    <span className="font-mono">
                        {Math.round((doneCount / Math.max(items.length, 1)) * 100)}%
                    </span>
                </div>

                {(canPauseAll || canContinue) && (
                    <div className="flex items-center gap-2">
                        {canPauseAll && (
                            <button
                                onClick={() => void pauseAllSongDownloads()}
                                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${isDaylight ? 'bg-black/[0.06] hover:bg-black/[0.1]' : 'bg-white/[0.1] hover:bg-white/[0.16]'}`}
                            >
                                <Pause size={12} />
                                {t('download.pauseAll')}
                            </button>
                        )}
                        {canContinue && (
                            <button
                                onClick={() => void resumeSongDownloads()}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-transform hover:scale-[1.01] active:scale-98"
                                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-color)' }}
                            >
                                <Play size={12} />
                                {t('download.continue')}
                            </button>
                        )}
                    </div>
                )}

                <div className="max-h-[42vh] overflow-y-auto overscroll-contain space-y-1.5 pr-1">
                    {items.map((item) => {
                        const percent = item.total > 0
                            ? Math.min(100, Math.round((item.received / item.total) * 100))
                            : (item.status === 'done' ? 100 : 0);
                        const inFlight = item.status === 'downloading' || item.status === 'resolving';
                        return (
                            <div key={item.id} className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="shrink-0">
                                        {item.status === 'done' && <CheckCircle2 size={13} className="text-emerald-400" />}
                                        {item.status === 'error' && <XCircle size={13} className="text-red-400" />}
                                        {inFlight && <Loader2 size={13} className="animate-spin opacity-70" />}
                                        {item.status === 'canceled' && <X size={13} className="opacity-50" />}
                                        {(item.status === 'queued' || item.status === 'paused') && (
                                            <Clock size={13} className={item.status === 'paused' ? 'opacity-80' : 'opacity-60'} />
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1 text-[11px] truncate">{item.name}</span>
                                    {inFlight && (
                                        <button
                                            onClick={() => void pauseSongDownload(item.id)}
                                            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10"
                                            aria-label={t('download.pause')}
                                            title={t('download.pause')}
                                        >
                                            <Pause size={11} />
                                        </button>
                                    )}
                                    {item.status === 'queued' && (
                                        <button
                                            onClick={() => void pauseSongDownload(item.id)}
                                            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10"
                                            aria-label={t('download.pause')}
                                            title={t('download.pause')}
                                        >
                                            <Pause size={11} />
                                        </button>
                                    )}
                                    {item.status === 'paused' && (
                                        <button
                                            onClick={() => void resumeSongDownload(item.id)}
                                            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10"
                                            aria-label={t('download.resume')}
                                            title={t('download.resume')}
                                        >
                                            <Play size={11} />
                                        </button>
                                    )}
                                    {(item.status === 'paused' || item.status === 'queued' || item.status === 'error' || item.status === 'canceled') && (
                                        <button
                                            onClick={() => removeAndDiscard(item.id)}
                                            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10"
                                            aria-label={t('download.remove')}
                                            title={t('download.remove')}
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </div>
                                {item.status === 'error' ? (
                                    <div className="mt-1 text-[10px] text-red-400/90 break-all">
                                        {item.error === 'unavailable' ? t('download.unavailable') : item.error}
                                    </div>
                                ) : item.status === 'queued' ? (
                                    <div className="mt-1 text-[10px] opacity-50">{t('download.queued')}</div>
                                ) : item.status === 'paused' ? (
                                    <div className="mt-1 flex items-center gap-2">
                                        <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
                                            <div className="h-full rounded-full bg-current opacity-50" style={{ width: `${percent}%` }} />
                                        </div>
                                        <span className="text-[10px] opacity-60">{t('download.paused')}</span>
                                    </div>
                                ) : (
                                    item.status !== 'done' && (
                                        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-current opacity-70 transition-[width]"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    )
                                )}
                                {item.status === 'downloading' && item.total > 0 && (
                                    <div className="mt-1 text-[10px] opacity-50 font-mono">
                                        {formatBytes(item.received)} / {formatBytes(item.total)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={() => void openDownloadDirectory()}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${isDaylight ? 'bg-black/[0.06] hover:bg-black/[0.1]' : 'bg-white/[0.08] hover:bg-white/[0.14]'}`}
                    >
                        <FolderOpen size={12} />
                        {t('download.openFolder')}
                    </button>
                    <button
                        onClick={() => {
                            clearFinished();
                            persistDownloadQueue();
                        }}
                        disabled={clearable === 0}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${isDaylight ? 'bg-black/[0.06] hover:bg-black/[0.1]' : 'bg-white/[0.08] hover:bg-white/[0.14]'}`}
                    >
                        <Trash2 size={12} />
                        {t('download.clearFinished')}
                    </button>
                    <button
                        onClick={onHide}
                        className={`shrink-0 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${isDaylight ? 'bg-black/[0.06] hover:bg-black/[0.1]' : 'bg-white/[0.08] hover:bg-white/[0.14]'}`}
                        title={t('download.hide')}
                    >
                        <Download size={12} />
                        {t('download.hide')}
                    </button>
                </div>
            </div>
        </DraggableDebugWindow>
    );
};

export default DownloadProgressWindow;
