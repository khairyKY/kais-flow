---
date: 2026-10-25
session: today-days (builder, worktree .claude/worktrees/today-days, branch claude/today-days, from v1.4.1)
type: handoff
---

# 2026-10-25 03:30 · handoff · today-days

Kai (2026-10-23): "what if the user wants to view the next day or a random day of the calendar, he doesn't want to be stuck to the today page". He picked **arrows ‹ › and a date picker on the Today page**, to look at and plan tomorrow or any day — its tasks, its blocks, its plan — with a clear **Back to today**.

Everything is on `claude/today-days` and pushed. It is not merged: no PR, **no migration** (0084 left free). Every check ran against a mocked backend.

## 0 · The flow map (before code)

How four mainstream apps move off "today", and what it costs:

| App | Where other days live | See tomorrow | Jump to a date | Plan a future day | A past day |
|---|---|---|---|---|---|
| Sunsama | Today is one column of a day board; ‹ › step days, the date opens a calendar, a Today button returns | 1 (›) | 2 (date → day) | drag tasks into that day's column; its own planned list | the column, done struck |
| Akiflow | Today, plus a separate Upcoming list; the calendar's day view has ‹ ›, T = today | 1 (Upcoming) | 2–3 (calendar picker) | set the date / drag onto the day | the calendar's past events; a Done log |
| Things 3 | Today and Upcoming are separate lists; no arrows on Today; past = Logbook | 1 (Upcoming, first group) | 1 + scroll | set "When" | Logbook, grouped by day |
| TickTick | Today list; the calendar's Day mode has ‹ ›, a swipe on the phone, the title opens a month picker | 1 (› / swipe) | 2 (title → day) | set the date | completed shown with a toggle |

**Our cut.** No second view: Today itself steps. See tomorrow **1** (›). A day this month **2** (the date → the day — the picker's new `browse` mode goes on a tap, no Done). Another month **3** (date → next month → day). Back **1** (Back to today, the Today tab, the sidebar's Today, or Shift+← back).

**States**

- **Today** — unchanged. Desktop: ‹ › sit under the date, ahead of the summary line (beside the date they pushed 2a's capture pill onto a row of its own at 1280). Phone: the title keeps its words and opens the picker; a strip under the bar reads "‹ Yesterday · 📅 · Tomorrow ›".
- **A future day** — the date bar + "5 tasks · 2 on the calendar · 1 of 3 planted"; the Now card becomes the day's ribbon (no now line) with its plain events; **"Tuesday's three"** = the evening ritual's seeds for that date (☆ on any of its rows plants, ★ takes out, a fourth is refused with a toast, Undo on each); **"Tuesday's tasks · N"** (open, due or on its calendar that day, in time order, the full row grammar); its routines read-only; the rituals become one quiet line ("Tonight's Shut down starts from these three." for tomorrow); the add pill opens capture on `<Nov 3 2026 `.
- **A past day** — "2 done · 1 left open · routines 2/3"; the ribbon; **Done** (that day's picks first) whose ✓ reopens with Undo; **Left open** with **Move ▾** (the Plan list); **The day's line** (its journal entry); routines ticked, read-only. No rituals, no stars, no pill.
- **Navigation** — `?day=YYYY-MM-DD` (a reload keeps it; history is replaced, so Back still leaves Today); **Shift+←/→** (plain ←/→ is the Calendar's, Alt+← the browser's Back, Ctrl/⌘+← a word jump; listed in the `?` cheatsheet). **No page swipe on the phone**: every Today row owns the sideways swipe (SwipeRow: right = tomorrow, left = let go) and the screen edge is Android's Back.
- **Ribbon / Up next** — another day's ribbon draws that day's blocks; each item once: a task drawn as a row carries its block's time, the calendar list has the rest.
- **Routines** — that day's (scheduled or ticked that day, never one created after it), not tickable off-day.
- **Rituals** — today-only: hidden on a past day, a quiet line on a future one; the phone's ⋯ Today menu (the rituals) shows only on today.

## 1 · Decisions

1. **One seeds model.** A future day's 3 are `ritual.seeded` rows with `for_date` = that day (`seedPayload(now, forDate)`, `setSeed(…, forDate)`). The morning ritual on that day pre-selects them, and planting tomorrow from Today is the same as planting it in tonight's Shut down (its Tomorrow's 3 shows them). Not the star: starring a task dated later pulls it to today (`toggleTop3`), and `releaseTop3` strips a star off a later day.
2. **Seeds read further ahead.** The seeds query read only rows created in the last 3 days, so a seed planted for Nov 3 on Oct 25 would vanish by its morning. It now reads `or(created_at ≥ 3 days ago, payload->>for_date ≥ today)`; `seededTaskIds` still filters by date. Older mocks ignore `or` (a superset), so the rituals harness is unaffected.
3. **The day view is `OtherDay`**, inside `TodayPage.tsx` (it reuses that file's rows, ribbon and sections); `TodayPage` is now a wrapper: `?day=` other than today → `OtherDay`, else the old page (`TodayView`) with only its header changed. The pure half — which day, what belongs to it, names — is `dayView.ts`, tested in four zones.
4. **`DatePicker` `browse`**: a tap on a day picks it at once and a past value opens on its own month. Quick picks (Today · Tomorrow · This weekend · Next week) stay.
5. **Calendar →** links `/calendar?date=YYYY-MM-DD`: the phone calendar opens on that day; the desktop calendar doesn't read `?date` yet (one-line follow-up).
6. **Known ceilings.** A repeating task shows only on its next due date (future occurrences aren't rows); a block's task that is done or not that day's still shows in the calendar list. Selection / bulk keys aren't on other days.

## 2 · Files

- `app/src/features/today/dayView.ts` (new) — `viewDay`, `dayNoon`, `dayBounds`, `isOnDay`, `futureTasks`, `pastTasks`, `dayBlocks`, `dayHeading` / `dayName` / `dayWord`, `captureFor`.
- `app/src/features/today/dayView.test.ts` (new) — day scoping in Cairo / Tokyo, DST days, seeds per date, the capture `<date` parse.
- `app/src/features/today/TodayPage.tsx` — the wrapper + `useDayNav`, `DayHead`, `PhoneDayStrip`, `DayPickButton`, `OtherDay`, `PastRow`, `DayBlockItem`; `Ribbon` `day`, `TaskRow` `star`, `RoutineRow` `readOnly`, `AddTaskPill` `prefill`, `PhoneBar` rituals optional.
- `app/src/features/today/today.css` — the nav styles (existing tokens only; no colour changed).
- `app/src/features/rituals/loopDay.ts`, `api.ts` — `forDate` on a seed; the wider seeds read.
- `app/src/components/DatePicker.tsx` — `browse`.
- `docs/log/assets/today-days/verify.mjs` + screenshots.

## 3 · Gate

GATE_PLACEHOLDER

## 4 · Screenshots (`docs/log/assets/today-days/`)

- Desktop: `d-day-today.png`, `d-day-tomorrow.png`, `d-day-tomorrow-planted.png`, `d-day-picker.png`, `d-day-past.png` (+ the same `d-night-*`).
- Phone: `p-day-today.png`, `p-day-tomorrow.png`, `p-day-tomorrow-planted.png`, `p-day-picker.png`, `p-day-past.png` (+ `p-night-*`).
