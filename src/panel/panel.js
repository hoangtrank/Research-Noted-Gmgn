// Side panel: hiển thị editor cho token của tab đang hoạt động trong cửa sổ này.
// Token được background lưu ở chrome.storage.session dưới key "tab:<tabId>" và báo qua message "noted:show".
(async () => {
  'use strict';
  const S = globalThis.NotedStore;
  const E = globalThis.NotedEditor;
  const I = globalThis.NotedI18n;
  const SESSION_PREFIX = 'tab:';
  const $ = sel => document.querySelector(sel);
  await I.init();
  I.apply();

  const style = document.createElement('style');
  style.textContent = E.CSS;
  document.head.appendChild(style);

  const params = new URLSearchParams(location.search);
  const pinnedTab = Number(params.get('tab')) || null; // ?tab=<id>: dùng khi mở panel như một tab thường (debug/test)
  let tabId = pinnedTab;
  let windowId = null;

  if (!tabId) {
    try {
      const w = await chrome.windows.getCurrent();
      windowId = w.id;
      const [t] = await chrome.tabs.query({ active: true, windowId });
      tabId = t && t.id;
    } catch (_) {}
    if (!tabId) {
      try { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); tabId = t && t.id; } catch (_) {}
    }
  }

  const empty = $('#empty');
  const mount = $('#mount');
  let currentKey = null;

  const editor = E.create({
    showClose: true,
    onClose: () => window.close(),
    onOpenDashboard: () => chrome.runtime.openOptionsPage(),
    allTags: async () => [...new Set((await S.getAll()).flatMap(p => p.tags))].sort(),
    onDelete: () => { currentKey = null; },
  });
  mount.appendChild(editor.el);
  $('#open-dash').addEventListener('click', () => chrome.runtime.openOptionsPage());

  function showEmpty() {
    currentKey = null;
    mount.hidden = true;
    empty.hidden = false;
  }

  async function show(entry) {
    if (!entry || !entry.token) { showEmpty(); return; }
    const { token, ctx = {} } = entry;
    if (currentKey === token.key && !mount.hidden) return; // cùng token: giữ nguyên editor đang gõ
    if (currentKey && currentKey !== token.key) await editor.flush();
    currentKey = token.key;
    let symbol = ctx.symbol || '';
    if (!symbol && tabId) {
      // Mở từ popup/phím tắt: hỏi content script symbol đang hiển thị trên trang.
      try { const r = await chrome.tabs.sendMessage(tabId, { type: 'noted:page-info', key: token.key }); symbol = (r && r.symbol) || ''; } catch (_) {}
    }
    await editor.load({ ...token, symbol }, { mc: ctx.mc || null });
    empty.hidden = true;
    mount.hidden = false;
    editor.focus();
  }

  async function refresh() {
    if (!tabId) { showEmpty(); return; }
    const r = await chrome.storage.session.get(SESSION_PREFIX + tabId);
    await show(r[SESSION_PREFIX + tabId]);
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'noted:show' && msg.tabId === tabId) show({ token: msg.token, ctx: msg.ctx });
  });

  // Panel dùng chung cho cả cửa sổ: đổi tab thì hiện ghi chú của tab đó.
  chrome.tabs.onActivated.addListener(async info => {
    if (pinnedTab) return;
    if (windowId && info.windowId !== windowId) return;
    await editor.flush();
    tabId = info.tabId;
    currentKey = null;
    refresh();
  });

  I.onChange(async () => { await editor.flush(); location.reload(); });
  refresh();
})();
