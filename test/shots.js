// Chụp ảnh minh hoạ cho README và Chrome Web Store từ các trang giả lập, dùng đúng giao diện hiện tại.
// Ảnh "trang + side panel" được ghép lại cho giống cửa sổ Chrome thật (side panel là giao diện của trình duyệt,
// không nằm trong ảnh chụp trang).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('./pw');
const gmgnMock = require('./mock-gmgn');
const dexMock = require('./mock-dexscreener');
const xSearchMock = require('./mock-xsearch');
const grokMock = require('./mock-grok');

const EXT = path.resolve(__dirname, '..');
const DOCS = path.join(EXT, 'docs');
const STORE = path.join(DOCS, 'store');
const W = 1280, H = 800, PANEL_W = 400;

const PROLOG = '0xaa40e79e987517f7462bf79315b8a118799b04e3';
const now = Date.now();
const SEED = {
  [`p:robinhood:${PROLOG}`]: {
    chain: 'robinhood', address: PROLOG, symbol: 'PROLOG', name: 'AI agent launchpad on Robinhood chain',
    summary: 'Launchpad for AI trading agents with a shared liquidity layer. Ex-Coinbase team, TGE in October, backed by Virtuals. Main risk: 15% unlock in November.',
    tags: ['ai', 'launchpad', 'robinhood'], pinned: true, status: 'holding', rating: 4,
    createdAt: now - 6 * 864e5, updatedAt: now - 3600e3,
    timeline: [
      { id: 'e1', ts: now - 6 * 864e5, type: 'research', text: '@theunipcs: tokenomics look clean, 40% to community with a 12-month vesting. Worth a small position early.', mc: '$2.10M' },
      { id: 'e2', ts: now - 4 * 864e5, type: 'buy', text: 'Bought 0.2 ETH after the Robinhood app listing', mc: '$4.80M' },
      { id: 'e3', ts: now - 2 * 864e5, type: 'alert', text: 'Top 10 holders still control 38% of supply — watch the November unlock', mc: '$8.20M' },
      { id: 'e4', ts: now - 3600e3, type: 'news', text: 'Partnership with Virtuals announced, volume x3 https://x.com/example/status/123', mc: '$10.64M' },
    ],
  },
  'p:sol:Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump': {
    chain: 'sol', address: 'Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump', symbol: 'EXTENSION', name: 'Browser tooling for traders',
    summary: 'Extension tooling narrative, anonymous dev but shipping weekly.', tags: ['tooling', 'solana'], pinned: false, status: 'researching', rating: 3,
    createdAt: now - 3 * 864e5, updatedAt: now - 2 * 864e5,
    timeline: [{ id: 'f1', ts: now - 2 * 864e5, type: 'research', text: '@chain_watch: dev wallet has funded three previous launches, two of them died within a week.' }],
  },
  'p:robinhood:0x1111111111111111111111111111111111111111': {
    chain: 'robinhood', address: '0x1111111111111111111111111111111111111111', symbol: 'JUGGER', name: 'Perp DEX aggregator',
    summary: 'Perp aggregator on Robinhood chain, thin docs, anonymous team.', tags: ['perp', 'defi'], pinned: false, status: 'watching', rating: 2,
    createdAt: now - 864e5, updatedAt: now - 864e5, timeline: [],
  },
  settings: { ui: 'panel', lang: 'en', listBadges: false, follow: true, grokAutoSave: true },
};

const shot = async (page, file, clip) => {
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  return fs.readFileSync(file).toString('base64');
};

// Ghép ảnh trang (bên trái) với ảnh side panel (bên phải) thành một ảnh 1280×800.
async function compose(ctx, pageB64, panelB64, out) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: W, height: H });
  await p.setContent(`<html><body style="margin:0;background:#0d0f14;display:flex">
    <img src="data:image/png;base64,${pageB64}" style="width:${W - PANEL_W}px;height:${H}px;display:block">
    <div style="width:1px;background:#2b303a"></div>
    <img src="data:image/png;base64,${panelB64}" style="width:${PANEL_W - 1}px;height:${H}px;display:block">
  </body></html>`);
  await p.waitForTimeout(250);
  await p.screenshot({ path: out });
  await p.close();
}

