---
date: 2026-10-03T08:00+03:00
session: builder T (desktop polish — Kai's Windows-app feedback, interface size 125–150%)
type: handoff
related: Kai's 2026-10-03 desktop screenshots (items 1–11 of the conductor's brief) · docs/DATA_MODEL.md (0043, 0044)
---

# Desktop polish: the Windows app at 150% scrolls, fits and right-clicks like an app

Branch `claude/desktop-polish`, cut from local `claude/decisions` (a24da94; origin was stale, GitHub DNS down), then **merged with `origin/claude/wave-o` (8c24fef, = v1.0.15)** — no conflicts; the gate and every harness below were re-run on the merged tree. Not merged into wave-o/master, not deployed. The phone calendar (`PhoneCalendar*.tsx`, `PhoneSheets.tsx`), `TaskSheet.tsx`, `features/auth/*`, `supabase/templates`, `supabase/config.toml` were not touched.

## What changed

1. **Calendar view button** (`CalendarPage.tsx`): "WEEK ⚟" is now "WEEK" + the kit's `chevdown` (the phone title's glyph).
2. **Default calendar view, synced** — migration **0043** `app_settings.calendar_default_view text check in ('day','3day','week')`, null = never chosen.
   - `lib/settings.ts`: `parseCalendarDefaultView(raw)` and **`useCalendarDefaultView(platformDefault)`** — the choice, else `platformDefault`; `undefined` while the settings row loads. The phone wires it with `useCalendarDefaultView('day')` (conductor, after merging Q).
   - Desktop calendar applies it once, when the settings row arrives (unset = Week, as today). "3 days" is the N-day view held at 3 for that visit; the popover's own N (`calendar_day_count`) is untouched.
   - Settings: a **Calendar** card ("Opens on · Day · 3 days · Week", the subnav gets Calendar) and the same row on the phone's Appearance card (showing Day there when unset).
   - Only the views both calendars have. The desktop's 2/4/5/6-day and Month views exist only there, so they aren't offered.
3. **Settings scrolls from anywhere.** Root cause: the content column was an `overflow-y: auto` box with no bounded height (Shell fit, 2026-09-26, made `.kf-route` grow with the page). It never scrolled. It only swallowed the wheel: index.css gives every `overflow-y: auto` box `overscroll-behavior: contain`, so the page behind it (`.app-main-content`, the one real scroller) stood still unless the pointer was over the nav. The box no longer scrolls on its own.
   - **Same bug, same fix:** `/settings/import`, `/activity` (desktop), `/herbarium`, `/trash`, `/library` (both columns). A scan of 17 routes at 150% found no others.
   - Settings at 150% also ran ~56px off the card sideways (Interface size, Sound meter, Paper texture rows). They wrap now.
4. **Right-click.**
   - `lib/nativeMenu.ts`, installed in `main.tsx`: the WebView's own menu (Back / Refresh / Save as / Print) is prevented app-wide. It is still allowed in text fields (input, textarea, contenteditable) and over selected text. Our menus call preventDefault themselves, as before.
   - **Projects page:**
     - Project rows: Open · Rename · Finish & press · Delete.
     - Area rows: Open · Rename · Delete.
     - Opened by right-click or a ⋯ button. The ⋯ is quiet until hover on desktop, always shown on touch, and opens an ActionSheet on a phone.
     - Board cards get the right-click menu too.
     - Rename edits the name in place: Enter or blur saves, Esc keeps the old name.
     - Finish & press goes to the Herbarium press. That ceremony archives the project and has its own Undo.
   - **Deleting projects and areas** — migration **0044**:
     - `deleted_at` on `projects` and `areas`.
     - Delete = Trash with "Moved to Trash · Undo" and no confirm (`deleteProjectWithUndo`, `deleteAreaWithUndo`). Logged as `project.deleted` / `area.deleted`.
     - `useProjects` / `useAreas` hide trashed rows.
     - Trash lists them with a Project / Area badge and restores them. "Delete forever" hard-deletes the row.
     - Their tasks are never written: they keep `project_id` / `area_id` while the container is in Trash, so Undo / Restore puts everything back.
     - When the container is composted (30 days, `compost_expired()` now covers both tables), the FKs let go and the tasks keep living without it. `tasks.area_id` had no ON DELETE action, so it became `on delete set null`, like `project_id`.
     - `slipping` skips trashed projects and areas.
