# LIFT redesign — focused integration verification plan

Date: 2026-10-17. Status: planning only; no runtime tests or release sign-off.

## Scope and guardrails

Basis: `docs/redesign-api.md`, existing `backend/db.js` and `backend/server.js`, and approved `designs/lift-redesign/{README.md,styles.css}`. Implementation is concurrent: findings below describe legacy hazards, not verified defects in the incoming v2 implementation. Do not duplicate developers' work.

This assessment did not start/import the backend, read a database, inspect personal records, or read AGENTIC. Only this plan is authored. Later execution must use a newly created disposable synthetic SQLite database outside both checkouts, explicitly set `DB_PATH`, `SKIP_SEED_SYNC=1`, and an unused port; never default to the dev database or copy personal data into fixtures/output. Confirm resolved paths before startup. Start and curl the isolated application before writing/running runtime tests; a startup failure blocks execution and must be escalated.

## Highest-risk legacy findings

| Priority | Evidence in original code | Integration failure to prevent |
|---|---|---|
| P0 candidate: historical data loss | `db.js:73–80` cascades exercise deletion into logs; `server.js:429–430,481–482,533–534` hard-delete tree entities. Routine deletion explicitly snapshots aggregate counts before destroying logs (`185–199`). | Plan replacement or split deletion can erase measured results even when session rows survive. Detaching a session alone is insufficient. Already-deleted results cannot be reconstructed. |
| P1 candidate: split misassociation | Session GET selects the first user routine, not the day-owning/active routine (`server.js:546,559–560`); session lookup omits cycle (`549`). `users.current_cycle` is global (`db.js:172–175`), navigation is per routine without cycle (`178–187`), and reset archives every user split (`server.js:660–672`). | Existing sessions may have a routine ID inconsistent with their day. Switching splits or advancing A may hide/reset B or attach new results to the wrong cycle. Migration must handle this deliberately without silently moving/deleting history. |
| P1 candidate: browsing mistaken for activity | Legacy GET creates sessions (`server.js:541–565`), history returns all of them (`752–766`); original schema has no start/deadline fields. | Browsing-generated empty rows become Activity, acquire invented start times, or time out from `created_at`. |
| P1 candidate: completion semantics lost | Manual complete sets both completion flags regardless of remaining logs (`server.js:608–612`). Auto-completion counts done sets against the *current* plan and latches completed (`676–698`). | Legacy manual completion is mislabeled skipped, old prescriptions change retrospectively, or quick-entry conversion marks all legacy sets done. Preserve known facts; do not infer missing performance. |
| P1 candidate: trends include uncompleted work | Progress SQL requires non-null weight but not `done=1` (`server.js:773–802`); historical names resolve through live exercises. | Draft loads appear as achievements; renaming/removal/substitution rewrites attribution. |
| P2 candidate: substitution disappears | Legacy substitute only updates existing logs (`server.js:634–647`). | Substituting before first log does nothing; replacing a logged exercise can relabel or discard its prior result without an explicit policy. |

These are static, source-supported hazards. Reproduce on synthetic legacy fixtures before filing incoming implementation bugs; severity depends on demonstrated user impact.

## Synthetic fixture matrix

Create fixtures only after execution is authorized. Use stable fake IDs and a fixed clock, never real usernames/results.

- **L0:** untouched legacy schema; two users, two splits for user A, repeated day labels across splits, weeks 1–4, archived cycles 1–2; one day/session with mismatched legacy routine ownership.
- **L1:** GET-created empty session; unfinished session with mixed done/undone per-set logs; manual completion with unchecked exercises; automatic completion; null/zero weights; SQL `datetime` timestamps lacking timezone suffix.
- **L2:** archived session detached from deleted split/day with only metadata/counts, no logs; archived exercise with surviving logs; unequal per-set measurements and substitution names.
- **N:** fresh empty user/split; empty day/section; duplicate section display names with distinct IDs; long split/day/exercise labels; same exercise name in multiple splits/cycles.
- **T:** active sessions just before, exactly at, and after expiry; manual-finished/skipped sessions; all actual exercises done vs partly done vs none done.

Capture fixture row counts/IDs and measured values before migration, after migration, and after second startup; assert foreign-key integrity and exact preservation, not just successful HTTP responses. Never print database contents from a non-fixture path.

## Ordered actionable checks

### Gate A — migration and preservation (first; release blocking)

1. Start against L0/L1/L2, migrate, restart twice. Assert idempotence, no lost logs/IDs, no duplicate sessions/snapshots, UTC response timestamps, unchanged legacy recorded completion. Verify incomplete migration failure cannot leave a partially rewritten tree.
2. Fetch state twice and browse all weeks/days: no added future sessions, no start/deadline changes; untouched rows absent from Activity. Legacy partials remain visible with real values. Explicit Start alone assigns the first 90-minute deadline. Do not derive it from legacy creation time.
3. Start a session, log distinct values, then rename/reorder/remove exercises, sections, and days using atomic plan save. Compare session prescription/name/sets/reps and every historical log before/after. New sessions use edited plan; started ones retain their snapshot. Stable IDs survive reorder; duplicate section names do not merge entities. Invalid save must leave the entire previous tree intact.
4. Delete an inactive split with history: exact surviving results and trends, not merely session counts. Active/last split deletion is rejected without mutations. Metadata-only legacy history displays unavailable details honestly, never invented reps/load.

