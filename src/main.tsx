import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDown, ArrowUp, BookOpen, CircleHelp, CircuitBoard, ChevronDown, ChevronUp, ImagePlus, Info, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { calculateCircuit, formatComplex, magnitude, phase, units, type CircuitComponent, type ComponentKind, type ComponentSlot, type CircuitResult } from './circuit';
import ImageWorkbench from './ImageWorkbench';
import './style.css';

const initialSlots: ComponentSlot[] = [
  { id: 1, title: 'Nhánh nguồn trên', hint: 'Nguồn (+) đến nút 1', components: [{ id: 'r1', label: 'R1', kind: 'R', value: 10 }] },
  { id: 2, title: 'Nhánh nguồn dưới', hint: 'Nút 1 về nguồn (−)', components: [{ id: 'r2', label: 'R2', kind: 'R', value: 10 }] },
  { id: 3, title: 'Nhánh dưới', hint: 'Nút 1 đến nút 2', components: [{ id: 'r3', label: 'R3', kind: 'R', value: 22 }] },
  { id: 4, title: 'Nhánh trên', hint: 'Nút 1 đến nút 2', components: [{ id: 'l4', label: 'L4', kind: 'L', value: 68 }] },
  { id: 5, title: 'Nhánh phụ tại nút 1', hint: 'Phần trên của nhánh', components: [{ id: 'c5', label: 'C5', kind: 'C', value: 100 }] },
  { id: 6, title: 'Nhánh phụ tại nút 1', hint: 'Phần dưới của nhánh', components: [{ id: 'r6', label: 'R6', kind: 'R', value: 15 }] },
  { id: 7, title: 'Nhánh song song tại nút 2', hint: 'Nhánh phụ A', components: [{ id: 'r7', label: 'R7', kind: 'R', value: 47 }] },
  { id: 8, title: 'Nhánh song song tại nút 2', hint: 'Nhánh phụ B', components: [{ id: 'c8', label: 'C8', kind: 'C', value: 220 }] },
];

