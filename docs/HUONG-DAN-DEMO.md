# Hướng dẫn demo (trình bày với thầy và quay video nộp bài)

> Lời dẫn đầy đủ nằm trong [THUYET-TRINH.md](THUYET-TRINH.md). File này tập trung vào **thao tác**: gõ lệnh gì, bấm vào đâu, trên màn hình phải thấy gì, và gặp sự cố thì xử lý ra sao.

---

## 0. Chuẩn bị trước buổi (làm ở nhà, khoảng 5 phút)

Mở terminal tại thư mục `W7/block7-saga`. Gõ đúng từng lệnh dưới đây; tất cả đều chạy được trong PowerShell, cmd hay Git Bash.

1. Cài thư viện (chỉ làm lần đầu):
   ```bash
   npm install
   ```
2. Chạy toàn bộ test và lưu kết quả. Phải thấy `Tests: 30 passed`.
   ```bash
   npm run test:report
   ```
3. Chạy lại evidence H0, F1–F6. Bảng cuối phải có 7 dòng `ĐẠT`.
   ```bash
   npm run evidence
   ```
4. Đưa lab về dữ liệu sạch để demo.
   ```bash
   npm run reset
   ```
5. Kiểm tra 4 process đều `sống` và `UP`.
   ```bash
   npm run lab -- status
   ```

**Bố trí màn hình** (nên dùng 2 màn hình, hoặc chia đôi một màn hình):

| Vị trí | Mở gì |
| --- | --- |
| Trái | Trình duyệt tab 1: **slide** `presentation/slides.html` (mở file bằng Chrome/Edge, bấm `F` để toàn màn hình) |
| Phải trên | Trình duyệt tab 2: **app** http://127.0.0.1:3000 |
| Phải dưới | **Terminal** ở thư mục `block7-saga`, chữ to (Ctrl + `+`) |

**Dữ liệu seed sau khi reset:**

| Khách | Số dư | Sản phẩm | Giá | Tồn |
| --- | --- | --- | --- | --- |
| Nguyễn Văn An `CUS-AN` | 2.000.000đ | Tai nghe Bluetooth | 350.000đ | 10 |
| Trần Thị Bình `CUS-BINH` | 300.000đ | Bàn phím cơ | 900.000đ | 5 |
| Lê Minh Cường `CUS-CUONG` | 1.000.000đ | Chuột không dây | 200.000đ | 3 |
| | | Loa mini | 500.000đ | **0 (hết hàng)** |

---

## 1. Bảng lệnh nhanh

| Mục đích | Lệnh |
| --- | --- |
| Trạng thái 4 process | `npm run lab -- status` |
| Kill / start Payment | `npm run lab -- kill payment` / `npm run lab -- start payment` |
| Kill / start Order (orchestrator) | `npm run lab -- kill order` / `npm run lab -- start order` |
| Xem / gỡ fault | `npm run lab -- fault list` / `npm run lab -- fault clear` |
| Snapshot 3 kho của một đơn | `npm run lab -- snapshot O5 ten-nhan` |
| Log gần nhất | `npm run lab -- logs order 20` |
| Resume saga thủ công | `npm run lab -- resume S6` |
| Kịch bản tự động (dự phòng) | `npm run demo -- f4` (hoặc f5, f6…) |
| Baseline (vấn đề) | `npm run baseline` |
| Test | `npm test` |

---

## 2. Trình tự demo (khoảng 9 phút)

> Đơn nào cũng mở được chi tiết: tab **Mua hàng** → bảng "Lịch sử đơn hàng" → nút **Chi tiết**. Chi tiết đơn hiện 3 ô Order DB / Inventory DB / Payment DB và **các bước Saga** (seq, thời điểm, loại bước, op ID, PID).

### D0 — Vấn đề: checkout không có Saga (khoảng 1 phút)

1. Terminal:
   ```bash
   npm run baseline
   ```
2. Thấy trong terminal:
   - `R… ACTIVE ← orphan reservation`
   - `C… CHARGED 350.000đ, số dư 1.000.000đ → 650.000đ ← orphan charge`
3. App → tab **Ví tiền** → chọn "Lê Minh Cường": có dòng **Thu tiền đơn BASE-…** −350.000đ mà không có dòng hoàn tiền nào.
4. App → tab **Ma trận kịch bản** → bấm **Reset dữ liệu lab** → OK, để xóa dữ liệu baseline trước khi demo phần chính.

### D1 — H0: mua thành công (khoảng 1 phút)

