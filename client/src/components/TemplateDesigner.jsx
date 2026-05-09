import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, RegularPolygon, Star as KonvaStar, Transformer, Text as KonvaText, Group } from 'react-konva';
import useImage from 'use-image';
import axios from 'axios';
import { Type, Square, Trash2, Circle as CircleIcon, Triangle, Star, Save, Maximize, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Tag } from 'lucide-react';
import FileUploadZone from './FileUploadZone';

const FONTS = ['Inter','Roboto','Montserrat','Playfair Display','Lora','Open Sans'];
const STYLES = ['normal','bold','italic','bold italic'];

function TemplateDesigner({ initialTemplate, onSave, onCancel }) {
  const [name, setName] = useState(initialTemplate?.name || '');
  const [library, setLibrary] = useState([]);
  const [layers, setLayers] = useState(() => {
    if (initialTemplate?.config) {
      const cfg = typeof initialTemplate.config === 'string' ? JSON.parse(initialTemplate.config) : initialTemplate.config;
      return cfg.layers || [];
    }
    return [];
  });
  const [viewport, setViewport] = useState(() => {
    if (initialTemplate?.config) {
      const cfg = typeof initialTemplate.config === 'string' ? JSON.parse(initialTemplate.config) : initialTemplate.config;
      if (cfg.viewport) return cfg.viewport;
      if (cfg.canvasSize) return { x: 0, y: 0, w: cfg.canvasSize.w, h: cfg.canvasSize.h, cornerRadius: 0 };
    }
    return { x: 0, y: 0, w: 800, h: 800, cornerRadius: 0 };
  });
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState(() => {
    if (initialTemplate?.config) {
      const cfg = typeof initialTemplate.config === 'string' ? JSON.parse(initialTemplate.config) : initialTemplate.config;
      return cfg.canvasSize || { w: 800, h: 800 };
    }
    return { w: 800, h: 800 };
  });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const stageRef = useRef();
  const trRef = useRef();
  const vpTrRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    if (initialTemplate?.background_path) {
      const img = new window.Image();
      img.src = initialTemplate.background_path;
      img.onload = () => setCanvasSize({ w: img.width, h: img.height });
    }
  }, [initialTemplate]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    setScale(Math.min((c.offsetWidth - 60) / canvasSize.w, (c.offsetHeight - 60) / canvasSize.h, 1));
    setPanOffset({ x: 0, y: 0 });
  }, [canvasSize]);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => { e.preventDefault(); setScale(s => Math.min(3, Math.max(0.1, s + (e.deltaY > 0 ? -0.05 : 0.05)))); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMiddlePanStart = (e) => { if (e.button === 1 || e.altKey) { setIsPanning(true); panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }; } };
  const handleMiddlePanMove = (e) => { if (isPanning) setPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }); };
  const handleMiddlePanEnd = () => setIsPanning(false);

  const handleDragStart = (e, type, data = {}) => { e.dataTransfer.setData('type', type); if (data) e.dataTransfer.setData('data', JSON.stringify(data)); };

  const handleDrop = (e) => {
    e.preventDefault();
    stageRef.current.setPointersPositions(e);
    const pos = stageRef.current.getRelativePointerPosition();
    const type = e.dataTransfer.getData('type');
    const data = e.dataTransfer.getData('data') ? JSON.parse(e.dataTransfer.getData('data')) : null;
    
    if (type === 'text' || type === 'label') {
      const nl = { 
        id:'text-'+Date.now(), type:'text', 
        text: type === 'label' ? 'Label Name' : 'Text', 
        placeholder:'Nhập text...', x:Math.round(pos.x), y:Math.round(pos.y), 
        fontSize:type === 'label' ? 24 : 30, 
        fill: type === 'label' ? '#fbbf24' : '#ffffff', 
        fontFamily:'Inter', fontStyle:'bold', rotation:0, 
        label: type === 'label' ? 'Label' : 'Text Field', 
        isEditable:true 
      };
      setLayers(prev => [...prev, nl]); setSelectedId(nl.id);
    } else if (type === 'library-image' && data) {
      const nl = { id:'img-'+Date.now(), type:'image', url:data.url, label:'Image', x:Math.round(pos.x), y:Math.round(pos.y), w:200, h:200, rotation:0 };
      setLayers(prev => [...prev, nl]); setSelectedId(nl.id);
    } else if (type?.startsWith('shape-')) {
      const nl = { id:'shape-'+Date.now(), type:'shape', shapeType:type.replace('shape-',''), label:'Shape', x:Math.round(pos.x), y:Math.round(pos.y), w:120, h:120, fill:'#6366f1', stroke:'#ffffff', strokeWidth:0, rotation:0, opacity:1, transparentFill:false };
      setLayers(prev => [...prev, nl]); setSelectedId(nl.id);
    }
  };

  const updateLayer = (id, attrs) => setLayers(prev => prev.map(l => l.id === id ? { ...l, ...attrs } : l));
  const moveLayer = (dir) => { const idx = layers.findIndex(l => l.id === selectedId); if (idx === -1) return; const nl = [...layers]; if (dir === 'up' && idx < nl.length - 1) [nl[idx], nl[idx+1]] = [nl[idx+1], nl[idx]]; else if (dir === 'down' && idx > 0) [nl[idx], nl[idx-1]] = [nl[idx-1], nl[idx]]; setLayers(nl); };
  const deleteLayer = () => { if (!selectedId) return; setLayers(prev => prev.filter(l => l.id !== selectedId)); setSelectedId(null); };

  const handleLibraryUpload = async (files) => {
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData(); fd.append('asset', f);
        const res = await axios.post('/api/upload-asset', fd);
        setLibrary(prev => [...prev, { id: Math.random().toString(36).substr(2,9), url: res.data.url, name: f.name }]);
      } catch { setLibrary(prev => [...prev, { id: Math.random().toString(36).substr(2,9), url: URL.createObjectURL(f), name: f.name }]); }
    }
  };

  useEffect(() => {
    if (trRef.current && stageRef.current) {
      if (selectedId && selectedId !== 'viewport') {
        const nodes = stageRef.current.find('.' + selectedId);
        trRef.current.nodes(nodes);
      } else { trRef.current.nodes([]); }
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, layers]);

  useEffect(() => {
    if (vpTrRef.current && stageRef.current) {
      if (selectedId === 'viewport') {
        const nodes = stageRef.current.find('.viewport-rect');
        vpTrRef.current.nodes(nodes);
      } else { vpTrRef.current.nodes([]); }
      vpTrRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, viewport]);

  const handleSaveAll = () => { onSave({ name, files: { background: null, overlay: null }, config: { layers, canvasSize, viewport } }); };

  const renderShape = (l) => {
    const fillColor = l.transparentFill ? 'transparent' : (l.fill || '#6366f1');
    const common = { name: l.id, x: l.x, y: l.y, fill: fillColor, stroke: l.stroke || '', strokeWidth: l.strokeWidth || 0, rotation: l.rotation || 0, opacity: l.opacity ?? 1, draggable: true,
      onClick: () => setSelectedId(l.id), onTap: () => setSelectedId(l.id),
      onDragEnd: (e) => updateLayer(l.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) }),
      onTransformEnd: (e) => { const n = e.target; updateLayer(l.id, { x: Math.round(n.x()), y: Math.round(n.y()), w: Math.round((l.w||100)*n.scaleX()), h: Math.round((l.h||100)*n.scaleY()), rotation: n.rotation() }); n.scaleX(1); n.scaleY(1); }
    };
    switch(l.shapeType) {
      case 'circle': return <Circle key={l.id} {...common} radius={(l.w||100)/2} />;
      case 'triangle': return <RegularPolygon key={l.id} {...common} sides={3} radius={(l.w||100)/2} />;
      case 'star': return <KonvaStar key={l.id} {...common} numPoints={5} innerRadius={(l.w||100)/4} outerRadius={(l.w||100)/2} />;
      default: return <Rect key={l.id} {...common} width={l.w||100} height={l.h||100} />;
    }
  };

  return (
    <div className="advanced-designer" style={{ position:'fixed', inset:0, background:'#0f172a', zIndex:2000, display:'grid', gridTemplateColumns:'260px 1fr 280px', color:'white' }}>
      <div style={{ background:'#1e293b', borderRight:'1px solid #334155', padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem', overflowY:'auto' }}>
        <section><h4 className="sidebar-title">Template Name</h4><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Frame Name..." /></section>
        <section>
          <h4 className="sidebar-title">Assets (Drag to Canvas)</h4>
          <FileUploadZone multiple={true} label="Upload Images" onFilesSelected={handleLibraryUpload} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginTop:'0.75rem' }}>
            {library.map(img => (<div key={img.id} draggable onDragStart={e => handleDragStart(e,'library-image',img)} className="asset-thumb" style={{ height:60, border:'1px solid #334155', borderRadius:'0.25rem', overflow:'hidden' }}><img src={img.url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="asset" /></div>))}
          </div>
        </section>
        <section>
          <h4 className="sidebar-title">Tools (Drag to Canvas)</h4>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
            <div draggable onDragStart={e => handleDragStart(e,'text')} className="tool-card"><Type size={16} color="#fbbf24" /> Text Layer</div>
            <div draggable onDragStart={e => handleDragStart(e,'label')} className="tool-card"><Tag size={16} color="#facc15" /> Tool Label</div>
            <div draggable onDragStart={e => handleDragStart(e,'shape-rect')} className="tool-card"><Square size={16} color="#38bdf8" /> Rectangle</div>
            <div draggable onDragStart={e => handleDragStart(e,'shape-circle')} className="tool-card"><CircleIcon size={16} color="#a78bfa" /> Circle</div>
            <div draggable onDragStart={e => handleDragStart(e,'shape-triangle')} className="tool-card"><Triangle size={16} color="#fb923c" /> Triangle</div>
            <div draggable onDragStart={e => handleDragStart(e,'shape-star')} className="tool-card"><Star size={16} color="#facc15" /> Star</div>
          </div>
        </section>
        <section style={{ marginTop:'auto' }}>
          <h4 className="sidebar-title">Layers</h4>
          <div style={{ display:'flex', flexDirection:'column-reverse', gap:'0.3rem' }}>
            <button className={`list-item ${selectedId==='viewport'?'active':''}`} onClick={() => setSelectedId('viewport')}>📐 Viewport</button>
            {layers.map(l => (<button key={l.id} className={`list-item ${selectedId===l.id?'active':''}`} onClick={() => setSelectedId(l.id)}>
              {l.type==='text'?'📝':l.type==='shape'?'🔷':'🖼️'} {l.label||l.text||l.shapeType||'Image'}
            </button>))}
          </div>
        </section>
      </div>

      <div ref={containerRef} style={{ position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0a' }}
        onMouseDown={handleMiddlePanStart} onMouseMove={handleMiddlePanMove} onMouseUp={handleMiddlePanEnd} onMouseLeave={handleMiddlePanEnd}>
        <div style={{ position:'absolute', top:'1rem', background:'#1e293b', padding:'0.4rem', borderRadius:'2rem', display:'flex', gap:'0.4rem', zIndex:10, border:'1px solid #334155' }}>
          <button className="tool-btn" onClick={() => setScale(s => Math.max(0.1,s-0.1))}><ZoomOut size={16}/></button>
          <div style={{ minWidth:45, textAlign:'center', fontSize:'0.75rem', fontWeight:'600' }}>{Math.round(scale*100)}%</div>
          <button className="tool-btn" onClick={() => setScale(s => Math.min(3,s+0.1))}><ZoomIn size={16}/></button>
          <button className="tool-btn" onClick={fitToScreen}><Maximize size={16}/></button>
          <div style={{ width:1, background:'#334155' }}></div>
          <button className="tool-btn" onClick={() => moveLayer('up')}><ArrowUp size={16}/></button>
          <button className="tool-btn" onClick={() => moveLayer('down')}><ArrowDown size={16}/></button>
        </div>
        <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          style={{ transform:`scale(${scale}) translate(${panOffset.x/scale}px, ${panOffset.y/scale}px)`, transition: isPanning?'none':'transform 0.1s', background:'#1a1a2e', boxShadow:'0 0 60px rgba(0,0,0,0.5)' }}>
          <Stage width={canvasSize.w} height={canvasSize.h} ref={stageRef}
            onMouseDown={e => { if(e.target===e.target.getStage()) setSelectedId(null); }}
            onTap={e => { if(e.target===e.target.getStage()) setSelectedId(null); }}>
            <Layer>
              <Rect x={0} y={0} width={canvasSize.w} height={canvasSize.h} fill="#111" listening={false} />
              <Rect name="viewport-rect" x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h}
                stroke="#10b981" strokeWidth={2} dash={[8,4]} fill="transparent" cornerRadius={viewport.cornerRadius || 0}
                draggable={selectedId==='viewport'} listening={selectedId==='viewport'}
                onClick={() => setSelectedId('viewport')} onTap={() => setSelectedId('viewport')}
                onDragEnd={e => setViewport({...viewport, x:Math.round(e.target.x()), y:Math.round(e.target.y())})}
                onTransformEnd={e => { const n=e.target; setViewport({ ...viewport, x:Math.round(n.x()), y:Math.round(n.y()), w:Math.round(n.width()*n.scaleX()), h:Math.round(n.height()*n.scaleY()) }); n.scaleX(1); n.scaleY(1); }}
              />
              {layers.map(l => {
                if (l.type==='image') return <DesignerImage key={l.id} data={l} onSelect={() => setSelectedId(l.id)} onChange={a => updateLayer(l.id,a)} />;
                if (l.type==='shape') return renderShape(l);
                if (l.type==='text') return (
                  <KonvaText key={l.id} name={l.id} x={l.x} y={l.y} text={l.text||l.placeholder||'Text'}
                    fontSize={l.fontSize||20} fill={l.fill||'#fff'} rotation={l.rotation||0}
                    fontFamily={l.fontFamily||'Inter'} fontStyle={l.fontStyle||'normal'}
                    draggable onClick={() => setSelectedId(l.id)} onTap={() => setSelectedId(l.id)}
                    onDragEnd={e => updateLayer(l.id, { x:Math.round(e.target.x()), y:Math.round(e.target.y()) })}
                    onTransformEnd={e => { const n=e.target; updateLayer(l.id, { x:Math.round(n.x()), y:Math.round(n.y()), fontSize:Math.round(l.fontSize*n.scaleX()), rotation:n.rotation() }); n.scaleX(1); n.scaleY(1); }}
                  />);
                return null;
              })}
              <Group listening={false}>
                <Rect x={0} y={0} width={canvasSize.w} height={viewport.y} fill="rgba(0,0,0,0.55)" />
                <Rect x={0} y={viewport.y} width={viewport.x} height={viewport.h} fill="rgba(0,0,0,0.55)" />
                <Rect x={viewport.x+viewport.w} y={viewport.y} width={canvasSize.w-viewport.x-viewport.w} height={viewport.h} fill="rgba(0,0,0,0.55)" />
                <Rect x={0} y={viewport.y+viewport.h} width={canvasSize.w} height={canvasSize.h-viewport.y-viewport.h} fill="rgba(0,0,0,0.55)" />
              </Group>
              <Transformer ref={trRef} rotateEnabled={true} keepRatio={false} borderStroke="#6366f1" anchorStroke="#6366f1" anchorFill="#fff" anchorSize={8} />
              <Transformer ref={vpTrRef} rotateEnabled={false} keepRatio={false} borderStroke="#10b981" anchorStroke="#10b981" anchorFill="#fff" anchorSize={8} />
            </Layer>
          </Stage>
        </div>
      </div>

      <div style={{ background:'#1e293b', borderLeft:'1px solid #334155', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem', overflowY:'auto' }}>
        <h3 style={{ fontSize:'1rem' }}>Properties</h3>
        {selectedId === 'viewport' ? (
          <div className="prop-section">
            <label className="prop-label">Viewport</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              <div><label className="prop-label">X</label><input type="number" value={viewport.x} onChange={e => setViewport({...viewport, x:parseInt(e.target.value)||0})} /></div>
              <div><label className="prop-label">Y</label><input type="number" value={viewport.y} onChange={e => setViewport({...viewport, y:parseInt(e.target.value)||0})} /></div>
              <div><label className="prop-label">Width</label><input type="number" value={viewport.w} onChange={e => setViewport({...viewport, w:parseInt(e.target.value)||100})} /></div>
              <div><label className="prop-label">Height</label><input type="number" value={viewport.h} onChange={e => setViewport({...viewport, h:parseInt(e.target.value)||100})} /></div>
            </div>
            <div style={{ marginTop:'0.5rem' }}><label className="prop-label">Corner Radius</label><input type="number" value={viewport.cornerRadius||0} onChange={e => setViewport({...viewport, cornerRadius:parseInt(e.target.value)||0})} /></div>
          </div>
        ) : selectedId ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <button className="btn-outline" style={{ color:'#ef4444' }} onClick={deleteLayer}><Trash2 size={14}/> Remove Layer</button>
          </div>
        ) : null}
        <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <button className="btn-primary" onClick={handleSaveAll} style={{ padding:'0.8rem' }}><Save size={18}/> Save Template</button>
          <button className="btn-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DesignerImage({ data, onSelect, onChange }) {
  const [img] = useImage(data.url, 'anonymous');
  return (<KonvaImage image={img} name={data.id} x={data.x} y={data.y} width={data.w} height={data.h} rotation={data.rotation||0}
    draggable onClick={onSelect} onTap={onSelect}
    onDragEnd={e => onChange({ x:Math.round(e.target.x()), y:Math.round(e.target.y()) })}
    onTransformEnd={e => { const n=e.target; onChange({ x:Math.round(n.x()), y:Math.round(n.y()), w:Math.round(n.width()*n.scaleX()), h:Math.round(n.height()*n.scaleY()), rotation:n.rotation() }); n.scaleX(1); n.scaleY(1); }}
  />);
}

export default TemplateDesigner;
