import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownUp, Captions } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useLyricSettingsStore } from '../../stores/useLyricSettingsStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import { openCommandPaletteCommand, setIsPanelOpen } from '../../stores/useAppViewStore';
import { exportCurrentSongLyrics } from '../../services/lyricExport/currentSongExport';
import type { LyricExportFormat } from '../../services/lyricExport/types';
import { hasExportableLyrics } from '../../utils/lyrics/exportableLyrics';
import { LYRIC_EXPORT_COMMAND_ID } from '../command-palette/commands/lyricExportCommands';
import LyricFileDialog from './LyricFileDialog';

// src/components/panelTab/LyricFileButton.tsx
// The lyric-file controls in the lyrics row of the player panel's source tab (local, Navidrome
// and online share it). Hosts the Desktop Mini Lyric Bar toggle and the lyric import/export dialog trigger.

type LyricFileButtonProps = {
    /** Each tab styles its row icons differently; the trigger matches its neighbours. */
    buttonClassName: string;
    isDaylight: boolean;
    /** The tab's existing file-input handler. Left out where the source cannot take an imported file. */
    onImportChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

const LyricFileButton: React.FC<LyricFileButtonProps> = ({ buttonClassName, isDaylight, onImportChange }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isMiniLyricOpen, setIsMiniLyricOpen] = useState(false);
    const electron = window.electron;
    const currentSong = usePlaybackStore(state => state.currentSong);
    const lyrics = usePlaybackStore(state => state.lyrics);
    const canExportCurrent = Boolean(currentSong) && hasExportableLyrics(lyrics);

    useEffect(() => {
        if (!electron) return;
        let active = true;
        void electron.getMiniLyricBarState?.().then(st => {
            if (active && st) setIsMiniLyricOpen(Boolean(st.isOpen));
        });
        return () => {
            active = false;
        };
    }, [electron]);

    const handleToggleMiniLyricBar = async () => {
        if (!electron?.toggleMiniLyricBar) return;
        const res = await electron.toggleMiniLyricBar();
        setIsMiniLyricOpen(Boolean(res));
    };

    const close = useCallback(() => setIsOpen(false), []);

    const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onImportChange?.(event);
        close();
    };

    const exportCurrent = async (format: LyricExportFormat) => {
        if (!currentSong || isExporting) return;
        setIsExporting(true);
        try {
            // Read the stores at click time: the export re-reads the song's raw lyric source, and
            // the source choice may have changed since this row last rendered.
            const exported = await exportCurrentSongLyrics({
                song: currentSong,
                onScreenLyrics: usePlaybackStore.getState().lyrics,
                activeLocalLyricsSource: usePlaybackStore.getState().activeLocalLyricsSource,
                localLyricsPriority: useLyricSettingsStore.getState().localLyricsPriority,
            }, format);
            setStatusMessage({
                type: exported ? 'success' : 'info',
                text: exported ? t('lyricExport.exported') : t('lyricExport.noLyrics'),
            });
            if (exported) close();
        } catch (error) {
            console.error('[LyricFileButton] Export failed', error);
            setStatusMessage({ type: 'error', text: t('lyricExport.failed') });
        } finally {
            setIsExporting(false);
        }
    };

    const openBatchExport = () => {
        close();
        openCommandPaletteCommand(LYRIC_EXPORT_COMMAND_ID);
        // Same hand-off as the segmentation toggle in AppearanceSection: the palette takes over,
        // so the panel underneath gets out of the way.
        setIsPanelOpen(false);
    };

    return (
        <>
            {electron?.toggleMiniLyricBar && (
                <button
                    type="button"
                    onClick={() => void handleToggleMiniLyricBar()}
                    className={`${buttonClassName} ${isMiniLyricOpen ? 'text-emerald-400 opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    title={t('ui.miniLyricBar', 'Desktop Mini Lyric Bar')}
                    aria-label={t('ui.miniLyricBar', 'Desktop Mini Lyric Bar')}
                >
                    <Captions size={14} />
                </button>
            )}
            <button
                type="button"
                data-ponder-panel-source-lyrics-file
                onClick={() => setIsOpen(true)}
                className={buttonClassName}
                title={t('lyricFile.button')}
                aria-label={t('lyricFile.button')}
                aria-haspopup="dialog"
            >
                <ArrowDownUp size={14} />
            </button>
            <LyricFileDialog
                isOpen={isOpen}
                onClose={close}
                isDaylight={isDaylight}
                onImportChange={onImportChange ? handleImportChange : undefined}
                canExportCurrent={canExportCurrent}
                isExporting={isExporting}
                onExportCurrent={format => void exportCurrent(format)}
                onOpenBatchExport={openBatchExport}
            />
        </>
    );
};

export default LyricFileButton;
