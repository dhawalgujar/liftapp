const db = require('./db');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');

const DEFAULT_PLAN = [
  { day: 'Monday', focus: 'Back Width + Biceps', sections: [
    { name: 'Main Lifts', exercises: [
      { name: 'Neutral Pull-Up / Neutral Lat Pulldown', sets: 4, reps: '8' },
      { name: 'Chest-Supported Row (Neutral Grip)', sets: 4, reps: '10' },
      { name: 'Incline DB Press (Semi-Neutral Grip)', sets: 3, reps: '8' },
      { name: 'Straight-Arm Cable Pulldown', sets: 3, reps: '12' }
    ]},
    { name: 'Arms + Shoulder Stability', exercises: [
      { name: 'EZ-Bar Curl', sets: 3, reps: '10' },
      { name: 'Incline DB Curl', sets: 3, reps: '10' },
      { name: 'Cable Lateral Raise', sets: 3, reps: '15' },
      { name: 'Face Pull + External Rotation', sets: 3, reps: '15' },
      { name: 'Cable External Rotation', sets: 2, reps: '15' }
    ]}
  ]},
  { day: 'Wednesday', focus: 'Shoulder Priority + Triceps', sections: [
    { name: 'Shoulder', exercises: [
      { name: 'Single-Arm Neutral Grip DB Shoulder Press', sets: 3, reps: '8 each side' },
      { name: 'Lean-Away Cable Lateral Raise', sets: 3, reps: '12' },
      { name: 'Bent-Over DB Rear Delt Fly', sets: 4, reps: '15' },
      { name: 'Seated Cable Row', sets: 3, reps: '10' },
      { name: 'Face Pull', sets: 3, reps: '15' },
      { name: 'Serratus Cable Punch / Push-Up Plus', sets: 2, reps: '15' }
    ]},
    { name: 'Triceps + Brachialis', exercises: [
      { name: 'Overhead Cable Extension', sets: 3, reps: '10' },
      { name: 'Rope Pushdown', sets: 3, reps: '12' },
      { name: 'Hammer Curl', sets: 3, reps: '12' }
    ]}
  ]},
  { day: 'Friday', focus: 'Back Thickness + Chest + Full Arm Pump', sections: [
    { name: 'Back + Chest', exercises: [
      { name: 'Single-Arm DB Row', sets: 4, reps: '8' },
      { name: 'Neutral-Grip Lat Pulldown', sets: 3, reps: '10' },
      { name: 'DB Bench Press (Semi-Neutral Grip)', sets: 3, reps: '8' },
      { name: 'Cable External Rotation', sets: 2, reps: '15' }
    ]},
    { name: 'Full Arm Finisher', exercises: [
      { name: 'Preacher Curl', sets: 3, reps: '10' },
      { name: 'Cable Curl (Supinated)', sets: 2, reps: '12' },
      { name: 'Rope Pushdown', sets: 3, reps: '12' },
      { name: 'Cross-Body Cable Extension', sets: 2, reps: '12' },
      { name: 'DB Lateral Raise', sets: 2, reps: '15' }
    ]}
  ]}
];

function seedDefaultRoutine(userId) {
  const routineId = uuid();
  db.prepare(`INSERT INTO routines (id, user_id, name, is_default) VALUES (?, ?, ?, 1)`)
    .run(routineId, userId, 'Default Routine');

  let dayOrder = 0;
  for (const [index, dayData] of DEFAULT_PLAN.entries()) {
    const num = index + 1;
    const dayId = uuid();
    db.prepare(`INSERT INTO routine_days (id, routine_id, day_key, day_label, day_name, focus, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(dayId, routineId, `day${num}`, `Day ${num}`, dayData.day, dayData.focus, dayOrder++);

    let secOrder = 0;
    for (const section of dayData.sections) {
      const secId = uuid();
      db.prepare(`INSERT INTO sections (id, day_id, name, sort_order) VALUES (?, ?, ?, ?)`)
        .run(secId, dayId, section.name, secOrder++);

      let exOrder = 0;
      for (const ex of section.exercises) {
        db.prepare(`INSERT INTO exercises (id, section_id, name, sets, reps, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(uuid(), secId, ex.name, ex.sets, ex.reps, exOrder++);
      }
    }
  }
  return routineId;
}

/**
 * Compute a deterministic hash of the current DEFAULT_PLAN.
 * Any change to exercise names, reps, sets, sections, or days
 * produces a different hash, triggering a re-seed.
 */
