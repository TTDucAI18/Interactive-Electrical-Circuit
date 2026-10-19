interface Env {
  GEMINI_API_KEY: string;
  MODEL?: string;
  ALLOWED_ORIGINS?: string;
  IMAGE_IMPORT_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

type Mode = 'schematic' | 'pcb';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 11 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FALLBACK_ORIGINS = ['https://ttducai18.github.io', 'http://localhost:5173'];
const componentTypes = ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'transistor', 'ic', 'connector', 'switch', 'source', 'other'];

const boardSchema = {
  type: 'OBJECT',
  properties: {
    format: { type: 'STRING', enum: ['interactive-electrical-board'] },
    version: { type: 'INTEGER', enum: [1] },
    mode: { type: 'STRING', enum: ['schematic', 'pcb'] },
    title: { type: 'STRING' }, summary: { type: 'STRING' },
    width: { type: 'NUMBER', minimum: 1, maximum: 1000 }, height: { type: 'NUMBER', minimum: 1, maximum: 1000 },
    components: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, reference: { type: 'STRING' }, type: { type: 'STRING', enum: componentTypes },
      value: { type: 'STRING' }, unit: { type: 'STRING' },
      x: { type: 'NUMBER', minimum: 0, maximum: 1000 }, y: { type: 'NUMBER', minimum: 0, maximum: 1000 },
      rotation: { type: 'NUMBER', minimum: -360, maximum: 360 }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      pins: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        id: { type: 'STRING' }, label: { type: 'STRING' },
        x: { type: 'NUMBER', minimum: -250, maximum: 250 }, y: { type: 'NUMBER', minimum: -250, maximum: 250 },
      }, required: ['id', 'label', 'x', 'y'] } },
    }, required: ['id', 'reference', 'type', 'value', 'unit', 'x', 'y', 'rotation', 'confidence', 'pins'] } },
    nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, label: { type: 'STRING' }, x: { type: 'NUMBER', minimum: 0, maximum: 1000 },
      y: { type: 'NUMBER', minimum: 0, maximum: 1000 }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
    }, required: ['id', 'label', 'x', 'y', 'confidence'] } },
    connections: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, componentId: { type: 'STRING' }, pinId: { type: 'STRING' }, nodeId: { type: 'STRING' }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
    }, required: ['id', 'componentId', 'pinId', 'nodeId', 'confidence'] } },
    traces: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, layer: { type: 'STRING', enum: ['top', 'bottom', 'unknown'] }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      points: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        x: { type: 'NUMBER', minimum: 0, maximum: 1000 }, y: { type: 'NUMBER', minimum: 0, maximum: 1000 },
      }, required: ['x', 'y'] } },
    }, required: ['id', 'layer', 'confidence', 'points'] } },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['format', 'version', 'mode', 'title', 'summary', 'width', 'height', 'components', 'nodes', 'connections', 'traces', 'notes'],
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? FALLBACK_ORIGINS.join(','))
      .split(',').map((value) => value.trim()).filter(Boolean);
    const corsOrigin = allowedOrigins.includes(origin) ? origin : '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const respond = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });

    if (request.method === 'OPTIONS') return corsOrigin ? new Response(null, { status: 204, headers: corsHeaders }) : respond({ error: 'Origin không được phép.' }, 403);
    if (!corsOrigin) return respond({ error: 'Origin không được phép.' }, 403);
    if (new URL(request.url).pathname !== '/api/parse-image') return respond({ error: 'Không tìm thấy endpoint.' }, 404);
    if (request.method !== 'POST') return respond({ error: 'Chỉ hỗ trợ POST.' }, 405);
    if (!env.GEMINI_API_KEY) return respond({ error: 'Worker chưa được cấu hình Gemini API key.' }, 503);
    const contentLength = Number(request.headers.get('Content-Length') ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) return respond({ error: 'Ảnh vượt quá giới hạn 8 MB.' }, 413);

    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = await env.IMAGE_IMPORT_LIMITER.limit({ key: `image-import:${clientIp}` });
    if (!limit.success) return respond({ error: 'Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Hãy đợi một phút rồi thử lại.' }, 429);

    let body: { mode?: unknown; imageData?: unknown; mimeType?: unknown };
    try {
      const raw = await request.arrayBuffer();
      if (raw.byteLength > MAX_REQUEST_BYTES) return respond({ error: 'Ảnh vượt quá giới hạn 8 MB.' }, 413);
      body = JSON.parse(new TextDecoder().decode(raw)) as typeof body;
    } catch { return respond({ error: 'Dữ liệu ảnh không phải JSON hợp lệ.' }, 400); }
    if (body.mode !== 'schematic' && body.mode !== 'pcb') return respond({ error: 'Chọn sơ đồ nguyên lý hoặc ảnh PCB.' }, 400);
    if (typeof body.mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(body.mimeType)) return respond({ error: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.' }, 415);
    if (typeof body.imageData !== 'string') return respond({ error: 'Thiếu dữ liệu ảnh.' }, 400);
    const image = body.imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!image || image[1] !== body.mimeType) return respond({ error: 'Ảnh tải lên không hợp lệ.' }, 400);
    if (Math.floor(image[2].length * 3 / 4) > MAX_IMAGE_BYTES) return respond({ error: 'Ảnh vượt quá giới hạn 8 MB.' }, 413);

    try {
      const model = env.MODEL || 'gemini-3.8-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { text: buildPrompt(body.mode) },
            { inlineData: { mimeType: body.mimeType, data: image[2] } },
          ] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: boardSchema },
        }),
      });
      if (!response.ok) return respond({ error: 'Gemini không phân tích được ảnh lúc này. Hãy thử lại hoặc dùng ảnh rõ hơn.' }, 502);
      const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const generated = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
      if (!generated) return respond({ error: 'Gemini không trả về dữ liệu bo mạch.' }, 502);
      const board = JSON.parse(generated) as Record<string, unknown>;
      if (board.mode !== body.mode || !Array.isArray(board.components) || board.components.length > 160 || !Array.isArray(board.nodes) || board.nodes.length > 300 || !Array.isArray(board.connections) || board.connections.length > 600 || !Array.isArray(board.traces) || board.traces.length > 600) {
        return respond({ error: 'Kết quả AI không khớp với cấu trúc bo mạch yêu cầu.' }, 502);
      }
      return respond({ board });
    } catch { return respond({ error: 'Không thể kết nối Gemini. Kiểm tra cấu hình Worker và thử lại.' }, 502); }
  },
};

