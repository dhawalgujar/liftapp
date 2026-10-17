# LIFT refinements — targeted browser integration QA

Date: 2026-10-17
Branch: `dev/cycle-redesign`
Build: refinement working tree based on `66b76c7` (not just the committed HEAD)
Decision: **PASS for the targeted refinements — 39/39 checks in both headless and headed Chromium.**

## Run

From `/home/aiuser/playground/lift-app-dev`:

```sh
node tests/redesign/refinements-browser.cjs
QA_HEADED=1 node tests/redesign/refinements-browser.cjs
```

The executable CommonJS runner also resolves the project root independently of the shell's current directory. It uses the root `playwright` dependency (including `playwright/test` assertions), Node's built-in fetch/assert APIs, and the existing backend `better-sqlite3` dependency. No npm script or dependency changes are required.

Environment: Linux, Node `v20.20.2`, Playwright `1.64.1`, bundled Chromium; browser locale `en-US`, timezone `UTC`. Headed execution used the available display `:0`.

## Isolation and fixture contract

- Start the actual Express application in a child process using `app.listen(0, '127.0.0.1')`; require an HTTP 200 startup probe before creating any browser fixtures.
- Set `DB_PATH` to a fresh `/tmp/opencode/lift-refinements-qa-*/synthetic.db` and `SKIP_SEED_SYNC=1`. No connection to the real development server, port 7701, existing databases, or user data.
- Use five isolated synthetic logins/browser contexts: heatmap, timer, imports, substitution, trends. All routine creation, activation, session start, log mutation, substitution, completion, skipping, and cycle changes go through real HTTP APIs.
- The only direct SQLite writes set timestamps on already-finished synthetic sessions, to make historical ordering and dates deterministic. Results, exercise names, completion flags, plans, and cycles are never fabricated in browser state or written directly to SQLite.
- Invalid historical result fixtures use the existing legacy set-log API: completed entries with missing load/reps, zero reps, and negative load. Normal/undone entries use v2. These are input fixtures for the graph's exclusion behavior, not mocked API responses.
- Timer boundary checks adjust only the browser's `serverOffset` and invoke the real DOM tick. They do **not** change the backend clock, `startedAt`, `expiresAt`, or expiry policy. Reload assertions compare displayed elapsed time with the persisted server start and current server time, not a synthetic elapsed value surviving reload.
- Clipboard success uses the actual Chromium clipboard with permissions granted. The denial test temporarily rejects browser clipboard writes and disables `execCommand` to exercise the selected-text fallback, restoring both afterward. No business API requests are intercepted.
- Always close the browser, stop the child server, and remove the disposable DB/WAL/SHM at the end. Preserve screenshots, `results.json`, and `server.log` in that run's temporary evidence directory. Any failed assertion or fixture failure exits nonzero.

## Results

| Area | Checks per run | Passed | Failed |
|---|---:|---:|---:|
| Binary activity heatmap | 2 | 2 | 0 |
| Elapsed timer, reload/resume, responsive layout | 8 | 8 | 0 |
| AI import, clipboard, keyboard, responsive sheets | 10 | 10 | 0 |
| Last-used substitution, persistence, 409 protection, layout | 9 | 9 | 0 |
| Per-session graph, global/filter scopes, invalid results, scrolling | 9 | 9 | 0 |
| Uncaught browser runtime errors | 1 | 1 | 0 |
| **Total per execution** | **39** | **39** | **0** |

Two final executions: **78 check executions passed, zero failed** (39 unique checks).

### Verified behaviors

**Heatmap**

- A workout with 1/2 completed exercises and one with 2/2 completed exercises use exactly the same computed accent background and full opacity, in light and dark themes.
- Skipped, empty-finished, and no-activity dates remain neutral. Exactly two recorded cells exist in the isolated historical year; the legend uses the same accent.

**Timer**

- Actual timer DOM displays `00:00`, `01:15` for a positive server offset, `00:00` for a negative elapsed duration, and `90:00` at and beyond the cap.
- The backend initially assigns exactly 90 minutes between start and expiry. Offset probes do not finish the session or alter either timestamp.
- After real elapsed time and page reload, the display is within three seconds of the backend-derived elapsed duration and is not reset to zero. Repeated start/resume preserves the original start and exact original expiry.
- Timer remains beside, not over, a long workout title at 320/390/768px in both themes.

