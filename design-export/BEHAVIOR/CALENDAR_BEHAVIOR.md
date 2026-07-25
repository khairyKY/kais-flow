# CALENDAR — complete behavior spec

Source of truth: `Calendar.dc.html` (options **1a** desktop, **1b** iPhone).
Cross-refs: `Motion.dc.html`, `Effects.dc.html`, `Overlays.dc.html`, `Editor.dc.html`, `States.dc.html`, `Design System.dc.html §07`.

> **How to use this file.** Every row below is `Trigger → Response → Tokens/timing → Source`. Where a behavior is the app-wide grammar (drag, hover, overlays) it is defined ONCE in `MOTION_RETROFIT.md` and only *referenced* here; this file spells out the **calendar-specific** parts (snap, resize, all-day, cross-day, now-line, empty-slot create, day-column state) in full so nothing is ambiguous. Never invent a behavior that isn't here or in a referenced file.

---

## 0. Anatomy (what exists on screen)

### 1a — Desktop (`width:1300px`, `min-height:940px`)
Left→right: **sidebar (230px)** → **main**. Main = topbar strip (42px) + a row split into **Unscheduled rail (244px)** and **time-grid (flex)**.

- **Sidebar** — the universal nav (see `Navigation Reference`). Calendar row is the active item: parchment bg, `--line-card` border, `--shadow-crisp`, lavender washi tape at `top:-6px;left:16px`, the 5-petal daisy SVG (lavender fill `#A8A0BE`, gold center `#D9B65C`) instead of a dot.
- **Topbar strip** — mono 10px uppercase: `Kai's Flow · Fri 10 Jul · Synced●`, right side `Africa/Cairo`. The `Synced●` cluster is the live sync indicator from `States.dc.html 2a` (see §9).
- **Unscheduled rail** — header `Unscheduled`, hand line *"drag onto a time to plant it ✿"*, a **Quick add task** field, then draggable task cards, then a footer capacity read (`daisy/midday.png` + `4 blocked / 6h free today`).
- **Time-grid** — grid header (`daisy/midday.png` + `Week 27 · wide awake at midday` + `Jul 9 — 12`), a **Day / 4-day / Week** segmented control, and `‹ Today ›` nav. Below: the grid card = **day-header row**, **all-day band**, **hour rows** (54px each, 8 AM→6 PM shown), a **time gutter** (58px), one **column per day**, event blocks, and the **now-line**.

### 1b — iPhone (`398×838` bezel, day view)
Status bar → app top bar (`daisy/midday.png` + `Friday, Jul 10` + ⌕) → **week strip** (Mon–Sun, today = filled lavender pill `10`) → **unscheduled chip strip** (horizontal scroll, `+2` overflow chip) → **day time grid** (60px/hour, 9 AM→3 PM shown) → **bottom tab bar** (Today / Calendar active / Capture FAB / Tasks / More).

### Species & stage — Daisy (driven by the clock), from `Design System §07`
| Stage | Asset | When |
|---|---|---|
| morning | `daisy/morning.png` | local time < ~11:00 |
| **midday** | `daisy/midday.png` | ~11:00–16:00 (the shipped sample state) |
| evening | `daisy/evening.png` | > ~16:00 |
| past | `daisy/past.png` | a day column earlier than today → **column dimmed to `opacity:0.5`** |
| future | `daisy/future.png` | a day column later than today → tight green bud |

The header daisy + rail daisy + the *today* day-header daisy all read the **current clock**; past/future day-headers use past/future daisies. **Never show a stage that contradicts the clock** (house rule).

---

## 1. Day-column states (visual truth per column)

| Column | Background | Header | Daisy | Events |
|---|---|---|---|---|
| **Past** (Thu 09) | none, whole column `opacity:0.5` | muted, `--ink-muted` | `daisy/past.png` 26px | dimmed with the column |
| **Today** (Fri 10) | `rgba(168,160,190,0.06)` wash; header cell `rgba(168,160,190,0.1)` | `--acc-lavender-text`, date 20px/600 | `daisy/midday.png` 30px + `--shadow-drop-sm` | full contrast; today's primary event carries `--shadow-crisp` |
| **Future** (Sat 11, Sun 12) | none | `--ink-body` | `daisy/future.png` 26px | full contrast, no shadow |

Rule: exactly one column is "today" and gets the lavender wash + the now-line. In **Day** view there is one column (today). In **Week** view, 7 columns; the wash/now-line still attach only to today.

---

## 2. Event blocks — appearance & the hover/press/open lifecycle

