import { describe, expect, it } from 'vitest';
import {
  applyTOEComponents,
  calculateCircuit,
  createDefaultCircuit,
  createTOECircuit,
  extractTOEComponents,
  magnitude,
} from './circuit';

describe('TOE Circuit & Simulator Synchronization', () => {
  it('default circuit has the standard TOE 8-element topology', () => {
    const circuit = createDefaultCircuit();
    expect(circuit.frequency).toBe(400);

    const vac = circuit.components.find((c) => c.kind === 'VAC');
    expect(vac?.value).toBe(1000);

    const r1 = circuit.components.find((c) => c.label === 'R1');
    const r2 = circuit.components.find((c) => c.label === 'R2');
    const r4 = circuit.components.find((c) => c.label === 'R4');
    const r3 = circuit.components.find((c) => c.label === 'R3');
    const l1 = circuit.components.find((c) => c.label === 'L1');
    const c1 = circuit.components.find((c) => c.label === 'C1');
    const l2 = circuit.components.find((c) => c.label === 'L2');
    const c2 = circuit.components.find((c) => c.label === 'C2');

    expect(r1?.value).toBe(25);
    expect(r2?.value).toBe(1);
    expect(r4?.value).toBe(81);
    expect(r3?.value).toBe(4);
    expect(l1?.value).toBe(35);
    expect(c1?.value).toBe(20);
    expect(l2?.value).toBe(54);
    expect(c2?.value).toBe(40);
  });

  it('extracts TOE components from circuit document accurately', () => {
    const circuit = createTOECircuit();
    const extracted = extractTOEComponents(circuit);

    expect(extracted.E).toBe(1000);
    expect(extracted.f).toBe(400);
    expect(extracted.components.length).toBe(8);

    const slot1 = extracted.components.find((c) => c.id === 'slot1');
    expect(slot1?.label).toBe('R1');
    expect(slot1?.type).toBe('Resistor');
    expect(slot1?.value).toBe(25);

    const slot5 = extracted.components.find((c) => c.id === 'slot5');
    expect(slot5?.label).toBe('L1');
    expect(slot5?.type).toBe('Inductor');
    expect(slot5?.value).toBe(35);

    const slot8 = extracted.components.find((c) => c.id === 'slot8');
    expect(slot8?.label).toBe('C2');
    expect(slot8?.type).toBe('Capacitor');
    expect(slot8?.value).toBe(40);
  });

  it('updates simulator circuit with new values from Voltage Calculation tab', () => {
    const initial = createTOECircuit();
    const modifiedSlots = [
      { id: 'slot1', label: 'R1', type: 'Resistor' as const, value: 50 },
      { id: 'slot2', label: 'R2', type: 'Resistor' as const, value: 10 },
      { id: 'slot3', label: 'R4', type: 'Resistor' as const, value: 100 },
      { id: 'slot4', label: 'R3', type: 'Resistor' as const, value: 20 },
      { id: 'slot5', label: 'L1', type: 'Inductor' as const, value: 70 },
      { id: 'slot6', label: 'C1', type: 'Capacitor' as const, value: 15 },
      { id: 'slot7', label: 'L2', type: 'Inductor' as const, value: 80 },
      { id: 'slot8', label: 'C2', type: 'Capacitor' as const, value: 30 },
    ];

    const updated = applyTOEComponents(initial, modifiedSlots, 500, 50);

    expect(updated.frequency).toBe(50);
    const vac = updated.components.find((c) => c.kind === 'VAC');
    expect(vac?.value).toBe(500);

    const r1 = updated.components.find((c) => c.label === 'R1');
    expect(r1?.value).toBe(50);

    const l1 = updated.components.find((c) => c.label === 'L1');
    expect(l1?.value).toBe(70);

    const c2 = updated.components.find((c) => c.label === 'C2');
    expect(c2?.value).toBe(30);

    // Verify calculation succeeds on modified circuit
    const result = calculateCircuit(updated);
    expect(result.activePower).toBeGreaterThan(0);
    expect(result.powerFactor).toBeGreaterThan(0);
  });

  it('verifies standard TOE circuit electrical results match analytical calculations', () => {
    const circuit = createTOECircuit();
    const result = calculateCircuit(circuit);

    // Active power ~10831.12 W
    expect(result.activePower).toBeCloseTo(10831.12, 0);

    // Reactive power ~7304 var for full MNA branch calculations
    expect(result.reactivePower).toBeCloseTo(7304.03, 0);

    // Power factor ~0.83
    expect(result.powerFactor).toBeCloseTo(0.83, 1);

    // Node voltages exist: ground is 0V, non-ground nodes are non-zero
    for (const node of circuit.nodes) {
      const v = result.nodes[node.id];
      expect(v).toBeDefined();
      if (node.id === 'ground') {
        expect(magnitude(v)).toBeCloseTo(0, 5);
      } else {
        expect(magnitude(v)).toBeGreaterThan(0);
      }
    }
  });
});
