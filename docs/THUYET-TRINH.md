# Kịch bản thuyết trình — Block 7: Checkout Saga

> Kịch bản này đã khớp sẵn **slide, lệnh, thao tác trên app và lời nói**: đọc theo thứ tự là trình bày được, không cần thêm gì.
> - **Slide:** [`presentation/slides.html`](../presentation/slides.html). Khi lab đang chạy có thể mở ở http://127.0.0.1:3000/slides/. Mỗi đoạn ghi rõ số slide; gõ thẳng `…/slides/#7` để nhảy tới slide 7, hoặc bấm ← → trên bàn phím.
> - **App:** http://127.0.0.1:3000
> - **Terminal:** mở tại thư mục `W7/block7-saga`
> - Thao tác chi tiết và cách xử lý sự cố: [HUONG-DAN-DEMO.md](HUONG-DAN-DEMO.md). Giải thích sâu để trả lời câu hỏi: [NGUYEN-LY.md](NGUYEN-LY.md).

---

## Chuẩn bị 5 phút trước giờ trình bày

1. Đưa lab về dữ liệu sạch, 4 process chạy:
   ```bash
   npm run reset
   ```
2. Kiểm tra cả 4 dòng đều `sống` và `UP`:
   ```bash
   npm run lab -- status
   ```
3. Trình duyệt tab 1: http://127.0.0.1:3000/slides/#1, bấm `F` để toàn màn hình. Tab 2: http://127.0.0.1:3000 (app, tab **Mua hàng**, khách **Nguyễn Văn An**).
4. Terminal để sẵn, chữ to. Đóng mọi cửa sổ khác.
5. Kiểm tra trước (đã làm ở nhà): `evidence/test-output.txt` có 30 passed, `evidence/SUMMARY.md` có 7 dòng ĐẠT.

**Chia vai** (nếu nhóm muốn nhiều người cùng nói; một người nói hết cũng được):

| Người | Đoạn |
| --- | --- |
| Người 1 | Đoạn 1 – 6 (vấn đề, thiết kế) |
| Người 2 | Đoạn 7 – 13 (demo app, H0–F6) |
| Người 3 | Đoạn 14 – 16 (bằng chứng, đánh đổi, kết luận) và điều phối hỏi đáp |

**Thời lượng:** bản đầy đủ khoảng **15 phút**. Nếu thầy chỉ cho **8 phút** thì làm bản rút gọn ở cuối file.

---

## PHẦN 1 — VẤN ĐỀ

### Đoạn 1 — Mở đầu (0:00 – 0:40)

