# LIFT redesign — targeted QA results

Date: 2026-10-17
QA: QA Agent
Build: worktree implementation on base `fb9d7fd` (uncommitted concurrent integration changes are not represented by that SHA)

## Decision

**PASS for executed checks:** all 21 synthetic integration scenarios pass, including lost-acknowledgement retries, two-tab conflicts, and the unobstructed dialog recovery action. BUG-QA-1 was corrected and its exact pointer-action regression now passes. The separate real-copy migration audit also passed; the synthetic runner never accesses that data.

## Environment and safety

- Linux; Node v20.20.2; installed Playwright 1.64.1 / Chromium; SQLite via backend better-sqlite3.
- Final 21-scenario browser execution was **headless** (`npm run test:e2e`). Previous 18-scenario verification included headed execution using the existing display (`QA_HEADED=1`).
- Imported the real backend application into a disposable child process listening on **127.0.0.1, dynamically allocated port**. Explicit synthetic `DB_PATH`, `SKIP_SEED_SYNC=1`; served real `public/` files. Probed HTTP 200 before testing.
- Used only generated synthetic account/plans/results and real API/SQLite round trips. Deliberate network interception aborted an autosave and discarded routine/cycle acknowledgements **after** `route.fetch()` committed on the real backend; retries also reached that backend. No successful mutation response was fabricated.
- Expiry tests changed **only synthetic** SQLite deadlines. Browser closed before the periodic-expiry wait. Restart test started a new backend process against the same synthetic database.
- Child server stopped and synthetic database/WAL/SHM removed in runner cleanup; screenshots and assertion results retained in temporary evidence directories.
- Did not access/mutate port 7701, read AGENTIC, modify backend/public, edit `frontend.test.cjs`, or commit. Authored only `tests/redesign/browser.cjs` and this result report during execution.

## Commands and results

| Command | Result |
|---|---|
| `npm test` — backend migration/API/performance tests | **15 passed, 0 failed** — final integration rerun |
| `npm test` — existing frontend unit tests | **37 passed, 0 failed** — final integration rerun |
| `npm run check` | **Passed** in final integration rerun |
| `npm run test:e2e` — current reusable integration suite, headless | **21 passed, 0 failed**, including an assertion and normal pointer click on the dialog recovery action |
| `npm run verify:dev-migration` | **Passed** before test additions — 360 original sessions and 1,337 original set logs preserved exactly; 192 unambiguous routine associations repaired; 360 snapshots; zero foreign-key violations; integrity OK |
| `npm run verify:dev-migration -- --allow-additions` | **Passed** after separate development records were added; every original record/value retained, zero foreign-key violations, integrity OK |
| Previous 18-scenario suite | Owner's final rerun PASS at `/tmp/opencode/lift-redesign-qa-oAYy7t`; earlier QA headed execution also passed |

The final 21 integration scenarios include multiple assertions and viewport/theme permutations, not 21 individual assertions. The three new regressions are 19–21 below; no broad new audit was added. Unit/backend coverage percentages were not measured; no coverage-threshold claim is made.

## Executed browser/API integration scenarios

1. New username sign-in through UI and existing username sign-in through API resolve the same persisted identity.
2. Create and activate an actually empty split through UI; no training days and no Activity sessions rather than demo records.
3. Import a structured multi-day split through UI and activate its server-saved record.
4. Fresh Week 1 phase guidance has non-overlapping bounding boxes below Up next at all requested viewport/theme combinations. Reference token/font declaration and inline SVG icon-map source equality checked.
5. Explicit Start assigns an exact 5,400,000 ms deadline; browser reload and repeated Start/Resume preserve deadline and session identity.
6. Substitute before logging through UI; dialog receives focus, Escape dismisses it, and submitted alternative persists without editing prescription.
7. Autosave persists real zero weight/positive reps; completion persists, completed substitution is rejected with 409, invalid completion with zero reps is rejected, and UI undo persists incomplete state.
8. Long-title timer stays right of title, with no document horizontal overflow, at 320/375/390/768/1440 px in light/dark; screenshots captured.
9. Real editor rename changes future prescription but leaves started workout's original exercise name unchanged.
10. Real editor add/rename/remove sections and days, add/remove exercise, with API state assertions after each mutation. Rename exercise covered by scenario 9.
11. Deliberate autosave transport failure displays Retry; recovery persists the typed reps to the real API/database.
12. Manual partial finish is terminal, stops active timing, preserves unchecked exercises and advances next day without filling results.
13. Switch away and back restores session ID and existing progress without implicit reset.
14. Close browser, shorten synthetic deadline, wait for normal backend periodic finalizer; inspect SQLite directly **before any state request** to prove background expiry, exact `finished_at`, timeout reason and partial status.
15. Stop backend, make synthetic deadline overdue, restart; SQLite already finalized at original expiry. Repeated Start of that finished record does not reset deadline.
16. Progress defaults to Activity; open timeout history by exact session ID, verify timeout message and expected week; trends → detail → Back retains trends.
17. Select dark mode through UI and reload; theme survives real state bootstrap.
18. Start new cycle; Week 1 and incremented cycle, prior session ID/history and original prescription preserved.
19. **Routine creation lost acknowledgement:** submit through UI, execute the real POST using `route.fetch()`, verify SQLite count increases, then abort the response exactly once. UI Retry submits a byte-equivalent JSON operation body with the same nonempty `operationId`; backend returns the same routine ID and total routine count increases by exactly one.
20. **Cycle creation lost acknowledgement with intervening work:** same real-commit/abort mechanism. Before UI Retry, start a real session through API in the newly committed cycle. Retry preserves `operationId`, captured `routineId`, and `expectedCycle`, returns the original result, increments the cycle only once, and leaves the intermediate session's entire SQLite row unchanged, unarchived and unfinished.
21. **Actual shared-context two-tab plan conflict:** A types new reps in an exercise form; B renames that exercise through UI and successfully saves. Explicit `refresh()` in A performs a real state read without advancing A's original string `planVersion` or replacing typed input. A's PUT carries that old version and receives HTTP 409; B's name/reps/version remain unchanged. A retains its typed reps/name until an explicit normal pointer click of the dialog's Reload latest plan button, then shows B's latest name/version with the old form discarded. The background save-status banner is asserted hidden while that dialog is open.

