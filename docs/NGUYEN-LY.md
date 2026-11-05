# Nguyên lý hoạt động và lý do lựa chọn

> Đọc file này để hiểu **hệ thống chạy thế nào** và **vì sao nhóm chọn như vậy**. Mỗi mục có tên file code tương ứng để em mở ra đối chiếu. Cuối file có phần hỏi đáp: những câu thầy dễ hỏi và cách trả lời.

---

## 1. Bài toán trong một đoạn

Khách đặt mua một sản phẩm. Muốn hoàn tất đơn phải đi qua ba service, mỗi service có database riêng:

```
Create Order (Order DB) → Reserve Inventory (Inventory DB) → Charge Payment (Payment DB) → Confirm Order (Order DB)
```

Mỗi bước **commit ngay** trong DB của nó. Nếu bước 4 lỗi, `ROLLBACK` trong Order DB không xóa được reservation đã commit ở Inventory, càng không trả lại được tiền đã trừ ở Payment. Kết quả: khách **mất tiền mà không có hàng**. Lệnh `npm run baseline` tái hiện đúng tình huống này (xem `evidence/baseline.txt`).

**Giải pháp của nhóm:** Saga theo kiểu **orchestration**.
- Một orchestrator trong Order chạy từng bước.
- Ghi **Saga record** bền vững vào Order DB **trước và sau** mỗi lời gọi.
- Khi một bước sau thất bại thì chạy **bước bù** (refund, release, cancel) theo thứ tự ngược.
- Khi không biết kết quả (timeout, service chết) thì **không đoán**: hỏi lại bằng đúng operation ID cũ.

---

## 2. Kiến trúc

```
                 ┌──────────────────────── Web UI (process 4, cổng 3000) ────────────────────────┐
                 │  Mua hàng · Kho · Ví tiền · Ma trận kịch bản      (trình duyệt gọi thẳng API)  │
                 └───────────────┬───────────────────────┬───────────────────────┬───────────────┘
                                 │ HTTP                  │ HTTP                  │ HTTP
 ┌───────────── process 1 ───────▼──────┐   ┌── process 2 ▼─────────┐   ┌── process 3 ▼──────────┐
 │ ORDER SERVICE (3001)                 │   │ INVENTORY (3002)      │   │ PAYMENT – ví (3003)    │
 │  orchestrator + recovery loop ───────┼──►│  reserve / release    │   │  charge / refund       │
 │                               ───────┼───┼───────────────────────┼──►│  operations query      │
 │  data/order.db                       │   │  data/inventory.db    │   │  data/payment.db       │
 │   orders, sagas, saga_steps          │   │   items, reservations │   │   wallets, ledger      │
 │                                      │   │   movements, ops      │   │   operations           │
 └──────────────────────────────────────┘   └───────────────────────┘   └────────────────────────┘
```

| Thành phần | Sở hữu dữ liệu gì | File |
| --- | --- | --- |
| Order | Đơn hàng, **Saga record** (phase, intent, pending, kết quả đã biết), nhật ký từng bước | `services/order/*` |
| Inventory | Sản phẩm, tồn kho, reservation (giữ hàng theo đơn), lịch sử vào/ra kho | `services/inventory/server.js` |
| Payment | Ví (số dư), **ledger** chỉ thêm dòng: charge, refund, nạp tiền | `services/payment/server.js` |
| UI | Không có dữ liệu. Chỉ gọi API của 3 service | `ui/*`, `scripts/ui-server.js` |

**Quy tắc ranh giới:** không service nào đọc hay ghi DB của service khác. Dữ liệu chỉ đi qua HTTP. Vì vậy không thể có một transaction bao cả ba DB.

---

## 3. Lý thuyết nền

### 3.1 Local ACID

Một transaction trong **một** DB: hoặc lưu hết, hoặc không lưu gì. Hệ thống dùng nó **ở mọi nơi có thể**:

| Nơi | Những gì được ghi trong cùng một transaction |
| --- | --- |
| Order | Trạng thái đơn + Saga record + một dòng `saga_steps` (`persist()` trong `orchestrator.js`) |
| Inventory | Trừ tồn + tạo reservation + ghi movement + ghi operation |
| Payment | Trừ ví + thêm dòng ledger + ghi operation |

