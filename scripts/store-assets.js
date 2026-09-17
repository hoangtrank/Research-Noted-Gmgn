// Render SVG -> PNG cho Chrome Web Store bằng Chromium (Playwright):
//   docs/store/store-icon-128.png   icon 128x128, phần hình 96x96 ở giữa, lề trong suốt 16px (khuyến nghị của Store)
//   docs/store/promo-small-440x280.png  small promo tile (tuỳ chọn)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('../test/pw');

const OUT = path.join(__dirname, '..', 'docs', 'store');
fs.mkdirSync(OUT, { recursive: true });

// Biểu tượng tối giản, phẳng (cùng hình với scripts/make_icons.py): nền bo góc tối, trục timeline ba mốc,
// mốc mới nhất màu vàng. Toạ độ theo lưới 512 rồi thu về cỡ cần dùng.
const MARK = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s / 512})">
    <rect width="512" height="512" rx="112" fill="#14161c"/>
    <rect x="166" y="136" width="20" height="240" rx="10" fill="#3a4150"/>
    <circle cx="176" cy="136" r="36" fill="#facc15"/>
    <circle cx="176" cy="256" r="28" fill="#5b6475"/>
    <circle cx="176" cy="376" r="28" fill="#5b6475"/>
    <rect x="244" y="118" width="164" height="36" rx="18" fill="#facc15"/>
    <rect x="244" y="238" width="124" height="36" rx="18" fill="#5b6475"/>
    <rect x="244" y="358" width="84" height="36" rx="18" fill="#5b6475"/>
  </g>`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${MARK(16, 16, 96)}</svg>`;

const PROMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <rect width="440" height="280" fill="#1c1f27"/>
  ${MARK(36, 78, 124)}
  <g font-family="Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="#e6e8ec">
    <text x="188" y="118" font-size="21" font-weight="700" textLength="228" lengthAdjust="spacingAndGlyphs">Research-Noted-Gmgn</text>
    <text x="188" y="150" font-size="15" fill="#9aa3b2">Research notes for every token</text>
    <text x="188" y="172" font-size="15" fill="#9aa3b2">you view on gmgn.ai</text>
    <g transform="translate(188 192)">
      <rect x="0" y="0" width="60" height="22" rx="7" fill="#8b5cf6" fill-opacity="0.35" stroke="#a78bfa" stroke-opacity="0.8"/>
      <text x="30" y="15.5" font-size="11.5" font-weight="700" text-anchor="middle" fill="#ddd6fe">✎ note</text>
      <rect x="68" y="0" width="76" height="22" rx="7" fill="#facc15"/>
      <text x="106" y="15.5" font-size="11.5" font-weight="700" text-anchor="middle" fill="#111">✎ noted · 3</text>
      <rect x="152" y="0" width="70" height="22" rx="7" fill="#f97316"/>
      <text x="187" y="15.5" font-size="11.5" font-weight="700" text-anchor="middle" fill="#fff">📌 pinned</text>
    </g>
  </g>
</svg>`;

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const render = async (svg, w, h, file) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log('wrote', file);
  };
  await render(ICON_SVG, 128, 128, 'store-icon-128.png');
  await render(PROMO_SVG, 440, 280, 'promo-small-440x280.png');
  fs.writeFileSync(path.join(OUT, 'store-icon.svg'), ICON_SVG);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
