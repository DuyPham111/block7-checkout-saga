# Thông tin gói nộp

- **Tên gói:** `7-Block7-23127045-23127102-23127159-23127183-23127393.zip`
- **Nhóm 07:** 23127045 · 23127102 · 23127159 · 23127183 · 23127393
- **Repository:** https://github.com/DuyPham111/block7-checkout-saga (nhánh `main`)
- **Nội dung:** mã nguồn, dữ liệu ban đầu (`data/seed/`), README.md, REPORT.md, REPORT.html, AUDIT.md, tài liệu (`docs/`), slide (`presentation/`), evidence (`evidence/`).
- **Không kèm:** `node_modules`, file DB lúc chạy (`data/*.db`), `run/`, `logs/`, `.git`. Cài lại thư viện bằng `npm ci`; DB tự tạo từ seed khi chạy `npm run reset`.
- **Evidence** trong `evidence/` là output của lượt chạy thật ngày 05/11/2026 (Windows 11, Node 22.16.0). Không sửa tay số liệu. Tái tạo bằng `npm run test:report`, `npm run evidence`, `npm run baseline`.
- **Video demo H0, F1–F6 trên UI:** quay theo [docs/KICH-BAN-VIDEO.md](docs/KICH-BAN-VIDEO.md) (7 cảnh, khoảng 6 phút) và nộp kèm. Nộp dưới dạng link thì ghi link vào đây: _(chưa có)_. Ảnh UI lúc pending và lúc kết thúc lưu ở `evidence/video-screens/`.
- **Tạo gói** từ repository (chỉ gồm file được git theo dõi):

  ```bash
  git archive --format=zip -o ../7-Block7-23127045-23127102-23127159-23127183-23127393.zip HEAD
  ```

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
