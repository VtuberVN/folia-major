// mods/youtube-provider/client.mjs
// Entry point của mod YouTube Provider cho Folia Major
// Tác giả: VtuberVN

import { searchYouTube, getVideoInfo, extractVideoId, getAudioStreamUrl } from './youtubeApi.mjs';
import { fetchLyrics } from './lyricsService.mjs';

const DEFAULT_PROXY_PORT = 52194;

export default function activate(folium) {
  if (folium.log?.info) {
    folium.log.info('YouTube Provider mod activated (VtuberVN).');
  }

  const fetchFn = (url, init) => {
    if (folium.net?.fetch) {
      return folium.net.fetch(url, init);
    }
    return globalThis.fetch(url, init);
  };

  const isElectron = typeof window !== 'undefined' && Boolean(window.electron);

  const providerHandle = folium.experimental['omni.providers'].register({
    id: 'youtube',
    displayName: 'YouTube Provider',
    shortName: 'YouTube',
    search: async (query, { limit = 20, offset = 0 } = {}) => {
      try {
        const items = await searchYouTube(query, fetchFn);
        return {
          items: items.slice(offset, offset + limit),
          hasMore: items.length > offset + limit,
          total: items.length
        };
      } catch (err) {
        if (folium.log?.error) folium.log.error('Search failed:', err);
        return { items: [], hasMore: false };
      }
    },
    getSong: async (id) => {
      try {
        return await getVideoInfo(id, fetchFn);
      } catch (err) {
        if (folium.log?.error) folium.log.error('getSong failed:', err);
        return null;
      }
    },
    getAudioUrl: async (song, _quality) => {
      try {
        const videoId = extractVideoId(song.id) || song.id;
        if (!videoId) return null;

        if (isElectron) {
          // 1. Môi trường Electron Desktop: Sử dụng Local Streaming Proxy (Main Process)
          if (folium.rpc?.call) {
            try {
              const rpcResult = await folium.rpc.call('getStreamUrl', { videoId });
              if (rpcResult && rpcResult.url) {
                return {
                  url: rpcResult.url,
                  expiresAt: Date.now() + 4 * 3600 * 1000
                };
              }
            } catch {
              // Tiếp tục fallback
            }
          }

          let port = DEFAULT_PROXY_PORT;
          if (folium.storage?.get) {
            try {
              const storedPort = await folium.storage.get('proxyPort');
              if (typeof storedPort === 'number' && storedPort > 0) {
                port = storedPort;
              }
            } catch {
              // Tiếp tục fallback
            }
          }

          return {
            url: `http://127.0.0.1:${port}/stream?v=${encodeURIComponent(videoId)}`,
            expiresAt: Date.now() + 4 * 3600 * 1000
          };
        } else {
          // 2. Môi trường Web: Sử dụng getAudioStreamUrl
          return await getAudioStreamUrl(videoId, fetchFn);
        }
      } catch (err) {
        if (folium.log?.error) folium.log.error('getAudioUrl failed:', err);
        return null;
      }
    },
    getLyrics: async (song) => {
      try {
        const artist = song.artists && song.artists.length > 0 ? song.artists[0] : '';
        return await fetchLyrics(song.title, artist, fetchFn);
      } catch (err) {
        if (folium.log?.error) folium.log.error('getLyrics failed:', err);
        return null;
      }
    }
  });

  return () => {
    if (providerHandle?.unregister) {
      providerHandle.unregister();
    }
  };
}
