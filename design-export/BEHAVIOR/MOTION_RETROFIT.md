# MOTION RETROFIT — where every motion and effect fires

> For Claude Code. Maps each of the 26 motions and 22 effects to the exact screen(s) and trigger(s). Source: `Motion.dc.html`, `Effects.dc.html`. Tokens: `ds/tokens/motion.css`.
>
> **Rule:** All animations respect `prefers-reduced-motion: reduce` → instant state change, no travel.

---

## A. Motion tokens (from `ds/tokens/motion.css`)

```css
--dur-instant:  120ms
--dur-quick:    150ms       /* hover reveal */
--dur-normal:   200ms       /* tab switch, toggle */
--dur-slow:     300ms       /* panel transitions */
--dur-bloom:    600ms       /* petal fall */
--dur-grow:     800ms       /* vine growth */
--ease-out:     cubic-bezier(0.22, 0.61, 0.36, 1)
--ease-in:      cubic-bezier(0.55, 0, 0.68, 0.53)
--ease-natural: cubic-bezier(0.4, 0.0, 0.2, 1)
```

---

## B. Per-motion wiring (26 items)

### 1a — Route transition (SUPERSEDED by 2a)
Not used. The original choreographed transition was replaced by the faster route cut.

### 1b — Today petal fall on complete
- **Keyframe:** `petalFall` 7s linear, infinite, blossom-colored petals
- **Trigger:** Last task on Today checked done (all tasks complete)
- **Screen:** Today
- **Details:** 3-5 petals drift from the terrarium band area. Stacks on top of the day-complete celebration (2d).

### 1c — Inbox floret drift on file
- **Keyframe:** `floretDrift` 5.5s, hydrangea-colored balls
- **Trigger:** Filing an inbox item (File button click)
- **Screen:** Inbox
- **Details:** 2-3 florets drift from the filed card's position. Subtle — not on every file, only the first few.

### 1d — Project bloom glow at 100%
- **Keyframe:** `bloomGlow` 3s loop, opacity 0.25→0.7 + scale pulse
- **Trigger:** A project's wisteria reaches p100
- **Screen:** Projects (list + detail + board)
- **Details:** Radial glow behind the wisteria illustration. Loops while viewing the completed project.

### 1e — Projects amber drift
- **Keyframe:** `petalFall` 9.5s, gold leaf shapes
- **Trigger:** Ambient — always on when viewing the Projects board
- **Screen:** Projects board view (2a)
- **Details:** 2-3 gold leaves drift slowly. Disable in Settings → Effects.

### 1f — Sidebar streak-plant idle
- **Keyframe:** `cloverSway` 4s + `moteRise` pollen
- **Trigger:** Ambient — always on
- **Screen:** Sidebar streak widget (all pages)
- **Details:** The vine illustration sways ±1.5°. 1-2 gold pollen motes rise. Idle life (2c) also applies.

### 2a — Route cut (fast) ★ CORE
- **Keyframe:** `swiftA/swiftB` 160ms `--ease-out`
- **Trigger:** Every sidebar nav click / route change
- **Screen:** All (the content area crossfades)
- **Details:** Outgoing drops opacity over 90ms. Incoming rises 6px over 160ms. No scale, no choreography. Reduced-motion → instant cut.

### 2b — Stack push/pop (vertical) ★ CORE
- **Keyframe:** `pushUp/pushBack` 380ms `cubic-bezier(0.32,0.72,0,1)`
- **Trigger:** Opening a detail view from a list (task detail, project detail, person detail, book detail)
- **Screen:** Tasks, Projects, People, Library, any drill-in on desktop
- **Details:** Detail rides up over parent. Parent recedes −26px, scale 0.98, 14% dim. Esc/back/swipe-down pops.

### 2c — Drag ghost (wobbly & floaty) ★ CORE
- **Keyframe:** `dragFloat` idle ±1°/2.1s + velocity tilt ±6°
- **Trigger:** Dragging any draggable item (task card, calendar event, inbox item)
- **Screen:** Calendar (rail → grid), Tasks (reorder), Inbox (triage), Routines (reorder)
- **Details:** Pickup scale 1.04 + shadow lift. Trail cursor ~110ms. Dashed placeholder at source. Settle 320ms overshoot on drop. Sound: paper rustle on drop.

