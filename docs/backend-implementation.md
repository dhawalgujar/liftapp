# Backend implementation: cycle redesign (agent handoff record)

Date: 2026-10-17. Scope: backend only, isolated dev/cycle-redesign worktree.
Contract: ../docs/redesign-api.md (unchanged). No AGENTIC files read or written.

## Files

- Updated db.js: DB_PATH override, additive redesign migration registration.
- Updated server.js: mount v2, startup/periodic expiry, v1 compatibility projections,
  archive instead of cascading physical removal, SKIP_SEED_SYNC, configurable PORT/HOST,
  importable application without opening a listening socket.
- Updated package.json: node:test command.
- Created redesign-migration.js: transactional, idempotent additive schema changes.
- Created redesign.js: repository, state adapter, validation, session/plan/split operations.
- Created test/redesign.test.js: isolated temporary SQLite integration and migration tests.

## API and compatibility

All specified v2 endpoints are mounted under /api/v2/users/:userId. Mutations return
ok, routineId, or the required start payload. State includes contract keys; records
also expose setLogs and legacyStats as additive fields, retaining finer-grained
historical truth. Failures use {error: string}. Unknown/foreign resources return 404.
User identity continues to follow the existing username-only model, not secure login.

Start alone establishes a persisted, exactly 5,400,000 ms deadline. Repeated start,
review saves and terminal finish calls cannot extend/restart it. Expiry checks run
at startup, every 15 seconds and before API requests. Catch-up uses the deadline
itself for finishedAt, not the time the process woke up. Manual partial finish and
skip advance navigation without filling unchecked exercise results.

Snapshots freeze prescription/day/split metadata. Per-session substitution is
independent of plan edits. Attempting to substitute an exercise with completed
performance returns 409: preserving its actual identity is safer than relabeling
or silently dropping results. A quick entry is stored separately and mirrored into
reserved set_index=-1 for legacy history/progress; old per-set rows remain intact.
Consumers must not sum representative rows and original per-set rows as distinct
sets. State exposes the representative done value and the full set history.

Unstarted legacy sessions with no logs follow future plan edits; sessions with
any existing results retain their snapshots even if not explicitly timed. Old
manual completion remains completed with legacy reason, never guessed as skipped.
Deleted legacy data cannot be recreated: available metadata/stats are exposed and
missing exercises remain empty. Archived routine trees preserve their IDs/logs.
Existing v1 reset-weeks retains its historical global archive semantics; v2 cycles
are scoped to the active split. Legacy unauthenticated mutation endpoints remain
legacy APIs; v2 checks all user/resource relationships.

## Database / rollout

New session lifecycle columns, snapshot JSON, archive flags, per-split cycle column,
session_entries table with constraints, and query indexes are added transactionally.
Existing set_logs rows are not rewritten during backfill. Snapshot backfill runs in
a transaction before any seed sync. SKIP_SEED_SYNC=1 suppresses existing-user reseed;
new username registration still creates the normal default split.

No development/baseline/original database was opened during implementation or tests.
No production connection was made. These migrations have only been exercised on
temporary fixtures; dev backup application remains a rollout action. Baseline must
remain immutable. Roll back application code while retaining additive schema; there
is intentionally no destructive automatic down migration, as dropping snapshots or
entries would lose newly recorded data. Restore a separately verified backup only
with explicit operator authorization if a full database rollback is necessary.

Runtime example from backend directory:

    PORT=7701 DB_PATH=/home/aiuser/playground/lift-app-dev/.dev/data/lift.db SKIP_SEED_SYNC=1 npm start

Default listening host is 0.0.0.0 for existing Docker port-publishing compatibility;
set HOST=127.0.0.1 explicitly for isolated local development.

## Verification

From worktree root: npm --prefix backend test

