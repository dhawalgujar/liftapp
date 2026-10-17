# Redesign integration contract

The approved UI is `designs/lift-redesign/`. The production UI belongs in `public/`; retain its visual tokens, inline SVG icons, system font stack, effects, and flows. This contract isolates the existing SQLite data model from that UI. No production data belongs in Git.

## Runtime

- `PORT=7701`, `DB_PATH=<worktree>/.dev/data/lift.db`, `SKIP_SEED_SYNC=1` for isolated development.
- Existing `/api/auth/login` remains available (username login). The new UI stores only the user identity under `lift-user`; real workout records are always loaded/saved through APIs.
- Every v2 route is under `/api/v2/users/:userId`, verifies user existence, and validates session/routine ownership.
- Responses have `{error: string}` on failure. All timestamps are UTC ISO strings; `serverNow` allows countdown clock correction.

## State response

`GET /api/v2/users/:userId/state` returns:

```js
{
  user: {id, username},
  cycle: 3,
  activeRoutineId: 'routine-id',
  planVersion: 'sha256-of-current-plan',
  splitName: 'Routine name',
  plan: [{
    id: 'day-id', name: 'Day label/name', focus: 'Chest & back',
    sections: ['Main lifts'],
    sectionIds: {'Main lifts': 'section-id'},
    exercises: [{id, name, sets, reps: '8–10', weight: 45, lastReps: 10,
      section: 'Main lifts', sectionId: 'section-id'}]
  }],
  records: {
    '2:day-id': {
      id: 'session-id', routineId: 'routine-id', week: 2, dayId: 'day-id', dayName: 'Upper A', focus: 'Chest & back',
      status: 'pending' /* pending | partial | completed | skipped */,
      startedAt: null, expiresAt: null, finishedAt: null,
      finishReason: null, /* manual | timeout | skipped | legacy */
      finished: false, date: null,
      exercises: [{
        id: 'exercise-id', name: 'Dumbbell bench press', originalName: 'Dumbbell bench press',
        section: 'Main lifts', sets: 3, targetReps: '8–10',
        weight: '' /* number or empty string */, reps: '' /* number or empty string */,
        lastWeight: 45 /* or null */, lastReps: 10 /* or null */, done: false
      }]
    }
  },
  history: [/* session snapshots as above, plus cycle, splitName, date YYYY-MM-DD */],
  savedSplits: [{id, name, plan: [/* same day structure */]}],
  selected: {week: 2, dayId: 'day-id'},
  serverNow: '2026-10-17T12:00:00.000Z'
}
```

- State must not create future sessions. Include existing legacy sessions, keeping untouched/unstarted sessions out of Activity.
- Legacy completion data is preserved as recorded. Do not guess whether old manual completion meant skipping.
- `finishedAt` / `finished` is independent of completion status: timed-out or manually finished partial sessions advance cycle navigation, but remain partial in history.
- Historical exercise snapshots survive later plan edits/removals. An already-started session retains its original prescription. Future sessions use the edited plan.
- If old deleted data is unavailable, display available session metadata/statistics honestly; do not fabricate exercise results.
- Progress derives only from recorded completed exercise results, grouped by actual exercise name (including substitutions), cycle, and week.

## Mutations

All requests are JSON. Unless otherwise noted, mutation responses may be `{ok: true}`; the frontend reloads state after mutations.

| Method / suffix under `/api/v2/users/:userId` | Body / behavior |
|---|---|
| POST `/sessions/start` | `{dayId, week}`; validate week 1–4, create/snapshot if needed, set a 90-minute deadline exactly once; return `{sessionId, startedAt, expiresAt, serverNow}`. Repeated calls must never extend it. Completed/finished sessions can be reviewed without restarting. |
| PUT `/sessions/:sessionId/exercises/:exerciseId` | `{weight, reps, done}`; one representative quick entry, preserve existing per-set historical logs; reject completion without valid weight (zero allowed) and positive integer reps. Updates only supplied fields. |
| PUT `/sessions/:sessionId/exercises/:exerciseId/substitute` | `{name}`; session-only substitution, do not mutate plan. Reverting via original name is allowed. Do not silently discard previously logged completed performance. |
| POST `/sessions/:sessionId/finish` | Finish now; preserve unchecked exercises as incomplete. Store manual finish reason and stop timer. |
| POST `/sessions/:sessionId/skip` | Distinct skipped status and finish timestamp; preserve any logged data. |
| PUT `/routines/:routineId/plan` | `{name, plan, planVersion}`; atomic update with optimistic concurrency; stale versions return 409 without changing the tree. Retain stable IDs, sessions/logs and snapshots. Archive removed entities rather than cascade away results. |
| POST `/routines` | `{name, plan?, operationId}`; create saved split exactly once per logical operation; return `{routineId}`. Empty plans/days may be configured through the editor. |
| DELETE `/routines/:routineId` | Remove/archive saved split without deleting historical performance. Cannot delete active or last routine. |
| POST `/active-routine` | `{routineId}`; select split and restore its navigation/sessions, preserving its existing cycle progress. Do not reset data silently. |
| PUT `/navigation` | `{week, dayId}`; remember viewing position per routine; fresh launch selects next unfinished session, prioritizing partial sessions in that week. |
| POST `/cycles` | `{operationId, routineId, expectedCycle}`; archive current sessions, advance cycle once per logical operation, retain plan/history; fresh Week 1. No deletion of workout logs. |

Mutation retries retain their original operation ID and payload. A committed retry replays the result before checking current-cycle guards, so a lost response cannot advance twice. Reusing a key for another kind/payload returns 409. Legacy callers omitting these additive fields remain accepted, but the redesigned client always sends them. Background reads retain an open editor's original plan/version; a conflict preserves typed fields until explicit reload.

## Timer semantics

- Begins only from explicit Start/Resume for a not-yet-timed legacy workout, not when browsing Cycle or a future session.
- Deadline persists in SQLite and runs independently of browser visibility. Reload/Resume never resets it.
- Backend finalizes overdue sessions on startup, periodically while running, and before state/mutation reads where needed.
- At timeout: finish session; completed exercises and recorded values remain, unchecked exercises stay incomplete; status is completed only if every actual exercise was completed, otherwise partial. Do not invent reps/load.
- Store `finishReason: 'timeout'` and the actual expiry timestamp. Frontend shows “Automatically finished after 90 minutes.” in recap/history.
- Manual finish/skip before expiry is terminal and stops the timer. Expiry and manual saves are transactional/idempotent.
- Editing a finished exercise from review may update the saved result without restarting its timer.
- Timer is positioned to the right of workout title/focus/exercise-count. Countdown displays 90:00 initially, with smaller treatment as needed at narrow widths.

## Approved follow-up UI corrections

- Progress tabs: Activity first/default, Exercise trends second. Returning from exercise detail keeps the trends view.
- Week phase guidance is a distinct row below the Up next card, with explicit spacing and no overlap on fresh Week 1, narrow screens, or dark mode.
- Production app has no fictional data, demo controls, or demo resets. Preserve light/dark preference using existing keys where practical.
- Login, loading, save retry, and empty states must use the approved visual language.