Local ACID đảm bảo **mỗi bước** không bao giờ bị ghi dở. Phối hợp **giữa** các bước là việc của Saga.

### 3.2 Vì sao không dùng 2PC / 3PC

- **2PC** cần mỗi participant có pha **prepare**: giữ tiền, chưa trừ hẳn, rồi chờ lệnh commit hay abort. Ví/cổng thanh toán thực tế chỉ có `charge`, `refund`, `query`, không có prepare.
- Participant đã vote YES rồi mất coordinator sẽ rơi vào trạng thái **in-doubt**. Nó không được tự abort, vì có thể bên khác đã commit. Nó phải chờ và **giữ khóa** hàng lẫn tiền: đó là **blocking**.
- **3PC** thêm pha PreCommit để bớt chờ, nhưng chỉ đúng khi mạng đồng bộ và node lỗi theo kiểu fail-stop. Khi mạng bị chia cắt, hai phía có thể quyết định ngược nhau. Lab chỉ yêu cầu hiểu giới hạn này, không cài đặt.

→ Nhóm chọn **Saga**: không tìm một commit chung nữa, mỗi bước commit riêng, lỗi thì **bù bằng nghiệp vụ**.

### 3.3 Saga, compensation và eventual consistency

| | Rollback (ACID) | Compensation (Saga) |
| --- | --- | --- |
| Bản chất | Hủy thay đổi **chưa commit** | Một thao tác **mới**, đã commit, làm ngược tác động nghiệp vụ |
| Lịch sử | Không để lại dấu vết | Giữ lịch sử: ledger có cả dòng charge `C3` **và** dòng refund `RF1 → C3` |
| Có thể lỗi? | DB đảm bảo | Có (F5), nên phải lưu "việc còn nợ" (pending) và thử lại |

Trong lúc Saga chạy, hệ thống **tạm thời lệch**: hàng đã giữ mà tiền chưa trừ. Saga đảm bảo **cuối cùng** đạt một trong hai trạng thái hợp lệ về nghiệp vụ:

- **CONFIRMED** = đúng 1 reservation ACTIVE + đúng 1 charge CHARGED, không refund.
- **CANCELLED** = reservation đã RELEASED (hoặc chưa từng có) + không bị trừ tiền **hoặc** đã refund đủ. Tức là khách không mất tiền.

### 3.4 Orchestration hay choreography

Lab chọn **orchestration**: một orchestrator quyết định mọi bước tiếp theo và ghi tiến trình vào Saga record.

Lý do:
- Đọc một bảng `sagas` là biết đơn đang ở đâu, còn nợ việc gì.
- Test chỉ cần chờ trạng thái terminal rồi assert.
- Không cần broker; broker và outbox là nội dung của block sau.

Choreography (các service phát và nghe sự kiện của nhau) khó quan sát khi có nhiều nhánh lỗi.

---

## 4. Nguyên lý hoạt động chi tiết

### 4.1 Đường thành công (H0), từng lần ghi DB

| # | Ai làm | Ghi gì, ở đâu (mỗi dòng là một local transaction) |
| --- | --- | --- |
| 1 | Order `POST /orders` | Order DB: đơn `O1` **PENDING** + saga `S1` + bước CREATE. Trả `202 {order_id, saga_id}` ngay |
| 2 | Orchestrator | Order DB: **INTENT** reserve, op `S1:reserve` |
| 3 | Inventory | Inventory DB: tồn 10→9, reservation `R1` ACTIVE, movement, operation `S1:reserve` SUCCEEDED |
| 4 | Orchestrator | Order DB: **OUTCOME** → **RESERVED**, lưu `reservation_id=R1`, xóa intent |
| 5 | Orchestrator | Order DB: **INTENT** charge, op `S1:charge` |
| 6 | Payment | Payment DB: ví −350.000đ, ledger `C1` CHARGED, operation `S1:charge` SUCCEEDED |
| 7 | Orchestrator | Order DB: **OUTCOME** → **CHARGED**, lưu `charge_id=C1` |
| 8 | Orchestrator | Order DB: confirm (local) → **CONFIRMED** |

Xem trực tiếp trên UI: **Mua hàng → Chi tiết** đơn → mục "Các bước Saga".

### 4.2 Mẫu intent → call → outcome (cốt lõi của phục hồi)

