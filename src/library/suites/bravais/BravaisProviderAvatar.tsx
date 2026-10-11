import React from 'react';

// src/library/suites/bravais/BravaisProviderAvatar.tsx
// fb8（用户实测：首页窄缝的账户入口与平台列表改成 grid 切换器的「图标 / 头像 + 名称」）：已登录的账户显示头像，
// 没有头像时退回平台徽章。徽章与 grid 的切换器（OnlineProviderSwitcher 的 AVATAR_BADGE_BY_PROVIDER）是同一套：
// 纯色圆底 + 一个字（网易云「云」、酷狗「K」、QQ「Q」、波点「波」），其余平台（Folium mod 音源）取名称首字、灰底。
// suite 之间不互相 import，所以这里按 grid 的表抄一份（颜色是 grid 用的 Tailwind 600 档）；两边改时一起改。

const PROVIDER_BADGES: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
    netease: { label: '云', color: '#dc2626' },
    kugou: { label: 'K', color: '#2563eb' },
    qq: { label: 'Q', color: '#16a34a' },
    bodian: { label: '波', color: '#0d9488' },
    zing: {
        label: 'Z',
        color: '#6A35FF',
        icon: (
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
    },
    nct: {
        label: 'N',
        color: '#00D3E5',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5.5 13c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm3 2c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm2.5 1.5c-.55 0-1-.45-1-1V5.5c0-.55.45-1 1-1s1 .45 1 1v13c0 .55-.45 1-1 1zm3-1.5c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v8c0 .55-.45 1-1 1zm3-2c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1z" />
            </svg>
        ),
    },
};

const FALLBACK_BADGE_COLOR = '#52525b';

/** 平台徽章：内置平台用固定的字与颜色，其余取名称首字。 */
export const resolveBravaisProviderBadge = (providerId: string, name: string) => (
    PROVIDER_BADGES[providerId] ?? { label: Array.from(name)[0] ?? '', color: FALLBACK_BADGE_COLOR }
);

/** 网页版把 http 的头像换成 https（与 grid 的切换器一致，避免混合内容被拦）；桌面版原样。 */
const resolveAvatarSrc = (url: string) => (typeof window !== 'undefined' && window.electron ? url : url.replace(/^http:/, 'https:'));

/**
 * 头像或平台徽章（圆形，尺寸由 className 定）。装饰性的：可访问名由外面的按钮给，这里 aria-hidden。
 * `data-bravais-account-avatar` 标出画的是哪一种（image / badge），用例按它判断。
 */
const BravaisProviderAvatar: React.FC<{ providerId: string; name: string; avatarUrl: string | null; className?: string }> = ({
    providerId,
    name,
    avatarUrl,
    className,
}) => {
    if (avatarUrl) {
        return <img className={`bravais-account-avatar${className ? ` ${className}` : ''}`} src={resolveAvatarSrc(avatarUrl)} alt="" aria-hidden
            draggable={false} data-bravais-account-avatar="image" />;
    }
    const badge = resolveBravaisProviderBadge(providerId, name);
    return (
        <span className={`bravais-account-avatar is-badge${className ? ` ${className}` : ''} flex items-center justify-center`} style={{ backgroundColor: badge.color }} aria-hidden
            data-bravais-account-avatar="badge">
            {badge.icon || badge.label}
        </span>
    );
};

export default BravaisProviderAvatar;
