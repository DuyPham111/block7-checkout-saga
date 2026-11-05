# AUDIT — Đối chiếu yêu cầu ↔ hiện thực ↔ bằng chứng

Nguồn yêu cầu: slide "Giao dịch phân tán và Saga", phần E (slide 25–31), yêu cầu nộp bài của thầy, và góp ý của thầy về giao diện. Ký hiệu: ✅ đã đáp ứng · 🟡 nhóm cần tự làm thêm.

## 1. Kiến trúc bài thực hành (slide 25)

| Yêu cầu | Hiện thực | Bằng chứng |
| --- | --- | --- |
| ✅ Ba service HTTP, ba process, ba DB riêng | `services/order`, `services/inventory`, `services/payment`; mỗi service mở đúng một file `data/<svc>.db` | `npm run lab -- status` (4 PID khác nhau); test tích hợp dựng 3 process |
| ✅ Schema, seed, handler; orchestrator và Saga record trong Order | Schema trong từng `server.js`; seed `data/seed/*.json`; `services/order/orchestrator.js`, bảng `sagas`, `saga_steps` | `GET /orders/:id/saga` |
| ✅ Scripts start/stop/reset/resume, fault hooks, script kill process thật | `scripts/lab.js` (start, stop, kill, restart, reset, resume, fault, snapshot, wait-marker); `/__lab/faults` | `evidence/F4`, `F6`: dòng KILL/START kèm PID |
| ✅ Web UI: đơn hàng, lịch sử kho, lịch sử thanh toán, trạng thái từng service | `ui/` (4 tab), thanh trạng thái service có PID | `presentation/img/*.jpg` |
| ✅ Automated tests H0, F1–F3; demo F4–F6 trên UI | `test/integration/saga.v1.test.js`; tab Ma trận + `docs/HUONG-DAN-DEMO.md` | `evidence/test-output.txt` |
| ✅ Chỉ bind loopback; không broker, đăng nhập mới hay cổng thanh toán thật | `HOST = '127.0.0.1'` trong `config.js`; Payment là ví giả lập | `config.js` |

## 2. Contract API (slide 27)

| Contract | Route của nhóm | Ghi chú |
| --- | --- | --- |
| ✅ `POST /orders`, `GET /orders/:order_id` trả `order_id`, `saga_id`; retry tạo đơn dùng cùng create op ID | `POST /orders` → `202 {order_id, saga_id}`; `create_op_id` gửi lại thì trả đơn cũ | `services/order/server.js` |
| ✅ `POST /inventory/reservations` (`order_id`, item, quantity, `reserve_op_id`) trả reservation ID hoặc từ chối dứt khoát | Như contract (item = `sku`); 409 `REJECTED` | idempotency test |
| ✅ `POST /inventory/reservations/:id/release` (`release_op_id` ổn định, replay không tác động lần hai) | Như contract | F2, F3 |
| ✅ `POST /payments/charges` (`order_id`, amount, `charge_op_id`) trả charge ID hoặc thất bại dứt khoát | Như contract (+ `customer_id` vì Payment là ví); 402 FAILED | F2, idempotency test |
| ✅ `POST /payments/charges/:id/refund` (`refund_op_id`, tham chiếu charge gốc; ledger giữ cả hai) | Như contract; `one_refund_per_charge` | F3, F5 |
| ✅ `GET /inventory/operations/:op_id`, `GET /payments/operations/:op_id` | Như contract: `SUCCEEDED/FAILED/PENDING`, 404 NOT_FOUND | F4 |
| ✅ Confirm, cancel là handler local trong Order DB, có op ID riêng | `doConfirm`, `doCancel` với `S…:confirm`, `S…:cancel` | `saga_steps` |
| ✅ Resume theo `saga_id`: đọc durable record, không tạo checkout mới, không đổi op ID | `POST /sagas/:saga_id/resume`; resume tự động khi khởi động | F6 (bước RESUME) |
| ✅ `GET /orders`, `GET /orders/:order_id/saga` cho UI | Như contract | UI |
| ✅ `GET /inventory/items`, `GET /inventory/movements` | Như contract | Tab Kho |
| ✅ `GET /payments/ledger` | Như contract (+ `total_charged`, `total_refunded`, `net_collected`) | Tab Ví |
| ✅ `GET /health` ở mỗi service | Có, kèm `pid`, `started_at` | Thanh trạng thái UI |
| ✅ Ngữ nghĩa operation status; 5xx/mất kết nối không tương đương FAILED | `handleChargeResult`, `doRecover` | `machine.test.js` (unknown outcome) |

Không đổi tên route nào nên không cần bảng ánh xạ. Đặc tả đầy đủ: `docs/openapi.yaml`, http://127.0.0.1:3000/docs.

