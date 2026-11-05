# Kịch bản video demo

Theo rubric ở slide 31, nhóm phải nộp một video demo các tình huống H0, F1 đến F6 trên giao diện web, kèm ảnh chụp giao diện lúc đang chờ xử lý (pending) và lúc đã kết thúc. Kịch bản gồm bảy cảnh, tổng thời lượng khoảng bảy phút. Nếu bắt đầu quay từ dữ liệu sạch, mã đơn trên màn hình sẽ lần lượt là O1 đến O7, đúng như trong lời thoại.

**Cách đọc kịch bản:** đọc từ trên xuống, mỗi bước theo đúng một nhịp:
1. **▶ Làm:** việc cần làm trên màn hình.
2. **🗣 Nói:** câu cần đọc trong lúc hoặc ngay sau khi làm.
3. Nói xong mới chuyển sang bước tiếp theo.

Ở bước có biểu tượng 📸, bấm `Win + Shift + S` để chụp màn hình, rồi lưu ảnh vào thư mục `evidence/video-screens/` với tên được ghi kèm.

## Chuẩn bị trước khi quay

**Bước 1. Chọn công cụ quay.** Nên dùng **OBS Studio** với nguồn Display Capture để quay toàn bộ màn hình, hoặc **Snipping Tool** của Windows 11 (bấm `Win + Shift + R` rồi kéo chọn vùng cần quay). Không dùng Xbox Game Bar, vì công cụ này chỉ quay được một cửa sổ, trong khi video cần thấy cùng lúc cả trình duyệt lẫn terminal.

**Bước 2. Sắp xếp màn hình.**
- Bên trái: trình duyệt mở http://127.0.0.1:3000.
- Bên phải: terminal đang ở thư mục `block7-saga`, phóng to cỡ chữ để người xem đọc được lệnh.
- Tắt thông báo của Windows và các ứng dụng nhắn tin để khỏi bị chen ngang khi đang quay.

**Bước 3. Đưa lab về dữ liệu ban đầu.** Chạy lần lượt hai lệnh sau:

```bash
npm run reset
```

```bash
npm run lab -- status
```

Kiểm tra cả bốn process đều hiện `sống` và `UP`. Sau đó mở tab **Mua hàng** và chọn khách **Nguyễn Văn An**.

---

## Cảnh 1 — Mở đầu và vấn đề cần giải quyết (khoảng 1 phút)

**Bước 1.**
▶ **Làm:** Trong terminal, chạy lệnh:

```bash
npm run lab -- status
```

🗣 **Nói:**
> "Em chào thầy. Đây là video demo bài Block 7 của nhóm 07 với đề tài Checkout Saga. Hệ thống của nhóm em gồm ba service là Order, Inventory và Payment, trong đó Payment đóng vai trò ví tiền của khách hàng. Như thầy thấy trên terminal, mỗi service chạy trong một process riêng và có một cơ sở dữ liệu riêng."

**Bước 2.**
▶ **Làm:** Trong terminal, chạy lệnh:

```bash
npm run baseline
```

🗣 **Nói:**
> "Trước tiên, em xin minh họa vấn đề mà bài này cần giải quyết. Em chạy một phiên bản checkout chưa có Saga: hệ thống lần lượt giữ hàng, trừ tiền rồi xác nhận đơn. Khi bước xác nhận bị lỗi, service Order rollback đơn hàng của mình và dừng lại ở đó."

**Bước 3.**
▶ **Làm:** Chuyển sang trình duyệt, mở tab **Ví tiền** và chọn khách **Lê Minh Cường** trong ô lọc.

🗣 **Nói:**
> "Tuy nhiên, như thầy thấy ở tab Ví tiền, anh Cường vẫn bị trừ 350 nghìn đồng, và hàng vẫn đang bị giữ cho một đơn không còn tồn tại. Nguyên nhân là transaction của Order chỉ có tác dụng trong cơ sở dữ liệu của Order, không thể hoàn tác những gì đã được ghi ở hai service còn lại."

**Bước 4.**
▶ **Làm:** Mở tab **Ma trận kịch bản**, bấm nút **Reset dữ liệu lab** rồi chọn **OK**.

🗣 **Nói:**
> "Bây giờ em sẽ reset dữ liệu để chuyển sang phần demo chính."

---

## Cảnh 2 — H0: mua hàng thành công (khoảng 1 phút)

**Bước 1.**
▶ **Làm:** Mở tab **Mua hàng**, kiểm tra đang chọn khách Nguyễn Văn An với số dư 2.000.000đ. Bấm **Mua** ở sản phẩm **Tai nghe Bluetooth**, chờ khoảng một giây cho đến khi đơn O1 hiện **Thành công**.

