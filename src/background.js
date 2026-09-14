// Service worker: trung tâm điều phối mở ghi chú.
// Ưu tiên Chrome Side Panel (nằm ngoài trang, trình duyệt tự thu hẹp gmgn nên không che gì);
// nếu không mở được hoặc người dùng chọn "overlay" thì bảo content script mở drawer trong trang.
'use strict';
importScripts('lib/storage.js', 'lib/research.js');

const SESSION_PREFIX = 'tab:';
const GROK_PREFIX = 'grok:';
const DEX_CACHE_KEY = 'dex:pairs';
const DEX_API = 'https://api.dexscreener.com';
const pageTokens = new Map(); // tabId -> token đang xem (content script báo), dùng cho phím tắt trên site không có token trong URL
let uiMode = 'panel';  // 'panel' | 'drawer' (cache của settings.ui, vì handler phím tắt không được await trước sidePanel.open)
let follow = true;     // settings.follow: Side Panel tự chuyển sang token của trang đang xem

function applySettings(st) {
  st = st || {};
  uiMode = st.ui || 'panel';
  follow = st.follow !== false;
}
chrome.storage.local.get('settings').then(r => applySettings(r.settings));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applySettings(changes.settings.newValue);
});

function notifyPanels(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function remember(tabId, token, ctx) {
  await chrome.storage.session.set({ [SESSION_PREFIX + tabId]: { token, ctx: ctx || {}, at: Date.now() } });
  notifyPanels({ type: 'noted:show', tabId, token, ctx: ctx || {} });
}

// Mở ghi chú cho token trong tab. Phải gọi sidePanel.open() ngay trong lượt xử lý user gesture (không await trước).
function openNote({ tabId, token, ctx, mode, fromContent }, sendResponse) {
  const drawer = async () => {
    if (!fromContent) {
      try { await chrome.tabs.sendMessage(tabId, { type: 'noted:open-drawer', token, ctx: ctx || {} }); } catch (_) {}
    }
    sendResponse({ ok: true, mode: 'drawer' });
  };
  if ((mode || uiMode) === 'drawer' || !chrome.sidePanel) { drawer(); return; }
  chrome.sidePanel.open({ tabId })
    .then(async () => { await remember(tabId, token, ctx); sendResponse({ ok: true, mode: 'panel' }); })
    .catch(err => { console.warn('[Research-Noted-Gmgn] sidePanel.open thất bại, dùng drawer:', err && err.message); drawer(); });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'noted:open': {
      const tabId = msg.tabId || (sender.tab && sender.tab.id);
      if (!tabId || !msg.token) { sendResponse({ ok: false }); return; }
      openNote({ tabId, token: msg.token, ctx: msg.ctx || {}, mode: msg.mode, fromContent: !!sender.tab }, sendResponse);
      return true; // trả lời bất đồng bộ
    }
    case 'noted:open-dashboard':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    // ---- Research với Grok ----
    case 'noted:open-grok': { // mở tab Grok với prompt điền sẵn, nhớ token cho tab đó
      const url = NotedResearch.urlFor(msg.target, msg.prompt || '');
      chrome.tabs.create({ url }).then(async tab => {
        await chrome.storage.session.set({ [GROK_PREFIX + tab.id]: { token: msg.token, symbol: msg.symbol || '', prompt: msg.prompt || '', at: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      }).catch(err => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }
    case 'noted:grok-context': { // content script trên Grok hỏi tab này đang research token nào
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) { sendResponse(null); return; }
      chrome.storage.session.get(GROK_PREFIX + tabId).then(r => sendResponse(r[GROK_PREFIX + tabId] || null));
      return true;
    }
    case 'noted:grok-link': { // gắn tay tab Grok với một dự án
      const tabId = sender.tab && sender.tab.id;
      const token = msg.token;
      if (!tabId || !token) { sendResponse({ ok: false }); return; }
      (async () => {
        const p = await NotedStore.get(token.key);
        const entry = { token, symbol: (p && p.symbol) || msg.symbol || '', prompt: '', at: Date.now() };
        await chrome.storage.session.set({ [GROK_PREFIX + tabId]: entry });
        sendResponse({ ok: true, ...entry });
      })();
      return true;
    }
    case 'noted:grok-save': { // lưu câu trả lời vào timeline của token gắn với tab
      const tabId = sender.tab && sender.tab.id;
      (async () => {
        const r = tabId ? await chrome.storage.session.get(GROK_PREFIX + tabId) : {};
        const m = r[GROK_PREFIX + tabId];
        if (!m || !m.token) { sendResponse({ ok: false, reason: 'unlinked' }); return; }
        const text = String(msg.text || '').trim().slice(0, 20000);
        if (!text) { sendResponse({ ok: false, reason: 'empty' }); return; }
        let p = await NotedStore.get(m.token.key) || NotedStore.emptyProject(m.token.chain, m.token.address, { symbol: m.symbol || '' });
        if (!p.symbol && m.symbol) p.symbol = m.symbol;
        const body = msg.url ? `${text}\n\n${msg.sourceLabel || 'Source'}: ${msg.url}` : text;
        p.timeline.push(NotedStore.newEntry('research', body, { source: 'grok' }));
        p = await NotedStore.save(p);
        sendResponse({ ok: true, key: p.key, symbol: p.symbol, entries: p.timeline.length });
      })();
      return true;
    }
    case 'noted:page-token': { // content script báo token của trang hiện tại
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) { sendResponse({ ok: false }); return; }
      if (msg.token) pageTokens.set(tabId, msg.token); else pageTokens.delete(tabId);
      // Theo dõi trang: nếu panel của tab này đã từng mở thì chuyển sang token mới (không tự mở panel).
      if (follow && msg.token) {
        chrome.storage.session.get(SESSION_PREFIX + tabId).then(async r => {
          const cur = r[SESSION_PREFIX + tabId];
          if (!cur) return;
          const ctx = { ...(cur.token && cur.token.key === msg.token.key ? cur.ctx : {}), ...(msg.ctx || {}) };
          if (!ctx.symbol && cur.token && cur.token.key === msg.token.key && cur.ctx) ctx.symbol = cur.ctx.symbol || '';
          await remember(tabId, msg.token, ctx);
        }).catch(() => {});
      }
      sendResponse({ ok: true });
      return;
    }
    case 'noted:dex-resolve': { // pair DexScreener -> token
      dexResolve(String(msg.chain || '').toLowerCase(), Array.isArray(msg.addresses) ? msg.addresses : [])
        .then(r => sendResponse({ ok: true, results: r.results, reasons: r.reasons }))
        .catch(err => sendResponse({ ok: false, error: String(err && err.message), results: {}, reasons: {} }));
      return true;
    }
    case 'noted:recent-projects': {
      NotedStore.getAll().then(all => {
        all.sort((a, b) => b.updatedAt - a.updatedAt);
        sendResponse(all.slice(0, 20).map(p => ({ key: p.key, chain: p.chain, address: p.address, symbol: p.symbol, name: p.name })));
      });
      return true;
    }
  }
});

// Alt+N: tab được truyền sẵn nên không cần tabs.query (giữ được user gesture cho sidePanel.open).
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-note' || !tab || !tab.id) return;
  const token = NotedStore.parseTokenUrl(tab.url || '') || pageTokens.get(tab.id) || null;
  if (!token) {
    chrome.tabs.sendMessage(tab.id, { type: 'noted:toast', key: 'toast_open_token' }).catch(() => {});
    return;
  }
  openNote({ tabId: tab.id, token, ctx: {}, mode: uiMode, fromContent: false }, () => {});
});

