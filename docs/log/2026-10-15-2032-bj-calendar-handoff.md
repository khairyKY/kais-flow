---
date: 2026-10-15
session: bj-calendar (builder, worktree .claude/worktrees/bj-calendar, branch claude/bj-calendar from claude/bound-journal)
type: handoff
related: Bound Journal reskin, Design System B (D10 calendar, 04b blocks); parallel builders bj-today, bj-tasks, bj-pages
---

# 2026-10-15 · handoff · bj-calendar

The calendar (desktop and phone) and its menus and forms on Design System B: tools are 16/12 rounded,
flat, divided by solid hairlines, sentence case, with metadata in Inter Tight. Pushed to
`claude/bj-calendar`. Not merged; no PR.

## What changed

- **Grid** (`CalendarGrid.css`): the grid's own metadata reads `--fs-meta`, scaled with the grid. The month
  pill rule that duplicated the all-day pill is gone. The drag ghost has the block's 12px corner (was 2px).
  Done titles strike in `--ink-hairline`. A Time slot's fill line sits under a hairline in the block's edge
  hue (04b). Google events show a pointer, not a grab.
- **Desktop page** (`CalendarPage.tsx`, `planning.css`, `PlanningPanel.tsx`, `ViewOptionsPopover.tsx`,
  `StackMorePopover.tsx`): the view switch, ‹ Today ›, the planning strip's controls and the rail's Plan ▾
  are kit B secondary buttons. Rail rows and planning cards no longer tilt, and the folded tab's edge is
  solid. View options are kit Segmented rows. Captions and the header's week line are sentence case.
- **Phone** (`phoneCalendar.css`): metadata reads `--fs-meta` (12.5px), and the shown day is ink-filled
  (`--sel-bg` / `--sel-ink`).
- **Menus and forms** (`BlockMenu`, `QuickCreate` popover and /new page, `TaskEditorPage`, `formFields`,
  `TimeField`): sentence case, solid dividers, kit segments and buttons, chips with a 3:1 edge, flat tool
  cards (no tape or tilt), and 12px inputs.
- **bound.css**: none of its rules is calendar-only (all are global attribute selectors that other areas
  still use), so nothing was deleted. The calendar no longer depends on any of them. A probe of 14 calendar
  scenes found only kit or shared parts still matching: `BackLink`, `MiniFocus`, the ContextMenu divider and
  the BottomSheet footer.
- **Harnesses**: `google-sync` g1 now reads the rail's load line ("3 blocks · 2h free") instead of the old
  "3 blocked" footer. `bound-journal/verify.mjs` gained 5 scenes: view options, a Google event's menu, /new
  (event and task) and the task editor.

## Judgement calls (Kai's to overrule)

1. **Grid metadata at 12px (D5).** Hour labels, "All day", the month's weekday row, day numbers and
   "+N more" now read `--fs-meta` (12px, scaled with the grid; they were 9–10.5px). The day name stays at
   11px so "Wed · Today 14" fits a Week column on one line. Block type (title 12, time 8.5, badge 9) is
   unchanged, because it already matches 04b's tile at screen scale.
2. **Colours untouched.** Month and all-day pills stay lavender for every kind, as 04b draws the all-day
   band. The planning strip's free time stays sage. Phone blocks stay fill-only, with no 1px edge.
3. **Plan ▾ on a hovered rail row.** A hovered row turns bone, the same tone as a B secondary button, so on
   hover the button steps up to parchment to keep an edge.
4. **Handwriting on tools becomes help sentences (D7).** The planning panel's "pick something, plant it on
   the right ✿", the create page's footer line and the task editor's "every field saves quietly…" keep
   their words but lose Caveat and the tilt.
5. **The planning panel's "Unscheduled · N tasks"** is a section label (14px semibold ink, D6).
6. **Dividers changed from dashed to solid use `--line-card`** (the spec's "tool hairline"). Dividers the
   base build had already made solid keep their colour. Dashed stays where it means "add" or "empty" (+
   Label, an unset field chip, the None swatch), and on the grid's drop targets and open time.
7. **Picking up still tilts.** The drag lift (scale 1.04, +1.2° while held) and the ghost's wobble are
   motion, not a resting tilt, so they stay.
8. **Kit buttons at kit sizes.** Header controls are the kit's desktop secondary (about 36px drawn), not
   D11's 44px. Create and Save are the kit's CTA in `--acc-terra-ink` (Design System B's primary), a shade
   deeper than the hand-built `--acc-terra` they replace. More options ↗ and Delete task are the kit's terra
   text button.
9. **Selected chips and segments are ink-filled (D12)** in the Editor forms: duration chips (previously a
   lavender wash), Busy / Free, and the kind and priority switches. Busy / Free is dense, so the ten colour
   swatches stay on one line in the popover.
10. **The create page's chosen kind** is a flat parchment card with an ink edge (previously a taped, tilted
    card).
11. **Left for the owner of `rituals/RitualChrome`:** the phone strip's Overdue / Today / Inbox / Lists
    segment and the phone quick-create's Task / Event / Block switch use RitualChrome's Segmented, which
    still selects with a sage wash and a check rather than ink (D12). The calendar-rail and calendar-phone
    harnesses rely on its `role="radio"`.

## Evidence

- Shots: `docs/log/assets/bj-calendar/before/` (38: 19 scenes × day / night, base build) and
  `docs/log/assets/bj-calendar/after/` (48, the same plus the 5 new scenes). Desktop is 1920×1080, the phone
  390×844. Every format is covered: Day, 3 days, Week and Month on desktop and phone. So is every state:
  planning mode, loading, empty day, details, quick create, drag, +N more, block sheet, tap-to-create, the
  tray, view options, a Google event, and the /new and task editor pages.
- Harnesses, on the base build first and then this branch: event-detail 68/68 → 68/68, cal-wave2 83/83 →
  83/83, cal-rail-drop 33/33 → 33/33, calendar-rail 99/99 → 99/99, time-slots 52/52 → 52/52,
  event-reminders 37/37 → 37/37, google-sync 99/101 → 101/101, cal-keys 68/69 → 69/69. On the base, cal-keys
  k2 failed once under three parallel lanes and passed here.
- Gates: `npx vitest run` passes 160 files / 2223 tests. `npm run lint` reports 0 errors (22 warnings,
  pre-existing). `npm run build` is green. `npm run ds:check` shows 0 new hits in the calendar files (24
  before), and 23 new app-wide (46 before).
