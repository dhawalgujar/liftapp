const db = require('./db');
const { v4: uuid } = require('uuid');

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

module.exports = { seedDefaultRoutine };
