# Kịch bản video demo — Block 7: Checkout Saga

> Video nộp kèm theo rubric (slide 31): **"Video demo H0, F1–F6 trên UI; ảnh UI lúc pending và lúc kết thúc"**.
> Kịch bản gồm **10 cảnh, khoảng 11 phút**. Mỗi cảnh ghi: bố cục màn hình, thao tác từng bước, lệnh gõ, lời thoại, những gì **bắt buộc phải lọt vào hình**, và lúc nào cần **chụp ảnh**.
> Thứ tự cảnh và mã đơn (O1…O7, op `S5:charge`, `S7:charge`…) khớp với [THUYET-TRINH.md](THUYET-TRINH.md) và [HUONG-DAN-DEMO.md](HUONG-DAN-DEMO.md), vì đều chạy từ dữ liệu sạch.

---

## 0. Tóm tắt các cảnh

| Cảnh | Nội dung | Thời lượng | Trạng thái giữa chừng cần thấy | Trạng thái cuối |
| --- | --- | --- | --- | --- |
| 1 | Mở đầu: kiến trúc, 4 process | 0:00–0:45 | — | 4 process UP |
| 2 | Vấn đề: baseline không Saga | 0:45–1:45 | — | Orphan reservation + orphan charge |
| 3 | **H0** mua thành công | 1:45–2:50 | — | CONFIRMED, −350.000đ |
| 4 | **F1** hết hàng | 2:50–3:20 | — | CANCELLED, không bị trừ tiền |
| 5 | **F2** ví không đủ tiền | 3:20–4:20 | — | CANCELLED, số dư giữ 300.000đ, hàng về kho |
| 6 | **F3** confirm bị từ chối sau khi đã thu | 4:20–5:20 | (COMPENSATING thoáng qua) | CANCELLED, C3 + RF1 → C3 |
| 7 | **F4** kill Payment sau khi đã thu ★ | 5:20–7:40 | **RECOVERING**, Payment không truy cập được | CONFIRMED, 1 charge |
| 8 | **F5** refund lỗi tạm thời | 7:40–8:50 | **COMPENSATING**, pending `[refund, release]` | CANCELLED, 1 refund |
| 9 | **F6** kill orchestrator tại khoảng hở ★ | 8:50–10:20 | **Order chết**, DB còn intent `S7:charge` | CONFIRMED, PID mới, cùng op |
| 10 | Tổng kết: ma trận 7/7 ĐẠT, test 30/30 | 10:20–11:00 | — | 7 dòng ĐẠT |

**Chương (dán vào mô tả YouTube/Drive):**
```
0:00 Mở đầu – 3 service, 3 process, 3 DB
0:45 Vấn đề – checkout không có Saga
1:45 H0 – mua thành công
2:50 F1 – hết hàng
3:20 F2 – ví không đủ tiền
4:20 F3 – xác nhận bị từ chối sau khi đã thu tiền
5:20 F4 – kill Payment sau khi đã thu (RECOVERING)
7:40 F5 – hoàn tiền lỗi tạm thời (COMPENSATING)
8:50 F6 – kill orchestrator tại khoảng hở
10:20 Tổng kết – 7/7 kịch bản, 30/30 test
```

---

## 1. Chuẩn bị trước khi quay (khoảng 10 phút)

### 1.1 Công cụ quay

| Công cụ | Dùng được? | Ghi chú |
| --- | --- | --- |
| **OBS Studio** (khuyến nghị) | ✅ | Source **Display Capture** quay cả màn hình, nên trình duyệt và terminal cùng lọt vào hình. Thu mic cùng lúc. Xuất MP4 1920×1080, 30 fps |
| **Snipping Tool** của Windows 11 (`Win + Shift + R`) | ✅ | Kéo chọn vùng gồm cả trình duyệt và terminal. Bật biểu tượng micro để thu tiếng |
| Xbox Game Bar (`Win + Alt + R`) | ❌ | **Chỉ quay một cửa sổ**: không thấy được terminal kill/start cùng lúc với UI đổi trạng thái |

### 1.2 Bố cục màn hình (1920×1080)

```
┌───────────────────────────────────────────┬────────────────────────┐
│                                           │                        │
│   TRÌNH DUYỆT  (≈ 2/3 màn hình)           │   TERMINAL (≈ 1/3)     │
│   tab 1: http://127.0.0.1:3000  (app)     │   thư mục block7-saga  │
│   tab 2: http://127.0.0.1:3000/slides/    │   font 16–18           │
│                                           │                        │
└───────────────────────────────────────────┴────────────────────────┘
```