1. Tab **Mua hàng**, khách "Nguyễn Văn An" (số dư 2.000.000đ). Bấm **Mua** ở **Tai nghe Bluetooth**.
2. Thấy dòng thông báo "Đã tạo đơn O1… đang xử lý". Bảng lịch sử có O1 → **Thành công CONFIRMED**. Cột tiền **−350.000đ**. Số dư còn **1.650.000đ**.
3. Bấm **Chi tiết** O1. Chỉ cho thầy các bước: CREATE → INTENT reserve → OUTCOME RESERVED (R1) → INTENT charge → OUTCOME CHARGED (C1) → OUTCOME CONFIRMED. Mỗi INTENT ghi op ID (`S1:reserve`, `S1:charge`) **trước** khi gọi.
4. Tab **Kho**: tai nghe còn 9, đang giữ 1. Lịch sử vào/ra có dòng **Giữ cho đơn O1 −1**.
5. Tab **Ví tiền**: dòng **C1 Thu tiền đơn −350.000đ CHARGED**, op `S1:charge`.

### D2 — F1: hết hàng (30 giây)

1. Tab **Mua hàng** → bấm **Mua** ở **Loa mini** (đang hiện "Hết hàng").
2. Đơn O2 → **Đã hủy CANCELLED**, lý do "Hết hàng", cột tiền "**Không bị trừ tiền**".
3. Chi tiết: reserve bị từ chối → CANCELLED ngay; **không có bước charge nào**.

### D3 — F2: ví không đủ tiền (khoảng 1 phút)

1. Ô "Đang mua với tư cách" → chọn **Trần Thị Bình** (300.000đ). Bấm **Mua** ở **Bàn phím cơ** (900.000đ).
2. Đơn O3 → **Đã hủy**, lý do "Ví không đủ tiền", "Thanh toán thất bại, không bị trừ". **Số dư vẫn 300.000đ.**
3. Tab **Kho** → lịch sử: bàn phím **Giữ cho đơn O3 −1** rồi **Nhả về kho (bù) +1** (đây là bằng chứng release).
4. Tab **Ví** → dòng **C2 FAILED**, lý do "Ví không đủ tiền", số dư sau 300.000đ.
5. Chọn lại khách **Nguyễn Văn An** cho các bước sau.

### D4 — F3: xác nhận bị từ chối sau khi đã thu tiền (khoảng 1 phút)

1. Tab **Ma trận kịch bản** → hàng F3 → **Chạy**.
2. Cột "Đơn gần nhất" → O4 **Đã hủy**; cột Kiểm tra oracle **ĐẠT 7/7** (bấm vào để xổ các check).
3. Bấm O4 để mở chi tiết. Ô xanh: "**Mua thất bại nhưng tiền vẫn còn: đã trừ 350.000đ rồi hoàn lại 350.000đ**". Payment DB: `C3 CHARGED` **và** `RF1 refund → C3 REFUNDED`. Các bước: CHARGED → COMPENSATING → INTENT refund → refund OK → INTENT release → release OK → CANCELLED (**refund trước release**).

### D5 — F4: Payment chết sau khi đã thu (khoảng 2 phút, phần quan trọng nhất)

1. Tab **Ma trận** → hàng F4 → **Chạy**. Payment commit charge rồi **treo**. Thanh trên cùng chuyển "Payment: **không truy cập được**".
2. Terminal (gõ trong vòng vài phút):
   ```bash
   npm run lab -- kill payment
   ```
   Thấy: `KILL payment pid=… đã bị kill`.
3. Tab **Mua hàng** → đơn O5 hiện **Đang xác minh thanh toán RECOVERING**; cột tiền "Payment không truy cập được". Mở **Chi tiết**: ô Payment DB báo không truy cập được; các bước có `UNKNOWN … → RECOVERING, KHÔNG coi là thất bại, KHÔNG charge ID mới`, rồi nhiều dòng `QUERY … ECONNREFUSED → vẫn RECOVERING`.
4. (Tùy chọn) chứng minh charge **đã nằm trong Payment DB** dù Payment đang chết:
   ```bash
   npm run lab -- snapshot O5 khi-payment-chet
   ```
   Dòng Payment DB đọc từ `db-file`: `C… charge 350000 CHARGED op=S5:charge`.
5. Bật lại Payment:
   ```bash
   npm run lab -- start payment
   ```
   PID mới. Trong khoảng ≤ 5 giây, O5 tự chuyển **Thành công CONFIRMED**. Bước cuối: `RECOVERING → CHARGED … biết qua query op S5:charge: SUCCEEDED`.
6. Tab **Ví**: **chỉ một** dòng charge cho O5. Tab **Ma trận**: F4 **ĐẠT 8/8**.

> **Dự phòng:** nếu thao tác tay bị lỗi, chạy `npm run demo -- f4`. Script tự làm toàn bộ (fault → chờ marker → kill → snapshot → start → kiểm oracle), UI vẫn cập nhật theo.

### D6 — F5: hoàn tiền lỗi tạm thời (khoảng 1 phút)

