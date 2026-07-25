# PAGE BEHAVIORS — every screen, exactly what happens

> For Claude Code. Each page: purpose, layout, sections, interactive elements, which motions/effects fire, states. Source files are the `*.dc.html` designs. See `MOTION_RETROFIT.md` for the full motion/effects wiring table.

---

## Today (`Today.dc.html` — 1a desktop, 1b iPhone)

**Purpose:** The daily OS. Everything for today on one surface.
**Species:** Terrarium (clover) — `--acc-sage`.
**Layout:** Sidebar → Main (topbar + content). Content = terrarium band → header → pinned rituals → dashed divider → two-column grid (main left + 264px right rail).

### Left column
| Section | Content | Interactions |
|---|---|---|
| **Terrarium band** | 3 botanical illustrations (cherry/bloom, hydrangea/light, vine/sprouting) + "Day 42" + "pressed & kept" hand text + stats (inbox count, done/total, streak) | Read-only. Card has washi tape, rotate(-0.3deg). Hover lean on plants (5d). |
| **Header** | "Today" kicker + "Friday, July 10" display + Voice capture CTA button (terra, mic SVG) | CTA → opens ⌘K capture overlay. Hover lift + glow shadow (4a). |
| **Pinned rituals** | Morning ritual (sun SVG, progress bar, 2/4) + Evening ritual (moon SVG, progress bar, 0/2). Both cards with "◧ pinned" label. | Click card → navigate to Rituals. Progress bar reflects routine completion live. |
| **Top 3** | Gold Goal card (washi tape, ✶ kicker, four_leaf clover, "for luck") + 2 starred task rows with ★. | Goal checkbox → check pop + day-complete petal-burst (2d). Star toggle (★↔☆). Task title click → task detail panel. |
| **Up next** | 3 calendar events: "Now" (terra) + two timed. "Open calendar →" link. | Click "Open calendar →" → route to Calendar. Event rows are read-only. |
| **All open** | Full task list with checkboxes + project badge + overdue/estimate/recurring meta + star. | Check → check pop (3b) + toast "Done — Undo". Star toggle. Title click → task detail (2b stack push). Hover lifts row. |

### Right rail (see `TODAY_BEHAVIOR.md` for full detail)
| Section | Content | Interactions |
|---|---|---|
| **Slipping** (terra label) | Project card (wisteria/p20, "5 days untouched", "reviewed" link) | Click card → project detail (stack push). "reviewed" → card files out + toast. Section absent when nothing slips. |
| **Routines** | Checklist by group (Morning/Afternoon/Evening). Done = filled ✓ + strike. | Check → check pop (3b). Last step → petal bloom (5a). All done → day-complete (2d). Header click → Routines page. |
| **From a while ago** | Resurfaced idea card with washi tape. "Still relevant" (terra) / "Later" (outline) chips. | Chips → card files out + toast. Click quote → open note (stack push). |

### Mobile (1b)
Same content stacked vertically. Week strip absent. Pinned rituals as compact link cards. Tab bar: Today (active) / Inbox / Capture FAB / Cal / More. Pull-to-refresh dew (5c).

---

## Inbox (`Inbox.dc.html` — 1a triage, 1b zero, 1c iPhone, 2a Dismissed, 2b iPhone dismissed)

**Purpose:** Triage incoming items. File or dismiss — never two-button choices.
**Species:** Hydrangea — stage driven by pending count (zero/light/medium/heavy).

| Section | Content | Interactions |
|---|---|---|
| **Header** | Hydrangea illustration (stage by count) + "Triage" + "{N} waiting" | Illustration changes live as items are filed. |
| **Triage list** | Cards: title + type label (Voice/GitHub/Slack) + time + File/Dismiss buttons | File → card slides out (rowOut 200ms), floret drift (1g), toast "Filed — Undo". Dismiss → same without floret. Hover lifts card (4a). |
| **Inbox zero** | hydrangea/zero.png + "Inbox zero — the garden can rest." | Bloom glow effect (1e) on the zero hydrangea. No action button (States 1b rule). |
| **Dismissed (2a)** | Compost heap of dismissed items, restorable. | Click "Restore" → item returns to triage, toast "Restored — Undo". |

---

## Tasks (`Tasks.dc.html` — 1a desktop, 1b iPhone, 2a Done, 2b Someday, 2c iPhone Done)

**Purpose:** Full task list with done/someday states.
**Species:** Cherry blossom — bud (not started) → opening → bloom (waiting) → fallen (done).

