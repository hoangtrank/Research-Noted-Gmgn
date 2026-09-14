// Content script cho gmgn.ai:
//  - quét mọi link /{chain}/token/{address} (danh sách theo dõi, trending, meme...) và gắn nút Research-Noted-Gmgn cạnh symbol
//  - trang token: hiện nút nổi (FAB) cho token đang xem
//  - bấm nút: gửi background mở Chrome Side Panel (nằm ngoài trang, không che gmgn);
//    nếu không mở được hoặc người dùng chọn "overlay" thì dùng drawer Shadow DOM trong trang
(() => {
  'use strict';
  if (window.__notedGmgnLoaded) return;
  window.__notedGmgnLoaded = true;

  const S = globalThis.NotedStore;
  const E = globalThis.NotedEditor;
  const I = globalThis.NotedI18n;
  if (!S || !E || !I) return;
  const t = (k, v) => I.t(k, v);

  const ATTR = 'data-noted-key';
  const cache = new Map(); // key -> project

  const ICON_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_PIN = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3a1 1 0 0 1 .8 1.6L15 7v4.3l3.3 2.2a1 1 0 0 1 .4.8V15a1 1 0 0 1-1 1h-4.7v5.3L12 23l-1-1.7V16H6.3a1 1 0 0 1-1-1v-.7a1 1 0 0 1 .4-.8L9 11.3V7L7.2 4.6A1 1 0 0 1 8 3z"/></svg>';

  const SHADOW_CSS = `
:host{all:initial}
.nd-drawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);z-index:2147483000;transform:translateX(105%);transition:transform .18s ease;box-shadow:-12px 0 40px rgba(0,0,0,.5);background:#111318;display:flex;flex-direction:column;border-left:1px solid #2b303a}
.nd-drawer.open{transform:none}
.nd-drawer .ne{height:100%}
.nd-tip{position:fixed;z-index:2147483001;width:max-content;max-width:min(320px,calc(100vw - 16px));padding:10px 12px;border-radius:10px;background:#181b22;border:1px solid #2b303a;color:#e6e8ec;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.5);pointer-events:none}
.nd-tip .t-head{font-weight:700;margin-bottom:4px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.nd-tip .t-name{font-weight:400;color:#9aa3b2}
.nd-tip .t-st{font-weight:500;font-size:11px;color:#c7d2fe;background:rgba(99,102,241,.18);border-radius:999px;padding:1px 7px}
.nd-tip .t-rate{color:#facc15;font-size:11px}
.nd-tip .t-sum{color:#cbd5e1;white-space:pre-wrap;word-break:break-word}
.nd-tip .t-empty{color:#6b7280;font-style:italic}
.nd-tip .t-tags{margin-top:6px;color:#93c5fd;font-size:11px}
.nd-tip .t-last{margin-top:6px;color:#9aa3b2;font-size:11px;border-top:1px solid #2b303a;padding-top:6px;word-break:break-word}
.nd-fab{position:fixed;right:16px;bottom:88px;z-index:2147482999;display:flex;align-items:center;gap:8px;max-width:min(380px,calc(100vw - 32px));padding:9px 14px;border-radius:999px;border:1px solid rgba(167,139,250,.7);background:linear-gradient(180deg,#2a1f4d,#1c1730);color:#e9e5ff;font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:pointer}
.nd-fab:hover{filter:brightness(1.15)}
.nd-fab.has{border-color:rgba(250,204,21,.7);color:#fde047;background:linear-gradient(180deg,#2a2610,#1b1a12)}
.nd-fab .f-sum{font-weight:400;color:#9aa3b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px}
.nd-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:8px 14px;border-radius:999px;background:#20242d;color:#e6e8ec;border:1px solid #2b303a;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .15s;pointer-events:none}
.nd-toast.show{opacity:1}
`;

  let host, shadow, drawer, editor, tip, fab, toastEl;
  let openKey = null;      // key đang mở trong drawer (chỉ dùng ở chế độ overlay)
  let uiMode = 'panel';    // settings.ui: 'panel' (Side Panel) | 'drawer' (overlay trong trang)
  let lastHref = location.href;
  let scanTimer = 0;
  let toastTimer = 0;

  // ---------------- UI trong Shadow DOM ----------------
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'noted-gmgn-host';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS + E.CSS;
    shadow.appendChild(style);

    drawer = document.createElement('div');
    drawer.className = 'nd-drawer';
    createEditor();
    shadow.appendChild(drawer);

    tip = document.createElement('div');
    tip.className = 'nd-tip';
    tip.hidden = true;
    shadow.appendChild(tip);

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'nd-fab';
    fab.hidden = true;
    fab.addEventListener('click', () => toggleForPage());
    shadow.appendChild(fab);

    toastEl = document.createElement('div');
    toastEl.className = 'nd-toast';
    shadow.appendChild(toastEl);

    (document.body || document.documentElement).appendChild(host);

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && openKey) { ev.stopPropagation(); closeDrawer(); }
    }, true);
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
  }

  function createEditor() {
    if (editor) editor.destroy();
    editor = E.create({
      onClose: closeDrawer,
      onOpenDashboard: openDashboard,
      allTags: () => [...new Set([...cache.values()].flatMap(p => p.tags))].sort(),
      onChange: p => { cache.set(p.key, p); refreshBadges(); refreshFab(); },
      onDelete: p => { cache.delete(p.key); refreshBadges(); refreshFab(); },
    });
    drawer.appendChild(editor.el);
  }

  // Đổi ngôn ngữ: vẽ lại nút, FAB và tạo lại editor (drawer đang mở sẽ đóng).
  I.onChange(() => {
    if (openKey) { drawer.classList.remove('open'); openKey = null; }
    createEditor();
    refreshBadges();
    refreshFab();
  });

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function openDashboard() {
    chrome.runtime.sendMessage({ type: 'noted:open-dashboard' });
  }

  // ---------------- dữ liệu ----------------
  async function loadAll() {
    const [all, r] = await Promise.all([S.getAll(), chrome.storage.local.get('settings')]);
    uiMode = (r.settings && r.settings.ui) || 'panel';
    cache.clear();
    for (const p of all) cache.set(p.key, p);
    refreshBadges();
    refreshFab();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) uiMode = (changes.settings.newValue && changes.settings.newValue.ui) || 'panel';
  });

  S.onChange(async keys => {
    for (const k of keys) {
      const p = await S.get(k);
      if (p) cache.set(k, p); else cache.delete(k);
    }
    refreshBadges();
    refreshFab();
  });

  // ---------------- quét & gắn nút ----------------
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 120);
  }

  function pageChain() {
    const seg = S.normalizeChain(location.pathname.split('/')[1] || '');
    if (seg && S.CHAIN_LABELS[seg]) return seg;
    const q = S.normalizeChain(new URLSearchParams(location.search).get('chain') || '');
    return q && /^[a-z0-9-]{2,20}$/.test(q) ? q : null;
  }

  function scan() {
    if (location.href !== lastHref) { lastHref = location.href; hideTip(); }
    for (const a of document.querySelectorAll('a[href*="/token/"]')) {
      const t = S.parseTokenUrl(a.getAttribute('href'));
      if (t) decorate(a, t);
    }
    // Dự phòng: bảng g-table của gmgn có data-row-key = địa chỉ token nhưng hàng không phải thẻ <a>.
    const chain = pageChain();
    if (chain) {
      for (const row of document.querySelectorAll('[data-row-key]')) {
        if (row.querySelector('a[href*="/token/"]') || row.closest('a[href*="/token/"]')) continue;
        const address = S.normalizeAddress(row.getAttribute('data-row-key'));
        if (!address) continue;
        decorate(row, { chain, address, key: S.keyOf(chain, address) });
      }
    }
    refreshFab();
  }

  // Tìm text node đầu tiên trông giống symbol (bỏ số, giá, %, thời gian) và đang hiển thị.
  function findSymbolText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, seen = 0;
    while ((n = walker.nextNode()) && seen < 12) {
      const txt = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || el.closest('.noted-badge')) continue;
      seen++;
      if (!looksLikeSymbol(txt)) continue;
      if (!el.getClientRects().length) continue; // ẩn (sr-only, tooltip...)
      return n;
    }
    return null;
  }

  function looksLikeSymbol(t) {
    if (t.length > 24) return false;
    if (/^[\d.,%$+\-−~\s]+[kKmMbB]?$/.test(t)) return false;   // số, giá, %
    if (/^\d+\s?[smhdw]$/i.test(t) || /^\d+[.,]\d+[kKmMbB]$/.test(t)) return false; // 3d, 12h, 4,01K
    if (/^(copy|buy|sell|mua|bán|new|hot|live)$/i.test(t)) return false;
    return /[\p{L}\p{N}]/u.test(t);
  }

  function cleanSymbol(txt) {
    return String(txt || '').replace(/\s+/g, ' ').trim().replace(/^\$/, '').slice(0, 32);
  }

  const stop = ev => { ev.stopPropagation(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); };

  function makeBadge() {
    const b = document.createElement('span');
    b.className = 'noted-badge';
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', t('badge_title'));
    for (const ev of ['pointerdown', 'mouseup', 'auxclick', 'dblclick', 'touchend']) b.addEventListener(ev, stop);
    b.addEventListener('mousedown', ev => { stop(ev); ev.preventDefault(); });
    b.addEventListener('click', ev => { stop(ev); ev.preventDefault(); onBadgeClick(b); });
    b.addEventListener('mouseenter', () => showTip(b));
    b.addEventListener('mouseleave', hideTip);
    return b;
  }

  function decorate(container, t) {
    let badge = container.querySelector('.noted-badge');
    const tn = findSymbolText(container);
    if (!badge) {
      badge = makeBadge();
      if (tn) tn.parentNode.insertBefore(badge, tn.nextSibling);
      else {
        badge.classList.add('noted-badge--abs');
        container.appendChild(badge);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      }
    } else if (tn && badge.previousSibling !== tn && !badge.classList.contains('noted-badge--abs')) {
      // React vẽ lại text node: kéo nút về ngay sau symbol.
      tn.parentNode.insertBefore(badge, tn.nextSibling);
    }
    if (badge.dataset.key !== t.key) {
      badge.dataset.key = t.key;
      badge.dataset.chain = t.chain;
      badge.dataset.address = t.address;
    }
    if (container.getAttribute(ATTR) !== t.key) container.setAttribute(ATTR, t.key);
    paintBadge(badge);
  }

  function paintBadge(badge) {
    const p = cache.get(badge.dataset.key);
    const has = !!p, pin = !!(p && p.pinned);
    const n = p ? p.timeline.length : 0;
    const html = (pin ? ICON_PIN : ICON_NOTE) + (n ? `<span class="noted-badge__n">${n}</span>` : '');
    if (badge.__html !== html) { badge.innerHTML = html; badge.__html = html; }
    badge.classList.toggle('noted-badge--has', has);
    badge.classList.toggle('noted-badge--pin', pin);
    badge.title = has ? '' : t('badge_title');
  }

  function refreshBadges() {
    for (const b of document.querySelectorAll('.noted-badge')) paintBadge(b);
  }

  // Lấy MC (giá trị $ lớn nhất) trong hàng để lưu kèm mốc timeline.
  function captureMc(container) {
    let el = container;
    for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
      const txt = el.textContent || '';
      if (txt.length > 2500) break;
      let best = null, bestVal = -1;
      for (const m of txt.matchAll(/\$\s?(\d[\d,.]*)\s?([KMBT])?(?![\d,.])/gi)) {
        const num = parseFloat(m[1].replace(/,/g, '.').replace(/\.(?=.*\.)/g, ''));
        if (!isFinite(num)) continue;
        const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] || 1;
        const v = num * mult;
        if (v > bestVal) { bestVal = v; best = `$${m[1]}${m[2] ? m[2].toUpperCase() : ''}`; }
      }
      if (best) return best;
    }
    return null;
  }

  function symbolFor(container) {
    const tn = findSymbolText(container);
    return tn ? cleanSymbol(tn.nodeValue) : '';
  }

  function onBadgeClick(b) {
    const container = b.closest(`[${ATTR}]`) || b.parentElement;
    const t = { chain: b.dataset.chain, address: b.dataset.address, key: b.dataset.key };
    hideTip();
    openNote(t, { symbol: symbolFor(container), mc: captureMc(container) });
  }

  // Gửi background mở Side Panel. Gọi đồng bộ ngay trong click để giữ user gesture (sidePanel.open yêu cầu).
  function openNote(token, ctx) {
    const fallback = () => openDrawer(token, ctx);
    try {
      chrome.runtime.sendMessage({ type: 'noted:open', token, ctx, mode: uiMode }, res => {
        if (chrome.runtime.lastError || !res || res.mode !== 'panel') fallback();
        else if (openKey) closeDrawer();
      });
    } catch (_) { fallback(); }
  }

  // ---------------- tooltip ----------------
  function showTip(b) {
    const p = cache.get(b.dataset.key);
    if (!p || !tip) return;
    const st = S.STATUSES.find(s => s.id === p.status) || S.STATUSES[0];
    const last = [...p.timeline].sort((x, y) => y.ts - x.ts)[0];
    tip.innerHTML = `
      <div class="t-head">${p.pinned ? '📌 ' : ''}${E.esc(p.symbol || S.shortAddress(p.address))}${p.name ? `<span class="t-name">${E.esc(p.name)}</span>` : ''}<span class="t-st">${st.icon} ${E.esc(S.statusLabel(p.status))}</span>${p.rating ? `<span class="t-rate">${'★'.repeat(p.rating)}</span>` : ''}</div>
      <div class="t-sum">${p.summary ? E.esc(p.summary.slice(0, 280)) : `<span class="t-empty">${E.esc(t('tip_empty'))}</span>`}</div>
      ${p.tags.length ? `<div class="t-tags">${p.tags.map(x => '#' + E.esc(x)).join(' ')}</div>` : ''}
      ${last ? `<div class="t-last">${E.esc(E.relTime(last.ts))} · ${E.esc(last.text.slice(0, 140))}</div>` : ''}`;
    tip.hidden = false;
    const r = b.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideTip() { if (tip) tip.hidden = true; }

  // ---------------- drawer ----------------
  async function openDrawer(token, ctx = {}) {
    if (!editor) { await I.init(); mount(); }
    if (openKey && openKey !== token.key) await editor.flush();
    openKey = token.key;
    await editor.load({ ...token, symbol: ctx.symbol || '' }, { mc: ctx.mc || null });
    drawer.classList.add('open');
    setTimeout(() => editor.focus(), 200);
  }

  async function closeDrawer() {
    if (!openKey) return;
    await editor.flush();
    drawer.classList.remove('open');
    openKey = null;
  }

  function pageSymbol() {
    const t = S.parseTokenUrl(location.href);
    if (!t) return '';
    const cached = cache.get(t.key);
    if (cached && cached.symbol) return cached.symbol;
    const first = (document.title.split('|')[0] || '').trim().split(/\s+/)[0] || '';
    if (first && !/^gmgn/i.test(first) && looksLikeSymbol(first)) return cleanSymbol(first);
    const h1 = document.querySelector('h1');
    if (h1 && looksLikeSymbol(h1.textContent.trim())) return cleanSymbol(h1.textContent);
    const a = document.querySelector(`a[${ATTR}="${CSS.escape(t.key)}"]`);
    return a ? symbolFor(a) : '';
  }

  function toggleForPage() {
    const t = S.parseTokenUrl(location.href);
    if (!t) { toast(I.t('toast_open_token')); return; }
    if (openKey === t.key) closeDrawer();
    else openNote(t, { symbol: pageSymbol(), mc: null });
  }

  // Panel/popup hỏi symbol đang hiển thị cho một token.
  function pageInfoFor(key) {
    const t = S.parseTokenUrl(location.href);
    if (t && t.key === key) return { symbol: pageSymbol() };
    const a = document.querySelector(`[${ATTR}="${CSS.escape(key)}"]`);
    return { symbol: a ? symbolFor(a) : '' };
  }

  function refreshFab() {
    if (!fab) return;
    const tok = S.parseTokenUrl(location.href);
    if (!tok) { fab.hidden = true; return; }
    const p = cache.get(tok.key);
    const sym = (p && p.symbol) || pageSymbol();
    fab.hidden = false;
    fab.classList.toggle('has', !!p);
    fab.innerHTML = p
      ? `${p.pinned ? '📌' : '📝'} <b>${E.esc(sym || t('fab_note'))}</b>${p.summary ? `<span class="f-sum">${E.esc(p.summary.slice(0, 90))}</span>` : `<span class="f-sum">${E.esc(t('entries_count', { n: p.timeline.length }))}</span>`}`
      : `📝 ${E.esc(t('fab_note'))}${sym ? ' ' + E.esc(sym) : ''}`;
    fab.title = t('fab_title');
  }

  // ---------------- khởi động ----------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'noted:toggle':
        toggleForPage(); sendResponse({ ok: true }); break;
      case 'noted:open-drawer': { // background chọn chế độ overlay (hoặc Side Panel không mở được)
        const ctx = msg.ctx || {};
        const t = msg.token || S.parseTokenUrl(location.href);
        if (t) openDrawer(t, { symbol: ctx.symbol || (S.parseTokenUrl(location.href)?.key === t.key ? pageSymbol() : pageInfoFor(t.key).symbol), mc: ctx.mc || null });
        sendResponse({ ok: true }); break;
      }
      case 'noted:page-info':
        sendResponse(pageInfoFor(msg.key)); break;
      case 'noted:toast':
        toast(msg.key ? t(msg.key) : (msg.text || '')); sendResponse({ ok: true }); break;
    }
  });

  // Nạp ngôn ngữ trước khi dựng UI có chữ; việc quét/gắn nút không cần chờ.
  I.init().then(() => { mount(); return loadAll(); }).then(scan);
  scan();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
  });
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  if (globalThis.navigation && typeof navigation.addEventListener === 'function') {
    navigation.addEventListener('navigate', () => setTimeout(scheduleScan, 50));
  }
})();
