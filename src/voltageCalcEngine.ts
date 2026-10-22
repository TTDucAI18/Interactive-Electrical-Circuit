/**
 * voltageCalcEngine.ts
 * Core engine for the 9-step AC circuit analysis (Voltage Calculation Workbench).
 * Implements the same 8-slot RLC topology as the reference application:
 *   Slot1=R1, Slot2=R2, Slot3=R3, Slot4=R4, Slot5=L1, Slot6=C1, Slot7=L2, Slot8=C2
 * Topology:
 *   E → R1 → [Z14 || Z1234] → R2 → GND
 *   Z14  = ZL1 + ZC1
 *   Z1234 = R4 + Z23 + R3, where Z23 = ZL2 || ZC2
 */

/** Configuration: source voltage amplitude (V rms) and frequency (Hz). */
export interface VCalcConfig {
  E: number;   // Source voltage (V rms)
  f: number;   // Frequency (Hz)
}

/** One of the 8 configurable component slots. */
export interface SlotComponent {
  id: string;              // e.g. 'slot1'
  label: string;           // e.g. 'R₁'
  type: 'Resistor' | 'Inductor' | 'Capacitor';
  value: number | string;  // Ω, mH, or µF
}

/** Default configuration matching the reference application defaults. */
export const DEFAULT_VCALC_COMPONENTS: SlotComponent[] = [
  { id: 'slot1', label: 'R₁', type: 'Resistor',   value: 25 },
  { id: 'slot2', label: 'R₂', type: 'Resistor',   value: 1  },
  { id: 'slot3', label: 'R₃', type: 'Resistor',   value: 4  },
  { id: 'slot4', label: 'R₄', type: 'Resistor',   value: 81 },
  { id: 'slot5', label: 'L₁', type: 'Inductor',   value: 35 },
  { id: 'slot6', label: 'C₁', type: 'Capacitor',  value: 20 },
  { id: 'slot7', label: 'L₂', type: 'Inductor',   value: 54 },
  { id: 'slot8', label: 'C₂', type: 'Capacitor',  value: 40 },
];

export const DEFAULT_VCALC_CONFIG: VCalcConfig = { E: 1000, f: 400 };

// ---------------------------------------------------------------------------
// Complex number class
// ---------------------------------------------------------------------------

export class ComplexNum {
  constructor(public real: number, public imag: number) {}

  get magnitude(): number { return Math.hypot(this.real, this.imag); }
  /** Phase in degrees */
  get phase(): number { return Math.atan2(this.imag, this.real) * 180 / Math.PI; }

  add(b: ComplexNum): ComplexNum { return new ComplexNum(this.real + b.real, this.imag + b.imag); }
  subtract(b: ComplexNum): ComplexNum { return new ComplexNum(this.real - b.real, this.imag - b.imag); }

  multiply(b: ComplexNum): ComplexNum {
    return new ComplexNum(
      this.real * b.real - this.imag * b.imag,
      this.real * b.imag + this.imag * b.real,
    );
  }

  divide(b: ComplexNum): ComplexNum {
    const d = b.real * b.real + b.imag * b.imag;
    if (d < 1e-28) return new ComplexNum(Infinity, Infinity);
    return new ComplexNum(
      (this.real * b.real + this.imag * b.imag) / d,
      (this.imag * b.real - this.real * b.imag) / d,
    );
  }

  conjugate(): ComplexNum { return new ComplexNum(this.real, -this.imag); }
  negate(): ComplexNum { return new ComplexNum(-this.real, -this.imag); }

  /** Format as algebraic string: a ± jb unit */
  toAlgebraicString(unit = '', decimals = 4): string {
    if (!isFinite(this.real) || !isFinite(this.imag)) return '∞';
    const r = round(this.real, decimals);
    const i = round(this.imag, decimals);
    const sign = i < 0 ? ' - ' : ' + ';
    const iStr = `j${Math.abs(i).toFixed(decimals)}`;
    const suffix = unit ? ` ${unit}` : '';
    return `${r.toFixed(decimals)}${sign}${iStr}${suffix}`;
  }

  /** Format as polar string: |z|∠θ° unit */
  toPolarString(unit = '', decimals = 3): string {
    if (!isFinite(this.real) || !isFinite(this.imag)) return '∞';
    const suffix = unit ? ` ${unit}` : '';
    return `${this.magnitude.toFixed(decimals)} ∠${this.phase.toFixed(2)}°${suffix}`;
  }

