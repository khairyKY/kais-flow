# KAI'S FLOW — Master Specification

> **For:** Claude Code implementation handoff
> **Source of truth:** The `*.dc.html` design files in this project. This spec summarizes, resolves conflicts, and maps behaviors — but when in doubt, the design file wins.
> **Companion files:** `BEHAVIOR/CALENDAR_BEHAVIOR.md`, `BEHAVIOR/TODAY_BEHAVIOR.md`, `Navigation Reference.dc.html`

---

## 1. What is Kai's Flow

A personal productivity app (tasks / calendar / projects / routines / journal / review) dressed as a **19th-century botanical field journal**. Warm paper, pressed-flower illustrations, ink typography, gentle botanical motion. Each app surface maps to a plant species whose growth stage reflects live data.

**The one hard rule:** reproduce exactly what exists in the design files. No improvisation, nothing invented, nothing skipped.

---

## 2. Information Architecture

### Routes (18 screens)

**Plan group** (sidebar primary nav):
| Route | Label | Species | Accent | Source file |
|---|---|---|---|---|
| `/today` | Today | Terrarium (clover) | `--acc-sage` | `Today.dc.html` |
| `/inbox` | Inbox | Hydrangea | `--acc-hydrangea` | `Inbox.dc.html` |
| `/tasks` | Tasks | Cherry blossom | `--acc-blossom` | `Tasks.dc.html` |
| `/calendar` | Calendar | Daisy | `--acc-lavender` | `Calendar.dc.html` |
| `/projects` | Projects | Wisteria | `--acc-moss` | `Projects.dc.html` |

**Cultivate group** (sidebar secondary nav):
| Route | Label | Species | Accent | Source file |
|---|---|---|---|---|
| `/routines` | Routines | Vine | `--acc-moss` | `Routines.dc.html` |
| `/review` | Review | Fern | `--acc-buttercream` | `Review.dc.html` |
| `/journal` | Journal | Fern | `--acc-buttercream` | `Journal.dc.html` |
| `/people` | People | Clover | `--acc-clover` | `People.dc.html` |

**Deep links** (no sidebar item — reached via links, overlays, G go-to):
| Route | Source file |
|---|---|
| `/activity` | `Activity.dc.html` |
| `/focus` | `Focus.dc.html` |
| `/settings` | `Settings.dc.html` |
| `/search` | `Search.dc.html` |
| `/library` | `Library.dc.html` |
| `/herbarium` | `Herbarium.dc.html` |
| `/perennials` | `Perennials.dc.html` |
| `/seasons` | `Seasons.dc.html` |
| `/trash` | `Trash.dc.html` |

**Flows** (not routes — modal/overlay sequences):
| Flow | Source |
|---|---|
| Onboarding (7 steps) | `Onboarding.dc.html` |
| Quick Capture (mobile) | `Quick Capture.dc.html` |
| Morning/Evening Ritual | `Rituals.dc.html` |
| Editor (task/event/block create+detail) | `Editor.dc.html` |

### App shell

- **Sidebar** (260px, left): canonical nav per `Navigation Reference.dc.html`. Plan group is collapsible (see `Editor.dc.html 1g`). Rail can collapse to 64px icon-only.
- **Topbar** (42px): `Kai's Flow · {day} {date} · {sync status}` left, `{timezone}` right. Sync states: Synced●, Syncing ↻ N, Offline ◌ — N saved, Needs a look ⚠ (see `States.dc.html 2a`).
- **Streak widget**: between dashed borders in sidebar. `vine/{stage}.png` + "Streak" + "{current} days · best {best}". Stage: bare (0) → sprouting (1-6) → flowering (7-29) → lush (30+).

---

## 3. Resolved Conflicts

These inconsistencies existed across design files. The prototype resolves them canonically:

