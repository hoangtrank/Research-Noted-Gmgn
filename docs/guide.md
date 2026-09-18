# Research-Noted-Gmgn user guide

Other languages: [Tiếng Việt](huong-dan.md)

For everyday users. You do not need to know how to code.

> New to gmgn.ai? It is a multi-chain token trading terminal. You can open it with this link: https://gmgn.ai/r/ZCSRo81H?chain=robinhood

---

## What does it do for you?

You look at hundreds of tokens on gmgn every week. A few days later you look back and cannot remember what each project does, how far your research got, or at what level you bought.

This extension gives you a **notebook attached directly to gmgn**. Each token has its own note page. One click opens it, right next to the chart.

---

## Part 1 — Install (do it once, about 2 minutes)

You need Chrome, Brave or Edge, version 116 or later. Most computers already have this.

### Recommended: install from the Chrome Web Store

Open the [Chrome Web Store page](https://chromewebstore.google.com/detail/klmbonadppdmggifjlolbbpaaafkmplm), click **Add to Chrome**, then reload your gmgn.ai tab. That is all.

### Alternative: download the source and use Load unpacked

This way is for people who want to run the source code themselves. **Note first:** a build installed
this way **cannot sign in to Google**, so *Sync between computers* will not work (why, at the end of
this section).

1. **Download the source code.** Go to the project's GitHub page, click the green **Code** button → **Download ZIP**. Unzip it into a folder, for example `D:\noted` or inside your Documents folder. Remember where you put it, because later updates will use this same folder.

2. **Open the extensions page.** Type this into the address bar: `chrome://extensions` and press Enter.

3. **Turn on Developer mode.** The switch is in the top right corner and is called *Developer mode*. Turning it on shows a few new buttons.

4. **Click "Load unpacked"**, then choose the folder you just unzipped. Pick the folder that has a file named `manifest.json` inside it.

5. Done. Reopen the gmgn.ai tab you have open (or press F5) and it is ready to use.

> It is a good idea to pin the extension to the toolbar: click the puzzle-piece icon next to the address bar, then click the pin icon next to the name Research-Noted-Gmgn.

**Four things to know about installing this way:**

- Chrome may show a **"Disable developer mode extensions"** prompt each time it starts. Click the **X** to dismiss it, do not click Disable. Chrome shows this for every hand-installed extension.
- **Nothing updates itself** — see "How do I update" in the FAQ.
- The extension exists only in the **Chrome profile you added it to**. Another profile needs its own install, and notes are not shared between profiles (move them with Export/Import JSON).
- **Sync through Google Drive does not work.** Google's OAuth client is bound to the Store build's extension ID, and a hand-installed build has a different one. To run the source *and* have sync, copy the public `key` from the Chrome Developer Dashboard into `manifest.json` (see `docs/DEVELOPMENT.md`) — that **changes the extension's ID, and your existing notes stop showing up**, so export them first.

---

## Part 2 — Take notes on a project

Open any token on gmgn. Look at the **bottom right corner**. You will see a small button:

> 📝 **Note MEME** · Robinhood

Click it. The note panel opens on the right side of the screen. It **does not cover** gmgn. It pushes gmgn narrower, so you can watch the chart and write at the same time.

![A token page on gmgn with the note panel on the right](01-token-note.png)

In the note panel, fill in from top to bottom:

| Field | What to write |
|---|---|
| **Symbol** (the top box) | Usually filled in for you, for example `MEME` |
| **Description line** | One sentence, for example "Launchpad for AI agents on Robinhood chain" |
| **Status** | Watching, Researching, Holding, Sold, Passed, Dead / Rug |
| **Conviction** | Click the stars, 1 to 5, to show how much you believe in it |
| **What does this project do?** | The 2–3 most important sentences: product, team, why it matters, risks |
| **Tags** | Type, then press Enter, for example `ai`, `launchpad`, `robinhood` |
| **Timeline** | Entries over time, see below |

Everything **saves automatically** as you type. There is no Save button, and nothing to forget.

The note panel **follows the token you are viewing**: click another token on gmgn and the panel jumps to that token's note. You do not need to close and reopen it. Click the floating **📝 Note {SYMBOL}** button again to close the panel.

The **Timeline** is the most valuable part. Each time you learn something new, type it into the "New note…" box, choose a type (Note, Research, News / Update, Buy, Sell, Alert), then click Add. Each entry records the time and the **market cap at that moment**. So later you know at what level you bought, and how big the project was when that news came out.

Click **📌** in the top corner to pin the projects you are following closely.

**Text too small or too big?** At the very bottom of the note panel there are **A−** and **A+**. Click and the size changes right away. The number in the middle shows the size in use. The text size applies to the note panel, the Dashboard and the popup, and is remembered for next time. To pick an exact number, go to Dashboard → ⚙ Settings → **Text size** (11–22px, default 14px).

Click the button in the bottom right corner once more to close the note panel.

> **Tip:** when a project already has a note, the button turns **yellow** and shows the summary line. One look tells you that you have seen it before, so you do not research it again from scratch.

The extension works exactly the same on **DexScreener**. The same token shares one note, whether you open it on gmgn or on DexScreener.

---

## Part 3 — Research on X and save what is worth remembering

The note panel has a row of links: **GMGN · X · DexScreener**. Click **X** to open an X search page for the token's contract address. (The X button already on gmgn gives similar results.)

On that search page, the extension knows which token you are researching, so the note button still shows in the bottom right corner.

Now **select (highlight)** any text in a post that you think is worth saving. A yellow button appears right below the text you selected:

![Selecting text in a post on X](02-x-select.png)

Click that button. It turns **green with a ✓** on the spot, so you know it was saved. The text goes straight into the project's timeline, with the **name of the person who said it** and a link back to the original post. The note panel opens and **flashes yellow** on the entry just saved, so you can see where it is.

Clear the selection or click somewhere else and the button goes away by itself.

![The text just saved is highlighted in the note panel](03-x-saved.png)

Account names like `@theunipcs` show in **red**, so when you scroll the timeline you know right away who said what.

---

## Part 4 — Ask Grok to research for you

In the note panel, click **✨ Research with Grok**.

The extension writes the question for you. It includes the token name, chain, contract address, current market cap and gmgn link. Then it opens Grok on X with the question already filled in. **X sends the question by itself** as soon as the tab opens, so every click uses one Grok question. (On grok.com you press Enter to send.)

When Grok finishes answering, the answer is **saved to the timeline automatically**. You do not have to copy and paste anything. There is an **Undo** button if you do not want to keep it.

![Grok answers and the answer is saved automatically](06-grok.png)

If you ask more in the same conversation, each answer becomes a new entry. Identical content is never saved twice.

The default question is already written in your interface language and asks Grok to answer in this exact order: **DEV** first (confirmed dev/lead with X link, the token's account, GitHub/LinkedIn, anon or doxxed, past projects), then **KOL**, then **PROJECT** written in detail in 6 sections (the problem, the solution, the platform it runs on, the design, current state, design risks with sources), and finally **MEME** if it really is a meme. It also tells Grok to write "not found" instead of guessing, not to repeat the address/chain/chart, and to give X links in full form `https://x.com/...` so you can click them from inside the note.

To edit the question: Dashboard → ⚙ Settings → the **Research prompt template** box. The placeholders you can use: `{symbol} {chain} {address} {name} {mc} {summary} {tags} {status} {notes} {gmgn_url} {dex_url} {x_url} {date}`. `{notes}` inserts the 5 most recent entries you wrote, so Grok adds to them instead of repeating what you already know.

A small note: **do not close the Grok tab** before you see the "Auto-saved" line. The answer is saved only when Grok has finished writing, not while it is still thinking. After that you can go and do other things. It saves by itself.

Below the "Auto-save answers" box there is always a small line of text that tells you what it is doing: *waiting for you to send the prompt*, *reading the answer*, or *auto-save is off*. If for some reason it does not catch the answer, click **Capture last answer**, then **Save to Research-Noted-Gmgn**, and you are done.

---

## Part 5 — Review everything

Click the extension icon on the toolbar → **📚 Open Dashboard**.

![Dashboard](04-dashboard.png)

Here you have:

- **Search box**: type anything and it is found, even text deep inside a timeline.
- **Filters**: by status, by tag, or only pinned projects.
- **Sort**: Recently edited, Highest conviction, Most entries.
- **Export JSON**: a backup file. Do this regularly.
- **Export Markdown**: an easy-to-read text file. Give it to an AI and ask "of the projects I have researched, which are worth another look?".
- **+ Add from gmgn URL**: paste a token link and you can take notes, without opening the page.

---

## Part 6 — Your own settings

Dashboard → **⚙ Settings**:

![Settings](05-settings.png)

- **Language**: English, Tiếng Việt, 中文.
- **Text size**: 11–22px, default 14px. Applies to the note panel, the Dashboard and the popup.
- **Note view**: Side panel (recommended) or Overlay inside the page.
- **Side panel follows the token you open**: when on, click any token and the panel switches to that token.
- **Research prompt template**: edit it however you like.
- **Auto-save Grok answers into the timeline**: on/off.
- **Also show a ✎ button on every row of token lists**: off by default to keep things tidy. Turn it on if you want to take quick notes right from the list.

---

## Sync between two computers (optional)

Use this if you work on more than one computer, for example a Windows PC and a Mac, with the same Google account in Chrome.

1. On each computer, install the extension **from the Chrome Web Store**. Sign-in only works with the Store build.
2. Open the **Dashboard → ⚙ Settings → Sync between computers** and click **Sign in with Google and turn on sync**. Chrome asks for permission once, then Google asks you to allow the extension to keep *its own data* in your Drive. It cannot see your other files.
3. Do the same on the second computer. Its notes and the first computer's notes are combined. Nothing is lost: both timelines are kept.

After that it runs by itself: when Chrome starts, a few seconds after you edit a note, and every 15 minutes. **Sync now** does it at once.

Good to know:

- If you edit the *same project* on both computers before they sync, the timelines are combined, but for the summary, status, rating and tags the more recent edit wins.
- An entry or project you delete is deleted on the other computer too.
- Before another computer's notes change yours, the extension takes a backup. **Settings → Automatic backups → Restore** brings it back.
- **Turn off** stops sync and gives the permissions back. **Delete the copy on Drive** removes the file from your Drive; the notes on your computer stay.
- The status line says what is wrong when something is: not signed in, Drive full, no connection.

---

## Frequently asked questions

**Is it dangerous to install an unknown extension? Can it get my wallet?**
It cannot, and you can check this yourself in 2 minutes. Read the separate article: [Is this extension safe?](safety.md)

**Where is my data? Can anyone see it?**
It is inside the browser on your computer. There is no server, no account, and nobody can see it. Only two things leave your computer, and only when you click: the question sent to Grok, and the trading pair address sent to DexScreener to find out which token it is. Your notes never do.

**Does it save right away?**
Yes. As soon as you type or click save, the data is on your computer.

**Do lots of notes slow my computer down?**
No. A few thousand projects is still light. Each project is only a few KB of text.

**Does it cost money?**
No. Grok runs on your X account. You do not need to buy an API.

**What if I change computers?**
Old computer: Dashboard → Export JSON. New computer: install the extension → Dashboard → Import JSON. Importing merges and adds. It does not delete what is already there.

**Does removing the extension delete my data?**
Yes. Export JSON and keep the file before you remove it.

**How do I update to a new version without losing my notes?**
If you installed from the Chrome Web Store, updates arrive on their own. The steps below are for the source install.
From the Store, Chrome handles it. Installed by hand, what matters is: **put the new files into the same old folder**, do not point Chrome at a new one.

- *If you cloned with git:* open a terminal, `cd` into that folder and run `git pull`. Done.
- *If you downloaded a ZIP:* delete the old files in that folder and unzip the new version into that same place.

Then go to `chrome://extensions`, click the **Reload** button (the circular arrow) on the Research-Noted-Gmgn card, and check that the version number changed. Your data stays as it is.
If you chose a new folder by mistake, the data is not lost yet: turn the old entry back on in `chrome://extensions`, export JSON, then import it into the new entry.

**I cannot see the button anywhere?**
Three things, in this order: check in `chrome://extensions` that the extension is turned on; close the gmgn tab and open it again (the extension only runs in tabs opened after it was installed); check that the version number is the new one.

---

## Suggested daily routine

1. See an unfamiliar token on gmgn → click the note button → type 2 sentences on "what does this project do" → add 1–2 tags.
2. Click **X** to see what people are saying → select a sentence worth keeping → save.
3. Click **Research with Grok** → leave it, the answer goes into the timeline by itself.
4. Once you have decided, change the **Status**, set the **Conviction**, and pin 📌 if you are following it.
5. At the end of the week, open the Dashboard, filter to pinned projects, read the timelines again and decide whether to keep or drop each one.

Just do step 1 regularly. Three months from now you will have a notebook that no AI can replace: it records exactly what **you** saw and thought.