  /** Format as polar string for display: magnitude ∠ phase° */
  toDisplayString(unit = ''): string {
    if (!isFinite(this.magnitude)) return '∞';
    return `${this.magnitude.toFixed(3)} ∠${this.phase.toFixed(2)}°${unit ? ' ' + unit : ''}`;
  }

  static fromPolar(magnitude: number, degrees: number): ComplexNum {
    const rad = degrees * Math.PI / 180;
    return new ComplexNum(magnitude * Math.cos(rad), magnitude * Math.sin(rad));
  }

  static ONE = new ComplexNum(1, 0);
  static ZERO = new ComplexNum(0, 0);
  static INF = new ComplexNum(Infinity, Infinity);
}

export { ComplexNum as ComplexNumber };

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ---------------------------------------------------------------------------
// Impedance helper
// ---------------------------------------------------------------------------
function slotImpedance(slot: SlotComponent, omega: number): ComplexNum {
  const v = typeof slot.value === 'number' ? slot.value : parseFloat(String(slot.value));
  if (!isFinite(v) || v <= 0) return new ComplexNum(Infinity, Infinity);
  switch (slot.type) {
    case 'Resistor': return new ComplexNum(v, 0);
    case 'Inductor': return new ComplexNum(0, omega * (v / 1000));   // mH → H
    case 'Capacitor': {
      const C = v / 1_000_000; // µF → F
      if (omega <= 0 || C <= 0) return new ComplexNum(0, -Infinity);
      return new ComplexNum(0, -1 / (omega * C));
    }
  }
}

// ---------------------------------------------------------------------------
// Results interfaces for each page
// ---------------------------------------------------------------------------

/** Step result – one labelled formula line. */
export interface FormulaStep {
  id: string;
  title: string;
  formula: string;
  substitution: string;   // "= value substituted"
  result: ComplexNum;
  unit: string;
}

export interface Page1Result {
  omega: number;
  steps: FormulaStep[];
  impedances: Record<string, ComplexNum>; // slot1..slot8
}

export interface Page2Result {
  Z14: ComplexNum;   // slot5 + slot6  (L1 + C1 in series)
  Z23: ComplexNum;   // slot7 || slot8 (L2 || C2 parallel)
  Z1234: ComplexNum; // slot4 + Z23 + slot3 (R4 + Z23 + R3 in series)
  Zp: ComplexNum;    // Z14 || Z1234
  Zeq: ComplexNum;   // slot1 + Zp + slot2
  Yeq: ComplexNum;   // 1 / Zeq
  steps: FormulaStep[];
}

export interface Page3Result {
  I: ComplexNum;       // Source current
  Phi1: ComplexNum;    // Node 1 potential (= E − I·R1)
  Phi4: ComplexNum;    // Node 4 potential (= I·R2)
  U14: ComplexNum;     // Voltage between nodes 1 & 4
  I14: ComplexNum;     // Branch current through Z14
  I1234: ComplexNum;   // Branch current through Z1234
  steps: FormulaStep[];
}

export interface Page4Result {
  Phi2: ComplexNum;    // Node 2 potential
  Phi3: ComplexNum;    // Node 3 potential
  U23: ComplexNum;     // Voltage between nodes 2 & 3
  I_L2: ComplexNum;   // Current through L2 (slot7)
  I_C2: ComplexNum;   // Current through C2 (slot8)
  kcl_ok: boolean;    // I14 ≈ I_L2 + I_C2
  steps: FormulaStep[];
}

export interface Page5Result {
  U: Record<string, ComplexNum>; // slot1..slot8 element voltages
  steps: FormulaStep[];
}

export interface VectorGroup {
  title: string;
  vectors: { value: ComplexNum; label: string; color: string }[];
}

export interface Page6Result {
  groups: VectorGroup[];
}

export interface Page7Result {
  I_rms: number;
  R_eq: number;  // real part of Zeq
  X_eq: number;  // imag part of Zeq
  Z_eq_mag: number;
  phi_deg: number;
  P: number;   // Active power W
  Q: number;   // Reactive power var
  S: number;   // Apparent power VA
  cosφ: number;
  check_P: number;  // S·cos(φ) verification
  check_Q: number;  // S·sin(φ) verification
}

