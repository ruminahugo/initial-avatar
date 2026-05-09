const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');

const dirs = [
  UPLOADS_DIR,
  path.join(UPLOADS_DIR, 'templates'),
  path.join(UPLOADS_DIR, 'avatars'),
  path.join(UPLOADS_DIR, 'assets'),
  EXPORTS_DIR,
  path.join(EXPORTS_DIR, 'thumbnails')
];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Chuẩn hóa đường dẫn: Luôn bắt đầu bằng / và sử dụng dấu /
const toUrl = (p) => {
  if (!p) return null;
  let normalized = p.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
};

// Lưu vào DB: Luôn là đường dẫn tương đối từ ROOT_DIR, không có dấu / ở đầu
const toRel = (p) => {
  if (!p) return null;
  return path.relative(ROOT_DIR, p).replace(/\\/g, '/').replace(/^\//, '');
};

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

app.use(session({
  secret: 'sacom-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Serve static files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/exports', express.static(EXPORTS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = UPLOADS_DIR;
    if (file.fieldname === 'background' || file.fieldname === 'overlay') folder = path.join(UPLOADS_DIR, 'templates');
    else if (file.fieldname === 'avatar') folder = path.join(UPLOADS_DIR, 'avatars');
    else if (file.fieldname === 'asset') folder = path.join(UPLOADS_DIR, 'assets');
    else if (file.fieldname === 'image_blob') folder = EXPORTS_DIR;
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

const isAdmin = (req, res, next) => {
  if (req.session.isAdmin) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'sacom@123') { req.session.isAdmin = true; res.json({ success: true }); }
  else res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/upload-asset', isAdmin, upload.single('asset'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = toUrl(toRel(req.file.path));
  console.log('Asset uploaded:', url);
  res.json({ url });
});

app.get('/api/templates', (req, res) => {
  db.all('SELECT * FROM templates ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ 
      ...r, 
      background_path: toUrl(r.background_path), 
      overlay_path: toUrl(r.overlay_path),
      config: JSON.parse(r.config || '{}')
    })));
  });
});

app.post('/api/templates', isAdmin, upload.fields([{name:'background'},{name:'overlay'}]), (req, res) => {
  const { name, config } = req.body;
  const bg = toRel(req.files?.['background']?.[0]?.path);
  const ov = toRel(req.files?.['overlay']?.[0]?.path);
  db.run('INSERT INTO templates (name, background_path, overlay_path, config) VALUES (?, ?, ?, ?)', [name, bg, ov, config], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put('/api/templates/:id', isAdmin, upload.fields([{name:'background'},{name:'overlay'}]), (req, res) => {
  const { name, config } = req.body;
  let fields = ['name = ?', 'config = ?'], params = [name, config];
  if (req.files?.['background']) { fields.push('background_path = ?'); params.push(toRel(req.files['background'][0].path)); }
  if (req.files?.['overlay']) { fields.push('overlay_path = ?'); params.push(toRel(req.files['overlay'][0].path)); }
  params.push(req.params.id);
  db.run(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/templates/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM templates WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/templates/:id/duplicate', isAdmin, (req, res) => {
  db.get('SELECT * FROM templates WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Template not found' });
    db.run('INSERT INTO templates (name, background_path, overlay_path, config) VALUES (?, ?, ?, ?)', 
      [row.name + ' (Copy)', row.background_path, row.overlay_path, row.config], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
  });
});

app.post('/api/projects', upload.single('avatar'), (req, res) => {
  const { id, template_id, state } = req.body;
  const av = toRel(req.file?.path);
  const now = new Date().toISOString();
  if (id && id !== 'undefined' && id !== 'null') {
    let sql = 'UPDATE projects SET state = ?, last_saved_at = ?' + (av ? ', avatar_path = ?' : '') + ' WHERE id = ?';
    let p = av ? [state, now, av, id] : [state, now, id];
    db.run(sql, p, err => err ? res.status(500).json({ error: err.message }) : res.json({ id }));
  } else {
    db.run('INSERT INTO projects (template_id, avatar_path, state, last_saved_at) VALUES (?, ?, ?, ?)', [template_id, av, state, now], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
  }
});

app.get('/api/projects/:id', (req, res) => {
  db.get('SELECT * FROM projects WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    res.json({ 
      ...row, 
      avatar_path: toUrl(row.avatar_path), 
      thumbnail_path: toUrl(row.thumbnail_path), 
      export_path: toUrl(row.export_path), 
      state: JSON.parse(row.state || '{}') 
    });
  });
});

app.get('/api/projects', isAdmin, (req, res) => {
  db.all('SELECT * FROM projects ORDER BY last_saved_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ 
      ...r, 
      avatar_path: toUrl(r.avatar_path), 
      thumbnail_path: toUrl(r.thumbnail_path), 
      export_path: toUrl(r.export_path), 
      state: JSON.parse(r.state || '{}') 
    })));
  });
});

app.delete('/api/projects/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM projects WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const exportQueue = [];
let isExporting = false;
const processQueue = async () => {
  if (isExporting || exportQueue.length === 0) return;
  isExporting = true;
  const { req, res, project_id } = exportQueue.shift();
  try {
    const file = req.file;
    const hd = path.join(EXPORTS_DIR, 'hd-' + file.filename);
    const thumb = path.join(EXPORTS_DIR, 'thumbnails', 'thumb-' + file.filename);
    await sharp(file.path).png({ quality: 100 }).toFile(hd);
    await sharp(file.path).resize(200, 200, { fit: 'cover' }).toFile(thumb);
    const hdRel = toRel(hd);
    const thumbRel = toRel(thumb);
    if (project_id) db.run('UPDATE projects SET export_path = ?, thumbnail_path = ? WHERE id = ?', [hdRel, thumbRel, project_id]);
    res.json({ hd_url: toUrl(hdRel), thumb_url: toUrl(thumbRel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { isExporting = false; processQueue(); }
};

app.post('/api/export', upload.single('image_blob'), (req, res) => {
  exportQueue.push({ req, res, project_id: req.body.project_id });
  processQueue();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('ROOT_DIR:', ROOT_DIR);
});