```
(1) INTENT : tx ghi {step, op_id} vào Order DB          ← việc SẮP làm, với ID cố định
(2) CALL   : HTTP sang Inventory/Payment (timeout 2s)    ← service kia commit trong DB của nó
(3) OUTCOME: tx ghi kết quả + trạng thái mới, xóa intent ← việc ĐÃ BIẾT
```

Process Order có thể chết ở bất kỳ khoảng hở nào. Khi chạy lại, nó chỉ đọc DB:

| Chết ở | Order DB còn | Thực tế ở Payment | Khi restart làm gì | Kết quả |
| --- | --- | --- | --- | --- |
| Sau (1), trước (2) | intent charge `S5:charge` | chưa có gì | Gửi lại charge với **cùng** `S5:charge` | Thu lần đầu, đúng 1 charge |
| Giữa (2) | intent `S5:charge` | có thể đã có, có thể chưa | Gửi lại cùng op. Nếu đã có thì Payment trả kết quả cũ | Đúng 1 charge |
| Sau (2), trước (3) (**F6**) | intent `S5:charge`, chưa có outcome | `C6` CHARGED | Gửi lại / query cùng op, thấy CHARGED | Đúng 1 charge, CONFIRMED |

Thiết kế **sai** mà slide 20 cảnh báo: chỉ lưu status (`RESERVED`), không lưu intent. Khi restart, orchestrator không biết đã gọi charge chưa. Nếu sinh ID mới `C2` thì khách bị thu 2 lần. Nếu đoán "chưa charge" rồi hủy thì tiền đã thu không ai trả. Mã nguồn: `writeIntent()`, `commit()`, `persist()` trong `services/order/orchestrator.js`.

### 4.3 Operation ID và idempotency

- **Sinh ID:** `opId(saga_id, step)`, ví dụ `S5:charge`, `S5:refund` (file `services/order/machine.js`). ID **suy ra từ saga**, nên mọi lần retry hay restart đều ra đúng ID cũ, không có cách nào "vô tình" sinh ID mới.
- **Phía service** (`common/ops.js`): bảng `operations(op_id PRIMARY KEY, kind, request_hash, status, result_json)` được ghi **trong cùng transaction** với thay đổi nghiệp vụ.
  - Gặp op đã có, cùng nội dung → trả lại **kết quả cũ**, có `replayed: true`. Không tạo tác động thứ hai.
  - Gặp op đã có, nội dung khác → `409 OP_PAYLOAD_MISMATCH` (lỗi của bên gọi, phải báo ra chứ không lặng lẽ bỏ qua).
- **Chốt chặn ở DB:** `ledger.op_id UNIQUE`, `reservations.reserve_op_id UNIQUE`, và index `one_refund_per_charge` (mỗi charge chỉ refund được một lần). Kể cả code có bug, DB vẫn chặn được tác động trùng.
- `GET /payments/operations/:op_id` trả kết quả **bền vững** của đúng operation đó: `SUCCEEDED | FAILED`, hoặc `404 NOT_FOUND`.

### 4.4 State machine và guard

File `services/order/machine.js` là một **hàm thuần** `apply(saga, event)`: không đụng DB, không gọi mạng, nên unit test được trực tiếp.

```
PENDING ──reserve OK──► RESERVED ──charge OK──► CHARGED ──confirm OK──► CONFIRMED
   │                       │  │                      │
   │ reserve bị từ chối    │  │ charge không rõ      │ confirm bị từ chối
   ▼                       │  ▼                      ▼
CANCELLED ◄──bù xong── COMPENSATING ◄──biết FAILED── RECOVERING ──biết CHARGED──► CHARGED
                 ▲  │ (bù lỗi tạm: giữ nguyên, thử lại)  │ (chưa rõ: giữ nguyên, hỏi lại)
                 └──┘                                     └──► RECOVERING
   RESERVED ──charge FAILED──► COMPENSATING [release]
   CHARGED  ──confirm bị từ chối──► COMPENSATING [refund, release]
```

**Guard** (ném `GuardError` nếu sự kiện đến khi thiếu bằng chứng):

