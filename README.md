# Nhóm 07 — Block 7: Giao dịch phân tán và Saga (Checkout Saga)

Nhóm 07 · 23127045 · 23127102 · 23127159 · 23127183 · 23127393 · Repository: https://github.com/DuyPham111/block7-checkout-saga

App bán hàng **Saga Shop** gồm ba service HTTP: **Order**, **Inventory** và **Payment (ví tiền)**. Mỗi service là **một process riêng** với **một file database riêng**. Orchestrator đặt trong Order: lưu Saga record bền vững, chạy bước bù (refund → release → cancel) khi lỗi, và tự phục hồi khi một process bị kill giữa giao dịch. Web UI có bốn góc nhìn: khách mua hàng, thủ kho, ví tiền, ma trận kịch bản H0, F1–F6.

| Đọc gì | Nội dung |
| --- | --- |
| **README.md** (file này) | Hướng dẫn triển khai, chạy, kiểm tra |
| [REPORT.md](REPORT.md) | Báo cáo chi tiết: các lựa chọn của nhóm, chọn gì, không chọn gì, vì sao, đánh đổi |
| [REPORT.html](REPORT.html) | Báo cáo dạng slide (37 trang = 18 trang thuyết trình + 19 trang giải thích lựa chọn), chế độ **Đọc tài liệu**, mở offline |
| [AUDIT.md](AUDIT.md) | Đối chiếu từng yêu cầu của đề ↔ nơi hiện thực ↔ test/evidence |
| [SUBMISSION.md](SUBMISSION.md) | Thông tin gói nộp |
| [docs/](docs/) | Nguyên lý hoạt động, hướng dẫn demo, kịch bản thuyết trình, [kịch bản video demo](docs/KICH-BAN-VIDEO.md), đặc tả OpenAPI |
| [evidence/](evidence/) | Kết quả test, tổng hợp H0–F6, timeline + snapshot ba kho, baseline |

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- |
| Node.js | **≥ 22** (đã thử 22.16.0) | Cần `fetch`, `AbortSignal.timeout` |
| npm | ≥ 10 | Đi kèm Node |
| Hệ điều hành | Windows 10/11, Linux, macOS | `better-sqlite3` có bản build sẵn cho Node 22 |
| Cổng trống | 3000–3003 (lab), 4001–4003 (test) | Đổi được bằng biến môi trường (mục 3) |

Không cần Docker, không cần cài database server: mỗi service tự tạo một file SQLite trong `data/`.

## 2. Triển khai

Sau khi giải nén ZIP hoặc clone repository, mở terminal tại thư mục dự án.

**Bước 1.** Cài thư viện đúng phiên bản trong `package-lock.json`:

```bash
npm ci
```

**Bước 2.** Tạo DB từ `data/seed/*.json` và khởi động 4 process (inventory, payment, order, ui):

```bash
npm run reset
```

**Bước 3.** Kiểm tra cả 4 dòng đều `process=sống` và `http=UP`:

```bash
npm run lab -- status
```

**Bước 4.** Mở các địa chỉ sau:

| Địa chỉ | Nội dung |
| --- | --- |
| http://127.0.0.1:3000 | **Web UI**: Mua hàng · Kho · Ví tiền · Ma trận kịch bản |
| http://127.0.0.1:3000/docs | **Swagger UI**: tài liệu API, "Try it out" gọi thẳng service |
| http://127.0.0.1:3000/report | REPORT.html (báo cáo dạng slide) |
| http://127.0.0.1:3000/slides/ | Slide thuyết trình |

**Dừng tất cả:**

```bash
npm run stop
```

Lần sau chỉ cần `npm start` (giữ dữ liệu cũ) hoặc `npm run reset` (về dữ liệu ban đầu).

| Process | Cổng | Database | Mã nguồn |
| --- | --- | --- | --- |
| ui (Web UI, Swagger, slide) | 3000 | — | `scripts/ui-server.js`, `ui/` |
| order (+ orchestrator) | 3001 | `data/order.db` | `services/order/` |
| inventory | 3002 | `data/inventory.db` | `services/inventory/` |
| payment (ví) | 3003 | `data/payment.db` | `services/payment/` |

