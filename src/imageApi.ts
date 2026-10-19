import { validateBoard, type BoardDocument, type BoardMode } from './board';

const endpoint = import.meta.env.VITE_IMAGE_TO_BOARD_API_URL?.trim();

export async function imageToBoard(file: File, mode: BoardMode): Promise<BoardDocument> {
  if (!endpoint) throw new Error('Chưa cấu hình Gemini Worker. Hãy đặt VITE_IMAGE_TO_BOARD_API_URL theo hướng dẫn README.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Hãy chọn ảnh JPG, PNG hoặc WEBP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Ảnh vượt quá 8 MB. Hãy giảm kích thước ảnh rồi thử lại.');
  const imageData = await fileToDataUrl(file);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, imageData, mimeType: file.type }),
  });
  const payload = await response.json().catch(() => null) as { board?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || `Gemini Worker trả về lỗi (${response.status}).`);
  return validateBoard(payload?.board, mode);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc ảnh trên thiết bị này.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Ảnh tải lên không hợp lệ.'));
    reader.readAsDataURL(file);
  });
}
