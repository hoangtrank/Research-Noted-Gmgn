// Service worker: trung tâm điều phối mở ghi chú.
// Ưu tiên Chrome Side Panel (nằm ngoài trang, trình duyệt tự thu hẹp gmgn nên không che gì);
// nếu không mở được hoặc người dùng chọn "overlay" thì bảo content script mở drawer trong trang.
'use strict';
importScripts('lib/storage.js', 'lib/research.js');

const SESSION_PREFIX = 'tab:';
const GROK_PREFIX = 'grok:';
let uiMode = 'panel'; // 'panel' | 'drawer' (cache của settings.ui, vì handler phím tắt không được await trước sidePanel.open)

chrome.storage.local.get('settings').then(r => { uiMode = (r.settings && r.settings.ui) || 'panel'; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) uiMode = (changes.settings.newValue && changes.settings.newValue.ui) || 'panel';
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
  const token = NotedStore.parseTokenUrl(tab.url || '');
  if (!token) {
    chrome.tabs.sendMessage(tab.id, { type: 'noted:toast', key: 'toast_open_token' }).catch(() => {});
    return;
  }
  openNote({ tabId: tab.id, token, ctx: {}, mode: uiMode, fromContent: false }, () => {});
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove([SESSION_PREFIX + tabId, GROK_PREFIX + tabId]).catch(() => {});
});
