# Kai's Flow — Calendar block spec (v2, layered axes)

**Scope:** the block on the time grid — the only component this document covers. Normative: if an
implementation disagrees, the implementation is wrong. Supersedes the v1 flat-state-matrix spec.

Canonical drawings: `Calendar.dc.html` turn 3 — `#3a` interaction, `#3b` temporal, `#3c` semantic,
`#3d` kind, `#3e` layout, `#3f` composite proof. Drag/resize motion: `Motion.dc.html#4c`.

---

## 0. The model

A block is **one rectangle, positioned by start time, sized by duration**. Every real block is a
**composition of five independent axes** — not one state from a flat list. `hover`, `past`,
`short` and `declined` can all be true at once; the axes make that renderable.

| Axis | Owns (its only channel) | Must never touch |
| --- | --- | --- |
| **Kind** | hue, and hue only | geometry, opacity |
| **Semantic** | edge style + one badge slot + fill pattern | hue, geometry |
| **Temporal** | opacity / saturation | hue, geometry, edge |
| **Layout** | geometry + content tier | colour, entirely |
| **Interaction** | overlay only: outline, elevation, cursor | fill, hue |

**Precedence on collision: Interaction > Semantic > Temporal > Kind.** An interaction must never
look like a status change.

**One badge slot** (top-right, 9px mono), ranked:
`⚠ conflict > ⌀ cancelled > ✕ declined > ? tentative > RSVP needs-action > ↻ recurring > FREE free`.
Below the winner, statuses fall back to the edge channel (dash/dot/hatch) or go unmarked.

**Non-colour redundancy is mandatory** for tentative / declined / cancelled / completed — each
carries a shape cue (dash, dot, strike, hatch, glyph), never a tint alone.

`empty slot` and `drop target` are **grid states, not block states** — the placeholder is the
grid's element, not a block.

---

## 1. Grid maths — as shipped

| Quantity | Value |
| --- | --- |
| Hour row height | **54px** (27px per 30-min slot) — match the app; do NOT draw at 60 |
| Snap increment | **30 min = 27px** |
| Block `top` | `(startMinutes − dayStartMinutes) × 0.9` px |
| Block `height` | `durationMinutes × 0.9` px — **never rounded up** |
| Column inset | `left: 5px; right: 5px` |
| Hour line | `1px solid var(--line-card)` |
| Hour label | 9px mono `--ink-hairline`, top offset `hourTop − 7` |

Content budget at 54px/hour (drives the layout tiers, §5):
15 min = 13.5px · 30 min = 27px · 45 min = 40.5px · 60 min = 54px · 90 min = 81px.

**Now-line:** `2px solid var(--acc-lavender)`, full column width, `z-index: 5` — above every
block. 9px dot at the left end; desktop time chip is an opaque pill (parchment fill, 1px lavender
border, radius 3) centred on the line; omitted on mobile.

---

## 2. The base block, verbatim from the app

```
border-radius: 6px;            /* never more */
padding: 7px 10px;
background: color-mix(in srgb, <ACCENT> 24%, transparent);
border: 1px solid color-mix(in srgb, <ACCENT-DEEP> 35%, transparent);  /* full border — no left spine */
box-shadow: none;              /* elevation belongs to Interaction */
overflow: hidden;
```

- **Title** — 12px `--ink-body`, line-height 1.3, one line, ellipsis. Two lines only ≥ 81px tall.
- **Time** — 8.5px `--font-mono`, `<ACCENT-TEXT>`, 2px below the title. `start–end` first, then
  `· duration` `· method` `· count` as space allows.
- **Resize grip** — 28×3px bar, radius 2, centred, 3px off the bottom, `rgba(124,106,154,0.5)`.
  Hover/focus only. Hit area 10px.
- **Checkbox** — task/ritual blocks only, 12px square left of the title, hover/focus only.

Per-kind hue swaps the accent **at the same alphas**; geometry never changes with hue.

---

## 3. Axis: Kind (hue only) — `#3d`

Derived, never chosen. Resolve in order, first match wins:

