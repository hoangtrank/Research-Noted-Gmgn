// Chẩn đoán vì sao Grok không tự lưu — dán vào Console của chính tab Grok đang mở.
// Chỉ ĐỌC trang, không gửi gì đi đâu. In ra một báo cáo ngắn, copy sẵn vào clipboard.
//
// CÁCH DÙNG: F12 -> Console -> dán file này -> Enter -> gửi lại phần in ra.
(() => {
  const L = [];
  const say = (k, v) => L.push(k.padEnd(22) + ' ' + v);
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const tag = el => el ? el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '(không có)';

  say('URL', location.origin + location.pathname);

  // 1) Content script đã chạy chưa? (shadow host của extension nằm trong DOM của trang)
  const host = document.getElementById('noted-grok-host');
  say('content script', host ? 'CÓ CHẠY' : 'KHÔNG THẤY — script chưa được nạp vào trang này');
  if (host && host.shadowRoot) {
    const R = host.shadowRoot;
    const q = s => { const el = R.querySelector(s); if (!el) return null; const v = /^(input|textarea|select)$/i.test(el.tagName) ? el.value : el.textContent; return String(v || '').trim(); };
    const linked = !R.querySelector('.recent');            // chưa gắn dự án thì có ô "dự án gần đây"
    const hasPrompt = !!R.querySelector('.autochk');       // chỉ có khi tab được mở từ nút Research with Grok
    say('nhãn panel', q('.pill') || '(rỗng)');
    say('gắn dự án', linked ? 'RỒI' : 'CHƯA — tab này không mở từ nút Research with Grok');
    say('có prompt kèm tab', hasPrompt ? 'CÓ' : 'KHÔNG — tự lưu chỉ chạy khi tab mang theo prompt');
    say('công tắc tự lưu', hasPrompt ? (R.querySelector('.autochk').checked ? 'BẬT' : 'TẮT') : '(không có)');
    say('trạng thái tự lưu', !hasPrompt ? '(không áp dụng)'
      : q('.autostat') === null ? 'THIẾU DÒNG NÀY -> đang chạy bản cũ, chưa phải 0.9.3'
      : (q('.autostat') || '(rỗng)'));
    say('dòng kết quả', q('.status') || '(rỗng)');
    say('ô xem trước', (q('.text') || '').length + ' ký tự');
  }

  // 2) Thử lại đúng thuật toán bắt câu trả lời, ngay trên DOM thật của trang này.
  const u = new URL(location.href);
  const prompt = u.searchParams.get('text') || u.searchParams.get('q') || '';
  // Sau khi gửi, X/Grok ghi đè URL nên không còn ?text= — khi đó lấy địa chỉ contract xuất hiện
  // trên trang làm dấu nhận, đúng như extension vẫn làm (nó có địa chỉ sẵn trong ghi chú).
  const ADDR = /0x[a-fA-F0-9]{40,64}|[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const addr = (prompt.match(ADDR) || [])[0] || ((document.body.innerText || '').match(ADDR) || [])[0] || '';
  say('prompt trên URL', prompt ? prompt.length + ' ký tự' : 'không còn (trang đã ghi đè URL — vẫn chẩn đoán được)');
  say('địa chỉ contract', addr || 'KHÔNG THẤY trên trang');

  const sigs = [];
  if (prompt) sigs.push(norm(prompt).slice(0, 60));
  if (addr) sigs.push(norm(addr));
  say('dấu nhận prompt', sigs.length ? sigs.map(s => JSON.stringify(s.slice(0, 28) + '…')).join(' | ') : '(không dựng được)');

  const composer = document.querySelector('[contenteditable="true"], textarea');
  say('ô nhập', tag(composer));

  const hit = el => { const x = norm(el.textContent); return sigs.some(s => x.includes(s)); };
  let bubble = null;
  if (sigs.length) {
    for (const el of document.querySelectorAll('div, p, article, section, span')) {
      if (host && host.contains(el)) continue;
      if (el.closest('[contenteditable], textarea, form')) continue;
      if (composer && el.contains(composer)) continue;
      if (!hit(el)) continue;
      let deeper = false;
      for (const c of el.children) if (hit(c)) { deeper = true; break; }
      if (deeper || !el.getClientRects().length) continue;
      bubble = el; break;
    }
  }
  say('bong bóng prompt', bubble ? tag(bubble) : 'KHÔNG TÌM THẤY');

  const head = sigs[0] || '';
  const cands = [];
  for (const el of document.querySelectorAll('div, article, section, p, li, span')) {
    if (host && host.contains(el)) continue;
    if (el.closest('[contenteditable], textarea, form, nav, header, footer, aside, [role="navigation"], [role="complementary"], [role="banner"]')) continue;
    if (composer && el.contains(composer)) continue;
    const txt = el.textContent || '';
    const len = txt.trim().length;
    if (len < 120 || len > 30000) continue;
    let dominated = false;
    for (const c of el.children) if ((c.textContent || '').trim().length >= len * 0.9) { dominated = true; break; }
    if (dominated || !el.getClientRects().length) continue;
    if (head && norm(txt).includes(head)) continue;
    if (bubble && (el === bubble || el.contains(bubble))) continue;
    if (bubble && !(bubble.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    cands.push(el);
  }
  const top = cands.filter(el => !cands.some(o => o !== el && o.contains(el)));
  let pick = null;
  if (composer) for (const b of top) if (composer.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) pick = b;
  if (!pick && top.length) pick = top[top.length - 1];
  say('khối ứng viên', cands.length + ' (ngoài cùng: ' + top.length + ')');
  say('khối được chọn', pick ? tag(pick) : 'KHÔNG CÓ');
  const text = pick ? (pick.innerText || pick.textContent || '').trim() : '';
  say('độ dài bắt được', text.length + ' ký tự');
  say('160 ký tự đầu', text ? JSON.stringify(text.slice(0, 160)) : '(rỗng)');

  const out = '--- Research-Noted-Gmgn debug ---\n' + L.join('\n');
  console.log(out);
  navigator.clipboard.writeText(out)
    .then(() => console.log('✅ Đã copy báo cáo vào clipboard — dán lại cho tôi.'))
    .catch(() => console.log('Bôi đen đoạn trên rồi copy tay giúp tôi.'));
})();
