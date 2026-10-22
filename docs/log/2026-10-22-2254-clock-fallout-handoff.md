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

## 4 · Not run, likely stale the same way

These suites outside this round still assert 24h text. They were already stale after cal-polish:

- `today-phone` 2b: "Now · 09:00–10:30".
- `search-design`: "15:00 – 15:45".
- `event-detail`, `google-sync`, `calendar-phone`: the sheet rows "10:30 – 11:30", "12:00 – 12:20".
- `calendar-rail` line 701: "13:00 – 14:00", in a branch the default run doesn't reach.
