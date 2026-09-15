// Trang tìm kiếm X giả lập: /search?q=... với vài bài <article> có link /user/status/id và nội dung.
'use strict';
function page(url) {
  const u = new URL(url);
  const q = u.searchParams.get('q') || '';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const art = (user, id, text) => `<article data-testid="tweet" role="article"><div class="hd"><span data-testid="User-Name">${user} @${user}</span> · <a href="/${user}/status/${id}"><time datetime="2026-09-14T08:00:00.000Z">1h</time></a></div><div data-testid="tweetText">${esc(text)}</div><div role="group"><button>💬</button><button>🔁</button><button>❤️</button></div></article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(q)} - Search / X</title>
  <style>body{margin:0;background:#000;color:#e7e9ea;font:15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;grid-template-columns:240px 600px 1fr}nav,aside{padding:16px;color:#71767b}main{border-right:1px solid #2f3336}article{padding:12px 16px;border-bottom:1px solid #2f3336}.hd{color:#71767b;font-size:14px;margin-bottom:6px}a{color:#71767b;text-decoration:none}</style></head>
  <body><nav>Home Explore</nav><main><h2 style="padding:0 16px">Search: ${esc(q)}</h2>
  ${art('hoangtrank', '1900000000000000011', 'đây là dự án ngon, team ex-Coinbase, volume tăng đều')}
  ${art('alpha_caller', '1900000000000000012', 'Big partnership incoming for this one, watch the unlock in November.')}
  </main><aside>Trends for you</aside></body></html>`;
}
module.exports = { page };
