import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, LogIn, LogOut, UserRound } from 'lucide-react';
import { AnimatePresence, motion, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { OnlineProviderId, ProviderAccountSummary } from '../../../../types/onlineMusic';
import { canSwitchToProviderDirectly } from '../../../core/model/onlineProviderAccountView';
import { canLogoutProvider } from '../../../core/model/accountRules';
import { playerBottomBarLiveOffset } from '../../../../stores/motionSignals';
import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    resolvePlayerBottomComponentBottomPx,
} from '../../../../utils/playerBottomBarLayout';

// src/library/suites/grid/account/OnlineProviderSwitcher.tsx

type OnlineProviderSwitcherProps = {
    providers: ProviderAccountSummary[];
    activeProviderId: OnlineProviderId;
    isDaylight: boolean;
    onSelect: (provider: ProviderAccountSummary) => void;
    onLogout: (provider: ProviderAccountSummary) => void;
    onBackToPlayer: () => void;
};

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    spotify: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.215.353-.674.466-1.026.251-2.812-1.718-6.353-2.107-10.523-1.154-.403.092-.803-.16-.895-.563-.092-.403.16-.803.563-.895 4.568-1.044 8.49-.606 11.63 1.335.353.215.466.674.251 1.026zm1.468-3.262c-.27.441-.849.582-1.29.312-3.218-1.978-8.125-2.55-11.932-1.393-.497.151-1.027-.133-1.178-.63-.151-.497.133-1.027.63-1.178 4.353-1.322 9.774-.683 13.458 1.599.441.27.582.849.312 1.29zm.126-3.41c-3.859-2.292-10.228-2.503-13.906-1.386-.593.18-1.223-.154-1.403-.747-.18-.593.154-1.223.747-1.403 4.232-1.285 11.274-1.04 15.698 1.587.533.317.708 1.009.392 1.542-.317.533-1.009.708-1.542.392z" />
        </svg>
    ),
    youtube: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    ),
    zing: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
            <path d="M4 17.5h6.8v-1.8l-3.8-4.4h3.6V9.5H4v1.8l3.8 4.4H4v1.8zm11.5-6a2.5 2.5 0 0 0-2.5 2.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5v-6.5h2.5V6H15.5v5.5z" />
        </svg>
    ),
};

// 在线平台使用统一的纯色圆形文字徽章。
const AVATAR_BADGE_BY_PROVIDER: Record<string, { label: string; iconUrl?: string; className: string }> = {
    netease: { label: '云', className: 'bg-red-600' },
    kugou: { label: 'K', className: 'bg-blue-600' },
    qq: { label: 'Q', className: 'bg-green-600' },
    bodian: { label: '波', className: 'bg-teal-600' },
    zing: { label: 'Z', className: 'bg-[#6A35FF]' },
    spotify: { label: 'S', className: 'bg-[#1DB954]' },
    youtube: { label: 'Y', className: 'bg-[#FF0000]' },
};

// Providers without a builtin badge (Folium mod sources) get their name's first letter, like the
// connect panel, rather than a person icon that reads as an account.
const fallbackBadge = (provider: ProviderAccountSummary) => ({
    label: Array.from(provider.shortName)[0] ?? '',
    className: 'bg-zinc-600',
});

const ProviderAvatar = ({ provider, className }: { provider: ProviderAccountSummary; className: string }) => {
    const badge = AVATAR_BADGE_BY_PROVIDER[provider.providerId] ?? fallbackBadge(provider);
    const customIcon = PROVIDER_ICONS[provider.providerId];
    return provider.user?.avatarUrl
        ? <img src={typeof window !== 'undefined' && window.electron ? provider.user.avatarUrl : provider.user.avatarUrl.replace(/^http:/, 'https:')} alt={provider.user.nickname} className={`${className} object-cover`} />
        : (
            <span
                aria-label={provider.displayName}
                className={`${className} flex items-center justify-center overflow-hidden font-black text-white ${badge.className}`}
            >
                {badge.iconUrl
                    ? <img src={badge.iconUrl} alt="" aria-hidden="true" className="h-3/5 w-3/5 object-contain" />
                    : customIcon || badge.label || <UserRound size={20} />}
            </span>
        );
};