- Dùng Windows Snap: kéo trình duyệt sang trái và chọn 2/3, terminal sang phải 1/3 (`Win + Z`).
- Trình duyệt: zoom **100%**, ẩn thanh bookmark (`Ctrl + Shift + B`), đóng các tab không liên quan.
- Terminal: chữ to (`Ctrl` + `+`), nền tối. Xóa màn hình trước mỗi cảnh (`cls` hoặc `clear`).
- Tắt thông báo Windows (Focus assist / Do not disturb), Zalo, Messenger, Teams.

### 1.3 Đưa lab về dữ liệu sạch

Chạy ngay trước khi bấm quay:

```bash
npm run reset
```

```bash
npm run lab -- status
```

Phải thấy 4 dòng `process=sống http=UP`. Mở app → tab **Mua hàng**, khách **Nguyễn Văn An**, số dư **2.000.000đ**.

### 1.4 Thư mục lưu ảnh chụp

Tạo thư mục `evidence/video-screens/`. Mỗi khi kịch bản ghi **📸 Chụp**, bấm `Win + Shift + S` → chụp vùng trình duyệt → dán vào Paint hoặc lưu thẳng với tên đã ghi. Hoặc cắt khung hình từ video khi dựng.

### 1.5 Mẹo thu tiếng

- Nói chậm, câu ngắn; mỗi lần đổi trạng thái thì **dừng 1–2 giây** cho người xem kịp nhìn.
- Có thể quay hình trước rồi lồng tiếng sau theo đúng lời thoại bên dưới. Khi đó lúc quay hình chỉ cần thao tác và dừng đúng nhịp.
- Lỡ tay thì không cần quay lại từ đầu: dừng, quay tiếp cảnh đó, rồi cắt khi dựng. Chỉ cảnh 7 và 9 phải liền một mạch vì có kill/start process.

---

## 2. Kịch bản từng cảnh

> Ký hiệu: **🖱 Thao tác** · **⌨ Lệnh** · **🗣 Lời thoại** · **👁 Phải thấy trong hình** · **📸 Chụp** · **✂ Dựng**

---

### Cảnh 1 — Mở đầu (0:00 – 0:45)

**🖱 Thao tác**
1. Bắt đầu ở tab **slide**, slide 1 (tiêu đề), giữ 3 giây.
2. Chuyển sang slide 5 (kiến trúc), giữ khoảng 10 giây.
3. Chuyển sang terminal, gõ lệnh dưới.
4. Chuyển sang tab **app**.

**⌨ Lệnh**
```bash
npm run lab -- status
```

**🗣 Lời thoại**
> "Đây là bài Block 7 của nhóm 07: Checkout Saga. App có ba service: Order, Inventory và Payment là ví tiền của khách. Mỗi service là một process riêng với một database riêng. Orchestrator nằm trong Order.
> *(chạy status)* Bốn process đang chạy, mỗi process một PID: Order, Inventory, Payment và Web UI.
> *(sang app)* Web UI có bốn góc nhìn: khách mua hàng, thủ kho, ví tiền và ma trận kịch bản. Thanh trên cùng hiện trạng thái và PID của từng service."

**👁 Phải thấy:** 4 dòng `sống / UP` trong terminal; thanh trên cùng của app có 3 chấm xanh.

---

### Cảnh 2 — Vấn đề: checkout không có Saga (0:45 – 1:45)

**🖱 Thao tác**
1. Terminal: chạy `npm run baseline`.
2. App → tab **💳 Ví tiền** → ô lọc chọn **Lê Minh Cường**.
3. App → tab **📦 Kho** → bảng "Hàng đang giữ cho đơn": dòng **BASE-…** đang **Đang giữ**.
4. App → tab **🧪 Ma trận kịch bản** → bấm **Reset dữ liệu lab** → **OK**.

**⌨ Lệnh**
```bash
npm run baseline
```

