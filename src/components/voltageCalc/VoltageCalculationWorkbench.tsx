import React, { useState, useMemo } from 'react';
import {
  calculateVoltageCalc,
  DEFAULT_VCALC_COMPONENTS,
  DEFAULT_VCALC_CONFIG,
  type SlotComponent,
  type VCalcConfig,
  type Page7Result,
  type Page8Result,
  type Page9Result,
} from '../../voltageCalcEngine';
import FormulaCard from './FormulaCard';
import PhasorDiagram from './PhasorDiagram';
import TriangleDiagram from './TriangleDiagram';
import CompensationTriangleDiagram from './CompensationTriangleDiagram';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------
const PAGES = [
  'input',
  'calc1', 'calc2', 'calc3', 'calc4', 'calc5', 'calc6', 'calc7', 'calc8', 'calc9',
] as const;
type PageKey = typeof PAGES[number];

const PAGE_LABELS: Record<PageKey, string> = {
  input:  'Whiteboard',
  calc1:  'Trang 1: Trở kháng phần tử',
  calc2:  'Trang 2: Phân tích mạch',
  calc3:  'Trang 3: Thế nút & Dòng nhánh',
  calc4:  'Trang 4: Phân tích chi tiết',
  calc5:  'Trang 5: Điện áp phần tử',
  calc6:  'Trang 6: Sơ đồ véc tơ',
  calc7:  'Trang 7: Công suất & Tam giác',
  calc8:  'Trang 8: Bù công suất',
  calc9:  'Trang 9: Xác minh',
};