Mọi process chỉ bind `127.0.0.1`. PID lưu ở `run/<service>.pid`, log ở `logs/<service>.log`.

## 3. Cấu hình

Mọi tham số nằm ở một chỗ duy nhất, [config.js](config.js); đổi được bằng biến môi trường:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `UI_PORT`, `ORDER_PORT`, `INVENTORY_PORT`, `PAYMENT_PORT` | 3000, 3001, 3002, 3003 | Cổng từng process |
| `DATA_DIR` | `data/` | Nơi đặt file DB lúc chạy |
| `SEED_DIR` | `data/seed/` | Dữ liệu ban đầu (JSON) |
| `RUN_DIR`, `LOG_DIR` | `run/`, `logs/` | PID, marker / log JSON Lines |
| `HTTP_TIMEOUT_MS` | 2000 | Timeout mỗi lời gọi giữa service |
| `RECOVERY_POLL_MS` | 1000 | Chu kỳ quét saga chưa kết thúc |
| `FREEZE_MS` | 600000 | Thời gian đóng băng process tại điểm dừng F4/F6 |
| `LAB_FAULTS` | `1` | `0` để tắt `/__lab/*` (fault hook, reset); bắt buộc tắt ngoài môi trường lab |

Backoff khi thử lại là 1 → 2 → 4 → 5 giây (`BACKOFF_MS` trong `config.js`).

## 4. Dữ liệu

Dữ liệu ban đầu nằm trong [data/seed/inventory.json](data/seed/inventory.json) và [data/seed/payment.json](data/seed/payment.json), được nạp khi DB trống hoặc khi reset. Sửa file JSON rồi chạy `npm run reset` để áp dụng.

| Khách (ví) | Số dư | Sản phẩm | Giá | Tồn |
| --- | --- | --- | --- | --- |
| Nguyễn Văn An `CUS-AN` | 2.000.000đ | Tai nghe Bluetooth `SKU-TAINGHE` | 350.000đ | 10 |
| Trần Thị Bình `CUS-BINH` | 300.000đ | Bàn phím cơ `SKU-BANPHIM` | 900.000đ | 5 |
| Lê Minh Cường `CUS-CUONG` | 1.000.000đ | Chuột không dây `SKU-CHUOT` | 200.000đ | 3 |
| | | Loa mini `SKU-LOA` | 500.000đ | **0** |

Loa mini tồn 0 làm **F1** (kho từ chối) xảy ra tự nhiên; Bình chỉ có 300.000đ làm **F2** (ví không đủ tiền) xảy ra tự nhiên. Không có đăng nhập: chọn khách ở ô "Đang mua với tư cách" trên tab Mua hàng.

Các file `data/*.db` được tạo lúc chạy và không nộp kèm. `npm run reset` chỉ xóa các file `.db`, giữ nguyên `data/seed/`.

## 5. Sử dụng

