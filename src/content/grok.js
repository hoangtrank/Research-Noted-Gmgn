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
button.primary{background:#facc15;border-color:#facc15;color:#111;font-weight:700}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.actions button{width:100%;min-height:34px;padding:6px 8px;text-align:center;line-height:1.25}
.actions .cap,.actions .sel{font-size:12px;color:#cbd5e1}
.actions .primary{grid-column:1/-1;min-height:38px;font-size:13px}
button.primary:hover{background:#fde047}
button:disabled{opacity:.5;cursor:default}
select,input{font:inherit;color:#e6e8ec;background:#181b22;border:1px solid #2b303a;border-radius:8px;padding:6px 8px;min-width:0}
select{flex:1 1 160px}
input:not([type=checkbox]){flex:1 1 160px}
.status{font-size:12px;color:#9aa3b2;min-height:16px}
.status.ok{color:#22c55e}
.status.err{color:#f87171}
.status a{color:#60a5fa;text-decoration:none}
.foot{display:flex;flex-direction:column;gap:3px;padding-top:8px;border-top:1px solid #20242d}
.auto{display:inline-flex;align-items:center;gap:7px;width:max-content;max-width:100%;cursor:pointer;color:#cbd5e1}
.auto input{flex:none;width:15px;height:15px;margin:0;padding:0;accent-color:#facc15;cursor:pointer}
.autostat{font-size:11px;color:#6b7280;min-height:14px;padding-left:22px}
.foot .status{padding-left:22px}
`;

  let ctxInfo = null;          // { token, symbol, prompt }
  let autoSave = true;         // settings.grokAutoSave
  const savedHashes = new Set(); // nội dung đã lưu trong tab này (chống trùng)
  let lastSeen = { hash: '', since: 0 };
  let lastSaved = null;        // { entryId, symbol } để Hoàn tác
  let autoTimer = 0;

  // Extension vừa được reload/cập nhật: script này là bản CŨ còn sót trong tab, đã mất kết nối — mọi lệnh chrome.*
  // ném "Extension context invalidated". Dừng hẳn vòng tự lưu và nói cho người dùng biết phải tải lại tab.
  const alive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };
  let watchTimer = 0, watchObserver = null;
  function orphaned() {
    if (alive()) return false;
    clearInterval(watchTimer); clearTimeout(autoTimer);
    if (watchObserver) { watchObserver.disconnect(); watchObserver = null; }
    try { setAuto(''); if (render.setStatus) render.setStatus(t('ext_reloaded'), 'err'); } catch (_) {}
    return true;
  }
  // X là ứng dụng một trang: script nạp ở /i/grok vẫn sống khi người dùng chuyển sang /notifications, /home…
  // Ở những trang đó không có gì để bắt cả.
  const onGrokPage = () => /(^|\.)grok\.com$/.test(location.hostname) || /^\/i\/grok/.test(location.pathname);

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
            <div class="actions">
              <button class="cap" type="button">${esc(t('grok_capture'))}</button>
              <button class="sel" type="button">${esc(t('grok_selection'))}</button>
              <button class="save primary" type="button" ${linked ? '' : 'disabled'}>${esc(t('grok_save'))}</button>
            </div>
            <div class="foot">
              ${linked ? `<label class="auto"><input type="checkbox" class="autochk" ${autoSave ? 'checked' : ''}><span>${esc(t('grok_auto'))}</span></label>
              <div class="autostat"></div>` : ''}
              <div class="status"></div>
            </div>
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
      if (orphaned()) return;
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
    if (orphaned()) return;
    chrome.runtime.sendMessage({ type: 'noted:grok-link', token }, res => {
      if (chrome.runtime.lastError || !res || !res.ok) return;
      const keep = render.textEl ? render.textEl.value : '';
      ctxInfo = { token: res.token, symbol: res.symbol, prompt: res.prompt };
      render();
      if (render.textEl) render.textEl.value = keep;
    });
  }

  function save(value, opts = {}) {
    if (orphaned()) return;
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
      st.querySelector('.opendash').addEventListener('click', ev => { ev.preventDefault(); if (!orphaned()) chrome.runtime.sendMessage({ type: 'noted:open-dashboard', key: res.key }); });
      const undo = st.querySelector('.undo');
      if (undo) undo.addEventListener('click', ev => {
        ev.preventDefault();
        if (!lastSaved || orphaned()) return;
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
    if (!ctxInfo) return [];
    const full = norm(ctxInfo.prompt || '');
    const out = [];
    const head = full.slice(0, 60);
    if (head) out.push(head);
    // Địa chỉ contract là dấu nhận đủ mạnh kể cả khi tab không mang theo prompt (gắn dự án bằng tay,
    // hoặc content script hỏi ngữ cảnh trước lúc background kịp lưu): chính nó nằm trong câu hỏi đã gửi.
    const addr = ctxInfo.token ? norm(ctxInfo.token.address) : '';
    if (addr && addr.length >= 20 && (!full || full.includes(addr))) out.push(addr);
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

  // Trên X thật, prompt nhiều đoạn hiện thành MỘT tin nhắn gồm nhiều khối con (span/ol cho từng đoạn), còn
  // promptBubble() chỉ trả về khối nhỏ nhất chứa dấu nhận — tức đoạn đầu. Nếu chỉ loại đoạn đầu, các đoạn sau của
  // chính prompt (ví dụ mục MEME dài 168 ký tự) bị coi là "câu trả lời" và bị lưu. Leo lên tới cả tin nhắn.
  function promptMessage(bubble) {
    if (!bubble) return null;
    const len = el => (el.textContent || '').trim().length;
    const promptLen = ctxInfo && ctxInfo.prompt ? norm(ctxInfo.prompt).length : 0;
    const composer = document.querySelector('[contenteditable="true"], textarea');
    // Khối cha còn là prompt khi cả ĐẦU lẫn ĐUÔI chữ của nó nằm trong prompt (bỏ hết khoảng trắng vì các đoạn bị
    // nối liền). Chỉ so độ dài là sai: câu trả lời ngắn hơn prompt nhiều thì cả cuộc trò chuyện vẫn "vừa" và bị
    // coi là prompt, không bao giờ được lưu.
    const flat = x => String(x || '').replace(/\s+/g, '').toLowerCase();
    const pp = promptLen ? flat(ctxInfo.prompt) : '';
    const partOfPrompt = node => { const tx = flat(node.textContent); return tx.length <= pp.length * 1.25 + 50 && pp.includes(tx.slice(0, 32)) && pp.includes(tx.slice(-32)); };
    let el = bubble;
    for (let p = el.parentElement; p && p !== document.body && !host.contains(p); p = el.parentElement) {
      if (composer && p.contains(composer)) break;
      if (promptLen) { if (len(p) > len(el) * 1.02 + 2 && !partOfPrompt(p)) break; }
      // Không biết prompt (tab gắn tay): tin nhắn của người dùng không có nút nào, còn tin nhắn của Grok thì có.
      else if (p.querySelector('button, [role="button"]')) break;
      el = p;
    }
    return el;
  }

  // Tin nhắn của Grok chứa khối trả lời: leo lên tới ngay dưới khối chung với tin nhắn prompt.
  function answerMessage(block, promptMsg) {
    let el = block;
    while (el.parentElement && el.parentElement !== document.body && !(promptMsg && el.parentElement.contains(promptMsg))) el = el.parentElement;
    return el;
  }

  // Grok trả lời xong thì X mới gắn hàng nút dưới tin nhắn (Tạo lại, Sao chép, Chia sẻ, Thích, Không thích…); lúc
  // còn đang tra cứu/viết thì chỉ có nhiều nhất nút "Suy nghĩ". Nhãn nút đổi theo ngôn ngữ nên chỉ đếm số nút.
  function answerFinished(block, promptMsg) {
    if (!block || !promptMsg) return false;
    return answerMessage(block, promptMsg).querySelectorAll('button, [role="button"]').length >= 3;
  }

  // Đọc chữ của một khối thay cho innerText. Trên X mỗi link trong câu trả lời là <div inline-flex><a block>, nên
  // innerText chèn xuống dòng trước và sau link và chỉ lấy chữ hiển thị ("x.com/abc") — trong ghi chú link nằm lẻ
  // một dòng và không bấm được. Ở đây link được giữ liền dòng và ghi bằng URL đầy đủ; @handle giữ nguyên;
  // danh sách <ol> được đánh số, <ul> có bullet.
  function readText(root) {
    let out = '';
    const BLOCK = /^(block|flex|grid|list-item|table|table-row|flow-root)$/;
    const brk = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const onlyLink = el => { const a = el.querySelector('a[href]'); return !!a && (el.textContent || '').trim() === (a.textContent || '').trim(); };
    const linkText = a => {
      const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      let href = ''; try { href = new URL(a.getAttribute('href'), location.href).href; } catch (_) {}
      if (!/^https?:\/\//.test(href) || /^@[A-Za-z0-9_]{1,20}$/.test(label)) return label;
      const urlLike = !/\s/.test(label) && /[./]/.test(label);
      return urlLike || !label ? href : `${label} ${href}`;
    };
    const walk = (node, pre) => {
      if (node.nodeType === 3) { out += pre ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' '); return; }
      if (node.nodeType !== 1 || host.contains(node)) return;
      const tag = node.tagName;
      if (tag === 'BR') { out += '\n'; return; }
      if (tag === 'A' && node.getAttribute('href')) {
        const t = linkText(node);
        if (t) { if (out && !/[\s(\[“"']$/.test(out)) out += ' '; out += t; }
        return;
      }
      if (/^(SCRIPT|STYLE|BUTTON|SVG|IMG|VIDEO)$/i.test(tag)) return;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const block = BLOCK.test(cs.display) && !onlyLink(node);
      if (block) brk();
      if (tag === 'LI') {
        const list = node.parentElement;
        const bulleted = /^\s*[•·▪◦*-]/.test(node.textContent || '');
        if (list && list.tagName === 'OL') out += `${[...list.children].indexOf(node) + 1}. `;
        else if (!bulleted) out += '• ';
      }
      const keep = /^pre/.test(cs.whiteSpace);
      for (const c of node.childNodes) walk(c, keep);
      if (block) brk();
    };
    walk(root, /^pre/.test(getComputedStyle(root).whiteSpace));
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Các bước "đang suy nghĩ" của Grok dính liền vào đầu câu trả lời, không có khoảng trắng sau dấu chấm
  // ("…tương tác thật.DEV"). Trong DÒNG ĐẦU, cắt tới ranh giới dính liền cuối cùng; văn bản bình thường luôn có
  // khoảng trắng sau dấu câu nên không bị đụng tới.
  function stripThinking(text) {
    const nl = text.indexOf('\n');
    const first = nl < 0 ? text : text.slice(0, nl);
    let cut = -1;
    const re = /[.!?…。](?=\p{Lu})/gu;
    for (let m; (m = re.exec(first));) cut = m.index + 1;
    return cut > 0 ? text.slice(cut).trim() : text;
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
    if (orphaned() || !onGrokPage()) return;
    if (!ctxInfo || !ctxInfo.token || !promptSigs().length) return;
    if (!autoSave) { setAuto('grok_auto_off'); return; }
    const bubble = promptBubble();
    const hasPrompt = !!String(ctxInfo.prompt || '').trim();
    if (!bubble) {
      // Không thấy câu hỏi của CHÍNH token này trên trang (60 ký tự đầu của prompt, hoặc địa chỉ contract) thì
      // không lưu gì cả — kể cả với tab mở từ nút Research with Grok. Trước đây tab loại đó chỉ cần "ô nhập không
      // còn chứa prompt" là coi như đã gửi; nhưng X có lúc mở lại cuộc trò chuyện CŨ và không điền prompt mới
      // (URL dài, vừa đăng nhập lại): ô nhập trống bị hiểu là đã gửi, và câu trả lời về token trước bị lưu vào
      // token này. Địa chỉ contract nằm ngay đầu prompt nên bong bóng bị rút gọn vẫn nhận ra được.
      setAuto(hasPrompt && !promptSent() ? 'grok_auto_wait' : 'grok_auto_ca');
      return;
    }
    const promptMsg = promptMessage(bubble);
    const block = captureLastAnswerBlock(promptMsg);
    const text = block ? stripThinking(readText(block)) : '';
    if (!text || text.length < 80) { setAuto('grok_auto_read'); return; }
    const h = hashText(text);
    if (savedHashes.has(h)) { setAuto(''); return; }   // đã lưu rồi: dòng "Đã tự lưu…" bên dưới nói đủ
    setAuto('grok_auto_read');
    const now = Date.now();
    if (lastSeen.hash !== h) { lastSeen = { hash: h, since: now }; return; }
    // Có hàng nút dưới tin nhắn = Grok đã xong: chờ thêm 3 s cho chắc. Chưa có: Grok có thể đang dừng giữa các
    // bước tra cứu (đứng yên hơn 3 s là chuyện thường) — lưu lúc này là lưu dòng "đang suy nghĩ". Chỉ khi chữ đứng
    // yên rất lâu mới coi là xong, cho những giao diện không có hàng nút.
    const quiet = answerFinished(block, promptMsg) ? 3000 : 45000;
    if (now - lastSeen.since < quiet) return;
    if (render.textEl) render.textEl.value = text;
    save(text, { auto: true });
  }

  function startAutoWatch() {
    watchObserver = new MutationObserver(() => { clearTimeout(autoTimer); autoTimer = setTimeout(autoCheck, 1500); });
    watchObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    watchTimer = setInterval(autoCheck, 2000);
  }

  // Tìm khối văn bản "tối giản" cuối cùng trước ô nhập, bỏ khối chứa prompt và khối chứa ô nhập.
  function captureLastAnswer(afterEl) {
    const block = captureLastAnswerBlock(afterEl || promptMessage(promptBubble()));
    return block ? stripThinking(readText(block)) : '';
  }

  function captureLastAnswerBlock(afterEl) {
    const composer = document.querySelector('[contenteditable="true"], textarea');
    const promptHead = ctxInfo && ctxInfo.prompt ? norm(ctxInfo.prompt).slice(0, 60) : '';
    const after = afterEl || promptMessage(promptBubble());
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
      if (after && (el === after || el.contains(after) || after.contains(el))) continue;
      if (after && !(after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue; // chỉ khối sau prompt
      cands.push(el);
    }
    const top = cands.filter(el => !cands.some(o => o !== el && o.contains(el)));
    let pick = null;
    if (composer) for (const b of top) { if (composer.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) pick = b; }
    if (!pick && top.length) pick = top[top.length - 1];
    return pick || null;
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
