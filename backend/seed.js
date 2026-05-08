const db = require('./db');
const { v4: uuid } = require('uuid');

const DEFAULT_PLAN = [
  { day: 'Monday', focus: 'Back Width + Biceps', sections: [
    { name: 'Main Lifts', exercises: [
      { name: 'Neutral Pull-Up / Lat Pulldown', sets: 4, reps: '6–8' },
      { name: 'Chest-Supported Row', sets: 4, reps: '8–10' },
      { name: 'Incline DB Press', sets: 3, reps: '8–10' },
      { name: 'Straight-Arm Cable Pulldown', sets: 3, reps: '12–15' }
    ]},
    { name: 'Arms + Shoulder', exercises: [
      { name: 'EZ-Bar Curl', sets: 3, reps: '8–10' },
      { name: 'Incline DB Curl', sets: 3, reps: '10–12' },
      { name: 'Cable Lateral Raise', sets: 3, reps: '12–15' },
      { name: 'Face Pull', sets: 3, reps: '15' },
      { name: 'DB Shrug', sets: 3, reps: '12–15' }
    ]}
  ]},
  { day: 'Wednesday', focus: 'Shoulders + Triceps', sections: [
    { name: 'Shoulder Priority', exercises: [
      { name: 'Landmine Press', sets: 3, reps: '8–10' },
      { name: 'Lean-Away Cable Lateral', sets: 4, reps: '12–15' },
      { name: 'Rear Delt Cable Fly', sets: 4, reps: '15–20' },
      { name: 'Seated Cable Row', sets: 3, reps: '10–12' },
      { name: 'DB Shrug', sets: 3, reps: '12–15' }
    ]},
    { name: 'Triceps + Brachialis', exercises: [
      { name: 'Overhead Cable Extension', sets: 4, reps: '10–12' },
      { name: 'Rope Pushdown', sets: 3, reps: '12–15' },
      { name: 'Hammer Curl', sets: 3, reps: '12' }
    ]}
  ]},
  { day: 'Friday', focus: 'Back Thickness + Arm Pump', sections: [
    { name: 'Back + Chest', exercises: [
      { name: 'Single-Arm DB Row', sets: 4, reps: '8–10' },
      { name: 'Lat Pulldown (neutral)', sets: 3, reps: '8–10' },
      { name: 'DB Bench Press', sets: 3, reps: '8–10' }
    ]},
    { name: 'Full Arm Finisher', exercises: [
      { name: 'Preacher Curl', sets: 3, reps: '10–12' },
      { name: 'Cable Curl', sets: 2, reps: '15' },
      { name: 'Overhead Cable Extension', sets: 3, reps: '10–12' },
      { name: 'Rope Pushdown', sets: 2, reps: '15–20' },
      { name: 'DB Lateral Raise (Drop)', sets: 2, reps: '8+12' }
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

module.exports = { seedDefaultRoutine };