chrome.tabs.onRemoved.addListener(tabId => {
  pageTokens.delete(tabId);
  chrome.storage.session.remove([SESSION_PREFIX + tabId, GROK_PREFIX + tabId]).catch(() => {});
});

// ---- DexScreener: đổi địa chỉ pair -> token qua API công khai (không cần key), cache vĩnh viễn trong storage.local ----
const QUOTE_SYMBOLS = new Set(['SOL', 'WSOL', 'USDC', 'USDT', 'USDC.E', 'USDBC', 'WETH', 'ETH', 'WBNB', 'BNB', 'DAI', 'WAVAX', 'AVAX', 'WMATIC', 'MATIC', 'POL', 'WBTC', 'BTC', 'WHYPE', 'HYPE', 'SUI', 'WTRX', 'TRX', 'FDUSD', 'USD1', 'CBBTC', 'WOKB', 'OKB', 'WBLAST', 'WMON', 'MON']);
let dexCachePromise = null; // một promise dùng chung để các lần tra song song không tạo ra hai bản cache ghi đè nhau

function loadDexCache() {
  if (!dexCachePromise) dexCachePromise = chrome.storage.local.get(DEX_CACHE_KEY).then(r => r[DEX_CACHE_KEY] || {});
  return dexCachePromise;
}

function pickToken(pair) {
  const b = pair.baseToken || {}, q = pair.quoteToken || {};
  const bq = QUOTE_SYMBOLS.has(String(b.symbol || '').toUpperCase());
  const qq = QUOTE_SYMBOLS.has(String(q.symbol || '').toUpperCase());
  return bq && !qq ? q : b;
}

