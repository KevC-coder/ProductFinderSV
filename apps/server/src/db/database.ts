import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Cada entrada es una migración; nunca editar las ya publicadas, solo agregar nuevas al final. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE watchers (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    query              TEXT    NOT NULL,
    must_keywords      TEXT    NOT NULL DEFAULT '[]',
    must_mode          TEXT    NOT NULL DEFAULT 'all',
    bonus_keywords     TEXT    NOT NULL DEFAULT '[]',
    exclude_keywords   TEXT    NOT NULL DEFAULT '[]',
    search_description INTEGER NOT NULL DEFAULT 1,
    min_price          REAL,
    max_price          REAL,
    ideal_price        REAL,
    location_slug      TEXT,
    radius_km          REAL,
    conditions         TEXT    NOT NULL DEFAULT '[]',
    max_age_hours      REAL,
    runs_per_day       INTEGER NOT NULL DEFAULT 6,
    window_start       TEXT    NOT NULL DEFAULT '07:00',
    window_end         TEXT    NOT NULL DEFAULT '23:00',
    max_details        INTEGER NOT NULL DEFAULT 5,
    active             INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
  );

  CREATE TABLE listings (
    id                TEXT PRIMARY KEY,
    title             TEXT,
    title_key         TEXT,
    description       TEXT,
    price             REAL,
    price_text        TEXT,
    currency          TEXT NOT NULL,
    location          TEXT,
    image_url         TEXT,
    url               TEXT NOT NULL,
    seller_name       TEXT,
    condition         TEXT,
    listed_at         TEXT,
    is_sold           INTEGER,
    is_pending        INTEGER,
    first_seen_at     TEXT NOT NULL,
    last_seen_at      TEXT NOT NULL,
    detail_fetched_at TEXT,
    previous_price    REAL,
    price_dropped_at  TEXT
  );

  CREATE TABLE price_history (
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price      REAL NOT NULL,
    seen_at    TEXT NOT NULL
  );
  CREATE INDEX idx_price_history_listing ON price_history(listing_id, seen_at);

  CREATE TABLE matches (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    watcher_id       INTEGER NOT NULL REFERENCES watchers(id) ON DELETE CASCADE,
    listing_id       TEXT    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    score            INTEGER NOT NULL,
    is_ideal_price   INTEGER NOT NULL DEFAULT 0,
    matched_keywords TEXT    NOT NULL DEFAULT '[]',
    status           TEXT    NOT NULL DEFAULT 'new',
    duplicate_of     TEXT,
    notified_at      TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    UNIQUE (watcher_id, listing_id)
  );
  CREATE INDEX idx_matches_watcher ON matches(watcher_id, status);

  CREATE TABLE runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    watcher_id      INTEGER REFERENCES watchers(id) ON DELETE CASCADE,
    started_at      TEXT    NOT NULL,
    finished_at     TEXT,
    status          TEXT    NOT NULL,
    found_count     INTEGER NOT NULL DEFAULT 0,
    new_count       INTEGER NOT NULL DEFAULT 0,
    details_fetched INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT
  );
  CREATE INDEX idx_runs_watcher ON runs(watcher_id, started_at);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2 — scheduler: próxima corrida y errores consecutivos por búsqueda.
  `
  ALTER TABLE watchers ADD COLUMN next_run_at TEXT;
  ALTER TABLE watchers ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
  `,
  // 3 — el bot consulta las corridas recientes en cada ciclo (tope por hora y pausa entre corridas).
  `
  CREATE INDEX idx_runs_started ON runs(started_at);
  CREATE INDEX idx_runs_finished ON runs(finished_at);
  `,
];

export type Db = DatabaseSync;

/** Abre (o crea) la base de datos y aplica las migraciones pendientes. Usa ":memory:" en tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