const OnlineProviderSwitcher: React.FC<OnlineProviderSwitcherProps> = ({
    providers,
    activeProviderId,
    isDaylight,
    onSelect,
    onLogout,
    onBackToPlayer,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [showProviderLabel, setShowProviderLabel] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const baseBottomPxRef = useRef(16);
    const previousProviderIdRef = useRef(activeProviderId);
    const visibleProviders = providers.filter(provider => provider.availability.reason !== 'runtime-unavailable');
    const activeProvider = visibleProviders.find(provider => provider.providerId === activeProviderId) || visibleProviders[0];
    const surfaceClass = isDaylight ? 'bg-white text-zinc-900' : 'bg-zinc-950 text-white';

    /**
     * 默认高度保留原 CSS（`bottom-4 md:bottom-6`），只有真的产生抬升量时才写内联 bottom。
     *
     * 不是洁癖：把位置常驻交给 motion 的 style 会给这一层加上 will-change，元素被提升成
     * 独立合成层，文字栅格化随之改变 —— app.screenshot 的 local-library 基线能直接照出来。
     */
    const syncBottomOffset = useCallback((globalOffsetPx: number) => {
        const root = rootRef.current;
        if (!root) return;
        if (globalOffsetPx === PLAYER_BOTTOM_BAR_BASE_OFFSET_PX) {
            root.style.removeProperty('bottom');
            return;
        }
        root.style.bottom = `${resolvePlayerBottomComponentBottomPx(globalOffsetPx, baseBottomPxRef.current)}px`;
    }, []);

    useMotionValueEvent(playerBottomBarLiveOffset, 'change', syncBottomOffset);

    /** 先撤掉内联值量回 CSS 里的原始底距（断点会改它），再按当前抬升量重写。 */
    const measureAndSync = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;
        root.style.removeProperty('bottom');
        const measured = Number.parseFloat(getComputedStyle(root).bottom);
        baseBottomPxRef.current = Number.isFinite(measured) ? measured : 16;
        syncBottomOffset(playerBottomBarLiveOffset.get());
    }, [syncBottomOffset]);

    /**
     * 用 callback ref 而不是挂载时的 layout effect：providers 还没到位时下面会 return null，
     * 那一次 effect 拿到的 ref 是空的，而它不会再跑第二遍 —— 切换器就会一直停在原位，
     * 底部其他组件却已经抬起来了。节点真正出现时才量，才不会有这个空窗。
     */
    const setRootNode = useCallback((node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (node) {
            measureAndSync();
        }
    }, [measureAndSync]);

    // 断点跨过去时 CSS 里的原始底距会变，重量一次。
    useEffect(() => {
        window.addEventListener('resize', measureAndSync);
        return () => window.removeEventListener('resize', measureAndSync);
    }, [measureAndSync]);

    useEffect(() => {
        if (previousProviderIdRef.current === activeProviderId) return;
        previousProviderIdRef.current = activeProviderId;
        setShowProviderLabel(true);
        const hideTimer = window.setTimeout(() => setShowProviderLabel(false), 1800);
        return () => window.clearTimeout(hideTimer);
    }, [activeProviderId]);

    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    if (!activeProvider) return null;

    return (
        <div
            ref={setRootNode}
            data-testid="online-provider-switcher"
            className="pointer-events-auto absolute bottom-4 right-4 z-[100] md:bottom-6 md:right-6"
        >
            <div className={`flex items-center rounded-full p-0.5 shadow-lg md:p-1.5 ${surfaceClass}`}>
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    className={`flex items-center rounded-full gap-0 py-1 pl-1 pr-1 transition-all ${showProviderLabel ? 'md:gap-2 md:pr-3' : 'md:gap-0 md:pr-1'} ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/10'}`}
                    title={t('home.switchOnlineProvider')}
                    aria-label={t('home.switchOnlineProvider')}
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <ProviderAvatar provider={activeProvider} className="h-9 w-9 shrink-0 rounded-full md:h-10 md:w-10" />
                    <AnimatePresence initial={false}>
                        {showProviderLabel && (
                            <motion.span
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 'auto', opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="hidden max-w-16 overflow-hidden whitespace-nowrap text-xs font-semibold md:block"
                            >
                                {activeProvider.shortName}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
                <span className={`mx-1 hidden h-6 w-px md:block ${isDaylight ? 'bg-black/10' : 'bg-white/15'}`} aria-hidden="true" />
                <button
                    type="button"
                    onClick={onBackToPlayer}
                    className={`hidden h-10 w-10 items-center justify-center rounded-full transition-colors md:flex ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/10'}`}
                    title={t('home.backToPlayer')}
                    aria-label={t('home.backToPlayer')}
                >
                    <ChevronRight size={21} />
                </button>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.16 }}
                        className={`absolute bottom-[calc(100%+0.75rem)] right-0 w-72 max-w-[calc(100vw-2rem)] origin-bottom-right rounded-3xl p-3 shadow-2xl md:w-80 ${surfaceClass}`}
                    >
                        <div className="px-3 pb-3 pt-1 text-xs font-medium opacity-50">{t('home.onlineProvider')}</div>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                onBackToPlayer();
                            }}
                            className={`mb-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors md:hidden ${isDaylight ? 'hover:bg-black/8' : 'hover:bg-white/12'}`}
                        >
                            <ChevronRight size={19} />
                            <span className="text-sm font-semibold">{t('home.backToPlayer')}</span>
                        </button>
                        {visibleProviders.map(provider => {
                            const active = provider.providerId === activeProviderId;
                            const configured = provider.availability.configured;
                            const accountless = provider.requiresAccount === false;
                            return (
                                <div
                                    key={provider.providerId}
                                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors last:mb-0 ${active ? (isDaylight ? 'bg-black/5' : 'bg-white/8') : ''} ${configured ? (isDaylight ? 'hover:bg-black/8' : 'hover:bg-white/12') : 'cursor-not-allowed opacity-40'}`}
                                >
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        disabled={!configured}
                                        onClick={() => {
                                            onSelect(provider);
                                            if (canSwitchToProviderDirectly(provider)) setOpen(false);
                                        }}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                    >
                                        <ProviderAvatar
                                            provider={provider}
                                            className={`h-11 w-11 shrink-0 rounded-full border-2 ${active
                                                ? (isDaylight ? 'border-zinc-900' : 'border-white')
                                                : 'border-transparent'}`}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold">{provider.shortName}</span>
                                            <span className="mt-0.5 block truncate text-[11px] opacity-45">{provider.displayName}</span>
                                            <span className="mt-1 block truncate text-xs opacity-65">
                                                {!configured
                                                    ? t('home.providerNotConfigured')
                                                    : accountless
                                                        ? t('home.providerNoAccount')
                                                        : provider.user?.nickname || t('home.providerNotLoggedIn')}
                                            </span>
                                        </span>
                                        {!canSwitchToProviderDirectly(provider) ? <LogIn size={16} className="opacity-55" /> : null}
                                    </button>
                                    {canLogoutProvider(provider, activeProviderId) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOpen(false);
                                                onLogout(provider);
                                            }}
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${isDaylight ? 'hover:bg-black/8' : 'hover:bg-white/12'}`}
                                            title={t('account.logout')}
                                            aria-label={t('account.logout')}
                                        >
                                            <LogOut size={17} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default OnlineProviderSwitcher;
