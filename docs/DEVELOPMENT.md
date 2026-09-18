# Developing Research-Noted-Gmgn

This page is for people who work on the code. If you only want to use the extension, the [README](../README.md) and the [user guide](guide.md) are what you need.

## Architecture

```
manifest.json            MV3; permissions: storage, unlimitedStorage, activeTab, sidePanel; localized name via _locales/
_locales/                en (default), vi, zh_CN: extension name, description, command label
src/lib/storage.js       NotedStore: data model, chrome.storage.local access, export/import, Markdown
src/lib/i18n.js          NotedI18n: UI strings for en/vi/zh, language setting, helpers for static HTML
src/lib/editor.js        NotedEditor: the note editor UI shared by the side panel, the in-page drawer and the dashboard
src/lib/research.js      NotedResearch: prompt template, placeholders, deep links to Grok on X and grok.com
src/content/core.js      Shared content-script core: floating button, tooltip, selection saving, opens the side panel; Shadow DOM drawer as fallback
src/content/sites/gmgn.js        Site adapter: tokens from /{chain}/token/{address} links (+ g-table data-row-key fallback)
src/content/sites/dexscreener.js Site adapter: pair links /{chain}/{pair}, resolved to tokens via the background (DexScreener API, cached)
src/content/sites/xsearch.js     Site adapter: X search pages, token from the query (contract / $SYMBOL), save selected text with @author
src/content/badge.css    Styles for the optional per-row button (light DOM)
src/content/grok.js      Content script on x.com/i/grok and grok.com: auto-save panel for Grok answers
src/panel/               Side panel page (editor for the active tab's token)
src/dashboard/           Dashboard (options page) and Settings
src/popup/               Toolbar popup: stats, note-this-token, view mode, language
src/viewer/              Image viewer page (the extension no longer takes screenshots; this only shows images carried in older notes and exports)
src/background.js        Service worker: opens/closes the side panel, remembers the token per tab (storage.session), follow-the-page, shortcut, Grok tabs, DexScreener pair→token resolver
scripts/make_icons.py    Dependency-free icon generator (the timeline mark, 16/32/48/128 px)
scripts/store-assets.js  Store icon (128 px with margin) and small promo tile, rendered from the same mark
scripts/audit.py         Capability audit: permissions, sites, outbound requests, dangerous APIs
scripts/pack.py          Builds the Web Store ZIP (runtime files only)
test/                    Mock gmgn / DexScreener / X / Grok pages + Playwright e2e against the real extension;
                         live.js runs the same checks on the real sites, pw.js locates playwright
```

Key decisions:

- **No build step, no framework.** Vanilla JS loaded with Load unpacked; edit a file, press reload.
- **One core, one adapter per site.** `core.js` owns everything site-independent; an adapter only says how to find the page's token and, optionally, how to attribute a text selection. Adding a site is one small file plus a manifest entry.
- **Tokens are detected by URL, not by CSS class.** gmgn is a Next.js app with hashed, frequently changing class names, but every token page is `/{chain}/token/{address}`. Storage key is `chain:address`, EVM addresses lower-cased, referral prefixes (`abc_`) stripped — so one note serves every surface.
- **DexScreener links are pairs, not tokens**, so they are resolved through the public DexScreener API (`/latest/dex/pairs/{chain}/{addresses}` batched by 30, falling back to `/latest/dex/tokens/` and then `/latest/dex/search`), cached forever in `chrome.storage.local`. Inverted pairs (base = WSOL/USDC…) pick the other side.
- **One storage key per project** (`p:chain:address`) instead of one giant object: fast writes, unlimited projects (`unlimitedStorage`). `storage.sync` is not used because its 100 KB quota cannot hold hundreds of timelines.
- **Editor in Chrome's side panel** (Chrome ≥ 116) rather than an overlay: the page's viewport is genuinely narrowed instead of covered. The content script sends a message and the background calls `sidePanel.open()` inside the user gesture, remembering the token per tab in `storage.session`; a second click disables the panel for that tab. A Shadow DOM drawer inside the page is the fallback, and an explicit option.
- **Research via deep link, not an embedded Grok.** x.com forbids framing and its login cookies would not work inside an extension page, so Grok is opened in a tab with the prompt in the URL. The answer-capture heuristic is DOM-agnostic: the last minimal text block after the prompt bubble, saved once it has stopped changing for 3 s.
- **Runtime i18n** (`settings.lang`) instead of relying only on `chrome.i18n`, so the UI language is independent of the browser language.

