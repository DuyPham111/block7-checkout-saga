# Block 7 — Checkout Saga (Saga Shop)

Ba service HTTP: **Order**, **Inventory** và **Payment (ví tiền)**. Mỗi service là **một process riêng** với **một file DB riêng**. Orchestrator chạy trong Order, có Saga record lưu bền, có compensation và tự phục hồi khi một process bị kill giữa chừng. Web UI xem được từ ba góc nhìn: khách mua hàng, thủ kho, ví tiền, cùng một tab ma trận kịch bản H0, F1–F6.

| Tài liệu | Nội dung |
| --- | --- |
| [docs/NGUYEN-LY.md](docs/NGUYEN-LY.md) | Nguyên lý hoạt động và lý do chọn từng công nghệ, phương pháp; có phần hỏi đáp chuẩn bị |
| [docs/HUONG-DAN-DEMO.md](docs/HUONG-DAN-DEMO.md) | Các bước demo từng tình huống, lệnh dự phòng, xử lý sự cố |
| [docs/THUYET-TRINH.md](docs/THUYET-TRINH.md) | Kịch bản thuyết trình hoàn chỉnh: lời dẫn, lệnh, slide tương ứng |
| [presentation/slides.html](presentation/slides.html) | Slide trình chiếu (mở bằng trình duyệt, bấm ← → để chuyển) |
| [evidence/](evidence/) | Kết quả test, timeline + snapshot 3 kho của H0, F1–F6, baseline |

## Chạy nhanh

Yêu cầu: Node.js ≥ 22 (đã thử với 22.16 trên Windows 11).

```bash
npm install
npm run reset          # xóa data, khởi động 4 process: inventory, payment, order, ui
```

Mở http://127.0.0.1:3000.

| Lệnh | Việc |
| --- | --- |
| `npm run lab -- status` | Xem PID và trạng thái từng process |
| `npm run lab -- kill payment` / `npm run lab -- start payment` | Kill / start process thật |
| `npm run lab -- fault payment charge.afterCommit freeze` | Bật fault hook |
| `npm run lab -- fault list` / `npm run lab -- fault clear` | Xem / gỡ fault |
| `npm run lab -- resume S4` | Resume saga theo saga_id |
| `npm run lab -- snapshot O5 cuoi` | Snapshot 3 kho của một đơn, lưu vào `evidence/snapshots/` |
| `npm run lab -- logs order 30` | 30 dòng log cuối của Order |
| `npm test` | 28 test: unit state machine, idempotency, H0 + F1–F3, F4–F6 tự động |
| `npm run test:report` | Chạy test và ghi `evidence/test-output.txt` |
| `npm run demo -- f4` | Chạy một kịch bản trên lab đang mở (kill/start thật), lưu evidence |
| `npm run evidence` | Reset rồi chạy H0, F1–F6, ghi `evidence/SUMMARY.md` |
| `npm run baseline` | Checkout "ngây thơ" không có Saga, để thấy vấn đề |
| `npm run stop` | Dừng tất cả |

## Cấu trúc

```
config.js                 cổng, timeout, poll, backoff (một chỗ duy nhất)
common/                   db (SQLite + transaction), http (timeout), ops (idempotency), faults, log + marker,
                          app (Express + CORS + /health + /__lab), procs (start/kill process), snapshot, oracle
services/order/           server.js (API), machine.js (state machine + guard), orchestrator.js (Saga + recovery)
services/inventory/       server.js — tồn kho, reservation, lịch sử vào/ra
services/payment/         server.js — ví, ledger charge/refund/nạp tiền
ui/                       Web UI (HTML/JS thuần), phục vụ bởi scripts/ui-server.js
scripts/                  lab.js, demo.js, scenarios.js, baseline.js, test-report.js
test/                     unit/machine, integration/idempotency, saga.v1 (H0,F1–F3), recovery (F4–F6)
```

| Process | Cổng | DB |
| --- | --- | --- |
| ui | 3000 | — |
| order (+ orchestrator) | 3001 | `data/order.db` |
| inventory | 3002 | `data/inventory.db` |
| payment | 3003 | `data/payment.db` |

Tất cả chỉ bind `127.0.0.1`. Test chạy trên cổng 4001–4003 với thư mục tạm riêng, nên không đụng dữ liệu đang demo.

## Contract API (giữ đúng tên route trong slide của thầy)

| Service | Route |
| --- | --- |
| Order | `POST /orders`, `GET /orders`, `GET /orders/:order_id`, `GET /orders/:order_id/saga`, `GET /sagas`, `POST /sagas/:saga_id/resume` |
| Inventory | `POST /inventory/reservations`, `POST /inventory/reservations/:id/release`, `GET /inventory/operations/:op_id`, `GET /inventory/items`, `GET /inventory/movements`, `GET /inventory/reservations`, `POST /inventory/items/:sku/restock` |
| Payment | `POST /payments/charges`, `POST /payments/charges/:id/refund`, `GET /payments/operations/:op_id`, `GET /payments/ledger`, `GET /payments/wallets`, `POST /payments/wallets/:id/topup` |
| Tất cả | `GET /health`; khi `LAB_FAULTS=1` (mặc định trong lab): `GET/POST/DELETE /__lab/faults`, `POST /__lab/reset` |

Trạng thái operation: `SUCCEEDED | FAILED | PENDING`, hoặc 404 `NOT_FOUND`. `FAILED` nghĩa là operation không bao giờ commit về sau. Timeout hay 5xx **không** được coi là `FAILED`.
