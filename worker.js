// tvbox.7117777.xyz - TVBox Config Center
// Auth: ?token=tvbox888 for TVBox endpoints, Basic auth for admin

const GITHUB_REPO = 'siqi7/tvbox-config';
const GITHUB_BRANCH = 'main';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'tvbox2026';
const CONFIG_TOKEN = 'tvbox888';

const MIME_TYPES = {
  '.html': 'text/html;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.jar': 'application/java-archive',
  '.js':  'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain;charset=utf-8',
  '.md':  'text/markdown;charset=utf-8',
};

// CORS headers
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

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  // Route: /tvbox.json - requires token or Basic auth
  if (path === '/tvbox.json') {
    if (!authenticate(request, url)) {
      return unauthorized('tvbox.json requires token or auth');
    }
    return serveFromGitHub('tvbox.json');
  }

  // Route: /jar/* - requires token or Basic auth
  if (path.startsWith('/jar/')) {
    if (!authenticate(request, url)) {
      return unauthorized('Jar files require token or auth');
    }
    return serveFromGitHub(path.slice(1)); // Remove leading /
  }

  // Route: /admin - requires Basic auth
  if (path === '/admin') {
    if (!basicAuth(request)) {
      return basicAuthResponse();
    }
    return serveFromGitHub('index.html');
  }

  // Route: /api/config GET - returns the raw JSON (admin only)
  if (path === '/api/config' && method === 'GET') {
    if (!basicAuth(request)) {
      return basicAuthResponse();
    }
    return serveFromGitHub('tvbox.json');
  }

  // Route: /api/config POST - update config via GitHub (admin only)
  if (path === '/api/config' && method === 'POST') {
    if (!basicAuth(request)) {
      return basicAuthResponse();
    }
    return updateConfig(request);
  }

  // Route: /api/sources GET - list all sources (admin only)
  if (path === '/api/sources' && method === 'GET') {
    if (!basicAuth(request)) {
      return basicAuthResponse();
    }
    return serveFromGitHub('tvbox.json');
  }

  // Root / and everything else: serve from GitHub
  let filePath = path === '/' ? 'index.html' : path.replace(/^\//, '');
  return serveFromGitHub(filePath);
}

function authenticate(request, url) {
  // Check token in query string
  if (url.searchParams.get('token') === CONFIG_TOKEN) {
    return true;
  }
  // Check Basic auth with admin creds
  if (basicAuth(request)) {
    return true;
  }
  return false;
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

function unauthorized(msg) {
  return new Response(msg || 'Unauthorized', {
    status: 401,
    headers: {
      ...CORS,
      'WWW-Authenticate': 'Basic realm="TVBox Config Center", charset="UTF-8"',
    },
  });
}

function basicAuthResponse() {
  return new Response('Authorization required', {
    status: 401,
    headers: {
      ...CORS,
      'WWW-Authenticate': 'Basic realm="TVBox Config Center", charset="UTF-8"',
    },
  });
}

async function serveFromGitHub(filePath) {
  // Determine MIME type
  const dot = filePath.lastIndexOf('.');
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
  const contentType = MIME_TYPES[ext] || 'text/plain;charset=utf-8';

  // Fetch from GitHub raw
  const githubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

  try {
    const response = await fetch(githubUrl);

    if (!response.ok) {
      return new Response(`Not Found: ${filePath}`, {
        status: 404,
        headers: CORS,
      });
    }

    // Handle binary vs text content
    let body;
    const headers = {
      'Content-Type': contentType,
      ...CORS,
    };

    if (ext === '.jar') {
      body = await response.arrayBuffer();
    } else {
      body = await response.text();
    }

    return new Response(body, { status: 200, headers });
  } catch (err) {
    return new Response(`Error fetching ${filePath}: ${err.message}`, {
      status: 500,
      headers: CORS,
    });
  }
}

async function updateConfig(request) {
  // This would need GitHub API token stored in env var
  // Since we can't use env vars in this approach, return a placeholder
  return new Response(JSON.stringify({
    error: 'Direct config update not available in this deployment mode',
    info: 'Please update tvbox.json manually in the GitHub repo siqi7/tvbox-config'
  }), {
    status: 501,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