| Conflict | Resolution |
|---|---|
| Sidebar group names: Today uses "Plan/Cultivate", Inbox uses "Tend/Cultivate" | **Plan / Cultivate** everywhere |
| Journal missing from Today sidebar | **Include Journal** in Cultivate group on all screens |
| People missing from Today/Calendar sidebar | **Include People** in Cultivate group on all screens |
| Projects missing from Today/Calendar sidebar | **Include Projects** in Plan group on all screens |
| Search shortcut: Today/Calendar use ⌘K, Inbox uses ⌘/ | **⌘K = Capture** (command bar), **⌘/ = Search** (search overlay) |
| Capture in sidebar: only Inbox has it | **All screens** show Capture in sidebar footer with ⌘K |
| Sign out: only Inbox shows it | **All screens** show Sign out in sidebar footer (dimmer) |
| Collapsible Plan group: only Inbox has it | **All screens** support collapsible Plan group per `Editor.dc.html 1g` |
| Mobile tab bar slot 3: Capture vs Tasks | **Capture** (terra FAB with mic icon) — the hero action |

---

## 4. Data Model (mock shapes)

Session-persistent mock store. Changes (check, file, dismiss, star) stick until reload. Only reshuffles existing data — never invents content.

### Tasks
```
{ id, title, project?, projectColor?, due?, overdue?, est?, recurring?, starred, isGoal, done }
```
Sample: 8 tasks. Goal = "Deliver the MVP of the forecasting app". 3 starred (Top 3). 1 overdue 3d. 1 recurring weekly.

### Events
```
{ id, title, start, end, day, accent, primary?, meet? }
```
6 events across Thu–Sun. "Deep work — Forecasting" is primary (lavender, shadow). "Sync with Omar" is blossom (meeting).

### Inbox
```
{ id, title, type, time, filed }
```
3 items: Voice, GitHub, Slack. `filed: true` removes from active list.

### Routines
```
{ id, title, group: 'Morning'|'Afternoon'|'Evening', done }
```
4 items. Groups render as section sublabels.

### Projects
```
{ id, name, stage, color, slipping?, milestones[], tasks, hours }
```
4 projects at p20/p40/p60/p80. Milestones are `{ title, done }`.

### People
```
{ id, name, lastContact, circle }
```
2 people: Omar (inner, 2d ago), Sarah (close, 1w ago).

### Streak
```
{ current: 6, best: 21 }
```

---

## 5. Growth Stage System (7 species)

Each surface = a plant whose stage reflects live data. **Never show a stage that contradicts the data** (house rule).

| Species | Surface(s) | Stages | Driven by | Assets |
|---|---|---|---|---|
| **Terrarium** | Today | seedling → resting → awake → dewdrop → four_leaf | Day's overall health | `clover/*.png` |
| **Hydrangea** | Inbox | zero · light (1-4) · medium (5-19) · heavy (20+) | Pending inbox count | `hydrangea/*.png` |
| **Cherry blossom** | Tasks | bud · opening · bloom · fallen | Completion state | `cherry/*.png` |
| **Daisy** | Calendar | morning · midday · evening · past · future | Clock + day column | `daisy/*.png` |
| **Fern** | Review, Journal, Library | coil · unfurl1 · unfurl2 · full | Length/progress | `fern/*.png` |
| **Clover** | Chat, Rituals, People | resting · awake · dewdrop · seedling · four_leaf | Attention/milestone | `clover/*.png` |
| **Vine** | Routines | bare · sprouting · flowering · lush (30d+) | Streak length | `vine/*.png` + leaf-left/right |
| **Wisteria** | Projects | p0 · p20 · p40 · p60 · p80 · p100 | Weighted milestone % | `wisteria/*.png` |

Set-piece assets: `envelope/`, `seal/`, `tools/pen.png`, `cherry/*-right.png` — used by Weekly Letter and trend visuals.

---

## 6. Per-Page Specification

### Today (`Today.dc.html`)
**Options:** 1a Desktop (field journal, full botanical), 1b iPhone (thumb-first).
**Sections:** Terrarium band (3 species + stats) → Header (date + Voice capture CTA) → Pinned rituals (Morning/Evening progress bars) → Two-column: Left (Top 3 with gold Goal card + starred tasks, Up next events, All open task list) / Right rail (Slipping project card, Routines checklist by group, "From a while ago" resurfaced idea with Still relevant/Later chips).
**Interactions:** Task check (check pop), star toggle, routine check, slipping "reviewed" dismiss, surfaced idea triage — all with toast + undo. See `BEHAVIOR/TODAY_BEHAVIOR.md` for exact motion spec per element.