🗣 **Nói:**
> "Đầu tiên là trường hợp H0, mua hàng thành công. Anh An đang có 2 triệu đồng trong ví và mua một chiếc tai nghe giá 350 nghìn đồng. Chỉ sau khoảng một giây, đơn O1 đã chuyển sang trạng thái thành công, và số dư trong ví còn lại 1 triệu 650 nghìn đồng, đúng bằng giá trị đơn hàng đã bị trừ."

**Bước 2.**
▶ **Làm:** Bấm **Chi tiết** ở đơn O1 để mở các bước của Saga. 📸 Chụp ảnh và đặt tên `H0.png`.

🗣 **Nói:**
> "Khi mở phần chi tiết, thầy có thể thấy toàn bộ các bước của Saga được lưu trong cơ sở dữ liệu của Order. Trước mỗi lần gọi sang service khác, orchestrator đều ghi lại một intent kèm theo một mã thao tác cố định, ví dụ `S1:charge` cho bước thu tiền. Ba ô phía trên cho thấy trạng thái cuối cùng ở cả ba kho dữ liệu: đơn hàng đã được xác nhận, kho đang giữ hàng R1, và ví đã ghi nhận khoản thu C1."

▶ **Làm:** Đóng phần chi tiết.

---

## Cảnh 3 — F1 và F2: mua thất bại nhưng tiền vẫn còn (khoảng 1 phút)

**Bước 1.**
▶ **Làm:** Bấm **Mua** ở sản phẩm **Loa mini** (đang hết hàng). Đơn O2 chuyển sang **Đã hủy**, cột tiền ghi "Không bị trừ tiền". 📸 Chụp ảnh và đặt tên `F1.png`.

🗣 **Nói:**
> "Tiếp theo là hai tình huống thất bại xảy ra một cách tự nhiên, không cần giả lập lỗi. Ở tình huống F1, loa mini đang hết hàng nên kho từ chối giữ hàng. Đơn O2 bị hủy ngay lập tức, và hệ thống hoàn toàn không gọi sang bước thu tiền, vì vậy khách không bị trừ đồng nào."

**Bước 2.**
▶ **Làm:** Đổi khách hàng sang **Trần Thị Bình**, rồi bấm **Mua** ở sản phẩm **Bàn phím cơ**. Đơn O3 chuyển sang **Đã hủy**, số dư ví vẫn là 300.000đ.

🗣 **Nói:**
> "Ở tình huống F2, chị Bình chỉ có 300 nghìn đồng nhưng lại mua một chiếc bàn phím giá 900 nghìn đồng. Lần này kho đã giữ hàng thành công, nhưng đến bước thu tiền thì ví báo không đủ số dư, nên đơn O3 bị hủy. Thầy có thể thấy số dư của chị Bình vẫn giữ nguyên 300 nghìn đồng, tức là mua hàng thất bại nhưng tiền của khách vẫn còn nguyên."

**Bước 3.**
▶ **Làm:** Mở tab **Kho**, chỉ chuột vào hai dòng "Giữ cho đơn O3 −1" và "Nhả về kho (bù) +1". 📸 Chụp ảnh và đặt tên `F2.png`.

🗣 **Nói:**
> "Ở tab Kho, thủ kho thấy chiếc bàn phím đã bị giữ cho đơn O3 và sau đó được nhả lại về kho. Đây chính là bước bù release của Saga."

▶ **Làm:** Quay lại tab **Mua hàng** và chọn lại khách **Nguyễn Văn An** để chuẩn bị cho các cảnh sau.

---

## Cảnh 4 — F3: xác nhận đơn bị từ chối sau khi đã thu tiền (khoảng 40 giây)

**Bước 1.**
▶ **Làm:** Mở tab **Ma trận kịch bản** và bấm **Chạy** ở hàng F3.

🗣 **Nói:**
> "Tình huống F3 khó hơn: tiền của khách đã bị thu, nhưng sau đó bước xác nhận đơn lại bị từ chối. Vì tình huống này không tự xảy ra được, nhóm em dùng một fault hook để giả lập lỗi ở service Order."

**Bước 2.**
▶ **Làm:** Bấm vào mã đơn **O4** ở cột "Đơn gần nhất" để mở phần chi tiết. 📸 Chụp ảnh và đặt tên `F3.png`.

