# Extension này có an toàn không?

Viết cho người dùng crypto, những người có lý do chính đáng để sợ cài extension lạ.

**Tóm tắt:** extension này chỉ chạy được trên 5 tên miền (gmgn.ai, dexscreener.com, x.com, twitter.com, grok.com). Nó không có quyền đọc bất kỳ trang nào khác, không đọc được ví của bạn, và không gửi ghi chú của bạn đi đâu cả. Bạn không cần tin lời tôi — phần cuối bài chỉ cách tự kiểm tra trong 2 phút.

---

## Vì sao một extension có thể nguy hiểm

Nói thẳng để bạn biết mình đang phòng cái gì. Một extension độc hại thường làm một trong bốn việc:

1. **Xin quyền trên mọi trang web** ("Đọc và thay đổi tất cả dữ liệu của bạn trên tất cả các trang web"). Khi đó nó đọc được trang ngân hàng, email, sàn giao dịch của bạn.
2. **Tải mã từ máy chủ về chạy.** Hôm nay bản cài sạch, ngày mai chủ sở hữu đẩy mã độc xuống mà không cần cập nhật.
3. **Đọc clipboard**, chờ bạn copy seed phrase hoặc địa chỉ ví rồi tráo địa chỉ.
4. **Gửi dữ liệu về máy chủ riêng.**

Đây là bốn thứ cần soi khi cài bất kỳ extension nào, kể cả cái này.

## Extension này đứng ở đâu trong bốn việc đó

| Rủi ro | Extension này |
|---|---|
| Quyền trên mọi trang | **Không.** Chỉ 5 tên miền, khai rõ trong file cài đặt. Trang ngân hàng, Gmail, Binance… nó không chạm được. |
| Tải mã từ xa | **Không.** Toàn bộ mã nằm trong gói cài. Có quy tắc bảo mật (CSP) chặn nạp script từ internet. |
| Đọc clipboard | **Không.** Không có dòng mã nào đụng tới clipboard. |
| Gửi dữ liệu đi | **Chỉ một chỗ:** `api.dexscreener.com`, và chỉ gửi địa chỉ cặp giao dịch (thông tin công khai) để biết đó là token nào. Ghi chú của bạn không bao giờ rời khỏi máy. |

## Vì sao nó không thể lấy private key của bạn

Ba lớp, lớp nào cũng đủ để chặn:

1. **Chrome cô lập các extension với nhau.** MetaMask, Phantom, Rabby là extension riêng. Một extension **không thể** đọc dữ liệu của extension khác. Đây là cơ chế của trình duyệt, không phải lời hứa của tôi.

2. **Private key không bao giờ xuất hiện trên gmgn, DexScreener hay X.** Kể cả nếu extension này muốn đọc trộm, trên những trang đó không có gì để đọc.

3. **Nó không có quyền chạy ở nơi khác.** Muốn theo dõi bạn ký giao dịch, nó phải xin quyền trên trang của ví hoặc trên mọi trang. Nó không xin, và Chrome sẽ chặn nếu nó cố.

Một điểm nữa: extension này **không hề có quyền kết nối ví**. Nó không hỏi địa chỉ ví, không mở popup ký, không có nút "Connect Wallet". Nếu sau này bạn thấy nó hỏi những thứ đó, nghĩa là bạn đang cài nhầm bản giả.

## Tự kiểm tra trong 2 phút

Đừng tin, hãy kiểm tra. Ba việc ai cũng làm được:

### Kiểm tra 1 — Xem nó được phép chạy ở đâu

Vào `chrome://extensions` → bấm **Chi tiết** (Details) ở thẻ Research-Noted-Gmgn → kéo xuống mục **Quyền truy cập trang web** (Site access).

Bạn phải thấy danh sách đúng 5 tên miền. Nếu thấy dòng **"Trên tất cả các trang web"** (On all sites), hãy gỡ ngay — đó không phải bản này.

### Kiểm tra 2 — Xem nó có gửi dữ liệu đi không

Mở gmgn.ai, bấm `F12` → thẻ **Network** → gõ vài ghi chú vào extension.

Bạn sẽ không thấy request nào đi tới máy chủ lạ. Chỉ khi nào bạn mở một trang DexScreener mới thì có một request tới `api.dexscreener.com` — đó là lúc nó hỏi "cặp giao dịch này là token gì".

### Kiểm tra 3 — Đọc lại kết quả tự kiểm tra của mã nguồn

Mã nguồn công khai. Trong thư mục dự án, chạy:

```bash
python3 scripts/audit.py
```

Script này đọc thẳng mã nguồn và in ra: extension khai những quyền gì, chạy ở trang nào, gửi request tới đâu, và có dùng API nguy hiểm nào không (eval, cookie, clipboard, lịch sử duyệt web, gọi chương trình ngoài, đọc ví trong trang). Nó báo lỗi nếu phát hiện bất kỳ thứ gì ngoài danh sách cho phép.

Kết quả đúng phải là:

```
KẾT QUẢ: ĐẠT — extension chỉ đọc 5 tên miền kể trên, chỉ gửi request tới
api.dexscreener.com, và lưu ghi chú trong máy bạn.
```

Bạn không cần biết lập trình để chạy lệnh này. Kết quả là tiếng Việt.

### Kiểm tra 4 (khi cài từ Chrome Web Store) — Đối chiếu gói cài

Mỗi bản phát hành đều công bố mã băm SHA-256 của file ZIP. Chạy `python3 scripts/pack.py` trên mã nguồn sẽ ra đúng mã băm đó, nghĩa là bản trên Store chính là mã nguồn bạn đọc được, không bị chèn thêm gì.

## Những gì Google đã kiểm tra giúp bạn

Extension trên Chrome Web Store phải qua duyệt tự động và thủ công: Google phân tích mã nguồn, đối chiếu quyền khai báo với hành vi thực tế, và từ chối nếu phát hiện mã che giấu hoặc gửi dữ liệu không khai báo. Đây không phải bảo đảm tuyệt đối, nhưng là một lớp lọc thật.

## Lời khuyên chung khi cài extension (bất kỳ cái nào)

- Đọc mục **Quyền truy cập trang web** trước khi bấm cài. "Trên tất cả các trang web" là dấu hiệu cần dừng lại và tự hỏi vì sao nó cần nhiều đến vậy.
- Cảnh giác với extension **đổi chủ sở hữu**. Nhiều vụ mã độc bắt đầu bằng việc một extension tốt bị mua lại.
- Với số tiền lớn, dùng **ví cứng** và một **profile Chrome riêng** không cài extension nào ngoài ví.
- Định kỳ dọn `chrome://extensions`, gỡ những thứ không còn dùng.

## Nếu bạn vẫn chưa yên tâm

Cách an toàn nhất: tạo một profile Chrome riêng (góc trên bên phải → Thêm → hồ sơ mới), chỉ cài extension này ở đó, và không cài ví nào vào profile đó. Bạn research trong profile này, giao dịch ở profile khác. Khi đó dù có chuyện gì, nó cũng không ở cùng chỗ với ví của bạn.

---

Chi tiết kỹ thuật đầy đủ (mô hình tấn công, từng biện pháp phòng ngừa) nằm ở [SECURITY.md](../SECURITY.md). Chính sách dữ liệu ở [PRIVACY.md](../PRIVACY.md).
