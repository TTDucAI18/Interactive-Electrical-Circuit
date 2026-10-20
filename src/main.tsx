import React, { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BookOpen, Cable, Check, ChevronDown, CircleHelp, CircuitBoard, Download, ImagePlus, Magnet, Plus, RotateCcw, RotateCw, Trash2, Zap } from 'lucide-react';
import ImageWorkbench from './ImageWorkbench';
import { calculateCircuit, circuitEndpointPoint, circuitWireRouteAxis, componentPins, connectCircuitEndpoints, createDefaultCircuit, deserializeCircuit, magnitude, moveCircuitComponent, moveCircuitNode, removeCircuitItem, resetCircuitWireRoute, routeCircuitWire, serializeCircuit, snapCircuitPoint, type CircuitComponent, type CircuitDocument, type CircuitNode, type CircuitResult, type CircuitWire, type ComponentKind, type Point, type WireEndpoint, type WireRouteAxis } from './circuit';
import { componentNameKey, translate, type Language, type TranslationKey } from './i18n';
import './style.css';

type Selection = { kind: 'component' | 'node' | 'wire'; id: string } | null;
type Tool = 'select' | 'wire';
const CIRCUIT_KEY = 'iec-circuit-v2';
const LANGUAGE_KEY = 'iec-language';
const ZOOM_KEY = 'iec-board-zoom';
const COMPONENT_SCALE_KEY = 'iec-component-scale';
const SNAP_KEY = 'iec-magnetic-snap';
const paletteKinds: ComponentKind[] = ['R', 'L', 'C', 'VAC', 'GND', 'SW'];

