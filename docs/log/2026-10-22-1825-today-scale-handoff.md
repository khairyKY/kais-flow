---
date: 2026-10-22
session: today-scale (builder, worktree .claude/worktrees/today-scale, branch claude/today-scale from v1.3.0)
type: handoff
---

# 2026-10-22 18:25 · handoff · today-scale

Kai's three reports from 2026-10-22, built on `claude/today-scale` and pushed. Not merged, no PR, no
migration. Colours untouched.

## 1 · "the today tasks are combined with the also open tasks"

Root cause: Today drew Top 3 → Overdue fold → **Also open** (desktop) / **More for today** (phone fold),
and Also open held every other open row: due today, due later and undated alike.

- `grouping.ts` gains `isTodayTask(task, now)`: due today or on the calendar today, on the user's own
  day (`cairoDateKey` = `lib/appZone`'s `zoneDateKey`). The Tasks **Today** list now uses it too (same
  set as before: `isTop3Today || isTodayTask || overdue`), so the two can't drift. Test in `grouping.test.ts`.
- `TodayPage.tsx`: the rows that were Also open split into **Today's tasks · N** (its own section, under
  Today's three on the computer, under Up next on the phone) and **Also open · N** (the rest). Order:
  Today's three → Today's tasks → Overdue (fold, unchanged) → Also open. The phone's fold is now
  labelled **Also open** (was "More for today"; it still carries Slipping / From a while ago under their
  sub-headers). Same rules in both: `sortByOrder`, done after open, back-from-snooze first, Top 3 out,
  subtasks nested under their parent (the parent's section decides). N counts open rows, as Also open's
  did; rows finished today stay listed, struck. ⌘/Ctrl+↑/↓ reorders within Overdue, Today's tasks or
  Also open. Over 50 rows: "View all" → `/tasks?list=today`.

## 2 · "clipping issues … while the app is in 150% scale"

Swept 13 pages + the collapsed sidebar, the task popover and the command bar at 125% and 150%, 1280×800
and 1920×1080 (`today-scale/verify.mjs`, screenshots `scale-*`, `ui-*`; before in `before/`). Found and fixed:

| Where | Root cause | Fix |
|---|---|---|
| Sidebar nav (Kai's screenshot: "Library" cut) | the nav column scrolls above the pinned foot; the last row in view ended hard against it, read as clipped (1920×1080 @150: Focus; 1280 @125: "Cultivate"; collapsed rail too) | `AppLayout.tsx`: while there's more below, the column's last 36px fade (scroll-driven `--kf-side-fade`, `@supports`-guarded); none at the end or when nothing scrolls. Look unchanged otherwise |
| Today @150 on a 1280 window (~530px page) | the 264px rail left the lists ~227px: titles a word a line, a Today's-tasks row's ⋯ pushed out of its row | `today.css`: `.td` is a container; below 700px of page the rail goes under the lists |
| Routines, same size | list column ~120px beside the 320 rail; ritual cards overlapping "Pinned" | `RoutinesPage.tsx`: same container query (stack < 700px) |
| Weekly review, same size | sweep column ~210px; "0 of 0 domains swept" ran into the Slipping card | `WeeklyReviewPage.tsx`: stack < 640px; the header row wraps on desktop too |
| Tasks @150 on 1920 | below the list's 780 cap it met the Organize rail's rule (quick-add border on the divider) | `TasksPage.tsx`: 28px column gap; the two-column switch moves 760 → 788 so the list keeps 472 |
| Focus @125–150 | a page-wide task title put its checkbox on the window's left edge | `FocusPage.tsx`: `.fp-task` 16px padding at every size (was phone only) |

Why container queries: media queries read the unzoomed window, so `isMobile` / `@media` never see the
125–150% zoom; `.tasks-page` already did this.

## 3 · "the goal of the day is either clipped or the right side of the card's outline is overlapped"

Root cause: rows clip sideways at their own edge (`.kf-swipe { overflow-x: clip }`, so a swiped row
can't spill), and the goal card sits in one, tilted −0.4° with `--shadow-goal`. The tilt pushes its
corners 0.4–2.4px past the row (more at 150%, a taller card), so the right border vanished near the
corners and the shadow's whole sideways spread was cut flat. The + / ⋯ buttons were not the cause.
Fix (`today.css`): at rest the goal row clips on both axes with `overflow-clip-margin: 28px` (Chrome
honours the margin only when both axes clip); swiped (`data-swiping` / `data-moved`), it falls back to
the row rule. Tilt, tape, clover kept. Measured at 100/125/150% on both sizes and the phone.

## Gate

- `npx tsc -b` clean · `npx vitest run` ×4 TZ (PowerShell `$env:TZ`): Africa/Cairo, UTC,
  America/Los_Angeles, Asia/Tokyo: **169 files, 2331 tests** each
- `npm run lint`: 0 errors (24 warnings, all pre-existing) · `npm run build` ✓ · `ds:check`: 0 new (5 fixed since)
- `birthday_on` in `lib/types.ts`: 1 · `birthday_on: false` in `lib/settings.ts`: 1

## Harnesses (mock server :5295, dual-stack, one at a time)

- **today-scale (new): 330/330** — split (desk + phone, day/night), goal card (3 scales × 2 sizes + phone,
  day/night: 4 edges + 12px shadow room against every clipping ancestor, nothing over the right border),
  sweep (13 pages × 4 size/scale + night at 1920 @150: no sideways scroll, no key control cut, columns
  fit, sidebar rows reachable / faded / foot whole), collapsed rail, task popover, command bar.
  Before (old CSS): 247/275 (goal 16 fails, sidebar 10, a cut ⋯ 2).
- today-shell 86/86 · fix-today 116/116 · plan-replan 103/103 · subtasks 47/47 · desktop-polish 150/150 ·
  phone-polish 718/718 · polish 62/62
- Updated where the old expectation contradicts Kai's ask: **plan-replan** ("Also open · 2" → "· 1",
  Buy milk is due today so it's in Today's tasks; the phone's "More for today · 2" → "Also open · 1",
  and its task-sheet step no longer opens that fold) and **fix-today** ("Also open · 7 / Show 4 more" →
  Audit ads in Today's tasks, "Also open · 6 / Show 3 more", 7 rows open).
- plan-replan's "Tomorrow, first thing → due Thu 09:00" failed once on the v1.3.0 base too (a write
  read before it lands); green on the final run.

## Not done / for later

- The row ⋯ (`.kf-row-more`, 32px, margin-right −4px) overhangs its row by 4px on the computer, so the
  row's sideways clip trims 4px of its hover / focus ring; the glyph is whole. Pre-existing at every
  scale, not Kai's report; the harness counts a glyph-whole icon button as not cut.
- Calendar at 150% on a 1280 window (its header squeezed) left to the calendar builder.
- Focus's page bleed (`width: 100%` + negative margins) still leaves 80px short on the right on a
  computer, at every scale; not clipping, not touched.
