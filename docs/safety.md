# Is this extension safe?

Other languages: [Tiếng Việt](an-toan.md)

Written for crypto users, who have good reason to be afraid of installing an unknown extension.

**Summary:** this extension can only run on 5 domains (gmgn.ai, dexscreener.com, x.com, twitter.com, grok.com). It has no permission to read any other page, it cannot read your wallet, and it does not send your notes anywhere. You do not need to take my word for it — the last part of this article shows how to check it yourself in 2 minutes.

---

## Why an extension can be dangerous

Let us be direct, so you know what you are guarding against. A malicious extension usually does one of four things:

1. **Asks for permission on every website** ("Read and change all your data on all websites"). Then it can read your bank, email and exchange pages.
2. **Downloads code from a server and runs it.** Today the installed version is clean. Tomorrow the owner pushes malicious code down, with no update needed.
3. **Reads the clipboard**, waits for you to copy a seed phrase or a wallet address, then swaps the address.
4. **Sends data to its own server.**

These are the four things to look at closely when you install any extension, including this one.

## Where this extension stands on those four things

| Risk | This extension |
|---|---|
| Permission on every page | **No.** Only 5 domains, stated clearly in the install file. Your bank page, Gmail, Binance… it cannot touch them. |
| Downloading remote code | **No.** All the code is inside the install package. A security rule (CSP) blocks loading scripts from the internet. |
| Reading the clipboard | **No.** Not a single line of code touches the clipboard. |
| Sending data out | **Only one place:** `api.dexscreener.com`, and it only sends the trading pair address (public information) to find out which token it is. Your notes never leave your computer. |

## Why it cannot take your private key

Three layers. Each one alone is enough to stop it:

1. **Chrome isolates extensions from each other.** MetaMask, Phantom and Rabby are separate extensions. One extension **cannot** read another extension's data. This is how the browser works, not a promise from me.

2. **Private keys never appear on gmgn, DexScreener or X.** Even if this extension wanted to spy, there is nothing to read on those pages.

3. **It has no permission to run anywhere else.** To watch you sign a transaction, it would have to ask for permission on the wallet's page or on every page. It does not ask, and Chrome will block it if it tries.

One more point: this extension **has no wallet-connect permission at all**. It does not ask for your wallet address, does not open a signing popup, and has no "Connect Wallet" button. If you ever see it ask for those things, you have installed a fake copy by mistake.

## Check it yourself in 2 minutes

Do not trust, verify. Three things anyone can do:

### Check 1 — See where it is allowed to run

Go to `chrome://extensions` → click **Details** on the Research-Noted-Gmgn card → scroll down to **Site access**.

You must see a list of exactly 5 domains. If you see the line **"On all sites"**, remove it right away — that is not this extension.

### Check 2 — See whether it sends data out

Open gmgn.ai, press `F12` → the **Network** tab → type a few notes into the extension.

You will not see any request going to an unknown server. Only when you open a new DexScreener page is there one request to `api.dexscreener.com` — that is when it asks "which token is this trading pair".

### Check 3 — Read the source code's self-check result

The source code is public. In the project folder, run:

```bash
python3 scripts/audit.py
```

This script reads the source code directly and prints: which permissions the extension declares, which pages it runs on, where it sends requests, and whether it uses any dangerous API (eval, cookies, clipboard, browsing history, calling outside programs, reading the in-page wallet). It reports an error if it finds anything outside the allowed list.

The correct result must be:

```
KẾT QUẢ: ĐẠT — extension chỉ đọc 5 tên miền kể trên, chỉ gửi request tới
api.dexscreener.com, và lưu ghi chú trong máy bạn.
```

You do not need to know how to code to run this command. The result is printed in Vietnamese. In English it says: "RESULT: PASS — the extension only reads the 5 domains listed above, only sends requests to api.dexscreener.com, and stores the notes on your computer."

### Check 4 (when installed from the Chrome Web Store) — Compare the install package

Every release publishes the SHA-256 hash of its ZIP file. Running `python3 scripts/pack.py` on the source code produces that same hash. This means the version on the Store is exactly the source code you can read, with nothing extra inserted.

## What Google has already checked for you

An extension on the Chrome Web Store must pass automated and manual review: Google analyzes the source code, compares the declared permissions with the real behavior, and rejects it if it finds hidden code or undeclared data sending. This is not an absolute guarantee, but it is a real filter.

## General advice when installing an extension (any extension)

- Read the **Site access** section before you click install. "On all sites" is a sign to stop and ask yourself why it needs that much.
- Be wary of extensions that **change owners**. Many malware cases began with a good extension being bought.
- For large amounts of money, use a **hardware wallet** and a **separate Chrome profile** with no extension installed other than the wallet.
- Clean up `chrome://extensions` from time to time. Remove what you no longer use.

## If you are still not at ease

The safest way: create a separate Chrome profile (top right corner → Add → new profile), install only this extension there, and do not install any wallet in that profile. You research in this profile and trade in another one. Then whatever happens, it is not in the same place as your wallet.

---

Full technical details (the attack model, each safeguard) are in [SECURITY.md](../SECURITY.md). The data policy is in [PRIVACY.md](../PRIVACY.md).
