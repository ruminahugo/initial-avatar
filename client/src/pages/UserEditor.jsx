import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Save, Download, ArrowLeft, RefreshCcw } from 'lucide-react';
import CanvasEditor from '../components/CanvasEditor';
import FileUploadZone from '../components/FileUploadZone';

function UserEditor() {
  const { templateId, projectId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [project, setProject] = useState(null);
  const [avatarImage, setAvatarImage] = useState(null);
  const [avatarState, setAvatarState] = useState({ texts: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const stageRef = useRef();

  useEffect(() => { loadData(); }, [templateId, projectId]);

  const loadData = async () => {
    try {
      let t;
      if (projectId) {
        const pRes = await axios.get(`/api/projects/${projectId}`);
        setProject(pRes.data);
        setAvatarState(pRes.data.state);
        if (pRes.data.avatar_path) setAvatarImage(pRes.data.avatar_path);
        const tRes = await axios.get(`/api/templates`);
        t = tRes.data.find(x => x.id === pRes.data.template_id);
      } else {
        const tRes = await axios.get(`/api/templates`);
        t = tRes.data.find(x => x.id === parseInt(templateId));
      }
      setTemplate(t);
    } catch (err) { console.error('Error loading:', err); }
    finally { setLoading(false); }
  };

  const handleAvatarUpload = (files) => {
    const file = files[0];
    if (file && template) {
      const config = typeof template.config === 'string' ? JSON.parse(template.config) : (template.config || {});
      const vp = config.viewport || config.canvasSize || { w: 800, h: 800 };
      
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        // Calculate scale to fit viewport
        const scale = Math.min(vp.w / img.width, vp.h / img.height, 1);
        // Center image in viewport (absolute coordinates)
        const centerX = (vp.x || 0) + (vp.w - img.width * scale) / 2;
        const centerY = (vp.y || 0) + (vp.h - img.height * scale) / 2;
        
        setAvatarImage(img.src);
        setAvatarState({ 
          ...avatarState, 
          file, 
          scaleX: scale, 
          scaleY: scale, 
          x: centerX, 
          y: centerY, 
          rotation: 0 
        });
      };
    }
  };

  const handleSave = async (isAutosave = false) => {
    if (saving) return;
    setSaving(true);
    const data = new FormData();
    if (projectId) data.append('id', projectId);
    if (template) data.append('template_id', template.id);
    const cleanState = { ...avatarState }; delete cleanState.file; delete cleanState.dropUrl;
    data.append('state', JSON.stringify(cleanState));
    if (avatarState.file) data.append('avatar', avatarState.file);
    try {
      const res = await axios.post('/api/projects', data);
      if (!projectId && !isAutosave) navigate(`/project/${res.data.id}`, { replace: true });
      if (!isAutosave) alert('Project saved!');
    } catch (err) { if (!isAutosave) alert('Error saving project'); }
    finally { setSaving(false); }
  };

  const handleExport = async () => {
    if (!stageRef.current) return;
    setExporting(true);
    try {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();

      const data = new FormData();
      data.append('image_blob', blob, 'export.png');
      if (projectId) data.append('project_id', projectId);
      await axios.post('/api/export', data);

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `avatar-${template?.name || 'frame'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) { alert('Error during export'); }
    finally { setExporting(false); }
  };

  if (loading || !template) return <div className="loading-screen">Loading Editor...</div>;

  const config = typeof template.config === 'string' ? JSON.parse(template.config) : (template.config || {});
  const editableTexts = (config.layers || []).filter(t => t.type === 'text' && t.isEditable);

  return (
    <div className="container fade-in" style={{ paddingBottom: '5rem' }}>
      <header className="header">
        <button className="btn-outline" onClick={() => navigate('/')} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><ArrowLeft size={18} /> Back</button>
        <h2>{template.name}</h2>
        <div style={{ display:'flex', gap:'1rem' }}>
          <button className="btn-outline" onClick={() => handleSave()} disabled={saving}><Save size={18} style={{ marginRight:'0.5rem' }} /> {saving ? 'Saving...' : 'Save'}</button>
          <button className="btn-primary" onClick={handleExport} disabled={exporting}><Download size={18} style={{ marginRight:'0.5rem' }} /> {exporting ? 'Exporting...' : 'Export HD'}</button>
        </div>
      </header>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'2rem' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <CanvasEditor template={template} avatarImage={avatarImage} avatarState={avatarState} onStateChange={setAvatarState} stageRef={stageRef} />
          <p style={{ marginTop:'1.5rem', color:'var(--text-muted)', fontSize:'0.9rem' }}>Drag, zoom, and rotate your image to fit the frame.</p>
        </div>
        <div className="card">
          <h3 style={{ marginBottom:'1.5rem' }}>Editor Controls</h3>
          <div style={{ marginBottom:'2rem' }}>
            <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:'600' }}>Your Image</label>
            <FileUploadZone label={avatarImage ? "Change Image" : "Drop Image Here"} onFilesSelected={handleAvatarUpload} />
          </div>
          {editableTexts.length > 0 && (
            <div style={{ marginBottom:'2rem' }}>
              <label style={{ display:'block', marginBottom:'0.5rem', fontWeight:'600' }}>Custom Info</label>
              {editableTexts.map(t => (
                <div key={t.id} style={{ marginBottom:'1rem' }}>
                  <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'0.25rem' }}>{t.label || 'Input'}</p>
                  <input type="text" value={avatarState.texts?.[t.id] || ''} onChange={e => setAvatarState({ ...avatarState, texts: { ...avatarState.texts, [t.id]: e.target.value } })} placeholder={t.placeholder} />
                </div>
              ))}
            </div>
          )}
          <div style={{ padding:'1rem', background:'rgba(16,185,129,0.1)', borderRadius:'0.5rem', border:'1px solid rgba(16,185,129,0.2)' }}>
            <p style={{ fontSize:'0.85rem', color:'var(--accent)' }}><strong>Tip:</strong> Use two fingers or scroll to zoom. Drag to move.</p>
          </div>
        </div>
      </div>
      {saving && <div style={{ position:'fixed', bottom:'2rem', right:'2rem', background:'var(--primary)', color:'white', padding:'0.5rem 1rem', borderRadius:'2rem', display:'flex', alignItems:'center', gap:'0.5rem', boxShadow:'var(--shadow)' }}><RefreshCcw size={16} className="spin" /> Autosaving...</div>}
    </div>
  );
}

export default UserEditor;
