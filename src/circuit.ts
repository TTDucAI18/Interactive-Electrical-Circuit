export type ComponentKind = 'R' | 'L' | 'C' | 'VAC' | 'GND' | 'SW';
export type PinId = 'a' | 'b' | 'g';
export type WireEndpoint = { type: 'pin'; componentId: string; pinId: PinId } | { type: 'node'; nodeId: string };
export type Point = { x: number; y: number };

export type CircuitComponent = {
  id: string;
  label: string;
  kind: ComponentKind;
  value: number;
  x: number;
  y: number;
  rotation: number;
  phase: number;
  switchClosed: boolean;
};

export type CircuitNode = { id: string; label: string; x: number; y: number };
export type WireRouteAxis = 'x' | 'y';
export type CircuitWire = { id: string; from: WireEndpoint; to: WireEndpoint; via: Point[]; routeAxis?: WireRouteAxis };
export type CircuitDocument = { version: 2; frequency: number; components: CircuitComponent[]; nodes: CircuitNode[]; wires: CircuitWire[] };
export type Complex = { re: number; im: number };
export type ComponentResult = { voltage: Complex; current: Complex; impedance: Complex | null };
export type CircuitResult = {
  activePower: number;
  reactivePower: number;
  apparentPower: number;
  powerFactor: number;
  components: Record<string, ComponentResult>;
  nodes: Record<string, Complex>;
};

export type CircuitErrorCode = 'frequency' | 'ground' | 'source' | 'value' | 'unwired' | 'short' | 'unstable';
export class CircuitError extends Error {
  constructor(public code: CircuitErrorCode, message: string) { super(message); this.name = 'CircuitError'; }
}
const validEditableNumber = (value: number) => Number.isFinite(value) || Number.isNaN(value);

