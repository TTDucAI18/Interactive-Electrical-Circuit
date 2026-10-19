export type BoardMode = 'schematic' | 'pcb';

export type BoardPin = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type BoardComponent = {
  id: string;
  reference: string;
  type: string;
  value: string;
  unit: string;
  x: number;
  y: number;
  rotation: number;
  confidence: number;
  pins: BoardPin[];
};

export type BoardNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  confidence: number;
};

export type BoardConnection = {
  id: string;
  componentId: string;
  pinId: string;
  nodeId: string;
  confidence: number;
};

export type BoardTrace = {
  id: string;
  layer: 'top' | 'bottom' | 'unknown';
  confidence: number;
  points: Array<{ x: number; y: number }>;
};

export type BoardDocument = {
  format: 'interactive-electrical-board';
  version: 1;
  mode: BoardMode;
  title: string;
  summary: string;
  width: number;
  height: number;
  components: BoardComponent[];
  nodes: BoardNode[];
  connections: BoardConnection[];
  traces: BoardTrace[];
  notes: string[];
};

const knownTypes = new Set(['resistor', 'capacitor', 'inductor', 'diode', 'led', 'transistor', 'ic', 'connector', 'switch', 'source', 'other']);
const numberInRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim().slice(0, 120) : fallback;

export function validateBoard(value: unknown, expectedMode?: BoardMode): BoardDocument {
  if (!value || typeof value !== 'object') throw new Error('JSON bo mạch không hợp lệ.');
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (raw.format !== 'interactive-electrical-board' || raw.version !== 1 || (mode !== 'schematic' && mode !== 'pcb')) {
    throw new Error('Định dạng file bo mạch không được hỗ trợ.');
  }
  if (expectedMode && mode !== expectedMode) throw new Error('Loại ảnh trả về không khớp với chế độ đã chọn.');
  if (!Array.isArray(raw.components) || raw.components.length > 160) throw new Error('Số lượng linh kiện trong JSON không hợp lệ.');
  if (!Array.isArray(raw.nodes) || raw.nodes.length > 300) throw new Error('Số lượng nút nối trong JSON không hợp lệ.');
  if (!Array.isArray(raw.connections) || raw.connections.length > 600) throw new Error('Số lượng kết nối trong JSON không hợp lệ.');
  if (!Array.isArray(raw.traces) || raw.traces.length > 600) throw new Error('Số đường mạch trong JSON không hợp lệ.');
  const ids = new Set<string>();
  const components = raw.components.map((item): BoardComponent => {
    if (!item || typeof item !== 'object') throw new Error('Một linh kiện trong JSON bị lỗi.');
    const part = item as Record<string, unknown>;
    const id = text(part.id);
    if (!id || ids.has(id)) throw new Error('Mã linh kiện bị trống hoặc trùng nhau.');
    ids.add(id);
    if (!numberInRange(part.x, 0, 1000) || !numberInRange(part.y, 0, 1000)) throw new Error(`Tọa độ linh kiện ${text(part.reference, id)} không hợp lệ.`);
    if (!numberInRange(part.confidence, 0, 1) || !Array.isArray(part.pins) || part.pins.length > 20) throw new Error(`Thông tin linh kiện ${text(part.reference, id)} không hợp lệ.`);
    const localPinIds = new Set<string>();
    const pins = part.pins.map((pin): BoardPin => {
      if (!pin || typeof pin !== 'object') throw new Error('Chân linh kiện không hợp lệ.');
      const value = pin as Record<string, unknown>;
      if (!text(value.id) || !numberInRange(value.x, -250, 250) || !numberInRange(value.y, -250, 250)) throw new Error(`Vị trí chân của ${text(part.reference, id)} không hợp lệ.`);
      if (localPinIds.has(text(value.id))) throw new Error(`Mã chân của ${text(part.reference, id)} bị trùng.`);
      localPinIds.add(text(value.id));
      return { id: text(value.id), label: text(value.label, text(value.id)), x: value.x, y: value.y };
    });
    return {
      id,
      reference: text(part.reference, id),
      type: knownTypes.has(text(part.type)) ? text(part.type) : 'other',
      value: text(part.value),
      unit: text(part.unit),
      x: part.x,
      y: part.y,
      rotation: numberInRange(part.rotation, -360, 360) ? part.rotation : 0,
      confidence: part.confidence,
      pins,
    };
  });
  const nodeIds = new Set<string>();
  const nodes = raw.nodes.map((item): BoardNode => {
    if (!item || typeof item !== 'object') throw new Error('Một nút nối trong JSON bị lỗi.');
    const node = item as Record<string, unknown>;
    const id = text(node.id);
    if (!id || nodeIds.has(id) || !numberInRange(node.x, 0, 1000) || !numberInRange(node.y, 0, 1000) || !numberInRange(node.confidence, 0, 1)) throw new Error('Thông tin nút nối trong JSON không hợp lệ.');
    nodeIds.add(id);
    return { id, label: text(node.label, id), x: node.x, y: node.y, confidence: node.confidence };
  });
  const pinIds = new Set(components.flatMap((part) => part.pins.map((pin) => `${part.id}:${pin.id}`)));
  const connections = raw.connections.map((item): BoardConnection => {
    if (!item || typeof item !== 'object') throw new Error('Một kết nối trong JSON bị lỗi.');
    const edge = item as Record<string, unknown>;
    const id = text(edge.id);
    const componentId = text(edge.componentId);
    const pinId = text(edge.pinId);
    const nodeId = text(edge.nodeId);
    if (!id || !pinIds.has(`${componentId}:${pinId}`) || !nodeIds.has(nodeId) || !numberInRange(edge.confidence, 0, 1)) throw new Error(`Kết nối ${id || '(chưa đặt tên)'} tham chiếu linh kiện hoặc nút không tồn tại.`);
    return { id, componentId, pinId, nodeId, confidence: edge.confidence };
  });
  const connectionPins = new Set<string>();
  const connectionIds = new Set<string>();
  for (const edge of connections) {
    const pin = `${edge.componentId}:${edge.pinId}`;
    if (connectionPins.has(pin) || connectionIds.has(edge.id)) throw new Error(`Kết nối ${edge.id} bị trùng trong JSON.`);
    connectionPins.add(pin);
    connectionIds.add(edge.id);
  }
  const traces = raw.traces.map((item): BoardTrace => {
    if (!item || typeof item !== 'object') throw new Error('Một đường mạch trong JSON bị lỗi.');
    const trace = item as Record<string, unknown>;
    if (!text(trace.id) || !numberInRange(trace.confidence, 0, 1) || !Array.isArray(trace.points) || trace.points.length < 2 || trace.points.length > 100) throw new Error('Thông tin đường mạch trong JSON không hợp lệ.');
    const layer = trace.layer === 'top' || trace.layer === 'bottom' ? trace.layer : 'unknown';
    const points = trace.points.map((point) => {
      if (!point || typeof point !== 'object') throw new Error('Tọa độ đường mạch không hợp lệ.');
      const p = point as Record<string, unknown>;
      if (!numberInRange(p.x, 0, 1000) || !numberInRange(p.y, 0, 1000)) throw new Error('Tọa độ đường mạch không hợp lệ.');
      return { x: p.x, y: p.y };
    });
    return { id: text(trace.id), layer, confidence: trace.confidence, points };
  });
  return {
    format: 'interactive-electrical-board',
    version: 1,
    mode,
    title: text(raw.title, 'Bo mạch vừa nhận diện'),
    summary: text(raw.summary),
    width: numberInRange(raw.width, 1, 1000) ? raw.width : 1000,
    height: numberInRange(raw.height, 1, 1000) ? raw.height : 700,
    components,
    nodes,
    connections,
    traces,
    notes: Array.isArray(raw.notes) ? raw.notes.filter((note): note is string => typeof note === 'string').map((note) => note.slice(0, 240)).slice(0, 30) : [],
  };
}

export function updateBoardComponent(board: BoardDocument, componentId: string, patch: Partial<Pick<BoardComponent, 'reference' | 'type' | 'value' | 'unit' | 'x' | 'y' | 'rotation'>>): BoardDocument {
  return { ...board, components: board.components.map((part) => part.id === componentId ? { ...part, ...patch } : part) };
}
