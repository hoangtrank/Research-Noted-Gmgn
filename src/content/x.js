// Content script trên feed X (x.com, twitter.com): nút ✎ trên mỗi bài đăng để lưu bài (chữ, tác giả, link,
// tuỳ chọn ảnh chụp) vào timeline của một dự án. Ảnh chụp cần activeTab: chuột phải -> menu, hoặc Alt+S.
(() => {
  'use strict';
  if (window.__notedXLoaded) return;
  window.__notedXLoaded = true;
  if (/^\/i\/grok/.test(location.pathname)) return; // trang Grok có content script riêng
  const S = globalThis.NotedStore;
  const I = globalThis.NotedI18n;
  if (!S || !I) return;
  const t = (k, v) => I.t(k, v);

  const CSS = `
:host{all:initial}
.pk{position:fixed;z-index:2147483000;width:min(360px,calc(100vw - 24px));font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#e6e8ec;background:#111318;border:1px solid #2b303a;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.55);overflow:hidden}
.pk *{box-sizing:border-box}
.head{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#181b22;border-bottom:1px solid #2b303a;font-weight:700}
.head .x{margin-left:auto;background:transparent;border:0;color:#9aa3b2;font-size:18px;line-height:1;cursor:pointer;padding:0 4px}
.body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.lbl{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b7280}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:3px 9px;border-radius:999px;border:1px solid rgba(96,165,250,.35);background:rgba(96,165,250,.14);color:#bfdbfe;cursor:pointer;font-size:12px}
.chip.on,.chip:hover{background:#60a5fa;color:#0b1220;border-color:#60a5fa}
input,select{font:inherit;color:#e6e8ec;background:#181b22;border:1px solid #2b303a;border-radius:8px;padding:6px 8px;width:100%}
input:focus{outline:none;border-color:#4b5563}
.list{max-height:180px;overflow:auto;border:1px solid #2b303a;border-radius:8px}
.item{padding:6px 9px;cursor:pointer;display:flex;gap:8px;align-items:baseline}
.item:hover,.item.on{background:#20242d}
.item b{font-weight:700}.item span{color:#9aa3b2;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row{display:flex;gap:8px;align-items:center}
.row select{width:auto;flex:1}
label.chk{display:flex;align-items:center;gap:6px;color:#9aa3b2;font-size:12px;cursor:pointer}
button.save{font:inherit;cursor:pointer;border:1px solid #facc15;background:#facc15;color:#111;border-radius:8px;padding:7px 12px;font-weight:700}
button.save:disabled{opacity:.5;cursor:default}
.status{font-size:12px;color:#9aa3b2;min-height:16px}
.status.ok{color:#22c55e}.status.err{color:#f87171}.status.warn{color:#fbbf24}
.status a{color:#60a5fa;text-decoration:none}
.empty{color:#9aa3b2;font-size:12px}
`;
  const BTN_CSS = `
.noted-x-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin-left:4px;border-radius:999px;border:1px solid transparent;color:#71767b;cursor:pointer;flex:0 0 auto;transition:background .12s,color .12s}
.noted-x-btn svg{width:18px;height:18px}
.noted-x-btn:hover{background:rgba(139,92,246,.18);color:#a78bfa}
.noted-x-btn--saved{color:#facc15}
.noted-x-btn--saved:hover{background:rgba(250,204,21,.18);color:#fde047}
.noted-x-btn--abs{position:absolute;right:8px;top:8px;z-index:5;background:rgba(0,0,0,.4)}
`;
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  let projects = [];          // {key, chain, address, symbol, name}
  let savedMap = {};          // tweetId -> {key, entryId, symbol}
  let shotDefault = true;     // settings.xScreenshot
  let lastContextArticle = null; // bài được chuột phải / rê chuột gần nhất
  let host, shadow, picker;
  let current = null;         // { article, tweet, selectedKey, armed }

  // ---------- dữ liệu ----------
  async function loadData() {
    try {
      const all = await S.getAll();
      projects = all.sort((a, b) => b.updatedAt - a.updatedAt).map(p => ({ key: p.key, chain: p.chain, address: p.address, symbol: p.symbol, name: p.name }));
    } catch (_) { projects = []; }
    await new Promise(res => chrome.runtime.sendMessage({ type: 'noted:x-saved-ids' }, r => { savedMap = (!chrome.runtime.lastError && r) || {}; res(); }));
    try { const r = await chrome.storage.local.get('settings'); shotDefault = !(r.settings && r.settings.xScreenshot === false); } catch (_) {}
    paintAll();
  }
  let reloadTimer = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some(k => k.startsWith(S.PREFIX) || k === 'settings')) { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadData, 400); }
  });

  // ---------- nhận diện bài ----------
  function articles() { return document.querySelectorAll('article[data-testid="tweet"], article[role="article"]'); }

  function extractTweet(article) {
    let url = '', id = '', author = '';
    for (const a of article.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,20})\/status\/(\d{1,30})(?:$|[/?#])/);
      if (m) { url = `https://x.com/${m[1]}/status/${m[2]}`; id = m[2]; author = `@${m[1]}`; break; }
    }
    const textEl = article.querySelector('[data-testid="tweetText"]');
    let text = (textEl ? textEl.innerText : article.innerText || '').replace(/\s+\n/g, '\n').trim();
    if (!textEl) text = text.split('\n').filter(l => l.trim()).slice(0, 12).join('\n').slice(0, 2000);
    const nameEl = article.querySelector('[data-testid="User-Name"]');
    const display = nameEl ? (nameEl.textContent || '').trim().split(/\s*@/)[0].slice(0, 60) : '';
    const timeEl = article.querySelector('time[datetime]');
    const time = timeEl ? timeEl.getAttribute('datetime') : '';
    const cashtags = [...new Set([...text.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,15})\b/g)].map(m => m[1].toUpperCase()))];
    const addresses = [...new Set([...text.matchAll(/\b(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g)].map(m => S.normalizeAddress(m[1])).filter(Boolean))];
    return { id, url, author: display ? `${author} (${display})` : author, text, time, cashtags, addresses };
  }

  function suggestions(tweet) {
    const out = [];
    for (const p of projects) {
      if (tweet.addresses.includes(p.address) || (p.symbol && tweet.cashtags.includes(p.symbol.toUpperCase()))) out.push(p);
    }
    return out.slice(0, 6);
  }

  // ---------- nút trên bài ----------
  function ensureButtonStyle() {
    if (document.getElementById('noted-x-style')) return;
    const st = document.createElement('style');
    st.id = 'noted-x-style';
    st.textContent = BTN_CSS;
    document.documentElement.appendChild(st);
  }

  function decorate(article) {
    let btn = article.querySelector('.noted-x-btn');
    if (!btn) {
      btn = document.createElement('div');
      btn.className = 'noted-x-btn';
      btn.setAttribute('role', 'button');
      btn.innerHTML = ICON;
      for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'auxclick', 'dblclick']) btn.addEventListener(ev, e => { e.stopPropagation(); });
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPicker(article, false); });
      const group = article.querySelector('[role="group"]');
      if (group) group.appendChild(btn);
      else { btn.classList.add('noted-x-btn--abs'); article.appendChild(btn); if (getComputedStyle(article).position === 'static') article.style.position = 'relative'; }
    }
    paint(article, btn);
  }

  function paint(article, btn) {
    btn = btn || article.querySelector('.noted-x-btn');
    if (!btn) return;
    const tw = extractTweet(article);
    const s = tw.id && savedMap[tw.id];
    btn.classList.toggle('noted-x-btn--saved', !!s);
    btn.title = s ? t('x_saved_btn', { symbol: s.symbol || s.key }) : t('x_btn');
  }

  function paintAll() { for (const a of articles()) paint(a); }

  let scanTimer = 0;
  function scan() { ensureButtonStyle(); for (const a of articles()) decorate(a); }
  function scheduleScan() { if (scanTimer) return; scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 150); }

  // ---------- picker ----------
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'noted-x-host';
    shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && picker) closePicker(); }, true);
    document.addEventListener('mousedown', ev => { if (picker && ev.target !== host && !host.contains(ev.target)) closePicker(); }, true);
  }

  function closePicker() { if (picker) { picker.remove(); picker = null; } current = null; }

  function openPicker(article, armed) {
    mount();
    closePicker();
    const tweet = extractTweet(article);
    current = { article, tweet, selectedKey: null, armed: !!armed };
    picker = document.createElement('div');
    picker.className = 'pk';
    const sug = suggestions(tweet);
    picker.innerHTML = `<style>${CSS}</style>
      <div class="head">✎ ${esc(t('x_pick'))}<button class="x" type="button">×</button></div>
      <div class="body">
        ${projects.length ? '' : `<div class="empty">${esc(t('x_no_projects'))}</div>`}
        ${sug.length ? `<div class="lbl">${esc(t('x_suggested'))}</div><div class="chips">${sug.map(p => `<span class="chip" data-key="${esc(p.key)}">${esc(p.symbol || S.shortAddress(p.address))}</span>`).join('')}</div>` : ''}
        <input class="q" placeholder="${esc(t('x_search_ph'))}">
        <div class="list"></div>
        <div class="row"><select class="type">${S.ENTRY_TYPES.map(x => `<option value="${x.id}" ${x.id === 'news' ? 'selected' : ''}>${x.icon} ${esc(S.entryLabel(x.id))}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" class="shot" ${shotDefault ? 'checked' : ''}> ${esc(t('x_screenshot'))}</label></div>
        <div class="row"><button class="save" type="button" disabled>${esc(t('grok_save'))}</button><span class="status"></span></div>
        ${armed ? '' : `<div class="empty">${esc(t('x_shot_hint'))}</div>`}
      </div>`;
    shadow.appendChild(picker);
    const q = sel => picker.querySelector(sel);
    const list = q('.list'), input = q('.q'), saveBtn = q('.save');
    const renderList = () => {
      const needle = input.value.trim().toLowerCase();
      const items = projects.filter(p => !needle || (p.symbol || '').toLowerCase().includes(needle) || (p.name || '').toLowerCase().includes(needle) || p.address.toLowerCase().includes(needle)).slice(0, 30);
      list.innerHTML = items.map(p => `<div class="item${current.selectedKey === p.key ? ' on' : ''}" data-key="${esc(p.key)}"><b>${esc(p.symbol || S.shortAddress(p.address))}</b><span>${esc(p.name || S.chainLabel(p.chain))}</span></div>`).join('') || `<div class="item"><span>—</span></div>`;
    };
    const select = key => { current.selectedKey = key; saveBtn.disabled = !key; for (const c of picker.querySelectorAll('.chip')) c.classList.toggle('on', c.dataset.key === key); renderList(); };
    renderList();
    input.addEventListener('input', renderList);
    list.addEventListener('click', ev => { const it = ev.target.closest('.item'); if (it && it.dataset.key) select(it.dataset.key); });
    for (const c of picker.querySelectorAll('.chip')) c.addEventListener('click', () => select(c.dataset.key));
    if (sug.length === 1) select(sug[0].key);
    q('.x').addEventListener('click', closePicker);
    saveBtn.addEventListener('click', () => doSave(q('.type').value, q('.shot').checked));
    // đặt cạnh nút của bài
    const btn = article.querySelector('.noted-x-btn');
    const r = (btn || article).getBoundingClientRect();
    picker.style.left = `${Math.max(12, Math.min(window.innerWidth - 372, r.left - 300))}px`;
    picker.style.top = `${Math.min(window.innerHeight - 320, r.bottom + 8)}px`;
    setTimeout(() => input.focus(), 50);
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function setStatus(msg, cls) { const st = picker && picker.querySelector('.status'); if (st) { st.className = 'status' + (cls ? ' ' + cls : ''); st.textContent = msg; } }

  async function doSave(entryType, withShot) {
    if (!current || !current.selectedKey) return;
    const { article, tweet, selectedKey } = current;
    const saveBtn = picker.querySelector('.save');
    saveBtn.disabled = true;
    let capture = null;
    if (withShot) {
      // Cuộn bài vào tầm nhìn, ẩn UI của extension, đo khung bài (Chrome chỉ chụp phần đang thấy).
      article.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => setTimeout(r, 350));
      const btn = article.querySelector('.noted-x-btn');
      host.style.visibility = 'hidden';
      if (btn) btn.style.visibility = 'hidden';
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));
      const r = article.getBoundingClientRect();
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      capture = { x, y, w: Math.min(r.right, window.innerWidth) - x, h: Math.min(r.bottom, window.innerHeight) - y, dpr: window.devicePixelRatio || 1 };
      if (capture.w < 20 || capture.h < 20) capture = null;
    }
    const res = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'noted:x-save', key: selectedKey, tweet, entryType, capture }, r => resolve(chrome.runtime.lastError ? null : r)));
    host.style.visibility = '';
    const btn = article.querySelector('.noted-x-btn');
    if (btn) btn.style.visibility = '';
    if (!res || !res.ok) { setStatus(t('grok_unlinked'), 'err'); saveBtn.disabled = false; return; }
    if (tweet.id) savedMap[tweet.id] = { key: res.key, entryId: res.entryId, symbol: res.symbol };
    paint(article);
    const st = picker.querySelector('.status');
    const sym = res.symbol || selectedKey;
    saveBtn.disabled = false; // cho phép lưu tiếp sang dự án khác
    st.className = res.duplicate ? 'status warn' : 'status ok';
    st.innerHTML = `${esc(res.duplicate ? t('grok_dup') : t('x_saved', { symbol: sym }))}${!res.duplicate && res.imageError ? ` · <span class="warn">${esc(t('x_shot_failed'))}</span>` : ''} · <a href="#" class="undo">${esc(t('undo'))}</a>`;
    if (res.imageError) console.info('[Research-Noted-Gmgn] X screenshot skipped:', res.imageError);
    st.querySelector('.undo').addEventListener('click', ev => {
      ev.preventDefault();
      chrome.runtime.sendMessage({ type: 'noted:x-unsave', key: res.key, entryId: res.entryId }, r2 => {
        if (chrome.runtime.lastError || !r2 || !r2.ok) return;
        if (tweet.id) delete savedMap[tweet.id];
        paint(article);
        setStatus(t('grok_undone'), '');
        saveBtn.disabled = false;
      });
    });
  }

  // ---------- ngữ cảnh chuột phải / phím tắt ----------
  document.addEventListener('contextmenu', ev => { const a = ev.target && ev.target.closest && ev.target.closest('article'); if (a) lastContextArticle = a; }, true);
  document.addEventListener('mouseover', ev => { const a = ev.target && ev.target.closest && ev.target.closest('article'); if (a) lastContextArticle = a; }, true);

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (!msg || msg.type !== 'noted:x-context') return;
    const a = (lastContextArticle && lastContextArticle.isConnected && lastContextArticle) || [...articles()].find(x => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight / 2; });
    if (a) openPicker(a, true);
    sendResponse({ ok: !!a });
  });

  // ---------- khởi động ----------
  I.init().then(loadData).then(() => { scan(); });
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scheduleScan, 15000);
})();
