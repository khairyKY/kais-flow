# The calendar block — complete state inventory

Research note for the block redesign, 2026-07-25. Reconciles three sources:

- **The mockup** — `D:\Downloads\Calendar.dc.html` §2b, "State matrix — all eighteen" (a newer,
  90KB revision of `design/Calendar.dc.html`, which is still the old 29KB one without §2a/2b/2c).
- **What ships** — `app/src/features/calendar/CalendarGrid.tsx` + `.css`, and the
  `docs/phases/P-DESIGN.md` §5.1 interaction checklist those were built against.
- **What the domain actually permits** — `calendar_events` in `docs/DATA_MODEL.md`, plus the two
  standards every calendar's state vocabulary descends from: iCalendar RFC 5545 and the Google
  Calendar API event resource.

---

## 1. Why eighteen rectangles didn't land

The mockup's §2b is a flat list: `default · hover · selected · dragging · resizing · in progress ·
past · completed · ran over · tentative · declined · read-only · drop target · empty slot ·
creating · short · overlap · stacked`.

Those eighteen are not siblings. They come from five independent axes, and the list silently mixes
them:

- `hover` and `past` can be true **at the same time**. So can `completed` + `short` + `selected`.
- `empty slot` and `drop target` are not block states at all — they're *grid* states. There is no
  block there. Drawing them on the same sheet as a block is what makes the sheet read as a grab bag.
- `dragging` and `resizing` are already **two elements each** in the shipped code (a free ghost and
  a snapping placeholder, Motion 4c) — one swatch can't state either.

A flat list of 18 forces you to draw 18 rectangles and then discover half the real combinations
were never drawn. The actual combinatorial space of the five axes below is in the thousands. The
deliverable isn't more swatches — it's **a channel budget**: which visual channel each axis owns,
and what wins when two axes want the same channel (§4).

---

## 2. The five axes

Legend: **✅ shipped** · **🎨 designable now** (data exists, no UI) · **🔒 blocked** (no column to
read) · **✂️ cut** (out of scope for a single-user app)

### Axis A — Interaction (transient, owned by the UI, never persisted)

| # | State | Status | Note |
|---|---|---|---|
| A1 | Rest | ✅ | `.fc-timegrid-event` — 6px radius, 24% fill, 35% edge |
| A2 | Hover | ❌ | **No hover rule exists in `CalendarGrid.css` at all.** The mockup lists it; the code never got it |
| A3 | Focus-visible (keyboard) | ❌ | Missing everywhere. Non-negotiable a11y — blocks are clickable and have a role-checkbox child |
| A4 | Pressed / active | ❌ | Missing. The moment between mousedown and drag-threshold has no feedback |
| A5 | Selected (details panel open) | ❌ | `EventDetailsPanel` exists; the block behind it is not marked |
| A6a | Dragging — **ghost** (in hand) | ✅ | `.kf-cal-ghost`, floats free, wobbles |
| A6b | Dragging — **placeholder** (outcome) | ✅ | `.fc-event-mirror`, dashed, snaps to 30-min grid |
| A7a | Resizing — stretching block | ✅ | original hidden via `eventResizeStart` |
| A7b | Resizing — snap line flash | ✅ | `.kf-cal-snapline` |
| A8 | Valid drop target | ✅ | `.fc-highlight` |
| A9 | **Invalid drop** | ❌ | Nothing says "you can't put it there" — over a read-only gcal block, outside range, in the past |
| A10 | Creating (drag-select on empty grid) | ✅ | `selectMirror` + QuickCreate popover |
| A11 | Just landed (settle-in) | ✅ | `kf-settle-in`, one-shot on external drop |
| A12 | **Pending / optimistic** | ❌ | **The biggest gap.** Every write goes through `lib/outbox.ts`. Offline, a block is on screen and *not yet saved* — and looks identical to a saved one |
| A13 | **Sync failed** | ❌ | Same source. An outbox entry that errored has no visual home |
| A14 | Exiting / deleting | ❌ | Blocks vanish instantly |

A2–A5 and A12–A13 are absent from the mockup's eighteen *and* from the code.

### Axis B — Temporal (derived from the clock; changes with no user action)

| # | State | Status | Note |
|---|---|---|---|
| B1 | Future | ✅ | implicit default |
| B2 | In progress ("now") | 🎨 | Mockup shows `Now · 34m left`. Not implemented |
| B3 | Past | 🎨 | Only the *column* dims (`.fc-day-past`); individual past blocks don't |
| B4 | Ran over | 🔒 | Mockup's terra treatment. Needs "task not done ∧ end < now" — `task_id` + task status, joinable but not currently passed to the grid |
| B5 | Starting soon (T-5) | ✂️ | Nice-to-have; skip unless Kai wants it |

**Implementation trap:** B2–B4 change *without input*. FullCalendar's `NowTimer` re-renders only the
now-indicator, not events. A block that goes from "future" to "in progress" at 9:00 will not
restyle until something else forces a render. Any B-axis design needs a minute tick that
invalidates block classes — cheap, but it has to be deliberate.

### Axis C — Semantic status (read from the record)

The canonical vocabulary here is not invented — RFC 5545 and the Google Calendar API define it, and
anything synced in from `source='gcal'` arrives carrying it.

| # | State | Standard origin | Status |
|---|---|---|---|
| C1 | Confirmed | `STATUS:CONFIRMED` | ✅ default |
| C2 | Tentative | `STATUS:TENTATIVE` / `responseStatus: tentative` | 🔒 **no `status` column on `calendar_events`** |
| C3 | Needs action (unanswered invite) | `PARTSTAT:NEEDS-ACTION` | 🔒 same — and absent from the mockup's eighteen |
| C4 | Declined | `PARTSTAT:DECLINED` | 🔒 same |
| C5 | Cancelled | `STATUS:CANCELLED` | 🔒 same. **Distinct from declined** — the mockup conflates them |
| C6 | Free vs busy | `TRANSP:TRANSPARENT/OPAQUE` | 🎨 **`busy bool` already exists and is never rendered.** Free-but-scheduled blocks look identical to busy ones |
| C7 | Read-only / external | gcal `accessRole` | 🎨 `source='gcal'` is in the row; not passed to `CalendarGrid` |
| C8 | Completed | ours | ✅ `kf-done` — strikethrough + checkbox fill |
| C9 | Conflict / overlap warning | ours | ✅ `fc-event-conflict`, red outline — **absent from the mockup's eighteen** |
| C10 | Recurring instance | `RRULE` | 🔒 `tasks` has `recurrence_rule`; `calendar_events` does not. No repeat glyph anywhere |
| C11 | Private / confidential | `CLASS` | ✂️ single-user app |

**Four of the mockup's eighteen (tentative, declined, plus the implied confirmed/read-only pair)
cannot be built today.** `calendar_events` is `title, starts_at, ends_at, all_day, task_id, source,
gcal_id, gcal_etag, busy, type, color` — there is no status field at all. Either add one, or cut
those swatches from the redesign so you're not designing fiction. See §6.

### Axis D — Kind (mutually exclusive; exactly one per block)

The mockup's §2c is the strongest part of the sheet: six kinds, one shape, colour = meaning.
`task block · lavender` / `meeting · blossom` / `ritual · sage, hatched` / `focus · moss` /
`admin · hydrangea` / `external · neutral`.

Shipped: `type text check ('time_block','event','task')` — **three**, not six. The other three
(ritual, focus, admin) have no representation in the data. They'd be either a fourth column or a
derivation from `project_id`/`domain_id`. This axis is a schema question before it's a design one.

### Axis E — Layout (imposed by the grid, not by the record)

| # | State | Status |
|---|---|---|
| E1 | Full (two-line: title + time) | ✅ |
| E2 | Short — one line, time dropped, grip hidden | ✅ `fc-timegrid-event-short` |
| E3 | Micro (<15 min) | ❌ see the density math in §3 |
| E4 | Overlap, 2-up | ✅ FullCalendar default; unstyled |
| E5 | Stacked 3+ | ✅ default; unstyled |
| E6 | `+N more` overflow | ✅ `dayMaxEvents`; `.fc-daygrid-more-link` styled, timegrid one isn't |
| E7 | All-day band chip | ✅ `.fc-daygrid-event` |
| E8 | **Multi-day all-day span** (start / middle / end segments) | ❌ |
| E9 | **Spans midnight** — continues-from / continues-into arrow | ❌ |
| E10 | **Clipped by scroll** — starts above or ends below the viewport | ❌ |
| E11 | Narrow column (week @ 7 days) vs wide (day view) | ❌ same block, very different width budget |
| E12 | **Month-view form** (dot / pill, no time grid) | ❌ **entirely absent from the mockup** — `dayGridMonth` is a shipped view |

---

## 3. Density tiers — do this against the real row height

The mockup §2a says **60px = one hour**. The shipped CSS says **54px** (`.fc-timegrid-slot`
`height: 27px` × 2 slots/hour). Root `zoom: 1.25` (`lib/uiScale.ts`) scales grid and type together,
so the *ratio* is what matters — and the shipped grid is **10% tighter relative to type** than the
mockup was drawn at.

At 54px/hour with the shipped 4c type:

| Duration | Height | Content budget |
|---|---|---|
| 15 min | 13.5px | Less than the 14px checkbox. **Nothing fits** — needs an E3 micro tier |
| 30 min | 27px | 14px padding + one 12px line ≈ 30px. **One line already overflows** |
| 45 min | 40.5px | One padded line, no time |
| 60 min | 54px | Title + time, tight |
| 90 min+ | 81px+ | Comfortable |

Two consequences: the `short` collapse to `padding: 2px 8px` is **load-bearing, not cosmetic** — it
is the only reason 30-min blocks render at all; and the redesign should either raise the slot to
60px to match the mockup, or redraw the tiers at 54. Drawing at 60 and shipping at 54 is how the
last round produced blocks that looked right in the sheet and clipped in the app.

---

## 4. The composition rule — a channel budget

This is the part the flat sheet can't express, and the reason to do the next round differently.
Each axis gets its own visual channel and may not touch another's:

| Axis | Owns | May never touch |
|---|---|---|
| **D — Kind** | Hue (and hue only) | Geometry, opacity |
| **C — Semantic** | Edge style + one badge slot + fill pattern | Hue, geometry |
| **B — Temporal** | Opacity / saturation | Hue, geometry, edge |
| **E — Layout** | Geometry + content tier | Colour entirely |
| **A — Interaction** | Overlay layer: outline, elevation, cursor | Fill, hue — an interaction must never look like a status change |

Precedence when two want the same channel: **A > C > B > D**. A hovered past declined task block
reads as: task hue, declined edge, past opacity, hover outline on top — all four at once, no
conflict. That composes; eighteen rectangles do not.

**One badge slot only.** The one-glyph budget forces the ranking: `conflict > cancelled > declined >
tentative > needs-action > recurring > free`. Everything below the winner falls back to the edge
channel or goes unmarked.

**Non-colour redundancy is mandatory** for C2–C5 and C8. Tentative/declined/cancelled/completed
must each carry a shape cue (dashed edge, strikethrough, hatch, glyph), not a tint alone —
otherwise the state disappears at a glance and for anyone who doesn't parse those hues apart.

---

## 5. What's in the mockup that shouldn't be

- **`14 · empty slot`** — a grid state, not a block state. Belongs with the grid spec.
- **`13 · drop target`** — same. It's `.fc-highlight`, a column overlay.
- **`04 · dragging` / `05 · resizing`** as single swatches — each is a *pair* in the shipped code
  (ghost + placeholder). One swatch under-specifies both.

## 6. Schema deltas the redesign implies

Nothing here is required to *start* designing, but each unlocks a state that's currently fiction:

| Want | Needs |
|---|---|
| Tentative / declined / cancelled / needs-action (C2–C5) | `status text check in ('confirmed','tentative','cancelled')` + `response text` on `calendar_events` |
| Read-only treatment (C7) | pass existing `source` through to `CalendarGrid` — **no migration**, props only |
| Free vs busy (C6) | pass existing `busy` through — **no migration** |
| Ran over (B4) | join task status into the block payload — **no migration** |
| Six kinds (Axis D) | widen `type`, or derive from `domain_id` |
| Recurring glyph (C10) | `recurrence_rule text` on `calendar_events` |
| Pending / failed (A12–A13) | expose outbox state per entity id — plumbing, no migration |

Four of the seven are prop-plumbing, not migrations. Those are the cheap wins.

---

## 7. Recommendation for the next round

1. **Redraw as five layered sheets, not one 18-cell grid** — one sheet per axis, each showing its
   channel in isolation on the same base block, plus one "worst case" composite (task · past ·
   declined · short · hovered) proving the channels don't collide.
2. **Fix the grid rhythm first.** Pick 54 or 60 px/hour and draw everything at it.
3. **Add the six absent-everywhere states**: hover, focus-visible, pending, sync-failed, invalid
   drop, month-view form. These are missing from the mockup *and* the code.
4. **Cut or fund the four fictional ones** (tentative, declined, cancelled, needs-action) — decide
   whether the migration happens before drawing them.
5. **Move `empty slot` and `drop target`** onto a separate grid-states sheet.

---

## Sources

- [RFC 5545 — iCalendar](https://datatracker.ietf.org/doc/html/rfc5545) · [STATUS](https://icalendar.org/iCalendar-RFC-5545/3-8-1-11-status.html) · [Time Transparency](https://icalendar.org/iCalendar-RFC-5545/3-8-2-7-time-transparency.html)
- [Google Calendar API — Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events) · [Event types](https://developers.google.com/workspace/calendar/api/guides/event-types) · [Focus time / OOO / working location](https://developers.google.com/workspace/calendar/api/guides/calendar-status)
- [FullCalendar — Event Dragging & Resizing](https://fullcalendar.io/docs/event-dragging-resizing)
- [Mozilla bug 273279 — no visual status mark on tentative or cancelled events](https://bugzilla.mozilla.org/show_bug.cgi?id=273279) (the failure mode this doc exists to avoid)
