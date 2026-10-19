import { validateBoard, type BoardDocument, type BoardMode } from './board';
import type { Language } from './i18n';

const endpoint = import.meta.env.VITE_IMAGE_TO_BOARD_API_URL?.trim();

export type ImageApiErrorCode = 'workerConfig' | 'invalidType' | 'tooLarge' | 'readFailed' | 'invalidImage' | 'worker' | 'board';
export class ImageApiError extends Error {
  constructor(public code: ImageApiErrorCode, public status?: number) { super(code); this.name = 'ImageApiError'; }
}

export async function imageToBoard(file: File, mode: BoardMode, language: Language): Promise<BoardDocument> {
  if (!endpoint) throw new ImageApiError('workerConfig');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ImageApiError('invalidType');
  if (file.size > 8 * 1024 * 1024) throw new ImageApiError('tooLarge');
  const imageData = await fileToDataUrl(file);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, language, imageData, mimeType: file.type }),
    });
  } catch { throw new ImageApiError('worker'); }
  const payload = await response.json().catch(() => null) as { board?: unknown } | null;
  if (!response.ok) throw new ImageApiError('worker', response.status);
  try { return validateBoard(payload?.board, mode); }
  catch { throw new ImageApiError('board'); }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageApiError('readFailed'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new ImageApiError('invalidImage'));
    reader.readAsDataURL(file);
  });
}