### Inbox (`Inbox.dc.html`)
**Options:** 1a Desktop triage, 1b Inbox zero, 1c iPhone triage, 2a Dismissed (compost heap, restorable), 2b iPhone Dismissed.
**Sections:** Header (hydrangea + count) → Triage list (cards with File/Dismiss buttons) → Inbox zero state (hydrangea/zero.png + "Inbox zero — the garden can rest").
**Interactions:** File → card slides out (rowOut 200ms), toast "Filed — Undo". Dismiss → same. Inbox zero celebration when last item filed. Hydrangea stage changes with count.

### Tasks (`Tasks.dc.html`)
**Options:** 1a Desktop (list + right-rail sticky notes), 1b iPhone (filter chips), 2a Done (fallen petals), 2b Someday (quiet shelf), 2c iPhone Done.
**Sections:** Header (cherry bloom) → View tabs (Open/Done/Someday) → Task list (checkbox + title + project badge + star + estimate).
**Interactions:** Check → check pop (boxFill 90ms → checkPop 180ms → strikeGrow 240ms → rowDip 1.5px 120ms). Last check → petal fall. Star toggle. Click title → task detail panel.

### Calendar (`Calendar.dc.html`)
**Options:** 1a Desktop (task rail + time-grid), 1b iPhone (day view).
**Sections:** Unscheduled rail (draggable task cards + "drag onto a time to plant it ✿" + quick-add + capacity readout) → Time grid (day headers with daisy stages, all-day band, hour rows 54px each, events, now-line).
**Interactions:** See `BEHAVIOR/CALENDAR_BEHAVIOR.md` for complete spec. Key: drag from rail → grid snaps to 30-min slots, ghost free + placeholder stepped, settle 320ms, catch dip 2px, toast + undo. Event hover lifts, click opens detail. View toggle (Day/4-day/Week). Now-line updates every minute.

### Projects (`Projects.dc.html`)
**Options:** 1a Desktop (active/retainers/areas), 1b Detail (milestones, hours, checklist), 1c iPhone, 2a Board (forest overview), 2b Area detail, 2c Archive, 2d New project form.
**Sections:** Header (wisteria) → Project cards (wisteria stage per card, progress bar, status) → Click → Detail panel (milestones checklist, hours logged, open tasks).
**Interactions:** Click project → stack push detail (380ms). Wisteria stage reflects weighted milestone %.

### Routines (`Routines.dc.html`)
**Options:** 1a Desktop (rituals + streak garden), 1b iPhone, 2a New routine form, 2b iPhone form, 3a Streak vine detail, 3b Rule surfaced, 4a Trellis (one column per day).
**Sections:** Header (vine/flowering + streak count) → Today's routine checklist by group → Streak garden visualization.
**Interactions:** Check routine step → check pop. All done → streak vine advances. Section header → link to full Routines page.

### Review (`Review.dc.html`)
**Options:** 1a Desktop (per-domain sweep), 1b iPhone, 2a Weekly Letter, 2b Letter states, 2c/3c Season so far.
**Sections:** Header (fern) → Domain cards (Tasks, Projects, Streaks, People — each with status indicator: NEEDS LOOK / OK).

### Journal (`Journal.dc.html`)
**Options:** 1a Desktop (write, gather, keep), 1b iPhone (daily page).
**Sections:** Header (fern/full) → Notebook card (date, writing area, gathered quotes). Washi tape on the card. Pencil resting (first entry empty state shows pencil SVG).

### People (`People.dc.html`)
**Options:** 1a Desktop (nudges, then by circle), 1b Person detail, 1c iPhone, 2a Bloom badge list, 2b Person detail with Moments, 2c Today card.
**Sections:** Header (clover) → Nudges (contacts needing attention) → Circle groups (inner, close, wider) → Person cards (avatar initial, name, last contact).

