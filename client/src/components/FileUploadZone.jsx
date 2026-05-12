import React, { useState } from 'react';
import { Upload, FileCode, CheckCircle } from 'lucide-react';

function FileUploadZone({ onFilesSelected, accept = "image/*", multiple = false, label = "Drop files here or click to upload" }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(multiple ? e.target.files : [e.target.files[0]]);
    }
  };

  return (
    <div 
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`file-input-${label.replace(/\s/g, '')}`).click()}
      style={{
        fontSize: 'medium',
        border: '2px dashed var(--border)',
        borderRadius: '1rem',
        padding: '0.3rem',
        textAlign: 'center',
        background: isDragging ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-card)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderColor: isDragging ? 'var(--primary)' : 'var(--border)',
        position: 'relative'
      }}
    >
      <input 
        id={`file-input-${label.replace(/\s/g, '')}`}
        type="file" 
        multiple={multiple} 
        accept={accept} 
        onChange={handleChange} 
        style={{ display: 'none' }}
      />
      <div style={{ pointerEvents: 'none' }}>
        <Upload size={32} color={isDragging ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '1rem' }} />
        <p style={{ fontWeight: '600' }}>{label}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          PNG, JPG or WEBP (Tối đa 10MB)
        </p>
      </div>
    </div>
  );
}

export default FileUploadZone;
