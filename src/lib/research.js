// NotedResearch: dựng prompt research từ template và mở Grok bằng deep link (không cần API key).
// Có sẵn ba bản mặc định (en/vi/zh) chọn theo ngôn ngữ giao diện; người dùng sửa lại được trong Settings.
(() => {
  'use strict';
  if (globalThis.NotedResearch) return;

  const EN = [
    'Research token — {address} ({name} | ${symbol}) | Chain: {chain} | MC: {mc}',
    '',
    'Use X + web + docs + explorer. Answer in English.',
    'DEV / KOL / MEME: short bullets.',
    'PROJECT: write it out properly, cover every point, do not shrink it to 1–2 sentences.',
    'No guessing. Missing = "not found".',
    'X handles as https://x.com/username. No hidden markdown links.',
    'Do NOT repeat the address, chain, MC, chart or dex — unless needed to prove who the dev is.',
    '',
    'OUTPUT IN EXACTLY THIS ORDER:',
    '',
    'DEV (first, 5–8 lines)',
    '• Confirmed dev/lead: role + https://x.com/...',
    '• Token account: https://x.com/...',
    '• GitHub / LinkedIn: URL or not found',
    '• Anon or doxxed. Team size if there is a source',
    '• Previous projects + how they ended: only when there is a name',
    '',
    'How to look:',
    '1. Website/docs/bio of the token\'s X account',
    '2. People tagged as builder, saying "I/we built", AMA guests',
    '3. Early follow/like/reply = "early connection", do not call them the dev',
    '4. Deployer/launchpad',
    '',
    'KOL',
    '• https://x.com/... + follow / quote / AMA',
    '• Paid shill: state it if there is proof, otherwise not found',
    '',
    'PROJECT (write in full, using exactly these 4 sections)',
    '',
    '1. Problem',
    '• What the market/users are missing',
    '• The concrete pain point on this specific chain, nothing generic',
    '',
    '2. Solution',
    '• What the main product is',
    '• What the user does, and which step produces the yield/utility',
    '• What role the ${symbol} token plays in that loop',
    '',
    '3. How to use it (explained for someone who is not technical)',
    '• Where to go and what to prepare to start (wallet, which asset, on which chain)',
    '• The main steps in order, like a guide for a first-time user',
    '• What the user gets at each step, and what it costs',
    '• Avoid jargon; if a term is unavoidable, explain it briefly in brackets',
    '',
    '4. Current state of the product',
    '• Live / testnet / docs only',
    '• URLs of app, docs, repo',
    '• Which modules are running, which are only announced',
    '',
    'MEME (only if it is a meme; if it is a utility token write "not a meme")',
    '• Original story + source URL',
    '• Who is involved: role + https://x.com/...',
    '• Meaning: what it is mocking/conveying',
  ].join('\n');

  const VI = [
    'Research token — {address} ({name} | ${symbol}) | Chain: {chain} | MC: {mc}',
    '',
    'Dùng X + web + docs + explorer. Tiếng Việt.',
    'DEV / KOL / MEME: bullet ngắn.',
    'PROJECT: viết kỹ, đủ ý, không rút thành 1–2 câu.',
    'Không đoán. Thiếu = "không tìm thấy".',
    'Handle X: https://x.com/username. Không markdown ẩn link.',
    'KHÔNG output lại address, chain, MC, chart, dex — trừ khi cần chứng minh dev.',
    '',
    'OUTPUT ĐÚNG THỨ TỰ:',
    '',
    'DEV (đầu tiên, 5–8 dòng)',
    '• Dev/lead xác nhận: vai trò + https://x.com/...',
    '• Acc token: https://x.com/...',
    '• GitHub / LinkedIn: URL hoặc không tìm thấy',
    '• Anon hay doxx. Team size nếu có nguồn',
    '• Dự án cũ + kết cục: chỉ khi có tên',
    '',
    'Cách tìm:',
    '1. Website/docs/bio X token',
    '2. Người được tag builder, nói "I/we built", guest AMA',
    '3. Follow/like/reply sớm = "liên quan sớm", không gọi là dev',
    '4. Deployer/launchpad',
    '',
    'KOL',
    '• https://x.com/... + follow / quote / AMA',
    '• Paid shill: có chứng thì ghi, không thì không tìm thấy',
    '',
    'PROJECT (viết đầy đủ, theo đúng 4 mục này)',
    '',
    '1. Vấn đề',
    '• Thị trường/người dùng đang thiếu gì',
    '• Pain point cụ thể trên đúng chain này, không nói chung chung',
    '',
    '2. Cách giải quyết',
    '• Sản phẩm chính là gì',
    '• User làm gì, bước nào ra yield/utility',
    '• Token ${symbol} đóng vai trò gì trong vòng đó',
    '',
    '3. Cách sử dụng nền tảng (giải thích cho người không rành kỹ thuật)',
    '• Vào đâu, cần chuẩn bị gì để bắt đầu (ví, tài sản nào, trên chain nào)',
    '• Các bước sử dụng chính theo thứ tự, như hướng dẫn cho người mới',
    '• Mỗi bước người dùng nhận được gì, mất phí gì',
    '• Tránh thuật ngữ; bắt buộc dùng thì giải thích ngắn trong ngoặc',
    '',
    '4. Hiện trạng sản phẩm',
    '• Live / testnet / chỉ docs',
    '• URL app, docs, repo',
    '• Module nào đã chạy, module nào mới công bố',
    '',
    'MEME (chỉ khi là meme; nếu utility thì ghi "không phải meme")',
    '• Câu chuyện gốc + URL nguồn',
    '• Ai liên quan: vai trò + https://x.com/...',
    '• Ý nghĩa: đang chế/truyền đạt gì',
  ].join('\n');

  const ZH = [
    '研究代币 — {address}（{name} | ${symbol}）| 链: {chain} | 市值: {mc}',
    '',
    '使用 X + 网络 + 文档 + 区块浏览器。用中文回答。',
    'DEV / KOL / MEME：简短条目。',
    'PROJECT：写详细、写完整，不要缩成一两句。',
    '不要猜测。缺失 = 「未找到」。',
    'X 账号写成 https://x.com/username。不要隐藏式 markdown 链接。',
    '不要重复输出地址、链、市值、图表、dex — 除非需要用来证明开发者身份。',
    '',
    '严格按以下顺序输出：',
    '',
    'DEV（放在最前，5–8 行）',
    '• 已确认的开发者/负责人：角色 + https://x.com/...',
    '• 代币账号：https://x.com/...',
    '• GitHub / LinkedIn：URL 或未找到',
    '• 匿名还是已公开身份。有来源时写团队规模',
    '• 以前的项目 + 结局：仅在有项目名时填写',
    '',
    '查找方法：',
    '1. 官网/文档/代币 X 账号简介',
    '2. 被标注为 builder、自称 "I/we built"、AMA 嘉宾的人',
    '3. 早期关注/点赞/回复 = 「早期关联」，不要称为开发者',
    '4. 部署者/launchpad',
    '',
    'KOL',
    '• https://x.com/... + 关注 / 引用 / AMA',
    '• 付费推广：有证据就写，没有就写未找到',
    '',
    'PROJECT（完整撰写，严格按这 4 个部分）',
    '',
    '1. 问题',
    '• 市场/用户缺少什么',
    '• 这条链上的具体痛点，不要泛泛而谈',
    '',
    '2. 解决方式',
    '• 核心产品是什么',
    '• 用户做什么，哪一步产生收益/效用',
    '• 代币 ${symbol} 在这个循环中起什么作用',
    '',
    '3. 使用方法（用非技术人员能看懂的话解释）',
    '• 去哪里、开始前要准备什么（钱包、哪种资产、在哪条链上）',
    '• 按顺序写出主要使用步骤，像给新手的教程',
    '• 每一步用户能得到什么、要付什么费用',
    '• 避免术语；必须使用时在括号里简短解释',
    '',
    '4. 产品现状',
    '• 已上线 / 测试网 / 仅有文档',
    '• 应用、文档、代码库的 URL',
    '• 哪些模块已运行，哪些只是公布',
    '',
    'MEME（仅当是 meme 时；如果是实用型代币则写「不是 meme」）',
    '• 原始故事 + 来源 URL',
    '• 相关人物：角色 + https://x.com/...',
    '• 含义：在调侃/传达什么',
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
    const fill = line => { let o = line; for (const k of PLACEHOLDERS) o = o.split(`{${k}}`).join(v[k] == null ? '' : String(v[k])); return o; };
    // Bỏ dòng có nhãn nhưng placeholder của nó rỗng (ví dụ "Tôi đã biết: {summary}" khi chưa viết tóm tắt).
    // Chỉ xét dòng CÓ placeholder: tiêu đề cố ý kết thúc bằng dấu hai chấm ("OUTPUT ĐÚNG THỨ TỰ:") phải giữ nguyên.
    const s = String(template || DEFAULT_TEMPLATE).split('\n')
      .map(line => ({ out: fill(line), had: PLACEHOLDERS.some(k => line.includes(`{${k}}`)) }))
      .filter(x => !(x.had && /^[^:\n]{1,40}:\s*$/.test(x.out.trim())))
      .map(x => x.out).join('\n');
    // "({name} | ${symbol})" khi chưa có tên ra "( | $PAIR)": bỏ vế rỗng quanh dấu gạch đứng trong ngoặc.
    return s.replace(/\(\s*\|\s*/g, '(').replace(/\s*\|\s*\)/g, ')')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function urlFor(target, prompt) {
    return (TARGETS[target] || TARGETS.x).url(prompt);
  }

  globalThis.NotedResearch = { TEMPLATES, DEFAULT_TEMPLATE, defaultTemplate, PLACEHOLDERS, TARGETS, vars, buildPrompt, urlFor };
})();
