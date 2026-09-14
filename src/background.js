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
const GROK_HOSTS = ['x.com', 'twitter.com', 'grok.com'];
const X_HOSTS = ['x.com', 'twitter.com'];
const X_MENU_ID = 'noted-save-post';

// Token gửi qua message phải hợp lệ (chain/address chuẩn hoá được) trước khi dùng làm khoá.
function validToken(t) {
  if (!t || typeof t !== 'object') return null;
  const chain = NotedStore.normalizeChain(t.chain);
  const address = NotedStore.normalizeAddress(t.address);
  if (!/^[a-z0-9-]{2,20}$/.test(chain) || !address) return null;
  return { chain, address, key: NotedStore.keyOf(chain, address) };
}
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

// Content script chỉ được gửi message "đúng vai": kiểm tra host của trang gửi.
function fromHost(sender, hosts) {
  if (!sender || !sender.tab) return false;
  try { const h = new URL(sender.url || sender.origin || '').hostname; return hosts.some(x => h === x || h.endsWith('.' + x)); } catch (_) { return false; }
}

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
      // Message từ content script: luôn dùng tab của chính nó (không cho chỉ định tab khác); từ popup/panel: dùng msg.tabId.
      const tabId = sender.tab ? sender.tab.id : Number(msg.tabId) || null;
      const token = validToken(msg.token);
      if (!tabId || !token) { sendResponse({ ok: false }); return; }
      const c = msg.ctx || {};
      openNote({ tabId, token, ctx: { symbol: String(c.symbol || '').slice(0, 32), mc: c.mc ? String(c.mc).slice(0, 24) : null }, mode: msg.mode, fromContent: !!sender.tab }, sendResponse);
      return true; // trả lời bất đồng bộ
    }
    case 'noted:open-dashboard': {
      // Trang web không được mở URL chrome-extension:// nên content script nhờ background mở (có thể kèm ?open=key).
      const key = typeof msg.key === 'string' && /^[a-z0-9-]{2,20}:[A-Za-z0-9_.:-]{20,90}$/.test(msg.key) ? msg.key : '';
      if (key) chrome.tabs.create({ url: chrome.runtime.getURL(`src/dashboard/dashboard.html?open=${encodeURIComponent(key)}`) });
      else chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    }
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
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      if (!tabId) { sendResponse(null); return; }
      chrome.storage.session.get(GROK_PREFIX + tabId).then(r => sendResponse(r[GROK_PREFIX + tabId] || null));
      return true;
    }
    case 'noted:grok-link': { // gắn tay tab Grok với một dự án
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      const token = validToken(msg.token);
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
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      (async () => {
        const r = tabId ? await chrome.storage.session.get(GROK_PREFIX + tabId) : {};
        const m = r[GROK_PREFIX + tabId];
        if (!m || !m.token) { sendResponse({ ok: false, reason: 'unlinked' }); return; }
        const text = String(msg.text || '').trim().slice(0, 20000);
        if (!text) { sendResponse({ ok: false, reason: 'empty' }); return; }
        let p = await NotedStore.get(m.token.key) || NotedStore.emptyProject(m.token.chain, m.token.address, { symbol: m.symbol || '' });
        if (!p.symbol && m.symbol) p.symbol = m.symbol;
        const body = msg.url ? `${text}\n\n${msg.sourceLabel || 'Source'}: ${msg.url}` : text;
        // Chống trùng: cùng nội dung đã có trong 10 mốc Grok gần nhất thì không thêm nữa.
        const dup = p.timeline.filter(e => e.source === 'grok').slice(-10).find(e => e.text === body);
        if (dup) { sendResponse({ ok: true, duplicate: true, key: p.key, symbol: p.symbol, entryId: dup.id, entries: p.timeline.length }); return; }
        const entry = NotedStore.newEntry('research', body, { source: 'grok' });
        p.timeline.push(entry);
        p = await NotedStore.save(p);
        sendResponse({ ok: true, key: p.key, symbol: p.symbol, entryId: entry.id, entries: p.timeline.length });
      })();
      return true;
    }
    case 'noted:page-token': { // content script báo token của trang hiện tại
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) { sendResponse({ ok: false }); return; }
      const token = validToken(msg.token);
      if (token) pageTokens.set(tabId, token); else pageTokens.delete(tabId);
      // Theo dõi trang: nếu panel của tab này đã từng mở thì chuyển sang token mới (không tự mở panel).
      if (follow && token) {
        chrome.storage.session.get(SESSION_PREFIX + tabId).then(async r => {
          const cur = r[SESSION_PREFIX + tabId];
          if (!cur) return;
          const c = msg.ctx || {};
          const ctx = { ...(cur.token && cur.token.key === token.key ? cur.ctx : {}), symbol: String(c.symbol || '').slice(0, 32), mc: c.mc ? String(c.mc).slice(0, 24) : null };
          if (!ctx.symbol && cur.token && cur.token.key === token.key && cur.ctx) ctx.symbol = cur.ctx.symbol || '';
          await remember(tabId, token, ctx);
        }).catch(() => {});
      }
      sendResponse({ ok: true });
      return;
    }
    case 'noted:dex-resolve': { // pair DexScreener -> token (chỉ nhận từ content script trên dexscreener.com)
      if (!fromHost(sender, ['dexscreener.com'])) { sendResponse({ ok: false, results: {}, reasons: {} }); return; }
      dexResolve(String(msg.chain || '').toLowerCase(), Array.isArray(msg.addresses) ? msg.addresses : [])
        .then(r => sendResponse({ ok: true, results: r.results, reasons: r.reasons }))
        .catch(err => sendResponse({ ok: false, error: String(err && err.message), results: {}, reasons: {} }));
      return true;
    }
    case 'noted:grok-unsave': { // hoàn tác một mốc Grok vừa tự lưu (chỉ mốc source=grok của token gắn với tab)
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      (async () => {
        const r = tabId ? await chrome.storage.session.get(GROK_PREFIX + tabId) : {};
        const m = r[GROK_PREFIX + tabId];
        const id = String(msg.entryId || '');
        if (!m || !m.token || !id) { sendResponse({ ok: false }); return; }
        const p = await NotedStore.get(m.token.key);
        if (!p) { sendResponse({ ok: false }); return; }
        const before = p.timeline.length;
        p.timeline = p.timeline.filter(e => !(e.id === id && e.source === 'grok'));
        if (p.timeline.length !== before) await NotedStore.save(p);
        sendResponse({ ok: true, removed: before - p.timeline.length });
      })();
      return true;
    }
    // ---- Lưu bài trên X (chữ + link, tuỳ chọn ảnh chụp) ----
    case 'noted:x-saved-ids': { // tweetId -> {key, entryId, symbol} suy từ timeline (không cần chỉ mục riêng)
      NotedStore.getAll().then(all => {
        const map = {};
        for (const p of all) for (const e of p.timeline) if (e.source === 'x' && e.tweetId) map[e.tweetId] = { key: p.key, entryId: e.id, symbol: p.symbol };
        sendResponse(map);
      });
      return true;
    }
    case 'noted:x-save': {
      if (!fromHost(sender, X_HOSTS)) { sendResponse({ ok: false, reason: 'host' }); return; }
      xSave(msg, sender).then(sendResponse).catch(err => sendResponse({ ok: false, reason: String(err && err.message) }));
      return true;
    }
    case 'noted:x-unsave': {
      if (!fromHost(sender, X_HOSTS)) { sendResponse({ ok: false }); return; }
      (async () => {
        const token = validToken(parseKey(msg.key));
        const id = String(msg.entryId || '');
        if (!token || !id) { sendResponse({ ok: false }); return; }
        const p = await NotedStore.get(token.key);
        if (!p) { sendResponse({ ok: false }); return; }
        const entry = p.timeline.find(e => e.id === id && e.source === 'x');
        if (!entry) { sendResponse({ ok: true, removed: 0 }); return; }
        p.timeline = p.timeline.filter(e => e !== entry);
        if (entry.image) await NotedStore.removeImages([entry.image]);
        await NotedStore.save(p);
        sendResponse({ ok: true, removed: 1 });
      })();
      return true;
    }
    case 'noted:open-viewer': {
      const id = String(msg.id || '');
      if (NotedStore.IMG_RE.test(id)) chrome.tabs.create({ url: chrome.runtime.getURL(`src/viewer/viewer.html?img=${encodeURIComponent(id)}`) });
      sendResponse({ ok: true });
      return;
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

// Menu chuột phải trên X: chọn menu = "gọi" extension nên Chrome cấp activeTab -> được phép chụp màn hình tab này.
function installMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: X_MENU_ID, title: 'Save post with screenshot to Research-Noted-Gmgn',
        contexts: ['page', 'link', 'image', 'selection', 'video'],
        documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
      }, () => void chrome.runtime.lastError);
    });
  } catch (_) {}
}
chrome.runtime.onInstalled.addListener(installMenu);
chrome.runtime.onStartup.addListener(installMenu);
installMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== X_MENU_ID || !tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'noted:x-context', reason: 'menu' }).catch(() => {});
});