### Activity (`Activity.dc.html`)
**Options:** 1a Desktop (cross-app timeline, filterable), 1b iPhone.
**Sections:** Header (fern) → Timeline of events (completed, filed, created, starred, logged) with dots colored by type.

### Settings (`Settings.dc.html`)
**Options:** 1a Desktop (sub-nav + every section), 1b iPhone, 2a Integrations (4 connection states), 3a Sound (master row, 6 sounds, quiet hours).
**Sections:** Theme (Light/Night), Effects toggles, Sounds, Integrations, Keyboard shortcuts, Data & privacy, Account.

### Focus (`Focus.dc.html`)
**Options:** 1a Timer (Pomodoro mid-round), 1b Garden view (dusk veil, fireflies, petals), 1c Break, 1d Stopwatch, 1e Settings popover. **2a/2b PARKED.**
**Sections:** Timer display → Garden visualization → Session controls.

### Other screens
- **Search** (`Search.dc.html`): Grouped results (tasks, events, people, inbox) by query.
- **Library** (`Library.dc.html`): Shelf tree + reader, book detail with fern progress.
- **Herbarium** (`Herbarium.dc.html`): Pressed specimens of completed projects, seasonal dividers.
- **Perennials** (`Perennials.dc.html`): Recurring tasks grouped by cadence, hover actions, paused items.
- **Seasons** (`Seasons.dc.html`): Year-phase + sky header, quarter goals.
- **Trash** (`Trash.dc.html`): 30-day compost, age groups, restore toast, empty-trash confirm.

---

## 7. Motion Map (26 micro-interactions)

All from `Motion.dc.html`. Durations from `ds/tokens/motion.css`. **All respect `prefers-reduced-motion: reduce`** → instant state change.

### Tokens
```css
--dur-instant:  120ms
--dur-quick:    150ms    /* hover reveal */
--dur-normal:   200ms    /* tab switch, toggle */
--dur-slow:     300ms    /* panel transitions */
--dur-bloom:    600ms    /* petal fall */
--dur-grow:     800ms    /* vine growth */
--ease-out:     cubic-bezier(0.22, 0.61, 0.36, 1)
--ease-in:      cubic-bezier(0.55, 0, 0.68, 0.53)
--ease-natural: cubic-bezier(0.4, 0.0, 0.2, 1)
```

### Sheet 1 — View-level
| ID | Name | Recipe | Where it fires |
|---|---|---|---|
| 1a | Route transition | *(superseded by 2a)* | — |
| 1b | Today petal fall | petalFall 7s linear loop, blossom-colored | Today: on last task complete |
| 1c | Inbox floret drift | floretDrift 5.5s, hydrangea-colored | Inbox: on file (gentle celebration) |
| 1d | Project bloom glow | bloomGlow 3s loop at 100% | Projects: when wisteria reaches p100 |
| 1e | Projects amber drift | petalFall 9.5s, gold leaves | Projects board: ambient |
| 1f | Sidebar streak idle | cloverSway 4s + moteRise pollen | Sidebar: streak-plant widget |

### Sheet 2 — Navigation & drag
| ID | Name | Recipe | Where |
|---|---|---|---|
| 2a | Route cut (fast) | swiftA/B 160ms ease-out, opacity + 6px | Every route change |
| 2b | Stack push/pop (vertical) | pushUp/pushBack 380ms cubic-bezier(0.32,0.72,0,1), parent −26px/0.98/14% dim | Task detail, project detail, any drill-in on desktop |
| 2c | Drag ghost (wobbly) | pickup scale 1.04 + shadow, trail 110ms, tilt ±6°, dragFloat ±1°/2.1s, settle 320ms overshoot | Every draggable (task cards, calendar events) |
| 2d | Filing drag (inbox→project) | Same as 2c, source heals | Inbox filing |

