// src/stores/useSongUnlockSettingsStore.ts
// Cài đặt mở khóa bài hát (VIP / bản quyền giới hạn) từ yigexuanmu.

import { create } from 'zustand';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import type { UnlockServerConfig } from '../types';

export const USE_SONG_UNLOCK_STORAGE_KEY = 'use_song_unlock';
export const SONG_UNLOCK_SERVERS_STORAGE_KEY = 'song_unlock_servers';

const DEFAULT_UNLOCK_SERVERS: UnlockServerConfig[] = [
    { key: 'netease', enabled: true },
    { key: 'bodian', enabled: true },
    { key: 'kuwo', enabled: false },
];

const readStoredServers = (): UnlockServerConfig[] => {
    try {
        if (typeof window === 'undefined') return [...DEFAULT_UNLOCK_SERVERS];
        const stored = localStorage.getItem(SONG_UNLOCK_SERVERS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as UnlockServerConfig[];
            if (Array.isArray(parsed) && parsed.length) {
                return DEFAULT_UNLOCK_SERVERS.map((server) => {
                    const storedServer = parsed.find((entry) => entry.key === server.key);
                    return storedServer ? { key: server.key, enabled: storedServer.enabled } : server;
                });
            }
        }
    } catch {
        // Fallback default
    }
    return [...DEFAULT_UNLOCK_SERVERS];
};

interface SongUnlockSettingsState {
    useSongUnlock: boolean;
    songUnlockServers: UnlockServerConfig[];
    handleToggleSongUnlock: (enable: boolean) => void;
    handleToggleSongUnlockServer: (key: string, enabled: boolean) => void;
}

export const useSongUnlockSettingsStore = create<SongUnlockSettingsState>()((set, get) => ({
    useSongUnlock: getStoredBoolean(USE_SONG_UNLOCK_STORAGE_KEY, true),
    songUnlockServers: readStoredServers(),

    handleToggleSongUnlock: (enable) => {
        set({ useSongUnlock: enable });
        setStoredBoolean(USE_SONG_UNLOCK_STORAGE_KEY, enable);
    },

    handleToggleSongUnlockServer: (key, enabled) => {
        const servers = get().songUnlockServers.map((server) =>
            server.key === key ? { ...server, enabled } : server,
        );
        set({ songUnlockServers: servers });
        try {
            if (typeof window !== 'undefined') {
                localStorage.setItem(SONG_UNLOCK_SERVERS_STORAGE_KEY, JSON.stringify(servers));
            }
        } catch {
            // Memory fallback
        }
    },
}));
