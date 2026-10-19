import { describe, expect, it } from 'vitest';
import { updateBoardComponent, validateBoard, type BoardDocument } from './board';

const fixture: BoardDocument = {
  format: 'interactive-electrical-board', version: 1, mode: 'schematic', title: 'Mạch thử', summary: '', width: 1000, height: 700,
  components: [{ id: 'r1', reference: 'R1', type: 'resistor', value: '1k', unit: 'Ω', x: 220, y: 350, rotation: 0, confidence: .94, pins: [{ id: '1', label: '1', x: -40, y: 0 }, { id: '2', label: '2', x: 40, y: 0 }] }],
  nodes: [{ id: 'n1', label: 'N1', x: 100, y: 350, confidence: .92 }],
  connections: [{ id: 'c1', componentId: 'r1', pinId: '1', nodeId: 'n1', confidence: .9 }],
  traces: [], notes: [],
};

describe('board JSON validation', () => {
  it('accepts a valid editable schematic document', () => {
    expect(validateBoard(fixture)).toEqual(fixture);
  });

  it('rejects connections that reference missing pins or nodes', () => {
    expect(() => validateBoard({ ...fixture, connections: [{ ...fixture.connections[0], nodeId: 'missing' }] })).toThrow(/không tồn tại/i);
  });

  it('rejects duplicate assignments for one component pin', () => {
    const duplicate = { ...fixture.connections[0], id: 'c2', nodeId: 'n2' };
    expect(() => validateBoard({ ...fixture, nodes: [...fixture.nodes, { id: 'n2', label: 'N2', x: 500, y: 500, confidence: .9 }], connections: [...fixture.connections, duplicate] })).toThrow(/bị trùng/i);
  });

  it('preserves a valid component edit in the board document', () => {
    const updated = updateBoardComponent(fixture, 'r1', { value: '2kΩ', x: 300 });
    expect(updated.components[0].value).toBe('2kΩ');
    expect(updated.components[0].x).toBe(300);
    expect(fixture.components[0].x).toBe(220);
  });
});
