import { normalizeRecognizedBoard, type BoardDocument, type BoardMode } from './board';
import { translate, type Language } from './i18n';
import { GEMINI_PUBLIC_API_KEY } from './geminiPublicKey';

const MODELS = [
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageProgress = { stage: 'preparing' | 'uploading' | 'waiting' | 'response' | 'decoding' | 'fallback'; model?: string; percent?: number; attempt?: number; totalModels?: number; reason?: 'busy' | 'timeout' | 'network' | 'quota' | 'unavailable' };
export type ImageApiErrorCode = 'apiKeyMissing' | 'invalidType' | 'tooLarge' | 'readFailed' | 'invalidImage' | 'apiKeyRejected' | 'quota' | 'overloaded' | 'modelUnavailable' | 'timeout' | 'api' | 'board';
export class ImageApiError extends Error {
  constructor(public code: ImageApiErrorCode, public status?: number, public detail?: string) { super(code); this.name = 'ImageApiError'; }
}

type GeminiResponse = {
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
};

const componentTypes = ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'transistor', 'ic', 'connector', 'switch', 'source', 'other'];
const coordinate = { type: 'number', minimum: 0, maximum: 1000 };
const boardResponseSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', enum: ['interactive-electrical-board'] },
    version: { type: 'integer' },
    mode: { type: 'string', enum: ['schematic', 'pcb'] },
    title: { type: 'string' },
    summary: { type: 'string' },
    width: { type: 'number', minimum: 1, maximum: 1000 },
    height: { type: 'number', minimum: 1, maximum: 1000 },
    components: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, reference: { type: 'string' }, type: { type: 'string', enum: componentTypes },
      value: { type: 'string' }, unit: { type: 'string' }, x: coordinate, y: coordinate,
      rotation: { type: 'number', minimum: -360, maximum: 360 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
      pins: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, label: { type: 'string' },
        x: { type: 'number', minimum: -250, maximum: 250 }, y: { type: 'number', minimum: -250, maximum: 250 },
      }, required: ['id', 'label', 'x', 'y'] } },
    }, required: ['id', 'reference', 'type', 'value', 'unit', 'x', 'y', 'rotation', 'confidence', 'pins'] } },
    nodes: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, label: { type: 'string' }, x: coordinate, y: coordinate,
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    }, required: ['id', 'label', 'x', 'y', 'confidence'] } },
    connections: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, componentId: { type: 'string' }, pinId: { type: 'string' }, nodeId: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    }, required: ['id', 'componentId', 'pinId', 'nodeId', 'confidence'] } },
    traces: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, layer: { type: 'string', enum: ['top', 'bottom', 'unknown'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      points: { type: 'array', items: { type: 'object', properties: { x: coordinate, y: coordinate }, required: ['x', 'y'] } },
    }, required: ['id', 'layer', 'confidence', 'points'] } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['format', 'version', 'mode', 'title', 'summary', 'width', 'height', 'components', 'nodes', 'connections', 'traces', 'notes'],
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
      generationConfig: {
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: 'low' },
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseJsonSchema: boardResponseSchema,
      },
    });
    let fallbackReason: ImageProgress['reason'];
    for (const [index, model] of MODELS.entries()) {
      if (index > 0) onProgress?.({ stage: 'fallback', model, attempt: index + 1, totalModels: MODELS.length, reason: fallbackReason });
      onProgress?.({ stage: 'uploading', model, percent: 0, attempt: index + 1, totalModels: MODELS.length });
      try {
        response = await sendToGemini(model, requestBody, onProgress, index + 1, MODELS.length);
      } catch (cause) {
        // Try another available model when Google times out or the request fails.
        if (index < MODELS.length - 1 && cause instanceof ImageApiError && (cause.code === 'timeout' || cause.code === 'api')) {
          fallbackReason = cause.code === 'timeout' ? 'timeout' : 'network';
          continue;
        }
        throw cause;
      }
      if (index < MODELS.length - 1 && [404, 429, 503].includes(response.status)) {
        fallbackReason = response.status === 404 ? 'unavailable' : response.status === 429 ? 'quota' : 'busy';
        continue;
      }
      break;
    }
  } catch (cause) {
    if (cause instanceof ImageApiError) throw cause;
    throw new ImageApiError('api');
  }

  if (!response) throw new ImageApiError('api');
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 429) throw new ImageApiError('quota', response.status);
    if (response.status === 401 || response.status === 403) throw new ImageApiError('apiKeyRejected', response.status);
    if (response.status === 503) throw new ImageApiError('overloaded', response.status);
    if (response.status === 404) throw new ImageApiError('modelUnavailable', response.status);
    throw new ImageApiError('api', response.status);
  }

  onProgress?.({ stage: 'decoding' });
  const candidate = response.payload?.candidates?.[0];
  const generated = candidate?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!generated) {
    const reason = response.payload?.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'empty response';
    console.warn('Gemini returned no board JSON:', reason);
    throw new ImageApiError('board', undefined, reason);
  }
  try {
    return normalizeRecognizedBoard(parseJsonResponse(generated), mode, translate(language, 'aiConnectionRepair'));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.warn('Gemini board response could not be decoded:', detail);
    throw new ImageApiError('board', undefined, detail);
  }
}

