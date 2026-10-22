import type { BoardDocument, BoardComponent } from './board';
import type { CircuitComponent, CircuitDocument, CircuitNode, CircuitWire, ComponentKind, WireEndpoint } from './circuit';

/**
 * Maps BoardComponent types (from Gemini API) to CircuitComponent kinds.
 */
function mapComponentKind(type: string): ComponentKind {
  const lower = (type || '').toLowerCase();
  if (lower.includes('resistor') || lower === 'r') return 'R';
  if (lower.includes('inductor') || lower === 'l') return 'L';
  if (lower.includes('capacitor') || lower === 'c') return 'C';
  if (lower.includes('source') || lower.includes('voltage') || lower.includes('ac') || lower === 'vac') return 'VAC';
  if (lower.includes('ground') || lower.includes('gnd')) return 'GND';
  if (lower.includes('switch') || lower === 'sw') return 'SW';
  return 'R'; // fallback
}

/**
 * Parses numeric value from a string (e.g., "10k", "100u", "25", "4.7m").
 */
function parseNumericValue(valStr: string, unitStr: string, kind: ComponentKind): number {
  if (!valStr) {
    if (kind === 'VAC') return 1000;
    if (kind === 'R') return 10;
    if (kind === 'L') return 10;
    if (kind === 'C') return 100;
    return 0;
  }
  let v = parseFloat(valStr.replace(/[^0-9.-]/g, ''));
  if (isNaN(v) || v <= 0) {
    return kind === 'VAC' ? 1000 : kind === 'R' ? 10 : kind === 'L' ? 10 : kind === 'C' ? 100 : 0;
  }
  const combined = (valStr + ' ' + (unitStr || '')).toLowerCase();
  if (combined.includes('k') && !combined.includes('khz')) v *= 1000;
  if (combined.includes('m') && !combined.includes('mh') && !combined.includes('mhz') && !combined.includes('µ')) v *= 1000000;
  return v;
}

/**
 * Converts a BoardDocument (from Gemini AI recognition) into a CircuitDocument
 * that can be simulated, edited, and rendered in the interactive circuit editor.
 */
export function convertBoardToCircuit(board: BoardDocument): CircuitDocument {
  // Determine scale and offset to fit within standard canvas (1000 x 700)
  const pad = 60;
  const targetW = 880;
  const targetH = 580;

  const bWidth = Math.max(100, board.width || 1000);
  const bHeight = Math.max(100, board.height || 700);

  const scaleX = targetW / bWidth;
  const scaleY = targetH / bHeight;
  const scale = Math.min(scaleX, scaleY, 1.2);

  const mapX = (x: number) => Math.round(pad + x * scale);
  const mapY = (y: number) => Math.round(pad + y * scale);

  // 1. Convert components
  const components: CircuitComponent[] = board.components.map((part: BoardComponent) => {
    const kind = mapComponentKind(part.type);
    const value = parseNumericValue(part.value, part.unit, kind);
    return {
      id: part.id,
      label: part.reference || part.id.toUpperCase(),
      kind,
      value,
      x: mapX(part.x),
      y: mapY(part.y),
      rotation: part.rotation || 0,
      phase: 0,
      switchClosed: true,
    };
  });

  // Ensure there is at least one ground if missing
  const hasGnd = components.some(c => c.kind === 'GND');
  if (!hasGnd) {
    components.push({
      id: 'gnd_auto',
      label: 'GND',
      kind: 'GND',
      value: 0,
      x: 100,
      y: 500,
      rotation: 0,
      phase: 0,
      switchClosed: true,
    });
  }

  const hasSource = components.some(c => c.kind === 'VAC');
  if (!hasSource && components.length <= 1) {
    components.push({
      id: 'vac_auto',
      label: 'VAC',
      kind: 'VAC',
      value: 220,
      x: 100,
      y: 300,
      rotation: 0,
      phase: 0,
      switchClosed: true,
    });
  }

  // 2. Convert nodes
  const nodes: CircuitNode[] = (board.nodes || []).map(n => ({
    id: n.id,
    label: n.label || n.id,
    x: mapX(n.x),
    y: mapY(n.y),
  }));

  // 3. Convert connections to wires
  const wires: CircuitWire[] = [];
  const connectionGroups = new Map<string, Array<{ componentId: string; pinId: string }>>();
  let wireCount = 1;

  for (const conn of (board.connections as any[]) || []) {
    // If it's a direct endpoint connection { from, to }
    if (conn.from && conn.to) {
      const fromEp: WireEndpoint = conn.from.nodeId
        ? { type: 'node', nodeId: conn.from.nodeId }
        : { type: 'pin', componentId: conn.from.componentId, pinId: (conn.from.pinId || 'a') as 'a' | 'b' | 'g' };
      const toEp: WireEndpoint = conn.to.nodeId
        ? { type: 'node', nodeId: conn.to.nodeId }
        : { type: 'pin', componentId: conn.to.componentId, pinId: (conn.to.pinId || 'b') as 'a' | 'b' | 'g' };
      wires.push({
        id: conn.id || `w_auto_${wireCount++}`,
        from: fromEp,
        to: toEp,
        via: conn.via || [],
      });
      continue;
    }

    // Standard BoardConnection { componentId, pinId, nodeId }
    if (!conn.nodeId) continue;
    const group = connectionGroups.get(conn.nodeId) || [];
    group.push({ componentId: conn.componentId, pinId: conn.pinId });
    connectionGroups.set(conn.nodeId, group);
  }

  // Connect elements in the same node
  connectionGroups.forEach((endpoints, nodeId) => {
    const nodeExists = nodes.some(n => n.id === nodeId);
    if (nodeExists) {
      for (const ep of endpoints) {
        wires.push({
          id: `w_auto_${wireCount++}`,
          from: { type: 'pin', componentId: ep.componentId, pinId: (ep.pinId || 'a') as 'a' | 'b' | 'g' },
          to: { type: 'node', nodeId },
          via: [],
        });
      }
    } else if (endpoints.length >= 2) {
      // Direct connection between endpoints
      for (let i = 0; i < endpoints.length - 1; i++) {
        wires.push({
          id: `w_auto_${wireCount++}`,
          from: { type: 'pin', componentId: endpoints[i].componentId, pinId: (endpoints[i].pinId || 'a') as 'a' | 'b' | 'g' },
          to: { type: 'pin', componentId: endpoints[i + 1].componentId, pinId: (endpoints[i + 1].pinId || 'b') as 'a' | 'b' | 'g' },
          via: [],
        });
      }
    }
  });

  return {
    version: 2,
    frequency: (board as any).frequency || 50,
    components,
    nodes,
    wires,
  };
}
