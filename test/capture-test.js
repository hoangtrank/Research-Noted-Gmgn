// Kiểm tra đường chụp ảnh bài X (captureVisibleTab -> cắt/thu nhỏ -> lưu img: -> viewer -> export/import).
// Headless không cấp activeTab qua phím tắt, nên test dùng BẢN SAO extension có host_permissions <all_urls> (chỉ trong test).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const xMock = require('./mock-x');

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ✓', msg); };

(async () => {
  const src = path.resolve(__dirname, '..');
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'noted-cap-ext-'));
  for (const item of ['manifest.json', 'icons', 'src', '_locales']) fs.cpSync(path.join(src, item), path.join(ext, item), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  m.host_permissions = [...(m.host_permissions || []), '<all_urls>'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noted-cap-prof-'));
  const ctx = await chromium.launchPersistentContext(userDir, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
  await ctx.route('https://x.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: xMock.page() }));
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sw.evaluate(async () => chrome.storage.local.set({ 'p:robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3': { chain: 'robinhood', address: '0xaa40e79e987517f7462bf79315b8a118799b04e3', symbol: 'PROLOG', summary: 's', tags: [], timeline: [], createdAt: 1, updatedAt: 2 } }));

  const xp = await ctx.newPage();
  xp.on('pageerror', e => console.log('X ERROR', e.message));
  await xp.goto('https://x.com/home');
  await xp.waitForFunction(() => document.querySelectorAll('.noted-x-btn').length === 3, null, { timeout: 10000 });
  await xp.click('article:nth-of-type(1) .noted-x-btn');
  await xp.waitForFunction(() => document.getElementById('noted-x-host')?.shadowRoot.querySelector('.pk .save:not([disabled])'), null, { timeout: 5000 });
  await xp.evaluate(() => { const r = document.getElementById('noted-x-host').shadowRoot; r.querySelector('.shot').checked = true; r.querySelector('.save').click(); });
  await xp.waitForFunction(() => document.getElementById('noted-x-host').shadowRoot.querySelector('.status').classList.contains('ok'), null, { timeout: 15000 });
  const status = await xp.evaluate(() => document.getElementById('noted-x-host').shadowRoot.querySelector('.status').textContent);
  assert(!status.includes('text only'), 'chụp ảnh thành công (không báo lỗi): ' + status.trim());
  const p = await sw.evaluate(async () => (await chrome.storage.local.get('p:robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3'))['p:robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3']);
  const e = p.timeline[0];
  assert(e && e.source === 'x' && /^img_/.test(e.image || ''), 'mốc có tham chiếu ảnh: ' + e.image);
  const img = await sw.evaluate(async id => (await chrome.storage.local.get('img:' + id))['img:' + id], e.image);
  assert(img.data.startsWith('data:image/jpeg;base64,') && img.w >= 400 && img.w <= 1000 && img.h > 100, `ảnh JPEG đã cắt/thu nhỏ: ${img.w}x${img.h}, ${Math.round(img.data.length / 1024)} KB (DPR 2)`);
  // Ảnh phải là đúng bài 1: khối media của bài 1 màu đỏ, bài 2 màu xanh dương -> nhiều pixel đỏ, gần như không có xanh dương
  const stats = await xp.evaluate(async data => {
    const im = new Image(); im.src = data; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let red = 0, blue = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { n++; const r = d[i], gg = d[i + 1], b = d[i + 2]; if (r > 150 && gg < 80 && b < 80) red++; if (b > 150 && r < 80 && gg < 120) blue++; }
    return { red: red / n, blue: blue / n, w: im.width, h: im.height };
  }, img.data);
  assert(stats.red > 0.15 && stats.blue < 0.01, `ảnh cắt đúng bài 1 (đỏ ${Math.round(stats.red * 100)}%, xanh ${Math.round(stats.blue * 100)}%)`);
  assert(Math.abs(img.w / img.h - 600 / 330) < 0.6, `tỉ lệ khung gần với khung bài (${img.w}x${img.h})`);
  fs.writeFileSync(path.join(process.env.SHOT_DIR || path.join(__dirname, 'shots'), 'x-capture.jpg'), Buffer.from(img.data.split(',')[1], 'base64'));

  const viewer = await ctx.newPage();
  await viewer.goto(`chrome-extension://${extId}/src/viewer/viewer.html?img=${e.image}`);
  await viewer.waitForFunction(() => { const i = document.getElementById('img'); return i && !i.hidden && i.naturalWidth > 0; }, null, { timeout: 5000 });
  assert(true, 'viewer hiện ảnh');
  await viewer.close();

  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html?open=robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3`);
  await dash.waitForFunction(() => document.querySelector('.ne-eimg img') && document.querySelector('.ne-eimg img').naturalWidth > 0, null, { timeout: 8000 });
  assert(true, 'thumbnail trong timeline');
  const exp = await dash.evaluate(async () => NotedStore.exportJSON({ images: true }));
  assert(exp.images && exp.images[e.image], 'export kèm ảnh');
  await sw.evaluate(async id => chrome.storage.local.remove('img:' + id), e.image);
  const imp = await dash.evaluate(async data => NotedStore.importJSON(data), exp);
  assert(imp.images === 1, 'import khôi phục ảnh');
  // xoá mốc -> ảnh bị xoá theo
  await dash.evaluate(() => { document.querySelector('.ne-edel').click(); });
  await dash.waitForTimeout(500);
  const gone = await sw.evaluate(async id => (await chrome.storage.local.get('img:' + id))['img:' + id], e.image);
  assert(!gone, 'xoá mốc thì ảnh kèm cũng bị xoá');
  await ctx.close();
  fs.rmSync(ext, { recursive: true, force: true });
  console.log('\nCAPTURE TEST PASSED');
})().catch(e => { console.error(e); process.exit(1); });
