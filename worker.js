// TVBox Config Center - with Auth + Admin Panel
// Routes:
//   /               -> Main page (auth required)
//   /admin          -> Admin panel (auth required)
//   /tvbox.json     -> Config JSON (token in ?token= or auth)
//   /jar/spider.jar -> Spider JAR proxy

const ADMIN_USER = 'admin';
const GH_REPO = 'siqi7/tvbox-config';
const GH_BRANCH = 'main';
const CONFIG_TOKEN = 'tvbox888';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  // ========== Auth check helper ==========
  function checkAuth(req, requireAdmin = true) {
    const auth = req.headers.get('Authorization');
    if (!auth || !auth.startsWith('Basic ')) return false;
    try {
      const decoded = atob(auth.slice(6));
      const [user, pass] = decoded.split(':');
      return user === ADMIN_USER && pass === ADMIN_PASS;
    } catch { return false; }
  }

  // Check token auth for config endpoint
  function checkToken(req) {
    const t = new URL(req.url).searchParams.get('token');
    return t === CONFIG_TOKEN;
  }

  // ========== Routes ==========

  // tvbox.json - can use token or basic auth
  if (path === '/tvbox.json') {
    if (!checkAuth(request) && !checkToken(request)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }
    return serveConfig(request, corsHeaders);
  }

  // spider.jar - can use token or basic auth
  if (path === '/jar/spider.jar') {
    if (!checkAuth(request) && !checkToken(request)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }
    return proxyGithub('jar/spider.jar', 'application/java-archive', corsHeaders);
  }

  // Admin API - get/update config
  if (path === '/api/config') {
    if (!checkAuth(request)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }
    if (request.method === 'GET') {
      return getConfigFromGithub(corsHeaders);
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      return updateConfig(request, corsHeaders);
    }
  }

  // Admin page
  if (path === '/admin' || path.startsWith('/admin')) {
    if (!checkAuth(request)) {
      return htmlResponse(getLoginPage(), 401, corsHeaders);
    }
    return serveAdminPage(corsHeaders);
  }

  // Main page - requires auth
  if (path === '/' || path === '') {
    if (!checkAuth(request)) {
      return htmlResponse(getLoginPage(), 401, corsHeaders);
    }
    return serveMainPage(request, corsHeaders);
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// ========== Helper Functions ==========

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: { ...headers, 'Content-Type': 'text/html;charset=UTF-8' }
  });
}

async function getConfigFromGithub(corsHeaders) {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/tvbox.json`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!resp.ok) return jsonResponse({ error: 'Failed to fetch config' }, 500, corsHeaders);
  const data = await resp.json();
  const config = JSON.parse(atob(data.content));
  return jsonResponse({ ...config, _sha: data.sha, _rawUrl: `https://raw.githubusercontent.com/${GH_REPO}/main/tvbox.json` }, 200, corsHeaders);
}

