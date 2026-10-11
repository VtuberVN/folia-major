// mods/youtube-provider/youtubeApi.mjs
// Trích xuất metadata và luồng âm thanh trực tiếp từ YouTube qua InnerTube API.

let cachedApiKey = null;

export function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const urlMatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return null;
}

async function getApiKey(fetchFn) {
  if (cachedApiKey) return cachedApiKey;
  try {
    const res = await fetchFn('https://www.youtube.com/', {
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
  return '';
}

export async function searchYouTube(query, fetchFn = globalThis.fetch) {
  const videoId = extractVideoId(query);
  if (videoId) {
    const song = await getVideoInfo(videoId, fetchFn);
    return song ? [song] : [];
  }

  const apiKey = await getApiKey(fetchFn);
  const endpoint = `https://www.youtube.com/youtubei/v1/search?key=${apiKey}`;
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

      if (!items.find(x => x.id === id)) {
        items.push({
          id: id,
          title: title,
          artists: [artist],
          album: 'YouTube',
          coverUrl: thumb
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
  const apiKey = await getApiKey(fetchFn);
  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
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
    videoId: videoId
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
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: videoId,
    title: details.title || 'YouTube Track',
    artists: [details.author || 'YouTube Artist'],
    album: 'YouTube',
    coverUrl: thumb,
    durationMs: durationSec > 0 ? durationSec * 1000 : undefined
  };
}

export async function getAudioStreamUrl(videoId, fetchFn = globalThis.fetch) {
  const apiKey = await getApiKey(fetchFn);
  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
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
    videoId: videoId
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
  const formats = [...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
  
  // Lọc các luồng audio
  const audioFormats = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url);
  if (audioFormats.length === 0) return null;

  // Sắp xếp theo bitrate cao nhất
  audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const bestAudio = audioFormats[0];
  return {
    url: bestAudio.url,
    expiresAt: Date.now() + 5 * 3600 * 1000 // URL Google Video có hạn thường là 6h
  };
}
