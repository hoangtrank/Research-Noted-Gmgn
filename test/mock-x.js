// Feed X giả lập: các bài <article data-testid="tweet"> với tweetText, User-Name, time, link /user/status/id và thanh hành động role=group.
'use strict';
const TWEETS = [
  { user: 'alpha_caller', name: 'Alpha Caller', id: '1900000000000000001', time: '2026-09-14T08:00:00.000Z', text: 'PROLOG just partnered with Virtuals, volume x3 today. $PROLOG looks strong on Robinhood chain.' },
  { user: 'degen_dan', name: 'Degen Dan', id: '1900000000000000002', time: '2026-09-14T09:30:00.000Z', text: 'Random thought about the market. No ticker here, just vibes and a very long sentence to make the block bigger than one hundred and twenty characters.' },
  { user: 'chain_watch', name: 'Chain Watch', id: '1900000000000000003', time: '2026-09-14T10:00:00.000Z', text: 'New contract spotted: Cn1PJnjYTkcGGGEWnFjoV8ryFeZxU9STKzN9DM6Fpump — extension season?' },
];
const COLORS = ['#e11d1d', '#1d4ed8', '#15803d']; // đỏ / xanh dương / xanh lá: để test biết cắt đúng bài nào
function page() {
  const art = (tw, i) => `<article data-testid="tweet" role="article" tabindex="0">
    <div class="hd"><div data-testid="User-Name"><span>${tw.name}</span> <span>@${tw.user}</span> · <a href="/${tw.user}/status/${tw.id}"><time datetime="${tw.time}">1h</time></a></div></div>
    <div data-testid="tweetText"><span>${tw.text}</span></div>
    <div class="media" style="height:120px;background:${COLORS[i]};border-radius:12px;margin:8px 0"></div>
    <div role="group" aria-label="actions"><button>💬 12</button><button>🔁 3</button><button>❤️ 40</button><button>📊 1.2K</button><button>🔖</button><button>↗</button></div>
  </article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Home / X</title>
  <style>body{margin:0;background:#000;color:#e7e9ea;font:15px -apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;grid-template-columns:240px 600px 1fr}
  nav{padding:16px;border-right:1px solid #2f3336}main{border-right:1px solid #2f3336}article{padding:12px 16px;border-bottom:1px solid #2f3336}
  .hd{color:#71767b;font-size:14px;margin-bottom:6px}[role=group]{display:flex;gap:18px;margin-top:10px;align-items:center}[role=group] button{background:none;border:0;color:#71767b;cursor:pointer;font:inherit}
  aside{padding:16px;color:#71767b}a{color:#71767b;text-decoration:none}</style></head>
  <body><nav><div>Home</div><div>Explore</div><div>Grok</div></nav><main>${TWEETS.map((tw, i) => art(tw, i)).join('')}</main><aside>Trends for you: Robinhood chain, AI agents, memecoins and other things people talk about today.</aside></body></html>`;
}
module.exports = { page, TWEETS };
