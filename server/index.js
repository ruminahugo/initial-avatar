const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
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
  path.join(UPLOADS_DIR, 'thumbnails'), // template thumbnails
  EXPORTS_DIR,
  path.join(EXPORTS_DIR, 'thumbnails')  // project/export thumbnails
];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const toUrl = (p) => {
  if (!p) return null;
  let normalized = p.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
};

const toRel = (p) => {
  if (!p) return null;
  return path.relative(ROOT_DIR, p).replace(/\\/g, '/').replace(/^\//, '');
};

// Generate a thumbnail for a template from its background/overlay paths
const generateTemplateThumbnail = async (bgRel, ovRel, templateId) => {
  try {
    const primary = bgRel || ovRel;
    if (!primary) return null;
    const thumbFile = `template-${templateId}-${Date.now()}.jpg`;
    const thumbPath = path.join(UPLOADS_DIR, 'thumbnails', thumbFile);
    const primaryAbs = path.join(ROOT_DIR, primary);
    if (bgRel && ovRel) {
      const ovAbs = path.join(ROOT_DIR, ovRel);
      const ovBuf = await sharp(ovAbs).resize(400, 400, { fit: 'cover' }).toBuffer();
      await sharp(primaryAbs).resize(400, 400, { fit: 'cover' }).composite([{ input: ovBuf, blend: 'over' }]).jpeg({ quality: 85 }).toFile(thumbPath);
    } else {
      await sharp(primaryAbs).resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(thumbPath);
    }
    return toRel(thumbPath);
  } catch (e) {
    console.error('Template thumbnail generation failed:', e.message);
    return null;
  }
};

// Disable headers that force HTTPS — server runs on plain HTTP (no SSL cert)
app.use(helmet({
  contentSecurityPolicy: false,       // CSP blocks inline scripts / mixed content
  crossOriginOpenerPolicy: false,     // COOP requires HTTPS to be trustworthy
  crossOriginResourcePolicy: false,   // allow cross-origin resource loading
  strictTransportSecurity: false,     // HSTS forces browser to HTTPS → ERR_CONNECTION_TIMED_OUT
  originAgentCluster: false,          // Origin-Agent-Cluster clashes with HTTP origin
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

const redisClient = createClient({
  url: 'redis://localhost:6379'
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected');
  } catch (err) {
    console.error('Redis error:', err);
  }
})();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: 'sacom@123##',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/exports', express.static(EXPORTS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = UPLOADS_DIR;
    if (file.fieldname === 'background' || file.fieldname === 'overlay') folder = path.join(UPLOADS_DIR, 'templates');
    else if (file.fieldname === 'avatar') folder = path.join(UPLOADS_DIR, 'avatars');
    else if (file.fieldname === 'asset') folder = path.join(UPLOADS_DIR, 'assets');
    else if (file.fieldname === 'thumbnail' || file.fieldname === 'project_thumbnail') folder = path.join(UPLOADS_DIR, 'thumbnails');
    else if (file.fieldname === 'project_hd' || file.fieldname === 'image_blob') folder = EXPORTS_DIR;
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname) || '.jpg'}`);
  }
});
const upload = multer({ storage });

const isAdmin = (req, res, next) => {
  if (req.session.isAdmin) next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// Auth
app.get('/api/me', (req, res) => {
  res.json({ isAdmin: req.session.isAdmin || false });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'sacom@123') { req.session.isAdmin = true; res.json({ success: true }); }
  else res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Upload asset (admin only)
app.post('/api/upload-asset', isAdmin, upload.single('asset'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = toUrl(toRel(req.file.path));
  res.json({ url });
});

// ── Templates ──────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  db.all('SELECT * FROM templates ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      background_path: toUrl(r.background_path),
      overlay_path: toUrl(r.overlay_path),
      thumbnail_path: toUrl(r.thumbnail_path),
      config: JSON.parse(r.config || '{}')
    })));
  });
});

app.post('/api/templates', isAdmin,
  upload.fields([{ name: 'background' }, { name: 'overlay' }, { name: 'thumbnail' }]),
  async (req, res) => {
    const { name, config } = req.body;
    const bg = toRel(req.files?.['background']?.[0]?.path);
    const ov = toRel(req.files?.['overlay']?.[0]?.path);
    // Use uploaded thumbnail if provided, otherwise generate from bg+ov
    let thumb = toRel(req.files?.['thumbnail']?.[0]?.path);

    db.run(
      'INSERT INTO templates (name, background_path, overlay_path, config, thumbnail_path) VALUES (?, ?, ?, ?, ?)',
      [name, bg, ov, config, thumb],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const templateId = this.lastID;
        // Auto-generate thumbnail from bg+ov if no dedicated thumbnail was sent
        if (!thumb && (bg || ov)) {
          thumb = await generateTemplateThumbnail(bg, ov, templateId);
          if (thumb) db.run('UPDATE templates SET thumbnail_path = ? WHERE id = ?', [thumb, templateId]);
        }
        res.json({ id: templateId });
      }
    );
  }
);

app.put('/api/templates/:id', isAdmin,
  upload.fields([{ name: 'background' }, { name: 'overlay' }, { name: 'thumbnail' }]),
  async (req, res) => {
    const { name, config } = req.body;
    let fields = ['name = ?', 'config = ?'], params = [name, config];
    let bgRel = null, ovRel = null;
    if (req.files?.['background']) { bgRel = toRel(req.files['background'][0].path); fields.push('background_path = ?'); params.push(bgRel); }
    if (req.files?.['overlay']) { ovRel = toRel(req.files['overlay'][0].path); fields.push('overlay_path = ?'); params.push(ovRel); }
    if (req.files?.['thumbnail']) { fields.push('thumbnail_path = ?'); params.push(toRel(req.files['thumbnail'][0].path)); }
    params.push(req.params.id);

    db.run(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, params, async (err) => {
      if (err) return res.status(500).json({ error: err.message });
      // Regenerate thumbnail if bg or ov changed and no dedicated thumbnail was sent
      if ((bgRel || ovRel) && !req.files?.['thumbnail']) {
        // Fetch current paths for the ones not updated
        db.get('SELECT background_path, overlay_path FROM templates WHERE id = ?', [req.params.id], async (e, row) => {
          if (!e && row) {
            const finalBg = bgRel || row.background_path;
            const finalOv = ovRel || row.overlay_path;
            const thumb = await generateTemplateThumbnail(finalBg, finalOv, req.params.id);
            if (thumb) db.run('UPDATE templates SET thumbnail_path = ? WHERE id = ?', [thumb, req.params.id]);
          }
        });
      }
      res.json({ success: true });
    });
  }
);

app.delete('/api/templates/:id', isAdmin, (req, res) => {
  db.run('DELETE FROM templates WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/templates/:id/duplicate', isAdmin, (req, res) => {
  db.get('SELECT * FROM templates WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Template not found' });
    db.run(
      'INSERT INTO templates (name, background_path, overlay_path, config, thumbnail_path) VALUES (?, ?, ?, ?, ?)',
      [row.name + ' (Copy)', row.background_path, row.overlay_path, row.config, row.thumbnail_path],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// ── Projects ───────────────────────────────────────────────
app.post('/api/projects',
  upload.fields([{ name: 'avatar' }, { name: 'project_thumbnail' }, { name: 'project_hd' }]),
  async (req, res) => {
    const { id, template_id, state } = req.body;
    const av = toRel(req.files?.['avatar']?.[0]?.path);
    const now = new Date().toISOString();

    // Thumbnail: small preview for list view
    let thumbRel = null;
    if (req.files?.['project_thumbnail']?.[0]) {
      const rawThumb = req.files['project_thumbnail'][0].path;
      const resizedThumb = rawThumb.replace(/(\.\w+)$/, '-sm$1');
      try {
        await sharp(rawThumb).resize(400, 400, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(resizedThumb);
        thumbRel = toRel(resizedThumb);
      } catch (e) {
        thumbRel = toRel(rawThumb);
      }
    }

    // HD image: full quality export generated on every save
    let hdRel = null;
    if (req.files?.['project_hd']?.[0]) {
      hdRel = toRel(req.files['project_hd'][0].path);
    }

    if (id && id !== 'undefined' && id !== 'null') {
      let sql = 'UPDATE projects SET state = ?, last_saved_at = ?' +
        (av ? ', avatar_path = ?' : '') +
        (thumbRel ? ', thumbnail_path = ?' : '') +
        (hdRel ? ', export_path = ?' : '') +
        ' WHERE id = ?';
      let p = [state, now];
      if (av) p.push(av);
      if (thumbRel) p.push(thumbRel);
      if (hdRel) p.push(hdRel);
      p.push(id);
      db.run(sql, p, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
          // Project was deleted by admin — recreate it so user doesn't lose work
          db.run(
            'INSERT INTO projects (template_id, avatar_path, state, thumbnail_path, export_path, last_saved_at) VALUES (?, ?, ?, ?, ?, ?)',
            [template_id, av, state, thumbRel, hdRel, now],
            function(err2) {
              if (err2) return res.status(500).json({ error: err2.message });
              res.json({ id: this.lastID, recreated: true });
            }
          );
        } else {
          res.json({ id });
        }
      });
    } else {
      db.run(
        'INSERT INTO projects (template_id, avatar_path, state, thumbnail_path, export_path, last_saved_at) VALUES (?, ?, ?, ?, ?, ?)',
        [template_id, av, state, thumbRel, hdRel, now],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID });
        }
      );
    }
  }
);

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

// ── Export ─────────────────────────────────────────────────
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

// ── Serve client build + SPA fallback ─────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('ROOT_DIR:', ROOT_DIR);
});

const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/uploads') || req.path.startsWith('/exports')) return res.status(404).end();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}
