# phone-today handoff — 2026-10-26 20:05 (Cairo)

Branch `claude/phone-today` (worktree `.claude/worktrees/phone-today`), from `claude/kai-bugs-1012` at `b99d4293`. Not merged, not released.

Kai picked the phone home: **B · Now + next** as Today's default on a phone, with a switch to a **Day** view. The Day view was first C (the sideways day strip); mid-build Kai turned C down and picked **Day view 4, "Day bar"**, so C was never built beyond plumbing and the Day bar went into its slot. Desktop Today is unchanged.

- B spec: `design-export/Phone home options.html` (today-looks worktree), handoff `2026-10-26-1720-today-looks-handoff.md`.
- Day spec: `design-export/Day strip options.html` direction 4 (daystrip-looks worktree), handoff `2026-10-26-1804-daystrip-looks-handoff.md`.

## What was built (phone widths only, < 768)

**The top lines (both views).** The date bar as before (the title opens the date picker). The Yesterday / Tomorrow line carries the **Now · Day** switch in the picker icon's place (Day strip options 4). It is the kit `Segmented`, remembered per device in `localStorage['kf-phone-today-view']` (`now` | `day`). It is a view preference, so there is no migration. Another day (`?day=`) keeps its picker icon and has no switch.

**B · Now + next (default).**
- The calendar's own Now card (`calendar/NowCard`, new `variant="today"`, which has its own fold key `kf.todayNowFolded` and is open by default), flat inside one panel, and **Then**: the next two blocks the card doesn't already show, drawn in palette C (`phoneView.ts thenBlocks`). A task block opens its task; an event opens it on the calendar.
- The smaller paper goal: `GoalCard slim`, with tape, gold box, a serif title on up to two lines, the gold stamp `✶ Goal of the day · 1:30–3:30 PM`, and the clover.
- Settings-style rounded panels (`.tp-pn`, settings.css `.st-panel`'s look):
  - **Top 3 · 3h 50m planned** (#2 and #3, numbered).
  - **Today's tasks · N**. Back-from-snooze still leads it.
  - One **Overdue + Also open** panel. Each is a row that folds open in place, remembered under the old fold keys; Replan all stays on Overdue; Slipping and From a while ago stay inside Also open.
  - **Rituals**: Morning and Evening (Begin or Continue while it's their time; this is where the old Plan my day card's way in now lives), plus a Routines n/m row that goes to /routines.
- Rows are one 44 px line (`TaskRow slim`): [n] check · title (ellipsis) · project dot · one fact · labels · ⋯. The fact is one of: Back from snooze, Overdue Nd, the block's start ("Now" while it runs), the Time slot, Due today (· ↻), the length, or ↻. The star moved into ⋯ and the swipe. The check, open, swipe, hold-to-select, ⋯ menu, subtask nest and ids (`task-<id>`, `.tp-goal`, `data-tour="top3"` / `task-row` / `plan`) are the same as before.
- The NOW slip stays only for what the calendar card can't draw (over, paused, just done).

**Day (Day bar).** `DayStripView.tsx` takes the Now panel's place. The rest of the page is B.
- The whole day, 7 AM to 11 PM, in one bar:
  - blocks are pills in palette C;
  - an overlap drops to a thin second lane (`phoneView.ts barLanes`);
  - the goal's block is underlined in gold;
  - a sun at the morning digest time (default 7:30) and a moon at Shut down's 5 PM;
  - a lavender tick for now;
  - 8am / 12pm / 4pm / 8pm under it (24h when the clock is 24h).
- **Next** · time · title · countdown under the bar ("Now" while one runs). Tapping it opens the block.
- Tapping the bar (or ⌄) opens **the calendar's own Day column** for today: `/calendar?date=<today>&view=day`. `PhoneCalendar` now honours `view=day` over the Settings default view (3 lines). No new column was built.

**Removed from the phone Today** (both designs remove them):
- the Plan my day card (Begin is now on the Rituals panel, and still in ⋯ and via `?ritual=morning`);
- the Day N workload line, its progress hairline, and its amber "2H OVER" over-capacity warning (the offline chip still shows when offline);
- the Up next list (a task with a block today is a row in its list, carrying the block's time);
- the inline routines list (now the Routines row).

## Files
- `app/src/features/today/TodayPage.tsx`: the phone branch rewritten; `TaskRow slim`, `GoalCard slim`, `PhoneFolds`, `useFold` (shared with `MoreForToday`); dead phone parts removed (`PhoneSummary`, `PhoneEventRow`, the routine split).
- `app/src/features/today/PhoneHome.tsx` (new): `usePhoneView`, `ViewSwitch`, `NowPanel`, `BlockLine`, `RitualsPanel`.
- `app/src/features/today/DayStripView.tsx` (new): the Day bar.
- `app/src/features/today/phoneView.ts` (+ test, new): the view key, `thenBlocks`, `barLanes`.
- `app/src/features/today/today.css`: the phone home block at the end. Tokens only; no colour changed.
- `app/src/features/calendar/NowCard.tsx`: exports `hueVars`; adds the `'today'` variant.
- `app/src/features/calendar/PhoneCalendar.tsx`: `?view=day`.
- `docs/log/assets/phone-today/`: `verify.mjs`, `results.json`, shots `B-*` / `Day-*` at 360 / 390 / 430 by day and night, and `Day-open-390-day.png` (the bar tapped).

## Checks
**Gate.**
- `gate.ps1`: vitest 185 files / 2568 tests in Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo, plus Asia/Kolkata run by hand: all green.
- lint 0, build OK, ds:check 0 new against the baseline.

**`docs/log/assets/phone-today/verify.mjs`: 41/41.** Run as `node verify.mjs <out> http://localhost:5321` against the mock server, on today-looks' sample day (Mon 26 Oct, 10:40).

Tasks fully on screen (inside the scroller, above the tab bar):

| | 360 | 390 | 430 |
|---|---|---|---|
| B (target ≥ 7 at 390) | 5 | **7** | 9 |
| Day (target ≥ 9 at 390) | 7 | **9** | 9 (every task on the page) |

The old phone Today showed 3 at 390.

What the harness checks:
- B renders at 360, 390 and 430: the Now card, two Then blocks, the goal, the panels and Rituals.
- The switch goes to Day, survives a reload, and goes back to Now.
- The Day bar renders at all three widths: 6 pills, the goal underline, the now tick, and "Next 11:00 AM Lecture — Computer Vision in 20m". The Now card is gone and the rest is B.
- The switch sits in the picker's place, and the title opens the date picker.
- Tapping the bar opens `/calendar?date=2026-10-26&view=day` on the Day column, even with Week as the calendar's default view.
- Completing a task in B and in Day struck the row and wrote `status: done` through the outbox.
- Tapping a row opened the task, and Morning · Begin opened Plan my day.
- No sideways page scroll and no page errors at any width, by day or night.

Shots in the same folder: `B-` and `Day-{360,390,430}-{day,night}.png`, plus `Day-open-390-day.png`.

**Existing harnesses that touch Today.** 30 ran: everything with phone Today selectors, plus the phone and calendar suites. The mock server was on :5321, and a baseline server on :5322 ran my branch point `b99d4293` for comparison.

Green, or green when re-run alone after a flake under three-lane load:
- today-shell 86, motion 48, undo-verbs 88, typing 101, bugs-1023 108, calendar-phone 180;
- fix-tasks 70, task-sheet 150, cal-wave2 84, snooze 74, first-run 416, calendar-rail 101.

Retargeted to B, now green (the harnesses' own phone checks pointed at removed UI):
- **rituals 210/210**, the same as the baseline. It opens the rituals from the Rituals panel instead of the Plan card, and its card checks read the panel rows. It also waits out the Undo toasts, which float over the low panel.
- **fix-today 115/115.** The phone P section now checks the Rituals Begin, the Now card's "Ongoing · 1h20m left", and that the workload line is gone. The event opens on the calendar from the Now card.
- **day-truth 49/49.** At 00:30, Rituals · Evening offers Shut down.
- **today-scale 330/330.** The Also open fold is B's panel group. The fold buttons are named "Also open · N" / "Overdue · N".
- **today-days 90/90.** The strip has the switch, not the picker icon.
- **small-gaps 154/154.** The first-Today hint now sits under B's Now panel, which is always there. Row labels are kept on the slim row (see below).
- **tour 41 checks green.** The ghost-swipe copy is checked through `.tp-slim-t`. Its last step, waiting for "Show me around again", times out on the baseline too (Settings moved).

Failing by design, not retargeted:
- **today-phone.** This is the old Today Phone 2a–2n harness: the header workload line, the ritual card, Up next and the routines list. It stops at its first check (`.tp-ritual`), so none of its later checks ran. B replaces all of it, and `phone-today/verify.mjs` covers the new screen.
- **subtasks**, 1 check out of 47: "Up next has the timed subtask by itself". The phone has no Up next list now; the timed subtask is a row with its time.

Pre-existing failures, the same on the baseline:
- **plan-replan**: 2 desktop date checks.
- **cal-blocks**: a timeout on the Fern swatch.
- **labels, user-tz**: the old `#settings-*` anchors. user-tz was retargeted upstream after my branch point.
- **gestures/verify-pages, phone-taps, night, loop-a/r2**: harness setup (a bare `playwright` / `playwright-core` import, or a different argument order).
- **phone-polish**: 654 PASS and no FAIL before the runner's 8-minute cap. The baseline also hit the cap.

## Notes
- Row labels: Kai's B drawing shows one fact per row. I kept the label chips (Kai added them to rows; the labels check in small-gaps covers them) inside the row's meta, which is capped at 46% of the row. Drop them if B should be strict.
- The workload line's over-capacity warning ("2H OVER") is gone with the line, both drawings dropped it. If Kai wants it back, it belongs on the Now panel.
- The density counts are rows wholly inside the scroller and above the tab bar. On the sample day, the open subtask under "Prepare the DL study group" is one of them. Subtasks unfold by default app-wide (Kai's subtasks A), and B's drawing showed it folded. In B at 390 that row is the 7th; folded, B shows 6 top-level rows plus the subtask count.
- The whole Day bar is one tap target. A pill also opens its own block, but pills are 12 px tall, so on a phone the bar tap usually wins. The design's "drag a task onto the bar" and "swipe the bar for Yesterday / Tomorrow" are not built.
- Kai's B drawing had the switch absent. It now sits where the Day strip page proposed, in both views.
- The worktree's `app/node_modules` was installed with `npm ci`, and `app/.env.mock.local` was added for the mock server. Both are untracked.