### 2d — Filing drag (inbox→project)
- **Keyframe:** Same as 2c, source position heals
- **Trigger:** Dragging an inbox item to a project
- **Screen:** Inbox
- **Details:** Source gap closes with list breathing (3e). Target shows the item land.

### 3a — Mobile stack (horizontal) ★ MOBILE CORE
- **Keyframe:** `hPushIn/hPushBack` 380ms
- **Trigger:** Every drill-in on mobile
- **Screen:** All mobile views
- **Details:** Detail slides in from right. Parent recedes 30% + 12% dim. Edge-swipe pops.

### 3b — Check pop (task complete) ★ CORE
- **Keyframe:** `boxFill` 90ms → `checkPop` 180ms overshoot → `strikeGrow` 240ms → `rowDip` 1.5px 120ms
- **Trigger:** Checking ANY checkbox (task, routine, milestone, goal)
- **Screen:** Today (task rows, routines, goal), Tasks, Projects (milestones), Routines, Rituals
- **Details:** One-shot per check. Sound: paper rustle. Petal-fall (5a) stacks only on the LAST item.

### 3c — Overlay in/out ★ CORE
- **Keyframe:** `overlayCard` 210ms in / 140ms out, `scrim` → 20%
- **Trigger:** Opening any overlay or modal
- **Screen:** ⌘K, ⌘/, ?, G, event detail, task detail sheet (mobile), confirm dialog, bulk bar, snooze/schedule menus, project picker, chat panel
- **Details:** Esc obeys immediately. Exit is faster than entry (dismissal feels obedient).

### 3d — Toast ★ CORE
- **Keyframe:** `toastIn` 220ms `--ease-out`, dwell 4s, exit 160ms
- **Trigger:** Every action that needs an undo (file, dismiss, check, delete, snooze, reviewed, keep, later, restore)
- **Screen:** All
- **Details:** Single slot, bottom-center. Never stacking. Always carries Undo.

### 3e — List breathing ★ CORE
- **Keyframe:** `rowIn` 240ms (height+fade+6px settle), `rowOut` 200ms slide + 180ms collapse
- **Trigger:** Item added to or removed from a list
- **Screen:** Tasks (create/complete), Inbox (file/dismiss), Today (slipping dismiss, surfaced triage), Routines, Projects
- **Details:** New rows breathe in. Removed rows slide 26px toward destination, fade, list heals.

### 4a — Hover & press (resting layer) ★ UNIVERSAL
- **CSS:** `translateY(-1px)` + soft shadow on hover, `scale(0.97)` on press (80ms)
- **Trigger:** Hover/mousedown on any interactive surface
- **Screen:** ALL — every button, row, card, chip, nav item, calendar event, unscheduled card
- **Details:** No color swaps. Depth does the talking. 150ms `--ease-out`.

### 4b — Entry stagger (first paint)
- **Keyframe:** `enterUp` 240ms `--ease-out`, stagger 60ms per block
- **Trigger:** Route land (after 2a route cut)
- **Screen:** All — header → divider → rows in source order
- **Details:** One-shot. Whole page readable in under 400ms. Reduced-motion → instant.

### 4c — Calendar drag (snap dialect)
- **Keyframe:** `calGhost` free + `calSnap` stepped + `calResize` + `calSnapLine`
- **Trigger:** Dragging a task onto the time grid, moving an event, resizing an event
- **Screen:** Calendar only
- **Details:** Ghost stays free (loose hand). Placeholder jumps hour-to-hour (exact outcome). Snap at slot midpoint. Flash 120ms on each slot change. Resize: free stretch, stepped commit. 30-min grid.

### 4d — Drag polish (catch, edge scroll, stack)
- **Keyframe:** `catchDrop` 2px/0.996 120ms + `autoScroll` + `edgePulse`
- **Trigger:** Dropping an item into a list, dragging near a list edge, multi-select drag
- **Screen:** Calendar, Tasks, Inbox, any drag surface
- **Details:** Catch: receiving list gives 2px dip (not bounce). Edge: 40px zone, ~90px/s scroll. Stack: ±4° fan, ≤2 shown + count badge.