5. **Focus picker** (`features/focus/TaskPicker.tsx`, `taskFilter.ts`):
   - A search field on top. Typing filters by every word in any order. ↑/↓ move. Enter picks (the first match until you move). Esc or a click away closes.
   - It is drawn on `<body>` and placed with `placeSelect`, so it stays inside the window at 150% and never under the garden strip.
6. **Quick-create** (`QuickCreate.tsx`):
   - One "When" row (date · start–end · duration). A task's due time and block start were already one field.
   - Priority and project share a row. The hint line is gone.
   - The popover is measured and placed beside the pointer with `placeAtPointer` (`components/selectPlacement.ts`: flip, then shift). It fits a 1280×720 window at 150% for Event, Task and Time block with no inner scroll.
   - "More options" is unchanged.
   - **"Invalid Date"** came from FullCalendar's drag mirror, which carries none of our `kf*` props. In a narrow column (150%) the start-only label printed `clockTime(undefined)`. Labels now read the event's live start and end.
7. **Main view width.**
   - Root cause: `.kf-route` is a flex column, and a page root with `margin: 0 auto` doesn't stretch there (auto margins turn stretch off). Today (and Perennials, Quick capture) shrank to their content and sat centred in empty paper. Today was 604px wide in a 1598px column.
   - Today's root drops the auto margins. Perennials (both states), Quick capture and the phone Projects list now state `width: 100%`.
   - A blanket `.kf-route > * { width: 100% }` was tried first. It took the bleed off pages that reach past the gutters with negative margins (the phone calendar), and calendar-phone 7h failed, so it was reverted.
   - One page width, `--kf-page-max: 1280px`, for Today and Tasks. Both are left-aligned from the gutter.
   - Today's side column (Routines · Slipping) grows 264 → 340 with it.
   - Projects (list 900, board 1100) and Settings (a form column) keep their own content widths.
8. **Check for updates** (`lib/appUpdate.ts`, Settings → App, also on the phone; one request per click):
   - **Web / PWA:** fetch `/version.json?t=…` (no-store) and compare its `commit` with this page's own `<meta name="kf-build">` (vite.config's buildStamp). If newer: "A new version is ready · Reload". Reload runs `registration.update()` on the PWA's service worker (main.tsx now hands over the registration); autoUpdate swaps it in and reloads, with a forced reload after 4s as a fallback.
   - **A dev server** (no build stamp) says so.
   - **Android** (Capacitor) and **Windows** (Tauri): GitHub's `releases/latest` for `khairyKY/kais-flow`. Its `tag_name` is compared (semver; a `-dev` build counts as older) with the installed version: `App.getInfo().version` on Android; on Windows, Tauri core's `plugin:app|version`, which `core:default` allows.
     - If newer: "v1.0.15 is out · Download", which opens that release's own `kais-flow-vX.Y.Z.apk` / `kais-flow-vX.Y.Z-windows-setup.exe`.
     - If the release has no file for this platform yet: "is out — its APK/installer is still on its way".
   - Up to date reads "You're on the latest (vX.Y.Z / build abc1234)". Offline or errors give a calm line, never a throw.
   - Under the button: this version, plus "built <date>".
9. **The task editor's time list** opened at the far right, half off-screen. `TimeField` passed its input's rect (visual px) to `position: fixed` (layout px), so the root zoom applied twice. It now uses `placeSelect`: zoom-divided, flipped above when there's more room, kept inside the window.
   - Swept every `getBoundingClientRect` → fixed-position site. The rest already divide by `uiZoom()`, or hand visual px to a consumer that does (ContextMenu, SnoozeMenu, ProjectPicker, DatePicker, Select, ViewOptionsPopover, StackMorePopover, `rowAnchor`, MorningRitual).
   - New ones here use the shared helpers.
