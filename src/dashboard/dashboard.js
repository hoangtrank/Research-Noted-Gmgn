// Dashboard: liệt kê, tìm kiếm, lọc mọi dự án đã ghi chú; xuất/nhập dữ liệu.
(async () => {
  'use strict';
  const S = globalThis.NotedStore;
  const E = globalThis.NotedEditor;
  const I = globalThis.NotedI18n;
  const t = (k, v) => I.t(k, v);
  await I.init();
  I.apply();
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
      const li = document.createElement('li');
      li.className = 'card' + (p.key === selectedKey ? ' on' : '');
      li.dataset.key = p.key;
      li.innerHTML = `
        <div class="card-top">
          ${p.pinned ? `<span title="${E.esc(t('pinned_title'))}">📌</span>` : ''}
          <span class="card-sym">${E.esc(p.symbol || S.shortAddress(p.address))}</span>
          <span class="card-name">${E.esc(p.name || '')}</span>
          <span class="chain">${E.esc(S.chainLabel(p.chain))}</span>
        </div>
        <div class="card-sum${p.summary ? '' : ' empty'}">${E.esc(p.summary || t('no_summary'))}</div>
        <div class="card-meta">
          <span>${st.icon} ${E.esc(S.statusLabel(p.status))}</span>
          ${p.rating ? `<span class="stars">${'★'.repeat(p.rating)}</span>` : ''}
          ${p.tags.length ? `<span class="tags">${p.tags.slice(0, 5).map(t => '#' + E.esc(t)).join(' ')}</span>` : ''}
          <span class="right">${E.esc(t('entries_count', { n: p.timeline.length }))} · ${E.esc(E.relTime(p.updatedAt))}</span>
        </div>`;
      li.addEventListener('click', () => select(p));
      ui.list.appendChild(li);
    }
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
        onClose: () => { ui.mount.hidden = true; ui.empty.hidden = false; selectedKey = null; reload(); },
      });
      ui.mount.appendChild(editor.el);
    } else {
      await editor.flush();
    }
    ui.empty.hidden = true;
    ui.mount.hidden = false;
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
    const data = await S.exportJSON();
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
      alert(t('imported', { added: r.added, merged: r.merged }));
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
    const modal = $('#settings'), uiMode = $('#ui-mode'), target = $('#research-target'), tpl = $('#research-template'), saved = $('#settings-saved'), follow = $('#follow');
    target.innerHTML = Object.entries(R.TARGETS).map(([k, v]) => `<option value="${k}">${E.esc(v.label)}</option>`).join('');
    const load = async () => {
      const st = (await chrome.storage.local.get('settings')).settings || {};
      uiMode.value = st.ui || 'panel';
      follow.checked = st.follow !== false;
      target.value = st.researchTarget || 'x';
      tpl.value = st.researchTemplate || R.DEFAULT_TEMPLATE;
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
    target.addEventListener('change', () => patch({ researchTarget: target.value }));
    let tplTimer = null;
    tpl.addEventListener('input', () => { clearTimeout(tplTimer); tplTimer = setTimeout(() => patch({ researchTemplate: tpl.value }), 500); });
    $('#template-reset').addEventListener('click', () => { tpl.value = R.DEFAULT_TEMPLATE; patch({ researchTemplate: '' }); });
  }

  reload().then(() => {
    const open = new URLSearchParams(location.search).get('open');
    if (open) {
      const [chain, address] = open.split(':');
      if (chain && address) select({ chain, address, key: S.keyOf(chain, address) });
    }
  });
})();