🗣 **Nói:**
> "Khi đó hệ thống chạy các bước bù theo thứ tự ngược: hoàn tiền trước, nhả hàng sau, cuối cùng mới hủy đơn. Thầy để ý ô Payment: dòng thu tiền C3 vẫn còn nguyên, và có thêm một dòng hoàn tiền mới là RF1 trỏ về C3. Điều này thể hiện rằng compensation là một giao dịch nghiệp vụ mới, chứ không phải xóa đi lịch sử như rollback."

▶ **Làm:** Đóng phần chi tiết.

---

## Cảnh 5 — F4: Payment bị tắt sau khi đã thu tiền ★ (khoảng 1 phút 20 giây, quay liền một mạch)

**Bước 1.**
▶ **Làm:** Trong tab **Ma trận**, bấm **Chạy** ở hàng F4. Chờ khoảng hai giây cho đến khi thanh trên cùng báo "Payment: không truy cập được".

🗣 **Nói:**
> "Đây là tình huống quan trọng nhất, F4. Payment đã trừ tiền và ghi xuống cơ sở dữ liệu, nhưng bị treo trước khi kịp trả kết quả về cho Order. Thanh trạng thái phía trên đang báo rằng Payment không truy cập được."

**Bước 2.**
▶ **Làm:** Trong terminal, chạy lệnh:

```bash
npm run lab -- kill payment
```

🗣 **Nói:**
> "Bây giờ em sẽ tắt hẳn process Payment."

**Bước 3.**
▶ **Làm:** Mở tab **Mua hàng**. Đơn O5 đang ở trạng thái **Đang xác minh thanh toán (RECOVERING)**. Bấm **Chi tiết** để mở các bước. 📸 Chụp ảnh và đặt tên `F4-pending.png`.

🗣 **Nói:**
> "Thầy có thể thấy đơn O5 đang ở trạng thái 'Đang xác minh thanh toán', tức là RECOVERING. Order không hủy đơn và cũng không báo thành công, vì nó chưa biết chắc tiền đã bị thu hay chưa. Trong phần chi tiết, orchestrator liên tục hỏi lại Payment bằng đúng mã thao tác cũ là `S5:charge`, và tuyệt đối không tạo một lệnh thu tiền mới, để tránh trường hợp khách bị trừ tiền hai lần."

**Bước 4.**
▶ **Làm:** Trong terminal, chạy lệnh dưới, rồi nhìn sang phần chi tiết của đơn O5.

```bash
npm run lab -- start payment
```

🗣 **Nói:**
> "Bây giờ em khởi động lại Payment."

▶ **Làm:** Chờ vài giây cho đến khi đơn O5 tự chuyển sang **Thành công**. 📸 Chụp ảnh và đặt tên `F4-ket-thuc.png`.

🗣 **Nói:**
> "Sau vài giây, Payment trả lời rằng thao tác `S5:charge` đã thành công, nên đơn được xác nhận. Trong ví chỉ có đúng một khoản thu cho đơn này."

▶ **Làm:** Đóng phần chi tiết.

---

## Cảnh 6 — F5: hoàn tiền bị lỗi tạm thời (khoảng 50 giây)

**Bước 1.**
▶ **Làm:** Trong tab **Ma trận**, bấm **Chạy** ở hàng F5.

🗣 **Nói:**
> "Ở tình huống F5, chính bước bù cũng có thể gặp lỗi. Em cho bước xác nhận bị từ chối giống như F3, nhưng lần này Payment trả về lỗi 503 khi hệ thống yêu cầu hoàn tiền."

**Bước 2.**
▶ **Làm:** Bấm vào đơn **O6**. Đơn đang ở trạng thái COMPENSATING, danh sách việc còn nợ là `[refund, release]`, và hàng R5 vẫn đang được giữ. 📸 Chụp ảnh và đặt tên `F5-pending.png`.

🗣 **Nói:**
> "Đơn O6 đang ở trạng thái COMPENSATING, và danh sách việc còn nợ gồm hoàn tiền rồi nhả hàng được lưu ngay trong cơ sở dữ liệu. Hàng vẫn đang được giữ, vì theo quy định thì phải hoàn tiền xong mới được nhả hàng. Điểm quan trọng là hệ thống không báo hủy đơn khi tiền của khách chưa được hoàn lại."

**Bước 3.**
▶ **Làm:** Đóng phần chi tiết, bấm nút **Gỡ lỗi refund** ở hàng F5, rồi mở lại đơn O6. Đơn đã chuyển sang **Đã hủy** và có đúng một dòng hoàn tiền RF2. 📸 Chụp ảnh và đặt tên `F5-ket-thuc.png`.

