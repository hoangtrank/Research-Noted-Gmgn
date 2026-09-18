# Privacy Policy — Research-Noted-Gmgn

*Last updated: 2026-09-18*

**Research-Noted-Gmgn** is a personal research-notes extension for tokens/projects you view on gmgn.ai, DexScreener and X search.

- All notes (summary, tags, status, timeline) are stored **only on your device**, in the browser's `chrome.storage.local`.
- The extension does **not** collect and does **not** transmit any data to the developer. There is no developer server, no analytics, no account.
- **Sync between computers (optional, off by default).** If, and only if, you turn on *Sync between computers* in Settings and sign in with Google, your notes are also written to one file in the hidden app-data area of **your own Google Drive** (OAuth scope `drive.appdata`: the extension can read and write only its own file there, and cannot see any other file in your Drive). That file is what your other computers merge with. The developer never receives it. Google handles it under Google's privacy policy. Turning sync off stops all requests to Google and removes the permissions; **Delete the copy on Drive** in Settings removes the file, and you can also remove it in Google Drive → Settings → Manage apps. Until you turn sync on, the extension does not request the Google permissions and sends nothing to Google.
- It runs on `gmgn.ai` and `dexscreener.com` to add a note button next to tokens; it reads the token address and symbol from the page to know which project you are annotating. It does not read wallets, balances or credentials.
- On DexScreener, links point to trading pairs, so the extension sends the pair address to DexScreener's public API (`api.dexscreener.com`) to learn which token it is. No personal data is sent; the result is cached locally.
- You can export all data as JSON/Markdown and delete it at any time from the Dashboard. Uninstalling the extension removes all data.
- **X search pages** (`x.com/search`): the extension reads the search query to recognise a contract address or $SYMBOL you have noted (or asks DexScreener's public API which token an address is). Text you select and choose to save is stored locally with the post link and author handle. Nothing is uploaded.
- **Research with Grok** (optional, only when you click the button): the extension opens x.com or grok.com in a new tab with a prefilled prompt containing the token's symbol, chain, contract address and market cap. That page is operated by X/xAI under their own privacy policy. On Grok tabs opened this way the extension adds a small "Research-Noted-Gmgn" panel and, once Grok has finished answering, saves the answer text into that token's timeline (with an Undo link). Auto-save can be turned off on the panel or in Settings, in which case only answers you choose to save are read. The text is stored locally like any other note and is never uploaded.
- **Referral link.** For people who do not know gmgn.ai, the empty panel, the empty Dashboard and the toolbar popup show one link to gmgn.ai. It is the author's referral link. The extension never opens it by itself and never adds a referral code to any page or URL. If you click it, gmgn.ai sees that you arrived through that link, under gmgn.ai's own privacy policy; the extension sends nothing.
- No remote code is used.

Contact: open an issue at https://github.com/hoangtrank/Research-Noted-Gmgn.

---

## Chính sách quyền riêng tư (Tiếng Việt)

- Mọi ghi chú được lưu **trên máy của bạn** (`chrome.storage.local`).
- **Đồng bộ giữa các máy (tuỳ chọn, mặc định tắt).** Chỉ khi bạn bật *Đồng bộ giữa các máy* trong Settings và đăng nhập Google, ghi chú mới được ghi thêm vào một file trong vùng dữ liệu ẩn của ứng dụng trên **Google Drive của chính bạn** (scope `drive.appdata`: extension chỉ đọc/ghi được file của nó, không thấy file nào khác trong Drive). Nhà phát triển không bao giờ nhận được file đó; Google xử lý nó theo chính sách của Google. Tắt đồng bộ là dừng mọi request tới Google và gỡ quyền; nút **Xoá bản trên Drive** xoá file đó.
- Extension **không** thu thập, **không** gửi bất kỳ dữ liệu nào tới nhà phát triển. Không có máy chủ của nhà phát triển, không analytics, không tài khoản.
- Extension chạy trên `gmgn.ai` và `dexscreener.com` để gắn nút ghi chú; nó đọc địa chỉ token và symbol từ trang để biết bạn đang ghi chú cho dự án nào. Không đọc ví, số dư hay thông tin đăng nhập.
- Trên DexScreener, link trỏ tới cặp giao dịch, nên extension gửi địa chỉ cặp tới API công khai của DexScreener (`api.dexscreener.com`) để biết đó là token nào. Không gửi dữ liệu cá nhân; kết quả được cache cục bộ.
- Bạn có thể xuất toàn bộ dữ liệu (JSON/Markdown) và xoá bất kỳ lúc nào trong Dashboard. Gỡ extension sẽ xoá toàn bộ dữ liệu.
- **Trang tìm kiếm X** (`x.com/search`): extension đọc chuỗi tìm kiếm để nhận ra địa chỉ contract hoặc $SYMBOL bạn đã ghi chú (hoặc hỏi API công khai của DexScreener xem địa chỉ đó là token nào). Đoạn chữ bạn bôi đen và chọn lưu được lưu cục bộ kèm link bài và tên tài khoản. Không tải lên đâu cả.
- **Research với Grok** (tuỳ chọn, chỉ khi bạn bấm nút): extension mở x.com hoặc grok.com trong tab mới với prompt điền sẵn gồm symbol, chain, địa chỉ contract và market cap của token. Trang đó do X/xAI vận hành theo chính sách riêng của họ. Trên tab Grok mở theo cách này, extension thêm một panel nhỏ "Research-Noted-Gmgn" và khi Grok trả lời xong thì lưu câu trả lời vào timeline của token đó (có nút Hoàn tác). Có thể tắt tự động lưu ngay trên panel hoặc trong Cài đặt; khi đó extension chỉ đọc câu trả lời bạn chọn lưu. Nội dung được lưu cục bộ như mọi ghi chú khác, không tải lên đâu cả.
- **Link giới thiệu.** Panel trống, Dashboard trống và popup có một link tới gmgn.ai. Đó là link giới thiệu của tác giả. Extension không tự mở và không gắn mã giới thiệu vào trang hay URL nào. Nếu bạn bấm, gmgn.ai biết bạn đến từ link đó theo chính sách riêng của gmgn.ai; extension không gửi gì cả.
- Không dùng mã từ xa.

## 隐私政策（中文）

- 所有笔记保存在**你的设备上**（`chrome.storage.local`）。
- **多台电脑同步（可选，默认关闭）。** 只有当你在设置中开启同步并登录 Google 后，笔记才会另外写入**你自己的 Google Drive** 隐藏应用数据区中的一个文件（权限范围 `drive.appdata`：扩展只能读写自己的文件，看不到你 Drive 中的其他文件）。开发者永远不会收到该文件；Google 按其自身隐私政策处理。关闭同步即停止所有对 Google 的请求并移除权限；“删除 Drive 上的副本”会删除该文件。
- 本扩展**不**收集、**不**向开发者发送任何数据。没有开发者服务器、没有分析统计、没有账号。
- 在 `gmgn.ai` 和 `dexscreener.com` 上运行，用于在代币旁添加笔记按钮；它从页面读取代币地址和符号以确定你在为哪个项目做笔记。不读取钱包、余额或登录凭据。
- 在 DexScreener 上，链接指向交易对，因此扩展会把交易对地址发送到 DexScreener 的公开 API（`api.dexscreener.com`）以确定对应的代币。不发送任何个人数据；结果在本地缓存。
- 你可以随时在仪表盘中导出全部数据（JSON/Markdown）或删除。卸载扩展会删除全部数据。
- **X 搜索页**（`x.com/search`）：扩展读取搜索词以识别你已记录的合约地址或 $SYMBOL（或向 DexScreener 公开 API 查询该地址对应的代币）。你选中并选择保存的文本会与帖子链接和作者一起保存在本地。不会上传。
- **用 Grok 研究**（可选，仅在你点击按钮时）：扩展会在新标签页打开 x.com 或 grok.com，并预填包含代币符号、链、合约地址和市值的提示词。该页面由 X/xAI 按其自身隐私政策运营。在以此方式打开的 Grok 标签页上，扩展会添加一个小的“Research-Noted-Gmgn”面板，并在 Grok 回答完成后将回答文本存入该代币的时间线（可撤销）。可在面板或设置中关闭自动保存，此时只读取你选择保存的回答。文本像其他笔记一样只保存在本地，不会上传。
- **邀请链接。** 空面板、空仪表盘和工具栏弹窗中有一个指向 gmgn.ai 的链接，这是作者的邀请链接。扩展不会自动打开，也不会向任何页面或 URL 添加邀请码。如果你点击，gmgn.ai 会按其自身隐私政策知道你来自该链接；扩展不发送任何数据。
- 不使用远程代码。