async function updateConfig(request, corsHeaders) {
  try {
    const body = await request.json();
    const { config, sha } = body;

    // Get current file info from GitHub
    const url = `https://api.github.com/repos/${GH_REPO}/contents/tvbox.json`;
    const currentResp = await fetch(url, {
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    const currentData = await currentResp.json();
    const currentSha = currentData.sha;

    // Prepare config for GitHub (convert to minified JSON)
    const configStr = JSON.stringify(config, null, 2);
    const content = btoa(configStr);

    // Update via GitHub API
    const updateResp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: '🔄 TVBox config updated via admin panel',
        content: content,
        sha: currentSha
      })
    });

    const result = await updateResp.json();
    if (updateResp.ok) {
      return jsonResponse({
        success: true,
        message: '配置已保存到 GitHub',
        commitUrl: result.content?.html_url || ''
      }, 200, corsHeaders);
    } else {
      return jsonResponse({
        error: '保存失败',
        detail: result.message || 'unknown'
      }, 500, corsHeaders);
    }
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function serveConfig(request, corsHeaders) {
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/tvbox.json`);
    if (resp.ok) {
      const text = await resp.text();
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json;charset=UTF-8' }
      });
    }
    return jsonResponse({ error: 'Config not available' }, 503, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function proxyGithub(path, mime, corsHeaders) {
  const resp = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/${path}`);
  if (resp.ok) {
    const buffer = await resp.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': mime }
    });
  }
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function serveMainPage(request, corsHeaders) {
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/index.html`);
    if (!resp.ok) return htmlResponse('<h1>Error loading page</h1>', 500);
    let html = await resp.text();

    // Inject auth info into page for admin link
    html = html.replace('</body>', `
      <div style="position:fixed;bottom:10px;right:10px;font-size:11px;color:#999;background:rgba(255,255,255,0.9);padding:4px 10px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
        <a href="/admin" style="color:#0f3460;text-decoration:none;">⚙️ 管理后台</a>
      </div>
    </body>`);

    return htmlResponse(html);
  } catch (e) {
    return htmlResponse(`<h1>Error: ${e.message}</h1>`, 500);
  }
}

function getLoginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>TVBox 登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0f0c29,#1a1a2e,#0f3460);min-height:100vh;display:flex;justify-content:center;align-items:center}
.card{background:rgba(255,255,255,0.95);border-radius:20px;padding:36px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#e74c3c,#f39c12,#2ecc71,#3498db)}
.card{position:relative;overflow:hidden}
h1{text-align:center;font-size:22px;margin-bottom:24px;color:#1a1a2e}
.form-group{margin-bottom:16px}
label{display:block;font-size:13px;color:#555;margin-bottom:4px}
input{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:0;transition:border 0.2s}
input:focus{border-color:#0f3460}
button{width:100%;padding:12px;background:#0f3460;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;transition:background 0.2s}
button:hover{background:#1a5276}
.error{color:#e74c3c;font-size:13px;text-align:center;margin-top:10px;display:none}
</style></head>
<body>
<div class="card">
<h1>📺 TVBox 配置中心</h1>
<form id="loginForm" onsubmit="return doLogin()">
<div class="form-group"><label>用户名</label><input type="text" id="username" autocomplete="username" required></div>
<div class="form-group"><label>密码</label><input type="password" id="password" autocomplete="current-password" required></div>
<button type="submit">登 录</button>
<div class="error" id="errorMsg">用户名或密码错误</div>
</form>
</div>
<script>
function doLogin() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  const auth = btoa(user + ':' + pass);
  fetch('/', { headers: { 'Authorization': 'Basic ' + auth } })
    .then(r => { if(r.ok) { document.cookie = 'auth=' + auth + ';path=/;max-age=86400'; window.location.reload(); }
      else { document.getElementById('errorMsg').style.display='block'; }})
    .catch(() => { document.getElementById('errorMsg').style.display='block'; });
  return false;
}
// Auto-login if cookie exists
const cookie = document.cookie.split('; ').find(r=>r.startsWith('auth='));
if(cookie) {
  const auth = cookie.split('=')[1];
  fetch('/', { headers: { 'Authorization': 'Basic ' + auth } })
    .then(r => r.ok && window.location.reload());
}
</script>
</body></html>`;
}

