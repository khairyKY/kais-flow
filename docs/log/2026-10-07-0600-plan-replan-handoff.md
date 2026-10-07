---
date: 2026-10-07T06:00+03:00
session: builder plan-replan (Kai's feedback, 2026-10-07)
type: handoff
related: supabase/migrations/0055_top3_order.sql · docs/DATA_MODEL.md (0055 note) · docs/log/assets/plan-replan/
---

# Plan / Replan, the goal of the day, the Top 3's order, the user's weekend

Branch `claude/plan-replan`, cut from `origin/master` (71675dd, v1.0.21) rebased onto v1.0.22 (14ca8ff) when master moved mid-session (one import conflict in `TasksPage.tsx`: `CaptureCta` kept), then **merged with `origin/claude/wave-u` twice** at the coordinator's request (v1.0.22 + calendar-rail; then sounds + tasks-noise + a fix) — see “Merged with wave-u” below. A feedback wave, not a ROADMAP phase. Not merged, not deployed. One migration: **0055**.

## What was agreed (verified, kept)

Top 3 picks, and **the first pick is the goal of the day** (gold card): SCREENS-2026-09-28 §Plan ruling 4, `ritualLogic.ts` `withPick` / `swapIn` (a 4th star shows the swap toast; the goal stays), Today's `goal = first`. Kai remembered "3 main tasks and a fourth, the goal of the day" — **that memory is wrong**; the goal is one of the three. Nothing about the model changed; he now gets the button.

## 1 · Make goal of the day

- **Where:** the shared task menu (`taskMenuSpec` / `TaskMenu`: right-click, ⋯, the phone action sheet), the task sheet's ⋯, and Plan my day's pick list ("☆ Make goal" on every pick that isn't "✶ Goal"; also in those rows' ⋯). Hidden on the goal itself and on done rows.
- **What it does** (`makeGoalWithUndo`, pure rules in `features/today/top3Order.ts` `planMakeGoal`): the task leads the Top 3 and the rest keep their order. Not in the Top 3 and fewer than 3 open picks → it joins. Three open picks → the existing swap toast ("Top 3 is full — swap out “<last pick>”?" · Swap), and the pick that leaves is the last open one that isn't the goal; the old goal stays, second. "Goal of the day · Undo" (Undo puts every touched row's star, place and someday back, logging the star/unstar it reverses).
- Plan my day's Make goal moves the pick to the front of the draft (an unpicked row joins first; into a full three through the same swap toast); Start the day writes the order.

## 2 · Order the Top 3

- **Desktop:** drag a row onto another's place (`@dnd-kit/core`, mouse only so touch keeps its swipes); dropped on the goal card it becomes the goal (with the goal toast). The click that ends a drop is swallowed so it doesn't open the task.
- **Keyboard:** Alt+↑ / Alt+↓ on the focused Top 3 row (↓ / ↑ focus a row as before). Up into first place = a new goal.
- **Phone:** Move up / Move down in a Top 3 row's ⋯ sheet (no new gesture). Desktop menus show them too, with ⌥↑ / ⌥↓ keycaps.
- A finished pick doesn't move and nothing moves below it.

## 3 · The goal and the order sync (0055)

