// NotedStore: lớp truy cập dữ liệu dùng chung cho content script, dashboard và popup.
// Script "classic" (không phải ES module) để có thể nạp thẳng vào content script.
// Mỗi dự án được lưu thành một key riêng trong chrome.storage.local: "p:<chain>:<address>".
(() => {
  'use strict';
  if (globalThis.NotedStore) return;

  const PREFIX = 'p:';
  const store = chrome.storage.local;

  // Tên hiển thị cho các chain gmgn hỗ trợ (segment đầu trong URL /{chain}/token/{address}).
  const CHAIN_LABELS = {
    sol: 'Solana', eth: 'Ethereum', bsc: 'BSC', base: 'Base', robinhood: 'Robinhood',
    xlayer: 'X Layer', arb: 'Arbitrum', op: 'Optimism', avax: 'Avalanche', blast: 'Blast',
    tron: 'Tron', stable: 'Stable', polygon: 'Polygon', abstract: 'Abstract', monad: 'Monad',
  };
  const CHAIN_ALIAS = {
    bnb: 'bsc', solana: 'sol', ethereum: 'eth', arbitrum: 'arb', optimism: 'op',
    avalanche: 'avax', 'x-layer': 'xlayer', matic: 'polygon',
  };

  const STATUSES = [
    { id: 'watching',    icon: '👀', label: 'Watching' },
    { id: 'researching', icon: '🔬', label: 'Researching' },
    { id: 'holding',     icon: '💼', label: 'Holding' },
    { id: 'sold',        icon: '✅', label: 'Sold' },
    { id: 'passed',      icon: '⛔', label: 'Passed' },
    { id: 'dead',        icon: '💀', label: 'Dead / Rug' },
  ];

  const ENTRY_TYPES = [
    { id: 'note',     icon: '📝', label: 'Note' },
    { id: 'research', icon: '🔎', label: 'Research' },
    { id: 'news',     icon: '📰', label: 'News / Update' },
    { id: 'buy',      icon: '🟢', label: 'Buy' },
    { id: 'sell',     icon: '🔴', label: 'Sell' },
    { id: 'alert',    icon: '⚠️', label: 'Alert' },
    { id: 'link',     icon: '🔗', label: 'Link' },
  ];

  const now = () => Date.now();
  const uid = () => Math.random().toString(36).slice(2, 10) + now().toString(36);
  // Nhãn hiển thị theo ngôn ngữ (NotedI18n nếu đã nạp, không thì tiếng Anh trong bảng trên).
  const tr = (key, fallback) => (globalThis.NotedI18n ? globalThis.NotedI18n.t(key) : fallback);
  const statusLabel = id => { const s = STATUSES.find(x => x.id === id) || STATUSES[0]; return tr('st_' + s.id, s.label); };
  const entryLabel = id => { const e = ENTRY_TYPES.find(x => x.id === id) || ENTRY_TYPES[0]; return tr('et_' + e.id, e.label); };

  function normalizeChain(raw) {
    const c = String(raw || '').trim().toLowerCase();
    return CHAIN_ALIAS[c] || c;
  }

  // Chấp nhận địa chỉ EVM (0x + 40 hex, về chữ thường), base58 (Solana, Tron), 0x + 64 hex (Sui, Aptos, Starknet),
  // TON (base64url 48 ký tự) và các chuỗi địa chỉ dài khác; bỏ tiền tố mã giới thiệu "abc_" của link gmgn nếu có.
  function normalizeAddress(raw) {
    let a = String(raw || '').trim();
    if (/^0x[0-9a-f]{40}$/i.test(a)) return a.toLowerCase();
    if (/^0x[0-9a-f]{64}$/i.test(a)) return a.toLowerCase();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return a;
    if (/^[A-Za-z0-9_-]{48}$/.test(a)) return a;                       // TON
    if (/^[A-Za-z0-9]{2,12}_[A-Za-z0-9]{20,}$/.test(a)) a = a.slice(a.indexOf('_') + 1); // ref_address (gmgn)
    if (/^0x[0-9a-f]{40}$/i.test(a)) return a.toLowerCase();
    if (/^[A-Za-z0-9_.:-]{20,90}$/.test(a)) return a;                   // chain khác (Aptos "0x..::coin", ...)
    return null;
  }

  function keyOf(chain, address) {
    return `${chain}:${address}`;
  }

  // "/robinhood/token/0xaa40..." hoặc URL đầy đủ -> { chain, address, key } hoặc null.
  function parseTokenUrl(input) {
    if (!input) return null;
    let u;
    try { u = new URL(String(input), 'https://gmgn.ai'); } catch (_) { return null; }
    if (!/(^|\.)gmgn\.ai$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[1].toLowerCase() !== 'token') return null;
    const chain = normalizeChain(parts[0]);
    const address = normalizeAddress(parts[2]);
    if (!/^[a-z0-9-]{2,20}$/.test(chain) || !address) return null;
    return { chain, address, key: keyOf(chain, address) };
  }

  function tokenUrl(p) {
    return `https://gmgn.ai/${p.chain}/token/${p.address}`;
  }

  function chainLabel(chain) {
    return CHAIN_LABELS[chain] || String(chain || '').toUpperCase();
  }

  function shortAddress(address) {
    const a = String(address || '');
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  }

  function emptyProject(chain, address, extra = {}) {
    const t = now();
    return {
      key: keyOf(chain, address),
      chain, address,
      symbol: '', name: '',
      summary: '',
      tags: [],
      pinned: false,
      status: 'watching',
      rating: 0,
      timeline: [],
      createdAt: t,
      updatedAt: t,
      ...extra,
    };
  }

  const LIMITS = { symbol: 32, name: 200, summary: 20000, tag: 40, tags: 50, entryText: 20000, entries: 5000, mc: 24, removed: 3000 };

  // ---- Dấu vết xoá (tombstone) ----
  // Gộp hai bản ghi chú (import, sync giữa hai máy) là phép HỢP, nên thứ đã xoá ở máy này sẽ sống lại từ bản của
  // máy kia — trừ khi việc xoá cũng được ghi lại. Mốc đã xoá: project.removed = { <id mốc>: <lúc xoá> }.
  // Dự án đã xoá: một mục riêng trong storage, DELETED_KEY = { <key dự án>: <lúc xoá> }. Dấu vết tự hết hạn sau
  // 90 ngày; tới lúc đó mọi máy đã kịp gộp.
  const DELETED_KEY = 'deleted';
  const TOMB_TTL = 90 * 24 * 3600 * 1000;
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

  function cleanTombs(map, isKey) {
    const out = {};
    if (!map || typeof map !== 'object') return out;
    const cutoff = Date.now() - TOMB_TTL;
    let n = 0;
    for (const [k, v] of Object.entries(map)) {
      const ts = Number(v);
      if (!isKey(k) || !Number.isFinite(ts) || ts <= cutoff) continue;
      out[k] = ts;
      if (++n >= LIMITS.removed) break;
    }
    return out;
  }
  const unionTombs = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(out[k] || 0, v); return out; };
  const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
  const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; };

  // Chuẩn hoá một bản ghi (từ storage hoặc file import): chain/address phải hợp lệ, mọi trường ép về đúng kiểu
  // và giới hạn độ dài. Trả về null nếu bản ghi không dùng được (khoá không hợp lệ).
  function sanitize(p) {
    if (!p || typeof p !== 'object') return null;
    const chain = normalizeChain(p.chain);
    const address = normalizeAddress(p.address);
    if (!/^[a-z0-9-]{2,20}$/.test(chain) || !address) return null;
    const base = emptyProject(chain, address);
    const out = {
      key: keyOf(chain, address), chain, address,
      symbol: str(p.symbol, LIMITS.symbol).trim(),
      name: str(p.name, LIMITS.name).trim(),
      summary: str(p.summary, LIMITS.summary),
      tags: (Array.isArray(p.tags) ? p.tags : []).map(t => str(t, LIMITS.tag).trim().toLowerCase()).filter(Boolean).slice(0, LIMITS.tags),
      pinned: !!p.pinned,
      status: STATUSES.some(s => s.id === p.status) ? p.status : 'watching',
      rating: Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0))),
      timeline: [],
      createdAt: num(p.createdAt, base.createdAt),
      updatedAt: num(p.updatedAt, base.updatedAt),
    };
    const seen = new Set();
    for (const e of (Array.isArray(p.timeline) ? p.timeline : []).slice(0, LIMITS.entries)) {
      if (!e || typeof e !== 'object' || typeof e.text !== 'string') continue;
      const entry = {
        id: /^[A-Za-z0-9_-]{1,40}$/.test(String(e.id || '')) ? String(e.id) : uid(),
        ts: num(e.ts, out.updatedAt),
        type: ENTRY_TYPES.some(x => x.id === e.type) ? e.type : 'note',
        text: str(e.text, LIMITS.entryText),
      };
      if (e.mc) entry.mc = str(e.mc, LIMITS.mc);
      if (e.source) entry.source = str(e.source, 20);
      if (typeof e.image === 'string' && /^img_[A-Za-z0-9]{1,40}$/.test(e.image)) entry.image = e.image;
      if (e.tweetId != null && /^\d{1,30}$/.test(String(e.tweetId))) entry.tweetId = String(e.tweetId);
      if (seen.has(entry.id)) entry.id = uid();
      seen.add(entry.id);
      out.timeline.push(entry);
    }
    const removed = cleanTombs(p.removed, k => ID_RE.test(k));
    if (Object.keys(removed).length) {
      out.removed = removed;
      out.timeline = out.timeline.filter(e => !removed[e.id]);
    }
    return out;
  }

  // Gộp hai bản của CÙNG một dự án. Thuần tuý, không đụng storage.
  //   - tóm tắt / tên / trạng thái / điểm / ghim: bản sửa sau (updatedAt lớn hơn) thắng cả cụm
  //   - tag: opts.tags = 'newer' (sync: xoá tag cũng phải lan đi) hoặc 'union' (import file cũ: không làm mất tag)
  //   - timeline: hợp theo id, trừ những mốc có dấu vết xoá ở BẤT KỲ bên nào; mốc trùng id lấy của bản sửa sau
  function mergeProject(a, b, opts = {}) {
    if (!a || !b) return a || b || null;
    const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
    const older = newer === a ? b : a;
    const removed = unionTombs(cleanTombs(a.removed, k => ID_RE.test(k)), cleanTombs(b.removed, k => ID_RE.test(k)));
    const byId = new Map();
    for (const e of older.timeline || []) byId.set(e.id, e);
    for (const e of newer.timeline || []) byId.set(e.id, e);
    const out = { ...older, ...newer };
    out.timeline = [...byId.values()].filter(e => !removed[e.id]).sort((x, y) => (x.ts - y.ts) || (x.id < y.id ? -1 : 1));
    out.tags = opts.tags === 'union' ? [...new Set([...(newer.tags || []), ...(older.tags || [])])].slice(0, LIMITS.tags) : [...(newer.tags || [])];
    out.createdAt = Math.min(a.createdAt || Infinity, b.createdAt || Infinity) || now();
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    if (Object.keys(removed).length) out.removed = removed; else delete out.removed;
    return out;
  }

  async function getDeleted() {
    const r = await store.get(DELETED_KEY);
    return cleanTombs(r[DELETED_KEY], k => /^[a-z0-9-]{2,20}:.{1,120}$/.test(k));
  }

  async function get(key) {
    const r = await store.get(PREFIX + key);
    const p = r[PREFIX + key];
    return p ? sanitize(p) : null;
  }

  async function getAll() {
    const r = await store.get(null);
    return Object.keys(r)
      .filter(k => k.startsWith(PREFIX))
      .map(k => sanitize(r[k]))
      .filter(Boolean);
  }

  // Ghi dự án. Nếu bản trong máy không cũ hơn bản đang sửa (ví dụ Grok vừa tự lưu một mốc trong lúc panel đang mở),
  // thì gộp timeline thay vì ghi đè — mốc của nơi khác không bị mất. opts.removedIds là những mốc người dùng
  // chủ động xoá, để chúng không bị gộp trở lại: nơi gọi nào bỏ mốc khỏi timeline đều phải truyền danh sách này.
  async function save(project, opts = {}) {
    const p = sanitize(project);
    if (!p) throw new Error('Invalid project (chain/address).');
    const cur = await get(p.key);
    const t = now();
    const tombs = unionTombs(p.removed, cur && cur.removed);
    for (const id of (opts.removedIds || []).map(String)) if (ID_RE.test(id)) tombs[id] = t;
    if (cur && cur.updatedAt >= (Number(project.updatedAt) || 0)) {
      const byId = new Map();
      for (const e of cur.timeline) byId.set(e.id, e);
      for (const e of p.timeline) byId.set(e.id, e);
      p.timeline = [...byId.values()].sort((a, b) => a.ts - b.ts);
      p.createdAt = Math.min(p.createdAt, cur.createdAt);
    }
    p.timeline = p.timeline.filter(e => !tombs[e.id]);
    if (Object.keys(tombs).length) p.removed = tombs; else delete p.removed;
    p.updatedAt = t;
    await store.set({ [PREFIX + p.key]: p });
    // Dự án từng bị xoá nay được ghi lại: người dùng muốn nó tồn tại, bỏ dấu vết xoá.
    const deleted = await getDeleted();
    if (deleted[p.key]) { delete deleted[p.key]; await store.set({ [DELETED_KEY]: deleted }); }
    return p;
  }

  async function remove(key) {
    await store.remove(PREFIX + key);
    const deleted = await getDeleted();
    deleted[key] = now();
    await store.set({ [DELETED_KEY]: deleted });
  }

  function newEntry(type, text, extra = {}) {
    return { id: uid(), ts: now(), type: type || 'note', text: String(text || '').trim(), ...extra };
  }

  // ---- Cỡ chữ giao diện: một nguồn duy nhất cho side panel, dashboard và popup ----
  const FONT = { min: 11, max: 22, def: 14, step: 1 };

  function fontSize(settings) {
    const n = Math.round(Number(settings && settings.fontSize));
    return Number.isFinite(n) && n >= FONT.min && n <= FONT.max ? n : FONT.def;
  }

  async function setFontSize(px) {
    const n = Math.min(FONT.max, Math.max(FONT.min, Math.round(Number(px)) || FONT.def));
    const r = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(r.settings || {}), fontSize: n } });
    return n;
  }

  // Áp cỡ chữ hiện tại rồi theo dõi thay đổi: đổi ở một nơi là mọi nơi đổi theo, không cần tải lại.
  function watchFontSize(apply) {
    chrome.storage.local.get('settings').then(r => apply(fontSize(r.settings))).catch(() => apply(FONT.def));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) apply(fontSize(changes.settings.newValue));
    });
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
      if (keys.length) cb(keys, changes);
    });
  }

  const IMG_PREFIX = 'img:';
  const IMG_RE = /^img_[A-Za-z0-9]{1,40}$/;
  const IMG_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const IMG_MAX_BYTES = 2 * 1024 * 1024;

  async function getImage(id) {
    if (!IMG_RE.test(String(id || ''))) return null;
    const r = await store.get(IMG_PREFIX + id);
    return r[IMG_PREFIX + id] || null;
  }

  async function removeImages(ids) {
    const keys = (ids || []).filter(id => IMG_RE.test(String(id || ''))).map(id => IMG_PREFIX + id);
    if (keys.length) await store.remove(keys);
  }

  async function exportJSON(opts = {}) {
    const projects = await getAll();
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    const out = { app: 'research-noted-gmgn', version: 2, exportedAt: new Date().toISOString(), projects };
    if (opts.images !== false) {
      const ids = projects.flatMap(p => p.timeline.map(e => e.image).filter(Boolean));
      if (ids.length) {
        const r = await store.get(ids.map(id => IMG_PREFIX + id));
        out.images = {};
        for (const id of ids) if (r[IMG_PREFIX + id]) out.images[id] = r[IMG_PREFIX + id];
      }
    }
    return out;
  }

  // Gộp dữ liệu import vào dữ liệu hiện có: bản mới hơn thắng, timeline được gộp theo id.
  async function importJSON(data) {
    const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : null);
    if (!incoming) throw new Error('Not a Research-Noted-Gmgn export file.');
    const existingList = await getAll();
    const existing = new Map(existingList.map(p => [p.key, p]));
    if (existingList.length) await createBackup('import');   // gộp là thao tác không hoàn tác được bằng tay
    const toWrite = {};
    let added = 0, merged = 0, skipped = 0;
    for (const raw of incoming) {
      const inc = sanitize(raw);
      if (!inc) { skipped++; continue; }
      const cur = existing.get(inc.key);
      let result;
      if (!cur) { result = inc; added++; }
      else { result = mergeProject(cur, inc, { tags: 'union' }); merged++; }
      toWrite[PREFIX + result.key] = result;
    }
    // Ảnh chụp kèm (nếu file export có): kiểm tra id, định dạng data URL và kích thước.
    let images = 0;
    if (data && data.images && typeof data.images === 'object') {
      for (const [id, img] of Object.entries(data.images)) {
        if (!IMG_RE.test(id) || !img || typeof img.data !== 'string' || img.data.length > IMG_MAX_BYTES * 1.4 || !IMG_DATA_RE.test(img.data)) continue;
        toWrite[IMG_PREFIX + id] = { data: img.data, w: Number(img.w) || 0, h: Number(img.h) || 0, ts: Number(img.ts) || now() };
        images++;
      }
    }
    if (Object.keys(toWrite).length) await store.set(toWrite);
    return { added, merged, skipped, images };
  }

  // ---- Sao lưu tự động ----
  // Chụp toàn bộ ghi chú (không kèm ảnh) trước những thao tác gộp dữ liệu từ nơi khác: import file, sync. Giữ
  // BACKUP_KEEP bản gần nhất. Khôi phục là THAY toàn bộ ghi chú bằng bản sao lưu (kể cả bỏ qua dấu vết xoá), và
  // chính nó cũng sao lưu trạng thái hiện tại trước, nên khôi phục nhầm vẫn quay lại được.
  const BACKUP_PREFIX = 'backup:';
  const BACKUP_KEEP = 5;

  async function listBackups() {
    const all = await store.get(null);
    return Object.keys(all).filter(k => k.startsWith(BACKUP_PREFIX))
      .map(k => ({ ts: Number(all[k] && all[k].ts) || 0, reason: String((all[k] && all[k].reason) || ''), count: Number(all[k] && all[k].count) || 0 }))
      .filter(b => b.ts > 0).sort((a, b) => b.ts - a.ts);
  }

  async function createBackup(reason, opts = {}) {
    const list = await listBackups();
    if (opts.minGapMs && list[0] && list[0].reason === reason && now() - list[0].ts < opts.minGapMs) return list[0].ts;
    const projects = await getAll();
    if (!projects.length) return 0;
    let ts = now();
    if (list[0] && ts <= list[0].ts) ts = list[0].ts + 1;
    await store.set({ [BACKUP_PREFIX + ts]: { ts, reason: str(reason, 40), count: projects.length, data: { projects, deleted: await getDeleted() } } });
    const stale = (await listBackups()).slice(BACKUP_KEEP).map(b => BACKUP_PREFIX + b.ts);
    if (stale.length) await store.remove(stale);
    return ts;
  }

  async function restoreBackup(ts) {
    const k = BACKUP_PREFIX + Number(ts);
    const rec = (await store.get(k))[k];
    if (!rec || !rec.data || !Array.isArray(rec.data.projects)) throw new Error('Backup not found.');
    await createBackup('before-restore');
    const all = await store.get(null);
    // Khôi phục phải THẮNG mọi lần gộp về sau (sync với máy khác vẫn còn giữ dấu vết xoá): mốc đang có dấu vết xoá
    // nhận id mới để không bị xoá lại, và dự án khôi phục mang updatedAt = bây giờ để thắng bản cũ lẫn dấu "đã xoá".
    const t = now();
    const tombs = {};
    for (const k of Object.keys(all)) if (k.startsWith(PREFIX) && all[k] && all[k].removed) Object.assign(tombs, all[k].removed);
    const toWrite = {};
    for (const raw of rec.data.projects) {
      const p = sanitize(raw);
      if (!p) continue;
      for (const e of p.timeline) if (tombs[e.id]) e.id = uid();
      p.removed = unionTombs(p.removed, (all[PREFIX + p.key] && all[PREFIX + p.key].removed) || {});
      if (!Object.keys(p.removed).length) delete p.removed;
      p.updatedAt = t;
      toWrite[PREFIX + p.key] = p;
    }
    const gone = Object.keys(all).filter(x => x.startsWith(PREFIX) && !(x in toWrite));
    if (gone.length) await store.remove(gone);
    // Dự án có bây giờ nhưng không có trong bản sao lưu: coi như bị xoá lúc này, để sync không mang nó về lại.
    const del = cleanTombs(rec.data.deleted, x => /^[a-z0-9-]{2,20}:.{1,120}$/.test(x));
    for (const x of gone) del[x.slice(PREFIX.length)] = t;
    for (const x of Object.keys(toWrite)) delete del[x.slice(PREFIX.length)];
    const restored = Object.keys(toWrite).length;
    toWrite[DELETED_KEY] = del;
    await store.set(toWrite);
    return { restored, removed: gone.length };
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Xuất Markdown để đọc lại hoặc đưa cho AI tổng hợp.
  function toMarkdown(projects) {
    const T = key => (globalThis.NotedI18n ? globalThis.NotedI18n.t(key) : key);
    const title = globalThis.NotedI18n ? globalThis.NotedI18n.t('md_title', { date: fmtDate(now()) }) : `Noted for GMGN — export ${fmtDate(now())}`;
    const lines = [`# ${title}`, ''];
    const sorted = [...projects].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    for (const p of sorted) {
      const st = STATUSES.find(s => s.id === p.status) || STATUSES[0];
      lines.push(`## ${p.symbol || shortAddress(p.address)}${p.name ? ` — ${p.name}` : ''} (${chainLabel(p.chain)})${p.pinned ? ' 📌' : ''}`);
      lines.push(`- ${T('md_address')}: \`${p.address}\` — ${tokenUrl(p)}`);
      lines.push(`- ${T('md_status')}: ${st.icon} ${statusLabel(p.status)} · ${T('md_conviction')}: ${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}${p.tags.length ? ` · ${T('md_tags')}: ${p.tags.join(', ')}` : ''}`);
      if (p.summary) lines.push(`- ${T('md_summary')}: ${p.summary.replace(/\s*\n\s*/g, ' ')}`);
      if (p.timeline.length) {
        lines.push('', `### ${T('md_timeline')}`);
        for (const e of [...p.timeline].sort((a, b) => a.ts - b.ts)) {
          const et = ENTRY_TYPES.find(t => t.id === e.type) || ENTRY_TYPES[0];
          lines.push(`- ${fmtDate(e.ts)} ${et.icon} [${entryLabel(e.type)}]${e.mc ? ` (MC ${e.mc})` : ''}: ${e.text.replace(/\s*\n\s*/g, ' ')}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  globalThis.NotedStore = {
    PREFIX, STATUSES, ENTRY_TYPES, CHAIN_LABELS,
    keyOf, normalizeChain, normalizeAddress, parseTokenUrl, tokenUrl, chainLabel, shortAddress, statusLabel, entryLabel,
    emptyProject, sanitize, newEntry, uid,
    get, getAll, save, remove, onChange, getImage, removeImages, IMG_RE,
    FONT, fontSize, setFontSize, watchFontSize,
    exportJSON, importJSON, toMarkdown, fmtDate,
    mergeProject, getDeleted, DELETED_KEY, TOMB_TTL, cleanTombs, unionTombs,
    listBackups, createBackup, restoreBackup, BACKUP_PREFIX,
  };
})();