### Data model

```js
{
  key: "robinhood:0xaa40…04e3", chain: "robinhood", address: "0xaa40…04e3",
  symbol: "PROLOG", name: "AI agent launchpad on Robinhood chain",
  summary: "What it does, why it matters, risks…",
  tags: ["ai", "launchpad"], pinned: true, status: "holding", rating: 4,
  timeline: [
    { id, ts, type: "research", text: "@theunipcs: tokenomics look clean…", mc: "$2.10M" },
    { id, ts, type: "buy", text: "Bought 0.2 ETH", mc: "$4.80M" }
  ],
  createdAt, updatedAt
}
```

Entry types: `note`, `research`, `news`, `buy`, `sell`, `alert`, `link`. Statuses: `watching`, `researching`, `holding`, `sold`, `passed`, `dead`.

### Deletion marks, merging and backups

Merging two copies of the notes (Import JSON, and the sync that is being built) is a union, so anything deleted on one side would come back from the other. Deletions are therefore recorded: a deleted entry as `project.removed = { <entry id>: <deleted at> }`, a deleted project in the storage key `deleted = { <project key>: <deleted at> }`. Marks expire after 90 days. `NotedStore.mergeProject(a, b, { tags })` is the single merge used by import (`tags: 'union'`) and by sync (`tags: 'newer'`, so removing a tag propagates): the more recently updated side wins the scalar fields as a block, timelines are united by entry id minus the deletion marks. A project edited after it was deleted elsewhere comes back. `NotedStore.createBackup / listBackups / restoreBackup` keep the last five snapshots, taken before an import or before a sync changes local notes; a restore gives resurrected entries new ids and stamps the projects as newest, so it also wins later merges.

### Sync

Optional and off by default (`settings.sync === true` turns it on). `src/lib/sync.js` (NotedSync) does one round: download → merge with local (`mergeProject`, deletion marks) → write the differences locally → upload only if the remote differs, so two machines in agreement make no writes. It retries on a write conflict, skips a project the user edited while the round ran, treats remote data as untrusted (`sanitize`), never overwrites a remote file it cannot parse, and takes a backup before another machine's data changes local notes. `src/lib/drive.js` (NotedDrive) is the remote: one JSON file in the user's own Drive `appDataFolder` (scope `drive.appdata`), and it refuses any base URL other than Google or localhost. `src/sync-controller.js` runs in the service worker: token from `chrome.identity.getAuthToken`, triggers on browser start, 8 s after a note changes, every 15 minutes (`chrome.alarms`) and on **Sync now**; it only accepts commands from the extension's own pages.

`identity`, `alarms` and `https://www.googleapis.com/*` are **optional** permissions, requested inside the click on *Sign in with Google and turn on sync* and removed again by *Turn off*; an update therefore shows no new permission warning. `scripts/audit.py` enforces exactly these two optional permissions, this one host, the single `drive.appdata` scope, `chrome.identity` only in `src/sync-controller.js` and `src/dashboard/dashboard.js`, and the Google host only in `src/lib/drive.js`.

The OAuth client (`oauth2.client_id` in the manifest) is of type *Chrome Extension* and bound to the Store item ID, so Google sign-in works only in a build that has that ID: the Store build, or an unpacked build carrying the Store's public `key` (see below). For tests, `settings.driveApiBase` (localhost only) plus `settings.syncTestToken` point the controller at `test/mock-drive.js` and skip Google. `npm run test:sync` runs two browser profiles through the engine and through the real Settings buttons and background.

## Running the tests

```bash
npm i && npx playwright install chromium   # once: the test runner and its browser
npm test              # Playwright e2e against the real extension (mock sites, no network needed)
npm run test:panel    # same suite with a real Chrome window (xvfb), so the real Side Panel is exercised
npm run test:live     # runs against the real gmgn / X / DexScreener (needs network + a one-time X login in the test window)
node test/live.js --mock  # same script against the mock pages, to check the script itself before a real run
node test/live.js --skip-x --token <gmgn url> --token2 <another gmgn url> --keep   # your own tokens, no X, leave the window open
node test/live.js --grok  # also runs Research with Grok end to end on the real X. X SENDS the prompt as soon as the link opens, so each run costs one Grok query
npm run test:sync     # two browser profiles syncing through a mock Google Drive
npm run audit         # capability audit: permissions, outbound requests, dangerous APIs
npm run icons         # regenerate icons
npm run zip           # build the Web Store ZIP into dist/
node test/shots.js    # regenerate the README and Store screenshots
```

