// NotedSync: đồng bộ ghi chú giữa nhiều máy qua một "kho từ xa" (remote) chỉ biết tải về / đẩy lên MỘT file.
// File này không biết gì về Google: remote được truyền vào (xem drive.js), nên toàn bộ logic gộp test được bằng
// một Drive giả lập. CHƯA nằm trong gói Store: wip/ không được pack.py đóng gói, audit.py cũng không quét tới.
//
// Nguyên tắc:
//   - chrome.storage.local vẫn là nguồn chính; remote chỉ là điểm gặp nhau của các máy.
//   - Mỗi lần sync: tải về -> gộp với dữ liệu trong máy -> ghi phần thay đổi vào máy -> đẩy lên NẾU khác bản từ xa.
//   - Gộp là phép toán đối xứng và lặp lại không đổi kết quả, nên hai máy ghi đè nhau một lần cũng tự lành ở
//     lần sync sau: máy nào cũng giữ đủ dữ liệu của mình.
//   - Dữ liệu từ xa là dữ liệu KHÔNG tin cậy: đi qua NotedStore.sanitize như file import.
(() => {
  'use strict';
  if (globalThis.NotedSync) return;
  const S = globalThis.NotedStore;
  const SCHEMA = 1;
  const STATE_KEY = 'sync';          // { lastAt, lastResult, error, deviceId }
  const KEY_RE = /^[a-z0-9-]{2,20}:.{1,120}$/;

  // Chuỗi chuẩn của một dự án / cả trạng thái: hai bản giống nhau về nội dung phải ra cùng một chuỗi, để biết
  // có gì cần ghi hay cần đẩy lên không. Không có bước này thì hai máy đẩy qua đẩy lại mãi.
  function canonProject(p) {
    const o = {};
    for (const k of Object.keys(p).sort()) o[k] = p[k];
    o.tags = [...(p.tags || [])];
    o.timeline = [...(p.timeline || [])].sort((x, y) => (x.ts - y.ts) || (x.id < y.id ? -1 : 1)).map(e => { const c = {}; for (const k of Object.keys(e).sort()) c[k] = e[k]; return c; });
    if (p.removed) { const r = {}; for (const k of Object.keys(p.removed).sort()) r[k] = p.removed[k]; o.removed = r; }
    return JSON.stringify(o);
  }
  function canonState(st) {
    const del = {};
    for (const k of Object.keys(st.deleted || {}).sort()) del[k] = st.deleted[k];
    return JSON.stringify({ p: [...st.projects.keys()].sort().map(k => canonProject(st.projects.get(k))), d: del });
  }

  async function readLocal() {
    const projects = new Map();
    for (const p of await S.getAll()) projects.set(p.key, p);
    return { projects, deleted: await S.getDeleted() };
  }

  // Dữ liệu tải về -> trạng thái đã làm sạch. Ném lỗi nếu không phải file của extension (để KHÔNG gộp, KHÔNG ghi đè).
  function parseRemote(data) {
    if (!data || typeof data !== 'object' || data.app !== 'research-noted-gmgn-sync' || !Array.isArray(data.projects)) throw Object.assign(new Error('Remote file is not a Research-Noted-Gmgn sync file.'), { code: 'bad-remote' });
    if (Number(data.schema) > SCHEMA) throw Object.assign(new Error('Remote file was written by a newer version of the extension.'), { code: 'newer-schema' });
    const projects = new Map();
    for (const raw of data.projects) { const p = S.sanitize(raw); if (p) projects.set(p.key, p); }
    return { projects, deleted: S.cleanTombs(data.deleted, k => KEY_RE.test(k)) };
  }

  // Gộp hai trạng thái. Thuần tuý.
  //   dự án: S.mergeProject (tag theo bản sửa sau)
  //   dự án đã xoá: còn "đã xoá" nếu lúc xoá >= lần sửa cuối của bản gộp; sửa SAU khi xoá thì dự án sống lại
  function mergeStates(a, b) {
    const deleted = S.unionTombs(a.deleted, b.deleted);
    const projects = new Map();
    for (const key of new Set([...a.projects.keys(), ...b.projects.keys()])) {
      const m = S.mergeProject(a.projects.get(key), b.projects.get(key), { tags: 'newer' });
      if (deleted[key] && deleted[key] >= (m.updatedAt || 0)) continue;
      delete deleted[key];
      projects.set(key, m);
    }
    return { projects, deleted };
  }

  async function getState() { return (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || {}; }
  async function setState(patch) { const st = { ...(await getState()), ...patch }; await chrome.storage.local.set({ [STATE_KEY]: st }); return st; }
  async function deviceId() { const st = await getState(); if (st.deviceId) return st.deviceId; return (await setState({ deviceId: S.uid() })).deviceId; }

  // Ghi phần khác biệt vào máy. Dự án người dùng vừa sửa TRONG LÚC đang sync (updatedAt đã đổi so với lúc đọc)
  // thì bỏ qua lượt này — lần sync sau sẽ gộp nó; ghi đè lúc này là làm mất chữ đang gõ.
  async function applyLocal(before, merged) {
    const toSet = {}, toRemove = [];
    let changed = 0;
    for (const [key, p] of merged.projects) {
      const old = before.projects.get(key);
      if (old && canonProject(old) === canonProject(p)) continue;
      const cur = await S.get(key);
      if ((cur ? cur.updatedAt : 0) !== (old ? old.updatedAt : 0)) continue;
      toSet[S.PREFIX + key] = p; changed++;
    }
    for (const key of before.projects.keys()) {
      if (merged.projects.has(key)) continue;
      const cur = await S.get(key);
      if (cur && cur.updatedAt !== before.projects.get(key).updatedAt) continue;
      toRemove.push(S.PREFIX + key); changed++;
    }
    if (JSON.stringify(before.deleted) !== JSON.stringify(merged.deleted)) toSet[S.DELETED_KEY] = merged.deleted;
    if (changed) await S.createBackup('sync', { minGapMs: 3600 * 1000 });   // trước khi dữ liệu từ máy khác chạm vào ghi chú
    if (toRemove.length) await chrome.storage.local.remove(toRemove);
    if (Object.keys(toSet).length) await chrome.storage.local.set(toSet);
    return changed;
  }

  let running = null;
  // remote: { download(): Promise<{ data, rev } | null>, upload(data, prevRev): Promise<{ rev }> } — upload ném
  // lỗi có code 'conflict' khi file từ xa đã đổi kể từ lần tải về.
  function syncOnce(remote) {
    if (running) return running;
    running = (async () => {
      try {
        let pulled = 0, pushed = false;
        for (let attempt = 0; ; attempt++) {
          const before = await readLocal();
          const got = await remote.download();
          const theirs = got ? parseRemote(got.data) : { projects: new Map(), deleted: {} };
          const merged = mergeStates(before, theirs);
          pulled += await applyLocal(before, merged);
          if (got && canonState(merged) === canonState(theirs)) break;          // từ xa đã đủ: không đẩy
          const payload = { app: 'research-noted-gmgn-sync', schema: SCHEMA, writtenAt: Date.now(), deviceId: await deviceId(), projects: [...merged.projects.values()], deleted: merged.deleted };
          try { await remote.upload(payload, got ? got.rev : null); pushed = true; break; }
          catch (err) { if (err && err.code === 'conflict' && attempt < 3) continue; throw err; }   // máy kia vừa ghi: gộp lại
        }
        const local = await readLocal();
        const res = { ok: true, at: Date.now(), pulled, pushed, projects: local.projects.size };
        await setState({ lastAt: res.at, lastResult: res, error: '' });
        return res;
      } catch (err) {
        const res = { ok: false, at: Date.now(), code: (err && err.code) || 'error', error: String((err && err.message) || err) };
        await setState({ lastResult: res, error: res.error }).catch(() => {});
        return res;
      } finally { running = null; }
    })();
    return running;
  }

  globalThis.NotedSync = { SCHEMA, STATE_KEY, syncOnce, mergeStates, parseRemote, readLocal, canonState, canonProject, getState };
})();
