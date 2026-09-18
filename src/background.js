// Service worker: trung tâm điều phối mở ghi chú.
// Ưu tiên Chrome Side Panel (nằm ngoài trang, trình duyệt tự thu hẹp gmgn nên không che gì);
// nếu không mở được hoặc người dùng chọn "overlay" thì bảo content script mở drawer trong trang.
'use strict';
importScripts('lib/storage.js', 'lib/research.js', 'lib/sync.js', 'lib/drive.js', 'sync-controller.js');

const SESSION_PREFIX = 'tab:';
const GROK_PREFIX = 'grok:';
const DEX_CACHE_KEY = 'dex:pairs';
const DEX_API = 'https://api.dexscreener.com';
const pageTokens = new Map(); // tabId -> token đang xem (content script báo), dùng cho phím tắt trên site không có token trong URL
const tabTokens = new Map();  // tabId -> key đang hiển thị trong side panel (bản trong bộ nhớ của storage.session)
const panelWindows = new Set(); // windowId có side panel đang mở (panel giữ một port tới background)
const panelState = new Map();   // windowId -> { tabId, key } panel đang hiển thị (panel tự báo qua port)
const panelPorts = new Map();   // port -> windowId: đếm theo port, không theo cửa sổ
chrome.runtime.onConnect.addListener(port => {
  if (!port.name.startsWith('noted-panel:')) return;
  const wid = Number(port.name.slice('noted-panel:'.length));
  if (!wid) return;
  panelPorts.set(port, wid);
  panelWindows.add(wid);
  // Panel gửi trạng thái mỗi lần đổi token và nhắc lại định kỳ: service worker ngủ dậy vẫn biết panel nào đang mở gì,
  // nên bấm nút lần hai luôn đóng đúng panel (trước đây trạng thái chỉ nằm trong bộ nhớ nên mất khi worker ngủ).
  port.onMessage.addListener(m => {
    if (!m || m.type !== 'noted:panel-state') return;
    const tid = Number(m.tabId) || 0;
    if (tid) panelState.set(wid, { tabId: tid, key: String(m.key || '') });
    else panelState.delete(wid);
  });
  // Chrome dựng lại trang panel thì port mới kết nối trước rồi port cũ mới ngắt: chỉ dọn khi cửa sổ
  // không còn port nào, nếu không một cú ngắt của trang cũ sẽ xoá mất cửa sổ đang có panel mở.
  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
    if ([...panelPorts.values()].includes(wid)) return;
    panelWindows.delete(wid);
    panelState.delete(wid);
  });
});
const GROK_HOSTS = ['x.com', 'twitter.com', 'grok.com'];
const X_HOSTS = ['x.com', 'twitter.com'];

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

// Token xem gần nhất: để side panel mở trên một tab không có token (trang chủ X, tab mới…) vẫn hiện ghi chú
// bạn vừa xem thay vì màn hình trống. Lưu ở storage.local để sống qua lần khởi động lại trình duyệt.
const LAST_KEY = 'lastToken';
let lastSeen = '';
function noteLast(token, symbol) {
  const sym = String(symbol || '').slice(0, 32);
  const sig = token.key + '|' + sym;
  if (sig === lastSeen) return;
  lastSeen = sig;
  chrome.storage.local.set({ [LAST_KEY]: { token: { chain: token.chain, address: token.address, key: token.key }, symbol: sym, at: Date.now() } }).catch(() => {});
}