Event block = absolutely-positioned card inside a day column. `top`/`height` encode time (**54px = 1 hour desktop, 60px = 1 hour mobile**). Left accent bar `3px solid` in the event's category accent; padding `6–10px`; title 11.5–12.5px; time line mono 8.5–9px.

Event emphasis tiers:
- **Primary / focus event** (e.g. today's *Deep work — Forecasting*): filled accent tint `rgba(accent,0.2)` + `--shadow-crisp` + title weight 500.
- **Standard event** (e.g. *Review portfolio*, *Church*): `--paper-event` fill, no shadow.
- Accent by kind: deep-work / calendar events = **lavender**; meetings with people = **blossom** (*Sync with Omar*); rest / all-day = **sage** (*Sleep · rest day*, *Church*).

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Hover an event block** | Lift −1px under a soft shadow; **no color change**. On desktop, a faint **resize affordance** appears as a 6px grab strip at the block's bottom edge (cursor `ns-resize`). Sibling events are untouched. | `hp` grammar: `transform:translateY(-1px)` + shadow, `--dur-quick` (150ms) `--ease-out` | Motion `4a`, `5b` |
| **Hover the "Focus dim" case** (optional, when a single event is emphasized) | The hovered event holds full opacity; the rest of the grid dips to ~0.55 so the one block reads. Releases on mouse-out. | `--dur-normal` (200ms) | Effects `2g` (Focus dim, live) |
| **Press (mousedown, no move)** | Give to `scale(0.97)` in 80ms, then release. | active `scale(0.97)` · 80ms | Motion `4a` |
| **Click an event** | Opens the **Event details overlay** (read/edit popover anchored to the block on desktop; full sheet on mobile). Scrim → 20%, card rises 10px, 0.98→1. `Esc` / scrim tap / back closes. | `overlayCard` 210ms in / 140ms out | Overlays `§02 Event details`; Motion `3c` |
| **Double-click / Enter on a focused event** | Same as click → Event details (Enter is the keyboard equivalent of open). | — | Overlays `§02` |
| **Hover a person-meeting event** | Same lift; the attendee's clover may glint if they have a pending nudge (see People). Decorative only. | — | Effects `1f` dew glint (optional) |

---

## 3. Empty time-slot — create lifecycle (calendar-specific, define fully)

The grid's empty area is a create surface. This is NOT covered elsewhere — spell it out:

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Hover an empty slot** | A **ghost 30-min block** appears under the cursor snapped to the nearest half-hour, `1.5px dashed --line-solid`, fill `rgba(accent,0.08)`, with a faint `+ New` label mono 9px. Follows the cursor by half-hour steps (does not trail smoothly — it snaps). | ghost fades in `--dur-quick`; snap step = 30 min | Calendar-specific; snap grammar from Motion `4c` |
| **Click an empty slot** | Opens the **Quick-create popover** anchored at the slot, pre-filled with that start time + 30-min duration, defaulting to **Event** kind with a flip to **Task** / **Time-block**. | overlay in 210ms | `Editor.dc.html 2a/2b/2c`; Overlays `§02 Command/create` |
| **Click-drag across empty slots** | Draws a live selection block that grows with the pointer (free stretch), snapping its committed height to the 30-min grid on release; opens Quick-create pre-sized to the dragged span. | free stretch, stepped commit (same as resize, §5) | Motion `4c` |
| **Click empty slot in a PAST column** | Same create flow, but the created item is back-dated; no special block. (No warning — the app never scolds.) | — | House rules |
| **Long-press empty slot (mobile)** | Blooms a create affordance at the touch point (radial), then opens the mobile create sheet. | long-press bloom | Effects `2l`; `Editor 2c` |

---

## 4. Unscheduled task card → drop onto a time ("plant it")

The rail cards (`cursor:grab`, some pre-tilted `rotate(±0.4deg)`) are the app's canonical draggable. The drag *grammar* (ghost physics, placeholder, settle) is defined once in `MOTION_RETROFIT.md §Drag`. Calendar adds the **snap-to-time** dialect:

| Phase | Response | Tokens | Source |
|---|---|---|---|
| **Pickup** (mousedown + move > 4px) | Card lifts: `scale(1.04)` + shadow lift; original leaves a **dashed placeholder** hole in the rail (`1.5px dashed`, sags slightly). Cursor → `grabbing`. | lift 140ms; pickup `scale(1.04)` | Motion `2c`, `5b` |
| **In flight over the rail/page** | Ghost **trails the cursor ~110ms**, tilts ±6° with velocity, idles a slow ±1° float (`dragFloat`, 2.1s) when the hand pauses. | trail 110ms · tilt ±6° · `dragFloat` | Motion `2c` |
| **Enters the grid** | A **stepped placeholder** appears in the target column snapped to the 30-min slot under the ghost; the ghost stays free (loose hand, exact outcome). A **snap-flash** pulses on each slot change. A time label rides the block showing the snapped start–end. | placeholder stepped, **snap at slot midpoint**; snap flash 120ms; 30-min grid | Motion `4c` |
| **Near a column/grid edge** | Grid **auto-scrolls** underneath at a gentle constant rate; an edge glow marks the live zone. | edge zone 40px, ~90px/s; `edgePulse` | Motion `4d` |
| **Multi-select drag** (if several rail tasks selected) | Ghost is a **fanned stack** (±4°, ≤2 cards shown + a count badge). | stack ±4° fan, ≤2 + count | Motion `4d` |
| **Release on a valid slot** | Ghost **settles with a 320ms overshoot** into the block; the receiving column gives a **2px catch dip** (not a bounce); the block commits at the snapped time; the rail placeholder **heals closed**; a **Toast** rises with Undo. The task's dot color becomes its new event accent. Sound: *paper rustle*. | settle 320ms overshoot · catch 2px/0.996 120ms · rail heal (`rowOut`); toast 220ms, dwell 4s | Motion `2c/2d/4d/3d/3e` |
| **Release on an INVALID target** (outside grid, onto a blocked span) | **The soft no**: the ghost shakes horizontally once and flies back to its rail slot; nothing is created; no error copy. | invalid-drop shake | Effects `2j` |
| **Drag past the grid's time bounds** | **Boundary resistance**: the placeholder rubber-bands at the first/last hour instead of leaving the grid. | rubber-band | Effects `2k` |

Mobile equivalent: drag a chip up out of the **unscheduled chip strip** onto the day grid — same snap/settle, chip strip heals its gap.

---

## 5. Moving & resizing a placed event (calendar-specific)

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Drag an event body** | Same ghost/placeholder/snap as §4 but the source is an existing block; on release it moves to the new snapped start (same duration). Cross-day drags (4-day/Week) move column *and* time. | ghost free + placeholder stepped; settle 320ms | Motion `4c` |
| **Drag the bottom resize strip** | Block **stretches freely** with the pointer while dragging (`calResize` shows 52→108px), a **snap line** flashes at each half-hour, and the height **commits stepped** to the 30-min grid on release. Start time is fixed; end time changes. | free stretch, stepped commit; snap line 120ms | Motion `4c` |
| **Drag the top edge** (if exposed) | Same, but start time changes and end is fixed. | — | Motion `4c` |
| **Resize below the 30-min minimum** | Clamps at one 30-min slot (boundary resistance), never zero. | rubber-band clamp | Effects `2k` |
| **Drop a move onto an occupied span** | Events **shoulder side-by-side** (split column width) rather than overlap opaquely; if truly blocked (all-day rest), soft-no back. | — | Calendar layout rule; Effects `2j` |

---

## 6. All-day band

- A full-width row under the day headers, min-height 34px, gutter label `All-day`.
- All-day items render as a pill spanning the column: fill `rgba(sage,0.22)`, `2px` left border `--acc-sage`, text `--acc-sage-text` (e.g. *Sleep · rest day*).
- **Drag a task into the all-day band** → it becomes an all-day item for that column (no time). **Drag an all-day pill down into the grid** → it gains a time (snaps like §4).
- Hover/press/open = same grammar as timed events (§2): lift, click opens details.

---

## 7. Header controls

| Control | Trigger | Response | Source |
|---|---|---|---|
| **Day / 4-day / Week** segmented | Click a segment | Active segment → parchment bg + side borders; grid **re-lays to that column count** with a route-cut-fast crossfade of the grid body (not a full page transition). 4-day is the shipped default. | Motion `2a`; Overlays `§05 Calendar view options` for density/toggles |
| **‹** (prev) | Click | Grid shifts to the previous window (day/4-day/week); columns re-enter with the entry stagger. | Motion `2a`, `4b` |
| **Today** | Click | Jumps the window to include today and scrolls to the now-line. **Never use `scrollIntoView`** — set scroll position directly. | — |
| **›** (next) | Click | Next window; same as prev. | Motion `2a`, `4b` |
| **⌕ (mobile)** | Tap | Opens Search overlay (`⌘/` equivalent). | Overlays `§02 Search` |
| **View options** | Open the calendar view-options popover | Toggle density, weekend visibility, declined events, etc. (spec only — options listed in Overlays `§05`). | Overlays `§05` |

---

## 8. The now-line

- A `2px solid --acc-lavender` horizontal rule across **today's column only**, with a 9px lavender dot at the left edge and a mono time chip (`1:20 PM`) on `--paper-parchment` at the right.
- **Position updates every minute** to the current time (top = minutesSinceGridStart × pxPerMinute; desktop pxPerHour = 54, mobile = 60).
- Purely indicative — not draggable, not clickable. Sits at `z-index:5` above grid lines, below event blocks' hover shadow.
- In **past/future** windows that don't include today, the now-line is absent.

---

## 9. Calendar under the global state families (from `States.dc.html`)

These are app-wide; here's how they land on Calendar specifically:

| State | Calendar rendering | Source |
|---|---|---|
| **Empty** (no events today, unplanned) | Grid shows only hour lines + now-line; the rail shows the **empty-Today vignette** rule (surface flower as seed/sprout + one hand line + one action) adapted: *"Nothing scheduled — drag a task onto a time"*. Never gray, never two buttons. | States `1a` rule |
| **Syncing** | Topbar `Synced●` → `Syncing ↻ N`; freshly dragged blocks show a faint pending tick until flushed. | States `2a` |
| **Offline** | Topbar `Offline ◌ — N saved here`; drags/creates still work and queue; clicking the status opens the **queue popover** listing `EVENT · deep work · moved to 10:00` etc. Nothing is lost. | States `2a/2b` |
| **Conflict** | If the same event changed in two places, a **conflict card** offers both versions with two equal "Keep this one" buttons; if unresolved a day, it also surfaces as a Today card. The word "error" never appears. | States `2c` |
| **Reconnect** | `Syncing ↻` → `Synced ●` with a single 300ms dewdrop glint on the dot. | States `2d` |

---

## 10. Mobile-only behaviors (1b)

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Tap a week-strip day** | Day view swaps to that date; the filled lavender pill moves; grid crossfades. | route cut 160ms | Motion `2a` |
| **Swipe grid left/right** | Prev/next day (horizontal stack push). | `hPushIn/Back` 380ms | Motion `3a` |
| **Pull down at top of grid** | **Pull-to-refresh dew**: a drop clings, swells, releases at threshold; the splash is the loading indicator; syncs the day. | swell tracks 1:1 · release 200ms | Motion `5c` |
| **Tap an event** | Opens the **task/event detail sheet** (full-screen, slides up). | overlay/stack | Overlays `§03`; Motion `3a` |
| **Tap the Capture FAB (center)** | Opens **Voice capture** sheet; a captured item lands in Unscheduled. | overlay in | Overlays `§03 Voice capture` |
| **Tap "More" tab** | Opens the **More sheet** (remaining nav). | sheet up | Overlays `§03 More sheet` |
| **Drag a chip from the strip** | Same plant-onto-time as §4; the strip heals its gap. | Motion `2c/3e` |

---

## 11. Quick-add task (rail)

- The `Quick add task…` field: click/tap focuses it; typing + `Enter` creates an **unscheduled** task that lands at the top of the rail via the **Seed plant** motion (seed drops from the field, puffs into the new card).
- New card enters with **list breathing** (`rowIn`, height+fade, 6px settle).
- It does not schedule the task — it only adds to Unscheduled until dragged onto a time.
- Tokens: seed drop 260ms ease-in + puff 180ms (Motion `5f`); `rowIn` 240ms (Motion `3e`).

---

## 12. Exact tokens used on this screen (quick reference)

```
pxPerHour        desktop 54px · mobile 60px      (hour-row height)
snap grid        30 min (placeholder + resize commit)
event accent bar 3px solid  --acc-lavender | --acc-blossom | --acc-sage
event tint       rgba(accent, 0.20–0.22)
event paper      var(--paper-event)              (standard tier)
today wash       rgba(168,160,190,0.06)  · header cell rgba(...,0.1)
past column      opacity:0.5
now-line         2px solid var(--acc-lavender) · dot 9px · chip mono 8.5px
hover/press      translateY(-1px)+shadow @150ms ease-out · active scale .97 @80ms
drag ghost       scale 1.04 · trail 110ms · tilt ±6° · dragFloat ±1°/2.1s · settle 320ms
placeholder      1.5px dashed · stepped (snap at slot midpoint) · snap flash 120ms
resize           calResize free stretch → stepped commit · snap line 120ms
catch dip        2px / 0.996 · 120ms
edge scroll      zone 40px · ~90px/s · edgePulse
soft-no          invalid-drop shake (Effects 2j)
boundary         rubber-band (Effects 2k)
toast            toastIn 220ms · dwell 4s · exit 160ms · carries Undo
sound            paper rustle on drop; none in flight
```

All colors/timings resolve from `ds/tokens/*.css` — never hard-code a value a token already defines.
