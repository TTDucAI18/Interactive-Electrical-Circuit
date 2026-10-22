import React, { useEffect, useRef } from 'react';
import {
  Copy,
  CornerDownRight,
  Edit3,
  FileDown,
  Maximize,
  Move,
  Power,
  RotateCw,
  Trash2,
  Zap,
  Plus
} from 'lucide-react';
import type { CircuitComponent, CircuitNode, CircuitWire, ComponentKind, Point } from '../circuit';
import type { Language } from '../i18n';

export type ContextMenuTarget =
  | { kind: 'canvas'; boardPoint: Point; clientX: number; clientY: number }
  | { kind: 'component'; component: CircuitComponent; clientX: number; clientY: number }
  | { kind: 'wire'; wire: CircuitWire; clientX: number; clientY: number }
  | { kind: 'node'; node: CircuitNode; clientX: number; clientY: number };

interface ContextMenuProps {
  target: ContextMenuTarget;
  language: Language;
  onClose: () => void;
  // Component actions
  onRotateComponent?: (id: string, delta: number) => void;
  onDuplicateComponent?: (id: string) => void;
  onDeleteComponent?: (id: string) => void;
  onToggleSwitch?: (id: string) => void;
  onEditComponent?: (id: string) => void;
  // Wire actions
  onAutoRouteWire?: (id: string) => void;
  onFlipWireAxis?: (id: string) => void;
  onDeleteWire?: (id: string) => void;
  // Node actions
  onStartWireFromNode?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  // Canvas actions
  onAddComponent?: (kind: ComponentKind, pos: Point) => void;
  onAddJunction?: (pos: Point) => void;
  onResetView?: () => void;
  onLoadTOECircuit?: () => void;
  onOpenExportPdf?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  target,
  language,
  onClose,
  onRotateComponent,
  onDuplicateComponent,
  onDeleteComponent,
  onToggleSwitch,
  onEditComponent,
  onAutoRouteWire,
  onFlipWireAxis,
  onDeleteWire,
  onStartWireFromNode,
  onDeleteNode,
  onAddComponent,
  onAddJunction,
  onResetView,
  onLoadTOECircuit,
  onOpenExportPdf,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Viewport clamping
  const menuWidth = 240;
  const menuHeight = 320;
  const x = Math.min(Math.max(10, target.clientX), window.innerWidth - menuWidth - 10);
  const y = Math.min(Math.max(10, target.clientY), window.innerHeight - menuHeight - 10);

  const vi = language === 'vi';

