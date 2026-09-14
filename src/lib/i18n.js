// NotedI18n: đa ngôn ngữ cho giao diện (en mặc định, vi, zh). Ngôn ngữ chọn trong settings.lang.
// Tên/mô tả extension trong manifest dùng _locales/ (theo ngôn ngữ trình duyệt) như Chrome yêu cầu.
(() => {
  'use strict';
  if (globalThis.NotedI18n) return;

  const LANGS = { en: 'English', vi: 'Tiếng Việt', zh: '中文' };
  const DEFAULT = 'en';

  const en = {
    app_name: 'Research-Noted-Gmgn',
    dashboard: 'Dashboard', close: 'Close (Esc)', delete: 'Delete', add: 'Add',
    copy: 'copy', copied: 'copied', copy_failed: 'failed', saved: '✓ saved',
    pin_title: 'Pin this project', copy_addr: 'Copy address', mc_now: 'Current MC ≈ {mc}', mc_short: 'MC',
    status: 'Status', conviction: 'Conviction', conviction_title: 'Conviction 1–5 (click the selected star again to clear)',
    what_it_does: 'What does this project do?',
    summary_ph: '1–3 sentences: narrative, product, team, why it matters, key risks…',
    tags: 'Tags', tag_ph: 'add tag, Enter', remove_tag: 'Remove tag',
    timeline: 'Timeline', new_entry_ph: 'New note… paste X links / AI research here (Ctrl+Enter to add)',
    trade_hint: 'Note price/MC and reasoning to compare later',
    no_entries: 'No entries yet. Add your first note above.', edit: 'Edit', delete_entry: 'Delete this entry',
    edited: 'Edited {time}', not_saved: 'Not saved yet — saves automatically as you type', created_edited: 'Created {a} · Edited {b}',
    confirm_delete: 'Delete all notes for {name}?', symbol_ph: 'SYMBOL',
    name_ph: 'Project name / one-line description (e.g. AI agent launchpad on Robinhood chain)',
    just_now: 'just now', minutes_ago: '{n} min ago', hours_ago: '{n} h ago', days_ago: '{n} d ago', weeks_ago: '{n} w ago',
    st_watching: 'Watching', st_researching: 'Researching', st_holding: 'Holding', st_sold: 'Sold', st_passed: 'Passed', st_dead: 'Dead / Rug',
    et_note: 'Note', et_research: 'Research', et_news: 'News / Update', et_buy: 'Buy', et_sell: 'Sell', et_alert: 'Alert', et_link: 'Link',
    badge_title: 'Add a note for this project (Research-Noted-Gmgn)', tip_empty: 'No summary yet — click to add', entries_count: '{n} entries',
    fab_note: 'Note', fab_title: 'Open the note for this token (Alt+N)',
    toast_open_token: 'Open a token page on gmgn, then press Alt+N or click the Research-Noted-Gmgn button.',
    panel_empty_1: 'Click the ✎ button next to a token on gmgn.ai, the floating button on a token page, or press Alt+N.',
    panel_empty_2: 'This panel sits outside the page, so it never covers gmgn. Drag its edge to resize.',
    open_dashboard: '📚 Open Dashboard',
    note_this: '📝 Note this token', open_note: '📝 Open note: {name}', export_json: '⬇ Export JSON (backup)',
    popup_hint: 'On gmgn.ai: click ✎ next to a symbol, or press Alt+N on a token page.',
    ui_mode: 'Note view', ui_panel: 'Side panel (does not cover the page)', ui_drawer: 'Overlay inside the page',
    language: 'Language', reload_hint: 'Reload the gmgn page and try again', stats: '{n} projects · {p} pinned · {e} entries',
    search_ph: 'Search symbol, name, summary, tag, address, timeline…', all_statuses: 'All statuses',
    sort_updated: 'Recently edited', sort_created: 'Recently created', sort_symbol: 'Symbol A→Z', sort_rating: 'Highest conviction', sort_entries: 'Most entries',
    pinned_only: '📌 pinned only', pinned_title: 'Pinned', add_url: '+ Add from gmgn URL', export_json_short: 'Export JSON', export_md: 'Export Markdown', import_json: 'Import JSON',
    dash_empty_1: 'Pick a project on the left to view or edit its notes, or <b>Add from gmgn URL</b>.',
    dash_empty_2: 'On gmgn.ai, click the ✎ button next to a symbol, or press <kbd>Alt</kbd>+<kbd>N</kbd> on a token page.',
    no_match: 'No projects match the filters.', no_projects: 'No notes yet. Go to gmgn.ai and click ✎ next to a token.', no_summary: 'No summary yet',
    prompt_url: 'Paste a gmgn.ai token URL (e.g. https://gmgn.ai/robinhood/token/0x...):',
    bad_url: 'Not a gmgn token URL. Expected: https://gmgn.ai/{chain}/token/{address}',
    imported: 'Imported: {added} new projects, {merged} merged.', import_failed: 'Import failed: {error}',
    research_btn: '✨ Research with Grok', settings: 'Settings', research_target: 'Open research in', research_template: 'Research prompt template',
    template_help: 'Placeholders: {symbol} {chain} {address} {name} {mc} {summary} {tags} {gmgn_url}', reset_default: 'Reset to default', close_plain: 'Close',
    grok_linked: 'Researching {symbol}', grok_unlinked: 'Not linked to a project',
    grok_unlinked_hint: 'Open Grok from a note\'s "Research with Grok" button, or link a project below.',
    grok_hint: 'Press Enter to send the prefilled prompt, then capture the answer here.',
    grok_capture: 'Capture last answer', grok_selection: 'Use selected text', grok_save: 'Save to Research-Noted-Gmgn', grok_saved: 'Saved to {symbol}',
    grok_open_dashboard: 'Open in Dashboard', grok_link: 'Link', grok_link_ph: 'gmgn token URL', grok_recent: 'Recent projects…',
    grok_empty: 'Nothing captured yet. Click Capture, or select the answer text and click Use selected text.', grok_source: 'Source', grok_nothing: 'No text to save.',
    md_title: 'Research-Noted-Gmgn — export {date}', md_address: 'Address', md_status: 'Status', md_conviction: 'Conviction', md_tags: 'Tags', md_summary: 'Summary', md_timeline: 'Timeline',
  };

  const vi = {
    app_name: 'Research-Noted-Gmgn',
    dashboard: 'Dashboard', close: 'Đóng (Esc)', delete: 'Xoá', add: 'Thêm',
    copy: 'copy', copied: 'đã copy', copy_failed: 'lỗi', saved: '✓ đã lưu',
    pin_title: 'Ghim dự án (pin)', copy_addr: 'Copy địa chỉ', mc_now: 'MC hiện tại ≈ {mc}', mc_short: 'MC',
    status: 'Trạng thái', conviction: 'Conviction', conviction_title: 'Mức tin tưởng 1–5 (bấm lại sao đang chọn để bỏ)',
    what_it_does: 'Dự án làm gì?',
    summary_ph: 'Tóm tắt 1–3 câu: narrative, sản phẩm, team, vì sao đáng chú ý, rủi ro chính…',
    tags: 'Tags', tag_ph: 'thêm tag, Enter', remove_tag: 'Bỏ tag',
    timeline: 'Timeline', new_entry_ph: 'Ghi chú mới… dán link X / kết quả AI research vào đây (Ctrl+Enter để thêm)',
    trade_hint: 'Ghi giá/MC và lý do để sau này đối chiếu',
    no_entries: 'Chưa có mốc nào. Thêm ghi chú đầu tiên ở trên.', edit: 'Sửa', delete_entry: 'Xoá mốc này',
    edited: 'Sửa {time}', not_saved: 'Chưa lưu — tự lưu khi bạn nhập', created_edited: 'Tạo {a} · Sửa {b}',
    confirm_delete: 'Xoá toàn bộ ghi chú của {name}?', symbol_ph: 'SYMBOL',
    name_ph: 'Tên dự án / một dòng mô tả (ví dụ: AI agent launchpad trên Robinhood chain)',
    just_now: 'vừa xong', minutes_ago: '{n} phút trước', hours_ago: '{n} giờ trước', days_ago: '{n} ngày trước', weeks_ago: '{n} tuần trước',
    st_watching: 'Theo dõi', st_researching: 'Đang research', st_holding: 'Đang giữ', st_sold: 'Đã bán', st_passed: 'Bỏ qua', st_dead: 'Dead / Rug',
    et_note: 'Ghi chú', et_research: 'Research', et_news: 'Tin / Update', et_buy: 'Mua', et_sell: 'Bán', et_alert: 'Cảnh báo', et_link: 'Link',
    badge_title: 'Ghi chú dự án này (Research-Noted-Gmgn)', tip_empty: 'Chưa có tóm tắt — bấm để thêm', entries_count: '{n} mốc',
    fab_note: 'Ghi chú', fab_title: 'Mở ghi chú cho token này (Alt+N)',
    toast_open_token: 'Hãy mở một trang token trên gmgn rồi bấm Alt+N hoặc nút Research-Noted-Gmgn.',
    panel_empty_1: 'Bấm nút ✎ cạnh một token trên gmgn.ai, nút nổi trên trang token, hoặc Alt+N.',
    panel_empty_2: 'Panel này nằm ngoài trang nên không che gmgn. Kéo mép để đổi độ rộng.',
    open_dashboard: '📚 Mở Dashboard',
    note_this: '📝 Ghi chú token đang xem', open_note: '📝 Mở ghi chú {name}', export_json: '⬇ Xuất JSON (backup)',
    popup_hint: 'Trên gmgn.ai: bấm nút ✎ cạnh symbol, hoặc Alt+N trên trang token.',
    ui_mode: 'Giao diện ghi chú', ui_panel: 'Side panel (không che trang)', ui_drawer: 'Overlay trong trang',
    language: 'Ngôn ngữ', reload_hint: 'Hãy tải lại trang gmgn rồi thử lại', stats: '{n} dự án · {p} pin · {e} mốc',
    search_ph: 'Tìm symbol, tên, tóm tắt, tag, địa chỉ, nội dung timeline…', all_statuses: 'Mọi trạng thái',
    sort_updated: 'Mới sửa', sort_created: 'Mới tạo', sort_symbol: 'Symbol A→Z', sort_rating: 'Conviction cao', sort_entries: 'Nhiều mốc nhất',
    pinned_only: '📌 chỉ pin', pinned_title: 'Đã pin', add_url: '+ Thêm từ URL gmgn', export_json_short: 'Xuất JSON', export_md: 'Xuất Markdown', import_json: 'Nhập JSON',
    dash_empty_1: 'Chọn một dự án bên trái để xem/sửa ghi chú, hoặc <b>Thêm từ URL gmgn</b>.',
    dash_empty_2: 'Trên gmgn.ai, bấm nút ✎ cạnh symbol trong danh sách, hoặc <kbd>Alt</kbd>+<kbd>N</kbd> trên trang token.',
    no_match: 'Không có dự án nào khớp bộ lọc.', no_projects: 'Chưa có ghi chú nào. Vào gmgn.ai và bấm nút ✎ cạnh một token.', no_summary: 'Chưa có tóm tắt',
    prompt_url: 'Dán URL token trên gmgn.ai (ví dụ https://gmgn.ai/robinhood/token/0x...):',
    bad_url: 'Không nhận ra URL token gmgn. Dạng đúng: https://gmgn.ai/{chain}/token/{address}',
    imported: 'Đã nhập: {added} dự án mới, {merged} dự án được gộp.', import_failed: 'Nhập thất bại: {error}',
    research_btn: '✨ Research với Grok', settings: 'Cài đặt', research_target: 'Mở research ở', research_template: 'Mẫu prompt research',
    template_help: 'Biến: {symbol} {chain} {address} {name} {mc} {summary} {tags} {gmgn_url}', reset_default: 'Về mặc định', close_plain: 'Đóng',
    grok_linked: 'Đang research {symbol}', grok_unlinked: 'Chưa gắn với dự án nào',
    grok_unlinked_hint: 'Mở Grok từ nút "Research với Grok" trong ghi chú, hoặc gắn dự án bên dưới.',
    grok_hint: 'Nhấn Enter để gửi prompt đã điền sẵn, rồi bắt câu trả lời ở đây.',
    grok_capture: 'Bắt câu trả lời mới nhất', grok_selection: 'Dùng phần đang bôi đen', grok_save: 'Lưu vào Research-Noted-Gmgn', grok_saved: 'Đã lưu vào {symbol}',
    grok_open_dashboard: 'Mở trong Dashboard', grok_link: 'Gắn', grok_link_ph: 'URL token gmgn', grok_recent: 'Dự án gần đây…',
    grok_empty: 'Chưa bắt được gì. Bấm Bắt, hoặc bôi đen câu trả lời rồi bấm Dùng phần đang bôi đen.', grok_source: 'Nguồn', grok_nothing: 'Không có nội dung để lưu.',
    md_title: 'Research-Noted-Gmgn — export {date}', md_address: 'Địa chỉ', md_status: 'Trạng thái', md_conviction: 'Conviction', md_tags: 'Tags', md_summary: 'Tóm tắt', md_timeline: 'Timeline',
  };

  const zh = {
    app_name: 'Research-Noted-Gmgn',
    dashboard: '仪表盘', close: '关闭 (Esc)', delete: '删除', add: '添加',
    copy: '复制', copied: '已复制', copy_failed: '失败', saved: '✓ 已保存',
    pin_title: '置顶该项目', copy_addr: '复制地址', mc_now: '当前市值 ≈ {mc}', mc_short: '市值',
    status: '状态', conviction: '信心', conviction_title: '信心 1–5（再次点击已选星标可清除）',
    what_it_does: '这个项目是做什么的？',
    summary_ph: '1–3 句话：叙事、产品、团队、为何值得关注、主要风险…',
    tags: '标签', tag_ph: '添加标签，回车', remove_tag: '移除标签',
    timeline: '时间线', new_entry_ph: '新笔记… 在此粘贴 X 链接 / AI 研究结果（Ctrl+Enter 添加）',
    trade_hint: '记录价格/市值和理由，方便日后对照',
    no_entries: '还没有记录。在上方添加第一条笔记。', edit: '编辑', delete_entry: '删除此记录',
    edited: '修改于 {time}', not_saved: '尚未保存 — 输入时自动保存', created_edited: '创建 {a} · 修改 {b}',
    confirm_delete: '删除 {name} 的全部笔记？', symbol_ph: '代币符号',
    name_ph: '项目名称 / 一句话描述（例如：Robinhood 链上的 AI agent 发射台）',
    just_now: '刚刚', minutes_ago: '{n} 分钟前', hours_ago: '{n} 小时前', days_ago: '{n} 天前', weeks_ago: '{n} 周前',
    st_watching: '观察中', st_researching: '研究中', st_holding: '持有中', st_sold: '已卖出', st_passed: '已放弃', st_dead: '归零 / Rug',
    et_note: '笔记', et_research: '研究', et_news: '新闻 / 更新', et_buy: '买入', et_sell: '卖出', et_alert: '警告', et_link: '链接',
    badge_title: '为该项目添加笔记 (Research-Noted-Gmgn)', tip_empty: '暂无摘要 — 点击添加', entries_count: '{n} 条记录',
    fab_note: '笔记', fab_title: '打开该代币的笔记 (Alt+N)',
    toast_open_token: '请先在 gmgn 打开一个代币页面，再按 Alt+N 或点击 Research-Noted-Gmgn 按钮。',
    panel_empty_1: '在 gmgn.ai 点击代币旁的 ✎ 按钮、代币页的悬浮按钮，或按 Alt+N。',
    panel_empty_2: '此面板位于页面之外，不会遮挡 gmgn。拖动边缘可调整宽度。',
    open_dashboard: '📚 打开仪表盘',
    note_this: '📝 记录当前代币', open_note: '📝 打开 {name} 的笔记', export_json: '⬇ 导出 JSON（备份）',
    popup_hint: '在 gmgn.ai：点击代币符号旁的 ✎，或在代币页按 Alt+N。',
    ui_mode: '笔记视图', ui_panel: '侧边栏（不遮挡页面）', ui_drawer: '页面内浮层',
    language: '语言', reload_hint: '请刷新 gmgn 页面后重试', stats: '{n} 个项目 · {p} 置顶 · {e} 条记录',
    search_ph: '搜索符号、名称、摘要、标签、地址、时间线…', all_statuses: '全部状态',
    sort_updated: '最近修改', sort_created: '最近创建', sort_symbol: '符号 A→Z', sort_rating: '信心最高', sort_entries: '记录最多',
    pinned_only: '📌 仅置顶', pinned_title: '已置顶', add_url: '+ 从 gmgn 链接添加', export_json_short: '导出 JSON', export_md: '导出 Markdown', import_json: '导入 JSON',
    dash_empty_1: '在左侧选择一个项目查看或编辑笔记，或 <b>从 gmgn 链接添加</b>。',
    dash_empty_2: '在 gmgn.ai 点击代币符号旁的 ✎ 按钮，或在代币页按 <kbd>Alt</kbd>+<kbd>N</kbd>。',
    no_match: '没有符合筛选条件的项目。', no_projects: '还没有笔记。前往 gmgn.ai，点击代币旁的 ✎。', no_summary: '暂无摘要',
    prompt_url: '粘贴 gmgn.ai 代币链接（例如 https://gmgn.ai/robinhood/token/0x...）：',
    bad_url: '无法识别的 gmgn 代币链接。正确格式：https://gmgn.ai/{chain}/token/{address}',
    imported: '已导入：{added} 个新项目，{merged} 个已合并。', import_failed: '导入失败：{error}',
    research_btn: '✨ 用 Grok 研究', settings: '设置', research_target: '在哪里打开研究', research_template: '研究提示词模板',
    template_help: '占位符：{symbol} {chain} {address} {name} {mc} {summary} {tags} {gmgn_url}', reset_default: '恢复默认', close_plain: '关闭',
    grok_linked: '正在研究 {symbol}', grok_unlinked: '未关联任何项目',
    grok_unlinked_hint: '请从笔记中的“用 Grok 研究”按钮打开 Grok，或在下方关联项目。',
    grok_hint: '按 Enter 发送已填好的提示词，然后在这里捕获回答。',
    grok_capture: '捕获最新回答', grok_selection: '使用选中文本', grok_save: '保存到 Research-Noted-Gmgn', grok_saved: '已保存到 {symbol}',
    grok_open_dashboard: '在仪表盘中打开', grok_link: '关联', grok_link_ph: 'gmgn 代币链接', grok_recent: '最近的项目…',
    grok_empty: '尚未捕获内容。点击“捕获”，或选中回答文本后点击“使用选中文本”。', grok_source: '来源', grok_nothing: '没有可保存的内容。',
    md_title: 'Research-Noted-Gmgn — 导出 {date}', md_address: '地址', md_status: '状态', md_conviction: '信心', md_tags: '标签', md_summary: '摘要', md_timeline: '时间线',
  };

  const DICT = { en, vi, zh };
  let lang = DEFAULT;
  const listeners = new Set();

  function normalize(l) {
    l = String(l || '').toLowerCase();
    if (l.startsWith('zh')) return 'zh';
    if (l.startsWith('vi')) return 'vi';
    return DICT[l] ? l : DEFAULT;
  }

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) ?? en[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
  }

  // Áp bản dịch cho HTML tĩnh: data-i18n (text), data-i18n-html, data-i18n-ph (placeholder), data-i18n-title.
  function apply(root) {
    root = root || document;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    if (root === document) document.documentElement.lang = lang;
  }

  function setLang(l) { lang = normalize(l); return lang; }

  async function init() {
    try {
      const r = await chrome.storage.local.get('settings');
      setLang(r.settings && r.settings.lang);
    } catch (_) {}
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.settings) return;
        const next = normalize(changes.settings.newValue && changes.settings.newValue.lang);
        if (next !== lang) { lang = next; for (const fn of listeners) fn(lang); }
      });
    } catch (_) {}
    return lang;
  }

  function onChange(fn) { listeners.add(fn); }

  // Điền <select> ngôn ngữ và lưu vào settings.lang khi đổi.
  async function bindSelect(select) {
    select.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    select.value = lang;
    select.addEventListener('change', async () => {
      const r = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(r.settings || {}), lang: select.value } });
    });
  }

  globalThis.NotedI18n = { LANGS, DEFAULT, t, apply, init, setLang, onChange, bindSelect, get lang() { return lang; } };
})();
