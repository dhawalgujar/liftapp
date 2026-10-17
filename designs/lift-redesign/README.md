# LIFT — cycle-first concept

Independent, interactive mobile-first prototype. No build step, dependencies, production API requests, or modifications to the existing app.

## Preview

Serve the repository's `designs/` directory:

```sh
python3 -m http.server 4311 --directory designs
```

Open `http://localhost:4311/lift-redesign/`.

## Explore

- **Cycle:** four-week map, session previews, upcoming-session browsing, and resume partial workouts.
- **Train:** inline exercise-level weight/reps entries, copy previous values, completion/undo, session-only substitutions, partial finish, skipping, and recap.
- **Progress:** searchable exercise results, current/previous-cycle charts, yearly activity heatmap, month/year filters, and exact historical session snapshots.
- **Settings:** split/day/section/exercise editing, exercise reordering, split creation/import/export/switching, light/dark themes, and cycle management.
- **Preview cycle completion:** Settings → Prototype controls. Illustrative end-state results are explicitly labelled and do not alter the live demo cycle unless you confirm starting another cycle.
- **Reset:** Settings → Reset sample data.

All data is fictional. Edits persist only under the separate localStorage key `lift-cycle-concept-v1`. Navigation and records never touch the actual LIFT backend. The simulated starting point is October 17, 2026, Cycle 3 / Week 2 / Lower B with two exercises complete.

## Design decisions

- Mesocycle overview is the landing experience; training is a focused companion destination.
- Quick entry is one representative result per exercise, with prescribed sets displayed as context. The prototype does not fabricate individually measured set results.
- Started sessions retain their exercise snapshot when the plan changes; future sessions use the updated plan.
- Skipped, partial, and completed are separate session states. A partially finished session remains resumable.
- Week-specific phase/RIR labels provide guidance; automatic deload prescriptions are outside this concept.
- Progress is derived from completed demo entries; archived sessions open by unique session ID.

## Files

- `index.html`: prototype and desktop review shell.
- `styles.css`: visual tokens, mobile/desktop layouts, light/dark themes.
- `app.js`: sample data and isolated interaction state.

Reference context: existing `public/index.html` and `backend/{db,server,seed}.js`, reviewed for feature understanding. The visual language is a fresh concept, using system fonts and inline interface/chart icons, with no external resources.
