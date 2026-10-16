import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE) || 512 * 1024 * 1024;

const { db, filesDir } = initDb(DATA_DIR);

const app = express();
app.use(express.json({ limit: '1mb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, filesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

function rowToFile(row) {
  return {
    id: row.id,
    name: row.original_name,
    size: row.size,
    mimeType: row.mime_type,
    deleteAfterDownload: Boolean(row.delete_after_download),
    createdAt: row.created_at,
  };
}

function deleteFileRecord(id) {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!row) return false;
  const filePath = path.join(filesDir, row.stored_name);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  db.prepare('DELETE FROM files WHERE id = ?').run(id);
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/files', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM files ORDER BY created_at DESC')
    .all();
  res.json(rows.map(rowToFile));
});

app.post('/api/files', upload.array('files'), (req, res) => {
  const deleteAfter =
    req.body.deleteAfterDownload === 'true' ||
    req.body.deleteAfterDownload === true ||
    req.body.deleteAfterDownload === '1';

  if (!req.files?.length) {
    return res.status(400).json({ error: 'Geen bestanden ontvangen' });
  }

  const insert = db.prepare(`
    INSERT INTO files (id, original_name, stored_name, size, mime_type, delete_after_download, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const now = Date.now();
  for (const file of req.files) {
    const id = randomUUID();
    insert.run(
      id,
      file.originalname,
      file.filename,
      file.size,
      file.mimetype || null,
      deleteAfter ? 1 : 0,
      now,
    );
    created.push(
      rowToFile({
        id,
        original_name: file.originalname,
        stored_name: file.filename,
        size: file.size,
        mime_type: file.mimetype,
        delete_after_download: deleteAfter ? 1 : 0,
        created_at: now,
      }),
    );
  }

  res.status(201).json(created);
});

app.get('/api/files/:id/download', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Bestand niet gevonden' });
  }

  const filePath = path.join(filesDir, row.stored_name);
  if (!fs.existsSync(filePath)) {
    db.prepare('DELETE FROM files WHERE id = ?').run(row.id);
    return res.status(404).json({ error: 'Bestand niet meer op de server' });
  }

  res.download(filePath, row.original_name, (err) => {
    if (err && !res.headersSent) {
      return res.status(500).json({ error: 'Download mislukt' });
    }
    if (!err && row.delete_after_download) {
      deleteFileRecord(row.id);
    }
  });
});

app.delete('/api/files/:id', (req, res) => {
  if (!deleteFileRecord(req.params.id)) {
    return res.status(404).json({ error: 'Bestand niet gevonden' });
  }
  res.status(204).end();
});

app.get('/api/texts', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM texts ORDER BY created_at DESC')
    .all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
    })),
  );
});

app.post('/api/texts', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'Tekst mag niet leeg zijn' });
  }

  const id = randomUUID();
  const createdAt = Date.now();
  db.prepare('INSERT INTO texts (id, content, created_at) VALUES (?, ?, ?)').run(
    id,
    content,
    createdAt,
  );

  res.status(201).json({ id, content, createdAt });
});

app.delete('/api/texts/:id', (req, res) => {
  const result = db.prepare('DELETE FROM texts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Tekst niet gevonden' });
  }
  res.status(204).end();
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fileshare luistert op http://0.0.0.0:${PORT}`);
});
