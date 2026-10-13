import { URL } from 'url';
import { Readable } from 'stream';

// 当前文件：Vercel 歌词及媒体请求代理函数的 TypeScript 源文件。

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': [
    'X-CSRF-Token',
    'X-Requested-With',
    'Accept',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Content-Type',
    'Date',
    'X-Api-Version',
    'KG-Rec',
    'KG-RC',
    'KG-CLIENTTIMEMS',
    'mid',
    'x-router',
    'Range',
    'x-zing-cookie',
    'x-youtube-cookie',
    'Authorization',
    'X-Origin',
  ].join(', '),
};

const IGNORED_FORWARD_HEADERS = [
  'host',
  'connection',
  'content-length',
  'origin',
  'referer',
  'cookie',
  'authorization',
  'proxy-authorization',
  'x-vercel-protection-bypass',
];

function isAllowedLyricProxyHost(hostname: string): boolean {
  return (
    hostname === 'qq.com' || hostname.endsWith('.qq.com') ||
    hostname === 'y.gtimg.cn' ||
    hostname === 'kugou.com' || hostname.endsWith('.kugou.com') ||
    hostname === 'zingmp3.vn' || hostname.endsWith('.zingmp3.vn') ||
    hostname === 'zmdcdn.me' || hostname.endsWith('.zmdcdn.me') ||
    hostname === 'youtube.com' || hostname.endsWith('.youtube.com') ||
    hostname === 'googlevideo.com' || hostname.endsWith('.googlevideo.com') ||
    hostname === 'ytimg.com' || hostname.endsWith('.ytimg.com') ||
    hostname === 'nhaccuatui.com' || hostname.endsWith('.nhaccuatui.com') ||
    hostname === 'nct.vn' || hostname.endsWith('.nct.vn') ||
    hostname === 'nixcdn.com' || hostname.endsWith('.nixcdn.com')
  );
}

export default async function handler(req: any, res: any) {
  // Allow CORS for the proxy
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: targetUrlStr } = req.query;
  if (!targetUrlStr) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = new URL(targetUrlStr);
    const hostname = targetUrl.hostname;

    // Security check: only allow proxying to known provider domains
    const isAllowed = isAllowedLyricProxyHost(hostname);

    if (!isAllowed) {
      return res.status(403).json({ error: 'Forbidden: Domain not allowed' });
    }

    // Filter headers to forward
    const headers: Record<string, string> = {};
    for (const key of Object.keys(req.headers)) {
      if (!IGNORED_FORWARD_HEADERS.includes(key.toLowerCase())) {
        headers[key] = req.headers[key] as string;
      }
    }

    if (hostname === 'u.y.qq.com') {
      headers.Cookie = 'tmeLoginType=-1;';
      headers['User-Agent'] = 'okhttp/3.14.9';
    } else if (hostname.endsWith('zingmp3.vn') || hostname.endsWith('zmdcdn.me')) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      headers['Referer'] = 'https://zingmp3.vn/';
      const userCookie = (req.headers['x-zing-cookie'] || req.headers['cookie']) as string | undefined;
      const cookieList: string[] = [];
      if (userCookie) cookieList.push(userCookie);
      if (!cookieList.some(c => typeof c === 'string' && c.includes('zmp3_rqid'))) {
        const syntheticRaw = `0|127.0.0.1|v1.22.2|${Date.now()}`;
        const syntheticRqid = Buffer.from(syntheticRaw).toString('base64');
        cookieList.push('zmp3_app_version.1=1222', `zmp3_rqid=${syntheticRqid}`);
      }
      headers['Cookie'] = cookieList.join('; ');
    } else if (hostname === 'music.youtube.com') {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      headers['Origin'] = 'https://music.youtube.com';
      headers['Referer'] = 'https://music.youtube.com/';
      const ytCookie = req.headers['x-youtube-cookie'] as string | undefined;
      if (ytCookie) {
        headers['Cookie'] = ytCookie;
      }
      if (req.headers['authorization']) {
        headers['Authorization'] = String(req.headers['authorization']);
      }
    } else if (hostname.endsWith('googlevideo.com') || hostname.endsWith('youtube.com')) {
      headers['User-Agent'] = 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)';
    } else if (hostname.endsWith('nhaccuatui.com') || hostname.endsWith('nct.vn') || hostname.endsWith('nixcdn.com')) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      headers['Referer'] = 'https://www.nhaccuatui.com/';
    }

    // Forward the method and body (if present and method is not GET/HEAD)
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (hasBody) {
      if (typeof req.body === 'object') {
        fetchOptions.body = JSON.stringify(req.body);
      } else {
        fetchOptions.body = req.body;
      }
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    res.setHeader('Content-Type', contentType);

    const forwardHeaders = ['content-length', 'content-range', 'accept-ranges', 'content-disposition'];
    for (const h of forwardHeaders) {
      const val = response.headers.get(h);
      if (val) {
        res.setHeader(h, val);
      }
    }

    res.status(response.status);

    if (contentType.includes('application/json')) {
      const json = await response.json();
      return res.json(json);
    } else if (response.body && typeof (Readable as any).fromWeb === 'function') {
      return (Readable as any).fromWeb(response.body).pipe(res);
    } else {
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }
  } catch (error) {
    console.error('Proxy request failed:', error);
    return res.status(500).json({ error: 'Proxy request failed', details: String(error) });
  }
}
