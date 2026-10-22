import React, { type PointerEvent } from 'react';
import {
  circuitWireRouteAxis,
  componentPins,
  type CircuitComponent,
  type CircuitDocument,
  type CircuitWire,
  type Point,
  type WireEndpoint,
  type WireRouteAxis,
} from '../circuit';
import { translate, type Language } from '../i18n';

export type CanvasShapeKind = 'triangle' | 'square';
export type CanvasShape = { id: string; kind: CanvasShapeKind; x: number; y: number; width: number; height: number };
export type Selection = { kind: 'component' | 'node' | 'wire' | 'shape'; id: string } | null;

export function wireRouteCoordinate(wire: CircuitWire, axis: WireRouteAxis, from: Point, to: Point) {
  if (wire.via.length) return wire.via[0][axis];
  return axis === 'x' ? (from.x + to.x) / 2 : (from.y + to.y) / 2;
}

export type CanvasProps = {
  circuit: CircuitDocument;
  selected: Selection;
  hovered?: Selection;
  language: Language;
  svgRef: React.RefObject<SVGSVGElement>;
  wireStart: WireEndpoint | null;
  wireCursor: Point | null;
  readOnly: boolean;
  zoom?: number;
  pan?: Point;
  componentScale?: number;
  guides?: { x?: number; y?: number };
  shapes?: CanvasShape[];
  showAxes?: boolean;
  isPanning?: boolean;
  routeEditable?: boolean;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onSelect?: (selection: Selection) => void;
  onHover?: (selection: Selection) => void;
  onWheel?: (event: React.WheelEvent<SVGSVGElement>) => void;
  onContextMenu?: (event: React.MouseEvent<SVGSVGElement>) => void;
};