function buildPrompt(mode: Mode) {
  const common = `Analyze the attached image and return only the requested board JSON. Use a 0-1000 coordinate system for the board. Set format to "interactive-electrical-board", version to 1, and mode to "${mode}". List visible components with stable unique ids, references, normalized positions, rotation, confidence from 0 to 1, and pin offsets relative to component center within -250 to 250. Use an empty string when a value or label cannot be read. Include concise notes for ambiguous details. Never invent components or electrical connections that are not visible.`;
  if (mode === 'schematic') return `${common}\nThis is a circuit schematic. Extract component symbols, readable designators and values, pin positions relative to each symbol center, junction nodes, and only connections supported by visible wire continuity. Each connection must reference an existing component id, pin id, and node id. Represent crossings without a junction as separate nodes. If this is not a circuit schematic, return empty components, nodes, connections, and traces arrays and explain why in notes.`;
  return `${common}\nThis is a photograph or drawing of a physical PCB. Extract component footprints and visible locations, plus only copper traces or conductive paths clearly visible in this image. Trace points use 0-1000 coordinates. Do not infer hidden copper layers, vias, a netlist, or connections from traces that cannot be followed visually. Return connections and nodes as empty arrays unless a pad-to-pad connection is completely visible. If this is not a PCB, return empty components, nodes, connections, and traces arrays and explain why in notes.`;
}
