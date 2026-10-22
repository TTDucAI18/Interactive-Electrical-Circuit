import React, { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BookOpen, Cable, Check, ChevronDown, CircleHelp, CircuitBoard, Crosshair, Download, ImagePlus, Magnet, Plus, RotateCcw, RotateCw, Square, Trash2, Triangle, Zap } from 'lucide-react';
import ImageWorkbench from './ImageWorkbench';
import VoltageCalculationWorkbench from './components/voltageCalc/VoltageCalculationWorkbench';
import { CircuitCanvas, wireRouteCoordinate, type CanvasShape, type CanvasShapeKind, type Selection } from './components/CircuitCanvas';
import { ContextMenu, type ContextMenuTarget } from './components/ContextMenu';
import { ExportPdfModal } from './components/ExportPdfModal';
import { applyTOEComponents, calculateCircuit, circuitEndpointPoint, circuitWireRouteAxis, connectCircuitEndpoints, createDefaultCircuit, createTOECircuit, deserializeCircuit, magnitude, moveCircuitComponent, moveCircuitNode, removeCircuitItem, resetCircuitWireRoute, routeCircuitWire, serializeCircuit, snapCircuitPoint, type CircuitComponent, type CircuitDocument, type CircuitNode, type CircuitResult, type CircuitWire, type ComponentKind, type Point, type WireEndpoint, type WireRouteAxis } from './circuit';
import { componentNameKey, translate, type Language, type TranslationKey } from './i18n';
import './style.css';

