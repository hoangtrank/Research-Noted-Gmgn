// Lõi content script dùng chung cho các site (gmgn.ai, dexscreener.com). Site cụ thể được mô tả bởi
// window.__notedAdapter (nạp trước file này): tìm phần tử token trong trang, đổi tham chiếu -> token, token của trang.
// Lõi lo: gắn nút cạnh symbol, tooltip, nút nổi (FAB), gửi mở Side Panel (dự phòng drawer Shadow DOM), i18n.
(() => {
  'use strict';
  if (window.__notedCoreLoaded) return;
  window.__notedCoreLoaded = true;

  const S = globalThis.NotedStore;
  const E = globalThis.NotedEditor;
  const I = globalThis.NotedI18n;
  const A = window.__notedAdapter;
  if (!S || !E || !I || !A) return;
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
.nd-fab .f-sum{font-weight:400;color:#9aa3b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.nd-fab .f-lbl{font-weight:600}
.nd-fab .f-chain{font-weight:500;font-size:11px;color:#c7d2fe;background:rgba(99,102,241,.22);border-radius:999px;padding:2px 8px;white-space:nowrap}
.nd-fab.has .f-chain{color:#fde68a;background:rgba(250,204,21,.18)}
.nd-sel{position:fixed;left:0;top:0;z-index:2147483001;display:flex;align-items:center;gap:7px;white-space:nowrap;max-width:min(340px,calc(100vw - 24px));padding:7px 13px;border-radius:999px;border:1px solid #facc15;background:#facc15;color:#111;font:700 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);cursor:pointer;transition:transform .1s}
.nd-sel:hover{transform:translateY(-1px);background:#fde047}
.nd-sel .s-txt{font-weight:400;color:#3f3a12;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
.nd-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:8px 14px;border-radius:999px;background:#20242d;color:#e6e8ec;border:1px solid #2b303a;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .15s;pointer-events:none}
.nd-toast.show{opacity:1}
`;

  let host, shadow, drawer, editor, tip, fab, toastEl, selBtn;
  let lastSelection = '';
  let openKey = null;      // key đang mở trong drawer (chế độ overlay)
  let uiMode = 'panel';    // settings.ui: 'panel' | 'drawer'
  let listBadges = false;  // settings.listBadges: có gắn nút ✎ vào từng hàng token trong danh sách không (mặc định chỉ nút nổi)
  let pageToken = null;    // token của trang hiện tại (đã resolve)
  let lastPageKey = undefined;
  let lastHref = location.href;
  let scanTimer = 0, scanning = false, rescan = false;
  let toastTimer = 0;

  // ---------------- tiện ích dùng chung (adapter gọi qua window.__notedCore) ----------------
  function looksLikeSymbol(s) {
    if (s.length > 24) return false;
    if (/^#?\d+$/.test(s) || /^[\d.,%$+\-−~\s]+[kKmMbB]?$/.test(s)) return false;   // rank, số, giá, %
    if (/^\d+\s?[smhdw]$/i.test(s) || /^\d+[.,]\d+[kKmMbB]$/.test(s)) return false; // 3d, 12h, 4,01K
    if (/^(copy|buy|sell|mua|bán|new|hot|live|\/)$/i.test(s)) return false;
    return /[\p{L}\p{N}]/u.test(s);
  }

  function cleanSymbol(txt) {
    return String(txt || '').replace(/\s+/g, ' ').trim().replace(/^\$/, '').slice(0, 32);
  }

  // Text node đầu tiên trông giống symbol (bỏ số, giá, %, thời gian) và đang hiển thị.
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
      if (!el.getClientRects().length) continue;
      return n;
    }
    return null;
  }

  function symbolFor(container) {
    const tn = findSymbolText(container);
    return tn ? cleanSymbol(tn.nodeValue) : '';
  }

  // Giá trị $ lớn nhất trong hàng (xấp xỉ MC) để lưu kèm mốc timeline.
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

  window.__notedCore = { looksLikeSymbol, cleanSymbol, findSymbolText, symbolFor, captureMc };

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

    if (A.selectionSave) {
      selBtn = document.createElement('button');
      selBtn.type = 'button';
      selBtn.className = 'nd-sel';
      selBtn.hidden = true;
      selBtn.addEventListener('mousedown', ev => ev.preventDefault()); // giữ nguyên vùng bôi đen khi bấm
      selBtn.addEventListener('click', saveSelection);
      shadow.appendChild(selBtn);
      let selTimer = 0;
      document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(refreshSelection, 200); });
    }

    (document.body || document.documentElement).appendChild(host);

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (selBtn && !selBtn.hidden) { selBtn.hidden = true; return; }
      if (openKey) { ev.stopPropagation(); closeDrawer(); }
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
  function applySettings(st) {
    st = st || {};
    uiMode = st.ui || 'panel';
    const next = !!st.listBadges;
    if (listBadges && !next) for (const b of document.querySelectorAll('.noted-badge')) b.remove();
    listBadges = next;
    if (listBadges) scheduleScan();
  }

  async function loadAll() {
    const [all, r] = await Promise.all([S.getAll(), chrome.storage.local.get('settings')]);
    applySettings(r.settings);
    cache.clear();
    for (const p of all) cache.set(p.key, p);
    refreshBadges();
    refreshFab();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applySettings(changes.settings.newValue);
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

  async function scan() {
    if (scanning) { rescan = true; return; }
    scanning = true;
    try {
      if (location.href !== lastHref) { lastHref = location.href; hideTip(); }
      const targets = listBadges ? A.scanTargets() : [];
      const pending = new Set();
      for (const x of targets) if (x.ref && x.ref.pending) pending.add(x.ref.pending);
      const pr = A.pageRef ? A.pageRef() : null;
      if (pr && pr.pending) pending.add(pr.pending);
      let resolved = new Map();
      if (pending.size) { try { resolved = await A.resolve([...pending]); } catch (_) { resolved = new Map(); } }
      for (const x of targets) {
        const token = x.ref.pending ? resolved.get(x.ref.pending) : x.ref;
        if (token && x.el.isConnected) decorate(x.el, token);
      }
      pageToken = pr ? (pr.pending ? resolved.get(pr.pending) || null : pr) : null;
      const key = pageToken ? pageToken.key : null;
      if (key !== lastPageKey) { lastPageKey = key; announcePageToken(true); }
      refreshFab();
    } finally {
      scanning = false;
      if (rescan) { rescan = false; scheduleScan(); }
    }
  }

  // Báo background token của trang (để Side Panel "theo dõi" trang và phím tắt biết token). Symbol trên trang SPA
  // có thể cập nhật muộn hơn URL, nên thử lại một lần sau 800ms nếu chưa có.
  let announceTimer = 0;
  function announcePageToken(retry) {
    clearTimeout(announceTimer);
    const tk = pageToken;
    const ctx = tk ? { symbol: pageSymbol(), mc: tk.mc || null } : {};
    try {
      chrome.runtime.sendMessage({ type: 'noted:page-token', token: tk ? { chain: tk.chain, address: tk.address, key: tk.key } : null, ctx }, () => void chrome.runtime.lastError);
    } catch (_) {}
    if (retry && tk && !ctx.symbol) announceTimer = setTimeout(() => { if (pageToken && pageToken.key === tk.key) announcePageToken(false); }, 800);
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

  function decorate(container, token) {
    let badge = container.querySelector('.noted-badge');
    const tn = (A.symbolNode && A.symbolNode(container, token)) || findSymbolText(container);
    if (!badge) {
      badge = makeBadge();
      if (tn) tn.parentNode.insertBefore(badge, tn.nextSibling);
      else {
        badge.classList.add('noted-badge--abs');
        container.appendChild(badge);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      }
    } else if (tn && badge.previousSibling !== tn && !badge.classList.contains('noted-badge--abs')) {
      tn.parentNode.insertBefore(badge, tn.nextSibling); // React vẽ lại text node: kéo nút về ngay sau symbol
    }
    if (badge.dataset.key !== token.key) {
      badge.dataset.key = token.key;
      badge.dataset.chain = token.chain;
      badge.dataset.address = token.address;
    }
    badge.dataset.symbol = token.symbol || '';
    if (container.getAttribute(ATTR) !== token.key) container.setAttribute(ATTR, token.key);
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

  function tokenOf(badge) {
    return { chain: badge.dataset.chain, address: badge.dataset.address, key: badge.dataset.key, symbol: badge.dataset.symbol || '' };
  }

  function onBadgeClick(b) {
    const container = b.closest(`[${ATTR}]`) || b.parentElement;
    const token = tokenOf(b);
    const chain = S.normalizeChain(token.chain), address = S.normalizeAddress(token.address);
    if (!/^[a-z0-9-]{2,20}$/.test(chain) || !address) return; // thuộc tính bị trang sửa -> bỏ qua
    token.chain = chain; token.address = address; token.key = S.keyOf(chain, address);
    const p = cache.get(token.key);
    const ctx = A.clickContext ? A.clickContext(container, token) : { symbol: symbolFor(container), mc: captureMc(container) };
    if (!ctx.symbol) ctx.symbol = (p && p.symbol) || token.symbol || '';
    hideTip();
    openNote({ chain: token.chain, address: token.address, key: token.key }, ctx);
  }

  // Gửi background mở Side Panel. Gọi đồng bộ ngay trong click để giữ user gesture (sidePanel.open yêu cầu).
  function openNote(token, ctx, toggle) {
    const fallback = () => openDrawer(token, ctx);
    try {
      chrome.runtime.sendMessage({ type: 'noted:open', token, ctx, mode: uiMode, toggle: !!toggle }, res => {
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

  // ---------------- drawer (dự phòng) ----------------
  async function openDrawer(token, ctx = {}) {
    if (!editor) { await I.init(); mount(); }
    if (openKey && openKey !== token.key) await editor.flush();
    openKey = token.key;
    await editor.load({ ...token, symbol: ctx.symbol || '' }, { mc: ctx.mc || null, highlight: ctx.highlight || '' });
    drawer.classList.add('open');
    setTimeout(() => editor.focus(), 200);
  }

  async function closeDrawer() {
    if (!openKey) return;
    await editor.flush();
    drawer.classList.remove('open');
    openKey = null;
  }

  // ---------------- token của trang ----------------
  function pageSymbol() {
    if (!pageToken) return '';
    const cached = cache.get(pageToken.key);
    if (cached && cached.symbol) return cached.symbol;
    if (pageToken.symbol) return pageToken.symbol;
    const fromAdapter = A.pageSymbol ? A.pageSymbol() : '';
    if (fromAdapter) return fromAdapter;
    const el = document.querySelector(`[${ATTR}="${CSS.escape(pageToken.key)}"]`);
    return el ? symbolFor(el) : '';
  }

  function toggleForPage() {
    if (!pageToken) { toast(t('toast_open_token')); return; }
    if (openKey === pageToken.key) closeDrawer();
    else openNote({ chain: pageToken.chain, address: pageToken.address, key: pageToken.key }, { symbol: pageSymbol(), mc: pageToken.mc || null }, true);
  }

  // Panel/popup hỏi symbol đang hiển thị cho một token.
  function pageInfoFor(key) {
    if (pageToken && pageToken.key === key) return { symbol: pageSymbol() };
    const el = document.querySelector(`[${ATTR}="${CSS.escape(key)}"]`);
    if (!el) return { symbol: '' };
    const b = el.querySelector('.noted-badge');
    return { symbol: (b && b.dataset.symbol) || symbolFor(el) };
  }

  function refreshFab() {
    if (!fab) return;
    if (!pageToken) { fab.hidden = true; return; }
    const p = cache.get(pageToken.key);
    const sym = (p && p.symbol) || pageSymbol();
    fab.hidden = false;
    fab.classList.toggle('has', !!p);
    const chain = A.fabChain ? `<span class="f-chain">${E.esc(S.chainLabel(pageToken.chain))}</span>` : '';
    fab.innerHTML = p
      ? `${p.pinned ? '📌' : '📝'} <b>${E.esc(sym || t('fab_note'))}</b>${chain}${p.summary ? `<span class="f-sum">${E.esc(p.summary.slice(0, 80))}</span>` : `<span class="f-sum">${E.esc(t('entries_count', { n: p.timeline.length }))}</span>`}`
      : `📝 <span class="f-lbl">${E.esc(t('fab_note'))}</span>${sym ? ` <b>${E.esc(sym)}</b>` : ''}${chain}`;
    fab.title = t('fab_title');
    refreshSelection();
  }

  // ---------------- lưu đoạn chữ đang bôi đen vào timeline của token đang xem ----------------
  function refreshSelection() {
    if (!selBtn) return;
    const sel = window.getSelection && window.getSelection();
    const text = sel && !sel.isCollapsed ? String(sel.toString() || '').trim() : '';
    if (!text) { selBtn.hidden = true; return; }
    if (text.length < 3 || !pageToken) return;
    lastSelection = text;
    const p = cache.get(pageToken.key);
    const sym = (p && p.symbol) || pageSymbol() || S.shortAddress(pageToken.address);
    selBtn.innerHTML = `＋ ${E.esc(t('sel_save', { symbol: sym }))}<span class="s-txt">${E.esc(text.slice(0, 48))}</span>`;
    selBtn.hidden = false;
    placeSelBtn(sel);
  }

  // Nút bám ngay dưới (hoặc trên) vùng bôi đen cho khỏi phải đưa mắt đi xa.
  function placeSelBtn(sel) {
    let r = null;
    try { r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null; } catch (_) {}
    const w = selBtn.offsetWidth || 240, h = selBtn.offsetHeight || 34;
    if (!r || (!r.width && !r.height)) { selBtn.style.left = `${window.innerWidth - w - 16}px`; selBtn.style.top = `${window.innerHeight - h - 96}px`; return; }
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    selBtn.style.left = `${left}px`;
    selBtn.style.top = `${top}px`;
  }

  function saveSelection() {
    if (!pageToken || !lastSelection) return;
    const sel = window.getSelection && window.getSelection();
    let src = (A.selectionSource && sel && A.selectionSource(sel)) || null;
    if (typeof src === 'string') src = { url: src };
    const url = (src && src.url) || location.href;
    const author = (src && src.author) || '';
    const token = { chain: pageToken.chain, address: pageToken.address, key: pageToken.key };
    const p = cache.get(pageToken.key);
    const symbol = (p && p.symbol) || pageSymbol() || pageToken.symbol || '';
    const text = author ? `${author}: ${lastSelection}` : lastSelection; // mở đầu bằng tên tài khoản của bài chứa đoạn bôi đen
    selBtn.hidden = true;
    // openPanel: background mở side panel ngay trong cú bấm này (giữ user gesture) rồi hiện mốc vừa lưu.
    chrome.runtime.sendMessage({ type: 'noted:add-entry', token, symbol, entryType: 'research', text, url, sourceLabel: t('grok_source'), openPanel: true, mode: uiMode }, res => {
      if (chrome.runtime.lastError || !res || !res.ok) { toast(t('grok_nothing')); refreshSelection(); return; }
      toast(t('sel_saved', { symbol: res.symbol || symbol || S.shortAddress(token.address) }));
      lastSelection = '';
      if (sel) sel.removeAllRanges();
    });
  }

  // ---------------- khởi động ----------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'noted:toggle':
        toggleForPage(); sendResponse({ ok: true }); break;
      case 'noted:open-drawer': { // background chọn chế độ overlay (hoặc Side Panel không mở được)
        const ctx = msg.ctx || {};
        const tk = msg.token || pageToken;
        if (tk) openDrawer(tk, { symbol: ctx.symbol || (pageToken && pageToken.key === tk.key ? pageSymbol() : pageInfoFor(tk.key).symbol), mc: ctx.mc || null });
        sendResponse({ ok: true }); break;
      }
      case 'noted:page-info':
        sendResponse(pageInfoFor(msg.key)); break;
      case 'noted:get-page-token':
        sendResponse({ token: pageToken ? { chain: pageToken.chain, address: pageToken.address, key: pageToken.key } : null, symbol: pageSymbol() }); break;
      case 'noted:toast':
        toast(msg.key ? t(msg.key) : (msg.text || '')); sendResponse({ ok: true }); break;
    }
  });

  I.init().then(() => { mount(); return loadAll(); }).then(scan);
  scan();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
  });
  setInterval(scheduleScan, 20000); // quét lại định kỳ: lấp các hàng tra API hụt / phần tử vẽ muộn
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  if (globalThis.navigation && typeof navigation.addEventListener === 'function') {
    navigation.addEventListener('navigate', () => setTimeout(scheduleScan, 50));
  }
})();
