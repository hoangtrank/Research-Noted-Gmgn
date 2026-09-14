// Adapter gmgn.ai cho core.js: token nhận từ link /{chain}/token/{address}; dự phòng bảng g-table có data-row-key.
(() => {
  'use strict';
  const S = globalThis.NotedStore;
  if (!S) return;

  function pageChain() {
    const seg = S.normalizeChain(location.pathname.split('/')[1] || '');
    if (seg && S.CHAIN_LABELS[seg]) return seg;
    const q = S.normalizeChain(new URLSearchParams(location.search).get('chain') || '');
    return q && /^[a-z0-9-]{2,20}$/.test(q) ? q : null;
  }

  window.__notedAdapter = {
    name: 'gmgn',
    scanTargets() {
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/token/"]')) {
        const t = S.parseTokenUrl(a.getAttribute('href'));
        if (t) out.push({ el: a, ref: t });
      }
      const chain = pageChain();
      if (chain) {
        for (const row of document.querySelectorAll('[data-row-key]')) {
          if (row.querySelector('a[href*="/token/"]') || row.closest('a[href*="/token/"]')) continue;
          const address = S.normalizeAddress(row.getAttribute('data-row-key'));
          if (address) out.push({ el: row, ref: { chain, address, key: S.keyOf(chain, address) } });
        }
      }
      return out;
    },
    resolve: async () => new Map(),
    pageRef: () => S.parseTokenUrl(location.href),
    // Trang token: symbol nằm đầu <title> ("PROLOG 0.0₅659 | GMGN.AI ...") hoặc <h1>.
    pageSymbol() {
      const C = window.__notedCore;
      const first = (document.title.split('|')[0] || '').trim().split(/\s+/)[0] || '';
      if (first && !/^gmgn/i.test(first) && C.looksLikeSymbol(first)) return C.cleanSymbol(first);
      const h1 = document.querySelector('h1');
      if (h1 && C.looksLikeSymbol(h1.textContent.trim())) return C.cleanSymbol(h1.textContent);
      return '';
    },
    clickContext(el) {
      const C = window.__notedCore;
      return { symbol: C.symbolFor(el), mc: C.captureMc(el) };
    },
  };
})();
