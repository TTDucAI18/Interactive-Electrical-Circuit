export type ComponentKind = 'R' | 'L' | 'C';

export type CircuitComponent = {
  id: string;
  label: string;
  kind: ComponentKind;
  value: number;
};

export type ComponentSlot = {
  id: number;
  title: string;
  hint: string;
  components: CircuitComponent[];
};

export type CircuitInput = {
  voltage: number;
  frequency: number;
  slots: ComponentSlot[];
};

export type Complex = { re: number; im: number };

export type SlotResult = {
  impedance: Complex;
  current: Complex;
  voltage: Complex;
  components: Array<{ id: string; voltage: Complex; impedance: Complex }>;
};

export type CircuitResult = {
  impedance: Complex;
  sourceCurrent: Complex;
  sourceVoltage: Complex;
  activePower: number;
  reactivePower: number;
  apparentPower: number;
  powerFactor: number;
  slots: Record<number, SlotResult>;
};

const c = (re: number, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  if (d < 1e-24) throw new Error('Mạch có nhánh ngắn mạch; không thể tính ổn định.');
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const mag = (a: Complex) => Math.hypot(a.re, a.im);
const angle = (a: Complex) => Math.atan2(a.im, a.re) * (180 / Math.PI);
const finite = (a: Complex) => Number.isFinite(a.re) && Number.isFinite(a.im);
const open = (): Complex => c(Number.POSITIVE_INFINITY, 0);

export const units: Record<ComponentKind, string> = { R: 'Ω', L: 'mH', C: 'µF' };

export function componentImpedance(component: CircuitComponent, frequency: number): Complex {
  const omega = 2 * Math.PI * frequency;
  if (component.kind === 'R') return c(component.value);
  if (component.kind === 'L') return c(0, omega * component.value / 1000);
  return c(0, -1 / (omega * component.value / 1_000_000));
}

function sumImpedances(components: CircuitComponent[], frequency: number): Complex {
  if (components.length === 0) return open();
  return components.reduce((sum, component) => add(sum, componentImpedance(component, frequency)), c(0));
}

type Branch = { slots: number[]; from: number | 'source' | 'ground'; to: number | 'source' | 'ground' };

// Node indices: 0=A trên, 1=A dưới, 2=B trên, 3=B dưới.
// Mỗi slot là một dãy linh kiện nối tiếp; hai slot cùng hai nút tạo nhánh song song.
const branches: Branch[] = [
  { slots: [1], from: 'source', to: 0 },
  { slots: [2], from: 1, to: 'ground' },
  { slots: [4], from: 0, to: 2 },
  { slots: [3], from: 1, to: 3 },
  { slots: [5, 6], from: 0, to: 1 },
  { slots: [7], from: 2, to: 3 },
  { slots: [8], from: 2, to: 3 },
];

function solveLinear(matrix: Complex[][], vector: Complex[]): Complex[] {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (mag(a[row][col]) > mag(a[pivot][col])) pivot = row;
    }
    if (mag(a[pivot][col]) < 1e-12) throw new Error('Mạch đang hở hoặc không có nghiệm ổn định. Kiểm tra lại các nhánh.');
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

export function calculateCircuit(input: CircuitInput): CircuitResult {
  if (!(input.voltage > 0) || !(input.frequency > 0) || !Number.isFinite(input.voltage + input.frequency)) {
    throw new Error('Điện áp và tần số phải lớn hơn 0.');
  }
  const slots = new Map(input.slots.map((slot) => [slot.id, slot]));
  const impedances = new Map<number, Complex>();
  for (const [id, slot] of slots) {
    for (const component of slot.components) {
      if (!(component.value > 0) || !Number.isFinite(component.value)) {
        throw new Error(`Giá trị tại ${slot.title} phải lớn hơn 0.`);
      }
    }
    impedances.set(id, sumImpedances(slot.components, input.frequency));
  }

  const matrix = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => c(0)));
  const rhs = Array.from({ length: 4 }, () => c(0));
  const nodeVoltage = (node: Branch['from']): Complex | null => {
    if (node === 'source') return c(input.voltage);
    if (node === 'ground') return c(0);
    return null;
  };
  const addAt = (row: number, col: number, value: Complex) => { matrix[row][col] = add(matrix[row][col], value); };
  for (const branch of branches) {
    const z = branch.slots.reduce((total, id) => add(total, impedances.get(id) ?? open()), c(0));
    if (!finite(z)) continue;
    if (mag(z) < 1e-12) throw new Error('Mạch có nhánh ngắn mạch; hãy tăng giá trị linh kiện hoặc đổi tần số.');
    const y = div(c(1), z);
    const fromKnown = nodeVoltage(branch.from);
    const toKnown = nodeVoltage(branch.to);
    const from = typeof branch.from === 'number' ? branch.from : null;
    const to = typeof branch.to === 'number' ? branch.to : null;
    if (from !== null) {
      addAt(from, from, y);
      if (to !== null) addAt(from, to, c(-y.re, -y.im));
      else if (toKnown) rhs[from] = add(rhs[from], mul(y, toKnown));
    }
    if (to !== null) {
      addAt(to, to, y);
      if (from !== null) addAt(to, from, c(-y.re, -y.im));
      else if (fromKnown) rhs[to] = add(rhs[to], mul(y, fromKnown));
    }
  }
  const solved = solveLinear(matrix, rhs);
  const voltages: Record<string, Complex> = { source: c(input.voltage), ground: c(0) };
  solved.forEach((value, index) => { voltages[String(index)] = value; });
  const slotResults: Record<number, SlotResult> = {};
  for (const branch of branches) {
    const z = branch.slots.reduce((total, id) => add(total, impedances.get(id) ?? open()), c(0));
    if (!finite(z)) {
      for (const id of branch.slots) slotResults[id] = { impedance: impedances.get(id) ?? open(), current: c(0), voltage: c(0), components: [] };
      continue;
    }
    const v = sub(voltages[String(branch.from)], voltages[String(branch.to)]);
    const current = div(v, z);
    for (const id of branch.slots) {
      const slot = slots.get(id)!;
      const slotZ = impedances.get(id) ?? open();
      const slotV = mul(current, slotZ);
      const componentResults = slot.components.map((component) => {
        const componentZ = componentImpedance(component, input.frequency);
        return { id: component.id, impedance: componentZ, voltage: mul(current, componentZ) };
      });
      slotResults[id] = { impedance: slotZ, current, voltage: slotV, components: componentResults };
    }
  }
  const sourceCurrent = slotResults[1]?.current ?? c(0);
  const complexPower = mul(c(input.voltage), c(sourceCurrent.re, -sourceCurrent.im));
  const apparentPower = input.voltage * mag(sourceCurrent);
  const impedance = div(c(input.voltage), sourceCurrent);
  return {
    impedance,
    sourceCurrent,
    sourceVoltage: c(input.voltage),
    activePower: complexPower.re,
    reactivePower: complexPower.im,
    apparentPower,
    powerFactor: apparentPower === 0 ? 0 : Math.abs(complexPower.re / apparentPower),
    slots: slotResults,
  };
}

export const magnitude = mag;
export const phase = angle;
export const formatComplex = (value: Complex, unit: string) => {
  const real = Math.abs(value.re) < 0.005 ? 0 : value.re;
  const imaginary = Math.abs(value.im) < 0.005 ? 0 : value.im;
  const sign = imaginary < 0 ? '−' : '+';
  return imaginary === 0 ? `${real.toFixed(2)} ${unit}` : `${real.toFixed(2)} ${sign} j${Math.abs(imaginary).toFixed(2)} ${unit}`;
};
