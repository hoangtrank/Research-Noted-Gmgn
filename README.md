# Research-Noted-Gmgn

Chrome extension (Manifest V3) that adds a **✎ note** button next to every token on [gmgn.ai](https://gmgn.ai) and [dexscreener.com](https://dexscreener.com) so you can keep **timeline research notes** per project: what it does, tags, pin, status, conviction, dated entries (research, news, buy, sell, alerts) with X / AI links, and one-click research with Grok.

The goal: when you research hundreds of projects, hovering the button next to a symbol instantly reminds you "what this does, what I found, at what market cap I bought".

UI languages: **English** (default), Tiếng Việt, 中文 — switchable in the popup.

![Watchlist with note buttons and hover tooltip](docs/2-list-tooltip.png)

![Side Panel note editor, outside the gmgn page](docs/5-side-panel.png)

## Features

| Where | What |
|---|---|
| Every token list on gmgn (watchlist, trending, meme, wallets…) and every pair list on DexScreener (watchlist, screener, new pairs…) | ✎ button right after the symbol. Violet = no note yet, yellow = has a note, orange 📌 = pinned; the number is the timeline length. Hover shows summary, tags and the latest entry. |
| Click the button | Opens Chrome's **Side Panel** on the right (outside the page: the browser shrinks gmgn instead of covering it; drag the edge to resize): symbol, one-line name, status, conviction 1–5, **What does this project do?**, tags, timeline. Autosaves. The market cap shown in the row is stored with each entry ("bought at MC $10.6M"). The popup can switch to an in-page overlay instead. |
| Token page on gmgn, pair page on DexScreener | Floating button with symbol + summary; click it or press `Alt+N`. |
| **Side panel follows the page** | Once the panel is open in a tab, opening another token (clicking a watchlist row, a link, the address bar) switches the panel to that token. Toggle in Settings. |
| Extension icon → Dashboard | All noted projects: full-text search (symbol / name / summary / tag / address / entries), filter by status / tag / pinned, sort, edit in place, add by gmgn URL. |
| Export / import | JSON (backup, manual sync between machines) and Markdown (feed your whole research to an AI). |
| **Research with Grok** | One button in the note builds a research prompt from an editable template (symbol, chain, contract, market cap, gmgn link) and opens Grok on X (or grok.com) with it prefilled. On the Grok page, a small Research-Noted-Gmgn panel captures the answer (last message, or your selection) and saves it into the token's timeline as a *Research* entry with a link back to the conversation. No API key, uses your own X account. |

Works on every chain gmgn supports (`sol`, `eth`, `base`, `bsc`, `robinhood`, `xlayer`, `blast`, `tron`…): the storage key is `chain:address`, so the same token in the watchlist, trending or detail page points to one note. DexScreener links use *pair* addresses, so the extension resolves pair → token through DexScreener's public API and lands on the same key: a note written on gmgn shows up on DexScreener and vice versa.

## Research with Grok

1. Open a note (side panel, overlay or dashboard) and click **✨ Research with Grok**.
2. The extension builds a prompt from your template with the token's symbol, chain, contract, current market cap and gmgn link, and opens Grok on X (or grok.com) in a new tab with the prompt prefilled. Press Enter.
3. On the Grok page a small **Research-Noted-Gmgn** panel appears at the bottom right. Once Grok finishes answering (the text has stopped changing for ~3 s), the answer is **saved automatically** into the token's timeline; the panel shows "Auto-saved" with an **Undo** link. Follow-up answers in the same conversation are saved as new entries; identical content is never saved twice. You can still **Capture last answer** or select text and **Use selected text** to save something specific.
4. Entries are of type *Research* and carry a link back to the Grok conversation. If you opened Grok by hand, the panel lets you pick a recent project or paste a gmgn token URL to link it; auto-save only applies to tabs opened from a note (so it never guesses on an unrelated page).

The template, the target (Grok on X / grok.com), auto-save and the follow-the-page toggle live in **Dashboard → ⚙ Settings** (auto-save can also be toggled on the Grok panel itself).

## Save X posts (with screenshot)

Every post on x.com gets a small **✎** button in its action bar. Click it, pick the project (posts mentioning a `$SYMBOL` or a contract address you have noted are suggested first), choose the entry type, and save. The entry stores author, time, text and the post link.

Screenshots need a user gesture that Chrome recognises as "invoking the extension", so for a screenshot use **right-click on the post → "Save post with screenshot to Research-Noted-Gmgn"** or press **Alt+S** while hovering the post. After one such gesture on a tab, the ✎ button can capture too until you navigate away. The screenshot is the visible part of the post (Chrome captures the viewport), scaled to at most 1000 px wide as JPEG (~60–150 KB), stored locally under its own key and shown as a thumbnail in the timeline; click it to open the viewer. JSON export includes screenshots by default (toggle in Settings). Placeholders: `{symbol} {chain} {address} {name} {mc} {summary} {tags} {gmgn_url}`. No API key is needed; Grok runs in your own X account, and only the answer text you choose to save is stored, locally.

## Install (load unpacked)

Requires Chrome / Brave / Edge 116 or newer (Side Panel API).

1. Download the source (clone or Download ZIP and extract).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → pick the repo folder (the one containing `manifest.json`).
4. Reload your gmgn.ai tab. The ✎ button appears next to each symbol.

Icons are included in `icons/`; to change them, edit `scripts/make_icons.py` and run `npm run icons` (it also rewrites the `icons` entries in `manifest.json`). The shortcut `Alt+N` can be changed at `chrome://extensions/shortcuts`.

## Suggested research workflow

1. See a new token on gmgn → click ✎ → write 1–3 sentences in **What does this project do?**, add tags (`ai`, `launchpad`, `robinhood`, `narrative-x`…).
2. Research on X / with an AI → paste the thread link or the AI conclusion into **Timeline** as a *Research* entry. Each entry records the time and the market cap at that moment.
3. Decide → change **Status** (Watching → Researching → Holding → Sold / Passed / Dead), set **Conviction**, **📌 pin** the projects you are actively following.
4. Periodically open the Dashboard, filter `📌 pinned only` or by tag, export Markdown and ask an AI "which of the projects I researched deserve a second look?".
5. Export JSON for backup (data lives in the browser's `chrome.storage.local`; uninstalling the extension deletes it).

## Architecture

```
manifest.json            MV3; permissions: storage, unlimitedStorage, activeTab, sidePanel; localized name via _locales/
_locales/                en (default), vi, zh_CN: extension name, description, command label
src/lib/storage.js       NotedStore: data model, chrome.storage.local access, export/import, Markdown
src/lib/i18n.js          NotedI18n: UI strings for en/vi/zh, language setting, helpers for static HTML
src/lib/editor.js        NotedEditor: the note editor UI shared by the Side Panel, the in-page drawer and the dashboard
src/content/core.js      Shared content-script core: injects buttons, tooltip, floating button, opens the side panel; Shadow DOM drawer as fallback
src/content/sites/gmgn.js        Site adapter: tokens from /{chain}/token/{address} links (+ g-table data-row-key fallback)
src/content/sites/dexscreener.js Site adapter: pair links /{chain}/{pair}, resolved to tokens via the background (DexScreener API, cached)
src/content/badge.css    Styles for the injected button (light DOM)
src/content/grok.js      Content script on x.com/i/grok and grok.com: "Save to Research-Noted-Gmgn" panel (auto-save, capture / selection / link project)
src/content/x.js         Content script on x.com feed: ✎ button per post, project picker, save text/link (+ screenshot via right-click menu or Alt+S)
src/viewer/              Screenshot viewer page
src/lib/research.js      NotedResearch: prompt template, placeholders, deep links to Grok on X and grok.com
src/panel/               Side Panel page (editor for the active tab's token)
src/dashboard/           Dashboard (options page)
src/popup/               Toolbar popup: stats, note-this-token, view mode, language
src/background.js        Service worker: opens the Side Panel, remembers the token per tab (storage.session), follow-the-page, keyboard shortcut, Grok tabs, DexScreener pair→token resolver
scripts/make_icons.py    Dependency-free icon generator
scripts/pack.py          Builds the Web Store ZIP (runtime files only)
test/                    Mock gmgn pages + Playwright e2e test that loads the real extension
```

Key decisions:

- **No build step, no framework.** Vanilla JS loaded straight with Load unpacked; edit a file, press reload. Enough for a personal tool and easy to tweak.
- **Tokens are detected by URL, not by CSS class.** gmgn is a Next.js app with hashed, frequently changing class names, but every token row links to `/{chain}/token/{address}`. The content script scans `a[href*="/token/"]`, inserts the button right after the symbol text node, and uses a `MutationObserver` to catch rows added while scrolling (virtualized lists). A fallback handles gmgn's `g-table` rows whose `data-row-key` is the token address.
- **Key `chain:address`**, EVM addresses lower-cased, referral prefixes (`abc_`) in shared links stripped.
- **One storage key per project** (`p:chain:address`) in `chrome.storage.local` instead of one giant object: fast writes, unlimited projects (`unlimitedStorage`). `storage.sync` is not used because its 100 KB quota cannot hold hundreds of timelines.
- **Editor in Chrome's Side Panel** (Chrome ≥ 116) rather than an overlay: gmgn's viewport is genuinely narrowed, its fixed header and trade panels stay visible, and the panel persists while switching tokens. The content script sends a message, the background calls `sidePanel.open()` inside the user gesture and remembers the token per tab in `storage.session`. If the panel cannot open (or the user chooses "Overlay" in the popup) a Shadow DOM drawer inside the page is used, with CSS isolated from gmgn.
- The injected button stops `click/mousedown` propagation so the row's own navigation is not triggered.
- **Research via deep link, not an embedded Grok.** x.com forbids framing and its login cookies would not work inside an extension page, so the extension opens Grok in a tab with the prompt in the URL (`x.com/i/grok?text=…`, `grok.com/?q=…`), remembers which token that tab is researching (`storage.session`, keyed by tab id), and a content script on the Grok page offers to save the answer back. The capture heuristic is DOM-agnostic: it picks the last minimal text block before the composer that does not contain the prompt, and the user can always select text manually.
- **One core, one adapter per site.** `core.js` owns everything site-independent; an adapter only says how to find token elements, how to turn a link into a token (synchronously for gmgn, through an async resolver for DexScreener) and what the current page's token is. Adding a site is one small file plus a manifest entry.
- **DexScreener pairs are resolved through the public DexScreener API** (`/latest/dex/pairs/{chain}/{addresses}`, batched by 30, with a fallback to `/latest/dex/tokens/` when the address is a token rather than a pair). Results are cached forever in `chrome.storage.local` (a pair never changes its token); the market cap returned at scan time is stored with the note entry. Inverted pairs (base = WSOL/USDC…) pick the other side.
- **Runtime i18n** (`settings.lang`) instead of relying only on `chrome.i18n`, so the UI language can be chosen independently of the browser language. Manifest strings still use `_locales/` as Chrome requires.

### Data model

```js
{
  key: "robinhood:0xaa40…04e3", chain: "robinhood", address: "0xaa40…04e3",
  symbol: "PROLOG", name: "AI agent launchpad on Robinhood chain",
  summary: "What it does, why it matters, risks…",
  tags: ["ai", "launchpad"], pinned: true, status: "researching", rating: 4,
  timeline: [
    { id, ts, type: "research", text: "Founder thread: https://x.com/…", mc: "$10.64M" },
    { id, ts, type: "buy", text: "Bought 0.1 ETH", mc: "$10.64M" }
  ],
  createdAt, updatedAt
}
```

Entry types: `note`, `research`, `news`, `buy`, `sell`, `alert`, `link`. Statuses: `watching`, `researching`, `holding`, `sold`, `passed`, `dead`.

## If the button does not appear on gmgn

gmgn.ai and dexscreener.com were blocked in the environment where this extension was developed, so button injection was verified against mock pages that mirrors the watchlist structure (rows are `<a href="/{chain}/token/…">`) plus a `g-table` with `data-row-key`. If a list on the real site shows no button:

1. Open DevTools on gmgn, pick the **Research-Noted-Gmgn** context in the Console dropdown and run `document.querySelectorAll('a[href*="/token/"]').length`. If it is 0 the rows are not links; inspect what attribute they use (e.g. `data-row-key`) and extend `scan()` in `src/content/gmgn.js`.
2. Token pages always have the floating button and `Alt+N` because they rely on the URL, not the DOM.
3. The Dashboard has **Add from gmgn URL** to note any token from its link.

## Publishing to the Chrome Web Store

1. Package: `python3 scripts/pack.py` (or `npm run zip`) creates `dist/research-noted-gmgn-<version>.zip` containing only `manifest.json`, `icons/`, `src/`, `_locales/` with the manifest at the ZIP root.
2. Go to https://chrome.google.com/webstore/devconsole, register a developer account (one-time 5 USD fee) → **New item** → upload the ZIP.
3. **Store listing**: title, description (copy-paste texts in `docs/store-listing.md`, in English, Vietnamese and Chinese), at least one 1280×800 screenshot (samples in `docs/store/`), category Productivity.
4. **Privacy practices**: single purpose "personal research notes for tokens on gmgn.ai", per-permission justifications (table below), "does not collect user data" (everything stays in `chrome.storage.local`), no remote code. Privacy policy: `PRIVACY.md`.
5. **Distribution** → **Unlisted** for personal use (hidden from search, installable by link, auto-updates) or Public.
6. **Submit for review** (usually 1–3 days). For updates: bump `version` in `manifest.json`, repackage, upload under the Package tab.

| Permission | Justification |
|---|---|
| `storage`, `unlimitedStorage` | Store the user's notes locally, without a project limit |
| `activeTab` | Read the current tab's gmgn URL when the user clicks the icon or presses the shortcut, to open that token's note |
| `sidePanel` | Show the note editor in Chrome's side panel so it does not cover gmgn |
| Content script on `gmgn.ai` | Add the note button next to each token and show the note indicator inline |
| Content script on `dexscreener.com` | Add the note button next to each pair and show the note indicator inline |
| Host permission `api.dexscreener.com` | Resolve a DexScreener pair address to its token (symbol, address, market cap) so notes share one key with gmgn |
| Content script on `x.com/i/grok`, `grok.com` | Add the "Save to Research-Noted-Gmgn" panel on Grok pages so the research answer can be saved into the note |
| Content script on `x.com`, `twitter.com` | Add the ✎ button to posts so a post can be saved into a note |
| `contextMenus` | "Save post with screenshot" item on X posts; selecting it grants `activeTab` so the visible post can be captured with `captureVisibleTab` |

## Security

Threat model, mitigations and what leaves the device are documented in [SECURITY.md](SECURITY.md). Short version: every value from a page or API is escaped before rendering, messages are validated and tab-scoped, imported JSON is sanitized, extension pages have a strict CSP, and notes never leave `chrome.storage.local`.

## Roadmap ideas

- **AI in the panel:** call the xAI / Claude / OpenAI API with the user's own key so the research answer appears inside the side panel without opening a tab.
- **Multi-device sync:** a small backend (Supabase/Firebase) or JSON sync via Google Drive, keeping `chrome.storage.local` as cache.
- **Reminders:** flag projects not reviewed for 14 days.
- **Price snapshots:** record MC every time a note is opened and draw a mini chart against your entries.

## Development

```bash
npm test            # Playwright e2e (uses Playwright's Chromium, no real gmgn needed)
npm run test:capture   # screenshot pipeline (test-only copy of the extension with <all_urls>, since headless cannot grant activeTab)
npm run icons       # regenerate icons
npm run zip         # build the Web Store ZIP into dist/
node test/store-shots.js   # regenerate 1280×800 store screenshots into docs/store/
```
