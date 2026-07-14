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
// Supports optional ?routineId= query param:
//   - Without param: return the active routine (from active_routine_id, fallback to is_default)
//   - With param: return the specified routine
app.get('/api/users/:userId/routine', (req, res) => {
  const { userId } = req.params;
  const { routineId } = req.query;

  let routine;
  if (routineId) {
    // Return the specified routine
    routine = db.prepare('SELECT * FROM routines WHERE id = ? AND user_id = ?').get(routineId, userId);
  } else {
    // Return the active routine (from active_routine_id column, fallback to is_default)
    const user = db.prepare('SELECT active_routine_id FROM users WHERE id = ?').get(userId);
    if (user && user.active_routine_id) {
      routine = db.prepare('SELECT * FROM routines WHERE id = ? AND user_id = ?').get(user.active_routine_id, userId);
    }
    if (!routine) {
      routine = db.prepare('SELECT * FROM routines WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').get(userId);
    }
  }

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

// ── Routine Management ────────────────────────────────────────────────────────

// List all routines for a user (with day counts)
app.get('/api/users/:userId/routines', (req, res) => {
  const { userId } = req.params;
  const routines = db.prepare(`
    SELECT r.id, r.name, r.is_default, r.created_at,
           COUNT(rd.id) AS day_count
    FROM routines r
    LEFT JOIN routine_days rd ON rd.routine_id = r.id
    WHERE r.user_id = ?
    GROUP BY r.id
    ORDER BY r.is_default DESC, r.created_at ASC
  `).all(userId);
  res.json(routines);
});

// Create a new custom routine (split)
app.post('/api/users/:userId/routines', (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }

  // Enforce max 3 routines (1 default + 2 custom)
  const count = db.prepare('SELECT COUNT(*) AS c FROM routines WHERE user_id = ?').get(userId);
  if (count.c >= 3) {
    return res.status(400).json({ error: 'You have reached the maximum number of splits (2 custom + 1 default). Delete an existing split to create a new one.' });
  }

  const id = uuid();
  db.prepare('INSERT INTO routines (id, user_id, name, is_default) VALUES (?, ?, ?, 0)')
    .run(id, userId, name.trim());

  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(id);
  res.json({ ...routine, day_count: 0 });
});

// Rename a routine
app.patch('/api/routines/:routineId', (req, res) => {
  const { routineId } = req.params;
  const { name, user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }

  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(routineId);
  if (!routine) {
    return res.status(404).json({ error: 'Routine not found' });
  }

  if (routine.user_id !== user_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (routine.is_default) {
    return res.status(403).json({ error: 'Cannot rename the default routine' });
  }

  db.prepare('UPDATE routines SET name = ? WHERE id = ?').run(name.trim(), routineId);
  const updated = db.prepare('SELECT * FROM routines WHERE id = ?').get(routineId);
  res.json(updated);
});

// Delete a routine (cascade: days → sections → exercises → sessions → set_logs)
app.delete('/api/routines/:routineId', (req, res) => {
  const { routineId } = req.params;
  const user_id = req.query.user_id || req.body?.user_id;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }

  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(routineId);
  if (!routine) {
    return res.status(404).json({ error: 'Routine not found' });
  }

  if (routine.user_id !== user_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (routine.is_default) {
    return res.status(403).json({ error: 'Cannot delete the default routine' });
  }

  // Cannot delete the last remaining routine
  const count = db.prepare('SELECT COUNT(*) AS c FROM routines WHERE user_id = ?').get(routine.user_id);
  if (count.c <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last remaining split' });
  }

  // If deleting the active routine, switch active to default
  const user = db.prepare('SELECT active_routine_id FROM users WHERE id = ?').get(routine.user_id);
  if (user && user.active_routine_id === routineId) {
    const defaultRoutine = db.prepare('SELECT id FROM routines WHERE user_id = ? AND is_default = 1').get(routine.user_id);
    db.prepare('UPDATE users SET active_routine_id = ? WHERE id = ?')
      .run(defaultRoutine ? defaultRoutine.id : null, routine.user_id);
  }

  // Delete routine (FK cascades handle everything)
  db.prepare('DELETE FROM routines WHERE id = ?').run(routineId);
  res.json({ ok: true });
});

// Set active routine + archive existing sessions
app.patch('/api/users/:userId/active-routine', (req, res) => {
  const { userId } = req.params;
  const { routine_id } = req.body;

  if (!routine_id) {
    return res.status(400).json({ error: 'routine_id required' });
  }

  // Validate routine exists and belongs to user
  const routine = db.prepare('SELECT * FROM routines WHERE id = ? AND user_id = ?').get(routine_id, userId);
  if (!routine) {
    return res.status(404).json({ error: 'Routine not found' });
  }

  // Archive only the CURRENT active routine's sessions (not ALL sessions)
  const currentActive = db.prepare('SELECT active_routine_id FROM users WHERE id = ?').get(userId);
  let archiveInfo = { changes: 0 };
  if (currentActive?.active_routine_id) {
    const currentDays = db.prepare('SELECT id FROM routine_days WHERE routine_id = ?').all(currentActive.active_routine_id);
    const dayIds = currentDays.map(d => d.id);
    if (dayIds.length > 0) {
      const placeholders = dayIds.map(() => '?').join(',');
      archiveInfo = db.prepare(
        `UPDATE workout_sessions SET archived = 1 WHERE user_id = ? AND archived = 0 AND day_id IN (${placeholders})`
      ).run(userId, ...dayIds);
    }
  }

  // Set the new active routine
  db.prepare('UPDATE users SET active_routine_id = ? WHERE id = ?').run(routine_id, userId);

  res.json({ ok: true, sessionsArchived: archiveInfo.changes });
});

// Parse import text and create a complete routine
app.post('/api/routines/import', (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }

  const { userId, name: providedName } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  // Enforce max 3 routines (1 default + 2 custom)
  const count = db.prepare('SELECT COUNT(*) AS c FROM routines WHERE user_id = ?').get(userId);
  if (count.c >= 3) {
    return res.status(400).json({ error: 'You have reached the maximum number of splits (2 custom + 1 default). Delete an existing split to create a new one.' });
  }

  // Parse the import text
  const lines = text.split('\n');
  let splitName = null;
  let currentDay = null;
  let currentSection = null;
  const days = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip blank lines

    if (line.startsWith('Split:')) {
      splitName = line.slice(6).trim();
      if (!splitName) {
        return res.status(400).json({ error: `Parse error on line ${i + 1}: Split name cannot be empty` });
      }
      continue;
    }

    if (line.startsWith('Day:')) {
      const parts = line.slice(4).split('|').map(s => s.trim());
      if (parts.length < 2) {
        return res.status(400).json({ error: `Parse error on line ${i + 1}: expected Day: Label | Name | Focus` });
      }
      currentDay = {
        label: parts[0],
        name: parts[1],
        focus: parts[2] || '',
        sections: []
      };
      days.push(currentDay);
      currentSection = null;
      continue;
    }

    if (line.startsWith('Section:')) {
      if (!currentDay) {
        return res.status(400).json({ error: `Parse error on line ${i + 1}: Section must follow a Day line` });
      }
      currentSection = { name: line.slice(8).trim(), exercises: [] };
      currentDay.sections.push(currentSection);
      continue;
    }

    if (line.startsWith('Exercise:')) {
      if (!currentSection) {
        return res.status(400).json({ error: `Parse error on line ${i + 1}: Exercise must follow a Section line` });
      }
      const parts = line.slice(9).split('|').map(s => s.trim());
      if (!parts[0]) {
        return res.status(400).json({ error: `Parse error on line ${i + 1}: Exercise name cannot be empty` });
      }
      currentSection.exercises.push({
        name: parts[0],
        sets: parseInt(parts[1]) || 3,
        reps: parts[2] || '8–10'
      });
      continue;
    }

    return res.status(400).json({ error: `Parse error on line ${i + 1}: expected Exercise: Name | Sets | Reps` });
  }

  // Use name from request body if provided, otherwise require "Split:" line
  if (!splitName && providedName && providedName.trim()) {
    splitName = providedName.trim();
  }
  if (!splitName) {
    return res.status(400).json({ error: 'Missing split name. Add "Split: Name" line or provide a name in the request body.' });
  }
  if (days.length === 0) {
    return res.status(400).json({ error: 'No Day: lines found' });
  }

  // Create routine + days + sections + exercises in a transaction
  let routineId, daysCreated = 0, sectionsCreated = 0, exercisesCreated = 0;

  const createRoutine = db.transaction(() => {
    routineId = uuid();
    db.prepare('INSERT INTO routines (id, user_id, name, is_default) VALUES (?, ?, ?, 0)')
      .run(routineId, userId, splitName);

    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const dayData = days[dayIdx];
      const dayId = uuid();
      db.prepare(
        'INSERT INTO routine_days (id, routine_id, day_key, day_label, day_name, focus, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(dayId, routineId, `day${dayIdx + 1}`, dayData.label || `Day ${dayIdx + 1}`, dayData.name, dayData.focus, dayIdx);
      daysCreated++;

      for (let secIdx = 0; secIdx < dayData.sections.length; secIdx++) {
        const secData = dayData.sections[secIdx];
        const secId = uuid();
        db.prepare('INSERT INTO sections (id, day_id, name, sort_order) VALUES (?, ?, ?, ?)')
          .run(secId, dayId, secData.name, secIdx);
        sectionsCreated++;

        for (let exIdx = 0; exIdx < secData.exercises.length; exIdx++) {
          const exData = secData.exercises[exIdx];
          db.prepare(
            'INSERT INTO exercises (id, section_id, name, sets, reps, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(uuid(), secId, exData.name, exData.sets, exData.reps, exIdx);
          exercisesCreated++;
        }
      }
    }
  });

  createRoutine();

  res.json({
    id: routineId,
    name: splitName,
    is_default: 0,
    days_created: daysCreated,
    sections_created: sectionsCreated,
    exercises_created: exercisesCreated
  });
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
  const { sets, name, reps, sort_order } = req.body;
  const updates = [];
  const vals = [];
  if (sets !== undefined) { updates.push('sets = ?'); vals.push(sets); }
  if (name !== undefined) { updates.push('name = ?'); vals.push(name); }
  if (reps !== undefined) { updates.push('reps = ?'); vals.push(reps); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); vals.push(sort_order); }
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
    // Read current_cycle to assign correct cycle number to new sessions
    const user = db.prepare('SELECT current_cycle FROM users WHERE id = ?').get(userId);
    const cycleNum = user?.current_cycle || 1;
    db.prepare('INSERT INTO workout_sessions (id, user_id, routine_id, day_id, week_num, cycle_num) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, userId, routine.id, dayId, +week, cycleNum);
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
  const user = db.prepare('SELECT id, current_cycle FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  // Increment cycle counter before archiving
  const newCycle = (user.current_cycle || 1) + 1;
  db.prepare('UPDATE users SET current_cycle = ? WHERE id = ?').run(newCycle, userId);
  
  // Archive all sessions instead of deleting — set_logs stay for history/progress
  const info = db.prepare(
    'UPDATE workout_sessions SET archived = 1 WHERE user_id = ? AND archived = 0'
  ).run(userId);
  res.json({ ok: true, sessionsArchived: info.changes, currentCycle: newCycle });
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

  // Get all completed sessions for this year, bucketed by local-time day
  const sessions = db.prepare(`
    SELECT date(completed_at, 'localtime') AS day
    FROM workout_sessions
    WHERE user_id = ? AND completed = 1 AND completed_at IS NOT NULL
      AND strftime('%Y', completed_at, 'localtime') = ?
    ORDER BY completed_at
  `).all(userId, String(yr));

  // Build date counts: { "YYYY-MM-DD": count }
  const dateCounts = {};
  const monthTotals = [0,0,0,0,0,0,0,0,0,0,0,0]; // Jan-Dec (0-indexed)
  let yearTotal = 0;

  for (const s of sessions) {
    const dateStr = s.day;
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
    SELECT sl.*, ws.week_num, ws.cycle_num, ws.created_at as session_date
    FROM set_logs sl
    JOIN workout_sessions ws ON ws.id = sl.session_id
    WHERE ws.user_id = ? AND sl.exercise_id = ? AND sl.weight_lbs IS NOT NULL
      AND sl.substituted_exercise_name IS NULL
    ORDER BY ws.cycle_num ASC, ws.week_num ASC, ws.created_at ASC
  `).all(userId, exerciseId);
  res.json(rows);
});

// Progress by exercise name (includes substituted exercises)
app.get('/api/users/:userId/progress-by-name/:exerciseName', (req, res) => {
  const { userId } = req.params;
  const exerciseName = decodeURIComponent(req.params.exerciseName);
  const rows = db.prepare(`
    SELECT sl.*, ws.week_num, ws.cycle_num, ws.created_at as session_date
    FROM set_logs sl
    JOIN workout_sessions ws ON ws.id = sl.session_id
    JOIN exercises ex ON ex.id = sl.exercise_id
    WHERE ws.user_id = ?
      AND (
        sl.substituted_exercise_name = ?
        OR (sl.substituted_exercise_name IS NULL AND ex.name = ?)
      )
      AND sl.weight_lbs IS NOT NULL
    ORDER BY ws.cycle_num ASC, ws.week_num ASC, ws.created_at ASC
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