1. Tab **Ma trận** → hàng F5 → **Chạy**.
2. Mở đơn O6: **Đang hoàn tác COMPENSATING**, `pending [refund, release]`, "lỗi gần nhất: HTTP 503 TEMPORARY_UNAVAILABLE"; Inventory DB: R… **ACTIVE** (chưa release vì refund chưa xong). Các bước `TEMP_FAIL … thử lại sau 1s, 2s, 4s…`.
3. Ô cảnh báo màu cam: "Đang hoàn tác… chưa báo đã hủy". Nhấn mạnh **không có terminal giả**.
4. Tab **Ma trận** → bấm **Gỡ lỗi refund** ở hàng F5. Khoảng 1–5 giây sau, O6 → **Đã hủy**: `RF… REFUNDED` (một dòng), R… RELEASED. F5 **ĐẠT 8/8**.

### D7 — F6: orchestrator chết tại khoảng hở (khoảng 1 phút 30 giây)

1. Tab **Ma trận** → hàng F6 → **Chạy**. Order nhận CHARGED rồi treo **trước khi ghi outcome**; thanh trên cùng: "Order: không truy cập được".
2. Terminal:
   ```bash
   npm run lab -- snapshot O7 truoc-kill
   npm run lab -- kill order
   npm run lab -- snapshot O7 sau-kill
   ```
   Snapshot "sau-kill": Order DB đọc từ `db-file`: **RESERVED, phase=charge, intent=charge S7:charge**; Payment: `C… CHARGED op=S7:charge`. Đây chính là khoảng hở.
3. Bật lại Order:
   ```bash
   npm run lab -- start order
   ```
   PID mới. O7 → **Thành công**.
4. Chi tiết O7: bước **RESUME** "Order khởi động (pid mới): đọc Saga record… tiếp tục bằng op ID cũ", các bước sau có **PID khác** các bước trước. Ví: **một** charge op `S7:charge`. F6 **ĐẠT 9/9**.

### D8 — Bằng chứng tổng (30 giây)

- Tab **Ma trận**: H0, F1, F2 mua ở tab Mua hàng nên chưa có nhãn kịch bản. Bấm **Chạy** ở hàng H0, F1, F2 (mỗi đơn xong dưới 1 giây), rồi cả 7 dòng hiện **ĐẠT**.
- Mở `evidence/test-output.txt` (30/30 test) và `evidence/SUMMARY.md`. Nếu còn thời gian, chạy `npm test` (khoảng 15 giây).

---

## 3. Sau khi demo

```bash
npm run lab -- fault clear
```

```bash
npm run stop
```

Hoặc dùng `npm run reset` để chạy lại từ đầu.

---

## 4. Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| `npm run reset` báo một service `CHƯA LÊN` | `npm run lab -- logs <service> 30`. Nếu cổng bị chiếm: `npm run stop`, hoặc `netstat -ano \| findstr :3001` rồi `taskkill /F /PID <pid>` |
| Bấm Chạy F4/F6 mà quên kill | Process treo 10 phút rồi tự chạy tiếp. Cứ kill rồi start như bình thường |
| Lỡ start lại trước khi kill | `npm run lab -- restart payment` (kill rồi start) |
| Đơn kẹt ở COMPENSATING | `npm run lab -- fault list`. Còn `refund=error503` thì gỡ bằng `npm run lab -- fault clear payment` |
| F1 không bị từ chối (vì đã nhập thêm loa) | Nút Chạy ở tab Ma trận tự bật thêm fault `reserve=reject`. Hoặc reset lab |
| F2 không thất bại (Bình đã được nạp tiền) | Nút Chạy tự bật `charge=fail`. Hoặc reset lab |
| UI không đổi | Bấm Ctrl+F5. Thanh trạng thái phải có 3 chấm xanh |
| Muốn làm lại từ đầu | `npm run reset` (khoảng 10 giây) hoặc nút **Reset dữ liệu lab** |

---

## 5. Quay video nộp bài (H0, F1–F6 trên UI)

> Kịch bản quay chi tiết từng cảnh (lời thoại, thao tác, điểm chụp ảnh, bảng kiểm): **[KICH-BAN-VIDEO.md](KICH-BAN-VIDEO.md)**.

- Dùng **OBS Studio** (Display Capture) hoặc **Snipping Tool** (`Win + Shift + R`, chọn vùng). **Không dùng Xbox Game Bar**: nó chỉ quay một cửa sổ, nên không thấy được terminal kill/start cùng lúc với UI đổi trạng thái.
- Thứ tự: D1 → D7 như mục 2. Mỗi kịch bản dừng 1–2 giây ở **trạng thái giữa chừng** (RECOVERING, COMPENSATING) và ở **trạng thái cuối**.
- Chụp ảnh UI lúc pending và lúc kết thúc. Ảnh mẫu đã có trong `presentation/img/` (`10-f4-payment-down.jpg`, `11-f4-recovering.jpg`, `12-f4-recovered.jpg`, …).
- Đính kèm: `evidence/SUMMARY.md`, `evidence/<ID>/timeline.txt`, `evidence/test-output.txt`, `evidence/baseline.txt`.
