import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, RegularPolygon, Star as KonvaStar, Transformer, Text as KonvaText, Group } from 'react-konva';
import useImage from 'use-image';
import axios from 'axios';
import { Type, Square, Trash2, Circle as CircleIcon, Triangle, Star, Save, Maximize, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Tag, Lock, Unlock } from 'lucide-react';
import FileUploadZone from './FileUploadZone';

const FONTS  = ['Inter', 'Roboto', 'Montserrat', 'Playfair Display', 'Lora', 'Open Sans', 'Oswald', 'Raleway'];
const STYLES = ['normal', 'bold', 'italic', 'bold italic'];

function TemplateDesigner({ initialTemplate, onSave, onCancel }) {
  const [name, setName] = useState(initialTemplate?.name || '');
  const [library, setLibrary] = useState([]);
  const [layers, setLayers] = useState(() => {
    const cfg = parseConfig(initialTemplate);
    return cfg.layers || [];
  });
  const [viewport, setViewport] = useState(() => {
    const cfg = parseConfig(initialTemplate);
    if (cfg.viewport) return cfg.viewport;
    if (cfg.canvasSize) return { x: 0, y: 0, w: cfg.canvasSize.w, h: cfg.canvasSize.h, cornerRadius: 0 };
    return { x: 0, y: 0, w: 800, h: 800, cornerRadius: 0 };
  });
  const [canvasSize, setCanvasSize] = useState(() => {
    const cfg = parseConfig(initialTemplate);
    return cfg.canvasSize || { w: 800, h: 800 };
  });
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [lockRatio, setLockRatio] = useState(true);

  // ── Undo / Redo history ──────────────────────────────────
  const historyRef    = useRef([]);
  const historyIdx    = useRef(-1);
  const skipPushRef   = useRef(false);       // set true during undo/redo to skip re-push
  const debounceRef   = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const stageRef = useRef();
  const trRef = useRef();
  const vpTrRef = useRef();
  const containerRef = useRef();

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    setScale(Math.min((c.offsetWidth - 60) / canvasSize.w, (c.offsetHeight - 60) / canvasSize.h, 1));
    setPanOffset({ x: 0, y: 0 });
  }, [canvasSize]);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  // ── Push history on every layers/viewport change (debounced 400ms) ──
  useEffect(() => {
    if (skipPushRef.current) { skipPushRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const snapshot = { layers: JSON.parse(JSON.stringify(layers)), viewport: { ...viewport } };
      historyRef.current = historyRef.current.slice(0, historyIdx.current + 1);
      historyRef.current.push(snapshot);
      if (historyRef.current.length > 60) historyRef.current.shift();
      historyIdx.current = historyRef.current.length - 1;
      setCanUndo(historyIdx.current > 0);
      setCanRedo(false);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [layers, viewport]); // eslint-disable-line

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current--;
    const snap = historyRef.current[historyIdx.current];
    skipPushRef.current = true;
    setLayers(JSON.parse(JSON.stringify(snap.layers)));
    setViewport({ ...snap.viewport });
    setSelectedId(null);
    setCanUndo(historyIdx.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current >= historyRef.current.length - 1) return;
    historyIdx.current++;
    const snap = historyRef.current[historyIdx.current];
    skipPushRef.current = true;
    setLayers(JSON.parse(JSON.stringify(snap.layers)));
    setViewport({ ...snap.viewport });
    setSelectedId(null);
    setCanUndo(true);
    setCanRedo(historyIdx.current < historyRef.current.length - 1);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setScale(s => Math.min(3, Math.max(0.1, s + (e.deltaY > 0 ? -0.05 : 0.05))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return; }

      if (isTyping) return; // don't move layers when typing

      // Arrow key movement
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp'   ? -d : e.key === 'ArrowDown'  ? d : 0;
        if (selectedId === 'viewport') {
          setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        } else if (selectedId) {
          setLayers(prev => prev.map(l => l.id === selectedId ? { ...l, x: l.x + dx, y: l.y + dy } : l));
        }
        return;
      }

      // Delete selected layer
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && selectedId !== 'viewport') {
        setLayers(p => p.filter(l => l.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo]);

  const handleMiddlePanStart = (e) => {
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
  };
  const handleMiddlePanMove = (e) => {
    if (isPanning) setPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  };
  const handleMiddlePanEnd = () => setIsPanning(false);

  // ── Drag to canvas ───────────────────────────────────────
  const handleDragStart = (e, type, data = {}) => {
    e.dataTransfer.setData('type', type);
    if (data) e.dataTransfer.setData('data', JSON.stringify(data));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    stageRef.current.setPointersPositions(e);
    const pos = stageRef.current.getRelativePointerPosition();
    const type = e.dataTransfer.getData('type');
    const data = e.dataTransfer.getData('data') ? JSON.parse(e.dataTransfer.getData('data')) : null;

    if (type === 'text' || type === 'label') {
      const isLabel = type === 'label';
      const nl = {
        id: 'text-' + Date.now(), type: 'text',
        subtype: isLabel ? 'label' : 'text',
        text: isLabel ? 'Label Name' : 'Text',
        placeholder: 'Enter text...', x: Math.round(pos.x), y: Math.round(pos.y),
        fontSize: isLabel ? 24 : 30,
        fill: isLabel ? '#fbbf24' : '#ffffff',
        fontFamily: 'Inter', fontStyle: 'bold', rotation: 0,
        label: isLabel ? 'Label' : 'Text Field',
        isEditable: !isLabel,   // labels are static — users cannot edit them
      };
      setLayers(prev => [...prev, nl]);
      setSelectedId(nl.id);
    } else if (type === 'library-image' && data) {
      const nl = { id: 'img-' + Date.now(), type: 'image', url: data.url, label: 'Image', x: Math.round(pos.x), y: Math.round(pos.y), w: 200, h: 200, rotation: 0 };
      setLayers(prev => [...prev, nl]);
      setSelectedId(nl.id);
    } else if (type?.startsWith('shape-')) {
      const nl = { id: 'shape-' + Date.now(), type: 'shape', shapeType: type.replace('shape-', ''), label: 'Shape', x: Math.round(pos.x), y: Math.round(pos.y), w: 120, h: 120, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 0, rotation: 0, opacity: 1, transparentFill: false };
      setLayers(prev => [...prev, nl]);
      setSelectedId(nl.id);
    }
  };

  const updateLayer = (id, attrs) => setLayers(prev => prev.map(l => l.id === id ? { ...l, ...attrs } : l));
  const moveLayer = (dir) => {
    const idx = layers.findIndex(l => l.id === selectedId);
    if (idx === -1) return;
    const nl = [...layers];
    if (dir === 'up' && idx < nl.length - 1) [nl[idx], nl[idx + 1]] = [nl[idx + 1], nl[idx]];
    else if (dir === 'down' && idx > 0) [nl[idx], nl[idx - 1]] = [nl[idx - 1], nl[idx]];
    setLayers(nl);
  };
  const deleteLayer = () => { if (!selectedId) return; setLayers(p => p.filter(l => l.id !== selectedId)); setSelectedId(null); };

  // ── Upload asset to server ───────────────────────────────
  const handleLibraryUpload = async (files) => {
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append('asset', f);
        const res = await axios.post('/api/upload-asset', fd);
        setLibrary(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), url: res.data.url, name: f.name }]);
      } catch (err) {
        if (err.response?.status === 401) {
          alert('Phiên đăng nhập hết hạn. Đăng nhập lại.');
          window.location.href = '/login';
          return;
        }
        alert(`Upload lỗi: ${err.message}`);
      }
    }
  };

  // ── Transformer sync ─────────────────────────────────────
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    if (selectedId && selectedId !== 'viewport') {
      trRef.current.nodes(stageRef.current.find('.' + selectedId));
    } else {
      trRef.current.nodes([]);
    }
    trRef.current.getLayer()?.batchDraw();
  }, [selectedId, layers]);

  useEffect(() => {
    if (!vpTrRef.current || !stageRef.current) return;
    vpTrRef.current.nodes(selectedId === 'viewport' ? stageRef.current.find('.viewport-rect') : []);
    vpTrRef.current.getLayer()?.batchDraw();
  }, [selectedId, viewport]);

  // ── Save ─────────────────────────────────────────────────
  const handleSaveAll = async () => {
    if (!name.trim()) return alert('Vui lòng nhập tên template');
    setSaving(true);
    try {
      setSelectedId(null);
      if (trRef.current) { trRef.current.nodes([]); trRef.current.getLayer()?.batchDraw(); }
      if (vpTrRef.current) { vpTrRef.current.nodes([]); vpTrRef.current.getLayer()?.batchDraw(); }

      let thumbnailBlob = null;
      if (stageRef.current) {
        try {
          const dataUrl = stageRef.current.toDataURL({ pixelRatio: 0.5, mimeType: 'image/jpeg' });
          thumbnailBlob = await (await fetch(dataUrl)).blob();
        } catch (_) { /* optional */ }
      }

      onSave({
        name,
        files: { background: null, overlay: null, thumbnail: thumbnailBlob },
        config: { layers, canvasSize, viewport },
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render shapes ────────────────────────────────────────
  const renderShape = (l) => {
    const fillColor = l.transparentFill ? 'transparent' : (l.fill || '#6366f1');
    const common = {
      name: l.id, x: l.x, y: l.y, fill: fillColor,
      stroke: l.stroke || '', strokeWidth: l.strokeWidth || 0,
      rotation: l.rotation || 0, opacity: l.opacity ?? 1, draggable: true,
      onClick: () => setSelectedId(l.id), onTap: () => setSelectedId(l.id),
      onDragEnd: (e) => updateLayer(l.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) }),
      onTransformEnd: (e) => {
        const n = e.target;
        updateLayer(l.id, { x: Math.round(n.x()), y: Math.round(n.y()), w: Math.round((l.w || 100) * n.scaleX()), h: Math.round((l.h || 100) * n.scaleY()), rotation: n.rotation() });
        n.scaleX(1); n.scaleY(1);
      },
    };
    switch (l.shapeType) {
      case 'circle':   return <Circle key={l.id} {...common} radius={(l.w || 100) / 2} />;
      case 'triangle': return <RegularPolygon key={l.id} {...common} sides={3} radius={(l.w || 100) / 2} />;
      case 'star':     return <KonvaStar key={l.id} {...common} numPoints={5} innerRadius={(l.w||100)/4} outerRadius={(l.w||100)/2} />;
      default:         return <Rect key={l.id} {...common} width={l.w || 100} height={l.h || 100} />;
    }
  };

  return (
    <div className="advanced-designer" style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 2000, display: 'grid', gridTemplateColumns: '240px 1fr 260px', gridTemplateRows: '100vh', color: 'white' }}>

      {/* ── Left sidebar ── */}
      <div style={{ background: '#1e293b', borderRight: '1px solid #334155', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        <section>
          <h4 className="sidebar-title">Tên mẫu</h4>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Frame Name..." />
        </section>

        {/* Assets — drag to canvas */}
        <section>
          <h4 className="sidebar-title">Thư viện (Kéo sang Canvas)</h4>
          <FileUploadZone multiple={true} label="Tải ảnh lên" onFilesSelected={handleLibraryUpload} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
            {library.map(img => (
              <div key={img.id} draggable onDragStart={e => handleDragStart(e, 'library-image', img)}
                style={{ height: 60, border: '1px solid #334155', borderRadius: '0.25rem', overflow: 'hidden', cursor: 'grab' }}>
                {/* ✅ No crossOrigin needed — same-origin images */}
                <img src={img.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="asset" />
              </div>
            ))}
          </div>
        </section>

        {/* Tools */}
        <section>
          <h4 className="sidebar-title">Công cụ (Kéo sang Canvas)</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div draggable onDragStart={e => handleDragStart(e, 'text')} className="tool-card"><Type size={16} color="#fbbf24" /> Text Layer</div>
            <div draggable onDragStart={e => handleDragStart(e, 'label')} className="tool-card"><Tag size={16} color="#facc15" /> Tool Label</div>
            <div draggable onDragStart={e => handleDragStart(e, 'shape-rect')} className="tool-card"><Square size={16} color="#38bdf8" /> Rectangle</div>
            <div draggable onDragStart={e => handleDragStart(e, 'shape-circle')} className="tool-card"><CircleIcon size={16} color="#a78bfa" /> Circle</div>
            <div draggable onDragStart={e => handleDragStart(e, 'shape-triangle')} className="tool-card"><Triangle size={16} color="#fb923c" /> Triangle</div>
            <div draggable onDragStart={e => handleDragStart(e, 'shape-star')} className="tool-card"><Star size={16} color="#facc15" /> Star</div>
          </div>
        </section>

        {/* Layer list */}
        <section style={{ marginTop: 'auto' }}>
          <h4 className="sidebar-title">Layers</h4>
          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '0.3rem' }}>
            <button className={`list-item ${selectedId === 'viewport' ? 'active' : ''}`} onClick={() => setSelectedId('viewport')}>📐 Viewport</button>
            {layers.map(l => (
              <button key={l.id} className={`list-item ${selectedId === l.id ? 'active' : ''}`} onClick={() => setSelectedId(l.id)}>
                {l.type === 'text' ? '📝' : l.type === 'shape' ? '🔷' : '🖼️'} {l.label || l.text || l.shapeType || 'Image'}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── Canvas area ── */}
      <div ref={containerRef}
        style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}
        onMouseDown={handleMiddlePanStart} onMouseMove={handleMiddlePanMove}
        onMouseUp={handleMiddlePanEnd} onMouseLeave={handleMiddlePanEnd}>

        {/* Toolbar */}
        <div style={{ position: 'absolute', top: '1rem', background: '#1e293b', padding: '0.4rem 0.8rem', borderRadius: '2rem', display: 'flex', gap: '0.4rem', zIndex: 10, border: '1px solid #334155' }}>
          <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ opacity: canUndo ? 1 : 0.35 }}>↩</button>
          <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ opacity: canRedo ? 1 : 0.35 }}>↪</button>
          <div style={{ width: 1, background: '#334155' }} />
          <button className="tool-btn" onClick={() => setScale(s => Math.max(0.1, s - 0.1))}><ZoomOut size={16} /></button>
          <div style={{ minWidth: 42, textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{Math.round(scale * 100)}%</div>
          <button className="tool-btn" onClick={() => setScale(s => Math.min(3, s + 0.1))}><ZoomIn size={16} /></button>
          <button className="tool-btn" onClick={fitToScreen}><Maximize size={16} /></button>
          <div style={{ width: 1, background: '#334155' }} />
          <button className="tool-btn" onClick={() => moveLayer('up')}><ArrowUp size={16} /></button>
          <button className="tool-btn" onClick={() => moveLayer('down')}><ArrowDown size={16} /></button>
          <div style={{ width: 1, background: '#334155' }} />
          <button
            className="tool-btn"
            title={lockRatio ? 'Unlock ratio' : 'Lock ratio'}
            onClick={() => setLockRatio(v => !v)}
            style={{ color: lockRatio ? '#6366f1' : '#94a3b8' }}
          >
            {lockRatio ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>

        {/* ✅ Fixed layout: outer div has scaled dimensions */}
        <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          style={{ width: canvasSize.w * scale, height: canvasSize.h * scale, position: 'relative', transition: isPanning ? 'none' : 'none' }}>
          <div style={{ transform: `scale(${scale}) translate(${panOffset.x / scale}px, ${panOffset.y / scale}px)`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
            <Stage width={canvasSize.w} height={canvasSize.h} ref={stageRef}
              onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
              onTap={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}>
              <Layer>
                <Rect x={0} y={0} width={canvasSize.w} height={canvasSize.h} fill="#111" listening={false} />

                {/* Viewport box — always listening so it can be clicked to select */}
                <Rect name="viewport-rect"
                  x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h}
                  stroke={selectedId === 'viewport' ? '#10b981' : '#64748b'}
                  strokeWidth={selectedId === 'viewport' ? 2 : 1.5}
                  dash={[8, 4]} fill="transparent"
                  cornerRadius={viewport.cornerRadius || 0}
                  draggable={selectedId === 'viewport'}
                  listening={true}
                  onClick={() => setSelectedId('viewport')}
                  onTap={() => setSelectedId('viewport')}
                  onDragEnd={e => setViewport({ ...viewport, x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
                  onTransformEnd={e => {
                    const n = e.target;
                    setViewport({ ...viewport, x: Math.round(n.x()), y: Math.round(n.y()), w: Math.round(n.width() * n.scaleX()), h: Math.round(n.height() * n.scaleY()) });
                    n.scaleX(1); n.scaleY(1);
                  }}
                />

                {/* Layers */}
                {layers.map(l => {
                  if (l.type === 'image') return <DesignerImage key={l.id} data={l} onSelect={() => setSelectedId(l.id)} onChange={a => updateLayer(l.id, a)} />;
                  if (l.type === 'shape') return renderShape(l);
                  if (l.type === 'text') return (
                    <KonvaText key={l.id} name={l.id} x={l.x} y={l.y} text={l.text || l.placeholder || 'Text'}
                      fontSize={l.fontSize || 20} fill={l.fill || '#fff'} rotation={l.rotation || 0}
                      fontFamily={l.fontFamily || 'Inter'} fontStyle={l.fontStyle || 'normal'}
                      draggable onClick={() => setSelectedId(l.id)} onTap={() => setSelectedId(l.id)}
                      onDragEnd={e => updateLayer(l.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
                      onTransformEnd={e => { const n = e.target; updateLayer(l.id, { x: Math.round(n.x()), y: Math.round(n.y()), fontSize: Math.round(l.fontSize * n.scaleX()), rotation: n.rotation() }); n.scaleX(1); n.scaleY(1); }}
                    />
                  );
                  return null;
                })}

                {/* Viewport darkened mask */}
                <Group listening={false}>
                  <Rect x={0} y={0} width={canvasSize.w} height={viewport.y} fill="rgba(0,0,0,0.55)" />
                  <Rect x={0} y={viewport.y} width={viewport.x} height={viewport.h} fill="rgba(0,0,0,0.55)" />
                  <Rect x={viewport.x + viewport.w} y={viewport.y} width={canvasSize.w - viewport.x - viewport.w} height={viewport.h} fill="rgba(0,0,0,0.55)" />
                  <Rect x={0} y={viewport.y + viewport.h} width={canvasSize.w} height={canvasSize.h - viewport.y - viewport.h} fill="rgba(0,0,0,0.55)" />
                </Group>

                <Transformer ref={trRef} rotateEnabled keepRatio={lockRatio}
                  enabledAnchors={lockRatio
                    ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']}
                  borderStroke="#6366f1" anchorStroke="#6366f1" anchorFill="#fff" anchorSize={10} />
                <Transformer ref={vpTrRef} rotateEnabled={false} keepRatio={false}
                  enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                  borderStroke="#10b981" anchorStroke="#10b981" anchorFill="#fff" anchorSize={8} />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      {/* ── Right sidebar: Properties ── */}
      <div style={{ background: '#1e293b', borderLeft: '1px solid #334155', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Thuộc tính</h3>

        {selectedId === 'viewport' ? (
          /* ── Viewport ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <PropLabel>Tọa độ & Kích thước</PropLabel>
            <Grid2>
              <NumInput label="X" value={viewport.x} onChange={v => setViewport(p => ({ ...p, x: v }))} />
              <NumInput label="Y" value={viewport.y} onChange={v => setViewport(p => ({ ...p, y: v }))} />
              <NumInput label="W" value={viewport.w} onChange={v => setViewport(p => ({ ...p, w: v }))} />
              <NumInput label="H" value={viewport.h} onChange={v => setViewport(p => ({ ...p, h: v }))} />
            </Grid2>
            <NumInput label="Corner Radius" value={viewport.cornerRadius || 0} onChange={v => setViewport(p => ({ ...p, cornerRadius: v }))} />
          </div>

        ) : selectedId ? (() => {
          const layer = layers.find(l => l.id === selectedId);
          if (!layer) return null;
          const up = (attrs) => updateLayer(selectedId, attrs);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

              {/* ── Common: position ── */}
              <PropLabel>Position</PropLabel>
              <Grid2>
                <NumInput label="X" value={layer.x} onChange={v => up({ x: v })} />
                <NumInput label="Y" value={layer.y} onChange={v => up({ y: v })} />
              </Grid2>

              {/* ── Size (image & shape) ── */}
              {layer.type !== 'text' && (<>
                <PropLabel>Size</PropLabel>
                <Grid2>
                  <NumInput label="W" value={layer.w || 100} onChange={v => up({ w: v })} />
                  <NumInput label="H" value={layer.h || 100} onChange={v => up({ h: v })} />
                </Grid2>
              </>)}

              <NumInput label="Xoay (°)" value={layer.rotation || 0} step={1} integer={false} onChange={v => up({ rotation: v })} />

              {/* ══ TEXT ══ */}
              {layer.type === 'text' && (<>
                <Divider />
                <div>
                  <PropLabel>Tên Layer</PropLabel>
                  <input value={layer.label || ''} onChange={e => up({ label: e.target.value })} placeholder="Layer name in list..." />
                </div>
                <div>
                  <PropLabel>Nội dung</PropLabel>
                  <input value={layer.text || ''} onChange={e => up({ text: e.target.value })} placeholder="Default text..." />
                </div>
                {layer.subtype !== 'label' && (
                  <Toggle
                    label="Cho phép nhập"
                    value={!!layer.isEditable}
                    onChange={v => up({ isEditable: v })}
                  />
                )}
                {layer.isEditable && layer.subtype !== 'label' && (
                  <div>
                    <PropLabel>Gợi ý</PropLabel>
                    <input value={layer.placeholder || ''} onChange={e => up({ placeholder: e.target.value })} placeholder="Hiển thị khi trống..." />
                  </div>
                )}
                <Divider />
                <NumInput label="Cỡ chữ (px)" value={layer.fontSize || 20} onChange={v => up({ fontSize: v })} />
                <div>
                  <PropLabel>Font chữ</PropLabel>
                  <select value={layer.fontFamily || 'Inter'} onChange={e => up({ fontFamily: e.target.value })}>
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <PropLabel>Kiểu chữ</PropLabel>
                  <select value={layer.fontStyle || 'normal'} onChange={e => up({ fontStyle: e.target.value })}>
                    {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <ColorInput label="Màu chữ" value={layer.fill || '#ffffff'} onChange={v => up({ fill: v })} />
              </>)}

              {/* ══ SHAPE ══ */}
              {layer.type === 'shape' && (<>
                <Divider />
                <Toggle label="Transparent Fill" value={!!layer.transparentFill} onChange={v => up({ transparentFill: v })} />
                {!layer.transparentFill && <ColorInput label="Fill Color" value={layer.fill || '#6366f1'} onChange={v => up({ fill: v })} />}
                <ColorInput label="Stroke Color" value={layer.stroke || '#ffffff'} onChange={v => up({ stroke: v })} />
                <NumInput label="Stroke Width" value={layer.strokeWidth || 0} onChange={v => up({ strokeWidth: v })} />
                <NumInput label="Opacity (%)" value={Math.round((layer.opacity ?? 1) * 100)} min={0} max={100} onChange={v => up({ opacity: v / 100 })} />
              </>)}

              {/* ══ IMAGE ══ */}
              {layer.type === 'image' && (<>
                <Divider />
                <div>
                  <PropLabel>Source URL</PropLabel>
                  <input value={layer.url || ''} onChange={e => up({ url: e.target.value })} placeholder="Image URL..." style={{ fontSize: '0.72rem' }} />
                </div>
              </>)}

              <Divider />
              <button
                className="btn-outline"
                style={{ color: '#ef4444', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                onClick={deleteLayer}
              >
                <Trash2 size={14} /> Xóa Layer
              </button>
            </div>
          );
        })() : (
          /* ── Nothing selected ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <PropLabel>Kích thước Canvas</PropLabel>
            <Grid2>
              <NumInput label="W" value={canvasSize.w} onChange={v => setCanvasSize(c => ({ ...c, w: v }))} />
              <NumInput label="H" value={canvasSize.h} onChange={v => setCanvasSize(c => ({ ...c, h: v }))} />
            </Grid2>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.5rem' }}>
              Chọn vào layer trong canvas hoặc trong danh sách để chỉnh sửa thuộc tính.
            </p>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={handleSaveAll} disabled={saving} style={{ padding: '0.8rem' }}>
            <Save size={18} /> {saving ? 'Đang lưu...' : 'Lưu Template'}
          </button>
          <button className="btn-outline" onClick={onCancel}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/* ── Small reusable UI atoms ─────────────────────────────── */
const propLabelStyle = { fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem', display: 'block' };
const PropLabel = ({ children }) => <span style={propLabelStyle}>{children}</span>;
const Divider   = () => <div style={{ height: 1, background: '#334155', margin: '0.1rem 0' }} />;
const Grid2     = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>{children}</div>;

function NumInput({ label, value, onChange, min, max, step = 1, integer = true }) {
  return (
    <div>
      <PropLabel>{label}</PropLabel>
      <input
        type="number" min={min} max={max} step={step}
        value={value ?? 0}
        onChange={e => {
          const v = integer ? (parseInt(e.target.value) || 0) : (parseFloat(e.target.value) || 0);
          onChange(v);
        }}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <div>
      <PropLabel>{label}</PropLabel>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 32, border: 'none', borderRadius: '0.25rem', cursor: 'pointer', background: 'none', padding: 0 }} />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder="#ffffff" />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <PropLabel style={{ margin: 0 }}>{label}</PropLabel>
      <button
        onClick={() => onChange(!value)}
        style={{
          background: value ? '#6366f1' : '#334155', border: 'none',
          borderRadius: '1rem', padding: '0.2rem 0.7rem',
          color: 'white', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
        }}
      >{value ? 'ON' : 'OFF'}</button>
    </div>
  );
}

function parseConfig(template) {
  if (!template?.config) return {};
  return typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
}

function DesignerImage({ data, onSelect, onChange }) {
  // ✅ No crossOrigin='anonymous' — same-origin, avoids CORS canvas taint
  const [img] = useImage(data.url || '');
  return (
    <KonvaImage image={img} name={data.id} x={data.x} y={data.y} width={data.w} height={data.h} rotation={data.rotation || 0}
      draggable onClick={onSelect} onTap={onSelect}
      onDragEnd={e => onChange({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
      onTransformEnd={e => { const n = e.target; onChange({ x: Math.round(n.x()), y: Math.round(n.y()), w: Math.round(n.width() * n.scaleX()), h: Math.round(n.height() * n.scaleY()), rotation: n.rotation() }); n.scaleX(1); n.scaleY(1); }}
    />
  );
}

export default TemplateDesigner;
