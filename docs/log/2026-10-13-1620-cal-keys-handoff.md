---
date: 2026-10-13 16:20 UTC
session: cal-keys
type: handoff
related: 2026-10-13-0808-p7e-parity-audit.md §3 A) rows A4, A13, A15, A16
supersedes: none
---

# cal-keys: handoff — calendar keys, repeat fixes, calendar truths, no false Google line

Branch `claude/cal-keys`, from `origin/claude/kai-bugs-1012` @ 1c5bfb3f. Pushed. Not merged, no PR. No migration.

## Per item

| Item | Result | Commit |
|---|---|---|
| **A16** false copy | Editor 1c's "mirrors quietly to Google Calendar" line is gone from the event form. It is marked `deviation(2026-10-13 p7e A16)` and comes back when the sync exists. | 53074d72 |
| **A15** calendar truths | (1) "Show weekends" off hides the user's own `weekend_days`, not Sat + Sun. The grid still gets one stable array (J-15), and `weekFit.visibleDayCount` counts the hidden days. An empty weekend, or all seven days, hides nothing. (2) The ⚠ overlap check compares instants (`overlapLayout.conflictsOf`), so back-to-back `…+00:00` / `….000Z` events no longer clash. (3) Resizing an all-day task block keeps `duration_min` (it used to write days as minutes). This is fixed in `calendar/api.resizeEvent`, which the phone uses too. (4) The rail footer is now "N blocked · Xh free today": busy blocks only, and the free time left from now inside 08:00–20:00 (`planningMode.freeLeft`, which the planning strip's footer also uses). Free events, past time and off-hours time no longer count. `blockedOn` skips Free events in both footers. | 8a1f1738 |
| **A13** repeats | (1) **Yearly** is a preset and a Custom… unit. An imported `FREQ=YEARLY` now opens as yearly, not weekly. (2) **"Ends after N times" ends.** A task's COUNT is how many are left, itself included. Each spawned copy, and each skip, carries one fewer, and COUNT=1 spawns nothing (`recurrence.ruleAfterThis`). The date step ignores COUNT, so a counted daily task finished late still comes back tomorrow. (3) The sheet's **"Next ·"** uses `nextDue`, so an overdue repeat previews from today, not a past date. (4) **Repeat while creating**: the desktop create page's Event and Time block forms get Editor 1b's Repeat field (a held task's block doesn't, because it repeats through its task). The phone create sheet's Event / plain Block get a Repeat chip. Both apply the rule through the block menu's own `setEventRepeat` (align, toast, Undo). | e21d31d6 |
| **A4** calendar keys | Keys: `d`/`1` day, `2`–`6` that many days (remembered, as the popover does), `w`/`7` week, `m` month, `-` `=` and `←` `→` page, `t` today, `0` folds the planning rail. Keys never fire while typing (`isTypingTarget`) or while a menu, popover or dialog is open (`overlayCount()`). Letters also read by key code, so an Arabic layout works. ‹ Today › are real buttons: Tab reaches them, Enter works, and they use the kit's `kf-press` focus ring and title hints. **Ctrl-click** an empty slot: FullCalendar ignores Ctrl, so `CalendarGrid` resolves the slot itself. **⌘-click** goes through FC's own `select`. Either one opens the quick create as a **Task** with its block on that slot. **⌫** in an open plain one-off event's popover deletes it, with Undo, and its Delete row shows ⌫. A repeat still asks This / All, and a task block still unschedules. The `?` sheet's **Calendar** section is back, listing exactly those keys. | 70943798 |
| harness follow-up | event-detail's `b1` clicked the old `.cal-head span ›`. It now presses the real Next button. | 801752cc |

Identity notes:
- Tokens only. The Today pill's `12.5` became `var(--fs-caption)`, so ds:check shows 0 new.
- `deviation(2026-10-13)`: Tour 14k-3 draws the Calendar section last in column 3, under "Go to", which was cut (D-5). That column holds Inbox triage + Command bar here, so the section sits under Anywhere. The sheet already scrolled at 1280×800 before this change; columns now measure 713 / 548 / 515 px against a 518 px viewport.
- Repeat on the 1c/1d forms has no drawing; it reuses 1b's field and is flagged for Phase C. The field's help line stays the export's verbatim "daily · weekly · monthly · custom rule", even though Yearly now exists.

## Gate (all run in this worktree)

- `npx vitest run` ×4 TZ in PowerShell (`$env:TZ`; offsets confirmed −180 / 0 / 420 / −540): **150 files, 1996 tests, all passed** in Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo.
- New tests: `overlapLayout.test` (conflictsOf ×2), `planningMode.test` (Free / past / off-hours footer), `series.flow.test` (timed vs all-day task-block resize), `recurrence.test` (ruleAfterThis, counted late daily), `completion.test` (COUNT 3→2→1→none, dedupe under the counted rule), `repeatRule.test` (yearly round trip), `taskSheetMath.test` (Next from today, COUNT=2 shows no "then"), `blockMenuSpec.test` (⌫ hint on a plain event, not on a series), `weekFit.test` (hidden-day counts).
- `npm run lint`: 0 errors (21 warnings, all pre-existing; none in changed lines).
- `npm run build`: passes.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**, 1 fixed.
- Browser, against the mock backend (dev server from this worktree, `--mode mock`, http://localhost:5272, warmed first, stopped after):
  - `docs/log/assets/cal-keys/verify.mjs` (new): **69/69**. It covers k1 keys (incl. Arabic `ي`/KeyD), k2 guards (view popover, typing a title, `?` sheet), k3 buttons day + night, k4 Ctrl- and Meta-click → task + block, k5 ⌫ + Undo / series untouched, k6 sheet day + night, w1 three weekends, o1 overlaps, f1 footer day + night, r1 create-form Repeat / Yearly / no Google, r2 sheet Next + COUNT spawn (phone), p1 phone create Repeat.
  - Reruns: **event-detail 68/68** (after the selector fix), **cal-wave2 83/83**, **cal-rail-drop 33/33**, **today-shell 88/88**. task-sheet also ran (149/149), because `nextDates` changed.

## Not done / not verified

- **Server-side COUNT.** MCP `complete_task` (`supabase/functions/mcp/tools.ts`) still spawns the next copy with the same rule. A counted series completed through MCP doesn't count down or end, and it carries the count forward unchanged. The app is right; the edge function needs the same `ruleAfterThis`, and it is A1/A14's file. Not touched, to avoid colliding with those builders.
- The compact quick-create popover (2a/2b) has no Repeat field. Repeat is on "More options ↗" and the phone sheet. Adding a row there would undo Kai's 2026-10-03 trim for 150% windows.
- Ctrl-click draws no slot highlight, because FC isn't selecting. ⌘-click (FC's own select) does. Ctrl-clicking a day header opens an all-day task for that day.
- `←` / `→` are taken window-wide on the Calendar page, outside fields and overlays. A focused horizontal grid scroller no longer scrolls by arrow key.
- Not checked on a real Mac (⌘-click verified through Playwright's Meta modifier on Windows Chrome), on a real Arabic keyboard (verified with a synthetic `ي`/KeyD event), or on a device.
- Not merged, not deployed. No `[KAI]` steps are needed. The release needs no migration and no function deploy.
