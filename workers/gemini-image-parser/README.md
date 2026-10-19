# Gemini image-to-board Worker

Worker này nhận ảnh từ website, gọi Gemini và trả về board JSON đã giới hạn định dạng. `GEMINI_API_KEY` chỉ tồn tại dưới dạng Cloudflare Worker secret; không dùng biến `VITE_*`, không commit secret và không gửi key từ trình duyệt.

## Cấu hình một lần

1. Tạo key mới trong Google AI Studio vì key đã dán vào hội thoại cần được thu hồi. Không dán key mới vào chat hoặc source code.
2. Cài Wrangler 4.36 trở lên và đăng nhập vào tài khoản Cloudflare:

   ```bash
   npx wrangler@latest login
   npx wrangler@latest secret put GEMINI_API_KEY --config workers/gemini-image-parser/wrangler.toml
   ```

   Dán key mới trực tiếp vào prompt tương tác trong terminal. Wrangler lưu key dưới dạng secret của Worker.
3. Deploy Worker:

   ```bash
   npx wrangler@latest deploy --config workers/gemini-image-parser/wrangler.toml
   ```

4. Sao chép URL Worker có dạng `https://iec-image-to-board.<subdomain>.workers.dev`. Ở GitHub repository, thêm Actions variable `IMAGE_TO_BOARD_API_URL` với giá trị `https://...workers.dev/api/parse-image`, sau đó chạy lại workflow Pages hoặc push commit mới.
5. Nếu dùng domain khác, cập nhật `ALLOWED_ORIGINS` trong `wrangler.toml`. Giá trị là origin, không kèm path `/Interactive-Electrical-Circuit/`.

## Giới hạn bảo vệ

- Chỉ nhận `POST /api/parse-image` từ các origin đã cấu hình.
- Ảnh JPG, PNG hoặc WEBP tối đa 8 MB.
- Rate limit 6 yêu cầu mỗi phút trên mỗi IP để hạn chế lạm dụng quota.
- Ảnh không được lưu bởi Worker; chỉ truyền đến Gemini trong yêu cầu phân tích.

Origin check/CORS không phải cơ chế xác thực người dùng. Rate limit giúp hạn chế gọi dồn nhưng không bảo đảm chống lạm dụng có chủ đích. Theo dõi usage và billing của Gemini sau khi công khai endpoint.

## JSON bo mạch

File `.board.json` dùng schema version 1. Sơ đồ nguyên lý chứa linh kiện, chân, nút nối và kết nối; PCB chứa vị trí linh kiện cùng đường đồng nhìn thấy. Tọa độ chuẩn hóa 0–1000. PCB không tự suy đoán lớp đồng bị che và chưa phải file Gerber sản xuất.
