// Trang gmgn.ai giả lập để test extension khi không truy cập được gmgn thật.
// Cấu trúc bắt chước danh sách theo dõi: mỗi hàng là <a href="/{chain}/token/{address}"> với logo, symbol + badge, holders, MC, %.
'use strict';

const TOKENS = [
  { chain: 'robinhood', address: '0xaa40e79e987517f7462bf79315b8a118799b04e3', symbol: 'PROLOG', holders: '4,01K', mc: '$10.64M', chg: '+16.53%' },
  { chain: 'robinhood', address: '0x1111111111111111111111111111111111111111', symbol: 'JUGGER', holders: '7,06K', mc: '$9.05M', chg: '+0.57%' },
  { chain: 'robinhood', address: '0x2222222222222222222222222222222222222222', symbol: 'FRONG', holders: '4,61K', mc: '$7.12M', chg: '+7.13%' },
  { chain: 'robinhood', address: '0x3333333333333333333333333333333333333333', symbol: 'EARN', holders: '4,11K', mc: '$7.00M', chg: '+56.57%' },
  { chain: 'sol', address: 'Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump', symbol: 'EXTENSION', holders: '1,11K', mc: '$2.39M', chg: '-23.78%' },
  { chain: 'robinhood', address: '0x4444444444444444444444444444444444444444', symbol: '富贵', holders: '2,41K', mc: '$134.52K', chg: '+202.1%' },
];

const CSS = `
  body{margin:0;background:#0b0d10;color:#e6e8ec;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .top{padding:10px 12px;border-bottom:1px solid #22262e;color:#9aa3b2}
  .list{width:380px}
  a.row{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid #1a1e25;color:inherit;text-decoration:none}
  a.row:hover{background:#12151b}
  .logo{width:36px;height:36px;border-radius:50%;background:#2b303a;flex:0 0 auto}
  .name{flex:1;min-width:0}
  .sym{display:flex;align-items:center;gap:4px;font-weight:700}
  .sym img{width:12px;height:12px}
  .holders{color:#9aa3b2;font-size:13px;margin-top:3px}
  .right{text-align:right}
  .mc{font-weight:700;color:#60a5fa}
  .up{color:#22c55e}.down{color:#ef4444}
  .g-table-row{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #1a1e25;cursor:pointer}
  h1{font-size:22px;margin:16px 12px 4px}
`;

const badgeImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#facc15"/></svg>');

function row(t) {
  return `<a class="row" href="/${t.chain}/token/${t.address}">
    <div class="logo"></div>
    <div class="name">
      <div class="sym">${t.symbol}<img src="${badgeImg}" alt=""><img src="${badgeImg}" alt=""></div>
      <div class="holders">${t.holders} ✎</div>
    </div>
    <div class="right"><div class="mc">${t.mc}</div><div class="${t.chg.startsWith('-') ? 'down' : 'up'}">${t.chg}</div></div>
  </a>`;
}

function listPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Danh sách theo dõi | GMGN.AI</title><style>${CSS}</style></head>
  <body><div class="top">Danh sách theo dõi · Tất cả · Mặc định · buy</div>
  <div class="list" id="list">${TOKENS.map(row).join('')}</div>
  <h1>Bảng g-table (hàng không phải link)</h1>
  <div class="g-table-tbody-virtual-holder-inner">
    <div class="g-table-row" data-row-key="0x5555555555555555555555555555555555555555"><span>ROWKEY</span><span>1,20K</span><span>$420.76K</span></div>
  </div>
  <script>
    // Giả lập SPA: điều hướng bằng pushState khi bấm hàng (như React Router), và thêm hàng mới sau 1s (virtual list).
    document.addEventListener('click', e => {
      const a = e.target.closest('a.row'); if (!a) return;
      e.preventDefault(); history.pushState({}, '', a.getAttribute('href')); document.body.dataset.navigated = a.getAttribute('href');
    });
    setTimeout(() => {
      const list = document.getElementById('list');
      list.insertAdjacentHTML('beforeend', ${JSON.stringify(row({ chain: 'base', address: '0x6666666666666666666666666666666666666666', symbol: 'LATE', holders: '900', mc: '$88.10K', chg: '+1.00%' }))});
    }, 1000);
  </script></body></html>`;
}

function tokenPage(chain, address) {
  const t = TOKENS.find(x => x.address === address) || { symbol: 'UNKNOWN', mc: '$1.00M' };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${t.symbol} 0.0₅659 | GMGN.AI Fast Trade, Fast Copy Trade</title><style>${CSS}</style></head>
  <body><div class="top">${chain} / token</div><h1>${t.symbol}</h1><p style="margin:0 12px;color:#9aa3b2">MC ${t.mc} · Liq $500K · Holders 4,01K</p>
  <div class="list">${TOKENS.slice(0, 2).map(row).join('')}</div></body></html>`;
}

function handle(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/([a-z0-9-]+)\/token\/([A-Za-z0-9_]+)/);
  if (m) return tokenPage(m[1], m[2]);
  return listPage();
}

module.exports = { handle, TOKENS };