`test:live` opens Playwright's Chromium (Chrome for Testing) with its own profile in `~/.noted-live-profile`, never your everyday Chrome profile. It deliberately does not use branded Google Chrome: Chrome 137 and later silently ignore `--load-extension`, so the window opens but the extension is never loaded. Pass `--channel chrome` to try it anyway; the runner falls back on its own. Without `--dex` it asks the DexScreener API for the most liquid pair of the token under test.

Two console snippets for debugging against the real sites (they only read the page and
send nothing anywhere): paste `scripts/grok-debug.js` into the console of a Grok tab for a
report on why auto-save did or did not fire, and `scripts/grok-snapshot.js` to capture the
page's DOM shape (scripts, images and all attributes but class/dir/role stripped) as a test
fixture.
### Same ID for the unpacked and the Store build

To make the unpacked ID identical to the Web Store ID, copy the public key from the Developer Dashboard (Package → View public key) into a `"key"` field of `manifest.json`; `scripts/pack.py` strips that field from the Store ZIP. Adding the key changes the unpacked extension's ID, and with it the storage: export the notes first.

## Publishing to the Chrome Web Store

1. Package: `python3 scripts/pack.py` (or `npm run zip`) creates `dist/research-noted-gmgn-<version>.zip` containing only `manifest.json`, `icons/`, `src/`, `_locales/`, with the manifest at the ZIP root.
2. Go to https://chrome.google.com/webstore/devconsole. First time: register a developer account (one-time 5 USD fee) → **New item** → upload the ZIP. For an update: open the existing item → **Package** → **Upload new package**.
3. **Store listing**: title, description (copy-paste texts in `store-listing.md`, in English, Vietnamese and Chinese), at least one 1280×800 screenshot (ready-made in `store/`), category Productivity.
4. **Privacy practices**: single purpose, per-permission justifications (table below), no remote code. Privacy policy: `../PRIVACY.md`.
5. **Distribution** → **Unlisted** for personal use (hidden from search, installable by link, auto-updates) or Public.
6. **Submit for review** (usually 1–3 days). For updates: bump `version` in `manifest.json` and `package.json` (the Store rejects a ZIP whose version is not higher than the published one), repackage, upload under the Package tab.

An update that adds sites or permissions (for example the step from 0.3.0, gmgn only, to a build with DexScreener, X and Grok) gets a longer review, needs the new rows of the justification table filled in under **Privacy practices**, and Chrome disables the extension for existing users until they accept the new permissions. Their notes are kept. The Store title follows the `name` in `_locales/*/messages.json`, so it changes with the package.

| Permission | Justification |
|---|---|
| `storage`, `unlimitedStorage` | Store the user's notes locally, without a project limit |
| `activeTab` | Read the current tab's URL when the user clicks the icon or presses the shortcut, to open that token's note |
| `sidePanel` | Show the note editor in Chrome's side panel so it does not cover the page |
| Content script on `gmgn.ai` | Show the note button for the token being viewed |
| Content script on `dexscreener.com` | Show the note button for the pair being viewed |
| Host permission `api.dexscreener.com` | Resolve a DexScreener pair address to its token (symbol, address, market cap) so notes share one key with gmgn |
| Content script on `x.com/i/grok`, `grok.com` | Save Grok's research answer into the token's note |
| Content script on `x.com/search`, `twitter.com/search` | Recognise the token being researched from the search query and save selected text into its note |

## Security (technical)

Threat model, mitigations and what leaves the device: [SECURITY.md](../SECURITY.md). Short version: every value from a page or API is escaped before rendering, messages are validated and tab-scoped, imported JSON is sanitized, extension pages have a strict CSP, and notes never leave `chrome.storage.local`.

## Roadmap ideas

- **AI in the panel:** call the xAI / Claude / OpenAI API with the user's own key so the answer appears inside the side panel without opening a tab.
- **Multi-device sync:** a small backend (Supabase/Firebase) or JSON sync via Google Drive, keeping `chrome.storage.local` as cache.
- **Reminders:** flag projects not reviewed for 14 days.
- **Price snapshots:** record market cap every time a note is opened and chart it against your entries.

