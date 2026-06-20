// tvbox.7117777.xyz - TVBox Config Center (Clean v2.1)
// Public: /, /tvbox.json, /jar/*, /lib/* - no auth needed
// Protected: /admin, /api/* - Basic auth required

const GITHUB_REPO = 'siqi7/tvbox-config';
const GITHUB_BRANCH = 'main';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'tvbox2026';

const MIME_TYPES = {
  '.html': 'text/html;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.jar':  'application/java-archive',
  '.js':   'application/javascript;charset=utf-8',
  '.css':  'text/css;charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.txt':  'text/plain;charset=utf-8',
  '.md':   'text/markdown;charset=utf-8',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ✅ No cache on output
const NO_CACHE = {
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  // === PROTECTED ROUTES ===
  if (path === '/admin' || path.startsWith('/api/')) {
    if (!basicAuth(request)) {
      return new Response('Authorization required', {
        status: 401,
        headers: { ...CORS, 'WWW-Authenticate': 'Basic realm="TVBox Admin", charset="UTF-8"' },
      });
    }
    if (path === '/admin') return serveFromGitHub('index.html');
    if (path === '/api/config' && method === 'GET') return serveFromGitHub('tvbox.json');
    const apiPath = path.replace('/api/', '');
    return serveFromGitHub(apiPath === 'sources' ? 'tvbox.json' : apiPath);
  }

  // === PUBLIC ROUTES ===
  if (path === '/') return serveFromGitHub('index.html');

  const filePath = path.replace(/^\//, '');
  return serveFromGitHub(filePath);
}

function basicAuth(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Basic ')) return false;
  try {
    const decoded = atob(auth.slice(6));
    const [user, pass] = decoded.split(':');
    return user === ADMIN_USER && pass === ADMIN_PASS;
  } catch { return false; }
}

async function serveFromGitHub(filePath) {
  const dot = filePath.lastIndexOf('.');
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
  const contentType = MIME_TYPES[ext] || 'text/plain;charset=utf-8';
  
  // 🔥 Use GitHub API (no CDN cache) instead of raw.githubusercontent.com
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;

  try {
    const ghResp = await fetch(apiUrl, {
      cf: { cacheTtl: 0 },
      headers: {
        'Accept': 'application/vnd.github.v3.raw',
        'Cache-Control': 'no-cache',
        'User-Agent': 'TVBox-CF-Worker/2.1',
      }
    });

    if (!ghResp.ok) {
      return new Response(`Not Found: ${filePath}`, { status: 404, headers: CORS });
    }

    const resHeaders = { 'Content-Type': contentType, ...CORS, ...NO_CACHE };

    if (ext === '.jar') {
      const body = await ghResp.arrayBuffer();
      return new Response(body, { status: 200, headers: resHeaders });
    }

    const body = await ghResp.text();
    return new Response(body, { status: 200, headers: resHeaders });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: CORS });
  }
}
