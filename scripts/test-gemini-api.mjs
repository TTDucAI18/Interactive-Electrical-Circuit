#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const imageMimeTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function parseArgs(args) {
  const options = { model: DEFAULT_MODEL, imagePath: undefined, mode: 'schematic', help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--model') options.model = args[++index] ?? '';
    else if (argument === '--image') options.imagePath = args[++index];
    else if (argument === '--mode') options.mode = args[++index] ?? '';
    else throw new Error(`Tham số không được hỗ trợ: ${argument}`);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(options.model)) throw new Error('Model ID không hợp lệ.');
  if (!['schematic', 'pcb'].includes(options.mode)) throw new Error('--mode chỉ nhận schematic hoặc pcb.');
  if (options.imagePath && !imageMimeTypes.has(extname(options.imagePath).toLowerCase())) {
    throw new Error('Ảnh phải là JPG, PNG hoặc WEBP.');
  }
  return options;
}

function showHelp() {
  console.log(`Kiểm tra Gemini API bằng key nhập ẩn hoặc GEMINI_API_KEY trong môi trường local.

Cách dùng:
  node scripts/test-gemini-api.mjs
  node scripts/test-gemini-api.mjs --image ./circuit.png --mode schematic
  node scripts/test-gemini-api.mjs --image ./pcb.jpg --mode pcb
  node --env-file=.env.local scripts/test-gemini-api.mjs --image ./circuit.png
  node scripts/test-gemini-api.mjs --model gemini-3.8-flash

Không truyền key trên dòng lệnh hoặc đưa vào frontend. Mặc định kiểm tra text + JSON;
thêm --image để kiểm tra ảnh và nhận board JSON theo cấu trúc của ứng dụng.`);
}

async function readSecret() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Hãy chạy lệnh này trong terminal tương tác để nhập key ẩn.');
  }

  process.stdout.write('Nhập Gemini API key mới (ký tự sẽ được ẩn): ');
  const previousRawMode = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const secret = await new Promise((resolveSecret, reject) => {
    let value = '';
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          process.stdin.off('data', onData);
          reject(new Error('Đã hủy.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolveSecret(value.trim());
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    process.stdin.on('data', onData);
  }).finally(() => {
    process.stdin.setRawMode(Boolean(previousRawMode));
    process.stdin.pause();
  });

  if (!secret) throw new Error('Bạn chưa nhập API key.');
  return secret;
}

async function makeRequestBody(options) {
  const simpleSchema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      visibleObjects: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'visibleObjects'],
  };

  if (!options.imagePath) {
    return {
      contents: [{ role: 'user', parts: [{ text: 'Return a JSON object with summary set to exactly "GEMINI_API_OK" and visibleObjects set to an empty array.' }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 256, responseMimeType: 'application/json', responseJsonSchema: simpleSchema },
    };
  }

  const image = await readFile(resolve(options.imagePath));
  if (image.byteLength > 8 * 1024 * 1024) throw new Error('Ảnh vượt giới hạn 8 MB.');
  const mimeType = imageMimeTypes.get(extname(options.imagePath).toLowerCase());
  const componentTypes = ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'transistor', 'ic', 'connector', 'switch', 'source', 'other'];
  const boardSchema = {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['interactive-electrical-board'] },
      version: { type: 'integer' },
      mode: { type: 'string', enum: ['schematic', 'pcb'] },
      title: { type: 'string' }, summary: { type: 'string' },
      width: { type: 'number', minimum: 1, maximum: 1000 }, height: { type: 'number', minimum: 1, maximum: 1000 },
      components: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, reference: { type: 'string' }, type: { type: 'string', enum: componentTypes },
        value: { type: 'string' }, unit: { type: 'string' },
        x: { type: 'number', minimum: 0, maximum: 1000 }, y: { type: 'number', minimum: 0, maximum: 1000 },
        rotation: { type: 'number', minimum: -360, maximum: 360 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
        pins: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, label: { type: 'string' },
          x: { type: 'number', minimum: -250, maximum: 250 }, y: { type: 'number', minimum: -250, maximum: 250 },
        }, required: ['id', 'label', 'x', 'y'] } },
      }, required: ['id', 'reference', 'type', 'value', 'unit', 'x', 'y', 'rotation', 'confidence', 'pins'] } },
      nodes: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, label: { type: 'string' },
        x: { type: 'number', minimum: 0, maximum: 1000 }, y: { type: 'number', minimum: 0, maximum: 1000 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      }, required: ['id', 'label', 'x', 'y', 'confidence'] } },
      connections: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, componentId: { type: 'string' }, pinId: { type: 'string' }, nodeId: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      }, required: ['id', 'componentId', 'pinId', 'nodeId', 'confidence'] } },
      traces: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, layer: { type: 'string', enum: ['top', 'bottom', 'unknown'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        points: { type: 'array', items: { type: 'object', properties: {
          x: { type: 'number', minimum: 0, maximum: 1000 }, y: { type: 'number', minimum: 0, maximum: 1000 },
        }, required: ['x', 'y'] } },
      }, required: ['id', 'layer', 'confidence', 'points'] } },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['format', 'version', 'mode', 'title', 'summary', 'width', 'height', 'components', 'nodes', 'connections', 'traces', 'notes'],
  };
  const task = options.mode === 'pcb'
    ? 'Analyze this physical PCB image. Extract visible components and only copper traces clearly visible in the photo. Never infer hidden layers, vias, or electrical connections that cannot be followed visually.'
    : 'Analyze this circuit schematic. Extract component symbols, readable designators and values, pin positions, junction nodes, and only connections supported by visible wire continuity. Treat uninterrupted wire as the same electrical node, including labeled points along that wire. Do not invent unclear labels, values, components, or connections.';
  const prompt = `${task} Return only board JSON matching the schema. Use a 0-1000 coordinate system. Pin x/y are offsets from the component center, not board coordinates. Each component pin may connect to at most one node. Set format to "interactive-electrical-board", version 1, and mode to "${options.mode}". Use stable unique IDs. For unreadable component values or labels, use an empty string and add a concise note. Include confidence from 0 to 1. If this is not the requested image type, return empty components, nodes, connections, and traces arrays and explain why in notes.`;

  return {
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType, data: image.toString('base64') } },
    ] }],
    generationConfig: { thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 8192, responseMimeType: 'application/json', responseJsonSchema: boardSchema },
  };
}

