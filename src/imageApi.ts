import { validateBoard, type BoardDocument, type BoardMode } from './board';
import type { Language } from './i18n';
import { GEMINI_PUBLIC_API_KEY } from './geminiPublicKey';

const MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3-flash-preview';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageProgress = { stage: 'preparing' | 'uploading' | 'waiting' | 'response' | 'decoding' | 'fallback'; model?: string; percent?: number };
export type ImageApiErrorCode = 'apiKeyMissing' | 'invalidType' | 'tooLarge' | 'readFailed' | 'invalidImage' | 'apiKeyRejected' | 'quota' | 'timeout' | 'api' | 'board';
export class ImageApiError extends Error {
  constructor(public code: ImageApiErrorCode, public status?: number) { super(code); this.name = 'ImageApiError'; }
}

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export async function imageToBoard(file: File, mode: BoardMode, language: Language, onProgress?: (progress: ImageProgress) => void): Promise<BoardDocument> {
  if (!GEMINI_PUBLIC_API_KEY) throw new ImageApiError('apiKeyMissing');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ImageApiError('invalidType');
  if (file.size > MAX_IMAGE_BYTES) throw new ImageApiError('tooLarge');
  onProgress?.({ stage: 'preparing' });
  const imageData = await fileToDataUrl(file);
  const base64 = imageData.slice(imageData.indexOf(',') + 1);

  let response: { status: number; payload: GeminiResponse | null } | undefined;
  try {
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: buildPrompt(mode, language) },
        { inlineData: { mimeType: file.type, data: base64 } },
      ] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });
    for (const [index, model] of [MODEL, FALLBACK_MODEL].entries()) {
      if (index === 1) onProgress?.({ stage: 'fallback', model });
      onProgress?.({ stage: 'uploading', model, percent: 0 });
      response = await sendToGemini(model, requestBody, onProgress);
      if (response.status !== 503 || index === 1) break;
    }
  } catch (cause) {
    if (cause instanceof ImageApiError) throw cause;
    throw new ImageApiError('api');
  }

  if (!response) throw new ImageApiError('api');
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 429) throw new ImageApiError('quota', response.status);
    if (response.status === 401 || response.status === 403) throw new ImageApiError('apiKeyRejected', response.status);
    throw new ImageApiError('api', response.status);
  }

  onProgress?.({ stage: 'decoding' });
  const generated = response.payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!generated) throw new ImageApiError('board');
  try {
    return validateBoard(JSON.parse(generated), mode);
  } catch { throw new ImageApiError('board'); }
}

function sendToGemini(model: string, body: string, onProgress?: (progress: ImageProgress) => void): Promise<{ status: number; payload: GeminiResponse | null }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('x-goog-api-key', GEMINI_PUBLIC_API_KEY);
    request.timeout = 90_000;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.({ stage: 'uploading', model, percent: Math.round(event.loaded / event.total * 100) });
    });
    request.upload.addEventListener('load', () => onProgress?.({ stage: 'waiting', model }));
    request.addEventListener('readystatechange', () => {
      if (request.readyState === XMLHttpRequest.HEADERS_RECEIVED) onProgress?.({ stage: 'response', model });
    });
    request.addEventListener('load', () => {
      let payload: GeminiResponse | null = null;
      try { payload = JSON.parse(request.responseText) as GeminiResponse; } catch { /* handled as an invalid response below */ }
      resolve({ status: request.status, payload });
    });
    request.addEventListener('error', () => reject(new ImageApiError('api')));
    request.addEventListener('timeout', () => reject(new ImageApiError('timeout')));
    request.addEventListener('abort', () => reject(new ImageApiError('api')));
    request.send(body);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageApiError('readFailed'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new ImageApiError('invalidImage'));
    reader.readAsDataURL(file);
  });
}

function buildPrompt(mode: BoardMode, language: Language) {
  const outputLanguage = language === 'vi' ? 'Vietnamese' : language === 'ru' ? 'Russian' : 'English';
  const common = `Analyze the attached image. Return one JSON object only, with no markdown. Use this format exactly: {"format":"interactive-electrical-board","version":1,"mode":"${mode}","title":"","summary":"","width":1000,"height":1000,"components":[{"id":"unique-id","reference":"R1","type":"resistor","value":"","unit":"","x":500,"y":500,"rotation":0,"confidence":0.8,"pins":[{"id":"1","label":"1","x":-40,"y":0},{"id":"2","label":"2","x":40,"y":0}]}],"nodes":[{"id":"N1","label":"N1","x":500,"y":500,"confidence":0.8}],"connections":[{"id":"C1","componentId":"unique-id","pinId":"1","nodeId":"N1","confidence":0.8}],"traces":[{"id":"T1","layer":"unknown","confidence":0.8,"points":[{"x":100,"y":200},{"x":400,"y":200}]}],"notes":[]}. Use coordinates from 0 to 1000, stable unique ids, and confidence from 0 to 1. Component types: resistor, capacitor, inductor, diode, led, transistor, ic, connector, switch, source, other. Use empty strings for unreadable values. Write title, summary, notes, and human-readable pin labels in ${outputLanguage}. Never invent components, wires, or electrical connections. Include concise notes about uncertainty.`;
  if (mode === 'schematic') return `${common}\nThis is a circuit schematic. Identify visible symbols, designators, values, pins, junctions, and only wire continuities that are clearly visible. Each connection must refer to an existing component id, pin id, and node id. Crossings without a junction are separate nodes. Place components near their visible positions. If the image is not a circuit schematic, return empty components, nodes, connections, and traces arrays, and explain why in notes.`;
  return `${common}\nThis is a photograph or drawing of a physical PCB. Identify visible component footprints, designators, values and positions, plus only copper traces clearly visible in the image. Do not infer hidden copper layers, vias, netlists, or connections obscured by components. Return connections and nodes as empty arrays unless the pad-to-pad connection is completely visible. If this is not a PCB, return empty components, nodes, connections, and traces arrays, and explain why in notes.`;
}