- `goalStore` was **device-local** (`localStorage` `kf_goal_task_id`, written only by Plan my day). The phone, which never ran the ritual, fell back to "the first row", and that followed the list sort — Kai's 16:18 screenshot (the goal went from "Crypto" to "Read 2 pages" after he moved blocks).
- **`tasks.top3_rank smallint`** (0055): a pick's place, 1 = the goal. Every write goes through the outbox; only rows whose place changed are written. No check constraint, no unique index (0052's reason). `TASK_COLUMNS` reads it.
- **Order rule** (`orderTop3`): ranked rows by rank (Kai's order, once set); unranked ones after them by their block start (unscheduled last), then star time. **With nothing ranked:** the goal is this device's old localStorage pick if it is in the Top 3 (read-only now), else **the first pick starred** (star time from the `task.starred` log — `useStarEvents` now reads the open picks too), and the rest by block start. Never Today's list sort.
- A star joins with no place (last); an unstar clears it; completing keeps it, so a finished goal stays the goal (R4); a spawned repeat and a duplicate start unranked. Old builds and unranked rows render by the fallback.
- Today, the tray flyout / tray Start focus, and Tasks' ✶ Goal chip all read the same `dayTop3` / `goalIdOf`.

## 4 · One Plan menu (Replan when overdue)

- **One list** (`features/tasks/PlanMenu.tsx`, pure `planMath.ts`) replaces the menu's Tomorrow + Pick date…: **Today** · **Next free slot** · **Tomorrow, first thing** · **This weekend** · **Next week** · **Pick date & time…** (· Someday · No date where the old picker had them). Each row: the label, one plain line of what it means, and where it lands on the right ("THU 8 · 09:00"). The dated ones are `quickPicks`, so its one-per-day dedupe holds. The current day is ticked.
- **Where:** the menu's first entry ("Plan…", **"Replan…"** when the task is strictly past its date — the overdue rows anywhere: Today's overdue fold, Tasks' Overdue tab, Plan my day's carry-over), the swipe's middle action (renamed **Plan**), the task sheet's date chip, the bulk bars (Today, Tasks, project pages — now **Plan**, the selection's list, no free-slot finder), a someday row's "Plan ▾". `PlanMenu` is exported so the calendar's new side rail can open it (`<PlanMenu task position actions onClose />`).
- **Today:** today at the task's own time if its date had one, else 09:00 ("today, keeps its 15:00" / "today, no set time"). The `1` key does the same now.
- **Next free slot** ("ASAP: the first free gap that fits — you confirm"): the phone Schedule sheet's own slots (`phoneGridMath.scheduleSlots` — `busyOnDay` + `freeSlots`, 08:00–20:00, not before now; up to three today, else the next days' first gaps; the calendar's Plan ▾ "Next free slot" is the first of them), for the task's length (`duration_min`, default 30), its own blocks not counted. Shows "Today 14:30–15:00" with **Confirm** · **Another time** (the next candidate; after the last, Pick a time…) · **Cancel**. Confirm is a **timed replan** into the slot (`rescheduleDue(task, start, true)` — calendar-rail's rule moves its block there, or places one) and toasts "Planned · Today · 14:30–15:00 · Undo".
- **Tomorrow, first thing:** tomorrow 09:00 — the app's one Tomorrow (swipe right, the `2` key, the bulk bar). An Up next block's menu says "Tomorrow, same time" (its block moves a day), as before.
- **Replanning never leaves a block stuck in the past** — calendar-rail's rule (`features/calendar/replan.ts`, through `rescheduleDue`, every due change): a time puts the task on the calendar there (its block moves); a date alone keeps a block already on that day and takes any other off; no date takes them all off; a missed due follows a block placed today or later. The Plan menu passes the date picker's `timed` (Pick date & time… with a time set = timed), from the ⋯ / right-click submenu, the task sheet and every bulk bar. Every Plan pick toasts with Undo (`rescheduleDue`'s own exact Undo).
- Tasks' "Reschedule all to today" uses the same Today rule and gains Undo.

## 5 · The user's weekend

- **Settings → Calendar → Weekend:** Fri + Sat · Sat + Sun · Sun only · Custom (seven day toggles). `app_settings.weekend_days smallint[]` (0055), 0 = Sunday, default Sat + Sun. Read through `lib/weekend.ts`.
- **This weekend** = the next day that starts a run of weekend days (today counts): Fri + Sat → Friday; on a Saturday → next Friday. Used by `quickPicks` (so every date picker), the Plan list and its hint ("the first day of your weekend (Fri + Sat)").
- The phone gets the Calendar card (Opens on moved into it from Appearance).

## 6 · What each shortcut means

Every Plan row carries its line. Settings → Calendar has "What the plan shortcuts mean" (`planGlossary`), naming the user's weekend.

## Added mid-session by the coordinator (Kai's phone screenshots)

1. **The goal changed by itself** → §3: synced rank, and the unranked fallback is the first pick by star time, not by block time.
2. **Top 3 order looked random** → §3: Kai's order once set; unranked non-goal picks by block start, unscheduled last.
3. **"More for today · 320"** → Today splits it: an **Overdue · N** fold (folded by default, the count and **Replan all ▾** on its header, oldest first, 50 shown + View all → Tasks' Overdue tab) and More for today with the rest. Replan all is the Plan list for all of them, plus **Spread into free slots** ("6 today · 1 tomorrow"): in order, each task takes the first free gap today that fits its own length (each placed one counts as busy for the next; their own stuck blocks don't); what doesn't fit goes to tomorrow, first thing. A preview lists where each lands; Confirm writes it all with one Undo. Today / Tomorrow / This weekend / Next week / Pick date & time / Someday each apply to the whole pile with Undo.
4. **Goal card on a 390 phone** → the meta never wraps (one line, ellipsis at worst) and under 420px the clover steps aside.

## Merged with wave-u (calendar-rail, then sounds + tasks-noise)

### calendar-rail

Conflicts in `tasks/api.ts`, `useRowGrammar.tsx`, `TaskRow.tsx`, `ProjectDetailPage.tsx`, resolved toward one rule:
- **Calendar-rail's replan rule is the one rule.** My own past-block clearing in `rescheduleDue`, `planSlot` and `restorePlan` are gone; every Plan write calls `rescheduleDue` (timed where a time is chosen) and uses its Undo.
- **`timed` is threaded through** `PlanActions.schedule`, `TaskMenuActions.schedule`, `BulkActions.onSchedule` and every bulk bar (Today, Tasks, project pages, and now the planning board, whose bulk Schedule opens the Plan list too). So calendar-rail's `setTimeOf` fallback ("any time but 09:00 was set by hand") is **deleted**, with its test; the flow test's desktop-submenu case now passes the flag.
- **Next free slot** reuses `scheduleSlots` (my `pickerMath.freeStarts` is deleted).
- The calendar's own Plan ▾ (`CalendarPage.tsx`, calendar-rail's) was left as it is — not mine to edit. Its **Tomorrow first thing places a block** at tomorrow's first free gap (from 08:00); the Plan menu's **Tomorrow, first thing** is the app's one Tomorrow (09:00, date-only — the task waits in tomorrow's list). See “For Kai to decide”.
- The evening Sweep's un-roll now restores a block the roll took off (calendar-rail's `rollUndo`), so that follow-up is closed.

