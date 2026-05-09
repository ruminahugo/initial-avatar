import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Layout, Plus, Settings } from 'lucide-react';

function Home() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('/api/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

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
              <div className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s', ':hover': { transform: 'translateY(-5px)' } }}>
                <div style={{ position: 'relative', paddingBottom: '100%', background: '#000', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  {template.background_path && (
                    <img 
                      src={template.background_path} 
                      alt={template.name}
                      style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                  {template.overlay_path && (
                    <img 
                      src={template.overlay_path} 
                      alt="overlay"
                      style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }}
                    />
                  )}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyCenter: 'center', background: 'rgba(0,0,0,0.3)', opacity: 0, transition: 'opacity 0.2s', ':hover': { opacity: 1 } }}>
                    <Plus color="white" size={48} />
                  </div>
                </div>
                <h3 style={{ marginTop: '1rem', textAlign: 'center' }}>{template.name}</h3>
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
