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

// Migration: add active_routine_id column to users (for multi-split support)
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.find(c => c.name === 'active_routine_id')) {
  db.exec(`ALTER TABLE users ADD COLUMN active_routine_id TEXT`);
}

// Migration: add exercise substitution columns to set_logs
const slColumns = db.prepare("PRAGMA table_info(set_logs)").all();
if (!slColumns.find(c => c.name === 'substituted_exercise_name')) {
  db.exec(`ALTER TABLE set_logs ADD COLUMN substituted_exercise_name TEXT`);
}
if (!slColumns.find(c => c.name === 'substituted_library_id')) {
  db.exec(`ALTER TABLE set_logs ADD COLUMN substituted_library_id TEXT`);
}

// Migration: add cycle_num column to workout_sessions (for multi-cycle progress tracking)
const wsColumns = db.prepare("PRAGMA table_info(workout_sessions)").all();
if (!wsColumns.find(c => c.name === 'cycle_num')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN cycle_num INTEGER NOT NULL DEFAULT 1`);
}

// Migration: add denormalized day metadata columns to preserve history on split deletion
if (!wsColumns.find(c => c.name === 'session_day_key')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN session_day_key TEXT`);
}
if (!wsColumns.find(c => c.name === 'session_day_label')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN session_day_label TEXT`);
}
if (!wsColumns.find(c => c.name === 'session_focus')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN session_focus TEXT`);
}

// Migration: add session set stats columns (must precede table recreation below)
const wsCols2 = db.prepare("PRAGMA table_info(workout_sessions)").all();
if (!wsCols2.find(c => c.name === 'session_sets_done')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN session_sets_done INTEGER`);
}
if (!wsCols2.find(c => c.name === 'session_sets_total')) {
  db.exec(`ALTER TABLE workout_sessions ADD COLUMN session_sets_total INTEGER`);
}

// Migration: allow routine_id and day_id to be NULL so archived sessions
// can be detached from their parent routine before deletion (preserving history)
if (!wsColumns.find(c => c.name === 'routine_id' && c.notnull === 0)) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE workout_sessions_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      routine_id TEXT REFERENCES routines(id) ON DELETE CASCADE,
      day_id TEXT REFERENCES routine_days(id) ON DELETE CASCADE,
      week_num INTEGER NOT NULL,
      cycle_num INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      manually_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived INTEGER NOT NULL DEFAULT 0,
      session_day_key TEXT,
      session_day_label TEXT,
      session_focus TEXT,
      session_sets_done INTEGER,
      session_sets_total INTEGER
    );
    INSERT INTO workout_sessions_new
      SELECT id, user_id, routine_id, day_id, week_num, COALESCE(cycle_num, 1),
             completed, manually_completed, completed_at, created_at,
             COALESCE(archived, 0), session_day_key, session_day_label,
             session_focus, session_sets_done, session_sets_total
      FROM workout_sessions;
    DROP TABLE workout_sessions;
    ALTER TABLE workout_sessions_new RENAME TO workout_sessions;
  `);
  db.pragma('foreign_keys = ON');
}

// Migration: add current_cycle column to users (tracks active cycle number)
const userCycleColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userCycleColumns.find(c => c.name === 'current_cycle')) {
  db.exec(`ALTER TABLE users ADD COLUMN current_cycle INTEGER NOT NULL DEFAULT 1`);
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