export interface Page8Result {
  Y: ComplexNum;         // Total admittance before compensation
  G: number;             // Conductance
  B: number;             // Susceptance
  cosφ: number;
  target_cosφ: number;
  needs_correction: boolean;
  phi_star_deg: number;   // Target angle
  B_star: number;         // Target susceptance
  B_comp: number;         // Added susceptance (B_star − B)
  comp_type: 'Capacitor' | 'Inductor' | null;
  comp_value: number;     // C in µF or L in mH
  comp_value_str: string;
  comp_unit: string;
  Zd: ComplexNum | null;  // Impedance of the compensation element
}

export interface Page9Result {
  comp_type: 'Capacitor' | 'Inductor' | null;
  comp_value_str: string;
  comp_unit: string;
  Zd: ComplexNum | null;         // impedance of compensation element
  Zeq_new: ComplexNum;           // New total impedance after compensation
  Yeq_new: ComplexNum;           // New total admittance
  I_new: ComplexNum;             // New current
  S_new: number;                 // New apparent power
  P_new: number;                 // New active power
  Q_new: number;                 // New reactive power
  cosφ_new: number;              // New power factor
  // Verification booleans
  pf_ok: boolean;    // cosφ_new >= target
  p_close: boolean;  // P_new ≈ P_old
  s_reduced: boolean; // S_new < S_old
  i_reduced: boolean; // I_new < I_old
}

/** All results from all 9 pages. */
export interface VCalcResult {
  valid: boolean;
  error?: string;
  page1: Page1Result;
  page2: Page2Result;
  page3: Page3Result;
  page4: Page4Result;
  page5: Page5Result;
  page6: Page6Result;
  page7: Page7Result;
  page8: Page8Result;
  page9: Page9Result;
}

// ---------------------------------------------------------------------------
// Main computation function
// ---------------------------------------------------------------------------

