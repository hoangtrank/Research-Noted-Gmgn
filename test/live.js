// Kiểm tra extension trên gmgn / X / DexScreener THẬT — chạy trên máy bạn, không chạy được trong sandbox
// của Claude (các tên miền đó bị chặn ở đó).
//
//   npm i                                  # cài playwright (chỉ lần đầu)
//   node test/live.js                      # chạy toàn bộ
//   node test/live.js --keep               # giữ cửa sổ mở sau khi chạy để tự xem
//   node test/live.js --token <url gmgn>   # đổi token dùng để kiểm tra
//   node test/live.js --skip-x             # bỏ phần X (nếu chưa muốn đăng nhập)
//
// Lần đầu sẽ mở một cửa sổ Chrome dùng hồ sơ riêng ~/.noted-live-profile (KHÔNG đụng vào hồ sơ Chrome
// thường ngày của bạn, không có ví nào trong đó). Hãy đăng nhập X trong cửa sổ đó một lần rồi Enter
// ở terminal; những lần sau nó tự nhớ.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

const { chromium } = require('./pw');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const has = name => process.argv.includes('--' + name);

const EXT = path.resolve(__dirname, '..');
const MOCK = has('mock');  // --mock: chạy chính kịch bản này trên trang giả lập, để kiểm tra bản thân script
const PROFILE = arg('profile', MOCK ? fs.mkdtempSync(path.join(os.tmpdir(), 'noted-mock-')) : path.join(os.homedir(), '.noted-live-profile'));
const TOKEN_URL = arg('token', MOCK
  ? 'https://gmgn.ai/robinhood/token/0xaa40e79e987517f7462bf79315b8a118799b04e3'
  : 'https://gmgn.ai/sol/token/So11111111111111111111111111111111111111112');
const TOKEN_URL2 = arg('token2', MOCK ? 'https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222' : '');
const DEX_URL = arg('dex', MOCK
  ? 'https://dexscreener.com/robinhood/0x1A2B3C00000000000000000000000000000000B2'
  : 'https://dexscreener.com/solana/58oqchx4yjoykjjhuqbaaq3ucyzvsvjdmyq8wqbwpump');
const OUT = path.join(os.tmpdir(), 'noted-live-shots');

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log('  ✓', msg, extra); }
  else { fail++; console.log('  ✗', msg, extra); }
  return cond;
};
const ask = q => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); res(a); });
});

