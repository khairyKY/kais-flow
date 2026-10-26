---
date: 2026-10-26
session: typing (builder, worktree .claude/worktrees/typing, branch claude/typing, from v1.5.0)
type: handoff
---

# 2026-10-26 04:53 · handoff · typing

Queue items 15 and 16 (`D:\Coding\_claude-cloud\kais-flow-queue-2026-10-23.md`). Everything is pushed to `claude/typing`. No migration. Browser checks ran against the dual-stack mock server on :5313.

## 16 · Type durations, times and ranges

**The reader.** `features/command-bar/typedTime.ts` (`readTyped`, `applyTyped`, `typedEcho`).
- It reads "50m", "1h20", "1:45", "7:10 pm", "7–8:30", "noon" and "in 2h", plus "7pm 45m", "11-1pm" and "7pm to 8:30".
- It uses the quick-add's own reader:
  - `parseCommand`'s length token, now exported as `readDuration`. The token also takes "1h20" (the app's own label) and "50min", so quick-add gains them too.
  - chrono, through `parseCommand`, for the words ("tonight at 8", "7.30pm").
- The clock digits are read here, because chrono reads "7" as 7 AM:
  - On the 12-hour clock, an hour without am/pm takes the half of the day nearest the block. With no block, it takes the half nearest now.
  - In a range, an end without am/pm is the first one after the start.
  - On the 24-hour clock, it reads as typed.
- Times are on the user's clock (`appZone`). The device zone never matters.
- A bare "h:mm" is a clock time, except in a field that only takes a length, where "1:45" is 1h45 and "45" is 45 minutes.

**The field.** `components/TypedTime.tsx`.
- It echoes what it understood as you type ("7:10–8:30 PM · 1h20", or "19:10–20:30 · 1h20" on the 24-hour clock).
- Invalid input says why ("Didn't catch “banana” — try …", "It ends before it starts", "That runs past midnight") and sets `aria-invalid`.
- Enter applies it. Enter on something invalid writes nothing.
- All writes are the surfaces' existing outbox helpers, with Undo: `retimeEventWithUndo`, `moveEventWithUndo`, `scheduleTaskWithUndo`, `setDuration`.
- The pickers all stay.

**Where it is:**
- **Desktop block popover:** under the title, above the length chips.
- **Time ▸ panel, phone Time sheets, the date picker's Set time:** at the top of the shared `TimePanel`. Enter applies it, as Done would.
- **Plan ▸ Pick date & time ▸ Set time:** for one task, a range sets the length (the Duration chip's write) and then the time.
- **Task editor:** in the Schedule card.
  - A time or range puts the block there: on its own day, else the due day, else today.
  - A length is the length.
- **The Duration list** (task sheet chip, popover chip, row menu): a typed length, on desktop and phone. `ActionSheet` grows a `header` prop for this.
- **Desktop quick create:** under the When row (popover), and under From — to / Duration (full page).
- **Phone quick create:** in its time chip's Time sheet.

**Tests.** `typedTime.test.ts` covers lengths, times and ranges on both clocks, what each kind of field takes, nonsense, and the echo. It runs in all four zones.

## 15 · One place to set a length

The rule: on the calendar, the length lives with the block; off the calendar, a length chip is the estimate. It is the same on desktop and phone.

**Removed or merged:**
- **Desktop block popover:**
  - The Time row's **Duration submenu** is gone (15m Quick · 30m Short · 1h Standard · 2h Deep · Custom…).
  - Time ▸ now opens the time panel directly. The panel sets the start and draws no Duration chips (`lengthChips={false}`).
  - The length chips under the title are the popover's one length control.
- **The Time sheet under a surface that has its own chips** draws no Duration chips. Its typed field still takes a range. This covers:
  - the phone task sheet's Change time;
  - the phone block sheet's Time row;
  - phone quick create's time chip.
- **The phone task sheet's ⏱ chip** is hidden while the task has a timed block (`TaskChips length={false}`). The card's Length row is the length.
  - Off the calendar, or on an all-day block, the chip stays as the estimate.
  - The date chip already read the block's start (bugs-1023).
- **Kept as the one control:**
  - **Desktop task popover:** it has no block card, so its ⏱ chip is the only length control. It sets the block's length when the task is on the calendar (`setDuration` → `lengthenTaskBlock`).
  - **Editor:** the Duration chips.
  - **Desktop quick create:** the length chips. Its time fields set start and end.
  - **Phone Schedule sheet:** its Time sheet's chips are the only length control there.

## Gate

- `npx tsc -b`: clean.
- `npx vitest run`, run four times through PowerShell `$env:TZ` (Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo): each run 183 files, 2552 tests, all passed.
- `npm run lint`: 0 errors. The warnings are all `only-export-components`, as before.
- `npm run build`: OK.
- `ds:check --baseline`: 0 new (32 fixed since).
- `grep -c birthday_on app/src/lib/types.ts` = 1; `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.

## Harnesses (one at a time, mock :5313)

- **typing (new, `docs/log/assets/typing/verify.mjs`): 101/101.**
  - Desktop: t1 the block popover (12h); t2 Time ▸; t3 the popover's Duration list and Plan ▸ Pick date & time; t4 the editor; t5 quick create; t6 the 24-hour clock.
  - Phone: p1 the task sheet on the calendar (12h and 24h); p2 the task sheet off the calendar; p3 the block sheet; p4 quick create.
  - Day and night.
- **bugs-1023: 108/108**, after updating its stale expectations:
  - p1 changed the length through the sheet's ⏱ chip. It now uses the card's Length row and checks that the chip row has no ⏱ chip.
  - p2 read the ⏱ chip. It now reads the card.
- **task-sheet: 150/150**, after one stale expectation: 4a's chip row no longer lists '30m' (that task is on the calendar).
- **event-detail: 70/70**, after updating a2 and b3: they picked "Short" / "Standard" in the Duration submenu and now use the popover's Length chips (30m / 1h).
- **Unchanged and passing:** cal-polish 229/229 · cal-looks 107/107 · cal-wave 224/224 · time-slots 153/153 · pickers 122/122 · calendar-phone 180/180.
- The server is stopped.

## Left open

- A date in typed words ("tomorrow 3pm") is dropped. The field sets a time on the thing's own day (a `ponytail` note in `typedTime.ts`).
- A range in Plan ▸ Pick date & time makes two writes with two toasts. The last toast's Undo takes back the time but not the length.
- The editor's Duration chips still ring `duration_min`, not the block's length (as before this branch).