type Tool = 'select' | 'wire';
const CIRCUIT_KEY = 'iec-circuit-v2';
const LANGUAGE_KEY = 'iec-language';
const ZOOM_KEY = 'iec-board-zoom';
const PAN_KEY = 'iec-board-pan';
const SHAPES_KEY = 'iec-board-shapes';
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
function readPan(): Point {
  try {
    const value = JSON.parse(localStorage.getItem(PAN_KEY) ?? 'null') as Partial<Point> | null;
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return { x: clampScale(value.x!, -700, 700), y: clampScale(value.y!, -490, 490) };
  } catch { /* Use the centered canvas when stored view data is invalid. */ }
  return { x: 0, y: 0 };
}
function readCanvasShapes(): CanvasShape[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SHAPES_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CanvasShape => !!item && typeof item === 'object'
      && typeof item.id === 'string' && (item.kind === 'triangle' || item.kind === 'square')
      && [item.x, item.y, item.width, item.height].every(Number.isFinite));
  } catch { return []; }
}
function clampScale(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function readScreen(): 'simulator' | 'voltageCalc' | 'image' {
  if (typeof window !== 'undefined') {
    const h = window.location.hash.toLowerCase();
    if (h.includes('voltage') || h.includes('calc')) return 'voltageCalc';
    if (h.includes('image')) return 'image';
  }
  return 'simulator';
}

function App() {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [screen, setScreen] = useState<'simulator' | 'voltageCalc' | 'image'>(readScreen);
  const [helpOpen, setHelpOpen] = useState(false);
  const [circuit, setCircuit] = useState<CircuitDocument>(readCircuit);
  const [selected, setSelected] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(() => readScale(ZOOM_KEY, 1, 0.5, 2));
  const [pan, setPan] = useState<Point>(readPan);
  const [componentScale, setComponentScale] = useState(() => readScale(COMPONENT_SCALE_KEY, 1, 0.65, 1.6));
  const [magnetSnap, setMagnetSnap] = useState(() => readBoolean(SNAP_KEY, true));
  const [showAxes, setShowAxes] = useState(true);
  const [shapes, setShapes] = useState<CanvasShape[]>(readCanvasShapes);
  const [pendingComponentKind, setPendingComponentKind] = useState<ComponentKind | null>(null);
  const [pendingShapeKind, setPendingShapeKind] = useState<CanvasShapeKind | null>(null);
  const [pendingJunction, setPendingJunction] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [wireStart, setWireStart] = useState<WireEndpoint | null>(null);
  const [wireCursor, setWireCursor] = useState<Point | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const wireDrag = useRef<{ endpoint: WireEndpoint; start: Point; latest: Point } | null>(null);
  const wireRouteDrag = useRef<{ id: string; axis: WireRouteAxis; before: CircuitDocument; startCoordinate: number; moved: boolean } | null>(null);
  const drag = useRef<{ kind: 'component' | 'node'; id: string; offset: Point; moved: boolean; before: CircuitDocument } | null>(null);
  const shapeDrag = useRef<{ id: string; mode: 'move' | 'resize'; offset: Point; start: Point; width: number; height: number; moved: boolean; beforeCircuit: CircuitDocument; beforeShapes: CanvasShape[] } | null>(null);
  const panDrag = useRef<{ pointerId: number; client: Point; pan: Point } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const undoStack = useRef<{ circuit: CircuitDocument; shapes: CanvasShape[] }[]>([]);
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
    const handleHash = () => setScreen(readScreen());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(CIRCUIT_KEY, serializeCircuit(circuit)); setNotice('saved'); }
      catch { /* Storage can be disabled or full; the editor still works in memory. */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [circuit]);
  useEffect(() => { try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* Keep the view usable if storage is disabled. */ } }, [zoom]);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { localStorage.setItem(PAN_KEY, JSON.stringify(pan)); } catch { /* Keep the view usable if storage is disabled. */ } }, 180);
    return () => window.clearTimeout(timer);
  }, [pan]);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes)); } catch { /* Shapes remain usable in memory. */ } }, 180);
    return () => window.clearTimeout(timer);
  }, [shapes]);
  useEffect(() => { try { localStorage.setItem(COMPONENT_SCALE_KEY, String(componentScale)); } catch { /* Keep the view usable if storage is disabled. */ } }, [componentScale]);
  useEffect(() => { try { localStorage.setItem(SNAP_KEY, String(magnetSnap)); } catch { /* Keep the editor usable if storage is disabled. */ } }, [magnetSnap]);
  const calculation = useMemo(() => {
    try { return { result: calculateCircuit(circuit), error: null as unknown }; }
    catch (error) { return { result: null, error }; }
  }, [circuit]);

  const pushUndo = (snapshot: CircuitDocument, shapeSnapshot = shapes) => {
    undoStack.current.push({ circuit: snapshot, shapes: shapeSnapshot });
    if (undoStack.current.length > 60) undoStack.current.shift();
    setCanUndo(true);
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setCircuit(previous.circuit); setShapes(previous.shapes); setSelected(null); setHovered(null); setNotice('undoApplied');
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
    const point = position ? snapCircuitPoint(circuit, position, undefined, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale).position : clampPoint(positionToUse);
    const prefix = kind === 'VAC' ? 'V' : kind === 'GND' ? 'GND' : kind;
    const count = circuit.components.filter((part) => part.kind === kind).length + 1;
    const component: CircuitComponent = { id: newId(kind.toLowerCase()), label: `${prefix}${count}`, kind, x: point.x, y: point.y, value: kind === 'VAC' ? 24 : kind === 'R' ? 10 : kind === 'L' ? 10 : kind === 'C' ? 100 : 0, rotation: kind === 'GND' ? 0 : 0, phase: 0, switchClosed: true };
    pushUndo(circuit); setCircuit((current) => ({ ...current, components: [...current.components, component] }));
    setSelected({ kind: 'component', id: component.id });
    setPendingComponentKind(null);
    setPendingShapeKind(null);
    setNotice('componentAdded');
  };
  const addJunction = (position?: Point) => {
    const nextIndex = circuit.nodes.length;
    const positionToUse = position ?? { x: 130 + (nextIndex % 7) * 120, y: 560 };
    const point = position ? snapCircuitPoint(circuit, position, undefined, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale).position : clampPoint(positionToUse);
    const junction: CircuitNode = { id: newId('node'), label: `N${circuit.nodes.length + 1}`, ...point };
    pushUndo(circuit); setCircuit((current) => ({ ...current, nodes: [...current.nodes, junction] }));
    setSelected({ kind: 'node', id: junction.id });
    setPendingJunction(false);
    setPendingShapeKind(null);
  };
  const addCanvasShape = (kind: CanvasShapeKind, position: Point) => {
    const snapped = snapCircuitPoint(circuit, position, undefined, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale).position;
    const shape: CanvasShape = { id: newId('shape'), kind, x: snapped.x, y: snapped.y, width: 140, height: 140 };
    pushUndo(circuit); setShapes((current) => [...current, shape]);
    setSelected({ kind: 'shape', id: shape.id }); setPendingShapeKind(null); setNotice('shapeAdded');
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
    return clampPoint({ x: 500 + (point.x - 500 - pan.x) / zoom, y: 350 + (point.y - 350 - pan.y) / zoom });
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

  const handleContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    const target = event.target as SVGElement;
    if (!target || !svgRef.current) return;

    const compEl = target.closest('[data-component-context]') || target.closest('[data-component-id]');
    if (compEl) {
      const compId = compEl.getAttribute('data-component-context') || compEl.getAttribute('data-component-id');
      const comp = circuit.components.find((c) => c.id === compId);
      if (comp) {
        setSelected({ kind: 'component', id: comp.id });
        setContextMenu({ kind: 'component', component: comp, clientX: event.clientX, clientY: event.clientY });
        return;
      }
    }

    const wireEl = target.closest('[data-wire-context]') || target.closest('[data-wire-id]');
    if (wireEl) {
      const wireId = wireEl.getAttribute('data-wire-context') || wireEl.getAttribute('data-wire-id');
      const wire = circuit.wires.find((w) => w.id === wireId);
      if (wire) {
        setSelected({ kind: 'wire', id: wire.id });
        setContextMenu({ kind: 'wire', wire, clientX: event.clientX, clientY: event.clientY });
        return;
      }
    }

    const nodeEl = target.closest('[data-node-context]') || target.closest('[data-node-id]');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-context') || nodeEl.getAttribute('data-node-id');
      const node = circuit.nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelected({ kind: 'node', id: node.id });
        setContextMenu({ kind: 'node', node, clientX: event.clientX, clientY: event.clientY });
        return;
      }
    }

    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * 1000;
    const svgY = ((event.clientY - rect.top) / rect.height) * 700;
    const boardX = Math.round((svgX - 500 - pan.x) / zoom + 500);
    const boardY = Math.round((svgY - 350 - pan.y) / zoom + 350);
    setContextMenu({
      kind: 'canvas',
      boardPoint: { x: clampScale(boardX, 50, 950), y: clampScale(boardY, 50, 650) },
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button === 2) return;
    pointerPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerPositions.current.size >= 2) {
      const [first, second] = [...pointerPositions.current.values()];
      pinch.current = { distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), zoom };
      drag.current = null; shapeDrag.current = null; panDrag.current = null; setIsPanning(false); wireDrag.current = null; wireRouteDrag.current = null; setWireStart(null); setWireCursor(null); setGuides({});
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
    const resizeShapeId = target.closest('[data-shape-resize]')?.getAttribute('data-shape-resize');
    if (resizeShapeId) {
      const shape = shapes.find((item) => item.id === resizeShapeId);
      if (!shape) return;
      shapeDrag.current = { id: shape.id, mode: 'resize', offset: { x: 0, y: 0 }, start: svgPoint(event), width: shape.width, height: shape.height, moved: false, beforeCircuit: circuit, beforeShapes: shapes };
      setSelected({ kind: 'shape', id: shape.id });
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    if (pendingComponentKind || pendingJunction || pendingShapeKind) {
      const occupied = target.closest('[data-component-id],[data-node-id],[data-wire-id],[data-endpoint],[data-utility-shape]');
      if (!occupied) {
        const point = svgPoint(event);
        if (pendingComponentKind) addComponent(pendingComponentKind, point);
        else if (pendingJunction) addJunction(point);
        else if (pendingShapeKind) addCanvasShape(pendingShapeKind, point);
        svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault();
      }
      return;
    }
    const shapeId = target.closest('[data-utility-shape]')?.getAttribute('data-utility-shape');
    if (shapeId) {
      const shape = shapes.find((item) => item.id === shapeId);
      if (!shape) return;
      const point = svgPoint(event);
      shapeDrag.current = { id: shapeId, mode: 'move', offset: { x: point.x - shape.x, y: point.y - shape.y }, start: point, width: shape.width, height: shape.height, moved: false, beforeCircuit: circuit, beforeShapes: shapes };
      setSelected({ kind: 'shape', id: shapeId });
      svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault(); return;
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
    else {
      setSelected(null);
      if (tool === 'select' && event.button === 0) {
        panDrag.current = { pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, pan };
        setIsPanning(true);
        svgRef.current?.setPointerCapture(event.pointerId); event.preventDefault();
      }
    }
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
    const activePan = panDrag.current;
    if (activePan?.pointerId === event.pointerId) {
      const matrix = svgRef.current?.getScreenCTM();
      if (matrix) {
        const inverse = matrix.inverse();
        const start = new DOMPoint(activePan.client.x, activePan.client.y).matrixTransform(inverse);
        const current = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
        setPan({ x: clampScale(activePan.pan.x + current.x - start.x, -700, 700), y: clampScale(activePan.pan.y + current.y - start.y, -490, 490) });
      }
      event.preventDefault(); return;
    }
    const activeShapeDrag = shapeDrag.current;
    if (activeShapeDrag) {
      const shape = shapes.find((item) => item.id === activeShapeDrag.id);
      if (!shape) return;
      if (activeShapeDrag.mode === 'move') {
        const snapped = snapCircuitPoint(circuit, { x: point.x - activeShapeDrag.offset.x, y: point.y - activeShapeDrag.offset.y }, undefined, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale);
        setGuides(snapped.guides);
        if (shape.x === snapped.position.x && shape.y === snapped.position.y) return;
        if (!activeShapeDrag.moved) { pushUndo(activeShapeDrag.beforeCircuit, activeShapeDrag.beforeShapes); activeShapeDrag.moved = true; }
        setShapes((current) => current.map((item) => item.id === shape.id ? { ...item, x: snapped.position.x, y: snapped.position.y } : item));
      } else {
        const dx = point.x - activeShapeDrag.start.x;
        const dy = point.y - activeShapeDrag.start.y;
        const width = clampScale(activeShapeDrag.width + dx * 2, 40, 600);
        const height = clampScale(activeShapeDrag.height + dy * 2, 40, 600);
        const size = shape.kind === 'square' ? clampScale(Math.max(width, height), 40, 600) : undefined;
        const nextWidth = size ?? width;
        const nextHeight = size ?? height;
        if (shape.width === nextWidth && shape.height === nextHeight) return;
        if (!activeShapeDrag.moved) { pushUndo(activeShapeDrag.beforeCircuit, activeShapeDrag.beforeShapes); activeShapeDrag.moved = true; }
        setShapes((current) => current.map((item) => item.id === shape.id ? { ...item, width: nextWidth, height: nextHeight } : item));
      }
      event.preventDefault(); return;
    }
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
      const snapped = snapCircuitPoint(circuit, unsnapped, undefined, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale);
      const coordinate = snapped.position[activeRouteDrag.axis];
      setGuides(activeRouteDrag.axis === 'x' ? { x: snapped.guides.x } : { y: snapped.guides.y });
      if (Math.abs(previousCoordinate - coordinate) < 1) return;
      if (!activeRouteDrag.moved) { pushUndo(activeRouteDrag.before); activeRouteDrag.moved = true; }
      setCircuit((current) => routeCircuitWire(current, activeRouteDrag.id, activeRouteDrag.axis, coordinate, componentScale));
      return;
    }
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const snapped = snapCircuitPoint(circuit, { x: point.x - activeDrag.offset.x, y: point.y - activeDrag.offset.y }, activeDrag, 20, Math.max(5, 14 / zoom), magnetSnap, componentScale);
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
      pinch.current = null; drag.current = null; shapeDrag.current = null; panDrag.current = null; setIsPanning(false); wireDrag.current = null; wireRouteDrag.current = null; setWireStart(null); setWireCursor(null); setGuides({}); return;
    }
    if (wireDrag.current) {
      const d = wireDrag.current;
      if (Math.hypot(d.latest.x - d.start.x, d.latest.y - d.start.y) > 10) completeWire(d.endpoint, event);
      wireDrag.current = null;
    }
    drag.current = null; shapeDrag.current = null; panDrag.current = null; setIsPanning(false); wireRouteDrag.current = null; setGuides({});
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
    } else if (target.kind === 'shape') {
      setShapes((current) => current.filter((item) => item.id !== target.id));
    } else {
      setCircuit((current) => removeCircuitItem(current, 'wire', target.id));
    }
    setSelected(null); setHovered(null); setNotice('itemRemoved');
  };
  const updateCanvasShape = (id: string, patch: Partial<Pick<CanvasShape, 'width' | 'height'>>) => {
    const shape = shapes.find((item) => item.id === id);
    if (!shape) return;
    let width = typeof patch.width === 'number' ? clampScale(patch.width, 40, 600) : shape.width;
    let height = typeof patch.height === 'number' ? clampScale(patch.height, 40, 600) : shape.height;
    if (shape.kind === 'square') width = height = clampScale(Math.max(width, height), 40, 600);
    if (width === shape.width && height === shape.height) return;
    pushUndo(circuit);
    setShapes((current) => current.map((item) => item.id === id ? { ...item, width, height } : item));
  };
  const reset = () => { pushUndo(circuit); setCircuit(createDefaultCircuit()); setShapes([]); setPan({ x: 0, y: 0 }); setSelected(null); setHovered(null); setTool('select'); setWireStart(null); setPendingComponentKind(null); setPendingShapeKind(null); setPendingJunction(false); };
  const armComponentPlacement = (kind: ComponentKind) => {
    setTool('select'); setWireStart(null); setPendingJunction(false); setPendingShapeKind(null);
    setPendingComponentKind((current) => current === kind ? null : kind);
  };
  const armJunctionPlacement = () => {
    setTool('select'); setWireStart(null); setPendingComponentKind(null); setPendingShapeKind(null);
    setPendingJunction((current) => !current);
  };
  const armShapePlacement = (kind: CanvasShapeKind) => {
    setTool('select'); setWireStart(null); setPendingComponentKind(null); setPendingJunction(false);
    setPendingShapeKind((current) => current === kind ? null : kind);
  };
  const centerView = () => { setPan({ x: 0, y: 0 }); setZoom(1); };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (screen !== 'simulator') return;
      const element = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); setShowExportModal(true); return; }
      if (/^[1-6]$/.test(event.key)) { event.preventDefault(); addComponent(paletteKinds[Number(event.key) - 1]); return; }
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setPendingJunction(true); setPendingComponentKind(null); setPendingShapeKind(null); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const target = event.key === 'Backspace' ? (hovered ?? selected) : (selected ?? hovered);
        if (target) { event.preventDefault(); removeSelected(target); }
        return;
      }
      if (event.key === 'Escape') { setPendingComponentKind(null); setPendingJunction(false); setPendingShapeKind(null); setWireStart(null); setWireCursor(null); setTool('select'); return; }
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
        <button className={`nav-link ${screen === 'simulator' ? 'active' : ''}`} onClick={() => { setScreen('simulator'); window.location.hash = ''; setHelpOpen(false); }}><Activity size={16} /> {t('simulator')}</button>
        <button className={`nav-link ${screen === 'voltageCalc' ? 'active' : ''}`} onClick={() => { setScreen('voltageCalc'); window.location.hash = '#voltage-calc'; setHelpOpen(false); }} title={language === 'vi' ? 'Tính toán điện áp & Sơ đồ véc tơ (9 Bước)' : language === 'ru' ? 'Расчет напряжений и векторные диаграммы (9 шагов)' : 'Voltage Calculation & Phasors (9 Steps)'}>
          <Zap size={16} style={{ color: '#38bdf8' }} /> {language === 'vi' ? 'Tính toán điện áp' : language === 'ru' ? 'Расчет напряжений' : 'Voltage Calculation'}
          <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', padding: '1px 6px', borderRadius: '999px', marginLeft: '5px', fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.4)' }}>9 Bước</span>
        </button>
        <button className={`nav-link ${screen === 'image' ? 'active' : ''}`} onClick={() => { setScreen('image'); window.location.hash = '#image'; setHelpOpen(false); }}><ImagePlus size={16} /> {t('imageMode')}</button>
        {screen === 'simulator' && <button className={`nav-link ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((value) => !value)}><BookOpen size={16} /> {t('guide')}</button>}
      </nav>
      <div className="topbar-end"><label className="language-picker"><span>{t('langLabel')}</span><span className="language-select-wrap"><select aria-label={t('langLabel')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="vi">{t('langVi')}</option><option value="en">{t('langEn')}</option><option value="ru">{t('langRu')}</option></select><ChevronDown size={13} /></span></label><span className="local-badge"><span className="online-dot" /> {t('runningLocally')}</span></div>
    </header>

    {screen === 'voltageCalc' ? (
      <VoltageCalculationWorkbench
        onClose={() => { setScreen('simulator'); window.location.hash = ''; }}
        circuit={circuit}
        onSyncToSimulator={(compList, cfg) => {
          pushUndo(circuit);
          setCircuit((prev) => applyTOEComponents(prev, compList, cfg.E, cfg.f));
          setNotice('saved');
        }}
      />
    ) : screen === 'image' ? (
      <ImageWorkbench
        language={language}
        onTransferToSimulator={(imported) => {
          pushUndo(circuit);
          setCircuit(imported);
          setScreen('simulator');
          window.location.hash = '';
          setNotice('saved');
        }}
        onOpenVoltageCalc={() => {
          setScreen('voltageCalc');
          window.location.hash = '#voltage-calc';
        }}
      />
    ) : <main id="top" className="main-content">
      <section className="intro-row">
        <div><div className="eyebrow"><span className="eyebrow-line" /> {t('heroLabel')}</div><h1>{t('heroTitle')} <span>{t('heroAccent')}</span></h1><p className="intro-copy">{t('heroCopy')}</p></div>
        <div className="intro-actions">
          <button className="reset-button" onClick={() => { pushUndo(circuit); setCircuit(createTOECircuit()); setNotice('saved'); }} title={language === 'vi' ? 'Nạp sơ đồ mạch 8 phần tử chuẩn TOE' : 'Load Standard 8-Slot TOE Circuit'}>
            <Zap size={16} style={{ color: '#38bdf8' }} /> {language === 'vi' ? 'Mạch Chuẩn TOE' : 'TOE Circuit'}
          </button>
          <button className="reset-button" onClick={reset}><RotateCcw size={16} /> {t('reset')}</button>
          <button className="export-pdf" onClick={() => setShowExportModal(true)}><Download size={16} /> {t('exportPdf')}</button>
        </div>
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
              <button className={tool === 'wire' ? 'tool-button active' : 'tool-button'} aria-pressed={tool === 'wire'} onClick={() => { setTool('wire'); setWireStart(null); setPendingComponentKind(null); setPendingShapeKind(null); setPendingJunction(false); }}><Cable size={15} /> {t('toolWire')}</button>
              <button className={`tool-button magnet-toggle ${magnetSnap ? 'active' : ''}`} aria-pressed={magnetSnap} title={`${t('smartAlign')}: ${t(magnetSnap ? 'snapOn' : 'snapOff')}`} onClick={() => setMagnetSnap((value) => !value)}><Magnet size={15} /> <span>{t('smartAlign')}</span><small>{t(magnetSnap ? 'snapOn' : 'snapOff')}</small></button>
              <button className="tool-button" onClick={armJunctionPlacement}><Plus size={15} /> {t('addJunction')}</button>
              <button className={`tool-button ${pendingShapeKind === 'triangle' ? 'active' : ''}`} aria-pressed={pendingShapeKind === 'triangle'} onClick={() => armShapePlacement('triangle')}><Triangle size={15} /> {t('shapeTriangle')}</button>
              <button className={`tool-button ${pendingShapeKind === 'square' ? 'active' : ''}`} aria-pressed={pendingShapeKind === 'square'} onClick={() => armShapePlacement('square')}><Square size={15} /> {t('shapeSquare')}</button>
              <button className={`tool-button ${showAxes ? 'active' : ''}`} aria-pressed={showAxes} title={t('toggleAxes')} onClick={() => setShowAxes((value) => !value)}><span className="axis-tool-mark">OXY</span> {t('toggleAxes')}</button>
              <button className="tool-button" title={t('centerView')} aria-label={t('centerView')} onClick={centerView}><Crosshair size={15} /> {t('centerView')}</button>
              <button className="tool-button undo-button" onClick={undo} disabled={!canUndo} title={t('undo')}><RotateCcw size={15} /> {t('undo')}</button>
              <button className="tool-button pdf-mobile" onClick={() => setShowExportModal(true)}><Download size={15} /> {t('exportPdf')}</button>
            </div></div>
            <div className="canvas-help"><CircleHelp size={15} /> <span>{pendingShapeKind ? t('placeShapeHint') : pendingComponentKind || pendingJunction ? t('placePartHint') : wireStart ? t('wireStarted') : t('canvasHelp')}</span>{(pendingComponentKind || pendingJunction || pendingShapeKind) && <button className="cancel-placement" onClick={() => { setPendingComponentKind(null); setPendingJunction(false); setPendingShapeKind(null); }}>{t('cancel')}</button>}</div>
            <div className="view-controls">
              <label className="range-control"><span>{t('zoom')}</span><input aria-label={t('zoom')} type="range" min="0.5" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{Math.round(zoom * 100)}%</output></label>
              <label className="range-control"><span>{t('componentScale')}</span><input aria-label={t('componentScale')} type="range" min="0.65" max="1.6" step="0.05" value={componentScale} onChange={(event) => setComponentScale(Number(event.target.value))} /><output>{Math.round(componentScale * 100)}%</output></label>
            </div>
            <div className="canvas-wrap" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={dropPosition}>
              <CircuitCanvas circuit={circuit} selected={selected} hovered={hovered} language={language} svgRef={svgRef} wireStart={wireStart} wireCursor={wireCursor} readOnly={false} zoom={zoom} pan={pan} componentScale={componentScale} guides={guides} shapes={shapes} showAxes={showAxes} isPanning={isPanning} routeEditable={tool === 'select'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onSelect={setSelected} onHover={setHovered} onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom((value) => clampScale(value * Math.exp(-event.deltaY * 0.002), 0.5, 2)); } }} onContextMenu={handleContextMenu} />
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
          {selected?.kind === 'shape' && <ShapeInspector shape={shapes.find((item) => item.id === selected.id)!} language={language} onChange={(patch) => updateCanvasShape(selected.id, patch)} onRemove={removeSelected} />}
        </section>
          <section className="results-detail-card"><div className="panel-heading"><div><span className="section-kicker">{t('componentResults')}</span><h2>{t('componentResults')}</h2></div></div>{!result && <p className="muted-copy">{errorText(calculation.error)}</p>}<ComponentResultTable result={result} circuit={circuit} language={language} onComponentChange={updateComponent} /></section>
        </aside>
      </div>

      <footer className="page-footer"><span>{t('footer')}</span><span>{t('privacy')}</span></footer>
      <PrintReport circuit={circuit} result={result} errorMessage={result ? '' : errorText(calculation.error)} language={language} />

      {showExportModal && (
        <ExportPdfModal
          circuit={circuit}
          result={result}
          language={language}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          target={contextMenu}
          language={language}
          onClose={() => setContextMenu(null)}
          onRotateComponent={(id, delta) => {
            pushUndo(circuit);
            updateComponent(id, { rotation: ((circuit.components.find((c) => c.id === id)?.rotation ?? 0) + delta) % 360 });
          }}
          onDuplicateComponent={(id) => {
            const src = circuit.components.find((c) => c.id === id);
            if (!src) return;
            pushUndo(circuit);
            const cloneId = newId('c');
            const clone: CircuitComponent = {
              ...src,
              id: cloneId,
              label: `${src.label}'`,
              x: clampScale(src.x + 30, 50, 950),
              y: clampScale(src.y + 30, 50, 650),
            };
            setCircuit((c) => ({ ...c, components: [...c.components, clone] }));
            setSelected({ kind: 'component', id: cloneId });
            setNotice('saved');
          }}
          onDeleteComponent={(id) => removeSelected({ kind: 'component', id })}
          onToggleSwitch={(id) => {
            const sw = circuit.components.find((c) => c.id === id);
            if (sw) updateComponent(id, { switchClosed: !sw.switchClosed });
          }}
          onEditComponent={(id) => setSelected({ kind: 'component', id })}
          onAutoRouteWire={(id) => {
            pushUndo(circuit);
            setCircuit((c) => resetCircuitWireRoute(c, id));
            setNotice('routeUpdated');
          }}
          onFlipWireAxis={(id) => {
            pushUndo(circuit);
            setCircuit((c) => ({
              ...c,
              wires: c.wires.map((w) => (w.id === id ? { ...w, routeAxis: w.routeAxis === 'x' ? 'y' : 'x' } : w)),
            }));
            setNotice('routeUpdated');
          }}
          onDeleteWire={(id) => removeSelected({ kind: 'wire', id })}
          onStartWireFromNode={(nodeId) => {
            setTool('wire');
            setWireStart({ type: 'node', nodeId });
          }}
          onDeleteNode={(nodeId) => removeSelected({ kind: 'node', id: nodeId })}
          onAddComponent={(kind, pos) => {
            pushUndo(circuit);
            const newComp: CircuitComponent = {
              id: newId('c'),
              label: `${kind}${circuit.components.filter((c) => c.kind === kind).length + 1}`,
              kind,
              value: kind === 'R' ? 100 : kind === 'L' ? 10 : kind === 'C' ? 10 : kind === 'VAC' ? 220 : 0,
              x: pos.x,
              y: pos.y,
              rotation: 0,
              phase: 0,
              switchClosed: true,
            };
            setCircuit((c) => ({ ...c, components: [...c.components, newComp] }));
            setSelected({ kind: 'component', id: newComp.id });
            setNotice('saved');
          }}
          onAddJunction={(pos) => {
            pushUndo(circuit);
            const newNode: CircuitNode = {
              id: newId('n'),
              label: `N${circuit.nodes.length + 1}`,
              x: pos.x,
              y: pos.y,
            };
            setCircuit((c) => ({ ...c, nodes: [...c.nodes, newNode] }));
            setSelected({ kind: 'node', id: newNode.id });
            setNotice('saved');
          }}
          onResetView={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          onLoadTOECircuit={() => {
            pushUndo(circuit);
            setCircuit(createTOECircuit());
            setNotice('saved');
          }}
          onOpenExportPdf={() => setShowExportModal(true)}
        />
      )}
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