## 3. Ba phiên bản V1–V3 (slide 28)

| Yêu cầu | Hiện thực | Bằng chứng |
| --- | --- | --- |
| ✅ V1.1 State machine và điều kiện kết thúc | `machine.js`: 7 trạng thái, guard, `TERMINAL` | 16 unit test |
| ✅ V1.2 Bù cho thất bại dứt khoát; sau charge thì refund trước, release sau | pending `['refund','release']`; guard thứ tự | F3: `seq(refund) < seq(release)` |
| ✅ V1.3 H0 và ba automated test F1, F2, F3 | `saga.v1.test.js` | `evidence/test-output.txt` |
| ✅ V1.4 Assert cả ba kho, kể cả "không có charge, refund ngoài dự kiến" | `stores()` lấy Order + saga, Inventory, toàn bộ ledger | `expect(s.ledgerAll).toHaveLength(...)` |
| ✅ V1.5 UI hiện đúng lịch sử đơn, kho, thanh toán của H0, F1–F3 | Tab Mua hàng / Kho / Ví | ảnh `04-history.jpg`, `05-detail-f3.jpg` |
| ✅ V2.1 Script dừng Payment sau khi charge commit, trước response | Fault `charge.afterCommit=freeze` + marker + `lab kill payment` | `evidence/F4/timeline.txt` |
| ✅ V2.2 Order giữ RECOVERING, không báo CANCELLED hay CONFIRMED | `CHARGE_UNKNOWN` → RECOVERING; guard | snapshot `khi-payment-dung` |
| ✅ V2.3 Payment trở lại: query cùng charge ID, thấy CHARGED thì confirm | `doRecover()` | F4: "biết qua query op …: SUCCEEDED" |
| ✅ V2.4 Không charge mới để vượt qua timeout | op ID suy từ saga; `ledger.op_id UNIQUE` | oracle F4 "Chỉ 1 charge op ID" |
| ✅ V2.5 UI hiện Payment không truy cập được, đơn RECOVERING, rồi tự chuyển CONFIRMED | Thanh trạng thái + polling 1 giây | ảnh `10`, `11`, `12-f4-*.jpg` |
| ✅ V3.1 Kill orchestrator tại khoảng hở intent, call, result; restart cùng DB | Fault `orchestrator.afterChargeCall=freeze` + `lab kill order` + `lab start order` | `evidence/F6/timeline.txt` |
| ✅ V3.2 Refund lỗi tạm thời: COMPENSATING và pending work được lưu | Fault `refund=error503`; `pending_json`, `last_error` | snapshot `khi-refund-loi` |
| ✅ V3.3 Phục hồi: refund rồi release đúng một lần | cùng `refund_op_id`; `one_refund_per_charge` | oracle F5 |
| ✅ V3.4 Evidence trước dừng, sau khởi động, sau hội tụ | Snapshot giữa chừng + cuối, PID cũ/mới, thời gian hội tụ | `evidence/SUMMARY.md` |
| ✅ V3.5 UI hiện COMPENSATING và bước bù đang chờ, rồi lịch sử hoàn tiền, nhả hàng | Chi tiết đơn: pending, lỗi gần nhất; tab Ví/Kho | tab Ma trận, nút "Gỡ lỗi refund" |
| ✅ Demo F4–F6 bắt buộc; tự động hóa thêm không thay ba automated test V1 | Demo trên UI + `npm run demo`; thêm `recovery.test.js` | — |

## 4. Ma trận failure oracle (slide 29)

| ID | Oracle của đề | Kiểm ở | Kết quả |
| --- | --- | --- | --- |
| ✅ H0 | CONFIRMED; 1 reservation active; đúng 1 charge, không refund; không pending | `saga.v1` + `oracle.js` | 6/6 |
| ✅ F1 | CANCELLED; không reservation; không charge; không gọi charge sau reject | `saga.v1` (op charge 404) | 5/5 |
| ✅ F2 | CANCELLED; reservation release có bằng chứng; không charge thành công, không refund | `saga.v1` (movements RESERVE → RELEASE) | 5/5 |
| ✅ F3 | CANCELLED; refund đúng 1 lần; released; trace refund trước release | `saga.v1` (seq) | 7/7 |
| ✅ F4 | Khi Payment dừng: RECOVERING; restore → query cùng C → confirm; cuối như H0 | `recovery.test.js`, demo | 8/8 |
| ✅ F5 | Khi fault còn: COMPENSATING, pending refund + release; restore, resume → refund 1 lần rồi release | `recovery.test.js`, demo | 8/8 |
| ✅ F6 | Restart cùng DB, query/replay ID cũ; cuối như H0; không nhân đôi, không mất việc | `recovery.test.js`, demo | 9/9 |
| ✅ Reset fixture mỗi tình huống; giữ saga_id và operation ID | `beforeEach → /__lab/reset`; op ID suy từ saga | — |

