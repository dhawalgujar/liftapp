# Isolated redesign development

For the current `dev/apple-ui` worktree and Docker preview on port 7701, see
**[apple-ui.md](apple-ui.md)**. The original cycle-redesign setup below is retained
as historical implementation and migration context.

## Locations

- Original checkout: `../lift-app`, branch `main`; existing working changes are preserved.
- Development worktree: `lift-app-dev`, branch `dev/cycle-redesign`.
- Original Docker app: port **7700**, its existing `data/` mount.
- Development app: port **7701**, its own `.dev/data/lift.db`.
- Immutable pre-migration snapshot: `.dev/backups/baseline.db`.

Databases, backups, WAL files, and runtime logs are ignored by Git. The Docker build context excludes both live and development data.

## Local runtime

From this worktree:

```sh
npm install
npm run setup
# Only on a fresh setup, before a dev database exists:
npm run dev:init-db -- --source /absolute/path/to/original/lift-app/data/lift.db
npm run dev
```

Open **http://localhost:7701** and use your existing username. The app reads and writes only the copied database. The runner pins `DB_PATH` to `.dev/data/lift.db` and disables automatic existing-user plan reseeding. It never overwrites an existing dev database or its baseline backup.

The baseline and initial development copy have already been created for this worktree; do not run initialization again.

## Docker runtime

When Docker Desktop/WSL integration is available, stop the local dev process to free port 7701, then:

```sh
docker compose -p lift-dev -f docker-compose.dev.yml up --build -d
```

The separate compose file uses its own image, container, project, port, and `.dev/data` bind mount. It does not start or replace the original `lift-app` container. Do not run the original compose file from this worktree because it targets the original app's container name and port.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:refinements
```

Before making any development data edits, `npm run verify:dev-migration` compares the migrated copy with the immutable baseline: exact original IDs/values, unchanged set logs, expected ownership repairs, snapshots, and SQLite integrity. It opens both databases read-only and reports only aggregate results. After intentional development edits, that baseline comparison is expected to fail rather than silently accept changed data.

After adding separate test accounts/records, `npm run verify:dev-migration -- --allow-additions` permits additional rows while still verifying every original record and value. It does not permit deletion or modification of the baseline records.

Backend and browser tests create disposable synthetic databases. They do not modify `.dev/backups/baseline.db`, the development copy, or the original data. Browser verification includes real API/database round trips and server-side timeout finalization.

## Timer

Explicit Start assigns one SQLite-persisted deadline 90 minutes ahead. Resume/reload cannot reset it. The server checks expiry every 15 seconds, before requests, and at startup. A timeout uses the exact deadline as the persisted finish time, preserves all recorded values, and leaves unchecked exercises incomplete. A stopped server catches up at next startup. Manual finish and skip are terminal and stop countdown display.

The visible timer is **Time spent**, counting up from 00:00 to a maximum of 90:00 using the persisted start and corrected server clock. This is a presentation change only; the original deadline and background finalization are unchanged.

## Progress and import refinements

- All activity dates use the same strong accent, independent of completion ratio.
- Exercise detail defaults to **All sessions · Continuous**. Each completed exercise entry remains a separate point, including repeated training days within one week. Dates, day names, split names and cycle/week remain visible; the picker also isolates a particular split/cycle. Wider histories scroll inside the chart without downsampling.
- **Last used** substitutions come from actual historical performance and appear first; other previous/library choices and freeform input remain available. No substitution is applied automatically.
- Split import provides two actions, **Import split** and **Copy AI prompt**, plus a visible supported-format prompt and instructions. Legacy output without `Split:` can use the optional name input. Clipboard denial preserves pasted data and selects the prompt for manual copying.

## Migration and eventual merge

The redesigned UI reuses the approved prototype's colors, SVGs, font stack, effects, and flows. The backend adds lifecycle fields, snapshots, quick entries and per-split cycle state while retaining original IDs and historical set logs. Unambiguous legacy sessions attached to the wrong split are repaired according to their actual day ownership.

Review the dev app before merging `dev/cycle-redesign` into the main branch. Deploy code/migrations against a fresh consistent backup of the then-current live database. **Never replace the live database with the development database**: workouts recorded in the original app during development must stay in the live database. No merge, push, or production deployment is part of this development setup.

## Current verification status

- 15 backend migration/API/performance tests, 52 frontend regression tests, and 10 session-trend helper tests pass.
- 21 real-browser/API scenarios pass, including browser-closed timeout, restart catch-up, ambiguous-response retries, and concurrent-editor conflicts.
- 39 targeted refinement checks pass in both headed and headless Chromium, including real same-week/multi-cycle graph markers and cycle filtering. Details: `tests/redesign/REFINEMENTS-QA.md`.
- Responsive geometry checks cover 320, 375, 390, 768, and 1440 pixels, light and dark; approved font tokens and SVG icon source are preserved.
- The initial database-copy audit preserved all 360 existing session rows, all 1,337 original set-log rows and values, and the complete plan/library records. It repaired 192 unambiguous session-to-split associations, created 360 historical snapshots, and verified database integrity with no foreign-key violations.
- A subsequent audit with `--allow-additions` also passed after separate development test records were added; every original record and result remained unchanged.
- Batched history/prior-result lookup reduced measured existing-account state loads from 11–27 seconds to approximately 0.17–0.23 seconds in this environment. A representative large synthetic fixture has bounded SQL-query and snapshot-hydration regression checks.
- Docker configuration is provided, but Docker is unavailable in the current WSL distribution. The running preview uses `npm run dev`.
- Full results and precise verification boundaries are in `tests/redesign/QA-RESULTS.md`.
