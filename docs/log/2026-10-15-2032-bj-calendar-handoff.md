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

## Judgement calls (Kai's to overrule)

1. **Grid metadata at 12px (D5).** Day names, hour labels, "All day", the month's weekday row, day numbers
   and "+N more" now read `--fs-meta` (12px, scaled with the grid; were 9–11px). Block type (title 12,
   time 8.5, badge 9) is unchanged: it already matches 04b's tile at screen scale.
2. **Colours untouched.** Month and all-day pills stay lavender for every kind (04b draws the all-day band
   lavender); the planning strip's free time stays sage; phone blocks stay fill-only (no 1px edge).

## Before / after

`docs/log/assets/bj-calendar/before/` (38 shots, the base build) and `after/` (same scenes).

## Harnesses on the base build (before any change)

event-detail 68/68 · cal-wave2 83/83 · cal-rail-drop 33/33 · calendar-rail 99/99 · time-slots 52/52 ·
event-reminders 37/37 · cal-keys 68/69 (k2 "? sheet open, d does nothing") · google-sync 99/101 (g1 reads the
old "3 blocked" footer copy).