function notifyPanels(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

// windowId đi kèm để side panel của cửa sổ đó nhận ra "mình đang hiện tab này", kể cả khi tab id nó tự tra
// lúc mở đã cũ (panel sống lâu hơn tab đang xem).
async function remember(tabId, token, ctx, windowId) {
  tabTokens.set(tabId, token.key);
  let wid = windowId, active = false;
  try { const tab = await chrome.tabs.get(tabId); active = !!tab.active; if (!wid) wid = tab.windowId; } catch (_) {}
  if (active) noteLast(token, ctx && ctx.symbol); // tab nền (Grok tự lưu xong) không phải là "token đang xem"
  await chrome.storage.session.set({ [SESSION_PREFIX + tabId]: { token, ctx: ctx || {}, at: Date.now() } });
  notifyPanels({ type: 'noted:show', tabId, windowId: wid || null, token, ctx: ctx || {} });
}

// Mở ghi chú cho token trong tab. Phải gọi sidePanel.open() ngay trong lượt xử lý user gesture (không await trước).
// toggle=true (nút nổi, Alt+N): nếu panel đang mở đúng token này thì đóng panel cho tab (Chrome không có API close,
// nên tắt panel của tab bằng setOptions enabled:false; lần mở sau bật lại).
function openNote({ tabId, windowId, token, ctx, mode, fromContent, toggle }, sendResponse) {
  const drawer = async () => {
    if (!fromContent) {
      try { await chrome.tabs.sendMessage(tabId, { type: 'noted:open-drawer', token, ctx: ctx || {} }); } catch (_) {}
    }
    sendResponse({ ok: true, mode: 'drawer' });
  };
  if ((mode || uiMode) === 'drawer' || !chrome.sidePanel) { drawer(); return; }
  // Panel tự báo đang hiện gì; chỉ khi không có báo cáo mới dùng bản nhớ trong worker.
  const ps = windowId ? panelState.get(windowId) : null;
  const showing = ps ? (ps.tabId === tabId ? ps.key : '') : tabTokens.get(tabId);
  if (toggle && windowId && panelWindows.has(windowId) && showing === token.key) {
    chrome.sidePanel.setOptions({ tabId, enabled: false })
      .then(() => { panelWindows.delete(windowId); panelState.delete(windowId); sendResponse({ ok: true, mode: 'panel', closed: true }); })
      .catch(() => sendResponse({ ok: true, mode: 'panel', closed: false }));
    return;
  }
  chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'src/panel/panel.html' }).catch(() => {});
  chrome.sidePanel.open({ tabId })
    .then(async () => { await remember(tabId, token, ctx, windowId); sendResponse({ ok: true, mode: 'panel' }); })
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
      openNote({ tabId, windowId: sender.tab ? sender.tab.windowId : Number(msg.windowId) || null, token, ctx: { symbol: String(c.symbol || '').slice(0, 32), mc: c.mc ? String(c.mc).slice(0, 24) : null }, mode: msg.mode, fromContent: !!sender.tab, toggle: !!msg.toggle }, sendResponse);
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
      // Mở tab trắng trước, ghi ngữ cảnh, rồi mới điều hướng: nếu điều hướng ngay, content script trên trang
      // Grok có thể hỏi ngữ cảnh trước lúc ghi xong và coi như tab chưa gắn dự án (mất luôn prompt).
      chrome.tabs.create({ url: 'about:blank' }).then(async tab => {
        await chrome.storage.session.set({ [GROK_PREFIX + tab.id]: { token: msg.token, symbol: msg.symbol || '', prompt: msg.prompt || '', at: Date.now() } });
        // Panel đi theo tab đang xem, nên gắn luôn ghi chú này cho tab Grok vừa mở.
        const tk = validToken(msg.token);
        if (tk) await remember(tab.id, tk, { symbol: String(msg.symbol || '').slice(0, 32) });
        await chrome.tabs.update(tab.id, { url });
        sendResponse({ ok: true, tabId: tab.id });
      }).catch(err => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }
    case 'noted:grok-context': { // content script trên Grok hỏi tab này đang research token nào
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      if (!tabId) { sendResponse(null); return; }
      chrome.storage.session.get(GROK_PREFIX + tabId).then(async r => {
        const m = r[GROK_PREFIX + tabId];
        if (!m || !m.token) { sendResponse(m || null); return; }
        // Nhãn trên trang Grok nên hiện symbol chứ không phải địa chỉ rút gọn.
        if (!m.symbol) { const p = await NotedStore.get(m.token.key); if (p && p.symbol) m.symbol = p.symbol; }
        sendResponse(m);
      });
      return true;
    }
    case 'noted:grok-link': { // gắn tay tab Grok với một dự án
      const tabId = fromHost(sender, GROK_HOSTS) ? sender.tab.id : null;
      const token = validToken(msg.token);
      if (!tabId || !token) { sendResponse({ ok: false }); return; }
      (async () => {
        const p = await NotedStore.get(token.key);
        // Giữ lại prompt nếu tab này vốn được mở từ nút Research with Grok (gắn tay chỉ đổi dự án).
        const prev = (await chrome.storage.session.get(GROK_PREFIX + tabId))[GROK_PREFIX + tabId];
        const keepPrompt = prev && prev.token && prev.token.key === token.key ? String(prev.prompt || '') : '';
        const entry = { token, symbol: (p && p.symbol) || msg.symbol || '', prompt: keepPrompt, at: Date.now() };
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
        // Panel của tab Grok hiện ngay mốc vừa tự lưu.
        await remember(tabId, { chain: p.chain, address: p.address, key: p.key }, { symbol: p.symbol, highlight: entry.id, force: entry.id });
        sendResponse({ ok: true, key: p.key, symbol: p.symbol, entryId: entry.id, entries: p.timeline.length });
      })();
      return true;
    }
    case 'noted:page-token': { // content script báo token của trang hiện tại
      const tabId = sender.tab && sender.tab.id;
      if (!tabId) { sendResponse({ ok: false }); return; }
      const token = validToken(msg.token);
      if (token) pageTokens.set(tabId, token); else pageTokens.delete(tabId);
      if (token && sender.tab.active) noteLast(token, msg.ctx && msg.ctx.symbol); // tab nền tải trang không tính là "đang xem"
      // Theo dõi trang: panel đang mở trong cửa sổ này (hoặc tab này đã từng mở panel) thì chuyển sang token mới.
      // Không tự mở panel nếu chưa mở.
      if (follow && token) {
        const wid = sender.tab.windowId;
        chrome.storage.session.get(SESSION_PREFIX + tabId).then(async r => {
          const cur = r[SESSION_PREFIX + tabId];
          if (!cur && !panelWindows.has(wid)) return;
          const c = msg.ctx || {};
          const same = cur && cur.token && cur.token.key === token.key;
          const ctx = { ...(same ? cur.ctx : {}), symbol: String(c.symbol || '').slice(0, 32), mc: c.mc ? String(c.mc).slice(0, 24) : null };
          if (!ctx.symbol && same && cur.ctx) ctx.symbol = cur.ctx.symbol || '';
          await remember(tabId, token, ctx, wid);
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
        if (p.timeline.length !== before) {
          await NotedStore.save(p, { removedIds: [id] });
          await remember(tabId, { chain: p.chain, address: p.address, key: p.key }, { symbol: p.symbol, force: 'undo:' + id });
        }
        sendResponse({ ok: true, removed: before - p.timeline.length });
      })();
      return true;
    }
    case 'noted:add-entry': { // thêm một mốc vào token (dùng cho "lưu đoạn bôi đen" trên trang tìm kiếm X)
      const addToken = validToken(msg.token);
      const addTabId = sender.tab && sender.tab.id;
      const wantPanel = !!msg.openPanel && !!addTabId && (msg.mode || uiMode) !== 'drawer' && !!chrome.sidePanel;
      // Mở panel NGAY trong lượt xử lý cú bấm (không await trước), rồi mới lưu bất đồng bộ.
      let panelOpened = Promise.resolve(false);
      if (wantPanel && addToken) {
        chrome.sidePanel.setOptions({ tabId: addTabId, enabled: true, path: 'src/panel/panel.html' }).catch(() => {});
        panelOpened = chrome.sidePanel.open({ tabId: addTabId }).then(() => true).catch(() => false);
      }
      (async () => {
        const token = addToken;
        const text = String(msg.text || '').trim().slice(0, 20000);
        if (!token || !text) { sendResponse({ ok: false }); return; }
        const type = NotedStore.ENTRY_TYPES.some(x => x.id === msg.entryType) ? msg.entryType : 'research';
        const url = /^https:\/\/[^\s]{1,300}$/.test(String(msg.url || '')) ? String(msg.url) : '';
        let p = await NotedStore.get(token.key) || NotedStore.emptyProject(token.chain, token.address, { symbol: String(msg.symbol || '').slice(0, 32) });
        if (!p.symbol && msg.symbol) p.symbol = String(msg.symbol).slice(0, 32);
        const body = url ? `${text}\n\n${String(msg.sourceLabel || 'Source').slice(0, 20)}: ${url}` : text;
        const entry = NotedStore.newEntry(type, body, { source: 'x' });
        p.timeline.push(entry);
        p = await NotedStore.save(p);
        // Cho người dùng thấy ngay mốc vừa lưu: panel (hoặc drawer) mở đúng dự án và tô sáng mốc đó.
        if (msg.openPanel && addTabId) {
          const tk = { chain: p.chain, address: p.address, key: p.key };
          const ctx = { symbol: p.symbol, highlight: entry.id, force: entry.id };
          await remember(addTabId, tk, ctx);
          // Không mở được side panel (hoặc người dùng chọn overlay) thì mở drawer trong trang để vẫn thấy mốc mới.
          if (!(wantPanel && await panelOpened)) {
            chrome.tabs.sendMessage(addTabId, { type: 'noted:open-drawer', token: tk, ctx }).catch(() => {});
          }
        }
        sendResponse({ ok: true, key: p.key, symbol: p.symbol, entryId: entry.id });
      })();
      return true;
    }
    case 'noted:dex-lookup': { // địa chỉ token (chưa biết chain) -> chain, symbol, tên qua DexScreener
      dexLookupToken(String(msg.address || '')).then(token => sendResponse({ ok: !!token, token })).catch(() => sendResponse({ ok: false }));
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

// Alt+N: tab được truyền sẵn nên không cần tabs.query (giữ được user gesture cho sidePanel.open).
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-note' || !tab || !tab.id) return;
  const token = NotedStore.parseTokenUrl(tab.url || '') || pageTokens.get(tab.id) || null;
  if (!token) {
    chrome.tabs.sendMessage(tab.id, { type: 'noted:toast', key: 'toast_open_token' }).catch(() => {});
    return;
  }
  openNote({ tabId: tab.id, windowId: tab.windowId, token, ctx: {}, mode: uiMode, fromContent: false, toggle: true }, () => {});
});

