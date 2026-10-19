import { describe, expect, it } from 'vitest';
import { calculateCircuit, type CircuitInput } from './circuit';

const one = (id: number, kind: 'R' | 'L' | 'C', value: number) => ({
  id,
  title: `Vị trí ${id}`,
  hint: '',
  components: [{ id: `c${id}`, label: `${kind}${id}`, kind, value }],
});
const fixture = (overrides: Partial<CircuitInput> = {}): CircuitInput => ({
  voltage: 10,
  frequency: 50,
  slots: [one(1, 'R', 10), one(2, 'R', 10), one(3, 'R', 10), one(4, 'R', 10), one(5, 'R', 10), one(6, 'R', 10), one(7, 'R', 10), one(8, 'R', 10)],
  ...overrides,
});

describe('RLC circuit solver', () => {
  it('solves a balanced resistive network and returns consistent source current', () => {
    const result = calculateCircuit(fixture());
    expect(result.sourceCurrent.re).toBeCloseTo(0.3214285714, 8);
    expect(result.sourceCurrent.im).toBeCloseTo(0, 8);
    expect(result.activePower).toBeCloseTo(3.2142857143, 8);
    expect(result.powerFactor).toBeCloseTo(1, 8);
    expect(result.slots[1].voltage.re).toBeCloseTo(3.2142857143, 8);
  });

  it('uses inductive and capacitive reactance at the selected frequency', () => {
    const result = calculateCircuit(fixture({
      slots: [one(1, 'R', 10), one(2, 'R', 10), one(3, 'R', 10), one(4, 'R', 10), one(5, 'L', 100), one(6, 'R', 10), one(7, 'C', 100), one(8, 'R', 10)],
    }));
    expect(Number.isFinite(result.impedance.re)).toBe(true);
    expect(Number.isFinite(result.impedance.im)).toBe(true);
    expect(Math.abs(result.impedance.im)).toBeGreaterThan(0);
  });

  it('shares series current and splits the voltage across components in a slot', () => {
    const slots = fixture().slots;
    slots[0].components = [
      { id: 'r1a', label: 'R1a', kind: 'R', value: 4 },
      { id: 'r1b', label: 'R1b', kind: 'R', value: 6 },
    ];
    const result = calculateCircuit(fixture({ slots }));
    const first = result.slots[1];
    expect(first.current.re).toBeCloseTo(result.slots[2].current.re, 8);
    expect(first.components[0].voltage.re).toBeCloseTo(first.current.re * 4, 8);
    expect(first.components[1].voltage.re).toBeCloseTo(first.current.re * 6, 8);
    expect(first.components[0].voltage.re + first.components[1].voltage.re).toBeCloseTo(first.voltage.re, 8);
  });

  it('rejects zero values and zero frequency with a readable error', () => {
    expect(() => calculateCircuit(fixture({ frequency: 0 }))).toThrow(/tần số/i);
    const slots = fixture().slots;
    slots[0].components[0].value = 0;
    expect(() => calculateCircuit(fixture({ slots }))).toThrow(/lớn hơn 0/i);
  });
});
