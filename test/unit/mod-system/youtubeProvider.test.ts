import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { validateManifest } = require('../../../electron/modSystem/manifest.cjs');

const MOD_DIR = path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
    'Folia',
    'mods',
    'youtube-provider'
);

describe('YouTube Provider mod', () => {
    it('manifest exists and validates according to Folium 1 spec', () => {
        expect(fs.existsSync(path.join(MOD_DIR, 'mod.json'))).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'mod.json'), 'utf8'));
        const result = validateManifest(manifest);
        expect(result.ok ? [] : result.errors).toEqual([]);
        expect(result.value.id).toBe('youtube-provider');
        expect(result.value.name).toBe('YouTube Provider');
        expect(result.value.client).toBe('client.mjs');
    });

    it('client entry point exists and has activate function', () => {
        const clientPath = path.join(MOD_DIR, 'client.mjs');
        expect(fs.existsSync(clientPath)).toBe(true);
        const content = fs.readFileSync(clientPath, 'utf8');
        expect(content).toMatch(/export default function activate\(folium\)/);
        expect(content).toMatch(/folium\.experimental\['omni\.providers'\]\.register/);
    });

    it('extractVideoId correctly extracts ID from various YouTube URLs', async () => {
        const { extractVideoId } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        expect(extractVideoId('https://www.youtube.com/watch?v=abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('https://youtu.be/abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('https://music.youtube.com/watch?v=abPmZCZZrFA&list=RD')).toBe('abPmZCZZrFA');
        expect(extractVideoId('abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('Shape of You')).toBeNull();
    });

    it('searchYouTube returns video results for keyword query', async () => {
        const { searchYouTube } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        const items = await searchYouTube('Shape of You Ed Sheeran');
        expect(items.length).toBeGreaterThan(0);
        expect(items[0]).toHaveProperty('id');
        expect(items[0]).toHaveProperty('title');
        expect(items[0]).toHaveProperty('artists');
        expect(items[0]).toHaveProperty('coverUrl');
    });

    it('getAudioStreamUrl resolves a direct audio stream', async () => {
        const { getAudioStreamUrl } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        const stream = await getAudioStreamUrl('xTvyyoF_LZY');
        expect(stream).not.toBeNull();
        expect(stream?.url).toMatch(/googlevideo\.com\/videoplayback/);
    });

    it('fetchLyrics finds synced LRC lyrics without title mutilation', async () => {
        const { fetchLyrics } = await import(path.join(MOD_DIR, 'lyricsService.mjs'));
        const result = await fetchLyrics('Shape of You', 'Ed Sheeran');
        expect(result).not.toBeNull();
        expect(result?.main?.format).toBe('lrc');
        expect(result?.main?.text).toContain('[00:');
    });
});
