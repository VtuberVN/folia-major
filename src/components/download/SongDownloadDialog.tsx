// src/components/download/SongDownloadDialog.tsx
// Lets the listener pick which songs of a playlist/album to save to disk. Select-all plus a
// per-song checkbox; the actual transfer is handled by songDownloadService.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, Loader2, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { startSongDownloads } from '../../services/songDownloadService';
import type { SongResult } from '../../types';

interface SongDownloadDialogProps {
    isOpen: boolean;
    songs: SongResult[];
    onClose: () => void;
    theme?: { secondaryColor?: string } | null;
}

const songArtists = (song: SongResult): string =>
    (song.artists || []).map((artist) => artist?.name).filter(Boolean).join(', ');

const SongDownloadDialog: React.FC<SongDownloadDialogProps> = ({ isOpen, songs, onClose, theme }) => {
    const { t } = useTranslation();
    const audioQuality = useAudioSettingsStore((state) => state.audioQuality);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSelected(new Set());
            setStarting(false);
        }
    }, [isOpen]);

    const allSelected = songs.length > 0 && selected.size === songs.length;

    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(songs.map((song) => String(song.id))));
    };

    const toggleSong = (id: string) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectedSongs = useMemo(
        () => songs.filter((song) => selected.has(String(song.id))),
        [songs, selected],
    );

    const handleStart = () => {
        if (selectedSongs.length === 0) return;
        setStarting(true);
        void startSongDownloads(selectedSongs, audioQuality).finally(() => setStarting(false));
        onClose();
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        onClick={(event) => event.stopPropagation()}
                        className="w-[min(30rem,calc(100vw-2rem))] max-h-[min(38rem,calc(100vh-2rem))] flex flex-col rounded-2xl border shadow-2xl overflow-hidden theme-glass-panel"
                        style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border-primary, rgba(255,255,255,0.12))' }}
                    >
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderBottomColor: 'var(--border-primary, rgba(255,255,255,0.12))' }}>
                            <div className="flex items-center gap-2">
                                <Download size={16} />
                                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {t('download.selectSongs')}
                                </span>
                            </div>
                            <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label={t('ui.cancel')}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b text-xs" style={{ borderBottomColor: 'var(--border-primary, rgba(255,255,255,0.08))', color: 'var(--text-secondary)' }}>
                            <span>{t('download.songCount', { count: songs.length })}</span>
                            <button
                                onClick={toggleAll}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-colors"
                                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-color)' }}
                            >
                                {allSelected ? <Square size={12} /> : <Check size={12} />}
                                {allSelected ? t('download.deselectAll') : t('download.selectAll')}
                            </button>
                        </div>

                        <div data-wheel-scroll-region className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
                            {songs.map((song) => {
                                const id = String(song.id);
                                const isChecked = selected.has(id);
                                return (
                                    <button
                                        key={id}
                                        onClick={() => toggleSong(id)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors hover:bg-white/5"
                                    >
                                        <span
                                            className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                            style={{
                                                borderColor: isChecked ? (theme?.secondaryColor || 'var(--text-primary)') : 'var(--border-primary, rgba(255,255,255,0.3))',
                                                backgroundColor: isChecked ? (theme?.secondaryColor || 'var(--text-primary)') : 'transparent',
                                            }}
                                        >
                                            {isChecked && <Check size={11} color="var(--bg-color)" strokeWidth={3} />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                                {song.name}
                                            </span>
                                            <span className="block text-[11px] truncate opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                                {songArtists(song) || '—'}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t" style={{ borderTopColor: 'var(--border-primary, rgba(255,255,255,0.12))' }}>
                            <span className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }}>
                                {t('download.selectedCount', { count: selectedSongs.length })}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-full text-xs font-semibold bg-zinc-500/10 hover:bg-zinc-500/20 transition-colors"
                                >
                                    {t('ui.cancel')}
                                </button>
                                <button
                                    onClick={handleStart}
                                    disabled={selectedSongs.length === 0 || starting}
                                    className="px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-transform hover:scale-102 active:scale-98"
                                    style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-color)' }}
                                >
                                    {starting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                    {t('download.start')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
};

export default SongDownloadDialog;
