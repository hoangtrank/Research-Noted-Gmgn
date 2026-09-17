// Render SVG -> PNG cho Chrome Web Store bằng Chromium (Playwright):
//   docs/store/store-icon-128.png   icon 128x128, phần hình 96x96 ở giữa, lề trong suốt 16px (khuyến nghị của Store)
//   docs/store/promo-small-440x280.png  small promo tile (tuỳ chọn)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('../test/pw');

const OUT = path.join(__dirname, '..', 'docs', 'store');
fs.mkdirSync(OUT, { recursive: true });

// Biểu tượng: khối bo góc tối, tờ giấy vàng gấp góc với 3 dòng, ghim cam, ánh tím (màu nút ✎ khi chưa ghi).
const MARK = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s / 96})">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3040"/><stop offset="1" stop-color="#111318"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#facc15"/></linearGradient>
      <linearGradient id="pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity="0.5"/></filter>
      <clipPath id="clip"><rect x="0" y="0" width="96" height="96" rx="22"/></clipPath>
    </defs>
    <rect x="0" y="0" width="96" height="96" rx="22" fill="url(#bg)"/>
    <g clip-path="url(#clip)">
      <circle cx="14" cy="92" r="34" fill="#8b5cf6" fill-opacity="0.22"/>
      <circle cx="90" cy="6" r="26" fill="#facc15" fill-opacity="0.10"/>
    </g>
    <rect x="0.5" y="0.5" width="95" height="95" rx="21.5" fill="none" stroke="#fff" stroke-opacity="0.09"/>
    <path d="M24 14 h32 l16 16 v44 a8 8 0 0 1 -8 8 h-40 a8 8 0 0 1 -8 -8 v-52 a8 8 0 0 1 8 -8 z" fill="url(#paper)" filter="url(#shadow)"/>
    <path d="M56 14 v12 a4 4 0 0 0 4 4 h12 z" fill="#ca8a04"/>
    <rect x="26" y="40" width="32" height="5.5" rx="2.75" fill="#1a1d26"/>
    <rect x="26" y="52" width="32" height="5.5" rx="2.75" fill="#1a1d26"/>
    <rect x="26" y="64" width="19" height="5.5" rx="2.75" fill="#1a1d26"/>
    <circle cx="72" cy="20" r="12" fill="url(#pin)" stroke="#111318" stroke-width="3"/>
    <circle cx="68" cy="16" r="3" fill="#fff" fill-opacity="0.6"/>
  </g>`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${MARK(16, 16, 96)}</svg>`;

const PROMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1d27"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.9" r="0.7"><stop offset="0" stop-color="#8b5cf6" stop-opacity="0.35"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="440" height="280" fill="url(#pbg)"/>
  <rect width="440" height="280" fill="url(#glow)"/>
  ${MARK(36, 78, 124)}
  <g font-family="Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" fill="#e6e8ec">
    <text x="188" y="118" font-size="24" font-weight="700">Research-Noted-Gmgn</text>
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