const c = (re: number, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  if (d < 1e-28) throw new CircuitError('unstable', 'This circuit has a zero impedance branch.');
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const mag = (a: Complex) => Math.hypot(a.re, a.im);
const conj = (a: Complex) => c(a.re, -a.im);
const polar = (magnitude: number, degrees: number): Complex => c(magnitude * Math.cos(degrees * Math.PI / 180), magnitude * Math.sin(degrees * Math.PI / 180));

export const units: Partial<Record<ComponentKind, string>> = { R: 'Ω', L: 'mH', C: 'µF', VAC: 'V RMS' };

export function componentPins(component: Pick<CircuitComponent, 'kind' | 'x' | 'y' | 'rotation'>, scale = 1): Array<{ pinId: PinId; x: number; y: number }> {
  const angle = component.rotation * Math.PI / 180;
  const local = component.kind === 'GND'
    ? [{ pinId: 'g' as const, x: 0, y: -20 }]
    : [{ pinId: 'a' as const, x: -30, y: 0 }, { pinId: 'b' as const, x: 30, y: 0 }];
  return local.map((pin) => ({
    pinId: pin.pinId,
    x: component.x + (pin.x * Math.cos(angle) - pin.y * Math.sin(angle)) * scale,
    y: component.y + (pin.x * Math.sin(angle) + pin.y * Math.cos(angle)) * scale,
  }));
}

function endpointKey(endpoint: WireEndpoint): string {
  return endpoint.type === 'pin' ? `pin:${endpoint.componentId}:${endpoint.pinId}` : `node:${endpoint.nodeId}`;
}

class UnionFind {
  private parent = new Map<string, string>();
  add(id: string) { if (!this.parent.has(id)) this.parent.set(id, id); }
  find(id: string): string {
    this.add(id);
    const parent = this.parent.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function impedance(component: CircuitComponent, frequency: number): Complex {
  const omega = 2 * Math.PI * frequency;
  if (component.kind === 'R') return c(component.value);
  if (component.kind === 'L') return c(0, omega * component.value / 1000);
  if (component.kind === 'C') return c(0, -1 / (omega * component.value / 1_000_000));
  return c(Number.POSITIVE_INFINITY);
}

function solveLinear(matrix: Complex[][], vector: Complex[]): Complex[] {
  const n = vector.length;
  if (n === 0) return [];
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (mag(a[row][col]) > mag(a[pivot][col])) pivot = row;
    if (mag(a[pivot][col]) < 1e-12) throw new CircuitError('unstable', 'The circuit is open, floating, or has no stable solution. Check the wires and ground.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pivotValue = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] = div(a[col][j], pivotValue);
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] = sub(a[row][j], mul(factor, a[col][j]));
    }
  }
  return a.map((row) => row[n]);
}

/** AC steady-state modified nodal analysis for R, L, C, ideal voltage sources, grounds, and switches. */
export function calculateCircuit(input: CircuitDocument): CircuitResult {
  if (!(input.frequency > 0) || !Number.isFinite(input.frequency)) throw new CircuitError('frequency', 'Frequency must be greater than zero.');
  const componentsById = new Map(input.components.map((part) => [part.id, part]));
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const wiresByPin = new Set<string>();
  const union = new UnionFind();
  const groundKeys: string[] = [];

  for (const node of input.nodes) union.add(`node:${node.id}`);
  for (const component of input.components) {
    const pins = componentPins(component);
    for (const pin of pins) {
      const key = `pin:${component.id}:${pin.pinId}`;
      union.add(key);
      if (component.kind === 'GND') groundKeys.push(key);
    }
    if (['R', 'L', 'C', 'VAC'].includes(component.kind) && (!(component.value > 0) || !Number.isFinite(component.value))) {
      throw new CircuitError('value', `${component.label || component.kind} must have a value greater than zero.`);
    }
    if (component.kind === 'VAC' && !Number.isFinite(component.phase)) throw new CircuitError('value', `${component.label} has an invalid phase.`);
  }
  const sources = input.components.filter((part) => part.kind === 'VAC');
  const closedSwitches = input.components.filter((part) => part.kind === 'SW' && part.switchClosed);

  for (const wire of input.wires) {
    const from = endpointKey(wire.from);
    const to = endpointKey(wire.to);
    if (wire.from.type === 'node' && !nodeIds.has(wire.from.nodeId)) throw new CircuitError('unwired', 'A wire refers to a missing junction.');
    if (wire.to.type === 'node' && !nodeIds.has(wire.to.nodeId)) throw new CircuitError('unwired', 'A wire refers to a missing junction.');
    if (wire.from.type === 'pin' && !componentsById.has(wire.from.componentId)) throw new CircuitError('unwired', 'A wire refers to a missing component.');
    if (wire.to.type === 'pin' && !componentsById.has(wire.to.componentId)) throw new CircuitError('unwired', 'A wire refers to a missing component.');
    union.union(from, to);
    if (wire.from.type === 'pin') wiresByPin.add(from);
    if (wire.to.type === 'pin') wiresByPin.add(to);
  }
  if (groundKeys.length === 0 || groundKeys.every((key) => !wiresByPin.has(key))) throw new CircuitError('ground', 'Add a ground symbol and connect it to the circuit.');
  if (sources.length === 0) throw new CircuitError('source', 'Add at least one AC voltage source.');
  for (const key of groundKeys.slice(1)) union.union(groundKeys[0], key);
  for (const component of input.components) {
    if (component.kind === 'GND') continue;
    for (const pin of componentPins(component)) {
      if (!wiresByPin.has(`pin:${component.id}:${pin.pinId}`)) throw new CircuitError('unwired', `${component.label} has an unconnected terminal.`);
    }
  }

  const groundRoot = union.find(groundKeys[0]);
  const rootOf = (component: CircuitComponent, pin: PinId) => union.find(`pin:${component.id}:${pin}`);
  const usedRoots = new Set<string>();
  for (const component of input.components) {
    for (const pin of componentPins(component)) usedRoots.add(union.find(`pin:${component.id}:${pin.pinId}`));
  }
  usedRoots.delete(groundRoot);
  const rootIndex = new Map([...usedRoots].map((root, index) => [root, index]));
  const n = rootIndex.size;
  const idealBranches = [...sources, ...closedSwitches.filter((branch) => rootOf(branch, 'a') !== rootOf(branch, 'b'))];
  const matrix = Array.from({ length: n + idealBranches.length }, () => Array.from({ length: n + idealBranches.length }, () => c(0)));
  const rhs = Array.from({ length: n + idealBranches.length }, () => c(0));
  const addAt = (row: number | undefined, col: number | undefined, value: Complex) => {
    if (row !== undefined && col !== undefined) matrix[row][col] = add(matrix[row][col], value);
  };
  const stampAdmittance = (a: string, b: string, y: Complex) => {
    const ia = a === groundRoot ? undefined : rootIndex.get(a);
    const ib = b === groundRoot ? undefined : rootIndex.get(b);
    addAt(ia, ia, y); addAt(ib, ib, y);
    addAt(ia, ib, c(-y.re, -y.im)); addAt(ib, ia, c(-y.re, -y.im));
  };

  const componentImpedances = new Map<string, Complex>();
  for (const component of input.components) {
    if (!['R', 'L', 'C'].includes(component.kind)) continue;
    const z = impedance(component, input.frequency);
    componentImpedances.set(component.id, z);
    const a = rootOf(component, 'a');
    const b = rootOf(component, 'b');
    if (a !== b) stampAdmittance(a, b, div(c(1), z));
  }

  const branchRows = new Map<string, number>();
  idealBranches.forEach((branch, branchIndex) => {
    const row = n + branchIndex;
    const a = rootOf(branch, 'a');
    const b = rootOf(branch, 'b');
    if (a === b) {
      if (branch.kind === 'VAC') throw new CircuitError('short', `${branch.label} is shorted by the wires.`);
      // A switch across an existing wire is electrically redundant; its current is indeterminate.
      return;
    }
    const ia = a === groundRoot ? undefined : rootIndex.get(a);
    const ib = b === groundRoot ? undefined : rootIndex.get(b);
    addAt(ia, row, c(1)); addAt(ib, row, c(-1));
    addAt(row, ia, c(1)); addAt(row, ib, c(-1));
    rhs[row] = branch.kind === 'VAC' ? polar(branch.value, branch.phase) : c(0);
    branchRows.set(branch.id, row);
  });

  const solved = solveLinear(matrix, rhs);
  const voltageByRoot = new Map<string, Complex>([[groundRoot, c(0)]]);
  for (const [root, index] of rootIndex) voltageByRoot.set(root, solved[index]);
  const voltageAt = (component: CircuitComponent, pin: PinId) => voltageByRoot.get(rootOf(component, pin)) ?? c(0);
  const results: Record<string, ComponentResult> = {};
  let totalPower = c(0);
  for (const component of input.components) {
    if (component.kind === 'GND') { results[component.id] = { voltage: c(0), current: c(0), impedance: null }; continue; }
    const voltage = sub(voltageAt(component, 'a'), voltageAt(component, 'b'));
    if (component.kind === 'R' || component.kind === 'L' || component.kind === 'C') {
      const z = componentImpedances.get(component.id)!;
      const current = div(voltage, z);
      totalPower = add(totalPower, mul(voltage, conj(current)));
      results[component.id] = { voltage, current, impedance: z };
    } else if (component.kind === 'VAC') {
      results[component.id] = { voltage: polar(component.value, component.phase), current: solved[branchRows.get(component.id)!], impedance: null };
    } else {
      const row = component.switchClosed ? branchRows.get(component.id) : undefined;
      results[component.id] = { voltage, current: row === undefined ? c(0) : solved[row], impedance: null };
    }
  }
  const apparentPower = Math.hypot(totalPower.re, totalPower.im);
  const nodeVoltages: Record<string, Complex> = {};
  for (const node of input.nodes) nodeVoltages[node.id] = voltageByRoot.get(union.find(`node:${node.id}`)) ?? c(0);
  return {
    activePower: totalPower.re,
    reactivePower: totalPower.im,
    apparentPower,
    powerFactor: apparentPower < 1e-12 ? 0 : Math.abs(totalPower.re / apparentPower),
    components: results,
    nodes: nodeVoltages,
  };
}

function pin(componentId: string, pinId: PinId): WireEndpoint { return { type: 'pin', componentId, pinId }; }
function node(nodeId: string): WireEndpoint { return { type: 'node', nodeId }; }
function part(id: string, label: string, kind: ComponentKind, x: number, y: number, value: number, rotation = 0): CircuitComponent {
  return { id, label, kind, x, y, value, rotation, phase: 0, switchClosed: true };
}
function wire(id: string, from: WireEndpoint, to: WireEndpoint, ...via: Point[]): CircuitWire { return { id, from, to, via }; }

/** Starter network equivalent to the original eight-slot RLC reference circuit. */
export function createDefaultCircuit(): CircuitDocument {
  const components = [
    part('v1', 'V1', 'VAC', 55, 175, 24, 90),
    part('g1', 'GND', 'GND', 55, 285, 0),
    part('r1', 'R1', 'R', 174, 85, 10),
    part('r2', 'R2', 'R', 174, 265, 10),
    part('l4', 'L4', 'L', 380, 85, 68),
    part('r3', 'R3', 'R', 380, 265, 22),
    part('c5', 'C5', 'C', 270, 130, 100, 90),
    part('r6', 'R6', 'R', 270, 220, 15, 90),
    part('r7', 'R7', 'R', 490, 175, 47, 90),
    part('c8', 'C8', 'C', 615, 175, 220, 90),
  ];
  const nodes = [
    { id: 'source+', label: 'V+', x: 92, y: 85 }, { id: 'ground', label: 'GND', x: 92, y: 265 },
    { id: 'a+', label: 'N1', x: 270, y: 85 }, { id: 'a-', label: 'N2', x: 270, y: 265 },
    { id: 'b+', label: 'N3', x: 490, y: 85 }, { id: 'b-', label: 'N4', x: 490, y: 265 },
    { id: 'mid', label: 'N5', x: 270, y: 175 },
  ];
  const wires = [
    wire('w-v-plus', pin('v1', 'a'), node('source+'), { x: 55, y: 85 }),
    wire('w-v-minus', pin('v1', 'b'), node('ground'), { x: 55, y: 265 }),
    wire('w-ground', pin('g1', 'g'), node('ground')),
    wire('w-r1-a', pin('r1', 'a'), node('source+')), wire('w-r1-b', pin('r1', 'b'), node('a+')),
    wire('w-r2-a', pin('r2', 'a'), node('ground')), wire('w-r2-b', pin('r2', 'b'), node('a-')),
    wire('w-l4-a', pin('l4', 'a'), node('a+')), wire('w-l4-b', pin('l4', 'b'), node('b+')),
    wire('w-r3-a', pin('r3', 'a'), node('a-')), wire('w-r3-b', pin('r3', 'b'), node('b-')),
    wire('w-c5-a', pin('c5', 'a'), node('a+')), wire('w-c5-b', pin('c5', 'b'), node('mid')),
    wire('w-r6-a', pin('r6', 'a'), node('mid')), wire('w-r6-b', pin('r6', 'b'), node('a-')),
    wire('w-r7-a', pin('r7', 'a'), node('b+')), wire('w-r7-b', pin('r7', 'b'), node('b-')),
    wire('w-c8-a', pin('c8', 'a'), node('b+'), { x: 615, y: 85 }), wire('w-c8-b', pin('c8', 'b'), node('b-'), { x: 615, y: 265 }),
  ];
  return { version: 2, frequency: 50, components, nodes, wires };
}

export function validateCircuit(value: unknown): CircuitDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid circuit document.');
  const circuit = value as CircuitDocument;
  if (circuit.version !== 2 || !validEditableNumber(circuit.frequency) || !Array.isArray(circuit.components) || !Array.isArray(circuit.nodes) || !Array.isArray(circuit.wires)) throw new Error('Unsupported circuit document.');
  if (circuit.components.length > 200 || circuit.nodes.length > 400 || circuit.wires.length > 800) throw new Error('Circuit is too large.');
  const componentIds = new Set<string>();
  for (const component of circuit.components) {
    if (!component.id || componentIds.has(component.id) || typeof component.label !== 'string' || !['R', 'L', 'C', 'VAC', 'GND', 'SW'].includes(component.kind) || !Number.isFinite(component.x) || !Number.isFinite(component.y) || !Number.isFinite(component.rotation) || !validEditableNumber(component.value) || !validEditableNumber(component.phase) || typeof component.switchClosed !== 'boolean' || component.x < 0 || component.x > 1000 || component.y < 0 || component.y > 700) throw new Error('A component has invalid fields.');
    componentIds.add(component.id);
  }
  const nodeIds = new Set<string>();
  for (const item of circuit.nodes) {
    if (!item.id || nodeIds.has(item.id) || typeof item.label !== 'string' || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 0 || item.x > 1000 || item.y < 0 || item.y > 700) throw new Error('A junction has invalid fields.');
    nodeIds.add(item.id);
  }
  const wireIds = new Set<string>();
  for (const edge of circuit.wires) {
    const endpoints = [edge.from, edge.to];
    if (!edge.id || wireIds.has(edge.id) || !Array.isArray(edge.via) || edge.via.length > 20 || (edge.routeAxis !== undefined && edge.routeAxis !== 'x' && edge.routeAxis !== 'y')) throw new Error('A wire has invalid fields.');
    wireIds.add(edge.id);
    for (const endpoint of endpoints) {
      if (endpoint.type === 'node' && !nodeIds.has(endpoint.nodeId)) throw new Error('A wire refers to a missing junction.');
      if (endpoint.type === 'pin') {
        const component = circuit.components.find((item) => item.id === endpoint.componentId);
        if (!component || !componentPins(component).some((pinItem) => pinItem.pinId === endpoint.pinId)) throw new Error('A wire refers to a missing terminal.');
      }
    }
    for (const point of edge.via) if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 700) throw new Error('A wire waypoint is outside the canvas.');
  }
  return circuit;
}

