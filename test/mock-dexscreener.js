// DexScreener giả lập: trang watchlist với link /{chain}/{pairAddress} và trang pair; kèm API giả lập
// (server HTTP cục bộ) trả JSON theo dạng https://api.dexscreener.com/latest/dex/pairs/{chain}/{addrs} và /tokens/{addrs}.
'use strict';
const http = require('http');

const MINT_A = 'BoNKzMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1';
const MINT_C = 'Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump'; // EXTENSION (đã có ghi chú)
const MINT_D = 'DoGeYMintDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD4';
const PAIR_A = 'PairAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA1';
const PAIR_B = '0xPairB00000000000000000000000000000000B2'.toLowerCase().replace('0xpairb', '0x1a2b3c');
const PAIR_D = 'PairDdddddddddddddddddddddddddddddddddddddD4';
const PROLOG = '0xaa40e79e987517f7462bf79315b8a118799b04e3';
// Chỉ tìm được qua /search: slug trên URL là "hyperevm" nhưng API ghi chainId "hyperliquid"
const PAIR_E = '0xE5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5';
const TOKEN_E = '0xF6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6';
// Địa chỉ dạng Sui (0x + 64 hex)
const PAIR_S = '0x' + 'ab'.repeat(32);
const TOKEN_S = '0x' + 'cd'.repeat(32);
const SEARCH = {
  [PAIR_E.toLowerCase()]: { chainId: 'hyperliquid', pairAddress: PAIR_E, baseToken: { address: TOKEN_E, symbol: 'HYPEY', name: 'Hypey' }, quoteToken: { address: '0x5555555555555555555555555555555555555555', symbol: 'WHYPE', name: 'Wrapped HYPE' }, marketCap: 5500000, fdv: 5500000 },
};

