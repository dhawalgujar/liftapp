const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { seedDefaultRoutine, checkAndReSeed } = require('./seed');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Auth ──────────────────────────────────────────────────────────────────────

// Login / register (username only)
app.post('/api/auth/login', (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: 'Username required' });
  const name = username.trim();

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
  if (!user) {
    const id = uuid();
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, name);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    seedDefaultRoutine(user.id);
  }
  res.json({ id: user.id, username: user.username });
});

// ── Routines ──────────────────────────────────────────────────────────────────

// Get full routine tree for a user
app.get('/api/users/:userId/routine', (req, res) => {
  const { userId } = req.params;
  const routine = db.prepare('SELECT * FROM routines WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').get(userId);
  if (!routine) return res.status(404).json({ error: 'No routine found' });

  const days = db.prepare('SELECT * FROM routine_days WHERE routine_id = ? ORDER BY sort_order').all(routine.id);
  for (const day of days) {
    const sections = db.prepare('SELECT * FROM sections WHERE day_id = ? ORDER BY sort_order').all(day.id);
    for (const section of sections) {
      section.exercises = db.prepare("SELECT * FROM exercises WHERE section_id = ? AND (archived = 0 OR archived IS NULL) ORDER BY sort_order").all(section.id);
    }
    day.sections = sections;
  }
  routine.days = days;
  res.json(routine);
});

// Add exercise to a section
app.post('/api/sections/:sectionId/exercises', (req, res) => {
  const { sectionId } = req.params;
  const { name, sets, reps } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM exercises WHERE section_id = ?').get(sectionId);
  const id = uuid();
  db.prepare('INSERT INTO exercises (id, section_id, name, sets, reps, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, sectionId, name.trim(), sets || 3, reps || '8–10', (maxOrder?.m ?? -1) + 1);
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
  res.json(ex);
});

// Remove exercise
app.delete('/api/exercises/:exerciseId', (req, res) => {
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.exerciseId);
  res.json({ ok: true });
});

// Update exercise sets count (add/remove a set)
app.patch('/api/exercises/:exerciseId', (req, res) => {
  const { sets, name, reps } = req.body;
  const updates = [];
  const vals = [];
  if (sets !== undefined) { updates.push('sets = ?'); vals.push(sets); }
  if (name !== undefined) { updates.push('name = ?'); vals.push(name); }
  if (reps !== undefined) { updates.push('reps = ?'); vals.push(reps); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.exerciseId);
  db.prepare(`UPDATE exercises SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.exerciseId);
  res.json(ex);
});

// Add day to a routine
app.post('/api/routines/:routineId/days', (req, res) => {
  const { routineId } = req.params;
  const { day_name, focus, day_label } = req.body;
  if (!day_name || !focus) return res.status(400).json({ error: 'day_name and focus required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM routine_days WHERE routine_id = ?').get(routineId);
  const count = db.prepare('SELECT COUNT(*) as c FROM routine_days WHERE routine_id = ?').get(routineId);
  const dayNum = count.c + 1;
  const id = uuid();
  const label = day_label && day_label.trim() ? day_label.trim() : `Day ${dayNum}`;
  db.prepare('INSERT INTO routine_days (id, routine_id, day_key, day_label, day_name, focus, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, routineId, `day${dayNum}`, label, day_name.trim(), focus.trim(), (maxOrder?.m ?? -1) + 1);
  const day = db.prepare('SELECT * FROM routine_days WHERE id = ?').get(id);
  day.sections = [];
  res.json(day);
});

// Update day name / focus
app.patch('/api/days/:dayId', (req, res) => {
  const { day_label, day_name, focus } = req.body;
  const updates = [], vals = [];
  if (day_label !== undefined) { updates.push('day_label = ?'); vals.push(day_label.trim()); }
  if (day_name !== undefined)  { updates.push('day_name = ?');  vals.push(day_name.trim()); }
  if (focus !== undefined)     { updates.push('focus = ?');     vals.push(focus.trim()); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.dayId);
  db.prepare(`UPDATE routine_days SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM routine_days WHERE id = ?').get(req.params.dayId));
});

// Delete a day (cascades to sections, exercises, sessions, set_logs via FK)
app.delete('/api/days/:dayId', (req, res) => {
  db.prepare('DELETE FROM routine_days WHERE id = ?').run(req.params.dayId);
  res.json({ ok: true });
});

// Add section to a day
app.post('/api/days/:dayId/sections', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM sections WHERE day_id = ?').get(req.params.dayId);
  const id = uuid();
  db.prepare('INSERT INTO sections (id, day_id, name, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, req.params.dayId, name.trim(), (maxOrder?.m ?? -1) + 1);
  res.json(db.prepare('SELECT * FROM sections WHERE id = ?').get(id));
});

// Rename a section
app.patch('/api/sections/:sectionId', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE sections SET name = ? WHERE id = ?').run(name.trim(), req.params.sectionId);
  res.json(db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.sectionId));
});