const invalidNumberMarker = '__iec_invalid_number__';
export function serializeCircuit(circuit: CircuitDocument): string {
  return JSON.stringify(circuit, (_key, value: unknown) => Number.isNaN(value) ? { [invalidNumberMarker]: true } : value);
}
export function deserializeCircuit(serialized: string): CircuitDocument {
  const value: unknown = JSON.parse(serialized, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>)[invalidNumberMarker] === true) return Number.NaN;
    return item;
  });
  return validateCircuit(value);
}

export function moveCircuitComponent(circuit: CircuitDocument, componentId: string, position: Point): CircuitDocument {
  return { ...circuit, components: circuit.components.map((part) => part.id === componentId ? { ...part, x: position.x, y: position.y } : part) };
}
export function moveCircuitNode(circuit: CircuitDocument, nodeId: string, position: Point): CircuitDocument {
  return { ...circuit, nodes: circuit.nodes.map((item) => item.id === nodeId ? { ...item, x: position.x, y: position.y } : item) };
}
export function snapCircuitPoint(
  circuit: CircuitDocument,
  point: Point,
  moving?: { kind: 'component' | 'node'; id: string },
  grid = 20,
  tolerance = 12,
  enabled = true,
  componentScale = 1,
): { position: Point; guides: { x?: number; y?: number } } {
  const clamp = (value: number, max: number) => Math.max(16, Math.min(max - 16, Math.round(value)));
  if (!enabled) return { position: { x: clamp(point.x, 1000), y: clamp(point.y, 700) }, guides: {} };

  const targets: Point[] = [];
  for (const part of circuit.components) {
    if (moving?.kind === 'component' && part.id === moving.id) continue;
    targets.push({ x: part.x, y: part.y }, ...componentPins(part, componentScale).map(({ x, y }) => ({ x, y })));
  }
  for (const node of circuit.nodes) {
    if (moving?.kind === 'node' && node.id === moving.id) continue;
    targets.push({ x: node.x, y: node.y });
  }

  const anchors: Point[] = [{ x: 0, y: 0 }];
  if (moving?.kind === 'component') {
    const part = circuit.components.find((item) => item.id === moving.id);
    if (part) anchors.push(...componentPins(part, componentScale).map(({ x, y }) => ({ x: x - part.x, y: y - part.y })));
  }

  const snapAxis = (axis: 'x' | 'y') => {
    const alignments = targets.flatMap((target) => anchors.map((anchor) => {
      const delta = target[axis] - (point[axis] + anchor[axis]);
      return { delta, line: target[axis] };
    })).filter((candidate) => Math.abs(candidate.delta) <= tolerance)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    const gridValue = Math.round(point[axis] / grid) * grid;
    const gridDelta = gridValue - point[axis];
    const gridIsClose = Math.abs(gridDelta) <= tolerance;
    const alignment = alignments[0];

    // Nearby terminals/nodes take precedence over the visual grid. Grid snapping is soft:
    // the cursor stays free when the closest grid line is outside the magnetic radius.
    if (alignment) {
      return { value: point[axis] + alignment.delta, guide: alignment.line };
    }
    return { value: gridIsClose ? gridValue : point[axis], guide: undefined };
  };

  const x = snapAxis('x');
  const y = snapAxis('y');
  return {
    position: { x: clamp(x.value, 1000), y: clamp(y.value, 700) },
    guides: { x: x.guide, y: y.guide },
  };
}

