import React, { useEffect } from 'react';
import { Crosshair, Download, Home as HomeIcon, Mic, Settings, Sparkles, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayingFromCollection } from '../../app/playing-song-locator/usePlayingFromCollection';
import { openAddToPlaylist, useAddToPlaylistStore } from '../../../stores/useAddToPlaylistStore';
import { openAiKaraokeModal, useAiKaraokeStore } from '../../../stores/useAiKaraokeStore';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { startSongDownloads } from '../../../services/songDownloadService';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';
import { Tooltip } from '../../modal/settings/kit/Tooltip';
import { LikeButton, type SongLike } from './LikeButton';
import { PanelIconButton } from './PanelIconButton';
import type { SongResult } from '../../../types';

// src/components/panelTab/shell/SongActions.tsx
// The row under the song's title on the cover tab, always in view: like, add to a playlist, the
// collection the queue is playing from, and at the right the way home and the options.

type SongActionsProps = {
    like: SongLike;
    currentSong?: SongResult | null;
    /** Finds the playing song on its collection's page. */
    onLocatePlayingSong: () => void;
    onNavigateHome: () => void;
    onOpenSettings?: () => void;
};

const SongActions: React.FC<SongActionsProps> = ({ like, currentSong, onLocatePlayingSong, onNavigateHome, onOpenSettings }) => {
    const { t } = useTranslation();
    // Answered by AddToPlaylistHost, which owns the picker now: the same question is asked by a
    // command that can fire with this panel closed, so it cannot be derived from panel props.
    const addToPlaylist = useAddToPlaylistStore(state => state.availability);
    // The collection the queue was started from, for as long as the queue is still of its songs.
    const playingFrom = usePlayingFromCollection();
    const playingFromLabel = playingFrom ? t('ui.playingFrom', { name: playingFrom.name }) : '';

    const isKaraokeBeatMode = useAiKaraokeStore(state => state.isKaraokeBeatMode);
    const cachedKaraoke = useAiKaraokeStore(state => state.cachedKaraokeForCurrentSong);
    const toggleKaraokeBeatMode = useAiKaraokeStore(state => state.toggleKaraokeBeatMode);
    const checkCurrentSongKaraoke = useAiKaraokeStore(state => state.checkCurrentSongKaraoke);
    const isJobRunning = useAiKaraokeStore(state => state.jobStage !== 'idle' && state.jobStage !== 'completed' && state.jobStage !== 'error');
    const jobProgress = useAiKaraokeStore(state => state.jobProgress);

    useEffect(() => {
        if (currentSong?.id) {
            void checkCurrentSongKaraoke(currentSong.id);
        }
    }, [currentSong?.id, checkCurrentSongKaraoke]);

    const handleOpenKaraoke = () => {
        const lyricsState = usePlaybackStore.getState().lyrics;
        const initialLyrics = lyricsState?.lines
            ?.map((l) => (l.fullText || (l.words || []).map((w) => w.text).join('') || '').trim())
            .filter(Boolean)
            .join('\n') || '';
        openAiKaraokeModal(currentSong, initialLyrics);
    };

    return (
        <div className="mt-3.5 flex items-center gap-1.5">
            <LikeButton like={like} filled />
            {addToPlaylist.isApplicable && (
                <PanelIconButton
                    label={addToPlaylist.disabledReason || t('localMusic.addToPlaylist')}
                    filled
                    disabled={!addToPlaylist.canAdd}
                    onClick={openAddToPlaylist}
                >
                    <Star size={17} />
                </PanelIconButton>
            )}
            {currentSong && isJobRunning ? (
                <Tooltip text={`Đang tách lời & nhạc (${jobProgress}%) · Bấm để xem chi tiết`} className="inline-flex shrink-0">
                    <button
                        type="button"
                        onClick={handleOpenKaraoke}
                        className="st-t-fast st-focus-inside flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        style={{ color: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.2)' }}
                    >
                        <Mic size={15} className="animate-pulse shrink-0" />
                        <span className="font-mono text-[11px] font-bold tracking-tight">Tách lời & nhạc: {jobProgress}%</span>
                    </button>
                </Tooltip>
            ) : currentSong && cachedKaraoke ? (
                <>
                    <PanelIconButton
                        label={isKaraokeBeatMode ? t('karaoke.turnOffBeat', 'Đang phát Beat Karaoke (Bấm để trở lại bản gốc)') : t('karaoke.turnOnBeat', 'Bật chế độ Hát Karaoke (Chỉ phát Beat, tắt lời ca sĩ)')}
                        filled
                        onClick={() => void toggleKaraokeBeatMode(currentSong)}
                        style={isKaraokeBeatMode ? { color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)' } : undefined}
                    >
                        <Mic size={17} />
                    </PanelIconButton>
                    <PanelIconButton
                        label={t('karaoke.openKaraokeStudio', 'Cài đặt Karaoke & Visual LRC Studio')}
                        filled
                        onClick={handleOpenKaraoke}
                    >
                        <Sparkles size={17} />
                    </PanelIconButton>
                </>
            ) : currentSong ? (
                <PanelIconButton
                    label={t('karaoke.openKaraoke', 'Tách lời và nhạc & Tạo Lyric (MSS / ASR)')}
                    filled
                    onClick={handleOpenKaraoke}
                >
                    <Mic size={17} />
                </PanelIconButton>
            ) : null}
            {currentSong && (
                <PanelIconButton
                    label={t('download.downloadCurrentSong', 'Tải bài hát này về máy')}
                    filled
                    onClick={() => {
                        const quality = useAudioSettingsStore.getState().audioQuality || 'lossless';
                        void startSongDownloads([currentSong], quality);
                    }}
                >
                    <Download size={17} />
                </PanelIconButton>
            )}
            {/* 这首歌所在的歌单或专辑，点一下回到那一页并找到它的卡片。队列不再是那张歌单的歌时不出现。 */}
            {playingFrom && (
                <Tooltip text={playingFromLabel} className="flex min-w-0">
                    <button
                        type="button"
                        data-panel-locate
                        onClick={onLocatePlayingSong}
                        aria-label={playingFromLabel}
                        className="st-t-fast flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-[var(--st-fill)] pl-2.5 pr-3 text-xs text-[color:var(--st-t2)] transition-colors hover:bg-[var(--st-fill2)] hover:text-[color:var(--st-t1)]"
                    >
                        <Crosshair size={14} className="shrink-0" />
                        <span className="truncate">{playingFrom.name}</span>
                    </button>
                </Tooltip>
            )}
            <span className="min-w-1.5 flex-1" />
            <PanelIconButton label={t('ui.backToHome')} onClick={onNavigateHome}>
                <HomeIcon size={17} />
            </PanelIconButton>
            {onOpenSettings && (
                <PanelIconButton label={t('ui.options')} onClick={onOpenSettings}>
                    <Settings size={17} />
                </PanelIconButton>
            )}
        </div>
    );
};

export default SongActions;
