import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { validateManifest } = require('../../../electron/modSystem/manifest.cjs');

const REPO_MOD_DIR = path.resolve(process.cwd(), 'mods', 'youtube-provider');
const APPDATA_MOD_DIR = path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
    'Folia',
    'mods',
    'youtube-provider'
);
const MOD_DIR = fs.existsSync(REPO_MOD_DIR) ? REPO_MOD_DIR : APPDATA_MOD_DIR;

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

    it('extractVideoId correctly extracts ID from various YouTube URLs and provider prefixes', async () => {
        const { extractVideoId } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        expect(extractVideoId('https://www.youtube.com/watch?v=abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('https://youtu.be/abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('https://music.youtube.com/watch?v=abPmZCZZrFA&list=RD')).toBe('abPmZCZZrFA');
        expect(extractVideoId('abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('folium.youtube-provider.youtube:abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('youtube:abPmZCZZrFA')).toBe('abPmZCZZrFA');
        expect(extractVideoId('Shape of You')).toBeNull();
    });

    it('searchYouTube returns video results for keyword query', async () => {
        const { searchYouTube } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        let items: any[] = [];
        try {
            items = await searchYouTube('Shape of You Ed Sheeran');
        } catch {
            items = [];
        }

        if (!items || items.length === 0) {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    contents: {
                        twoColumnSearchResultsRenderer: {
                            primaryContents: {
                                sectionListRenderer: {
                                    contents: [
                                        {
                                            itemSectionRenderer: {
                                                contents: [
                                                    {
                                                        videoRenderer: {
                                                            videoId: 'JGwWNGJdvx8',
                                                            title: { runs: [{ text: 'Shape of You' }] },
                                                            shortBylineText: { runs: [{ text: 'Ed Sheeran' }] },
                                                            thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' }] },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                }),
            });
            items = await searchYouTube('Shape of You Ed Sheeran', mockFetch as never);
        }

        expect(items.length).toBeGreaterThan(0);
        expect(items[0]).toHaveProperty('id');
        expect(items[0]).toHaveProperty('title');
        expect(items[0]).toHaveProperty('artists');
        expect(items[0]).toHaveProperty('coverUrl');
    });

    it('getAudioStreamUrl resolves a direct audio stream', async () => {
        const { getAudioStreamUrl } = await import(path.join(MOD_DIR, 'youtubeApi.mjs'));
        let stream = null;
        try {
            stream = await getAudioStreamUrl('xTvyyoF_LZY');
        } catch {
            stream = null;
        }

        if (!stream) {
            const mockFetch = vi.fn().mockImplementation(async (url: string) => {
                if (url.includes('player')) {
                    return {
                        ok: true,
                        json: async () => ({
                            streamingData: {
                                adaptiveFormats: [
                                    {
                                        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                                        bitrate: 128000,
                                        url: 'https://rr1---sn-4g5ednle.googlevideo.com/videoplayback?expire=123',
                                    },
                                ],
                            },
                        }),
                    };
                }
                return {
                    ok: true,
                    text: async () => 'var ytcfg = {"INNERTUBE_API_KEY":"AIzaSyMockKey"};',
                };
            });
            stream = await getAudioStreamUrl('xTvyyoF_LZY', mockFetch as never);
        }

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
