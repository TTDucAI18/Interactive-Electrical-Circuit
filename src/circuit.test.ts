import { describe, expect, it } from 'vitest';
import { calculateCircuit, connectCircuitEndpoints, createDefaultCircuit, deserializeCircuit, moveCircuitComponent, moveCircuitNode, removeCircuitItem, serializeCircuit, snapCircuitPoint, validateCircuit, type CircuitComponent, type CircuitDocument, type CircuitWire } from './circuit';

const component = (id: string, kind: CircuitComponent['kind'], value: number, x: number, y: number): CircuitComponent => ({ id, label: id.toUpperCase(), kind, value, x, y, rotation: 0, phase: 0, switchClosed: true });
const pin = (componentId: string, pinId: 'a' | 'b' | 'g') => ({ type: 'pin' as const, componentId, pinId });
const node = (nodeId: string) => ({ type: 'node' as const, nodeId });
const edge = (id: string, from: CircuitWire['from'], to: CircuitWire['to']): CircuitWire => ({ id, from, to, via: [] });

function resistiveCircuit(resistors: CircuitComponent[]): CircuitDocument {
  const source = component('v1', 'VAC', 10, 100, 100);
  const ground = component('g1', 'GND', 0, 300, 140);
  const extraNodes = resistors.length > 1 ? resistors.map((_, index) => ({ id: `n${index}`, label: `N${index}`, x: 200 + index * 100, y: 230 })) : [];
  const nodes = [{ id: 'hot', label: 'N1', x: 100, y: 100 }, { id: 'ground', label: 'GND', x: 400, y: 100 }, ...extraNodes];
  const wires = [edge('v+a', pin('v1', 'a'), node('hot')), edge('v-b', pin('v1', 'b'), node('ground')), edge('gnd', pin('g1', 'g'), node('ground'))];
  resistors.forEach((part, index) => {
    const intermediate = extraNodes[index]?.id;
    wires.push(edge(`r${index}a`, pin(part.id, 'a'), node('hot')));
    wires.push(edge(`r${index}b`, pin(part.id, 'b'), node(intermediate ?? 'ground')));
  });
  return { version: 2, frequency: 50, components: [source, ground, ...resistors], nodes, wires };
}