10. **Collapsed rail** (`AppLayout.tsx`):
    - Each row's 12px side padding plus its 18px icon (42px) was wider than the 35px the rail left it. The icon overflowed its box to the right: the active box read off-centre to the left, its tape poked out past it, and a strip sat empty on the right.
    - Collapsed, the box now hugs the centred icon, the tape centres on the box, and the inbox count rides the box's corner.
    - At 125–150% the collapsed icon column ran **under the pinned footer**: F7 kept it `overflow: visible` so the hover labels weren't clipped. It now scrolls, with no scrollbar strip, and the hover labels draw on `<body>` (fixed, beside the row).
11. **Quarter hours:** the desktop grid snaps drags, moves and resizes to 15 min (`snapDuration`). The drawn lines stay half-hourly.
    - A plain click still makes a half-hour: `handleGridCreate` widens a one-snap selection.
    - Every time list (quick-create, task editor) already offered 15-min steps; typed times are still taken as typed.
    - Also: closing quick-create now drops FullCalendar's slot highlight. Before, a click on a still-selected slot never selected again, so Esc and re-clicking the same slot did nothing.

**Pure logic, tested** (+4 files, +21 tests):
- `placeAtPointer`: 5 tests.
- `parseCalendarDefaultView`: 3.
- `compareVersions`, `nativeVerdict`, `releaseAssetName`: 6.
- `allowsNativeMenu`: 4.
- `filterFocusTasks`: 3.

## Evidence