### 4e — Stack push/pop (live)
- **Keyframe:** Same as 2b, wired to real clicks
- **Trigger:** Click project row → detail, click task → detail, click person → detail
- **Screen:** Projects, Tasks (task detail panel), People, Library
- **Details:** 380ms curve both directions. Esc pops.

### 5a — Checkbox bloom
- **Timing:** bloom 260ms + petal 400ms
- **Trigger:** Checking a task or routine
- **Screen:** Tasks, Today, Routines, Projects (milestone)
- **Details:** Decoration on top of 3b (never delays the strike-through). Sheds a petal ONLY when it's the LAST unchecked item. Sound: paper rustle.

### 5b — Drag lift
- **Timing:** lift 140ms, settle 320ms overshoot
- **Trigger:** Mousedown + move > 4px on any draggable
- **Screen:** Calendar (rail cards, events), Tasks (rows), Inbox (cards)
- **Details:** The one grammar for every draggable. Sound: none in flight, paper rustle on drop.

### 5c — Pull-to-refresh dew
- **Timing:** swell tracks pull 1:1, release 200ms
- **Trigger:** Pull down at top of any mobile list
- **Screen:** Mobile: Today, Inbox, Tasks, Calendar, Routines, Journal, People
- **Details:** Surface tension, not rubber-band. Drop clings, swells, releases at threshold. Splash = loading indicator.

### 5d — Hover lean
- **Timing:** ±3-4° 420ms `--ease-out`, transform-origin bottom
- **Trigger:** Mouse hover near a small botanical illustration
- **Screen:** Sidebar (streak vine), Today (terrarium species), Calendar (daisy), any standalone botanical
- **Details:** Plants lean toward cursor, pinned at soil line. Sound: none.

### 5e — Toast petal-fall
- **Timing:** exit 160ms + petal 500ms linear
- **Trigger:** Toast dismissal (auto or manual)
- **Screen:** All (wherever toasts appear)
- **Details:** Toast drops away, one petal falls 30px and fades. Goodbye smaller than hello.

### 5f — Seed plant
- **Timing:** drop 260ms ease-in + puff 180ms
- **Trigger:** Creating any new item (task, project, journal line, event, routine)
- **Screen:** Tasks (quick-add), Projects (new form), Journal (new entry), Calendar (create), Routines (new), Onboarding (final step)
- **Details:** Seed drops from submit affordance, puffs into the row it becomes. Sound: pencil scratch (journal only), none elsewhere.

---

## C. Per-effect wiring (22 recipes)

### Ambient loops — where they run

| Effect | Screens | Trigger | Can be disabled? |
|---|---|---|---|
| 1a Petal fall | Today (all-done), Tasks (Done view) | All tasks complete / viewing Done | Settings → Effects |
| 1b Pollen drift | Sidebar (streak widget), Focus (garden) | Ambient — always | Settings → Effects |
| 1c Firefly dusk | Focus (garden), Night theme, evening hours | Time > sunset or Night theme | Settings → Effects |
| 1d Leaf sway | Every botanical illustration | Ambient — ±2.2° loop | Settings → Effects |
| 1e Bloom glow | Projects (p100), Inbox (zero) | Data-driven milestone | Settings → Effects |
| 1f Dew glint | Sync reconnect dot, clover dewdrop stage | Sync restored / attention milestone | Always (part of state) |
| 1g Floret drift | Inbox | On file action | Settings → Effects |
| 1h Amber drift | Projects board | Ambient on board view | Settings → Effects |
| 1i Settle-in | All screens | View entry (= 4b stagger) | Reduced-motion only |
| 1j Dusk veil | Focus garden, Evening ritual closing | Focus session end / evening ritual | Always |

### Applied recipes — trigger → screen mapping