export function calculateVoltageCalc(
  components: SlotComponent[],
  config: VCalcConfig,
): VCalcResult {
  const byId = (id: string) => components.find(s => s.id === id)!;
  const label = (id: string) => byId(id)?.label ?? id;
  const omega = 2 * Math.PI * config.f;
  const E_val = typeof config.E === 'number' ? config.E : parseFloat(String(config.E));
  const E = ComplexNum.fromPolar(E_val, 0); // E at 0° reference phasor

  try {
    // -----------------------------------------------------------------------
    // PAGE 1 – Element impedances
    // -----------------------------------------------------------------------
    const Z: Record<string, ComplexNum> = {};
    const XL1 = omega * (getVal(byId('slot5')) / 1000);
    const XC1 = (omega > 0 && getVal(byId('slot6')) > 0) ? 1 / (omega * getVal(byId('slot6')) / 1e6) : Infinity;
    const XL2 = omega * (getVal(byId('slot7')) / 1000);
    const XC2 = (omega > 0 && getVal(byId('slot8')) > 0) ? 1 / (omega * getVal(byId('slot8')) / 1e6) : Infinity;

    for (const id of ['slot1','slot2','slot3','slot4','slot5','slot6','slot7','slot8']) {
      Z[id] = slotImpedance(byId(id), omega);
    }

    const page1Steps: FormulaStep[] = [
      { id: 'omega', title: 'Tần số góc (ω)', formula: 'ω = 2πf', substitution: `= 2π × ${config.f} = ${(omega).toFixed(4)} rad/s`, result: new ComplexNum(omega, 0), unit: 'rad/s' },
      { id: 'xL1', title: `Cảm kháng ${label('slot5')} (X_{L1})`, formula: `X_{L1} = ω·L₁`, substitution: `= ${omega.toFixed(2)} × ${getVal(byId('slot5'))}/1000 = ${XL1.toFixed(4)} Ω`, result: new ComplexNum(XL1, 0), unit: 'Ω' },
      { id: 'xC1', title: `Dung kháng ${label('slot6')} (X_{C1})`, formula: `X_{C1} = 1/(ω·C₁)`, substitution: `= 1/(${omega.toFixed(2)} × ${getVal(byId('slot6'))}/1e6) = ${XC1.toFixed(4)} Ω`, result: new ComplexNum(XC1, 0), unit: 'Ω' },
      { id: 'xL2', title: `Cảm kháng ${label('slot7')} (X_{L2})`, formula: `X_{L2} = ω·L₂`, substitution: `= ${omega.toFixed(2)} × ${getVal(byId('slot7'))}/1000 = ${XL2.toFixed(4)} Ω`, result: new ComplexNum(XL2, 0), unit: 'Ω' },
      { id: 'xC2', title: `Dung kháng ${label('slot8')} (X_{C2})`, formula: `X_{C2} = 1/(ω·C₂)`, substitution: `= 1/(${omega.toFixed(2)} × ${getVal(byId('slot8'))}/1e6) = ${XC2.toFixed(4)} Ω`, result: new ComplexNum(XC2, 0), unit: 'Ω' },
    ];
    for (const id of ['slot1','slot2','slot3','slot4','slot5','slot6','slot7','slot8']) {
      const s = byId(id);
      const z = Z[id];
      page1Steps.push({ id: `z_${id}`, title: `Trở kháng phức ${label(id)} (Z)`, formula: zFormula(s), substitution: `= ${z.toAlgebraicString('Ω')}`, result: z, unit: 'Ω' });
    }
    const page1: Page1Result = { omega, steps: page1Steps, impedances: Z };

    // -----------------------------------------------------------------------
    // PAGE 2 – Branch reductions
    // -----------------------------------------------------------------------
    const Z14 = Z.slot5.add(Z.slot6);          // L1 series C1
    const Z23 = Z.slot7.multiply(Z.slot8).divide(Z.slot7.add(Z.slot8)); // L2 || C2
    const Z1234 = Z.slot4.add(Z23).add(Z.slot3);  // R4 + Z23 + R3
    const Zp = Z14.multiply(Z1234).divide(Z14.add(Z1234));  // Z14 || Z1234
    const Zeq = Z.slot1.add(Zp).add(Z.slot2);   // R1 + Zp + R2
    const Yeq = ComplexNum.ONE.divide(Zeq);

    const page2Steps: FormulaStep[] = [
      { id: 'Z14', title: `Trở kháng nhánh 1-4 (Z₁₄ = ${label('slot5')} + ${label('slot6')})`, formula: 'Z₁₄ = Z_{L1} + Z_{C1}', substitution: `= (${Z.slot5.toAlgebraicString('Ω')}) + (${Z.slot6.toAlgebraicString('Ω')})`, result: Z14, unit: 'Ω' },
      { id: 'Z23', title: `Trở kháng nhánh 2-3 song song (Z₂₃ = ${label('slot7')} ∥ ${label('slot8')})`, formula: 'Z₂₃ = Z_{L2}·Z_{C2} / (Z_{L2} + Z_{C2})', substitution: `= (${Z.slot7.toAlgebraicString('Ω')}) × (${Z.slot8.toAlgebraicString('Ω')}) / ((${Z.slot7.toAlgebraicString('Ω')}) + (${Z.slot8.toAlgebraicString('Ω')}))`, result: Z23, unit: 'Ω' },
      { id: 'Z1234', title: `Trở kháng nhánh 1-2-3-4 (Z₁₂₃₄)`, formula: `Z₁₂₃₄ = ${label('slot4')} + Z₂₃ + ${label('slot3')}`, substitution: `= (${Z.slot4.toAlgebraicString('Ω')}) + (${Z23.toAlgebraicString('Ω')}) + (${Z.slot3.toAlgebraicString('Ω')})`, result: Z1234, unit: 'Ω' },
      { id: 'Zp', title: `Trở kháng song song (Zₚ = Z₁₄ ∥ Z₁₂₃₄)`, formula: 'Zₚ = Z₁₄·Z₁₂₃₄ / (Z₁₄ + Z₁₂₃₄)', substitution: `= (${Z14.toAlgebraicString('Ω')}) × (${Z1234.toAlgebraicString('Ω')}) / ((${Z14.toAlgebraicString('Ω')}) + (${Z1234.toAlgebraicString('Ω')}))`, result: Zp, unit: 'Ω' },
      { id: 'Zeq', title: `Tổng trở tương đương (Z_eq)`, formula: `Z_eq = ${label('slot1')} + Zₚ + ${label('slot2')}`, substitution: `= (${Z.slot1.toAlgebraicString('Ω')}) + (${Zp.toAlgebraicString('Ω')}) + (${Z.slot2.toAlgebraicString('Ω')})`, result: Zeq, unit: 'Ω' },
      { id: 'Yeq', title: `Tổng dẫn tương đương (Y_eq)`, formula: 'Y_eq = 1 / Z_eq', substitution: `= 1 / (${Zeq.toAlgebraicString('Ω')})`, result: Yeq, unit: 'S' },
    ];
    const page2: Page2Result = { Z14, Z23, Z1234, Zp, Zeq, Yeq, steps: page2Steps };

    // -----------------------------------------------------------------------
    // PAGE 3 – Node potentials & main branch currents
    // -----------------------------------------------------------------------
    const I = E.divide(Zeq);
    const Phi1 = E.subtract(I.multiply(Z.slot1));
    const Phi4 = I.multiply(Z.slot2);
    const U14 = Phi1.subtract(Phi4);
    const I14 = U14.divide(Z14);
    const I1234 = I.subtract(I14);

    const page3Steps: FormulaStep[] = [
      { id: 'I', title: 'Dòng điện tổng (İ)', formula: 'İ = Ė / Z_eq', substitution: `= (${E.toAlgebraicString('V')}) / (${Zeq.toAlgebraicString('Ω')})`, result: I, unit: 'A' },
      { id: 'Phi1', title: 'Thế tại nút 1 (Φ₁)', formula: `Φ₁ = Ė − İ·${label('slot1')}`, substitution: `= (${E.toAlgebraicString('V')}) − (${I.toAlgebraicString('A')}) × (${Z.slot1.toAlgebraicString('Ω')})`, result: Phi1, unit: 'V' },
      { id: 'Phi4', title: 'Thế tại nút 4 (Φ₄)', formula: `Φ₄ = İ·${label('slot2')}`, substitution: `= (${I.toAlgebraicString('A')}) × (${Z.slot2.toAlgebraicString('Ω')})`, result: Phi4, unit: 'V' },
      { id: 'U14', title: 'Điện áp giữa nút 1 và 4 (U₁₄)', formula: 'U₁₄ = Φ₁ − Φ₄', substitution: `= (${Phi1.toAlgebraicString('V')}) − (${Phi4.toAlgebraicString('V')})`, result: U14, unit: 'V' },
      { id: 'I14', title: 'Dòng điện nhánh 1-4 (İ₁₄)', formula: 'İ₁₄ = U₁₄ / Z₁₄', substitution: `= (${U14.toAlgebraicString('V')}) / (${Z14.toAlgebraicString('Ω')})`, result: I14, unit: 'A' },
      { id: 'I1234', title: 'Dòng điện nhánh 1234 (İ₁₂₋₃₄)', formula: 'İ₁₂₋₃₄ = İ − İ₁₄', substitution: `= (${I.toAlgebraicString('A')}) − (${I14.toAlgebraicString('A')})`, result: I1234, unit: 'A' },
    ];
    const page3: Page3Result = { I, Phi1, Phi4, U14, I14, I1234, steps: page3Steps };

    // -----------------------------------------------------------------------
    // PAGE 4 – Node 2, 3 potentials and sub-branch currents
    // -----------------------------------------------------------------------
    const Phi2 = Phi1.subtract(I1234.multiply(Z.slot4));
    const Phi3 = Phi4.add(I1234.multiply(Z.slot3));
    const U23 = Phi2.subtract(Phi3);
    const I_L2 = U23.divide(Z.slot7);
    const I_C2 = U23.divide(Z.slot8);
    const kcl_ok = Math.abs(I1234.subtract(I_L2.add(I_C2)).magnitude) < 1e-4;

    const page4Steps: FormulaStep[] = [
      { id: 'Phi2', title: `Thế tại nút 2 (Φ₂)`, formula: `Φ₂ = Φ₁ − İ₁₂₋₃₄·${label('slot4')}`, substitution: `= (${Phi1.toAlgebraicString('V')}) − (${I1234.toAlgebraicString('A')}) × (${Z.slot4.toAlgebraicString('Ω')})`, result: Phi2, unit: 'V' },
      { id: 'Phi3', title: `Thế tại nút 3 (Φ₃)`, formula: `Φ₃ = Φ₄ + İ₁₂₋₃₄·${label('slot3')}`, substitution: `= (${Phi4.toAlgebraicString('V')}) + (${I1234.toAlgebraicString('A')}) × (${Z.slot3.toAlgebraicString('Ω')})`, result: Phi3, unit: 'V' },
      { id: 'U23', title: 'Điện áp giữa nút 2 và 3 (U₂₃)', formula: 'U₂₃ = Φ₂ − Φ₃', substitution: `= (${Phi2.toAlgebraicString('V')}) − (${Phi3.toAlgebraicString('V')})`, result: U23, unit: 'V' },
      { id: 'IL2', title: `Dòng điện qua ${label('slot7')} (İ_{L2})`, formula: `İ_{L2} = U₂₃ / Z_{${label('slot7')}}`, substitution: `= (${U23.toAlgebraicString('V')}) / (${Z.slot7.toAlgebraicString('Ω')})`, result: I_L2, unit: 'A' },
      { id: 'IC2', title: `Dòng điện qua ${label('slot8')} (İ_{C2})`, formula: `İ_{C2} = U₂₃ / Z_{${label('slot8')}}`, substitution: `= (${U23.toAlgebraicString('V')}) / (${Z.slot8.toAlgebraicString('Ω')})`, result: I_C2, unit: 'A' },
      { id: 'KCL', title: 'Kiểm tra KCL: İ₁₂₋₃₄ = İ_{L2} + İ_{C2}', formula: 'İ₁₂₋₃₄ ≈ İ_{L2} + İ_{C2}', substitution: `LHS = ${I1234.toPolarString('A')}, RHS = ${I_L2.add(I_C2).toPolarString('A')} → ${kcl_ok ? '✓ Đúng' : '✗ Sai'}`, result: I1234, unit: 'A' },
    ];
    const page4: Page4Result = { Phi2, Phi3, U23, I_L2, I_C2, kcl_ok, steps: page4Steps };

    // -----------------------------------------------------------------------
    // PAGE 5 – All element voltages
    // -----------------------------------------------------------------------
    const U_elem: Record<string, ComplexNum> = {
      slot1: I.multiply(Z.slot1),
      slot2: I.multiply(Z.slot2),
      slot3: I1234.multiply(Z.slot3),
      slot4: I1234.multiply(Z.slot4),
      slot5: I14.multiply(Z.slot5),
      slot6: I14.multiply(Z.slot6),
      slot7: I_L2.multiply(Z.slot7),
      slot8: I_C2.multiply(Z.slot8),
    };

    const page5Steps: FormulaStep[] = [];
    const currentFor = (id: string) => ['slot1','slot2'].includes(id) ? I : ['slot3','slot4'].includes(id) ? I1234 : ['slot5','slot6'].includes(id) ? I14 : id === 'slot7' ? I_L2 : I_C2;
    for (const id of ['slot1','slot2','slot3','slot4','slot5','slot6','slot7','slot8']) {
      const cur = currentFor(id);
      const zz = Z[id];
      const uu = U_elem[id];
      const curLabel = ['slot1','slot2'].includes(id) ? 'İ' : ['slot3','slot4'].includes(id) ? 'İ₁₂₋₃₄' : ['slot5','slot6'].includes(id) ? 'İ₁₄' : id === 'slot7' ? 'İ_{L2}' : 'İ_{C2}';
      page5Steps.push({ id: `U_${id}`, title: `Điện áp trên ${label(id)} (U_{${label(id)}})`, formula: `U_{${label(id)}} = ${curLabel} × Z_{${label(id)}}`, substitution: `= (${cur.toAlgebraicString('A')}) × (${zz.toAlgebraicString('Ω')})`, result: uu, unit: 'V' });
    }
    const page5: Page5Result = { U: U_elem, steps: page5Steps };

    // -----------------------------------------------------------------------
    // PAGE 6 – Vector diagram groups
    // -----------------------------------------------------------------------
    const COLORS = {
      purple: '#8b5cf6', red: '#ef4444', blue: '#3b82f6', green: '#22c55e',
      orange: '#f97316', cyan: '#06b6d4', amber: '#f59e0b', rose: '#f43f5e', teal: '#14b8a6',
    };
    const page6: Page6Result = {
      groups: [
        {
          title: 'Mạch ngoài 1-4 (Tổng thể)',
          vectors: [
            { value: E,                         label: 'Ė',                       color: COLORS.purple },
            { value: I,                         label: 'İ',                       color: COLORS.red    },
            { value: U_elem.slot1,              label: `U_${label('slot1')}`,     color: COLORS.blue   },
            { value: U_elem.slot2,              label: `U_${label('slot2')}`,     color: COLORS.green  },
            { value: U14,                       label: 'U₁₄',                     color: COLORS.orange },
          ],
        },
        {
          title: 'Mạch 14 (L₁ nối tiếp C₁)',
          vectors: [
            { value: U14,                       label: 'U₁₄',                     color: COLORS.purple },
            { value: I14,                       label: 'İ₁₄',                    color: COLORS.red    },
            { value: U_elem.slot5,              label: `U_${label('slot5')}`,     color: COLORS.blue   },
            { value: U_elem.slot6,              label: `U_${label('slot6')}`,     color: COLORS.orange },
          ],
        },
        {
          title: 'Mạch 12 (R₄)',
          vectors: [
            { value: U_elem.slot4,              label: `U_${label('slot4')}`,     color: COLORS.blue   },
            { value: I1234,                     label: 'İ₁₂',                    color: COLORS.red    },
          ],
        },
        {
          title: 'Mạch 34 (R₃)',
          vectors: [
            { value: U_elem.slot3,              label: `U_${label('slot3')}`,     color: COLORS.blue   },
            { value: I1234,                     label: 'İ₃₄',                    color: COLORS.red    },
          ],
        },
        {
          title: 'Mạch 23 (L₂)',
          vectors: [
            { value: U23,                       label: 'U₂₃',                     color: COLORS.purple },
            { value: I_L2,                      label: `İ₂₃ (${label('slot7')})`, color: COLORS.red    },
          ],
        },
        {
          title: 'Mạch 2-3 (C₂)',
          vectors: [
            { value: U23,                       label: 'U₂₃',                     color: COLORS.purple },
            { value: I_C2,                      label: `İ₂₋₃ (${label('slot8')})`, color: COLORS.red    },
          ],
        },
      ],
    };

    // -----------------------------------------------------------------------
    // PAGE 7 – Powers & triangles
    // -----------------------------------------------------------------------
    const I_rms = I.magnitude;
    const R_eq = Zeq.real;
    const X_eq = Zeq.imag;
    const Z_eq_mag = Zeq.magnitude;
    const phi_deg = Zeq.phase;
    const phi_rad = phi_deg * Math.PI / 180;
    const P = I_rms * I_rms * R_eq;
    const Q = I_rms * I_rms * X_eq;
    const S = I_rms * I_rms * Z_eq_mag;
    const cosφ = S > 1e-12 ? Math.abs(P / S) : 0;
    const page7: Page7Result = {
      I_rms, R_eq, X_eq, Z_eq_mag, phi_deg, P, Q, S, cosφ,
      check_P: S * Math.cos(phi_rad),
      check_Q: S * Math.sin(phi_rad),
    };

    // -----------------------------------------------------------------------
    // PAGE 8 – Reactive power compensation
    // -----------------------------------------------------------------------
    const Y = ComplexNum.ONE.divide(Zeq);
    const G = Y.real;
    const B_orig = Y.imag;
    const cosφ_val = isFinite(Y.magnitude) ? Math.abs(Math.cos(Y.phase * Math.PI / 180)) : 0;
    const target_cosφ = 0.93;
    const needs_correction = Math.abs(cosφ_val) < target_cosφ && isFinite(Y.magnitude);

    let phi_star_deg = 0, B_star = 0, B_comp = 0;
    let comp_type: 'Capacitor' | 'Inductor' | null = null;
    let comp_value = 0, comp_value_str = '', comp_unit = '';
    let Zd: ComplexNum | null = null;

    if (needs_correction) {
      const phi_star_rad = Math.acos(target_cosφ);
      phi_star_deg = Math.sign(Y.phase) * phi_star_rad * 180 / Math.PI;
      B_star = G * Math.tan(Math.sign(Y.phase) * phi_star_rad);
      B_comp = B_star - B_orig;

      if (B_comp > 1e-9) {
        comp_type = 'Capacitor';
        comp_value = B_comp / omega;  // F
        comp_value_str = (comp_value * 1e6).toFixed(4);
        comp_unit = 'µF';
        Zd = new ComplexNum(0, -1 / (omega * comp_value));
      } else if (B_comp < -1e-9) {
        comp_type = 'Inductor';
        comp_value = -1 / (B_comp * omega);  // H
        comp_value_str = (comp_value * 1e3).toFixed(4);
        comp_unit = 'mH';
        Zd = new ComplexNum(0, omega * comp_value);
      }
    }

    const page8: Page8Result = {
      Y, G, B: B_orig, cosφ: cosφ_val, target_cosφ, needs_correction,
      phi_star_deg, B_star, B_comp, comp_type, comp_value,
      comp_value_str, comp_unit, Zd,
    };

    // -----------------------------------------------------------------------
    // PAGE 9 – Verification after compensation
    // -----------------------------------------------------------------------
    let Zeq_new = Zeq;
    let Yeq_new = Y;
    if (Zd && needs_correction) {
      Zeq_new = Zeq.multiply(Zd).divide(Zeq.add(Zd));
      Yeq_new = ComplexNum.ONE.divide(Zeq_new);
    }
    const I_new = E.divide(Zeq_new);
    const I_new_rms = I_new.magnitude;
    const S_new = E_val * I_new_rms;
    const phi_new_rad = Zeq_new.phase * Math.PI / 180;
    const P_new = S_new * Math.cos(phi_new_rad);
    const Q_new = S_new * Math.sin(phi_new_rad);
    const cosφ_new = isFinite(S_new) ? Math.abs(P_new / S_new) : 0;

    const page9: Page9Result = {
      comp_type, comp_value_str, comp_unit, Zd,
      Zeq_new, Yeq_new, I_new, S_new, P_new, Q_new, cosφ_new,
      pf_ok: cosφ_new >= target_cosφ - 0.001,
      p_close: Math.abs(P_new - P) < Math.max(1, P * 0.01),
      s_reduced: S_new <= S + 0.001,
      i_reduced: I_new_rms <= I_rms + 0.0001,
    };

    return { valid: true, page1, page2, page3, page4, page5, page6, page7, page8, page9 };
  } catch (err) {
    const empty = createEmpty();
    return { ...empty, valid: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getVal(s: SlotComponent): number {
  return typeof s.value === 'number' ? s.value : parseFloat(String(s.value));
}

function zFormula(s: SlotComponent): string {
  switch (s.type) {
    case 'Resistor':  return `Z = R = ${getVal(s)} Ω`;
    case 'Inductor':  return `Z = jωL = j·ω·${getVal(s)} mH`;
    case 'Capacitor': return `Z = 1/(jωC) = -j/(ω·${getVal(s)} µF)`;
  }
}

function createEmpty(): Omit<VCalcResult, 'valid' | 'error'> {
  const emptyStep: FormulaStep[] = [];
  const z = ComplexNum.ZERO;
  return {
    page1: { omega: 0, steps: emptyStep, impedances: {} },
    page2: { Z14: z, Z23: z, Z1234: z, Zp: z, Zeq: z, Yeq: z, steps: emptyStep },
    page3: { I: z, Phi1: z, Phi4: z, U14: z, I14: z, I1234: z, steps: emptyStep },
    page4: { Phi2: z, Phi3: z, U23: z, I_L2: z, I_C2: z, kcl_ok: false, steps: emptyStep },
    page5: { U: {}, steps: emptyStep },
    page6: { groups: [] },
    page7: { I_rms: 0, R_eq: 0, X_eq: 0, Z_eq_mag: 0, phi_deg: 0, P: 0, Q: 0, S: 0, cosφ: 0, check_P: 0, check_Q: 0 },
    page8: { Y: z, G: 0, B: 0, cosφ: 0, target_cosφ: 0.93, needs_correction: false, phi_star_deg: 0, B_star: 0, B_comp: 0, comp_type: null, comp_value: 0, comp_value_str: '', comp_unit: '', Zd: null },
    page9: { comp_type: null, comp_value_str: '', comp_unit: '', Zd: null, Zeq_new: z, Yeq_new: z, I_new: z, S_new: 0, P_new: 0, Q_new: 0, cosφ_new: 0, pf_ok: false, p_close: false, s_reduced: false, i_reduced: false },
  };
}