Result: 4 tests passed, 0 failed. Tests exercise HTTP success/validation/foreign IDs/
server failure, idempotent start, timeout and restart catch-up, manual partial and
skip, review saves, immutable snapshots, removal preservation, split navigation and
cycle restore, legacy v1 reads/writes, untouched future-session edits, genuine
pre-v2 schema migration and repeat migration. All SQLite files are generated in
OS temporary directories and removed after tests. git diff --check passed.

One initial test invocation from worktree root without --prefix failed because
there is no root package.json; the corrected command above passed.

## Known limitations / follow-up

- No browser/frontend smoke test or real dev-backup migration was performed.
- The 15-second background sweep can publish finalization shortly after expiry;
  every API read catches up immediately and persisted finish time is exact.
- Existing username auth is not proof of identity. Strong authentication and
  legacy API security hardening require a separate compatibility rollout.
- Existing pre-redesign schema bootstrap migrations are retained; the new additive
  migration is transactional, but does not rewrite older migration history.
- Delegated scoped review was attempted but unavailable due to agent depth limit;
  implementation and verification were performed locally. No contract changes.

## Integration review corrections — Backend

Updated redesign.js, redesign-migration.js, server.js, test/redesign.test.js and
this backend note. No other paths, dev databases, baseline, or production services
were accessed. No commits.

- Representative results now select the first fully specified completed set,
  then a fully specified incomplete set as fallback. Blank later done rows cannot
  hide the original set-zero result. Heterogeneous historical setLogs are unchanged.
- Prior lookup requires done and non-null load/reps with positive reps, excludes
  the current session, uses finished/completed/started/created performed-time
  fallback rather than creation order alone, and excludes later numbered weeks
  or cycles within the same routine. Other routines are compared by performed
  time, not by unrelated cycle numbers. Pending sessions without logs use server
  time as the comparison boundary; recorded sessions use their available timing.
- Transactional migration repairs old first-routine/day mismatches only when
  both the recorded and actual routine belong to the session's user and the
  day PK still exists. Missing or foreign-owned associations are not guessed.
  Repair precedes snapshot backfill and cycle inference. Session IDs and set logs
  are preserved. Existing snapshots keep prescriptions and receive the corrected
  split name. Target cycle state is restored, misplaced day navigation follows
  its actual split unless that split already has valid navigation, and polluted
  source inference is corrected conservatively. Newer explicit cycles and valid
  source navigation are retained. Active-user cycle aliases are synchronized.
- Archived exercise placeholder logs with no done/load/reps do not manufacture
  exercises in an otherwise empty removed-day snapshot or Activity. Rows remain
  in SQLite unchanged.
- Serialized records and history now include additive routineId (null when legacy
  data has already lost its routine association). No frontend contract was edited.
- Reserved set_index=-1 representatives are excluded from v1 auto-completion.
  It counts distinct actual prescribed indices only, preventing representative
  or duplicate rows from inflating completion and consequently heatmap activity.
- Legacy initial completion is still preserved. Once a quick review entry exists,
  completion is recomputed from exercise results instead of latching on the old
  legacy flag. Undo keeps finishedAt/reason terminal, persists partial/completed=0,
  and does not restart a timer. Heatmap excludes that no-longer-completed session.
- HOST defaults to 0.0.0.0 again; use HOST=127.0.0.1 in the isolated dev command.
- Removed the large commented-out physical-cascade deletion implementation.

Regression fixtures now define an explicit pre-v2 schema, omitting all redesign
additions rather than copying an already-migrated schema. Added first45x10/blank
done rows, real heterogeneous sets, performed-vs-created ordering, future week
and current-session exclusion, same-user mismatch repair, foreign/missing day
non-repair, restart idempotency, navigation/cycle association, blank placeholders,
legacy review undo, representative-count/heatmap checks, and forced-failure
transaction rollback/retry.

Verification from backend: npm test — 9 tests passed, 0 failed. All SQLite files
were temporary fixtures. From worktree root: git diff --check -- backend passed.
Real dev-backup migration, Docker runtime and frontend browser smoke remain unrun.