| Section | Content | Interactions |
|---|---|---|
| **Header** | Cherry bloom illustration + "Open · {count}" | Cherry stage reflects overall completion state. |
| **View tabs** | Open / Done / Someday pills | Click switches view. Active tab: parchment bg. Route cut crossfade (2a). |
| **Open list** | Task rows: checkbox + title + project badge + star + estimate/overdue/recurring | Check → check pop (3b) → toast. Title click → task detail panel (2b). Star toggle. Hover lifts row (4a). Entry stagger on view land (4b). |
| **Done view (2a)** | Fallen petals illustration + completed task rows (struck through, filled checkbox) | Uncheck → restores to Open + toast. Petal fall ambient (1a). |
| **Someday (2b)** | Quiet shelf — tasks with no urgency, dimmer treatment | Same interactions as Open but without time pressure indicators. |
| **Right rail (1a desktop)** | Sticky notes — pinned project context cards | Read-only context; hover lean (5d). |

---

## Calendar (`Calendar.dc.html` — 1a desktop, 1b iPhone)

**Purpose:** Time grid + unscheduled rail. Akiflow-style split.
**Species:** Daisy — stage driven by clock (morning/midday/evening) + day (past/future).

**Full spec:** See `CALENDAR_BEHAVIOR.md`. Key interactions:
- Drag task from rail → grid: snap to 30-min slots, ghost free + placeholder stepped, settle 320ms, catch dip (4c/4d).
- Event hover: lift -1px + shadow (4a). Click → event detail overlay (3c).
- Resize: free stretch → stepped commit. Snap flash 120ms.
- Empty slot click → quick-create popover (Editor 2a).
- View toggle (Day/4-day/Week). Now-line updates every minute.
- All-day band between headers and hour grid.

---

## Projects (`Projects.dc.html` — 1a list, 1b detail, 1c iPhone, 2a board, 2b area, 2c archive, 2d new form)

**Purpose:** Active projects with milestone tracking. Wisteria grows with progress.
**Species:** Wisteria — p0 through p100 by weighted milestone %.

| Section | Content | Interactions |
|---|---|---|
| **Project list** | Cards with wisteria stage image + name + status + progress bar | Click → project detail panel (stack push 2b/4e). Hover lift (4a). |
| **Project detail (1b)** | Milestones checklist + hours logged + open tasks count + progress bar | Check milestone → wisteria advances stage, milestone bloom effect (2e). |
| **Board view (2a)** | Forest overview — wisteria card per project in columns | Amber drift ambient (1e). Drag to reorder. |
| **Archive (2c)** | Full cascade of completed projects, restorable | Restore → toast + rowIn. |
| **New project form (2d)** | Name, color, milestones, plant selection | Submit → seed plant motion (5f). |

---

## Routines (`Routines.dc.html` — 1a desktop, 1b iPhone, 2a new form, 3a streak vine, 4a trellis)

**Purpose:** Daily rituals + streak garden. Vine grows with consistency.
**Species:** Vine — bare (0d) → sprouting (1-6d) → flowering (7-29d) → lush (30d+).

| Section | Content | Interactions |
|---|---|---|
| **Header** | Vine/flowering + streak count + "best {N}" | Vine stage changes with streak length. Hover lean (5d). |
| **Today checklist** | Routine steps by group (Morning/Afternoon/Evening), checkable | Check → check pop (3b). All done → vine may advance + day-complete (2d). |
| **Streak garden (1a)** | Visual vine representation — leaf per day, droplet for completed, bare gap for missed | Read-only visualization. Idle sway (2c). |
| **Trellis (4a)** | One column per day, vine climbing | Scroll horizontally through streak history. |
| **New routine form (2a)** | Steps, schedule, goal, plant selection | Submit → seed plant (5f). |

---

## Review (`Review.dc.html` — 1a sweep, 1b iPhone, 2a-b letter, 2c/3c season)

**Purpose:** Weekly domain sweep — is everything on track?
**Species:** Fern — stage driven by review depth (coil → full).

| Section | Content | Interactions |
|---|---|---|
| **Domain cards** | Tasks, Projects, Streaks, People — each with status (NEEDS LOOK / OK) | Click domain → expands detail. "NEEDS LOOK" in terra. |
| **Season so far (3c)** | Focus trend as climbing vine + 2×2 widgets + hours band | Read-only dashboard. Weekly review flourish (2f) on completion. |
| **Weekly Letter (2a)** | Page opens with the letter when review is complete | Letter states: writing / folded / didn't arrive (2b). |

---

## Journal (`Journal.dc.html` — 1a desktop, 1b iPhone)

**Purpose:** Daily page — write, gather, keep.
**Species:** Fern — stage driven by entry length.

| Section | Content | Interactions |
|---|---|---|
| **Notebook card** | Date header + writing area + gathered quotes section. Washi tape, pencil SVG, rotate(-0.3deg). | Click to edit text. Ink bleed effect (2i) on new text. |
| **Empty state** | Open notebook with cursor + "The first page is the hardest" | Pencil resting SVG. One CTA: the input IS the action. |

---

## People (`People.dc.html` — 1a nudges, 1b detail, 1c iPhone, 2a bloom list, 2b moments, 2c today card)

