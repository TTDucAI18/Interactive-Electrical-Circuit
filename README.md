# Mạch điện tương tác

Website chỉnh sửa và tính toán mạch điện xoay chiều, viết bằng React, TypeScript và Vite. Trình soạn mạch chạy trên lưới tương tác, hỗ trợ kéo thả linh kiện/nút giao, nối hoặc xóa dây, xoay và sửa giá trị. Ngôn ngữ giao diện gồm tiếng Việt, Anh và Nga; mạch và ngôn ngữ được lưu trên thiết bị.

Bộ giải AC dùng phân tích nút mở rộng (MNA) cho điện trở, cuộn cảm, tụ điện, nguồn áp AC, nối đất và công tắc. Các kết quả gồm công suất, hệ số công suất, điện áp và dòng điện từng linh kiện. Nút **Xuất PDF** mở hộp thoại in/lưu PDF của trình duyệt.

Luồng **Ảnh → bo mạch** gọi Gemini 3.8 Flash trực tiếp từ trình duyệt, tự chuyển sang Gemini 3 Flash Preview nếu model chính quá tải. Luồng này nhận diện sơ đồ nguyên lý hoặc dựng layout PCB từ phần linh kiện và đường đồng nhìn thấy. Có thể kéo linh kiện, chỉnh dữ liệu, lưu/mở file `.board.json`. Kiểm tra lại kết quả nhận diện trước khi dùng.

**Lưu ý về API key:** thêm Actions secret `GEMINI_API_KEY` trong **Settings → Secrets and variables → Actions**. Workflow giữ key ngoài Git và đưa vào bản build; vì website là public, key vẫn có thể xem trong mã trình duyệt sau khi deploy. Hãy giới hạn key theo referrer `https://ttducai18.github.io/*`, chỉ bật Generative Language API và đặt quota phù hợp.

## Chạy trên máy

```bash
npm install
npm run dev
```

## Kiểm tra Gemini API

Kiểm tra trực tiếp key và model trên máy local; mặc định nhập key ẩn trong terminal:

```bash
node scripts/test-gemini-api.mjs
node scripts/test-gemini-api.mjs --image ./test-data/circuit.png --mode schematic
```

Lưu ảnh vào đường dẫn local rồi thêm `--image` để kiểm tra nhận diện và board JSON. Có thể dùng key local trong `.env.local` bị Git bỏ qua bằng lệnh `node --env-file=.env.local scripts/test-gemini-api.mjs --image ./test-data/circuit.png --mode schematic`. `.env.local` chỉ phục vụ kiểm tra local; key đưa vào bundle website vẫn có thể bị người truy cập lấy.

## Kiểm tra và build

```bash
npm test
npm run build
```

## Đăng lên GitHub Pages

Workflow trong `.github/workflows/deploy.yml` tự kiểm tra và build khi push lên `main`. Trong repository, mở **Settings → Pages** và chọn **GitHub Actions** làm nguồn deploy. Website sẽ có địa chỉ dạng `https://<tên-tài-khoản>.github.io/Interactive-Electrical-Circuit/`.

Nhận diện ảnh gọi Gemini trực tiếp từ trình duyệt; không cần Worker. GitHub Actions cần secret `GEMINI_API_KEY` để đưa key vào bản build public.

## Mô hình mạch

Mạch mẫu khởi đầu giữ sơ đồ tham khảo RLC. Có thể sửa tự do hoặc đặt linh kiện mới trên canvas. Bộ giải dùng trạng thái ổn định hình sin; điện trở nhập bằng Ω, cuộn cảm bằng mH, tụ điện bằng µF, nguồn áp theo V RMS.
