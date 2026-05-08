const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { seedDefaultRoutine } = require('./seed');

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
      section.exercises = db.prepare('SELECT * FROM exercises WHERE section_id = ? ORDER BY sort_order').all(section.id);
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

  let session = db.prepare('SELECT * FROM workout_sessions WHERE user_id = ? AND day_id = ? AND week_num = ?')
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
  const { exerciseId, setIndex, weightLbs, reps, done } = req.body;

  const existing = db.prepare('SELECT * FROM set_logs WHERE session_id = ? AND exercise_id = ? AND set_index = ?')
    .get(sessionId, exerciseId, setIndex);

  if (existing) {
    const updates = [];
    const vals = [];
    if (weightLbs !== undefined) { updates.push('weight_lbs = ?'); vals.push(weightLbs === '' ? null : +weightLbs); }
    if (reps !== undefined) { updates.push('reps = ?'); vals.push(reps === '' ? null : +reps); }
    if (done !== undefined) { updates.push('done = ?'); vals.push(done ? 1 : 0); }
    if (updates.length) {
      vals.push(existing.id);
      db.prepare(`UPDATE set_logs SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
    const log = db.prepare('SELECT * FROM set_logs WHERE id = ?').get(existing.id);
    _checkAutoComplete(sessionId);
    return res.json(log);
  }

  const id = uuid();
  db.prepare('INSERT INTO set_logs (id, session_id, exercise_id, set_index, weight_lbs, reps, done) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, sessionId, exerciseId, setIndex,
      weightLbs === '' ? null : (weightLbs ?? null),
      reps === '' ? null : (reps ?? null),
      done ? 1 : 0);
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

function _checkAutoComplete(sessionId) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session || session.completed) return;

  const day = db.prepare('SELECT * FROM routine_days WHERE id = ?').get(session.day_id);
  if (!day) return;

  const sections = db.prepare('SELECT * FROM sections WHERE day_id = ?').all(day.id);
  let totalSets = 0;
  const exerciseIds = [];
  for (const sec of sections) {
    const exs = db.prepare('SELECT * FROM exercises WHERE section_id = ?').all(sec.id);
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
    ORDER BY ws.week_num, ws.created_at
  `).all(userId, exerciseId);
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

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 7700;
app.listen(PORT, () => console.log(`LIFT running on http://localhost:${PORT}`));