The 15 backend tests cover genuine pre-v2 migration, heterogeneous set representatives, ownership repair, rollback, legacy completion, snapshots, validation, cycle inference, operation idempotency, plan versions, and batched-state performance/semantic parity. A 360-session/1,400-log synthetic fixture remains below the bounded query/hydration budgets. Existing-account integration reads fell from 11–27 seconds before batching to 167–226 ms afterward; results are environment-specific.

## Evidence

Final authoritative run:

`/tmp/opencode/lift-redesign-qa-yWQUb5/`

- `results.json`: 21 named scenario results, all PASS, including the recovery-control clickability assertion.
- `cycle-{320,375,390,768,1440}-{light,dark}.png`: 10 synthetic fresh Week 1 screenshots.
- `timer-{320,375,390,768,1440}-{light,dark}.png`: 10 synthetic long-title/timer screenshots.
- `plan-conflict-before-reload.png`: synthetic two-tab conflict state before explicit reload.
- `plan-conflict-reload-hit.json`: center-point hit test on dialog reload button; `clickable: true`.

Earlier reproduction: `/tmp/opencode/lift-redesign-qa-OWl55q/` recorded the overlapping banner. The final fix renders recovery controls inside an open sheet and hides the duplicate background banner; retry tests select the visible recovery action. No forced clicks or UI-actionability bypasses are used.

Earlier successful headed run: `/tmp/opencode/lift-redesign-qa-wZKsmk/` (17/17 before adding theme persistence and stronger exact-history assertions).

## Defects and harness corrections

### BUG-QA-1 — Conflict banner obstructs dialog Reload latest plan control

- **Severity:** P3 (minor; visible alternative reload control works).
- **Status:** Fixed by integration owner and verified in final 21-scenario run.
- **Environment:** headless Chromium, default 1280×720 viewport, actual shared-context tabs and synthetic real backend.
- **Reproduce:** open exercise editor in A; change reps without saving. Rename/save the same exercise in B. Refresh A, then submit its stale form. After HTTP 409, click **Reload latest plan inside the dialog**.
- **Expected:** the dialog recovery action is clickable and explicitly reloads the latest plan.
- **Original actual:** `#save-status` overlaid/intercepted that control. The final implementation hides that banner while a sheet is open and places recovery controls within the sheet's scrollable content.
- **Impact:** users choosing the in-dialog recovery action cannot activate it with a pointer and must locate the duplicate banner action. Data/conflict protection remains intact.
- **Evidence:** paths above, especially `plan-conflict-before-reload.png` and `plan-conflict-reload-hit.json`.
- **Verification:** the center-point hit test, hidden-background-banner assertion, and exact normal dialog click now pass. Earlier failures after the fix were obsolete test locators targeting the intentionally hidden banner; those locators now use the visible recovery action.

Earlier exploratory runner failures were test-harness issues and corrected: ambiguous Settings locator, missing destructive-action confirmation, toggling an already expanded exercise closed, an overstrict whole-stylesheet-prefix assertion, and using Playwright's owned `browser.newPage()` context for a second tab (replaced with an explicit shared context). These are not product regressions.

An initial ad-hoc startup probe used an insufficient 1.8-second delay; the final runner waits for the actual listening port and HTTP readiness. Repeated isolated startups and restarts succeeded; no reproducible startup defect was found.

## Fidelity, accessibility and remaining boundaries

- Exact source comparison passed for the reference `:root` token declaration (including font stack) and the complete icon map. **The entire production stylesheet is not byte-identical** to the prototype; integration includes appended/changed styling. This pass verifies requested geometry and captures screenshots, not blanket pixel identity for every selector/effect.
- Actual modal dialog semantics/focus entry/Escape and labeled quick-log inputs were exercised. This is not an axe audit, screen-reader session, contrast certification or full keyboard-trap/200% zoom audit.
- Screenshots were captured in live browser runs (latest headless, earlier headed); no independent image-diff baseline or human pixel-by-pixel review is claimed.
- Browser tests check selected split round trips but not every split-cycle permutation. Exact-deadline concurrent-write ordering, zero-exercise timeout classification, and heterogeneous legacy representatives rely on the accepted contract semantics and backend suite rather than newly added exhaustive browser races.
- Fresh/empty state, real logging, timer, editing and history paths are covered, plus the specific shared-context editor conflict described above. Loading throttling, skip UI, deletion of a whole saved split, other multi-tab races, and non-Chromium engines are not additional tested scenarios in this runner.
- Owner reports real-copy aggregate preservation/repair, snapshot completeness, integrity and foreign-key audit **passed**. This is an owner-provided result, not independently queried by this synthetic runner. No personal data or queries against the real DB were used.

## Re-run

Run `npm run test:e2e` headless, or `QA_HEADED=1 npm run test:e2e` with a display. Each execution creates a new synthetic database/evidence directory and reports its path. Never point this runner at the dev DB; its temporary path is generated internally.
