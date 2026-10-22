import { describe, it, expect } from 'vitest';
import {
  ComplexNumber,
  calculateVoltageCalc,
  DEFAULT_VCALC_COMPONENTS,
  DEFAULT_VCALC_CONFIG,
} from './voltageCalcEngine';

describe('voltageCalcEngine - ComplexNumber math tests', () => {
  it('performs addition and subtraction correctly', () => {
    const a = new ComplexNumber(3, 4);
    const b = new ComplexNumber(1, -2);
    const sum = a.add(b);
    expect(sum.real).toBeCloseTo(4);
    expect(sum.imag).toBeCloseTo(2);

    const diff = a.subtract(b);
    expect(diff.real).toBeCloseTo(2);
    expect(diff.imag).toBeCloseTo(6);
  });

  it('performs multiplication and division correctly', () => {
    const a = new ComplexNumber(3, 4);
    const b = new ComplexNumber(1, 2);
    // (3 + 4j)(1 + 2j) = 3 + 6j + 4j - 8 = -5 + 10j
    const prod = a.multiply(b);
    expect(prod.real).toBeCloseTo(-5);
    expect(prod.imag).toBeCloseTo(10);

    // (-5 + 10j) / (1 + 2j) = (3 + 4j)
    const quot = prod.divide(b);
    expect(quot.real).toBeCloseTo(3);
    expect(quot.imag).toBeCloseTo(4);
  });

  it('calculates magnitude and phase correctly', () => {
    const a = new ComplexNumber(3, 4);
    expect(a.magnitude).toBeCloseTo(5);
    expect(a.phase).toBeCloseTo(53.13, 1);

    const b = new ComplexNumber(0, -10);
    expect(b.magnitude).toBeCloseTo(10);
    expect(b.phase).toBeCloseTo(-90);
  });

  it('formats algebraic and polar strings with units', () => {
    const a = new ComplexNumber(25.5, 40.2);
    expect(a.toAlgebraicString('Ω')).toContain('25.5');
    expect(a.toAlgebraicString('Ω')).toContain('j40.2');
    expect(a.toPolarString('V')).toContain('∠');
  });
});

describe('voltageCalcEngine - 9-Page Comprehensive Analysis Pipeline', () => {
  const result = calculateVoltageCalc(DEFAULT_VCALC_COMPONENTS, DEFAULT_VCALC_CONFIG);

  it('Page 1: calculates reactances and impedances for all elements', () => {
    expect(result.valid).toBe(true);
    expect(result.page1.omega).toBeGreaterThan(0);
    expect(Object.keys(result.page1.impedances)).toHaveLength(8);
    for (const key of Object.keys(result.page1.impedances)) {
      expect(result.page1.impedances[key].magnitude).toBeGreaterThanOrEqual(0);
    }
  });

  it('Page 2: reduces circuit and computes Z_eq and Y_eq', () => {
    const { Z14, Z23, Z1234, Zp, Zeq, Yeq } = result.page2;
    expect(Z14.magnitude).toBeGreaterThan(0);
    expect(Z23.magnitude).toBeGreaterThan(0);
    expect(Z1234.magnitude).toBeGreaterThan(0);
    expect(Zp.magnitude).toBeGreaterThan(0);
    expect(Zeq.magnitude).toBeGreaterThan(0);
    expect(Yeq.magnitude).toBeGreaterThan(0);
    expect(Yeq.magnitude).toBeCloseTo(1 / Zeq.magnitude, 2);
  });

  it('Page 3: calculates node potentials and branch currents', () => {
    const { I, Phi1, Phi4, U14, I14, I1234 } = result.page3;
    expect(I.magnitude).toBeGreaterThan(0);
    expect(Phi1.magnitude).toBeGreaterThan(0);
    expect(Phi4.magnitude).toBeGreaterThan(0);
    expect(U14.magnitude).toBeGreaterThan(0);
    // KCL check at Node 1: I ≈ I14 + I1234
    const sumBranches = I14.add(I1234);
    expect(sumBranches.real).toBeCloseTo(I.real, 1);
    expect(sumBranches.imag).toBeCloseTo(I.imag, 1);
  });

  it('Page 4: sub-branch analysis and KCL check', () => {
    const { Phi2, Phi3, U23, I_L2, I_C2, kcl_ok } = result.page4;
    expect(Phi2.magnitude).toBeGreaterThan(0);
    expect(Phi3.magnitude).toBeGreaterThan(0);
    expect(U23.magnitude).toBeGreaterThanOrEqual(0);
    expect(kcl_ok).toBe(true);
    // I_L2 + I_C2 should equal I1234
    const sumSub = I_L2.add(I_C2);
    expect(sumSub.real).toBeCloseTo(result.page3.I1234.real, 1);
    expect(sumSub.imag).toBeCloseTo(result.page3.I1234.imag, 1);
  });

  it('Page 5: voltages on all 8 individual elements', () => {
    expect(Object.keys(result.page5.U)).toHaveLength(8);
    for (const key of Object.keys(result.page5.U)) {
      expect(result.page5.U[key].magnitude).toBeGreaterThanOrEqual(0);
    }
  });

  it('Page 6: generates 6 phasor diagrams with dual-scale vectors', () => {
    expect(result.page6.groups).toHaveLength(6);
    for (const group of result.page6.groups) {
      expect(group.title).toBeDefined();
      expect(group.vectors.length).toBeGreaterThan(0);
    }
  });

  it('Page 7: powers and triangle geometry', () => {
    const { P, Q, S, cosφ, check_P, check_Q } = result.page7;
    expect(P).toBeGreaterThan(0);
    expect(S).toBeGreaterThanOrEqual(P);
    expect(cosφ).toBeGreaterThanOrEqual(0);
    expect(cosφ).toBeLessThanOrEqual(1);
    expect(P).toBeCloseTo(check_P, 1);
    expect(Q).toBeCloseTo(check_Q, 1);
  });

  it('Page 8: reactive power compensation with target_cosφ >= 0.93', () => {
    const { target_cosφ, phi_star_deg, B_comp, comp_type, comp_value_str } = result.page8;
    expect(target_cosφ).toBeCloseTo(0.93, 2);
    expect(Math.abs(phi_star_deg)).toBeGreaterThan(0);
    expect(isFinite(B_comp)).toBe(true);
    expect(comp_type).toMatch(/Capacitor|Inductor/);
    expect(comp_value_str).toBeDefined();
  });

  it('Page 9: GOST verification confirms improved power factor', () => {
    const { pf_ok, p_close, s_reduced, i_reduced, cosφ_new } = result.page9;
    expect(pf_ok).toBe(true);
    expect(p_close).toBe(true);
    expect(s_reduced).toBe(true);
    expect(i_reduced).toBe(true);
    expect(cosφ_new).toBeGreaterThanOrEqual(0.92);
  });
});
