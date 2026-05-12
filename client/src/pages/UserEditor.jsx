import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Save, Download, ArrowLeft, RotateCcw, Lock, Unlock, History } from 'lucide-react';
import CanvasEditor, { CANVAS_OVERFLOW_PAD } from '../components/CanvasEditor';
import FileUploadZone from '../components/FileUploadZone';

// ── LocalStorage helpers ──────────────────────────────────
const LS_KEY  = (tid) => `avatar_project_t${tid}`;
const lsGet   = (tid) => { try { const r = localStorage.getItem(LS_KEY(tid)); return r ? JSON.parse(r) : null; } catch { return null; } };
const lsSet   = (tid, data) => { try { localStorage.setItem(LS_KEY(tid), JSON.stringify(data)); } catch {} };

function UserEditor() {
  const { templateId, projectId } = useParams();
  const navigate = useNavigate();

  const [template,      setTemplate]      = useState(null);
  const [avatarImage,   setAvatarImage]   = useState(null);
  const [avatarState,   setAvatarState]   = useState({ texts: {} });
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [imgDims,       setImgDims]       = useState({ w: 0, h: 0 });
  const [lockRatio,     setLockRatio]     = useState(true);
  // projectId resolved from URL or from localStorage (for /edit/:templateId routes)
  const [localProjectId, setLocalProjectId] = useState(null);
  const [restoredMsg,   setRestoredMsg]   = useState(null); // toast

  const stageRef           = useRef();
  const autoSaveRef        = useRef(null);
  const skipAutoCenterRef  = useRef(false); // tells CanvasEditor not to override restored position

  // Effective project ID — URL param wins, localStorage fallback
  const effectiveProjectId = projectId || localProjectId;

  // ── Load data ────────────────────────────────────────────
  useEffect(() => { loadData(); }, [templateId, projectId]); // eslint-disable-line

  const loadData = async () => {
    try {
      if (projectId) {
        // Existing project — load fully from server
        const [pRes, tRes] = await Promise.all([
          axios.get(`/api/projects/${projectId}`),
          axios.get('/api/templates'),
        ]);
        setAvatarState(pRes.data.state || { texts: {} });
        if (pRes.data.avatar_path) setAvatarImage(pRes.data.avatar_path);
        setTemplate(tRes.data.find(x => x.id === pRes.data.template_id));
      } else {
        // New project for a template — load template, then check localStorage
        const tRes = await axios.get('/api/templates');
        const t = tRes.data.find(x => x.id === parseInt(templateId));
        setTemplate(t);

        const saved = lsGet(templateId);
        if (saved) {
          if (saved.avatarState)    setAvatarState(saved.avatarState);
          if (saved.avatarImageUrl) {
            setAvatarImage(saved.avatarImageUrl);
            // Position is already in the restored avatarState — tell CanvasEditor not to auto-center
            skipAutoCenterRef.current = true;
          }
          if (saved.projectId)      setLocalProjectId(saved.projectId);
          const mins = Math.round((Date.now() - (saved.updatedAt || 0)) / 60000);
          setRestoredMsg(`Đã khôi phục chỉnh sửa ${mins < 1 ? 'vừa rồi' : `${mins} phút trước`}`);
          setTimeout(() => setRestoredMsg(null), 4000);
        }
      }
    } catch (err) { console.error('Load error:', err); }
    finally { setLoading(false); }
  };

  // ── Auto-save to localStorage (debounced 1.5s) ───────────
  useEffect(() => {
    if (!templateId || loading) return; // only for /edit/:templateId
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      const cleanState = { ...avatarState };
      delete cleanState.file;
      delete cleanState.dropUrl;
      lsSet(templateId, {
        projectId: localProjectId,
        avatarState: cleanState,
        avatarImageUrl: avatarImage || null,   // dataURL or server URL — always safe to store
        updatedAt: Date.now(),
      });
    }, 1500);
    return () => clearTimeout(autoSaveRef.current);
  }, [avatarState, avatarImage, templateId, localProjectId, loading]);

  // ── Upload avatar ────────────────────────────────────────
  const handleAvatarUpload = (files) => {
    const file = files[0];
    if (!file || !template) return;
    const cfg = typeof template.config === 'string' ? JSON.parse(template.config) : (template.config || {});
    const vp  = cfg.viewport || cfg.canvasSize || { w: 800, h: 800 };

    // ✅ Read as dataURL (not blob://) so it can persist in localStorage
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const scale   = Math.min(vp.w / img.width, vp.h / img.height, 1);
        const centerX = (vp.x || 0) + (vp.w - img.width  * scale) / 2;
        const centerY = (vp.y || 0) + (vp.h - img.height * scale) / 2;
        setAvatarImage(dataUrl);
        setAvatarState(prev => ({ ...prev, file, scaleX: scale, scaleY: scale, x: centerX, y: centerY, rotation: 0 }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ── Viewport dimensions helper ───────────────────────────
  const getViewport = () => {
    const cfg = template?.config || {};
    const vp  = cfg.viewport || cfg.canvasSize || { w: 800, h: 800 };
    return { w: vp.w || 800, h: vp.h || 800 };
  };

  // ── Capture canvas (hide transformer, crop padding) ──────
  const captureCanvas = async (pixelRatio, mimeType = 'image/png') => {
    if (!stageRef.current) return null;
    const { w, h } = getViewport();
    const trs = stageRef.current.find('Transformer');
    trs.forEach(tr => tr.visible(false));
    stageRef.current.batchDraw();
    const dataUrl = stageRef.current.toDataURL({
      x: CANVAS_OVERFLOW_PAD, y: CANVAS_OVERFLOW_PAD,
      width: w, height: h, pixelRatio, mimeType,
    });
    trs.forEach(tr => tr.visible(true));
    stageRef.current.batchDraw();
    return (await fetch(dataUrl)).blob();
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async (isAutosave = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const data = new FormData();
      // Use effectiveProjectId: URL param (existing) or localStorage (previously saved)
      if (effectiveProjectId) data.append('id', String(effectiveProjectId));
      if (template)           data.append('template_id', template.id);

      const cleanState = { ...avatarState };
      delete cleanState.file; delete cleanState.dropUrl;
      data.append('state', JSON.stringify(cleanState));
      if (avatarState.file) data.append('avatar', avatarState.file);

      // Generate thumbnail + HD on every save
      const [thumbBlob, hdBlob] = await Promise.all([
        captureCanvas(0.35, 'image/jpeg'),
        captureCanvas(2,    'image/png'),
      ]);
      if (thumbBlob) data.append('project_thumbnail', thumbBlob, 'thumbnail.jpg');
      if (hdBlob)    data.append('project_hd', hdBlob, 'hd.png');

      const res     = await axios.post('/api/projects', data);
      const savedId = res.data.id;

      // Persist project ID to localStorage so future saves update (not create new)
      if (templateId) {
        const existing = lsGet(templateId) || {};
        lsSet(templateId, { ...existing, projectId: savedId, updatedAt: Date.now() });
      }
      setLocalProjectId(savedId);

      // Only redirect on first-ever creation
      //if (!effectiveProjectId && !isAutosave) navigate(`/project/${savedId}`, { replace: true });
      if (!isAutosave) {
        if (res.data.recreated) alert('Project đã bị xóa bởi admin. Đã tạo lại project mới thành công!');
        else alert('Project đã lưu vào server!');
      }
    } catch (err) { if (!isAutosave) alert('Error saving project'); }
    finally { setSaving(false); }
  };

  // ── Export HD ────────────────────────────────────────────
  const handleExport = async () => {
    if (!stageRef.current) return;
    setExporting(true);
    try {
      const blob = await captureCanvas(2, 'image/png');
      if (!blob) return;

      const data = new FormData();
      data.append('image_blob', blob, 'export.png');
      // ✅ Use effectiveProjectId so export always links to the project
      if (effectiveProjectId) data.append('project_id', String(effectiveProjectId));
      await axios.post('/api/export', data);

      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href  = url;
      link.download = `avatar-${template?.name || 'frame'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) { alert('Export failed'); }
    finally { setExporting(false); }
  };

  if (loading || !template) return <div className="loading-screen">Loading Editor...</div>;

  const config        = typeof template.config === 'string' ? JSON.parse(template.config) : (template.config || {});
  const editableTexts = (config.layers || []).filter(l => l.type === 'text' && l.isEditable);

  return (
    <div className="container fade-in" style={{ paddingBottom: '5rem' }}>
      <header className="header">
        <button className="btn-outline" onClick={() => navigate('/')} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <ArrowLeft size={18} /> Back
        </button>
        <h2>{template.name}</h2>
        <div style={{ display:'flex', gap:'1rem', marginTop: window.innerWidth <= 768 ? '8px' : '0' }}>
          <button className="btn-outline" onClick={() => handleSave()} disabled={saving}>
            <Save size={18} style={{ marginRight:'0.5rem' }} />
            {saving ? 'Saving...' : (effectiveProjectId ? 'Update' : 'Save')}
          </button>
          <button className="btn-primary" onClick={handleExport} disabled={exporting}>
            <Download size={18} style={{ marginRight:'0.5rem' }} />
            {exporting ? 'Exporting...' : 'Export HD'}
          </button>
        </div>
      </header>

      {/* Restored toast */}
      {restoredMsg && (
        <div style={{ background:'rgba(99,102,241,0.15)', border:'1px solid var(--primary)', borderRadius:'0.75rem', padding:'0.6rem 1rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.85rem', color:'var(--primary)' }}>
          <History size={16} /> {restoredMsg}
        </div>
      )}

      <div style={{ display: window.innerWidth <= 768 ? 'block' : 'grid', gridTemplateColumns:'1fr 320px', gap:'2rem' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <CanvasEditor
            template={template}
            avatarImage={avatarImage}
            avatarState={avatarState}
            onStateChange={setAvatarState}
            stageRef={stageRef}
            onDimensionsChange={setImgDims}
            lockRatio={lockRatio}
            skipAutoCenter={skipAutoCenterRef}
          />

          {/* Properties panel */}
          {avatarImage && imgDims.w > 0 && (
            <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'1rem', padding:'1rem 1.25rem', marginTop:'1rem', width:'100%' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
                <span style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-muted)' }}>Image Properties</span>
                <button className="btn-outline" style={{ padding:'0.3rem 0.8rem', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.4rem' }}
                  onClick={() => { const d = avatarState._default; if (d) setAvatarState(p => ({ ...p, ...d })); }}>
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr 1fr', gap:'0.6rem', alignItems:'end' }}>
                <div>
                  <label style={{ fontSize:'0.75rem', color:'var(--text-muted)', display:'block', marginBottom:'0.3rem' }}>Width (px)</label>
                  <input type="number" min="1"
                    value={Math.round(imgDims.w * (avatarState.scaleX || 1))}
                    onChange={e => {
                      const newW = Math.max(1, parseInt(e.target.value) || 1);
                      const sx   = newW / imgDims.w;
                      setAvatarState(p => ({ ...p, scaleX: sx, scaleY: lockRatio ? sx : p.scaleY }));
                    }} style={{ width:'100%' }} />
                </div>
                <button className="tool-btn" title={lockRatio ? 'Unlock ratio' : 'Lock ratio'}
                  onClick={() => setLockRatio(v => !v)}
                  style={{ marginBottom:'2px', color: lockRatio ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {lockRatio ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                <div>
                  <label style={{ fontSize:'0.75rem', color:'var(--text-muted)', display:'block', marginBottom:'0.3rem' }}>Height (px)</label>
                  <input type="number" min="1"
                    value={Math.round(imgDims.h * (avatarState.scaleY || 1))}
                    onChange={e => {
                      const newH = Math.max(1, parseInt(e.target.value) || 1);
                      const sy   = newH / imgDims.h;
                      setAvatarState(p => ({ ...p, scaleY: sy, scaleX: lockRatio ? sy : p.scaleX }));
                    }} style={{ width:'100%' }} />
                </div>
                <div>
                  <label style={{ fontSize:'0.75rem', color:'var(--text-muted)', display:'block', marginBottom:'0.3rem' }}>Rotation (°)</label>
                  <input type="number"
                    value={Math.round(avatarState.rotation || 0)}
                    onChange={e => setAvatarState(p => ({ ...p, rotation: parseFloat(e.target.value) || 0 }))}
                    style={{ width:'100%' }} />
                </div>
              </div>
            </div>
          )}
          <p style={{ marginTop:'1.5rem', color:'var(--text-muted)', fontSize:'0.9rem' }}>Drag, pinch or use controls to adjust your image.</p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom:'1.5rem' }}>Editor Controls</h3>
          <div style={{ marginBottom:'2rem' }}>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:'600' }}>Your Image</label>
            <FileUploadZone label={avatarImage ? 'Change Image' : 'Drop Image Here'} onFilesSelected={handleAvatarUpload} />
          </div>
          {editableTexts.length > 0 && (
            <div style={{ marginBottom:'2rem' }}>
              <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:'600' }}>Custom Info</label>
              {editableTexts.map(t => (
                <div key={t.id} style={{ marginBottom:'1rem' }}>
                  <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'0.25rem' }}>{t.label || 'Input'}</p>
                  <input type="text" value={avatarState.texts?.[t.id] || ''}
                    onChange={e => setAvatarState(prev => ({ ...prev, texts: { ...prev.texts, [t.id]: e.target.value } }))}
                    placeholder={t.placeholder} />
                </div>
              ))}
            </div>
          )}
          {/* Local save status */}
          <div style={{ padding:'0.75rem 1rem', background:'rgba(99,102,241,0.08)', borderRadius:'0.5rem', border:'1px solid rgba(99,102,241,0.15)', fontSize:'0.8rem', color:'var(--text-muted)' }}>
            💾 Auto-saving locally as you edit
            {effectiveProjectId && <span style={{ display:'block', marginTop:'0.25rem', color:'var(--accent)' }}>✓ Project #{effectiveProjectId}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserEditor;
