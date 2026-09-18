// NotedDrive: kho từ xa cho NotedSync, là MỘT file trong vùng dữ liệu riêng của ứng dụng trên Google Drive của
// chính người dùng (spaces=appDataFolder, scope drive.appdata): ứng dụng không thấy file nào khác trong Drive, và
// file này không hiện trong drive.google.com.
//
//   new NotedDrive({ token: async () => '<access token>', base?: 'http://127.0.0.1:<port>' })
// token: trong extension là chrome.identity.getAuthToken (xem src/sync-controller.js); base chỉ nhận chính Google hoặc máy cục bộ (Drive giả lập
// trong test) — không bao giờ gửi ghi chú tới nơi nào khác.
(() => {
  'use strict';
  if (globalThis.NotedDrive) return;
  const GOOGLE = 'https://www.googleapis.com';
  const FILE_NAME = 'noted-sync-v1.json';

  function fail(code, message, status) { return Object.assign(new Error(message), { code, status }); }

  class NotedDrive {
    constructor({ token, base } = {}) {
      const b = String(base || GOOGLE).replace(/\/+$/, '');
      if (b !== GOOGLE && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(b)) throw fail('bad-base', 'Sync only talks to Google Drive.');
      if (typeof token !== 'function') throw fail('no-token', 'A token provider is required.');
      this.base = b; this.token = token; this.fileId = null;
    }

    async req(path, init = {}) {
      const tk = await this.token();
      if (!tk) throw fail('signed-out', 'Not signed in to Google.');
      let res;
      try { res = await fetch(this.base + path, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + tk } }); }
      catch (err) { throw fail('network', 'Could not reach Google Drive: ' + (err && err.message)); }
      if (res.ok) return res;
      let reason = '';
      try { const j = await res.json(); reason = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status || j.error.message)) || ''; } catch (_) {}
      if (res.status === 401) throw fail('signed-out', 'Google sign-in expired.', 401);
      if (res.status === 403 && /storageQuota/i.test(reason)) throw fail('quota', 'Google Drive is full.', 403);
      if (res.status === 403) throw fail('forbidden', 'Google Drive refused access' + (reason ? ` (${reason})` : '') + '.', 403);
      if (res.status === 404) throw fail('not-found', 'Sync file not found.', 404);
      throw fail('http', `Google Drive answered ${res.status}` + (reason ? ` (${reason})` : ''), res.status);
    }

    async find() {
      const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
      const j = await (await this.req(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,version,modifiedTime)&pageSize=10`)).json();
      const files = ((j && j.files) || []).sort((a, b) => String(a.modifiedTime) < String(b.modifiedTime) ? 1 : -1);
      return files[0] || null;   // hai máy cùng tạo file lần đầu: dùng bản mới nhất, nội dung đằng nào cũng được gộp
    }

    // -> { data, rev } hoặc null khi chưa có file. JSON hỏng => lỗi 'bad-remote' (NotedSync sẽ không gộp, không ghi đè).
    async download() {
      const f = await this.find();
      if (!f) { this.fileId = null; return null; }
      this.fileId = f.id;
      const text = await (await this.req(`/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`)).text();
      let data;
      try { data = JSON.parse(text); } catch (_) { throw fail('bad-remote', 'The sync file on Google Drive is not valid JSON.'); }
      return { data, rev: String(f.version) };
    }

    // prevRev: phiên bản đã tải về (null = lúc đó chưa có file). File đã đổi từ lúc đó => 'conflict' để NotedSync gộp lại.
    async upload(data, prevRev) {
      const body = JSON.stringify(data);
      const cur = await this.find();
      if ((cur ? String(cur.version) : null) !== (prevRev == null ? null : String(prevRev))) throw fail('conflict', 'The sync file changed on Google Drive.');
      if (!cur) {
        const boundary = 'noted' + Math.random().toString(36).slice(2);
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const j = await (await this.req('/upload/drive/v3/files?uploadType=multipart&fields=id,version', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart })).json();
        this.fileId = j.id;
        return { rev: String(j.version) };
      }
      const j = await (await this.req(`/upload/drive/v3/files/${encodeURIComponent(cur.id)}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body })).json();
      return { rev: String(j.version) };
    }

    // "Xoá bản trên Drive": gỡ mọi file sync trong appDataFolder.
    async wipe() {
      for (let f = await this.find(); f; f = await this.find()) await this.req(`/drive/v3/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
      this.fileId = null;
    }
  }

  globalThis.NotedDrive = NotedDrive;
})();
