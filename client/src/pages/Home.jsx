import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Layout, Plus, Settings } from 'lucide-react';

function Home() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/templates')
      .then(res => setTemplates(res.data))
      .catch(err => console.error('Error fetching templates:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container fade-in">
      <header className="header">
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(to right, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Avatar Frame Studio
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Select a template to start framing your avatar</p>
        </div>
        <Link to="/admin">
          <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} /> Admin
          </button>
        </Link>
      </header>

      {loading ? (
        <p>Loading templates...</p>
      ) : (
        <div className="grid">
          {templates.map((template) => (
          <Link key={template.id} to={`/edit/${template.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ cursor: 'pointer' }}>
                {(() => {
                  // Compute border-radius to match the viewport's cornerRadius
                  const vp = template.config?.viewport || {};
                  const r = vp.cornerRadius || 0;
                  const minDim = Math.min(vp.w || 800, vp.h || 800);
                  // Map canvas cornerRadius → thumbnail percentage (capped at 50% = circle)
                  const thumbRadius = r > 0
                    ? `${Math.min((r / minDim) * 100, 50)}%`
                    : '0.5rem';
                  return (
                    <div style={{ position: 'relative', paddingBottom: '100%', background: '#111', borderRadius: thumbRadius, overflow: 'hidden' }}>
                      {(template.thumbnail_path || template.background_path) && (
                        <img
                          src={template.thumbnail_path || template.background_path}
                          alt={template.name}
                          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                      {!template.thumbnail_path && template.overlay_path && (
                        <img
                          src={template.overlay_path}
                          alt="overlay"
                          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }}
                        />
                      )}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.4)', opacity: 0, transition: 'opacity 0.2s', zIndex: 3 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                        <Plus color="white" size={48} />
                      </div>
                    </div>
                  );
                })()}
                <h3 style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.95rem' }}>{template.name}</h3>
              </div>
            </Link>
          ))}

          {templates.length === 0 && (
            <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem' }}>
              <Layout size={48} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
              <h3>No templates found</h3>
              <p style={{ color: 'var(--text-muted)' }}>Ask an admin to create some frames!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
