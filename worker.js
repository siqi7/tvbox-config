// tvbox.7117777.xyz - TVBox Config Center (Final)
// Public: /, /tvbox.json, /jar/* - no auth needed (TVBox compatible)
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

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  // === PROTECTED ROUTES (require Basic auth) ===
  if (path === '/admin' || path.startsWith('/api/')) {
    if (!basicAuth(request)) {
      return new Response('Authorization required', {
        status: 401,
        headers: { ...CORS, 'WWW-Authenticate': 'Basic realm="TVBox Admin", charset="UTF-8"' },
      });
    }
    // Serve index.html for /admin, serve actual content for /api/*
    if (path === '/admin') {
      return serveFromGitHub('index.html');
    }
    if (path === '/api/config' && method === 'GET') {
      return serveFromGitHub('tvbox.json');
    }
    // /api/sources etc.
    const apiPath = path.replace('/api/', '');
    return serveFromGitHub(apiPath === 'sources' ? 'tvbox.json' : apiPath);
  }

  // === PUBLIC ROUTES ===
  // Root: serve index.html
  if (path === '/') {
    return serveFromGitHub('index.html');
  }

  // Strip leading slash and serve from GitHub
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
  } catch {
    return false;
  }
}

async function serveFromGitHub(filePath) {
  const dot = filePath.lastIndexOf('.');
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
  const contentType = MIME_TYPES[ext] || 'text/plain;charset=utf-8';
  const githubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

  try {
    const response = await fetch(githubUrl);
    if (!response.ok) {
      return new Response(`Not Found: ${filePath}`, { status: 404, headers: CORS });
    }

    const headers = { 'Content-Type': contentType, ...CORS };
    const body = ext === '.jar' ? await response.arrayBuffer() : await response.text();
    return new Response(body, { status: 200, headers });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: CORS });
  }
}
