// Trang xem ảnh chụp đã lưu: ?img=<id>. Ảnh đọc từ chrome.storage.local (key img:<id>).
(async () => {
  'use strict';
  const S = globalThis.NotedStore;
  const id = new URLSearchParams(location.search).get('img') || '';
  const img = document.getElementById('img'), missing = document.getElementById('missing'), dl = document.getElementById('dl'), meta = document.getElementById('meta');
  const rec = await S.getImage(id);
  if (!rec || !rec.data) { missing.hidden = false; dl.hidden = true; return; }
  img.src = rec.data;
  img.hidden = false;
  dl.href = rec.data;
  dl.download = `${id}.jpg`;
  meta.textContent = `${rec.w || ''}×${rec.h || ''}${rec.ts ? ' · ' + S.fmtDate(rec.ts) : ''}`;
})();