// Alt+N: tab được truyền sẵn nên không cần tabs.query (giữ được user gesture cho sidePanel.open).
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-post' && tab && tab.id) { // Alt+S trên X: lưu bài đang rê chuột, kèm ảnh (phím tắt cấp activeTab)
    chrome.tabs.sendMessage(tab.id, { type: 'noted:x-context', reason: 'shortcut' }).catch(() => {});
    return;
  }
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

// ---- Lưu bài X: kiểm tra, chụp màn hình (cần activeTab), cắt và thu nhỏ bằng OffscreenCanvas, lưu ảnh + mốc ----
function parseKey(key) {
  const s = String(key || '');
  const i = s.indexOf(':');
  return i > 0 ? { chain: s.slice(0, i), address: s.slice(i + 1) } : null;
}

const IMG_MAX_W = 1000;

async function captureCrop(windowId, c) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  // Hệ số ảnh chụp / CSS px suy từ chiều ngang (ảnh có thể ở pixel CSS hoặc pixel thiết bị, và trong vài môi trường
  // chỉ phủ phần trên viewport), áp cho cả hai trục rồi cắt trong giới hạn ảnh.
  const k = bmp.width / Math.max(1, Number(c.vw) || bmp.width);
  const sx = Math.max(0, Math.round(c.x * k)), sy = Math.max(0, Math.round(c.y * k));
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(c.w * k))), sh = Math.max(1, Math.min(bmp.height - sy, Math.round(c.h * k)));
  const outW = Math.min(sw, IMG_MAX_W), outH = Math.max(1, Math.round(sh * outW / sw));
  const canvas = new OffscreenCanvas(outW, outH);
  canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { data: `data:image/jpeg;base64,${btoa(bin)}`, w: outW, h: outH, bytes: bytes.length };
}

