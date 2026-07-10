const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'lift.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routine_days (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    day_key TEXT NOT NULL,
    day_label TEXT NOT NULL,
    day_name TEXT NOT NULL,
    focus TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    day_id TEXT NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sets INTEGER NOT NULL DEFAULT 3,
    reps TEXT NOT NULL DEFAULT '8-10',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exercise_library (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    day_id TEXT NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
    week_num INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    manually_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS set_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    set_index INTEGER NOT NULL,
    weight_lbs REAL,
    reps INTEGER,
    done INTEGER NOT NULL DEFAULT 0
  );
`);

// Migration: add archived column if missing (for existing databases)
const columns = db.prepare("PRAGMA table_info(workout_sessions)").all();
if (!columns.find(c => c.name === 'archived')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
}

// Migration: add archived column to exercises (for re-seed without history loss)
const exColumns = db.prepare("PRAGMA table_info(exercises)").all();
if (!exColumns.find(c => c.name === 'archived')) {
  db.exec(`ALTER TABLE exercises ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
}

// Migration: add exercise substitution columns to set_logs
const slColumns = db.prepare("PRAGMA table_info(set_logs)").all();
if (!slColumns.find(c => c.name === 'substituted_exercise_name')) {
  db.exec(`ALTER TABLE set_logs ADD COLUMN substituted_exercise_name TEXT`);
}
if (!slColumns.find(c => c.name === 'substituted_library_id')) {
  db.exec(`ALTER TABLE set_logs ADD COLUMN substituted_library_id TEXT`);
}

// Seed versioning: tracks the hash of the current DEFAULT_PLAN so we can
// detect when seed.js has been updated and re-seed existing users.
db.exec(`
  CREATE TABLE IF NOT EXISTS seed_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

module.exports = db;
