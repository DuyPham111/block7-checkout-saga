# Kịch bản video demo (bản gọn, khoảng 6 phút)

Rubric (slide 31) yêu cầu: **video demo H0, F1–F6 trên UI** và **ảnh UI lúc pending, lúc kết thúc**. Video này gồm 7 cảnh. Mã đơn O1…O7 khớp khi bắt đầu từ dữ liệu sạch.

## Chuẩn bị (2 phút)

1. Công cụ quay: **OBS** (Display Capture) hoặc **Snipping Tool** (`Win + Shift + R`, chọn vùng). Không dùng Xbox Game Bar vì nó chỉ quay một cửa sổ.
2. Chia màn hình: **trình duyệt bên trái** (http://127.0.0.1:3000) và **terminal bên phải** (thư mục `block7-saga`, chữ to). Tắt thông báo.
3. Chạy hai lệnh dưới. Kiểm tra 4 process `sống / UP`, rồi mở tab **Mua hàng** với khách **Nguyễn Văn An**.

```bash
npm run reset
```

```bash
npm run lab -- status
```

Ký hiệu: **📸** là chỗ chụp ảnh (`Win + Shift + S`), lưu vào `evidence/video-screens/`.

## Kịch bản

### Cảnh 1 — Mở đầu và vấn đề (0:00–0:50)

| Thao tác | Lời thoại |
| --- | --- |
| Terminal: `npm run lab -- status` | "Bài Block 7 nhóm 07: ba service Order, Inventory, Payment (ví). Mỗi service là một process với một database riêng." |
| Terminal: `npm run baseline` → tab **Ví** chọn **Lê Minh Cường** | "Checkout không có Saga: confirm lỗi thì Order rollback, nhưng hàng vẫn bị giữ và khách vẫn mất 350 nghìn. Transaction của Order không bao được DB của service khác." |
| Tab **Ma trận** → **Reset dữ liệu lab** → OK | "Em reset dữ liệu để vào phần chính." |

### Cảnh 2 — H0: mua thành công (0:50–1:40)

| Thao tác | Lời thoại |
| --- | --- |
| **Mua hàng** → **Mua** Tai nghe → O1 **Thành công**, ví còn 1.650.000đ | "Anh An mua tai nghe 350 nghìn. Đơn O1 thành công, ví bị trừ đúng giá trị đơn." |
| **Chi tiết** O1 📸 `H0.png` | "Trước mỗi lời gọi, orchestrator ghi INTENT với operation ID cố định, ví dụ `S1:charge`. Ba kho: Order CONFIRMED, giữ hàng R1, charge C1." |

### Cảnh 3 — F1, F2: thất bại tự nhiên, tiền vẫn còn (1:40–2:40)

| Thao tác | Lời thoại |
| --- | --- |
| **Mua** Loa mini (hết hàng) → O2 **Đã hủy**, "Không bị trừ tiền" 📸 `F1.png` | "F1: hết hàng, kho từ chối, đơn hủy ngay và không có bước thu tiền nào." |
| Đổi khách **Trần Thị Bình** → **Mua** Bàn phím → O3 **Đã hủy**, ví vẫn 300.000đ | "F2: ví chỉ có 300 nghìn. Kho đã giữ hàng, ví báo không đủ, đơn hủy. Mua thất bại nhưng tiền vẫn còn." |
| Tab **Kho**: "Giữ cho đơn O3 −1", rồi "Nhả về kho (bù) +1" 📸 `F2.png` → đổi lại khách **An** | "Thủ kho thấy hàng được nhả về: đó là bước bù release." |

### Cảnh 4 — F3: xác nhận bị từ chối sau khi đã thu (2:40–3:20)

| Thao tác | Lời thoại |
| --- | --- |
| **Ma trận** → F3 **Chạy** → bấm **O4** 📸 `F3.png` | "Tiền đã thu thì confirm bị từ chối. Hệ thống hoàn tiền rồi mới nhả hàng. Ledger có C3 **và** dòng mới RF1 trỏ về C3: compensation là giao dịch mới, không xóa lịch sử." |

### Cảnh 5 — F4: kill Payment sau khi đã thu ★ (3:20–4:40, quay liền)

| Thao tác | Lời thoại |
| --- | --- |
| **Ma trận** → F4 **Chạy**, chờ thanh trên cùng báo "Payment: không truy cập được" | "Payment đã trừ tiền và commit, nhưng treo trước khi trả lời." |
| Terminal: `npm run lab -- kill payment` | "Em kill process Payment thật." |
| **Mua hàng** → O5 **Đang xác minh thanh toán (RECOVERING)** → **Chi tiết** 📸 `F4-pending.png` | "Order không hủy và không báo thành công, vì chưa biết đã thu chưa. Nó hỏi lại bằng đúng op `S5:charge` và không cấp ID mới." |
| Terminal: `npm run lab -- start payment` → O5 tự **Thành công** 📸 `F4-ket-thuc.png` | "Payment sống lại, trả lời SUCCEEDED, đơn được xác nhận. Ví chỉ có một charge." |

### Cảnh 6 — F5: hoàn tiền lỗi tạm thời (4:40–5:20)

| Thao tác | Lời thoại |
| --- | --- |
| **Ma trận** → F5 **Chạy** → **O6**: COMPENSATING, pending `[refund, release]`, R5 còn giữ 📸 `F5-pending.png` | "Lần này bước hoàn tiền bị lỗi 503. Đơn giữ COMPENSATING, việc còn nợ được lưu trong DB, không báo hủy giả." |
| Bấm **Gỡ lỗi refund** → O6 **Đã hủy**, đúng một RF2 📸 `F5-ket-thuc.png` | "Payment ổn lại: hoàn tiền đúng một lần, rồi nhả hàng, rồi hủy đơn." |

### Cảnh 7 — F6: kill orchestrator, rồi tổng kết ★ (5:20–6:30, quay liền)

| Thao tác | Lời thoại |
| --- | --- |
| **Ma trận** → F6 **Chạy**, chờ báo "Order: không truy cập được" | "Orchestrator nhận được kết quả thu tiền, nhưng treo trước khi kịp ghi." |
| Terminal: `npm run lab -- kill order`, rồi `npm run lab -- snapshot O7 sau-kill` 📸 `F6-pending.png` | "Order DB vẫn còn intent `charge S7:charge`; Payment đã có C6." |
| Terminal: `npm run lab -- start order` → **Chi tiết** O7: bước **RESUME**, PID mới, **Thành công** 📸 `F6-ket-thuc.png` | "Khởi động lại trên cùng DB, dùng lại op cũ: một charge, không thu hai lần." |
| **Ma trận** → **Chạy** H0, F1, F2 → 7 dòng **ĐẠT** 📸 `ma-tran.png` | "Bảy kịch bản đều đạt oracle, 30 test tự động xanh. Em cảm ơn thầy." |

## Sau khi quay

- Cắt các chỗ chờ. Giữ nguyên khoảnh khắc chuyển từ **trạng thái giữa chừng** sang **trạng thái cuối** ở F4, F5, F6.
- Xuất MP4 1080p, tải lên YouTube (Không công khai) hoặc Drive. Dán link vào `SUBMISSION.md` và đổi 🟡 thành ✅ ở `AUDIT.md` mục 6.
- Gỡ fault và đưa lab về dữ liệu sạch:

```bash
npm run lab -- fault clear
```

```bash
npm run reset
```

**Sự cố hay gặp:**
- Thanh trạng thái chưa đỏ: chờ thêm 1–2 giây.
- Đơn kẹt ở COMPENSATING: chờ tối đa 5 giây hoặc chạy `npm run lab -- resume S6`.
- Phải quay lại một cảnh: mã đơn sẽ khác, cứ đọc theo màn hình.
- Muốn làm lại từ đầu: chạy `npm run reset`.

Chi tiết từng thao tác: [HUONG-DAN-DEMO.md](HUONG-DAN-DEMO.md). Lời dẫn đầy đủ: [THUYET-TRINH.md](THUYET-TRINH.md).
