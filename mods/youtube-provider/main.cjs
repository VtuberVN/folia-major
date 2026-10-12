// mods/youtube-provider/main.cjs
// Electron Main Process backend của YouTube Provider mod cho Folia.
// Tác giả: VtuberVN
//
// Chạy một Local HTTP Streaming Proxy trên 127.0.0.1 để:
// 1. Cấp header Access-Control-Allow-Origin: * và Access-Control-Allow-Private-Network: true vượt qua rào cản CORS & PNA
// 2. Tự động xử lý HTTP 302/301 redirects từ Google Video CDN nội bộ trong Node.js
// 3. Sử dụng định dạng Progressive MP4 (ITAG 18/22) chuẩn mà thẻ <audio> của trình duyệt có thể demux và phát trực tiếp
// 4. Chuyển tiếp các yêu cầu HTTP Range (206 Partial Content) để tua (seek) và phát nhạc mượt mà
// 5. Tự động dọn dẹp các tệp media-cache 0-byte bị lỗi trên đĩa để tránh chặn phát nhạc

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DEFAULT_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4usbuLznTmPcwjzp4-Ns4';
const DEFAULT_PORT = 52194;

// Cache lưu URL luồng đã trích xuất theo videoId (hạn 3 giờ)
const streamUrlCache = new Map();

function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const urlMatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i);
  if (urlMatch) return urlMatch[1];
  const prefixMatch = str.match(/(?:^|[:#\/])([a-zA-Z0-9_-]{11})(?:[#?&/]|$)/);
  if (prefixMatch) return prefixMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return null;
}

// Tự động quét và xoá sạch các tệp cache rỗng 0 byte (gây lỗi "Không thể phát nhạc" của Folia)
function cleanCorruptedMediaCache(modApi) {
  try {
    const { app } = require('electron');
    if (!app || typeof app.getPath !== 'function') return;
    const audioDir = path.join(app.getPath('userData'), 'media-cache', 'audio');
    if (!fs.existsSync(audioDir)) return;

    const files = fs.readdirSync(audioDir);
    let count = 0;
    for (const f of files) {
      if (f.endsWith('.bin')) {
        const fullPath = path.join(audioDir, f);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) {
            fs.unlinkSync(fullPath);
            const jsonPath = path.join(audioDir, f.replace(/\.bin$/, '.json'));
            if (fs.existsSync(jsonPath)) {
              fs.unlinkSync(jsonPath);
            }
            count++;
          }
        } catch {
          // Bỏ qua lỗi truy cập tệp đang bị khoá
        }
      }
    }
    if (count > 0 && modApi?.log?.info) {
      modApi.log.info(`Dọn dẹp ${count} tệp cache hỏng 0-byte thành công.`);
    }
  } catch (err) {
    if (modApi?.log?.warn) {
      modApi.log.warn(`Lỗi dọn dẹp cache: ${err.message}`);
    }
  }
}

