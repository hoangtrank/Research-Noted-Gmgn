// Trang Grok giả lập (x.com/i/grok, grok.com) để test luồng Research: ô nhập contenteditable nhận ?text= / ?q=,
// bấm Send thì thêm bong bóng người dùng + câu trả lời của Grok có nhiều đoạn; có nav/sidebar/footer gây nhiễu.
'use strict';

const ANSWER_P1 = 'PROLOG is an AI agent launchpad on the Robinhood chain that lets teams deploy autonomous trading agents with a shared liquidity layer, and it has processed a steadily growing volume since the token generation event in October.';
const ANSWER_P2 = 'The team includes former Coinbase engineers, the token is backed by Virtuals and a few well-known accounts such as @example_alpha have posted about the partnership in the last seven days, mostly positive.';
const ANSWER_LI = 'Red flag: the top 10 holders control about 38 percent of the supply and a 15 percent unlock is scheduled for November, so watch for sell pressure around that date.';

// shape=span: dựng DOM giống X thật — chữ nằm trong <span>, câu trả lời chỉ một khối (mọi thẻ cha đều bị
// một con chiếm gần hết chữ). Đây là hình dạng làm heuristic cũ "chỉ xét div/p" bắt hụt cả prompt lẫn câu trả lời.
const ANSWER_SPAN = ANSWER_P1 + ' ' + ANSWER_P2 + ' Span layout answer.';

function page(url) {
  const u = new URL(url);
  const spanShape = u.searchParams.get('shape') === 'span';
  const text = u.searchParams.get('text') || u.searchParams.get('q') || '';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Grok / X</title>
  <style>body{margin:0;background:#000;color:#e7e9ea;font:15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;grid-template-columns:240px 1fr 320px;min-height:100vh}
  nav{padding:16px;border-right:1px solid #2f3336}nav div{padding:8px 0}
  main{padding:16px;display:flex;flex-direction:column}
  #conv{flex:1}.msg{margin:12px 0;padding:12px;border-radius:12px;max-width:640px}.user{background:#16181c;margin-left:auto}.grok{background:#0d1117}
  .hdr{font-size:12px;color:#71767b;margin-bottom:6px}.actions{font-size:12px;color:#71767b;margin-top:8px}
  #composer{min-height:44px;border:1px solid #2f3336;border-radius:12px;padding:10px;outline:none;white-space:pre-wrap}
  aside{padding:16px;border-left:1px solid #2f3336;color:#71767b}footer{grid-column:1/-1;padding:12px;color:#71767b;font-size:12px}</style></head>
  <body>
  <nav><div>Home</div><div>Explore</div><div>Notifications</div><div>Messages</div><div>Grok</div><div>Premium</div><div>Profile</div></nav>
  <main>
    <div id="conv"></div>
    <div id="composer" contenteditable="true">${esc(text)}</div>
    <button id="send">Send</button>
  </main>
  <aside><h3>Trends for you</h3><div>Trending in Crypto: Robinhood chain launches new agent framework as volume climbs across memecoins and AI tokens, traders discuss the next narrative for the fourth quarter of the year.</div></aside>
  <footer>Terms of Service Privacy Policy Cookie Policy Accessibility Ads info More © 2026 X Corp. This footer intentionally contains more than one hundred and twenty characters of text.</footer>
  <script>
    // Giả lập streaming: câu trả lời hiện dần theo từng đoạn nhỏ trong ~1.5s; lần trả lời sau có thêm dòng riêng.
    const spanShape = ${spanShape ? 'true' : 'false'};
    let n = 0;
    document.getElementById('send').addEventListener('click', () => {
      const c = document.getElementById('composer');
      const conv = document.getElementById('conv');
      const q = c.textContent.trim();
      n++;
      conv.insertAdjacentHTML('beforeend', spanShape
        ? '<div class="msg user"><div class="hdr">You</div><div class="txt"><span class="s"></span></div></div>'
        : '<div class="msg user"><div class="hdr">You</div><div class="txt"></div></div>');
      conv.lastElementChild.querySelector(spanShape ? '.txt .s' : '.txt').textContent = q || 'Any other risks with the unlock?';
      conv.insertAdjacentHTML('beforeend', spanShape
        ? '<div class="msg grok"><div class="hdr">Grok</div><div class="md"><div class="wrap"><span class="p1"></span></div></div><div class="actions">Copy · Share · Regenerate</div></div>'
        : '<div class="msg grok"><div class="hdr">Grok</div><div class="md"><p class="p1"></p><p class="p2"></p><ul><li class="li"></li></ul></div><div class="actions">Copy · Share · Regenerate</div></div>');
      const md = conv.lastElementChild.querySelector('.md');
      const parts = spanShape
        ? [['.p1', ${JSON.stringify(ANSWER_SPAN)} + (n > 1 ? ' Follow-up answer number ' + n + '.' : '')]]
        : [['.p1', ${JSON.stringify(ANSWER_P1)}], ['.p2', ${JSON.stringify(ANSWER_P2)}], ['.li', ${JSON.stringify(ANSWER_LI)} + (n > 1 ? ' Follow-up answer number ' + n + '.' : '')]];
      const chunks = [];
      for (const [sel, text] of parts) for (let i = 0; i < text.length; i += 40) chunks.push([sel, text.slice(0, i + 40)]);
      let k = 0;
      const tick = () => { if (k >= chunks.length) return; const [sel, text] = chunks[k++]; md.querySelector(sel).textContent = text; setTimeout(tick, 60); };
      tick();
      c.textContent = '';
      history.replaceState({}, '', '/i/grok?conversation=1234567890');
    });
  </script></body></html>`;
}

module.exports = { page, ANSWER_P1, ANSWER_P2, ANSWER_LI, ANSWER_SPAN };
