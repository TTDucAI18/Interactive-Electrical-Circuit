import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Check, CircleAlert, Download, FileJson2, ImagePlus, LoaderCircle, Plus, Smile, Trash2, Upload, X } from 'lucide-react';
import { imageToBoard, type ImageApiError, type ImageProgress } from './imageApi';
import { updateBoardComponent, validateBoard, type BoardComponent, type BoardDocument, type BoardMode } from './board';
import { translate, type Language } from './i18n';

type Message = { key: Parameters<typeof translate>[1]; params?: Record<string, string | number> };

export default function ImageWorkbench({ language }: { language: Language }) {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params);
  const [mode, setMode] = useState<BoardMode>('schematic');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [board, setBoard] = useState<BoardDocument | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImageProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showPrankPaywall, setShowPrankPaywall] = useState(false);
  const [showJustKidding, setShowJustKidding] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const [success, setSuccess] = useState<Message | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const kiddingTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => () => { if (kiddingTimer.current !== null) window.clearTimeout(kiddingTimer.current); }, []);

  const chooseImage = (next: File | undefined) => {
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setError({ key: 'invalidImageType' }); return; }
    if (next.size > 8 * 1024 * 1024) { setError({ key: 'tooLarge' }); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setBoard(null);
    setError(null);
    setSuccess(null);
    setProgress(null);
    setShowPrankPaywall(false);
    setShowJustKidding(false);
  };

  const parseImage = async () => {
    if (!file) { setError({ key: 'chooseFirst' }); return; }
    setBusy(true); setProgress(null); setError(null); setSuccess(null); setBoard(null); setShowPrankPaywall(false); setShowJustKidding(false);
    try {
      const extracted = await imageToBoard(file, mode, language, setProgress);
      setBoard(extracted);
      setSelected(extracted.components[0]?.id ?? '');
      setSuccess({ key: 'imageSuccess' });
      setShowPrankPaywall(true);
    } catch (cause) {
      setError(localizeImageError(cause));
    } finally { setBusy(false); setProgress(null); }
  };

  const revealBoard = () => {
    setShowPrankPaywall(false);
    setShowJustKidding(true);
    if (kiddingTimer.current !== null) window.clearTimeout(kiddingTimer.current);
    kiddingTimer.current = window.setTimeout(() => setShowJustKidding(false), 3000);
  };

  const importJson = async (next: File | undefined) => {
    if (!next) return;
    try {
      const parsed: unknown = JSON.parse(await next.text());
      const imported = validateBoard(parsed);
      setBoard(imported); setMode(imported.mode); setFile(null); setPreview(''); setSelected(imported.components[0]?.id ?? ''); setError(null); setSuccess({ key: 'boardOpened' }); setShowPrankPaywall(false); setShowJustKidding(false);
    } catch { setError({ key: 'invalidBoardJson' }); }
    if (jsonInput.current) jsonInput.current.value = '';
  };

  const downloadBoard = () => {
    if (!board) return;
    let checked: BoardDocument;
    try { checked = validateBoard(board); }
    catch { setError({ key: 'invalidBoardJson' }); return; }
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
    setFile(null); setPreview(''); setBoard(null); setError(null); setSuccess(null); setProgress(null); setShowPrankPaywall(false); setShowJustKidding(false);
  };

  return <main className="image-workbench">
    <section className="image-intro">
      <div><button className="back-link" onClick={resetUpload}><ArrowLeft size={15} /> {t('refresh')}</button>
        <div className="eyebrow"><span className="eyebrow-line" /> GEMINI</div>
        <h1>{t('imageTitle')} <span>{t('imageAccent')}</span></h1>
        <p>{t('imageCopy')}</p>
      </div>
      <label className="mode-select"><span>{t('imageKind')}</span><select value={mode} onChange={(event) => { setMode(event.target.value as BoardMode); setBoard(null); setError(null); setSuccess(null); }}><option value="schematic">{t('schematic')}</option><option value="pcb">{t('pcb')}</option></select></label>
    </section>

    <div className={`image-layout ${board ? 'has-board' : ''}`}>
      <section className="upload-card">
        <div className="section-heading"><div><span className="section-kicker">{t('step1')}</span><h2>{t('inputImage')}</h2></div>{file && <button className="icon-button" aria-label={t('removeImage')} onClick={resetUpload}><X size={17} /></button>}</div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} />
        <input ref={jsonInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
        {preview ? <div className="upload-preview"><img src={preview} alt={t('inputImage')} /><span>{file?.name} · {formatBytes(file?.size ?? 0)}</span><button onClick={() => fileInput.current?.click()}><ImagePlus size={14} /> {t('changeImage')}</button></div> : <button className="drop-area" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files[0]); }}>
          <span className="upload-icon"><Upload size={20} /></span><strong>{t('chooseImage')}</strong><small>{t('imageFormats')}</small>
        </button>}
        <button className="analyze-button" onClick={() => void parseImage()} disabled={!file || busy}>
          {busy ? <><LoaderCircle size={16} className="spin" /> {t('analyzing')}</> : <><ImagePlus size={16} /> {t('analyze')}</>}
        </button>
        {busy && progress && <AnalysisProgress progress={progress} elapsed={elapsed} language={language} />}
        <button className="open-json-button" onClick={() => jsonInput.current?.click()}><FileJson2 size={15} /> {t('openJson')}</button>
        <div className="privacy-note"><CircleAlert size={15} /><span>{t('imagePrivacy')}</span></div>
        {error && <div className="image-message error" role="alert"><CircleAlert size={16} /><span>{t(error.key, error.params)}</span></div>}
        {success && <div className="image-message success" role="status"><Check size={16} /><span>{t(success.key, success.params)}</span></div>}
      </section>

      <section className="board-card">
        <div className="section-heading board-heading"><div><span className="section-kicker">{board ? t('reviewEdit') : t('step2')}</span><h2>{board?.title ?? t('previewBoard')}</h2>{board?.summary && <p className="board-description">{board.summary}</p>}</div>
          {board && <button className="download-button" onClick={downloadBoard}><Download size={15} /> {t('downloadJson')}</button>}
        </div>
        {board ? <>
          <div className={`board-notice ${board.mode}`}><span className="notice-icon"><CircleAlert size={16} /></span><span>{board.mode === 'pcb' ? t('pcbNotice') : t('schematicNotice')}</span></div>
          <BoardCanvas board={board} selected={selected} onSelect={setSelected} onMove={updatePosition} language={language} />
          <div className="board-summary"><span>{t('partsCount', { count: board.components.length })}</span><span>{board.mode === 'schematic' ? t('junctionCount', { count: board.nodes.length }) : t('visibleTraces', { count: board.traces.length })}</span><span>{t('connectionCount', { count: board.connections.length })}</span><span>{board.mode === 'pcb' ? t('dragToArrange') : t('dragSchematic')}</span></div>
          {board.notes.length > 0 && <ul className="recognition-notes">{board.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
          <div className="board-json-row"><span>{t('boardFileHelp')}</span><button onClick={downloadBoard}><Download size={14} /> {t('exportBoard')}</button></div>
        </> : <div className="board-empty"><div className="empty-illustration"><span className="empty-node node-a" /><span className="empty-node node-b" /><span className="empty-node node-c" /><span className="empty-part part-a">R</span><span className="empty-part part-b">C</span><svg viewBox="0 0 220 100"><path d="M25 50H90M130 50H195M110 22V50M110 50V80" /></svg></div><strong>{t('emptyBoard')}</strong><p>{t('emptyBoardHelp')}</p></div>}
      </section>
    </div>

    {board && <section className="parts-card">
      <div className="section-heading"><div><span className="section-kicker">{t('recognizedParts')}</span><h2>{t('recognizedParts')}</h2></div><div className="parts-actions"><span className="parts-count">{t('items', { count: board.components.length })}</span><button className="add-node-button" disabled={board.components.length >= 160} onClick={addPart}><Plus size={14} /> {t('add')}</button>{selected && <button className="remove-part-button" onClick={removeSelectedPart}><Trash2 size={14} /> {t('deleteSelected')}</button>}</div></div>
      {selected && board.components.some((part) => part.id === selected) ? <PartInspector component={board.components.find((part) => part.id === selected)!} language={language} onChange={(patch) => updatePart(selected, patch)} /> : null}
      <div className="parts-table-wrap"><table className="parts-table"><thead><tr><th>{t('reference')}</th><th>{t('partType')}</th><th>{t('value')}</th><th>{t('position')}</th><th>{t('confidence')}</th></tr></thead><tbody>
        {board.components.map((part) => <tr key={part.id} className={selected === part.id ? 'selected-row' : ''} onClick={() => setSelected(part.id)}><td><button>{part.reference}</button></td><td>{part.type}</td><td>{part.value || t('unconnected')} {part.unit}</td><td>{Math.round(part.x)}, {Math.round(part.y)}</td><td><Confidence value={part.confidence} /></td></tr>)}
        {board.components.length === 0 && <tr><td colSpan={5} className="no-parts">{t('noParts')}</td></tr>}
      </tbody></table></div>
    </section>}
    {board?.mode === 'schematic' && <ConnectionsPanel board={board} language={language} onConnectionChange={updateConnection} onAddNode={addNode} onNodeChange={updateNode} />}
    <footer className="page-footer image-footer"><span>{t('confidenceReview')}</span><span>{t('noApiKey')}</span></footer>
    {showJustKidding && <div className="just-kidding-toast" role="status"><Smile size={19} /> {t('prankJustKidding')}</div>}
    {showPrankPaywall && <div className="prank-paywall-backdrop">
      <section className="prank-paywall" role="dialog" aria-modal="true" aria-labelledby="prank-paywall-title">
        <span className="prank-smile"><Smile size={27} /></span>
        <span className="prank-kicker">GEMINI BOARD</span>
        <h2 id="prank-paywall-title">{t('prankTitle')}</h2>
        <p>{t('prankOffer')}</p>
        <button onClick={revealBoard}>{t('prankButton')} <span aria-hidden="true">🙂</span></button>
        <small>{t('prankDisclaimer')}</small>
      </section>
    </div>}
  </main>;
}

function AnalysisProgress({ progress, elapsed, language }: { progress: ImageProgress; elapsed: number; language: Language }) {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params);
  const message = progress.stage === 'preparing' ? t('progressPreparing')
    : progress.stage === 'uploading' ? t('progressUploading', { percent: progress.percent ?? 0 })
      : progress.stage === 'waiting' ? t('progressWaiting')
        : progress.stage === 'response' ? t('progressResponse')
          : progress.stage === 'decoding' ? t('progressDecoding') : t('progressFallback');
  const determinate = progress.stage === 'uploading' && progress.percent !== undefined;
  return <div className="analysis-progress" role="status" aria-live="polite" aria-atomic="true">
    <div className="analysis-progress-heading"><LoaderCircle size={15} className="spin" /><strong>{message}</strong></div>
    <div className={`analysis-progress-track ${determinate ? 'determinate' : 'indeterminate'}`}>
      <span style={determinate ? { width: `${progress.percent}%` } : undefined} />
    </div>
    <div className="analysis-progress-meta"><span>{progress.model ?? 'Gemini'} · {t('progressElapsed', { seconds: elapsed })}</span>{determinate && <b>{progress.percent}%</b>}</div>
  </div>;
}