| Guard | Chặn lỗi nào (slide 30) |
| --- | --- |
| Chưa giữ hàng thì không charge | F1: không được gọi charge sau khi reserve bị từ chối |
| Chỉ refund charge đã **biết** CHARGED | Refund mù |
| `pending[0]` phải là `release` thì mới release (refund trước) | Release trước refund |
| Cancel chỉ khi `pending` rỗng | CANCELLED trong khi C1 chưa refund (snapshot 1) |
| RECOVERING không có đường thẳng tới CANCELLED/CONFIRMED | Terminal giả khi Payment chết (snapshot 2) |
| Saga đã terminal thì không nhận sự kiện | Xử lý trùng |

`nextAction(saga)` suy ra việc tiếp theo **chỉ từ trạng thái đã lưu**, không từ RAM. Vì vậy sau restart vẫn biết phải làm gì.

### 4.5 Compensation

| Lỗi ở | Đã commit những gì | Bước bù (thứ tự ngược) |
| --- | --- | --- |
| Reserve bị từ chối (F1) | không có gì | (không cần) → **CANCELLED** |
| Charge FAILED (F2) | reservation | release → cancel |
| Confirm bị từ chối (F3) | reservation + charge | **refund → release** → cancel |

- `pending` (ví dụ `["refund","release"]`) được **lưu bền** trong Saga record. Bù xong bước nào thì lấy bước đó ra khỏi danh sách.
- **Refund = dòng ledger mới** `RF1` có `ref_charge_id = C3`, cộng tiền lại vào ví. Dòng charge `C3` giữ nguyên. Không có route nào xóa hay sửa ledger.
- **Bù lỗi tạm thời (F5):** Payment trả 503 thì saga **giữ COMPENSATING**, `pending` không đổi, ghi `last_error`, hẹn thử lại theo backoff. Khi Payment ổn lại, refund chạy **đúng một lần** (cùng op `S6:refund`) rồi mới release.

### 4.6 Kết quả chưa rõ (F4)

Orchestrator phân loại mọi response (`common/http.js` + `handleChargeResult()`):

| Nhận được | Ý nghĩa | Hành động |
| --- | --- | --- |
| `201` | Chắc chắn đã thu | CHARGED → confirm |
| `402 PAYMENT_FAILED` | Chắc chắn **không** thu (ví không đủ, bị từ chối) | COMPENSATING [release] |
| timeout, `ECONNRESET`, `ECONNREFUSED`, 5xx | **Không biết** | **RECOVERING**, giữ intent và op ID |

Ở RECOVERING (`doRecover()`):

1. `GET /payments/operations/S5:charge`
2. `SUCCEEDED` → ghi CHARGED → confirm. Đây là policy của lab: biết đã thu thì tiếp tục giao hàng.
3. `FAILED` → bù: release rồi cancel.
4. `404 NOT_FOUND` hoặc `PENDING` → chưa phải kết luận. **Gửi lại đúng op cũ, cùng payload.** Payment sẽ trả C cũ, hoặc thực hiện lần đầu, không bao giờ thành 2 charge.
5. Không truy cập được → vẫn RECOVERING, thử lại sau 1 → 2 → 4 → 5 giây.

**Không bao giờ:** coi timeout là thất bại (sẽ hủy đơn trong khi tiền đã thu), hoặc charge với ID mới (thu 2 lần).

### 4.7 Recovery loop và resume

- `start()` khi process Order khởi động: tìm saga chưa terminal, ghi bước **RESUME** kèm PID mới, rồi chạy tiếp. Đây là F6.
- `tick()` mỗi **1 giây**: chạy các saga chưa xong đã tới hạn thử lại (`next_attempt_at`).
- `POST /sagas/:saga_id/resume`: resume thủ công theo saga_id. Không tạo checkout mới, không đổi op ID.
- Chống chạy trùng: `Set running` trong RAM. Hệ thống chỉ có **một** process Order (xem phần giới hạn).

Thời gian hội tụ đo được (`evidence/SUMMARY.md`):

| Kịch bản | Thời gian hội tụ |
| --- | --- |
| F4 | 0,7–4 giây sau khi start lại Payment, tùy đang ở nấc backoff nào (tối đa khoảng 5 giây) |
| F5 | khoảng 1,3 giây sau khi gỡ lỗi |
| F6 | khoảng 0,5 giây sau khi start lại Order |

### 4.8 Fault hook và "dừng process thật"