chrome.tabs.onRemoved.addListener(tabId => {
  pageTokens.delete(tabId);
  tabTokens.delete(tabId);
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
  try {
    const st = (await chrome.storage.local.get('settings')).settings || {};
    const o = String(st.dexApiBase || '');
    // Chỉ chấp nhận chính DexScreener hoặc máy cục bộ (cho test) — không bao giờ gửi dữ liệu đi nơi khác.
    if (o === DEX_API || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) return o;
  } catch (_) {}
  return DEX_API;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Tra một địa chỉ token chưa rõ chain: lấy cặp có thanh khoản lớn nhất trên DexScreener. Cache 10 phút trong bộ nhớ.
const lookupCache = new Map();
async function dexLookupToken(address) {
  const a = NotedStore.normalizeAddress(address);
  if (!a) return null;
  const hit = lookupCache.get(a);
  if (hit && Date.now() - hit.at < 600000) return hit.token;
  let token = null;
  try {
    const j = await fetchJson(`${await apiBase()}/latest/dex/tokens/${encodeURIComponent(a)}`);
    const lower = x => String(x || '').toLowerCase();
    const pairs = ((j && j.pairs) || []).filter(x => lower(x.baseToken && x.baseToken.address) === lower(a) || lower(x.quoteToken && x.quoteToken.address) === lower(a));
    pairs.sort((x, y) => ((y.liquidity && y.liquidity.usd) || 0) - ((x.liquidity && x.liquidity.usd) || 0));
    const p = pairs[0];
    if (p) {
      const tok = lower(p.baseToken && p.baseToken.address) === lower(a) ? p.baseToken : p.quoteToken;
      const chain = NotedStore.normalizeChain(p.chainId);
      const addr = NotedStore.normalizeAddress(tok.address);
      if (/^[a-z0-9-]{2,20}$/.test(chain) && addr) token = { chain, address: addr, key: NotedStore.keyOf(chain, addr), symbol: tok.symbol || '', name: tok.name || '', mc: fmtMc(p.marketCap || p.fdv) };
    }
  } catch (err) { console.warn('[Research-Noted-Gmgn] dexscreener lookup:', err && err.message); }
  lookupCache.set(a, { at: Date.now(), token });
  return token;
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