**Web UI** (http://127.0.0.1:3000), tự cập nhật mỗi giây:

| Tab | Góc nhìn | Xem / làm được |
| --- | --- | --- |
| 🛒 Mua hàng | Khách hàng | Chọn khách, số dư ví, sản phẩm còn/hết, mua; lịch sử đơn (lọc Tất cả / Thành công / Đã hủy / Đang xử lý), cột "Tiền của khách", **Chi tiết** đơn = 3 kho + các bước Saga |
| 📦 Kho | Thủ kho | Tồn khả dụng, đang giữ, nhập hàng; reservation; lịch sử hàng vào/ra |
| 💳 Ví tiền | Thanh toán | Số dư từng khách, nạp tiền; ledger (thu, hoàn, nạp) kèm operation ID; đã thu / đã hoàn / thu ròng |
| 🧪 Ma trận | Kiểm thử | Nút Chạy cho H0, F1–F6; đơn gần nhất; oracle ĐẠT x/y; fault đang bật; saga chưa xong; resume |

**Lệnh điều khiển lab:**

| Lệnh | Việc |
| --- | --- |
| `npm run lab -- status` | PID, trạng thái từng process |
| `npm run lab -- kill payment` / `npm run lab -- start payment` | Kill / start **process thật** (order, inventory, payment, ui) |
| `npm run lab -- restart order` | Kill rồi start |
| `npm run lab -- fault payment charge.afterCommit freeze` | Bật fault hook (danh sách trong `/docs`, nhóm Lab) |
| `npm run lab -- fault list` / `npm run lab -- fault clear` | Xem / gỡ fault |
| `npm run lab -- resume S6` | Resume saga theo saga_id |
| `npm run lab -- snapshot O5 nhan` | Snapshot 3 kho của một đơn → `evidence/snapshots/` (service chết thì đọc file DB, có ghi nguồn) |
| `npm run lab -- wait-marker payment.charge.committed` | Chờ marker điểm dừng |
| `npm run lab -- logs order 30` | 30 dòng log cuối |
| `npm run baseline` | Checkout không có Saga để thấy vấn đề (orphan reservation, orphan charge) |
| `npm run demo -- f4` | Chạy một kịch bản tự động trên lab đang mở (kill/start thật) |

Các bước demo từng kịch bản: [docs/HUONG-DAN-DEMO.md](docs/HUONG-DAN-DEMO.md).

## 6. Kiểm tra và tái tạo evidence

| Lệnh | Kết quả mong đợi |
| --- | --- |
| `npm test` | **30 passed** (khoảng 15 giây). Test tự dựng 3 process trên cổng 4001–4003 với thư mục tạm, không đụng lab đang chạy |
| `npm run test:report` | Như trên, ghi `evidence/test-output.txt` và `evidence/test-results.json` |
| `npm run evidence` | Reset lab, chạy H0, F1–F6 (F4, F6 kill/start process thật), ghi `evidence/SUMMARY.md` (7 dòng ĐẠT) và `evidence/<ID>/timeline.txt` |
| `npm run baseline` | Ghi `evidence/baseline.txt` |
| `npm run report` | Build lại `REPORT.html` từ `presentation/slides.html` + `report/` |

| Bộ test | Số test | Nội dung |
| --- | --- | --- |
| `test/unit/machine.test.js` | 16 | State machine, guard, unknown outcome |
| `test/unit/openapi.test.js` | 2 | Route trong code khớp `docs/openapi.yaml` |
| `test/integration/idempotency.test.js` | 5 | Gửi lại cùng op, khác payload, refund một lần |
| `test/integration/saga.v1.test.js` | 4 | **H0, F1, F2, F3**: assert Order, Inventory, Payment và toàn bộ ledger |
| `test/integration/recovery.test.js` | 3 | **F4, F5, F6** tự động, kill process thật |

## 7. API

Đặc tả đầy đủ: [docs/openapi.yaml](docs/openapi.yaml) (OpenAPI 3.1), xem và thử tại http://127.0.0.1:3000/docs. Tên route giữ đúng contract trong slide của thầy.

| Service | Route chính |
| --- | --- |
| Order | `POST /orders`, `GET /orders`, `GET /orders/:id`, `GET /orders/:id/saga`, `GET /sagas`, `POST /sagas/:saga_id/resume` |
| Inventory | `POST /inventory/reservations`, `POST /inventory/reservations/:id/release`, `GET /inventory/operations/:op_id`, `GET /inventory/items[/:sku]`, `POST /inventory/items/:sku/restock`, `GET /inventory/reservations`, `GET /inventory/movements` |
| Payment | `POST /payments/charges`, `POST /payments/charges/:id/refund`, `GET /payments/operations/:op_id`, `GET /payments/ledger`, `GET /payments/wallets[/:id]`, `POST /payments/wallets/:id/topup` |
| Cả ba | `GET /health`; khi `LAB_FAULTS=1`: `GET/POST/DELETE /__lab/faults`, `POST /__lab/reset` |

- Mọi thao tác ghi đều idempotent theo operation ID: gửi lại cùng op với cùng nội dung thì nhận lại kết quả cũ; cùng op mà khác nội dung thì `409 OP_PAYLOAD_MISMATCH`.
- Trạng thái operation: `SUCCEEDED | FAILED | PENDING`, hoặc `404 NOT_FOUND`. `FAILED` nghĩa là không bao giờ commit về sau. Timeout hay 5xx **không** phải FAILED.

## 8. Kiến trúc tóm tắt

```
Checkout:  CreateOrder → ReserveInventory → ChargePayment → ConfirmOrder
Bù:        RefundPayment → ReleaseInventory → CancelOrder      (refund trước, release sau)
Mỗi bước:  (1) ghi INTENT {step, op_id} vào Order DB → (2) gọi HTTP (timeout 2s) → (3) ghi OUTCOME
Trạng thái: PENDING, RESERVED, CHARGED, CONFIRMED | RECOVERING, COMPENSATING | CANCELLED
```

Chi tiết: [docs/NGUYEN-LY.md](docs/NGUYEN-LY.md). Lý do của từng lựa chọn: [REPORT.md](REPORT.md).

## 9. Cấu trúc thư mục

```
config.js                 cấu hình duy nhất (cổng, thư mục, timeout, backoff)
common/                   db, http, ops (idempotency), faults, log + marker, app (Express + CORS + /health + /__lab),
                          procs (start/kill process), snapshot, oracle (dùng chung UI, test, demo)
services/order/           server.js, machine.js (state machine + guard), orchestrator.js (Saga + phục hồi)
services/inventory/       server.js
services/payment/         server.js
ui/                       Web UI (HTML/CSS/JS thuần)
scripts/                  lab.js, ui-server.js, scenarios.js, demo.js, baseline.js, test-report.js, build-report.js
test/                     unit/ (machine, openapi), integration/ (idempotency, saga.v1, recovery), global-setup
data/seed/                dữ liệu ban đầu (JSON)            data/*.db  DB lúc chạy (không nộp)
docs/                     NGUYEN-LY.md, HUONG-DAN-DEMO.md, THUYET-TRINH.md, KICH-BAN-VIDEO.md, openapi.yaml
presentation/             slides.html + img/ (ảnh chụp UI)
report/                   extra-slides.html, notes.json (nguồn của REPORT.html)
evidence/                 test-output.txt, SUMMARY.md, H0..F6/timeline.txt + result.json, baseline.txt
REPORT.md, REPORT.html, AUDIT.md, SUBMISSION.md
```

## 10. Khắc phục lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `npm ci` lỗi khi build `better-sqlite3` | Kiểm tra Node ≥ 22 (`node -v`). Trên Windows nếu không tải được bản build sẵn, cài "Desktop development with C++" (Visual Studio Build Tools) rồi chạy lại |
| Một service `CHƯA LÊN` | Xem `npm run lab -- logs <service> 30`. Nếu cổng bị chiếm: `npm run stop`; trên Windows dùng `netstat -ano \| findstr :3001` rồi `taskkill /F /PID <pid>` |
| `EBUSY` khi reset | Windows nhả khóa file chậm sau khi kill; `reset` đã tự thử lại. Nếu vẫn lỗi, chạy lại `npm run reset` |
| Đơn kẹt ở COMPENSATING / RECOVERING | Đó là trạng thái chờ đúng thiết kế: kiểm tra `npm run lab -- fault list` và `npm run lab -- status`, gỡ fault hoặc start service đang chết |
| Bấm Chạy F4/F6 mà chưa kill | Process đóng băng 10 phút (`FREEZE_MS`) rồi tự chạy tiếp; kill/start như bình thường |
| UI không cập nhật | Ctrl+F5; thanh trên cùng phải có 3 chấm xanh |
| `npm test` báo cổng 400x bận | Lần test trước bị ngắt giữa chừng: chạy lại `npm test` (global-setup tự dọn process cũ) |
