import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function initDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filesDir = path.join(dataDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  const dbPath = path.join(dataDir, 'fileshare.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT,
      delete_after_download INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS texts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return { db, filesDir };
}
