// mods/youtube-provider/lyricsService.mjs
// Tự động tìm kiếm lời bài hát đồng bộ (.lrc) đa nguồn (LRCLIB -> Zing MP3)

export async function fetchLyrics(title, artist = '', fetchFn = globalThis.fetch) {
  if (!title) return null;

  // 1. Thử tìm trên LRCLIB (Kho lời đồng bộ mở lớn nhất)
  try {
    const query = artist ? `${title} ${artist}` : title;
    const lrcUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetchFn(lrcUrl, {
      headers: {
        'User-Agent': 'Folia-YouTubeProvider/1.0 (https://github.com/VtuberVN/folia-major)'
      }
    });

    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        // Tìm bài có syncedLyrics trước
        const matched = items.find(it => it.syncedLyrics) || items[0];
        const text = matched.syncedLyrics || matched.plainLyrics;
        if (text && text.trim()) {
          return {
            main: {
              format: 'lrc',
              text: text.trim()
            }
          };
        }
      }
    }
  } catch (err) {
    console.warn('[YouTube Provider] LRCLIB search error:', err);
  }

  // 2. Dự phòng: Thử tìm trên Zing MP3 (chuyên trị V-Pop và nhạc Việt)
  try {
    const ctime = Date.now();
    const zingUrl = `https://ac.zingmp3.vn/v1/web/ac-suggestions?num=5&query=${encodeURIComponent(title)}&language=vi&ctime=${ctime}`;
    const res = await fetchFn(zingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://zingmp3.vn/'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const groups = data?.data?.items || [];
      for (const g of groups) {
        for (const s of (g.suggestions || [])) {
          if (s.lyricLink) {
            const lrcRes = await fetchFn(s.lyricLink);
            if (lrcRes.ok) {
              const text = await lrcRes.text();
              if (text && text.trim()) {
                return {
                  main: {
                    format: 'lrc',
                    text: text.trim()
                  }
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[YouTube Provider] Zing MP3 lyric error:', err);
  }

  return null;
}