const NEXT_LABEL: Record<PageKey, string> = {
  input:  'Tính toán →',
  calc1:  'Phân tích mạch →',
  calc2:  'Thế nút & Dòng nhánh →',
  calc3:  'Phân tích chi tiết →',
  calc4:  'Điện áp phần tử →',
  calc5:  'Sơ đồ véc tơ →',
  calc6:  'Công suất & Tam giác →',
  calc7:  'Bù công suất →',
  calc8:  'Xác minh →',
  calc9:  '← Whiteboard',
};

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
interface VoltageCalculationWorkbenchProps {
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
const VoltageCalculationWorkbench: React.FC<VoltageCalculationWorkbenchProps> = ({ onClose }) => {
  const [page, setPage] = useState<PageKey>('input');
  const [components, setComponents] = useState<SlotComponent[]>(DEFAULT_VCALC_COMPONENTS);
  const [config, setConfig] = useState<VCalcConfig>(DEFAULT_VCALC_CONFIG);

  const pageIndex = PAGES.indexOf(page);

  const results = useMemo(
    () => calculateVoltageCalc(components, config),
    [components, config],
  );

  const nextPage = () => {
    const next = PAGES[Math.min(pageIndex + 1, PAGES.length - 1)];
    setPage(next);
  };
  const prevPage = () => {
    const prev = PAGES[Math.max(pageIndex - 1, 0)];
    setPage(prev);
  };

  // Update a single component's value or label
  const updateComponent = (id: string, field: 'value' | 'label' | 'type', val: string) => {
    setComponents(cs => cs.map(c => {
      if (c.id !== id) return c;
      if (field === 'value') {
        const n = parseFloat(val);
        return { ...c, value: isNaN(n) ? val : n };
      }
      if (field === 'type') {
        return { ...c, type: val as SlotComponent['type'], value: val === 'Resistor' ? 10 : val === 'Inductor' ? 10 : 100 };
      }
      return { ...c, [field]: val };
    }));
  };

  const updateConfig = (field: keyof VCalcConfig, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n)) setConfig(c => ({ ...c, [field]: n }));
  };

  const resetToDefaults = () => {
    setComponents(DEFAULT_VCALC_COMPONENTS);
    setConfig(DEFAULT_VCALC_CONFIG);
  };

  return (
    <div className="vcalc-workbench">
      {/* ============ HEADER ============ */}
      <header className="vcalc-header">
        <div className="vcalc-header-left">
          {page !== 'input' && (
            <button onClick={prevPage} className="vcalc-btn-icon" aria-label="Trang trước">
              ←
            </button>
          )}
          {pageIndex > 0 && (
            <span className="vcalc-page-badge">
              {pageIndex} / {PAGES.length - 1}
            </span>
          )}
          <div className="vcalc-header-title">
            <h1>Voltage Calculation</h1>
            <p>{PAGE_LABELS[page]}</p>
          </div>
        </div>
        <div className="vcalc-header-right">
          <button onClick={page === 'calc9' ? () => setPage('input') : nextPage} className="vcalc-btn-primary">
            {NEXT_LABEL[page]}
          </button>
          {onClose && (
            <button onClick={onClose} className="vcalc-btn-icon" aria-label="Đóng" title="Trở về Simulator">
              ✕
            </button>
          )}
        </div>
      </header>

      {/* ============ CONTENT ============ */}
      <main className="vcalc-main">
        {page === 'input' && (
          <InputPage
            components={components}
            config={config}
            onUpdateComponent={updateComponent}
            onUpdateConfig={updateConfig}
            onReset={resetToDefaults}
          />
        )}

        {page === 'calc1' && results.valid && (
          <CalcPage title="Trang 1: Trở Kháng Phần Tử" steps={results.page1.steps} />
        )}

        {page === 'calc2' && results.valid && (
          <CalcPage title="Trang 2: Phân Tích Tổng Trở Mạch" steps={results.page2.steps} />
        )}

        {page === 'calc3' && results.valid && (
          <CalcPage title="Trang 3: Thế Nút & Dòng Điện Nhánh Chính" steps={results.page3.steps} />
        )}

        {page === 'calc4' && results.valid && (
          <CalcPage title="Trang 4: Phân Tích Chi Tiết Nút & Nhánh Con" steps={results.page4.steps} />
        )}

        {page === 'calc5' && results.valid && (
          <CalcPage title="Trang 5: Điện Áp Trên Toàn Bộ Phần Tử" steps={results.page5.steps} />
        )}

        {page === 'calc6' && results.valid && (
          <VectorPage groups={results.page6.groups} />
        )}

        {page === 'calc7' && results.valid && (
          <PowerPage result={results.page7} />
        )}

        {page === 'calc8' && results.valid && (
          <CompensationPage result={results.page8} />
        )}

        {page === 'calc9' && results.valid && (
          <VerificationPage
            page7={results.page7}
            page8={results.page8}
            page9={results.page9}
          />
        )}

        {!results.valid && page !== 'input' && (
          <div className="vcalc-error-panel">
            <div className="vcalc-error-icon">⚠️</div>
            <p className="vcalc-error-msg">Lỗi tính toán: {results.error}</p>
            <button onClick={() => setPage('input')} className="vcalc-btn-primary">
              ← Về Whiteboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-page: Input Whiteboard
// ---------------------------------------------------------------------------
interface InputPageProps {
  components: SlotComponent[];
  config: VCalcConfig;
  onUpdateComponent: (id: string, field: 'value' | 'label' | 'type', val: string) => void;
  onUpdateConfig: (field: keyof VCalcConfig, val: string) => void;
  onReset: () => void;
}

const InputPage: React.FC<InputPageProps> = ({ components, config, onUpdateComponent, onUpdateConfig, onReset }) => {
  const slotGroups = [
    { label: 'Điện trở (R)', ids: ['slot1', 'slot2', 'slot3', 'slot4'] },
    { label: 'Cuộn cảm / Tụ điện (L, C)', ids: ['slot5', 'slot6', 'slot7', 'slot8'] },
  ];

  const unitFor = (type: SlotComponent['type']) =>
    type === 'Resistor' ? 'Ω' : type === 'Inductor' ? 'mH' : 'µF';

  return (
    <div className="vcalc-input-page">
      <div className="vcalc-input-header">
        <div className="vcalc-source-card">
          <h3 className="vcalc-section-title">⚡ Nguồn điện</h3>
          <div className="vcalc-source-fields">
            <label className="vcalc-field">
              <span>Điện áp E (V RMS)</span>
              <input
                type="number" min="0" step="any"
                value={config.E}
                onChange={e => onUpdateConfig('E', e.target.value)}
                className="vcalc-input"
              />
            </label>
            <label className="vcalc-field">
              <span>Tần số f (Hz)</span>
              <input
                type="number" min="1" step="any"
                value={config.f}
                onChange={e => onUpdateConfig('f', e.target.value)}
                className="vcalc-input"
              />
            </label>
          </div>
        </div>

        <div className="vcalc-schematic-hint">
          <h3 className="vcalc-section-title">🔗 Sơ đồ mạch điện (8 slot)</h3>
          <div className="vcalc-schematic-diagram">
            <SchematicDiagram components={components} />
          </div>
        </div>
      </div>

      <div className="vcalc-components-grid">
        {slotGroups.map(group => (
          <div key={group.label} className="vcalc-component-group">
            <h3 className="vcalc-section-title">{group.label}</h3>
            <div className="vcalc-slot-grid">
              {group.ids.map(id => {
                const comp = components.find(c => c.id === id)!;
                return (
                  <div key={id} className="vcalc-slot-card">
                    <div className="vcalc-slot-header">
                      <span className="vcalc-slot-label">{comp.label}</span>
                      <select
                        value={comp.type}
                        onChange={e => onUpdateComponent(id, 'type', e.target.value)}
                        className="vcalc-slot-type"
                      >
                        <option value="Resistor">Điện trở (R)</option>
                        <option value="Inductor">Cuộn cảm (L)</option>
                        <option value="Capacitor">Tụ điện (C)</option>
                      </select>
                    </div>
                    <div className="vcalc-slot-value">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={typeof comp.value === 'number' ? comp.value : ''}
                        onChange={e => onUpdateComponent(id, 'value', e.target.value)}
                        className="vcalc-input"
                      />
                      <span className="vcalc-slot-unit">{unitFor(comp.type)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="vcalc-input-actions">
        <button onClick={onReset} className="vcalc-btn-secondary">
          ↺ Đặt lại giá trị mặc định
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Mini Schematic Diagram (SVG topology overview)
// ---------------------------------------------------------------------------
const SchematicDiagram: React.FC<{ components: SlotComponent[] }> = ({ components }) => {
  const byId = (id: string) => components.find(c => c.id === id);
  const lbl = (id: string) => byId(id)?.label ?? id;

  return (
    <svg viewBox="0 0 420 180" className="vcalc-schematic-svg">
      {/* Buses */}
      <line x1="20" y1="30" x2="400" y2="30" stroke="#475569" strokeWidth="2" />
      <line x1="20" y1="150" x2="400" y2="150" stroke="#475569" strokeWidth="2" />

      {/* Source E */}
      <circle cx="20" cy="90" r="18" fill="none" stroke="#7c3aed" strokeWidth="2" />
      <text x="20" y="95" textAnchor="middle" fill="#7c3aed" fontSize="10" fontWeight="700">E</text>
      <line x1="20" y1="30" x2="20" y2="72" stroke="#7c3aed" strokeWidth="2" />
      <line x1="20" y1="108" x2="20" y2="150" stroke="#7c3aed" strokeWidth="2" />

      {/* R1 (slot1) - top left series */}
      <rect x="55" y="22" width="50" height="16" rx="3" fill="none" stroke="#0891b2" strokeWidth="1.5" />
      <text x="80" y="33" textAnchor="middle" fill="#0891b2" fontSize="9" fontWeight="600">{lbl('slot1')}</text>

      {/* R2 (slot2) - bottom left series */}
      <rect x="55" y="142" width="50" height="16" rx="3" fill="none" stroke="#0891b2" strokeWidth="1.5" />
      <text x="80" y="153" textAnchor="middle" fill="#0891b2" fontSize="9" fontWeight="600">{lbl('slot2')}</text>

      {/* Parallel block: Z14 || Z1234 */}
      {/* Vertical lines at x=120 and x=360 connecting top/bottom buses */}
      <line x1="120" y1="30" x2="120" y2="55" stroke="#475569" strokeWidth="1.5" />
      <line x1="120" y1="125" x2="120" y2="150" stroke="#475569" strokeWidth="1.5" />
      <line x1="360" y1="30" x2="360" y2="55" stroke="#475569" strokeWidth="1.5" />
      <line x1="360" y1="125" x2="360" y2="150" stroke="#475569" strokeWidth="1.5" />

      {/* L1 (slot5) - top branch left */}
      <line x1="120" y1="55" x2="155" y2="55" stroke="#475569" strokeWidth="1.5" />
      <rect x="155" y="48" width="40" height="14" rx="3" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="175" y="58" textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="600">{lbl('slot5')}</text>
      <line x1="195" y1="55" x2="225" y2="55" stroke="#475569" strokeWidth="1.5" />
      {/* C1 (slot6) */}
      <rect x="225" y="48" width="40" height="14" rx="3" fill="none" stroke="#ec4899" strokeWidth="1.5" />
      <text x="245" y="58" textAnchor="middle" fill="#ec4899" fontSize="9" fontWeight="600">{lbl('slot6')}</text>
      <line x1="265" y1="55" x2="360" y2="55" stroke="#475569" strokeWidth="1.5" />

      {/* R4 (slot4) - bottom branch R4 */}
      <line x1="120" y1="125" x2="155" y2="125" stroke="#475569" strokeWidth="1.5" />
      <rect x="155" y="118" width="40" height="14" rx="3" fill="none" stroke="#0891b2" strokeWidth="1.5" />
      <text x="175" y="128" textAnchor="middle" fill="#0891b2" fontSize="9" fontWeight="600">{lbl('slot4')}</text>

      {/* Z23 parallel: L2 || C2 in middle */}
      <line x1="195" y1="125" x2="208" y2="125" stroke="#475569" strokeWidth="1.5" />
      <line x1="208" y1="108" x2="208" y2="142" stroke="#475569" strokeWidth="1.5" />
      {/* L2 (slot7) */}
      <rect x="208" y="101" width="34" height="13" rx="3" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="225" y="111" textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="600">{lbl('slot7')}</text>
      {/* C2 (slot8) */}
      <rect x="208" y="129" width="34" height="13" rx="3" fill="none" stroke="#ec4899" strokeWidth="1.5" />
      <text x="225" y="139" textAnchor="middle" fill="#ec4899" fontSize="9" fontWeight="600">{lbl('slot8')}</text>
      <line x1="242" y1="108" x2="242" y2="142" stroke="#475569" strokeWidth="1.5" />
      <line x1="242" y1="125" x2="258" y2="125" stroke="#475569" strokeWidth="1.5" />

      {/* R3 (slot3) */}
      <rect x="258" y="118" width="40" height="14" rx="3" fill="none" stroke="#0891b2" strokeWidth="1.5" />
      <text x="278" y="128" textAnchor="middle" fill="#0891b2" fontSize="9" fontWeight="600">{lbl('slot3')}</text>
      <line x1="298" y1="125" x2="360" y2="125" stroke="#475569" strokeWidth="1.5" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Sub-page: Calculation with formula cards (pages 1-5)
// ---------------------------------------------------------------------------
const CalcPage: React.FC<{ title: string; steps: import('../../voltageCalcEngine').FormulaStep[] }> = ({ title, steps }) => (
  <div className="vcalc-calc-page">
    <h2 className="vcalc-page-heading">{title}</h2>
    <div className="vcalc-steps-list">
      {steps.map(step => (
        <FormulaCard key={step.id} step={step} />
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-page: Vector Diagrams (Page 6)
// ---------------------------------------------------------------------------
const VectorPage: React.FC<{ groups: import('../../voltageCalcEngine').VectorGroup[] }> = ({ groups }) => (
  <div className="vcalc-vector-page">
    <h2 className="vcalc-page-heading">Trang 6: Sơ Đồ Véc Tơ Theo Từng Đoạn Mạch</h2>
    <div className="vcalc-phasor-grid">
      {groups.map(group => (
        <PhasorDiagram
          key={group.title}
          title={group.title}
          vectors={group.vectors}
          size={300}
        />
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-page: Powers & Triangles (Page 7)
// ---------------------------------------------------------------------------
const PowerPage: React.FC<{ result: Page7Result }> = ({ result }) => {
  const { P, Q, S, cosφ, R_eq, X_eq, Z_eq_mag, phi_deg, I_rms, check_P, check_Q } = result;
  const fmt = (n: number, d = 3) => isFinite(n) ? n.toFixed(d) : '∞';

  return (
    <div className="vcalc-power-page">
      <h2 className="vcalc-page-heading">Trang 7: Công Suất & Sơ Đồ Tam Giác</h2>

      <div className="vcalc-power-layout">
        {/* Power formulas */}
        <div className="vcalc-power-section">
          <h3 className="vcalc-section-title">📊 Tính toán công suất</h3>
          <div className="vcalc-power-cards">
            <PowerRow label="Dòng điện RMS (I)" formula="I = E / |Z_eq|" value={`${fmt(I_rms)} A`} />
            <PowerRow label="Công suất tác dụng (P)" formula="P = I² · R" value={`${fmt(P)} W`} highlight />
            <PowerRow label="Công suất phản kháng (Q)" formula="Q = I² · X" value={`${fmt(Q)} var`} />
            <PowerRow label="Công suất biểu kiến (S)" formula="S = I² · Z" value={`${fmt(S)} VA`} />
            <PowerRow label="Hệ số công suất (cosφ)" formula="cosφ = P / S" value={fmt(cosφ, 4)} highlight />
          </div>
          <h3 className="vcalc-section-title" style={{marginTop: '16px'}}>✅ Kiểm tra</h3>
          <div className="vcalc-power-cards">
            <PowerRow label="Kiểm tra P = S·cos(φ)" formula="P = S·cos(φ)" value={`${fmt(check_P)} W`} />
            <PowerRow label="Kiểm tra Q = S·sin(φ)" formula="Q = S·sin(φ)" value={`${fmt(check_Q)} var`} />
          </div>
        </div>

        {/* Triangles */}
        <div className="vcalc-triangle-col">
          <TriangleDiagram
            title="Tam giác trở kháng"
            base={R_eq} height={X_eq} hypotenuse={Z_eq_mag} angle={phi_deg}
            labels={{ base: 'R', height: 'X', hyp: 'Z', angle: 'φ' }}
            units={{ base: 'Ω', height: 'Ω', hyp: 'Ω' }}
          />
          <TriangleDiagram
            title="Tam giác công suất"
            base={P} height={Q} hypotenuse={S} angle={phi_deg}
            labels={{ base: 'P', height: 'Q', hyp: 'S', angle: 'φ' }}
            units={{ base: 'W', height: 'var', hyp: 'VA' }}
          />
        </div>
      </div>
    </div>
  );
};

const PowerRow: React.FC<{ label: string; formula: string; value: string; highlight?: boolean }> = ({ label, formula, value, highlight }) => (
  <div className={`vcalc-power-row ${highlight ? 'vcalc-power-row--highlight' : ''}`}>
    <div>
      <p className="vcalc-power-row-label">{label}</p>
      <code className="vcalc-power-row-formula">{formula}</code>
    </div>
    <span className="vcalc-power-row-value">{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-page: Compensation (Page 8)
// ---------------------------------------------------------------------------
const CompensationPage: React.FC<{ result: Page8Result }> = ({ result }) => {
  const {
    G, B, cosφ, target_cosφ, needs_correction,
    phi_star_deg, B_star, B_comp, comp_type, comp_value_str, comp_unit, Zd,
  } = result;

  const Y_orig_mag = Math.sqrt(G * G + B * B);
  const B_new = B_star;
  const fmt = (n: number, d = 4) => isFinite(n) ? n.toFixed(d) : '∞';

  return (
    <div className="vcalc-comp-page">
      <h2 className="vcalc-page-heading">Trang 8: Bù Công Suất Phản Kháng</h2>

      <div className="vcalc-comp-layout">
        <div className="vcalc-comp-calcs">
          <div className="vcalc-comp-section">
            <h3 className="vcalc-section-title">📈 Trạng thái ban đầu</h3>
            <CompRow label="Tổng dẫn Y" value={`${fmt(Y_orig_mag)} S`} />
            <CompRow label="Điện dẫn G" value={`${fmt(G)} S`} />
            <CompRow label="Điện nạp B" value={`${fmt(B)} S`} />
            <CompRow label="Hệ số công suất cosφ" value={fmt(cosφ, 4)}
              highlight={cosφ >= target_cosφ} />
          </div>

          {needs_correction ? (
            <>
              <div className="vcalc-comp-section">
                <h3 className="vcalc-section-title">🎯 Tính toán bù</h3>
                <CompRow label="Mục tiêu cosφ*" value={target_cosφ.toString()} />
                <CompRow label="Góc pha mục tiêu φ*" value={`${fmt(phi_star_deg, 2)}°`} />
                <CompRow label="Điện nạp mục tiêu B*" formula="B* = G·tan(φ*)" value={`${fmt(B_star)} S`} />
                <CompRow label="Điện nạp cần bù Bₐ" formula="Bₐ = B* − B" value={`${fmt(B_comp)} S`} />
              </div>

              <div className="vcalc-comp-result-card">
                <p className="vcalc-comp-result-hint">Mắc song song một:</p>
                <p className="vcalc-comp-result-type">{comp_type === 'Capacitor' ? 'Tụ điện C' : 'Cuộn cảm L'}</p>
                <p className="vcalc-comp-result-value">{comp_value_str} {comp_unit}</p>
                {Zd && (
                  <p className="vcalc-comp-result-formula">
                    Z_d = {Zd.toAlgebraicString('Ω')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="vcalc-comp-ok-card">
              <span className="vcalc-comp-ok-icon">✅</span>
              <p>Mạch đã đạt hệ số công suất yêu cầu cosφ ≥ {target_cosφ}. Không cần bù!</p>
            </div>
          )}
        </div>

        {/* Compensation triangle */}
        <div className="vcalc-comp-triangle-col">
          <CompensationTriangleDiagram
            G={G}
            B_original={B}
            B_new={needs_correction ? B_new : B}
          />
        </div>
      </div>
    </div>
  );
};

const CompRow: React.FC<{ label: string; value: string; formula?: string; highlight?: boolean }> = ({ label, value, formula, highlight }) => (
  <div className={`vcalc-comp-row ${highlight ? 'vcalc-comp-row--ok' : ''}`}>
    <div>
      <p className="vcalc-comp-row-label">{label}</p>
      {formula && <code className="vcalc-comp-row-formula">{formula}</code>}
    </div>
    <span className="vcalc-comp-row-value">{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-page: Verification (Page 9)
// ---------------------------------------------------------------------------
const VerificationPage: React.FC<{ page7: Page7Result; page8: Page8Result; page9: Page9Result }> = ({ page7, page8, page9 }) => {
  const { P, Q, S, cosφ, I_rms } = page7;
  const { target_cosφ, comp_type, needs_correction } = page8;
  const { Zeq_new, Yeq_new, I_new, S_new, P_new, Q_new, cosφ_new, pf_ok, p_close, s_reduced, i_reduced, Zd, comp_value_str, comp_unit } = page9;

  const fmt = (n: number, d = 3) => isFinite(n) ? n.toFixed(d) : '∞';
  const allOk = pf_ok && p_close && s_reduced && i_reduced;

  const checks = [
    { label: `cosφ* ≥ ${target_cosφ}`, ok: pf_ok, before: fmt(cosφ, 4), after: fmt(cosφ_new, 4) },
    { label: 'P ≈ P* (công suất tác dụng bảo toàn)', ok: p_close, before: `${fmt(P)} W`, after: `${fmt(P_new)} W` },
    { label: '|Q*| ≤ |Q| (công suất phản kháng giảm)', ok: Math.abs(Q_new) <= Math.abs(Q) + 1, before: `${fmt(Q)} var`, after: `${fmt(Q_new)} var` },
    { label: 'S* ≤ S (công suất biểu kiến giảm)', ok: s_reduced, before: `${fmt(S)} VA`, after: `${fmt(S_new)} VA` },
    { label: 'I* ≤ I (dòng điện giảm)', ok: i_reduced, before: `${fmt(I_rms)} A`, after: `${fmt(I_new.magnitude)} A` },
  ];

  return (
    <div className="vcalc-verify-page">
      <h2 className="vcalc-page-heading">Trang 9: Xác Minh Toàn Bộ Bài Toán Sau Bù</h2>

      {!needs_correction && (
        <div className="vcalc-verify-ok-banner">
          ✅ Mạch không cần bù — hệ số công suất đã đạt yêu cầu.
        </div>
      )}

      {needs_correction && (
        <>
          {/* Compensation data section */}
          <div className="vcalc-verify-section">
            <h3 className="vcalc-section-title">📋 1. Dữ liệu linh kiện bù</h3>
            <div className="vcalc-verify-row">
              <span>Linh kiện bù:</span>
              <strong>{comp_type === 'Capacitor' ? 'Tụ điện C' : 'Cuộn cảm L'} = {comp_value_str} {comp_unit}</strong>
            </div>
            {Zd && (
              <div className="vcalc-verify-row">
                <span>Trở kháng bù (Z_d):</span>
                <code>{Zd.toAlgebraicString('Ω')}</code>
              </div>
            )}
          </div>

          {/* Verification calculation */}
          <div className="vcalc-verify-section">
            <h3 className="vcalc-section-title">🔬 2. Tính toán xác minh</h3>
            <div className="vcalc-verify-row">
              <span>Tổng trở mới Z*_eq:</span>
              <code>{Zeq_new.toAlgebraicString('Ω')} = {Zeq_new.toPolarString('Ω')}</code>
            </div>
            <div className="vcalc-verify-row">
              <span>Tổng dẫn mới Y*_eq:</span>
              <code>{Yeq_new.toAlgebraicString('S')} = {Yeq_new.toPolarString('S')}</code>
            </div>
            <div className="vcalc-verify-row">
              <span>Dòng điện mới I*:</span>
              <code>{I_new.toPolarString('A')}</code>
            </div>
          </div>

          {/* Comparison table */}
          <div className="vcalc-verify-section">
            <h3 className="vcalc-section-title">📊 3. So sánh Trước bù vs Sau bù</h3>
            <div className="vcalc-compare-table-wrap">
              <table className="vcalc-compare-table">
                <thead>
                  <tr>
                    <th>Tiêu chí</th>
                    <th>Trước bù</th>
                    <th>Sau bù</th>
                    <th>Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map(c => (
                    <tr key={c.label} className={c.ok ? 'vcalc-row--ok' : 'vcalc-row--fail'}>
                      <td>{c.label}</td>
                      <td>{c.before}</td>
                      <td>{c.after}</td>
                      <td className="vcalc-check-cell">{c.ok ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ГОСТ Badge */}
          <div className={`vcalc-gost-badge ${allOk ? 'vcalc-gost-badge--ok' : 'vcalc-gost-badge--fail'}`}>
            <div className="vcalc-gost-icon">{allOk ? '✅' : '⚠️'}</div>
            <div>
              <p className="vcalc-gost-title">
                {allOk ? 'Xác minh thành công! Đạt chuẩn ГОСТ / IEC' : 'Cần kiểm tra lại!'}
              </p>
              <p className="vcalc-gost-subtitle">
                {allOk
                  ? `Mạch sau bù đạt cosφ* = ${fmt(cosφ_new, 4)} ≥ ${target_cosφ}. Công suất tác dụng bảo toàn, dòng điện và công suất biểu kiến giảm.`
                  : 'Một số tiêu chí chưa đạt yêu cầu. Hãy kiểm tra lại giá trị linh kiện bù.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VoltageCalculationWorkbench;
