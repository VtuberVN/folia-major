// mods/youtube-provider/youtubeApi.mjs
// Trích xuất metadata và luồng âm thanh trực tiếp từ YouTube qua InnerTube API.

let cachedApiKey = null;

export function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const urlMatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i);
  if (urlMatch) return urlMatch[1];
  const prefixMatch = str.match(/(?:^|[:#\/])([a-zA-Z0-9_-]{11})(?:[#?&/]|$)/);
  if (prefixMatch) return prefixMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return null;
}

export function extractPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const match = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];
  if (/^(?:PL|RD|OLAK5uy|VL)[a-zA-Z0-9_-]+$/i.test(str)) {
    return str.startsWith('VL') ? str.slice(2) : str;
  }
  return null;
}

export function wrapProxyUrl(url) {
  if (typeof window !== 'undefined' && !window.electron && typeof url === 'string' && !url.startsWith('/api/')) {
    return `/api/lyric-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const DEFAULT_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4usbuLznTmPcwjzp4-Ns4';

async function getApiKey(fetchFn) {
  if (cachedApiKey) return cachedApiKey;
  try {
    const res = await fetchFn(wrapProxyUrl('https://www.youtube.com/'), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (match && match[1]) {
      cachedApiKey = match[1];
      return cachedApiKey;
    }
  } catch (err) {
    console.warn('[YouTube Provider] Failed to extract API key from YouTube page:', err);
  }
  return DEFAULT_INNERTUBE_KEY;
}

function parseDurationToMs(text) {
  if (!text || typeof text !== 'string') return undefined;
  const parts = text.trim().split(':').map(Number);
  if (parts.some(isNaN)) return undefined;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return undefined;
}

export async function searchYouTube(query, fetchFn = globalThis.fetch) {
  const videoId = extractVideoId(query);
  if (videoId && !query.includes('list=')) {
    const song = await getVideoInfo(videoId, fetchFn);
    return song ? [song] : [];
  }

  const playlistId = extractPlaylistId(query);
  if (playlistId && (query.includes('list=') || query.startsWith('PL') || query.startsWith('RD') || query.startsWith('VL'))) {
    const pl = await getYouTubePlaylist(playlistId, fetchFn);
    if (pl && pl.items?.length > 0) {
      return pl.items;
    }
  }

  const apiKey = await getApiKey(fetchFn);
  const endpoint = wrapProxyUrl(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`);
  const body = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        hl: 'vi',
        gl: 'VN'
      }
    },
    query: query.trim()
  };

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.warn('[YouTube Provider] Search failed with status:', res.status);
    return [];
  }

  const data = await res.json();
  const items = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const r = node.compactVideoRenderer || node.videoRenderer;
    if (r && r.videoId) {
      const id = r.videoId;
      const title = r.title?.runs?.map(x => x.text).join('') || r.title?.simpleText || 'YouTube Track';
      const artist = r.shortBylineText?.runs?.map(x => x.text).join('') || 
                     r.bylineText?.runs?.map(x => x.text).join('') || 
                     r.ownerText?.runs?.map(x => x.text).join('') || 
                     'YouTube Artist';
      const thumb = r.thumbnail?.thumbnails?.[r.thumbnail.thumbnails.length - 1]?.url ||
                    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const durationText = r.lengthText?.runs?.[0]?.text || r.lengthText?.simpleText;
      const durationMs = parseDurationToMs(durationText);

      if (!items.find(x => x.id === id)) {
        items.push({
          id: id,
          title: title,
          artists: [artist],
          album: 'YouTube',
          coverUrl: thumb,
          ...(durationMs ? { durationMs } : {})
        });
      }
    }
    for (const k of Object.keys(node)) {
      walk(node[k]);
    }
  }

  walk(data);
  return items;
}

export async function getVideoInfo(videoId, fetchFn = globalThis.fetch) {
  const vid = extractVideoId(videoId) || videoId;
  const apiKey = await getApiKey(fetchFn);
  const endpoint = wrapProxyUrl(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`);
  const body = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 31,
        hl: 'vi',
        gl: 'VN'
      }
    },
    videoId: vid
  };

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) return null;
  const data = await res.json();
  const details = data.videoDetails;
  if (!details) return null;

  const durationSec = parseInt(details.lengthSeconds || '0', 10);
  const thumb = details.thumbnail?.thumbnails?.[details.thumbnail.thumbnails.length - 1]?.url ||
                `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

  return {
    id: vid,
    title: details.title || 'YouTube Track',
    artists: [details.author || 'YouTube Artist'],
    album: 'YouTube',
    coverUrl: thumb,
    durationMs: durationSec > 0 ? durationSec * 1000 : undefined
  };
}

export async function getAudioStreamUrl(videoId, fetchFn = globalThis.fetch) {
  const vid = extractVideoId(videoId) || videoId;
  const apiKey = await getApiKey(fetchFn);
  const endpoint = wrapProxyUrl(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`);
  const body = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 31,
        hl: 'vi',
        gl: 'VN'
      }
    },
    videoId: vid
  };

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) return null;
  const data = await res.json();
  const formats = data.streamingData?.formats || [];

  // 1. Ưu tiên Progressive format (ITAG 18: 360p MP4) - định dạng duy nhất giải mã trực tiếp trong thẻ audio
  const progressive = formats.find(f => f.itag === 18 && f.url) || formats.find(f => f.url);
  
  // 2. Dự phòng sang adaptive format nếu không có progressive
  const chosenFormat = progressive || (data.streamingData?.adaptiveFormats || []).find(f => f.url);
  if (!chosenFormat) return null;

  const rawUrl = chosenFormat.url;
  const streamUrl = wrapProxyUrl(rawUrl);

  return {
    url: streamUrl,
    expiresAt: Date.now() + 4 * 3600 * 1000
  };
}

export async function getYouTubePlaylist(playlistIdInput, fetchFn = globalThis.fetch) {
  const playlistId = extractPlaylistId(playlistIdInput) || playlistIdInput;
  if (!playlistId) return null;

  try {
    const apiKey = await getApiKey(fetchFn);
    const endpoint = wrapProxyUrl(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`);
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'vi',
            gl: 'VN',
          },
        },
        browseId: `VL${playlistId.startsWith('VL') ? playlistId.slice(2) : playlistId}`,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    const sidebarTitle = data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer?.title?.runs?.[0]?.text;
    const headerTitle = data.header?.playlistHeaderRenderer?.title?.simpleText || data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text;
    const playlistName = sidebarTitle || headerTitle || 'YouTube Playlist';

    const sidebarThumb = data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
    const headerThumb = data.header?.playlistHeaderRenderer?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
    const coverUrl = sidebarThumb || headerThumb;

    const section = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
    const rawVideos = section?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

    const items = [];
    for (const raw of rawVideos) {
      const v = raw?.playlistVideoRenderer;
      if (!v || !v.videoId) continue;

      const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Track';
      const artist = v.shortBylineText?.runs?.[0]?.text || 'YouTube Artist';
      const durationMs = (parseInt(v.lengthSeconds || '0', 10) || 0) * 1000;
      const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

      items.push({
        id: v.videoId,
        title,
        artists: [artist],
        album: playlistName,
        coverUrl: thumb,
        durationMs,
        sourceRef: { kind: 'online', providerId: 'youtube', mediaId: v.videoId },
      });
    }

    return {
      id: playlistId,
      name: playlistName,
      coverUrl,
      trackCount: items.length,
      items,
    };
  } catch (err) {
    console.warn('[YouTube Provider] getYouTubePlaylist error:', err);
    return null;
  }
}
