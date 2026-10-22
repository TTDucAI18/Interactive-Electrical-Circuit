import React from 'react';

interface TriangleDiagramProps {
  title: string;
  base: number;    // R (Ω) or P (W) — horizontal side
  height: number;  // X (Ω) or Q (var) — vertical side (can be negative)
  hypotenuse: number; // Z (Ω) or S (VA)
  angle: number;   // Phase angle in degrees
  labels: {
    base: string;       // e.g. "R" or "P"
    height: string;     // e.g. "X" or "Q"
    hyp: string;        // e.g. "Z" or "S"
    angle: string;      // e.g. "φ"
  };
  units: {
    base: string;    // e.g. "Ω" or "W"
    height: string;  // e.g. "Ω" or "var"
    hyp: string;     // e.g. "Ω" or "VA"
  };
}

const TriangleDiagram: React.FC<TriangleDiagramProps> = ({
  title, base, height, hypotenuse, angle, labels, units,
}) => {
  const W = 400, H = 260;
  const margin = 60;
  const drawHeight = H - 2 * margin;
  const drawWidth = W - 2 * margin;

  // Determine if the height is positive or negative (capacitive vs inductive)
  const isPositiveHeight = height >= 0;

  // Scale so triangle fits nicely
  const maxVal = Math.max(Math.abs(base), Math.abs(height), 1e-9);
  const scaleH = drawWidth / maxVal;
  const scaleV = drawHeight / maxVal * 0.8;
  const scale = Math.min(scaleH, scaleV, 3);

  // Points: A at bottom-left, B at bottom-right, C at top-right (or bottom-right if negative height)
  const baseY = isPositiveHeight ? H - margin : margin;
  const A = { x: margin, y: baseY };
  const B = { x: margin + Math.abs(base) * scale, y: baseY };
  const C = { x: B.x, y: isPositiveHeight ? baseY - Math.abs(height) * scale : baseY + Math.abs(height) * scale };

  // Arc for angle
  const arcR = 28;
  const angleRad = Math.abs(angle) * Math.PI / 180;
  const arcEndX = A.x + arcR * Math.cos(-angleRad * (isPositiveHeight ? 1 : -1));
  const arcEndY = A.y - arcR * Math.sin(-angleRad * (isPositiveHeight ? 1 : -1));

  const fmt = (n: number) => isFinite(n) ? n.toFixed(2) : '∞';
  const midBase = { x: (A.x + B.x) / 2, y: A.y + (isPositiveHeight ? 16 : -16) };
  const midHeight = { x: B.x + 8, y: (B.y + C.y) / 2 };
  const midHyp = { x: (A.x + C.x) / 2 - 14, y: (A.y + C.y) / 2 };

  return (
    <div className="vcalc-triangle-card">
      <h4 className="vcalc-triangle-title">{title}</h4>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="vcalc-triangle-svg">
        {/* Triangle fill */}
        <polygon
          points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
          fill="rgba(6,182,212,0.08)"
          stroke="none"
        />

        {/* Base side (R or P) */}
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#0891b2" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Height side (X or Q) */}
        <line x1={B.x} y1={B.y} x2={C.x} y2={C.y}
          stroke={height >= 0 ? '#f97316' : '#a855f7'}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Hypotenuse (Z or S) */}
        <line x1={A.x} y1={A.y} x2={C.x} y2={C.y} stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Right angle marker at B */}
        <rect
          x={B.x - 10} y={Math.min(B.y, C.y)}
          width="10" height="10"
          fill="none" stroke="#6b7280" strokeWidth="1"
        />

        {/* Angle arc at A */}
        {Math.abs(angle) > 1 && (
          <path
            d={`M ${A.x + arcR} ${A.y} A ${arcR} ${arcR} 0 0 ${isPositiveHeight ? 1 : 0} ${arcEndX} ${arcEndY}`}
            fill="none"
            stroke="#6b7280"
            strokeWidth="1.5"
          />
        )}

        {/* Labels */}
        <text x={midBase.x} y={midBase.y} textAnchor="middle" fill="#0891b2" fontSize="12" fontWeight="600">
          {labels.base}: {fmt(base)} {units.base}
        </text>
        <text x={midHeight.x} y={midHeight.y} textAnchor="start" fill={height >= 0 ? '#f97316' : '#a855f7'} fontSize="12" fontWeight="600">
          {labels.height}: {fmt(Math.abs(height))} {units.height}
        </text>
        <text x={midHyp.x} y={midHyp.y} textAnchor="middle" fill="#059669" fontSize="12" fontWeight="600">
          {labels.hyp}: {fmt(hypotenuse)} {units.hyp}
        </text>
        {Math.abs(angle) > 1 && (
          <text x={A.x + 38} y={A.y - (isPositiveHeight ? 16 : -16)} fill="#6b7280" fontSize="11">
            {labels.angle} = {fmt(Math.abs(angle))}°
          </text>
        )}

        {/* X label for negative height (capacitive) */}
        {height < 0 && (
          <text x={B.x + 8} y={(B.y + C.y) / 2 - 12} textAnchor="start" fill="#a855f7" fontSize="10">
            (dung)
          </text>
        )}
        {height >= 0 && (
          <text x={B.x + 8} y={(B.y + C.y) / 2 + 16} textAnchor="start" fill="#f97316" fontSize="10">
            (cảm)
          </text>
        )}
      </svg>
    </div>
  );
};

export default TriangleDiagram;
