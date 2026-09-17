// NotedEditor: giao diện chỉnh sửa ghi chú cho một dự án. Dùng chung cho drawer trên gmgn.ai
// (gắn trong Shadow DOM) và cho dashboard. CSS được xuất ra dạng chuỗi để nơi dùng tự nhúng.
(() => {
  'use strict';
  if (globalThis.NotedEditor) return;
  const S = globalThis.NotedStore;
  const t = (key, vars) => (globalThis.NotedI18n ? globalThis.NotedI18n.t(key, vars) : key);

  const CSS = `
/* display tường minh đè lên display:none mặc định của [hidden]; thiếu dòng này thì el.hidden = true vô tác dụng */
[hidden]{display:none!important}
.ne{--ne-bg:#111318;--ne-bg2:#181b22;--ne-bg3:#20242d;--ne-line:#2b303a;--ne-fg:#e6e8ec;--ne-fg2:#9aa3b2;--ne-fg3:#6b7280;
  --ne-acc:#facc15;--ne-acc2:#f97316;--ne-green:#22c55e;--ne-red:#ef4444;--ne-blue:#60a5fa;
  box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--ne-fg);background:var(--ne-bg);
  font:var(--ne-fs,14px)/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.ne *{box-sizing:border-box}
.ne a{color:var(--ne-blue);text-decoration:none}.ne a:hover{text-decoration:underline}
.ne input,.ne textarea,.ne select{font:inherit;color:var(--ne-fg);background:var(--ne-bg2);border:1px solid var(--ne-line);border-radius:8px;padding:7px 9px;outline:none;width:100%}
.ne input:focus,.ne textarea:focus,.ne select:focus{border-color:#4b5563;box-shadow:0 0 0 2px rgba(250,204,21,.12)}
.ne textarea{resize:vertical;min-height:64px}
.ne button{font:inherit;cursor:pointer;border:1px solid var(--ne-line);background:var(--ne-bg3);color:var(--ne-fg);border-radius:8px;padding:6px 10px;line-height:1.2}
.ne button:hover{background:#2a2f3a}
.ne button.primary{background:var(--ne-acc);color:#111;border-color:var(--ne-acc);font-weight:600}
.ne button.primary:hover{background:#fde047}
.ne button.ghost{background:transparent;border-color:transparent;color:var(--ne-fg2);padding:4px 6px}
.ne button.ghost:hover{color:var(--ne-fg);background:var(--ne-bg3)}
.ne button.danger{color:#fca5a5;border-color:#3f1d1d;background:#1f1416}
.ne button.danger:hover{background:#2c1a1c}
.ne-head{padding:14px 16px 10px;border-bottom:1px solid var(--ne-line);background:var(--ne-bg2)}
.ne-titlerow{display:flex;align-items:center;gap:8px}
.ne .ne-symbol{font-weight:700;font-size:calc(var(--ne-fs,14px) + 5px);padding:4px 8px;width:auto;flex:1 1 120px;min-width:0;background:transparent;border-color:transparent}
.ne-symbol:hover,.ne-symbol:focus{background:var(--ne-bg);border-color:var(--ne-line)}
.ne-chain{font-size:calc(var(--ne-fs,14px) - 2px);font-weight:600;letter-spacing:.02em;color:#c7d2fe;background:rgba(99,102,241,.18);border:1px solid rgba(99,102,241,.35);border-radius:999px;padding:2px 8px;white-space:nowrap}
.ne .ne-pin{font-size:calc(var(--ne-fs,14px) + 2px);padding:4px 8px}
.ne-pin.on{background:rgba(249,115,22,.18);border-color:rgba(249,115,22,.6);color:#fdba74}
.ne-name{margin-top:6px;font-size:var(--ne-fs,14px);padding:5px 8px;background:transparent;border-color:transparent}
.ne-name:hover,.ne-name:focus{background:var(--ne-bg);border-color:var(--ne-line)}
.ne-addr{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:8px;font-size:calc(var(--ne-fs,14px) - 1px);color:var(--ne-fg2)}
.ne-addr code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ne-fg2)}
.ne-addr .ne-copy{padding:1px 6px;font-size:calc(var(--ne-fs,14px) - 2px)}
.ne-links{display:flex;gap:10px;margin-left:auto;align-items:center}
.ne .ne-grok{padding:3px 9px;font-size:calc(var(--ne-fs,14px) - 1px);font-weight:600;color:#ddd6fe;background:linear-gradient(180deg,rgba(139,92,246,.32),rgba(139,92,246,.18));border-color:rgba(167,139,250,.75)}
.ne-grok:hover{background:#8b5cf6;color:#fff}
.ne-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 16px 16px}
.ne-sec{margin-bottom:14px}
.ne-label{display:flex;align-items:center;justify-content:space-between;font-size:calc(var(--ne-fs,14px) - 2px);font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ne-fg3);margin:0 0 6px}
.ne-meta{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
.ne-meta select{padding:6px 8px}
.ne-stars{display:inline-flex;gap:2px;font-size:calc(var(--ne-fs,14px) + 7px);line-height:1;cursor:pointer;user-select:none}
.ne-stars span{color:#3f4553;transition:color .1s}
.ne-stars span.on{color:var(--ne-acc)}
.ne-stars:hover span{color:#3f4553}
.ne-stars span:hover,.ne-stars span:has(~ span:hover){color:#fde68a}
.ne-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px;border:1px solid var(--ne-line);border-radius:8px;background:var(--ne-bg2)}
.ne-tags input{flex:1 1 90px;min-width:70px;border:0;background:transparent;padding:3px 4px}
.ne-tags input:focus{box-shadow:none}
.ne-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;border-radius:999px;font-size:calc(var(--ne-fs,14px) - 1px);background:rgba(96,165,250,.14);border:1px solid rgba(96,165,250,.35);color:#bfdbfe}
.ne-chip b{font-weight:500}
.ne-chip button{padding:0 4px;border:0;background:transparent;color:inherit;font-size:var(--ne-fs,14px);line-height:1;opacity:.7}
.ne-chip button:hover{opacity:1;background:transparent}
.ne-compose{display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border:1px solid var(--ne-line);border-radius:10px;background:var(--ne-bg2)}
.ne-compose textarea{min-height:56px;background:var(--ne-bg)}
.ne-compose-row{display:flex;gap:6px;align-items:center}
.ne-compose-row select{width:auto;flex:0 0 auto;padding:5px 8px}
.ne-compose-row .ne-hint{flex:1;font-size:calc(var(--ne-fs,14px) - 2px);color:var(--ne-fg3)}
.ne-entries{list-style:none;margin:10px 0 0;padding:0;position:relative}
.ne-entries::before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:var(--ne-line)}
.ne-entry{position:relative;padding:0 0 12px 30px}
.ne-entry::before{content:"";position:absolute;left:4px;top:5px;width:12px;height:12px;border-radius:50%;background:var(--ne-bg3);border:2px solid #4b5563}
.ne-entry[data-type=buy]::before{border-color:var(--ne-green)}
.ne-entry[data-type=sell]::before{border-color:var(--ne-red)}
.ne-entry[data-type=alert]::before{border-color:var(--ne-acc2)}
.ne-entry[data-type=research]::before{border-color:var(--ne-blue)}
.ne-entry[data-type=news]::before{border-color:#a78bfa}
.ne-ehead{display:flex;align-items:center;gap:8px;font-size:calc(var(--ne-fs,14px) - 2px);color:var(--ne-fg3)}
.ne-ehead .ne-etype{font-size:calc(var(--ne-fs,14px) - 1px);color:var(--ne-fg2);font-weight:600}
.ne-ehead time{cursor:default}
.ne-ehead .ne-mc{color:var(--ne-fg3)}
.ne-ehead .ne-eactions{margin-left:auto;display:none;gap:2px}
.ne-entry:hover .ne-eactions{display:inline-flex}
.ne-eactions button{padding:0 5px;font-size:calc(var(--ne-fs,14px) - 1px)}
.ne-etext{margin-top:3px;white-space:pre-wrap;word-break:break-word}
.ne-etext a{word-break:break-all}
.ne-at{color:#f87171;font-weight:700}
.ne-entry textarea{margin-top:4px}
.ne-eimg{margin-top:6px}
.ne-eimg img{display:block;max-width:100%;max-height:260px;border:1px solid var(--ne-line);border-radius:8px;cursor:zoom-in;background:#000}
.ne-entry--new .ne-etext{border-radius:6px;animation:ne-flash 2.4s ease-out}
.ne-entry--new::before{border-color:var(--ne-acc);box-shadow:0 0 0 4px rgba(250,204,21,.18)}
@keyframes ne-flash{0%{background:rgba(250,204,21,.28);box-shadow:0 0 0 6px rgba(250,204,21,.28)}100%{background:transparent;box-shadow:none}}
.ne-empty{color:var(--ne-fg3);font-size:calc(var(--ne-fs,14px) - 1px);padding:8px 0 4px 30px}
.ne-foot{display:flex;align-items:center;gap:10px;padding:8px 16px;border-top:1px solid var(--ne-line);font-size:calc(var(--ne-fs,14px) - 2px);color:var(--ne-fg3);background:var(--ne-bg2);white-space:nowrap}
.ne-foot .ne-spacer{flex:1}
.ne-fs{display:inline-flex;align-items:center;gap:2px}
.ne-fs button{padding:0 6px;font-size:calc(var(--ne-fs,14px) - 2px);line-height:1.5;color:var(--ne-fg2)}
.ne-fs .ne-fsval{min-width:18px;text-align:center;font-variant-numeric:tabular-nums}
.ne-saved{color:var(--ne-green);opacity:0;transition:opacity .2s}
.ne-saved.show{opacity:1}
`;

  const ICONS = {
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Tên tài khoản (@handle) tô đỏ cho dễ nhận ra ai nói câu đó. Chạy trên chuỗi ĐÃ escape.
  function mentions(escaped) {
    return escaped.replace(/(^|[\s(\[<>"'*·:,])@([A-Za-z0-9_]{1,20})\b/g, (m, pre, h) => `${pre}<span class="ne-at">@${h}</span>`);
  }

  function linkify(text) {
    const parts = String(text ?? '').split(/(https?:\/\/[^\s<>"')\]]+)/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        let url = part, tail = '';
        const m = url.match(/[.,;:!?]+$/);
        if (m) { tail = m[0]; url = url.slice(0, -tail.length); }
        return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(url))}</a>${esc(tail)}`;
      }
      return mentions(esc(part));
    }).join('');
  }

  function shortUrl(u) {
    try {
      const x = new URL(u);
      const path = x.pathname.length > 32 ? x.pathname.slice(0, 30) + '…' : x.pathname;
      return x.hostname.replace(/^www\./, '') + (path === '/' ? '' : path);
    } catch (_) { return u; }
  }

  function relTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.round(diff / 60000);
    if (m < 1) return t('just_now');
    if (m < 60) return t('minutes_ago', { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return t('hours_ago', { n: h });
    const d = Math.round(h / 24);
    if (d < 7) return t('days_ago', { n: d });
    if (d < 30) return t('weeks_ago', { n: Math.round(d / 7) });
    return S.fmtDate(ts).slice(0, 10);
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function xSearchUrl(p) {
    const q = [p.symbol ? `$${p.symbol}` : '', p.address].filter(Boolean).join(' OR ');
    return `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
  }

  function create(opts = {}) {
    const root = el('div', 'ne');
    root.innerHTML = `
      <div class="ne-head">
        <div class="ne-titlerow">
          <input class="ne-symbol" placeholder="${esc(t('symbol_ph'))}" spellcheck="false" maxlength="32">
          <span class="ne-chain"></span>
          <button class="ne-pin" type="button" title="${esc(t('pin_title'))}">📌</button>
          ${opts.showClose === false ? '' : `<button class="ghost ne-close" type="button" title="${esc(t('close'))}">${ICONS.close}</button>`}
        </div>
        <input class="ne-name" placeholder="${esc(t('name_ph'))}" maxlength="140">
        <div class="ne-addr">
          <code class="ne-addrtext"></code>
          <button class="ne-copy" type="button" title="${esc(t('copy_addr'))}">${esc(t('copy'))}</button>
          <span class="ne-mcnow" hidden></span>
          <span class="ne-links">
            <a class="ne-l-gmgn" target="_blank" rel="noopener">GMGN</a>
            <a class="ne-l-x" target="_blank" rel="noopener">X</a>
            <a class="ne-l-dex" target="_blank" rel="noopener">DexScreener</a>
            <button class="ne-grok" type="button" title="${esc(t('research_btn'))}">${esc(t('research_btn'))}</button>
          </span>
        </div>
      </div>
      <div class="ne-body">
        <div class="ne-sec ne-meta">
          <label><div class="ne-label">${esc(t('status'))}</div><select class="ne-status"></select></label>
          <div><div class="ne-label">${esc(t('conviction'))}</div><div class="ne-stars" title="${esc(t('conviction_title'))}"></div></div>
        </div>
        <div class="ne-sec">
          <div class="ne-label">${esc(t('what_it_does'))}</div>
          <textarea class="ne-summary" placeholder="${esc(t('summary_ph'))}"></textarea>
        </div>
        <div class="ne-sec">
          <div class="ne-label">${esc(t('tags'))}</div>
          <div class="ne-tags"><input class="ne-taginput" placeholder="${esc(t('tag_ph'))}" list="ne-taglist"><datalist id="ne-taglist"></datalist></div>
        </div>
        <div class="ne-sec">
          <div class="ne-label">${esc(t('timeline'))} <span class="ne-count"></span></div>
          <div class="ne-compose">
            <textarea class="ne-newtext" placeholder="${esc(t('new_entry_ph'))}"></textarea>
            <div class="ne-compose-row">
              <select class="ne-newtype"></select>
              <span class="ne-hint"></span>
              <button class="primary ne-add" type="button">${esc(t('add'))}</button>
            </div>
          </div>
          <ol class="ne-entries"></ol>
        </div>
      </div>
      <div class="ne-foot">
        <span class="ne-times"></span>
        <span class="ne-saved">${esc(t('saved'))}</span>
        <span class="ne-spacer"></span>
        <span class="ne-fs" title="${esc(t('font_size'))}">
          <button class="ne-fs-down" type="button" aria-label="${esc(t('font_smaller'))}">A−</button>
          <span class="ne-fsval"></span>
          <button class="ne-fs-up" type="button" aria-label="${esc(t('font_bigger'))}">A+</button>
        </span>
        ${opts.showDashboardLink === false ? '' : `<a class="ne-dash" href="#">${esc(t('dashboard'))}</a>`}
        <button class="danger ne-delete" type="button">${esc(t('delete'))}</button>
      </div>`;

    const q = sel => root.querySelector(sel);
    const ui = {
      symbol: q('.ne-symbol'), chain: q('.ne-chain'), pin: q('.ne-pin'), close: q('.ne-close'),
      name: q('.ne-name'), addr: q('.ne-addrtext'), copy: q('.ne-copy'), mcnow: q('.ne-mcnow'),
      lGmgn: q('.ne-l-gmgn'), lX: q('.ne-l-x'), lDex: q('.ne-l-dex'), grok: q('.ne-grok'),
      status: q('.ne-status'), stars: q('.ne-stars'), summary: q('.ne-summary'),
      tags: q('.ne-tags'), tagInput: q('.ne-taginput'), tagList: q('#ne-taglist'),
      count: q('.ne-count'), newText: q('.ne-newtext'), newType: q('.ne-newtype'), hint: q('.ne-hint'), add: q('.ne-add'),
      entries: q('.ne-entries'), times: q('.ne-times'), saved: q('.ne-saved'), dash: q('.ne-dash'), del: q('.ne-delete'),
      fsVal: q('.ne-fsval'), fsDown: q('.ne-fs-down'), fsUp: q('.ne-fs-up'),
    };

    // Cỡ chữ: đọc từ settings, áp cho gốc editor, và theo dõi để mọi bảng ghi chú đang mở đổi theo cùng lúc.
    let fontPx = S.FONT.def;
    function applyFont(px) {
      fontPx = px;
      root.style.setProperty('--ne-fs', px + 'px');
      if (ui.fsVal) ui.fsVal.textContent = px;
      if (ui.fsDown) ui.fsDown.disabled = px <= S.FONT.min;
      if (ui.fsUp) ui.fsUp.disabled = px >= S.FONT.max;
    }
    applyFont(fontPx);
    S.watchFontSize(applyFont);
    // Áp ngay rồi mới ghi: bấm nhanh nhiều lần vẫn cộng dồn đúng (nếu đợi ghi xong mới cộng thì
    // các lần bấm liên tiếp cùng đọc một giá trị cũ và ăn mất nhau).
    const bumpFont = d => {
      const next = Math.min(S.FONT.max, Math.max(S.FONT.min, fontPx + d * S.FONT.step));
      if (next === fontPx) return;
      applyFont(next);
      S.setFontSize(next).catch(() => {});
    };
    if (ui.fsDown) ui.fsDown.addEventListener('click', () => bumpFont(-1));
    if (ui.fsUp) ui.fsUp.addEventListener('click', () => bumpFont(1));

    ui.status.innerHTML = S.STATUSES.map(s => `<option value="${s.id}">${s.icon} ${esc(S.statusLabel(s.id))}</option>`).join('');
    ui.newType.innerHTML = S.ENTRY_TYPES.map(x => `<option value="${x.id}">${x.icon} ${esc(S.entryLabel(x.id))}</option>`).join('');
    ui.stars.innerHTML = [1, 2, 3, 4, 5].map(n => `<span data-n="${n}">★</span>`).join('');

    let project = null;   // dự án đang mở (có thể chưa được lưu)
    let ctx = {};         // ngữ cảnh từ trang: { mc, highlight }
    let highlightId = ''; // id mốc vừa thêm từ nơi khác: tô sáng một lần cho người dùng thấy
    let removedIds = []; // mốc người dùng vừa xoá, để lần ghi sau không bị gộp trở lại
    let persisted = false;
    let saveTimer = null;
    let destroyed = false;

    async function load(token, context = {}) {
      ctx = context || {};
      highlightId = ctx.highlight || '';
      removedIds = [];
      const existing = await S.get(token.key);
      persisted = !!existing;
      project = existing || S.emptyProject(token.chain, token.address);
      if (!project.symbol && token.symbol) project.symbol = token.symbol;
      if (!project.name && token.name) project.name = token.name;
      render();
      return project;
    }

    function render() {
      if (!project || destroyed) return;
      ui.symbol.value = project.symbol || '';
      ui.name.value = project.name || '';
      ui.chain.textContent = S.chainLabel(project.chain);
      ui.addr.textContent = S.shortAddress(project.address);
      ui.addr.title = project.address;
      ui.lGmgn.href = S.tokenUrl(project);
      ui.lX.href = xSearchUrl(project);
      ui.lDex.href = `https://dexscreener.com/search?q=${encodeURIComponent(project.address)}`;
      ui.pin.classList.toggle('on', !!project.pinned);
      ui.status.value = project.status;
      ui.summary.value = project.summary || '';
      if (ctx.mc) { ui.mcnow.textContent = t('mc_now', { mc: ctx.mc }); ui.mcnow.hidden = false; } else ui.mcnow.hidden = true;
      renderStars();
      renderTags();
      renderTimeline();
      renderTimes();
      if (opts.allTags) {
        Promise.resolve(opts.allTags()).then(tags => {
          ui.tagList.innerHTML = (tags || []).map(t => `<option value="${esc(t)}">`).join('');
        });
      }
    }

    function renderStars() {
      for (const s of ui.stars.children) s.classList.toggle('on', Number(s.dataset.n) <= (project.rating || 0));
    }

    function renderTags() {
      for (const c of [...ui.tags.querySelectorAll('.ne-chip')]) c.remove();
      for (const t_ of project.tags) {
        const tag = t_;
        const chip = el('span', 'ne-chip', `<b>${esc(tag)}</b><button type="button" title="${esc(t('remove_tag'))}">×</button>`);
        chip.querySelector('button').addEventListener('click', () => {
          project.tags = project.tags.filter(x => x !== tag);
          renderTags(); commit();
        });
        ui.tags.insertBefore(chip, ui.tagInput);
      }
    }

    function renderTimeline() {
      const list = [...project.timeline].sort((a, b) => b.ts - a.ts);
      ui.count.textContent = list.length ? `(${list.length})` : '';
      ui.entries.innerHTML = '';
      if (!list.length) {
        ui.entries.appendChild(el('li', 'ne-empty', esc(t('no_entries'))));
        return;
      }
      for (const e of list) {
        const et = S.ENTRY_TYPES.find(x => x.id === e.type) || S.ENTRY_TYPES[0];
        const li = el('li', 'ne-entry');
        li.dataset.type = e.type;
        if (highlightId && e.id === highlightId) li.classList.add('ne-entry--new');
        li.innerHTML = `
          <div class="ne-ehead">
            <span class="ne-etype">${et.icon} ${esc(S.entryLabel(e.type))}</span>
            <time title="${esc(S.fmtDate(e.ts))}">${esc(relTime(e.ts))}</time>
            ${e.mc ? `<span class="ne-mc">${esc(t('mc_short'))} ${esc(e.mc)}</span>` : ''}
            <span class="ne-eactions">
              <button class="ghost ne-eedit" type="button" title="${esc(t('edit'))}">✎</button>
              <button class="ghost ne-edel" type="button" title="${esc(t('delete_entry'))}">×</button>
            </span>
          </div>
          <div class="ne-etext">${linkify(e.text)}</div>
          ${e.image ? `<div class="ne-eimg"><img alt="${esc(t('image_alt'))}" title="${esc(t('open_image'))}" loading="lazy"></div>` : ''}`;
        if (e.image) {
          const img = li.querySelector('.ne-eimg img');
          S.getImage(e.image).then(rec => { if (rec && rec.data) img.src = rec.data; else img.parentElement.remove(); }).catch(() => img.parentElement.remove());
          img.addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'noted:open-viewer', id: e.image }); } catch (_) {} });
        }
        li.querySelector('.ne-edel').addEventListener('click', () => {
          project.timeline = project.timeline.filter(x => x.id !== e.id);
          removedIds.push(e.id);
          if (e.image) S.removeImages([e.image]).catch(() => {});
          renderTimeline(); commit();
        });
        li.querySelector('.ne-eedit').addEventListener('click', () => beginEdit(li, e));
        ui.entries.appendChild(li);
      }
      if (highlightId) {
        const el2 = ui.entries.querySelector('.ne-entry--new');
        if (el2) setTimeout(() => el2.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
        setTimeout(() => { highlightId = ''; }, 2600);
      }
    }

    function beginEdit(li, e) {
      const textEl = li.querySelector('.ne-etext');
      const ta = el('textarea');
      ta.value = e.text;
      textEl.replaceWith(ta);
      ta.focus();
      const finish = (save) => {
        if (save) { const v = ta.value.trim(); if (v) e.text = v; }
        renderTimeline();
        if (save) commit();
      };
      ta.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) finish(true);
      });
      ta.addEventListener('blur', () => finish(true));
    }

    function renderTimes() {
      ui.times.textContent = persisted ? t('edited', { time: relTime(project.updatedAt) }) : t('not_saved');
      ui.times.title = persisted ? t('created_edited', { a: S.fmtDate(project.createdAt), b: S.fmtDate(project.updatedAt) }) : '';
    }

    function flashSaved() {
      ui.saved.classList.add('show');
      setTimeout(() => ui.saved.classList.remove('show'), 1200);
    }

    // Lưu ngay (các thay đổi rời rạc: tag, pin, status, timeline).
    async function commit() {
      if (!project || destroyed) return;
      clearTimeout(saveTimer);
      const before = project.timeline.length;
      project = await S.save(project, { removedIds });
      removedIds = [];
      if (project.timeline.length !== before) renderTimeline(); // có mốc từ nơi khác được gộp vào
      persisted = true;
      renderTimes();
      flashSaved();
      opts.onChange && opts.onChange(project);
    }

    // Lưu trễ (gõ chữ).
    function commitLater() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(commit, 450);
    }

    async function flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await commit(); }
    }

    function addTagsFromInput() {
      const raw = ui.tagInput.value;
      const tags = raw.split(/[,;\n]+/).map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
      if (!tags.length) return;
      for (const t of tags) if (!project.tags.includes(t)) project.tags.push(t);
      ui.tagInput.value = '';
      renderTags(); commit();
    }

    function addEntry() {
      const text = ui.newText.value.trim();
      if (!text) { ui.newText.focus(); return; }
      const extra = {};
      if (ctx.mc) extra.mc = ctx.mc;
      project.timeline.push(S.newEntry(ui.newType.value, text, extra));
      ui.newText.value = '';
      renderTimeline(); commit();
    }

    // ---- events ----
    ui.symbol.addEventListener('input', () => { project.symbol = ui.symbol.value.trim().toUpperCase(); ui.lX.href = xSearchUrl(project); commitLater(); });
    ui.name.addEventListener('input', () => { project.name = ui.name.value.trim(); commitLater(); });
    ui.summary.addEventListener('input', () => { project.summary = ui.summary.value; commitLater(); });
    ui.status.addEventListener('change', () => { project.status = ui.status.value; commit(); });
    ui.pin.addEventListener('click', () => { project.pinned = !project.pinned; ui.pin.classList.toggle('on', project.pinned); commit(); });
    ui.stars.addEventListener('click', ev => {
      const n = Number(ev.target && ev.target.dataset && ev.target.dataset.n);
      if (!n) return;
      project.rating = project.rating === n ? 0 : n;
      renderStars(); commit();
    });
    ui.copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(project.address); ui.copy.textContent = t('copied'); }
      catch (_) { ui.copy.textContent = t('copy_failed'); }
      setTimeout(() => (ui.copy.textContent = t('copy')), 1200);
    });
    ui.tagInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addTagsFromInput(); }
      else if (ev.key === 'Backspace' && !ui.tagInput.value && project.tags.length) { project.tags.pop(); renderTags(); commit(); }
    });
    ui.tagInput.addEventListener('blur', addTagsFromInput);
    ui.add.addEventListener('click', addEntry);
    ui.newText.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addEntry(); } });
    ui.newType.addEventListener('change', () => {
      const v = ui.newType.value;
      ui.hint.textContent = (v === 'buy' || v === 'sell') ? t('trade_hint') : '';
    });
    if (ui.dash) ui.dash.addEventListener('click', ev => { ev.preventDefault(); opts.onOpenDashboard && opts.onOpenDashboard(); });
    ui.del.addEventListener('click', async () => {
      if (!persisted) { opts.onClose && opts.onClose(); return; }
      if (!confirm(t('confirm_delete', { name: project.symbol || project.address }))) return;
      clearTimeout(saveTimer);
      await S.removeImages(project.timeline.map(e => e.image).filter(Boolean)).catch(() => {});
      await S.remove(project.key);
      persisted = false;
      opts.onDelete && opts.onDelete(project);
      opts.onClose && opts.onClose();
    });
    if (ui.close) ui.close.addEventListener('click', () => opts.onClose && opts.onClose());
    // Research với Grok: dựng prompt từ template rồi nhờ background mở tab Grok và nhớ token cho tab đó.
    ui.grok.addEventListener('click', async () => {
      const R = globalThis.NotedResearch;
      if (!R || !project) return;
      await flush();
      let settings = {};
      try { settings = (await chrome.storage.local.get('settings')).settings || {}; } catch (_) {}
      const lang = globalThis.NotedI18n ? globalThis.NotedI18n.lang : 'en';
      const prompt = R.buildPrompt(settings.researchTemplate || R.defaultTemplate(lang), R.vars(project, ctx));
      chrome.runtime.sendMessage({
        type: 'noted:open-grok', target: settings.researchTarget || 'x', prompt,
        token: { chain: project.chain, address: project.address, key: project.key }, symbol: project.symbol || '',
      });
    });
    // Không để phím gõ trong editor lọt ra trang gmgn (gmgn có phím tắt riêng).
    for (const evName of ['keydown', 'keyup', 'keypress']) {
      root.addEventListener(evName, ev => { if (ev.key !== 'Escape') ev.stopPropagation(); });
    }

    function focus() { (project && project.summary ? ui.newText : ui.summary).focus(); }
    function destroy() { destroyed = true; clearTimeout(saveTimer); root.remove(); }

    return {
      el: root, load, render, flush, focus, destroy,
      get project() { return project; },
      get isPersisted() { return persisted; },
    };
  }

  globalThis.NotedEditor = { CSS, create, esc, linkify, relTime };
})();
