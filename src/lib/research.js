// NotedResearch: dựng prompt research từ template và mở Grok bằng deep link (không cần API key).
(() => {
  'use strict';
  if (globalThis.NotedResearch) return;

  const DEFAULT_TEMPLATE = [
    'Research this crypto token: ${symbol} on {chain}, contract {address}.',
    'Search X for the contract address and ${symbol} posts from the last 7 days, then answer in this format:',
    '1. What the project does (2-3 sentences)',
    '2. Team, backers and notable accounts talking about it',
    '3. Narrative and upcoming catalysts (listings, unlocks, launches)',
    '4. Red flags (holder concentration, dev history, rug signals)',
    '5. Verdict: watch / dig deeper / pass, with a one-line reason',
    'Current market cap: {mc}. gmgn page: {gmgn_url}',
  ].join('\n');

  const PLACEHOLDERS = ['symbol', 'chain', 'address', 'name', 'mc', 'summary', 'tags', 'gmgn_url'];

  // Đích mở prompt. Grok trên X nhận ?text=, grok.com nhận ?q=.
  const TARGETS = {
    x:    { label: 'Grok on X (x.com/i/grok)', url: p => `https://x.com/i/grok?text=${encodeURIComponent(p)}` },
    grok: { label: 'grok.com',                 url: p => `https://grok.com/?q=${encodeURIComponent(p)}` },
  };

  function vars(project, ctx = {}) {
    const S = globalThis.NotedStore;
    const lastMc = [...(project.timeline || [])].sort((a, b) => b.ts - a.ts).find(e => e.mc);
    return {
      symbol: project.symbol || '',
      chain: S ? S.chainLabel(project.chain) : project.chain,
      address: project.address,
      name: project.name || '',
      mc: ctx.mc || (lastMc && lastMc.mc) || 'unknown',
      summary: project.summary || '',
      tags: (project.tags || []).join(', '),
      gmgn_url: S ? S.tokenUrl(project) : '',
    };
  }

  function buildPrompt(template, v) {
    let s = String(template || DEFAULT_TEMPLATE);
    for (const k of PLACEHOLDERS) s = s.split(`{${k}}`).join(v[k] == null ? '' : String(v[k]));
    return s.replace(/[ \t]+\n/g, '\n').trim();
  }

  function urlFor(target, prompt) {
    return (TARGETS[target] || TARGETS.x).url(prompt);
  }

  globalThis.NotedResearch = { DEFAULT_TEMPLATE, PLACEHOLDERS, TARGETS, vars, buildPrompt, urlFor };
})();
