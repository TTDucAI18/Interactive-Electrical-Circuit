import React from 'react';

interface CompensationTriangleProps {
  G: number;          // Conductance (S)
  B_original: number; // Original susceptance (S)
  B_new: number;      // New (target) susceptance (S)
}

/**
 * Draws the admittance triangle BEFORE and AFTER power factor correction,
 * with the compensation vector ΔB overlaid on the same diagram.
 */
const CompensationTriangleDiagram: React.FC<CompensationTriangleProps> = ({ G, B_original, B_new }) => {
  const B_comp = B_new - B_original;
  const Y_orig = Math.sqrt(G * G + B_original * B_original);
  const Y_new = Math.sqrt(G * G + B_new * B_new);

  const W = 460, H = 460;
  const margin = { left: 60, right: 60, top: 50, bottom: 50 };
  const drawW = W - margin.left - margin.right;
  const drawH = H - margin.top - margin.bottom;

  // Origin at bottom-left corner
  const ox = margin.left;
  const oy = H - margin.bottom;

  // Scale: fit both triangles
  const maxG = Math.max(Math.abs(G), 1e-9);
  const maxB = Math.max(Math.abs(B_original), Math.abs(B_new), 1e-9);
  const scaleX = drawW / maxG;
  const scaleY = drawH / maxB * 0.85;
  const scale = Math.min(scaleX, scaleY, 8000);

  const Gx = ox + G * scale;
  const yOrig = oy - B_original * scale;  // SVG inverted
  const yNew = oy - B_new * scale;

  const A = { x: ox, y: oy };
  const B = { x: Gx, y: oy };
  const C_orig = { x: Gx, y: yOrig };
  const C_new = { x: Gx, y: yNew };

  const fmt = (n: number, dec = 4) => isFinite(n) ? n.toFixed(dec) : '∞';

  return (
    <div className="vcalc-comp-triangle-card">
      <h4 className="vcalc-triangle-title">Tam giác dẫn điện – Trước và sau bù</h4>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="vcalc-triangle-svg">
        {/* Axes */}
        <line x1={margin.left - 20} y1={oy} x2={W - margin.right + 10} y2={oy} stroke="#9ca3af" strokeWidth="1" />
        <line x1={ox} y1={margin.top} x2={ox} y2={H - margin.bottom + 20} stroke="#9ca3af" strokeWidth="1" />
        <text x={W - margin.right + 12} y={oy + 5} fill="#6b7280" fontSize="10">+G</text>
        <text x={ox - 12} y={margin.top - 6} fill="#6b7280" fontSize="10" textAnchor="middle">+jB</text>
        <text x={ox - 12} y={H - margin.bottom + 14} fill="#6b7280" fontSize="10" textAnchor="middle">−jB</text>

        {/* Original triangle (orange) */}
        {isFinite(Y_orig) && (
          <>
            <polygon
              points={`${A.x},${A.y} ${B.x},${B.y} ${C_orig.x},${C_orig.y}`}
              fill="rgba(249,115,22,0.1)"
              stroke="none"
            />
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#f97316" strokeWidth="2.5" />
            <line x1={B.x} y1={B.y} x2={C_orig.x} y2={C_orig.y} stroke="#f97316" strokeWidth="2.5" />
            <line x1={A.x} y1={A.y} x2={C_orig.x} y2={C_orig.y} stroke="#f97316" strokeWidth="2.5" />

            {/* Labels for original */}
            <text x={(A.x + B.x) / 2} y={A.y + 16} textAnchor="middle" fill="#c2410c" fontSize="11" fontWeight="600">
              G = {fmt(G)}
            </text>
            <text x={B.x + 6} y={(B.y + C_orig.y) / 2} fill="#c2410c" fontSize="11" fontWeight="600">
              B = {fmt(B_original)}
            </text>
            <text x={(A.x + C_orig.x) / 2 - 52} y={(A.y + C_orig.y) / 2} fill="#c2410c" fontSize="11" fontWeight="600">
              Y = {fmt(Y_orig)}
            </text>
          </>
        )}

        {/* Compensation vector (green) */}
        {isFinite(B_comp) && Math.abs(B_comp) > 1e-9 && (
          <>
            <line
              x1={C_orig.x} y1={C_orig.y}
              x2={C_new.x} y2={C_new.y}
              stroke="#10b981" strokeWidth="3" strokeDasharray="6,4"
            />
            <text x={C_orig.x + 8} y={(C_orig.y + C_new.y) / 2} fill="#059669" fontSize="11" fontWeight="700">
              Bₐ = {fmt(B_comp)}
            </text>
          </>
        )}

        {/* New triangle (blue dashed) */}
        {isFinite(Y_new) && (
          <>
            <polygon
              points={`${A.x},${A.y} ${B.x},${B.y} ${C_new.x},${C_new.y}`}
              fill="rgba(14,165,233,0.08)"
              stroke="none"
            />
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="7,4" />
            <line x1={B.x} y1={B.y} x2={C_new.x} y2={C_new.y} stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="7,4" />
            <line x1={A.x} y1={A.y} x2={C_new.x} y2={C_new.y} stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="7,4" />

            {/* Labels for new */}
            <text x={B.x + 6} y={(B.y + C_new.y) / 2 - 12} fill="#0369a1" fontSize="11" fontWeight="600">
              B* = {fmt(B_new)}
            </text>
            <text x={(A.x + C_new.x) / 2 - 52} y={(A.y + C_new.y) / 2 - 10} fill="#0369a1" fontSize="11" fontWeight="600">
              Y* = {fmt(Y_new)}
            </text>
          </>
        )}

        {/* Origin dot */}
        <circle cx={A.x} cy={A.y} r="3" fill="#374151" />
      </svg>

      {/* Legend */}
      <div className="vcalc-comp-legend">
        <div className="vcalc-comp-legend-row">
          <div className="vcalc-comp-legend-dot" style={{ backgroundColor: '#f97316' }} />
          <span>Trước bù: Y = {fmt(Y_orig, 4)} S · cosφ ≈ {isFinite(G / Y_orig) ? (G / Y_orig).toFixed(3) : '∞'}</span>
        </div>
        {Math.abs(B_comp) > 1e-9 && (
          <div className="vcalc-comp-legend-row">
            <div className="vcalc-comp-legend-dot" style={{ backgroundColor: '#10b981' }} />
            <span>Bù thêm: Bₐ = {fmt(B_comp, 4)} S</span>
          </div>
        )}
        <div className="vcalc-comp-legend-row">
          <div className="vcalc-comp-legend-dot" style={{ backgroundColor: '#0ea5e9' }} />
          <span>Sau bù: Y* = {fmt(Y_new, 4)} S · cosφ* ≈ {isFinite(G / Y_new) ? (G / Y_new).toFixed(3) : '∞'}</span>
        </div>
      </div>
    </div>
  );
};

export default CompensationTriangleDiagram;