**AI import**

- Supported prompt is readonly and contains the structured Split/Day/Section/Exercise format and routine placeholder.
- Keyboard activation of Copy writes the complete prompt to the real clipboard. Typing into the prompt cannot change it; Tab remains within the dialog.
- Denied automatic copy focuses/selects the complete prompt and shows keyboard-copy guidance. Both copy paths leave pasted output and optional name unchanged.
- New shape imports with a blank optional name and derives its name from `Split:`. Legacy shape without `Split:` imports using the optional name. Both persist the expected days, exercise names, sets, and rep targets through the real API.
- The form and scrolled-to prompt are captured independently at all six viewport/theme combinations.

**Last used / session-only substitution**

- Fixtures include an older completed alternate, a more recent completed alternate, and a newer but never-completed alternate. The last completed alternate is the first one-tap option under **Last used**, above the name input, with its actual `47.5 lb × 7` performance.
- A new cycle's workout still starts with the original planned exercise: no automatic substitution is applied.
- Clicking the saved alternate updates only that session. The card shows **Last time · substitute** and its actual prior result; Use last values fills the matching weight/reps. The test waits for the real save before reloading and verifies the session name persists.
- Completing that exercise and attempting to relabel it returns a real HTTP 409. The entire recorded exercise and the original plan remain unchanged.

**Per-session exercise graph**

- Split A contains two training days per week over four weeks and two cycles: **16** valid results. Split B adds two same-exercise sessions: **18** valid results globally, including a legitimate zero-load result.
- Assertions count `.trend-chart .trend-point` SVG circles and compare their actual session IDs to all 18 fixture session IDs; they do not count table rows as a substitute for checking graph markers. All 18 x positions are distinct and chronological. Two split/cycle boundaries are drawn.
- Every marker title includes its date, training-day name, split, cycle/week, and exact load/reps. Corresponding results rows independently show date, day, split, and cycle/week. Same-week training days are not reduced to a weekly maximum.
- Default scope explicitly reads **All sessions · Continuous** and includes both splits. The picker labels each split/cycle explicitly. Split A cycle 1 and cycle 2 each retain **8** separate markers; Split B cycle 1 retains **2**; All sessions restores **18**.
- Five real historical sessions are present in API history but excluded from graph markers: three invalid completed legacy entries, one never-completed valid entry, and one completed-then-undone entry. A valid zero-load completed entry is retained.
- At every tested viewport/theme combination the graph has `scrollWidth > clientWidth`, keyboard ArrowRight moves its focusable scroll region, and all 18 markers remain in the DOM. Neither document nor body has horizontal overflow; scrolling inside the graph is intentional.

## Evidence

Final headed run:

`/tmp/opencode/lift-refinements-qa-98uNfn`

Final headless run:

`/tmp/opencode/lift-refinements-qa-mIf2ZS`

Each directory contains `results.json`, `server.log`, and **32 screenshots**:

| Screenshot pattern | Count | Coverage |
|---|---:|---|
| `heatmap-390-{light,dark}.png` | 2 | Uniform recorded cells and neutral dates |
| `timer-{320,390,768}-{light,dark}.png` | 6 | Long title and elapsed timer |
| `import-{320,390,768}-{light,dark}.png` | 6 | Import fields/actions |
| `import-prompt-{320,390,768}-{light,dark}.png` | 6 | Scrolled readonly prompt |
| `substitute-{320,390,768}-{light,dark}.png` | 6 | Last-used sheet and free-text input |
| `graph-{320,390,768}-{light,dark}.png` | 6 | Actual per-session SVG graph/results |

## Defects and scope

**No application defects reproduced in these targeted checks.** Initial runner-development failures were fixture synchronization mistakes: the heatmap page had not reloaded after API fixture creation, and the substitution test reloaded before its debounced save completed. The runner now explicitly reloads the fixture and polls the real saved values before reloading, respectively. No application changes were made to obtain passing results.

This pass intentionally does not rerun the existing 21-case browser baseline. The supplied passing baseline of 15 backend, 52 frontend, and 10 trend-helper tests is context only, not included in these counts. This is targeted refinement sign-off, not a broad security/performance/coverage audit or a replacement for the main baseline run.

Owned changes: only `tests/redesign/refinements-browser.cjs` and this document. No application/backend/other-test changes, source-workspace AGENTIC changes, npm script changes, or commits.