**🗣 Lời thoại**
> "Trước hết là vấn đề. Đây là bản checkout cố ý sai: gọi lần lượt reserve, charge, confirm, không có Saga. Inventory giữ hàng và đã commit; Payment trừ tiền và đã commit; đến bước confirm thì lỗi, Order rollback đơn của mình.
> *(tab Ví)* Kết quả: anh Cường bị trừ 350 nghìn cho một đơn không tồn tại, không có dòng hoàn tiền nào. *(tab Kho)* Hàng vẫn bị giữ cho đơn đó.
> Lý do là transaction của Order chỉ bao được DB của Order. Không có transaction nào bao cả ba DB. *(bấm Reset)* Em reset dữ liệu để vào phần chính."

**👁 Phải thấy:** terminal có `orphan reservation` và `orphan charge`; tab Ví có dòng `Thu tiền đơn BASE-… −350.000đ CHARGED`.
**📸 Chụp:** `00-baseline-vi.png` (tab Ví đang lọc Lê Minh Cường).

---

### Cảnh 3 — H0: mua thành công (1:45 – 2:50)

**🖱 Thao tác**
1. Tab **🛒 Mua hàng**, khách **Nguyễn Văn An** (2.000.000đ).
2. Bấm **Mua** ở **Tai nghe Bluetooth**. Chờ khoảng 1 giây.
3. Bảng lịch sử: dòng **O1** "Thành công CONFIRMED", cột tiền **−350.000đ**; ô ví còn **1.650.000đ**.
4. Bấm **Chi tiết** ở O1 → rê chuột chậm qua các bước Saga → **Đóng**.
5. Tab **📦 Kho** → cuộn tới "Lịch sử vào / ra kho": dòng **Giữ cho đơn O1 −1**.
6. Tab **💳 Ví tiền** (chọn "Tất cả khách"): dòng **C1 Thu tiền đơn −350.000đ**, op `S1:charge`.

**🗣 Lời thoại**
> "H0: anh An có 2 triệu, mua tai nghe 350 nghìn. Đơn O1 tạo xong, chưa tới một giây đã thành công, ví còn 1 triệu 650.
> *(Chi tiết)* Đây là Saga record trong Order DB. Trước khi gọi Inventory, orchestrator ghi INTENT với operation ID `S1:reserve`; Inventory giữ hàng R1. Trước khi gọi Payment lại ghi INTENT với `S1:charge`; ví trừ tiền ở C1; cuối cùng là CONFIRMED. Ba ô phía trên là ba kho: Order CONFIRMED, Inventory R1 đang giữ, Payment C1 CHARGED.
> *(Kho)* Thủ kho thấy tai nghe bị giữ một chiếc cho O1. *(Ví)* Ví có giao dịch C1, đúng op `S1:charge`."

**👁 Phải thấy:** O1 CONFIRMED; trong chi tiết đủ 6 bước CREATE → INTENT → OUTCOME RESERVED → INTENT → OUTCOME CHARGED → OUTCOME CONFIRMED.
**📸 Chụp:** `01-H0-ket-thuc.png` (chi tiết O1).

---

### Cảnh 4 — F1: hết hàng (2:50 – 3:20)

**🖱 Thao tác**
1. Tab **🛒 Mua hàng** → bấm **Mua** ở **Loa mini** (thẻ đang ghi "Hết hàng").
2. Dòng **O2** "Đã hủy", lý do **Hết hàng**, cột tiền **"Không bị trừ tiền"**.
3. Bấm **Chi tiết** O2: chỉ có reserve bị từ chối rồi CANCELLED, **không có bước charge** → **Đóng**.

**🗣 Lời thoại**
> "F1: loa mini đang hết hàng. Kho từ chối dứt khoát, đơn O2 bị hủy ngay. Trong các bước Saga không có bước charge nào, vì guard không cho thu tiền khi chưa giữ được hàng. Khách không bị trừ đồng nào."

**👁 Phải thấy:** O2 CANCELLED; chi tiết không có dòng `charge`.
**📸 Chụp:** `02-F1-ket-thuc.png`.

---

### Cảnh 5 — F2: ví không đủ tiền (3:20 – 4:20)

**🖱 Thao tác**
1. Ô "Đang mua với tư cách" → chọn **Trần Thị Bình** (300.000đ).
2. Bấm **Mua** ở **Bàn phím cơ** (900.000đ).
3. Dòng **O3** "Đã hủy", lý do **Ví không đủ tiền**, tiền: "Thanh toán thất bại, không bị trừ"; ô ví **vẫn 300.000đ**.
4. Tab **📦 Kho** → lịch sử: **Giữ cho đơn O3 −1** rồi **Nhả về kho (bù) +1**.
5. Tab **💳 Ví tiền** → dòng **C2 FAILED**, lý do "Ví không đủ tiền".
6. Quay lại **🛒 Mua hàng**, chọn lại **Nguyễn Văn An**.