describe('AC modified nodal analysis', () => {
  it('matches the original RLC reference circuit and preserves finite results', () => {
    const result = calculateCircuit(createDefaultCircuit());
    expect(result.activePower).toBeCloseTo(14.3005405039, 8);
    expect(result.reactivePower).toBeCloseTo(-2.2087645953, 8);
    expect(result.apparentPower).toBeGreaterThan(result.activePower);
    expect(Number.isFinite(result.components.r1.current.re)).toBe(true);
    expect(result.powerFactor).toBeGreaterThan(0);
    expect(result.powerFactor).toBeLessThanOrEqual(1);
  });

  it('solves a 10 V RMS source across a 10 ohm resistor', () => {
    const r1 = component('r1', 'R', 10, 250, 100);
    const circuit = resistiveCircuit([r1]);
    const result = calculateCircuit(circuit);
    expect(Math.abs(result.components.r1.current.re)).toBeCloseTo(1, 8);
    expect(result.activePower).toBeCloseTo(10, 8);
    expect(result.components.r1.voltage.re).toBeCloseTo(10, 8);
  });

  it('splits current between two parallel resistors', () => {
    const r1 = component('r1', 'R', 10, 250, 100);
    const r2 = component('r2', 'R', 10, 250, 150);
    const circuit = resistiveCircuit([r1, r2]);
    circuit.nodes = [...circuit.nodes, { id: 'n1', label: 'N2', x: 500, y: 230 }];
    circuit.wires = circuit.wires.filter((edgeItem) => !edgeItem.id.startsWith('r') || !edgeItem.id.endsWith('b'));
    circuit.wires.push(edge('r1b', pin('r1', 'b'), node('ground')));
    circuit.wires.push(edge('r2b', pin('r2', 'b'), node('ground')));
    const result = calculateCircuit(circuit);
    expect(Math.abs(result.components.r1.current.re)).toBeCloseTo(1, 8);
    expect(Math.abs(result.components.r2.current.re)).toBeCloseTo(1, 8);
    expect(result.activePower).toBeCloseTo(20, 8);
  });

  it('uses frequency-dependent inductor and capacitor impedances', () => {
    const source = component('v1', 'VAC', 10, 100, 100);
    const ground = component('g1', 'GND', 0, 300, 100);
    const resistor = component('r1', 'R', 10, 200, 100);
    const inductor = component('l1', 'L', 100, 300, 200);
    const c1 = component('c1', 'C', 100, 450, 200);
    const parts = [source, ground, resistor, inductor, c1];
    const nodes = [{ id: 'hot', label: 'N1', x: 100, y: 100 }, { id: 'series', label: 'N2', x: 350, y: 100 }, { id: 'ground', label: 'GND', x: 500, y: 100 }];
    const wires = [edge('v+a', pin('v1', 'a'), node('hot')), edge('v-b', pin('v1', 'b'), node('ground')), edge('gnd', pin('g1', 'g'), node('ground')), edge('r+a', pin('r1', 'a'), node('hot')), edge('r-b', pin('r1', 'b'), node('series')), edge('l+a', pin('l1', 'a'), node('series')), edge('l-b', pin('l1', 'b'), node('ground')), edge('c+a', pin('c1', 'a'), node('series')), edge('c-b', pin('c1', 'b'), node('ground'))];
    const result = calculateCircuit({ version: 2, frequency: 50, components: parts, nodes, wires });
    expect(Number.isFinite(result.components.l1.voltage.im)).toBe(true);
    expect(Number.isFinite(result.components.c1.current.im)).toBe(true);
    expect(Math.abs(result.reactivePower)).toBeGreaterThan(0);
  });

  it('matches the analytical series RLC voltages and powers at 50 Hz', () => {
    const source = component('v1', 'VAC', 10, 100, 100);
    const ground = component('g1', 'GND', 0, 500, 100);
    const resistor = component('r1', 'R', 10, 200, 100);
    const inductor = component('l1', 'L', 100, 300, 100);
    const capacitor = component('c1', 'C', 100, 400, 100);
    const nodes = [{ id: 'hot', label: 'Hot', x: 100, y: 100 }, { id: 'n1', label: 'N1', x: 250, y: 100 }, { id: 'n2', label: 'N2', x: 350, y: 100 }, { id: 'ground', label: 'GND', x: 500, y: 200 }];
    const wires = [edge('v+a', pin('v1', 'a'), node('hot')), edge('v-b', pin('v1', 'b'), node('ground')), edge('gnd', pin('g1', 'g'), node('ground')), edge('ra', pin('r1', 'a'), node('hot')), edge('rb', pin('r1', 'b'), node('n1')), edge('la', pin('l1', 'a'), node('n1')), edge('lb', pin('l1', 'b'), node('n2')), edge('ca', pin('c1', 'a'), node('n2')), edge('cb', pin('c1', 'b'), node('ground'))];
    const result = calculateCircuit({ version: 2, frequency: 50, components: [source, ground, resistor, inductor, capacitor], nodes, wires });
    expect(Math.hypot(result.components.r1.current.re, result.components.r1.current.im)).toBeCloseTo(0.99914, 4);
    expect(Math.hypot(result.components.r1.voltage.re, result.components.r1.voltage.im)).toBeCloseTo(9.9914, 3);
    expect(Math.hypot(result.components.l1.voltage.re, result.components.l1.voltage.im)).toBeCloseTo(31.3889, 3);
    expect(Math.hypot(result.components.c1.voltage.re, result.components.c1.voltage.im)).toBeCloseTo(31.8036, 3);
    expect(result.activePower).toBeCloseTo(9.9828, 3);
    expect(result.reactivePower).toBeCloseTo(-0.4144, 3);
  });

  it('matches the branch currents and reactive power of a parallel RLC network', () => {
    const source = component('v1', 'VAC', 10, 100, 100);
    const ground = component('g1', 'GND', 0, 500, 200);
    const resistor = component('r1', 'R', 10, 200, 100);
    const inductor = component('l1', 'L', 100, 300, 100);
    const capacitor = component('c1', 'C', 100, 400, 100);
    const nodes = [{ id: 'hot', label: 'Hot', x: 100, y: 100 }, { id: 'ground', label: 'GND', x: 500, y: 200 }];
    const wires = [edge('v+a', pin('v1', 'a'), node('hot')), edge('v-b', pin('v1', 'b'), node('ground')), edge('gnd', pin('g1', 'g'), node('ground'))];
    for (const part of [resistor, inductor, capacitor]) wires.push(edge(`${part.id}a`, pin(part.id, 'a'), node('hot')), edge(`${part.id}b`, pin(part.id, 'b'), node('ground')));
    const result = calculateCircuit({ version: 2, frequency: 50, components: [source, ground, resistor, inductor, capacitor], nodes, wires });
    expect(Math.hypot(result.components.r1.current.re, result.components.r1.current.im)).toBeCloseTo(1, 8);
    expect(Math.hypot(result.components.l1.current.re, result.components.l1.current.im)).toBeCloseTo(0.31831, 4);
    expect(Math.hypot(result.components.c1.current.re, result.components.c1.current.im)).toBeCloseTo(0.31416, 4);
    expect(result.activePower).toBeCloseTo(10, 8);
    expect(result.reactivePower).toBeCloseTo(0.04150, 4);
  });

  it('sets current to zero when a series switch is opened and conducts when closed', () => {
    const source = component('v1', 'VAC', 10, 100, 100);
    const ground = component('g1', 'GND', 0, 300, 100);
    const sw = component('sw1', 'SW', 0, 200, 100); sw.switchClosed = false;
    const resistor = component('r1', 'R', 10, 300, 200);
    const nodes = [{ id: 'hot', label: 'N1', x: 100, y: 100 }, { id: 'between', label: 'N2', x: 200, y: 200 }, { id: 'ground', label: 'GND', x: 400, y: 100 }];
    const wires = [edge('v+a', pin('v1', 'a'), node('hot')), edge('v-b', pin('v1', 'b'), node('ground')), edge('gnd', pin('g1', 'g'), node('ground')), edge('swa', pin('sw1', 'a'), node('hot')), edge('swb', pin('sw1', 'b'), node('between')), edge('ra', pin('r1', 'a'), node('between')), edge('rb', pin('r1', 'b'), node('ground'))];
    expect(Math.abs(calculateCircuit({ version: 2, frequency: 50, components: [source, ground, sw, resistor], nodes, wires }).components.r1.current.re)).toBeCloseTo(0, 8);
    sw.switchClosed = true;
    const result = calculateCircuit({ version: 2, frequency: 50, components: [source, ground, sw, resistor], nodes, wires });
    expect(Math.abs(result.components.r1.current.re)).toBeCloseTo(1, 8);
    expect(Math.abs(result.components.sw1.current.re)).toBeCloseTo(1, 8);
  });

  it('reports missing ground, source, and unconnected terminals', () => {
    const r1 = component('r1', 'R', 10, 250, 100);
    const valid = resistiveCircuit([r1]);
    expect(() => calculateCircuit({ ...valid, components: valid.components.filter((part) => part.kind !== 'GND'), wires: valid.wires.filter((edgeItem) => edgeItem.id !== 'gnd') })).toThrow(/ground/i);
    expect(() => calculateCircuit({ ...valid, components: valid.components.filter((part) => part.kind !== 'VAC'), wires: valid.wires.filter((edgeItem) => !edgeItem.id.startsWith('v')) })).toThrow(/voltage source/i);
    expect(() => calculateCircuit({ ...valid, wires: valid.wires.filter((edgeItem) => edgeItem.id !== 'r0b') })).toThrow(/unconnected/i);
  });

  it('rejects non-positive frequency and component values', () => {
    const circuit = resistiveCircuit([component('r1', 'R', 10, 250, 100)]);
    expect(() => calculateCircuit({ ...circuit, frequency: 0 })).toThrow(/frequency/i);
    circuit.components.find((part) => part.kind === 'R')!.value = 0;
    expect(() => calculateCircuit(circuit)).toThrow(/greater than zero/i);
  });

  it('requires the ground symbol itself to be connected by a wire', () => {
    const circuit = resistiveCircuit([component('r1', 'R', 10, 250, 100)]);
    expect(() => calculateCircuit({ ...circuit, wires: circuit.wires.filter((wireItem) => wireItem.id !== 'gnd') })).toThrow(/ground/i);
  });

  it('handles a closed switch already bypassed by a wire without a singular system', () => {
    const circuit = resistiveCircuit([component('r1', 'R', 10, 250, 100)]);
    const sw = component('sw1', 'SW', 0, 250, 200);
    circuit.components.push(sw);
    circuit.wires.push(edge('swa', pin('sw1', 'a'), node('hot')), edge('swb', pin('sw1', 'b'), node('hot')));
    expect(() => calculateCircuit(circuit)).not.toThrow();
  });
});

