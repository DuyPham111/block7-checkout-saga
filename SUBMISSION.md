# Thông tin gói nộp

- **Tên gói:** `7-Block7-23127045-23127102-23127159-23127183-23127393.zip`
- **Nhóm 07:** 23127045 · 23127102 · 23127159 · 23127183 · 23127393
- **Repository:** https://github.com/DuyPham111/block7-checkout-saga. Mã nguồn nộp là tag `submit`, trùng với nội dung gói ZIP.
- **Nội dung:** mã nguồn, dữ liệu ban đầu (`data/seed/`), README.md, REPORT.md, REPORT.html, AUDIT.md, tài liệu (`docs/`), slide (`presentation/`), evidence (`evidence/`).
- **Không kèm:** `node_modules`, file DB lúc chạy (`data/*.db`), `run/`, `logs/`, `.git`. Cài lại thư viện bằng `npm ci`; DB tự tạo từ seed khi chạy `npm run reset`.
- **Evidence** trong `evidence/` là output của lượt chạy thật ngày 05/11/2026 (Windows 11, Node 22.16.0). Không sửa tay số liệu. Tái tạo bằng `npm run test:report`, `npm run evidence`, `npm run baseline`.
- **Video demo H0, F1–F6 trên UI:** sáu video trên YouTube (bảng bên dưới), quay theo [docs/KICH-BAN-VIDEO.md](docs/KICH-BAN-VIDEO.md). Ảnh UI lúc pending và lúc kết thúc chụp trong lúc quay: [evidence/video-screens/](evidence/video-screens/).
- **`CHECKSUMS.sha256`** liệt kê SHA-256 của mọi file trong gói. Kiểm tra bằng `sha256sum -c CHECKSUMS.sha256` (Git Bash, Linux, macOS).
- **Tạo gói** từ repository (chỉ gồm file được git theo dõi):

  ```bash
  git archive --format=zip -o ../7-Block7-23127045-23127102-23127159-23127183-23127393.zip HEAD
  ```

## Video demo

| # | Video | Link |
| --- | --- | --- |
| 1 | Giới thiệu và vấn đề khi không có Saga · **H0**: mua hàng thành công | https://youtu.be/_dfllA9-DJw |
| 2 | **F1**: kho từ chối (hết hàng) · **F2**: ví không đủ tiền, nhả hàng về kho | https://youtu.be/ZUiL-FsvjRI |
| 3 | **F3**: xác nhận bị từ chối sau khi đã thu tiền | https://youtu.be/CgvdUpj-yQ4 |
| 4 | **F4**: kill Payment sau khi đã thu (RECOVERING) | https://youtu.be/5yMqGiMj3yI |
| 5 | **F5**: hoàn tiền lỗi tạm thời (COMPENSATING) | https://youtu.be/mwye_u-j5YU |
| 6 | **F6**: kill orchestrator tại khoảng hở | https://youtu.be/FR5FmQmFBwg |

## Đọc gói theo thứ tự

1. [README.md](README.md): triển khai và chạy thử.
2. [REPORT.html](REPORT.html): báo cáo dạng slide (mở bằng trình duyệt, offline; bấm **📖 Đọc tài liệu** để xem mọi slide kèm giải thích).
3. [REPORT.md](REPORT.md): giải thích chi tiết từng lựa chọn của nhóm.
4. [AUDIT.md](AUDIT.md): đối chiếu yêu cầu đề với nơi hiện thực và bằng chứng.
5. [evidence/SUMMARY.md](evidence/SUMMARY.md), [evidence/test-output.txt](evidence/test-output.txt): số liệu đo được.
6. [docs/NGUYEN-LY.md](docs/NGUYEN-LY.md), [docs/HUONG-DAN-DEMO.md](docs/HUONG-DAN-DEMO.md), [docs/THUYET-TRINH.md](docs/THUYET-TRINH.md): nguyên lý, demo, kịch bản trình bày.

## Kiểm tra nhanh sau khi giải nén

```bash
npm ci
npm test
npm run reset
```

`npm test` phải ra `30 passed`. Sau `npm run reset`, mở http://127.0.0.1:3000 (app), http://127.0.0.1:3000/docs (Swagger).