| Fault (`point=mode`) | Ở service | Hiệu ứng | Dùng cho |
| --- | --- | --- | --- |
| *(tự nhiên)* Loa mini tồn 0 | Inventory | Reserve 409 `OUT_OF_STOCK` | F1 |
| *(tự nhiên)* Bình có 300k, mua bàn phím 900k | Payment | Charge 402 `INSUFFICIENT_FUNDS` | F2 |
| `reserve=reject`, `charge=fail` | Inventory / Payment | Từ chối dứt khoát (dự phòng khi dữ liệu đã đổi) | F1, F2 |
| `confirm=reject` | Order | Từ chối xác nhận **trước** khi commit CONFIRMED | F3, F5 |
| `charge.afterCommit=freeze` | Payment | Commit charge → ghi **marker** → **treo cả process** | F4 |
| `refund=error503` (tới khi gỡ) | Payment | 503, không commit gì | F5 |
| `orchestrator.afterChargeCall=freeze` | Order | Nhận CHARGED → marker → treo **trước khi ghi outcome** | F6 |

**Vì sao "treo" bằng `Atomics.wait`:** lệnh này chặn toàn bộ event loop, nên process giống hệt đang bị đóng băng: không trả lời bất kỳ request nào kể cả query. Script chờ **marker** (file `run/markers/*.json`) rồi **kill process thật** (`process.kill` = TerminateProcess trên Windows). Cách này thật hơn nhiều so với ném một exception giả. Marker kèm timestamp, PID và op ID chính là evidence mà slide yêu cầu.

Fault lưu trong **RAM**, nên restart process là mất fault. Đúng ý F4: Payment sống lại thì không còn treo nữa.

### 4.9 Web UI

- Bốn tab theo yêu cầu của thầy: **Mua hàng** (góc khách), **Kho** (góc thủ kho), **Ví tiền** (góc thanh toán), **Ma trận kịch bản**.
- Trình duyệt **gọi thẳng API** của từng service. Service nào chết thì đúng phần dữ liệu của service đó báo "không truy cập được", phần còn lại vẫn chạy. Thanh trên cùng hiện trạng thái và PID từng service.
- Tự tải lại mỗi 1 giây, nên trạng thái đổi là thấy ngay (RECOVERING → CONFIRMED, COMPENSATING → CANCELLED).
- UI **không tự tính trạng thái đơn**: trạng thái lấy từ Order, số dư lấy từ Payment, tồn kho lấy từ Inventory. Cột "Tiền của khách" chỉ ghép các dòng ledger của đơn đó để hiển thị.

### 4.10 Snapshot và oracle

- `common/snapshot.js` lấy 3 kho của một đơn qua API. Nếu service đang chết thì đọc thẳng file DB ở chế độ **read-only** và ghi rõ nguồn là `db-file`. Việc này **chỉ để làm evidence**; orchestrator và UI không bao giờ làm vậy.
- `common/oracle.js` mã hóa ma trận oracle của slide 29 thành các check. Một file dùng chung cho UI (tab Ma trận), test và `npm run evidence`.

---

## 5. Vì sao chọn công nghệ và phương pháp này