function getApiError(body, key) {
  if (!body?.error || typeof body.error !== 'object') return 'Google returned an error without a readable message.';
  return JSON.stringify(body.error).split(key).join('[redacted]').replace(/[\r\n]+/g, ' ').slice(0, 1500);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return showHelp();

  const apiKey = process.env.GEMINI_API_KEY?.trim() || await readSecret();
  const body = await makeRequestBody(options);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json().catch(() => null);

  console.log(`Model: ${options.model}`);
  console.log(`HTTP: ${response.status}`);
  if (!response.ok) {
    console.error(`Gemini trả lỗi: ${getApiError(result, apiKey)}`);
    process.exitCode = 1;
    return;
  }

  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) throw new Error('API trả HTTP thành công nhưng không có nội dung.');
  const json = JSON.parse(text);
  if (options.imagePath) {
    if (json.format !== 'interactive-electrical-board' || json.version !== 1 || json.mode !== options.mode || !Array.isArray(json.components) || !Array.isArray(json.nodes) || !Array.isArray(json.connections) || !Array.isArray(json.traces) || !Array.isArray(json.notes)) {
      throw new Error('API trả kết quả nhưng JSON không khớp cấu trúc bo mạch.');
    }
    console.log(`Kết quả: thành công — API key, model, ảnh và board JSON hợp lệ (${json.components.length} linh kiện, ${json.nodes.length} nút, ${json.connections.length} kết nối).`);
    console.log('Board JSON để rà soát:');
    console.log(JSON.stringify(json, null, 2));
  } else {
    if (typeof json.summary !== 'string' || !Array.isArray(json.visibleObjects)) {
      throw new Error('API trả kết quả nhưng JSON không khớp schema kiểm tra.');
    }
    console.log('Kết quả: thành công — API key, model, generateContent và JSON hợp lệ.');
    console.log(`Phản hồi: ${json.summary}`);
  }
  if (result?.usageMetadata?.totalTokenCount) console.log(`Token sử dụng: ${result.usageMetadata.totalTokenCount}`);
}

main().catch((error) => {
  console.error(`Không thể kiểm tra Gemini API: ${error.message}`);
  process.exitCode = 1;
});
