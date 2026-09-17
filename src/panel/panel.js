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

  try { const w = await chrome.windows.getCurrent(); windowId = w.id; } catch (_) {}
  if (!tabId) {
    try {
      const [t] = await chrome.tabs.query({ active: true, windowId });
      tabId = t && t.id;
    } catch (_) {}
    if (!tabId) {
      try { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); tabId = t && t.id; } catch (_) {}
    }
  }

  // Nguồn sự thật là storage.session: panel tự nạp lại khi mục của tab thay đổi, nên không lỡ mốc mới
  // dù message "noted:show" đến trước lúc panel kịp lắng nghe.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && tabId && changes[SESSION_PREFIX + tabId]) { refresh(); return; }
    // Dự án đang mở bị nơi khác thêm/bớt mốc (Grok tự lưu, dashboard, tab khác): nạp lại cho khớp.
    if (area !== 'local' || !currentKey || !currentToken) return;
    const ch = changes[S.PREFIX + currentKey];
    if (!ch) return;
    const stored = ch.newValue;
    const cur = editor.project;
    const n = stored && Array.isArray(stored.timeline) ? stored.timeline.length : 0;
    if (!cur || n === cur.timeline.length) return;
    const newest = stored && stored.timeline ? [...stored.timeline].sort((a, b) => b.ts - a.ts)[0] : null;
    show({ token: currentToken, ctx: { symbol: (stored && stored.symbol) || '', highlight: (newest && newest.id) || '', force: 'store:' + (stored ? stored.updatedAt : 0) } });
  });

  const empty = $('#empty');
  const mount = $('#mount');
  let currentKey = null;
  let currentToken = null;
  let lastForce = '';   // id mốc vừa được thêm từ trang: khác giá trị cũ thì nạp lại dù cùng token
  let port = null;      // port tới background (xem connect() bên dưới)

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
    currentToken = null;
    mount.hidden = true;
    empty.hidden = false;
    sendState();
  }

  async function show(entry) {
    if (!entry || !entry.token) { showEmpty(); return; }
    const { token, ctx = {} } = entry;
    const force = String(ctx.force || '');
    if (currentKey === token.key && !mount.hidden && (!force || force === lastForce)) return; // cùng token, không có gì mới: giữ nguyên editor đang gõ
    if (currentKey && currentKey !== token.key) await editor.flush();
    else if (force && force !== lastForce) await editor.flush();
    lastForce = force;
    currentKey = token.key;
    currentToken = { chain: token.chain, address: token.address, key: token.key };
    empty.hidden = true;
    mount.hidden = false;
    let symbol = ctx.symbol || '';
    if (!symbol && tabId) {
      // Mở từ popup/phím tắt: hỏi content script symbol đang hiển thị trên trang.
      try { const r = await chrome.tabs.sendMessage(tabId, { type: 'noted:page-info', key: token.key }); symbol = (r && r.symbol) || ''; } catch (_) {}
    }
    sendState();
    await editor.load({ ...token, symbol }, { mc: ctx.mc || null, highlight: ctx.highlight || '' });
    editor.focus();
  }

  async function refresh() {
    if (!tabId) { showEmpty(); return; }
    const r = await chrome.storage.session.get(SESSION_PREFIX + tabId);
    let entry = r[SESSION_PREFIX + tabId];
    // Tab chưa từng mở panel (vừa chuyển sang tab khác, hoặc trang vừa đổi token): hỏi thẳng content script
    // token đang xem, để panel hiện đúng dự án thay vì màn hình trống.
    if (!entry) {
      try {
        const info = await chrome.tabs.sendMessage(tabId, { type: 'noted:get-page-token' });
        if (info && info.token) entry = { token: info.token, ctx: { symbol: info.symbol || '' } };
      } catch (_) {}
    }
    await show(entry);
  }

  // Kết nối tới background: còn kết nối = panel đang mở ở cửa sổ này, và báo luôn đang hiện token nào
  // (bấm nút nổi lần hai cần biết điều này để đóng panel). Nhắc lại định kỳ để worker không ngủ mất trạng thái.
  function sendState() {
    if (!port) return;
    try { port.postMessage({ type: 'noted:panel-state', tabId, key: currentKey || '' }); } catch (_) { port = null; }
  }
  function connect() {
    if (!windowId) return;
    try {
      port = chrome.runtime.connect({ name: `noted-panel:${windowId}` });
      port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 1000); });
      sendState();
    } catch (_) { port = null; }
  }
  connect();
  setInterval(sendState, 20000);

  chrome.runtime.onMessage.addListener(msg => {
    if (!msg || msg.type !== 'noted:show') return;
    // Side panel là của cả cửa sổ: mở ghi chú cho tab nào trong cửa sổ này thì panel bám theo tab đó,
    // kể cả khi tab id tra được lúc panel mở đã cũ (không thì panel bỏ qua mọi thứ và bấm nút lần hai không đóng được).
    if (msg.tabId !== tabId) {
      if (!pinnedTab && windowId && msg.windowId === windowId) { tabId = msg.tabId; currentKey = null; }
      else return;
    }
    show({ token: msg.token, ctx: msg.ctx });
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

  // Dự phòng: nếu message "có mốc mới" bị lỡ (service worker vừa ngủ dậy, panel ở cửa sổ nền),
  // đọc lại storage.session mỗi khi panel được nhìn thấy lại. show() tự bỏ qua nếu không có gì mới.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);

  refresh();
})();