- **Slide:** [1 — Tiêu đề](../presentation/slides.html#1) → [2 — Nội dung](../presentation/slides.html#2)
- **Thao tác:** chưa cần gì. Sau câu thứ hai thì bấm → sang slide 2.

**Lời dẫn:**

> "Em chào thầy, em là đại diện nhóm 7. Hôm nay nhóm em trình bày bài Block 7: **Checkout Saga — giao dịch phân tán qua ba service**.
>
> Bài của nhóm em là một app bán hàng chạy thật với ba service: Order, Inventory và Payment. Payment được làm như một **ví tiền** của khách. Mỗi service là **một process riêng** và có **một database riêng**.
>
> *(bấm sang slide 2)* Em trình bày theo năm phần như yêu cầu của bài. Một là vấn đề: vì sao checkout qua nhiều DB lại hỏng. Hai là thiết kế của nhóm: vì sao chọn Saga mà không chọn 2PC, và hệ thống nhớ gì để phục hồi. Ba là demo trực tiếp trên app, gồm thành công, ba kiểu thất bại, và ba lần làm chết service giữa chừng. Bốn là bằng chứng: test, oracle và snapshot của cả ba kho. Năm là những đánh đổi và giới hạn nhóm em còn để lại."

---

### Đoạn 2 — Vấn đề: checkout không có Saga (0:40 – 2:00)

- **Slide:** [3 — Vấn đề](../presentation/slides.html#3)
- **Thao tác:** chuyển sang terminal và chạy lệnh dưới. Sau đó mở app → tab **Ví tiền** → chọn khách **Lê Minh Cường**.
- **Lệnh:**
  ```bash
  npm run baseline
  ```
- **Thầy sẽ thấy:** terminal in `R… ACTIVE ← orphan reservation` và `C… CHARGED 350.000đ, số dư 1.000.000đ → 650.000đ ← orphan charge`. Ở tab Ví có dòng **Thu tiền đơn BASE-… −350.000đ** và không có dòng hoàn tiền nào.

**Lời dẫn:**

> "Để thấy vấn đề, nhóm em viết một bản checkout cố ý sai, gọi là baseline. Hàm checkout chỉ gọi lần lượt reserve, charge, confirm, không có gì phối hợp giữa chúng. *(chạy lệnh)*
>
> Thầy nhìn terminal: bước 1, Inventory giữ hàng và đã commit vào DB của Inventory. Bước 2, Payment trừ tiền và đã commit vào DB của Payment. Bước 3, confirm bị lỗi, Order rollback đơn của mình… và dừng ở đó.
>
> Kết quả sau khi rollback: Order DB không còn đơn, nhưng **hàng vẫn bị giữ** ở Inventory và **tiền vẫn bị trừ** ở Payment. *(chuyển sang app, tab Ví, chọn Lê Minh Cường)* Đây là góc nhìn ví tiền: anh Cường bị trừ 350 nghìn cho một đơn không tồn tại, và không có giao dịch hoàn tiền nào.
>
> Lý do: transaction của Order chỉ bao được DB của Order. Mỗi service sở hữu DB riêng và chỉ nói chuyện với nhau qua HTTP, nên **không tồn tại một transaction bao cả ba DB**. Đó là bài toán nhóm em phải giải."

- **Thao tác cuối đoạn:** app → tab **Ma trận kịch bản** → bấm **Reset dữ liệu lab** → OK (xóa dữ liệu baseline). Nói nhanh: *"Em reset dữ liệu để demo phần chính."*

---

## PHẦN 2 — THIẾT KẾ

### Đoạn 3 — Vì sao Saga mà không phải 2PC / 3PC (2:00 – 3:10)

- **Slide:** [4 — 2PC, 3PC hay Saga](../presentation/slides.html#4)

**Lời dẫn:**

> "Bài toán là làm sao để ba DB cùng thành công, hoặc cùng không để lại thiệt hại. Nhóm em cân nhắc ba cách.
>
> Cách thứ nhất là **2PC**: coordinator hỏi các bên 'prepare được không', đủ YES rồi mới chốt commit. Nhưng 2PC cần participant có pha **prepare**: giữ tiền, chưa trừ hẳn, rồi chờ lệnh. Ví hay cổng thanh toán thực tế chỉ có charge, refund và query. Thêm nữa, participant đã vote YES mà mất coordinator thì rơi vào trạng thái **in-doubt**. Nó **không được tự abort**, vì có thể coordinator đã ghi COMMIT và bên kia đã commit rồi. Nó phải giữ khóa hàng và tiền để chờ; đó là **blocking**.
>
> Cách thứ hai là **3PC**: thêm pha PreCommit để bớt chờ. Nhưng 3PC chỉ đúng khi mạng đồng bộ và node chết hẳn. Khi mạng bị chia cắt, một phía có thể commit trong khi phía kia abort. Vì vậy nhóm em chỉ học giới hạn này, không cài đặt.
>
> Nhóm em chọn **Saga**: mỗi bước là một local transaction commit ngay trong DB của service đó. Khi một bước sau thất bại, orchestrator chạy **bước bù** theo thứ tự ngược. Bước bù là một thao tác nghiệp vụ **mới**, ví dụ hoàn tiền, chứ không phải rollback. Nhóm em dùng kiểu **orchestration**: một orchestrator đặt trong Order quyết định mọi bước và ghi tiến trình vào Saga record, nên dễ quan sát và dễ test từng nhánh lỗi."

---

### Đoạn 4 — Kiến trúc và lựa chọn công nghệ (3:10 – 4:30)

- **Slide:** [5 — Kiến trúc](../presentation/slides.html#5) → [6 — Công nghệ](../presentation/slides.html#6)
- **Lệnh** (chạy khi nói tới "4 process"):
  ```bash
  npm run lab -- status
  ```
- **Thầy sẽ thấy:** 4 dòng `inventory`, `payment`, `order`, `ui`, mỗi dòng có PID riêng, `process=sống`, `http=UP`.

**Lời dẫn:**

> "Về kiến trúc: hệ thống có **bốn process**. *(chạy `status`)* Thầy thấy bốn PID khác nhau: Order ở cổng 3001, Inventory 3002, Payment 3003 và Web UI 3000. Mỗi service có **một file database riêng**: order.db, inventory.db, payment.db. Không service nào đọc DB của service khác. Tất cả chỉ bind 127.0.0.1.
>
> Orchestrator nằm trong process Order. Saga record cũng nằm trong Order DB, nên mỗi lần đổi trạng thái đơn và Saga record đều xảy ra trong **cùng một local transaction**, không bao giờ lệch nhau.
>
> *(sang slide 6)* Về công nghệ: nhóm em dùng Node.js và Express như các block trước. Database là **SQLite, mỗi service một file**, bật WAL và `synchronous=FULL`. Nghĩa là commit xong là dữ liệu đã nằm trên đĩa. Nhóm em chọn SQLite vì ba file là ba DB độc lập thật, kill process không mất dữ liệu đã commit, và 'restart cùng DB' chỉ là chạy lại process, không cần Docker.
>
> Saga chạy nền: khách đặt hàng thì nhận mã đơn ngay, một vòng phục hồi chạy mỗi giây. Để làm chết service đúng vị trí, nhóm em dùng fault hook làm **treo process**, ghi một marker, rồi **kill process thật**. UI là một process riêng nên khi kill Order, UI vẫn sống để báo Order không truy cập được. Test cũng chạy trên ba process thật."

---

### Đoạn 5 — Bước tiến, bước bù và state machine (4:30 – 5:40)

- **Slide:** [7 — Bước tiến, bước bù](../presentation/slides.html#7) → [8 — State machine](../presentation/slides.html#8)

**Lời dẫn:**

> "Flow checkout có bốn bước tiến: CreateOrder, ReserveInventory, ChargePayment, ConfirmOrder. Ba bước bù tương ứng là RefundPayment, ReleaseInventory và CancelOrder, chạy theo thứ tự **ngược**. Quy định của lab là **refund trước, release sau**.
>
> Bảng dưới slide tóm tắt ba kiểu thất bại. Kho từ chối thì chưa có gì để bù, đơn bị hủy luôn. Ví không đủ tiền thì chỉ cần nhả hàng. Còn confirm bị từ chối sau khi đã thu tiền thì phải hoàn tiền rồi mới nhả hàng. Trong cả ba trường hợp, **khách không mất tiền**.
>
> *(sang slide 8)* Toàn bộ luật chuyển trạng thái nằm trong một **hàm thuần** `apply`, không đụng DB, không gọi mạng, nên nhóm em có 16 unit test cho riêng nó. Hàm có **guard**: thiếu bằng chứng thì không cho chuyển. Ví dụ: chưa giữ hàng thì không được thu tiền; chỉ refund khi đã **biết chắc** đã thu; phải refund xong mới được release; còn việc bù chưa xong thì không được hủy đơn. Đặc biệt, từ RECOVERING **không có đường thẳng** tới CANCELLED, nên hệ thống không bao giờ báo 'đã hủy' khi chưa biết tiền đã bị thu hay chưa."

---

### Đoạn 6 — Intent, operation ID, và timeout (5:40 – 7:00)

- **Slide:** [9 — Intent và op ID](../presentation/slides.html#9) → [10 — Unknown outcome](../presentation/slides.html#10)

**Lời dẫn:**

> "Đây là phần quan trọng nhất: process chết thì mất hết RAM, chỉ còn lại DB. Vậy DB phải đủ để biết làm tiếp thế nào.
>
> Mỗi lời gọi ra ngoài đi theo ba nhịp. Một, **ghi intent**: ghi việc sắp làm kèm một **operation ID cố định** vào Order DB, **trước** khi gọi. Hai, gọi HTTP. Ba, ghi kết quả. Operation ID được suy ra từ saga, ví dụ `S5:charge`, nên lần chạy lại nào cũng ra đúng ID cũ, không thể sinh ra ID mới.
>
> Phía Payment và Inventory thì **idempotent**: mỗi operation ID chỉ có tác động một lần. Gửi lại cùng ID thì trả lại kết quả cũ. Cùng ID mà nội dung khác thì trả 409. Ngoài code, DB còn có ràng buộc UNIQUE: mỗi op chỉ một dòng ledger, mỗi charge chỉ refund được một lần.
>
> Cách sai mà slide của thầy cảnh báo là chỉ lưu chữ 'RESERVED'. Khi đó, restart xong không biết đã charge chưa: sinh ID mới thì khách bị thu hai lần, còn đoán là chưa thu rồi hủy đơn thì tiền đã thu không ai trả.
>
> *(sang slide 10)* Nguyên tắc thứ hai: **timeout không có nghĩa là thất bại**. Nhận 201 là chắc chắn đã thu, nhận 402 là chắc chắn không thu. Còn timeout hay mất kết nối là **không biết**. Khi đó đơn chuyển sang **RECOVERING**, giữ nguyên intent, rồi hỏi Payment theo đúng op ID. Nếu Payment trả SUCCEEDED thì tiếp tục confirm. Nếu FAILED thì nhả hàng rồi hủy. Nếu NOT_FOUND hoặc PENDING, đó chưa phải kết luận, nên nhóm em **gửi lại đúng op cũ với cùng nội dung**; vì idempotent nên an toàn. Nếu Payment chết hẳn thì thử lại sau 1, 2, 4, rồi 5 giây."

---

## PHẦN 3 — DEMO

### Đoạn 7 — Giới thiệu app bốn góc nhìn (7:00 – 7:40)

- **Slide:** [11 — App](../presentation/slides.html#11) → [12 — Ví và ma trận](../presentation/slides.html#12), nói nhanh rồi **chuyển sang app**
- **Thao tác:** app → lần lượt bấm các tab **Mua hàng**, **Kho**, **Ví tiền**, **Ma trận kịch bản**, rồi quay về **Mua hàng**.

**Lời dẫn:**

> "Đúng như góp ý của thầy, nhóm em làm thành một app thật với nhiều góc nhìn. *(chuyển sang app)*
>
> Tab **Mua hàng** là góc khách hàng: chọn khách, thấy số dư ví, sản phẩm còn hay hết, và lịch sử đơn của mình kèm cột 'tiền của khách'. Tab **Kho** là góc thủ kho: tồn khả dụng, hàng đang giữ cho đơn, và lịch sử hàng vào hàng ra. Tab **Ví tiền** là góc thanh toán: số dư từng khách và danh sách giao dịch. Tab **Ma trận** chạy các kịch bản H0, F1 đến F6 và tự kiểm oracle.
>
> Thanh trên cùng hiện trạng thái và PID của từng service. Mọi số liệu đều đọc qua API của đúng service sở hữu, UI không tự tính trạng thái."

---

### Đoạn 8 — H0: mua thành công (7:40 – 8:40)

- **Slide:** để slide [13 — Demo H0–F3](../presentation/slides.html#13) ở màn hình bên cạnh; nói trên **app**
- **Thao tác:** tab **Mua hàng**, khách **Nguyễn Văn An** → bấm **Mua** ở **Tai nghe Bluetooth** → khi O1 hiện "Thành công" thì bấm **Chi tiết** O1 → đóng → tab **Kho** → tab **Ví tiền** → quay lại **Mua hàng**.
- **Thầy sẽ thấy:** O1 **Thành công CONFIRMED**, tiền **−350.000đ**, số dư **1.650.000đ**. Chi tiết: CREATE → INTENT reserve (`S1:reserve`) → RESERVED (R1) → INTENT charge (`S1:charge`) → CHARGED (C1) → CONFIRMED. Kho: tai nghe còn 9, có dòng "Giữ cho đơn O1 −1". Ví: C1 CHARGED.

**Lời dẫn:**

> "Đầu tiên là đường thành công. Anh An có 2 triệu, mua tai nghe 350 nghìn. *(bấm Mua)* Đơn O1 tạo xong, chưa tới một giây đã **Thành công**. Số dư còn 1 triệu 650.
>
> *(bấm Chi tiết)* Đây là Saga record của đơn, đọc từ Order DB. Thầy để ý: trước khi gọi Inventory có dòng **INTENT** ghi op `S1:reserve`; sau đó Inventory giữ hàng R1. Trước khi gọi Payment lại có **INTENT** với op `S1:charge`, rồi ví trừ tiền ở charge C1, cuối cùng là CONFIRMED. Ba ô phía trên là ba kho: Order CONFIRMED, Inventory R1 đang giữ, Payment C1 CHARGED.
>
> *(tab Kho)* Thủ kho thấy tai nghe còn 9, có dòng 'giữ cho đơn O1, trừ 1'. *(tab Ví)* Ví có giao dịch C1 trừ 350 nghìn với đúng op ID `S1:charge`."

---

### Đoạn 9 — F1 và F2: thất bại tự nhiên, tiền vẫn còn (8:40 – 9:40)

- **Thao tác F1:** tab **Mua hàng** → bấm **Mua** ở **Loa mini** (đang ghi "Hết hàng").
- **Thao tác F2:** đổi khách sang **Trần Thị Bình** → bấm **Mua** ở **Bàn phím cơ** → tab **Kho** (lịch sử) → tab **Ví** → quay lại **Mua hàng** và **đổi lại khách Nguyễn Văn An**.
- **Thầy sẽ thấy:** O2 **Đã hủy**, lý do "Hết hàng", "Không bị trừ tiền". O3 **Đã hủy**, lý do "Ví không đủ tiền", số dư Bình vẫn **300.000đ**. Kho có "Giữ cho đơn O3 −1" rồi "Nhả về kho (bù) +1". Ví có C2 **FAILED**.

**Lời dẫn:**

> "Tiếp theo là hai kiểu thất bại xảy ra **tự nhiên**, không cần giả lập. F1: loa mini đang hết hàng. *(bấm Mua)* Đơn O2 bị hủy, lý do hết hàng, và khách **không bị trừ đồng nào**. Mở chi tiết sẽ thấy sau khi kho từ chối thì **không có bước charge nào**: guard không cho thu tiền khi chưa giữ được hàng.
>
> F2: chị Bình chỉ có 300 nghìn mà mua bàn phím 900 nghìn. *(đổi khách, bấm Mua)* Lần này kho đã giữ hàng trước, rồi ví báo không đủ tiền. Đơn O3 bị hủy và **số dư vẫn 300 nghìn**. *(tab Kho)* Thủ kho thấy bàn phím bị giữ cho O3 rồi được **nhả về kho**: đó là bước bù release. *(tab Ví)* Ví ghi một giao dịch C2 **FAILED**, số dư không đổi. Đây chính là tình huống thầy nói: mua hàng thất bại nhưng tiền vẫn còn."

---

### Đoạn 10 — F3: xác nhận bị từ chối sau khi đã thu tiền (9:40 – 10:30)

- **Thao tác:** tab **Ma trận kịch bản** → hàng **F3** → **Chạy** → bấm mã đơn **O4** ở cột "Đơn gần nhất" để mở chi tiết → (tùy chọn) bấm vào chữ "ĐẠT 7/7" để xổ các check.
- **Thầy sẽ thấy:** O4 **Đã hủy**; ô xanh "**Mua thất bại nhưng tiền vẫn còn: đã trừ 350.000đ rồi hoàn lại 350.000đ**"; Payment: `C3 CHARGED` **và** `RF1 refund → C3 REFUNDED`; các bước: COMPENSATING → refund → release → CANCELLED. Ma trận: **ĐẠT 7/7**.

**Lời dẫn:**

> "F3 là trường hợp khó hơn: tiền **đã bị thu**, sau đó bước xác nhận đơn bị từ chối. Tình huống này không tự xảy ra được nên nhóm em dùng fault hook ở Order. *(bấm Chạy)*
>
> *(mở O4)* Đơn chuyển sang COMPENSATING với hai việc còn nợ: refund rồi release. Thầy thấy refund chạy **trước** release, đúng thứ tự của lab. Ở ô Payment: dòng charge C3 **vẫn còn**, và có thêm một dòng **mới** RF1 trỏ về C3. Đó là sự khác biệt giữa compensation và rollback: nhóm em không xóa lịch sử, mà ghi thêm một giao dịch hoàn tiền. Kết quả cho khách: trừ 350 rồi hoàn 350, **tiền vẫn còn**. Cột oracle ở ma trận báo đạt 7 trên 7 check."

---

### Đoạn 11 — F4: kill Payment sau khi đã thu tiền (10:30 – 12:30) ★ trọng tâm

- **Slide:** [14 — Demo F4](../presentation/slides.html#14) ở màn hình bên cạnh (dự phòng nếu demo trục trặc)
- **Thao tác + lệnh theo thứ tự:**
  1. App → tab **Ma trận** → hàng **F4** → **Chạy**. Thanh trên cùng chuyển "Payment: không truy cập được" (Payment đang treo).
  2. Terminal:
     ```bash
     npm run lab -- kill payment
     ```
  3. App → tab **Mua hàng** → đơn **O5**: "**Đang xác minh thanh toán** RECOVERING" → bấm **Chi tiết** O5.
  4. Terminal (chứng minh tiền đã bị thu dù Payment đang chết):
     ```bash
     npm run lab -- snapshot O5 khi-payment-chet
     ```
  5. Terminal:
     ```bash
     npm run lab -- start payment
     ```
  6. Nhìn chi tiết O5 tự chuyển **Thành công**. Tab **Ví tiền**: đúng **một** dòng charge cho O5.
- **Thầy sẽ thấy:** bước `UNKNOWN … → RECOVERING, KHÔNG coi là thất bại, KHÔNG charge ID mới`; các dòng `QUERY … ECONNREFUSED → vẫn RECOVERING`; snapshot có `Payment DB (db-file …): C4 charge 350000 CHARGED op=S5:charge`; sau khi start là `RECOVERING → CHARGED … biết qua query op S5:charge: SUCCEEDED` rồi CONFIRMED.

**Lời dẫn:**

> "Bây giờ đến phần quan trọng nhất: **F4**. Payment đã trừ tiền và commit xuống đĩa, nhưng **chết trước khi kịp trả lời**. *(bấm Chạy)* Fault hook làm Payment commit charge rồi treo cả process. Thầy thấy thanh trên cùng: Payment không truy cập được.
>
> Em kill process Payment thật. *(chạy `kill payment`)* Process PID này đã bị dừng hẳn.
>
> *(tab Mua hàng)* Đơn O5 đang ở trạng thái **'Đang xác minh thanh toán', tức RECOVERING**. Order **không** báo hủy và **không** báo thành công, vì nó **chưa biết** tiền đã bị thu hay chưa. *(mở chi tiết)* Dòng này ghi rõ: 'chưa rõ kết quả charge, chuyển RECOVERING, không coi là thất bại, không cấp charge ID mới'. Sau đó orchestrator liên tục hỏi lại Payment bằng đúng op `S5:charge`, cách nhau 1, 2, 4, 5 giây, và lần nào cũng không kết nối được.
>
> *(chạy snapshot)* Còn thực tế trong Payment DB: em đọc thẳng file DB vì service đang chết. Charge C4 **đã nằm ở đó**, trạng thái CHARGED, op `S5:charge`. Nếu lúc nãy Order coi timeout là thất bại và hủy đơn, thì khách sẽ mất 350 nghìn.
>
> Giờ em bật lại Payment. *(chạy `start payment`)* PID mới, cùng file DB. *(chờ vài giây)* Thầy thấy đơn tự chuyển **Thành công**: orchestrator hỏi op `S5:charge`, Payment trả SUCCEEDED, nên ghi CHARGED rồi confirm. *(tab Ví)* Ví chỉ có **đúng một** charge cho đơn này, không có charge thứ hai."

> **Dự phòng:** nếu có trục trặc, chạy `npm run demo -- f4`. Script tự làm cả chuỗi và in timeline. Lời dẫn giữ nguyên, thêm câu: *"Em chạy script tự động làm đúng các bước vừa rồi, kèm timestamp."*

---

### Đoạn 12 — F5: hoàn tiền lỗi tạm thời (12:30 – 13:20)

- **Slide:** [15 — Demo F5, F6](../presentation/slides.html#15) ở màn hình bên cạnh
- **Thao tác:** tab **Ma trận** → hàng **F5** → **Chạy** → bấm **O6** mở chi tiết (để mở khoảng 3 giây) → đóng → bấm **Gỡ lỗi refund** ở hàng F5 → mở lại O6.
- **Thầy sẽ thấy:** O6 **Đang hoàn tác COMPENSATING**, `pending [refund, release]`, "lỗi gần nhất: HTTP 503 TEMPORARY_UNAVAILABLE", Inventory **R5 ACTIVE**, các bước `TEMP_FAIL … thử lại sau 1s, 2s…`. Sau khi gỡ: O6 **Đã hủy**, `RF2 REFUNDED → C5`, R5 RELEASED. Ma trận: **ĐẠT 8/8**.

**Lời dẫn:**

> "F5: chính **bước bù** cũng có thể lỗi. Em cho confirm bị từ chối như F3, nhưng lần này Payment trả lỗi 503 khi hoàn tiền. *(Chạy, mở O6)*
>
> Đơn đang ở **COMPENSATING**, còn nợ hai việc: refund và release, và lưu lại lỗi gần nhất là 503. Hàng **vẫn đang được giữ**, vì refund chưa xong thì chưa được release. Quan trọng là hệ thống **không báo 'đã hủy' giả**: tiền khách chưa được hoàn thì đơn chưa kết thúc. Danh sách việc còn nợ được lưu trong DB, nên kể cả Order có restart lúc này cũng không quên.
>
> *(bấm Gỡ lỗi refund)* Payment ổn lại. *(mở lại O6)* Refund chạy **đúng một lần** với cùng op `S6:refund`, sau đó release, rồi hủy đơn. Oracle đạt 8 trên 8."

---

### Đoạn 13 — F6: kill orchestrator đúng tại khoảng hở (13:20 – 14:30)

- **Thao tác + lệnh:**
  1. Tab **Ma trận** → hàng **F6** → **Chạy**. Thanh trên cùng: "Order: không truy cập được" (Order đang treo).
  2. Terminal:
     ```bash
     npm run lab -- kill order
     ```
     ```bash
     npm run lab -- snapshot O7 sau-kill
     ```
  3. Terminal:
     ```bash
     npm run lab -- start order
     ```
  4. App → **Mua hàng** → **Chi tiết** O7 → kéo xuống các bước cuối. Tab **Ví**: một charge cho O7.
- **Thầy sẽ thấy:** snapshot: `Order DB (db-file…): RESERVED phase=charge intent=charge S7:charge`, `Payment DB: C6 charge 200000 CHARGED op=S7:charge`. Sau start: PID mới; O7 **Thành công**; bước **RESUME** "Order khởi động (pid …): đọc Saga record … tiếp tục bằng op ID cũ"; các bước sau RESUME có **PID khác**; ví đúng **một** charge `S7:charge`. Ma trận F6 **ĐẠT 9/9**.

**Lời dẫn:**

> "Cuối cùng là **F6**: người chết bây giờ là chính **orchestrator**, và chết đúng ở **khoảng hở**: Payment đã thu tiền và đã trả lời, nhưng Order **chưa kịp ghi kết quả**. *(Chạy)* Order nhận CHARGED xong thì treo. Em kill nó. *(kill order)*
>
> *(snapshot)* Lúc này Order DB chỉ còn trạng thái RESERVED, nhưng nhờ đã ghi **intent** nên vẫn biết 'đang charge với op `S7:charge`'. Bên Payment thì charge C6 đã có. Nếu chỉ nhìn chữ RESERVED mà charge lại bằng ID mới, khách sẽ bị thu hai lần.
>
> Em khởi động lại Order với **cùng file DB**, không reset gì. *(start order)* *(mở chi tiết O7)* Bước RESUME ghi 'Order khởi động với PID mới, đọc Saga record, tiếp tục bằng op ID cũ'. Orchestrator dùng lại đúng `S7:charge`, Payment trả lại C6 đã có, đơn thành công. Thầy để ý PID trước và sau RESUME khác nhau: đây là hai process khác nhau thật. Ví chỉ có **một** charge. Oracle đạt 9 trên 9."

---

## PHẦN 4 — BẰNG CHỨNG

### Đoạn 14 — Test, oracle và evidence (14:30 – 15:20)

- **Slide:** [16 — Bằng chứng](../presentation/slides.html#16)
- **Thao tác:** app → tab **Ma trận**. H0, F1, F2 lúc nãy mua ở góc khách hàng nên chưa gắn nhãn kịch bản: bấm **Chạy** lần lượt ở hàng **H0**, **F1**, **F2** (mỗi đơn xong dưới 1 giây). Đợi khoảng 2 giây để cả 7 dòng hiện **ĐẠT**.
- **Lệnh** (nếu còn thời gian, khoảng 15 giây; nếu không thì chỉ vào slide):
  ```bash
  npm test
  ```

**Lời dẫn:**

> "Về bằng chứng: *(app, tab Ma trận, bấm Chạy H0, F1, F2)* ba kịch bản đầu em vừa mua ở góc khách hàng, giờ em chạy lại từ ma trận để hệ thống gắn nhãn và chấm. Bảy kịch bản H0 và F1 đến F6 đều **đạt oracle**. Oracle kiểm bằng dữ liệu đọc qua API của **cả ba kho**, không chỉ nhìn HTTP response.
>
> *(slide 16)* Nhóm em có **30 test, tất cả đều xanh**, chia năm nhóm. 16 unit test cho state machine và guard. 2 test bảo đảm tài liệu Swagger khớp đúng các route trong code. 5 test idempotency: gửi lại cùng op thì không tạo tác động thứ hai, khác nội dung thì 409, refund chỉ một lần. 4 test **H0, F1, F2, F3** theo yêu cầu V1, assert cả Order, Inventory, Payment, và kiểm toàn bộ ledger để chắc chắn không có charge hay refund ngoài dự kiến. Ngoài yêu cầu, nhóm em tự động hóa thêm F4, F5, F6, có **kill process thật** ngay trong test.
>
> Bảng bên phải lấy từ file `evidence/SUMMARY.md`. Thời gian hội tụ đo được: F4 khoảng 0,7 đến 4 giây sau khi Payment sống lại, tùy đang ở nấc backoff nào; F5 khoảng 1,3 giây sau khi gỡ lỗi; F6 khoảng 0,5 giây sau khi Order khởi động lại. Mỗi kịch bản đều có timeline kèm marker, PID, operation ID và snapshot ba kho trong thư mục evidence."

---

## PHẦN 5 — ĐÁNH ĐỔI VÀ KẾT LUẬN

### Đoạn 15 — Đánh đổi và giới hạn (15:20 – 16:10)

- **Slide:** [17 — Đánh đổi](../presentation/slides.html#17)

**Lời dẫn:**

> "Saga cũng có cái giá, và nhóm em ghi rõ những gì **chưa** làm được.
>
> Thứ nhất, **mất isolation**: trong lúc saga chạy, người khác thấy hàng đang bị giữ, nên nhóm em hiển thị trạng thái 'đang xử lý'. Thứ hai, **bù có độ trễ**: ở F3, khách thấy tiền bị trừ rồi một lúc sau mới được hoàn, và thông báo đã gửi thì không lấy lại được. Thứ ba, hệ thống chỉ có **một orchestrator**; muốn chạy nhiều instance thì cần lease và fencing cho từng saga. Thứ tư, **chưa có broker và outbox**: Saga record bền giúp phục hồi, nhưng chưa đảm bảo message hay tác động bên ngoài xảy ra đúng một lần; đó là nội dung block sau. Cuối cùng, SQLite đủ cho ba DB độc lập và bền, nhưng chưa chứng minh chịu tải; muốn chuyển sang PostgreSQL chỉ cần thay tầng DB, logic Saga giữ nguyên."

---

### Đoạn 16 — Kết luận (16:10 – 16:40)

- **Slide:** [18 — Kết luận](../presentation/slides.html#18)

**Lời dẫn:**

> "Tóm lại, nhóm em rút ra ba điều. Một, **compensation không phải rollback**: hoàn tiền là một giao dịch mới, lịch sử thu tiền vẫn còn. Hai, **timeout nghĩa là chưa biết**: chuyển sang RECOVERING và hỏi lại bằng đúng operation ID cũ, không bao giờ thu tiền bằng ID mới. Ba, **ghi intent trước khi gọi**: process chết thì chỉ còn DB, nên DB phải đủ thông tin để làm tiếp.
>
> Phần trình bày của nhóm em đến đây là hết. Em cảm ơn thầy đã lắng nghe, nhóm em sẵn sàng nhận câu hỏi."

---

## Bản rút gọn 8 phút

| Thứ tự | Đoạn | Rút gọn thế nào |
| --- | --- | --- |
| 1 | Đoạn 1 | Chỉ câu chào và một câu về 3 service (20 giây) |
| 2 | Đoạn 2 | Chạy baseline, nói 3 câu đầu và câu "không tồn tại một transaction bao cả ba DB" |
| 3 | Đoạn 3 + 6 | Chỉ nói slide 4 (đoạn cuối: chọn Saga) và slide 9 (intent + op ID) |
| 4 | Đoạn 8 | H0 ngắn: mua, mở chi tiết, chỉ INTENT và op ID |
| 5 | Đoạn 10 | F3 (refund là dòng mới) |
| 6 | Đoạn 11 | **F4 đầy đủ** |
| 7 | Đoạn 13 | F6: kill → start → chỉ bước RESUME và PID khác |
| 8 | Đoạn 14 | Chỉ câu "30 test xanh, 7/7 kịch bản đạt oracle" |
| 9 | Đoạn 16 | Ba điều rút ra + cảm ơn |

F1, F2, F5 nói một câu trên slide 13/15: *"F1, F2 là thất bại tự nhiên, khách không mất tiền; F5 là bước bù lỗi tạm thời, đơn giữ COMPENSATING tới khi hoàn tiền xong. Bằng chứng nằm ở ma trận."*

---

## Hỏi đáp — câu thầy có thể hỏi và câu trả lời mẫu

| Câu hỏi | Trả lời (nói được ngay) |
| --- | --- |
| Participant đã prepared trong 2PC có tự abort khi timeout được không? | "Dạ không. Coordinator có thể đã ghi COMMIT và bên kia đã commit. Tự abort sẽ trái quyết định chung, nên phải chờ; đó là blocking." |
| 3PC có an toàn với network partition không? | "Dạ không. 3PC giả định timeout chứng minh được node kia đã chết. Khi mạng bị chia cắt, một phía có thể commit trong khi phía kia abort." |
| Order rollback sau khi Payment đã commit charge thì ledger đổi gì? | "Dạ không đổi gì cả. Muốn trả tiền phải gọi refund, tạo thêm dòng mới trỏ về charge." |
| Timeout, query trả NOT_FOUND thì làm gì? Có cấp ID mới không? | "Dạ vẫn giữ RECOVERING. NOT_FOUND chưa phải kết luận, nên nhóm em gửi lại đúng op cũ với cùng nội dung; Payment idempotent nên chỉ có một charge. Không cấp ID mới." |
| Refund đã commit nhưng orchestrator chết trước khi ghi kết quả, làm sao không refund hai lần? | "Dạ Saga record còn intent refund với op `S6:refund`. Khi restart, orchestrator gửi lại đúng op đó, Payment trả lại RF cũ. DB còn có index chỉ cho một refund trên mỗi charge. Sau đó mới release rồi cancel." |
| Snapshot F3: Order CANCELLED, hàng đã nhả nhưng charge chưa refund. Đạt chưa? | "Dạ chưa đạt. Guard không cho cancel khi pending còn refund, nên đơn phải ở COMPENSATING cho tới khi hoàn tiền xong." |
| Chỉ lưu chữ RESERVED có đủ để quyết định charge lại không? | "Dạ không đủ. Tên trạng thái không chứng minh charge chưa diễn ra. Vì vậy nhóm em ghi intent kèm op ID trước khi gọi." |
| Sao biết đã kill process thật? | "Dạ PID trước và sau khác nhau, xem được ở thanh trạng thái và `lab status`. Log có marker và dòng KILL. Snapshot lúc service chết phải đọc từ file DB. Bước RESUME ghi PID mới." |
| Vì sao chọn SQLite? | "Dạ mỗi service một file là ba DB độc lập thật, commit xong là đã nằm trên đĩa, restart cùng file rất đơn giản và không cần Docker. Lab chấm Saga chứ không chấm DB engine; đổi sang PostgreSQL chỉ cần thay tầng DB." |
| UI có đọc thẳng DB không? | "Dạ không. UI chỉ gọi API. Service nào chết thì phần dữ liệu của service đó báo không truy cập được. Chỉ script snapshot làm evidence mới đọc file DB, và có ghi rõ nguồn." |
| Chạy 2 instance Order thì sao? | "Dạ hai instance có thể cùng chạy một saga. Op ID idempotent nên tiền và hàng không bị nhân đôi, nhưng muốn đúng hẳn cần claim saga bằng lease và fencing. Nhóm em ghi đây là giới hạn." |
| Phần nào do agent viết, nhóm kiểm tra thế nào? | "Dạ agent hỗ trợ viết code, nhưng nhóm em duyệt state machine, guard và oracle theo slide của thầy. Mỗi khẳng định đều có test hoặc snapshot đi kèm, không tin lời agent nói 'đã an toàn'." |