### Sheet 3 — Micro layer
| ID | Name | Recipe | Where |
|---|---|---|---|
| 3a | Mobile stack (horizontal) | hPushIn/hPushBack 380ms, parent −30% + 12% dim, edge-swipe pops | Every drill-in on mobile |
| 3b | Check pop (task complete) | boxFill 90ms → checkPop 180ms overshoot → strikeGrow 240ms → rowDip 1.5px 120ms | Every checkbox |
| 3c | Overlay in/out | overlayCard 210ms in / 140ms out, scrim → 20%, esc obeys immediately | ⌘K, ⌘/, ?, G, event detail, confirm, bulk bar |
| 3d | Toast | toastIn 220ms ease-out, dwell 4s, exit 160ms, single slot bottom-center | Every action with undo |
| 3e | List breathing | rowIn 240ms (height+fade+6px settle), rowOut 200ms slide + 180ms collapse | Task create/delete, inbox filing, list reorder |

### Sheet 4 — Polish layer
| ID | Name | Recipe | Where |
|---|---|---|---|
| 4a | Hover & press | hover −1px + shadow 150ms ease-out, active scale 0.97 80ms | Every interactive surface (buttons, rows, cards, chips) |
| 4b | Entry stagger | enterUp 240ms ease-out, stagger 60ms per block | On route land — header → divider → rows |
| 4c | Calendar drag (snap) | ghost free + placeholder stepped (snap at slot midpoint), snap flash 120ms, resize free→stepped commit, 30-min grid | Calendar: drag task→time, move event, resize event |
| 4d | Drag polish | catch dip 2px/0.996 120ms, edge scroll zone 40px ~90px/s, stacked ghost ±4° fan ≤2+count | Drag drop landing, near-edge scroll, multi-select drag |
| 4e | Stack push/pop (live) | Same as 2b, wired to clicks | Desktop: project→detail, task→detail |

### Sheet 5 — Micro-interaction moments
| ID | Name | Recipe | Where |
|---|---|---|---|
| 5a | Checkbox bloom | bloom 260ms + petal 400ms. Sound: paper rustle | Task check — decoration on top of 3b. Only sheds petal on LAST item |
| 5b | Drag lift | lift 140ms, settle 320ms overshoot. Sound: paper rustle on drop | Every drag pickup |
| 5c | Pull-to-refresh dew | swell tracks pull 1:1, release 200ms | Mobile: any list pull-down |
| 5d | Hover lean | ±3–4° 420ms ease-out, transform-origin bottom | Sidebar plants, terrarium species |
| 5e | Toast petal-fall | exit 160ms + petal 500ms linear | Toast dismiss: one petal falls 30px |
| 5f | Seed plant | drop 260ms ease-in + puff 180ms. Sound: pencil scratch (journal) | Creating any item (task, project, journal line) |

---

## 8. Effects Map (22 recipes)

All from `Effects.dc.html`. These are **currently a library, not yet applied to screens**. The build must wire each to its trigger.

### Ambient loops
| ID | Name | Description | Where to apply |
|---|---|---|---|
| 1a | Petal fall | Cherry petals drift down | Today (after all-done), Tasks (Done view) |
| 1b | Pollen drift | Gold motes rise | Sidebar streak widget, Focus garden |
| 1c | Firefly dusk | Warm dots drift/pulse | Night theme, Focus garden, evening hours |
| 1d | Leaf sway | ±2.2° rotation loop | All botanical illustrations |
| 1e | Bloom glow | Opacity 0.25→0.7, scale pulse | Projects at p100, inbox at zero |
| 1f | Dew glint | Radial-gradient sparkle on dot | Sync reconnect dot, clover dewdrop |
| 1g | Floret drift | Hydrangea-colored balls drift | Inbox on file action |
| 1h | Amber drift | Gold leaves fall | Projects board ambient |
| 1i | Settle-in | Content settles from 8px up | View entry (same as 4b stagger) |
| 1j | Dusk veil | Warm overlay darkens the page | Focus garden, evening ritual closing |

