# Chrome Web Store listing — copy-paste texts

The Store lets you add one listing per language. Fill **English** first (default), then add Vietnamese and Chinese (Simplified) under "Store listing → Language".

## English (default)

**Title**

    Noted for GMGN

**Summary (max 132 chars)**

    Timeline research notes for every project you view on gmgn.ai: what it does, tags, pins, dated entries, X/AI links.

**Description**

    Researching hundreds of tokens on gmgn.ai and can't remember what each project does? Noted adds a note button right next to every token.

    • ✎ button next to the symbol in every list (watchlist, trending, meme…). Yellow = has a note, orange = pinned. Hover to see the summary.
    • Notes open in Chrome's Side Panel, so nothing covers the gmgn page.
    • Per project: "What does this project do?", name, tags, status (watching / researching / holding / sold / passed / dead), conviction 1–5, pin.
    • Timeline: research, news, buy, sell, alerts, links. Pasted X/AI links become clickable. The market cap at the time of each entry is saved with it.
    • Token page: floating button with symbol + summary, shortcut Alt+N.
    • Dashboard: full-text search, filter by tag / status / pinned, sort, edit in place, add by gmgn URL.
    • Export/import JSON for backup, export Markdown to feed an AI.
    • Interface in English, Vietnamese and Chinese.

    Your data stays on your device. No server, no tracking, no account.
    Works on every chain gmgn supports: Solana, Ethereum, Base, BSC, Robinhood, X Layer, Blast, Tron…

**Category**: Productivity (or "Workflow & Planning" in the new console)

## Tiếng Việt

**Title**

    Noted for GMGN

**Summary**

    Ghi chú research theo timeline cho từng dự án bạn xem trên gmgn.ai: dự án làm gì, tag, pin, mốc thời gian, link X/AI.

**Description**

    Bạn research hàng trăm token trên gmgn.ai và không còn nhớ dự án nào làm gì? Noted thêm một nút ghi chú ngay cạnh mỗi token.

    • Nút ✎ cạnh symbol trong mọi danh sách (theo dõi, trending, meme…). Vàng = đã ghi chú, cam = đã pin. Rê chuột là thấy tóm tắt.
    • Ghi chú mở trong Side Panel của Chrome, không che nội dung gmgn.
    • Mỗi dự án: "Dự án làm gì?", tên, tag, trạng thái (theo dõi / đang research / đang giữ / đã bán / bỏ qua / dead), mức tin tưởng 1–5, pin.
    • Timeline: research, tin tức, mua, bán, cảnh báo, link. Link X/AI dán vào tự thành link. Market cap tại lúc ghi được lưu kèm mỗi mốc.
    • Trang token: nút nổi hiện symbol + tóm tắt, phím tắt Alt+N.
    • Dashboard: tìm kiếm toàn văn, lọc theo tag / trạng thái / pin, sắp xếp, sửa tại chỗ, thêm từ URL gmgn.
    • Xuất/nhập JSON để backup, xuất Markdown để đưa cho AI tổng hợp.
    • Giao diện tiếng Anh, tiếng Việt, tiếng Trung.

    Dữ liệu chỉ lưu trên máy bạn. Không máy chủ, không theo dõi, không tài khoản.
    Hỗ trợ mọi chain gmgn có: Solana, Ethereum, Base, BSC, Robinhood, X Layer, Blast, Tron…

## 中文（简体）

**Title**

    Noted for GMGN

**Summary**

    为你在 gmgn.ai 查看的每个项目记录时间线研究笔记：项目做什么、标签、置顶、带日期的记录、X/AI 链接。

**Description**

    在 gmgn.ai 研究了上百个代币，却记不住每个项目是做什么的？Noted 在每个代币旁边添加一个笔记按钮。

    • 每个列表（自选、热门、meme…）的代币符号旁都有 ✎ 按钮。黄色 = 已有笔记，橙色 = 已置顶。悬停即可查看摘要。
    • 笔记在 Chrome 侧边栏中打开，不会遮挡 gmgn 页面。
    • 每个项目：「这个项目是做什么的？」、名称、标签、状态（观察中 / 研究中 / 持有中 / 已卖出 / 已放弃 / 归零）、信心 1–5、置顶。
    • 时间线：研究、新闻、买入、卖出、警告、链接。粘贴的 X/AI 链接可直接点击。每条记录都会保存当时的市值。
    • 代币页：悬浮按钮显示符号和摘要，快捷键 Alt+N。
    • 仪表盘：全文搜索，按标签 / 状态 / 置顶筛选，排序，就地编辑，通过 gmgn 链接添加。
    • 导出/导入 JSON 备份，导出 Markdown 交给 AI 汇总。
    • 界面支持英文、越南文、中文。

    数据只保存在你的设备上。没有服务器、没有跟踪、没有账号。
    支持 gmgn 的所有链：Solana、Ethereum、Base、BSC、Robinhood、X Layer、Blast、Tron…

## Store icon and promo tile

- **Store icon (128×128)**: `docs/store/store-icon-128.png` — 96×96 artwork centered with a 16 px transparent margin, as the Store recommends. Source: `docs/store/store-icon.svg`; regenerate with `node scripts/store-assets.js`.
- **Small promo tile (440×280, optional)**: `docs/store/promo-small-440x280.png`.

## Screenshots

At least 1, up to 5 images of 1280×800 (PNG/JPEG). Samples in `docs/store/` (English UI, generated from the mock page). Replace them with screenshots taken on the real gmgn.ai once you have a few notes.

## Privacy practices tab

**Single purpose**

    Personal research notes for tokens/projects the user views on gmgn.ai: a note button next to each token, a timeline of notes per project, and a dashboard to search them. Everything is stored locally on the user's device.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's notes, tags and settings locally in chrome.storage.local. No data leaves the device. |
| `unlimitedStorage` | Users annotate hundreds of projects with long timelines; the default quota may not be enough. |
| `activeTab` | When the user clicks the toolbar icon or presses Alt+N, reads the current tab's gmgn.ai URL to open the note for that token. |
| `sidePanel` | Shows the note editor in Chrome's side panel so it does not cover the gmgn.ai page. |
| Host permission `gmgn.ai` (content script) | Adds the note button next to each token link on gmgn.ai and shows the note indicator/tooltip inline. |

**Remote code**: No, I am not using remote code.

**Data usage**: tick nothing in the "What user data do you collect?" list. Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: https://github.com/hoangtrank/noted/blob/main/PRIVACY.md
(use the branch name instead of `main` if the file is not on `main` yet, e.g. `claude/gmgn-project-notes-extension-dgkfnb`)

## Distribution tab

- **Visibility**: Unlisted (only people with the link) or Public.
- **Regions**: All regions.
- **Pricing**: Free.
