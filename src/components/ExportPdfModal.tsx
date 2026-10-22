import React, { useState, useRef } from 'react';
import {
  Download,
  Maximize2,
  Printer,
  RotateCcw,
  Sliders,
  X,
  FileImage
} from 'lucide-react';
import { CircuitCanvas } from './CircuitCanvas';
import type { CircuitDocument, CircuitResult } from '../circuit';
import { magnitude } from '../circuit';
import { componentNameKey, translate, type Language } from '../i18n';

interface ExportPdfModalProps {
  circuit: CircuitDocument;
  result: CircuitResult | null;
  language: Language;
  onClose: () => void;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  circuit,
  result,
  language,
  onClose,
}) => {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(language, key, params);
  const vi = language === 'vi';

  const [scale, setScale] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [title, setTitle] = useState(vi ? 'Báo cáo Phân tích Mạch điện Xoay chiều' : 'AC Electrical Circuit Analysis Report');
  const [author, setAuthor] = useState('');
  const [showCircuit, setShowCircuit] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [showComponents, setShowComponents] = useState(true);
  const [showWires, setShowWires] = useState(false);

  const previewSvgRef = useRef<SVGSVGElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const autoCenter = () => {
    if (circuit.components.length === 0) {
      setOffsetX(0);
      setOffsetY(0);
      return;
    }
    const minX = Math.min(...circuit.components.map((c) => c.x));
    const maxX = Math.max(...circuit.components.map((c) => c.x));
    const minY = Math.min(...circuit.components.map((c) => c.y));
    const maxY = Math.max(...circuit.components.map((c) => c.y));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    setOffsetX(Math.round(500 - midX));
    setOffsetY(Math.round(350 - midY));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSvg = () => {
    if (!previewSvgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(previewSvgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `circuit-${Date.now()}.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadPng = () => {
    if (!previewSvgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(previewSvgRef.current);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const URLObject = window.URL || window.webkitURL || window;
    const blobURL = URLObject.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const width = 1000 * 2;
      const height = 700 * 2;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const pngUrl = canvas.toDataURL('image/png');
        const anchor = document.createElement('a');
        anchor.href = pngUrl;
        anchor.download = `circuit-${Date.now()}.png`;
        anchor.click();
      }
      URLObject.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  return (
    <div className="pdf-export-modal-backdrop">
      <div className="pdf-export-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
        {/* Modal Header */}
        <div className="pdf-modal-header">
          <div className="pdf-modal-title-group">
            <Sliders size={20} style={{ color: '#38bdf8' }} />
            <div>
              <h2 id="pdf-modal-title">{vi ? 'Tùy chỉnh & Xuất Báo Cáo PDF / Ảnh' : 'Customize & Export PDF / Image'}</h2>
              <p className="pdf-modal-subtitle">
                {vi
                  ? 'Chỉnh kích thước, dịch chuyển vị trí sơ đồ và xem trước chính xác trang in'
                  : 'Adjust scale, position, and preview exact printed output'}
              </p>
            </div>
          </div>
          <button className="pdf-modal-close" onClick={onClose} aria-label={t('removeImage')}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Controls on left, Live Sheet Preview on right */}
        <div className="pdf-modal-body">
          {/* Controls Panel */}
          <div className="pdf-controls-sidebar">
            <div className="pdf-control-group">
              <label className="pdf-group-label">{vi ? 'Thông tin báo cáo' : 'Report Info'}</label>
              <div className="pdf-field">
                <span>{vi ? 'Tiêu đề' : 'Title'}</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="pdf-input"
                />
              </div>
              <div className="pdf-field">
                <span>{vi ? 'Người thực hiện' : 'Author'}</span>
                <input
                  type="text"
                  placeholder={vi ? 'Họ tên sinh viên / Kỹ sư' : 'Student / Engineer name'}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="pdf-input"
                />
              </div>
            </div>

            <div className="pdf-control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="pdf-group-label">{vi ? 'Vị trí & Kích thước mạch' : 'Circuit Size & Position'}</label>
                <button
                  type="button"
                  onClick={autoCenter}
                  className="pdf-btn-small"
                  title={vi ? 'Căn giữa mạch vào tâm trang' : 'Center circuit'}
                >
                  <Maximize2 size={13} /> {vi ? 'Căn giữa' : 'Center'}
                </button>
              </div>

              {/* Scale Slider */}
              <div className="pdf-slider-row">
                <div className="pdf-slider-label">
                  <span>{vi ? 'Tỉ lệ kích thước (Scale)' : 'Scale'}</span>
                  <b className="pdf-slider-val">{Math.round(scale * 100)}%</b>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="pdf-slider"
                />
              </div>

              {/* Offset X Slider */}
              <div className="pdf-slider-row">
                <div className="pdf-slider-label">
                  <span>{vi ? 'Dịch chuyển ngang (X)' : 'Offset X'}</span>
                  <b className="pdf-slider-val">{offsetX > 0 ? `+${offsetX}` : offsetX} px</b>
                </div>
                <input
                  type="range"
                  min="-400"
                  max="400"
                  step="10"
                  value={offsetX}
                  onChange={(e) => setOffsetX(Number(e.target.value))}
                  className="pdf-slider"
                />
              </div>

              {/* Offset Y Slider */}
              <div className="pdf-slider-row">
                <div className="pdf-slider-label">
                  <span>{vi ? 'Dịch chuyển dọc (Y)' : 'Offset Y'}</span>
                  <b className="pdf-slider-val">{offsetY > 0 ? `+${offsetY}` : offsetY} px</b>
                </div>
                <input
                  type="range"
                  min="-300"
                  max="300"
                  step="10"
                  value={offsetY}
                  onChange={(e) => setOffsetY(Number(e.target.value))}
                  className="pdf-slider"
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="pdf-btn-secondary"
                  onClick={() => { setScale(1.0); setOffsetX(0); setOffsetY(0); }}
                >
                  <RotateCcw size={13} /> {vi ? 'Đặt lại vị trí (100%)' : 'Reset'}
                </button>
              </div>
            </div>

            <div className="pdf-control-group">
              <label className="pdf-group-label">{vi ? 'Khổ giấy & Tùy chọn' : 'Page & Sections'}</label>
              <div className="pdf-toggle-group">
                <button
                  className={`pdf-toggle-btn ${orientation === 'portrait' ? 'active' : ''}`}
                  onClick={() => setOrientation('portrait')}
                >
                  📄 {vi ? 'Khổ Dọc (Portrait)' : 'Portrait'}
                </button>
                <button
                  className={`pdf-toggle-btn ${orientation === 'landscape' ? 'active' : ''}`}
                  onClick={() => setOrientation('landscape')}
                >
                  📄 {vi ? 'Khổ Ngang (Landscape)' : 'Landscape'}
                </button>
              </div>

              <div className="pdf-checkboxes">
                <label className="pdf-checkbox-item">
                  <input
                    type="checkbox"
                    checked={showCircuit}
                    onChange={(e) => setShowCircuit(e.target.checked)}
                  />
                  <span>{vi ? 'Hiển thị sơ đồ mạch' : 'Include Circuit Diagram'}</span>
                </label>
                <label className="pdf-checkbox-item">
                  <input
                    type="checkbox"
                    checked={showAxes}
                    onChange={(e) => setShowAxes(e.target.checked)}
                  />
                  <span>{vi ? 'Hiển thị trục toạ độ' : 'Include Axes'}</span>
                </label>
                <label className="pdf-checkbox-item">
                  <input
                    type="checkbox"
                    checked={showResults}
                    onChange={(e) => setShowResults(e.target.checked)}
                  />
                  <span>{vi ? 'Hiển thị kết quả tính toán' : 'Include Calculations'}</span>
                </label>
                <label className="pdf-checkbox-item">
                  <input
                    type="checkbox"
                    checked={showComponents}
                    onChange={(e) => setShowComponents(e.target.checked)}
                  />
                  <span>{vi ? 'Bảng thông số linh kiện' : 'Component Specs Table'}</span>
                </label>
                <label className="pdf-checkbox-item">
                  <input
                    type="checkbox"
                    checked={showWires}
                    onChange={(e) => setShowWires(e.target.checked)}
                  />
                  <span>{vi ? 'Danh sách kết nối dây' : 'Wire Connections'}</span>
                </label>
              </div>
            </div>

            <div className="pdf-control-group">
              <label className="pdf-group-label">{vi ? 'Hành động xuất' : 'Export Actions'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="pdf-btn-primary" onClick={handlePrint}>
                  <Printer size={16} /> {vi ? 'In / Lưu dưới dạng PDF' : 'Print / Save as PDF'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="pdf-btn-secondary" onClick={handleDownloadSvg}>
                    <Download size={14} /> {vi ? 'Tải SVG' : 'SVG'}
                  </button>
                  <button className="pdf-btn-secondary" onClick={handleDownloadPng}>
                    <FileImage size={14} /> {vi ? 'Tải PNG 2X' : 'PNG'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Live Page Preview */}
          <div className="pdf-preview-viewport">
            <div
              ref={sheetRef}
              className={`pdf-export-sheet ${orientation}`}
              style={{
                width: orientation === 'portrait' ? '210mm' : '297mm',
                minHeight: orientation === 'portrait' ? '297mm' : '210mm',
              }}
            >
              {/* Sheet Header */}
              <div className="sheet-header">
                <div>
                  <h1 className="sheet-title">{title}</h1>
                  <p className="sheet-meta">
                    {vi ? 'Thời gian lập' : 'Generated'}: {new Date().toLocaleString(vi ? 'vi-VN' : 'en-US')}
                    {author ? ` • ${vi ? 'Người thực hiện' : 'Author'}: ${author}` : ''}
                  </p>
                </div>
                <div className="sheet-badge">
                  <span>Interactive Electrical Circuit</span>
                </div>
              </div>

              {/* Source parameters summary */}
              <div className="sheet-source-bar">
                <span><b>{t('frequency')}:</b> {circuit.frequency} Hz</span>
                {circuit.components
                  .filter((p) => p.kind === 'VAC')
                  .map((src) => (
                    <span key={src.id}>
                      <b>{src.label}:</b> {src.value} V RMS · {src.phase}°
                    </span>
                  ))}
                {result && (
                  <span>
                    <b>cos φ:</b> {result.powerFactor.toFixed(3)}
                  </span>
                )}
              </div>

              {/* Circuit SVG Diagram with User Scale & Pan */}
              {showCircuit && (
                <div className="sheet-circuit-container">
                  <div className="sheet-section-title">{vi ? 'SƠ ĐỒ MẠCH ĐIỆN' : 'CIRCUIT SCHEMATIC'}</div>
                  <div className="sheet-circuit-svg-wrap">
                    <CircuitCanvas
                      circuit={circuit}
                      selected={null}
                      language={language}
                      svgRef={previewSvgRef}
                      wireStart={null}
                      wireCursor={null}
                      readOnly={true}
                      zoom={scale}
                      pan={{ x: offsetX, y: offsetY }}
                      showAxes={showAxes}
                    />
                  </div>
                </div>
              )}

              {/* Power Results */}
              {showResults && result && (
                <div className="sheet-results-section">
                  <div className="sheet-section-title">{vi ? 'KẾT QUẢ TÍNH TOÁN CÔNG SUẤT' : 'POWER METRICS'}</div>
                  <div className="sheet-metrics-row">
                    <div className="sheet-metric-box">
                      <span className="sheet-m-label">{t('activePower')} (P)</span>
                      <strong className="sheet-m-val">{result.activePower.toFixed(2)} W</strong>
                    </div>
                    <div className="sheet-metric-box">
                      <span className="sheet-m-label">{t('reactivePower')} (Q)</span>
                      <strong className="sheet-m-val">{result.reactivePower.toFixed(2)} var</strong>
                    </div>
                    <div className="sheet-metric-box">
                      <span className="sheet-m-label">{t('apparentPower')} (S)</span>
                      <strong className="sheet-m-val">{result.apparentPower.toFixed(2)} VA</strong>
                    </div>
                    <div className="sheet-metric-box">
                      <span className="sheet-m-label">{t('powerFactor')} (cosφ)</span>
                      <strong className="sheet-m-val">{result.powerFactor.toFixed(3)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Components Specs Table */}
              {showComponents && (
                <div className="sheet-table-section">
                  <div className="sheet-section-title">{vi ? 'BẢNG THÔNG SỐ VÀ DÒNG ÁP LINH KIỆN' : 'COMPONENT PARAMETERS'}</div>
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>{vi ? 'Ký hiệu' : 'Ref'}</th>
                        <th>{vi ? 'Loại' : 'Type'}</th>
                        <th>{vi ? 'Giá trị' : 'Value'}</th>
                        <th>{vi ? 'Điện áp RMS' : 'Voltage'}</th>
                        <th>{vi ? 'Dòng điện RMS' : 'Current'}</th>
                        <th>{vi ? 'Trạng thái' : 'State'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {circuit.components.map((part) => {
                        const calculated = result?.components[part.id];
                        const unit =
                          part.kind === 'R'
                            ? 'Ω'
                            : part.kind === 'L'
                              ? 'mH'
                              : part.kind === 'C'
                                ? 'µF'
                                : part.kind === 'VAC'
                                  ? 'V RMS'
                                  : '';
                        return (
                          <tr key={part.id}>
                            <td><b>{part.label}</b></td>
                            <td>{t(componentNameKey[part.kind])}</td>
                            <td>{['R', 'L', 'C', 'VAC'].includes(part.kind) ? `${part.value} ${unit}` : '—'}</td>
                            <td>{calculated ? `${magnitude(calculated.voltage).toFixed(2)} V` : '—'}</td>
                            <td>{calculated ? `${magnitude(calculated.current).toFixed(3)} A` : '—'}</td>
                            <td>{part.kind === 'SW' ? (part.switchClosed ? (vi ? 'Đóng' : 'Closed') : (vi ? 'Mở' : 'Open')) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Wires */}
              {showWires && circuit.wires.length > 0 && (
                <div className="sheet-table-section">
                  <div className="sheet-section-title">{vi ? 'DANH SÁCH DÂY NỐI' : 'WIRE CONNECTIONS'}</div>
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>{vi ? 'Từ' : 'From'}</th>
                        <th>{vi ? 'Đến' : 'To'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {circuit.wires.map((wire) => (
                        <tr key={wire.id}>
                          <td>{wire.id.slice(0, 8)}</td>
                          <td>{wire.from.type === 'node' ? wire.from.nodeId : `${wire.from.componentId}.${wire.from.pinId}`}</td>
                          <td>{wire.to.type === 'node' ? wire.to.nodeId : `${wire.to.componentId}.${wire.to.pinId}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sheet Footer */}
              <div className="sheet-footer">
                <span>Interactive Electrical Circuit Simulation Engine</span>
                <span>Page 1 of 1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
