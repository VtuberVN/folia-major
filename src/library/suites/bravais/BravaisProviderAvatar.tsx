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
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
                <path d="M4 17.5h6.8v-1.8l-3.8-4.4h3.6V9.5H4v1.8l3.8 4.4H4v1.8zm11.5-6a2.5 2.5 0 0 0-2.5 2.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5v-6.5h2.5V6H15.5v5.5z" />
            </svg>
        ),
    },
    spotify: {
        label: 'S',
        color: '#1DB954',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.215.353-.674.466-1.026.251-2.812-1.718-6.353-2.107-10.523-1.154-.403.092-.803-.16-.895-.563-.092-.403.16-.803.563-.895 4.568-1.044 8.49-.606 11.63 1.335.353.215.466.674.251 1.026zm1.468-3.262c-.27.441-.849.582-1.29.312-3.218-1.978-8.125-2.55-11.932-1.393-.497.151-1.027-.133-1.178-.63-.151-.497.133-1.027.63-1.178 4.353-1.322 9.774-.683 13.458 1.599.441.27.582.849.312 1.29zm.126-3.41c-3.859-2.292-10.228-2.503-13.906-1.386-.593.18-1.223-.154-1.403-.747-.18-.593.154-1.223.747-1.403 4.232-1.285 11.274-1.04 15.698 1.587.533.317.708 1.009.392 1.542-.317.533-1.009.708-1.542.392z" />
            </svg>
        ),
    },
    youtube: {
        label: 'Y',
        color: '#FF0000',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3/5 w-3/5">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
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