const PAIRS = {
  [`solana:${PAIR_A.toLowerCase()}`]: { chainId: 'solana', pairAddress: PAIR_A, baseToken: { address: MINT_A, symbol: 'BONKZ', name: 'Bonkz Coin' }, quoteToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL' }, marketCap: 2390000, fdv: 2390000 },
  [`robinhood:${PAIR_B.toLowerCase()}`]: { chainId: 'robinhood', pairAddress: '0x1A2B3C00000000000000000000000000000000B2', baseToken: { address: '0xAA40E79E987517F7462BF79315B8A118799B04E3', symbol: 'PROLOG', name: 'Prolog Agents' }, quoteToken: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether' }, marketCap: 10640000, fdv: 12000000 },
  // cặp đảo: base là WSOL, quote mới là token
  [`solana:${PAIR_D.toLowerCase()}`]: { chainId: 'solana', pairAddress: PAIR_D, baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'WSOL', name: 'Wrapped SOL' }, quoteToken: { address: MINT_D, symbol: 'DOGEY', name: 'Dogey' }, marketCap: 88100, fdv: 88100 },
};
const SUI_PAIRS = {
  [`sui:${PAIR_S}`]: { chainId: 'sui', pairAddress: PAIR_S, baseToken: { address: TOKEN_S, symbol: 'SUIDOG', name: 'Sui Dog' }, quoteToken: { address: '0x2::sui::SUI', symbol: 'SUI', name: 'Sui' }, marketCap: 910000, fdv: 910000 },
};
const TOKENS = {
  [MINT_C.toLowerCase()]: { chainId: 'solana', pairAddress: 'PairCcccccccccccccccccccccccccccccccccccccC3', baseToken: { address: MINT_C, symbol: 'EXTENSION', name: 'Extension' }, quoteToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL' }, marketCap: 420760, fdv: 420760 },
};

function api(req, res) {
  const u = new URL(req.url, 'http://x');
  let m;
  const send = obj => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };
  if ((m = u.pathname.match(/^\/latest\/dex\/pairs\/([a-z0-9-]+)\/(.+)$/))) {
    const pairs = m[2].split(',').map(a => PAIRS[`${m[1]}:${a.toLowerCase()}`] || SUI_PAIRS[`${m[1]}:${a.toLowerCase()}`]).filter(Boolean);
    return send({ schemaVersion: '1.0.0', pairs: pairs.length ? pairs : null });
  }
  if (u.pathname === '/latest/dex/search') {
    const q = (u.searchParams.get('q') || '').toLowerCase();
    const hit = SEARCH[q];
    return send({ schemaVersion: '1.0.0', pairs: hit ? [hit] : [] });
  }
  if ((m = u.pathname.match(/^\/latest\/dex\/tokens\/(.+)$/))) {
    const pairs = m[1].split(',').map(a => TOKENS[a.toLowerCase()]).filter(Boolean);
    return send({ schemaVersion: '1.0.0', pairs: pairs.length ? pairs : null });
  }
  res.writeHead(404); res.end('{}');
}

function startApi() {
  return new Promise(resolve => {
    const srv = http.createServer(api);
    srv.listen(0, '127.0.0.1', () => resolve({ server: srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const CSS = `body{margin:0;background:#0b0e11;color:#e6e8ec;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif}
.top{padding:10px 12px;border-bottom:1px solid #22262e;color:#9aa3b2}
a.ds-dex-table-row{display:grid;grid-template-columns:40px 30px 1fr 120px 100px 100px;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #1a1e25;color:inherit;text-decoration:none}
.rank{color:#9aa3b2}.icon{width:22px;height:22px;border-radius:50%;background:#2b303a}
.sym b{font-weight:700}.sym .q{color:#9aa3b2}.name{color:#9aa3b2;font-size:12px}
.mc{color:#60a5fa;font-weight:600}h1{font-size:22px;margin:16px 12px 4px}`;

function row(chain, pair, base, quote, name, price, vol, mc) {
  return `<a class="ds-dex-table-row" href="/${chain}/${pair}">
    <div class="rank">#1</div><div class="icon"></div>
    <div><div class="sym"><b>${base}</b> <span class="q">/ ${quote}</span></div><div class="name">${name}</div></div>
    <div>${price}</div><div>${vol}</div><div class="mc">${mc}</div></a>`;
}

function watchlist() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Watchlist | DEX Screener</title><style>${CSS}</style></head><body>
  <div class="top"><a href="/watchlist/abc12">Watchlist</a> · <a href="/gainers/solana">Gainers</a> · <a href="/new-pairs">New pairs</a></div>
  ${row('solana', PAIR_A, 'BONKZ', 'SOL', 'Bonkz Coin', '$0.0004', '$1.2M', '$2.39M')}
  ${row('robinhood', '0x1A2B3C00000000000000000000000000000000B2', 'PROLOG', 'WETH', 'Prolog Agents', '$0.0068', '$52.9K', '$10.64M')}
  ${row('solana', MINT_C, 'EXTENSION', 'SOL', 'Extension', '$0.0004', '$8K', '$420.76K')}
  ${row('solana', PAIR_D, 'WSOL', 'DOGEY', 'Dogey', '$130', '$3K', '$88.10K')}
  ${row('hyperevm', PAIR_E, 'HYPEY', 'WHYPE', 'Hypey', '$0.55', '$900K', '$5.5M')}
  ${row('sui', PAIR_S, 'SUIDOG', 'SUI', 'Sui Dog', '$0.0009', '$40K', '$910K')}
  </body></html>`;
}

function pairPage(chain, addr) {
  const p = PAIRS[`${chain}:${addr.toLowerCase()}`];
  const sym = p ? p.baseToken.symbol : 'PAIR';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${sym} / ${p ? p.quoteToken.symbol : ''} | DEX Screener</title><style>${CSS}</style></head><body>
  <div class="top">${chain} / pair</div><h1>${sym} / ${p ? p.quoteToken.symbol : ''}</h1><p style="margin:0 12px;color:#9aa3b2">Market cap ${p ? '$' + (p.marketCap / 1e6).toFixed(2) + 'M' : ''}</p>
  ${row('solana', PAIR_A, 'BONKZ', 'SOL', 'Bonkz Coin', '$0.0004', '$1.2M', '$2.39M')}
  </body></html>`;
}

function handle(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/([a-z0-9-]+)\/([A-Za-z0-9]{20,64})/);
  if (m) return pairPage(m[1], m[2]);
  return watchlist();
}

module.exports = { handle, startApi, MINT_A, MINT_C, MINT_D, PAIR_A, PAIR_D, PROLOG, PAIR_E, TOKEN_E, PAIR_S, TOKEN_S };