function computeSeedVersion() {
  const canonical = JSON.stringify(DEFAULT_PLAN);
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Load the full tree of a routine: days → sections → exercises.
 * Returns an array of day objects, each with .sections[].exercises[].
 */
function loadRoutineTree(routineId) {
  const days = db.prepare(
    'SELECT * FROM routine_days WHERE routine_id = ? ORDER BY sort_order'
  ).all(routineId);

  for (const day of days) {
    const sections = db.prepare(
      'SELECT * FROM sections WHERE day_id = ? ORDER BY sort_order'
    ).all(day.id);

    for (const section of sections) {
      section.exercises = db.prepare(
        "SELECT * FROM exercises WHERE section_id = ? AND (archived = 0 OR archived IS NULL) ORDER BY sort_order"
      ).all(section.id);
    }
    day.sections = sections;
  }
  return days;
}

function _createExercise(sectionId, exData, exIdx) {
  db.prepare(
    'INSERT INTO exercises (id, section_id, name, sets, reps, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), sectionId, exData.name, exData.sets, exData.reps, exIdx);
}

function _createSectionWithExercises(dayId, sectionData, secIdx) {
  const secId = uuid();
  db.prepare(
    'INSERT INTO sections (id, day_id, name, sort_order) VALUES (?, ?, ?, ?)'
  ).run(secId, dayId, sectionData.name, secIdx);

  for (let exIdx = 0; exIdx < sectionData.exercises.length; exIdx++) {
    _createExercise(secId, sectionData.exercises[exIdx], exIdx);
  }
}

function _createDayWithSections(routineId, dayData, dayIdx) {
  const dayId = uuid();
  db.prepare(
    'INSERT INTO routine_days (id, routine_id, day_key, day_label, day_name, focus, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(dayId, routineId, `day${dayIdx + 1}`, `Day ${dayIdx + 1}`, dayData.day, dayData.focus, dayIdx);

  for (let secIdx = 0; secIdx < dayData.sections.length; secIdx++) {
    _createSectionWithExercises(dayId, dayData.sections[secIdx], secIdx);
  }
}

/**
 * Update a user's default routine in place:
 * - Matched exercises (by name within section position): UPDATE sets/reps
 * - New exercises: INSERT with fresh UUID
 * - Removed exercises: SET archived = 1
 *
 * This preserves all set_log history because exercise IDs never change
 * for matched exercises, and archived exercises keep their rows.
 */
function matchAndReSeedUser(userId, routineId, newPlan) {
  const oldDays = loadRoutineTree(routineId);

  for (let dayIdx = 0; dayIdx < newPlan.length; dayIdx++) {
    const newDayData = newPlan[dayIdx];
    const oldDay = oldDays[dayIdx];

    if (!oldDay) {
      _createDayWithSections(routineId, newDayData, dayIdx);
      continue;
    }

    db.prepare(
      'UPDATE routine_days SET day_name = ?, focus = ?, day_label = ? WHERE id = ?'
    ).run(newDayData.day, newDayData.focus, `Day ${dayIdx + 1}`, oldDay.id);

    for (let secIdx = 0; secIdx < newDayData.sections.length; secIdx++) {
      const newSecData = newDayData.sections[secIdx];
      const oldSection = oldDay.sections[secIdx];

      if (!oldSection) {
        _createSectionWithExercises(oldDay.id, newSecData, secIdx);
        continue;
      }

      db.prepare('UPDATE sections SET name = ? WHERE id = ?')
        .run(newSecData.name, oldSection.id);

      const oldExMap = new Map(
        oldSection.exercises.map(ex => [ex.name, ex])
      );

      for (let exIdx = 0; exIdx < newSecData.exercises.length; exIdx++) {
        const newEx = newSecData.exercises[exIdx];
        const oldEx = oldExMap.get(newEx.name);
        if (oldEx) {
          db.prepare(
            'UPDATE exercises SET sets = ?, reps = ?, sort_order = ? WHERE id = ?'
          ).run(newEx.sets, newEx.reps, exIdx, oldEx.id);
          oldExMap.delete(newEx.name);
        } else {
          _createExercise(oldSection.id, newEx, exIdx);
        }
      }

      for (const [, oldEx] of oldExMap) {
        db.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(oldEx.id);
      }
    }

    for (let secIdx = newDayData.sections.length; secIdx < oldDay.sections.length; secIdx++) {
      const oldSection = oldDay.sections[secIdx];
      if (oldSection) {
        db.prepare(
          "UPDATE exercises SET archived = 1 WHERE section_id = ? AND (archived = 0 OR archived IS NULL)"
        ).run(oldSection.id);
        db.prepare('DELETE FROM sections WHERE id = ?').run(oldSection.id);
      }
    }
  }

  for (let dayIdx = newPlan.length; dayIdx < oldDays.length; dayIdx++) {
    const oldDay = oldDays[dayIdx];
    if (oldDay) {
      for (const section of oldDay.sections) {
        if (section) {
          db.prepare(
            "UPDATE exercises SET archived = 1 WHERE section_id = ? AND (archived = 0 OR archived IS NULL)"
          ).run(section.id);
        }
      }
      db.prepare('DELETE FROM sections WHERE day_id = ?').run(oldDay.id);
      db.prepare('DELETE FROM routine_days WHERE id = ?').run(oldDay.id);
    }
  }
}

/**
 * Compare the stored seed version against the current code version.
 * If they differ, update existing default routines in place (preserving
 * workout history) instead of deleting and re-creating them.
 *
 * This is safe to call on every server startup — it's a no-op when
 * the seed hasn't changed.
 */
function checkAndReSeed() {
  const currentVersion = computeSeedVersion();
  const stored = db.prepare("SELECT value FROM seed_meta WHERE key = 'seed_version'").get();
  const storedVersion = stored?.value ?? null;

  if (storedVersion === currentVersion) {
    console.log(`[seed] Version ${currentVersion} matches — no re-seed needed`);
    return;
  }

  console.log(`[seed] Version changed (${storedVersion ?? 'none'} → ${currentVersion}) — re-seeding default routines`);

  const defaultRoutines = db.prepare('SELECT id, user_id FROM routines WHERE is_default = 1').all();

  const reseedAll = db.transaction(() => {
    for (const routine of defaultRoutines) {
      matchAndReSeedUser(routine.user_id, routine.id, DEFAULT_PLAN);
    }
    db.prepare("INSERT OR REPLACE INTO seed_meta (key, value) VALUES ('seed_version', ?)").run(currentVersion);
  });

  reseedAll();
  console.log(`[seed] Re-seeded ${defaultRoutines.length} user(s) with version ${currentVersion}`);
}

module.exports = { seedDefaultRoutine, checkAndReSeed };
