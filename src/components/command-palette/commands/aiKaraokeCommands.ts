// src/components/command-palette/commands/aiKaraokeCommands.ts
// Command palette integration for Folia AI Karaoke.

import { Mic, Layers } from 'lucide-react';
import { defineCommand } from '../commandFactories';
import type { CommandPaletteCommand, CommandPaletteContext } from '../types';
import { openAiKaraokeModal, openAiKaraokeLibraryModal } from '../../../stores/useAiKaraokeStore';

export const AI_KARAOKE_COMMAND_ID = 'ai-karaoke-separate';
export const AI_KARAOKE_LIBRARY_COMMAND_ID = 'ai-karaoke-library';

export const aiKaraokeCommands: CommandPaletteCommand[] = [
    defineCommand({
        id: AI_KARAOKE_COMMAND_ID,
        group: 'playback',
        title: 'Tách nhạc & Tạo Karaoke AI (MSS / ASR)',
        description: 'Tách giọng hát, nhạc nền beat và tạo file lời bài hát Karaoke nhảy chữ (Enhanced LRC)',
        keywords: [
            'karaoke',
            'ai karaoke',
            'tach nhac',
            'tach vocal',
            'tach beat',
            'tao lrc',
            'enhanced lrc',
            'mdxnet',
            'roformer',
            'whisper',
            'separate',
            'vocal isolation',
        ],
        icon: Mic,
        isAvailable: (context?: CommandPaletteContext) => Boolean(context?.shared.currentSong),
        execute: async (_input, context: CommandPaletteContext) => {
            const { currentSong } = context.shared;
            if (!currentSong) return false;
            openAiKaraokeModal(currentSong);
            return true;
        },
    }),
    defineCommand({
        id: AI_KARAOKE_LIBRARY_COMMAND_ID,
        group: 'playback',
        title: 'Thư viện bài hát đã tách lời AI (Karaoke Stems)',
        description: 'Quản lý, nghe lại Beat/Vocal và xuất lời các bài hát đã tách bằng AI',
        keywords: [
            'karaoke library',
            'thu vien karaoke',
            'bai da tach',
            'stems',
            'stems library',
            'karaoke stems',
            'danh sach tach loi',
            'beat library',
        ],
        icon: Layers,
        isAvailable: () => true,
        execute: async () => {
            openAiKaraokeLibraryModal();
            return true;
        },
    }),
];
