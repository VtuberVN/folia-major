// mods/youtube-provider/client.mjs
// Entry point của mod YouTube Provider cho Folia Major

import { searchYouTube, getVideoInfo, getAudioStreamUrl } from './youtubeApi.mjs';
import { fetchLyrics } from './lyricsService.mjs';

export default function activate(folium) {
  if (folium.log?.info) {
    folium.log.info('YouTube Provider mod activated.');
  }

  const fetchFn = (url, init) => {
    if (folium.net?.fetch) {
      return folium.net.fetch(url, init);
    }
    return globalThis.fetch(url, init);
  };

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
        return await getAudioStreamUrl(song.id, fetchFn);
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
    if (folium.log?.info) {
      folium.log.info('YouTube Provider mod deactivated.');
    }
  };
}
