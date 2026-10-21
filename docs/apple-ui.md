# Apple-inspired LIFT UI

## Review instance

- Worktree: `/home/revatirao/DOCKER/lift-app-dev`, branch `dev/apple-ui`.
- Development app: port **7701**, container `lift-app-dev`.
- Database: `.dev/data/lift.db`, created using SQLite's consistent backup API.
- Baseline: `.dev/backups/baseline.db`.
- Start/rebuild: `docker compose -p lift-dev -f docker-compose.dev.yml up --build -d`.
- Stop: `docker compose -p lift-dev -f docker-compose.dev.yml down`.

The temporary mock container `lift-apple-preview` and its Python preview server
have been removed/stopped, freeing ports 7789 and 7788.

## Design

The approved mock's neutral surfaces, blue accent, system typography, generous
spacing, and floating navigation are applied across Cycle, Train, Progress,
Settings, split management, editors, history, charts, recaps, login, and sheets.
Cycle uses a supporting two-column overview on wider screens and a single column
on phones. Workout controls and data surfaces remain opaque. Navigation uses
CSS backdrop blur with an opaque fallback for reduced transparency.

`public/apple-ui.css` is the design layer loaded after the existing structural
styles and adaptable typography. It owns the new appearance tokens and component
styling. Browser zoom, enlarged text, reduced motion, reduced transparency,
safe-area insets, keyboard focus, and existing dialog focus handling are supported.
Workout logging, API contracts, timer behavior, and plan editing rules are preserved.

The final cycle refinements position the workout icon to the right of its title,
condense week/status labels and session circles into aligned rows, and use matching
symbols in the legend. The legend omits the partial-finished label, while the
pre-existing partial-session data and lifecycle behavior remain intact. Cycle/Home
uses a rounded four-tile dashboard icon. The temporary design-preview header label
has been removed for deployment.

## Live deployment

Merge the reviewed code into `main` in `/home/revatirao/DOCKER/lift-app`, then run
`docker compose up --build -d` there. This targets the `lift-app` container on port
7700 and retains its `./data` mount. Development data is never copied into the
live database. A consistent SQLite backup is taken before deployment.

## Apple resources reviewed

- [Apple Design Resources](https://developer.apple.com/design/resources/)
- [SF Symbols](https://developer.apple.com/sf-symbols/)
- [SF Symbols HIG](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- [Apple Fonts and download license](https://developer.apple.com/fonts/)

Apple's downloadable San Francisco font license does not grant permission to
embed the font in this cross-platform web app. LIFT therefore selects the device's
native system font using `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, and
`sans-serif`; it distributes no Apple font files.

The resources reviewed did not establish a general cross-platform web license for
redistributing SF Symbols. LIFT uses its own existing SVG paths, with refinements
to the cycle and dumbbell artwork. Apple templates, product artwork, logos, and
technology badges are not appropriate runtime UI assets for these features.
The design applies Apple's principles of clear hierarchy, consistent icon weights,
adaptable text, restrained materials, and purposeful feedback.

## Verification

- `npm run check` passes.
- `npm test`: 17 backend tests and 65 frontend/trend tests pass.
- `npm run test:e2e`: 21 real-browser/API scenarios pass on disposable synthetic data.
- Responsive visual review: 95 checks across 11 screens, 320/390/768/1440px,
  light/dark appearances, 150% text size, and modal focus/Escape. No browser errors.
- Database audit against the new baseline: all 362 original session records and
  1,356 set logs preserved; SQLite integrity OK; zero foreign-key violations.

Browser tests accept `PLAYWRIGHT_MODULE`, `SQLITE_MODULE`, and `QA_CDP` to run
against a containerized Node runtime and local headless Chromium where the host
does not have Node installed. Without these overrides they use local Playwright.
