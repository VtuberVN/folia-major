import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme, UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import {
    type SearchSource,
    useSearchNavigationStore,
} from '../../../stores/useSearchNavigationStore';
import SearchResultsList from './SearchResultsList';
import { useCollectionNavigationStore } from '../../../stores/useCollectionNavigationStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { omni } from '../../../services/onlineMusic/omni';
import { hasSpotifyClientId } from '../../../services/onlineMusic/spotify/spotifyAuth';

// src/components/app/search/SearchWorkspace.tsx

type SearchWorkspaceProps = {
    theme: Theme;
    isDaylight: boolean;
    onClose: () => void;
    onSubmitSearch: (source?: SearchSource) => void;
    onLoadMore: () => void;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
    /**
     * 渲染前把结果重新套上当前的展示数据（本地曲目的歌手 / 专辑实体）。store 里的结果是提交那一刻的快照，
     * 本地曲库的实体目录在导入后要晚一拍才加载完，那之前搜到的行没有专辑、歌手链接是灰的；
     * 不在这里按当前目录重算，它们会一直停在那个状态，直到重新搜索。
     */
    resolveTrackDisplay?: (track: UnifiedSong) => UnifiedSong;
};

const SearchWorkspace: React.FC<SearchWorkspaceProps> = ({
    theme,
    isDaylight,
    onClose,
    onSubmitSearch,
    onLoadMore,
    onPlayTrack,
    onAddTrackToQueue,
    onOpenArtist,
    onOpenAlbum,
    resolveTrackDisplay,
}) => {
    const { t } = useTranslation();
    const {
        searchQuery,
        searchSourceTab,
        searchResults,
        isSearchOpen,
        isSearching,
        isLoadingMore,
        searchError,
        hasMore,
        scrollTop,
        setSearchQuery,
        setSearchScrollTop,
    } = useSearchNavigationStore(useShallow(state => ({
        searchQuery: state.searchQuery,
        searchSourceTab: state.searchSourceTab,
        searchResults: state.searchResults,
        isSearchOpen: state.isSearchOpen,
        isSearching: state.isSearching,
        isLoadingMore: state.isLoadingMore,
        searchError: state.searchError,
        hasMore: state.hasMore,
        scrollTop: state.scrollTop,
        setSearchQuery: state.setSearchQuery,
        setSearchScrollTop: state.setSearchScrollTop,
    })));
    const results = useMemo(() => {
        const raw = searchResults || [];
        return resolveTrackDisplay ? raw.map(resolveTrackDisplay) : raw;
    }, [resolveTrackDisplay, searchResults]);
    const activeOnlineProviderId = useOnlineProviderAccountStore(state => state.activeProviderId);
    const sources = useMemo<SearchSource[]>(() => {
        const base: SearchSource[] = [
            'netease',
            'zing',
            'spotify',
            'nct',
            'local',
            'navidrome',
        ];
        if (!base.includes(activeOnlineProviderId)) {
            base.splice(1, 0, activeOnlineProviderId);
        }
        return base;
    }, [activeOnlineProviderId]);
    const hasCollection = useCollectionNavigationStore(state => Boolean(state.snapshot?.stack.length));
    const getSourceIcon = (source: SearchSource) => {
        switch (source) {
            case 'zing':
                return (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none">
                        <circle cx="12" cy="12" r="11" fill="#FFFFFF" />
                        <circle cx="12" cy="12" r="10" fill="#18181b" />
                        <path d="M12 12 L9.54 2.82 A9.5 9.5 0 0 1 21.35 10.35 Z" fill="#43B03C" />
                        <path d="M12 12 L21.35 10.35 A9.5 9.5 0 0 1 14.46 21.18 Z" fill="#F37321" />
                        <path d="M12 12 L14.46 21.18 A9.5 9.5 0 0 1 2.82 14.46 Z" fill="#E51D73" />
                        <path d="M12 12 L2.82 14.46 A9.5 9.5 0 0 1 9.54 2.82 Z" fill="#00A4E4" />
                        <circle cx="12" cy="12" r="2.8" fill="#FFFFFF" />
                        <circle cx="12" cy="12" r="1.3" fill="#6A35FF" />
                    </svg>
                );
            case 'spotify':
                return (
                    <svg viewBox="0 0 24 24" fill="#1DB954" className="h-3.5 w-3.5 shrink-0">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.215.353-.674.466-1.026.251-2.812-1.718-6.353-2.107-10.523-1.154-.403.092-.803-.16-.895-.563-.092-.403.16-.803.563-.895 4.568-1.044 8.49-.606 11.63 1.335.353.215.466.674.251 1.026zm1.468-3.262c-.27.441-.849.582-1.29.312-3.218-1.978-8.125-2.55-11.932-1.393-.497.151-1.027-.133-1.178-.63-.151-.497.133-1.027.63-1.178 4.353-1.322 9.774-.683 13.458 1.599.441.27.582.849.312 1.29zm.126-3.41c-3.859-2.292-10.228-2.503-13.906-1.386-.593.18-1.223-.154-1.403-.747-.18-.593.154-1.223.747-1.403 4.232-1.285 11.274-1.04 15.698 1.587.533.317.708 1.009.392 1.542-.317.533-1.009.708-1.542.392z" />
                    </svg>
                );
            case 'nct':
                return (
                    <svg viewBox="0 0 24 24" fill="#00D3E5" className="h-3.5 w-3.5 shrink-0">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5.5 13c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm3 2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm2.5 1.5c-.55 0-1-.45-1-1V5.5c0-.55.45-1 1-1s1 .45 1 1v13c0 .55-.45 1-1 1zm3-1.5c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm3-2c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1z" />
                    </svg>
                );
            case 'netease':
                return (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white leading-none">
                        云
                    </span>
                );
            default:
                return null;
        }
    };

    const getSourceLabel = (source: SearchSource) => {
        if (source === 'local') return t('search.sourceLocal');
        if (source === 'navidrome') return t('search.sourceNavidrome');
        if (source === 'spotify') return t('search.sourceSpotify', { defaultValue: 'Spotify' });
        if (source === 'zing') return t('search.sourceZing', { defaultValue: 'Zing MP3' });
        if (source === 'nct') return t('search.sourceNct', { defaultValue: 'NhacCuaTui' });
        if (source === 'netease') return t('neteaseSource', { defaultValue: 'NetEase' });
        if (source === 'qq') return t('qqSource', { defaultValue: 'QQ Music' });
        if (source === 'kugou') return t('kugouSource', { defaultValue: 'KuGou Music' });
        return omni.getProviderLabel(source);
    };

    useEffect(() => {
        if (!isSearchOpen || hasCollection) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasCollection, isSearchOpen, onClose]);

    return (
        <AnimatePresence>
            {isSearchOpen && (
                <motion.section
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 28 }}
                    className={`fixed inset-0 flex flex-col overflow-hidden px-3 py-4 sm:px-6 sm:py-6 ${
                        hasCollection ? 'z-[5]' : 'z-50'
                    }`}
                    style={{
                        color: theme.primaryColor,
                        backgroundColor: isDaylight ? 'rgba(250,250,250,0.96)' : 'rgba(8,8,10,0.94)',
                        backdropFilter: 'blur(24px)',
                    }}
                >
                    <header className="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <form
                                className={`relative flex-1 rounded-2xl border ${
                                    isDaylight ? 'border-black/10 bg-black/[0.04]' : 'border-white/10 bg-white/[0.05]'
                                }`}
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    onSubmitSearch();
                                }}
                            >
                                {isSearching ? (
                                    <Loader2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin opacity-50" />
                                ) : (
                                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
                                )}
                                <input
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder={t('search.placeholder')}
                                    className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm outline-none"
                                    autoFocus
                                />
                            </form>
                            <button
                                type="button"
                                onClick={onClose}
                                className={`rounded-full p-3 ${
                                    isDaylight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/10 hover:bg-white/15'
                                }`}
                                aria-label={t('ui.backToHome')}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <nav className="flex gap-2 overflow-x-auto pb-1">
                            {sources.map(source => (
                                <button
                                    type="button"
                                    key={source}
                                    onClick={() => {
                                        if (source !== searchSourceTab) {
                                            onSubmitSearch(source);
                                        }
                                    }}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                                        source === searchSourceTab
                                            ? 'shadow-sm'
                                            : isDaylight
                                                ? 'bg-black/5 text-black/60 hover:bg-black/10'
                                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                                    }`}
                                    style={source === searchSourceTab ? {
                                        backgroundColor: theme.accentColor,
                                        color: theme.backgroundColor,
                                    } : undefined}
                                >
                                    {getSourceIcon(source)}
                                    <span>{getSourceLabel(source)}</span>
                                </button>
                            ))}
                        </nav>
                    </header>

                    <div className="mx-auto mt-3 min-h-0 w-full max-w-5xl flex-1">
                        {isSearching ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-9 w-9 animate-spin opacity-45" />
                            </div>
                        ) : searchError && results.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 text-center opacity-65">
                                <AlertCircle size={32} />
                                <p>{t('search.error')}</p>
                                <button
                                    type="button"
                                    onClick={() => onSubmitSearch()}
                                    className="rounded-full border border-current/15 px-4 py-2 text-sm"
                                >
                                    {t('search.retry')}
                                </button>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm opacity-60 text-center px-4">
                                {searchSourceTab === 'spotify' && !hasSpotifyClientId() ? (
                                    <>
                                        <AlertCircle size={32} className="opacity-50 mb-1" />
                                        <p className="font-semibold">{t('spotify.needCredentials')}</p>
                                        <p className="text-xs opacity-75 max-w-md">{t('spotify.needCredentialsHint')}</p>
                                    </>
                                ) : (
                                    <span>{t('home.noResults')}</span>
                                )}
                            </div>
                        ) : (
                            <div className="flex h-full flex-col">
                                <div className="min-h-0 flex-1">
                                    <SearchResultsList
                                        tracks={results}
                                        scrollTop={scrollTop}
                                        isDaylight={isDaylight}
                                        onScrollTopChange={setSearchScrollTop}
                                        onPlayTrack={onPlayTrack}
                                        onAddTrackToQueue={onAddTrackToQueue}
                                        onOpenArtist={onOpenArtist}
                                        onOpenAlbum={onOpenAlbum}
                                    />
                                </div>
                                {searchError ? (
                                    <div className="flex shrink-0 items-center justify-center gap-3 py-3 text-sm">
                                        <span className="opacity-60">{t('search.error')}</span>
                                        <button
                                            type="button"
                                            disabled={isLoadingMore}
                                            onClick={onLoadMore}
                                            className="rounded-full border border-current/15 px-4 py-2 disabled:opacity-50"
                                        >
                                            {t('search.retry')}
                                        </button>
                                    </div>
                                ) : hasMore && (
                                    <div className="flex shrink-0 justify-center py-3">
                                        <button
                                            type="button"
                                            disabled={isLoadingMore}
                                            onClick={onLoadMore}
                                            className={`rounded-full border px-5 py-2 text-sm disabled:opacity-50 ${
                                                isDaylight
                                                    ? 'border-black/10 bg-black/5 hover:bg-black/10'
                                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                                            }`}
                                        >
                                            {isLoadingMore ? t('localMusic.searching') : t('home.loadMore')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.section>
            )}
        </AnimatePresence>
    );
};

export default SearchWorkspace;
