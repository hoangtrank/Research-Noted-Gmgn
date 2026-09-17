// Chụp "hình dạng DOM" của một cuộc trò chuyện Grok thật, để sửa phần tự lưu câu trả lời.
//
// CÁCH DÙNG
//   1. Mở tab Grok đã có prompt và câu trả lời (x.com/i/grok hoặc grok.com).
//   2. Bấm F12 -> thẻ Console.
//   3. Dán toàn bộ file này vào rồi Enter. Kết quả được copy sẵn vào clipboard.
//   4. Dán vào test/fixtures/grok-real.html trong repo (tạo file mới) rồi gửi lại.
//
// AN TOÀN — script này chỉ ĐỌC trang, không gửi gì đi đâu, và trước khi in ra nó đã:
//   - bỏ toàn bộ <script>, <style>, <svg>, <img>, <video>, <iframe>, <link>
//   - bỏ mọi thuộc tính trừ class / dir / role / data-testid / contenteditable
//     (nên không còn href, id, src, token, ảnh đại diện...)
//   - chỉ lấy phần khung hội thoại, không lấy sidebar, không lấy DM, không lấy thông báo
// Dù vậy phần chữ của prompt và câu trả lời vẫn còn nguyên — hãy đọc lại một lượt
// trước khi gửi, và xoá tay bất cứ đoạn nào bạn không muốn chia sẻ.
(() => {
  const KEEP = new Set(['class', 'dir', 'role', 'data-testid', 'contenteditable']);
  const DROP = 'script,style,svg,img,video,iframe,link,noscript,picture,source,canvas';

  // Khung hội thoại = tổ tiên chung gần nhất của khối chữ dài nhất và ô nhập.
  const composer = document.querySelector('[contenteditable="true"], textarea');
  let longest = null;
  for (const el of document.querySelectorAll('div, article, section, p, li, span')) {
    const n = (el.textContent || '').trim().length;
    if (n > 200 && n < 40000 && (!longest || n > longest.n)) longest = { el, n };
  }
  if (!longest) { console.log('Không tìm thấy câu trả lời nào trên trang.'); return; }
  let root = longest.el;
  if (composer) {
    let a = longest.el;
    while (a && !a.contains(composer)) a = a.parentElement;
    root = a || longest.el;
  }
  for (let i = 0; i < 3 && root.parentElement; i++) root = root.parentElement;

  const copy = root.cloneNode(true);
  for (const el of copy.querySelectorAll(DROP)) el.remove();
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) if (!KEEP.has(a.name)) el.removeAttribute(a.name);
  }
  const html = copy.outerHTML.replace(/>\s+</g, '><');
  const out = `<!-- ${location.host} — ${new Date().toISOString().slice(0, 10)} -->\n${html}\n`;
  console.log(out);
  navigator.clipboard.writeText(out)
    .then(() => console.log('✅ Đã copy vào clipboard (' + out.length + ' ký tự). Dán vào test/fixtures/grok-real.html'))
    .catch(() => console.log('Không copy tự động được — hãy bôi đen đoạn in ở trên rồi copy tay.'));
})();
