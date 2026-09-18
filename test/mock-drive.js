// Google Drive giả lập cho test sync: chỉ những endpoint NotedDrive dùng (files.list trong appDataFolder, tải về
// alt=media, tạo multipart, cập nhật media, xoá), giữ file trong bộ nhớ, có CORS, và có công tắc để giả lỗi.
'use strict';
const http = require('http');

function start() {
  const state = { files: new Map(), nextId: 1, token: 'test-token', uploads: 0, downloads: 0, requests: 0, failWith: null, beforeUpload: null };
  const server = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { ...cors, 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (req.method === 'OPTIONS') return send(204, '');
    state.requests++;
    const u = new URL(req.url, 'http://x');
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (req.headers.authorization !== 'Bearer ' + state.token) return send(401, { error: { status: 'UNAUTHENTICATED', message: 'Invalid Credentials' } });
    if (state.failWith === 'quota' && req.method !== 'GET') return send(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }], message: 'The user has exceeded their Drive storage quota' } });
    if (state.failWith === 'forbidden') return send(403, { error: { errors: [{ reason: 'domainPolicy' }], message: 'blocked by admin' } });
    const meta = f => ({ id: f.id, version: String(f.version), modifiedTime: new Date(f.modified).toISOString() });

    if (req.method === 'GET' && u.pathname === '/drive/v3/files') {
      if (u.searchParams.get('spaces') !== 'appDataFolder') return send(400, { error: { message: 'test server only serves appDataFolder' } });
      return send(200, { files: [...state.files.values()].map(meta) });
    }
    let m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const f = state.files.get(m[1]); if (!f) return send(404, { error: { message: 'not found' } });
      if (u.searchParams.get('alt') === 'media') { state.downloads++; return send(200, f.body, 'application/json'); }
      return send(200, meta(f));
    }
    if (m && req.method === 'DELETE') { state.files.delete(m[1]); return send(204, ''); }
    if (req.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const b = (req.headers['content-type'] || '').match(/boundary=(.+)$/);
      const parts = b ? raw.split('--' + b[1]).map(p => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '')).filter(Boolean) : [];
      let info = {}; try { info = JSON.parse(parts[0]); } catch (_) {}
      if (!info.parents || info.parents[0] !== 'appDataFolder') return send(400, { error: { message: 'must be created in appDataFolder' } });
      if (state.beforeUpload) { const fn = state.beforeUpload; state.beforeUpload = null; fn(state); }
      const f = { id: 'f' + state.nextId++, name: info.name, body: parts[1] || '', version: 1, modified: Date.now() };
      state.files.set(f.id, f); state.uploads++;
      return send(200, meta(f));
    }
    m = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (m && req.method === 'PATCH') {
      const f = state.files.get(m[1]); if (!f) return send(404, { error: { message: 'not found' } });
      f.body = raw; f.version++; f.modified = Date.now(); state.uploads++;
      return send(200, meta(f));
    }
    send(404, { error: { message: 'unknown endpoint ' + req.method + ' ' + u.pathname } });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, state, base: 'http://127.0.0.1:' + server.address().port })));
}

module.exports = { start };