| Effect | Trigger | Screen(s) | Notes |
|---|---|---|---|
| 2a Seasonal drift | Ambient, keyed to season | All screens | One particle system, four skins (spring petals, summer pollen, autumn leaves, winter frost) |
| 2b Time-of-day paper | Clock-driven | All screens | Paper tint warms in morning, cools in evening. Subtle — affects `--paper-linen` tint. |
| 2c Idle life | 10s of inactivity | All botanical illustrations | Plants sway gently. Stacks with 1d leaf sway. |
| 2d Day complete | All tasks done / goal done / all routines done | Today | Petal-burst from terrarium + quiet banner "The day's goal is done." Auto-dismisses. |
| 2e Milestone bloom | Milestone checked in a project | Projects (detail view) | Wisteria grows a stage. Short bloom animation on the illustration. |
| 2f Weekly review flourish | Review sweep completed | Review | Fern unfurls a stage. One-shot. |
| 2g Focus dim | Hover a single event in a dense view | Calendar (hover one event, rest dim to 0.55) | 200ms in/out. Desktop only. |
| 2h Parasol header | Scroll down | Mobile: any screen with a large header | Header compresses from full to compact. Scroll-position-driven, not a toggle. |
| 2i Ink bleed | New text appearing | Journal (writing area) | Text soaks in from 0 opacity over 200ms. One-shot per character run. |
| 2j The soft no | Invalid drag drop | Calendar (drop on blocked span), any invalid target | Horizontal shake (3 oscillations, 200ms). Ghost flies back to source. No error text. |
| 2k Boundary resistance | Drag past bounds | Calendar (past first/last hour), list overscroll | Rubber-band: element stretches elastically and snaps back. Never lets content leave bounds. |
| 2l Long-press bloom | Long-press (500ms) on empty space | Mobile: Calendar (empty slot), Today (empty area) | Radial bloom from touch point → opens create sheet. |

---

## D. Per-screen motion budget (quick reference)

| Screen | Core motions | Effects | Ambient |
|---|---|---|---|
| **Today** | 2a route, 3b check, 3d toast, 3e list, 4a hover, 4b stagger, 5a bloom, 5f seed | 2d day-complete, 1b petal-fall (all done) | 1d leaf sway, 1f streak idle, 2c idle life |
| **Inbox** | 2a, 3d, 3e, 4a, 4b | 1c floret drift, 1e bloom glow (zero) | 1d, 2c |
| **Tasks** | 2a, 2b detail, 3b, 3d, 3e, 4a, 4b, 5a, 5f | 1a petal-fall (Done view) | 1d, 2c |
| **Calendar** | 2a, 2c drag, 3c overlay, 3d, 4a, 4c snap, 4d polish, 5b lift | 2g focus dim, 2j soft no, 2k boundary | 1d, 2c |
| **Projects** | 2a, 2b detail, 3b milestone, 3d, 4a, 4b, 5f | 1d bloom glow, 1e amber, 2e milestone | 1d, 1h amber, 2c |
| **Routines** | 2a, 3b, 3d, 4a, 4b | 2d (all done) | 1d, 1f sway, 2c |
| **Review** | 2a, 4a, 4b | 2f flourish | 1d, 2c |
| **Journal** | 2a, 4a, 5f | 2i ink bleed | 1d, 2c |
| **People** | 2a, 2b detail, 4a, 4b | — | 1d, 2c |
| **Focus** | 2a, 3c settings | 1j dusk veil | 1b pollen, 1c fireflies, 1d |
| **Settings** | 2a, 4a | — | — |
| **All mobile** | 3a horizontal stack, 5c pull-refresh | 2h parasol, 2l long-press bloom | — |
| **All screens** | 2a route, 3c overlay, 3d toast, 4a hover | 2a seasonal, 2b time-of-day | 1d leaf sway, 2c idle |

---

## E. Sound map

| Sound | Trigger | Motion ID |
|---|---|---|
| Paper rustle | Task check, drag drop, inbox file | 3b, 5a, 5b |
| Pencil scratch | Journal new entry | 5f (journal only) |
| *None* | Drag in flight, hover, route change, overlay open/close | All others |

Sounds are toggleable per-sound in Settings → Sound. Quiet hours mutes everything.
