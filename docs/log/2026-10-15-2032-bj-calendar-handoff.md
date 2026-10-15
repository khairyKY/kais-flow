---
date: 2026-10-15
session: bj-calendar (builder, worktree .claude/worktrees/bj-calendar, branch claude/bj-calendar from claude/bound-journal)
type: handoff
related: Bound Journal reskin, Design System B (D10 calendar, 04b blocks); parallel builders bj-today, bj-tasks, bj-pages
---

# 2026-10-15 · handoff · bj-calendar (IN PROGRESS — updated per commit)

The calendar (desktop and phone) on Design System B: tools, 16/12 radii, flat, solid hairlines,
sentence case, Inter Tight metadata. Not merged; no PR.

## Done so far

- Grid (`CalendarGrid.css`): the grid's own metadata on `--fs-meta`; the month pill rule that duplicated the
  all-day pill is gone; the drag ghost has the block's 12px corner (was 2px); done titles strike in
  `--ink-hairline`; a Time slot's fill line sits under a hairline in the block's edge hue (04b); Google
  events show a pointer, not a grab.

- Desktop page (`CalendarPage.tsx`, `planning.css`, `PlanningPanel.tsx`, `ViewOptionsPopover.tsx`,
  `StackMorePopover.tsx`): view switch, ‹ Today ›, the strip's controls and Plan ▾ are kit B secondary;
  rows and planning cards don't tilt; view options are kit Segmented; captions sentence case.
- Phone (`phoneCalendar.css`): metadata on `--fs-meta` (12.5); the shown day ink-filled (`--sel-bg`).
- Forms (`BlockMenu`, `QuickCreate`, `TaskEditorPage`, `formFields`, `TimeField`): sentence case, solid
  dividers, kit segments and buttons, chips with a 3:1 edge, flat tool cards, inputs 12px.

## Judgement calls (Kai's to overrule)

1. **Grid metadata at 12px (D5).** Hour labels, "All day", the month's weekday row, day numbers and
   "+N more" now read `--fs-meta` (12px, scaled with the grid; were 9–10.5px). The day name stays 11px
   ("Wed · Today 14" must fit a Week column on one line). Block type (title 12, time 8.5, badge 9) is
   unchanged: it already matches 04b's tile at screen scale.
2. **Colours untouched.** Month and all-day pills stay lavender for every kind (04b draws the all-day band
   lavender); the planning strip's free time stays sage; phone blocks stay fill-only (no 1px edge).
3. **Plan ▾ on a hovered rail row.** A hovered row turns bone, the same tone as a B secondary button, so
   there the button steps up to parchment to keep an edge.
4. **Handwriting on tools → help sentences (D7).** The planning panel's "pick something, plant it on the
   right ✿", the create page's footer line and the task editor's "every field saves quietly…" keep their
   words but lose Caveat and the tilt.
5. **The planning panel's "Unscheduled · N tasks"** is a section label (14px semibold ink, D6).
6. **Dashed → solid dividers use `--line-card`** (the spec's "tool hairline"); dividers already made solid
   on the base build keep their colour. Dashed stays where it means "add" or "empty" (+ Label, an unset
   field chip, the None swatch) and on the grid's drop targets and open time.
7. **Picking up still tilts.** The drag lift (scale 1.04, +1.2° while held) and the ghost's wobble are
   motion, not a resting tilt; kept.
8. **Kit buttons everywhere, kit sizes.** Header controls are the kit's desktop secondary (~36px drawn), not
   D11's 44. Create / Save are the kit's CTA, which is `--acc-terra-ink` (the Design System B primary), a
   shade deeper than the hand-built `--acc-terra` they replace; More options ↗ and Delete task are the kit's
   terra text button.
9. **Selected chips and segments are ink-filled (D12)** in the Editor forms: duration chips (were a lavender
   wash), Busy / Free, the kind and priority switches.
10. **The create page's chosen kind** is a flat parchment card with an ink edge (was a taped, tilted card).

## Before / after

`docs/log/assets/bj-calendar/before/` (38 shots, the base build) and `after/` (same scenes).

## Harnesses on the base build (before any change)

event-detail 68/68 · cal-wave2 83/83 · cal-rail-drop 33/33 · calendar-rail 99/99 · time-slots 52/52 ·
event-reminders 37/37 · cal-keys 68/69 (k2 "? sheet open, d does nothing") · google-sync 99/101 (g1 reads the
old "3 blocked" footer copy).