### Applied recipes
| ID | Name | Trigger | Screens |
|---|---|---|---|
| 2a | Seasonal drift | One particle system, four seasonal skins | All screens, ambient, keyed to season |
| 2b | Time-of-day paper | Paper tint shifts warm→cool | All screens, keyed to clock |
| 2c | Idle life | Plants sway after 10s inactivity | All botanical illustrations |
| 2d | Day complete | Petal-burst + quiet banner | Today: all tasks done, goal done, all routines done |
| 2e | Milestone bloom | Grows plant a stage | Projects: milestone complete |
| 2f | Weekly review flourish | Fern unfurls a stage | Review: on review completion |
| 2g | Focus dim | Hovered element full opacity, rest dip to 0.55 | Calendar: emphasize one event |
| 2h | Parasol header | Header compresses on scroll | Mobile: large headers shrink |
| 2i | Ink bleed | Text soaks in on appear | Journal: new text entry |
| 2j | The soft no | Invalid-drop horizontal shake | Calendar: drop on blocked span; any invalid drag target |
| 2k | Boundary resistance | Rubber-band at edge | Calendar: drag past time bounds; list overscroll |
| 2l | Long-press bloom | Radial bloom from touch point | Mobile: long-press to create on calendar |

---

## 9. Overlays (26 surfaces)

All from `Overlays.dc.html`. Motion: overlayCard 210ms in / 140ms out (3c). Esc always closes.

| Category | Overlay | Trigger | Notes |
|---|---|---|---|
| **Menus** | Snooze | Row action / S key / bulk | Duration options |
| | Schedule | Row action / 1-2-3 keys | Quick date pick |
| | Project picker | P key | Assign to project |
| | Priority | !/!!/!!! | Three levels |
| | Repeat | Row action | Cadence picker |
| **Toasts** | Toast | Every action | Undo 5s, single slot, bottom-center |
| **Modals** | Command bar (⌘K) | ⌘K / Capture button | Type → Task/Note/Event |
| | Search (⌘/) | ⌘/ | Full search |
| | Event details | Click calendar event | Read/edit popover |
| | Task detail | Click task / Enter | Slide-over panel |
| | Confirm | Destructive actions only | Two equal buttons |
| | Bulk bar | Multi-select (X) | Actions on selection |
| | Notifications | Right slide-over | Activity feed |
| | Chat (⌘J) | ⌘J | Right slide-over |
| **Mobile sheets** | More sheet | Tab bar "More" | 2-column grid of remaining pages |
| | Snooze/schedule | Touch action | Bottom sheet |
| | Voice capture | Capture FAB | Recording UI |
| | Task detail sheet | Touch task | Full-screen slide-up |
| **Selection** | Bulk actions | X toggle in list | Multi-select bar |
| | Shortcuts (?) | ? key | Full keymap overlay |
| **Jump** | Go to (G) | G key | 3-column grid of all routes |
| | Calendar view options | Calendar settings | Density/toggles |
| | Board view options | Projects board | Grouping |
| | Label picker (L) | L key | Assign label |
| | Label manager | Settings | Create/edit labels |
| **Special** | Garden Postcard | Review / garden view | Week export |

---

## 10. State Families

From `States.dc.html`. Apply per page.

### Empty / First-run (States 1a–1d)
**Rule:** The surface's own flower as seed/sprout + one hand-script line + exactly one CTA button. **Never gray, never two buttons.**
- Today empty: seedling clover in terrarium, "Nothing planted for today yet.", [Plan today]
- Today all-done: petal pile, "All done. The garden can rest." (NO button)
- Projects empty: pots on shelf, "No projects growing yet.", [+ Plant the first one]
- Journal first entry: open notebook with pencil, cursor. "The first page is the hardest — one sentence counts."

### Sync (States 2a–2d)
**Topbar strip swaps text/glyph only. The word "error" never appears.**
| State | Display | Behavior |
|---|---|---|
| Synced | `Synced ●` (sage dot) | Default |
| Syncing | `Syncing ↻ N` | Count = writes flushing, live |
| Offline | `Offline ◌ — N saved here` | Click → queue popover listing pending writes. "Everything here syncs the moment you're back." |
| Needs a look | `Needs a look ⚠` (terra) | One conflict waits. No banner — just the topbar |
| Reconnect | `Synced ●` with dewdrop glint (300ms) | One glint animation, then normal |

### Conflict (States 2c)
Two versions shown side by side, two equal "Keep this one" buttons. Never auto-picked. Surfaces as a Today card if unresolved for a day.