function ShapeInspector({ shape, language, onChange, onRemove }: { shape: CanvasShape; language: Language; onChange: (patch: Partial<Pick<CanvasShape, 'width' | 'height'>>) => void; onRemove: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <div className="property-form">
    {shape.kind === 'square'
      ? <label>{t('shapeSize')}<input type="number" min="40" max="600" step="10" value={shape.width} onChange={(event) => onChange({ width: Number(event.target.value) })} /></label>
      : <><label>{t('shapeWidth')}<input type="number" min="40" max="600" step="10" value={shape.width} onChange={(event) => onChange({ width: Number(event.target.value) })} /></label><label>{t('shapeHeight')}<input type="number" min="40" max="600" step="10" value={shape.height} onChange={(event) => onChange({ height: Number(event.target.value) })} /></label></>}
    <p className="muted-copy">x {Math.round(shape.x)} · y {Math.round(shape.y)}</p>
    <button className="danger-text" onClick={onRemove}><Trash2 size={15} /> {t('deleteSelected')}</button>
  </div>;
}

function endpointLabel(endpoint: WireEndpoint, circuit: CircuitDocument, language: Language) {
  if (endpoint.type === 'node') return circuit.nodes.find((node) => node.id === endpoint.nodeId)?.label ?? translate(language, 'unknownNode');
  const component = circuit.components.find((part) => part.id === endpoint.componentId);
  return `${component?.label ?? endpoint.componentId}.${endpoint.pinId}`;
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
