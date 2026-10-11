import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { pillChromeClassesFor as gridChromeClassesFor } from '../../../../components/shared/pillChrome';
import type { ProviderAccountSummary } from '../../../../types/onlineMusic';

// src/library/suites/grid/account/ProviderConnectButton.tsx
// 与 GridViewTabs 同款的胶囊切换：所有平台常驻为徽章，只有选中的一个展开显示操作文案。
// 悬停和点击都能切换展开项；点击已展开的平台才执行登录/切换，所以鼠标是“悬停 + 一次点击”，触屏是两次点按。
// 胶囊宽度一变，其余徽章会滑到静止的指针下：悬停只认真实的指针移动（pointermove），
// 并在每次切换后锁定一小段时间等布局动画落定，避免徽章滑过指针时来回抖动。

type Props = {
    providers: ProviderAccountSummary[];
    isDaylight: boolean;
    getActionLabel: (provider: ProviderAccountSummary) => string;
    onSelect: (provider: ProviderAccountSummary) => void;
};

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    youtube: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    ),
    zing: (
        <svg viewBox="0 0 24 24" className="h-4/5 w-4/5" fill="none">
            <circle cx="12" cy="12" r="11" fill="#FFFFFF" />
            <circle cx="12" cy="12" r="10" fill="#18181b" />
            <path d="M12 12 L9.54 2.82 A9.5 9.5 0 0 1 21.35 10.35 Z" fill="#43B03C" />
            <path d="M12 12 L21.35 10.35 A9.5 9.5 0 0 1 14.46 21.18 Z" fill="#F37321" />
            <path d="M12 12 L14.46 21.18 A9.5 9.5 0 0 1 2.82 14.46 Z" fill="#E51D73" />
            <path d="M12 12 L2.82 14.46 A9.5 9.5 0 0 1 9.54 2.82 Z" fill="#00A4E4" />
            <path d="M6.2 14.2 A6.5 6.5 0 0 1 8.2 8.5" stroke="#FFFFFF" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
            <path d="M7.4 13.8 A5.2 5.2 0 0 1 9.2 9.2" stroke="#FFFFFF" strokeWidth="0.6" strokeLinecap="round" opacity="0.9" />
            <path d="M17.8 9.8 A6.5 6.5 0 0 1 15.8 15.5" stroke="#FFFFFF" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
            <path d="M16.6 10.2 A5.2 5.2 0 0 1 14.8 14.8" stroke="#FFFFFF" strokeWidth="0.6" strokeLinecap="round" opacity="0.9" />
            <circle cx="12" cy="12" r="2.8" fill="#FFFFFF" />
            <circle cx="12" cy="12" r="1.3" fill="#6A35FF" />
        </svg>
    ),
    nct: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5.5 13c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm3 2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm2.5 1.5c-.55 0-1-.45-1-1V5.5c0-.55.45-1 1-1s1 .45 1 1v13c0 .55-.45 1-1 1zm3-1.5c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm3-2c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1z" />
        </svg>
    ),
};
PROVIDER_ICONS['folium.youtube-provider.youtube'] = PROVIDER_ICONS.youtube;

// 在线平台使用统一的纯色圆形文字徽章；Mod 音源取名称首字。
const badges: Record<string, [string, string]> = {
    netease: ['云', 'bg-red-500'],
    kugou: ['K', 'bg-blue-500'],
    qq: ['Q', 'bg-emerald-500'],
    bodian: ['波', 'bg-teal-500'],
    zing: ['Z', 'bg-[#6A35FF]'],
    nct: ['N', 'bg-[#00D3E5]'],
    youtube: ['Y', 'bg-red-600'],
    'folium.youtube-provider.youtube': ['Y', 'bg-red-600'],
};

const SPRING = { type: 'spring', stiffness: 460, damping: 36, mass: 0.9 } as const;
// 与 SPRING 的落定时间大致对齐；锁定期间的悬停不切换展开项。
const HOVER_SWITCH_LOCK_MS = 220;

export default function ProviderConnectButton({ providers, isDaylight, getActionLabel, onSelect }: Props) {
    const { t } = useTranslation();
    const highlightId = useId();
    const calm = useReducedMotionFor('uiMicroMotion');
    const transition = calm ? { duration: 0 } : SPRING;
    const chrome = gridChromeClassesFor(isDaylight);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const hoverLockedUntil = useRef(0);
    const visible = providers.filter(provider => provider.availability.reason !== 'runtime-unavailable');
    // 选中项被移除（如 Mod 卸载）时回落到第一个可用平台。
    const selected = visible.find(provider => provider.providerId === selectedId)
        ?? visible.find(provider => provider.availability.configured)
        ?? visible[0];

    return (
        <div
            role="group"
            aria-label={t('home.connectPlatformAccounts')}
            className={`hide-scrollbar flex h-[52px] max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1.5 backdrop-blur-md ${chrome.pill}`}
        >
            {visible.map(provider => {
                const active = provider.providerId === selected?.providerId;
                const configured = provider.availability.configured;
                const label = getActionLabel(provider);
                const [badge, color] = badges[provider.providerId]
                    ?? [Array.from(provider.shortName || provider.displayName)[0] || '?', isDaylight ? 'bg-zinc-500' : 'bg-zinc-600'];
                return (
                    <motion.button
                        key={provider.providerId}
                        layout
                        transition={transition}
                        type="button"
                        aria-label={label}
                        aria-current={active ? 'true' : undefined}
                        // 展开项本身已经显示文案，其余徽章需要可悬停查看的名字。
                        title={active ? undefined : label}
                        disabled={active && !configured}
                        onPointerMove={event => {
                            if (active || event.pointerType === 'touch' || performance.now() < hoverLockedUntil.current) return;
                            hoverLockedUntil.current = performance.now() + (calm ? 0 : HOVER_SWITCH_LOCK_MS);
                            setSelectedId(provider.providerId);
                        }}
                        onClick={() => {
                            if (!active) setSelectedId(provider.providerId);
                            else if (configured) onSelect(provider);
                        }}
                        className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-full text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed ${
                            active ? `pl-1.5 pr-5 ${chrome.strongText}` : `w-10 justify-center ${chrome.softText}`
                        }`}
                    >
                        {active && (
                            <motion.span
                                layoutId={highlightId}
                                transition={transition}
                                className={`absolute inset-0 rounded-full ${chrome.activePill}`}
                            />
                        )}
                        {(() => {
                            const customIcon = PROVIDER_ICONS[provider.providerId];
                            return (
                                <span
                                    aria-hidden="true"
                                    className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold leading-none text-white transition-opacity ${color} ${
                                        !configured ? 'opacity-35 grayscale' : active ? '' : 'opacity-75'
                                    }`}
                                >
                                    {customIcon || badge}
                                </span>
                            );
                        })()}
                        {active && (
                            <motion.span
                                key={provider.providerId}
                                initial={calm ? false : { opacity: 0 }}
                                animate={{ opacity: configured ? 1 : 0.4 }}
                                transition={{ duration: calm ? 0 : 0.18, delay: calm ? 0 : 0.06 }}
                                aria-live="polite"
                                className="relative whitespace-nowrap"
                            >{label}</motion.span>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}
