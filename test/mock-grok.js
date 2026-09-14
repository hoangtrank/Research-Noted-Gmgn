// Trang Grok giả lập (x.com/i/grok, grok.com) để test luồng Research: ô nhập contenteditable nhận ?text= / ?q=,
// bấm Send thì thêm bong bóng người dùng + câu trả lời của Grok có nhiều đoạn; có nav/sidebar/footer gây nhiễu.
'use strict';

const ANSWER_P1 = 'PROLOG is an AI agent launchpad on the Robinhood chain that lets teams deploy autonomous trading agents with a shared liquidity layer, and it has processed a steadily growing volume since the token generation event in October.';
const ANSWER_P2 = 'The team includes former Coinbase engineers, the token is backed by Virtuals and a few well-known accounts such as @example_alpha have posted about the partnership in the last seven days, mostly positive.';
const ANSWER_LI = 'Red flag: the top 10 holders control about 38 percent of the supply and a 15 percent unlock is scheduled for November, so watch for sell pressure around that date.';

function page(url) {
  const u = new URL(url);
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
    document.getElementById('send').addEventListener('click', () => {
      const c = document.getElementById('composer');
      const conv = document.getElementById('conv');
      const q = c.textContent.trim();
      conv.insertAdjacentHTML('beforeend', '<div class="msg user"><div class="hdr">You</div><div class="txt"></div></div>');
      conv.lastElementChild.querySelector('.txt').textContent = q;
      conv.insertAdjacentHTML('beforeend', '<div class="msg grok"><div class="hdr">Grok</div><div class="md"><p>${esc(ANSWER_P1)}</p><p>${esc(ANSWER_P2)}</p><ul><li>${esc(ANSWER_LI)}</li></ul></div><div class="actions">Copy · Share · Regenerate</div></div>');
      c.textContent = '';
      history.replaceState({}, '', '/i/grok?conversation=1234567890');
    });
  </script></body></html>`;
}

module.exports = { page, ANSWER_P1, ANSWER_P2, ANSWER_LI };
