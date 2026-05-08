# LIFT Workout Tracker

A full-stack workout tracking PWA with SQLite persistence, user accounts, and mobile editing support.

## Stack

- **Frontend**: Vanilla JS SPA (`public/index.html`)
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

SQLite data is persisted in the `lift-data` Docker volume.

## Features

- Username-only login (session cached in localStorage; login required on new device/browser)
- Full routine editing from mobile: add/remove sets per exercise, add/remove exercises per section
- Previous workout weight + reps shown per set (in pounds)
- Set completion checkmarks
- Mark Routine Complete button (manual) + auto-complete when all sets are checked
- Completion resets for re-use next cycle; history and weight data preserved
- Progress charts per exercise across weeks
- Pastel light-only theme (no dark mode)
- Docker deployment on port 7700
