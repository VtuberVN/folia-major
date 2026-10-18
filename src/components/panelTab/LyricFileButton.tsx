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
import { openVisualLrcEditor } from '../../stores/useLrcEditorStore';
import { formatLrcTimestamp } from '../../utils/lyrics/lrcSerializer';
import LyricFileDialog from './LyricFileDialog';
import { PanelButton } from './shell/PanelButton';

// src/components/panelTab/LyricFileButton.tsx
// The lyric-file controls in the lyrics row of the player panel's source tab (local, Navidrome
// and online share it). Hosts the Desktop Mini Lyric Bar toggle and the lyric import/export dialog trigger.

type LyricFileButtonProps = {
    isDaylight: boolean;
    /** Takes the text of the chosen file. Left out where the source cannot take an imported file. */
    onImportLyrics?: (content: string, fileName: string) => void;
};

const LyricFileButton: React.FC<LyricFileButtonProps> = ({ isDaylight, onImportLyrics }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isMiniLyricOpen, setIsMiniLyricOpen] = useState(false);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const electron = window.electron;
    const currentSong = usePlaybackStore(state => state.currentSong);
    const lyrics = usePlaybackStore(state => state.lyrics);
    const canExportCurrent = Boolean(currentSong) && hasExportableLyrics(lyrics);

    useEffect(() => {
        if (!electron) return;
        let active = true;
        void electron.getMiniLyricBarState?.().then(st => {
            if (active && st) {
                setIsMiniLyricOpen(Boolean(st.isOpen));
                setIsClickThrough(Boolean(st.clickThrough));
            }
        });
        const unsub = electron.onMiniLyricBarClickThroughChanged?.((enabled) => {
            if (active) setIsClickThrough(enabled);
        });
        return () => {
            active = false;
            unsub?.();
        };
    }, [electron]);

    const handleToggleMiniLyricBar = async () => {
        if (!electron?.toggleMiniLyricBar) return;
        const res = await electron.toggleMiniLyricBar();
        setIsMiniLyricOpen(Boolean(res));
    };

    const close = useCallback(() => setIsOpen(false), []);

    const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Emptied, so that choosing the same file again is a change too.
        event.target.value = '';
        close();
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const content = reader.result as string | null;
            if (content) {
                onImportLyrics?.(content, file.name);
            }
        };
        reader.readAsText(file);
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

    const handleOpenVisualLrcEditor = () => {
        close();
        setIsPanelOpen(false);
        const rawLrc = lyrics?.lines?.map(l => `[${formatLrcTimestamp(l.startTime)}]${l.fullText}`).join('\n') || '';
        openVisualLrcEditor(currentSong, rawLrc);
    };

    return (
        <>
            {electron?.toggleMiniLyricBar && (
                <PanelButton
                    icon={Captions}
                    onClick={() => void handleToggleMiniLyricBar()}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        if (isMiniLyricOpen && electron?.setMiniLyricBarClickThrough) {
                            const next = !isClickThrough;
                            setIsClickThrough(next);
                            void electron.setMiniLyricBarClickThrough(next);
                            setStatusMessage({
                                type: 'info',
                                text: next
                                    ? t('ui.miniLyricBarLockedToast', 'Đã khóa thanh lời Desktop (nhấp xuyên thấu)')
                                    : t('ui.miniLyricBarUnlockedToast', 'Đã mở khóa thanh lời Desktop (có thể di chuyển)'),
                            });
                        }
                    }}
                    title={`${t('ui.miniLyricBar', 'Desktop Mini Lyric Bar')}${isMiniLyricOpen ? ` (${isClickThrough ? t('ui.miniLyricBarLock', 'Khóa') : t('ui.miniLyricBarUnlock', 'Mở khóa')} · Chuột phải để chuyển)` : ''}`}
                    aria-label={t('ui.miniLyricBar', 'Desktop Mini Lyric Bar')}
                    style={isMiniLyricOpen ? { color: isClickThrough ? '#fbbf24' : '#34d399' } : undefined}
                >
                    {t('ui.miniLyricBarShort', 'Mini Bar')}
                </PanelButton>
            )}
            <PanelButton
                grow
                icon={ArrowDownUp}
                data-ponder-panel-source-lyrics-file
                onClick={() => setIsOpen(true)}
                aria-haspopup="dialog"
            >
                {t('lyricFile.button')}
            </PanelButton>
            <LyricFileDialog
                isOpen={isOpen}
                onClose={close}
                isDaylight={isDaylight}
                onImportChange={onImportLyrics ? handleImportChange : undefined}
                canExportCurrent={canExportCurrent}
                isExporting={isExporting}
                onExportCurrent={format => void exportCurrent(format)}
                onOpenBatchExport={openBatchExport}
                onOpenVisualLrcEditor={handleOpenVisualLrcEditor}
            />
        </>
    );
};

export default LyricFileButton;
