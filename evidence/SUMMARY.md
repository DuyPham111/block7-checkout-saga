# Evidence tổng hợp — H0, F1–F6

Chạy lúc 2026-11-05T04:00:13.530Z bằng `npm run evidence` (reset dữ liệu lab, 3 process thật, kill/start thật cho F4 và F6).
Cấu hình: timeout gọi service 2000ms · vòng phục hồi 1000ms · backoff 1000/2000/4000/5000ms.

| ID | Tình huống | Đơn | Trạng thái giữa chừng | Trạng thái cuối | Ledger của đơn | Oracle | Thời gian hội tụ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H0 | Thành công | O1 | - | CONFIRMED | C1 charge CHARGED | ĐẠT 6/6 | - |
| F1 | Kho từ chối (hết hàng) | O2 | - | CANCELLED | trống | ĐẠT 5/5 | - |
| F2 | Thanh toán thất bại (ví không đủ) | O3 | - | CANCELLED | C2 charge FAILED | ĐẠT 5/5 | - |
| F3 | Xác nhận đơn bị từ chối sau khi đã thu tiền | O4 | - | CANCELLED | C3 charge CHARGED, RF1 refund REFUNDED | ĐẠT 7/7 | - |
| F4 | Payment chết sau khi đã thu, trước response | O5 | RECOVERING (khi-payment-dung) | CONFIRMED | C4 charge CHARGED | ĐẠT 8/8 | 679ms |
| F5 | Hoàn tiền lỗi tạm thời | O6 | COMPENSATING (khi-refund-loi) | CANCELLED | C5 charge CHARGED, RF2 refund REFUNDED | ĐẠT 8/8 | 1290ms |
| F6 | Orchestrator chết tại khoảng hở | O7 | RESERVED (sau-khi-dung) | CONFIRMED | C6 charge CHARGED | ĐẠT 9/9 | 535ms |

Chi tiết từng tình huống: `evidence/<ID>/timeline.txt` (timeline + snapshot 3 kho) và `evidence/<ID>/result.json`.