### sounds + tasks-noise

Conflicts in `BulkBar.tsx`, `SwipeRow.tsx`, `TaskMenu.tsx`, `taskMenuSpec.test.ts`, `tasks/api.ts`, `useRowGrammar.tsx`, `TodayPage.tsx`, `TasksPage.tsx`, `ProjectDetailPage.tsx`, `PlanningBoard.tsx`, `SettingsPage.tsx`:
- **Both kept:** the Plan list (Plan… / Replan…, swipe "Plan", the bulk bars' "Plan") beside tasks-noise's **Move to…** (MovePicker, `moveTasksWithUndo`; swipe and bulk "Move"). The phone Settings has both new cards (Calendar, Sound).
- **One bulk write:** my `planWithUndo` / `somedayWithUndo` are deleted in favour of tasks-noise's `rescheduleTasksWithUndo` (now also behind a single task's Plan pick, with `timed`) and `somedayTasksWithUndo`. Today's Replan all uses them too.
- **sounds:** the "big" completion sound's goal now reads the synced goal (`goalIdOf`), not the old device-local store.
- `tasks-noise/verify.mjs`: its phone bulk-bar expectation reads "Plan" instead of "Pick date" (intentional).

## Evidence

- Unit (vitest, PowerShell `$env:TZ`, offsets checked): Africa/Cairo / UTC / America/Los_Angeles / Asia/Kolkata — **107 files, 1296 tests** each (master had 103 / 1237). New: `lib/weekend.test.ts` (each preset across a week, custom, labels), `today/top3Order.test.ts` (order + fallback incl. the 16:18 case, display, rank writes, moves, Make goal + swap, dayTop3 / goalIdOf), `tasks/planMath.test.ts` (the list, hints, dedupe for every preset × 7 days, Today's time, spread), `tasks/api.plan.test.ts` (past-block clearing / keeping, slot move / place, Undo, Make goal + swap + Undo, Move up/down), `pickerMath.test.ts` (+ `freeStarts`, weekend-aware `quickPicks`). `taskMenuSpec.test.ts` updated for the new menu.
- `npm run lint` → 0 errors (no new warnings). `npm run build` → ok.
- Browser (`docs/log/assets/plan-replan/verify.mjs`, Playwright + system Chrome, mocked backend, `npm run dev -- --mode mock --port 5271`): **HARNESS_COUNT**. Desktop 1280 and phone 390, day and night; screenshots + `verify-results.json` beside it.
OLD_HARNESSES

## Deviations

- The Plan list keeps **This weekend** and **Next week** in a selection's Replan all (the coordinator's list named Today / Tomorrow / Spread / Pick a date / Someday); one list everywhere.
- **More for today still holds future-dated and undated open tasks** (Today lists the whole open garden by the 2026-09-26 decision, and the sidebar badge counts it). Only the overdue ones moved out. Narrowing it to due-today is a one-line filter if Kai wants it.
- Phone Custom weekend toggles are 48 tall but ~44 wide (seven in one row on a 390 card).
- The phone's calendar 7g sheet still shows its own three free slots (not mine to touch); the Plan menu's finder is a sibling on the same math.
- A Plan pick now toasts "Planned · … · Undo" where it used to be silent (Today / This weekend / Next week from a single task).

