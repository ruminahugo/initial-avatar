import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, RegularPolygon, Star, Transformer, Text as KonvaText } from 'react-konva';
import useImage from 'use-image';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// Extra space around the viewport so Transformer handles are visible outside the clip
export const CANVAS_OVERFLOW_PAD = 72;

function CanvasEditor({ template, avatarImage, avatarState, onStateChange, stageRef, onDimensionsChange, lockRatio = true, skipAutoCenter }) {
  const config = template.config
    ? (typeof template.config === 'string' ? JSON.parse(template.config) : template.config)
    : {};
  const layers = config.layers || [];
  const viewport = config.viewport || config.canvasSize || { x: 0, y: 0, w: 800, h: 800, cornerRadius: 0 };
  const vw = viewport.w || 800;
  const vh = viewport.h || 800;

  const PAD = CANVAS_OVERFLOW_PAD;
  const stageW = vw + PAD * 2;
  const stageH = vh + PAD * 2;

  const [displayScale, setDisplayScale] = useState(1);
  const [avatarSelected, setAvatarSelected] = useState(false);

  const pinchRef = useRef({ active: false, startDist: 0 });
  const prevAvatarUrl = useRef(null);
  const wrapperRef = useRef();
  const avatarRef = useRef();
  const trRef = useRef();    // in unclipped layer — shows outside viewport
  const trLayer2Ref = useRef();

  const [bgImg] = useImage(template.background_path || '');
  const [ovImg] = useImage(template.overlay_path || '');
  const [userImg] = useImage(avatarImage || '');

  // ── Fit canvas to container ────────────────────────────
  const fitToContainer = useCallback(() => {
    if (!wrapperRef.current) return;
    const maxW = wrapperRef.current.offsetWidth - 16;
    const maxH = window.innerHeight * 0.52;
    // Scale based on viewport content, not the padded stage
    setDisplayScale(Math.min(maxW / stageW, maxH / stageH, 1));
  }, [stageW, stageH]);

  useEffect(() => {
    fitToContainer();
    window.addEventListener('resize', fitToContainer);
    return () => window.removeEventListener('resize', fitToContainer);
  }, [fitToContainer]);

  // ── Auto-center & fit image when a new one is loaded ───
  useEffect(() => {
    if (!userImg || !avatarImage) return;
    if (prevAvatarUrl.current === avatarImage) return; // already handled
    prevAvatarUrl.current = avatarImage;

    // Notify parent of natural dimensions for the properties panel
    onDimensionsChange?.({ w: userImg.width, h: userImg.height });

    // ✅ Skip auto-center when position is already set (e.g. restored from localStorage)
    if (skipAutoCenter?.current) {
      skipAutoCenter.current = false; // consume the flag — only skip once
      setAvatarSelected(true);
      return;
    }

    // Fit & center inside viewport (only for genuinely new images)
    const scale = Math.min(viewport.w / userImg.width, viewport.h / userImg.height, 1);
    const x = (viewport.x || 0) + (viewport.w - userImg.width * scale) / 2;
    const y = (viewport.y || 0) + (viewport.h - userImg.height * scale) / 2;
    onStateChange({
      ...avatarState,
      x, y,
      scaleX: scale,
      scaleY: scale,
      rotation: 0,
      _default: { x, y, scaleX: scale, scaleY: scale, rotation: 0 },
    });
    setAvatarSelected(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userImg, avatarImage]);

  // ── Transformer: Layer 2 (unclipped) ──────────────────
  useEffect(() => {
    if (!trRef.current) return;
    trRef.current.nodes(avatarSelected && avatarRef.current && userImg ? [avatarRef.current] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [avatarSelected, userImg]);

  useEffect(() => {
    if (userImg) setAvatarSelected(true);
  }, [userImg]);

  // ── Ctrl+wheel: zoom canvas view ───────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setDisplayScale(s => Math.min(4, Math.max(0.1, s + (e.deltaY > 0 ? -0.1 : 0.1))));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Pinch-to-zoom canvas view (mobile) ─────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const getDist = (a, b) => Math.sqrt((b.clientX - a.clientX) ** 2 + (b.clientY - a.clientY) ** 2);
    let startScale = displayScale;
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        startScale = displayScale;
        pinchRef.current = { active: true, startDist: getDist(e.touches[0], e.touches[1]) };
      }
    };
    const onTouchMove = (e) => {
      if (pinchRef.current.active && e.touches.length === 2) {
        e.preventDefault();
        const ratio = getDist(e.touches[0], e.touches[1]) / pinchRef.current.startDist;
        setDisplayScale(Math.min(4, Math.max(0.1, startScale * ratio)));
      }
    };
    const onTouchEnd = () => { pinchRef.current.active = false; };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayScale]);

  // Offset avatar coordinates into padded stage space
  const userX = (avatarState.x ?? 0) - (viewport.x || 0) + PAD;
  const userY = (avatarState.y ?? 0) - (viewport.y || 0) + PAD;
  const bgX   = -(viewport.x || 0) + PAD;
  const bgY   = -(viewport.y || 0) + PAD;

  const handleStageDown = (e) => {
    if (e.target === e.target.getStage()) setAvatarSelected(false);
  };

  // Clip function for the content layer — viewport shape with correct offset
  const makeClipFunc = (ctx) => {
    const r = Math.min(viewport.cornerRadius || 0, vw / 2, vh / 2);
    const x = PAD, y = PAD;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + vw - r, y);
    ctx.arcTo(x + vw, y,        x + vw, y + r,      r);
    ctx.lineTo(x + vw, y + vh - r);
    ctx.arcTo(x + vw, y + vh,   x + vw - r, y + vh, r);
    ctx.lineTo(x + r, y + vh);
    ctx.arcTo(x,      y + vh,   x, y + vh - r,       r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,      y,        x + r, y,             r);
    ctx.closePath();
  };

  return (
    <div ref={wrapperRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Zoom toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', background: 'var(--bg-card)', padding: '0.35rem 0.9rem', borderRadius: '2rem', border: '1px solid var(--border)' }}>
        <button className="tool-btn" onClick={() => setDisplayScale(s => Math.max(0.1, +(s - 0.15).toFixed(2)))}><ZoomOut size={16} /></button>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{Math.round(displayScale * 100)}%</span>
        <button className="tool-btn" onClick={() => setDisplayScale(s => Math.min(4, +(s + 0.15).toFixed(2)))}><ZoomIn size={16} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button className="tool-btn" onClick={fitToContainer} title="Fit"><Maximize size={16} /></button>
      </div>

      {/* Canvas wrapper — outer div sets layout size; inner div applies scale */}
      <div
        style={{ width: stageW * displayScale, height: stageH * displayScale, position: 'relative', flexShrink: 0, touchAction: 'none' }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith('image/'))
            onStateChange({ ...avatarState, file, dropUrl: URL.createObjectURL(file) });
        }}
      >
        <div style={{ transform: `scale(${displayScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
          <Stage
            width={stageW}
            height={stageH}
            style={{ background: '#0a0a0a', display: 'block' }}
            ref={stageRef}
            onMouseDown={handleStageDown}
            onTouchEnd={e => { if (e.target === e.target.getStage()) setAvatarSelected(false); }}
          >
            {/* ── Layer 1: clipped content ── */}
            <Layer clipFunc={makeClipFunc}>
              {/* User avatar — inside clip, rendered under layers */}
              {userImg && (
                <KonvaImage
                  ref={avatarRef}
                  image={userImg}
                  x={userX} y={userY}
                  width={userImg.width} height={userImg.height}
                  scaleX={avatarState.scaleX || 1}
                  scaleY={avatarState.scaleY || 1}
                  rotation={avatarState.rotation || 0}
                  draggable
                  onClick={() => setAvatarSelected(true)}
                  onTap={() => setAvatarSelected(true)}
                  onDragEnd={e => onStateChange({
                    ...avatarState,
                    x: e.target.x() - PAD + (viewport.x || 0),
                    y: e.target.y() - PAD + (viewport.y || 0),
                  })}
                  onTransformEnd={e => {
                    const n = e.target;
                    onStateChange({
                      ...avatarState,
                      x: n.x() - PAD + (viewport.x || 0),
                      y: n.y() - PAD + (viewport.y || 0),
                      scaleX: n.scaleX(),
                      scaleY: n.scaleY(),
                      rotation: n.rotation(),
                    });
                  }}
                />
              )}
              {bgImg && <KonvaImage image={bgImg} x={bgX} y={bgY} listening={false} />}
              {layers.map(l => {
                const ox = l.x - (viewport.x || 0) + PAD;
                const oy = l.y - (viewport.y || 0) + PAD;
                if (l.type === 'image') return <CanvasLayerImage key={l.id} data={{ ...l, x: ox, y: oy }} />;
                if (l.type === 'shape') return <CanvasShape key={l.id} data={{ ...l, x: ox, y: oy }} />;
                if (l.type === 'text') {
                  const ut = avatarState.texts?.[l.id];
                  return (
                    <KonvaText key={l.id} x={ox} y={oy}
                      text={l.isEditable ? (ut?.length > 0 ? ut : (l.placeholder || l.text || '')) : (l.text || '')}
                      fontSize={l.fontSize || 20} fill={l.fill || '#fff'} rotation={l.rotation || 0}
                      fontFamily={l.fontFamily || 'Inter'} fontStyle={l.fontStyle || 'normal'} listening={false}
                    />
                  );
                }
                return null;
              })}
              {ovImg && <KonvaImage image={ovImg} x={bgX} y={bgY} listening={false} />}
            </Layer>

            {/* ── Layer 2: NO clip — Transformer shows outside viewport ── */}
            <Layer ref={trLayer2Ref}>
              <Transformer
                  ref={trRef}
                  keepRatio={lockRatio}
                  rotateEnabled={true}
                  enabledAnchors={lockRatio
                    ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']}
                  borderStroke="#6366f1"
                  anchorStroke="#6366f1"
                  anchorFill="#fff"
                  anchorSize={22}
                  anchorCornerRadius={4}
                  borderDash={[4, 2]}
                />
            </Layer>
          </Stage>
        </div>
      </div>

      <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        Pinch to zoom · Tap image to select · Tap outside to deselect
      </p>
    </div>
  );
}

function CanvasLayerImage({ data }) {
  const [img] = useImage(data.url || '');
  return img
    ? <KonvaImage image={img} x={data.x} y={data.y} width={data.w} height={data.h} rotation={data.rotation || 0} listening={false} />
    : null;
}

function CanvasShape({ data }) {
  const fill = data.transparentFill ? 'transparent' : (data.fill || '#6366f1');
  const props = { x: data.x, y: data.y, fill, stroke: data.stroke || '', strokeWidth: data.strokeWidth || 0, rotation: data.rotation || 0, opacity: data.opacity ?? 1, listening: false };
  switch (data.shapeType) {
    case 'circle':   return <Circle {...props} radius={(data.w || 100) / 2} />;
    case 'triangle': return <RegularPolygon {...props} sides={3} radius={(data.w || 100) / 2} />;
    case 'star':     return <Star {...props} numPoints={5} innerRadius={(data.w||100)/4} outerRadius={(data.w||100)/2} />;
    default:         return <Rect {...props} width={data.w || 100} height={data.h || 100} />;
  }
}

export default CanvasEditor;