- **Gate** (merged tree; no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 82 files / 1055 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo.
    - Run from PowerShell; each run's offset was checked (0 / −180 / 420 / −540).
    - Git Bash drops a `TZ=Area/City` prefix, so the slash zones silently ran on the local clock there.
    - This branch adds +5 files / +21 tests.
  - `npm run lint`: 0 errors, 19 warnings. No new warning: the only one in a touched file is ProjectsPage's existing `getWisteriaImage` export.
  - `npm run build`: ok.
- **Browser** (`docs/log/assets/desktop-polish/verify.mjs`: Playwright + system Chrome against the mocked backend, `npm run dev -- --port 5247 --mode mock`, http://localhost:5247; 1280×720, interface size 150% unless stated; day + night; every write recorded): **150/150** on the merged tree. Covered:
  - **Settings:** the wheel over the content cards scrolls the page at 150% and 100%, and the nav still does; no sideways scroll. Opens on shows Week when unset; picking 3 days writes `calendar_default_view: '3day'`. Import / Activity / Herbarium / Trash / Library scroll with the pointer over their content.
  - **Calendar:** unset → WEEK (7 columns); `day` → DAY (1); `3day` → 3 DAYS (3); `week` → WEEK. The view button holds the chevdown SVG and no ⚟.
  - **Drag-select at 150%:** the preview reads a real time ("5:30 AM"), no "Invalid Date". Three quarter-hour cells → a 45-minute slot, shown as "45m" on the When row. Quick-create fits the window with no inner scroll for Event, Task and Time block. A plain click → 30 minutes. Quick-create's time list is inside the window.
  - **Task editor** at 125% and 150%: the time list opens inside the window, aligned to its field, in 96 quarter-hour steps.
  - **Projects:** right-click an area → Open · Rename · Delete; a project → Open · Rename · Finish & press · Delete. contextmenu is prevented on the page, not in an input, not over selected text. ⋯ → Rename writes the name + `project.renamed`. Area Delete writes `deleted_at` + `area.deleted` and no task writes; the row leaves, "Moved to Trash"; Undo writes `deleted_at: null` and the row is back.
  - **Trash:** the trashed area is listed with an Area badge, and Restore writes `deleted_at: null`.
  - **Focus:** the picker opens inside the window with the search focused. "tyre" → one match; Enter picks it and closes; ↓↓ moves; Esc closes.
  - **Collapsed rail** at 100 / 125 / 150% (1280×690): every box centred in the rail with its icon centred in the box (≤1.5px); the active tape inside its box; the footer hit-testable; the hover label beside its row.
  - **Width** (1920×1080 at 100 / 125 / 150%, 1280×720 at 100 / 150%, rail open and collapsed): Today and Tasks fill the column up to 1280 from the gutter, at the same width as each other.
  - **Updates:**
    - Web: newer → Reload; same → "You're on the latest (build aaaaaaa)"; offline → a calm line.
    - Windows (Tauri internals stubbed at 1.0.14): the card shows v1.0.14; newer → "v1.0.15 is out" + Download after one GitHub request, and Download requests `kais-flow-v1.0.15-windows-setup.exe`; same → "You're on the latest (v1.0.14)"; offline → a calm line.
  - No page errors in any scene.
- **Regression** (same server, merged tree):
  - `calendar-phone` 175/175 · `today-phone` 157/157 · `task-sheet` 147/147 · `importers` 99/99 · `herbarium/verify-press` 40/40.
  - `pickers/verify-pages.mjs` imports a bare `playwright-core` it can't resolve here, so it didn't run.
- **Screenshots** in `docs/log/assets/desktop-polish/`:
  - `settings-150-{day,night}`, `settings-calendar-*`
  - `calendar-3day-*`, `calendar-drag-*`, `quickcreate-task-*`
  - `task-editor-timelist-*`
  - `projects-area-menu-*`, `projects-area-deleted-*`, `trash-area-day`
  - `focus-picker-*`, `rail-collapsed-150-*`, `today-1920-*`
  - `updates-web-newer-day`, `updates-windows-newer-day`

## The pill / dot at the bottom centre of Kai's screenshots

Nothing of ours sits at the bottom centre on the desktop when idle:
- The toast host is 0×0 when empty.
- The bulk bar exists only with a selection.
- The tab bar and its capture button are `display: none` at ≥768px.

**The grey toggle-like pill on Settings** is the shell scroller's **horizontal scrollbar**. index.css styles every scrollbar as 10px with a rounded, inset hairline thumb, which reads as a pill. Settings at 150% ran ~56px wider than the column, so `.app-main-content` (overflow-y:auto ⇒ overflow-x:auto) grew a horizontal scrollbar along its bottom edge. Fixed here: no sideways scroll on Settings or any of 20 routes at 1280×720 / 150%. Library still overflows; see Risks.

**The purple dot on Today** isn't explained by anything in the DOM here: Today has no sideways overflow in any combination checked, and no app element is there. It is probably WebView2 / Windows chrome (an overlay-scrollbar or input-method indicator), not the app. It needs Kai's screenshot or Tauri devtools to confirm. Not changed.

## Deviations

- **Calendar default:** the phone isn't wired here (the brief: the conductor wires it after merging Q). The desktop's other day counts and Month aren't offered, because the phone lacks them.
- **Width:** Today is left-aligned now, like Tasks / Projects / Settings, instead of centred. At 1920 / 100% both leave ~318px on the right rather than splitting it. At Kai's 125–150% they fill the column.
- **Projects ⋯:** Finish & press goes straight to the press with no confirm card. The press is the ceremony and ends with its own Undo. The detail page keeps its confirm.
- **Download on Windows** navigates the WebView to the GitHub asset URL. WebView2 turns an attachment response into a download and the app stays put. There is no Tauri shell/opener plugin (that would be a new Rust dependency).
- **Typed times** in the time fields are kept as typed (e.g. 9:43). The lists offer quarters and the grid snaps to them.

## Risks / not done

- **Migrations 0043 / 0044 must be pushed before this ships.** release.yml pushes migrations before the deploy, so the pipeline order is right.
  - Before 0043: picking an "Opens on" adds `calendar_default_view` to the settings row, and that write (and every later settings write) is rejected.
  - Before 0044: Trash simply omits projects and areas, but a project or area Delete is rejected.
  - The SQL was reviewed, not executed: no local Postgres here.
  - `tasks_area_id_fkey` is Postgres's default name for 0010's inline FK, and 0044 drops it `if exists` before re-adding it.
- **Not checked on hardware:**
  - WebView2's handling of Download; the GitHub API from the Tauri origin.
  - `plugin:app|version` on the installed v1.0.14 build. If it is refused, the card says "version unknown" and the check answers "is out" without a Download.
  - Capacitor opening the APK URL in the browser.
- **Migration files** follow the repo's `00NN_name.sql` numbering (0043, 0044), not the CLI's timestamp names. wave-o adds none, so the numbers don't collide.
- **The collapsed rail** scrolls with no visible scrollbar. On a short window the bottom icons are one wheel away, not visible at once.
- **Library still overflows sideways at 150%** (683 vs 611 px). It predates this branch and is out of scope.
- **No ROADMAP or INDEX line** (conductor).