**🗣 Lời thoại**
> "F2: chị Bình chỉ có 300 nghìn mà mua bàn phím 900 nghìn. Lần này kho đã giữ hàng, rồi ví báo không đủ tiền. Đơn O3 bị hủy và số dư vẫn 300 nghìn: mua thất bại nhưng tiền vẫn còn.
> *(Kho)* Thủ kho thấy bàn phím bị giữ cho O3, rồi được nhả về kho: đó là bước bù release. *(Ví)* Ví ghi một giao dịch C2 thất bại, số dư không đổi."

**👁 Phải thấy:** số dư Bình 300.000đ trước và sau; movement RESERVE rồi RELEASE; C2 FAILED.
**📸 Chụp:** `03-F2-kho.png` (lịch sử vào/ra), `03-F2-vi.png`.

---

### Cảnh 6 — F3: xác nhận bị từ chối sau khi đã thu tiền (4:20 – 5:20)

**🖱 Thao tác**
1. Tab **🧪 Ma trận kịch bản** → hàng **F3** → **Chạy**.
2. Cột "Đơn gần nhất": **O4 Đã hủy**; cột oracle: bấm vào **ĐẠT 7/7** để xổ các check (giữ 2 giây).
3. Bấm nút **O4** → chi tiết: ô xanh "Mua thất bại nhưng tiền vẫn còn…"; ô Payment: **C3 CHARGED** và **RF1 refund → C3 REFUNDED**.
4. Cuộn xuống các bước: CHARGED → **COMPENSATING** → INTENT refund → refund OK → INTENT release → release OK → **CANCELLED** → **Đóng**.

**🗣 Lời thoại**
> "F3 khó hơn: tiền đã bị thu, sau đó bước xác nhận đơn bị từ chối. Tình huống này không tự xảy ra nên em dùng fault hook ở Order.
> Đơn chuyển sang COMPENSATING với hai việc còn nợ: refund rồi release. Refund chạy trước, đúng thứ tự của lab. Thầy để ý ô Payment: dòng charge C3 vẫn còn, có thêm một dòng mới RF1 trỏ về C3. Đó là compensation chứ không phải rollback: không xóa lịch sử, mà ghi thêm một giao dịch hoàn tiền. Oracle đạt 7 trên 7."

**👁 Phải thấy:** C3 và RF1 cùng lúc trong ô Payment; thứ tự refund trước release trong danh sách bước.
**📸 Chụp:** `04-F3-ket-thuc.png` (chi tiết O4).

---

### Cảnh 7 — F4: kill Payment sau khi đã thu tiền (5:20 – 7:40) ★ quay liền một mạch

**🖱 Thao tác + ⌨ Lệnh (đúng thứ tự)**
1. Tab **🧪 Ma trận** → hàng **F4** → **Chạy**. Chờ khoảng 2 giây: thanh trên cùng chuyển **"Payment: không truy cập được"** (Payment đang treo sau khi commit).
2. Terminal:
   ```bash
   npm run lab -- kill payment
   ```
   Dòng `KILL payment pid=… đã bị kill`.
3. App → tab **🛒 Mua hàng** → dòng **O5** "**Đang xác minh thanh toán** RECOVERING"; cột tiền "Payment không truy cập được". **Dừng 3 giây.**
4. Bấm **Chi tiết** O5 → chỉ vào dòng `UNKNOWN … → RECOVERING, KHÔNG coi là thất bại, KHÔNG charge ID mới` và các dòng `QUERY … ECONNREFUSED → vẫn RECOVERING`.
5. Terminal (chứng minh charge đã nằm trong Payment DB):
   ```bash
   npm run lab -- snapshot O5 khi-payment-chet
   ```
   Dòng `Payment DB (db-file …): C4 charge 350000 CHARGED op=S5:charge`.
6. Terminal:
   ```bash
   npm run lab -- start payment
   ```
   PID mới. **Nhìn chi tiết O5** trong khoảng ≤ 5 giây: tự chuyển **Thành công**; bước cuối "`RECOVERING → CHARGED … biết qua query op S5:charge: SUCCEEDED`" rồi CONFIRMED.
7. Tab **💳 Ví tiền**: chỉ **một** dòng charge C4 cho O5.

