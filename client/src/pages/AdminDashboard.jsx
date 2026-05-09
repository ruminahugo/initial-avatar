import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Copy, Edit3, Download, ExternalLink, X, Eye } from 'lucide-react';
import TemplateDesigner from '../components/TemplateDesigner';

function AdminDashboard() {
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('templates');
  const [showDesigner, setShowDesigner] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [tRes, pRes] = await Promise.all([
        axios.get('/api/templates'),
        axios.get('/api/projects')
      ]);
      setTemplates(tRes.data);
      setProjects(pRes.data);
    } catch (err) { console.error('Error fetching data:', err); }
  };

  const handleSaveFromDesigner = async ({ name, files, config }) => {
    if (!name) return alert('Template name is required');
    const data = new FormData();
    data.set('name', name);
    data.set('config', JSON.stringify(config));
    if (files.background) data.append('background', files.background);
    if (files.overlay) data.append('overlay', files.overlay);
    try {
      if (editingTemplate) await axios.put(`/api/templates/${editingTemplate.id}`, data);
      else await axios.post('/api/templates', data);
      setShowDesigner(false); setEditingTemplate(null); fetchData();
    } catch (err) { alert('Error saving template'); }
  };

  const handleDuplicate = async (id) => {
    try { await axios.post(`/api/templates/${id}/duplicate`); fetchData(); }
    catch (err) { alert('Error duplicating template'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try { await axios.delete(`/api/templates/${id}`); fetchData(); }
    catch (err) { alert('Error deleting template'); }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this user project?')) return;
    try { await axios.delete(`/api/projects/${id}`); fetchData(); }
    catch (err) { alert('Error deleting project'); }
  };

  return (
    <div className="container fade-in">
      <header className="header">
        <h1>Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className={activeTab === 'templates' ? 'btn-primary' : 'btn-outline'} onClick={() => setActiveTab('templates')}>Templates</button>
          <button className={activeTab === 'projects' ? 'btn-primary' : 'btn-outline'} onClick={() => setActiveTab('projects')}>User Projects</button>
        </div>
      </header>

      {activeTab === 'templates' ? (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems:'center' }}>
            <h2>Templates ({templates.length})</h2>
            <button className="btn-primary" onClick={() => { setEditingTemplate(null); setShowDesigner(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={18} /> New Template
            </button>
          </div>
          <div className="grid">
            {templates.map(t => (
              <div key={t.id} className="card" style={{ padding:'1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="thumb-small" style={{ position:'relative', overflow:'hidden', background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {t.background_path ? (
                      <img src={t.background_path} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="thumb" />
                    ) : <span style={{ fontSize:'0.6rem', color:'#475569' }}>No Image</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', marginBottom:'0.25rem' }}>{t.name}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: #{t.id}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="tool-btn" onClick={() => handleDuplicate(t.id)} title="Duplicate"><Copy size={16} /></button>
                  <button className="tool-btn" onClick={() => { setEditingTemplate(t); setShowDesigner(true); }} title="Edit"><Edit3 size={16} /></button>
                  <button className="tool-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(t.id)} title="Delete"><Trash2 size={16} /></button>
                  <a href={`/edit/${t.id}`} target="_blank" rel="noreferrer" className="tool-btn"><ExternalLink size={16} /></a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="fade-in">
          <h2>User Projects ({projects.length})</h2>
          <div className="grid">
            {projects.map(p => (
              <div key={p.id} className="card" style={{ padding:'1rem', cursor:'pointer' }} onClick={() => setSelectedProject(p)}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="thumb-small" style={{ position:'relative', overflow:'hidden', background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {p.thumbnail_path ? (
                      <img src={p.thumbnail_path} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="thumb" />
                    ) : <span style={{ fontSize:'0.6rem', color:'#475569' }}>No Image</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', marginBottom:'0.25rem' }}>Project #{p.id}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Template: {p.template_id}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(p.last_saved_at).toLocaleString()}</p>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <button className="tool-btn" style={{ color: 'var(--danger)' }} onClick={(e) => handleDeleteProject(p.id, e)}><Trash2 size={16} /></button>
                    <Eye size={18} color="var(--text-muted)" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedProject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
          <div className="card" style={{ width:'100%', maxWidth:'800px', background:'var(--bg-card)', padding:'2rem', position:'relative' }}>
            <button style={{ position:'absolute', top:'1rem', right:'1rem', background:'transparent', border:'none', color:'white' }} onClick={() => setSelectedProject(null)}><X size={24} /></button>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem' }}>
              <div style={{ background:'#000', borderRadius:'0.5rem', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', minHeight:'300px' }}>
                {selectedProject.thumbnail_path ? (
                  <img src={selectedProject.thumbnail_path} style={{ width:'100%', height:'auto', maxHeight:'400px' }} alt="preview" />
                ) : <p>No Preview Available</p>}
              </div>
              <div>
                <h2>Project Details</h2>
                <div style={{ margin:'1.5rem 0', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  <p><strong>Project ID:</strong> #{selectedProject.id}</p>
                  <p><strong>Template ID:</strong> {selectedProject.template_id}</p>
                  <p><strong>Last Saved:</strong> {new Date(selectedProject.last_saved_at).toLocaleString()}</p>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                  {selectedProject.export_path ? (
                    <a href={selectedProject.export_path} download={`project-${selectedProject.id}-hd.png`} style={{ width:'100%' }}>
                      <button className="btn-primary" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                        <Download size={18} /> Download HD Image
                      </button>
                    </a>
                  ) : <p style={{ color:'var(--danger)', fontSize:'0.9rem' }}>Project not exported as HD yet.</p>}
                  <a href={`/project/${selectedProject.id}`} target="_blank" rel="noreferrer"><button className="btn-outline" style={{ width:'100%' }}>Open in User Editor</button></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDesigner && (
        <TemplateDesigner 
          initialTemplate={editingTemplate}
          onSave={handleSaveFromDesigner}
          onCancel={() => { setShowDesigner(false); setEditingTemplate(null); }}
        />
      )}
    </div>
  );
}

export default AdminDashboard;