function App() {
  const [voltage, setVoltage] = useState(24);
  const [frequency, setFrequency] = useState(50);
  const [slots, setSlots] = useState(initialSlots);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState(1);
  const [screen, setScreen] = useState<'simulator' | 'image'>('simulator');
  const validation = useMemo(() => {
    if (!Number.isFinite(voltage) || voltage <= 0) return 'Điện áp phải lớn hơn 0 V.';
    if (!Number.isFinite(frequency) || frequency <= 0) return 'Tần số phải lớn hơn 0 Hz.';
    for (const slot of slots) for (const part of slot.components) {
      if (!part.label.trim()) return `Hãy nhập tên cho linh kiện ở ${slot.title.toLowerCase()}.`;
      if (!Number.isFinite(part.value) || part.value <= 0) return `${part.label} phải có giá trị lớn hơn 0.`;
    }
    return '';
  }, [voltage, frequency, slots]);
  const resultState = useMemo(() => {
    if (validation) return { result: null, error: validation };
    try {
      return { result: calculateCircuit({ voltage, frequency, slots }), error: '' };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : 'Không thể tính mạch này.' };
    }
  }, [voltage, frequency, slots, validation]);
  const result = resultState.result;

  const updateSlot = (slotId: number, updater: (slot: ComponentSlot) => ComponentSlot) => {
    setSlots((current) => current.map((slot) => slot.id === slotId ? updater(slot) : slot));
  };
  const updateComponent = (slotId: number, componentId: string, patch: Partial<CircuitComponent>) => {
    updateSlot(slotId, (slot) => ({ ...slot, components: slot.components.map((part) => part.id === componentId ? { ...part, ...patch } : part) }));
  };
  const addComponent = (slotId: number) => updateSlot(slotId, (slot) => ({
    ...slot,
    components: [...slot.components, { id: `part-${Date.now()}-${Math.random().toString(16).slice(2)}`, label: nextLabel(slot), kind: 'R', value: 10 }],
  }));
  const removeComponent = (slotId: number, componentId: string) => updateSlot(slotId, (slot) => ({ ...slot, components: slot.components.filter((part) => part.id !== componentId) }));
  const moveComponent = (slotId: number, index: number, delta: number) => updateSlot(slotId, (slot) => {
    const next = [...slot.components];
    const to = index + delta;
    if (to < 0 || to >= next.length) return slot;
    [next[index], next[to]] = [next[to], next[index]];
    return { ...slot, components: next };
  });
  const reset = () => { setVoltage(24); setFrequency(50); setSlots(initialSlots); };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Mạch RLC - đầu trang">
        <span className="brand-mark"><CircuitBoard size={21} strokeWidth={1.8} /></span>
        <span><strong>Mạch RLC</strong><small>PHÒNG THỰC HÀNH</small></span>
      </a>
      <nav className="top-nav" aria-label="Điều hướng chính">
        <button className={`nav-link ${screen === 'simulator' ? 'active' : ''}`} onClick={() => { setScreen('simulator'); setHelpOpen(false); }}><Activity size={16} /> Mô phỏng</button>
        <button className={`nav-link ${screen === 'image' ? 'active' : ''}`} onClick={() => { setScreen('image'); setHelpOpen(false); }}><ImagePlus size={16} /> Ảnh → bo mạch</button>
        {screen === 'simulator' && <button className={`nav-link ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((value) => !value)}><BookOpen size={16} /> Hướng dẫn</button>}
      </nav>
      <span className="local-badge"><span className="online-dot" /> Chạy trên thiết bị</span>
    </header>

    {screen === 'image' ? <ImageWorkbench /> : <main id="top" className="main-content">
      <section className="intro-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MÔ PHỎNG MẠCH XOAY CHIỀU</div>
          <h1>Hiểu mạch điện <span>qua từng thay đổi.</span></h1>
          <p className="intro-copy">Điều chỉnh linh kiện và xem kết quả RLC thay đổi ngay lập tức.</p>
        </div>
        <button className="reset-button" onClick={reset}><RotateCcw size={15} /> Đặt lại mạch</button>
      </section>

      <section className="source-bar" aria-label="Thông số nguồn điện">
        <div className="source-title"><span className="source-icon"><Zap size={18} fill="currentColor" /></span><span><strong>Nguồn điện</strong><small>Điện áp xoay chiều hình sin</small></span></div>
        <label className="source-field"><span>Điện áp</span><span className="input-wrap"><input aria-label="Điện áp nguồn" type="number" min="0.01" step="1" value={voltage} onChange={(event) => setVoltage(event.target.value === '' ? Number.NaN : Number(event.target.value))} /><i>V</i></span></label>
        <label className="source-field"><span>Tần số</span><span className="input-wrap"><input aria-label="Tần số nguồn" type="number" min="0.01" step="1" value={frequency} onChange={(event) => setFrequency(event.target.value === '' ? Number.NaN : Number(event.target.value))} /><i>Hz</i></span></label>
        <div className="source-note"><Info size={15} /><span>Giá trị hiệu dụng (RMS)</span></div>
      </section>

      <div id="mo-phong" className="workspace-grid">
        <div className="left-column">
          <CircuitDiagram slots={slots} activeSlot={activeSlot} onSelect={setActiveSlot} voltage={voltage} />
          <section className="results-card" aria-live="polite">
            <div className="section-heading result-heading"><div><span className="section-kicker">KẾT QUẢ MẠCH</span><h2>Thông số tổng</h2></div><span className="live-pill"><span /> Cập nhật trực tiếp</span></div>
            {result ? <Results result={result} slots={slots} /> : <div className="error-state"><CircleHelp size={17} /><span>{resultState.error}</span></div>}
          </section>
        </div>
        <section className="editor-card" aria-label="Chỉnh sửa linh kiện">
          <div className="section-heading editor-heading"><div><span className="section-kicker">THIẾT LẬP MẠCH</span><h2>Linh kiện <span className="count-badge">{slots.reduce((total, slot) => total + slot.components.length, 0)}</span></h2></div><span className="editor-note">Chạm vào vị trí trên sơ đồ để chọn</span></div>
          <div className="slot-tabs" role="tablist" aria-label="Vị trí mạch">
            {slots.map((slot) => <button key={slot.id} role="tab" aria-selected={activeSlot === slot.id} className={activeSlot === slot.id ? 'slot-tab selected' : 'slot-tab'} onClick={() => setActiveSlot(slot.id)}>V{slot.id}</button>)}
          </div>
          {slots.filter((slot) => slot.id === activeSlot).map((slot) => <div className="slot-editor" key={slot.id}>
            <div className="slot-title-row"><div><div className="slot-title"><span className="slot-number">{slot.id}</span><h3>{slot.title}</h3></div><p>{slot.hint}</p></div><span className="slot-type">{slot.components.length} linh kiện</span></div>
            <div className="component-list">
              {slot.components.length === 0 && <div className="empty-slot"><Info size={16} /> Vị trí đang để hở, không có dòng điện qua nhánh này.</div>}
              {slot.components.map((part, index) => <ComponentEditor key={part.id} component={part} index={index} total={slot.components.length} onChange={(patch) => updateComponent(slot.id, part.id, patch)} onRemove={() => removeComponent(slot.id, part.id)} onMove={(delta) => moveComponent(slot.id, index, delta)} />)}
            </div>
            <button className="add-component" onClick={() => addComponent(slot.id)}><Plus size={16} /> Thêm linh kiện nối tiếp</button>
            <div className="slot-tip"><Info size={14} /><span>Thứ tự linh kiện chỉ dùng để sắp xếp hiển thị; các linh kiện trong vị trí này mắc nối tiếp.</span></div>
          </div>)}
          <div className="editor-footer"><span><span className="online-dot" /> Kết quả tính tự động</span><span>Đơn vị L: mH · C: µF</span></div>
        </section>
      </div>

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      <footer className="page-footer"><span>Được tạo để học và khám phá mạch điện.</span><span>Không cần cài đặt · Thông số không gửi lên máy chủ</span></footer>
    </main>}
  </div>;
}

function nextLabel(slot: ComponentSlot) {
  const index = slot.components.length + 1;
  return `R${slot.id}.${index}`;
}

function ComponentEditor({ component, index, total, onChange, onRemove, onMove }: { component: CircuitComponent; index: number; total: number; onChange: (patch: Partial<CircuitComponent>) => void; onRemove: () => void; onMove: (delta: number) => void }) {
  return <article className="component-row">
    <div className={`component-symbol symbol-${component.kind.toLowerCase()}`}>{component.kind}</div>
    <div className="component-fields">
      <label className="component-label">Tên linh kiện<input aria-label="Tên linh kiện" value={component.label} maxLength={12} onChange={(event) => onChange({ label: event.target.value })} /></label>
      <label className="component-type">Loại<select aria-label="Loại linh kiện" value={component.kind} onChange={(event) => onChange({ kind: event.target.value as ComponentKind, label: `${event.target.value}${component.label.replace(/^[RLC]/, '')}` })}><option value="R">Điện trở R</option><option value="L">Cuộn cảm L</option><option value="C">Tụ điện C</option></select></label>
      <label className="component-value">Giá trị<span className="input-wrap"><input aria-label="Giá trị linh kiện" type="number" min="0.001" step="any" value={component.value} onChange={(event) => onChange({ value: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /><i>{units[component.kind]}</i></span></label>
    </div>
    <div className="component-actions">
      <button aria-label="Di chuyển lên" title="Di chuyển lên" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
      <button aria-label="Di chuyển xuống" title="Di chuyển xuống" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
      <button aria-label="Xóa linh kiện" title="Xóa linh kiện" onClick={onRemove}><Trash2 size={14} /></button>
    </div>
  </article>;
}

function CircuitDiagram({ slots, activeSlot, onSelect, voltage }: { slots: ComponentSlot[]; activeSlot: number; onSelect: (slot: number) => void; voltage: number }) {
  const components = (id: number) => slots.find((slot) => slot.id === id)?.components ?? [];
  const label = (id: number) => components(id).map((part) => `${part.label} · ${part.kind}`).join(' + ') || 'Đang hở';
  return <section className="diagram-card">
    <div className="section-heading diagram-heading"><div><span className="section-kicker">SƠ ĐỒ MẠCH</span><h2>Mạch RLC xoay chiều</h2></div><span className="diagram-legend"><span className="legend-source" /> Nguồn <span className="legend-line" /> Dây dẫn</span></div>
    <div className="diagram-frame">
      <svg viewBox="0 0 760 350" role="img" aria-label="Sơ đồ mạch RLC tám vị trí nối tiếp và song song" className="circuit-svg">
        <defs><pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e8ebe5" /></pattern></defs>
        <rect x="0" y="0" width="760" height="350" fill="url(#dot-grid)" />
        <g className="wire-lines">
          <path d="M92 85 H140 M208 85 H270 M92 265 H140 M208 265 H270 M270 85 H353 M407 85 H490 M270 265 H353 M407 265 H490 M490 85 H587 M643 85 H665 M490 265 H587 M643 265 H665" />
          <path d="M270 85 V103 M270 157 V193 M270 247 V265 M490 85 V148 M490 202 V265 M615 85 V148 M615 202 V265" />
        </g>
        <g className="nodes"><circle cx="270" cy="85" r="4"/><circle cx="270" cy="265" r="4"/><circle cx="490" cy="85" r="4"/><circle cx="490" cy="265" r="4"/><circle cx="615" cy="85" r="4"/><circle cx="615" cy="265" r="4"/></g>
        <g className="source-mark"><circle cx="55" cy="175" r="27"/><path d="M45 175c5-12 10-12 15 0s10 12 15 0"/><text x="34" y="226">{Number.isFinite(voltage) ? voltage : '—'} V</text></g>
        <path className="wire-lines" d="M55 148 V85 H92 M55 202 V265 H92" />
        <CircuitPart id={1} x={174} y={85} vertical={false} activeSlot={activeSlot} onSelect={onSelect} label={label(1)} type={components(1)[0]?.kind ?? 'R'} />
        <CircuitPart id={2} x={174} y={265} vertical={false} activeSlot={activeSlot} onSelect={onSelect} label={label(2)} type={components(2)[0]?.kind ?? 'R'} />
        <CircuitPart id={4} x={380} y={85} vertical={false} activeSlot={activeSlot} onSelect={onSelect} label={label(4)} type={components(4)[0]?.kind ?? 'R'} />
        <CircuitPart id={3} x={380} y={265} vertical={false} activeSlot={activeSlot} onSelect={onSelect} label={label(3)} type={components(3)[0]?.kind ?? 'R'} />
        <CircuitPart id={5} x={270} y={130} vertical activeSlot={activeSlot} onSelect={onSelect} label={label(5)} type={components(5)[0]?.kind ?? 'R'} />
        <CircuitPart id={6} x={270} y={220} vertical activeSlot={activeSlot} onSelect={onSelect} label={label(6)} type={components(6)[0]?.kind ?? 'R'} />
        <CircuitPart id={7} x={490} y={175} vertical activeSlot={activeSlot} onSelect={onSelect} label={label(7)} type={components(7)[0]?.kind ?? 'R'} />
        <CircuitPart id={8} x={615} y={175} vertical activeSlot={activeSlot} onSelect={onSelect} label={label(8)} type={components(8)[0]?.kind ?? 'R'} />
        <text className="node-label" x="255" y="58">Nút 1</text><text className="node-label" x="475" y="58">Nút 2</text>
      </svg>
    </div>
    <div className="diagram-caption"><span><Info size={14} /> Chọn một vị trí để chỉnh linh kiện.</span><span className="caption-separator">·</span><span>R nối tiếp theo từng nhánh, các nhánh mắc song song như sơ đồ.</span></div>
  </section>;
}

function CircuitPart({ id, x, y, vertical, activeSlot, onSelect, label, type }: { id: number; x: number; y: number; vertical: boolean; activeSlot: number; onSelect: (id: number) => void; label: string; type: ComponentKind }) {
  const active = activeSlot === id;
  return <g className={`component-svg ${active ? 'is-active' : ''} ${vertical ? 'vertical-part' : ''}`} role="button" tabIndex={0} aria-label={`Chọn vị trí ${id}: ${label}`} onClick={() => onSelect(id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(id); }}>
    <rect className="part-hit" x={vertical ? x - 35 : x - 40} y={vertical ? y - 29 : y - 31} width={vertical ? 70 : 80} height={vertical ? 58 : 62} rx="10" />
    <g transform={vertical ? `translate(${x} ${y}) rotate(90)` : `translate(${x} ${y})`}>
      <rect className="part-body" x="-27" y="-14" width="54" height="28" rx="7" />
      <text className="part-type" x="0" y="4" textAnchor="middle">{type}</text>
    </g>
    <text className="part-number" x={vertical ? x + 28 : x} y={vertical ? y - 33 : y - 21} textAnchor="middle">V{id}</text>
    <text className="part-label" x={vertical ? x + 41 : x} y={vertical ? y + 7 : y + 31} textAnchor="middle">{label.length > 20 ? `${label.slice(0, 18)}…` : label}</text>
  </g>;
}

function Results({ result, slots }: { result: CircuitResult; slots: ComponentSlot[] }) {
  const totalComponents = slots.reduce((total, slot) => total + slot.components.length, 0);
  return <>
    <div className="metric-grid">
      <Metric label="Tổng trở" value={magnitude(result.impedance).toFixed(2)} unit="Ω" detail={`${phase(result.impedance).toFixed(1)}° pha`} accent />
      <Metric label="Dòng nguồn" value={magnitude(result.sourceCurrent).toFixed(3)} unit="A" detail={`${phase(result.sourceCurrent).toFixed(1)}° pha`} />
      <Metric label="Công suất" value={result.activePower.toFixed(2)} unit="W" detail={`Biểu kiến ${result.apparentPower.toFixed(2)} VA`} />
      <Metric label="Hệ số công suất" value={result.powerFactor.toFixed(3)} unit="" detail={result.reactivePower >= 0 ? 'Tải cảm' : 'Tải dung'} />
    </div>
    <details className="detail-results"><summary><span>Xem dòng và áp từng vị trí <small>({totalComponents} linh kiện)</small></span><ChevronDown size={16} /></summary>
      <div className="slot-result-list">{slots.map((slot) => {
        const item = result.slots[slot.id];
        return <div className="slot-result" key={slot.id}><strong>Vị trí {slot.id}</strong><span>I = {magnitude(item.current).toFixed(3)} A</span><span>U = {magnitude(item.voltage).toFixed(2)} V</span></div>;
      })}</div>
      <div className="power-row"><span>Công suất phản kháng <b>{result.reactivePower.toFixed(2)} var</b></span><span>Tổng trở phức <b>{formatComplex(result.impedance, 'Ω')}</b></span></div>
    </details>
  </>;
}

function Metric({ label, value, unit, detail, accent = false }: { label: string; value: string; unit: string; detail: string; accent?: boolean }) {
  return <div className={`metric-card ${accent ? 'metric-accent' : ''}`}><span className="metric-label">{label}</span><strong>{value}<i>{unit}</i></strong><small>{detail}</small></div>;
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return <section id="huong-dan" className="help-panel">
    <div className="section-heading"><div><span className="section-kicker">BẮT ĐẦU NHANH</span><h2>Cách dùng mô phỏng</h2></div><button className="icon-button" aria-label="Đóng hướng dẫn" onClick={onClose}><ChevronUp size={18} /></button></div>
    <div className="help-grid">
      <article><span className="help-step">01</span><h3>Đặt nguồn</h3><p>Nhập điện áp hiệu dụng (V) và tần số (Hz) của nguồn xoay chiều.</p></article>
      <article><span className="help-step">02</span><h3>Chọn vị trí</h3><p>Chạm vào linh kiện trên sơ đồ hoặc chọn thẻ V1–V8 để mở phần chỉnh sửa.</p></article>
      <article><span className="help-step">03</span><h3>Chỉnh linh kiện</h3><p>Chọn R, L hoặc C, nhập giá trị và thêm linh kiện nối tiếp nếu cần. L dùng mH, C dùng µF.</p></article>
      <article><span className="help-step">04</span><h3>Đọc kết quả</h3><p>Các thông số tự cập nhật. Mở “Xem dòng và áp từng vị trí” để xem chi tiết mỗi nhánh.</p></article>
    </div>
    <div className="formula-note"><span className="formula-chip">CÔNG THỨC</span><span>Z<sub>R</sub> = R</span><span>Z<sub>L</sub> = j2πfL</span><span>Z<sub>C</sub> = 1 / j2πfC</span><span className="formula-foot">Phân tích trạng thái ổn định với nguồn hình sin.</span></div>
  </section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
