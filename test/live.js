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
// Trang thật: KHÔNG viết cứng một cặp — cặp viết cứng trước đây không tồn tại, DexScreener đứng mãi ở
// "Loading pair…" và extension (đúng ra) không có gì để phân giải. Thay vào đó hỏi API lấy cặp thanh khoản
// lớn nhất của chính token đang test (xem dexUrlFor bên dưới). Cặp dự phòng là SOL/USDC Raydium có thật.
const DEX_FALLBACK = 'https://dexscreener.com/solana/58oqchx4ywmvkdwllzzbi4chocc2fqcuwbkwmihlyqo2';
let DEX_URL = arg('dex', MOCK ? 'https://dexscreener.com/robinhood/0x1A2B3C00000000000000000000000000000000B2' : '');

async function dexUrlFor(tokenUrl) {
  const ca = tokenUrl.split(/[?#]/)[0].split('/').pop();
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(ca), { signal: AbortSignal.timeout(20000) });
    const lower = x => String(x || '').toLowerCase();
    const pairs = (((await r.json()) || {}).pairs || []).filter(p => p.url && [p.baseToken, p.quoteToken].some(t => lower(t && t.address) === lower(ca)));
    pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    if (pairs[0]) return pairs[0].url;
    console.log('  (DexScreener không biết token này, dùng cặp dự phòng SOL/USDC)');
  } catch (err) { console.log('  (không hỏi được API DexScreener:', err && err.message, '— dùng cặp dự phòng SOL/USDC)'); }
  return DEX_FALLBACK;
}
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
  // Google Chrome bản thương hiệu từ 137 trở đi BỎ QUA --load-extension: cửa sổ vẫn mở bình thường nhưng
  // extension không được nạp, service worker không bao giờ xuất hiện. Vì vậy mặc định dùng Chromium của
  // Playwright (Chrome for Testing — vẫn nhận cờ đó). --channel chrome để ép thử Chrome thương hiệu; nếu
  // extension không lên thì tự mở lại bằng Chromium thay vì chết ở bước chờ service worker.
  const swOf = async c => c.serviceWorkers()[0] || await c.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  const channel = arg('channel', 'chromium');
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { ...launch, channel });
  } catch (err) {
    if (/Executable doesn't exist|npx playwright install/i.test(String(err && err.message))) {
      console.error('\nThiếu trình duyệt của Playwright. Chạy:\n  npx playwright install chromium\n');
      process.exit(1);
    }
    throw err;
  }
  let sw = await swOf(ctx);
  if (!sw && channel !== 'chromium') {
    console.log(`  (kênh "${channel}" không nạp extension qua --load-extension, mở lại bằng Chromium của Playwright)`);
    await ctx.close();
    ctx = await chromium.launchPersistentContext(PROFILE, { ...launch, channel: 'chromium' });
    sw = await swOf(ctx);
  }
  if (!sw) throw new Error('extension không nạp được (không thấy service worker)');
  // Hồ sơ bền giữ lại bản service worker đã đăng ký từ lần chạy trước: sửa src/background.js xong chạy lại thì
  // Chrome vẫn chạy mã CŨ (content script thì luôn đọc từ đĩa) — test sẽ âm thầm kiểm tra nhầm bản. Reload
  // extension một lần rồi mở lại trình duyệt để chắc chắn đang chạy đúng mã trên đĩa. Hồ sơ giả lập là mới tinh
  // mỗi lần nên không cần.
  if (!MOCK) {
    await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await ctx.close();
    ctx = await chromium.launchPersistentContext(PROFILE, { ...launch, channel: 'chromium' });
    sw = await swOf(ctx);
    if (!sw) throw new Error('extension không nạp lại được sau khi reload');
  }

  let dexApi = null;
  if (MOCK) {
    const gmgnMock = require('./mock-gmgn');
    const xMock = require('./mock-xsearch');
    const dexMock = require('./mock-dexscreener');
    const html = body => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
    await ctx.route('https://gmgn.ai/**', r => r.fulfill(html(gmgnMock.handle(r.request().url()))));
    const grokMock = require('./mock-grok');
    await ctx.route('https://x.com/**', r => { const u = r.request().url(); r.fulfill(html(new URL(u).pathname.startsWith('/i/grok') ? grokMock.page(u) : xMock.page(u))); });
    await ctx.route('https://dexscreener.com/**', r => r.fulfill(html(dexMock.handle(r.request().url()))));
    dexApi = await dexMock.startApi();
  }

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
    // "Hồ sơ mới" không đủ tin: một lần chạy chết giữa chừng đã tạo thư mục hồ sơ mà chưa hề đăng nhập.
    // Hỏi thẳng hồ sơ test xem đã có phiên X chưa (chỉ xem cookie có TỒN TẠI không, không đọc giá trị).
    const xLoggedIn = async () => (await ctx.cookies('https://x.com')).some(c => c.name === 'auth_token');
    if (!MOCK && (!(await xLoggedIn()) || /\/i\/flow\/login|\/login/.test(page.url()))) {
      await ask('  → Hãy đăng nhập X trong cửa sổ vừa mở, rồi bấm Enter ở đây... ');
      await page.goto('https://x.com/search?q=' + encodeURIComponent(ca) + '&f=live', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    const xFab = await page.waitForFunction(() => {
      const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab');
      return f && f.getClientRects().length > 0;
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok(xFab, 'nút nổi nhận ra token trên trang tìm kiếm X',
      xFab ? '— ' + (await textOf(page, '.nd-fab')) : '(token này cần đã có ghi chú, hoặc DexScreener phải biết nó)');

    // Nút nổi hiện ngay từ URL, còn bài viết trên X thật tải sau đó 1–3 giây: chờ có bài rồi mới bôi đen.
    await page.waitForFunction(() => [...document.querySelectorAll('article [data-testid="tweetText"]')].some(e => (e.textContent || '').trim().length > 40), null, { timeout: 20000 }).catch(() => {});
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
        // Bấm lưu thật: mốc phải vào đúng token, kèm @tác_giả và link bài — đọc từ DOM thật của X. Chỉ ghi vào
        // storage của hồ sơ test; không đăng, không like, không gửi gì lên X.
        const m4 = TOKEN_URL.match(/gmgn\.ai\/([^/]+)\/token\/([^/?#]+)/);
        const entriesOf = () => sw.evaluate(async ([chain, address]) => { const k = NotedStore.keyOf(NotedStore.normalizeChain(chain), NotedStore.normalizeAddress(address)); const p = await NotedStore.get(k); return p ? p.timeline : []; }, [m4[1], m4[2]]);
        const picked4 = await page.evaluate(() => (getSelection().toString() || '').replace(/\s+/g, ' ').trim());
        const before4 = (await entriesOf()).length;
        await clickShadow(page, '.nd-sel');
        let added = null;
        for (let i = 0; i < 30 && !added; i++) { const tl = await entriesOf(); if (tl.length > before4) added = tl[tl.length - 1]; else await page.waitForTimeout(200); }
        if (ok(!!added, 'bấm nút thì có mốc mới trong ghi chú của token')) {
          const flat = x => String(x || '').replace(/\s+/g, ' ');
          ok(/^@[A-Za-z0-9_]{1,15}: /.test(added.text), 'mốc mở đầu bằng @tác_giả đọc từ bài viết', '— ' + added.text.slice(0, 40).replace(/\n/g, ' '));
          ok(flat(added.text).includes(picked4.slice(0, 30)), 'mốc chứa đúng đoạn đã bôi đen');
          ok(/https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(added.text), 'mốc kèm link tới đúng bài viết');
          // dọn: gỡ mốc thử khỏi hồ sơ test để lần chạy sau không phình ra
          await sw.evaluate(async ([chain, address, id]) => { const k = NotedStore.keyOf(NotedStore.normalizeChain(chain), NotedStore.normalizeAddress(address)); const p = await NotedStore.get(k); if (!p) return; p.timeline = p.timeline.filter(e => e.id !== id); await NotedStore.save(p, { removedIds: [id] }); }, [m4[1], m4[2], added.id]);
        }
        await page.waitForTimeout(2600);   // xác nhận ✓ tự ẩn sau ~2 giây
        const el4 = await page.evaluate(() => { const e = [...document.querySelectorAll('article [data-testid="tweetText"]')].find(x => (x.textContent || '').trim().length > 40); if (!e) return false; const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; });
        if (el4) for (let i = 0; i < 25 && !(await visible(page, '.nd-sel')); i++) await page.waitForTimeout(200);
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

  // CẢNH BÁO: trên X thật, mở x.com/i/grok?text=… là X TỰ GỬI prompt ngay (không chỉ điền vào ô nhập), tức mỗi lần
  // chạy bước này tốn MỘT lượt Grok của tài khoản đang đăng nhập. Vì vậy trên trang thật bước này chỉ chạy khi có
  // cờ --grok. Ở chế độ giả lập thì luôn chạy (không có gì bị gửi đi đâu).
  if (MOCK || has('grok')) {
    console.log('5b) Grok: Research with Grok -> tự lưu đúng MỘT mốc, chỉ sau khi Grok trả lời xong' + (MOCK ? '' : '  [tốn 1 lượt Grok]'));
    const m5 = TOKEN_URL.match(/gmgn\.ai\/([^/]+)\/token\/([^/?#]+)/);
    const grokOf = () => sw.evaluate(async ([chain, address]) => { const p = await NotedStore.get(NotedStore.keyOf(NotedStore.normalizeChain(chain), NotedStore.normalizeAddress(address))); return p ? p.timeline.filter(e => e.source === 'grok') : []; }, [m5[1], m5[2]]);
    const before5 = (await grokOf()).length;
    await page.goto(TOKEN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const edit = await ctx.newPage();
    await edit.goto(`chrome-extension://${new URL(sw.url()).host}/src/dashboard/dashboard.html`);
    const known = new Set(ctx.pages());
    // đi đúng đường của nút "Research with Grok": background mở tab, gắn token + prompt cho tab đó
    await edit.evaluate(async ([chain, address]) => {
      const st = (await chrome.storage.local.get('settings')).settings || {};
      const tk = { chain: NotedStore.normalizeChain(chain), address: NotedStore.normalizeAddress(address) }; tk.key = NotedStore.keyOf(tk.chain, tk.address);
      const project = (await NotedStore.get(tk.key)) || NotedStore.emptyProject(tk.chain, tk.address);
      const prompt = NotedResearch.buildPrompt(st.researchTemplate || NotedResearch.defaultTemplate(NotedI18n.lang), NotedResearch.vars(project, {}));
      await chrome.runtime.sendMessage({ type: 'noted:open-grok', target: 'x', prompt, token: tk, symbol: project.symbol || '' });
    }, [m5[1], m5[2]]);
    let gp = null;
    for (let i = 0; i < 40 && !gp; i++) { gp = ctx.pages().find(x => !known.has(x)); if (!gp) await page.waitForTimeout(250); }
    if (ok(!!gp, 'tab Grok được mở')) {
      if (MOCK) { await gp.waitForURL(/i\/grok/, { timeout: 15000 }).catch(() => {}); await gp.waitForLoadState('load').catch(() => {}); await gp.waitForTimeout(500); await gp.goto((await sw.evaluate(async () => { const all = await chrome.storage.session.get(null); const v = Object.entries(all).filter(([k]) => k.startsWith('grok:')).map(([, x]) => x).sort((a, b) => b.at - a.at)[0]; return NotedResearch.urlFor('x', v.prompt); })) + '&shape=x'); await gp.waitForSelector('#send'); await gp.click('#send'); }
      // theo dõi: lúc mốc ĐẦU TIÊN xuất hiện thì tin nhắn của Grok đã có hàng nút (đã xong) hay chưa
      let first = null, buttonsAtSave = -1;
      for (let i = 0; i < 720 && !first; i++) {
        const tl = await grokOf();
        if (tl.length > before5) { first = tl[tl.length - 1]; buttonsAtSave = await gp.evaluate(() => { const main = document.querySelector('main') || document.body; const msgs = [...main.querySelectorAll('div')].filter(d => d.querySelectorAll('button,[role="button"]').length >= 3 && (d.textContent || '').length > 200); return msgs.length; }).catch(() => -1); }
        else await page.waitForTimeout(500);
      }
      if (ok(!!first, 'câu trả lời được tự lưu vào đúng token')) {
        await page.waitForTimeout(8000);
        const tl = await grokOf();
        ok(tl.length === before5 + 1, 'đúng MỘT mốc (không lưu bản dở, không lưu hai lần)', '— ' + (tl.length - before5));
        ok(buttonsAtSave > 0, 'lúc lưu, Grok đã trả lời xong (đã có hàng nút dưới tin nhắn)');
        ok(!/OUTPUT (IN EXACTLY|ĐÚNG THỨ TỰ)|严格按以下顺序/.test(first.text), 'không lẫn các đoạn của chính prompt');
        ok(!/[.!?…。]\p{Lu}/u.test(first.text.split('\n')[0]), 'dòng đầu không dính các bước "đang suy nghĩ"', '— ' + first.text.split('\n')[0].slice(0, 50));
        ok(first.text.length > 300, 'mốc là câu trả lời đầy đủ', '— ' + first.text.length + ' ký tự');
        await shot(gp, '6b-grok-saved');
      }
      await gp.close().catch(() => {});
    }
    await edit.close().catch(() => {});
  } else if (!has('skip-x')) {
    console.log('5b) (bỏ qua Grok thật — X TỰ GỬI prompt khi mở link, mỗi lần chạy tốn 1 lượt Grok; thêm --grok nếu bạn muốn chạy)');
  }

  console.log('6) DexScreener');
  if (!DEX_URL) DEX_URL = await dexUrlFor(TOKEN_URL);
  console.log('  trang pair:', DEX_URL);
  await page.goto(DEX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const dexFab = await page.waitForFunction(() => {
    const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab');
    return f && f.getClientRects().length > 0;
  }, null, { timeout: 40000 }).then(() => true).catch(() => false);
  ok(dexFab, 'nút nổi hiện trên trang pair (pair -> token qua API)', dexFab ? '— ' + (await textOf(page, '.nd-fab')) : '');
  await shot(page, '7-dexscreener');

  console.log('7) Tab không có token: panel hiện token xem gần nhất thay cho màn hình trống');
  let last = null;
  for (let i = 0; i < 40 && !last; i++) { last = await sw.evaluate(async () => (await chrome.storage.local.get('lastToken')).lastToken || null); if (!last) await page.waitForTimeout(250); }
  if (ok(!!(last && last.token && last.token.key), 'background nhớ token xem gần nhất', last ? '— ' + last.token.key + (last.symbol ? ' (' + last.symbol + ')' : '') : '')) {
    // Mở trang panel như một tab thường: tab đang hoạt động khi đó chính là nó — một tab không có token nào.
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${new URL(sw.url()).host}/src/panel/panel.html`);
    let shown = null;
    for (let i = 0; i < 40; i++) {
      shown = await panel.evaluate(addr => ({
        mount: document.querySelector('#mount').getClientRects().length > 0,
        empty: document.querySelector('#empty').getClientRects().length > 0,
        hasAddr: document.body.innerText.includes(NotedStore.shortAddress(addr)),
      }), last.token.address).catch(() => null);
      if (shown && shown.mount && shown.hasAddr) break;
      await panel.waitForTimeout(250);
    }
    ok(!!(shown && shown.mount && shown.hasAddr && !shown.empty), 'panel hiện đúng token đó, không phải màn hình trống', JSON.stringify(shown));
    try { await panel.screenshot({ path: path.join(OUT, '8-panel-last-token.png') }); } catch (_) {}
    await panel.close();
  }

  console.log(`\n${fail === 0 ? 'TẤT CẢ ĐỀU ĐẠT' : 'CÓ LỖI'} — đạt ${pass}, hỏng ${fail}`);
  console.log('Ảnh chụp từng bước:', OUT);
  if (has('keep')) await ask('Nhấn Enter để đóng trình duyệt... ');
  await ctx.close();
  if (dexApi) dexApi.server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async e => { console.error('\nLỖI:', e && e.message); process.exit(1); });
