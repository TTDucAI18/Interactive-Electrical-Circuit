import { useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Check, CircleAlert, Download, FileJson2, ImagePlus, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import { imageToBoard } from './imageApi';
import { updateBoardComponent, validateBoard, type BoardComponent, type BoardDocument, type BoardMode } from './board';

export default function ImageWorkbench() {
  const [mode, setMode] = useState<BoardMode>('schematic');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [board, setBoard] = useState<BoardDocument | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const chooseImage = (next: File | undefined) => {
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setError('Hãy chọn ảnh JPG, PNG hoặc WEBP.'); return; }
    if (next.size > 8 * 1024 * 1024) { setError('Ảnh vượt quá 8 MB. Hãy giảm kích thước ảnh rồi thử lại.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setBoard(null);
    setError('');
    setSuccess('');
  };

  const parseImage = async () => {
    if (!file) { setError('Chọn ảnh sơ đồ hoặc PCB trước.'); return; }
    setBusy(true); setError(''); setSuccess(''); setBoard(null);
    try {
      const extracted = await imageToBoard(file, mode);
      setBoard(extracted);
      setSelected(extracted.components[0]?.id ?? '');
      setSuccess('Đã dựng bản xem trước. Hãy kiểm tra các chi tiết AI nhận diện trước khi dùng.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển ảnh thành bo mạch.');
    } finally { setBusy(false); }
  };

  const importJson = async (next: File | undefined) => {
    if (!next) return;
    try {
      const parsed: unknown = JSON.parse(await next.text());
      const imported = validateBoard(parsed);
      setBoard(imported); setMode(imported.mode); setFile(null); setPreview(''); setSelected(imported.components[0]?.id ?? ''); setError(''); setSuccess('Đã mở file bo mạch.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'File JSON không hợp lệ.'); }
    if (jsonInput.current) jsonInput.current.value = '';
  };

  const downloadBoard = () => {
    if (!board) return;
    let checked: BoardDocument;
    try { checked = validateBoard(board); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'JSON bo mạch không hợp lệ.'); return; }
    const blob = new Blob([`${JSON.stringify(checked, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${safeFilename(board.title)}.board.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const updatePart = (componentId: string, patch: Partial<Pick<BoardComponent, 'reference' | 'type' | 'value'>>) => {
    setBoard((current) => current ? updateBoardComponent(current, componentId, patch) : current);
  };
  const addPart = () => setBoard((current) => {
    if (!current || current.components.length >= 160) return current;
    const existingIds = new Set(current.components.map((part) => part.id));
    let number = current.components.length + 1;
    while (existingIds.has(`manual-${number}`)) number += 1;
    const component: BoardComponent = {
      id: `manual-${number}`, reference: `U${number}`, type: 'other', value: '', unit: '',
      x: 500, y: 500, rotation: 0, confidence: 1,
      pins: current.mode === 'schematic'
        ? [{ id: '1', label: '1', x: -40, y: 0 }, { id: '2', label: '2', x: 40, y: 0 }]
        : [],
    };
    setSelected(component.id);
    return { ...current, components: [...current.components, component] };
  });
  const removeSelectedPart = () => setBoard((current) => {
    if (!current || !selected) return current;
    const components = current.components.filter((part) => part.id !== selected);
    if (components.length === current.components.length) return current;
    setSelected(components[0]?.id ?? '');
    return { ...current, components, connections: current.connections.filter((edge) => edge.componentId !== selected) };
  });
  const updateConnection = (componentId: string, pinId: string, nodeId: string) => {
    setBoard((current) => {
      if (!current) return current;
      const existing = current.connections.find((connection) => connection.componentId === componentId && connection.pinId === pinId);
      if (!nodeId) return { ...current, connections: current.connections.filter((connection) => connection !== existing) };
      if (existing) return { ...current, connections: current.connections.map((connection) => connection === existing ? { ...connection, nodeId, confidence: 1 } : connection) };
      return { ...current, connections: [...current.connections, { id: `manual-${componentId}-${pinId}`, componentId, pinId, nodeId, confidence: 1 }] };
    });
  };
  const addNode = () => setBoard((current) => {
    if (!current) return current;
    let number = current.nodes.length + 1;
    while (current.nodes.some((node) => node.id === `manual-n${number}`)) number += 1;
    return { ...current, nodes: [...current.nodes, { id: `manual-n${number}`, label: `N${number}`, x: 500, y: 500, confidence: 1 }] };
  });
  const updateNode = (nodeId: string, patch: Partial<Pick<BoardDocument['nodes'][number], 'label' | 'x' | 'y'>>) => setBoard((current) => current ? {
    ...current,
    nodes: current.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const safePatch = { ...patch };
      if (typeof safePatch.x === 'number') safePatch.x = Math.max(0, Math.min(1000, safePatch.x));
      if (typeof safePatch.y === 'number') safePatch.y = Math.max(0, Math.min(1000, safePatch.y));
      return { ...node, ...safePatch };
    }),
  } : current);
  const updatePosition = (componentId: string, x: number, y: number) => {
    setBoard((current) => {
      if (!current) return current;
      const previous = current.components.find((part) => part.id === componentId);
      if (!previous) return current;
      const dx = x - previous.x;
      const dy = y - previous.y;
      const moved = updateBoardComponent(current, componentId, { x, y });
      if (current.mode !== 'pcb') return moved;
      return { ...moved, traces: moved.traces.map((trace) => ({
        ...trace,
        points: trace.points.map((point, index) => {
          const atEnd = index === 0 || index === trace.points.length - 1;
          const nearPad = Math.hypot(point.x - previous.x, point.y - previous.y) < 65;
          return atEnd && nearPad ? { x: Math.max(0, Math.min(1000, point.x + dx)), y: Math.max(0, Math.min(1000, point.y + dy)) } : point;
        }),
      })) };
    });
  };
  const resetUpload = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(''); setBoard(null); setError(''); setSuccess('');
  };

  return <main className="image-workbench">
    <section className="image-intro">
      <div><button className="back-link" onClick={resetUpload}><ArrowLeft size={15} /> Làm mới</button>
        <div className="eyebrow"><span className="eyebrow-line" /> NHẬN DIỆN BẰNG GEMINI</div>
        <h1>Từ hình ảnh <span>đến bo mạch.</span></h1>
        <p>Tải ảnh lên, kiểm tra các chi tiết được nhận diện, rồi chỉnh sửa và xuất file JSON.</p>
      </div>
      <label className="mode-select"><span>Loại ảnh</span><select value={mode} onChange={(event) => { setMode(event.target.value as BoardMode); setBoard(null); setError(''); setSuccess(''); }}><option value="schematic">Sơ đồ nguyên lý</option><option value="pcb">Ảnh bo mạch PCB</option></select></label>
    </section>

    <div className={`image-layout ${board ? 'has-board' : ''}`}>
      <section className="upload-card">
        <div className="section-heading"><div><span className="section-kicker">BƯỚC 1</span><h2>Ảnh đầu vào</h2></div>{file && <button className="icon-button" aria-label="Bỏ ảnh" onClick={resetUpload}><X size={17} /></button>}</div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} />
        <input ref={jsonInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
        {preview ? <div className="upload-preview"><img src={preview} alt="Ảnh bo mạch được chọn" /><span>{file?.name} · {formatBytes(file?.size ?? 0)}</span><button onClick={() => fileInput.current?.click()}><ImagePlus size={14} /> Đổi ảnh</button></div> : <button className="drop-area" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files[0]); }}>
          <span className="upload-icon"><Upload size={20} /></span><strong>Kéo ảnh vào đây hoặc chọn ảnh</strong><small>JPG, PNG, WEBP · tối đa 8 MB</small>
        </button>}
        <button className="analyze-button" onClick={() => void parseImage()} disabled={!file || busy}>
          {busy ? <><LoaderCircle size={16} className="spin" /> Đang phân tích ảnh…</> : <><ImagePlus size={16} /> Phân tích và dựng bo mạch</>}
        </button>
        <button className="open-json-button" onClick={() => jsonInput.current?.click()}><FileJson2 size={15} /> Mở file .board.json đã lưu</button>
        <div className="privacy-note"><CircleAlert size={15} /><span>Ảnh được gửi đến Gemini qua backend để nhận diện. Ảnh không được lưu trong file JSON xuất ra.</span></div>
        {error && <div className="image-message error"><CircleAlert size={16} /><span>{error}</span></div>}
        {success && <div className="image-message success"><Check size={16} /><span>{success}</span></div>}
      </section>

      <section className="board-card">
        <div className="section-heading board-heading"><div><span className="section-kicker">{board ? 'BƯỚC 2 · KIỂM TRA VÀ CHỈNH SỬA' : 'BƯỚC 2'}</span><h2>{board?.title ?? 'Bản dựng tương tác'}</h2>{board?.summary && <p className="board-description">{board.summary}</p>}</div>
          {board && <button className="download-button" onClick={downloadBoard}><Download size={15} /> Tải file JSON</button>}
        </div>
        {board ? <>
          <div className={`board-notice ${board.mode}`}><span className="notice-icon"><CircleAlert size={16} /></span><span>{board.mode === 'pcb' ? 'PCB: chỉ thể hiện linh kiện và đường đồng nhìn thấy trong ảnh. Không suy đoán lớp mạch bị che.' : 'Sơ đồ nguyên lý: hãy đối chiếu lại các nút nối và giá trị với ảnh gốc trước khi tính toán.'}</span></div>
          <BoardCanvas board={board} selected={selected} onSelect={setSelected} onMove={updatePosition} />
          <div className="board-summary"><span><b>{board.components.length}</b> linh kiện</span><span><b>{board.mode === 'schematic' ? board.nodes.length : board.traces.length}</b> {board.mode === 'schematic' ? 'nút nối' : 'đường đồng thấy được'}</span><span><b>{board.connections.length}</b> kết nối</span><span>{board.mode === 'pcb' ? 'Kéo linh kiện để sắp xếp' : 'Kéo linh kiện để bố trí lại'}</span></div>
          {board.notes.length > 0 && <ul className="recognition-notes">{board.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
          <div className="board-json-row"><span>File lưu gồm dữ liệu linh kiện, vị trí và kết nối; không chứa ảnh gốc.</span><button onClick={downloadBoard}><Download size={14} /> Xuất .board.json</button></div>
        </> : <div className="board-empty"><div className="empty-illustration"><span className="empty-node node-a" /><span className="empty-node node-b" /><span className="empty-node node-c" /><span className="empty-part part-a">R</span><span className="empty-part part-b">C</span><svg viewBox="0 0 220 100"><path d="M25 50H90M130 50H195M110 22V50M110 50V80" /></svg></div><strong>Bo mạch sẽ hiện ở đây</strong><p>Chọn ảnh sơ đồ hoặc PCB để Gemini nhận diện linh kiện và kết nối.</p></div>}
      </section>
    </div>

    {board && <section className="parts-card">
      <div className="section-heading"><div><span className="section-kicker">DỮ LIỆU NHẬN DIỆN</span><h2>Linh kiện trong bo mạch</h2></div><div className="parts-actions"><span className="parts-count">{board.components.length} mục</span><button className="add-node-button" disabled={board.components.length >= 160} onClick={addPart}><Plus size={14} /> Thêm linh kiện</button>{selected && <button className="remove-part-button" onClick={removeSelectedPart}><Trash2 size={14} /> Xóa mục chọn</button>}</div></div>
      {selected && board.components.some((part) => part.id === selected) ? <PartInspector component={board.components.find((part) => part.id === selected)!} onChange={(patch) => updatePart(selected, patch)} /> : null}
      <div className="parts-table-wrap"><table className="parts-table"><thead><tr><th>Tham chiếu</th><th>Loại</th><th>Giá trị</th><th>Vị trí</th><th>Độ tin cậy</th></tr></thead><tbody>
        {board.components.map((part) => <tr key={part.id} className={selected === part.id ? 'selected-row' : ''} onClick={() => setSelected(part.id)}><td><button>{part.reference}</button></td><td>{part.type}</td><td>{part.value || 'Chưa rõ'} {part.unit}</td><td>{Math.round(part.x)}, {Math.round(part.y)}</td><td><Confidence value={part.confidence} /></td></tr>)}
        {board.components.length === 0 && <tr><td colSpan={5} className="no-parts">Chưa nhận diện được linh kiện. Thử ảnh rõ hơn hoặc nhập file JSON đã chỉnh sửa.</td></tr>}
      </tbody></table></div>
    </section>}
    {board?.mode === 'schematic' && <ConnectionsPanel board={board} onConnectionChange={updateConnection} onAddNode={addNode} onNodeChange={updateNode} />}
    <footer className="page-footer image-footer"><span>Hãy xác minh kết quả AI trước khi sử dụng cho thiết kế hoặc tính toán.</span><span>Không gửi hay lưu API key trong trình duyệt</span></footer>
  </main>;
}

function BoardCanvas({ board, selected, onSelect, onMove }: { board: BoardDocument; selected: string; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000))), y: Math.round(Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000))) };
  };
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const target = (event.target as SVGElement).closest('[data-component-id]');
    const id = target?.getAttribute('data-component-id');
    const component = board.components.find((part) => part.id === id);
    if (!id || !component) return;
    const p = point(event);
    drag.current = { id, dx: p.x - component.x, dy: p.y - component.y };
    onSelect(id);
    svg.current?.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const p = point(event);
    onMove(drag.current.id, p.x - drag.current.dx, p.y - drag.current.dy);
  };
  const pins = new Map(board.components.flatMap((part) => part.pins.map((pin) => {
    const radians = part.rotation * Math.PI / 180;
    return [`${part.id}:${pin.id}`, {
      x: part.x + pin.x * Math.cos(radians) - pin.y * Math.sin(radians),
      y: part.y + pin.x * Math.sin(radians) + pin.y * Math.cos(radians),
    }] as const;
  })));
  return <div className={`board-canvas-wrap board-mode-${board.mode}`}>
    <svg ref={svg} className="board-canvas" viewBox="0 0 1000 1000" aria-label={board.mode === 'pcb' ? 'Bố trí linh kiện PCB có thể kéo thả' : 'Sơ đồ linh kiện và kết nối có thể kéo thả'} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id="board-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill={board.mode === 'pcb' ? '#486951' : '#e5eae4'} /></pattern></defs>
      <rect x="0" y="0" width="1000" height="1000" rx="24" className="board-surface" />
      <rect x="0" y="0" width="1000" height="1000" rx="24" fill="url(#board-grid)" />
      {board.mode === 'schematic' ? <g className="board-wires">{board.connections.map((connection) => {
        const pin = pins.get(`${connection.componentId}:${connection.pinId}`);
        const node = board.nodes.find((item) => item.id === connection.nodeId);
        if (!pin || !node) return null;
        const x1 = pin.x;
        const y1 = pin.y;
        const mid = Math.round((x1 + node.x) / 2);
        return <g key={connection.id} className={connection.confidence < .55 ? 'uncertain-wire' : ''}><path d={`M ${x1} ${y1} H ${mid} V ${node.y} H ${node.x}`} /></g>;
      })}{board.nodes.map((node) => <g key={node.id}><circle cx={node.x} cy={node.y} r="7" className="board-node"/><text x={node.x + 10} y={node.y - 10} className="board-node-label">{node.label}</text></g>)}</g> : <g className="pcb-traces">{board.traces.map((trace) => <polyline key={trace.id} points={trace.points.map((p) => `${p.x},${p.y}`).join(' ')} className={`trace-${trace.layer} ${trace.confidence < .55 ? 'uncertain-trace' : ''}`} />)}</g>}
      {board.components.map((part) => <g key={part.id} data-component-id={part.id} className={`board-part ${selected === part.id ? 'selected' : ''} ${part.confidence < .55 ? 'low-confidence' : ''}`} transform={`translate(${part.x} ${part.y}) rotate(${part.rotation})`} tabIndex={0} role="button" aria-label={`${part.reference}, ${part.type} ${part.value}`} onClick={() => onSelect(part.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(part.id); }}>
        <title>{part.reference} · {part.type} {part.value} · nhận diện {Math.round(part.confidence * 100)}%</title>
        <rect x="-36" y="-23" width="72" height="46" rx={board.mode === 'pcb' ? '6' : '12'} className="board-part-body" />
        <text x="0" y="-1" textAnchor="middle" className="board-part-ref">{part.reference.slice(0, 12)}</text>
        <text x="0" y="13" textAnchor="middle" className="board-part-value">{(part.value || part.type).slice(0, 12)}</text>
      </g>)}
    </svg>
    <span className="canvas-hint">{board.mode === 'pcb' ? 'PCB · kéo linh kiện để sắp xếp' : 'Sơ đồ · kéo linh kiện để sắp xếp'}</span>
  </div>;
}

function PartInspector({ component, onChange }: { component: BoardComponent; onChange: (patch: Partial<Pick<BoardComponent, 'reference' | 'type' | 'value'>>) => void }) {
  return <div className="part-inspector"><span className="inspector-mark">{component.reference.slice(0, 2)}</span><label>Tham chiếu<input value={component.reference} maxLength={20} onChange={(event) => onChange({ reference: event.target.value })} /></label><label>Loại<input value={component.type} maxLength={32} onChange={(event) => onChange({ type: event.target.value })} /></label><label>Giá trị / ghi chú<input value={component.value} maxLength={64} onChange={(event) => onChange({ value: event.target.value })} /></label><span className="inspector-confidence"><Confidence value={component.confidence} /></span><span className="inspector-position">x {Math.round(component.x)} · y {Math.round(component.y)}</span></div>;
}

function ConnectionsPanel({ board, onConnectionChange, onAddNode, onNodeChange }: { board: BoardDocument; onConnectionChange: (componentId: string, pinId: string, nodeId: string) => void; onAddNode: () => void; onNodeChange: (nodeId: string, patch: Partial<Pick<BoardDocument['nodes'][number], 'label' | 'x' | 'y'>>) => void }) {
  const pins = board.components.flatMap((part) => part.pins.map((pin) => ({ part, pin })));
  const connected = (componentId: string, pinId: string) => board.connections.find((connection) => connection.componentId === componentId && connection.pinId === pinId)?.nodeId ?? '';
  return <section className="connections-card">
    <div className="section-heading"><div><span className="section-kicker">SƠ ĐỒ NGUYÊN LÝ</span><h2>Kiểm tra kết nối</h2></div><button className="add-node-button" onClick={onAddNode}>+ Thêm nút</button></div>
    <p className="connection-help">Mỗi chân nối vào một nút. Đổi nút hoặc chọn “Chưa nối” để sửa đường dây trước khi tải JSON.</p>
    <div className="connection-grid">
      <div className="connection-table-wrap"><table className="parts-table connection-table"><thead><tr><th>Linh kiện</th><th>Chân</th><th>Nút điện</th><th>AI</th></tr></thead><tbody>
        {pins.map(({ part, pin }) => <tr key={`${part.id}:${pin.id}`}><td>{part.reference}</td><td>{pin.label || pin.id}</td><td><select aria-label={`${part.reference} chân ${pin.label || pin.id}`} value={connected(part.id, pin.id)} onChange={(event) => onConnectionChange(part.id, pin.id, event.target.value)}><option value="">Chưa nối</option>{board.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></td><td>{connected(part.id, pin.id) ? <Confidence value={board.connections.find((connection) => connection.componentId === part.id && connection.pinId === pin.id)?.confidence ?? 1} /> : '—'}</td></tr>)}
        {pins.length === 0 && <tr><td colSpan={4} className="no-parts">AI chưa tìm thấy chân nối trong ảnh. Có thể thêm nút và mở file JSON để chỉnh sửa thêm.</td></tr>}
      </tbody></table></div>
      <div className="node-list"><h3>Nút điện</h3>{board.nodes.map((node) => <div className="node-editor" key={node.id}><span className="node-color" /><input aria-label="Tên nút điện" value={node.label} maxLength={20} onChange={(event) => onNodeChange(node.id, { label: event.target.value })} /><label>x<input type="number" min="0" max="1000" value={node.x} onChange={(event) => onNodeChange(node.id, { x: Number(event.target.value) })} /></label><label>y<input type="number" min="0" max="1000" value={node.y} onChange={(event) => onNodeChange(node.id, { y: Number(event.target.value) })} /></label></div>)}</div>
    </div>
  </section>;
}

function Confidence({ value }: { value: number }) {
  return <span className={`confidence ${value < .55 ? 'low' : value < .8 ? 'medium' : 'high'}`}>{Math.round(value * 100)}%</span>;
}

function safeFilename(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mach-dien';
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