---

## 11. Keyboard Shortcuts

| Key | Action |
|---|---|
| ⌘K | Quick Capture (command bar) |
| ⌘/ | Search |
| ⌘J | Chat (right slide-over) |
| G | Go to (jump to any view) |
| ? | Keyboard shortcuts overlay |
| S | Snooze |
| P | Project picker |
| X | Toggle selection |
| L | Label picker |
| Esc | Close any overlay / detail / go back |
| 1/2/3 | Schedule shortcuts (today/tomorrow/next week) |

---

## 12. Design Tokens (load unchanged from `ds/tokens/`)

### Colors (`colors.css`)
- Paper ground: `--paper-linen`, `--paper-parchment`, `--paper-sidebar`, `--paper-bone`, `--paper-event`, `--paper-goal`
- Ink: `--ink-body`, `--ink-muted`, `--ink-faint`, `--ink-hairline`
- Lines: `--line-card`, `--line-solid`, `--line-dashed`, `--line-sidebar`, `--line-goal`
- Accents: `--acc-sage`, `--acc-hydrangea`, `--acc-blossom`, `--acc-lavender`, `--acc-moss`, `--acc-buttercream`, `--acc-terra`, `--acc-gold`, `--acc-clover`
- Accent-text variants: `--acc-sage-text`, `--acc-lavender-text`, etc.
- Signals: `--sig-done`

### Typography
- Display: `Source Serif 4` (variable, 8–60 optical size, 400–600)
- UI: `Inter Tight` (400–600)
- Mono: `Courier Prime` (400, 700, italic)
- Hand: `Caveat` (400–600)

### Spacing
4px base unit. `--sp-1` (4px) through `--sp-8` (32px).

### Effects
- Shadows: `--shadow-crisp`, `--shadow-card`, `--shadow-cta`, `--shadow-panel`, `--shadow-popover`, `--shadow-drop-sm`
- Paper noise: `--noise-url` (SVG data URI with fractal noise filter)
- Card tilts: `--tilt-*` variables for slight card rotations

---

## 13. House Rules (binding constraints from Design System §06)

1. No pure white (`#fff`) or hard black (`#000`) — always off-white/warm dark.
2. No bright saturated primaries — the palette is muted, botanical.
3. No modern rounded-16 cards — max radius is `8px` (overlays), `3px` (content cards), `999px` (pills).
4. No brutalist shadows — always warm, layered, soft.
5. Washi tape only on **placed standalone cards** — never on plain list rows.
6. No emoji beyond the `✿` marker. Type icons, botanical illustrations, or SVG.
7. ≤ 4 section labels per screen (the right rail's sub-labels are smaller and don't count).
8. **Never show a plant stage that contradicts the data.**
9. The word "error" never appears in the UI.
10. Minimum text: 24px on 1920×1080 slides, 12pt in print, 44px touch targets on mobile.

---

## 14. Parked Items (do NOT build)

Per `AUDIT.md` and `FUTURE_WORK.md`:
- **Focus 2a/2b** — "A Year in the Garden" (year-scrub mode)
- **Review 4a** — Weekly Letter v2 arrival animation (correct but needs live data + first-open logic)

---

## 15. Build Priority

1. **Foundation**: Shell (sidebar + topbar + routing + theme plumbing), tokens loaded unchanged, assets copied, paper-grain root
2. **Core loop**: Today → Inbox → Tasks → Calendar (full interactivity)
3. **Cultivate**: Projects → Routines → Review → Journal
4. **People + Activity + Search + Settings**
5. **Focus + Library + Herbarium + Perennials + Seasons + Trash**
6. **Overlays + command surfaces** (⌘K, ⌘/, ?, G, toasts, bulk bar, sheets)
7. **States application** (empty, offline, sync, conflict — per page)
8. **Effects + Motion wiring** (map each to its trigger)
9. **Night theme** pass (`colors.dark.css`)
10. **Mobile** pass (iPhone variants for every page that has them)
11. **Fidelity QA**: side-by-side against originals, every inventory item present