**🗣 Lời thoại**
> "Đây là phần quan trọng nhất: F4. Payment đã trừ tiền và commit xuống đĩa, nhưng chết trước khi kịp trả lời. *(Chạy)* Fault hook làm Payment commit rồi treo cả process; thanh trên cùng báo Payment không truy cập được. Em kill process Payment thật.
> *(Mua hàng)* Đơn O5 đang 'Đang xác minh thanh toán', tức RECOVERING. Order không báo hủy, không báo thành công, vì nó chưa biết tiền đã bị thu hay chưa. *(Chi tiết)* Dòng này ghi rõ: chưa rõ kết quả, không coi là thất bại, không cấp charge ID mới. Sau đó orchestrator liên tục hỏi lại Payment bằng đúng op `S5:charge`, cách 1, 2, 4, 5 giây.
> *(snapshot)* Thực tế trong Payment DB: em đọc thẳng file vì service đang chết. Charge C4 đã ở đó. Nếu Order coi timeout là thất bại rồi hủy đơn, khách sẽ mất 350 nghìn.
> *(start payment)* Em bật lại Payment với PID mới. *(chờ)* Đơn tự chuyển thành công: orchestrator hỏi `S5:charge`, Payment trả SUCCEEDED, ghi CHARGED rồi confirm. *(Ví)* Chỉ có đúng một charge."

**👁 Phải thấy:** cùng lúc trên màn hình: lệnh `kill` trong terminal **và** thanh trạng thái đỏ "Payment: không truy cập được"; trạng thái RECOVERING; snapshot `db-file … CHARGED`; sau khi start thì CONFIRMED.
**📸 Chụp (pending):** `05-F4-pending-recovering.png` (bảng lịch sử khi O5 RECOVERING, thanh trạng thái đỏ) và `05-F4-pending-chi-tiet.png` (chi tiết O5 với các dòng QUERY).
**📸 Chụp (kết thúc):** `05-F4-ket-thuc.png` (chi tiết O5 CONFIRMED, thấy bước "biết qua query").
**✂ Dựng:** đoạn chờ giữa các lần QUERY có thể tua nhanh ×2, nhưng giữ nguyên khoảnh khắc chuyển RECOVERING → CONFIRMED.

> **Nếu thao tác lỗi:** dừng quay, chạy `npm run lab -- fault clear`, rồi `npm run lab -- start payment`. Quay lại cảnh 7 từ bước 1; đơn mới sẽ là O6, nhớ đọc mã theo màn hình.

---

### Cảnh 8 — F5: hoàn tiền lỗi tạm thời (7:40 – 8:50)

**🖱 Thao tác**
1. Tab **🧪 Ma trận** → hàng **F5** → **Chạy**.
2. Bấm **O6** ở cột "Đơn gần nhất" → chi tiết: **Đang hoàn tác COMPENSATING**, `pending [refund, release]`, "lỗi gần nhất: HTTP 503 TEMPORARY_UNAVAILABLE"; ô Inventory **R5 ACTIVE**; các dòng `TEMP_FAIL … thử lại sau 1s, 2s, 4s`. **Dừng 3 giây.**
3. **Đóng** → bấm **Gỡ lỗi refund** ở hàng F5.
4. Bấm lại **O6**: trong 1–5 giây chuyển **Đã hủy**; Payment: **RF2 refund → C5** (một dòng); Inventory **R5 RELEASED**.
5. Cột oracle F5: **ĐẠT 8/8**.

**🗣 Lời thoại**
> "F5: chính bước bù cũng có thể lỗi. Em cho confirm bị từ chối như F3, nhưng lần này Payment trả 503 khi hoàn tiền.
> Đơn đang COMPENSATING, còn nợ refund và release, lỗi gần nhất là 503. Hàng vẫn đang được giữ vì refund chưa xong thì chưa được release. Hệ thống không báo 'đã hủy' giả. Danh sách việc còn nợ nằm trong DB, nên Order có restart lúc này cũng không quên.
> *(Gỡ lỗi)* Payment ổn lại. Refund chạy đúng một lần với cùng op `S6:refund`, rồi release, rồi hủy đơn. Oracle đạt 8 trên 8."

**👁 Phải thấy:** COMPENSATING + pending + R5 ACTIVE cùng lúc; sau khi gỡ thì CANCELLED + đúng một RF2.
**📸 Chụp (pending):** `06-F5-pending-compensating.png`. **📸 (kết thúc):** `06-F5-ket-thuc.png`.

