# Security notes — Research-Noted-Gmgn

## Threat model

The extension runs content scripts on third-party sites (gmgn.ai, dexscreener.com, x.com/i/grok, grok.com), stores user notes locally, and calls one public API (api.dexscreener.com). It has no server and no account. Attack surfaces:

| Surface | Untrusted input | Mitigation |
|---|---|---|
| Page DOM (symbols, market cap, Grok answers) | Text read from the page | Every value rendered with `innerHTML` goes through `esc()`; URLs in notes are linkified only when they start with `http(s)://` and get `rel="noopener noreferrer"`. Inputs receive values through `.value`/`textContent`. |
| Injected button attributes (light DOM, editable by the page) | `data-chain`, `data-address`, `data-symbol` | Re-validated on click with `normalizeChain` / `normalizeAddress`; symbol is escaped and length-limited. |
| DexScreener API responses | JSON fields | Addresses normalized; symbol/name escaped and length-limited; results cached as plain data. Only `chain` `[a-z0-9-]` and address `[A-Za-z0-9_.:-]` reach the request URL. |
| Messages to the service worker | `chrome.runtime.onMessage` | Only extension contexts can send (no `externally_connectable`). Content scripts may only act on their own tab (`sender.tab.id`, `msg.tabId` ignored). Grok-related messages must come from x.com/twitter.com/grok.com, DexScreener resolution from dexscreener.com. Tokens, entry types and URLs are validated and length-limited before use. |
| X search query and selected text | Query string, page text | Query parsed with strict address/cashtag patterns; selected text is escaped when rendered and length-limited; author handle comes from the post's status link pattern. |
| Imported JSON | Arbitrary file | `sanitize()` rejects records with invalid chain/address, coerces every field to its type, caps lengths (symbol 32, name 200, summary 20k, entry 20k, 50 tags, 5000 entries), validates entry ids/types/status. Object spread is used, so `__proto__` keys cannot pollute prototypes. |
| Extension page URLs (`dashboard.html?open=`, `panel.html?tab=`) | Query string | Validated; extension pages are not web-accessible so web pages cannot open them. |
| Outbound links | gmgn / X / DexScreener / Grok links | Built from validated chain/address with `encodeURIComponent`; fixed hosts. |
| Remote code | none | No CDN, no `eval`, explicit CSP `script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. |

## Permissions

`storage`, `unlimitedStorage` (notes), `activeTab` (read the current tab URL on user action), `sidePanel` (editor UI), host `api.dexscreener.com` (pair → token), content scripts on gmgn.ai, dexscreener.com, x.com/search, x.com/i/grok and grok.com. No `tabs`, no `<all_urls>`, no `webRequest`, no `contextMenus`.

## Data leaving the device

Only two, both user-initiated: the research prompt (token symbol, chain, contract, market cap, gmgn link) when clicking **Research with Grok**, and pair addresses sent to DexScreener's public API. Notes themselves never leave `chrome.storage.local`.

## Self-check

`python3 scripts/audit.py` re-derives this table from the source: it prints the declared permissions, the content-script hosts, every `fetch`/XHR call site and the domains reachable from the code, and fails if any forbidden API (eval, cookies, clipboard, history, bookmarks, identity, debugger, downloads, management, native messaging, webRequest, proxy, WebSocket, page wallet objects) appears or if a remote script is loaded. `scripts/pack.py` prints the SHA-256 of the built ZIP so a published build can be matched against a source tree.

## Reporting

Open an issue at https://github.com/hoangtrank/Research-Noted-Gmgn/issues.
