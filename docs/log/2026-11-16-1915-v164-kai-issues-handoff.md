# v164-kai-issues handoff (2026-11-16)

Branch `claude/v164-kai-issues` (from `claude/kai-bugs-1012` bcc8f228), four commits, one per issue. Kai's list is
"2026-11-07 — issues reported" in `_claude-cloud/kais-flow-queue-2026-10-23.md` (items 1, 2, 3, 4, 6; item 5, the calendar add UI, is design-first and not in).

Each issue was reproduced in the mock app before the fix (harness run on the base code: 5 of 12 checks on issue 1, a closed popover on
issue 2, 6 of 12 on issue 3, 4 of 11 on issue 4), then fixed where every surface routes through.

## 1 · Today: "Also open" removed (c7361f26)
`app/src/features/today/TodayPage.tsx`: the desktop `AlsoOpen` section and the phone "Also open" fold are gone, with `alsoRows`, `openCount`,
`ALSO_OPEN_FIRST`, `MORE_OPEN_KEY`, the `PhoneFolds` Also open half (now `PhoneFold`, Overdue only) and the `MoreForToday` default label.
Rows that are no longer drawn are no longer selectable (Ctrl+A / bulk) or in the Cmd+Up/Down reorder lists: `selectable` is the Top 3, the
Up next tasks, Today's tasks and Overdue. Left alone on purpose: the Android home-screen widget still shows "Also open N"
(`widgets/snapshot.ts alsoOpen` feeds `Render.java` and the widget layouts), which is native work for its own task.
Harnesses that drove the fold were updated (motion-lists C1 removed, manual-order and phone-today comments).

## 2 · Task editor stays open; Plan order (706c4a21)
Cause (found by planning and sending to Someday a task near the end of a long, scrolled Tasks list on desktop): the write re-flows the
list, the page scroller clamps and fires a scroll event, and `TaskPopover` closed on any scroll or resize behind it. Kai sees that as
"an action sends me back to the page". The popover now follows its row (re-measured on scroll/resize, last place kept if the row left)
and closes only on Esc, a click outside, Delete or Open full. The phone sheet and the full editor page never closed on an action; both
were checked across Plan (every choice), Pick date & time, Priority, Remind and Label with no close. If Kai still sees it on his phone,
the trigger is something the mock cannot show (real backend timing); ask which page and which action.
Plan menu: `planMath.planOptions` puts "Pick date & time…" first (one source for the row menu, the sheet, the popover, the editor and
bulk), and Settings' `planGlossary` matches. Tests: planMath.test (order, glossary, `find` by key instead of `[0]`).

## 3 · Tasks grouping (c91b0b75)
`tasks/grouping.ts bucketOf`: a task on today's calendar is in Today whatever its due date; the `scheduled` group, key and
"Scheduled on calendar" label are gone. Tests: grouping.test (blocked-today goes to Today for overdue, due-today and undated; one Today
group with the time total; tomorrow's block stays in Tomorrow).

## 4 · Now / Next card over the grid (6d1ad739)
`NowCard.useNowReserve(ref, on)` publishes the card's height as `--kf-now-h` on the page root. Phone: `.pc.has-now .pc-scroll` pads by it
plus two `--sp-3`. Desktop (rail folded, the float): `.cal-main.has-now-float .fc-scroller-liquid-absolute` pads by it plus `--sp-4`.
Folded, open or gone, the day's last hour scrolls up clear of the card. Nothing in CalendarGrid.tsx / CalendarGrid.css (the multi-day
builder's files); CalendarPage.tsx has a hook line, a class and one CSS rule. With the rail open the card is docked in the rail and never
overlapped the grid. The card still floats over the day tray's left end on desktop when the tray is open (it is not the timetable).
No unit test: it is DOM-only and the repo has no DOM test environment; the harness covers it.

## Checks
- `docs/log/assets/v164-kai-issues/verify.mjs` (mock backend :5257, Wed 21 Oct 2026 13:10 Cairo): 87/87 pass, phone 390x844 and desktop
  1280x800; screenshots and results.json beside it.
- Gate (vitest x4 TZ 2868 each, lint, build, ds:check 0 new): green. `birthday_on` 1/1.
- Re-run existing harnesses: phone-today 94/94, cal-wave n+r 37/37, manual-order 24/25 (t3 "a burst is one toast": the Ctrl+Z hint toast
  sits first in the mock; not Today-related), calendar-phone 179/180 (one toast-order check, the "Updated to v1.6.3" toast in the mock),
  plan-replan stops at "Goal of the day toast" (the Ctrl+Z hint toast is first, same noise), motion-lists C2 (sidebar Plan drawer) fails
  on its fold timing, not on anything touched here, today-days d-day fails on base too (checked). today-phone and today-scale describe the
  pre-redesign Today (no .tp-sum header, five section labels, Also open), so they fail on their own assertions.

## Not done / for Kai
- Widget "Also open" (see 1).
- Stale harnesses today-phone and today-scale still describe the old Today.
- A leftover `localStorage` key `kf.today.more-open` stays on devices; harmless.