describe('editable circuit graph helpers', () => {
  it('moves components and junctions immutably', () => {
    const circuit = createDefaultCircuit();
    const movedPart = moveCircuitComponent(circuit, 'r1', { x: 350, y: 400 });
    const movedNode = moveCircuitNode(movedPart, 'source+', { x: 120, y: 110 });
    expect(movedNode.components.find((part) => part.id === 'r1')).toMatchObject({ x: 350, y: 400 });
    expect(movedNode.nodes.find((item) => item.id === 'source+')).toMatchObject({ x: 120, y: 110 });
    expect(circuit.components.find((part) => part.id === 'r1')?.x).toBe(174);
  });

  it('snaps to the grid and aligns axes with nearby parts and junctions', () => {
    const circuit = createDefaultCircuit();
    const aligned = snapCircuitPoint(circuit, { x: 178, y: 258 }, { kind: 'component', id: 'r1' });
    expect(aligned.position).toEqual({ x: 174, y: 265 });
    expect(aligned.guides).toEqual({ x: 174, y: 265 });
    const grid = snapCircuitPoint(circuit, { x: 337, y: 329 });
    expect(grid.position).toEqual({ x: 340, y: 320 });
  });

  it('connects endpoints once and removes attached connections with a deleted item', () => {
    const circuit = createDefaultCircuit();
    const edgeToAdd = edge('extra', pin('r1', 'a'), node('a-'));
    const connected = connectCircuitEndpoints(circuit, edgeToAdd);
    expect(connected.wires).toHaveLength(circuit.wires.length + 1);
    expect(connectCircuitEndpoints(connected, { ...edgeToAdd, from: node('a-'), to: pin('r1', 'a') })).toBe(connected);
    const withoutPart = removeCircuitItem(connected, 'component', 'r1');
    expect(withoutPart.wires.some((wireItem) => wireItem.from.type === 'pin' && wireItem.from.componentId === 'r1')).toBe(false);
    const withoutNode = removeCircuitItem(connected, 'node', 'source+');
    expect(withoutNode.nodes.some((item) => item.id === 'source+')).toBe(false);
    expect(withoutNode.wires.some((wireItem) => (wireItem.from.type === 'node' && wireItem.from.nodeId === 'source+') || (wireItem.to.type === 'node' && wireItem.to.nodeId === 'source+'))).toBe(false);
  });

  it('validates the starter graph format for local save and reload', () => {
    const circuit = createDefaultCircuit();
    expect(deserializeCircuit(serializeCircuit(circuit))).toEqual(circuit);
    expect(() => validateCircuit({ ...circuit, version: 1 })).toThrow(/unsupported/i);
  });

  it('preserves a temporarily empty numeric field across local save and reload', () => {
    const circuit = createDefaultCircuit();
    circuit.frequency = Number.NaN;
    const restored = deserializeCircuit(serializeCircuit(circuit));
    expect(Number.isNaN(restored.frequency)).toBe(true);
    expect(() => calculateCircuit(restored)).toThrow(/frequency/i);
  });
});