function parseJsonResponse(value: string): unknown {
  const cleaned = value.replace(/^\uFEFF/, '').trim();
  try { return JSON.parse(cleaned) as unknown; } catch { /* try common model wrappers */ }

  const unfenced = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(unfenced) as unknown; } catch { /* locate a JSON object if the model added a short preamble */ }

  const start = unfenced.indexOf('{');
  if (start < 0) throw new Error('Gemini response did not contain a JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < unfenced.length; index += 1) {
    const character = unfenced[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return JSON.parse(unfenced.slice(start, index + 1)) as unknown;
  }
  throw new Error('Gemini response ended before its JSON object was complete.');
}

function sendToGemini(model: string, body: string, onProgress: ((progress: ImageProgress) => void) | undefined, attempt: number, totalModels: number): Promise<{ status: number; payload: GeminiResponse | null }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const report = (progress: ImageProgress) => onProgress?.({ ...progress, attempt, totalModels });
    request.open('POST', `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('x-goog-api-key', GEMINI_PUBLIC_API_KEY);
    request.timeout = 45_000;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) report({ stage: 'uploading', model, percent: Math.round(event.loaded / event.total * 100) });
    });
    request.upload.addEventListener('load', () => report({ stage: 'waiting', model }));
    request.addEventListener('readystatechange', () => {
      if (request.readyState === XMLHttpRequest.HEADERS_RECEIVED) report({ stage: 'response', model });
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
  const common = `Analyze the attached image. Return one JSON object only, with no markdown. Use this format exactly: {"format":"interactive-electrical-board","version":1,"mode":"${mode}","title":"","summary":"","width":1000,"height":1000,"components":[{"id":"unique-id","reference":"R1","type":"resistor","value":"","unit":"","x":500,"y":500,"rotation":0,"confidence":0.8,"pins":[{"id":"1","label":"1","x":-40,"y":0},{"id":"2","label":"2","x":40,"y":0}]}],"nodes":[{"id":"N1","label":"N1","x":500,"y":500,"confidence":0.8}],"connections":[{"id":"C1","componentId":"unique-id","pinId":"1","nodeId":"N1","confidence":0.8}],"traces":[{"id":"T1","layer":"unknown","confidence":0.8,"points":[{"x":100,"y":200},{"x":400,"y":200}]}],"notes":[]}. Use coordinates from 0 to 1000, stable unique ids, and confidence from 0 to 1. Pin x/y are offsets from the component center, not board coordinates. Every component pin may connect to at most one node; never return duplicate connections. Component types: resistor, capacitor, inductor, diode, led, transistor, ic, connector, switch, source, other. Use empty strings for unreadable values. Write title, summary, notes, and human-readable pin labels in ${outputLanguage}. Never invent components, wires, or electrical connections. Include concise notes about uncertainty.`;
  if (mode === 'schematic') return `${common}\nThis is a circuit schematic. Identify visible symbols, designators, values, pins, junctions, and only wire continuities that are clearly visible. Each connection must refer to an existing component id, pin id, and node id. Crossings without a junction are separate nodes. Place components near their visible positions. If the image is not a circuit schematic, return empty components, nodes, connections, and traces arrays, and explain why in notes.`;
  return `${common}\nThis is a photograph or drawing of a physical PCB. Identify visible component footprints, designators, values and positions, plus only copper traces clearly visible in the image. Do not infer hidden copper layers, vias, netlists, or connections obscured by components. Return connections and nodes as empty arrays unless the pad-to-pad connection is completely visible. If this is not a PCB, return empty components, nodes, connections, and traces arrays, and explain why in notes.`;
}