function BoardCanvas({ board, selected, onSelect, onMove, language }: { board: BoardDocument; selected: string; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void; language: Language }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
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
    <svg ref={svg} className="board-canvas" viewBox="0 0 1000 1000" aria-label={board.mode === 'pcb' ? `${t('pcb')} · ${t('dragToArrange')}` : `${t('schematic')} · ${t('dragSchematic')}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
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
        <title>{part.reference} · {part.type} {part.value} · {t('confidence')} {Math.round(part.confidence * 100)}%</title>
        <rect x="-36" y="-23" width="72" height="46" rx={board.mode === 'pcb' ? '6' : '12'} className="board-part-body" />
        <text x="0" y="-1" textAnchor="middle" className="board-part-ref">{part.reference.slice(0, 12)}</text>
        <text x="0" y="13" textAnchor="middle" className="board-part-value">{(part.value || part.type).slice(0, 12)}</text>
      </g>)}
    </svg>
    <span className="canvas-hint">{board.mode === 'pcb' ? t('dragToArrange') : t('dragSchematic')}</span>
  </div>;
}

function PartInspector({ component, language, onChange }: { component: BoardComponent; language: Language; onChange: (patch: Partial<Pick<BoardComponent, 'reference' | 'type' | 'value'>>) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="part-inspector"><span className="inspector-mark">{component.reference.slice(0, 2)}</span><label>{t('reference')}<input value={component.reference} maxLength={20} onChange={(event) => onChange({ reference: event.target.value })} /></label><label>{t('partType')}<input value={component.type} maxLength={32} onChange={(event) => onChange({ type: event.target.value })} /></label><label>{t('partValue')}<input value={component.value} maxLength={64} onChange={(event) => onChange({ value: event.target.value })} /></label><span className="inspector-confidence">{t('confidence')} <Confidence value={component.confidence} /></span><span className="inspector-position">x {Math.round(component.x)} · y {Math.round(component.y)}</span></div>;
}

function ConnectionsPanel({ board, language, onConnectionChange, onAddNode, onNodeChange }: { board: BoardDocument; language: Language; onConnectionChange: (componentId: string, pinId: string, nodeId: string) => void; onAddNode: () => void; onNodeChange: (nodeId: string, patch: Partial<Pick<BoardDocument['nodes'][number], 'label' | 'x' | 'y'>>) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const pins = board.components.flatMap((part) => part.pins.map((pin) => ({ part, pin })));
  const connected = (componentId: string, pinId: string) => board.connections.find((connection) => connection.componentId === componentId && connection.pinId === pinId)?.nodeId ?? '';
  return <section className="connections-card">
    <div className="section-heading"><div><span className="section-kicker">{t('schematic')}</span><h2>{t('connectionsTitle')}</h2></div><button className="add-node-button" onClick={onAddNode}>{t('addNode')}</button></div>
    <p className="connection-help">{t('connectionHelp')}</p>
    <div className="connection-grid">
      <div className="connection-table-wrap"><table className="parts-table connection-table"><thead><tr><th>{t('partColumn')}</th><th>{t('pinColumn')}</th><th>{t('nodeColumn')}</th><th>{t('aiColumn')}</th></tr></thead><tbody>
        {pins.map(({ part, pin }) => <tr key={`${part.id}:${pin.id}`}><td>{part.reference}</td><td>{pin.label || pin.id}</td><td><select aria-label={`${part.reference} ${t('pinColumn')} ${pin.label || pin.id}`} value={connected(part.id, pin.id)} onChange={(event) => onConnectionChange(part.id, pin.id, event.target.value)}><option value="">{t('unconnected')}</option>{board.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></td><td>{connected(part.id, pin.id) ? <Confidence value={board.connections.find((connection) => connection.componentId === part.id && connection.pinId === pin.id)?.confidence ?? 1} /> : '—'}</td></tr>)}
        {pins.length === 0 && <tr><td colSpan={4} className="no-parts">{t('noPins')}</td></tr>}
      </tbody></table></div>
      <div className="node-list"><h3>{t('nodeList')}</h3>{board.nodes.map((node) => <div className="node-editor" key={node.id}><span className="node-color" /><input aria-label={t('nodeList')} value={node.label} maxLength={20} onChange={(event) => onNodeChange(node.id, { label: event.target.value })} /><label>x<input type="number" min="0" max="1000" value={node.x} onChange={(event) => onNodeChange(node.id, { x: Number(event.target.value) })} /></label><label>y<input type="number" min="0" max="1000" value={node.y} onChange={(event) => onNodeChange(node.id, { y: Number(event.target.value) })} /></label></div>)}</div>
    </div>
  </section>;
}

function Confidence({ value }: { value: number }) {
  return <span className={`confidence ${value < .55 ? 'low' : value < .8 ? 'medium' : 'high'}`}>{Math.round(value * 100)}%</span>;
}

function localizeImageError(cause: unknown): Message {
  const code = (cause as Partial<ImageApiError>)?.code;
  if (code === 'apiKeyMissing') return { key: 'missingWorker' };
  if (code === 'invalidType') return { key: 'invalidImageType' };
  if (code === 'tooLarge') return { key: 'tooLarge' };
  if (code === 'readFailed') return { key: 'readFailed' };
  if (code === 'invalidImage') return { key: 'invalidImage' };
  if (code === 'apiKeyRejected') return { key: 'workerKeyMissing' };
  if (code === 'quota') return { key: 'geminiQuota' };
  if (code === 'timeout') return { key: 'geminiTimeout' };
  if (code === 'api') return { key: 'workerError', params: { status: (cause as ImageApiError).status ?? '—' } };
  if (code === 'board') return { key: 'invalidBoardJson' };
  return { key: 'imageUnknownError' };
}

function safeFilename(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mach-dien';
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