async function serveAdminPage(corsHeaders) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TVBox 管理后台</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:#f5f6fa;padding:20px;color:#333}
.header{background:linear-gradient(135deg,#0f0c29,#1a1a2e,#0f3460);border-radius:16px;padding:20px 24px;margin-bottom:20px;color:white;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.header h1{font-size:20px}
.header .info{font-size:12px;opacity:0.7}
.header a{color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px}
.header a:hover{color:white}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tab{padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;background:#e9ecef;border:none;transition:all 0.2s}
.tab.active{background:#0f3460;color:white}
.tab:hover{background:#d0d7de}
.panel{background:white;border-radius:16px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.search-box{margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap}
.search-box input{flex:1;min-width:200px;padding:8px 14px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:0}
.search-box input:focus{border-color:#0f3460}
.search-box button{padding:8px 16px;background:#2ecc71;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px}
.search-box button:hover{background:#27ae60}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 6px;border-bottom:2px solid #e9ecef;color:#555;font-weight:600;font-size:11px;text-transform:uppercase}
td{padding:6px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
td.name{font-weight:600;color:#1a1a2e}
td.key{color:#888;font-size:12px}
td.api{font-size:11px;color:#555;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.type-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
.type-1{background:#cce5ff;color:#004085}
.type-3{background:#d4edda;color:#155724}
.type-0{background:#fff3cd;color:#856404}
.btn{display:inline-block;padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-size:11px;transition:all 0.2s;text-decoration:none}
.btn-del{background:#fee2e2;color:#dc2626}
.btn-del:hover{background:#fecaca}
.btn-edit{background:#e0e7ff;color:#4338ca}
.btn-edit:hover{background:#c7d2fe}
.btn-add{background:#0f3460;color:white;padding:8px 16px;font-size:13px;border-radius:8px}
.btn-add:hover{background:#1a5276}
.btn-save{background:#2ecc71;color:white;padding:10px 20px;font-size:14px;border-radius:8px;border:none;cursor:pointer}
.btn-save:hover{background:#27ae60}
.btn-save:disabled{background:#bbb;cursor:not-allowed}
.btn-cancel{background:#e9ecef;color:#555;padding:8px 16px;font-size:13px;border-radius:8px;border:none;cursor:pointer}
.form-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;justify-content:center;align-items:center}
.form-overlay.show{display:flex}
.form-panel{background:white;border-radius:16px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto}
.form-panel h2{font-size:16px;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #eee}
.form-group{margin-bottom:12px}
.form-group label{display:block;font-size:12px;color:#555;margin-bottom:3px;font-weight:600}
.form-group input,.form-group select{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;outline:0}
.form-group input:focus{border-color:#0f3460}
.form-row{display:flex;gap:8px}
.form-row .form-group{flex:1}
.form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid #eee}
.toast{visibility:hidden;min-width:200px;background:#333;color:white;text-align:center;border-radius:8px;padding:10px 16px;position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:200;font-size:13px}
.toast.show{visibility:visible;animation:fadein 0.3s,fadeout 0.3s 1.5s}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@keyframes fadeout{from{opacity:1}to{opacity:0}}
.status-bar{background:#f8f9fa;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#555;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}
.status-bar .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.dot-green{background:#2ecc71}
.dot-red{background:#e74c3c}
.empty-state{text-align:center;padding:40px;color:#999;font-size:14px}
.empty-state .icon{font-size:40px;margin-bottom:10px}
</style>
</head>
<body>
<div class="header">
<div><h1>⚙️ TVBox 管理后台</h1><div class="info">tvbox.7117777.xyz</div></div>
<div style="display:flex;gap:10px;align-items:center">
<a href="/" target="_blank">🏠 首页</a>
<a href="https://raw.githubusercontent.com/${GH_REPO}/main/tvbox.json" target="_blank">📄 GitHub 直链</a>
<a href="#" onclick="logout()">🚪 退出</a>
</div>
</div>

<div class="panel">
<div class="status-bar" id="statusBar">
<span><span class="dot dot-green"></span> 已连接到 GitHub</span>
<span id="sourceCount">加载中...</span>
</div>

<div class="tabs">
<button class="tab active" onclick="switchTab('sources')">📦 视频源管理</button>
<button class="tab" onclick="switchTab('settings')">⚙️ 全局设置</button>
</div>

<div id="sourcesTab">
<div class="search-box">
<input type="text" id="searchInput" placeholder="搜索源名称或 key..." oninput="filterSources()">
<button onclick="showAddForm()">＋ 添加源</button>
<button onclick="saveToGithub()" class="btn-save" id="saveBtn" style="background:#0f3460">💾 保存到 GitHub</button>
</div>

<div style="overflow-x:auto">
<table id="sourcesTable">
<thead><tr>
<th style="width:30px"><input type="checkbox" id="selectAll" onchange="toggleAll()"></th>
<th style="width:30px">#</th>
<th>名称</th>
<th>Key</th>
<th>类型</th>
<th>API 地址</th>
<th style="width:80px">操作</th>
</tr></thead>
<tbody id="tableBody"></tbody>
</table>
</div>
<div id="emptyState" class="empty-state" style="display:none">
<div class="icon">📭</div>
<div>暂无源，点击「添加源」开始</div>
</div>
</div>

<div id="settingsTab" style="display:none">
<div class="form-group"><label>配置地址 (TVBox 使用)</label>
<input type="text" value="https://tvbox.7117777.xyz/tvbox.json?token=tvbox888" readonly onclick="this.select()"></div>
<div class="form-group"><label>GitHub 直链 (Pages 失效时备用)</label>
<input type="text" value="https://raw.githubusercontent.com/${GH_REPO}/main/tvbox.json" readonly onclick="this.select()"></div>
<div class="form-group"><label>spider.jar 地址</label>
<input type="text" value="https://tvbox.7117777.xyz/jar/spider.jar?token=tvbox888" readonly onclick="this.select()"></div>
</div>
</div>

<!-- Add/Edit Form Modal -->
<div class="form-overlay" id="formOverlay">
<div class="form-panel">
<h2 id="formTitle">添加源</h2>
<div class="form-group"><label>显示名称</label><input type="text" id="f_name" placeholder="如：饭太硬"></div>
<div class="form-group"><label>Key（唯一标识，英文）</label><input type="text" id="f_key" placeholder="如：fanty"></div>
<div class="form-row">
<div class="form-group"><label>类型</label>
<select id="f_type">
<option value="1">1 - JSON API</option>
<option value="3">3 - Spider/Jar</option>
<option value="0">0 - XML/RSS</option>
</select></div>
<div class="form-group"><label>搜索</label>
<select id="f_searchable">
<option value="1">开启</option>
<option value="0">关闭</option>
</select></div>
</div>
<div class="form-group"><label>API 地址</label><input type="text" id="f_api" placeholder="JSON 配置 URL 或 csp_xxx 爬虫"></div>
<div class="form-group"><label>播放器 (可选)</label>
<select id="f_player">
<option value="">默认</option>
<option value="0">系统播放器</option>
<option value="1">IJK 播放器</option>
<option value="2">Exo 播放器</option>
</select></div>
<div class="form-actions">
<button class="btn-cancel" onclick="hideForm()">取消</button>
<button class="btn-save" id="formSaveBtn" onclick="saveSource()">✔ 保存</button>
</div>
</div>
</div>

<div id="toast" class="toast"></div>

<script>
let config = null;
let editingIndex = -1;

async function loadConfig() {
  const resp = await fetch('/api/config');
  if (resp.status === 401) { window.location = '/'; return; }
  config = await resp.json();
  renderTable();
  document.getElementById('sourceCount').textContent = \`\${config.sites?.length || 0} 个视频源\`;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  if (!config?.sites?.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = config.sites.filter((s,i) => {
    if (!search) return true;
    return (s.name||'').toLowerCase().includes(search) || (s.key||'').toLowerCase().includes(search);
  });
  tbody.innerHTML = filtered.map((s, i) => {
    const origIdx = config.sites.indexOf(s);
    const typeLabel = s.type === 1 ? '1-API' : s.type === 3 ? '3-Spider' : '0-XML';
    const typeClass = s.type === 1 ? 'type-1' : s.type === 3 ? 'type-3' : 'type-0';
    return \`<tr>
      <td><input type="checkbox" class="row-check" data-idx="\${origIdx}"></td>
      <td class="key">\${origIdx+1}</td>
      <td class="name">\${s.name||'-'}</td>
      <td class="key">\${s.key||'-'}</td>
      <td><span class="type-badge \${typeClass}">\${typeLabel}</span></td>
      <td class="api" title="\${s.api||''}">\${(s.api||'').substring(0,60)}\${(s.api||'').length > 60 ? '...' : ''}</td>
      <td>
        <button class="btn btn-edit" onclick="editSource(\${origIdx})">编辑</button>
        <button class="btn btn-del" onclick="deleteSource(\${origIdx})">删除</button>
      </td>
    </tr>\`;
  }).join('');
}

function filterSources() { renderTable(); }

function toggleAll() {
  const checked = document.getElementById('selectAll').checked;
  document.querySelectorAll('.row-check').forEach(c => c.checked = checked);
}

function showAddForm() {
  editingIndex = -1;
  document.getElementById('formTitle').textContent = '➕ 添加视频源';
  document.getElementById('f_name').value = '';
  document.getElementById('f_key').value = '';
  document.getElementById('f_type').value = '1';
  document.getElementById('f_searchable').value = '1';
  document.getElementById('f_api').value = '';
  document.getElementById('f_player').value = '';
  document.getElementById('formOverlay').classList.add('show');
}

function editSource(idx) {
  editingIndex = idx;
  const s = config.sites[idx];
  document.getElementById('formTitle').textContent = '✏️ 编辑视频源';
  document.getElementById('f_name').value = s.name || '';
  document.getElementById('f_key').value = s.key || '';
  document.getElementById('f_type').value = String(s.type || 1);
  document.getElementById('f_searchable').value = String(s.searchable ?? 1);
  document.getElementById('f_api').value = s.api || '';
  document.getElementById('f_player').value = String(s.playerType ?? '');
  document.getElementById('formOverlay').classList.add('show');
}

function hideForm() {
  document.getElementById('formOverlay').classList.remove('show');
}

function saveSource() {
  const name = document.getElementById('f_name').value.trim();
  const key = document.getElementById('f_key').value.trim();
  const type = parseInt(document.getElementById('f_type').value);
  const searchable = parseInt(document.getElementById('f_searchable').value);
  const api = document.getElementById('f_api').value.trim();
  const player = document.getElementById('f_player').value;

  if (!name || !key || !api) {
    showToast('⚠️ 名称、Key 和 API 地址不能为空');
    return;
  }

  const site = {
    key, name,
    type: type,
    api: api,
    searchable: searchable,
    quickSearch: searchable,
    filterable: 1,
    changeable: 1
  };
  if (player) site.playerType = parseInt(player);

  if (editingIndex >= 0) {
    config.sites[editingIndex] = site;
    showToast('✅ 已更新：' + name);
  } else {
    config.sites.push(site);
    showToast('✅ 已添加：' + name);
  }

  hideForm();
  renderTable();
}

function deleteSource(idx) {
  if (!confirm(\`确定要删除「\${config.sites[idx].name}」吗？\`)) return;
  const name = config.sites[idx].name;
  config.sites.splice(idx, 1);
  renderTable();
  showToast('🗑️ 已删除：' + name);
}

async function saveToGithub() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 保存中...';
  showToast('⏳ 正在保存到 GitHub...');

  try {
    const resp = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const result = await resp.json();
    if (result.success) {
      showToast('✅ ' + result.message);
    } else {
      showToast('❌ ' + (result.error || result.detail || '保存失败'));
    }
  } catch (e) {
    showToast('❌ 网络错误：' + e.message);
  }

  btn.disabled = false;
  btn.textContent = '💾 保存到 GitHub';
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(name + 'Tab').style.display = name === 'sources' ? 'block' : 'none';
  event.target.classList.add('active');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

function logout() {
  document.cookie = 'auth=;path=/;max-age=0';
  window.location.reload();
}

loadConfig();
</script>
</body></html>`;

  return htmlResponse(html);
}