| Quyết định | Chọn | Lý do | Phương án bỏ qua |
| --- | --- | --- | --- |
| Ngôn ngữ | Node.js 22 + Express 5 | Nhóm đã dùng ở Block 5–6. `fetch` + `AbortSignal.timeout` có sẵn | Java/Spring: nặng hơn, tốn thời gian dựng |
| DB | **SQLite, mỗi service một file** (better-sqlite3) | 3 file là **3 DB độc lập thật**. Ghi xuống đĩa nên kill process không mất dữ liệu đã commit, và "restart cùng DB" chỉ là chạy lại process. Không cần Docker. `db.transaction()` tự rollback khi lỗi. Mỗi DB chỉ có một process ghi nên phù hợp SQLite | PostgreSQL + Docker: thật hơn về production nhưng thêm hạ tầng, không giúp gì cho phần chấm (Saga và phục hồi) |
| Độ bền | `journal_mode=WAL`, `synchronous=FULL` | Commit là đã fsync xuống đĩa. "Payment đã commit C4 rồi mới chết" là thật | `synchronous=OFF`: nhanh hơn nhưng có thể mất commit |
| Kiểu Saga | Orchestration trong Order | Dễ quan sát và test. Saga record nằm cùng DB với đơn nên đổi đơn và saga trong 1 transaction | Choreography: cần broker, khó theo dõi |
| Chạy Saga | Nền (POST trả 202), recovery loop 1 giây | Request của khách không treo khi Payment chết. Lần chạy đầu và lần phục hồi dùng **cùng code** | Đồng bộ trong request: client timeout, F4/F6 phải có code riêng |
| Op ID | Suy ra từ saga (`S5:charge`) và lưu trong intent | Ổn định qua mọi retry/restart. Không cần sinh hay lưu UUID | UUID mỗi lần gọi: rủi ro sinh ID mới sau restart |
| Dedupe | Bảng `operations` + UNIQUE ở DB | Hai lớp bảo vệ: code và ràng buộc DB | Chỉ kiểm tra trong code: race giữa request cũ và bản gửi lại |
| State machine | Hàm thuần + `GuardError` | Unit test được (16 test trong `machine.test.js`), guard tập trung một chỗ | Logic rải trong `if` của orchestrator |
| Payment = ví | Có số dư thật, ledger chỉ thêm dòng | Thể hiện đúng ý thầy: "mua thất bại nhưng tiền vẫn còn"; F2 xảy ra tự nhiên khi ví không đủ | Payment chỉ ghi CHARGED/FAILED: không thấy được tiền của khách |
| Lỗi tự nhiên + fault hook | F1, F2 tự nhiên; F3–F6 dùng hook | Demo giống app thật; hook chỉ dùng cho tình huống không tự xảy ra | Mọi thứ đều dùng hook: kém thuyết phục |
| Điểm dừng | Freeze + marker + kill process thật | Đúng yêu cầu "script kill, start process thật", đúng vị trí | `throw new Error()` giả: không chứng minh được dữ liệu bền |
| UI | HTML/JS thuần, process riêng, polling 1 giây | Không cần build step. UI không chết khi kill Order (F6) | React/Vite: thêm build, không thêm giá trị cho lab |
| Test | Jest gọi HTTP tới **process thật** trên cổng 400x | Chứng minh ranh giới process/DB. Không đụng dữ liệu demo | Supertest trong cùng process: không chứng minh 3 DB riêng |

---

## 6. Giới hạn (nói trước khi bị hỏi)

1. **Một orchestrator.** Chạy nhiều instance Order cần claim/lease cho từng saga (ví dụ `UPDATE … WHERE locked_until < now()`), kèm fencing.
2. **Chưa có broker/outbox.** Saga record bền **không** đảm bảo message hay tác động bên ngoài xảy ra đúng một lần. Đây là nội dung block sau.
3. **Payment là service giả lập.** Charge chạy trong một local transaction nên `PENDING` gần như không xuất hiện; code vẫn xử lý nhánh này (coi như chưa rõ, tiếp tục hỏi).
4. **Mất isolation.** Trong lúc Saga chạy, người khác có thể thấy hàng đang bị giữ. Nhóm dùng *semantic lock* (trạng thái PENDING / "Đang xử lý") để thể hiện điều đó.
5. **Refund thất bại vĩnh viễn** (thẻ đã đóng chẳng hạn) cần xử lý thủ công. Lab chỉ có lỗi tạm thời (F5).
6. **SQLite với một process ghi mỗi DB**: không chứng minh khả năng chịu tải hay concurrency; đó là phạm vi Block 6.

---

## 7. Bản đồ code

| File | Vai trò | Hàm quan trọng |
| --- | --- | --- |
| `services/order/machine.js` | State machine + guard | `apply`, `nextAction`, `opId` |
| `services/order/orchestrator.js` | Saga, intent/outcome, bù, phục hồi | `writeIntent`, `commit`, `persist`, `doCharge`, `doRecover`, `doRefund`, `start`, `tick` |
| `services/order/server.js` | API Order, tạo đơn + saga trong 1 tx | `POST /orders`, `GET /orders/:id/saga`, `POST /sagas/:id/resume` |
| `services/inventory/server.js` | Giữ/nhả hàng idempotent, lịch sử kho | reserve, release, restock |
| `services/payment/server.js` | Ví, ledger, charge/refund idempotent, điểm dừng F4 | charge, refund, operations |
| `common/ops.js` | Idempotency | `findReplay`, `recordOp`, `getOp` |
| `common/http.js` | Gọi HTTP có timeout, không ném lỗi | `call` |
| `common/log.js` | Log JSON, marker, freeze | `marker`, `freeze` |
| `common/oracle.js` | Oracle H0, F1–F6 | `check` |
| `scripts/lab.js` | Điều khiển process và fault | start, kill, fault, snapshot |
| `scripts/scenarios.js` | Kịch bản dùng chung cho test và demo | `SCENARIOS.F4` … |

