// Nạp extension thật vào Chromium (Playwright), chặn mọi request tới gmgn.ai và trả về trang giả lập,
// rồi kiểm tra: gắn nút, mở Side Panel (qua trang panel với ?tab=) và drawer dự phòng, lưu ghi chú,
// tooltip, FAB trên trang token, dashboard, export/import, popup.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const mock = require('./mock-gmgn');

const EXT = process.env.EXT_DIR || path.resolve(__dirname, '..'); // EXT_DIR: kiểm tra một bản đã đóng gói
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const PROLOG = 'robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3';
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ✓', msg); };
const shadowQ = (page, sel) => page.evaluate(s => { const el = document.getElementById('noted-gmgn-host').shadowRoot.querySelector(s); return el ? (el.hidden ? '' : el.textContent) : null; }, sel);
const drawerOpen = page => page.evaluate(() => !!document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'));

(async () => {
  const userDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noted-prof-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1100, height: 800 },
  });
  await ctx.route('https://gmgn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mock.handle(route.request().url()) }));

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('extension id', extId);

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  console.log('1) Danh sách theo dõi: gắn nút');
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
  console.log('  chế độ thực tế:', panelMode ? 'Side Panel' : 'drawer dự phòng (headless không mở được side panel)');
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
  await page.hover(`.noted-badge[data-key="${PROLOG}"]`);
  await page.waitForTimeout(200);
  const tipText = await shadowQ(page, '.nd-tip');
  assert(tipText.includes('Launchpad') && tipText.includes('#ai'), 'tooltip hiện tóm tắt + tag');
  await page.screenshot({ path: path.join(OUT, '2-list-tooltip.png') });

  console.log('5) Chế độ overlay (settings.ui = drawer): bấm nút mở drawer trong trang');
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'drawer' } }));
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
  await page.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && !f.hidden; }, null, { timeout: 8000 });
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
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'panel', lang: 'zh' } }));
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
  assert((await page.$eval('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]', b => b.title)) === '为该项目添加笔记 (Noted)', 'title nút tiếng Trung');
  await sw.evaluate(async () => chrome.storage.local.set({ settings: { ui: 'panel', lang: 'en' } }));
  await page.waitForTimeout(300);
  await page.hover('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]');
  assert((await page.$eval('.noted-badge[data-key="robinhood:0x2222222222222222222222222222222222222222"]', b => b.title)) === 'Add a note for this project (Noted)', 'đổi ngôn ngữ áp ngay cho nút mà không cần tải lại');

  await ctx.close();
  console.log('\nALL PASSED');
})().catch(async e => { console.error(e); process.exit(1); });