export function circuitEndpointPoint(circuit: CircuitDocument, endpoint: WireEndpoint, componentScale = 1): Point {
  if (endpoint.type === 'node') {
    const node = circuit.nodes.find((item) => item.id === endpoint.nodeId);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  }
  const component = circuit.components.find((item) => item.id === endpoint.componentId);
  return component
    ? componentPins(component, componentScale).find((pin) => pin.pinId === endpoint.pinId) ?? { x: component.x, y: component.y }
    : { x: 0, y: 0 };
}

export function circuitWireRouteAxis(wire: CircuitWire, from: Point, to: Point): WireRouteAxis {
  if (wire.routeAxis) return wire.routeAxis;
  if (wire.via.length >= 2) {
    const sameX = Math.abs(wire.via[0].x - wire.via[1].x) < 0.5;
    const sameY = Math.abs(wire.via[0].y - wire.via[1].y) < 0.5;
    return sameX ? 'x' : sameY ? 'y' : 'x';
  }
  if (wire.via.length === 1) {
    const bend = wire.via[0];
    if (Math.abs(bend.y - from.y) < 0.5 || Math.abs(bend.y - to.y) < 0.5) return 'x';
    if (Math.abs(bend.x - from.x) < 0.5 || Math.abs(bend.x - to.x) < 0.5) return 'y';
  }
  return Math.abs(to.y - from.y) >= 1 ? 'x' : 'y';
}

