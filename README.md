<img src="icons/icon128.png" width="72" height="72" alt="Research-Noted-Gmgn icon: a three-entry timeline, the newest entry in yellow" align="right">

# Research-Noted-Gmgn

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/klmbonadppdmggifjlolbbpaaafkmplm)** · version 0.10.0

A Chrome extension that keeps one research note per token, right where you look at it: **gmgn.ai**, **DexScreener** and **X**.

You research hundreds of tokens and forget what each one actually does. This keeps a short summary and a dated timeline for every project, one click away from the chart.

📖 **[User guide](docs/guide.md)** — written for people who are not technical. Also in [Tiếng Việt](docs/huong-dan.md).

**New to gmgn.ai?** It is a multi-chain token trading terminal, and the site this extension was built around. You can open it with [this link](https://gmgn.ai/r/ZCSRo81H?chain=robinhood) — it is the author's referral link, and the same link is shown in the extension's empty panel, empty Dashboard and toolbar popup. The extension never opens it by itself and adds no code to any page or URL.

---

## How it works

### 1. One button for the token you are looking at

Open a token on gmgn (or a pair on DexScreener). A single button appears at the bottom right: `📝 Note MEME · Robinhood`. Click it and the note opens in Chrome's side panel — beside the page, never on top of it. Click again to close.

Write what the project does, add tags, set a status and a conviction score, and add timeline entries as you learn things. Everything saves as you type.

![Token page on gmgn with the note open in the side panel](docs/01-token-note.png)

Open the side panel on a tab that has no token — the X home page, a new tab — and it shows the token you viewed last instead of an empty screen, so the note you were working on is always one click away.

The same note follows the token everywhere: gmgn, DexScreener, X. Once a note exists the button turns yellow and shows the summary, so you recognise a project you already looked at before clicking.

### 2. Research on X without copy-pasting

Click the **X** link in a note (or gmgn's own X button). It searches X for the contract address, and the extension recognises which token you are researching — the note button appears on the search page too.

Select any text in a post and a **Save selection** button pops up right under it.

![Selecting text in a post on X](docs/02-x-select.png)

Click it and the quote lands in the timeline as `@author: text` with a link back to the post. The side panel opens on that note and flashes the new entry, so you see exactly what was saved. Handles are shown in red so you always know who said it.

![The saved quote highlighted in the side panel](docs/03-x-saved.png)

### 3. Find it again

The Dashboard lists every project you have noted. Search across summaries, tags, addresses and timeline text; filter by status, tag or pinned; sort by conviction or recency. Export to JSON for backup, or to Markdown to hand your whole research to an AI.

![Dashboard](docs/04-dashboard.png)

---

## Research with Grok

Click **✨ Research with Grok** in a note. The extension builds a prompt from your template — symbol, chain, contract, current market cap, gmgn link — and opens Grok on X with it prefilled. Press Enter.

When Grok finishes answering, the answer is **saved into the timeline automatically**, with an Undo link. Follow-up answers become new entries; identical text is never saved twice.

![Grok answering, with the answer auto-saved](docs/06-grok.png)

No API key: it runs in your own X account. Auto-save can be turned off on the Grok panel or in Settings.

The default prompt ships in English, Vietnamese and Chinese and follows the interface language. It fixes the order of the answer — **DEV** first (confirmed dev or lead with their X link, the token's account, GitHub/LinkedIn, anon or doxxed, previous projects, plus how to tell a real builder from an early follower), then **KOL**, then **PROJECT** written out in six sections (problem, solution, how it runs, design, current state, sourced design risks), then **MEME** only when it is one. It tells the model to write "not found" instead of guessing, not to repeat the address, chain or chart, and to keep X handles as plain `https://x.com/...` URLs so they stay clickable in the timeline. Edit it in Settings; placeholders available: `{symbol} {chain} {address} {name} {mc} {summary} {tags} {status} {notes} {gmgn_url} {dex_url} {x_url} {date}`. `{notes}` injects your five latest timeline entries, so Grok builds on what you already wrote instead of repeating it.

## Settings

Dashboard → **⚙ Settings**: interface language (English, Tiếng Việt, 中文), side panel or in-page overlay, whether the panel follows the token you open, text size (A− / A+, 11–22 px, default 14, applied to the note editor everywhere at once), the Grok prompt template and target, auto-save, and whether token lists also get a small ✎ button on every row (off by default).

![Settings](docs/05-settings.png)

---

## Install

Requires Chrome / Brave / Edge 116 or newer.

**From the Chrome Web Store (recommended):** open the [Store page](https://chromewebstore.google.com/detail/klmbonadppdmggifjlolbbpaaafkmplm), click **Add to Chrome**, then reload your gmgn.ai tab. Updates arrive on their own.

**From source (for development, or to run a build before it reaches the Store):**

1. Download the source (clone, or Download ZIP and extract).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. Reload your gmgn.ai tab.

`Alt+N` opens or closes the note for the token in the current tab; change it at `chrome://extensions/shortcuts`.

### Updating a source install without losing data

Installed from the Chrome Web Store? Updates arrive on their own and keep your notes; skip this.

Notes live in `chrome.storage.local`, which is tied to the extension's ID. For an unpacked extension the ID comes from the folder path, so **update in place**: replace the files inside the same folder (`git pull`, or extract the new ZIP over it), then click **Reload** on `chrome://extensions`. Loading a *new* folder creates a new ID with an empty store (the old data is still under the old entry: export it there, import it here). Export a JSON backup from the Dashboard before updating anyway.

### Where your data lives

On your machine, in the browser. No developer server, no account, no analytics. Unless you turn on sync (below), two things leave the device, both only when you ask: the research prompt when you click Research with Grok, and pair addresses sent to DexScreener's public API to work out which token a pair is. See [PRIVACY.md](PRIVACY.md).

### Backups and moving notes between computers

**Export JSON** in the Dashboard saves every note to a file; **Import JSON** on another computer merges that file into the notes already there: for each project the more recently edited side wins the summary, status and rating, and the timelines are combined entry by entry. An entry or a project you deleted stays deleted after a merge. Before every import the extension takes an automatic backup; **Settings → Automatic backups → Restore** brings it back.

### Sync between computers (optional)

**Settings → Sync between computers → Sign in with Google and turn on sync.** Your notes are then kept the same on every computer where you use Chrome with the same Google account. They travel through one hidden file in **your own Google Drive** that only this extension can read (it cannot see anything else in your Drive); there is no server of ours in between. It syncs when the browser starts, a few seconds after you edit a note, every 15 minutes, and when you press **Sync now**. Both computers' timelines are combined, deletions carry over, and for the summary, status, rating and tags the more recent edit wins. Sync is off by default: until you turn it on the extension does not even ask for the Google permissions. **Turn off** stops it and drops the permissions; **Delete the copy on Drive** removes the file. It needs Google Chrome and the build installed from the Chrome Web Store (sign-in is tied to the Store ID).

---

## If the button does not appear

The floating button depends on the address in the page URL, not on the page's layout, so it keeps working when the sites change their design. If a real page shows no button:

1. Open DevTools → Console on that page and filter for `Research-Noted-Gmgn`. The content script logs what it detected.
2. Token pages, pair pages and X searches rely on the URL, not the DOM, so they should always work; the per-row buttons (optional) are the fragile part.
3. The Dashboard has **Add from gmgn URL** to note any token from its link.

## Is it safe to install?

A fair question for a crypto tool. The short answer is that this extension can only run on five domains, cannot reach your wallet, and sends nothing but public pair addresses.

```bash
python3 scripts/audit.py     # prints exactly what the extension may do, and fails on anything unexpected
```

The audit reads the source and reports the declared permissions, the sites the content scripts run on, every outbound request, and whether any dangerous API is used (eval, cookies, clipboard, history, native messaging, wallet objects in the page). It exits non-zero if anything falls outside the allowlist, so it is worth running on any fork before installing it.

Why your keys are out of reach: Chrome isolates extensions from each other, so this one cannot read MetaMask's or Phantom's storage; private keys never appear in gmgn, DexScreener or X pages anyway; and the manifest grants no access to any other site, so there is nowhere else for it to look. It never asks to connect a wallet.

Users can check for themselves in two minutes — `chrome://extensions` → Details → Site access lists the five domains, and DevTools → Network shows no traffic beyond `api.dexscreener.com`. `scripts/pack.py` prints the SHA-256 of the Store ZIP so a published build can be matched against this source.

👉 For people who are not technical: [Is this extension safe?](docs/safety.md) (also in [Tiếng Việt](docs/an-toan.md))

## Languages

English is the language of the documentation, the Store listing and the code review surface (commit messages, README, `PRIVACY.md`, `SECURITY.md`). The interface ships in English, Vietnamese and Chinese; the Vietnamese guides in `docs/` and the Vietnamese/Chinese Store texts are optional extras and may lag behind the English ones.

## For developers

Architecture, the data model, how to run the tests, and how the extension is packaged and published to the Chrome Web Store are in **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**. The threat model is in [SECURITY.md](SECURITY.md).