// Delete a section (cascades to exercises via FK)
app.delete('/api/sections/:sectionId', (req, res) => {
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.sectionId);
  res.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

// Get or create session for user/day/week
app.get('/api/users/:userId/session', (req, res) => {
  const { userId } = req.params;
  const { dayId, week } = req.query;
  if (!dayId || !week) return res.status(400).json({ error: 'dayId and week required' });

  const routine = db.prepare('SELECT * FROM routines WHERE user_id = ?').get(userId);
  if (!routine) return res.status(404).json({ error: 'No routine' });

  let session = db.prepare('SELECT * FROM workout_sessions WHERE user_id = ? AND day_id = ? AND week_num = ? AND (archived = 0 OR archived IS NULL)')
    .get(userId, dayId, +week);

  if (!session) {
    const id = uuid();
    db.prepare('INSERT INTO workout_sessions (id, user_id, routine_id, day_id, week_num) VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, routine.id, dayId, +week);
    session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(id);
  }

  const logs = db.prepare('SELECT * FROM set_logs WHERE session_id = ?').all(session.id);
  res.json({ session, logs });
});

// Upsert a set log
app.put('/api/sessions/:sessionId/sets', (req, res) => {
  const { sessionId } = req.params;
  const { exerciseId, setIndex, weightLbs, reps, done, substitutedExerciseName, substitutedLibraryId } = req.body;

  const existing = db.prepare('SELECT * FROM set_logs WHERE session_id = ? AND exercise_id = ? AND set_index = ?')
    .get(sessionId, exerciseId, setIndex);

  if (existing) {
    const updates = [];
    const vals = [];
    if (weightLbs !== undefined) { updates.push('weight_lbs = ?'); vals.push(weightLbs === '' ? null : +weightLbs); }
    if (reps !== undefined) { updates.push('reps = ?'); vals.push(reps === '' ? null : +reps); }
    if (done !== undefined) { updates.push('done = ?'); vals.push(done ? 1 : 0); }
    if (substitutedExerciseName !== undefined) { updates.push('substituted_exercise_name = ?'); vals.push(substitutedExerciseName || null); }
    if (substitutedLibraryId !== undefined) { updates.push('substituted_library_id = ?'); vals.push(substitutedLibraryId || null); }
    if (updates.length) {
      vals.push(existing.id);
      db.prepare(`UPDATE set_logs SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
    const log = db.prepare('SELECT * FROM set_logs WHERE id = ?').get(existing.id);
    _checkAutoComplete(sessionId);
    return res.json(log);
  }

  const id = uuid();
  db.prepare('INSERT INTO set_logs (id, session_id, exercise_id, set_index, weight_lbs, reps, done, substituted_exercise_name, substituted_library_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, sessionId, exerciseId, setIndex,
      weightLbs === '' ? null : (weightLbs ?? null),
      reps === '' ? null : (reps ?? null),
      done ? 1 : 0,
      substitutedExerciseName || null,
      substitutedLibraryId || null);
  _checkAutoComplete(sessionId);
  res.json(db.prepare('SELECT * FROM set_logs WHERE id = ?').get(id));
});

// Manually complete entire routine session
app.post('/api/sessions/:sessionId/complete', (req, res) => {
  db.prepare("UPDATE workout_sessions SET completed = 1, manually_completed = 1, completed_at = datetime('now') WHERE id = ?")
    .run(req.params.sessionId);
  res.json({ ok: true });
});

// Reset session completion
app.post('/api/sessions/:sessionId/reset', (req, res) => {
  db.prepare('UPDATE workout_sessions SET completed = 0, manually_completed = 0, completed_at = NULL WHERE id = ?')
    .run(req.params.sessionId);
  res.json({ ok: true });
});

// Substitute exercise for all sets in a session
app.put('/api/sessions/:sessionId/exercises/:exerciseId/substitute', (req, res) => {
  const { sessionId, exerciseId } = req.params;
  const { libraryExerciseId, libraryExerciseName } = req.body;

  // Validate that the session exists
  const session = db.prepare('SELECT id FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Determine substitution values
  const hasSubstitution = !!libraryExerciseName;

  if (hasSubstitution) {
    // Set substitution on all set_logs for this exercise in this session
    db.prepare(`
      UPDATE set_logs
      SET substituted_exercise_name = ?, substituted_library_id = ?
      WHERE session_id = ? AND exercise_id = ?
    `).run(libraryExerciseName, libraryExerciseId, sessionId, exerciseId);
  } else {
    // Clear substitution on all set_logs for this exercise in this session
    db.prepare(`
      UPDATE set_logs
      SET substituted_exercise_name = NULL, substituted_library_id = NULL
      WHERE session_id = ? AND exercise_id = ?
    `).run(sessionId, exerciseId);
  }

  res.json({
    ok: true,
    substituted: hasSubstitution,
    exerciseId,
    substitutedExerciseName: hasSubstitution ? libraryExerciseName : null
  });
});

// Reset all weeks for a user — archives every session so W1 starts fresh.
// Historical data is preserved for tracking via the archived flag.
app.post('/api/users/:userId/reset-weeks', (req, res) => {
  const { userId } = req.params;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Archive all sessions instead of deleting — set_logs stay for history/progress
  const info = db.prepare(
    'UPDATE workout_sessions SET archived = 1 WHERE user_id = ? AND archived = 0'
  ).run(userId);

  res.json({ ok: true, sessionsArchived: info.changes });
});

function _checkAutoComplete(sessionId) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session || session.completed) return;

  const day = db.prepare('SELECT * FROM routine_days WHERE id = ?').get(session.day_id);
  if (!day) return;

  const sections = db.prepare('SELECT * FROM sections WHERE day_id = ?').all(day.id);
  let totalSets = 0;
  const exerciseIds = [];
  for (const sec of sections) {
    const exs = db.prepare("SELECT * FROM exercises WHERE section_id = ? AND (archived = 0 OR archived IS NULL)").all(sec.id);
    for (const ex of exs) { totalSets += ex.sets; exerciseIds.push(ex.id); }
  }

  if (!totalSets || !exerciseIds.length) return;
  const doneSets = db.prepare(
    `SELECT COUNT(*) as c FROM set_logs WHERE session_id = ? AND done = 1 AND exercise_id IN (${exerciseIds.map(() => '?').join(',')})`
  ).get(sessionId, ...exerciseIds);

  if (doneSets.c >= totalSets) {
    db.prepare("UPDATE workout_sessions SET completed = 1, completed_at = datetime('now') WHERE id = ?").run(sessionId);
  }
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

app.get('/api/users/:userId/heatmap/:year', (req, res) => {
  const { userId, year } = req.params;
  const yr = parseInt(year);
  if (!yr) return res.status(400).json({ error: 'Valid year required' });

  // Get all completed sessions for this year with completed_at dates
  const sessions = db.prepare(`
    SELECT completed_at FROM workout_sessions
    WHERE user_id = ? AND completed = 1 AND completed_at IS NOT NULL
    AND strftime('%Y', completed_at) = ?
    ORDER BY completed_at
  `).all(userId, String(yr));

  // Build date counts: { "YYYY-MM-DD": count }
  const dateCounts = {};
  const monthTotals = [0,0,0,0,0,0,0,0,0,0,0,0]; // Jan-Dec (0-indexed)
  let yearTotal = 0;

  for (const s of sessions) {
    // Parse completed_at (format: "YYYY-MM-DD HH:MM:SS")
    const dateStr = s.completed_at.split(' ')[0]; // "YYYY-MM-DD"
    dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
    const month = parseInt(dateStr.split('-')[1]) - 1; // 0-indexed
    monthTotals[month]++;
    yearTotal++;
  }

  // Build year grid: 12 months, each with day cells
  const yearGrid = [];
  for (let m = 1; m <= 12; m++) {
    const firstDay = new Date(yr, m - 1, 1);
    const daysInMonth = new Date(yr, m, 0).getDate();
    const startDow = (firstDay.getDay() + 6) % 7; // Monday=0, Sunday=6
    const cells = [];

    // Day cells: 1 = has session, 0 = no session
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push(dateCounts[key] > 0 ? 1 : 0);
    }

    yearGrid.push({ month: m, startDow, cells });
  }

  res.json({ year: yr, dateCounts, monthTotals, yearTotal, yearGrid });
});

// ── History ───────────────────────────────────────────────────────────────────

app.get('/api/users/:userId/history', (req, res) => {
  const sessions = db.prepare(`
    SELECT ws.*, rd.day_key, rd.focus, rd.day_label
    FROM workout_sessions ws
    JOIN routine_days rd ON rd.id = ws.day_id
    WHERE ws.user_id = ?
    ORDER BY ws.created_at DESC
  `).all(req.params.userId);

  const result = sessions.map(s => {
    const logs = db.prepare('SELECT * FROM set_logs WHERE session_id = ?').all(s.id);
    return { ...s, logs };
  });
  res.json(result);
});

// ── Progress ──────────────────────────────────────────────────────────────────

app.get('/api/users/:userId/progress/:exerciseId', (req, res) => {
  const { userId, exerciseId } = req.params;
  const rows = db.prepare(`
    SELECT sl.*, ws.week_num, ws.created_at as session_date
    FROM set_logs sl
    JOIN workout_sessions ws ON ws.id = sl.session_id
    WHERE ws.user_id = ? AND sl.exercise_id = ? AND sl.weight_lbs IS NOT NULL
      AND sl.substituted_exercise_name IS NULL
    ORDER BY ws.week_num, ws.created_at
  `).all(userId, exerciseId);
  res.json(rows);
});

// Progress by exercise name (includes substituted exercises)
app.get('/api/users/:userId/progress-by-name/:exerciseName', (req, res) => {
  const { userId } = req.params;
  const exerciseName = decodeURIComponent(req.params.exerciseName);
  const rows = db.prepare(`
    SELECT sl.*, ws.week_num, ws.created_at as session_date
    FROM set_logs sl
    JOIN workout_sessions ws ON ws.id = sl.session_id
    JOIN exercises ex ON ex.id = sl.exercise_id
    WHERE ws.user_id = ?
      AND (
        sl.substituted_exercise_name = ?
        OR (sl.substituted_exercise_name IS NULL AND ex.name = ?)
      )
      AND sl.weight_lbs IS NOT NULL
    ORDER BY ws.week_num, ws.created_at
  `).all(userId, exerciseName, exerciseName);
  res.json(rows);
});

// ── Exercise Library ──────────────────────────────────────────────────────────

app.get('/api/users/:userId/library', (req, res) => {
  const rows = db.prepare('SELECT * FROM exercise_library WHERE user_id = ? ORDER BY name').all(req.params.userId);
  res.json(rows);
});

app.post('/api/users/:userId/library', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuid();
  db.prepare('INSERT INTO exercise_library (id, user_id, name) VALUES (?, ?, ?)').run(id, req.params.userId, name.trim());
  res.json(db.prepare('SELECT * FROM exercise_library WHERE id = ?').get(id));
});

// Get previously-used substitutions for a specific exercise
app.get('/api/users/:userId/exercises/:exerciseId/substitution-history', (req, res) => {
  const { userId, exerciseId } = req.params;
  const rows = db.prepare(`
    SELECT DISTINCT sl.substituted_exercise_name AS name, sl.substituted_library_id AS libraryId
    FROM set_logs sl
    JOIN workout_sessions ws ON ws.id = sl.session_id
    WHERE sl.exercise_id = ?
      AND sl.substituted_exercise_name IS NOT NULL
      AND ws.user_id = ?
    ORDER BY sl.substituted_exercise_name
  `).all(exerciseId, userId);
  res.json(rows);
});

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Re-seed on startup if DEFAULT_PLAN changed ─────────────────────────────────
checkAndReSeed();

const PORT = process.env.PORT || 7700;
app.listen(PORT, () => console.log(`LIFT running on http://localhost:${PORT}`));