export function routeCircuitWire(circuit: CircuitDocument, wireId: string, axis: WireRouteAxis, coordinate: number, componentScale = 1): CircuitDocument {
  const wire = circuit.wires.find((item) => item.id === wireId);
  if (!wire) return circuit;
  const from = circuitEndpointPoint(circuit, wire.from, componentScale);
  const to = circuitEndpointPoint(circuit, wire.to, componentScale);
  const via = axis === 'x'
    ? [{ x: coordinate, y: from.y }, { x: coordinate, y: to.y }]
    : [{ x: from.x, y: coordinate }, { x: to.x, y: coordinate }];
  return { ...circuit, wires: circuit.wires.map((item) => item.id === wireId ? { ...item, via, routeAxis: axis } : item) };
}

export function resetCircuitWireRoute(circuit: CircuitDocument, wireId: string): CircuitDocument {
  return { ...circuit, wires: circuit.wires.map((wire) => wire.id === wireId ? { ...wire, via: [], routeAxis: undefined } : wire) };
}
export function connectCircuitEndpoints(circuit: CircuitDocument, wire: CircuitWire): CircuitDocument {
  const keys = [endpointKey(wire.from), endpointKey(wire.to)].sort();
  if (keys[0] === keys[1] || circuit.wires.some((edge) => [endpointKey(edge.from), endpointKey(edge.to)].sort().join('|') === keys.join('|'))) return circuit;
  return { ...circuit, wires: [...circuit.wires, wire] };
}
export function removeCircuitItem(circuit: CircuitDocument, kind: 'component' | 'node' | 'wire', id: string): CircuitDocument {
  if (kind === 'wire') return { ...circuit, wires: circuit.wires.filter((edge) => edge.id !== id) };
  if (kind === 'node') return { ...circuit, nodes: circuit.nodes.filter((item) => item.id !== id), wires: circuit.wires.filter((edge) => !(edge.from.type === 'node' && edge.from.nodeId === id) && !(edge.to.type === 'node' && edge.to.nodeId === id)) };
  return { ...circuit, components: circuit.components.filter((part) => part.id !== id), wires: circuit.wires.filter((edge) => !(edge.from.type === 'pin' && edge.from.componentId === id) && !(edge.to.type === 'pin' && edge.to.componentId === id)) };
}

export const magnitude = mag;
export const phase = (value: Complex) => Math.atan2(value.im, value.re) * 180 / Math.PI;
export const formatComplex = (value: Complex, unit: string) => {
  const real = Math.abs(value.re) < 0.005 ? 0 : value.re;
  const imaginary = Math.abs(value.im) < 0.005 ? 0 : value.im;
  const sign = imaginary < 0 ? '−' : '+';
  return imaginary === 0 ? `${real.toFixed(2)} ${unit}` : `${real.toFixed(2)} ${sign} j${Math.abs(imaginary).toFixed(2)} ${unit}`;
};
