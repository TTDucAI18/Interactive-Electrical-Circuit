# Mạch RLC · Phòng thực hành

Website mô phỏng mạch điện xoay chiều RLC, viết bằng React, TypeScript và Vite. Phép tính RLC chạy hoàn toàn trong trình duyệt. Luồng nhận diện ảnh gửi ảnh đến Gemini qua Worker riêng.

Ứng dụng cũng có luồng **Ảnh → bo mạch**: Gemini nhận diện sơ đồ nguyên lý thành linh kiện/nút nối hoặc dựng layout PCB từ phần linh kiện và đường đồng nhìn thấy. Có thể kéo linh kiện, chỉnh dữ liệu, lưu/mở file `.board.json`. Kết quả nhận diện cần được kiểm tra trước khi dùng.

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

Mạch có tám vị trí linh kiện theo sơ đồ tham khảo. Mỗi vị trí có thể chứa nhiều linh kiện mắc nối tiếp; các nhánh kết nối theo sơ đồ cố định. Bộ giải dùng trở kháng phức và phân tích nút cho nguồn hình sin ở trạng thái ổn định. Điện trở nhập bằng Ω, cuộn cảm bằng mH, tụ điện bằng µF.