async function xSave(msg, sender) {
  const token = validToken(parseKey(msg.key));
  if (!token) return { ok: false, reason: 'key' };
  const tw = msg.tweet || {};
  const tweetId = /^\d{1,30}$/.test(String(tw.id || '')) ? String(tw.id) : '';
  const text = String(tw.text || '').slice(0, 20000);
  const url = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,20}\/status\/\d{1,30}$/.test(String(tw.url || '')) ? String(tw.url) : '';
  const author = String(tw.author || '').slice(0, 80);
  const when = String(tw.time || '').slice(0, 40);
  const type = NotedStore.ENTRY_TYPES.some(x => x.id === msg.entryType) ? msg.entryType : 'news';
  let p = await NotedStore.get(token.key);
  if (!p) return { ok: false, reason: 'project' };
  const existing = tweetId ? p.timeline.find(e => e.source === 'x' && e.tweetId === tweetId) : null;
  if (existing) return { ok: true, duplicate: true, key: p.key, symbol: p.symbol, entryId: existing.id };
  let image = null, imageError = '';
  if (msg.capture && sender.tab) {
    try {
      const shot = await captureCrop(sender.tab.windowId, msg.capture);
      image = `img_${NotedStore.uid()}`;
      await chrome.storage.local.set({ [`img:${image}`]: { data: shot.data, w: shot.w, h: shot.h, ts: Date.now() } });
    } catch (err) { imageError = String(err && err.message || err); image = null; }
  }
  const body = [`${author}${when ? ` · ${when}` : ''}`.trim(), text, url].filter(Boolean).join('\n\n');
  const entry = NotedStore.newEntry(type, body, { source: 'x', ...(tweetId ? { tweetId } : {}), ...(image ? { image } : {}) });
  p.timeline.push(entry);
  p = await NotedStore.save(p);
  return { ok: true, key: p.key, symbol: p.symbol, entryId: entry.id, image, imageError };
}

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
