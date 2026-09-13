(async () => {
  'use strict';
  const S = globalThis.NotedStore;
  const $ = sel => document.querySelector(sel);

  const projects = await S.getAll();
  const pinned = projects.filter(p => p.pinned).length;
  $('#stats').textContent = `${projects.length} dự án · ${pinned} pin · ${projects.reduce((n, p) => n + p.timeline.length, 0)} mốc`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const token = tab && tab.url ? S.parseTokenUrl(tab.url) : null;
  const btn = $('#note-this');
  if (token && tab.id) {
    const p = projects.find(x => x.key === token.key);
    btn.textContent = p ? `📝 Mở ghi chú ${p.symbol || S.shortAddress(p.address)}` : '📝 Ghi chú token đang xem';
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'noted:open' }); window.close(); }
      catch (_) { btn.textContent = 'Hãy tải lại trang gmgn rồi thử lại'; }
    });
  }

  $('#open-dash').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });
  $('#export').addEventListener('click', async () => {
    const data = await S.exportJSON();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `noted-gmgn-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
})();
