// Nạp extension thật vào Chromium (Playwright), chặn mọi request tới gmgn.ai và trả về trang giả lập,
// rồi kiểm tra: gắn nút, mở Side Panel (qua trang panel với ?tab=) và drawer dự phòng, lưu ghi chú,
// tooltip, FAB trên trang token, dashboard, export/import, popup.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('./pw');
const mock = require('./mock-gmgn');
const grokMock = require('./mock-grok');
const dexMock = require('./mock-dexscreener');
const xSearchMock = require('./mock-xsearch');

const EXT = process.env.EXT_DIR || path.resolve(__dirname, '..'); // EXT_DIR: kiểm tra một bản đã đóng gói
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const PROLOG = 'robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3';
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ✓', msg); };
const shadowQ = (page, sel) => page.evaluate(s => { const el = document.getElementById('noted-gmgn-host').shadowRoot.querySelector(s); return el ? (el.getClientRects().length ? el.textContent : '') : null; }, sel);
const drawerOpen = page => page.evaluate(() => !!document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'));

(async () => {
  const userDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noted-prof-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: !process.env.HEADED, // HEADED=1 (kèm xvfb-run): Chrome mở thật, side panel thật hoạt động
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1100, height: 800 },
  });
  await ctx.route('https://gmgn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mock.handle(route.request().url()) }));
  for (const pat of ['https://x.com/**', 'https://grok.com/**']) await ctx.route(pat, route => {
    const u = new URL(route.request().url());
    const body = u.hostname === 'x.com' && !u.pathname.startsWith('/i/grok') ? xSearchMock.page(route.request().url()) : grokMock.page(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await ctx.route('https://dexscreener.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: dexMock.handle(route.request().url()) }));
  const dexApi = await dexMock.startApi();

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('extension id', extId);

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  console.log('0) Mặc định: danh sách không có nút ✎ ở từng hàng, chỉ nút nổi trên trang token');
  await page.goto('https://gmgn.ai/follow?chain=robinhood');
  await page.waitForTimeout(1500);
  assert((await page.$$('.noted-badge')).length === 0, 'mặc định không gắn nút vào hàng');
  await page.goto('https://gmgn.ai/robinhood/token/0xaa40e79e987517f7462bf79315b8a118799b04e3');
  await page.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0; }, null, { timeout: 8000 });
  assert(true, 'trang token vẫn có nút nổi');
  await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await page.waitForTimeout(1200);
  const panelLive = await sw.evaluate(() => panelWindows.size > 0);
  console.log('  side panel thật có mở:', panelLive, process.env.HEADED ? '(cửa sổ Chrome thật)' : '(headless)'); // false -> chạy nhánh drawer dự phòng
  if (panelLive) {
    await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
    await page.waitForTimeout(800);
    const tabIdT = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    const opts = await sw.evaluate(async id => chrome.sidePanel.getOptions({ tabId: id }), tabIdT);
    assert(opts.enabled === false && (await sw.evaluate(() => panelWindows.size)) === 0, 'bấm nút nổi lần 2 đóng side panel');
    await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
    await page.waitForTimeout(1200);
    assert((await sw.evaluate(async id => chrome.sidePanel.getOptions({ tabId: id }), tabIdT)).enabled === true && (await sw.evaluate(() => panelWindows.size)) > 0, 'bấm lần 3 mở lại');
  }
  await sw.evaluate(async () => { const st = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...st, listBadges: true } }); });

  console.log('1) Danh sách theo dõi: gắn nút (tuỳ chọn listBadges bật)');
  await page.goto('https://gmgn.ai/follow?chain=robinhood');
  await page.waitForSelector('.noted-badge', { timeout: 10000 });
  await page.waitForTimeout(1500); // đợi hàng "LATE" được thêm động
  const badges = await page.$$eval('.noted-badge', els => els.map(b => ({ key: b.dataset.key, prev: b.previousSibling && b.previousSibling.nodeValue && b.previousSibling.nodeValue.trim() })));
  assert(badges.length === mock.TOKENS.length + 2, `mỗi hàng có một nút (${badges.length}: 6 link + 1 hàng thêm động + 1 hàng data-row-key)`);
  assert(badges.find(b => b.key === PROLOG && b.prev === 'PROLOG'), 'nút PROLOG nằm ngay sau symbol');
  assert(badges.find(b => b.key === 'sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'), 'nhận diện địa chỉ Solana');
  assert(badges.find(b => b.key === 'robinhood:0x5555555555555555555555555555555555555555' && b.prev === 'ROWKEY'), 'dự phòng data-row-key hoạt động');
  assert(badges.find(b => b.key === 'base:0x6666666666666666666666666666666666666666'), 'hàng thêm động cũng có nút');
  const badgeColor = await page.$eval(`.noted-badge[data-key="${PROLOG}"]`, b => getComputedStyle(b).borderColor);
  assert(badgeColor !== 'rgba(0, 0, 0, 0)' && !/255, 255, 255/.test(badgeColor), 'nút chưa ghi có màu nổi bật: ' + badgeColor);

  console.log('2) Chế độ mặc định (Side Panel): bấm nút -> background nhận yêu cầu');
  // Không có quyền "tabs" nên không query tab theo URL được: ghi lại tab id từ sender của message noted:open.
  await sw.evaluate(() => { chrome.runtime.onMessage.addListener((m, sender) => { if (m && m.type === 'noted:open' && sender.tab) globalThis.__lastTab = sender.tab.id; }); });
  await page.click(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(800);
  const gmgnTabId = await sw.evaluate(() => globalThis.__lastTab);
  assert(typeof gmgnTabId === 'number', 'background nhận message noted:open từ tab gmgn (' + gmgnTabId + ')');
  const session = await sw.evaluate(async () => chrome.storage.session.get(null));
  const panelMode = !!session['tab:' + gmgnTabId];
  const drawerMode = await drawerOpen(page);
  console.log('  chế độ thực tế:', panelMode ? 'Side Panel' : 'drawer dự phòng (không mở được side panel)');
  assert(panelMode || drawerMode, 'bấm nút mở được panel hoặc drawer dự phòng');
  if (panelMode) assert(session['tab:' + gmgnTabId].ctx.symbol === 'PROLOG' && session['tab:' + gmgnTabId].ctx.mc === '$10.64M', 'background nhớ token + symbol + MC theo tab');
  assert((await page.evaluate(() => location.pathname)) === '/follow', 'bấm nút không điều hướng sang trang token');
  assert(!(await page.evaluate(() => document.body.dataset.navigated)), 'handler click của trang không bị kích hoạt');
  if (drawerMode) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  console.log('3) Trang Side Panel (mở như tab với ?tab=) — ctx không có symbol để test hỏi content script');
  await sw.evaluate(async (args) => chrome.storage.session.set({ ['tab:' + args.tabId]: { token: { chain: 'robinhood', address: args.addr, key: args.key }, ctx: { mc: '$10.64M' }, at: Date.now() } }),
    { tabId: gmgnTabId, addr: PROLOG.split(':')[1], key: PROLOG });
  const panel = await ctx.newPage();
  panel.on('pageerror', e => console.log('PANEL ERROR', e.message));
  await panel.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${gmgnTabId}`);
  await panel.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  assert((await panel.$eval('.ne-symbol', e => e.value)) === 'PROLOG', 'panel lấy symbol từ content script của tab gmgn');
  const bothShown = async pg => pg.evaluate(() => {
    const vis = el => !!el && el.getClientRects().length > 0;
    return vis(document.querySelector('#empty')) && vis(document.querySelector('#mount'));
  });
  assert((await bothShown(panel)) === false, 'không hiện chồng màn hình trống lên bảng ghi chú');
  assert((await panel.$eval('.ne-mcnow', e => e.textContent)).includes('$10.64M'), 'panel hiện MC lúc ghi');
  await panel.click('.ne-name'); await panel.type('.ne-name', 'AI agent launchpad tren Robinhood chain');
  await panel.click('.ne-summary'); await panel.type('.ne-summary', 'Launchpad cho AI agent, doi ex-Coinbase, TGE thang 10. Rui ro: unlock lon.');
  await panel.click('.ne-taginput'); await panel.type('.ne-taginput', 'ai, launchpad'); await panel.press('.ne-taginput', 'Enter');
  await panel.click('.ne-pin');
  await panel.click('.ne-stars span[data-n="4"]');
  await panel.selectOption('.ne-status', 'researching');
  await panel.click('.ne-newtext'); await panel.type('.ne-newtext', 'Thread X cua founder: https://x.com/example/status/123 - noi ve tokenomics');
  await panel.selectOption('.ne-newtype', 'research'); await panel.click('.ne-add');
  await panel.click('.ne-newtext'); await panel.type('.ne-newtext', 'Mua thu 0.1 ETH');
  await panel.selectOption('.ne-newtype', 'buy'); await panel.press('.ne-newtext', 'Control+Enter');
  await panel.waitForTimeout(700);
  const entries = await panel.$$eval('.ne-entry', els => els.map(e => e.dataset.type));
  assert(entries.length === 2 && entries[0] === 'buy', 'timeline trong panel có 2 mốc, mới nhất ở trên: ' + entries.join(','));
  assert(await panel.$eval('.ne-entries', el => !!el.querySelector('a[href="https://x.com/example/status/123"]')), 'URL trong mốc được biến thành link');
  await panel.setViewportSize({ width: 380, height: 800 });
  await panel.screenshot({ path: path.join(OUT, '5-side-panel.png') });
  // chuyển token qua message noted:show (như khi bấm nút khác)
  await sw.evaluate(async (args) => { await chrome.storage.session.set({ ['tab:' + args.tabId]: { token: args.token, ctx: { symbol: 'JUGGER', mc: '$9.05M' } } }); chrome.runtime.sendMessage({ type: 'noted:show', tabId: args.tabId, token: args.token, ctx: { symbol: 'JUGGER', mc: '$9.05M' } }).catch(() => {}); },
    { tabId: gmgnTabId, token: { chain: 'robinhood', address: '0x1111111111111111111111111111111111111111', key: 'robinhood:0x1111111111111111111111111111111111111111' } });
  await panel.waitForFunction(() => document.querySelector('.ne-symbol').value === 'JUGGER', null, { timeout: 5000 });
  assert(true, 'panel chuyển sang token khác khi nhận noted:show');
  await panel.close();

  console.log('4) Dữ liệu trong storage + nút đổi màu ở tab gmgn (cập nhật chéo ngữ cảnh)');
  const stored = await sw.evaluate(async () => chrome.storage.local.get(null));
  const p = stored['p:' + PROLOG];
  assert(p && p.symbol === 'PROLOG' && p.pinned && p.rating === 4 && p.status === 'researching', 'project lưu đúng pin/rating/status');
  assert(p.tags.join(',') === 'ai,launchpad', 'tags: ' + p.tags.join(','));
  assert(p.timeline.length === 2 && p.timeline[0].mc === '$10.64M', 'mốc timeline kèm MC lúc ghi');
  assert(p.name.startsWith('AI agent') && p.summary.startsWith('Launchpad'), 'name + summary lưu');
  await page.bringToFront();
  await page.waitForFunction(k => document.querySelector(`.noted-badge[data-key="${k}"]`).classList.contains('noted-badge--pin'), PROLOG, { timeout: 5000 });
  const cls = await page.$eval(`.noted-badge[data-key="${PROLOG}"]`, b => b.className + '|' + b.textContent);
  assert(cls.includes('noted-badge--has') && cls.includes('noted-badge--pin') && cls.endsWith('2'), 'nút hiện đã ghi + pin + số mốc: ' + cls);
  // Chuột còn nằm nguyên trên nút từ lần click ở bước 2: hover tới đúng toạ độ cũ không sinh chuyển động
  // chuột nào nên không có mouseenter. Đưa chuột ra ngoài trước, như người dùng thật rê chuột vào nút.
  await page.mouse.move(600, 600);
  await page.hover(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(200);
  const tipText = await shadowQ(page, '.nd-tip');
  assert(tipText.includes('Launchpad') && tipText.includes('#ai'), 'tooltip hiện tóm tắt + tag');
  await page.screenshot({ path: path.join(OUT, '2-list-tooltip.png') });

  console.log('5) Chế độ overlay (settings.ui = drawer): bấm nút mở drawer trong trang');
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'drawer', listBadges: true } }));
  await page.reload();
  await page.waitForSelector(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(400);
  await page.click(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'), null, { timeout: 5000 });
  assert(true, 'drawer mở');
  assert((await shadowQ(page, '.ne-symbol')) !== null && (await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.ne-symbol').value)) === 'PROLOG', 'drawer nạp đúng dự án');
  await page.evaluate(() => { const r = document.getElementById('noted-gmgn-host').shadowRoot; r.querySelector('.ne-newtext').value = 'Ghi tu drawer'; r.querySelector('.ne-add').click(); });
  await page.waitForTimeout(600);
  const n = await sw.evaluate(async k => (await chrome.storage.local.get('p:' + k))['p:' + k].timeline.length, PROLOG);
  assert(n === 3, 'thêm mốc từ drawer lưu được (3 mốc)');
  await page.screenshot({ path: path.join(OUT, '1-list-drawer.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert(!(await drawerOpen(page)), 'Esc đóng drawer');

  console.log('6) Trang token: FAB');
  await page.goto('https://gmgn.ai/robinhood/token/0xaa40e79e987517f7462bf79315b8a118799b04e3');
  await page.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0; }, null, { timeout: 8000 });
  const fabText = await shadowQ(page, '.nd-fab');
  assert(fabText.includes('PROLOG') && fabText.includes('Launchpad'), 'FAB hiện symbol + tóm tắt: ' + fabText);
  await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await page.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'), null, { timeout: 5000 });
  assert(true, 'FAB mở drawer (chế độ overlay)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '3-token-page.png') });
  await page.keyboard.press('Escape');

  console.log('7) Trang token chưa có ghi chú: symbol từ <title>, và page-info cho panel');
  await page.goto('https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222');
  await page.waitForTimeout(500);
  assert((await shadowQ(page, '.nd-fab')).includes('FRONG'), 'FAB đọc symbol từ title');
  const info = await sw.evaluate(async (args) => chrome.tabs.sendMessage(args.tabId, { type: 'noted:page-info', key: args.key }), { tabId: gmgnTabId, key: 'robinhood:0x2222222222222222222222222222222222222222' });
  assert(info && info.symbol === 'FRONG', 'content script trả symbol cho panel: ' + JSON.stringify(info));

  console.log('7b) Panel theo dõi trang: mở trang token khác -> panel của tab chuyển theo');
  await page.waitForTimeout(400);
  const follow = await sw.evaluate(async id => (await chrome.storage.session.get('tab:' + id))['tab:' + id], gmgnTabId);
  assert(follow && follow.token.key === 'robinhood:0x2222222222222222222222222222222222222222' && follow.ctx.symbol === 'FRONG', 'session của tab đổi sang FRONG kèm symbol: ' + JSON.stringify(follow && follow.token));
  const panelF = await ctx.newPage();
  await panelF.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${gmgnTabId}`);
  await panelF.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  assert((await panelF.$eval('.ne-symbol', e => e.value)) === 'FRONG', 'panel hiện đúng token đang xem');

  console.log('7c) Panel đang mở: đổi sang token khác trong cùng tab -> panel nhảy theo (kể cả khi tab chưa có phiên)');
  await sw.evaluate(async id => chrome.storage.session.remove('tab:' + id), gmgnTabId);
  await page.bringToFront();
  await page.goto('https://gmgn.ai/robinhood/token/0xaa40e79e987517f7462bf79315b8a118799b04e3');
  await panelF.waitForFunction(() => document.querySelector('.ne-symbol') && document.querySelector('.ne-symbol').value === 'PROLOG', null, { timeout: 8000 });
  assert(true, 'panel tự chuyển sang PROLOG khi trang đổi token');
  await page.goto('https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222');
  await panelF.waitForFunction(() => document.querySelector('.ne-symbol') && document.querySelector('.ne-symbol').value === 'FRONG', null, { timeout: 8000 });
  assert(true, 'quay lại token trước, panel cũng nhảy theo');
  await panelF.close();

  console.log('8) Dashboard');
  const dash = await ctx.newPage();
  dash.on('pageerror', e => console.log('DASH ERROR', e.message));
  await dash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await dash.waitForSelector('.card');
  const cards = await dash.$$eval('.card', els => els.map(e => e.textContent));
  assert(cards.length === 1 && cards[0].includes('PROLOG') && cards[0].includes('Robinhood'), 'dashboard liệt kê dự án');
  await dash.click('.card');
  await dash.waitForSelector('#editor-mount:not([hidden]) .ne-symbol');
  assert((await dash.$eval('.ne-symbol', e => e.value)) === 'PROLOG', 'editor trong dashboard nạp dự án');
  await dash.fill('#search', 'khongcogi');
  assert((await dash.$$('.card')).length === 0, 'tìm kiếm lọc đúng');
  await dash.fill('#search', 'launchpad');
  assert((await dash.$$('.card')).length === 1, 'tìm theo tag/summary');
  await dash.screenshot({ path: path.join(OUT, '4-dashboard.png') });

  console.log('9) Export / import');
  const md = await dash.evaluate(async () => NotedStore.toMarkdown(await NotedStore.getAll()));
  assert(md.includes('## PROLOG') && md.includes('[Buy]') && md.includes('MC $10.64M'), 'markdown export (English default)');
  const json = await dash.evaluate(async () => NotedStore.exportJSON());
  const r = await dash.evaluate(async (data) => {
    data.projects[0].timeline.push({ id: 'imp1', ts: Date.now() + 1000, type: 'news', text: 'imported entry' });
    data.projects[0].updatedAt = Date.now() + 1000;
    data.projects.push({ chain: 'sol', address: 'Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump', symbol: 'EXTENSION', summary: 'x', tags: ['t'], timeline: [] });
    return NotedStore.importJSON(data);
  }, json);
  assert(r.added === 1 && r.merged === 1, `import gộp: ${JSON.stringify(r)}`);
  const bad = await dash.evaluate(async () => NotedStore.importJSON({ projects: [
    { chain: '<img onerror=x>', address: '0xaa40e79e987517f7462bf79315b8a118799b04e3', symbol: 'EVIL' },
    { chain: 'sol', address: 'not-an-address', symbol: 'EVIL2' },
    { chain: 'base', address: '0x9999999999999999999999999999999999999999', symbol: 'x'.repeat(500), name: { a: 1 }, tags: ['<b>t</b>', 42], rating: 99, status: 'hacked', timeline: [{ text: 'ok', type: 'weird', id: '<script>' }, { text: 123 }, 'junk'], __proto__: { polluted: true } },
  ] }));
  assert(bad.added === 1 && bad.skipped === 2, 'import: bản ghi chain/address hỏng bị bỏ, bản ghi lạ được chuẩn hoá: ' + JSON.stringify(bad));
  const norm = await dash.evaluate(async () => NotedStore.get('base:0x9999999999999999999999999999999999999999'));
  assert(norm.symbol.length === 32 && norm.name === '[object Object]' && norm.tags.join(',') === '<b>t</b>,42' && norm.rating === 5 && norm.status === 'watching' && norm.timeline.length === 1 && norm.timeline[0].type === 'note' && norm.timeline[0].id !== '<script>', 'sanitize ép kiểu, giới hạn độ dài, id/type/status hợp lệ');
  assert(({}).polluted === undefined, 'không bị prototype pollution qua import');
  await dash.evaluate(async () => NotedStore.remove('base:0x9999999999999999999999999999999999999999'));
  const cardHtml = await dash.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return document.querySelector('#list').innerHTML; });
  assert(!cardHtml.includes('<b>t</b>') , 'tag chứa HTML được escape khi hiển thị');
  const after = await dash.evaluate(async k => (await NotedStore.get(k)).timeline.length, PROLOG);
  assert(after === 4, 'timeline sau import gộp = 4');

  console.log('10) Popup');
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await pop.waitForFunction(() => !document.querySelector('#stats').textContent.includes('…'));
  const stats = await pop.$eval('#stats', e => e.textContent);
  assert(stats.startsWith('2 projects'), 'popup thống kê (English mặc định): ' + stats);
  assert((await pop.$eval('#lang', e => e.value)) === 'en', 'popup: ngôn ngữ mặc định en');
  assert((await pop.$eval('#ui-mode', e => e.value)) === 'drawer', 'popup hiện đúng tuỳ chọn giao diện');
  await pop.selectOption('#ui-mode', 'panel');
  await pop.waitForTimeout(200);
  assert((await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.ui)) === 'panel', 'đổi tuỳ chọn từ popup được lưu');

  console.log('11) Đổi ngôn ngữ: vi và zh áp cho dashboard, popup và content script');
  await pop.selectOption('#lang', 'vi');
  await pop.waitForTimeout(400);
  await dash.reload();
  await dash.waitForSelector('.card');
  assert((await dash.$eval('#f-status option[value=""]', e => e.textContent)) === 'Mọi trạng thái', 'dashboard tiếng Việt');
  assert((await dash.$eval('#stats', e => e.textContent)).includes('dự án'), 'thống kê tiếng Việt');
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'panel', lang: 'zh', listBadges: true } }));
  await dash.waitForTimeout(400);
  await dash.reload();
  await dash.waitForSelector('.card');
  assert((await dash.$eval('#f-status option[value=""]', e => e.textContent)) === '全部状态', 'dashboard tiếng Trung');
  await dash.click('.card');
  await dash.waitForSelector('#editor-mount:not([hidden]) .ne-symbol');
  assert((await dash.$eval('.ne-label', e => e.textContent)) === '状态', 'editor tiếng Trung');
  await page.bringToFront();
  await page.goto('https://gmgn.ai/follow?chain=robinhood');
  await page.waitForSelector(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(500);
  await page.hover(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(250);
  assert((await shadowQ(page, '.nd-tip')).includes('研究中'), 'tooltip trong trang gmgn dùng tiếng Trung');
  assert((await page.$eval('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]', b => b.title)) === '为该项目添加笔记 (Research-Noted-Gmgn)', 'title nút tiếng Trung');
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'panel', lang: 'en', listBadges: true } }));
  await page.waitForTimeout(300);
  await page.hover('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]');
  assert((await page.$eval('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]', b => b.title)) === 'Add a note for this project (Research-Noted-Gmgn)', 'đổi ngôn ngữ áp ngay cho nút mà không cần tải lại');

  console.log('12) Research with Grok: deep link + Save to Noted');
  await dash.waitForSelector('.card');
  await dash.click('.card');
  await dash.waitForSelector('#editor-mount:not([hidden]) .ne-grok');
  const grokPromise = ctx.waitForEvent('page');
  await dash.click('.ne-grok');
  const grok = await grokPromise;
  grok.on('pageerror', e => console.log('GROK ERROR', e.message));
  // Tab do extension tạo điều hướng ra mạng thật trước khi route của Playwright kịp chặn (x.com bị chặn ở đây),
  // nên lấy URL background đã dựng (lưu trong storage.session) và điều hướng lại qua route giả lập.
  const grokUrlFor = async () => sw.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    const m = Object.entries(all).filter(([k]) => k.startsWith('grok:')).map(([, v]) => v).sort((a, b) => b.at - a.at)[0];
    return { url: NotedResearch.urlFor(m.target || (await chrome.storage.local.get('settings')).settings?.researchTarget || 'x', m.prompt), m };
  });
  await grok.waitForTimeout(500);
  const gurl = (await grokUrlFor()).url;
  await grok.goto(gurl);
  assert(gurl.startsWith('https://x.com/i/grok?text='), 'mở tab Grok trên X với prompt điền sẵn: ' + gurl.slice(0, 60));
  const prompt = decodeURIComponent(gurl.split('text=')[1]);
  assert(prompt.includes('$PROLOG') && prompt.includes('0xaa40e79e987517f7462bf79315b8a118799b04e3') && prompt.includes('Robinhood') && prompt.includes('$10.64M'), 'prompt có symbol, chain, contract, market cap');
  const order = ['\nDEV (', '\nKOL\n', '\nPROJECT (', '\n1. Problem', '\n6. Design risks', '\nMEME ('].map(h => prompt.indexOf(h));
  assert(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])), 'prompt có đủ DEV, KOL, PROJECT (6 mục), MEME theo đúng thứ tự: ' + order.join(','));
  assert(prompt.includes('OUTPUT IN EXACTLY THIS ORDER:') && prompt.includes('How to look:'), 'tiêu đề kết thúc bằng dấu hai chấm không bị bộ lọc nhãn rỗng nuốt mất');
  assert(prompt.includes('the $PROLOG token plays'), 'symbol được điền cả trong thân prompt');
  assert((await grok.$eval('#composer', e => e.textContent)).includes('Research token'), 'ô nhập của Grok nhận prompt');
  await grok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  const gq = (sel, prop = 'textContent') => grok.evaluate(([s, p]) => { const el = document.getElementById('noted-grok-host').shadowRoot.querySelector(s); return el ? el[p] : null; }, [sel, prop]);
  const gclick = sel => grok.evaluate(s => document.getElementById('noted-grok-host').shadowRoot.querySelector(s).click(), sel);
  assert((await gq('.pill')).includes('PROLOG'), 'panel trên Grok biết đang research PROLOG');
  assert((await gq('.autochk', 'checked')) === true, 'panel có công tắc tự lưu, mặc định bật');
  const grokEntries = async () => (await sw.evaluate(async k => (await chrome.storage.local.get('p:' + k))['p:' + k], PROLOG)).timeline.filter(e => e.source === 'grok');
  assert((await grokEntries()).length === 0, 'chưa gửi prompt thì chưa lưu gì (dù trên trang có nhiều khối chữ)');
  await grok.click('#send');
  await grok.waitForFunction(() => { const s = document.getElementById('noted-grok-host').shadowRoot.querySelector('.status'); return s.classList.contains('ok') && s.textContent.includes('Auto-saved'); }, null, { timeout: 25000 });
  let ge = await grokEntries();
  assert(ge.length === 1 && ge[0].text.includes(grokMock.ANSWER_P1) && ge[0].text.includes(grokMock.ANSWER_LI), 'tự lưu câu trả lời hoàn chỉnh sau khi hết streaming (không lưu bản dở)');
  assert(!ge[0].text.includes('Research this crypto token') && !ge[0].text.includes('Trends for you') && !ge[0].text.includes('Terms of Service'), 'không lẫn prompt, sidebar hay footer');
  assert(ge[0].type === 'research' && ge[0].text.includes('Source: https://x.com/i/grok?conversation=1234567890'), 'mốc loại research, kèm link cuộc trò chuyện');
  const captured = await gq('.text', 'value');
  assert(captured.includes(grokMock.ANSWER_P2), 'ô xem trước hiện nội dung đã tự lưu');
  await gclick('.undo');
  await grok.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.status').textContent.includes('Removed'), null, { timeout: 5000 });
  assert((await grokEntries()).length === 0, 'Undo gỡ mốc vừa tự lưu');
  await grok.waitForTimeout(4500);
  assert((await grokEntries()).length === 0, 'sau Undo, auto không lưu lại cùng nội dung');
  await gclick('.cap');
  await gclick('.save');
  await grok.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.status').textContent.includes('Saved to'), null, { timeout: 5000 });
  ge = await grokEntries();
  assert(ge.length === 1, 'lưu thủ công lại được sau Undo');
  const entry = ge[0];
  await gclick('.save');
  await grok.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.status').textContent.includes('Already saved'), null, { timeout: 5000 });
  assert((await grokEntries()).length === 1, 'lưu trùng nội dung bị chặn');
  await grok.click('#send');
  await grok.waitForFunction(() => document.querySelectorAll('.msg.grok').length === 2);
  await grok.waitForFunction(() => { const s = document.getElementById('noted-grok-host').shadowRoot.querySelector('.status'); return s.textContent.includes('Auto-saved'); }, null, { timeout: 25000 });
  ge = await grokEntries();
  assert(ge.length === 2 && ge[1].text.includes('Follow-up answer number 2'), 'câu trả lời tiếp theo cũng được tự lưu thành mốc mới');
  await grok.setViewportSize({ width: 1280, height: 800 });
  await grok.screenshot({ path: path.join(OUT, '6-grok-save.png') });
  const dashPromise = ctx.waitForEvent('page');
  await gclick('.opendash');
  const dash2 = await dashPromise;
  await dash2.waitForTimeout(600);
  assert(dash2.url().includes('/src/dashboard/dashboard.html?open=robinhood%3A0xaa40'), '"Open in Dashboard" mở qua background: ' + dash2.url());
  await dash2.close();

  console.log('12b) Panel gắn với tab Grok: câu trả lời tự lưu hiện ngay trong timeline');
  const grokTabId = await sw.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    const k = Object.keys(all).filter(x => x.startsWith('grok:')).sort((a, b) => all[b].at - all[a].at)[0];
    return Number(k.slice('grok:'.length));
  });
  const grokBind = await sw.evaluate(async id => (await chrome.storage.session.get('tab:' + id))['tab:' + id], grokTabId);
  assert(grokBind && grokBind.token && grokBind.token.key === PROLOG, 'tab Grok được gắn sẵn dự án nên side panel đi theo đúng token');
  const gpanel = await ctx.newPage();
  gpanel.on('pageerror', e => console.log('GPANEL ERROR', e.message));
  await gpanel.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${grokTabId}`);
  await gpanel.waitForSelector('#mount:not([hidden]) .ne-entry', { timeout: 8000 });
  assert((await gpanel.$eval('#empty', e => e.hidden)) === true, 'panel mở cùng tab Grok hiện luôn ghi chú (không kẹt ở màn hình trống)');
  const gpBefore = await gpanel.$$eval('.ne-entry', els => els.length);
  await grok.bringToFront();
  await grok.click('#send');
  await grok.waitForFunction(() => document.querySelectorAll('.msg.grok').length === 3);
  await gpanel.waitForFunction(n => document.querySelectorAll('.ne-entry').length === n, gpBefore + 1, { timeout: 25000 });
  assert(true, 'panel đang mở tự hiện câu trả lời Grok vừa tự lưu');
  assert(await gpanel.$eval('.ne-entries', el => !!el.querySelector('.ne-entry--new')), 'mốc Grok mới được tô sáng trong panel');
  await gpanel.close();

  console.log('12c) Ghi đồng thời: bản cũ trong panel không nuốt mốc nơi khác vừa thêm');
  const merged = await sw.evaluate(async k => {
    const stale = await NotedStore.get(k);                       // bản panel đang giữ trong bộ nhớ
    const other = await NotedStore.get(k);
    other.timeline.push(NotedStore.newEntry('note', 'Moc tu noi khac', {}));
    await NotedStore.save(other);                                // nơi khác ghi trước
    stale.summary = 'Sua tu ban cu';
    await NotedStore.save(stale);                                // bản cũ ghi sau
    const now = await NotedStore.get(k);
    return { has: now.timeline.some(e => e.text === 'Moc tu noi khac'), summary: now.summary, n: now.timeline.length };
  }, PROLOG);
  assert(merged.has && merged.summary === 'Sua tu ban cu', 'mốc của nơi khác còn nguyên, sửa từ bản cũ vẫn lưu được');
  const removed = await sw.evaluate(async k => {
    const p = await NotedStore.get(k);
    const id = p.timeline[p.timeline.length - 1].id;
    const other = await NotedStore.get(k);
    other.summary = 'Cham vao truoc';
    await NotedStore.save(other);                                // làm cho bản p thành cũ
    p.timeline = p.timeline.filter(e => e.id !== id);
    await NotedStore.save(p, { removedIds: [id] });
    return (await NotedStore.get(k)).timeline.some(e => e.id === id);
  }, PROLOG);
  assert(removed === false, 'mốc người dùng xoá không bị gộp trở lại');
  await sw.evaluate(async k => {
    const p = await NotedStore.get(k);
    p.summary = 'Launchpad cho AI agent, doi ex-Coinbase, TGE thang 10. Rui ro: unlock lon.';
    await NotedStore.save(p);
  }, PROLOG);

  console.log('12d) Bố cục kiểu X (chữ nằm trong <span>, câu trả lời một khối): vẫn tự lưu được');
  await dash.bringToFront();
  const grokSpanPromise = ctx.waitForEvent('page');
  await dash.click('.ne-grok');
  const grokSpan = await grokSpanPromise;
  grokSpan.on('pageerror', e => console.log('GROK-SPAN ERROR', e.message));
  await grokSpan.waitForTimeout(500);
  await grokSpan.goto((await grokUrlFor()).url + '&shape=span');
  await grokSpan.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  const spanAuto = () => grokSpan.evaluate(() => { const el = document.getElementById('noted-grok-host').shadowRoot.querySelector('.autostat'); return el ? el.textContent : null; });
  await grokSpan.waitForFunction(() => { const el = document.getElementById('noted-grok-host').shadowRoot.querySelector('.autostat'); return el && el.textContent.trim(); }, null, { timeout: 8000 });
  assert((await spanAuto()).includes('send the prompt'), 'chưa gửi prompt: panel nói rõ tự lưu đang chờ — ' + (await spanAuto()));
  await grokSpan.click('#send');
  await grokSpan.waitForFunction(() => { const s = document.getElementById('noted-grok-host').shadowRoot.querySelector('.status'); return s.classList.contains('ok') && s.textContent.includes('Auto-saved'); }, null, { timeout: 25000 });
  const geSpan = await grokEntries();
  assert(geSpan.some(e => e.text.includes('Span layout answer.')), 'bắt đúng câu trả lời một khối nằm trong <span>');
  assert(!geSpan.some(e => e.text.includes('Trends for you') || e.text.includes('Terms of Service')), 'không bắt nhầm sidebar/footer');
  await grokSpan.close();

  await grok.close();

  console.log('13) Grok mở tay (chưa gắn token): gắn dự án rồi lưu phần bôi đen');
  const grok2 = await ctx.newPage();
  await grok2.goto('https://x.com/i/grok');
  await grok2.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.recent option[value^="sol:"]'), null, { timeout: 8000 });
  const g2 = (sel, prop = 'textContent') => grok2.evaluate(([s, p]) => { const el = document.getElementById('noted-grok-host').shadowRoot.querySelector(s); return el ? el[p] : null; }, [sel, prop]);
  assert((await g2('.head')).includes('Not linked'), 'panel báo chưa gắn dự án');
  await grok2.evaluate(() => { const r = document.getElementById('noted-grok-host').shadowRoot; const sel = r.querySelector('.recent'); sel.value = 'sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'; sel.dispatchEvent(new Event('change')); });
  await grok2.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.pill').textContent.includes('EXTENSION'), null, { timeout: 5000 });
  assert(true, 'chọn dự án gần đây -> gắn EXTENSION');
  await grok2.click('#send');
  await grok2.waitForFunction(li => document.querySelector('.msg.grok .li') && document.querySelector('.msg.grok .li').textContent.includes(li), grokMock.ANSWER_LI, { timeout: 10000 }); // đợi streaming xong
  await grok2.evaluate(() => { const p = document.querySelector('.msg.grok .p1'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await grok2.evaluate(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.sel').click());
  assert((await g2('.text', 'value')) === grokMock.ANSWER_P1, 'Use selected text lấy đúng đoạn bôi đen');
  await grok2.evaluate(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.save').click());
  await grok2.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.status').classList.contains('ok'), null, { timeout: 5000 });
  const ext = await sw.evaluate(async () => (await chrome.storage.local.get('p:sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'))['p:sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump']);
  assert(ext.timeline.length === 1 && ext.timeline[0].source === 'grok', 'lưu vào timeline EXTENSION');
  await grok2.waitForFunction(() => { const el = document.getElementById('noted-grok-host').shadowRoot.querySelector('.autostat'); return el && el.textContent.trim(); }, null, { timeout: 8000 });
  assert((await g2('.autostat')).includes('mentions this contract'), 'tab gắn tay: nói rõ chờ thấy địa chỉ contract mới lưu');
  await grok2.waitForTimeout(5000); // quá ngưỡng ổn định 3s của tự lưu
  const extAfter = await sw.evaluate(async () => (await chrome.storage.local.get('p:sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'))['p:sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump']);
  assert(extAfter.timeline.length === 1, 'câu trả lời không nhắc contract -> KHÔNG tự lưu bừa: ' + extAfter.timeline.length);
  await grok2.close();

  console.log('13b) Tab gắn tay nhưng hội thoại có nhắc contract: vẫn tự lưu (không cần prompt kèm tab)');
  const EXTKEY = 'sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump';
  const grokLinked = await ctx.newPage();
  await grokLinked.goto('https://x.com/i/grok?text=' + encodeURIComponent('Research token: CA Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump — dev la ai?'));
  await grokLinked.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.recent option[value^="sol:"]'), null, { timeout: 8000 });
  await grokLinked.evaluate(k => { const r = document.getElementById('noted-grok-host').shadowRoot; const sel = r.querySelector('.recent'); sel.value = k; sel.dispatchEvent(new Event('change')); }, EXTKEY);
  await grokLinked.waitForFunction(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.autochk'), null, { timeout: 5000 });
  assert(true, 'gắn tay xong vẫn có công tắc tự lưu (trước đây chỉ hiện khi tab mang prompt)');
  const g3ctx = await sw.evaluate(async () => { const all = await chrome.storage.session.get(null); const k = Object.keys(all).filter(x => x.startsWith('grok:')).sort((a, b) => all[b].at - all[a].at)[0]; return all[k]; });
  assert(g3ctx && !g3ctx.prompt && g3ctx.token.key === EXTKEY, 'tab này thật sự không có prompt kèm theo');
  await grokLinked.click('#send');
  await grokLinked.waitForFunction(() => { const s = document.getElementById('noted-grok-host').shadowRoot.querySelector('.status'); return s.classList.contains('ok') && s.textContent.includes('Auto-saved'); }, null, { timeout: 25000 });
  const ext2 = await sw.evaluate(async k => (await chrome.storage.local.get('p:' + k))['p:' + k], EXTKEY);
  assert(ext2.timeline.length === 2 && ext2.timeline[1].text.includes(grokMock.ANSWER_LI), 'tự lưu chạy nhờ neo vào địa chỉ contract trong câu hỏi');
  await grokLinked.close();

  console.log('14) Settings: template và đích research');
  await dash.click('#open-settings');
  await dash.waitForSelector('#settings:not([hidden])');
  assert((await dash.$eval('#research-template', e => e.value)).includes('PROJECT (write in full'), 'template mặc định hiện trong Settings');
  const tpls = await dash.evaluate(() => ({ en: NotedResearch.defaultTemplate('en'), vi: NotedResearch.defaultTemplate('vi'), zh: NotedResearch.defaultTemplate('zh') }));
  assert(tpls.en.includes('Answer in English') && tpls.vi.includes('Tiếng Việt.') && tpls.zh.includes('用中文回答'), 'có ba bản prompt mặc định en/vi/zh');
  assert(tpls.vi.includes('Không markdown ẩn link') && tpls.vi.includes('OUTPUT ĐÚNG THỨ TỰ:') && tpls.vi.includes('PROJECT (viết đầy đủ, theo đúng 6 mục này)') && tpls.vi.includes('6. Rủi ro thiết kế'), 'bản tiếng Việt đúng prompt mới: thứ tự output, 6 mục PROJECT, link đầy đủ');
  assert([tpls.en, tpls.vi, tpls.zh].every(x => x.split('\n').length === tpls.vi.split('\n').length && x.includes('${symbol}') && x.includes('{address}')), 'ba bản cùng cấu trúc, cùng placeholder');
  await dash.click('#settings-close');
  await sw.evaluate(async () => { const st = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...st, lang: 'vi' } }); });
  await dash.waitForTimeout(400);
  await dash.reload();
  await dash.waitForSelector('.card');
  await dash.click('#open-settings');
  await dash.waitForSelector('#settings:not([hidden])');
  assert((await dash.$eval('#research-template', e => e.value)).includes('Dùng X + web + docs + explorer. Tiếng Việt.'), 'đổi ngôn ngữ -> template mặc định đổi theo');
  await sw.evaluate(async () => { const st = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...st, lang: 'en' } }); });
  await dash.waitForTimeout(400);
  await dash.reload();
  await dash.waitForSelector('.card');
  await dash.click('#open-settings');
  await dash.waitForSelector('#settings:not([hidden])');
  await dash.fill('#research-template', 'Custom {symbol} {address} {mc}');
  await dash.selectOption('#research-target', 'grok');
  await dash.waitForTimeout(800);
  const st = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert(st.researchTemplate === 'Custom {symbol} {address} {mc}' && st.researchTarget === 'grok', 'template + đích được lưu');
  await dash.click('#settings-close');
  // Dashboard vừa được tải lại khi đổi ngôn ngữ nên phải chọn lại dự án trước khi bấm nút Grok.
  if (!(await dash.$('#editor-mount:not([hidden]) .ne-grok'))) {
    await dash.evaluate(() => [...document.querySelectorAll('.card')].find(c => c.textContent.includes('PROLOG')).click());
    await dash.waitForSelector('#editor-mount:not([hidden]) .ne-grok');
  }
  const grokPromise2 = ctx.waitForEvent('page');
  await dash.click('.ne-grok');
  const grok3 = await grokPromise2;
  await grok3.waitForTimeout(500);
  const gurl3 = (await grokUrlFor()).url;
  assert(gurl3.startsWith('https://grok.com/?q=Custom%20PROLOG%200xaa40'), 'dùng template tuỳ chỉnh và mở grok.com: ' + gurl3);
  await grok3.close();
  await dash.click('#open-settings');
  await dash.click('#template-reset');
  await dash.selectOption('#research-target', 'x');
  await dash.waitForTimeout(600);
  await dash.screenshot({ path: path.join(OUT, '7-settings.png') });

  console.log('15) DexScreener: pair -> token qua API, cùng khoá với gmgn');
  await sw.evaluate(async base => { const st = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...st, dexApiBase: base, ui: 'panel', lang: 'en' } }); }, dexApi.base);
  const dex = await ctx.newPage();
  dex.on('pageerror', e => console.log('DEX ERROR', e.message));
  await dex.goto('https://dexscreener.com/watchlist/abc12');
  await dex.waitForFunction(() => document.querySelectorAll('.noted-badge').length >= 6, null, { timeout: 15000 });
  const dbadges = await dex.$$eval('.noted-badge', els => els.map(b => ({ key: b.dataset.key, sym: b.dataset.symbol, prev: b.previousSibling && b.previousSibling.nodeValue && b.previousSibling.nodeValue.trim(), cls: b.className })));
  console.log('  dex badges:', dbadges.map(b => `${b.key} ${b.sym} after "${b.prev}"`).join(' | '));
  assert(dbadges.length === 6, 'chỉ 6 link pair/token được gắn nút (bỏ qua /watchlist, /gainers, /new-pairs)');
  const bE = dbadges.find(b => b.key === `hyperevm:${dexMock.TOKEN_E.toLowerCase()}`);
  assert(bE && bE.sym === 'HYPEY', 'slug chain trên URL khác chainId API -> vẫn nhận diện qua endpoint search');
  const bS = dbadges.find(b => b.key === `sui:${dexMock.TOKEN_S}`);
  assert(bS && bS.sym === 'SUIDOG', 'địa chỉ dạng Sui (0x + 64 hex) được chấp nhận');
  const bA = dbadges.find(b => b.key === `sol:${dexMock.MINT_A}`);
  assert(bA && bA.sym === 'BONKZ' && bA.prev === 'BONKZ', 'pair Solana -> token base (BONKZ), nút đặt ngay sau symbol');
  const bB = dbadges.find(b => b.key === `robinhood:${dexMock.PROLOG}`);
  assert(bB && bB.cls.includes('noted-badge--pin'), 'pair EVM -> PROLOG, trùng khoá với ghi chú tạo trên gmgn nên hiện trạng thái pin');
  const bC = dbadges.find(b => b.key === `sol:${dexMock.MINT_C}`);
  assert(bC && bC.cls.includes('noted-badge--has'), 'link theo địa chỉ token (không phải pair) -> tra endpoint tokens, khớp ghi chú EXTENSION');
  const bD = dbadges.find(b => b.key === `sol:${dexMock.MINT_D}`);
  assert(bD && bD.sym === 'DOGEY', 'cặp đảo (base là WSOL) -> lấy quote token DOGEY');
  await dex.hover(`.noted-badge[data-key="robinhood:${dexMock.PROLOG}"]`);
  await dex.waitForTimeout(200);
  assert((await shadowQ(dex, '.nd-tip')).includes('Launchpad'), 'tooltip trên DexScreener hiện tóm tắt ghi từ gmgn');
  await sw.evaluate(() => { chrome.runtime.onMessage.addListener((m, sender) => { if (m && m.type === 'noted:open' && sender.tab) globalThis.__dexTab = sender.tab.id; }); });
  await dex.click(`.noted-badge[data-key="robinhood:${dexMock.PROLOG}"]`);
  await dex.waitForTimeout(800);
  const dexTabId = await sw.evaluate(() => globalThis.__dexTab);
  const dsess = await sw.evaluate(async id => (await chrome.storage.session.get('tab:' + id))['tab:' + id], dexTabId);
  assert(dsess && dsess.token.key === `robinhood:${dexMock.PROLOG}` && dsess.ctx.symbol === 'PROLOG' && dsess.ctx.mc === '$10.64M', 'bấm nút: mở panel với symbol + MC từ API DexScreener');
  assert((await dex.evaluate(() => location.pathname)) === '/watchlist/abc12', 'bấm nút không điều hướng sang trang pair');
  await dex.setViewportSize({ width: 1280, height: 800 });
  await dex.screenshot({ path: path.join(OUT, '8-dexscreener.png') });
  await dex.goto('https://dexscreener.com/robinhood/0x1A2B3C00000000000000000000000000000000B2');
  await dex.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0 && f.textContent.includes('PROLOG'); }, null, { timeout: 15000 });
  assert(true, 'trang pair: FAB hiện PROLOG + tóm tắt');
  const pt = await sw.evaluate(async id => chrome.tabs.sendMessage(id, { type: 'noted:get-page-token' }), dexTabId);
  assert(pt && pt.token && pt.token.key === `robinhood:${dexMock.PROLOG}` && pt.symbol === 'PROLOG', 'popup/phím tắt lấy được token của trang pair');
  const cached = await sw.evaluate(async () => (await chrome.storage.local.get('dex:pairs'))['dex:pairs']);
  assert(cached && Object.keys(cached).length >= 6, 'mapping pair -> token được cache trong storage.local');
  await dex.close();

  console.log('16) Tìm kiếm trên X theo contract / $SYMBOL: nút nổi nhận ra token, lưu đoạn bôi đen kèm tên tài khoản');
  const xp = await ctx.newPage();
  xp.on('pageerror', e => console.log('X ERROR', e.message));
  // Không có quyền "tabs" nên ghi lại tab id từ sender của message thay vì query theo URL.
  await sw.evaluate(() => { chrome.runtime.onMessage.addListener((m, sender) => { if (m && m.type === 'noted:page-token' && sender.tab) globalThis.__xTab = sender.tab.id; }); });
  await xp.goto('https://x.com/search?q=0xaa40e79e987517f7462bf79315b8a118799b04e3&src=typed_query');
  await xp.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0; }, null, { timeout: 10000 });
  const fabX = await shadowQ(xp, '.nd-fab');
  assert(!fabX.includes('Research-Noted-Gmgn') && fabX.includes('PROLOG') && fabX.includes('Robinhood'), 'nhãn gọn "PROLOG · Robinhood", không còn tiền tố dài: ' + fabX.trim());
  assert((await xp.$$('.noted-badge')).length === 0 && (await xp.$$('.noted-x-btn')).length === 0, 'không có nút nào trên từng bài');
  const xTabId = await sw.evaluate(() => globalThis.__xTab);
  assert(typeof xTabId === 'number', 'background nhận token của trang tìm kiếm X từ content script');
  const ptx = await sw.evaluate(async id => chrome.tabs.sendMessage(id, { type: 'noted:get-page-token' }), xTabId);
  assert(ptx && ptx.token && ptx.token.key === PROLOG, 'popup/phím tắt/side panel nhận đúng token của trang tìm kiếm');
  // Mở sẵn ghi chú (như khi người dùng đã bấm nút token trước đó), rồi mới bôi đen và lưu.
  await xp.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await xp.waitForTimeout(800);
  const livePanel = await ctx.newPage();
  await livePanel.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${xTabId}`);
  await livePanel.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  const beforeCount = await livePanel.$$eval('.ne-entry', els => els.length);
  await xp.bringToFront();

  // bôi đen chữ trong bài của @hoangtrank
  await xp.evaluate(() => { const el = document.querySelector('article [data-testid="tweetText"]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await xp.waitForFunction(() => { const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel'); return b && b.getClientRects().length > 0; }, null, { timeout: 5000 });
  assert((await shadowQ(xp, '.nd-sel')).includes('PROLOG'), 'bôi đen -> hiện nút "Save selection → PROLOG"');
  const selPos = await xp.evaluate(() => {
    const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getBoundingClientRect();
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    return { dx: Math.round(b.left - r.left), dy: Math.round(b.top - r.bottom) };
  });
  assert(Math.abs(selPos.dx) < 40 && selPos.dy >= 0 && selPos.dy < 40, `nút bám ngay dưới vùng bôi đen (lệch ${selPos.dx}px, cách ${selPos.dy}px)`);
  await xp.setViewportSize({ width: 1280, height: 800 });
  await xp.screenshot({ path: path.join(OUT, '9-x-search.png') });
  await xp.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').click());
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-toast').classList.contains('show'), null, { timeout: 5000 });
  const selEntries = (await sw.evaluate(async k => (await chrome.storage.local.get('p:' + k))['p:' + k], PROLOG)).timeline.filter(e => e.source === 'x');
  assert(selEntries.length === 1 && selEntries[0].type === 'research' && selEntries[0].text.startsWith('@hoangtrank: đây là dự án ngon') && selEntries[0].text.includes('Source: https://x.com/hoangtrank/status/1900000000000000011'), 'mốc lưu "@hoangtrank: <đoạn bôi đen>" kèm link bài: ' + selEntries[0].text.split('\n')[0]);
  // Panel đang mở sẵn phải tự hiện mốc mới, không cần tắt/bật lại.
  await livePanel.waitForFunction(n => document.querySelectorAll('.ne-entry').length === n + 1, beforeCount, { timeout: 8000 });
  assert(await livePanel.$eval('.ne-entry--new .ne-etext', e => e.textContent.includes('@hoangtrank')), 'panel ĐANG MỞ tự hiện mốc vừa lưu (không phải tắt/bật lại)');
  await livePanel.close();
  const sess = await sw.evaluate(async id => (await chrome.storage.session.get('tab:' + id))['tab:' + id], xTabId);
  assert(sess && sess.token.key === PROLOG && sess.ctx.highlight === selEntries[0].id, 'lưu xong: side panel của tab trỏ đúng dự án và mốc vừa lưu');
  const panelX = await ctx.newPage();
  await panelX.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${xTabId}`);
  await panelX.waitForSelector('#mount:not([hidden]) .ne-entry--new', { timeout: 8000 });
  assert((await panelX.$eval('.ne-entry--new .ne-etext', e => e.textContent)).includes('@hoangtrank'), 'side panel mở sẵn và tô sáng mốc vừa lưu');
  const at = await panelX.$eval('.ne-entry--new .ne-etext .ne-at', e => [e.textContent, getComputedStyle(e).color]);
  assert(at[0] === '@hoangtrank' && at[1] === 'rgb(248, 113, 113)', `tên tài khoản hiển thị màu đỏ: ${at[0]} ${at[1]}`);
  await panelX.close();
  console.log('16b) Vòng đời nút "Lưu đoạn bôi đen"');
  const selBtn = (prop = 'hidden') => xp.evaluate(p => { const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel'); return p === 'cls' ? b.className : b[p]; }, prop);
  const pickPost = i => xp.evaluate(n => { const el = document.querySelectorAll('article [data-testid="tweetText"]')[n]; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, i);
  await pickPost(1);
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length > 0, null, { timeout: 5000 });
  await xp.evaluate(() => getSelection().removeAllRanges());
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length === 0, null, { timeout: 5000 });
  assert(true, 'bỏ bôi đen thì nút lưu tự ẩn');
  await pickPost(1);
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length > 0, null, { timeout: 5000 });
  await xp.mouse.click(60, 700);
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length === 0, null, { timeout: 5000 });
  assert(true, 'bấm ra ngoài thì nút lưu tự ẩn');
  await pickPost(1);
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length > 0, null, { timeout: 5000 });
  // Bôi đen co lại còn 2 ký tự: nút phải biến mất, nếu không bấm vào sẽ lưu nhầm đoạn bôi đen cũ.
  await xp.evaluate(() => {
    const el = document.querySelectorAll('article [data-testid="tweetText"]')[1];
    const node = el.firstChild; const r = document.createRange();
    r.setStart(node, 0); r.setEnd(node, 2);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length === 0, null, { timeout: 5000 });
  assert(true, 'bôi đen còn quá ngắn thì nút cũng tự ẩn (không giữ lại đoạn cũ)');
  await xp.evaluate(() => getSelection().removeAllRanges());

  console.log('16c) Panel tự bắt token của tab, và mốc mới hiện ngay');
  // Tab không có token (trang chủ X, tab mới…): panel hiện token xem gần nhất, không phải màn hình trống.
  await xp.bringToFront();
  await xp.reload();
  await xp.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0; }, null, { timeout: 8000 });
  let last = null;
  for (let i = 0; i < 25 && !(last && last.token && last.token.key === PROLOG); i++) { last = await sw.evaluate(async () => (await chrome.storage.local.get('lastToken')).lastToken || null); await xp.waitForTimeout(200); }
  assert(last && last.token && last.token.key === PROLOG, 'background nhớ token xem gần nhất: ' + (last && last.token && last.token.key));
  const panelNoTab = await ctx.newPage();
  await panelNoTab.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=999999`);
  await panelNoTab.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  assert((await panelNoTab.$eval('.ne-symbol', e => e.value)) === 'PROLOG', 'tab không có token -> panel hiện token xem gần nhất');
  assert((await panelNoTab.evaluate(() => document.querySelector('#empty').getClientRects().length)) === 0, 'và không còn màn hình trống');
  await panelNoTab.close();
  await sw.evaluate(async () => { await chrome.storage.local.remove('lastToken'); lastSeen = ''; });
  const panelFresh = await ctx.newPage();
  await panelFresh.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=999999`);
  await panelFresh.waitForSelector('#empty:not([hidden])', { timeout: 8000 });
  assert((await panelFresh.evaluate(() => document.querySelector('#empty').getClientRects().length)) > 0, 'chưa từng xem token nào -> vẫn là màn hình trống');
  await panelFresh.close();
  await sw.evaluate(async id => chrome.storage.session.remove('tab:' + id), xTabId);
  const panelEmpty = await ctx.newPage();
  await panelEmpty.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${xTabId}`);
  await panelEmpty.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  assert((await panelEmpty.$eval('.ne-symbol', e => e.value)) === 'PROLOG', 'chưa có phiên cho tab -> panel hỏi thẳng trang và hiện đúng dự án');
  await xp.bringToFront();
  await pickPost(1);
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length > 0, null, { timeout: 5000 });
  await xp.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').click());
  await xp.waitForFunction(() => { const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel'); return b.getClientRects().length > 0 && b.className.includes('ok'); }, null, { timeout: 8000 });
  assert((await selBtn('textContent')).startsWith('✓'), 'lưu xong hiện xác nhận ✓ ngay tại chỗ bôi đen');
  await panelEmpty.waitForSelector('#mount:not([hidden]) .ne-entry--new', { timeout: 8000 });
  assert((await panelEmpty.$eval('.ne-entry--new .ne-etext', e => e.textContent)).includes('Big partnership'), 'panel đang rỗng cũng tự hiện mốc mới');
  await panelEmpty.close();
  await xp.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').getClientRects().length === 0, null, { timeout: 5000 });
  assert(true, 'xác nhận tự ẩn sau khoảng 2 giây');
  const selBox = await xp.evaluate(() => {
    const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel');
    return { rects: b.getClientRects().length, display: getComputedStyle(b).display, cls: b.className };
  });
  assert(selBox.rects === 0 && selBox.display === 'none', 'nút biến mất hẳn khỏi màn hình, không phải chỉ đổi màu: ' + JSON.stringify(selBox));
  console.log('16d) Bấm nút nổi lần hai: tắt side panel của tab');
  const panelEnabled = async () => sw.evaluate(async id => (await chrome.sidePanel.getOptions({ tabId: id })).enabled, xTabId);
  const clickFab = () => xp.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await sw.evaluate(async id => chrome.sidePanel.setOptions({ tabId: id, enabled: true, path: 'src/panel/panel.html' }), xTabId);
  await xp.bringToFront();
  // Chạy có giao diện: dùng chính side panel thật. Chạy headless: Chrome không mở được side panel,
  // nên mở trang panel như một tab thường — nó cũng báo trạng thái về background đúng như panel thật.
  let panelOpen = null;
  const showingHere = () => sw.evaluate(async id => !!([...panelState.values()].find(x => x.tabId === id) && panelWindows.size), xTabId);
  const waitShowing = async want => { for (let i = 0; i < 60; i++) { if ((await showingHere()) === want) return true; await xp.waitForTimeout(100); } return false; };
  if (panelLive) {
    // Panel thật có thể đang mở sẵn từ bước trước: chỉ bấm mở khi nó chưa hiện token của tab này,
    // nếu không cú bấm "mở" lại chính là cú đóng.
    if (!(await showingHere())) {
      await clickFab();
      assert(await waitShowing(true), 'mở side panel thật cho tab đang xem');
    }
  } else {
    panelOpen = await ctx.newPage();
    await panelOpen.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${xTabId}`);
    await panelOpen.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
    await panelOpen.waitForTimeout(400);
    await xp.bringToFront();
  }
  await clickFab();
  await xp.waitForTimeout(700);
  assert((await panelEnabled()) === false, 'panel đang hiện đúng token -> bấm lần hai tắt panel của tab');
  if (panelOpen) { await panelOpen.close(); await xp.waitForTimeout(400); }  // panel đóng: port ngắt, background biết không còn panel nào
  await clickFab();
  await xp.waitForTimeout(1200);
  assert((await panelEnabled()) === true, 'bấm lần ba mở lại panel cho tab');
  if (await xp.evaluate(() => !document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer')?.hidden)) await xp.keyboard.press('Escape');

  const selCount = (await sw.evaluate(async k => (await chrome.storage.local.get('p:' + k))['p:' + k], PROLOG)).timeline.filter(e => e.source === 'x').length;
  assert(selCount === 2, 'hai đoạn bôi đen đã lưu thành hai mốc: ' + selCount);
  await xp.goto('https://x.com/search?q=%24EXTENSION&f=live');
  await xp.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0 && f.textContent.includes('EXTENSION'); }, null, { timeout: 10000 });
  assert(true, 'tìm theo $SYMBOL cũng nhận ra dự án đã ghi chú');
  await xp.goto(`https://x.com/search?q=${dexMock.MINT_A}`);
  await xp.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && f.getClientRects().length > 0 && f.textContent.includes('BONKZ'); }, null, { timeout: 15000 });
  const fabNew = (await shadowQ(xp, '.nd-fab')).replace(/\s+/g, ' ').trim();
  assert(/^📝 ?Note ?BONKZ ?Solana$/.test(fabNew), 'địa chỉ chưa có ghi chú -> nhãn gọn "📝 Note BONKZ Solana", bấm là tạo ghi chú mới: ' + fabNew);
  await xp.goto('https://x.com/search?q=hello%20world');
  await xp.waitForTimeout(1200);
  assert(await xp.evaluate(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return !f || f.getClientRects().length === 0; }), 'tìm kiếm không liên quan -> không hiện gì');
  await xp.close();
  dexApi.server.close();

  console.log('17) Cỡ chữ: mặc định lớn hơn, chỉnh được ngay trong bảng ghi chú, áp cho cả dashboard');
  const fpanel = await ctx.newPage();
  await fpanel.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${gmgnTabId}`);
  await fpanel.waitForSelector('#mount:not([hidden]) .ne-summary', { timeout: 8000 });
  const fsOf = (pg, sel) => pg.$eval(sel, el => getComputedStyle(el).fontSize);
  assert((await fsOf(fpanel, '.ne-summary')) === '14px', 'mặc định 14px (trước đây 13px): ' + (await fsOf(fpanel, '.ne-summary')));
  assert((await fsOf(fpanel, '.ne-foot')) === '12px', 'chữ nhỏ trong chân bảng cũng lên theo: ' + (await fsOf(fpanel, '.ne-foot')));
  await fpanel.click('.ne-fs-up');
  await fpanel.waitForFunction(() => getComputedStyle(document.querySelector('.ne-summary')).fontSize === '15px', null, { timeout: 4000 });
  assert((await fpanel.$eval('.ne-fsval', e => e.textContent)) === '15', 'A+ tăng một bậc và hiện số đang dùng');
  assert((await fsOf(fpanel, '.ne-symbol')) === '20px', 'tiêu đề giãn theo đúng tỉ lệ cũ: ' + (await fsOf(fpanel, '.ne-symbol')));
  assert((await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.fontSize)) === 15, 'cỡ chữ được lưu vào settings');
  const fdash = await ctx.newPage();
  await fdash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await fdash.waitForSelector('.card');
  assert((await fsOf(fdash, 'body')) === '15px', 'dashboard dùng chung cỡ chữ: ' + (await fsOf(fdash, 'body')));
  await fdash.click('#open-settings');
  await fdash.waitForSelector('#settings:not([hidden])');
  assert((await fdash.$eval('#font-size', e => e.value)) === '15', 'Settings hiện đúng cỡ đang dùng');
  await fdash.selectOption('#font-size', '17');
  await fpanel.waitForFunction(() => getComputedStyle(document.querySelector('.ne-summary')).fontSize === '17px', null, { timeout: 4000 });
  assert(true, 'đổi trong Settings thì bảng ghi chú đang mở đổi theo ngay');
  await fpanel.evaluate(() => { for (let i = 0; i < 12; i++) document.querySelector('.ne-fs-up').click(); });
  await fpanel.waitForTimeout(600);
  assert((await fpanel.$eval('.ne-fsval', e => e.textContent)) === '22', 'chặn trần ở 22px: ' + (await fpanel.$eval('.ne-fsval', e => e.textContent)));
  assert((await fpanel.$eval('.ne-fs-up', e => e.disabled)) === true, 'chạm trần thì mờ nút A+');
  await fdash.selectOption('#font-size', '14');
  await fpanel.waitForFunction(() => getComputedStyle(document.querySelector('.ne-summary')).fontSize === '14px', null, { timeout: 4000 });
  assert(true, 'đặt lại về mặc định');
  await fdash.close();
  await fpanel.close();

  console.log('18) Panel của cửa sổ chỉ bám theo tab đang nhìn: Grok tự lưu ở tab nền không được lật panel sang token khác');
  // Tình huống thật: research token A bằng Grok, trong lúc Grok trả lời thì chuyển sang xem token B. Khi Grok
  // xong và tự lưu (cho A), panel phải vẫn là B — nếu lật sang A, người dùng sẽ gõ ghi chú của B vào A.
  const TOKEN_A = 'robinhood:0x5555555555555555555555555555555555555555';
  const grokOf = async k => ((await sw.evaluate(async key => (await chrome.storage.local.get('p:' + key))['p:' + key] || null, k)) || { timeline: [] }).timeline.filter(e => e.source === 'grok');
  const TOKEN_B = 'robinhood:0x2222222222222222222222222222222222222222';
  for (const pg of ctx.pages()) if (pg !== page) await pg.close().catch(() => {});
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'panel', follow: true, grokAutoSave: true, researchTarget: 'x', lang: 'en' } }));
  await page.goto('https://gmgn.ai/robinhood/token/0x5555555555555555555555555555555555555555');
  await page.waitForFunction(() => document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab')?.getClientRects().length > 0, null, { timeout: 8000 });
  const wpanel = await ctx.newPage();                       // không có ?tab=: hành xử như side panel thật của cửa sổ
  await wpanel.goto(`chrome-extension://${extId}/src/panel/panel.html`);
  await page.bringToFront();
  const winTabId = await sw.evaluate(() => [...pageTokens.entries()].find(([, t]) => t.key.endsWith('5555'))[0]);
  await sw.evaluate(async t => { const tab = await chrome.tabs.get(t); await remember(t, validToken({ chain: 'robinhood', address: '0x5555555555555555555555555555555555555555' }), { symbol: '' }, tab.windowId); }, winTabId);
  await wpanel.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 8000 });
  const wstate = () => wpanel.evaluate(() => ({ symbol: document.querySelector('.ne-symbol').value, addr: document.querySelector('.ne-addr code').title }));
  assert((await wstate()).addr.endsWith('5555'), 'panel của cửa sổ hiện token A của tab đang nhìn');
  const beforeGrok = (await grokOf(TOKEN_A)).length;
  const pagesBefore = new Set(ctx.pages());
  await wpanel.evaluate(() => document.querySelector('.ne-grok').click());
  await wpanel.waitForTimeout(1200);
  const bgGrok = ctx.pages().find(pg => !pagesBefore.has(pg));
  await bgGrok.goto((await grokUrlFor()).url);
  await bgGrok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  await bgGrok.click('#send');
  await page.bringToFront();
  await page.goto('https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222');
  await wpanel.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('2222'), null, { timeout: 8000 });
  assert(true, 'chuyển sang token B -> panel theo sang B');
  for (let i = 0; i < 60 && (await grokOf(TOKEN_A)).length === beforeGrok; i++) await page.waitForTimeout(500);
  assert((await grokOf(TOKEN_A)).length === beforeGrok + 1, 'Grok ở tab nền tự lưu câu trả lời vào đúng token A');
  await page.waitForTimeout(1500);
  assert((await wstate()).addr.endsWith('2222'), 'panel VẪN là token B (tab đang nhìn), không bị lật sang A: ' + (await wstate()).addr.slice(0, 8));
  assert((await grokOf(TOKEN_B)).length === 0, 'token B không nhận mốc Grok nào của A');
  assert((await sw.evaluate(async () => (await chrome.storage.local.get('lastToken')).lastToken.token.key)) === TOKEN_B, 'token xem gần nhất là B, tab nền không ghi đè');
  await bgGrok.bringToFront();
  await wpanel.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('5555') && document.querySelector('.ne-entry--new'), null, { timeout: 8000 });
  assert(true, 'đổi sang tab Grok thì panel hiện A với mốc vừa tự lưu');

  console.log('18b) Symbol đến muộn (title của gmgn đổi sau URL) vẫn được điền vào panel');
  await page.bringToFront();
  await wpanel.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('2222'), null, { timeout: 8000 });
  const lateTab = await sw.evaluate(() => [...pageTokens.entries()].find(([, t]) => t.key.endsWith('2222'))[0]);
  const LATE = { chain: 'robinhood', address: '0x3333333333333333333333333333333333333333' };
  const sendLate = symbol => sw.evaluate(async ([t, tk, sym]) => { const tab = await chrome.tabs.get(t); await remember(t, validToken(tk), { symbol: sym }, tab.windowId); }, [lateTab, LATE, symbol]);
  await sendLate('');
  await wpanel.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('3333'), null, { timeout: 8000 });
  assert((await wstate()).symbol === '', 'lần báo đầu chưa có symbol -> ô symbol còn trống');
  await sendLate('LATE');
  await wpanel.waitForFunction(() => document.querySelector('.ne-symbol').value === 'LATE', null, { timeout: 5000 });
  assert(true, 'lần báo sau có symbol -> panel điền vào, không cần mở lại');
  assert((await sw.evaluate(async () => (await chrome.storage.local.get('p:robinhood:0x3333333333333333333333333333333333333333'))['p:robinhood:0x3333333333333333333333333333333333333333'] || null)) === null, 'chỉ xem thôi thì không tự tạo ghi chú');
  await wpanel.evaluate(() => { const el = document.querySelector('.ne-symbol'); el.focus(); el.value = 'MINE'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sendLate('OTHER');
  await wpanel.waitForTimeout(800);
  assert((await wstate()).symbol === 'MINE', 'symbol người dùng tự gõ không bị ghi đè');
  await wpanel.close();

  console.log('19) X mở lại cuộc trò chuyện CŨ, không điền prompt: không được lưu câu trả lời cũ vào token đang research');
  const wpanel2 = await ctx.newPage();
  await wpanel2.goto(`chrome-extension://${extId}/src/panel/panel.html`);
  await page.bringToFront();
  await page.goto('https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222');
  await wpanel2.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('2222'), null, { timeout: 8000 });
  const beforeStale = new Set(ctx.pages());
  await wpanel2.evaluate(() => document.querySelector('.ne-grok').click());
  await wpanel2.waitForTimeout(1200);
  const staleGrok = ctx.pages().find(pg => !beforeStale.has(pg));
  await staleGrok.goto('https://x.com/i/grok?stale=1');
  await staleGrok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  await staleGrok.waitForTimeout(8000);   // dư thời gian cho tự lưu chạy (3 s đứng yên + chu kỳ 2 s)
  assert((await grokOf(TOKEN_B)).length === 0, 'câu trả lời của cuộc trò chuyện cũ (token khác) KHÔNG bị lưu vào token B');
  assert(/contract/i.test(await staleGrok.evaluate(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.autostat').textContent)), 'dòng trạng thái nói rõ đang chờ thấy contract của token này');
  // Người dùng dán prompt của B vào rồi gửi: lúc này mới lưu, và chỉ lưu câu trả lời SAU câu hỏi của B.
  const promptB = (await sw.evaluate(async () => { const all = await chrome.storage.session.get(null); return Object.entries(all).filter(([k]) => k.startsWith('grok:')).map(([, v]) => v).sort((a, b) => b.at - a.at)[0].prompt; }));
  assert(promptB.includes('0x2222222222222222222222222222222222222222'), 'tab Grok mang đúng prompt của token B');
  await staleGrok.evaluate(t => { document.getElementById('composer').textContent = t; }, promptB);
  await staleGrok.click('#send');
  for (let i = 0; i < 60 && (await grokOf(TOKEN_B)).length === 0; i++) await staleGrok.waitForTimeout(500);
  const savedB = await grokOf(TOKEN_B);
  assert(savedB.length === 1 && savedB[0].text.includes(grokMock.ANSWER_P1) && !savedB[0].text.includes('OLDTOKEN'), 'gửi prompt của B rồi thì lưu đúng câu trả lời mới, không lẫn cuộc trò chuyện cũ');
  await staleGrok.close();

  console.log('19a) DOM như X thật: prompt nhiều đoạn, Grok "suy nghĩ" rồi ngừng 5 s, hàng nút chỉ hiện khi xong');
  const TOKEN_X = 'robinhood:0x4444444444444444444444444444444444444444';
  await page.bringToFront();
  await page.goto('https://gmgn.ai/robinhood/token/0x4444444444444444444444444444444444444444');
  await wpanel2.waitForFunction(() => document.querySelector('.ne-addr code')?.title.endsWith('4444'), null, { timeout: 8000 });
  const beforeX = new Set(ctx.pages());
  await wpanel2.evaluate(() => document.querySelector('.ne-grok').click());
  await wpanel2.waitForTimeout(1200);
  const xGrok = ctx.pages().find(pg => !beforeX.has(pg));
  await xGrok.goto((await grokUrlFor()).url + '&shape=x');
  await xGrok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  assert((await xGrok.$eval('#composer', e => e.innerText)).includes('PROJECT (write in full'), 'ô nhập nhận đủ prompt dài');
  await xGrok.click('#send');
  assert((await xGrok.evaluate(() => document.querySelectorAll('.msg.user .paras > span').length)) >= 8, 'prompt hiện thành nhiều đoạn trong một tin nhắn, như X thật');
  await xGrok.waitForTimeout(4600);   // đang ở quãng ngừng 5 s giữa các bước suy nghĩ: chữ đã đứng yên hơn 3 s
  assert((await grokOf(TOKEN_X)).length === 0, 'Grok còn đang suy nghĩ (chưa có hàng nút) -> CHƯA lưu gì, dù chữ đứng yên hơn 3 s');
  for (let i = 0; i < 60 && (await grokOf(TOKEN_X)).length === 0; i++) await xGrok.waitForTimeout(500);
  await xGrok.waitForTimeout(5000);   // chờ thêm xem có lưu lần hai không
  const xSaved = await grokOf(TOKEN_X);
  assert(xSaved.length === 1, 'trả lời xong thì lưu đúng MỘT mốc: ' + xSaved.length);
  assert(xSaved[0].text.startsWith('DEV') && xSaved[0].text.includes('not a meme'), 'mốc bắt đầu từ DEV và đủ tới hết câu trả lời');
  assert(!xSaved[0].text.includes('I will check the explorer') && !xSaved[0].text.includes('checking GitHub'), 'không dính các bước "đang suy nghĩ" ở đầu');
  assert(!xSaved[0].text.includes('MEME (only if it is a meme') && !xSaved[0].text.includes('OUTPUT IN EXACTLY'), 'không lưu nhầm các đoạn sau của chính prompt');
  await xGrok.close();

  console.log('19b) Đổi token dồn dập: editor và panel không được lệch nhau (chữ gõ sẽ vào nhầm dự án)');
  await page.bringToFront();
  const raceTab = await sw.evaluate(() => [...pageTokens.entries()].find(([, t]) => t.key.endsWith('4444'))[0]);
  const RACE = ['0x6666666666666666666666666666666666666666', '0x7777777777777777777777777777777777777777', '0x8888888888888888888888888888888888888888'];
  let mismatches = 0;
  for (let i = 0; i < 18; i++) {
    const a = RACE[i % 3], b = RACE[(i + 1) % 3];
    // lần đầu không có symbol (panel phải hỏi trang -> chậm), lần sau có symbol (nhanh): lần chậm không được đè lần nhanh
    await sw.evaluate(async ([t, x, y, gap]) => {
      const ti = await chrome.tabs.get(t);
      const p1 = remember(t, validToken({ chain: 'robinhood', address: x }), { symbol: '' }, ti.windowId);
      await new Promise(r => setTimeout(r, gap));
      await Promise.all([p1, remember(t, validToken({ chain: 'robinhood', address: y }), { symbol: 'S' + y.slice(2, 4) }, ti.windowId)]);
    }, [raceTab, a, b, (i % 4) * 5]);
    await wpanel2.waitForTimeout(600);
    const shown = await wpanel2.evaluate(() => document.querySelector('.ne-addr code').title);
    const believed = await sw.evaluate(() => [...panelState.values()].map(v => v.key).join(','));
    if (shown !== b || !believed.includes(b)) mismatches++;
  }
  assert(mismatches === 0, 'sau 18 lần đổi token sát nhau, editor luôn hiện đúng token panel đang giữ (lệch: ' + mismatches + ')');
  await wpanel2.close();

  console.log('20) Link giới thiệu gmgn.ai: có ở ba nơi, đúng địa chỉ; ô "kèm ảnh" chỉ hiện khi có ảnh');
  const INVITE = 'https://gmgn.ai/r/ZCSRo81H?chain=robinhood';
  const inviteOn = async (pg) => pg.evaluate(() => { const a = document.querySelector('a[data-gmgn-invite]'); return a ? { href: a.href, target: a.target, rel: a.rel, text: a.textContent.trim(), labels: document.querySelectorAll('.gmgn-new .ref').length, shown: a.getClientRects().length > 0 } : null; });
  await sw.evaluate(async () => { await chrome.storage.local.remove('lastToken'); lastSeen = ''; });
  const ipanel = await ctx.newPage();
  await ipanel.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=999999`);
  await ipanel.waitForSelector('#empty:not([hidden])', { timeout: 8000 });
  const ip = await inviteOn(ipanel);
  assert(ip && ip.href === INVITE && ip.shown && ip.target === '_blank' && /noopener/.test(ip.rel), 'panel trống có link gmgn đúng địa chỉ, mở tab mới');
  assert(ip.text.length > 5 && ip.labels === 0, 'link có chữ, không gắn nhãn phụ bên cạnh');
  await ipanel.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await ipanel.waitForTimeout(500);
  const ipop = await inviteOn(ipanel);
  assert(ipop && ipop.href === INVITE && ipop.shown && ipop.labels === 0, 'popup có link gmgn');
  await ipanel.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await ipanel.waitForSelector('#empty', { timeout: 8000 });
  const idash = await inviteOn(ipanel);
  assert(idash && idash.href === INVITE && idash.labels === 0, 'Dashboard (màn hình chưa chọn dự án) có link gmgn');
  const imgKeys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter(k => k.startsWith('img:')).length);
  await ipanel.click('#open-settings');
  await ipanel.waitForSelector('#settings:not([hidden])');
  await ipanel.waitForTimeout(400);
  const imgRowShown = await ipanel.evaluate(() => document.querySelector('#export-images').closest('label').getClientRects().length > 0);
  assert(imgRowShown === (imgKeys > 0), `ô "kèm ảnh khi export" ${imgKeys > 0 ? 'hiện vì có' : 'ẩn vì không có'} ảnh trong ghi chú (${imgKeys})`);
  await ipanel.close();

  console.log('21) Dashboard: thẻ không có tóm tắt không bị độn khoảng trống; cửa sổ hẹp đi theo luồng danh sách -> ghi chú -> quay lại');
  await sw.evaluate(async () => { for (const [a, sym] of [['0x9191919191919191919191919191919191919191', 'NOSUM'], ['0x9292929292929292929292929292929292929292', 'BLANK']]) { const p = NotedStore.emptyProject('robinhood', a, { symbol: sym }); p.symbol = sym; if (sym === 'NOSUM') p.timeline.push(NotedStore.newEntry('note', 'Mốc mới nhất dùng làm dòng xem trước')); await NotedStore.save(p); } });
  const ddash = await ctx.newPage();
  await ddash.setViewportSize({ width: 1180, height: 800 });
  await ddash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await ddash.waitForSelector('.card');
  const dcards = await ddash.evaluate(() => Object.fromEntries([...document.querySelectorAll('.card')].map(c => [c.querySelector('.card-sym').textContent, { h: Math.round(c.getBoundingClientRect().height), sum: c.querySelector('.card-sum').textContent, align: getComputedStyle(c.querySelector('.card-sum')).textAlign, pad: getComputedStyle(c.querySelector('.card-sum')).paddingTop }])));
  assert(dcards.BLANK && dcards.BLANK.h < 90 && dcards.BLANK.pad === '0px' && dcards.BLANK.align !== 'center', 'thẻ chưa có tóm tắt cao ' + (dcards.BLANK && dcards.BLANK.h) + 'px, không bị căn giữa hay độn lề (trước đây dính CSS của màn hình trống)');
  assert(dcards.NOSUM && dcards.NOSUM.sum.includes('Mốc mới nhất dùng làm dòng xem trước'), 'chưa có tóm tắt thì thẻ hiện mốc mới nhất');
  const foot = await ddash.evaluate(() => [...document.querySelectorAll('.side-foot button')].map(b => Math.round(b.getBoundingClientRect().width)));
  assert(foot[0] > foot[1] * 1.8 && Math.abs(foot[1] - foot[2]) <= 2 && Math.abs(foot[3] - foot[4]) <= 2, 'hàng nút cuối cân đối: nút chính trọn hàng, bốn nút phụ bằng nhau: ' + foot.join(','));
  await ddash.setViewportSize({ width: 380, height: 800 });
  await ddash.waitForTimeout(300);
  const narrow = () => ddash.evaluate(() => ({ side: document.querySelector('.side').getClientRects().length > 0, main: document.querySelector('.main').getClientRects().length > 0, back: document.querySelector('#back-list').getClientRects().length > 0, listH: Math.round(document.querySelector('#list').getBoundingClientRect().height) }));
  let nv = await narrow();
  assert(nv.side && !nv.main && nv.listH > 350, 'cửa sổ hẹp, chưa chọn dự án: danh sách chiếm trọn chiều cao (' + nv.listH + 'px), không còn nửa màn hình trống');
  await ddash.click('.card >> nth=0');
  await ddash.waitForSelector('.ne-symbol');
  nv = await narrow();
  assert(!nv.side && nv.main && nv.back, 'chọn một dự án: bảng ghi chú chiếm trọn, có nút quay lại');
  await ddash.click('#back-list');
  await ddash.waitForTimeout(400);
  nv = await narrow();
  assert(nv.side && !nv.main, 'bấm quay lại: về danh sách');
  await ddash.close();

  console.log('21b) Settings: khôi phục bản sao lưu tự động');
  const bdash = await ctx.newPage();
  await bdash.setViewportSize({ width: 1180, height: 800 });
  await bdash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await bdash.waitForSelector('.card');
  const BK = 'robinhood:0x9191919191919191919191919191919191919191';
  const bkTs = await bdash.evaluate(() => NotedStore.createBackup('import'));
  assert(bkTs > 0, 'có một bản sao lưu');
  await bdash.evaluate(async k => { await NotedStore.remove(k); }, BK);
  assert((await bdash.evaluate(k => NotedStore.get(k), BK)) === null, 'xoá nhầm một dự án sau khi đã có bản sao lưu');
  await bdash.click('#open-settings');
  await bdash.waitForFunction(() => document.querySelector('#backup-list').options.length > 0 && document.querySelector('#backup-list').value !== '');
  assert(/project/i.test(await bdash.$eval('#backup-list', e => e.options[0].textContent)), 'Settings liệt kê bản sao lưu: ' + (await bdash.$eval('#backup-list', e => e.options[0].textContent)));
  bdash.once('dialog', d => d.accept());
  await bdash.click('#backup-restore');
  await bdash.waitForFunction(() => /Restored \d+ projects/.test(document.querySelector('#settings-saved').textContent), null, { timeout: 8000 });
  const back = await bdash.evaluate(k => NotedStore.get(k), BK);
  assert(back && back.symbol === 'NOSUM' && back.timeline.length === 1, 'bấm Khôi phục: dự án đã xoá quay lại đủ nội dung');
  assert((await bdash.evaluate(() => NotedStore.listBackups())).some(b => b.reason === 'before-restore'), 'trước khi khôi phục, trạng thái hiện tại cũng được sao lưu (khôi phục nhầm vẫn quay lại được)');
  await bdash.close();

  console.log('22) Reload extension khi trang còn mở: content script cũ không ném lỗi, mà bảo người dùng tải lại trang (PHẢI là mục cuối)');
  for (const pg of ctx.pages()) if (pg !== page) await pg.close().catch(() => {});
  const oErrs = [];
  page.on('pageerror', e => oErrs.push('gmgn: ' + e.message));
  await page.goto('https://gmgn.ai/robinhood/token/0x4444444444444444444444444444444444444444');
  await page.waitForFunction(() => document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab')?.getClientRects().length > 0, null, { timeout: 8000 });
  const oGrok = await ctx.newPage();
  oGrok.on('pageerror', e => oErrs.push('grok: ' + e.message));
  const oTab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const oUrl = await sw.evaluate(async tabId => { const ADDR = '0x4545454545454545454545454545454545454545'; const prompt = NotedResearch.buildPrompt(NotedResearch.TEMPLATES.en, { symbol: 'ORPH', chain: 'Robinhood', address: ADDR, name: '', mc: '$1M' }); await chrome.storage.session.set({ ['grok:' + tabId]: { token: { chain: 'robinhood', address: ADDR, key: 'robinhood:' + ADDR }, symbol: 'ORPH', prompt, at: Date.now() } }); return NotedResearch.urlFor('x', prompt); }, oTab);
  await oGrok.goto(oUrl + '&shape=x');
  await oGrok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 8000 });
  await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await page.waitForTimeout(2500);
  await oGrok.click('#send');                 // Grok trả lời: vòng tự lưu của script cũ sẽ muốn gọi sendMessage
  await page.bringToFront();
  await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await page.waitForTimeout(300);
  const oToast = await page.evaluate(() => { const el = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-toast'); return { text: el ? el.textContent : '', shown: !!el && el.classList.contains('show') }; });
  assert(oToast.shown && /reload this page/i.test(oToast.text), 'bấm nút nổi sau khi extension reload: hiện lời nhắc tải lại trang — ' + oToast.text);
  await page.waitForTimeout(13000);
  const oStatus = await oGrok.evaluate(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.status').textContent);
  assert(/reload this page/i.test(oStatus), 'panel trên Grok cũng nhắc tải lại trang thay vì lặng lẽ hỏng');
  assert(oErrs.length === 0, 'không có lỗi "Extension context invalidated" nào bị ném ra trang: ' + JSON.stringify(oErrs));

  await ctx.close();
  console.log('\nALL PASSED');
})().catch(async e => { console.error(e); process.exit(1); });