function readCircuit(): CircuitDocument {
  try {
    const raw = localStorage.getItem(CIRCUIT_KEY);
    return raw ? deserializeCircuit(raw) : createDefaultCircuit();
  } catch { return createDefaultCircuit(); }
}
function readLanguage(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === 'en' || value === 'ru' ? value : 'vi';
  } catch { return 'vi'; }
}
function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function clampPoint(point: Point): Point { return { x: Math.max(16, Math.min(984, Math.round(point.x))), y: Math.max(16, Math.min(684, Math.round(point.y))) }; }
function readScale(key: string, fallback: number, min: number, max: number) {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value >= min && value <= max ? value : fallback; }
  catch { return fallback; }
}
function readBoolean(key: string, fallback: boolean) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; }
  catch { return fallback; }
}
function clampScale(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function wireRouteCoordinate(wire: CircuitWire, axis: WireRouteAxis, from: Point, to: Point) {
  if (wire.via.length) return wire.via[0][axis];
  return axis === 'x' ? (from.x + to.x) / 2 : (from.y + to.y) / 2;
}

function App() {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [screen, setScreen] = useState<'simulator' | 'image'>('simulator');
  const [helpOpen, setHelpOpen] = useState(false);
  const [circuit, setCircuit] = useState<CircuitDocument>(readCircuit);
  const [selected, setSelected] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(() => readScale(ZOOM_KEY, 1, 0.5, 2));
  const [componentScale, setComponentScale] = useState(() => readScale(COMPONENT_SCALE_KEY, 1, 0.65, 1.6));
  const [magnetSnap, setMagnetSnap] = useState(() => readBoolean(SNAP_KEY, true));
  const [pendingComponentKind, setPendingComponentKind] = useState<ComponentKind | null>(null);
  const [pendingJunction, setPendingJunction] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [wireStart, setWireStart] = useState<WireEndpoint | null>(null);
  const [wireCursor, setWireCursor] = useState<Point | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wireDrag = useRef<{ endpoint: WireEndpoint; start: Point; latest: Point } | null>(null);
  const wireRouteDrag = useRef<{ id: string; axis: WireRouteAxis; before: CircuitDocument; startCoordinate: number; moved: boolean } | null>(null);
  const drag = useRef<{ kind: 'component' | 'node'; id: string; offset: Point; moved: boolean; before: CircuitDocument } | null>(null);
  const undoStack = useRef<CircuitDocument[]>([]);
  const pointerPositions = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('documentTitle');
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = t('documentDescription');
    setNotice(null);
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Language selection remains available in memory. */ }
  }, [language]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(CIRCUIT_KEY, serializeCircuit(circuit)); setNotice('saved'); }
      catch { /* Storage can be disabled or full; the editor still works in memory. */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [circuit]);
  useEffect(() => { try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* Keep the view usable if storage is disabled. */ } }, [zoom]);
  useEffect(() => { try { localStorage.setItem(COMPONENT_SCALE_KEY, String(componentScale)); } catch { /* Keep the view usable if storage is disabled. */ } }, [componentScale]);
  useEffect(() => { try { localStorage.setItem(SNAP_KEY, String(magnetSnap)); } catch { /* Keep the editor usable if storage is disabled. */ } }, [magnetSnap]);
  const calculation = useMemo(() => {
    try { return { result: calculateCircuit(circuit), error: null as unknown }; }
    catch (error) { return { result: null, error }; }
  }, [circuit]);

  const pushUndo = (snapshot: CircuitDocument) => {
    undoStack.current.push(snapshot);
    if (undoStack.current.length > 60) undoStack.current.shift();
    setCanUndo(true);
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setCircuit(previous); setSelected(null); setHovered(null); setNotice('undoApplied');
    setCanUndo(undoStack.current.length > 0);
  };
  const updateComponent = (id: string, patch: Partial<CircuitComponent>) => {
    const current = circuit.components.find((part) => part.id === id);
    if (!current || Object.entries(patch).every(([key, value]) => current[key as keyof CircuitComponent] === value)) return;
    pushUndo(circuit);
    setCircuit((value) => ({ ...value, components: value.components.map((part) => part.id === id ? { ...part, ...patch } : part) }));
    setNotice(null);
  };
  const updateNode = (id: string, patch: Partial<Pick<CircuitNode, 'label' | 'x' | 'y'>>) => {
    const current = circuit.nodes.find((item) => item.id === id);
    if (!current || Object.entries(patch).every(([key, value]) => current[key as keyof CircuitNode] === value)) return;
    pushUndo(circuit);
    setCircuit((value) => ({ ...value, nodes: value.nodes.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  };
  const updateFrequency = (value: number) => {
    if (circuit.frequency === value || (Number.isNaN(circuit.frequency) && Number.isNaN(value))) return;
    pushUndo(circuit); setCircuit((current) => ({ ...current, frequency: value }));
  };
  const addComponent = (kind: ComponentKind, position?: Point) => {
    const nextIndex = circuit.components.length;
    const positionToUse = position ?? { x: 130 + (nextIndex % 7) * 120, y: 430 + Math.floor(nextIndex / 7) * 70 };
    const point = position ? snapCircuitPoint(circuit, position, undefined, 28, Math.max(5, 14 / zoom), magnetSnap, componentScale).position : clampPoint(positionToUse);
    const prefix = kind === 'VAC' ? 'V' : kind === 'GND' ? 'GND' : kind;
    const count = circuit.components.filter((part) => part.kind === kind).length + 1;
    const component: CircuitComponent = { id: newId(kind.toLowerCase()), label: `${prefix}${count}`, kind, x: point.x, y: point.y, value: kind === 'VAC' ? 24 : kind === 'R' ? 10 : kind === 'L' ? 10 : kind === 'C' ? 100 : 0, rotation: kind === 'GND' ? 0 : 0, phase: 0, switchClosed: true };
    pushUndo(circuit); setCircuit((current) => ({ ...current, components: [...current.components, component] }));
    setSelected({ kind: 'component', id: component.id });
    setPendingComponentKind(null);
    setNotice('componentAdded');
  };
  const addJunction = (position?: Point) => {
    const nextIndex = circuit.nodes.length;
    const positionToUse = position ?? { x: 130 + (nextIndex % 7) * 120, y: 560 };
    const point = position ? snapCircuitPoint(circuit, position, undefined, 28, Math.max(5, 14 / zoom), magnetSnap, componentScale).position : clampPoint(positionToUse);
    const junction: CircuitNode = { id: newId('node'), label: `N${circuit.nodes.length + 1}`, ...point };
    pushUndo(circuit); setCircuit((current) => ({ ...current, nodes: [...current.nodes, junction] }));
    setSelected({ kind: 'node', id: junction.id });
    setPendingJunction(false);
  };
  const addWire = (from: WireEndpoint, to: WireEndpoint) => {
    if (JSON.stringify(from) === JSON.stringify(to)) return;
    const duplicate = circuit.wires.some((wire) => (JSON.stringify(wire.from) === JSON.stringify(from) && JSON.stringify(wire.to) === JSON.stringify(to)) || (JSON.stringify(wire.from) === JSON.stringify(to) && JSON.stringify(wire.to) === JSON.stringify(from)));
    if (duplicate) return;
    const edge: CircuitWire = { id: newId('wire'), from, to, via: [] };
    pushUndo(circuit);
    setCircuit((current) => connectCircuitEndpoints(current, edge));
    setSelected({ kind: 'wire', id: edge.id });
  };
  const endpointAt = (event: PointerEvent<SVGSVGElement>): WireEndpoint | null => {
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-endpoint]');
    const value = hit?.getAttribute('data-endpoint');
    if (!value) return null;
    const parsed = JSON.parse(value) as WireEndpoint;
    return parsed;
  };
  const svgPoint = (event: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 500, y: 350 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return clampPoint({ x: 500 + (point.x - 500) / zoom, y: 350 + (point.y - 350) / zoom });
  };
  const completeWire = (from: WireEndpoint, event: PointerEvent<SVGSVGElement>) => {
    const point = svgPoint(event);
    const target = endpointAt(event);
    if (target) { addWire(from, target); }
    else {
      const junction: CircuitNode = { id: newId('node'), label: `N${circuit.nodes.length + 1}`, ...point };
      const edge: CircuitWire = { id: newId('wire'), from, to: { type: 'node', nodeId: junction.id }, via: [] };
      pushUndo(circuit);
      setCircuit((current) => ({ ...current, nodes: [...current.nodes, junction], wires: [...current.wires, edge] }));
      setSelected({ kind: 'node', id: junction.id });
      setNotice('wireCreated');
    }
    setWireStart(null); setWireCursor(null); wireDrag.current = null;
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    pointerPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerPositions.current.size >= 2) {
      const [first, second] = [...pointerPositions.current.values()];
      pinch.current = { distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), zoom };
      drag.current = null; wireDrag.current = null; wireRouteDrag.current = null; setWireStart(null); setWireCursor(null); setGuides({});
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const target = event.target as SVGElement;
    const endpoint = target.closest('[data-endpoint]')?.getAttribute('data-endpoint');
    if (tool === 'wire') {
      if (!endpoint) return;
      const parsed = JSON.parse(endpoint) as WireEndpoint;
      if (wireStart) { completeWire(wireStart, event); return; }
      const point = svgPoint(event);
      setWireStart(parsed); setWireCursor(point);
      wireDrag.current = { endpoint: parsed, start: point, latest: point };
      svgRef.current?.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const routeWireId = target.closest('[data-wire-route-handle]')?.getAttribute('data-wire-route-handle');
    if (routeWireId) {
      const wire = circuit.wires.find((item) => item.id === routeWireId);
      if (!wire) return;
      const from = circuitEndpointPoint(circuit, wire.from, componentScale);
      const to = circuitEndpointPoint(circuit, wire.to, componentScale);
      const axis = circuitWireRouteAxis(wire, from, to);
      wireRouteDrag.current = { id: wire.id, axis, before: circuit, startCoordinate: wireRouteCoordinate(wire, axis, from, to), moved: false };
      setSelected({ kind: 'wire', id: wire.id });
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    if (pendingComponentKind || pendingJunction) {
      const occupied = target.closest('[data-component-id],[data-node-id],[data-wire-id],[data-endpoint]');
      if (!occupied) {
        const point = svgPoint(event);
        if (pendingComponentKind) addComponent(pendingComponentKind, point);
        else addJunction(point);
        svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault();
      }
      return;
    }
    const componentElement = target.closest('[data-component-id]');
    const componentId = componentElement?.getAttribute('data-component-id');
    if (componentId) {
      const component = circuit.components.find((part) => part.id === componentId);
      if (!component) return;
      setSelected({ kind: 'component', id: componentId });
      const point = svgPoint(event);
      drag.current = { kind: 'component', id: componentId, offset: { x: point.x - component.x, y: point.y - component.y }, moved: false, before: circuit };
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const nodeElement = target.closest('[data-node-id]');
    const nodeId = nodeElement?.getAttribute('data-node-id');
    if (nodeId) {
      const node = circuit.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      setSelected({ kind: 'node', id: nodeId });
      const point = svgPoint(event);
      drag.current = { kind: 'node', id: nodeId, offset: { x: point.x - node.x, y: point.y - node.y }, moved: false, before: circuit };
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const wireId = target.closest('[data-wire-id]')?.getAttribute('data-wire-id');
    if (wireId) setSelected({ kind: 'wire', id: wireId });
    else setSelected(null);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (pointerPositions.current.has(event.pointerId)) pointerPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointerPositions.current.size >= 2) {
      const [first, second] = [...pointerPositions.current.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      setZoom(clampScale(pinch.current.zoom * distance / pinch.current.distance, 0.5, 2));
      event.preventDefault(); return;
    }
    const point = svgPoint(event);
    if (wireDrag.current) {
      wireDrag.current.latest = point; setWireCursor(point); return;
    }
    const activeRouteDrag = wireRouteDrag.current;
    if (activeRouteDrag) {
      const currentWire = circuit.wires.find((wire) => wire.id === activeRouteDrag.id);
      if (!currentWire) return;
      const from = circuitEndpointPoint(circuit, currentWire.from, componentScale);
      const to = circuitEndpointPoint(circuit, currentWire.to, componentScale);
      const previousCoordinate = wireRouteCoordinate(currentWire, activeRouteDrag.axis, from, to);
      const unsnapped = activeRouteDrag.axis === 'x'
        ? { x: point.x, y: from.y }
        : { x: from.x, y: point.y };
      const snapped = snapCircuitPoint(circuit, unsnapped, undefined, 28, Math.max(5, 14 / zoom), magnetSnap, componentScale);
      const coordinate = snapped.position[activeRouteDrag.axis];
      setGuides(activeRouteDrag.axis === 'x' ? { x: snapped.guides.x } : { y: snapped.guides.y });
      if (Math.abs(previousCoordinate - coordinate) < 1) return;
      if (!activeRouteDrag.moved) { pushUndo(activeRouteDrag.before); activeRouteDrag.moved = true; }
      setCircuit((current) => routeCircuitWire(current, activeRouteDrag.id, activeRouteDrag.axis, coordinate, componentScale));
      return;
    }
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const snapped = snapCircuitPoint(circuit, { x: point.x - activeDrag.offset.x, y: point.y - activeDrag.offset.y }, activeDrag, 28, Math.max(5, 14 / zoom), magnetSnap, componentScale);
    setGuides(snapped.guides);
    const currentItem = activeDrag.kind === 'component' ? circuit.components.find((item) => item.id === activeDrag.id) : circuit.nodes.find((item) => item.id === activeDrag.id);
    if (!currentItem || (currentItem.x === snapped.position.x && currentItem.y === snapped.position.y)) return;
    if (!activeDrag.moved) { pushUndo(activeDrag.before); activeDrag.moved = true; }
    if (activeDrag.kind === 'component') setCircuit((current) => moveCircuitComponent(current, activeDrag.id, snapped.position));
    else setCircuit((current) => moveCircuitNode(current, activeDrag.id, snapped.position));
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    pointerPositions.current.delete(event.pointerId);
    if (pinch.current) {
      pinch.current = null; drag.current = null; wireDrag.current = null; wireRouteDrag.current = null; setWireStart(null); setWireCursor(null); setGuides({}); return;
    }
    if (wireDrag.current) {
      const d = wireDrag.current;
      if (Math.hypot(d.latest.x - d.start.x, d.latest.y - d.start.y) > 10) completeWire(d.endpoint, event);
      wireDrag.current = null;
    }
    drag.current = null; wireRouteDrag.current = null; setGuides({});
  };
  const dropPosition = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/x-circuit-kind') as ComponentKind;
    if (!paletteKinds.includes(kind)) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = svgPoint({ clientX: event.clientX, clientY: event.clientY });
    setPendingComponentKind(null);
    addComponent(kind, point);
  };
  const removeSelected = (target: Selection = selected) => {
    if (!target) return;
    pushUndo(circuit);
    if (target.kind === 'component') {
      setCircuit((current) => removeCircuitItem(current, 'component', target.id));
    } else if (target.kind === 'node') {
      setCircuit((current) => removeCircuitItem(current, 'node', target.id));
    } else {
      setCircuit((current) => removeCircuitItem(current, 'wire', target.id));
    }
    setSelected(null); setHovered(null); setNotice('itemRemoved');
  };
  const reset = () => { pushUndo(circuit); setCircuit(createDefaultCircuit()); setSelected(null); setHovered(null); setTool('select'); setWireStart(null); setPendingComponentKind(null); setPendingJunction(false); };
  const armComponentPlacement = (kind: ComponentKind) => {
    setTool('select'); setWireStart(null); setPendingJunction(false);
    setPendingComponentKind((current) => current === kind ? null : kind);
  };
  const armJunctionPlacement = () => {
    setTool('select'); setWireStart(null); setPendingComponentKind(null);
    setPendingJunction((current) => !current);
  };
  const print = () => window.print();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (screen !== 'simulator') return;
      const element = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
      if (/^[1-6]$/.test(event.key)) { event.preventDefault(); addComponent(paletteKinds[Number(event.key) - 1]); return; }
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setPendingJunction(true); setPendingComponentKind(null); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const target = event.key === 'Backspace' ? (hovered ?? selected) : (selected ?? hovered);
        if (target) { event.preventDefault(); removeSelected(target); }
        return;
      }
      if (event.key === 'Escape') { setPendingComponentKind(null); setPendingJunction(false); setWireStart(null); setWireCursor(null); setTool('select'); return; }
      if (!selected) return;
      if (event.key.toLowerCase() === 'r' && selected.kind === 'component') {
        const part = circuit.components.find((item) => item.id === selected.id);
        if (part) updateComponent(part.id, { rotation: (part.rotation + 90) % 360 });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [screen, selected, hovered, circuit, zoom, pendingComponentKind, pendingJunction]);

  const errorText = (error: unknown) => {
    const code = (error as { code?: string })?.code;
    if (code === 'frequency') return t('invalidFrequency');
    if (code === 'ground') return t('groundMissing');
    if (code === 'source') return t('sourceMissing');
    if (code === 'unwired') {
      const part = circuit.components.find((item) => error instanceof Error && error.message.startsWith(item.label));
      return part ? `${part.label} ${t('unconnectedError')}` : t('openCircuit');
    }
    if (code === 'short') {
      const part = circuit.components.find((item) => error instanceof Error && error.message.startsWith(item.label));
      return `${part?.label ?? t('source')} ${t('shortSource')}`;
    }
    if (code === 'value') {
      const part = circuit.components.find((item) => error instanceof Error && error.message.startsWith(item.label));
      if (error instanceof Error && error.message.includes('phase')) return `${part?.label ?? t('source')} ${t('invalidPhase')}`;
      return `${part?.label ?? t('value')} ${t('invalidValue')}`;
    }
    return t('openCircuit');
  };
  const result = calculation.result;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label={t('brand')}><span className="brand-mark"><CircuitBoard size={21} /></span><span><strong>{t('brand')}</strong><small>{t('brandSub')}</small></span></a>
      <nav className="top-nav" aria-label={t('brand')}>
        <button className={`nav-link ${screen === 'simulator' ? 'active' : ''}`} onClick={() => { setScreen('simulator'); setHelpOpen(false); }}><Activity size={16} /> {t('simulator')}</button>
        <button className={`nav-link ${screen === 'image' ? 'active' : ''}`} onClick={() => { setScreen('image'); setHelpOpen(false); }}><ImagePlus size={16} /> {t('imageMode')}</button>
        {screen === 'simulator' && <button className={`nav-link ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((value) => !value)}><BookOpen size={16} /> {t('guide')}</button>}
      </nav>
      <div className="topbar-end"><label className="language-picker"><span>{t('langLabel')}</span><span className="language-select-wrap"><select aria-label={t('langLabel')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="vi">{t('langVi')}</option><option value="en">{t('langEn')}</option><option value="ru">{t('langRu')}</option></select><ChevronDown size={13} /></span></label><span className="local-badge"><span className="online-dot" /> {t('runningLocally')}</span></div>
    </header>

    {screen === 'image' ? <ImageWorkbench language={language} /> : <main id="top" className="main-content">
      <section className="intro-row">
        <div><div className="eyebrow"><span className="eyebrow-line" /> {t('heroLabel')}</div><h1>{t('heroTitle')} <span>{t('heroAccent')}</span></h1><p className="intro-copy">{t('heroCopy')}</p></div>
        <div className="intro-actions"><button className="reset-button" onClick={reset}><RotateCcw size={16} /> {t('reset')}</button><button className="export-pdf" onClick={print}><Download size={16} /> {t('exportPdf')}</button></div>
      </section>

      {helpOpen && <HelpPanel language={language} onClose={() => setHelpOpen(false)} />}

      <section className="source-bar">
        <div className="source-title"><span className="source-icon"><Zap size={18} fill="currentColor" /></span><span><strong>{t('source')}</strong><small>{t('frequencyHint')}</small></span></div>
        <label className={`source-field ${!(circuit.frequency > 0) || !Number.isFinite(circuit.frequency) ? 'invalid-field-layout' : ''}`}><span>{t('frequency')}</span><span className="input-wrap"><input aria-label={t('frequency')} aria-invalid={!(circuit.frequency > 0) || !Number.isFinite(circuit.frequency)} type="number" min="0.01" step="1" value={Number.isNaN(circuit.frequency) ? '' : circuit.frequency} onChange={(event) => updateFrequency(event.target.value === '' ? Number.NaN : Number(event.target.value))} /><i>Hz</i></span>{(!(circuit.frequency > 0) || !Number.isFinite(circuit.frequency)) && <small className="field-error">{t('invalidFrequency')}</small>}</label>
        <div className="source-note"><Check size={15} /><span key={notice ?? 'live'}>{notice ? t(notice) : t('live')}</span></div>
      </section>

      <div className="editor-workspace">
        <aside className="palette-card"><div className="panel-heading"><div><span className="section-kicker">{t('palette')}</span><h2>{t('palette')}</h2></div></div><p className="palette-hint">{t('dragHint')}</p>
          <div className="palette-list">{paletteKinds.map((kind, index) => <PaletteItem key={kind} kind={kind} language={language} shortcut={String(index + 1)} isPending={pendingComponentKind === kind} onAdd={() => armComponentPlacement(kind)} />)}</div>
          <button className={`palette-junction ${pendingJunction ? 'place-pending' : ''}`} aria-pressed={pendingJunction} title={`${t('addJunction')} · J`} onClick={armJunctionPlacement}><Plus size={16} /> {pendingJunction ? t('placeHere') : t('addJunction')} <kbd>J</kbd></button>
        </aside>

        <div className="center-column">
          <section className="canvas-card">
            <div className="canvas-header"><div><span className="section-kicker">{t('canvasTitle')}</span><h2>{t('canvasTitle')}</h2></div><div className="canvas-actions">
              <button className={tool === 'select' ? 'tool-button active' : 'tool-button'} aria-pressed={tool === 'select'} onClick={() => { setTool('select'); setWireStart(null); }}><Activity size={15} /> {t('toolSelect')}</button>
              <button className={tool === 'wire' ? 'tool-button active' : 'tool-button'} aria-pressed={tool === 'wire'} onClick={() => { setTool('wire'); setWireStart(null); setPendingComponentKind(null); setPendingJunction(false); }}><Cable size={15} /> {t('toolWire')}</button>
              <button className={`tool-button magnet-toggle ${magnetSnap ? 'active' : ''}`} aria-pressed={magnetSnap} title={`${t('smartAlign')}: ${t(magnetSnap ? 'snapOn' : 'snapOff')}`} onClick={() => setMagnetSnap((value) => !value)}><Magnet size={15} /> <span>{t('smartAlign')}</span><small>{t(magnetSnap ? 'snapOn' : 'snapOff')}</small></button>
              <button className="tool-button" onClick={armJunctionPlacement}><Plus size={15} /> {t('addJunction')}</button>
              <button className="tool-button undo-button" onClick={undo} disabled={!canUndo} title={t('undo')}><RotateCcw size={15} /> {t('undo')}</button>
              <button className="tool-button pdf-mobile" onClick={print}><Download size={15} /> {t('exportPdf')}</button>
            </div></div>
            <div className="canvas-help"><CircleHelp size={15} /> <span>{pendingComponentKind || pendingJunction ? t('placePartHint') : wireStart ? t('wireStarted') : t('canvasHelp')}</span>{(pendingComponentKind || pendingJunction) && <button className="cancel-placement" onClick={() => { setPendingComponentKind(null); setPendingJunction(false); }}>{t('cancel')}</button>}</div>
            <div className="view-controls">
              <label className="range-control"><span>{t('zoom')}</span><input aria-label={t('zoom')} type="range" min="0.5" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{Math.round(zoom * 100)}%</output></label>
              <label className="range-control"><span>{t('componentScale')}</span><input aria-label={t('componentScale')} type="range" min="0.65" max="1.6" step="0.05" value={componentScale} onChange={(event) => setComponentScale(Number(event.target.value))} /><output>{Math.round(componentScale * 100)}%</output></label>
            </div>
            <div className="canvas-wrap" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={dropPosition}>
              <CircuitCanvas circuit={circuit} selected={selected} hovered={hovered} language={language} svgRef={svgRef} wireStart={wireStart} wireCursor={wireCursor} readOnly={false} zoom={zoom} componentScale={componentScale} guides={guides} routeEditable={tool === 'select'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onSelect={setSelected} onHover={setHovered} onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom((value) => clampScale(value * Math.exp(-event.deltaY * 0.002), 0.5, 2)); } }} />
            </div>
          </section>
          <section className="results-card" aria-live="polite"><div className="section-heading result-heading"><div><span className="section-kicker">{t('resultTitle')}</span><h2>{t('resultTitle')}</h2></div><span className="live-pill"><span /> {t('live')}</span></div>
            {result ? <Results result={result} circuit={circuit} language={language} onComponentChange={updateComponent} /> : <><div className="error-state"><CircleHelp size={18} /><span>{errorText(calculation.error)}</span></div><ComponentResultTable result={null} circuit={circuit} language={language} onComponentChange={updateComponent} /></>}
          </section>
        </div>

        <aside className="inspector-column"><section className="inspector-card"><div className="panel-heading"><div><span className="section-kicker">{t('inspector')}</span><h2>{t('inspector')}</h2></div>{selected && <button className="small-icon-button danger" aria-label={t('deleteSelected')} title={t('deleteSelected')} onClick={() => removeSelected()}><Trash2 size={17} /></button>}</div>
          {!selected && <div className="empty-inspector"><CircleHelp size={20} /><p>{t('noSelection')}</p></div>}
          {selected?.kind === 'component' && <ComponentInspector component={circuit.components.find((part) => part.id === selected.id)!} language={language} onChange={(patch) => updateComponent(selected.id, patch)} onRemove={removeSelected} />}
          {selected?.kind === 'node' && <NodeInspector node={circuit.nodes.find((item) => item.id === selected.id)!} language={language} onChange={(patch) => updateNode(selected.id, patch)} onRemove={removeSelected} />}
          {selected?.kind === 'wire' && <WireInspector wire={circuit.wires.find((item) => item.id === selected.id)!} circuit={circuit} language={language} onRemove={removeSelected} onAutoRoute={() => { pushUndo(circuit); setCircuit((current) => resetCircuitWireRoute(current, selected.id)); setNotice('routeUpdated'); }} />}
        </section>
          <section className="results-detail-card"><div className="panel-heading"><div><span className="section-kicker">{t('componentResults')}</span><h2>{t('componentResults')}</h2></div></div>{!result && <p className="muted-copy">{errorText(calculation.error)}</p>}<ComponentResultTable result={result} circuit={circuit} language={language} onComponentChange={updateComponent} /></section>
        </aside>
      </div>

      <footer className="page-footer"><span>{t('footer')}</span><span>{t('privacy')}</span></footer>
      <PrintReport circuit={circuit} result={result} errorMessage={result ? '' : errorText(calculation.error)} language={language} />
    </main>}
  </div>;
}

function PaletteItem({ kind, language, shortcut, isPending, onAdd }: { kind: ComponentKind; language: Language; shortcut: string; isPending: boolean; onAdd: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="palette-item" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-circuit-kind', kind)}>
    <span className={`palette-symbol symbol-${kind.toLowerCase()}`}>{kind === 'SW' ? 'S' : kind === 'VAC' ? 'V~' : kind === 'GND' ? '⏚' : kind}</span><span className="palette-name">{t(componentNameKey[kind])}</span><button className={isPending ? 'place-pending' : ''} aria-pressed={isPending} aria-label={`${t(isPending ? 'placeHere' : 'add')} ${t(componentNameKey[kind])}`} title={`${t('add')} · ${shortcut}`} onClick={onAdd}>{isPending ? <Check size={15} /> : <Plus size={15} />} {isPending ? t('placeHere') : t('add')} <kbd>{shortcut}</kbd></button>
  </div>;
}

function ComponentInspector({ component, language, onChange, onRemove }: { component: CircuitComponent; language: Language; onChange: (patch: Partial<CircuitComponent>) => void; onRemove: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const hasValue = ['R', 'L', 'C', 'VAC'].includes(component.kind);
  const valueInvalid = hasValue && (!(component.value > 0) || !Number.isFinite(component.value));
  const phaseInvalid = component.kind === 'VAC' && !Number.isFinite(component.phase);
  return <div className="property-form">
    <label>{t('label')}<input value={component.label} maxLength={24} onChange={(event) => onChange({ label: event.target.value })} /></label>
    {hasValue && <label>{t('value')} ({component.kind === 'R' ? 'Ω' : component.kind === 'L' ? 'mH' : component.kind === 'C' ? 'µF' : 'V RMS'})<input type="number" min="0.0001" step="any" aria-invalid={valueInvalid} value={component.value} onChange={(event) => onChange({ value: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />{valueInvalid && <small className="field-error">{t('invalidValue')}</small>}</label>}
    {component.kind === 'VAC' && <label>{t('phase')} (°)<input type="number" step="any" aria-invalid={phaseInvalid} value={component.phase} onChange={(event) => onChange({ phase: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />{phaseInvalid && <small className="field-error">{t('invalidPhase')}</small>}</label>}
    {component.kind === 'SW' && <label>{t('switchState')}<select value={component.switchClosed ? 'closed' : 'open'} onChange={(event) => onChange({ switchClosed: event.target.value === 'closed' })}><option value="closed">{t('closed')}</option><option value="open">{t('open')}</option></select></label>}
    <div className="property-actions"><button onClick={() => onChange({ rotation: (component.rotation + 90) % 360 })}><RotateCw size={15} /> {t('rotate')}</button><button className="danger-text" onClick={onRemove}><Trash2 size={15} /> {t('deleteSelected')}</button></div>
  </div>;
}

function NodeInspector({ node, language, onChange, onRemove }: { node: CircuitNode; language: Language; onChange: (patch: Partial<CircuitNode>) => void; onRemove: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="property-form"><label>{t('label')}<input value={node.label} maxLength={24} onChange={(event) => onChange({ label: event.target.value })} /></label><p className="muted-copy">x {Math.round(node.x)} · y {Math.round(node.y)}</p><button className="danger-text" onClick={onRemove}><Trash2 size={15} /> {t('deleteSelected')}</button></div>;
}

function WireInspector({ wire, circuit, language, onRemove, onAutoRoute }: { wire: CircuitWire; circuit: CircuitDocument; language: Language; onRemove: () => void; onAutoRoute: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="property-form"><p className="muted-copy">{t('pdfConnections')}: {endpointLabel(wire.from, circuit, language)} → {endpointLabel(wire.to, circuit, language)}</p><p className="muted-copy">{t('routeHandleHint')}</p>{wire.via.length > 0 && <button className="route-reset-button" onClick={onAutoRoute}><RotateCcw size={15} /> {t('autoRoute')}</button>}<button className="danger-text" onClick={onRemove}><Trash2 size={15} /> {t('deleteSelected')}</button></div>;
}

function endpointLabel(endpoint: WireEndpoint, circuit: CircuitDocument, language: Language) {
  if (endpoint.type === 'node') return circuit.nodes.find((node) => node.id === endpoint.nodeId)?.label ?? translate(language, 'unknownNode');
  const component = circuit.components.find((part) => part.id === endpoint.componentId);
  return `${component?.label ?? endpoint.componentId}.${endpoint.pinId}`;
}

type CanvasProps = {
  circuit: CircuitDocument; selected: Selection; hovered?: Selection; language: Language; svgRef: React.RefObject<SVGSVGElement>;
  wireStart: WireEndpoint | null; wireCursor: Point | null; readOnly: boolean;
  zoom?: number; componentScale?: number; guides?: { x?: number; y?: number }; routeEditable?: boolean;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void; onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void; onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void; onSelect?: (selection: Selection) => void; onHover?: (selection: Selection) => void; onWheel?: (event: React.WheelEvent<SVGSVGElement>) => void;
};
function CircuitCanvas({ circuit, selected, hovered = null, language, svgRef, wireStart, wireCursor, readOnly, zoom = 1, componentScale = 1, guides = {}, routeEditable = true, onPointerDown, onPointerMove, onPointerUp, onSelect, onHover, onWheel }: CanvasProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const componentById = new Map(circuit.components.map((part) => [part.id, part]));
  const nodes = new Map(circuit.nodes.map((node) => [node.id, node]));
  const pointOf = (endpoint: WireEndpoint): Point => endpoint.type === 'node' ? nodes.get(endpoint.nodeId) ?? { x: 0, y: 0 } : componentPins(componentById.get(endpoint.componentId)!, componentScale).find((pin) => pin.pinId === endpoint.pinId) ?? { x: 0, y: 0 };
  const pathOf = (wire: CircuitWire) => {
    const from = pointOf(wire.from); const to = pointOf(wire.to);
    if (wire.via.length === 1) {
      const bend = wire.via[0];
      return `M ${from.x} ${from.y} H ${bend.x} V ${bend.y} H ${to.x} V ${to.y}`;
    }
    if (wire.via.length >= 2 && wire.routeAxis) {
      const axis = circuitWireRouteAxis(wire, from, to);
      const coordinate = wire.via[0][axis];
      return axis === 'x'
        ? `M ${from.x} ${from.y} H ${coordinate} V ${to.y} H ${to.x}`
        : `M ${from.x} ${from.y} V ${coordinate} H ${to.x} V ${to.y}`;
    }
    if (wire.via.length > 1) {
      let route = `M ${from.x} ${from.y}`;
      for (const point of [...wire.via, to]) route += ` H ${point.x} V ${point.y}`;
      return route;
    }
    if (Math.abs(from.y - to.y) < 1) return `M ${from.x} ${from.y} H ${to.x}`;
    if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
    const mid = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`;
  };
  const previewStart = wireStart ? pointOf(wireStart) : null;
  const displayValue = (part: CircuitComponent) => part.kind === 'R' ? `${part.value} Ω` : part.kind === 'L' ? `${part.value} mH` : part.kind === 'C' ? `${part.value} µF` : part.kind === 'VAC' ? `${part.value} V` : part.kind === 'SW' ? (part.switchClosed ? t('closed') : t('open')) : '';
  return <svg ref={svgRef} className={`circuit-svg ${readOnly ? 'read-only' : ''}`} viewBox="0 0 1000 700" role="img" aria-label={t('canvasTitle')} onPointerDown={readOnly ? undefined : onPointerDown} onPointerMove={readOnly ? undefined : onPointerMove} onPointerUp={readOnly ? undefined : onPointerUp} onPointerCancel={readOnly ? undefined : onPointerUp} onPointerLeave={readOnly ? undefined : () => onHover?.(null)} onWheel={readOnly ? undefined : onWheel}>
    <defs><pattern id={readOnly ? 'print-grid' : 'editor-grid'} width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.5" fill="#e5eae4" /></pattern></defs>
    <g transform={`translate(500 350) scale(${zoom}) translate(-500 -350)`}>
    <rect width="1000" height="700" rx="16" fill={`url(#${readOnly ? 'print-grid' : 'editor-grid'})`} />
    {guides.x !== undefined && <line className="alignment-guide" x1={guides.x} x2={guides.x} y1="0" y2="700" />}
    {guides.y !== undefined && <line className="alignment-guide" x1="0" x2="1000" y1={guides.y} y2={guides.y} />}
    <g className="wires">{circuit.wires.map((wire) => {
      const from = pointOf(wire.from); const to = pointOf(wire.to);
      const axis = circuitWireRouteAxis(wire, from, to);
      const routeCoordinate = wireRouteCoordinate(wire, axis, from, to);
      const bend = wire.via.length === 1 ? wire.via[0] : axis === 'x' ? { x: routeCoordinate, y: (from.y + to.y) / 2 } : { x: (from.x + to.x) / 2, y: routeCoordinate };
      const isActive = selected?.kind === 'wire' && selected.id === wire.id || hovered?.kind === 'wire' && hovered.id === wire.id;
      return <g key={wire.id} className={hovered?.kind === 'wire' && hovered.id === wire.id ? 'hovered' : ''} onPointerEnter={!readOnly ? () => onHover?.({ kind: 'wire', id: wire.id }) : undefined}>
        <path d={pathOf(wire)} className={`wire-visible ${selected?.kind === 'wire' && selected.id === wire.id ? 'selected' : ''}`} />
        <path d={pathOf(wire)} className="wire-hit" data-wire-id={wire.id} onClick={readOnly ? undefined : () => onSelect?.({ kind: 'wire', id: wire.id })} />
        {!readOnly && routeEditable && <><circle className={`wire-route-hit ${isActive ? 'visible' : ''}`} cx={bend.x} cy={bend.y} r="17" data-wire-route-handle={wire.id} aria-label={t('routeHandleHint')} role="button" tabIndex={0}><title>{t('routeHandleHint')}</title></circle>{isActive && <circle className="wire-route-knob" cx={bend.x} cy={bend.y} r="5" pointerEvents="none" />}</>}
      </g>;
    })}
      {wireStart && wireCursor && previewStart && <path className="wire-preview" d={`M ${previewStart.x} ${previewStart.y} L ${wireCursor.x} ${wireCursor.y}`} />}</g>
    {circuit.nodes.map((node) => <g key={node.id} className={`junction ${selected?.kind === 'node' && selected.id === node.id ? 'selected' : ''} ${hovered?.kind === 'node' && hovered.id === node.id ? 'hovered' : ''}`} data-node-id={node.id} onPointerEnter={!readOnly ? () => onHover?.({ kind: 'node', id: node.id }) : undefined}>
      <circle className="junction-hit" cx={node.x} cy={node.y} r="16" /><circle className="junction-dot" cx={node.x} cy={node.y} r="6" /><g transform={`translate(${node.x + 10} ${node.y - 10}) scale(${1 / zoom})`}><text>{node.label}</text></g>
      {!readOnly && <circle className="endpoint-hit" data-endpoint={JSON.stringify({ type: 'node', nodeId: node.id } satisfies WireEndpoint)} cx={node.x} cy={node.y} r="14" />}
    </g>)}
    {circuit.components.map((part) => {
      const selectedPart = selected?.kind === 'component' && selected.id === part.id;
      const hoveredPart = hovered?.kind === 'component' && hovered.id === part.id;
      const pins = componentPins(part, componentScale);
      return <g key={part.id} className={`circuit-part ${selectedPart ? 'selected' : ''} ${hoveredPart ? 'hovered' : ''}`} data-component-id={part.id} transform={`translate(${part.x} ${part.y}) rotate(${part.rotation}) scale(${componentScale})`} onPointerEnter={!readOnly ? () => onHover?.({ kind: 'component', id: part.id }) : undefined}>
        <rect className="part-hitbox" x="-47" y="-34" width="94" height="68" rx="9" />
        {part.kind === 'R' && <><rect className="symbol-body" x="-22" y="-14" width="44" height="28" rx="4"/><path className="symbol-line" d="M-18 0h5l4-8 7 16 7-16 7 16 5-8h4" /></>}
        {part.kind === 'L' && <path className="symbol-inductor" d="M-30 0h5a7 7 0 0 1 14 0 7 7 0 0 1 14 0 7 7 0 0 1 14 0h5" />}
        {part.kind === 'C' && <><path className="symbol-line" d="M-30 0h20m20 0h20M-10-13v26M10-13v26" /></>}
        {part.kind === 'VAC' && <><circle className="symbol-source" cx="0" cy="0" r="18"/><path className="symbol-line" d="M-11 0c4-9 7-9 11 0s7 9 11 0" /></>}
        {part.kind === 'GND' && <><path className="symbol-line" d="M0-16v12m-14 0h28m-10 6h-8m5 6h-2" /></>}
        {part.kind === 'SW' && <><path className="symbol-line" d={`M-30 0h10m30 0h10M-20 0l${part.switchClosed ? '40' : '31'} ${part.switchClosed ? '0' : '-14'}`} /><circle className="switch-contact" cx="-20" cy="0" r="3"/><circle className="switch-contact" cx="20" cy="0" r="3"/></>}
        <g transform={`scale(${1 / zoom})`}><text className="part-reference" x="0" y="-25" textAnchor="middle">{part.label}</text>
        <text className="part-value" x="0" y="29" textAnchor="middle">{displayValue(part)}</text></g>
        {!readOnly && pins.map((pin) => <circle key={pin.pinId} className={`terminal ${wireStart && JSON.stringify(wireStart) === JSON.stringify({ type: 'pin', componentId: part.id, pinId: pin.pinId }) ? 'wire-origin' : ''}`} data-endpoint={JSON.stringify({ type: 'pin', componentId: part.id, pinId: pin.pinId } satisfies WireEndpoint)} cx={pin.pinId === 'a' ? -30 : pin.pinId === 'b' ? 30 : 0} cy={pin.pinId === 'g' ? -20 : 0} r="6" />)}
        {!readOnly && <rect className="part-drag-target" x="-28" y="-17" width="56" height="34" />}
      </g>;
    })}
    </g>
  </svg>;
}

function Results({ result, circuit, language, onComponentChange }: { result: CircuitResult; circuit: CircuitDocument; language: Language; onComponentChange: (id: string, patch: Partial<CircuitComponent>) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <><div className="metric-grid">
    <Metric label={t('activePower')} value={result.activePower.toFixed(2)} unit="W" />
    <Metric label={t('reactivePower')} value={result.reactivePower.toFixed(2)} unit="var" />
    <Metric label={t('apparentPower')} value={result.apparentPower.toFixed(2)} unit="VA" />
    <Metric label={t('powerFactor')} value={result.powerFactor.toFixed(3)} unit="" />
  </div><ComponentResultTable result={result} circuit={circuit} language={language} onComponentChange={onComponentChange} /></>;
}
function ComponentResultTable({ result, circuit, language, onComponentChange }: { result: CircuitResult | null; circuit: CircuitDocument; language: Language; onComponentChange?: (id: string, patch: Partial<CircuitComponent>) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="result-table-wrap"><table className="parts-table result-table"><thead><tr><th>{t('pdfName')}</th><th>{t('voltage')}</th><th>{t('current')}</th></tr></thead><tbody>{circuit.components.map((part) => {
    const row = result?.components[part.id];
    const editable = Boolean(onComponentChange);
    const hasValue = ['R', 'L', 'C', 'VAC'].includes(part.kind);
    const unit = part.kind === 'R' ? 'Ω' : part.kind === 'L' ? 'mH' : part.kind === 'C' ? 'µF' : part.kind === 'VAC' ? 'V RMS' : '';
    return <tr key={part.id}><td><div className="result-edit-stack"><input aria-label={t('label')} value={part.label} maxLength={24} readOnly={!editable} onChange={(event) => onComponentChange?.(part.id, { label: event.target.value })} /><span>{t(componentNameKey[part.kind])}</span>{editable && hasValue && <label className="result-value-field"><span>{t('value')}</span><span className="result-value-input"><input aria-label={`${t('value')} ${part.label}`} type="number" min="0.0001" step="any" aria-invalid={!(part.value > 0) || !Number.isFinite(part.value)} value={Number.isNaN(part.value) ? '' : part.value} onChange={(event) => onComponentChange?.(part.id, { value: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /><i>{unit}</i></span></label>}{editable && part.kind === 'VAC' && <label className="result-value-field"><span>{t('phase')}</span><span className="result-value-input"><input aria-label={`${t('phase')} ${part.label}`} type="number" step="any" aria-invalid={!Number.isFinite(part.phase)} value={Number.isNaN(part.phase) ? '' : part.phase} onChange={(event) => onComponentChange?.(part.id, { phase: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /><i>°</i></span></label>}{editable && part.kind === 'SW' && <label className="result-value-field"><span>{t('switchState')}</span><select aria-label={t('switchState')} value={part.switchClosed ? 'closed' : 'open'} onChange={(event) => onComponentChange?.(part.id, { switchClosed: event.target.value === 'closed' })}><option value="closed">{t('closed')}</option><option value="open">{t('open')}</option></select></label>}</div></td><td>{row ? `${magnitude(row.voltage).toFixed(2)} V` : '—'}</td><td>{row ? `${magnitude(row.current).toFixed(3)} A` : '—'}</td></tr>;
  })}</tbody></table></div>;
}
function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric-card"><span className="metric-label">{label}</span><strong>{value}<i>{unit}</i></strong></div>;
}

function HelpPanel({ language, onClose }: { language: Language; onClose: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <section className="help-panel"><div className="section-heading"><div><span className="section-kicker">{t('guideTitle')}</span><h2>{t('guideTitle')}</h2></div><button className="small-icon-button" aria-label={t('guide')} onClick={onClose}>×</button></div><div className="help-grid"><article><span className="help-step">01</span><h3>{t('guide1Title')}</h3><p>{t('guide1')}</p></article><article><span className="help-step">02</span><h3>{t('guide2Title')}</h3><p>{t('guide2')}</p></article><article><span className="help-step">03</span><h3>{t('guide3Title')}</h3><p>{t('guide3')}</p></article><article><span className="help-step">04</span><h3>{t('guideShortcutsTitle')}</h3><p>{t('guideShortcuts')}</p></article><article><span className="help-step">05</span><h3>{t('guideZoomTitle')}</h3><p>{t('guideZoom')}</p></article><article><span className="help-step">06</span><h3>{t('guideSnapTitle')}</h3><p>{t('guideSnap')}</p></article></div></section>;
}

function PrintReport({ circuit, result, errorMessage, language }: { circuit: CircuitDocument; result: CircuitResult | null; errorMessage: string; language: Language }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <article className="print-report"><header><h1>{t('pdfTitle')}</h1><p>{t('pdfGenerated')}</p></header><section><h2>{t('canvasTitle')}</h2><CircuitCanvas circuit={circuit} selected={null} language={language} svgRef={React.createRef<SVGSVGElement>()} wireStart={null} wireCursor={null} readOnly /></section>
    <section className="print-source"><h2>{t('pdfSource')}</h2><p>{t('pdfFrequency')}: {circuit.frequency} Hz</p>{circuit.components.filter((part) => part.kind === 'VAC').map((part) => <p key={part.id}>{part.label}: {part.value} V RMS · {part.phase}°</p>)}</section>
    {result ? <section><h2>{t('resultTitle')}</h2><p>{t('activePower')}: {result.activePower.toFixed(3)} W · {t('reactivePower')}: {result.reactivePower.toFixed(3)} var · {t('apparentPower')}: {result.apparentPower.toFixed(3)} VA · {t('powerFactor')}: {result.powerFactor.toFixed(3)}</p></section> : <section><h2>{t('resultTitle')}</h2><p>{errorMessage || t('pdfInvalid')}</p></section>}
    <section><h2>{t('pdfParts')}</h2><table><thead><tr><th>{t('pdfName')}</th><th>{t('pdfType')}</th><th>{t('value')}</th><th>{t('voltage')}</th><th>{t('current')}</th><th>{t('pdfState')}</th></tr></thead><tbody>{circuit.components.map((part) => {
      const calculated = result?.components[part.id];
      return <tr key={part.id}><td>{part.label}</td><td>{t(componentNameKey[part.kind])}</td><td>{part.kind === 'R' ? `${part.value} Ω` : part.kind === 'L' ? `${part.value} mH` : part.kind === 'C' ? `${part.value} µF` : part.kind === 'VAC' ? `${part.value} V RMS · ${part.phase}°` : '—'}</td><td>{calculated ? `${magnitude(calculated.voltage).toFixed(3)} V` : '—'}</td><td>{calculated ? `${magnitude(calculated.current).toFixed(4)} A` : '—'}</td><td>{part.kind === 'SW' ? (part.switchClosed ? t('closed') : t('open')) : '—'}</td></tr>;
    })}</tbody></table></section>
    <section><h2>{t('pdfConnections')}</h2><table><thead><tr><th>{t('pdfName')}</th><th>{t('pdfConnections')}</th></tr></thead><tbody>{circuit.wires.map((wire) => <tr key={wire.id}><td>{wire.id.slice(0, 8)}</td><td>{endpointLabel(wire.from, circuit, language)} → {endpointLabel(wire.to, circuit, language)}</td></tr>)}</tbody></table></section>
  </article>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