| Order | Kind | ACCENT | ACCENT-DEEP (edge) | ACCENT-TEXT (time) |
| --- | --- | --- | --- | --- |
| 1 | Ritual (from Routines) | `--acc-sage` + 135° hatch | `--acc-sage-text` | `--acc-sage-text` |
| 2 | Focus (timer live) | `--acc-moss` + elapsed fill | `--acc-sage-text` | `--acc-sage-text` |
| 3 | Task with project | project hue | its text token | its text token |
| 4 | Task | `--acc-lavender` | `--acc-lavender-deep` | `--acc-lavender-text` |
| 5 | Meeting (other people) | `--acc-blossom` | `--acc-clover-text` | `--acc-clover-text` |
| 6 | Admin (from Inbox) | `--acc-hydrangea` | `--acc-hydrangea-deep` | `--acc-hydrangea-deep` |
| 7 | External | fill `--paper-bone`, edge `--line-solid` | — | `--ink-faint` |

Ritual hatch: `repeating-linear-gradient(135deg, rgba(255,255,255,.28) 0 4px, transparent 4px 9px)`
— the only texture any block gets; it means "repeats", so rituals skip the ↻ badge.
Focus elapsed fill: left-to-right child at `ACCENT 18%`, tracks real time — the only animated
block; locked from drag while running. Only task and ritual blocks are completable.

---

## 4. Axis: Semantic (edge + badge + fill pattern) — `#3c`

| Status | Edge | Fill | Badge | Extra shape cue |
| --- | --- | --- | --- | --- |
| confirmed | solid 35% | 24% | — | — |
| tentative | **dashed** 55% | 12% | `?` | — |
| needs-action | solid 35% | 12% | `RSVP` | — |
| declined | **dotted** 55% | none | `✕` | title struck `--ink-hairline`; **drops out of collision maths** |
| cancelled | solid `--line-solid` | 45° void hatch (`--ink-hairline` 35%, 1px lines / 8px) | `⌀` | title struck; kept one day, then hidden; ≠ declined |
| free (vs busy) | kind edge | none | `FREE` | drops may land on it without conflict |
| read-only / external | **dotted** 55% | kind fill | `⌾` | no grip, cursor default |
| completed | `--line-solid` | drains to `--paper-bone` | petal (9×7, 38°) | check fills `--acc-sage`, title struck — hue leaves entirely |
| conflict | solid DEEP | 24% | `⚠` in ink (never terra) | time appends `· overlaps n` |
| recurring instance | solid 35% | 24% | `↻` (only if slot free) | — |

---

## 5. Axis: Temporal (opacity/saturation only) — `#3b`

| State | Recipe |
| --- | --- |
| future | identity |
| in progress | contains the now-line; elapsed proportion washed `ACCENT-DEEP 14%`; time → `Now · <n>m left`, per minute |
| past | `opacity: .55; filter: saturate(.6)`; **still draggable** |
| ran over | the ONE terra exception: fill `--acc-terra 10%`, edge dashed terra 55%, time `Ran over · <end>` in terra. Task blocks only; one tap reschedules |

---

## 6. Axis: Layout (geometry only) — `#3e`

Content tiers by **drawn height**:

| Tier | Height | Content |
| --- | --- | --- |
| full | ≥ 81px | title (may wrap to 2 lines — never 3) + time + markers |
| standard | 54–80px | one-line title + time |
| short | 27–53px | one vertically-centred line, no time row; at 27px type drops to 11px, padding 6/8, start time right if it fits |
| micro | < 27px | 8px mono strip, radius → 3px, no padding rows; full title in tooltip; 44px pointer target on touch |

Geometry cases:

- **Overlap (2):** each `calc(50% − 2px)`, 4px gutter; earlier start left, longer wins ties;
  short-tier type scale.
- **Stacked (3+):** shingle 56% wide, offset 22% per index, later on top; topmost reads `+N more`
  when any are fully hidden; hover z-bumps only — no geometry change.
- **All-day chip:** in the band above the grid, never on it. 20px pill (radius 10), max 2 rows
  then `+N`. No grip, no time row.
- **Multi-day span:** one logical pill in segments — start `radius 6 0 0 6`, middle square, end
  `0 6 6 0`; open edges carry `»`/`«`; title on the first visible segment only.
- **Spans midnight:** continues-into → bottom corners square + `⌄ <end>` at the cut;
  continues-from → top square + `⌃ from <start>`. Each segment resizes only its open edge.
