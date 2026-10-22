import { describe, expect, it } from 'vitest';
import type { BoardDocument } from './board';
import { convertBoardToCircuit } from './boardToCircuit';
import { calculateCircuit } from './circuit';

describe('boardToCircuit converter', () => {
  it('converts an empty board into a minimal valid circuit with default AC source and ground', () => {
    const board: BoardDocument = {
      format: 'interactive-electrical-board',
      version: 1,
      title: 'Empty Board',
      summary: '',
      mode: 'schematic',
      width: 1200,
      height: 800,
      components: [],
      traces: [],
      connections: [],
      nodes: [],
      notes: [],
    };

    const circuit = convertBoardToCircuit(board);
    expect(circuit.version).toBe(2);
    expect(circuit.frequency).toBe(50);
    // Should provide default VAC and GND so it does not crash
    expect(circuit.components.some((c) => c.kind === 'VAC')).toBe(true);
    expect(circuit.components.some((c) => c.kind === 'GND')).toBe(true);
  });

  it('converts recognized R, L, C parts with units and values correctly', () => {
    const board: BoardDocument = {
      format: 'interactive-electrical-board',
      version: 1,
      title: 'RLC Test Board',
      summary: 'Test schematic',
      mode: 'schematic',
      width: 1200,
      height: 800,
      components: [
        { id: 'p1', reference: 'R1', type: 'resistor', value: '100', unit: 'Ω', x: 200, y: 150, rotation: 0, pins: [], confidence: 0.9 },
        { id: 'p2', reference: 'L1', type: 'inductor', value: '50', unit: 'mH', x: 350, y: 150, rotation: 0, pins: [], confidence: 0.95 },
        { id: 'p3', reference: 'C1', type: 'capacitor', value: '25', unit: 'µF', x: 500, y: 150, rotation: 0, pins: [], confidence: 0.9 },
        { id: 'p4', reference: 'V1', type: 'source', value: '220', unit: 'V', x: 100, y: 250, rotation: 0, pins: [], confidence: 0.9 },
        { id: 'p5', reference: 'GND1', type: 'ground', value: '0', unit: 'V', x: 100, y: 400, rotation: 0, pins: [], confidence: 1 },
      ],
      traces: [],
      connections: [
        { id: 'conn1', from: { componentId: 'p4', pinId: 'a' }, to: { componentId: 'p1', pinId: 'a' } },
        { id: 'conn2', from: { componentId: 'p1', pinId: 'b' }, to: { componentId: 'p2', pinId: 'a' } },
        { id: 'conn3', from: { componentId: 'p2', pinId: 'b' }, to: { componentId: 'p3', pinId: 'a' } },
        { id: 'conn4', from: { componentId: 'p3', pinId: 'b' }, to: { componentId: 'p5', pinId: 'g' } },
        { id: 'conn5', from: { componentId: 'p4', pinId: 'b' }, to: { componentId: 'p5', pinId: 'g' } },
      ] as any,
      nodes: [],
      notes: [],
    };

    const circuit = convertBoardToCircuit(board);

    const r1 = circuit.components.find((c) => c.label === 'R1');
    expect(r1).toBeDefined();
    expect(r1?.kind).toBe('R');
    expect(r1?.value).toBe(100);

    const l1 = circuit.components.find((c) => c.label === 'L1');
    expect(l1).toBeDefined();
    expect(l1?.kind).toBe('L');
    expect(l1?.value).toBe(50);

    const c1 = circuit.components.find((c) => c.label === 'C1');
    expect(c1).toBeDefined();
    expect(c1?.kind).toBe('C');
    expect(c1?.value).toBe(25);

    const vac = circuit.components.find((c) => c.kind === 'VAC');
    expect(vac).toBeDefined();
    expect(vac?.value).toBe(220);

    expect(circuit.wires.length).toBe(5);

    // Verify circuit can be computed
    const result = calculateCircuit(circuit);
    expect(result.activePower).toBeGreaterThan(0);
    expect(result.apparentPower).toBeGreaterThan(0);
  });

  it('preserves junctions and connects wires through nodes', () => {
    const board: BoardDocument = {
      format: 'interactive-electrical-board',
      version: 1,
      title: 'Junction Board',
      summary: '',
      mode: 'schematic',
      width: 1200,
      height: 800,
      components: [
        { id: 'src', reference: 'E', type: 'source', value: '100', unit: 'V', x: 100, y: 200, rotation: 0, pins: [], confidence: 1 },
        { id: 'gnd', reference: 'GND', type: 'ground', value: '0', unit: 'V', x: 100, y: 400, rotation: 0, pins: [], confidence: 1 },
        { id: 'r1', reference: 'R1', type: 'resistor', value: '50', unit: 'Ω', x: 300, y: 200, rotation: 0, pins: [], confidence: 1 },
        { id: 'r2', reference: 'R2', type: 'resistor', value: '50', unit: 'Ω', x: 300, y: 300, rotation: 0, pins: [], confidence: 1 },
      ],
      traces: [],
      connections: [
        { id: 'c1', from: { componentId: 'src', pinId: 'a' }, to: { nodeId: 'j1' } },
        { id: 'c2', from: { nodeId: 'j1' }, to: { componentId: 'r1', pinId: 'a' } },
        { id: 'c3', from: { nodeId: 'j1' }, to: { componentId: 'r2', pinId: 'a' } },
      ] as any,
      nodes: [{ id: 'j1', label: 'Node 1', x: 200, y: 200, confidence: 1 }],
      notes: [],
    };

    const circuit = convertBoardToCircuit(board);
    expect(circuit.nodes.length).toBe(1);
    expect(circuit.nodes[0].label).toBe('Node 1');

    const nodeWires = circuit.wires.filter(
      (w) => (w.from.type === 'node' && w.from.nodeId === circuit.nodes[0].id) ||
             (w.to.type === 'node' && w.to.nodeId === circuit.nodes[0].id)
    );
    expect(nodeWires.length).toBe(3);
  });
});
