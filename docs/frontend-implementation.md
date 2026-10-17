# Frontend implementation: cycle redesign (agent handoff record)

Date: 2026-10-17
Branch: dev/cycle-redesign
Scope: public/** only. No commit, server startup, database writes, prototype edits, or original-worktree changes.

## Files

- Updated `public/index.html`: production full-bleed app shell; retains existing manifest, favicon and Apple touch icon references.
- Created `public/styles.css`: copied approved prototype CSS and added production responsive layout, safe phase-row spacing, timer, login and save-state treatments using its existing palette and font stack.
- Created `public/app.js`: reused approved prototype SVGs, markup and flows; replaced demo state with username login and contract-backed APIs.
- Created `public/app.test.cjs`: dependency-free Node UI/pure-state regression tests. Its test-only fixtures are never loaded by the production app.
- Created this implementation record in `public/` to respect the ownership boundary.

## Integration decisions

- `/api/auth/login` returns `{id, username}`. Only identity and theme preferences are persisted locally (`lift-user`, `lift-theme`). Existing `lift-accent` is left untouched; no new palette is introduced.
- All workout, plan, split, history and navigation data comes from `/api/v2/users/:userId`. No demo records or local workout persistence remain.
- Viewing a future workout creates only an ephemeral prescription in memory, with no server request that starts a session. Explicit Start/Resume calls `/sessions/start`; review of finished sessions does not.
- Writes are serialized, log input is debounced, input values are preserved until acknowledged, and successful writes reload state. Inputs become read-only and action buttons disabled while saving. Network/server failures retain a retry operation; validation errors retain editable form values without trapping the user in an impossible retry.
- Mutation acknowledgement is tracked separately from the following state refresh, so a failed refresh does not repeat an acknowledged create/new-cycle mutation.
- Countdown uses the backend absolute deadline with midpoint-corrected `serverNow`, not local elapsed time. State refreshes every 15 seconds and on foreground/online events. Timeout recaps say “Automatically finished after 90 minutes.” and do not overwrite the selected next workout. Recap navigation is deferred while a plan form has unsaved text.
- Finished partial sessions advance navigation while preserving unchecked exercises. Current partial, finished partial and skipped records have distinct labels/treatments.
- Fresh launches prioritize the next unfinished workout; split activation restores the backend's saved split position without resetting it.
- Progress is Activity-first; returning from exercise detail retains trends. Trend names include actual historical substitutions and removed-plan exercises. Only completed recorded quick entries contribute to trends; missing previous values are em dashes.
- Activity uses real dates and dynamic years. History also renders optional backend `setLogs` and `legacyStats` without inventing unavailable performance.
- The contract exposes skip only by session ID and intentionally does not create future sessions during reads. For an unstarted session, the confirmation explicitly says “Start & skip session”; it serially materializes the record and immediately skips it. Retries retain that session ID. Existing sessions skip directly.
- The existing prototype modal focus trap is retained and hardened, with inert background regions, focus restoration, accessible form errors and 44px controls.

## API coverage

State, session start, quick-entry update/undo, substitution/revert, finish, skip, atomic plan updates, routine create/delete, active-routine restore, navigation and cycle advancement use the exact v2 contract paths. Import parses the approved structured text into a new saved split; export produces that same portable format.

## Checks

- `node --check public/app.js`: passed.
- `node --test public/app.test.cjs`: 13 tests passed.
- `git diff --check -- public`: passed.
- Existing PWA manifest/icons were not changed.
- Live dev API probe at `http://127.0.0.1:7701/`: no listener at verification time. No independent server was started.

## Remaining verification / limitations

- Browser visual, mobile keyboard, accessibility and live end-to-end API verification remain pending the coordinated dev server/browser harness. Unit tests do not claim browser-level coverage.
- No frontend lint/type-check package scripts exist in this vanilla public app; JavaScript syntax and regression tests were run instead.
- As the contract has no idempotency keys for create/new-cycle, a network disconnect that loses the mutation response itself cannot prove whether the server committed it. An acknowledged mutation is never replayed merely because its follow-up state read failed.
- A fresh launch whose latest recorded session timed out opens its recap; this notice is not persisted locally, so it can reappear on another reload until a newer session exists.

### Frontend integration review — 2026-10-17

Files updated: `public/app.js`, `public/app.test.cjs`, and this log. No design, backend, manifest, icon, or stylesheet changes in this follow-up. No commit, runtime server, or database writes.

1. Entering Progress through main navigation now resets to Activity. Exercise-detail Back remains in trends; the actual delegated click handlers are regression-tested.
2. A shared result formatter renders null/empty weight and reps as em dashes in compact completed exercise rows, recaps, history, and historical set logs. Actual zero weight remains zero. Unknown representative values are excluded from improvements/trend points and cannot become a fabricated zero-weight completion.
3. Trend comparisons are scoped to `(routineId, cycle)`. Current results require `activeRoutineId`; historical cycle choices use encoded composite keys and labels such as `Cycle 02 · Split name`. Historical/removed/substituted exercise names remain available. Current snapshots override duplicate history by session ID. Missing routine IDs are not guessed from a split name or cycle ordinal; backend routineId support is required as agreed.
4. Log controls are captured before entering the readonly write queue, including DOM values whose input event has not arrived. Autosave drains newer draft versions arriving during an acknowledgement before allowing navigation. Session selection waits for the flush. Completion retries use the latest typed values rather than replaying a stale entry body. Delayed-acknowledgement tests cover these cases.
5. Boot and username sign-in now call the same signed-in-view initializer. Both open the latest timeout recap while preserving next-workout selection.
6. `getRecord()` and next-workout lookup are null-safe; Train repairs a null selection when a plan exists. Empty-plan recap fallback, logout, repeat logout and null-state rendering are regression-tested. Logout clears transient selection/recap references.
7. Substitution sheets retain freeform entry and add actual alternatives from `GET /api/users/:uid/library`, `GET /api/users/:uid/exercises/:exerciseId/substitution-history`, and available recorded history. Alternatives use the existing sheet/option-row/SVG style. Loading does not replace the form or typed text; partial failures expose Retry library. Requests are aborted on sheet dismissal and late results are ignored. HTTP 409 rejection keeps the original exercise/results, displays the server explanation, and does not announce success or leave an impossible retry lock.

Verification:

- `node --check public/app.js`: passed.
- `node --test public/app.test.cjs`: **26 passed**, including 13 new integration-review regressions.
- `git diff --check -- public`: passed.
- Tests use isolated test-only DOM/transport acknowledgements; production has no mock fallback. No live API/browser checks were attempted because runtime startup/configuration remains user-owned and the server is not started yet.