(async () => {
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(STORE, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noted-shots-'));
  const ctx = await chromium.launchPersistentContext(tmp, {
    channel: 'chromium', headless: true, viewport: { width: W, height: H },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route('https://gmgn.ai/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: gmgnMock.handle(r.request().url()) }));
  await ctx.route('https://dexscreener.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: dexMock.handle(r.request().url()) }));
  await ctx.route('https://x.com/**', r => {
    const u = new URL(r.request().url());
    const body = u.pathname.startsWith('/i/grok') ? grokMock.page(r.request().url()) : xSearchMock.page(r.request().url());
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  const dexApi = await dexMock.startApi();

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sw.evaluate(async (args) => {
    const s = { ...args.seed };
    s.settings = { ...s.settings, dexApiBase: args.api };
    await chrome.storage.local.set(s);
    chrome.runtime.onMessage.addListener((m, sender) => { if (m && m.type === 'noted:page-token' && sender.tab) globalThis.__tab = sender.tab.id; });
  }, { seed: SEED, api: dexApi.base });

  const panelPage = async (tabId, file) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: PANEL_W, height: H });
    await p.goto(`chrome-extension://${extId}/src/panel/panel.html?tab=${tabId}`);
    await p.waitForSelector('#mount:not([hidden]) .ne-symbol', { timeout: 10000 });
    await p.waitForTimeout(500);
    const b64 = await shot(p, file);
    await p.close();
    return b64;
  };

  // --- 1. Trang token trên gmgn: nút nổi + side panel ---
  const gm = await ctx.newPage();
  await gm.setViewportSize({ width: W - PANEL_W, height: H });
  await gm.goto(`https://gmgn.ai/robinhood/token/${PROLOG}`);
  await gm.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && !f.hidden; }, null, { timeout: 10000 });
  await gm.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-fab').click());
  await gm.waitForTimeout(900);
  const gmTab = await sw.evaluate(() => globalThis.__tab);
  const gmB64 = await shot(gm, path.join(STORE, 'tmp-gmgn.png'));
  const panelB64 = await panelPage(gmTab, path.join(STORE, 'tmp-panel.png'));
  await compose(ctx, gmB64, panelB64, path.join(DOCS, '01-token-note.png'));
  await gm.close();

  // --- 2. Tìm kiếm trên X: bôi đen -> nút lưu ---
  const xp = await ctx.newPage();
  await xp.setViewportSize({ width: W, height: H });
  await xp.goto(`https://x.com/search?q=${PROLOG}&src=typed_query`);
  await xp.waitForFunction(() => { const f = document.getElementById('noted-gmgn-host')?.shadowRoot.querySelector('.nd-fab'); return f && !f.hidden; }, null, { timeout: 10000 });
  await xp.evaluate(() => { const el = document.querySelector('article [data-testid="tweetText"]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await xp.waitForFunction(() => { const b = document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel'); return b && !b.hidden; }, null, { timeout: 5000 });
  await shot(xp, path.join(DOCS, '02-x-select.png'));

  // --- 3. Sau khi lưu: panel hiện mốc mới ---
  await xp.evaluate(() => document.getElementById('noted-gmgn-host').shadowRoot.querySelector('.nd-sel').click());
  await xp.waitForTimeout(1200);
  const xTab = await sw.evaluate(() => globalThis.__tab);
  await xp.setViewportSize({ width: W - PANEL_W, height: H });
  await xp.waitForTimeout(300);
  const xB64 = await shot(xp, path.join(STORE, 'tmp-x.png'));
  const xPanelB64 = await panelPage(xTab, path.join(STORE, 'tmp-xpanel.png'));
  await compose(ctx, xB64, xPanelB64, path.join(DOCS, '03-x-saved.png'));
  await xp.close();

  // --- 4. Dashboard ---
  const dash = await ctx.newPage();
  await dash.setViewportSize({ width: W, height: H });
  await dash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
  await dash.waitForSelector('.card');
  await dash.evaluate(() => [...document.querySelectorAll('.card')].find(c => c.textContent.includes('PROLOG')).click());
  await dash.waitForSelector('#editor-mount:not([hidden]) .ne-entry');
  await dash.waitForTimeout(400);
  await shot(dash, path.join(DOCS, '04-dashboard.png'));

  // --- 5. Cài đặt ---
  await dash.click('#open-settings');
  await dash.waitForSelector('#settings:not([hidden])');
  await dash.waitForTimeout(300);
  await shot(dash, path.join(DOCS, '05-settings.png'));
  await dash.click('#settings-close');

  // --- 6. Grok: câu trả lời tự lưu ---
  const grokPromise = ctx.waitForEvent('page');
  await dash.click('.ne-grok');
  const grok = await grokPromise;
  await grok.waitForTimeout(600);
  const grokUrl = await sw.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    const m = Object.entries(all).filter(([k]) => k.startsWith('grok:')).map(([, v]) => v).sort((a, b) => b.at - a.at)[0];
    return NotedResearch.urlFor('x', m.prompt);
  });
  await grok.setViewportSize({ width: W, height: H });
  await grok.goto(grokUrl);
  await grok.waitForFunction(() => document.getElementById('noted-grok-host')?.shadowRoot.querySelector('.pill'), null, { timeout: 10000 });
  await grok.evaluate(() => document.getElementById('noted-grok-host').shadowRoot.querySelector('.pill').click());
  await grok.click('#send');
  await grok.waitForFunction(() => { const s = document.getElementById('noted-grok-host').shadowRoot.querySelector('.status'); return s && s.textContent.includes('Auto-saved'); }, null, { timeout: 30000 });
  await shot(grok, path.join(DOCS, '06-grok.png'));
  await grok.close();
  await dash.close();

  // --- Ảnh cho Chrome Web Store (1280×800, cùng bộ) ---
  for (const [src, dst] of [['01-token-note.png', '1-token-note-1280x800.png'], ['03-x-saved.png', '2-x-research-1280x800.png'], ['04-dashboard.png', '3-dashboard-1280x800.png']]) {
    fs.copyFileSync(path.join(DOCS, src), path.join(STORE, dst));
  }
  for (const f of fs.readdirSync(STORE)) if (f.startsWith('tmp-')) fs.unlinkSync(path.join(STORE, f));

  await ctx.close();
  dexApi.server.close();
  console.log('docs:', fs.readdirSync(DOCS).filter(f => f.endsWith('.png')).sort().join(', '));
  console.log('store:', fs.readdirSync(STORE).sort().join(', '));
})().catch(e => { console.error(e); process.exit(1); });
