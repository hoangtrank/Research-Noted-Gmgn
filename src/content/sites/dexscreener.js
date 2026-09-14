// Adapter dexscreener.com cho core.js. Link trên DexScreener là /{chain}/{pairAddress} (địa chỉ cặp, không phải token),
// nên adapter nhờ background tra API công khai của DexScreener để đổi pair -> token (symbol, tên, MC),
// rồi dùng cùng khoá chain:address với gmgn để ghi chú của một token hiện ở cả hai nơi.
(() => {
  'use strict';
  const S = globalThis.NotedStore;
  if (!S) return;

  const PAIR_RE = /^\/([a-z0-9-]+)\/([A-Za-z0-9_.:-]{20,90})(?:$|[/?#])/;
  const NOT_CHAIN = new Set(['watchlist', 'search', 'new-pairs', 'gainers', 'losers', 'trending', 'moonshot', 'portfolio', 'multicharts', 'ads', 'docs', 'api', 'boosts', 'orders', 'referral', 'settings']);
  const DEBUG = () => !!window.__notedDebug;
  const cache = new Map();     // "chain:pair" -> token | null
  const negative = new Map();  // "chain:pair" -> ts (không tra lại trong 60s)
  const inflight = new Map();  // "chain:pair" -> Promise

  function parseHref(href) {
    if (!href) return null;
    let u;
    try { u = new URL(href, location.origin); } catch (_) { return null; }
    if (u.hostname !== location.hostname && u.hostname !== 'dexscreener.com') return null;
    const m = u.pathname.match(PAIR_RE);
    if (!m || NOT_CHAIN.has(m[1].toLowerCase())) return null;
    return { chain: m[1].toLowerCase(), address: m[2], id: `${m[1].toLowerCase()}:${m[2]}` };
  }

  function toToken(chainId, r) {
    if (!r || !r.address) return null;
    const chain = S.normalizeChain(chainId);
    const address = S.normalizeAddress(r.address);
    if (!address) return null;
    return { chain, address, key: S.keyOf(chain, address), symbol: r.symbol || '', name: r.name || '', mc: r.mc || null };
  }

  function refFor(p) {
    if (!p) return null;
    if (cache.has(p.id)) { const t = cache.get(p.id); return t ? t : null; }
    const neg = negative.get(p.id);
    if (neg && Date.now() < neg) return null;
    return { pending: p.id };
  }

  // Không tra lại ngay: 15s nếu API lỗi (tạm thời), 60s nếu API bảo không có.
  function markNegative(id, reason) {
    negative.set(id, Date.now() + (String(reason || '').startsWith('error') ? 15000 : 60000));
    console.info(`[Research-Noted-Gmgn] DexScreener: could not resolve ${id} (${reason || 'not-found'}) — will retry`);
  }

  async function resolve(ids) {
    const out = new Map();
    const byChain = new Map();
    const waits = [];
    for (const id of ids) {
      if (cache.has(id)) { if (cache.get(id)) out.set(id, cache.get(id)); continue; }
      if (inflight.has(id)) { waits.push(inflight.get(id).then(t => { if (t) out.set(id, t); })); continue; }
      const i = id.indexOf(':');
      const chain = id.slice(0, i), address = id.slice(i + 1);
      if (!byChain.has(chain)) byChain.set(chain, []);
      byChain.get(chain).push(address);
    }
    for (const [chain, addresses] of byChain) {
      const p = new Promise(res => {
        chrome.runtime.sendMessage({ type: 'noted:dex-resolve', chain, addresses }, r => {
          if (chrome.runtime.lastError || !r || !r.results) { res({ results: {}, reasons: {}, error: chrome.runtime.lastError && chrome.runtime.lastError.message }); return; }
          res(r);
        });
      });
      for (const a of addresses) {
        const id = `${chain}:${a}`;
        const one = p.then(r => {
          const t = toToken(chain, r.results[a]);
          if (t) cache.set(id, t); else markNegative(id, r.error ? `error: ${r.error}` : (r.reasons && r.reasons[a]) || 'not-found');
          inflight.delete(id);
          if (t) out.set(id, t);
          return t;
        });
        inflight.set(id, one);
        waits.push(one);
      }
    }
    await Promise.all(waits);
    return out;
  }

  // Tab quay lại foreground: xoá negative cache để tra lại ngay.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) negative.clear(); });

  window.__notedAdapter = {
    name: 'dexscreener',
    scanTargets() {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const p = parseHref(a.getAttribute('href'));
        if (!p) continue;
        const ref = refFor(p);
        if (ref) out.push({ el: a, ref });
      }
      return out;
    },
    resolve,
    pageRef() { return refFor(parseHref(location.pathname)); },
    pageSymbol() { return ''; },
    // Đặt nút ngay sau text node đúng bằng symbol của token (API cho biết), không phụ thuộc class.
    symbolNode(el, token) {
      if (!token.symbol) return null;
      const want = token.symbol.trim().toLowerCase();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const txt = n.nodeValue.replace(/\s+/g, ' ').trim().toLowerCase();
        if (txt === want && n.parentElement && !n.parentElement.closest('.noted-badge') && n.parentElement.getClientRects().length) return n;
      }
      return null;
    },
    clickContext(el, token) {
      const C = window.__notedCore;
      return { symbol: token.symbol || C.symbolFor(el), mc: token.mc || C.captureMc(el) };
    },
  };
})();