## 5. Chấm snapshot (slide 30): tám snapshot

| # | Snapshot | Đúng / sai | Thiết kế bảo đảm |
| --- | --- | --- | --- |
| 1 | F3 kết thúc: CANCELLED, released, C1 chưa refund | Sai | Guard: cancel chỉ khi pending rỗng |
| 2 | F4 khi Payment dừng: CANCELLED | Sai | RECOVERING không có đường tới CANCELLED |
| 3 | F4 khi Payment dừng: RECOVERING, R1 active, C1 CHARGED | Đúng | Đây chính là snapshot của nhóm (`evidence/F4`) |
| 4 | F2 kết thúc: CANCELLED, released, C1 FAILED | Đúng | Khớp `evidence/F2` |
| 5 | F6 sau restart: CONFIRMED với C1 + C2 | Sai | Op ID suy từ saga + UNIQUE: không thể có C2 |
| 6 | F3 kết thúc: ledger trống | Sai | Ledger chỉ INSERT, không có route xóa |
| 7 | F5 khi refund còn lỗi: COMPENSATING, R1 active, pending refund + release | Đúng | Khớp snapshot `khi-refund-loi` của nhóm |
| 8 | F3 kết thúc: CANCELLED, released, C1 + RF1 | Đúng | Khớp `evidence/F3` |

## 6. Rubric và bài nộp (slide 31)

| Tiêu chí | Bài nộp cần có | Nơi có |
| --- | --- | --- |
| ✅ Boundary và giao thức | State machine có guard, bảng bước tiến/bù; local ACID, prepared, in-doubt, giới hạn 3PC | slide 4, 7, 8; REPORT.md §4.2, §6, §11; `docs/NGUYEN-LY.md` §3 |
| ✅ State và restart | Toàn bộ repo, scripts start/stop/reset/resume, hướng dẫn chạy lại | README.md; `scripts/lab.js` |
| ✅ Compensation và terminal | Kết quả H0, F1–F3 với snapshot ba kho | `evidence/H0..F3/timeline.txt` |
| ✅ Unknown outcome | Cấu hình timeout, resume, retry; thời gian phục hồi quan sát được | `config.js`, README §3; `evidence/SUMMARY.md` |
| 🟡 Web UI | **Video** demo H0, F1–F6 trên UI; ảnh UI lúc pending và lúc kết thúc | Ảnh: `presentation/img/`. Video: nhóm quay theo `docs/HUONG-DAN-DEMO.md` §5 |
| ✅ Evidence | Trace F4–F6: marker, op ID trước/sau restart, lệnh phục hồi; nhóm giải thích diff agent tạo | `evidence/F4..F6/timeline.txt`; REPORT.md |
| ✅ Trình bày năm phần | Vấn đề, thiết kế, demo, bằng chứng, đánh đổi | `presentation/slides.html`, `docs/THUYET-TRINH.md` |

## 7. Yêu cầu nộp bài và góp ý của thầy

| Yêu cầu | Nơi có |
| --- | --- |
| ✅ Mã nguồn | Repository + gói ZIP (SUBMISSION.md) |
| ✅ Data | `data/seed/inventory.json`, `data/seed/payment.json` |
| ✅ README.md hướng dẫn triển khai | `README.md` |
| ✅ REPORT.md giải thích các lựa chọn (chọn gì vì sao, không chọn gì vì sao) | `REPORT.md` §4 (20 hạng mục), §5 bảng tóm tắt |
| ✅ REPORT.html | `REPORT.html`: 18 slide thuyết trình + 19 slide giải thích lựa chọn, chế độ Đọc tài liệu |
| ✅ Ví dụ của thầy: stack, documentation (Swagger), logging (ELK) | REPORT.md §4.1 (stack), §4.17 (OpenAPI + Swagger UI), §4.18 (logging, so với ELK/Loki) |
| ✅ Giao diện lịch sử đơn hàng | Tab Mua hàng: lịch sử, lọc theo trạng thái, chi tiết đơn |
| ✅ Xem kho, hàng ra hàng vào | Tab Kho: lịch sử vào/ra (nhập, giữ, nhả), nhập hàng |
| ✅ Xem danh sách giao dịch | Tab Ví: ledger thu/hoàn/nạp |
| ✅ Thành một app thật, góc khách / thủ kho / ví | 4 tab, chọn khách, số dư ví thật |
| ✅ Nhiều tình huống thành công và không thành công ("mua thất bại nhưng tiền vẫn còn") | F1 hết hàng, F2 ví không đủ, F3/F5 hoàn tiền; cột "Tiền của khách" và ô "Mua thất bại nhưng tiền vẫn còn" |
