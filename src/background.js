// Service worker: trung tâm điều phối mở ghi chú.
// Ưu tiên Chrome Side Panel (nằm ngoài trang, trình duyệt tự thu hẹp gmgn nên không che gì);
// nếu không mở được hoặc người dùng chọn "overlay" thì bảo content script mở drawer trong trang.
'use strict';
importScripts('lib/storage.js');

const SESSION_PREFIX = 'tab:';
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
    .catch(err => { console.warn('[Noted] sidePanel.open thất bại, dùng drawer:', err && err.message); drawer(); });
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
  chrome.storage.session.remove(SESSION_PREFIX + tabId).catch(() => {});
});