🗣 **Nói:**
> "Khi em gỡ lỗi, Payment hoạt động bình thường trở lại. Hệ thống hoàn tiền đúng một lần, sau đó nhả hàng về kho và cuối cùng mới hủy đơn."

▶ **Làm:** Đóng phần chi tiết.

---

## Cảnh 7 — F6: tắt orchestrator giữa chừng, rồi tổng kết ★ (khoảng 1 phút 20 giây, quay liền một mạch)

**Bước 1.**
▶ **Làm:** Trong tab **Ma trận**, bấm **Chạy** ở hàng F6. Chờ cho đến khi thanh trên cùng báo "Order: không truy cập được".

🗣 **Nói:**
> "Tình huống cuối cùng là F6. Lần này process bị tắt là chính orchestrator, và bị tắt đúng ở khoảng hở: Payment đã thu tiền và đã trả lời, nhưng Order chưa kịp ghi lại kết quả."

**Bước 2.**
▶ **Làm:** Trong terminal, chạy lần lượt hai lệnh sau. 📸 Chụp ảnh terminal và đặt tên `F6-pending.png`.

```bash
npm run lab -- kill order
```

```bash
npm run lab -- snapshot O7 sau-kill
```

🗣 **Nói:**
> "Em tắt process Order. Ảnh chụp cơ sở dữ liệu lúc này cho thấy Order vẫn còn lưu intent đang thu tiền với mã `S7:charge`, trong khi Payment đã có khoản thu C6."

**Bước 3.**
▶ **Làm:** Trong terminal, chạy lệnh dưới. Sau đó mở tab **Mua hàng**, bấm **Chi tiết** ở đơn O7 và chỉ vào bước **RESUME** cùng PID mới. 📸 Chụp ảnh và đặt tên `F6-ket-thuc.png`.

```bash
npm run lab -- start order
```

🗣 **Nói:**
> "Em khởi động lại Order trên đúng file cơ sở dữ liệu cũ. Trong phần chi tiết, bước RESUME cho thấy process mới đã đọc lại Saga record và tiếp tục bằng đúng mã thao tác cũ. Nhờ vậy đơn hoàn tất thành công, và khách chỉ bị thu tiền một lần."

**Bước 4.**
▶ **Làm:** Đóng phần chi tiết. Mở tab **Ma trận**, bấm **Chạy** lần lượt ở các hàng H0, F1 và F2, rồi chờ cho đến khi cả bảy dòng đều hiện **ĐẠT**. 📸 Chụp ảnh và đặt tên `ma-tran.png`.

🗣 **Nói:**
> "Để tổng kết, em chạy lại ba tình huống đầu từ bảng ma trận. Bây giờ cả bảy tình huống từ H0 đến F6 đều đạt oracle, và ba mươi test tự động của nhóm đều chạy thành công. Phần demo của nhóm em đến đây là kết thúc. Em cảm ơn thầy đã theo dõi."

---

## Sau khi quay

Khi dựng video, chỉ cắt bỏ những đoạn phải chờ. Ở các tình huống F4, F5 và F6, giữ nguyên khoảnh khắc trạng thái chuyển từ lúc đang chờ xử lý sang lúc kết thúc, vì đây là bằng chứng quan trọng nhất.

Xuất video ở định dạng MP4 với độ phân giải 1080p, rồi tải lên YouTube ở chế độ "Không công khai" hoặc lên Google Drive. Sau đó dán đường link vào file `SUBMISSION.md`, và đổi biểu tượng 🟡 thành ✅ ở mục 6 của file `AUDIT.md`.

Cuối cùng, gỡ các fault còn bật và đưa lab về dữ liệu ban đầu:

```bash
npm run lab -- fault clear
```

```bash
npm run reset
```

**Xử lý sự cố khi đang quay**

| Tình huống | Cách xử lý |
| --- | --- |
| Thanh trạng thái chưa chuyển sang màu đỏ | Chờ thêm một đến hai giây, vì giao diện tự cập nhật mỗi giây |
| Đơn bị kẹt ở COMPENSATING | Chờ tối đa năm giây, hoặc chạy `npm run lab -- resume S6` |
| Phải quay lại một cảnh, mã đơn khác với kịch bản | Cứ đọc theo mã đang hiện trên màn hình |
| Muốn làm lại từ đầu | Chạy `npm run reset` |

Hướng dẫn chi tiết từng thao tác nằm trong [HUONG-DAN-DEMO.md](HUONG-DAN-DEMO.md). Lời dẫn đầy đủ cho buổi thuyết trình nằm trong [THUYET-TRINH.md](THUYET-TRINH.md).