**Purpose:** Relationship tending. Nudges for contacts going quiet.
**Species:** Clover — resting → awake → dewdrop (mention) → four_leaf (milestone).

| Section | Content | Interactions |
|---|---|---|
| **Nudges** (terra label) | Contacts needing attention, with last-contact time | Click → person detail (stack push). |
| **Circle groups** | Inner / Close / Wider — person cards with avatar initial | Click → person detail. Hover lift (4a). |
| **Person detail (1b/2b)** | Facts, running log, quiet edit, Moments timeline | Edit inline. Clover stage changes with attention. |
| **Today card (2c)** | Quiet, dismissible nudge on Today page | Dismiss → toast + rowOut. |

---

## Settings (`Settings.dc.html` — 1a desktop, 1b iPhone, 2a integrations, 3a sound)

**Purpose:** Appearance, effects, sounds, integrations, account.

| Section | Interactions |
|---|---|
| **Theme** | Toggle Light/Night (token swap: colors.css ↔ colors.dark.css) |
| **Effects** | Toggle each ambient effect on/off |
| **Sounds** | Master toggle + per-sound (paper rustle, pencil scratch, etc.) + quiet hours |
| **Integrations (2a)** | 4 connection states: disconnected / connecting / connected / error. "Capture from anywhere" |
| **Keyboard shortcuts** | Read-only reference |
| **Data & privacy** | Local-first info |
| **Account** | Email, plan |

---

## Focus (`Focus.dc.html` — 1a timer, 1b garden, 1c break, 1d stopwatch, 1e settings)

**Purpose:** Deep work timer with botanical garden reward.
**Species:** Clover (dewdrop for active focus).

| Section | Interactions |
|---|---|
| **Timer (1a)** | Start/pause Pomodoro. Progress ring. Task name shown. |
| **Garden (1b)** | Dusk veil (1j) + fireflies (1c) + falling petals (1a). Reward view after session. |
| **Break (1c)** | Breathing prompt. Auto-transitions back. |
| **Stopwatch (1d)** | Open-ended mode. Start/lap/stop. |
| **Settings popover (1e)** | Pomodoro length, break length, auto-start. Overlay (3c). |

---

## Lighter screens (summary)

| Page | Purpose | Key content | Interactions |
|---|---|---|---|
| **Activity** | Cross-app timeline | Filterable event list by type (completed, filed, created, starred, logged) | Filter toggles, click event → source page |
| **Search** | Full search results | Grouped by type (tasks, events, people, inbox) with dots | Click result → navigate to source |
| **Library** | Books & articles | Shelf tree + reader. Book detail: fern progress + kept quotes | Click book → detail (stack push) |
| **Herbarium** | Completed project specimens | 2-up pressed specimens, seasonal dividers, pressing ceremony (3 beats) | Click specimen → detail |
| **Perennials** | Recurring tasks | Grouped by cadence (daily/weekly/monthly). Hover actions. Paused items dimmer. | Pause/resume toggle, edit cadence |
| **Seasons** | Year-phase overview | Season row + sky header + quarter goals progress | Read-only dashboard |
| **Trash** | 30-day compost | Age groups (today/this week/older). Empty-trash confirm (destructive = confirm dialog). | Restore → toast. Empty → confirm overlay (3c). |
| **Onboarding** | 7-step first-run | Name → workspace → Plan → Tend → Cultivate → Connect → Plant garden | Step navigation, final step → seed plant (5f) |

---

## Rituals flow (`Rituals.dc.html` — not a route, a flow within Routines)

**Morning ritual (4 steps):** 1/4 review overdue → 2/4 pick Top-3 → 3/4 inbox to zero → 4/4 time-block (drag beds onto calendar).
**Evening ritual (2 steps):** 1/2 sweep today → 2/2 tomorrow at a glance.
**Mobile:** Bottom sheet flow.
**Entry:** Dusk-tinted button appears after sunset (2a). Day's garden (2b). One journal line (2c). Tomorrow's three via seed envelope (2d). Goodnight dusk veil (2e).

---

## Editor (`Editor.dc.html` — overlays/panels, not a route)

| Surface | Trigger | Content |
|---|---|---|
| **Task detail (1a)** | Click task title anywhere | Slide-over panel: checkbox + title + project + estimate + due + notes + Snooze/Schedule/Complete |
| **Create task (1b)** | ⌘K → Task, or + in task list | Full page: title, project, estimate, due, labels, notes |
| **Create event (1c)** | ⌘K → Event, or click empty calendar slot | Popover: title, time, duration, calendar |
| **Create time block (1d)** | Calendar slot click → "Time block" | Holds a task reference |
| **Quick-create popover (2a/2b)** | Click empty calendar slot | Anchored popover, flips between Event/Task |
| **Sidebar states (1g)** | Plan pill click / ‹ toggle | Plan folded (pill with count) / Rail collapsed (64px icon-only) |