---

### Cảnh 9 — F6: kill orchestrator tại khoảng hở (8:50 – 10:20) ★ quay liền một mạch

**🖱 Thao tác + ⌨ Lệnh (đúng thứ tự)**
1. Tab **🧪 Ma trận** → hàng **F6** → **Chạy**. Chờ khoảng 2 giây: thanh trên cùng **"Order: không truy cập được"** (Order nhận CHARGED rồi treo **trước khi ghi outcome**). Bảng ma trận cũng báo Order không truy cập được.
2. Terminal:
   ```bash
   npm run lab -- kill order
   ```
3. Terminal:
   ```bash
   npm run lab -- snapshot O7 sau-kill
   ```
   Thấy `Order DB (db-file …): RESERVED phase=charge intent=charge S7:charge` và `Payment DB: C6 charge 200000 CHARGED op=S7:charge`. **Dừng 3 giây.**
4. Terminal:
   ```bash
   npm run lab -- start order
   ```
   PID mới; thanh trên cùng Order xanh lại với PID mới.
5. App → tab **🛒 Mua hàng** → **Chi tiết** O7 → cuộn xuống cuối: bước **RESUME** "Order khởi động (pid …): đọc Saga record … tiếp tục bằng op ID cũ"; các bước sau có **pid khác** các bước trước; O7 **Thành công**.
6. Tab **💳 Ví tiền**: **một** charge C6 với op `S7:charge`.

**🗣 Lời thoại**
> "F6: lần này người chết là chính orchestrator, và chết đúng ở khoảng hở: Payment đã thu tiền và đã trả lời, nhưng Order chưa kịp ghi kết quả. *(Chạy)* Order treo; UI vẫn sống vì UI là process riêng, và báo Order không truy cập được. Em kill Order.
> *(snapshot)* Order DB lúc này chỉ có trạng thái RESERVED, nhưng nhờ đã ghi intent trước khi gọi, nó vẫn biết 'đang charge với op `S7:charge`'. Bên Payment thì charge C6 đã có. Nếu chỉ nhìn chữ RESERVED rồi charge bằng ID mới, khách sẽ bị thu hai lần.
> *(start order)* Em khởi động lại Order trên cùng file DB, không reset gì. *(Chi tiết)* Bước RESUME ghi: Order khởi động với PID mới, đọc Saga record, tiếp tục bằng op ID cũ. Payment trả lại C6 đã có, đơn thành công. PID trước và sau RESUME khác nhau: đây là hai process thật. Ví chỉ có một charge."

**👁 Phải thấy:** lệnh `kill order` và thanh "Order: không truy cập được"; snapshot đọc `db-file` có intent `S7:charge`; PID mới; bước RESUME; 1 charge.
**📸 Chụp (pending):** `07-F6-order-chet.png` (UI khi Order chết + terminal có snapshot). **📸 (kết thúc):** `07-F6-ket-thuc.png` (chi tiết O7, thấy RESUME và hai PID).

---

### Cảnh 10 — Tổng kết (10:20 – 11:00)

**🖱 Thao tác**
1. Tab **🧪 Ma trận** → bấm **Chạy** lần lượt ở **H0**, **F1**, **F2** (ba đơn đầu đã mua ở góc khách hàng nên chưa gắn nhãn kịch bản). Chờ khoảng 2 giây.
2. Cả 7 dòng hiện **ĐẠT** (6/6, 5/5, 5/5, 7/7, 8/8, 8/8, 9/9). Giữ 3 giây.
3. Terminal: chạy `npm test` và **tua nhanh** đoạn chạy (khoảng 15 giây) khi dựng, hoặc mở `evidence/test-output.txt`. Dòng cuối: **`Tests: 30 passed`**.
4. (Tùy chọn) Mở http://127.0.0.1:3000/docs: Swagger UI, 2 giây.

**⌨ Lệnh**
```bash
npm test
```

**🗣 Lời thoại**
> "Tổng kết: bảy kịch bản H0 và F1 đến F6 đều đạt oracle, kiểm bằng dữ liệu đọc từ cả ba kho. Ba mươi test tự động đều xanh, trong đó có F4, F5, F6 với kill process thật ngay trong test.
> Ba điều nhóm em rút ra: compensation không phải rollback; timeout nghĩa là chưa biết, phải hỏi lại bằng đúng operation ID; và ghi intent trước khi gọi để DB đủ thông tin làm tiếp sau khi process chết. Em cảm ơn thầy."

