// Nạp extension thật vào Chromium (Playwright), chặn mọi request tới gmgn.ai và trả về trang giả lập,
// rồi kiểm tra: gắn nút, mở drawer, lưu ghi chú, tooltip, FAB trên trang token, dashboard.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const mock = require('./mock-gmgn');

const EXT = path.resolve(__dirname, '..');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); console.log('  ✓', msg); };

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

  console.log('1) Danh sách theo dõi');
  await page.goto('https://gmgn.ai/follow?chain=robinhood');
  await page.waitForSelector('.noted-badge', { timeout: 10000 });
  await page.waitForTimeout(1500); // đợi hàng "LATE" được thêm động
  const badges = await page.$$eval('.noted-badge', els => els.map(b => ({ key: b.dataset.key, prev: b.previousSibling && b.previousSibling.nodeValue && b.previousSibling.nodeValue.trim() })));
  console.log('  badges:', badges);
  assert(badges.length === mock.TOKENS.length + 2, `mỗi hàng có một nút (${badges.length}: 6 link + 1 hàng thêm động + 1 hàng data-row-key)`);
  assert(badges.find(b => b.key === 'robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3' && b.prev === 'PROLOG'), 'nút PROLOG nằm ngay sau symbol');
  assert(badges.find(b => b.key === 'sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'), 'nhận diện địa chỉ Solana');
  assert(badges.find(b => b.key === 'robinhood:0x5555555555555555555555555555555555555555' && b.prev === 'ROWKEY'), 'dự phòng data-row-key hoạt động');
  assert(badges.find(b => b.key === 'base:0x6666666666666666666666666666666666666666'), 'hàng thêm động cũng có nút');

  console.log('2) Bấm nút PROLOG -> drawer, không điều hướng');
  await page.click('.noted-badge[data-key="robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3"]');
  const drawerOpen = await page.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'), null, { timeout: 5000 });
  assert(!!drawerOpen, 'drawer mở');
  assert((await page.evaluate(() => location.pathname)) === '/follow', 'bấm nút không điều hướng sang trang token');
  assert(!(await page.evaluate(() => document.body.dataset.navigated)), 'handler click của trang không bị kích hoạt');
  const sh = () => page.evaluateHandle(() => document.getElementById('noted-gmgn-host').shadowRoot);
  const symbol = await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.ne-symbol').value);
  assert(symbol === 'PROLOG', 'symbol tự điền từ hàng: ' + symbol);
  const mcNow = await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.ne-mcnow').textContent);
  assert(mcNow.includes('$10.64M'), 'MC lấy từ hàng: ' + mcNow);

  console.log('3) Nhập ghi chú');
  const root = await sh();
  const type = async (sel, text) => { const el = await root.$(sel); await el.click(); await el.type(text); };
  await type('.ne-name', 'AI agent launchpad tren Robinhood chain');
  await type('.ne-summary', 'Launchpad cho AI agent, doi ex-Coinbase, TGE thang 10. Rui ro: unlock lon.');
  await type('.ne-taginput', 'ai, launchpad');
  await (await root.$('.ne-taginput')).press('Enter');
  await (await root.$('.ne-pin')).click();
  await (await root.$('.ne-stars span[data-n="4"]')).click();
  await (await root.$('.ne-status')).selectOption('researching');
  await type('.ne-newtext', 'Thread X cua founder: https://x.com/example/status/123 - noi ve tokenomics');
  await (await root.$('.ne-newtype')).selectOption('research');
  await (await root.$('.ne-add')).click();
  await type('.ne-newtext', 'Mua thu 0.1 ETH');
  await (await root.$('.ne-newtype')).selectOption('buy');
  await (await root.$('.ne-newtext')).press('Control+Enter');
  await page.waitForTimeout(700);
  const entries = await root.$$eval('.ne-entry', els => els.map(e => e.dataset.type));
  assert(entries.length === 2 && entries[0] === 'buy', 'timeline có 2 mốc, mới nhất ở trên: ' + entries.join(','));
  const linkified = await root.$eval('.ne-entries', el => !!el.querySelector('a[href="https://x.com/example/status/123"]'));
  assert(linkified, 'URL trong mốc được biến thành link');
  await page.screenshot({ path: path.join(OUT, '1-list-drawer.png') });

  console.log('4) Dữ liệu trong storage');
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get(null)));
  const p = stored['p:robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3'];
  assert(p && p.symbol === 'PROLOG' && p.pinned && p.rating === 4 && p.status === 'researching', 'project lưu đúng pin/rating/status');
  assert(p.tags.join(',') === 'ai,launchpad', 'tags: ' + p.tags.join(','));
  assert(p.timeline.length === 2 && p.timeline[0].mc === '$10.64M', 'mốc timeline kèm MC lúc ghi');
  assert(p.summary.startsWith('Launchpad'), 'summary lưu');

  console.log('5) Nút đổi trạng thái + tooltip');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const cls = await page.$eval('.noted-badge[data-key="robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3"]', b => b.className + '|' + b.textContent);
  assert(cls.includes('noted-badge--has') && cls.includes('noted-badge--pin') && cls.endsWith('2'), 'nút hiện trạng thái đã ghi + pin + số mốc: ' + cls);
  await page.hover('.noted-badge[data-key="robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3"]');
  await page.waitForTimeout(200);
  const tipText = await page.evaluate(() => { const t = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-tip'); return t.hidden ? '' : t.textContent; });
  assert(tipText.includes('Launchpad') && tipText.includes('#ai'), 'tooltip hiện tóm tắt + tag');
  await page.screenshot({ path: path.join(OUT, '2-list-tooltip.png') });

  console.log('6) Trang token: FAB + Alt+N');
  await page.goto('https://gmgn.ai/robinhood/token/0xaa40e79e987517f7462bf79315b8a118799b04e3');
  await page.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && !f.hidden; }, null, { timeout: 8000 });
  const fabText = await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').textContent);
  assert(fabText.includes('PROLOG') && fabText.includes('Launchpad'), 'FAB hiện symbol + tóm tắt: ' + fabText);
  await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await page.waitForFunction(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-drawer.open'), null, { timeout: 5000 });
  assert(true, 'FAB mở drawer');
  await page.screenshot({ path: path.join(OUT, '3-token-page.png') });
  await page.keyboard.press('Escape');

  console.log('7) Trang token chưa có ghi chú: symbol từ <title>');
  await page.goto('https://gmgn.ai/robinhood/token/0x2222222222222222222222222222222222222222');
  await page.waitForTimeout(500);
  const fab2 = await page.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').textContent);
  assert(fab2.includes('FRONG'), 'FAB đọc symbol từ title: ' + fab2);

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
  assert(md.includes('## PROLOG') && md.includes('[Mua]') && md.includes('MC $10.64M'), 'markdown export');
  const json = await dash.evaluate(async () => NotedStore.exportJSON());
  const r = await dash.evaluate(async (data) => {
    data.projects[0].timeline.push({ id: 'imp1', ts: Date.now() + 1000, type: 'news', text: 'imported entry' });
    data.projects[0].updatedAt = Date.now() + 1000;
    data.projects.push({ chain: 'sol', address: 'Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump', symbol: 'EXTENSION', summary: 'x', tags: ['t'], timeline: [] });
    return NotedStore.importJSON(data);
  }, json);
  assert(r.added === 1 && r.merged === 1, `import gộp: ${JSON.stringify(r)}`);
  const after = await dash.evaluate(async () => (await NotedStore.get('robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3')).timeline.length);
  assert(after === 3, 'timeline sau import gộp = 3');

  console.log('10) Popup');
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await pop.waitForFunction(() => !document.querySelector('#stats').textContent.includes('…'));
  const stats = await pop.$eval('#stats', e => e.textContent);
  assert(stats.startsWith('2 dự án'), 'popup thống kê: ' + stats);

  await ctx.close();
  console.log('\nALL PASSED');
})().catch(async e => { console.error(e); process.exit(1); });
