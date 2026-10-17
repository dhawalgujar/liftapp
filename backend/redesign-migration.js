// Additive and restart-safe. Rollback means reverting code, not dropping snapshots:
// removing these columns/tables would destroy newly recorded historical data.
// Only the active split can inherit the legacy user's fresh-cycle counter, and
// only with no unarchived sessions (the signature of legacy reset-weeks).
function inferCycle(db, userId, routineId, allowGlobal = true) {
  const user = db.prepare('SELECT active_routine_id,current_cycle FROM users WHERE id=?').get(userId);
  const stats = db.prepare('SELECT MAX(cycle_num) latest,SUM(CASE WHEN archived=0 THEN 1 ELSE 0 END) live FROM workout_sessions WHERE user_id=? AND routine_id=?').get(userId,routineId);
  const active = db.prepare('SELECT id FROM routines WHERE user_id=? AND archived=0 ORDER BY (id=?) DESC,is_default DESC,created_at,id LIMIT 1').get(userId,user?.active_routine_id || '');
  return Math.max(stats.latest || 1, allowGlobal && active?.id===routineId && !stats.live ? user?.current_cycle || 1 : 1);
}

module.exports = function migrate(db) {
  db.transaction(() => {
    const add = (table, name, type) => {
      if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    };
    for (const table of ['routines', 'routine_days', 'sections']) add(table, 'archived', 'INTEGER NOT NULL DEFAULT 0');
    add('routine_state', 'cycle_num', 'INTEGER NOT NULL DEFAULT 1');
    for (const name of ['started_at', 'expires_at', 'finished_at', 'finish_reason', 'snapshot_json']) add('workout_sessions', name, 'TEXT');
    add('workout_sessions', 'status', "TEXT NOT NULL DEFAULT 'pending'");
    db.exec(`CREATE TABLE IF NOT EXISTS session_entries (
      session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL, name TEXT NOT NULL, weight REAL CHECK(weight >= 0),
      reps INTEGER CHECK(reps > 0), done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
      PRIMARY KEY(session_id, exercise_id));
      CREATE TABLE IF NOT EXISTS mutation_operations (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 200),
        kind TEXT NOT NULL CHECK(kind IN ('cycles','routines')),
        payload_json TEXT NOT NULL,result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id,operation_id));
      CREATE INDEX IF NOT EXISTS redesign_sessions_user ON workout_sessions(user_id, routine_id, cycle_num);
      CREATE INDEX IF NOT EXISTS redesign_sessions_expiry ON workout_sessions(expires_at) WHERE finished_at IS NULL;
      CREATE INDEX IF NOT EXISTS redesign_logs_session ON set_logs(session_id, exercise_id);
      CREATE INDEX IF NOT EXISTS redesign_days_routine ON routine_days(routine_id);
      CREATE INDEX IF NOT EXISTS redesign_sections_day ON sections(day_id);
      CREATE INDEX IF NOT EXISTS redesign_exercises_section ON exercises(section_id);
      CREATE INDEX IF NOT EXISTS redesign_routines_user ON routines(user_id);`);
    // Old GET /session used the user's first routine rather than the day's
    // routine. A day PK identifies exactly one owner. Never infer from labels,
    // missing days or another user's tree. Repair before snapshot/cycle inference.
    const repairs = db.prepare(`SELECT w.id,w.user_id,w.routine_id source,d.routine_id target,
      w.cycle_num FROM workout_sessions w JOIN routine_days d ON d.id=w.day_id
      JOIN routines actual ON actual.id=d.routine_id JOIN routines original ON original.id=w.routine_id
      WHERE w.routine_id<>d.routine_id AND actual.user_id=w.user_id AND original.user_id=w.user_id`).all();
    const sources = new Map();
    for (const s of repairs) {
      const key=JSON.stringify([s.user_id,s.source]);
      if(!sources.has(key)) sources.set(key,db.prepare('SELECT MAX(cycle_num) n FROM workout_sessions WHERE user_id=? AND routine_id=?').get(s.user_id,s.source).n);
      db.prepare(`UPDATE workout_sessions SET routine_id=?,snapshot_json=CASE WHEN snapshot_json IS NULL THEN NULL
        ELSE json_set(snapshot_json,'$.splitName',(SELECT name FROM routines WHERE id=?)) END WHERE id=?`).run(s.target,s.target,s.id);
      db.prepare(`INSERT INTO routine_state(user_id,routine_id,cycle_num) VALUES(?,?,?)
        ON CONFLICT(user_id,routine_id) DO UPDATE SET cycle_num=MAX(routine_state.cycle_num,excluded.cycle_num)`).run(s.user_id,s.target,s.cycle_num);
      const misplaced = db.prepare(`SELECT n.last_week,n.last_day_id FROM routine_state n
        JOIN routine_days d ON d.id=n.last_day_id WHERE n.user_id=? AND n.routine_id=? AND d.routine_id=?`).get(s.user_id,s.source,s.target);
      if (misplaced) {
        // Navigation saved against the wrong split follows its unambiguous day,
        // but must not overwrite an existing valid target viewing position.
        db.prepare(`UPDATE routine_state SET last_week=?,last_day_id=? WHERE user_id=? AND routine_id=?
          AND (last_day_id IS NULL OR NOT EXISTS(SELECT 1 FROM routine_days WHERE id=last_day_id AND routine_id=?))`)
          .run(misplaced.last_week,misplaced.last_day_id,s.user_id,s.target,s.target);
        db.prepare('UPDATE routine_state SET last_week=1,last_day_id=NULL WHERE user_id=? AND routine_id=?').run(s.user_id,s.source);
      }
    }
    for(const [key,previousMax] of sources) {
      const [u,r]=JSON.parse(key);
      // Only undo a polluted inferred cycle at the old maximum. A newer explicit
      // cycle and valid viewing position must not be reset by this repair.
      db.prepare(`UPDATE routine_state SET cycle_num=COALESCE((SELECT MAX(cycle_num) FROM workout_sessions WHERE user_id=? AND routine_id=?),1)
        WHERE user_id=? AND routine_id=? AND cycle_num=? AND
        (last_day_id IS NULL OR NOT EXISTS(SELECT 1 FROM routine_days WHERE id=last_day_id AND routine_id=?))`).run(u,r,u,r,previousMax,r);
    }
    // Backfill only once; never reinterpret old manual completion as a skip.
    db.prepare(`UPDATE workout_sessions SET finished_at = COALESCE(completed_at, created_at),
      finish_reason = 'legacy', status = 'completed' WHERE completed = 1 AND finished_at IS NULL`).run();
    if (!db.prepare("SELECT 1 FROM seed_meta WHERE key='redesign_v2'").get()) {
      for(const state of db.prepare('SELECT user_id,routine_id FROM routine_state').all()) {
        db.prepare('UPDATE routine_state SET cycle_num=? WHERE user_id=? AND routine_id=?')
          .run(inferCycle(db,state.user_id,state.routine_id),state.user_id,state.routine_id);
      }
    }
    // Also correct databases that already ran the earlier v2 migration. Never
    // lower explicit split progress or apply a user's global cycle to other splits.
    for(const state of db.prepare('SELECT user_id,routine_id FROM routine_state').all()) {
      db.prepare('UPDATE routine_state SET cycle_num=MAX(cycle_num,?) WHERE user_id=? AND routine_id=?')
        .run(inferCycle(db,state.user_id,state.routine_id),state.user_id,state.routine_id);
    }
    db.prepare("INSERT OR IGNORE INTO seed_meta(key,value) VALUES ('redesign_v2','1')").run();
    for(const u of new Set(repairs.map(s=>s.user_id))) {
      db.prepare(`UPDATE users SET current_cycle=COALESCE((SELECT cycle_num FROM routine_state
        WHERE user_id=users.id AND routine_id=users.active_routine_id),current_cycle) WHERE id=?`).run(u);
    }
  })();
};
module.exports.inferCycle = inferCycle;
