// NotedResearch: dựng prompt research từ template và mở Grok bằng deep link (không cần API key).
// Có sẵn ba bản mặc định (en/vi/zh) chọn theo ngôn ngữ giao diện; người dùng sửa lại được trong Settings.
(() => {
  'use strict';
  if (globalThis.NotedResearch) return;

  const EN = [
    'Research this token — CA: {address} ({name} | ${symbol}) | Chain: {chain} | MC: {mc}',
    'gmgn: {gmgn_url}',
    'What I already know: {summary}',
    'Use X search + web search. Answer in English, short bullets, plain URLs (no hidden markdown links). Write "not found" instead of guessing.',
    '',
    '1. DEVELOPER',
    '• Who are the dev / team? X, GitHub, LinkedIn links?',
    '• Founder or lead? Team size?',
    '• Background: previous companies, Web3 experience?',
    '• Notable previous projects, and how did they end?',
    '• Which large KOLs follow or shill it? Signs of paid promotion?',
    '',
    '2. PROJECT',
    '• What problem does it solve, and how does it work in simple terms?',
    '• Shipped product or only an idea? Demo, repo or app link?',
    '• What makes it different from similar projects?',
    '• If it is a meme: the original story, and who started it?',
    '',
    '3. TRACTION',
    '• Holder count and trend, volume, notable or smart-money buyers',
    '• Funding, backers, partnerships — one source link each',
    '',
    '4. RED FLAGS',
    '• Holder concentration, dev wallet behaviour, unlocks, LP lock, mint or freeze authority',
    '• Copy of another project, bought engagement, deleted posts',
    '',
    '5. VERDICT',
    '• watch / dig deeper / pass — one line why',
    '• 3 things to re-check in the next 7 days',
  ].join('\n');

  const VI = [
    'Research token — CA: {address} ({name} | ${symbol}) | Chain: {chain} | MC: {mc}',
    'gmgn: {gmgn_url}',
    'Tôi đã biết: {summary}',
    'Dùng X search + web search. Trả lời tiếng Việt, bullet ngắn gọn, để link dạng URL đầy đủ (không dùng link markdown ẩn). Chỗ nào không kiểm chứng được thì ghi "không tìm thấy", đừng đoán.',
    '',
    '1. DEVELOPER',
    '• Dev / team là ai? Link X, GitHub, LinkedIn?',
    '• Founder hoặc lead? Quy mô team?',
    '• Background: công ty cũ, kinh nghiệm Web3?',
    '• Dự án trước nổi bật, và kết cục ra sao?',
    '• KOL lớn nào follow hoặc shill? Có dấu hiệu quảng cáo trả tiền không?',
    '',
    '2. PROJECT',
    '• Giải quyết vấn đề gì? Cách hoạt động nói đơn giản?',
    '• Đã có sản phẩm chạy được hay mới chỉ là ý tưởng? Link demo, repo, app?',
    '• Khác gì so với dự án tương tự?',
    '• Nếu là meme: câu chuyện gốc là gì, ai khởi xướng?',
    '',
    '3. TRACTION',
    '• Số holder và xu hướng, volume, ví lớn hoặc smart money nào mua',
    '• Gọi vốn, backer, đối tác — mỗi ý kèm một link nguồn',
    '',
    '4. RED FLAGS',
    '• Tập trung holder, hành vi ví dev, lịch unlock, LP khoá chưa, quyền mint hoặc freeze',
    '• Sao chép dự án khác, tương tác mua, bài đã xoá',
    '',
    '5. KẾT LUẬN',
    '• theo dõi / đào sâu thêm / bỏ qua — một dòng lý do',
    '• 3 thứ cần kiểm tra lại trong 7 ngày tới',
  ].join('\n');

  const ZH = [
    '研究这个代币 — 合约: {address}（{name} | ${symbol}）| 链: {chain} | 市值: {mc}',
    'gmgn: {gmgn_url}',
    '我已知道: {summary}',
    '使用 X 搜索 + 网络搜索。用中文回答，条目简短，链接写完整 URL（不要隐藏式 markdown 链接）。无法核实的写「未找到」，不要猜测。',
    '',
    '1. 开发者',
    '• 开发者／团队是谁？X、GitHub、LinkedIn 链接？',
    '• 创始人或负责人？团队规模？',
    '• 背景：以前的公司、Web3 经验？',
    '• 以前做过哪些项目，结局如何？',
    '• 哪些大 KOL 关注或推荐？有付费推广的迹象吗？',
    '',
    '2. 项目',
    '• 解决什么问题？用简单的话说明如何运作？',
    '• 已有可用产品还是只有想法？演示、代码库或应用链接？',
    '• 与同类项目有什么不同？',
    '• 如果是 meme：最初的故事是什么，谁发起的？',
    '',
    '3. 数据与热度',
    '• 持有人数量与趋势、交易量、值得注意的大户或聪明钱',
    '• 融资、投资方、合作伙伴 — 每条附一个来源链接',
    '',
    '4. 风险信号',
    '• 持仓集中度、开发者钱包行为、解锁安排、LP 是否锁定、铸造或冻结权限',
    '• 抄袭其他项目、刷互动、已删除的帖子',
    '',
    '5. 结论',
    '• 观察 / 深入研究 / 放弃 — 一句话理由',
    '• 未来 7 天需要复查的 3 件事',
  ].join('\n');

  const TEMPLATES = { en: EN, vi: VI, zh: ZH };
  const DEFAULT_TEMPLATE = EN;

  const PLACEHOLDERS = ['symbol', 'chain', 'address', 'name', 'mc', 'summary', 'tags', 'status', 'notes', 'gmgn_url', 'dex_url', 'x_url', 'date'];

  // Đích mở prompt. Grok trên X nhận ?text=, grok.com nhận ?q=.
  const TARGETS = {
    x:    { label: 'Grok on X (x.com/i/grok)', url: p => `https://x.com/i/grok?text=${encodeURIComponent(p)}` },
    grok: { label: 'grok.com',                 url: p => `https://grok.com/?q=${encodeURIComponent(p)}` },
  };

  function defaultTemplate(lang) {
    return TEMPLATES[String(lang || '').toLowerCase()] || EN;
  }

  function vars(project, ctx = {}) {
    const S = globalThis.NotedStore;
    const timeline = [...(project.timeline || [])].sort((a, b) => b.ts - a.ts);
    const lastMc = timeline.find(e => e.mc);
    // {notes}: vài mốc gần nhất, cắt ngắn để URL không phình ra.
    const notes = timeline.slice(0, 5)
      .map(e => `- ${e.text.replace(/\s*\n\s*/g, ' ').slice(0, 160)}`)
      .join(' ').slice(0, 500);
    return {
      symbol: project.symbol || '',
      chain: S ? S.chainLabel(project.chain) : project.chain,
      address: project.address,
      name: project.name || '',
      mc: ctx.mc || (lastMc && lastMc.mc) || 'unknown',
      summary: (project.summary || '').replace(/\s*\n\s*/g, ' ').slice(0, 600),
      tags: (project.tags || []).join(', '),
      status: S ? S.statusLabel(project.status) : project.status || '',
      notes,
      gmgn_url: S ? S.tokenUrl(project) : '',
      dex_url: `https://dexscreener.com/search?q=${encodeURIComponent(project.address)}`,
      x_url: `https://x.com/search?q=${encodeURIComponent(project.address)}&f=live`,
      date: new Date().toISOString().slice(0, 10),
    };
  }

  function buildPrompt(template, v) {
    let s = String(template || DEFAULT_TEMPLATE);
    for (const k of PLACEHOLDERS) s = s.split(`{${k}}`).join(v[k] == null ? '' : String(v[k]));
    // Bỏ những dòng có nhãn nhưng không có nội dung (ví dụ "Tôi đã biết:" khi chưa viết tóm tắt).
    s = s.split('\n').filter(line => !/^[^:\n]{1,40}:\s*$/.test(line.trim())).join('\n');
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function urlFor(target, prompt) {
    return (TARGETS[target] || TARGETS.x).url(prompt);
  }

  globalThis.NotedResearch = { TEMPLATES, DEFAULT_TEMPLATE, defaultTemplate, PLACEHOLDERS, TARGETS, vars, buildPrompt, urlFor };
})();