function fmtMc(n) {
  n = Number(n);
  if (!isFinite(n) || n <= 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

async function apiBase() {
  try { const st = (await chrome.storage.local.get('settings')).settings || {}; return st.dexApiBase || DEX_API; } catch (_) { return DEX_API; }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function dexResolve(chain, addresses) {
  const cache = await loadDexCache();
  const base = await apiBase();
  const results = {};
  const reasons = {};
  const need = [];
  for (const a of addresses) {
    const k = `${chain}:${String(a).toLowerCase()}`;
    if (cache[k]) results[a] = { ...cache[k], mc: null }; else need.push(a);
  }
  const found = new Set();
  const lower = x => String(x || '').toLowerCase();
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    try {
      const j = await fetchJson(`${base}/latest/dex/pairs/${chain}/${chunk.join(',')}`);
      for (const p of (j && j.pairs) || []) {
        const a = chunk.find(x => lower(x) === lower(p.pairAddress));
        const tok = pickToken(p);
        if (!a || !tok.address) continue;
        const entry = { address: tok.address, symbol: tok.symbol || '', name: tok.name || '' };
        cache[`${chain}:${lower(a)}`] = entry;
        results[a] = { ...entry, mc: fmtMc(p.marketCap || p.fdv) };
        found.add(a);
      }
    } catch (err) { console.warn('[Research-Noted-Gmgn] dexscreener pairs:', err && err.message); for (const a of chunk) reasons[a] = `error: ${err && err.message}`; }
  }
  // Địa chỉ không phải pair có thể là địa chỉ token (dexscreener.com/{chain}/{token} cũng mở được).
  const miss = need.filter(a => !found.has(a));
  for (let i = 0; i < miss.length; i += 30) {
    const chunk = miss.slice(i, i + 30);
    try {
      const j = await fetchJson(`${base}/latest/dex/tokens/${chunk.join(',')}`);
      const pairs = (j && j.pairs) || [];
      for (const a of chunk) {
        const p = pairs.find(x => lower(x.chainId) === chain && (lower(x.baseToken && x.baseToken.address) === lower(a) || lower(x.quoteToken && x.quoteToken.address) === lower(a)));
        if (!p) continue;
        const tok = lower(p.baseToken && p.baseToken.address) === lower(a) ? p.baseToken : p.quoteToken;
        const entry = { address: tok.address, symbol: tok.symbol || '', name: tok.name || '' };
        cache[`${chain}:${lower(a)}`] = entry;
        results[a] = { ...entry, mc: fmtMc(p.marketCap || p.fdv) };
        found.add(a);
      }
    } catch (err) { console.warn('[Research-Noted-Gmgn] dexscreener tokens:', err && err.message); for (const a of chunk) reasons[a] = `error: ${err && err.message}`; }
  }
  // Dự phòng cuối: endpoint search tìm theo địa chỉ, không phụ thuộc slug chain trên URL (tối đa 20 địa chỉ/lượt).
  const still = need.filter(a => !found.has(a)).slice(0, 20);
  for (const a of still) {
    try {
      const j = await fetchJson(`${base}/latest/dex/search?q=${encodeURIComponent(a)}`);
      const pairs = (j && j.pairs) || [];
      const sameChain = x => lower(x.chainId) === chain;
      const byPair = pairs.filter(x => lower(x.pairAddress) === lower(a));
      const byToken = pairs.filter(x => lower(x.baseToken && x.baseToken.address) === lower(a) || lower(x.quoteToken && x.quoteToken.address) === lower(a));
      const p = byPair.find(sameChain) || byPair[0] || byToken.find(sameChain) || byToken[0];
      if (!p) { results[a] = null; reasons[a] = reasons[a] || 'not-found'; continue; }
      const tok = byPair.includes(p) ? pickToken(p) : (lower(p.baseToken && p.baseToken.address) === lower(a) ? p.baseToken : p.quoteToken);
      const entry = { address: tok.address, symbol: tok.symbol || '', name: tok.name || '' };
      cache[`${chain}:${lower(a)}`] = entry;
      results[a] = { ...entry, mc: fmtMc(p.marketCap || p.fdv) };
      found.add(a);
    } catch (err) { results[a] = null; reasons[a] = `error: ${err && err.message}`; }
  }
  for (const a of need) if (!(a in results)) { results[a] = null; reasons[a] = reasons[a] || 'not-found'; }
  if (found.size) chrome.storage.local.set({ [DEX_CACHE_KEY]: cache }).catch(() => {});
  return { results, reasons };
}
