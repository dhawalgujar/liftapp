# LIFT — Cycle-first Workout Tracker

A mobile-first four-week workout tracker with SQLite persistence, quick exercise logging, cycle progress, historical activity, and editable training splits.

## Redesign development

The approved prototype is preserved in `designs/lift-redesign/`. The integrated app reuses its styling, SVG icons, font stack, effects, and Cycle → Train → Progress → Settings flow.

For the isolated development branch and database, follow **[docs/development.md](docs/development.md)**. From the prepared development worktree:

```sh
npm run dev
# http://localhost:7701 — separate database copy
```

Core features include Activity-first Progress, exact historical session snapshots, session-only substitutions, safe plan editing, and a server-persisted 90-minute workout countdown. Timed-out sessions preserve logged results and leave unchecked exercises incomplete.

## Stack

- **Frontend**: Vanilla JS SPA (`public/index.html`, `public/app.js`, `public/styles.css`)
- **Backend**: Node.js + Express (`backend/server.js`)
- **Database**: SQLite3 via `better-sqlite3` (`backend/data/lift.db`)

## Run locally

```bash
cd backend
npm install
node server.js
# → http://localhost:7700
```

## Run with Docker

```bash
docker compose up --build
# → http://localhost:7700
```

SQLite data is persisted in the `./data` Docker bind mount; the isolated dev compose file uses `./.dev/data`.

## Features

- Username-only login (session cached in localStorage; login required on new device/browser)
- Four-week Cycle dashboard with start/resume and explicit session states
- Quick exercise-level weight/reps entries with previous performance in pounds
- Persisted 90-minute timer with background finalization and restart catch-up
- Complete, partial-finished, and skipped sessions without fabricated results
- Mobile editing for splits, days, sections, exercises, sets, and rep targets
- Historical prescription snapshots retained when plans change
- Activity-first Progress with yearly heatmap, exact session history, and exercise trends
- Light and dark appearance
- Existing Docker deployment on port 7700; isolated development on port 7701

## Verification

```sh
npm install
npm run setup
npm test
npx playwright install chromium
npm run test:e2e
```

Tests use disposable synthetic databases. The development database is never merged into the live database.