**👁 Phải thấy:** 7 dòng ĐẠT; `Tests: 30 passed`.
**📸 Chụp:** `08-ma-tran-7-dat.png`.

---

## 3. Sau khi quay

| Việc | Cách làm |
| --- | --- |
| Kiểm tra video đủ ý | Đối chiếu bảng ở mục 4 |
| Cắt, tua | Cắt chỗ chờ, chỗ gõ sai; tua ×2 đoạn `npm test` và các lần QUERY ở F4. **Không cắt** khoảnh khắc trạng thái giữa chừng → trạng thái cuối |
| Chèn chữ | Mỗi cảnh một dòng tiêu đề nhỏ góc trên (ví dụ "F4 — Kill Payment sau khi đã thu"); có thể thêm phụ đề theo lời thoại |
| Xuất file | MP4 H.264, 1080p, 30 fps; dưới 200 MB (OBS: Settings → Output → Recording Quality "High Quality, Medium File Size") |
| Tải lên | YouTube (chế độ Không công khai) hoặc Google Drive (Ai có link đều xem được). Dán danh sách chương ở mục 0 vào mô tả |
| Ghi vào bài nộp | Dán link vào `SUBMISSION.md` (dòng "Video demo") và đổi 🟡 thành ✅ ở `AUDIT.md` mục 6. Lưu ảnh chụp vào `evidence/video-screens/` |
| Trả lab về sạch | `npm run lab -- fault clear`, rồi `npm run reset` hoặc `npm run stop` |

## 4. Bảng kiểm trước khi nộp video

| Rubric / oracle | Thấy ở | ✔ |
| --- | --- | --- |
| H0: CONFIRMED, 1 reservation, 1 charge, không refund | Cảnh 3 | ☐ |
| F1: CANCELLED, không reservation, không gọi charge | Cảnh 4 | ☐ |
| F2: CANCELLED, reservation RELEASED, không charge thành công, tiền còn | Cảnh 5 | ☐ |
| F3: refund đúng 1 lần, charge vẫn còn, refund trước release | Cảnh 6 | ☐ |
| F4 **pending**: Payment không truy cập được + đơn RECOVERING | Cảnh 7 bước 3–4 | ☐ |
| F4 kết thúc: tự CONFIRMED sau khi start Payment, 1 charge | Cảnh 7 bước 6–7 | ☐ |
| F5 **pending**: COMPENSATING, pending `[refund, release]`, hàng còn giữ | Cảnh 8 bước 2 | ☐ |
| F5 kết thúc: refund 1 lần rồi release, CANCELLED | Cảnh 8 bước 4 | ☐ |
| F6: kill orchestrator tại khoảng hở, restart cùng DB, PID mới, cùng op ID | Cảnh 9 | ☐ |
| Lệnh kill/start **process thật** lọt vào hình cùng UI | Cảnh 7, 9 | ☐ |
| UI đọc qua API, tự cập nhật khi trạng thái đổi (không bấm tải lại trang) | Toàn video | ☐ |
| Ảnh UI lúc pending và lúc kết thúc | `evidence/video-screens/` | ☐ |

## 5. Xử lý sự cố khi đang quay

| Sự cố | Cách xử lý nhanh |
| --- | --- |
| Bấm Chạy F4/F6 nhưng thanh trạng thái chưa đỏ | Chờ thêm 1–2 giây (UI tải lại mỗi giây). Nếu vẫn xanh: `npm run lab -- fault list` để xem fault đã bật chưa |
| Quên kill, process đã treo lâu | Không sao; process treo 10 phút. Cứ kill rồi start |
| Đơn kẹt ở COMPENSATING sau khi gỡ lỗi | Chờ tối đa 5 giây (nấc backoff). Hoặc `npm run lab -- resume S6` |
| Mã đơn khác kịch bản (vì phải làm lại một cảnh) | Đọc mã theo màn hình; lời thoại không phụ thuộc mã cụ thể |
| Một service không lên khi start | `npm run lab -- logs payment 20`; nếu báo cổng bận thì `npm run lab -- restart payment` |
| Muốn quay lại từ đầu | `npm run lab -- fault clear`, rồi `npm run reset` (khoảng 10 giây), quay lại từ cảnh 1 |
