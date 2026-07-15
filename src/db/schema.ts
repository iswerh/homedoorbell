/**
 * SQLite schema + database singleton (expo-sqlite).
 *
 * Tables:
 *   notifications  -- one row per doorbell ring (always logged, regardless of alert filter)
 *   trusted_faces  -- enrolled trusted individuals: name + face embedding vector
 *   config         -- key/value app configuration (host, alert filter, retention, ...)
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('doorbell.db');
    migrate(db);
  }
  return db;
}

function migrate(database: SQLite.SQLiteDatabase): void {
  database.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,          -- unix ms
      visitor TEXT NOT NULL,               -- matched trusted name or 'Unknown'
      trusted INTEGER NOT NULL DEFAULT 0,  -- 1 if visitor matched a trusted face
      snapshot_uri TEXT,                   -- local file uri of the captured JPEG
      unlocked INTEGER NOT NULL DEFAULT 0  -- 1 if the door was unlocked during this ring
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_timestamp
      ON notifications (timestamp);

    CREATE TABLE IF NOT EXISTS trusted_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      embedding TEXT NOT NULL,             -- JSON array of numbers
      method TEXT NOT NULL,                -- 'tflite' | 'stub' (embeddings only match same-method)
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// config helpers
// ---------------------------------------------------------------------------
export function getConfig(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>(
    'SELECT value FROM config WHERE key = ?',
    [key]
  );
  return row ? row.value : null;
}

export function setConfig(key: string, value: string): void {
  getDb().runSync(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}