export function CircuitCanvas({
  circuit,
  selected,
  hovered = null,
  language,
  svgRef,
  wireStart,
  wireCursor,
  readOnly,
  zoom = 1,
  pan = { x: 0, y: 0 },
  componentScale = 1,
  guides = {},
  shapes = [],
  showAxes = false,
  isPanning = false,
  routeEditable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelect,
  onHover,
  onWheel,
  onContextMenu,
}: CanvasProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const componentById = new Map(circuit.components.map((part) => [part.id, part]));
  const nodes = new Map(circuit.nodes.map((node) => [node.id, node]));

  const pointOf = (endpoint: WireEndpoint): Point =>
    endpoint.type === 'node'
      ? nodes.get(endpoint.nodeId) ?? { x: 0, y: 0 }
      : componentPins(componentById.get(endpoint.componentId)!, componentScale).find((pin) => pin.pinId === endpoint.pinId) ?? { x: 0, y: 0 };

  const pathOf = (wire: CircuitWire) => {
    const from = pointOf(wire.from);
    const to = pointOf(wire.to);
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
  const displayValue = (part: CircuitComponent) =>
    part.kind === 'R'
      ? `${part.value} Ω`
      : part.kind === 'L'
        ? `${part.value} mH`
        : part.kind === 'C'
          ? `${part.value} µF`
          : part.kind === 'VAC'
            ? `${part.value} V`
            : part.kind === 'SW'
              ? (part.switchClosed ? t('closed') : t('open'))
              : '';

  return (
    <svg
      ref={svgRef}
      className={`circuit-svg ${readOnly ? 'read-only' : 'pan-enabled'} ${isPanning ? 'is-panning' : ''}`}
      viewBox="0 0 1000 700"
      role="img"
      aria-label={t('canvasTitle')}
      onPointerDown={readOnly ? undefined : onPointerDown}
      onPointerMove={readOnly ? undefined : onPointerMove}
      onPointerUp={readOnly ? undefined : onPointerUp}
      onPointerCancel={readOnly ? undefined : onPointerUp}
      onPointerLeave={readOnly ? undefined : () => onHover?.(null)}
      onWheel={readOnly ? undefined : onWheel}
      onContextMenu={onContextMenu}
    >
      <defs>
        <pattern id={readOnly ? 'print-grid' : 'editor-grid'} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.5" fill="#e5eae4" />
        </pattern>
        <marker id={readOnly ? 'axis-arrow-print' : 'axis-arrow'} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7b9a80" />
        </marker>
      </defs>
      <g transform={`translate(${500 + pan.x} ${350 + pan.y}) scale(${zoom}) translate(-500 -350)`}>
        <rect width="1000" height="700" rx="16" fill={`url(#${readOnly ? 'print-grid' : 'editor-grid'})`} />
        {showAxes && (
          <g className="coordinate-axes" pointerEvents="none">
            <path d="M 55 650 H 978 M 55 650 V 26" markerEnd={`url(#${readOnly ? 'axis-arrow-print' : 'axis-arrow'})`} />
            {Array.from({ length: 9 }, (_, index) => 155 + index * 100).map((x) => (
              <path key={`x-${x}`} d={`M ${x} 645 V 655`} />
            ))}
            {Array.from({ length: 6 }, (_, index) => 550 - index * 100).map((y) => (
              <path key={`y-${y}`} d={`M 50 ${y} H 60`} />
            ))}
            {Array.from({ length: 9 }, (_, index) => 155 + index * 100).map((x, index) => (
              <g key={`x-label-${x}`} transform={`translate(${x} 670) scale(${1 / zoom})`}>
                <text className="axis-value" textAnchor="middle">
                  {(index + 1) * 100}
                </text>
              </g>
            ))}
            {Array.from({ length: 6 }, (_, index) => 550 - index * 100).map((y, index) => (
              <g key={`y-label-${y}`} transform={`translate(42 ${y}) scale(${1 / zoom})`}>
                <text className="axis-value" textAnchor="end" y="4">
                  {(index + 1) * 100}
                </text>
              </g>
            ))}
            <g transform={`translate(978 648) scale(${1 / zoom})`}><text x="8" y="5">X</text></g>
            <g transform={`translate(55 26) scale(${1 / zoom})`}><text x="8" y="-8">Y</text></g>
            <g transform={`translate(55 650) scale(${1 / zoom})`}><text x="-18" y="23">O</text></g>
          </g>
        )}
        {guides.x !== undefined && <line className="alignment-guide" x1={guides.x} x2={guides.x} y1="0" y2="700" />}
        {guides.y !== undefined && <line className="alignment-guide" x1="0" x2="1000" y1={guides.y} y2={guides.y} />}
        <g className="wires">
          {circuit.wires.map((wire) => {
            const from = pointOf(wire.from);
            const to = pointOf(wire.to);
            const axis = circuitWireRouteAxis(wire, from, to);
            const routeCoord = wireRouteCoordinate(wire, axis, from, to);
            const bend = wire.via.length === 1 ? wire.via[0] : axis === 'x' ? { x: routeCoord, y: (from.y + to.y) / 2 } : { x: (from.x + to.x) / 2, y: routeCoord };
            const isActive = (selected?.kind === 'wire' && selected.id === wire.id) || (hovered?.kind === 'wire' && hovered.id === wire.id);
            return (
              <g
                key={wire.id}
                className={hovered?.kind === 'wire' && hovered.id === wire.id ? 'hovered' : ''}
                onPointerEnter={!readOnly ? () => onHover?.({ kind: 'wire', id: wire.id }) : undefined}
                data-wire-context={wire.id}
              >
                <path d={pathOf(wire)} className={`wire-visible ${selected?.kind === 'wire' && selected.id === wire.id ? 'selected' : ''}`} />
                <path d={pathOf(wire)} className="wire-hit" data-wire-id={wire.id} onClick={readOnly ? undefined : () => onSelect?.({ kind: 'wire', id: wire.id })} />
                {!readOnly && routeEditable && (
                  <>
                    <circle className={`wire-route-hit ${isActive ? 'visible' : ''}`} cx={bend.x} cy={bend.y} r="17" data-wire-route-handle={wire.id} aria-label={t('routeHandleHint')} role="button" tabIndex={0}>
                      <title>{t('routeHandleHint')}</title>
                    </circle>
                    {isActive && <circle className="wire-route-knob" cx={bend.x} cy={bend.y} r="5" pointerEvents="none" />}
                  </>
                )}
              </g>
            );
          })}
          {wireStart && wireCursor && previewStart && <path className="wire-preview" d={`M ${previewStart.x} ${previewStart.y} L ${wireCursor.x} ${wireCursor.y}`} />}
        </g>
        {shapes.map((shape) => (
          <g
            key={shape.id}
            className={`utility-shape ${selected?.kind === 'shape' && selected.id === shape.id ? 'selected' : ''} ${hovered?.kind === 'shape' && hovered.id === shape.id ? 'hovered' : ''}`}
            data-utility-shape={shape.id}
            transform={`translate(${shape.x} ${shape.y})`}
            onPointerEnter={!readOnly ? () => onHover?.({ kind: 'shape', id: shape.id }) : undefined}
          >
            {shape.kind === 'triangle' ? (
              <polygon points={`0,${-shape.height / 2} ${shape.width / 2},${shape.height / 2} ${-shape.width / 2},${shape.height / 2}`} />
            ) : (
              <rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} rx="4" />
            )}
            {!readOnly && selected?.kind === 'shape' && selected.id === shape.id && (
              <circle className="shape-resize-handle" data-shape-resize={shape.id} cx={shape.width / 2} cy={shape.height / 2} r="8" />
            )}
            <g transform={`translate(0 ${shape.height / 2 + 20}) scale(${1 / zoom})`}>
              <text className="utility-shape-label">{shape.kind === 'triangle' ? t('shapeTriangle') : t('shapeSquare')}</text>
            </g>
          </g>
        ))}
        {circuit.nodes.map((node) => (
          <g
            key={node.id}
            className={`junction ${selected?.kind === 'node' && selected.id === node.id ? 'selected' : ''} ${hovered?.kind === 'node' && hovered.id === node.id ? 'hovered' : ''}`}
            data-node-id={node.id}
            data-node-context={node.id}
            onPointerEnter={!readOnly ? () => onHover?.({ kind: 'node', id: node.id }) : undefined}
          >
            <circle className="junction-hit" cx={node.x} cy={node.y} r="16" />
            <circle className="junction-dot" cx={node.x} cy={node.y} r="6" />
            <g transform={`translate(${node.x + 10} ${node.y - 10}) scale(${1 / zoom})`}>
              <text>{node.label}</text>
            </g>
            {!readOnly && <circle className="endpoint-hit" data-endpoint={JSON.stringify({ type: 'node', nodeId: node.id } satisfies WireEndpoint)} cx={node.x} cy={node.y} r="14" />}
          </g>
        ))}
        {circuit.components.map((part) => {
          const selectedPart = selected?.kind === 'component' && selected.id === part.id;
          const hoveredPart = hovered?.kind === 'component' && hovered.id === part.id;
          const pins = componentPins(part, componentScale);
          return (
            <g
              key={part.id}
              className={`circuit-part ${selectedPart ? 'selected' : ''} ${hoveredPart ? 'hovered' : ''}`}
              data-component-id={part.id}
              data-component-context={part.id}
              transform={`translate(${part.x} ${part.y}) rotate(${part.rotation}) scale(${componentScale})`}
              onPointerEnter={!readOnly ? () => onHover?.({ kind: 'component', id: part.id }) : undefined}
            >
              <rect className="part-hitbox" x="-47" y="-34" width="94" height="68" rx="9" />
              {part.kind === 'R' && (
                <>
                  <rect className="symbol-body" x="-22" y="-14" width="44" height="28" rx="4" />
                  <path className="symbol-line" d="M-18 0h5l4-8 7 16 7-16 7 16 5-8h4" />
                </>
              )}
              {part.kind === 'L' && <path className="symbol-inductor" d="M-30 0h5a7 7 0 0 1 14 0 7 7 0 0 1 14 0 7 7 0 0 1 14 0h5" />}
              {part.kind === 'C' && <path className="symbol-line" d="M-30 0h20m20 0h20M-10-13v26M10-13v26" />}
              {part.kind === 'VAC' && (
                <>
                  <circle className="symbol-source" cx="0" cy="0" r="18" />
                  <path className="symbol-line" d="M-11 0c4-9 7-9 11 0s7 9 11 0" />
                </>
              )}
              {part.kind === 'GND' && <path className="symbol-line" d="M0-16v12m-14 0h28m-10 6h-8m5 6h-2" />}
              {part.kind === 'SW' && (
                <>
                  <path className="symbol-line" d={`M-30 0h10m30 0h10M-20 0l${part.switchClosed ? '40' : '31'} ${part.switchClosed ? '0' : '-14'}`} />
                  <circle className="switch-contact" cx="-20" cy="0" r="3" />
                  <circle className="switch-contact" cx="20" cy="0" r="3" />
                </>
              )}
              <g transform={`scale(${1 / zoom})`}>
                <text className="part-reference" x="0" y="-25" textAnchor="middle">
                  {part.label}
                </text>
                <text className="part-value" x="0" y="29" textAnchor="middle">
                  {displayValue(part)}
                </text>
              </g>
              {!readOnly &&
                pins.map((pin) => (
                  <circle
                    key={pin.pinId}
                    className={`terminal ${wireStart && JSON.stringify(wireStart) === JSON.stringify({ type: 'pin', componentId: part.id, pinId: pin.pinId }) ? 'wire-origin' : ''}`}
                    data-endpoint={JSON.stringify({ type: 'pin', componentId: part.id, pinId: pin.pinId } satisfies WireEndpoint)}
                    cx={pin.pinId === 'a' ? -30 : pin.pinId === 'b' ? 30 : 0}
                    cy={pin.pinId === 'g' ? -20 : 0}
                    r="6"
                  />
                ))}
              {!readOnly && <rect className="part-drag-target" x="-28" y="-17" width="56" height="34" />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