### Gate B — timer and terminal-state correctness

5. Start returns `expiresAt - startedAt = 90 minutes`. Repeat/double-click Start, reload, close/reopen browser, change tabs, and Resume: timestamps and session ID stay identical. Countdown is based on `serverNow` despite a deliberately skewed browser clock. Browsing another session never starts it.
6. Use a controlled backend clock or synthetic expired fixture, not only Playwright's page clock. Verify finalization on startup, periodic sweep without browser activity, and state/mutation access. Check deadline minus 1 ms, exact deadline, plus 1 ms. `finishedAt` equals original expiry, reason is timeout, values stay exact, unchecked exercises remain unchecked. Fully completed actual exercise list yields completed; otherwise partial. Empty exercise-list classification needs explicit product confirmation.
7. Race final valid save/manual finish/skip against expiry and repeat requests. Assert one consistent terminal result, no restarted timer or overwritten deadline, no fabricated values. Define exact-deadline ordering with backend owner before asserting the winner. Edit a finished result from review: saved value changes, original terminal timestamp/reason remain stable.
8. Manual partial finish advances next-session selection while remaining partial in Activity; skip is distinct and retains logs. Timeout recap/history contains “Automatically finished after 90 minutes.” Legacy manual complete remains legacy completion, not inferred skip.

### Gate C — split/cycle navigation and real results

9. Give A and B different viewing positions and partial sessions; switch A→B→A and relaunch. Assert correct plan, session IDs, cycle, and per-split navigation. Fresh launch prioritizes partial within the selected week and next unfinished session, not an arbitrary GET-created row. Advance A's cycle: fresh Week 1 for A; B's progress and all old logs survive. Test removed selected day and a fully finished four-week cycle without stale selection/crash.
10. Quick entry: zero weight plus positive integer reps completes; empty/null/negative/non-finite load and empty/zero/fractional reps cannot complete. Omitted fields remain unchanged. Check undo, rapid double-save, failed save then retry, and reload; no phantom completion/duplicate results. Distinct historical per-set logs must not be flattened into invented identical sets. Confirm representative-value selection rule for heterogeneous legacy sets with backend/product owner.
11. Substitute before logging, after a completed result, then revert. Plan remains unchanged; previously completed performance is not silently lost/re-attributed. Trends use actual performed name and only completed measured entries, correctly separated by cycle/week. Zero load is visible, missing results are not plotted as zero. Test repeated names and encoded punctuation in labels.
12. Fresh login loads identity from `lift-user` but workout state from APIs, not prototype storage. Seed conflicting `lift-cycle-concept-v1` sample data: it must not appear. Reload/new browser context and another synthetic user must show server-owned records, no demo controls/resets or fictional chart points.

### Gate D — approved visual/flow regression in running browser

Reference `designs/lift-redesign` tokens, inline SVGs, system fonts, Cycle/Train/Progress/Settings layout; contract overrides prototype behavior. In particular README line 31 says finished partials are resumable, whereas contract terminal finish advances navigation without restarting timer; do not copy the older behavior.

13. Screenshots at 375, 768, and 1440 px, light/dark, fresh Week 1 and populated/empty history. Up next phase guidance is a separate spaced row; no overlap. Timer is right of workout title/focus/count, starts at 90:00, and remains readable with long titles at narrow width/200% zoom. No horizontal overflow, hidden Save/Finish buttons, bottom-nav/safe-area or sheet clipping.
14. Progress opens Activity first; select Exercise trends→exercise detail→back and retain trends/search/filter context. Open history by unique session ID with repeated day/week labels across cycles/splits; verify exact snapshot, not current plan.
15. Empty split/day/history/trends and metadata-only recap have deliberate honest states. Test long and duplicate labels, many exercises/sections, missing optional values, and zero counts; no NaN/undefined/fictional defaults. Theme persists after reload and state refresh, with legible timer, chart, error, phase guidance and selected controls in dark mode.
16. Delay/fail state load and one mutation each: visible loading, actionable retry, no premature success/navigation, and saved DOM matches server after retry/reload. Check actual DOM validation timing, keyboard focus through sheet/inputs/close, and visible focus. Confirm sheet transitions headed with reduced-motion alternative; use isolated synthetic network responses only.

## Execution and evidence handoff

- Run existing automated suites first after isolated app startup, then focused API/SQLite integration tests for Gates A–C and Playwright DOM/screenshot tests for Gate D. Headed browser pass for timer placement, sheet animation, and responsive checks. No runtime claims in this planning document.
- Each result records fixture name, build SHA, route/action, expected versus actual, and sanitized assertion/screenshot. For races capture terminal timestamps and persisted fixture rows; for visual checks use matching viewport/theme/state references.
- Escalate verified data loss/startup failure immediately; block release on unresolved P0/P1. Dispatch API/migration/timer defects to backend, DOM/layout/state defects to frontend, cross-layer ambiguity to lead, visual specification gaps to design. Retest only the original failing scenario plus its regression boundary after a fix.
- Outstanding clarifications: mixed legacy per-set representative display; conflicting legacy routine/day ownership repair; zero-exercise timeout classification; exact expiry/save race ordering; any ambiguity in per-split cycle migration. Resolve before turning assumptions into assertions.

**Current decision: NOT EXECUTED — integration verification pending authorization and completed implementation.**
