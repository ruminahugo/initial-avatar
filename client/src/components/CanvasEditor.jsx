import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, RegularPolygon, Star, Transformer, Text as KonvaText } from 'react-konva';
import useImage from 'use-image';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

function CanvasEditor({ template, avatarImage, avatarState, onStateChange, stageRef }) {
  const config = template.config ? (typeof template.config === 'string' ? JSON.parse(template.config) : template.config) : {};
  const layers = config.layers || [];
  const viewport = config.viewport || config.canvasSize || { x: 0, y: 0, w: 800, h: 800, cornerRadius: 0 };
  const vw = viewport.w || 800;
  const vh = viewport.h || 800;

  const [displayScale, setDisplayScale] = useState(1);
  const lastTouchRef = useRef({ dist: 0, angle: 0 });
  const containerRef = useRef();
  const wrapperRef = useRef();
  
  // Refs for user image manipulation
  const avatarRef = useRef();
  const trRef = useRef();

  const [bgImg] = useImage(template.background_path ? `/${template.background_path}` : null, 'anonymous');
  const [ovImg] = useImage(template.overlay_path ? `/${template.overlay_path}` : null, 'anonymous');
  const [userImg] = useImage(avatarImage || '', 'anonymous');

  useEffect(() => {
    fitToContainer();
    window.addEventListener('resize', fitToContainer);
    return () => window.removeEventListener('resize', fitToContainer);
  }, [vw, vh]);

  const fitToContainer = () => {
    if (!wrapperRef.current) return;
    const maxW = wrapperRef.current.offsetWidth - 40;
    const maxH = window.innerHeight * 0.7;
    setDisplayScale(Math.min(maxW / vw, maxH / vh, 1));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e) => { if (e.touches?.length > 1) e.preventDefault(); };
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('touchstart', prevent, { passive: false });
    const onWheel = (e) => { 
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setDisplayScale(s => Math.min(4, Math.max(0.1, s + (e.deltaY > 0 ? -0.1 : 0.1)))); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { 
      el.removeEventListener('touchmove', prevent); el.removeEventListener('touchstart', prevent); el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Attach transformer to avatar when image is loaded
  useEffect(() => {
    if (avatarRef.current && trRef.current && userImg) {
      trRef.current.nodes([avatarRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [userImg]);

  const getDistance = (p1, p2) => Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  const getAngle = (p1, p2) => Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

  const handleTouchStart = (e) => {
    const touches = e.evt.touches;
    if (touches.length === 2) {
      const p1 = { x: touches[0].clientX, y: touches[0].clientY };
      const p2 = { x: touches[1].clientX, y: touches[1].clientY };
      lastTouchRef.current = { 
        dist: getDistance(p1, p2), angle: getAngle(p1, p2), 
        startScaleX: avatarState.scaleX || 1, startScaleY: avatarState.scaleY || 1, startRotation: avatarState.rotation || 0 
      };
    }
  };

  const handleTouchMove = (e) => {
    const touches = e.evt.touches;
    if (touches.length === 2) {
      e.evt.preventDefault();
      const p1 = { x: touches[0].clientX, y: touches[0].clientY };
      const p2 = { x: touches[1].clientX, y: touches[1].clientY };
      const last = lastTouchRef.current;
      const sf = getDistance(p1, p2) / last.dist;
      const ad = getAngle(p1, p2) - last.angle;
      onStateChange({ ...avatarState, scaleX: (last.startScaleX || 1) * sf, scaleY: (last.startScaleY || 1) * sf, rotation: (last.startRotation || 0) + ad });
    }
  };

  const userX = (avatarState.x ?? 0) - (viewport.x || 0);
  const userY = (avatarState.y ?? 0) - (viewport.y || 0);

  return (
    <div ref={wrapperRef} style={{ width: '100%', display:'flex', flexDirection:'column', alignItems:'center' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.5rem', background:'var(--bg-card)', padding:'0.5rem 1.2rem', borderRadius:'2rem', border:'1px solid var(--border)', boxShadow:'var(--shadow)' }}>
        <button className="tool-btn" onClick={() => setDisplayScale(s => Math.max(0.1, s - 0.2))}><ZoomOut size={18} /></button>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', minWidth:45, textAlign:'center' }}>{Math.round(displayScale * 100)}%</span>
        <button className="tool-btn" onClick={() => setDisplayScale(s => Math.min(4, s + 0.2))}><ZoomIn size={18} /></button>
        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 0.4rem' }}></div>
        <button className="tool-btn" onClick={fitToContainer} title="Fit to Screen"><Maximize size={18} /></button>
      </div>

      <div
        ref={containerRef}
        style={{ touchAction: 'none', width:'100%', display: 'flex', justifyContent: 'center', overflow:'auto', minHeight: '300px' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith('image/')) onStateChange({ ...avatarState, file, dropUrl: URL.createObjectURL(file) });
        }}
      >
        <div style={{ transform: `scale(${displayScale})`, transformOrigin: 'top center', transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <Stage width={vw} height={vh}
            style={{ background: '#000', borderRadius: `${(viewport.cornerRadius || 0) * displayScale}px`, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}
            ref={stageRef}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}
          >
            <Layer clipFunc={(ctx) => {
              const r = viewport.cornerRadius || 0;
              if (r > 0) {
                ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(vw - r, 0); ctx.quadraticCurveTo(vw, 0, vw, r);
                ctx.lineTo(vw, vh - r); ctx.quadraticCurveTo(vw, vh, vw - r, vh); ctx.lineTo(r, vh);
                ctx.quadraticCurveTo(0, vh, 0, vh - r); ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath();
              } else { ctx.rect(0, 0, vw, vh); }
            }}>
              {/* 1. User image at bottom */}
              {userImg && (
                <KonvaImage ref={avatarRef} image={userImg} x={userX} y={userY}
                  width={userImg.width} height={userImg.height} 
                  scaleX={avatarState.scaleX || 1} scaleY={avatarState.scaleY || 1}
                  rotation={avatarState.rotation || 0} draggable
                  onDragEnd={e => onStateChange({ ...avatarState, x: e.target.x() + (viewport.x || 0), y: e.target.y() + (viewport.y || 0) })}
                  onTransformEnd={e => {
                    const n = e.target;
                    onStateChange({ ...avatarState, x: n.x() + (viewport.x || 0), y: n.y() + (viewport.y || 0), scaleX: n.scaleX(), scaleY: n.scaleY(), rotation: n.rotation() });
                  }}
                />
              )}

              {/* 2. Template layers */}
              {bgImg && <KonvaImage image={bgImg} x={-(viewport.x || 0)} y={-(viewport.y || 0)} listening={false} />}
              {layers.map((l) => {
                const ox = l.x - (viewport.x || 0); const oy = l.y - (viewport.y || 0);
                if (l.type === 'image') return <CanvasImage key={l.id} data={{ ...l, x: ox, y: oy }} />;
                if (l.type === 'shape') return <CanvasShape key={l.id} data={{ ...l, x: ox, y: oy }} />;
                if (l.type === 'text') {
                  const ut = avatarState.texts?.[l.id]; const has = ut && ut.length > 0;
                  return (
                    <KonvaText key={l.id} x={ox} y={oy} text={l.isEditable ? (has ? ut : (l.placeholder || l.text || '')) : (l.text || '')}
                      fontSize={l.fontSize || 20} fill={l.fill || '#ffffff'} opacity={1}
                      rotation={l.rotation || 0} fontFamily={l.fontFamily || 'Inter'} fontStyle={l.fontStyle || 'normal'} listening={false} 
                    />
                  );
                }
                return null;
              })}
              {ovImg && <KonvaImage image={ovImg} x={-(viewport.x || 0)} y={-(viewport.y || 0)} listening={false} />}

              {/* 3. TRANSFORMER ON TOP so user can always drag/zoom their own image */}
              {userImg && (
                <Transformer ref={trRef} keepRatio={true} rotateEnabled={true} 
                  borderStroke="#6366f1" anchorStroke="#6366f1" anchorFill="#ffffff" anchorSize={10} 
                />
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}

function CanvasImage({ data }) {
  const [img] = useImage(data.url, 'anonymous');
  return img ? <KonvaImage image={img} x={data.x} y={data.y} width={data.w} height={data.h} rotation={data.rotation || 0} listening={false} /> : null;
}

function CanvasShape({ data }) {
  const fillColor = data.transparentFill ? 'transparent' : (data.fill || '#6366f1');
  const props = { x: data.x, y: data.y, fill: fillColor, stroke: data.stroke || '', strokeWidth: data.strokeWidth || 0, rotation: data.rotation || 0, opacity: data.opacity ?? 1, listening: false };
  switch (data.shapeType) {
    case 'circle': return <Circle {...props} radius={(data.w || 100) / 2} />;
    case 'triangle': return <RegularPolygon {...props} sides={3} radius={(data.w || 100) / 2} />;
    case 'star': return <Star {...props} numPoints={5} innerRadius={(data.w || 100) / 4} outerRadius={(data.w || 100) / 2} />;
    default: return <Rect {...props} width={data.w || 100} height={data.h || 100} />;
  }
}

export default CanvasEditor;
