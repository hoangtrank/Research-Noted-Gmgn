// Adapter trang tìm kiếm X (x.com/search?q=...): khi bạn tìm theo địa chỉ contract hoặc $SYMBOL (ví dụ bấm nút X
// trên gmgn), extension nhận ra token đang research và hiện nút nổi "Research-Noted-Gmgn · SYMBOL · Chain".
// Không gắn nút vào từng bài; bôi đen chữ trong bài -> nút "Lưu đoạn bôi đen" đưa vào timeline kèm link bài.
(() => {
  'use strict';
  const S = globalThis.NotedStore;
  if (!S) return;
  const cache = new Map(); // query -> token | null

  function query() {
    if (!/^\/search/.test(location.pathname)) return '';
    return (new URLSearchParams(location.search).get('q') || '').trim();
  }

  // Lấy các địa chỉ và cashtag trong chuỗi tìm kiếm ("$VIBES OR 0xabc...", "0xabc", "VIBES").
  function parseQuery(q) {
    const addresses = [], symbols = [];
    for (const w of q.split(/[\s,()"']+/)) {
      if (!w || /^(or|and|from:|since:|until:|lang:|-filter:|filter:)/i.test(w)) continue;
      const a = S.normalizeAddress(w);
      if (a && /^(0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(a)) { addresses.push(a); continue; }
      const m = w.match(/^\$?([A-Za-z][A-Za-z0-9]{1,15})$/);
      if (m) symbols.push(m[1].toUpperCase());
    }
    return { addresses, symbols };
  }

  async function resolveQuery(q) {
    const { addresses, symbols } = parseQuery(q);
    const all = (await S.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
    let p = all.find(x => addresses.includes(x.address));
    if (!p && symbols.length && !addresses.length) p = all.find(x => x.symbol && symbols.includes(x.symbol.toUpperCase()));
    if (p) return { chain: p.chain, address: p.address, key: p.key, symbol: p.symbol, mc: null };
    // Chưa có ghi chú: hỏi DexScreener xem địa chỉ này là token nào (chain, symbol) để vẫn hiện nút và tạo ghi chú mới được.
    if (addresses.length) {
      const r = await new Promise(res => chrome.runtime.sendMessage({ type: 'noted:dex-lookup', address: addresses[0] }, x => res(chrome.runtime.lastError ? null : x)));
      if (r && r.ok && r.token) return r.token;
    }
    return null;
  }

  window.__notedAdapter = {
    name: 'xsearch',
    fabChain: true,
    selectionSave: true,
    scanTargets: () => [],
    pageRef() {
      const q = query();
      if (!q) return null;
      if (cache.has(q)) return cache.get(q);
      return { pending: `q:${q}` };
    },
    async resolve(ids) {
      const out = new Map();
      for (const id of ids) {
        if (!id.startsWith('q:')) continue;
        const q = id.slice(2);
        let tk = cache.get(q);
        if (tk === undefined) { tk = await resolveQuery(q); cache.set(q, tk); }
        if (tk) out.set(id, tk);
      }
      return out;
    },
    pageSymbol() { const q = query(); const tk = cache.get(q); return (tk && tk.symbol) || ''; },
    clickContext(el, token) { return { symbol: token.symbol || '', mc: null }; },
    // Nguồn của đoạn bôi đen: bài đăng chứa vùng chọn -> { url bài, author "@handle" }; không có thì URL trang tìm kiếm.
    selectionSource(sel) {
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      const art = node && node.closest && node.closest('article');
      if (art) for (const a of art.querySelectorAll('a[href]')) {
        const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,20})\/status\/(\d{1,30})(?:$|[/?#])/);
        if (m) return { url: `https://x.com/${m[1]}/status/${m[2]}`, author: `@${m[1]}` };
      }
      return { url: location.href, author: '' };
    },
  };
})();
