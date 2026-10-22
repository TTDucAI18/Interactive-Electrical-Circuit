import React, { useState } from 'react';
import type { FormulaStep } from '../../voltageCalcEngine';

interface FormulaCardProps {
  step: FormulaStep;
  defaultOpen?: boolean;
}

/**
 * Expandable formula card showing:
 * - Title
 * - General formula
 * - Result in both polar and algebraic form
 * - Expandable section with full substitution
 */
const FormulaCard: React.FC<FormulaCardProps> = ({ step, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  const { real, imag } = step.result;
  const isReal = Math.abs(imag) < 1e-8 && isFinite(real);

  return (
    <div className={`vcalc-formula-card ${open ? 'vcalc-formula-card--open' : ''}`}>
      <button
        className="vcalc-formula-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="vcalc-formula-header-main">
          <span className="vcalc-formula-title">{step.title}</span>
          <span className="vcalc-formula-shortresult">
            {isReal
              ? `${real.toFixed(4)} ${step.unit}`
              : step.result.toPolarString(step.unit)}
          </span>
        </div>
        <span className={`vcalc-formula-chevron ${open ? 'vcalc-formula-chevron--open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="vcalc-formula-body">
          <div className="vcalc-formula-row">
            <span className="vcalc-formula-label">Công thức:</span>
            <span className="vcalc-formula-eq">{step.formula}</span>
          </div>
          <div className="vcalc-formula-row">
            <span className="vcalc-formula-label">Thế số:</span>
            <span className="vcalc-formula-sub">{step.substitution}</span>
          </div>
          {!isReal && (
            <>
              <div className="vcalc-formula-row">
                <span className="vcalc-formula-label">Dạng đại số:</span>
                <code className="vcalc-formula-value">{step.result.toAlgebraicString(step.unit)}</code>
              </div>
              <div className="vcalc-formula-row">
                <span className="vcalc-formula-label">Dạng cực:</span>
                <code className="vcalc-formula-value vcalc-formula-value--polar">{step.result.toPolarString(step.unit)}</code>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FormulaCard;
