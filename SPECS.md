# Kai's Flow — UX Specifications & Session Log

> Last updated: 2026-07-07
> Main spec document covering all UX findings, implementation scope, and work completed.

---

## Session Summary

UX audit of P0–P5 identified 8 improvement areas across the app. Six of these are design debt (P5.5 batch); one is calendar context menus (pulled forward, already implemented); Project Detail page gap stays in P7.

> **2026-07-08 update:** P5.5 was superseded — D2 now lives in `docs/phases/UX-retrofit.md` (step 10), C/D1/D3/E/F in `docs/phases/MOTION-retrofit.md` (step 1). Note the File Index below lists Projects pages (`ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `NewProjectPage.tsx`, `NewRoutinePage.tsx`) that do **not** exist in the tree — they are P7 mockup targets, not current files.

---

## Scope A — Calendar Right-Click Context Menus ✅ DONE

### What was built

**`app/src/components/ContextMenu.tsx`** — reusable context menu overlay:
- Positioned absolutely at `{x,y}` with boundary clamping (stays within viewport)
- Closes on: Escape key, click outside, menu item activation
- Entrance animation (`itemFadeIn`), paper aesthetic (`--bg-surface`, `--shadow-panel`, `--tilt-neg-sm`)
- Each item: icon + label, hover background, danger color support, disabled state

**`app/src/features/calendar/api.ts`** — added `convertEvent()`:
- Toggles a calendar event between task-linked (scheduled task block) and standalone event
- When converting to event: clears `task_id`, sets `busy: false`
- When converting to task block: sets `busy: true`

**`app/src/features/calendar/CalendarGrid.tsx`** — added `onContextMenu`:
- New prop `onContextMenu: (id: string, x: number, y: number) => void`
- Uses FullCalendar `eventDidMount` to attach native `contextmenu` event listener to each event DOM element

**`app/src/features/calendar/CalendarPage.tsx`** — wired context menu:
- Replaced `window.confirm()` on left-click (left-click now no-op, reserved for future detail view)
- Right-click menu items:
  - **Delete** — un-schedules the task (task survives in task list), calls `deleteEvent()`
  - **Replan** — prompt()-based natural language date input with fallback to "next day 10am"
  - **Convert Type** — toggles between Scheduled Task (has task_id) and Calendar Event (no task_id)

### What remains
- **Delegate** — not yet implemented (needs chat/assignment integration)
- **Replan UI** — prompt() is basic; could be replaced with a styled date picker overlay or command-bar integration
- **Time Slots** (containers bundling multiple tasks) — not yet implemented, backlog

---

## Scope B — Project Detail Page Gap

**Status:** NOT STARTED (assigned to P7)
**Files:** `features/projects/ProjectDetailPage.tsx` vs `design/Project Detail.dc.html`

### Mockup has but current code lacks:

| Feature | Current | Mockup |
|---|---|---|
| Editable title | Static `<h1>` | Inline `<input>` |
| Target completion | "Ongoing" hardcoded | Dynamic target date |
| Color swatch picker | None | 9 clickable swatches |
| Hours logged counter | None | 46px running counter |
| Milestones + progress vine | None | Weighted milestones with wisteria PNG (p0-p100) |
| Checklist (ONE-SHOT / TASK-LINKED) | None | Full checklist with type toggle |
| Add Task form priority + date | Plain input | Priority select + date picker |
| Activity Log tabs | Placeholder "No activity" | WORK LOG / UPDATES tabs with logging form |

---

## Scope C — Dropdown / Select Standardisation

**Status:** NOT STARTED (P5.5 Step 5)

7 inconsistent `<select>` styles across the app:

| File | borderRadius | bg | padding | font |
|---|---|---|---|---|
| `ProjectDetailPage.tsx` | 6px | `--bg-hover` | 8px 12px | `'Inter Tight'` hardcoded |
| `NewRoutinePage.tsx` | 4px | `--bg-hover` | 10px 14px | `'Inter Tight'` hardcoded |
| `RoutinesPage.tsx` | 6px | `--bg-input` | 8px 10px | `inherit` |
| `NewProjectPage.tsx` | 4px | `--bg-hover` | 10px 14px | `'Inter Tight'` hardcoded |
| `InboxPage.tsx` | `--radius-input` | `--bg-input` | 7px 10px | `var(--font-ui)` |
| `ProjectsPage.tsx` | 999px (pill) | N/A | 6px 14px | `var(--font-mono)` |

**Action:** Create `components/Select.tsx` with consistent paper styling (`--bg-input`, `--line-card`, `--radius-input`, `var(--font-ui)`), then replace all instances.

---

## Scope D — Static / Hardcoded Placeholders

**Status:** NOT STARTED (P5.5 Steps 2 + 5)

### D1 — Dropdown static options
Remove static placeholder `<option>`s like "Select a domain" from dropdowns. Keep text input placeholders. Default to first real option or empty.

### D2 — Routine stats hardcoded
**File:** `features/routines/RoutinesPage.tsx`

| What | Current | Target |
|---|---|---|
| Header | `82%` (hardcoded) | Computed from `routine_completions` over 30-day window |
| Header | `78%` (hardcoded) | Computed from `routine_completions` over 7-day window |
| Sparkline | Empty `<svg>` | Polyline from real completion data |
| Streak risk | "Streak Risk: Keep it up!" (static) | Dynamic based on streak vs goal |

**Requires:** Extend `computeStreak()` in `streaks.ts` to calculate percentage rates.

### D3 — Flowers not loading
Check `public/assets/` for missing transition PNGs per plant (cherry, clover, hydrangea, daisy, wisteria, fern). State calculator in `Terrarium.tsx` may reference invalid paths.

---

## Scope E — Search Icon (Quick Win)

**Status:** NOT STARTED (P5.5 Step 3)

**File:** `components/AppLayout.tsx`

Replace blank spacer in the sidebar Search button with a magnifying glass SVG matching `NavIcons.tsx` style.

---

## Scope F — Terrarium Sticker Responsiveness

**Status:** NOT STARTED (P5.5 Step 4)

**File:** `features/today/Terrarium.tsx`

Problems:
- 6-column grid `repeat(6, minmax(0, 1fr))` with no media queries
- Absolute "washi tape" stickers use fixed-pixel `left` values (81, 76, 77, 90, 78, 81)
- Stickers float away from flowers on tablet/mobile

**Action:**
- Breakpoints: `>=1024px` 6-col, `768-1023px` 3-col, `<768px` 2-col
- Convert tape positions to relative/percentage units

---

## Scope G — Missing Akiflow UX Features (Backlog)

| Feature | Description | Effort | Assigned |
|---|---|---|---|
| **Time Slots** | Calendar containers bundling tasks, project color-coded | Large | Future phase |
| **Replan Undone Tasks** | Magic button rescheduling uncompleted tasks | Medium | Future phase |
| **Snooze** | Temp-remove from inbox with push reminder | Medium | Future phase |
| **Natural Language Planning** | "next Monday 2pm" in plan field | Medium | Future phase |
| **Task Locking** | Lock tasks on calendar, visible as busy | Small | Future phase |
| **Focus Mode** | Distraction-free column for one time slot | Medium | Future phase |

---

## Design Tokens Reference

All tokens defined in `app/src/styles/tokens/`:

| Category | File | Key tokens |
|---|---|---|
| Colors (light) | `colors.css` | `--bg-app`, `--bg-surface`, `--bg-input`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--border-default`, `--border-dashed`, `--line-card`, `--acc-terra`, `--acc-sage`, `--acc-gold`, `--acc-gold-warm`, `--line-goal`, `--paper-goal` |
| Colors (dark) | `colors.dark.css` | Same semantic names remapped to `--sky-*`, `--moon-*` |
| Typography | `typography.css` | `--font-display`, `--font-ui`, `--font-mono`, `--font-hand`, `--fs-*`, `--fw-*`, `--ls-*` |
| Spacing | `spacing.css` | `--sp-*` 4px scale, `--gap-*`, `--pad-*`, `--radius-*` |
| Effects | `effects.css` | `--shadow-*`, `--tilt-*`, `--noise-url` |
| Motion | `motion.css` | `--dur-*`, `--ease-*`, `@keyframes cloverSway/fireflyDrift/twinkle/etc` |

**Rule:** Never use hex literals. Map through design tokens or the SWATCHES palettes in `ProjectsPage.tsx`.

---

## Phase Assignments

| Scope | Phase | Status |
|---|---|---|
| **A** — Calendar Context Menus | P5.5 (implementation details) | ✅ Built in session |
| **B** — Project Detail Page | **P7** (milestones, progress vine) | Not started |
| **C** — Dropdown Standardisation | **P5.5** Step 5 | Not started |
| **D1** — Static dropdown `<option>`s | **P5.5** Step 5 | Not started |
| **D2** — Routine hardcoded rates | **P5.5** Step 1 | Not started |
| **D3** — Flowers not loading | **P5.5** Step 2 | Not started |
| **E** — Search icon | **P5.5** Step 3 | Not started |
| **F** — Terrarium responsiveness | **P5.5** Step 4 | Not started |
| **G** — Akiflow backlog | Future phases | Future |

---

## File Index (Key Files)

| Path | Purpose |
|---|---|
| `components/AppLayout.tsx` | Main layout: sidebar, nav, search/chat/command overlays |
| `components/ContextMenu.tsx` | Reusable context menu (right-click) |
| `components/icons/NavIcons.tsx` | All SVG nav icons |
| `features/calendar/CalendarGrid.tsx` | FullCalendar wrapper |
| `features/calendar/CalendarPage.tsx` | Calendar page with context menus |
| `features/calendar/api.ts` | Calendar CRUD + `convertEvent()` |
| `features/projects/ProjectDetailPage.tsx` | Project detail (70% incomplete vs mockup) |
| `features/projects/ProjectsPage.tsx` | Projects list with search/filter |
| `features/projects/NewProjectPage.tsx` | New project form |
| `features/routines/RoutinesPage.tsx` | Routines list (hardcoded stats) |
| `features/routines/NewRoutinePage.tsx` | New routine form |
| `features/routines/streaks.ts` | Streak computation |
| `features/today/Terrarium.tsx` | Plant grid with stickers |
| `features/today/TodayPage.tsx` | Today dashboard |
| `features/tasks/TasksPage.tsx` | Tasks list |
| `features/search/SearchOverlay.tsx` | Full-screen search modal |
| `features/command-bar/CommandBar.tsx` | Cmd+K quick actions |
| `lib/types.ts` | All TypeScript interfaces |
| `lib/outbox.ts` | Offline write queue (IndexedDB + Supabase) |
