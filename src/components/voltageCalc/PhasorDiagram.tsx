import React from 'react';
import type { ComplexNum } from '../../voltageCalcEngine';

interface VectorEntry {
  value: ComplexNum;
  label: string;
  color: string;
}

interface PhasorDiagramProps {
  title: string;
  vectors: VectorEntry[];
  size?: number;
}

/**
 * Draws a phasor diagram on a polar grid.
 * - V (voltage) vectors and I (current) vectors are auto-scaled independently
 *   so both are visible regardless of magnitude differences.
 */
const PhasorDiagram: React.FC<PhasorDiagramProps> = ({ title, vectors, size = 300 }) => {
  const cx = size / 2;
  const margin = 44;
  const radius = cx - margin;

  // Separate voltage and current vectors
  const voltVectors = vectors.filter(v => !v.label.startsWith('İ') && !v.label.startsWith('I'));
  const currVectors = vectors.filter(v => v.label.startsWith('İ') || v.label.startsWith('I'));
  const hasDualScale = voltVectors.length > 0 && currVectors.length > 0 && currVectors.some(v => isFinite(v.value.magnitude));

  let voltScale: number, currScale: number;
  if (hasDualScale) {
    const maxV = Math.max(1e-9, ...voltVectors.map(v => v.value.magnitude).filter(isFinite));
    const maxI = Math.max(1e-9, ...currVectors.map(v => v.value.magnitude).filter(isFinite));
    voltScale = isFinite(maxV) && maxV > 1e-9 ? radius / maxV : 0;
    currScale = isFinite(maxI) && maxI > 1e-9 ? radius / maxI : 0;
  } else {
    const maxMag = Math.max(1e-9, ...vectors.map(v => v.value.magnitude).filter(isFinite));
    voltScale = isFinite(maxMag) && maxMag > 1e-9 ? radius / maxMag : 0;
    currScale = voltScale;
  }

  const getScale = (v: VectorEntry) =>
    (hasDualScale && (v.label.startsWith('İ') || v.label.startsWith('I'))) ? currScale : voltScale;

  const toSVG = (v: VectorEntry) => {
    const s = getScale(v);
    const mag = v.value.magnitude;
    const phaseDeg = v.value.phase;
    const phaseRad = phaseDeg * Math.PI / 180;
    return {
      x: cx + s * mag * Math.cos(phaseRad),
      y: cx - s * mag * Math.sin(phaseRad), // SVG y-axis is inverted
    };
  };

  return (
    <div className="vcalc-phasor-card">
      <h4 className="vcalc-phasor-title">{title}</h4>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="vcalc-phasor-svg">
        <defs>
          {vectors.map(v => (
            <marker
              key={v.label}
              id={`arrow-${v.label.replace(/[^a-zA-Z0-9]/g, '_')}`}
              markerWidth="8" markerHeight="6"
              refX="6" refY="3" orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={v.color} />
            </marker>
          ))}
        </defs>

        {/* Outer circle */}
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="1" />
        {/* Half-radius dashed circle */}
        <circle cx={cx} cy={cx} r={radius / 2} fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2,2" />

        {/* Real axis (+Re) */}
        <line x1={margin} y1={cx} x2={size - margin} y2={cx} stroke="#9ca3af" strokeWidth="1" />
        {/* Imaginary axis (+Im) */}
        <line x1={cx} y1={margin} x2={cx} y2={size - margin} stroke="#9ca3af" strokeWidth="1" />

        {/* Axis labels */}
        <text x={size - margin + 4} y={cx + 10} fill="#6b7280" fontSize="9" dominantBaseline="middle">+Re</text>
        <text x={cx + 2} y={margin - 5} fill="#6b7280" fontSize="9" textAnchor="middle">+Im</text>

        {/* Phasor vectors */}
        {vectors.map(v => {
          if (!isFinite(v.value.magnitude) || v.value.magnitude < 1e-12) return null;
          const end = toSVG(v);
          const markerId = `arrow-${v.label.replace(/[^a-zA-Z0-9]/g, '_')}`;
          return (
            <line
              key={v.label}
              x1={cx} y1={cx}
              x2={end.x} y2={end.y}
              stroke={v.color}
              strokeWidth="2"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="vcalc-phasor-legend">
        {hasDualScale && (
          <p className="vcalc-phasor-note">Chú ý: Véc tơ V &amp; A được chia tỷ lệ độc lập.</p>
        )}
        {vectors.map(v => {
          const isAmps = v.label.startsWith('İ') || v.label.startsWith('I');
          return (
            <div key={v.label} className="vcalc-phasor-legend-row">
              <div className="vcalc-phasor-legend-color" style={{ backgroundColor: v.color }} />
              <span className="vcalc-phasor-legend-text" style={{ color: v.color }}>
                {v.label} = {v.value.toPolarString(isAmps ? 'A' : 'V')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhasorDiagram;