- **Clipped by scroll:** the title pins to the visible top of the block until 20px remain.
- **Narrow column (< 170px):** short-tier type scale, start time only. Width never changes what
  the block *is*.
- **Month view:** 16px pill — kind dot + start + title, max 2 per day cell, then dot row with
  `+N`. Semantic badges drop; temporal dimming keeps.

---

## 7. Axis: Interaction (overlay only) — `#3a`

| State | Recipe |
| --- | --- |
| rest | flat, no shadow, cursor `grab` |
| hover | lift 1px + `--shadow-card` + grip reveals. **Fill untouched.** 120ms |
| focus-visible | `outline: 2px solid ACCENT-DEEP; outline-offset: 2px` — outside the box, never merged with selected |
| pressed | `scale(.99)`, shadow gone, cursor `grabbing`; ≥150ms hold → drag |
| selected | border goes solid DEEP at the same 1px + ring `0 0 0 3px DEEP 18%` + `--shadow-card` |
| dragging | **a pair**: ghost = the block, `rotate(-1.2deg) opacity .92 --shadow-panel`, free/unsnapped; placeholder = grid element, `1.5px dashed DEEP`, 10% fill, jumps 27px at slot midpoints; ghost time re-reads per snap |
| resizing | **a pair**: block stretches unsnapped; snap line `1.5px solid DEEP` flashes at the commit mark; grip solid; time live; min 30 min |
| valid drop | placeholder dashes go **solid**; height = task estimate; chip `<start> · <dur>` |
| invalid drop | greys, never terra: `1.5px dashed --ink-hairline`, no fill, `⌀`, cursor `not-allowed`; ghost dims .6 and untilts |
| creating | live block, border solid DEEP, focused title input (`Untitled` + caret), live range; Esc discards, Enter commits |
| just-landed | selection ring 18% → 0 over 300ms; no bounce |
| pending / unsaved | offline outbox: **outer** `1px dashed --ink-hairline` outline (offset 2px — the border stays semantic) + time suffix `· saving ◌` in `--ink-faint`; clears silently on ack |
| sync-failed | **outer** `1.5px solid --sig-overdue` outline + `⚠` + `· retry` (tappable). The *fill* never goes terra — terra fill still means ran-over only |
| exiting | `opacity .4, scale .98` over 200ms ease-in, then removed; neighbours reflow after, not during |

`prefers-reduced-motion`: keep opacity/colour, drop transforms, tilt, and the petal.

---

## 8. Composition rules — `#3f`

1. Apply Kind (hue), then Semantic (edge/badge/pattern), then Temporal (dim/desaturate the
   result), then Layout (pick the tier for the drawn height/width), then Interaction on top.
2. One badge renders — the ranking winner. Losers fall back to edge/pattern or vanish.
3. Outlines are always **outside** the border (`outline-offset: 2px`) so inner semantics stay
   visible; they never leak into overlap siblings.
4. Worst-case proof (must stay legible): a task that is past + declined + short + hovered —
   lavender dotted edge + strike + ✕, at .55/sat .6, 27px one-line tier, lifted with shadow-card.

---

## 9. Never

- Raw accent fill, or any gradient.
- Corner radius past 6px; heavier border at rest.
- Height rounded up to the hour.
- Resize grip or checkbox visible at rest.
- A third line of text under 90 minutes.
- Terra fill/edge for anything but ran-over (`--sig-overdue` outline+glyph = sync failure only).
- Title wrapping instead of clamping (outside the ≥81px tier).
- Immovable past blocks.
- A block drawn over the now-line.
- Unsnapped outcomes — the hand is loose, the commit lands on the 27px grid.
- New hex literals — hues come from `--acc-*` via `color-mix`, papers from `--paper-*`.

## 10. Checklist — what gets built wrong

1. Drawn at 60px/hour when the app ships 54 — blocks clip. Use 54.
2. Interaction states re-tinting the fill (hover as a colour change).
3. Two badges rendered at once instead of ranking.
4. Declined merged with cancelled.
5. Unsaved blocks identical to saved ones — the outbox must show (`pending`, `sync-failed`).
6. Micro blocks given the full padding stack and overflowing their 13.5px.