async function resolveYouTubeStreamUrl(rawId) {
  const videoId = extractVideoId(rawId) || rawId;
  if (!videoId) return null;

  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${DEFAULT_INNERTUBE_KEY}`;
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
    videoId
  };

  const res = await fetch(endpoint, {
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

  // Ưu tiên cao nhất: Progressive MP4 (ITAG 18: 360p hoặc ITAG 22: 720p).
  const progressive = formats.find(f => f.itag === 18 && f.url) || formats.find(f => f.url);
  if (progressive) {
    const info = {
      url: progressive.url,
      mimeType: progressive.mimeType || 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      expiresAt: Date.now() + 3 * 3600 * 1000
    };
    streamUrlCache.set(videoId, info);
    return info;
  }

  // Dự phòng luồng Adaptive nếu không có progressive format
  const adaptiveFormats = data.streamingData?.adaptiveFormats || [];
  const audioAdaptive = adaptiveFormats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('audio/'));
  audioAdaptive.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const chosenAdaptive = audioAdaptive[0] || adaptiveFormats.find(f => f.url);
  if (chosenAdaptive) {
    const info = {
      url: chosenAdaptive.url,
      mimeType: chosenAdaptive.mimeType || 'audio/mp4',
      expiresAt: Date.now() + 3 * 3600 * 1000
    };
    streamUrlCache.set(videoId, info);
    return info;
  }

  return null;
}

// Gửi request lên Google Video CDN và bám theo 301/302 redirects nội bộ
function pipeStreamWithRedirect(targetUrl, clientReq, clientRes, videoId, maxRedirects = 5) {
  if (maxRedirects <= 0) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Private-Network': 'true'
      });
      clientRes.end('Too many redirects from upstream CDN');
    }
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(500, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Private-Network': 'true'
      });
      clientRes.end('Invalid upstream URL');
    }
    return;
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  };

  if (clientReq.headers.range) {
    headers['Range'] = clientReq.headers.range;
  }

  const upstreamReq = transport.request(parsedUrl, {
    method: clientReq.method === 'HEAD' ? 'HEAD' : 'GET',
    headers
  }, (upstreamRes) => {
    // Xử lý chuyển hướng 301/302/303/307/308
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
      upstreamRes.resume();
      const nextLocation = new URL(upstreamRes.headers.location, targetUrl).href;
      return pipeStreamWithRedirect(nextLocation, clientReq, clientRes, videoId, maxRedirects - 1);
    }

    const respHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Accept-Ranges': 'bytes'
    };

    // Nếu upstream báo lỗi (403/404), xoá cache và báo lỗi lại cho client
    if (upstreamRes.statusCode >= 400) {
      if (videoId) {
        streamUrlCache.delete(videoId);
      }
      respHeaders['Content-Type'] = upstreamRes.headers['content-type'] || 'text/plain';
      clientRes.writeHead(upstreamRes.statusCode, respHeaders);
      upstreamRes.pipe(clientRes);
      return;
    }

    if (upstreamRes.headers['content-type']) {
      respHeaders['Content-Type'] = upstreamRes.headers['content-type'];
    }
    if (upstreamRes.headers['content-length']) {
      respHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    }
    if (upstreamRes.headers['content-range']) {
      respHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    }

    clientRes.writeHead(upstreamRes.statusCode || 200, respHeaders);

    if (clientReq.method === 'HEAD') {
      upstreamRes.resume();
      clientRes.end();
      return;
    }

    upstreamRes.pipe(clientRes);

    upstreamRes.on('error', (err) => {
      if (!clientRes.destroyed) {
        clientRes.destroy(err);
      }
    });
  });

  upstreamReq.on('error', (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Private-Network': 'true'
      });
      clientRes.end(`Upstream error: ${err.message}`);
    }
  });

  clientReq.on('close', () => {
    if (!upstreamReq.destroyed) {
      upstreamReq.destroy();
    }
  });

  clientRes.on('error', () => {
    if (!upstreamReq.destroyed) {
      upstreamReq.destroy();
    }
  });

  upstreamReq.end();
}

module.exports = function activate(modApi) {
  let activePort = DEFAULT_PORT;
  let server = null;

  cleanCorruptedMediaCache(modApi);

  server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let reqUrl;
    try {
      reqUrl = new URL(req.url, `http://127.0.0.1:${activePort}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (reqUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, port: activePort }));
      return;
    }

    if (reqUrl.pathname === '/stream') {
      const rawVideoId = reqUrl.searchParams.get('v');
      const videoId = extractVideoId(rawVideoId) || rawVideoId;
      if (!videoId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing parameter "v"');
        return;
      }

      try {
        const streamInfo = await resolveYouTubeStreamUrl(videoId);
        if (!streamInfo || !streamInfo.url) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Stream not found or video unavailable');
          return;
        }

        pipeStreamWithRedirect(streamInfo.url, req, res, videoId);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Internal error: ${err.message}`);
        }
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  const startServer = (portToTry) => {
    server.listen(portToTry, '127.0.0.1', () => {
      activePort = server.address().port;
      if (modApi?.log?.info) {
        modApi.log.info(`YouTube Proxy streaming server running on 127.0.0.1:${activePort}`);
      }
      if (modApi?.storage?.data?.set) {
        modApi.storage.data.set('proxyPort', activePort).catch(() => {});
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && portToTry !== 0) {
        startServer(0);
      } else if (modApi?.log?.error) {
        modApi.log.error(`Proxy server error: ${err.message}`);
      }
    });
  };

  startServer(DEFAULT_PORT);

  // Đăng ký RPC để client lấy port hoặc url trực tiếp
  if (modApi?.rpc?.handle) {
    modApi.rpc.handle('getStreamUrl', async ({ videoId }) => {
      const cleanId = extractVideoId(videoId) || videoId;
      return {
        url: `http://127.0.0.1:${activePort}/stream?v=${encodeURIComponent(cleanId)}`,
        port: activePort
      };
    });
    modApi.rpc.handle('getProxyPort', () => activePort);
  }

  const cleanup = () => {
    if (server) {
      server.close();
      server = null;
    }
    streamUrlCache.clear();
  };

  if (modApi?.lifecycle?.onDeactivate) {
    modApi.lifecycle.onDeactivate(cleanup);
  }

  return cleanup;
};