const visible = (page, sel) => page.evaluate(s => {
  const el = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector(s);
  return !!el && el.getClientRects().length > 0;
}, sel);
const textOf = (page, sel) => page.evaluate(s => {
  const el = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector(s);
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
}, sel);
const clickShadow = (page, sel) => page.evaluate(s => document.getElementById('noted-gmgn-host').shadowRoot.querySelector(s).click(), sel);
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (_) {} };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const firstRun = !fs.existsSync(PROFILE);
  console.log('Extension :', EXT);
  console.log('Hồ sơ     :', PROFILE, firstRun ? '(mới — sẽ cần đăng nhập X một lần)' : '');
  console.log('Ảnh chụp  :', OUT, '\n');

  const launch = { headless: false, viewport: null, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] };
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { ...launch, channel: MOCK ? 'chromium' : 'chrome' });
  } catch (err) {
    if (MOCK) throw err;
    console.log('  (không mở được Google Chrome, thử Chromium của Playwright)');
    ctx = await chromium.launchPersistentContext(PROFILE, { ...launch, channel: 'chromium' });
  }

  let dexApi = null;
  if (MOCK) {
    const gmgnMock = require('./mock-gmgn');
    const xMock = require('./mock-xsearch');
    const dexMock = require('./mock-dexscreener');
    const html = body => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
    await ctx.route('https://gmgn.ai/**', r => r.fulfill(html(gmgnMock.handle(r.request().url()))));
    await ctx.route('https://x.com/**', r => r.fulfill(html(xMock.page(r.request().url()))));
    await ctx.route('https://dexscreener.com/**', r => r.fulfill(html(dexMock.handle(r.request().url()))));
    dexApi = await dexMock.startApi();
  }

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  console.log('extension id:', new URL(sw.url()).host, MOCK ? '(CHẾ ĐỘ GIẢ LẬP — chỉ kiểm tra bản thân script)' : '', '\n');
  if (dexApi) await sw.evaluate(async base => {
    const st = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...st, dexApiBase: base } });
  }, dexApi.base);

  const page = ctx.pages()[0] || await ctx.newPage();

  if (MOCK) {
    // Trang tìm kiếm X nhận ra token qua ghi chú đã có (hoặc qua DexScreener). Hồ sơ giả lập là mới tinh
    // nên phải tạo sẵn một ghi chú, đúng như máy bạn vốn đã có ghi chú cho token đang research.
    const m = TOKEN_URL.match(/gmgn\.ai\/([^/]+)\/token\/([^/?#]+)/);
    await sw.evaluate(async ([chain, address]) => {
      await NotedStore.save(NotedStore.emptyProject(chain, address, { symbol: 'PROLOG' }));
    }, [m[1], m[2]]);
  }

  console.log('1) gmgn: nút nổi trên trang token');
  await page.goto(TOKEN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const fabUp = await page.waitForFunction(() => {
    const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab');
    return f && f.getClientRects().length > 0;
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(fabUp, 'nút nổi hiện trên trang token', fabUp ? '— ' + (await textOf(page, '.nd-fab')) : '(hết giờ chờ)');
  await shot(page, '1-gmgn-fab');

  console.log('2) Bấm nút nổi: mở side panel, bấm lần hai: đóng');
  const panelCount = () => sw.evaluate(() => panelWindows.size).catch(() => -1);
  await clickShadow(page, '.nd-fab');
  let opened = false;
  for (let i = 0; i < 50; i++) { if ((await panelCount()) > 0) { opened = true; break; } await page.waitForTimeout(200); }
  ok(opened, 'side panel mở ra');
  await shot(page, '2-panel-open');
  if (opened) {
    await clickShadow(page, '.nd-fab');
    let closed = false;
    for (let i = 0; i < 40; i++) { if ((await panelCount()) === 0) { closed = true; break; } await page.waitForTimeout(200); }
    ok(closed, 'bấm lần hai đóng side panel');
    await clickShadow(page, '.nd-fab');           // mở lại cho các bước sau
    for (let i = 0; i < 40 && (await panelCount()) === 0; i++) await page.waitForTimeout(200);
  }

  if (TOKEN_URL2) {
    console.log('3) Đổi sang token khác: panel bám theo');
    const before = await sw.evaluate(() => [...panelState.values()].map(v => v.key).join(','));
    await page.goto(TOKEN_URL2, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let moved = false;
    for (let i = 0; i < 60; i++) {
      const now = await sw.evaluate(() => [...panelState.values()].map(v => v.key).join(','));
      if (now && now !== before) { moved = true; break; }
      await page.waitForTimeout(250);
    }
    ok(moved, 'panel chuyển sang token của trang mới');
    await shot(page, '3-follow');
  } else {
    console.log('3) (bỏ qua — truyền --token2 <url gmgn khác> để kiểm tra panel bám theo)');
  }

  if (!has('skip-x')) {
    console.log('4) X: tìm theo contract, lưu đoạn bôi đen');
    const ca = TOKEN_URL.split('/').pop();
    await page.goto('https://x.com/search?q=' + encodeURIComponent(ca) + '&f=live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!MOCK && (firstRun || /\/i\/flow\/login|\/login/.test(page.url()))) {
      await ask('  → Hãy đăng nhập X trong cửa sổ vừa mở, rồi bấm Enter ở đây... ');
      await page.goto('https://x.com/search?q=' + encodeURIComponent(ca) + '&f=live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    const xFab = await page.waitForFunction(() => {
      const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab');
      return f && f.getClientRects().length > 0;
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok(xFab, 'nút nổi nhận ra token trên trang tìm kiếm X',
      xFab ? '— ' + (await textOf(page, '.nd-fab')) : '(token này cần đã có ghi chú, hoặc DexScreener phải biết nó)');

    const picked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('article [data-testid="tweetText"]')].find(e => (e.textContent || '').trim().length > 40);
      if (!el) return false;
      const r = document.createRange(); r.selectNodeContents(el);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return true;
    });
    if (ok(picked, 'bôi đen được một bài trên trang')) {
      let selUp = false;
      for (let i = 0; i < 25; i++) { if (await visible(page, '.nd-sel')) { selUp = true; break; } await page.waitForTimeout(200); }
      await shot(page, '4-x-select');
      if (ok(selUp, 'nút "Lưu đoạn bôi đen" hiện ra')) {
        await page.evaluate(() => getSelection().removeAllRanges());
        let selGone = false;
        for (let i = 0; i < 25; i++) { if (!(await visible(page, '.nd-sel'))) { selGone = true; break; } await page.waitForTimeout(200); }
        ok(selGone, 'BỎ bôi đen thì nút biến mất (lỗi [hidden] đã sửa ở 0.9.6)');
        await shot(page, '5-x-deselect');
      } else {
        console.log('  – bỏ qua phép thử bỏ bôi đen (nút chưa từng hiện)');
      }
    }

    console.log('5) X: tìm kiếm không liên quan thì không hiện gì');
    await page.goto('https://x.com/search?q=hello%20world&f=live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    ok(!(await visible(page, '.nd-fab')), 'không hiện nút nổi trên tìm kiếm không liên quan');
    await shot(page, '6-x-unrelated');
  }

  console.log('6) DexScreener');
  await page.goto(DEX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const dexFab = await page.waitForFunction(() => {
    const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab');
    return f && f.getClientRects().length > 0;
  }, null, { timeout: 40000 }).then(() => true).catch(() => false);
  ok(dexFab, 'nút nổi hiện trên trang pair (pair -> token qua API)', dexFab ? '— ' + (await textOf(page, '.nd-fab')) : '');
  await shot(page, '7-dexscreener');

  console.log(`\n${fail === 0 ? 'TẤT CẢ ĐỀU ĐẠT' : 'CÓ LỖI'} — đạt ${pass}, hỏng ${fail}`);
  console.log('Ảnh chụp từng bước:', OUT);
  if (has('keep')) await ask('Nhấn Enter để đóng trình duyệt... ');
  await ctx.close();
  if (dexApi) dexApi.server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async e => { console.error('\nLỖI:', e && e.message); process.exit(1); });
