// Dashboard: liệt kê, tìm kiếm, lọc mọi dự án đã ghi chú; xuất/nhập dữ liệu.
(async () => {
  'use strict';
  const S = globalThis.NotedStore;
  const E = globalThis.NotedEditor;
  const I = globalThis.NotedI18n;
  const t = (k, v) => I.t(k, v);
  await I.init();
  I.apply();
  S.watchFontSize(px => document.documentElement.style.setProperty('--ne-fs', px + 'px'));

  I.bindSelect(document.querySelector('#lang'));

  const $ = sel => document.querySelector(sel);
  const ui = {
    stats: $('#stats'), search: $('#search'), status: $('#f-status'), sort: $('#f-sort'), pinned: $('#f-pinned'),
    tagbar: $('#tagbar'), list: $('#list'), empty: $('#empty'), mount: $('#editor-mount'),
    addUrl: $('#add-url'), exportJson: $('#export-json'), exportMd: $('#export-md'), importJson: $('#import-json'), importFile: $('#import-file'),
  };

  let projects = [];
  let selectedKey = null;
  let activeTag = '';
  let editor = null;

  const style = document.createElement('style');
  style.textContent = E.CSS;
  document.head.appendChild(style);

  ui.status.insertAdjacentHTML('beforeend', S.STATUSES.map(s => `<option value="${s.id}">${s.icon} ${E.esc(S.statusLabel(s.id))}</option>`).join(''));

  async function reload() {
    projects = await S.getAll();
    render();
  }

  function matches(p, q) {
    if (!q) return true;
    const hay = [p.symbol, p.name, p.summary, p.address, p.chain, p.tags.join(' '), p.timeline.map(e => e.text).join(' ')].join('\n').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function filtered() {
    const q = ui.search.value.trim().toLowerCase();
    const st = ui.status.value;
    let list = projects.filter(p => matches(p, q) && (!st || p.status === st) && (!ui.pinned.checked || p.pinned) && (!activeTag || p.tags.includes(activeTag)));
    const sort = ui.sort.value;
    const cmp = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      symbol: (a, b) => (a.symbol || a.address).localeCompare(b.symbol || b.address),
      rating: (a, b) => (b.rating - a.rating) || (b.updatedAt - a.updatedAt),
      entries: (a, b) => (b.timeline.length - a.timeline.length) || (b.updatedAt - a.updatedAt),
    }[sort] || ((a, b) => b.updatedAt - a.updatedAt);
    list.sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
    return list;
  }

  function render() {
    const pinned = projects.filter(p => p.pinned).length;
    const entries = projects.reduce((n, p) => n + p.timeline.length, 0);
    ui.stats.textContent = t('stats', { n: projects.length, p: pinned, e: entries });

    const tagCount = new Map();
    for (const p of projects) for (const t of p.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
    ui.tagbar.innerHTML = topTags.map(([t, n]) => `<span class="tag${t === activeTag ? ' on' : ''}" data-tag="${E.esc(t)}">#${E.esc(t)} <small>${n}</small></span>`).join('');

    const list = filtered();
    ui.list.innerHTML = '';
    if (!list.length) {
      ui.list.innerHTML = `<li class="list-empty">${E.esc(projects.length ? t('no_match') : t('no_projects'))}</li>`;
    }
    for (const p of list) {
      const st = S.STATUSES.find(s => s.id === p.status) || S.STATUSES[0];
      const last = [...p.timeline].sort((a, b) => b.ts - a.ts)[0];   // chưa viết tóm tắt thì cho xem mốc mới nhất
      const li = document.createElement('li');
      li.className = 'card' + (p.key === selectedKey ? ' on' : '') + (p.pinned ? ' card--pin' : '') + (!p.summary && !last ? ' card--blank' : '');
      li.dataset.key = p.key;
      li.innerHTML = `
        <div class="card-top">
          ${p.pinned ? `<span title="${E.esc(t('pinned_title'))}">📌</span>` : ''}
          <span class="card-sym">${E.esc(p.symbol || S.shortAddress(p.address))}</span>
          <span class="card-name">${E.esc(p.name || '')}</span>
          <span class="chain">${E.esc(S.chainLabel(p.chain))}</span>
        </div>
        ${p.summary ? `<div class="card-sum">${E.esc(p.summary)}</div>`
          : last ? `<div class="card-sum card-sum--last">${E.esc(last.text.replace(/\s+/g, ' ').slice(0, 160))}</div>`
          : `<div class="card-sum card-sum--none">${E.esc(t('no_summary'))}</div>`}
        <div class="card-meta">
          <span class="st st--${E.esc(st.id)}">${st.icon} ${E.esc(S.statusLabel(p.status))}</span>
          ${p.rating ? `<span class="stars">${'★'.repeat(p.rating)}</span>` : ''}
          ${p.tags.length ? `<span class="tags">${p.tags.slice(0, 5).map(t => '#' + E.esc(t)).join(' ')}</span>` : ''}
          <span class="right">${E.esc(t('entries_count', { n: p.timeline.length }))} · ${E.esc(E.relTime(p.updatedAt))}</span>
        </div>`;
      li.addEventListener('click', () => select(p));
      ui.list.appendChild(li);
    }
  }

  async function closeEditor() {
    if (editor) await editor.flush();
    ui.mount.hidden = true;
    ui.empty.hidden = false;
    selectedKey = null;
    document.querySelector('.app').classList.remove('app--editing');
    reload();
  }

  async function select(token) {
    selectedKey = token.key;
    if (!editor) {
      editor = E.create({
        showClose: false,
        showDashboardLink: false,
        allTags: () => [...new Set(projects.flatMap(p => p.tags))].sort(),
        onChange: () => reload(),
        onDelete: () => { selectedKey = null; },
        onClose: () => closeEditor(),
      });
      ui.mount.appendChild(editor.el);
    } else {
      await editor.flush();
    }
    ui.empty.hidden = true;
    ui.mount.hidden = false;
    document.querySelector('.app').classList.add('app--editing');   // cửa sổ hẹp: bảng ghi chú chiếm trọn, xem CSS
    await editor.load(token);
    for (const li of ui.list.children) li.classList.toggle('on', li.dataset.key === selectedKey);
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  $('#back-list').addEventListener('click', closeEditor);
  ui.search.addEventListener('input', render);
  ui.status.addEventListener('change', render);
  ui.sort.addEventListener('change', render);
  ui.pinned.addEventListener('change', render);
  ui.tagbar.addEventListener('click', ev => {
    const t = ev.target.closest('.tag');
    if (!t) return;
    activeTag = activeTag === t.dataset.tag ? '' : t.dataset.tag;
    render();
  });

  ui.addUrl.addEventListener('click', () => {
    const url = prompt(t('prompt_url'));
    if (!url) return;
    const token = S.parseTokenUrl(url.trim());
    if (!token) { alert(t('bad_url')); return; }
    select(token);
  });

  ui.exportJson.addEventListener('click', async () => {
    const st = (await chrome.storage.local.get('settings')).settings || {};
    const data = await S.exportJSON({ images: st.exportImages !== false });
    download(`research-noted-gmgn-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  });

  ui.exportMd.addEventListener('click', async () => {
    download(`research-noted-gmgn-${stamp()}.md`, S.toMarkdown(await S.getAll()), 'text/markdown');
  });

  ui.importJson.addEventListener('click', () => ui.importFile.click());
  ui.importFile.addEventListener('change', async () => {
    const f = ui.importFile.files[0];
    ui.importFile.value = '';
    if (!f) return;
    try {
      const r = await S.importJSON(JSON.parse(await f.text()));
      await reload();
      alert(t('imported', { added: r.added, merged: r.merged }) + (r.images ? ` (+${r.images} img)` : ''));
    } catch (e) {
      alert(t('import_failed', { error: e && e.message ? e.message : e }));
    }
  });

  S.onChange(() => reload());
  I.onChange(async () => { if (editor) await editor.flush(); location.reload(); });
  initSettings();

  // ---- Settings modal: giao diện ghi chú, đích research, template prompt ----
  async function initSettings() {
    const R = globalThis.NotedResearch;
    const modal = $('#settings'), uiMode = $('#ui-mode'), target = $('#research-target'), tpl = $('#research-template'), saved = $('#settings-saved'), follow = $('#follow'), grokAuto = $('#grok-auto'), listBadges = $('#list-badges'), exportImages = $('#export-images'), fontSize = $('#font-size');
    target.innerHTML = Object.entries(R.TARGETS).map(([k, v]) => `<option value="${k}">${E.esc(v.label)}</option>`).join('');
    fontSize.innerHTML = Array.from({ length: S.FONT.max - S.FONT.min + 1 }, (_, i) => S.FONT.min + i)
      .map(n => `<option value="${n}">${n}px${n === S.FONT.def ? ' · ' + E.esc(t('default_word')) : ''}</option>`).join('');
    const load = async () => {
      const st = (await chrome.storage.local.get('settings')).settings || {};
      uiMode.value = st.ui || 'panel';
      follow.checked = st.follow !== false;
      grokAuto.checked = st.grokAutoSave !== false;
      listBadges.checked = !!st.listBadges;
      exportImages.checked = st.exportImages !== false;
      // Extension không còn chụp ảnh bài viết; tuỳ chọn này chỉ có nghĩa khi ghi chú còn ảnh từ bản cũ / file import.
      chrome.storage.local.get(null).then(all => { exportImages.closest('label').hidden = !Object.keys(all).some(k => k.startsWith('img:')); }).catch(() => {});
      fontSize.value = String(S.fontSize(st));
      target.value = st.researchTarget || 'x';
      tpl.value = st.researchTemplate || R.defaultTemplate(I.lang);
    };
    const patch = async (fields) => {
      const st = (await chrome.storage.local.get('settings')).settings || {};
      await chrome.storage.local.set({ settings: { ...st, ...fields } });
      saved.textContent = t('saved');
      setTimeout(() => (saved.textContent = ''), 1200);
    };
    $('#open-settings').addEventListener('click', async () => { await load(); modal.hidden = false; });
    $('#settings-close').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', ev => { if (ev.target === modal) modal.hidden = true; });
    uiMode.addEventListener('change', () => patch({ ui: uiMode.value }));
    follow.addEventListener('change', () => patch({ follow: follow.checked }));
    grokAuto.addEventListener('change', () => patch({ grokAutoSave: grokAuto.checked }));
    listBadges.addEventListener('change', () => patch({ listBadges: listBadges.checked }));
    exportImages.addEventListener('change', () => patch({ exportImages: exportImages.checked }));

    // ---- Đồng bộ qua Google Drive (tuỳ chọn, mặc định tắt) ----
    const syncOn = $('#sync-on'), syncNow = $('#sync-now'), syncOff = $('#sync-off'), syncWipe = $('#sync-wipe'), syncState = $('#sync-state');
    const SYNC_ERR = { 'signed-out': 'sync_err_signed_out', quota: 'sync_err_quota', forbidden: 'sync_err_forbidden', network: 'sync_err_network', 'bad-remote': 'sync_err_bad_remote', 'newer-schema': 'sync_err_newer' };
    const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => res(chrome.runtime.lastError ? { ok: false, code: 'error', error: chrome.runtime.lastError.message } : r)));
    async function renderSync(working) {
      const all = await chrome.storage.local.get(['settings', 'sync']);
      const on = !!(all.settings && all.settings.sync === true), stt = all.sync || {};
      syncOn.hidden = on; syncNow.hidden = syncOff.hidden = syncWipe.hidden = !on;
      syncState.className = 'sync-state';
      if (working) { syncState.textContent = t('sync_state_working'); return; }
      if (!on) { syncState.textContent = t('sync_state_off'); return; }
      const last = stt.lastResult;
      if (last && !last.ok) { syncState.classList.add('err'); syncState.textContent = SYNC_ERR[last.code] ? t(SYNC_ERR[last.code]) : t('sync_err_other', { msg: last.error || last.code }); return; }
      if (stt.lastAt) { syncState.classList.add('ok'); syncState.textContent = t('sync_state_ok', { when: E.relTime(stt.lastAt), n: (last && last.projects) || 0 }); return; }
      syncState.textContent = t('sync_state_never');
    }
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.sync || ch.settings)) renderSync(); });
    $('#open-settings').addEventListener('click', () => renderSync());
    syncOn.addEventListener('click', async () => {
      const st0 = (await chrome.storage.local.get('settings')).settings || {};
      const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(st0.driveApiBase || ''));   // Drive giả lập trong test: không cần Google
      if (!local) {
        // Xin quyền NGAY trong cú bấm (Chrome chỉ cho hỏi khi có thao tác của người dùng), rồi mới đăng nhập.
        let granted = false;
        try { granted = await chrome.permissions.request({ permissions: ['identity', 'alarms'], origins: ['https://www.googleapis.com/*'] }); } catch (_) {}
        if (!granted) { syncState.className = 'sync-state err'; syncState.textContent = t('sync_denied'); return; }
        try { await chrome.identity.getAuthToken({ interactive: true }); }
        catch (err) { syncState.className = 'sync-state err'; syncState.textContent = t('sync_err_other', { msg: String((err && err.message) || err) }); return; }
      }
      await renderSync(true);
      await send({ type: 'noted:sync-set', enabled: true });
      await renderSync(); reload();
    });
    syncNow.addEventListener('click', async () => { await renderSync(true); await send({ type: 'noted:sync-now' }); await renderSync(); reload(); });
    syncOff.addEventListener('click', async () => {
      await send({ type: 'noted:sync-set', enabled: false });
      try { await chrome.permissions.remove({ permissions: ['identity', 'alarms'], origins: ['https://www.googleapis.com/*'] }); } catch (_) {}
      await renderSync();
    });
    syncWipe.addEventListener('click', async () => {
      if (!confirm(t('sync_wipe_confirm'))) return;
      const r = await send({ type: 'noted:sync-wipe' });
      if (r && r.ok) { syncState.className = 'sync-state'; syncState.textContent = t('sync_wiped'); }
      else { syncState.className = 'sync-state err'; syncState.textContent = t('sync_err_other', { msg: (r && (r.error || r.code)) || '' }); }
    });

    // Bản sao lưu tự động: liệt kê và khôi phục.
    const backupList = $('#backup-list'), backupRestore = $('#backup-restore');
    async function loadBackups() {
      const list = await S.listBackups();
      backupList.innerHTML = '';
      for (const b of list) {
        const o = document.createElement('option');
        o.value = String(b.ts);
        o.textContent = t('backup_item', { when: S.fmtDate(b.ts), n: b.count, reason: t({ import: 'backup_r_import', sync: 'backup_r_sync', 'before-restore': 'backup_r_restore' }[b.reason] || 'backup_r_import') });
        backupList.appendChild(o);
      }
      if (!list.length) { const o = document.createElement('option'); o.value = ''; o.textContent = t('backup_none'); backupList.appendChild(o); }
      backupList.disabled = backupRestore.disabled = !list.length;
    }
    $('#open-settings').addEventListener('click', loadBackups);
    backupRestore.addEventListener('click', async () => {
      if (!backupList.value || !confirm(t('backup_confirm'))) return;
      const r = await S.restoreBackup(Number(backupList.value));
      saved.textContent = t('backup_done', { n: r.restored });
      await loadBackups();
      reload();
    });
    fontSize.addEventListener('change', () => patch({ fontSize: Number(fontSize.value) }));
    target.addEventListener('change', () => patch({ researchTarget: target.value }));
    let tplTimer = null;
    tpl.addEventListener('input', () => { clearTimeout(tplTimer); tplTimer = setTimeout(() => patch({ researchTemplate: tpl.value }), 500); });
    $('#template-reset').addEventListener('click', () => { tpl.value = R.defaultTemplate(I.lang); patch({ researchTemplate: '' }); });
  }

  reload().then(() => {
    const open = new URLSearchParams(location.search).get('open') || '';
    const i = open.indexOf(':');
    if (i > 0) {
      const chain = S.normalizeChain(open.slice(0, i)), address = S.normalizeAddress(open.slice(i + 1));
      if (/^[a-z0-9-]{2,20}$/.test(chain) && address) select({ chain, address, key: S.keyOf(chain, address) });
    }
  });
})();
