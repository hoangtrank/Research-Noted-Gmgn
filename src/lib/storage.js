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
    { id: 'watching',    icon: '👀', label: 'Theo dõi' },
    { id: 'researching', icon: '🔬', label: 'Đang research' },
    { id: 'holding',     icon: '💼', label: 'Đang giữ' },
    { id: 'sold',        icon: '✅', label: 'Đã bán' },
    { id: 'passed',      icon: '⛔', label: 'Bỏ qua' },
    { id: 'dead',        icon: '💀', label: 'Dead / Rug' },
  ];

  const ENTRY_TYPES = [
    { id: 'note',     icon: '📝', label: 'Ghi chú' },
    { id: 'research', icon: '🔎', label: 'Research' },
    { id: 'news',     icon: '📰', label: 'Tin / Update' },
    { id: 'buy',      icon: '🟢', label: 'Mua' },
    { id: 'sell',     icon: '🔴', label: 'Bán' },
    { id: 'alert',    icon: '⚠️', label: 'Cảnh báo' },
    { id: 'link',     icon: '🔗', label: 'Link' },
  ];

  const now = () => Date.now();
  const uid = () => Math.random().toString(36).slice(2, 10) + now().toString(36);

  function normalizeChain(raw) {
    const c = String(raw || '').trim().toLowerCase();
    return CHAIN_ALIAS[c] || c;
  }

  // Chấp nhận địa chỉ EVM (0x + 40 hex), base58 (Solana, Tron) và bỏ tiền tố mã giới thiệu "abc_" nếu có.
  function normalizeAddress(raw) {
    let a = String(raw || '').trim();
    if (a.includes('_')) a = a.slice(a.lastIndexOf('_') + 1);
    a = a.replace(/[^A-Za-z0-9]/g, '');
    if (/^0x[0-9a-f]{40}$/i.test(a)) return a.toLowerCase();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return a;
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

  function sanitize(p) {
    // Đảm bảo dữ liệu import/cũ luôn có đủ trường.
    const base = emptyProject(p.chain, p.address);
    const out = { ...base, ...p };
    out.key = keyOf(out.chain, out.address);
    out.tags = Array.isArray(out.tags) ? out.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean) : [];
    out.timeline = Array.isArray(out.timeline) ? out.timeline.filter(e => e && typeof e.text === 'string') : [];
    for (const e of out.timeline) {
      if (!e.id) e.id = uid();
      if (!e.ts) e.ts = out.updatedAt || now();
      if (!e.type) e.type = 'note';
    }
    out.rating = Math.max(0, Math.min(5, Number(out.rating) || 0));
    out.pinned = !!out.pinned;
    if (!STATUSES.some(s => s.id === out.status)) out.status = 'watching';
    return out;
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
      .map(k => sanitize(r[k]));
  }

  async function save(project) {
    const p = sanitize(project);
    p.updatedAt = now();
    await store.set({ [PREFIX + p.key]: p });
    return p;
  }

  async function remove(key) {
    await store.remove(PREFIX + key);
  }

  function newEntry(type, text, extra = {}) {
    return { id: uid(), ts: now(), type: type || 'note', text: String(text || '').trim(), ...extra };
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
      if (keys.length) cb(keys, changes);
    });
  }

  async function exportJSON() {
    const projects = await getAll();
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return { app: 'noted-for-gmgn', version: 1, exportedAt: new Date().toISOString(), projects };
  }

  // Gộp dữ liệu import vào dữ liệu hiện có: bản mới hơn thắng, timeline được gộp theo id.
  async function importJSON(data) {
    const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : null);
    if (!incoming) throw new Error('File không đúng định dạng export của Noted.');
    const existingList = await getAll();
    const existing = new Map(existingList.map(p => [p.key, p]));
    const toWrite = {};
    let added = 0, merged = 0;
    for (const raw of incoming) {
      if (!raw || !raw.chain || !raw.address) continue;
      const inc = sanitize({ ...raw, chain: normalizeChain(raw.chain), address: normalizeAddress(raw.address) || raw.address });
      const cur = existing.get(inc.key);
      let result;
      if (!cur) { result = inc; added++; }
      else {
        const newer = (inc.updatedAt || 0) >= (cur.updatedAt || 0) ? inc : cur;
        const older = newer === inc ? cur : inc;
        const seen = new Set(newer.timeline.map(e => e.id));
        result = { ...older, ...newer };
        result.timeline = [...newer.timeline, ...older.timeline.filter(e => !seen.has(e.id))];
        result.tags = [...new Set([...newer.tags, ...older.tags])];
        result.createdAt = Math.min(cur.createdAt || Infinity, inc.createdAt || Infinity) || now();
        merged++;
      }
      toWrite[PREFIX + result.key] = result;
    }
    if (Object.keys(toWrite).length) await store.set(toWrite);
    return { added, merged };
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Xuất Markdown để đọc lại hoặc đưa cho AI tổng hợp.
  function toMarkdown(projects) {
    const lines = [`# Noted for GMGN — export ${fmtDate(now())}`, ''];
    const sorted = [...projects].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    for (const p of sorted) {
      const st = STATUSES.find(s => s.id === p.status) || STATUSES[0];
      lines.push(`## ${p.symbol || shortAddress(p.address)}${p.name ? ` — ${p.name}` : ''} (${chainLabel(p.chain)})${p.pinned ? ' 📌' : ''}`);
      lines.push(`- Address: \`${p.address}\` — ${tokenUrl(p)}`);
      lines.push(`- Trạng thái: ${st.icon} ${st.label} · Conviction: ${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}${p.tags.length ? ` · Tags: ${p.tags.join(', ')}` : ''}`);
      if (p.summary) lines.push(`- Tóm tắt: ${p.summary.replace(/\s*\n\s*/g, ' ')}`);
      if (p.timeline.length) {
        lines.push('', '### Timeline');
        for (const e of [...p.timeline].sort((a, b) => a.ts - b.ts)) {
          const et = ENTRY_TYPES.find(t => t.id === e.type) || ENTRY_TYPES[0];
          lines.push(`- ${fmtDate(e.ts)} ${et.icon} [${et.label}]${e.mc ? ` (MC ${e.mc})` : ''}: ${e.text.replace(/\s*\n\s*/g, ' ')}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  globalThis.NotedStore = {
    PREFIX, STATUSES, ENTRY_TYPES, CHAIN_LABELS,
    keyOf, normalizeChain, normalizeAddress, parseTokenUrl, tokenUrl, chainLabel, shortAddress,
    emptyProject, sanitize, newEntry, uid,
    get, getAll, save, remove, onChange,
    exportJSON, importJSON, toMarkdown, fmtDate,
  };
})();