---

## 8. Hỏi đáp chuẩn bị

**Vì sao không dùng một transaction bao cả 3 DB?**
Không tồn tại. Mỗi service sở hữu DB riêng và chỉ nói chuyện qua HTTP; transaction chỉ bao được DB mà nó đang mở.

**Vì sao không dùng 2PC?**
Payment (ví hoặc cổng thanh toán) không có pha prepare. Hơn nữa, participant đã prepared mà mất coordinator thì phải giữ khóa và chờ (blocking).

**Participant đã vote YES trong 2PC có được tự abort khi hết timeout không?**
Không. Coordinator có thể đã ghi COMMIT và bên khác đã commit. Participant phải chờ quyết định; đó là in-doubt và blocking.

**3PC có an toàn với mọi network partition không?**
Không. Nó dựa trên giả định timeout chứng minh được node kia đã chết. Khi mạng bị chia cắt, một phía có thể commit trong khi phía kia abort.

**Compensation khác rollback ở đâu?**
Rollback hủy thay đổi chưa commit. Compensation là thao tác mới đã commit. Refund `RF1` là dòng mới trỏ về `C3`, dòng `C3` vẫn còn. Đã gửi thông báo "đã thu tiền" thì cũng không lấy lại được.

**Payment timeout thì làm gì? Có cấp charge ID mới không?**
Chuyển sang RECOVERING, query `S5:charge`. Chưa đủ bằng chứng thì gửi lại **cùng** `S5:charge`. Không bao giờ cấp ID mới.

**Query trả NOT_FOUND thì đã chắc là chưa thu chưa?**
Theo contract mặc định thì chưa. NOT_FOUND chỉ là "chưa thấy ở lần hỏi này". Nhóm gửi lại cùng op ID và cùng payload để có kết luận dứt khoát; Payment idempotent nên an toàn.

**Refund đã commit nhưng orchestrator chết trước khi ghi kết quả. Sau restart làm sao không refund hai lần?**
Saga record còn intent `refund S6:refund`. Khi restart, orchestrator gửi lại **cùng** `S6:refund`; Payment thấy op đã có nên trả lại `RF2` cũ. Thêm vào đó, index `one_refund_per_charge` chặn ở mức DB. Sau đó mới release rồi cancel.

**Snapshot F3: Order CANCELLED, Inventory released, nhưng charge chưa refund. Có đạt không?**
Không đạt. Guard không cho CANCEL khi `pending` còn `refund`; đơn phải ở COMPENSATING cho tới khi refund xong.

**Record chỉ có RESERVED, thiếu phase và intent. Có đủ để quyết định charge lại không?**
Không đủ. Tên trạng thái không chứng minh charge chưa diễn ra. Vì vậy nhóm lưu intent kèm op ID **trước** khi gọi.

**Làm sao chứng minh đã kill process thật?**
PID trước và sau khác nhau (thanh trạng thái trên UI, `npm run lab -- status`). Log có marker và dòng KILL. Bước RESUME trong Saga record ghi PID mới. Snapshot lúc service chết phải đọc từ `db-file`.

**UI có tự suy trạng thái không?**
Không. Trạng thái lấy từ Order API, tiền lấy từ Payment API, tồn kho lấy từ Inventory API. Service chết thì phần của nó báo không truy cập được.

**Vì sao chọn SQLite?**
Mỗi service một file là 3 DB độc lập thật, ghi bền xuống đĩa và restart cùng file dễ dàng. Không cần Docker. Lab chấm Saga, không chấm DB engine. Muốn lên PostgreSQL chỉ cần thay `common/db.js` và SQL; logic Saga không đổi.

**Nếu chạy 2 instance Order thì sao?**
Hai instance có thể cùng chạy một saga. Hiệu ứng nghiệp vụ vẫn không bị nhân đôi vì op ID idempotent, nhưng log sẽ rối. Muốn làm đúng cần claim saga bằng lease và fencing; nhóm ghi điều này trong phần giới hạn.
