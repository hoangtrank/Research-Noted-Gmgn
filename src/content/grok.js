// Content script trên trang Grok (x.com/i/grok, grok.com): panel nổi "Save to Research-Noted-Gmgn".
// Bắt câu trả lời mới nhất (heuristic không phụ thuộc class của X) hoặc dùng phần người dùng bôi đen,
// rồi gửi background lưu vào timeline của token đã gắn với tab này.
(() => {
  'use strict';
  if (window.__notedGrokLoaded) return;
  window.__notedGrokLoaded = true;
  const S = globalThis.NotedStore;
  const I = globalThis.NotedI18n;
  if (!S || !I) return;
  const t = (k, v) => I.t(k, v);

  const CSS = `
:host{all:initial}
.g{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:min(380px,calc(100vw - 32px));font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#e6e8ec}
.g *{box-sizing:border-box}
.pill{display:flex;align-items:center;gap:8px;margin-left:auto;width:max-content;max-width:100%;padding:8px 12px;border-radius:999px;border:1px solid rgba(167,139,250,.7);background:linear-gradient(180deg,#2a1f4d,#1c1730);color:#e9e5ff;font-weight:600;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.pill:hover{filter:brightness(1.15)}
.box{margin-top:8px;border:1px solid #2b303a;border-radius:12px;background:#111318;box-shadow:0 18px 48px rgba(0,0,0,.55);overflow:hidden}
.box[hidden]{display:none}
.head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#181b22;border-bottom:1px solid #2b303a}
.head b{font-size:13px}
.head .sym{color:#fde047}
.head .x{margin-left:auto;background:transparent;border:0;color:#9aa3b2;font-size:18px;line-height:1;cursor:pointer;padding:0 4px}
.body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.hint{color:#9aa3b2;font-size:12px}
textarea{width:100%;min-height:120px;max-height:40vh;resize:vertical;font:inherit;color:#e6e8ec;background:#181b22;border:1px solid #2b303a;border-radius:8px;padding:8px;outline:none}
textarea:focus{border-color:#4b5563}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{font:inherit;cursor:pointer;border:1px solid #2b303a;background:#20242d;color:#e6e8ec;border-radius:8px;padding:6px 10px}
button:hover{background:#2a2f3a}
button.primary{margin-left:auto;background:#facc15;border-color:#facc15;color:#111;font-weight:700}
button.primary:hover{background:#fde047}
button:disabled{opacity:.5;cursor:default}
select,input{font:inherit;color:#e6e8ec;background:#181b22;border:1px solid #2b303a;border-radius:8px;padding:6px 8px;min-width:0}
select{flex:1 1 160px}
input{flex:1 1 160px}
.status{font-size:12px;color:#9aa3b2;min-height:16px}
.status.ok{color:#22c55e}
.status.err{color:#f87171}
.status a{color:#60a5fa;text-decoration:none}
.auto{display:flex;align-items:center;gap:6px;cursor:pointer}
.auto input{margin:0}
.autostat{font-size:11px;color:#6b7280;min-height:14px}
`;

  let ctxInfo = null;          // { token, symbol, prompt }
  let autoSave = true;         // settings.grokAutoSave
  const savedHashes = new Set(); // nội dung đã lưu trong tab này (chống trùng)
  let lastSeen = { hash: '', since: 0 };
  let lastSaved = null;        // { entryId, symbol } để Hoàn tác
  let autoTimer = 0;

  function hashText(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return `${h}:${s.length}`; }
  const host = document.createElement('div');
  host.id = 'noted-grok-host';
  const shadow = host.attachShadow({ mode: 'open' });

  function render() {
    const linked = !!(ctxInfo && ctxInfo.token);
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="g">
        <button class="pill" type="button">✨ ${esc(t('app_name'))}${linked ? ` · <span class="sym">${I.t('grok_linked', { symbol: esc(ctxInfo.symbol || S.shortAddress(ctxInfo.token.address)) })}</span>` : ''}</button>
        <div class="box" ${linked ? '' : 'hidden'}>
          <div class="head"><b>✨ ${esc(t('app_name'))}</b>${linked ? `<span class="sym">${esc(ctxInfo.symbol || S.shortAddress(ctxInfo.token.address))}</span><span class="hint">${esc(S.chainLabel(ctxInfo.token.chain))}</span>` : `<span class="hint">${esc(t('grok_unlinked'))}</span>`}<button class="x" type="button" title="${esc(t('close_plain'))}">×</button></div>
          <div class="body">
            ${linked ? `<div class="hint">${esc(t('grok_hint'))}</div>` : `<div class="hint">${esc(t('grok_unlinked_hint'))}</div>
              <div class="row"><select class="recent"><option value="">${esc(t('grok_recent'))}</option></select></div>
              <div class="row"><input class="linkurl" placeholder="${esc(t('grok_link_ph'))}"><button class="linkbtn" type="button">${esc(t('grok_link'))}</button></div>`}
            <textarea class="text" placeholder="${esc(t('grok_empty'))}"></textarea>
            <div class="row">
              <button class="cap" type="button">${esc(t('grok_capture'))}</button>
              <button class="sel" type="button">${esc(t('grok_selection'))}</button>
              <button class="save primary" type="button" ${linked ? '' : 'disabled'}>${esc(t('grok_save'))}</button>
            </div>
            ${linked && ctxInfo.prompt ? `<label class="hint auto"><input type="checkbox" class="autochk" ${autoSave ? 'checked' : ''}> ${esc(t('grok_auto'))}</label>
            <div class="autostat"></div>` : ''}
            <div class="status"></div>
          </div>
        </div>
      </div>`;
    const q = sel => shadow.querySelector(sel);
    const box = q('.box'), status = q('.status'), text = q('.text');
    q('.pill').addEventListener('click', () => { box.hidden = !box.hidden; });
    q('.x').addEventListener('click', () => { box.hidden = true; });
    q('.cap').addEventListener('click', () => { const v = captureLastAnswer(); if (v) { text.value = v; setStatus(''); } else setStatus(t('grok_empty'), 'err'); });
    q('.sel').addEventListener('click', () => { const v = String(window.getSelection && window.getSelection().toString() || '').trim(); if (v) { text.value = v; setStatus(''); } else setStatus(t('grok_empty'), 'err'); });
    q('.save').addEventListener('click', () => save(text.value));
    const autochk = q('.autochk');
    if (autochk) autochk.addEventListener('change', async () => {
      autoSave = autochk.checked;
      autoCheck();
      try { const r = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...(r.settings || {}), grokAutoSave: autoSave } }); } catch (_) {}
    });
    if (!linked) {
      const sel = q('.recent');
      chrome.runtime.sendMessage({ type: 'noted:recent-projects' }, list => {
        if (chrome.runtime.lastError || !Array.isArray(list)) return;
        for (const p of list) {
          const o = document.createElement('option');
          o.value = p.key; o.textContent = `${p.symbol || S.shortAddress(p.address)}${p.name ? ` — ${p.name}` : ''} (${S.chainLabel(p.chain)})`;
          sel.appendChild(o);
        }
      });
      sel.addEventListener('change', () => { const [chain, address] = sel.value.split(':'); if (chain && address) link({ chain, address, key: sel.value }); });
      q('.linkbtn').addEventListener('click', () => { const tk = S.parseTokenUrl(q('.linkurl').value.trim()); if (tk) link(tk); else setStatus(t('bad_url'), 'err'); });
    }
    function setStatus(msg, cls) { status.className = 'status' + (cls ? ' ' + cls : ''); status.textContent = msg; }
    render.setStatus = setStatus;
    render.textEl = text;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function link(token) {
    chrome.runtime.sendMessage({ type: 'noted:grok-link', token }, res => {
      if (chrome.runtime.lastError || !res || !res.ok) return;
      const keep = render.textEl ? render.textEl.value : '';
      ctxInfo = { token: res.token, symbol: res.symbol, prompt: res.prompt };
      render();
      if (render.textEl) render.textEl.value = keep;
    });
  }

  function save(value, opts = {}) {
    const text = String(value || '').trim();
    if (!text) { render.setStatus(t('grok_nothing'), 'err'); return; }
    savedHashes.add(hashText(text));
    const u = new URL(location.href);
    u.searchParams.delete('text'); u.searchParams.delete('q');
    chrome.runtime.sendMessage({ type: 'noted:grok-save', text, url: u.toString(), sourceLabel: t('grok_source') }, res => {
      if (chrome.runtime.lastError || !res || !res.ok) { render.setStatus(t('grok_unlinked'), 'err'); return; }
      const sym = res.symbol || S.shortAddress(ctxInfo.token.address);
      const st = shadow.querySelector('.status');
      st.className = 'status ok';
      const label = res.duplicate ? t('grok_dup') : (opts.auto ? t('grok_autosaved', { symbol: sym }) : t('grok_saved', { symbol: sym }));
      st.innerHTML = `${esc(label)}${res.duplicate ? '' : ` · <a href="#" class="undo">${esc(t('undo'))}</a>`} · <a href="#" class="opendash">${esc(t('grok_open_dashboard'))}</a>`;
      if (!res.duplicate) lastSaved = { entryId: res.entryId, symbol: sym };
      // Trang web không được điều hướng tới chrome-extension://, nên nhờ background mở tab dashboard.
      st.querySelector('.opendash').addEventListener('click', ev => { ev.preventDefault(); chrome.runtime.sendMessage({ type: 'noted:open-dashboard', key: res.key }); });
      const undo = st.querySelector('.undo');
      if (undo) undo.addEventListener('click', ev => {
        ev.preventDefault();
        if (!lastSaved) return;
        chrome.runtime.sendMessage({ type: 'noted:grok-unsave', entryId: lastSaved.entryId }, r2 => {
          if (chrome.runtime.lastError || !r2 || !r2.ok) return;
          lastSaved = null; // giữ hash trong savedHashes để auto không lưu lại đúng nội dung vừa hoàn tác
          render.setStatus(t('grok_undone'), '');
        });
      });
    });
  }

  // ---- Tự lưu: sau khi prompt đã được gửi, câu trả lời mới nhất giữ nguyên ≥ 3s (hết streaming) thì lưu ----
  // Dấu nhận ra bong bóng prompt: 60 ký tự đầu, và địa chỉ contract — địa chỉ luôn nguyên vẹn dù giao diện
  // xuống dòng hay rút gọn đoạn văn, nên bắt được cả khi phần chữ đầu bị cắt.
  function promptSigs() {
    if (!ctxInfo || !ctxInfo.prompt) return [];
    const full = norm(ctxInfo.prompt);
    const out = [];
    const head = full.slice(0, 60);
    if (head) out.push(head);
    const addr = ctxInfo.token ? norm(ctxInfo.token.address) : '';
    if (addr && addr.length >= 20 && full.includes(addr)) out.push(addr);
    return out;
  }

  // Bong bóng chứa prompt của người dùng (khối tối giản đầu tiên khớp một dấu nhận), null nếu chưa gửi.
  // Có xét cả <span>: trên X phần chữ nằm trong span, nếu chỉ xét div thì khối nào cũng bị coi là "còn sâu hơn".
  function promptBubble() {
    const sigs = promptSigs();
    if (!sigs.length) return null;
    const composer = document.querySelector('[contenteditable="true"], textarea');
    const hit = el => { const x = norm(el.textContent); return sigs.some(sig => x.includes(sig)); };
    for (const el of document.querySelectorAll('div, p, article, section, span')) {
      if (host.contains(el) || el.closest('[contenteditable], textarea, form')) continue;
      if (composer && el.contains(composer)) continue;
      if (!hit(el)) continue;
      let deeper = false;
      for (const c of el.children) if (hit(c)) { deeper = true; break; }
      if (deeper) continue;
      if (!el.getClientRects().length) continue;
      return el;
    }
    return null;
  }

  // Prompt coi như đã gửi khi ô nhập không còn giữ nó (giao diện xoá ô nhập sau khi gửi).
  function promptSent() {
    const sigs = promptSigs();
    if (!sigs.length) return false;
    const composer = document.querySelector('[contenteditable="true"], textarea');
    if (!composer) return true;
    const v = norm(composer.value !== undefined ? composer.value : composer.textContent);
    return !sigs.some(sig => v.includes(sig));
  }

  function setAuto(key) {
    const el = shadow.querySelector('.autostat');
    if (el) el.textContent = key ? t(key) : '';
  }

  function autoCheck() {
    if (!ctxInfo || !ctxInfo.token || !ctxInfo.prompt) return;
    if (!autoSave) { setAuto('grok_auto_off'); return; }
    const bubble = promptBubble();
    // Không thấy bong bóng prompt (giao diện đổi, prompt bị rút gọn): vẫn chạy nếu ô nhập đã được gửi đi,
    // chỉ bỏ qua những khối có chứa chính prompt.
    if (!bubble && !promptSent()) { setAuto('grok_auto_wait'); return; }
    const text = captureLastAnswer(bubble);
    if (!text || text.length < 80) { setAuto('grok_auto_read'); return; }
    setAuto('grok_auto_read');
    const h = hashText(text);
    if (savedHashes.has(h)) return;
    const now = Date.now();
    if (lastSeen.hash !== h) { lastSeen = { hash: h, since: now }; return; }
    if (now - lastSeen.since < 3000) return;
    if (render.textEl) render.textEl.value = text;
    save(text, { auto: true });
  }

  function startAutoWatch() {
    const mo = new MutationObserver(() => { clearTimeout(autoTimer); autoTimer = setTimeout(autoCheck, 1500); });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(autoCheck, 2000);
  }

  // Tìm khối văn bản "tối giản" cuối cùng trước ô nhập, bỏ khối chứa prompt và khối chứa ô nhập.
  function captureLastAnswer(afterEl) {
    const composer = document.querySelector('[contenteditable="true"], textarea');
    const promptHead = ctxInfo && ctxInfo.prompt ? norm(ctxInfo.prompt).slice(0, 60) : '';
    const after = afterEl || promptBubble();
    const cands = [];
    for (const el of document.querySelectorAll('div, article, section, p, li, span')) {
      if (host.contains(el)) continue;
      if (el.closest('[contenteditable], textarea, form, nav, header, footer, aside, [role="navigation"], [role="complementary"], [role="banner"]')) continue;
      if (composer && el.contains(composer)) continue;
      const txt = el.textContent || '';
      const len = txt.trim().length;
      if (len < 120 || len > 30000) continue;
      let dominated = false;
      for (const c of el.children) { if (((c.textContent || '').trim().length) >= len * 0.9) { dominated = true; break; } }
      if (dominated) continue;
      if (!el.getClientRects().length) continue;
      if (promptHead && norm(txt).includes(promptHead)) continue;
      if (after && (el === after || el.contains(after))) continue;
      if (after && !(after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue; // chỉ khối sau prompt
      cands.push(el);
    }
    const top = cands.filter(el => !cands.some(o => o !== el && o.contains(el)));
    let pick = null;
    if (composer) for (const b of top) { if (composer.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) pick = b; }
    if (!pick && top.length) pick = top[top.length - 1];
    return pick ? (pick.innerText || pick.textContent || '').trim() : '';
  }

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  async function start() {
    await I.init();
    try { const r = await chrome.storage.local.get('settings'); autoSave = !(r.settings && r.settings.grokAutoSave === false); } catch (_) {}
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        const v = changes.settings.newValue && changes.settings.newValue.grokAutoSave;
        autoSave = v !== false;
        const chk = shadow.querySelector('.autochk');
        if (chk) chk.checked = autoSave;
      }
    });
    chrome.runtime.sendMessage({ type: 'noted:grok-context' }, res => {
      if (!chrome.runtime.lastError && res && res.token) ctxInfo = res;
      render();
      (document.body || document.documentElement).appendChild(host);
      startAutoWatch();
    });
  }
  start();
})();