  return (
    <div
      ref={menuRef}
      className="context-menu-floating"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        minWidth: '220px',
        maxWidth: '260px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '10px',
        padding: '6px',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        color: '#e2e8f0',
        fontSize: '13px',
        userSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Component Context Menu */}
      {target.kind === 'component' && (
        <>
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {target.component.label} ({target.component.kind})
          </div>
          <button
            className="context-menu-item"
            onClick={() => { onRotateComponent?.(target.component.id, 90); onClose(); }}
          >
            <RotateCw size={15} /> <span>{vi ? 'Xoay 90°' : 'Rotate 90°'}</span> <kbd>R</kbd>
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onRotateComponent?.(target.component.id, 180); onClose(); }}
          >
            <RotateCw size={15} /> <span>{vi ? 'Xoay 180°' : 'Rotate 180°'}</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onDuplicateComponent?.(target.component.id); onClose(); }}
          >
            <Copy size={15} /> <span>{vi ? 'Nhân bản' : 'Duplicate'}</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onEditComponent?.(target.component.id); onClose(); }}
          >
            <Edit3 size={15} /> <span>{vi ? 'Chỉnh sửa thông số' : 'Edit values'}</span>
          </button>
          {target.component.kind === 'SW' && (
            <button
              className="context-menu-item"
              onClick={() => { onToggleSwitch?.(target.component.id); onClose(); }}
            >
              <Power size={15} /> <span>{target.component.switchClosed ? (vi ? 'Mở công tắc' : 'Open switch') : (vi ? 'Đóng công tắc' : 'Close switch')}</span>
            </button>
          )}
          <div className="context-menu-sep" />
          <button
            className="context-menu-item danger"
            onClick={() => { onDeleteComponent?.(target.component.id); onClose(); }}
          >
            <Trash2 size={15} /> <span>{vi ? 'Xóa linh kiện' : 'Delete'}</span> <kbd>Del</kbd>
          </button>
        </>
      )}

      {/* Wire Context Menu */}
      {target.kind === 'wire' && (
        <>
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {vi ? 'Dây dẫn' : 'Wire'} ({target.wire.id.slice(0, 8)})
          </div>
          <button
            className="context-menu-item"
            onClick={() => { onAutoRouteWire?.(target.wire.id); onClose(); }}
          >
            <CornerDownRight size={15} /> <span>{vi ? 'Căn tuyến tự động' : 'Auto route'}</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onFlipWireAxis?.(target.wire.id); onClose(); }}
          >
            <Move size={15} /> <span>{vi ? 'Đổi trục bẻ góc (X ↔ Y)' : 'Flip route axis'}</span>
          </button>
          <div className="context-menu-sep" />
          <button
            className="context-menu-item danger"
            onClick={() => { onDeleteWire?.(target.wire.id); onClose(); }}
          >
            <Trash2 size={15} /> <span>{vi ? 'Xóa dây nối' : 'Delete wire'}</span> <kbd>Del</kbd>
          </button>
        </>
      )}

      {/* Node Context Menu */}
      {target.kind === 'node' && (
        <>
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {vi ? 'Điểm nối' : 'Junction'} {target.node.label}
          </div>
          <button
            className="context-menu-item"
            onClick={() => { onStartWireFromNode?.(target.node.id); onClose(); }}
          >
            <Zap size={15} /> <span>{vi ? 'Kéo dây từ điểm này' : 'Connect wire'}</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              const next = prompt(vi ? 'Nhập tên mới cho điểm nối:' : 'New label for junction:', target.node.label);
              if (next && next.trim()) {
                target.node.label = next.trim();
              }
              onClose();
            }}
          >
            <Edit3 size={15} /> <span>{vi ? 'Đổi tên nhãn' : 'Rename label'}</span>
          </button>
          <div className="context-menu-sep" />
          <button
            className="context-menu-item danger"
            onClick={() => { onDeleteNode?.(target.node.id); onClose(); }}
          >
            <Trash2 size={15} /> <span>{vi ? 'Xóa điểm nối' : 'Delete junction'}</span> <kbd>Del</kbd>
          </button>
        </>
      )}

      {/* Canvas Context Menu */}
      {target.kind === 'canvas' && (
        <>
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {vi ? 'Thêm linh kiện tại đây' : 'Add Component Here'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', padding: '2px 4px' }}>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('R', target.boardPoint); onClose(); }}
            >
              <b>R</b> <span>Điện trở</span>
            </button>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('L', target.boardPoint); onClose(); }}
            >
              <b>L</b> <span>Cuộn cảm</span>
            </button>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('C', target.boardPoint); onClose(); }}
            >
              <b>C</b> <span>Tụ điện</span>
            </button>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('VAC', target.boardPoint); onClose(); }}
            >
              <b>V~</b> <span>Nguồn AC</span>
            </button>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('GND', target.boardPoint); onClose(); }}
            >
              <b>⏚</b> <span>Nối đất</span>
            </button>
            <button
              className="context-menu-subitem"
              onClick={() => { onAddComponent?.('SW', target.boardPoint); onClose(); }}
            >
              <b>S</b> <span>Công tắc</span>
            </button>
          </div>

          <button
            className="context-menu-item"
            style={{ marginTop: '4px' }}
            onClick={() => { onAddJunction?.(target.boardPoint); onClose(); }}
          >
            <Plus size={15} /> <span>{vi ? 'Thêm điểm nối (Junction)' : 'Add Junction'}</span> <kbd>J</kbd>
          </button>

          <div className="context-menu-sep" />

          <button
            className="context-menu-item"
            onClick={() => { onResetView?.(); onClose(); }}
          >
            <Maximize size={15} /> <span>{vi ? 'Căn giữa khung nhìn (100%)' : 'Reset View (100%)'}</span>
          </button>

          <button
            className="context-menu-item"
            style={{ color: '#38bdf8' }}
            onClick={() => { onLoadTOECircuit?.(); onClose(); }}
          >
            <Zap size={15} /> <span>{vi ? 'Nạp Mạch Chuẩn TOE (8 phần tử)' : 'Load TOE 8-Slot Circuit'}</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => { onOpenExportPdf?.(); onClose(); }}
          >
            <FileDown size={15} /> <span>{vi ? 'Xuất PDF & Hình ảnh...' : 'Export PDF / Image...'}</span>
          </button>
        </>
      )}
    </div>
  );
};
