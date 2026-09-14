// Chụp ảnh 1280×800 cho Chrome Web Store từ trang gmgn giả lập (thay bằng ảnh thật khi có).
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const mock = require('./mock-gmgn');

const EXT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, '..', 'docs', 'store');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const userDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'noted-shots-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route('https://gmgn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mock.handle(route.request().url()) }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;

  // Dữ liệu mẫu
  const now = Date.now();
  const seed = {
    'p:robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3': { chain: 'robinhood', address: '0xaa40e79e987517f7462bf79315b8a118799b04e3', symbol: 'PROLOG', name: 'AI agent launchpad on Robinhood chain', summary: 'Launchpad for AI agents, ex-Coinbase team, TGE in October. Strengths: big partners, steady volume. Risk: 15% unlock in November.', tags: ['ai', 'launchpad', 'robinhood'], pinned: true, status: 'holding', rating: 4, createdAt: now - 6 * 864e5, updatedAt: now - 3600e3,
      timeline: [
        { id: 'a', ts: now - 6 * 864e5, type: 'research', text: 'Founder thread: https://x.com/example/status/123 — tokenomics 40% community, 12-month vesting', mc: '$2.1M' },
        { id: 'b', ts: now - 4 * 864e5, type: 'buy', text: 'Bought 0.2 ETH after the Robinhood app listing', mc: '$4.8M' },
        { id: 'c', ts: now - 3600e3, type: 'news', text: 'Partnership with Virtuals, volume x3', mc: '$10.6M' },
      ] },
    'p:robinhood:0x1111111111111111111111111111111111111111': { chain: 'robinhood', address: '0x1111111111111111111111111111111111111111', symbol: 'JUGGER', name: 'Perp DEX aggregator', summary: 'Perp aggregator on Robinhood chain, anonymous team, thin docs.', tags: ['perp', 'defi'], pinned: false, status: 'researching', rating: 2, createdAt: now - 2 * 864e5, updatedAt: now - 2 * 864e5,
      timeline: [{ id: 'd', ts: now - 2 * 864e5, type: 'alert', text: 'Top 10 holders own 62% of supply', mc: '$9.0M' }] },
    'p:robinhood:0x3333333333333333333333333333333333333333': { chain: 'robinhood', address: '0x3333333333333333333333333333333333333333', symbol: 'EARN', name: 'Yield vault for RWA', summary: 'Yield vault on tokenized T-bills, audited by Zellic.', tags: ['rwa', 'yield'], pinned: false, status: 'watching', rating: 3, createdAt: now - 864e5, updatedAt: now - 864e5, timeline: [] },
    settings: { ui: 'drawer' },
  };
  await sw.evaluate(async data => chrome.storage.local.set(data), seed);

  const page = await ctx.newPage();
  await page.goto('https://gmgn.ai/follow?chain=robinhood');
  await page.waitForSelector('.noted-badge--pin');
  await page.waitForTimeout(1500);
  await page.hover('.noted-badge[data-key="robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '1-list-tooltip-1280x800.png') });

  await page.mouse.move(600, 600);
  await page.click('.noted-badge[data-key="robinhood:0xaa40e79e987517f7462bf79315b8a118799b04e3"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '2-editor-1280x800.png') });

  const dash = await ctx.newPage();
  await dash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await dash.waitForSelector('.card');
  await dash.click('.card');
  await dash.waitForSelector('#editor-mount:not([hidden]) .ne-symbol');
  await dash.waitForTimeout(300);
  await dash.screenshot({ path: path.join(OUT, '3-dashboard-1280x800.png') });

  await ctx.close();
  console.log('wrote', fs.readdirSync(OUT).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
