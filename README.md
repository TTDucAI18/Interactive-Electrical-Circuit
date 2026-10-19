# Mạch điện tương tác

Website chỉnh sửa và tính toán mạch điện xoay chiều, viết bằng React, TypeScript và Vite. Trình soạn mạch chạy trên lưới tương tác, hỗ trợ kéo thả linh kiện/nút giao, nối hoặc xóa dây, xoay và sửa giá trị. Ngôn ngữ giao diện gồm tiếng Việt, Anh và Nga; mạch và ngôn ngữ được lưu trên thiết bị.

Bộ giải AC dùng phân tích nút mở rộng (MNA) cho điện trở, cuộn cảm, tụ điện, nguồn áp AC, nối đất và công tắc. Các kết quả gồm công suất, hệ số công suất, điện áp và dòng điện từng linh kiện. Nút **Xuất PDF** mở hộp thoại in/lưu PDF của trình duyệt.

Luồng **Ảnh → bo mạch** dùng Gemini qua Cloudflare Worker riêng để nhận diện sơ đồ nguyên lý thành linh kiện/nút nối hoặc dựng layout PCB từ phần linh kiện và đường đồng nhìn thấy. Có thể kéo linh kiện, chỉnh dữ liệu, lưu/mở file `.board.json`. Kiểm tra lại kết quả nhận diện trước khi dùng.

## Chạy trên máy

```bash
npm install
npm run dev
```

## Kiểm tra và build

```bash
npm test
npm run build
```

## Đăng lên GitHub Pages

Workflow trong `.github/workflows/deploy.yml` tự kiểm tra và build khi push lên `main`. Trong repository, mở **Settings → Pages** và chọn **GitHub Actions** làm nguồn deploy. Website sẽ có địa chỉ dạng `https://<tên-tài-khoản>.github.io/Interactive-Electrical-Circuit/`.

Để bật nhận diện ảnh, deploy Worker riêng theo [`workers/gemini-image-parser/README.md`](workers/gemini-image-parser/README.md). Thêm URL public của Worker dưới GitHub repository **Settings → Secrets and variables → Actions → Variables** với tên `IMAGE_TO_BOARD_API_URL`. Đây là endpoint public, không phải API key. Khi build local, sao chép `.env.example` thành `.env.local` và sửa endpoint.

## Mô hình mạch

Mạch mẫu khởi đầu giữ sơ đồ tham khảo RLC. Có thể sửa tự do hoặc đặt linh kiện mới trên canvas. Bộ giải dùng trạng thái ổn định hình sin; điện trở nhập bằng Ω, cuộn cảm bằng mH, tụ điện bằng µF, nguồn áp theo V RMS.