## For Kai to decide

1. **"Tomorrow, first thing" = 09:00.** There is no day-start setting; the nearest is the morning reminder time (`morning_digest_at`, 08:00 by default), which is when Plan my day pings you, not when the day's work starts. Using it would move every Tomorrow (swipe, `2`, bulk) to 08:00. Kept 09:00; a "My day starts at" setting would be one column + one row in Settings.
2. **Next week = Monday** (as before), even with a Fri + Sat weekend, where the week arguably starts Sunday. Say if it should follow the weekend.
3. **Two "Tomorrow, first thing"s.** The calendar rail's Plan ▾ puts the task on the calendar at tomorrow's first free gap (a time); the Plan menu everywhere else sets tomorrow 09:00 as a date (the task waits in tomorrow's list, Akiflow's rule). One of them should change.
4. **This device's old goal pick** still leads while nothing is ranked (so the computer that ran Plan my day keeps its goal through the upgrade). The first Make goal / reorder / Start the day replaces it everywhere.

## Follow-ups (not built — other builders own these)

- The **command bar's "this weekend"** (capture parser) still means Saturday; it should read `lib/weekend.ts` (`weekendDays()` + `daysToWeekend`).
- The **calendar's "show weekends" toggle** still hides Sat + Sun; it could hide the user's weekend instead.
- The calendar rail's Plan ▾ (`CalendarPage.tsx`) could open `PlanMenu` (one list, with the hints) instead of its own four items; then its Tomorrow and this one agree.

## Risks / for the conductor

- **0055 must be pushed before this build ships:** `TASK_COLUMNS` selects `top3_rank` and every task write carries it (the release's `db push` runs first, as usual).
- Shared files touched: `tasks/api.ts`, `TaskMenu.tsx` / `taskMenuSpec.ts`, `useRowGrammar.tsx`, `TodayPage.tsx`, `TasksPage.tsx`, `SettingsPage.tsx`, `pickerMath.ts`, `DatePicker.tsx` (exports its `Popover`), `BulkBar.tsx`, `SwipeRow.tsx`, the tray; after the merge also `calendar/replan.ts` (setTimeOf removed), its two tests, and `calendar/PlanningBoard.tsx` (bulk Plan). Not touched: `CalendarPage.tsx`, `PhoneCalendar.tsx`, `EventDetailsPanel.tsx`, `PhoneSheets.tsx`, the command bar.
