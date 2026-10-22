---
date: 2026-10-22
session: clock-fallout (builder, worktree .claude/worktrees/kai-bugs, branch claude/kai-bugs-1012)
type: handoff
---

# 2026-10-22 22:54 · handoff · clock-fallout

Follow-up to cal-polish's one 12h/24h clock (`app/src/lib/clock.ts`). A harness pass on the merged tree failed in 7 suites. This round sorts each failure into stale or real, fixes the real ones, and gives every time range one style.

Everything is pushed to `claude/kai-bugs-1012`. There is no migration. Every check ran against the mock dev server on :5270.

## 1 · One range style

Every user-visible span now goes through `clockRange`:

- When both ends share AM/PM, it is written once: "10:15–10:30 AM".
- When they don't, both are written: "11:30 AM–12:30 PM".
- On the 24-hour clock: "10:15–10:30".

These places built ranges by hand ("10:15 AM–10:30 AM") and now use the helper:

- **Planned toast and slot hints**: the row grammar, Resurfacing and TaskMenu's slot hints. They go through the new `slotChip` in `features/tasks/taskSheetMath.ts`.
- **Today**: the Now card (`TodayPage.tsx`).
- **Focus**: the block line (`FocusPage.tsx`). It keeps its spaced " – ".
- **Calendar grid**: the stack popover and the desktop block times (`CalendarGrid.tsx`). FullCalendar's `eventTimeFormat` is now a function over `clockRange`. It used to print FullCalendar's "10:30 AM - 11:30 AM". A day-view block now reads "10:30–11:30 AM", or "10:30–11:30" on the 24-hour clock.

`eventTime.timeRange` takes an optional `h24`, because the grid passes its own clock.

Tests:

- `lib/clock.test.ts`: shared AM/PM, the noon and midnight crossings, 24h, and `timeRange` with `h24`.
- `taskSheetMath.test.ts`: `slotChip` on both clocks.

## 2 · The 7 suites

| Suite | Failure | Verdict |
|---|---|---|
| plan-replan | Replan list "keeps its 15:00 · Wed 7 · 15:00", "Thu 8 · 09:00" | **Real.** `planOptions` printed raw "HH:mm". It now uses `clockText`, and so does Settings' shortcuts glossary ("else 9:00 AM", "8:00 AM–8:00 PM"). The harness wording is updated. |
| plan-replan | Next free slot, Another time, the Planned toast, the Spread preview, phone 90m slot, weekend hint, glossary | Stale 24h text. The toast was also the 2-style range, fixed in §1. |
| event-reminders p1 | Remind sheet never opened | **Harness.** cal-polish's length chips push the Remind row under the sheet footer, so the touch landed on the footer. The row works once the sheet body is scrolled. The harness now scrolls it into view before the tap. |
| tray-notices | "paper: the in-app toast is still there too" | **Flake.** 59/59 twice when run alone. No change. |
| fix-today | "at 9:00 AM", "Evening · from 5:00 PM", "Now · 9:00–11:00 AM", "3:00 PM Review…", "since 9:43 AM" | Stale |
| polish | Snoozed rows "back Tomorrow · 9:00 AM" | Stale |
| paper-capture 11e / 11h | The chips are all there, only re-worded ("Thu 8 Oct · 11:59 PM", "Today · 5:00 PM"). The meta reads "read 9:52 AM". | Stale. The detail line printed only "Task" because the rest wrapped onto the next lines of stdout. |
| fix-inbox | "Sat 17 Oct · 3:00 PM", "Voice · Thu 9:14 PM", phone chip "Sat 3:00 PM" | Stale |

Every harness edit changes only the wording and carries a short comment pointing at lib/clock.

## 3 · Numbers

Harness results on :5270, each suite run alone:

| Suite | Result |
|---|---|
| tray-notices | 59/59 |
| event-reminders | 37/37 |
| plan-replan | 103/103 |
| fix-today | 116/116 |
| polish | 63/63 |
| paper-capture | 122/122 |
| fix-inbox | 69/69 |
| calendar-rail | 101/101 |
| cal-polish | 229/229 |
| today-shell | 86/86 |
| today-scale | 330/330 |
| snooze | 74/74 |
| task-sheet | 150/150 |
| time-slots | 153/153 |

Gate:

- `tsc -b`: clean.
- vitest: 2348/2348 in each of the 4 time zones (Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo).
- lint: 0 errors.
- build: ok.
- ds:check: 0 new.
- `birthday_on` grep: 1 in `types.ts`, and 1 `birthday_on: false` in `settings.ts`.

## 4 · Round 2: the suites flagged in §4 of the first pass

The coordinator's run on :5270 gave `today-phone` 138/160, `search-design` 60/62 and `google-sync` 97/101. `event-detail` (70/70) and `calendar-phone` (180/180) were already fine.

### Real bugs, fixed in the app

- **Phone Today, Up next event row.** The time column was 56px, sized for "15:00", so "3:00 PM" wrapped onto two lines ("3:00 / PM"). The time now stays on one line, and the column is 70px on the 12-hour clock so the lavender rules still line up (`today.css` `.tp-ev-time--12h`, `PhoneEventRow`). The harness now also asserts the one line.
- **Desktop Today, goal card meta.** `deskBlockMeta` lower-cased every item, which was meant for 2a's durations, so the range read "1:30–3:00 pm". A time now keeps the clock's AM/PM (`TodayPage.tsx`).
- **Settings ▸ Integrations, synced line.** en-GB's own 12-hour form wrote "synced 12 Oct, 9:48 am". `syncedLabel` is now the date followed by lib/clock's time, and `githubState` shares it (`settings/api.ts`, with a test).
- **Snooze menu.** The preset times used the device's locale (`[]`), so an Arabic phone would get Arabic digits. They now use `en-US`, like every other time (`SnoozeMenu.tsx`).

### Stale wording or layout, harness updated

- `today-phone`: the times "1:30–3:00 PM", "you'll finish ~7:00 PM", "Done 11:05 AM", "Evening · 7:30 PM", "all three done by 4:10 PM" and "Now · 9:00–10:30 AM".
- `today-phone`, today-scale's split: five section labels, with "Today's tasks · 1" plus "Also open · N" where "More for today · 3" used to be. In 2n the fold's Open is 3, because the task due today leads in Today's tasks.
- `today-phone` 2n's EARLIER · MORNING and LATER · EVENING: these are the Routines section's own fold lines (`.tp-sub.tp-fold-line`), not part of the Also open fold. The harness already filtered them out, so this is intended.
- `search-design`: "Tomorrow 3:00 PM" and "Sat 11 Jul · 3:00 – 3:45 PM". A past event says "Past · Tue 30 Jun" with no time, by design (`searchView`).
- `google-sync`: "12 Oct, 9:48 AM".

### Results, each suite run alone

| Suite | Result |
|---|---|
| today-phone | 160/160 |
| search-design | 62/62 (one run timed out loading the design-export file, then passed on the rerun) |
| google-sync | 101/101 |
| fix-today | 116/116 (re-run, since Today changed) |
| today-shell | 86/86 (re-run) |
| today-scale | 330/330 (re-run) |
| snooze | 74/74 (re-run) |

The gate was green again: `tsc -b` clean, vitest 2348/2348 in each of the 4 time zones, lint 0 errors, build ok, ds:check 0 new, and the `birthday_on` greps 1 and 1.

`calendar-rail` line 701 ("13:00 – 14:00") is still in a branch the default run doesn't reach.
