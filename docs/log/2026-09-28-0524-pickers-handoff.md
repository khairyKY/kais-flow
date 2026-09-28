---
date: 2026-09-28T05:24Z
session: pickers builder (E)
type: handoff
related: design-export/DS-CHANGELOG.md §3 (Date picker sheet, Time picker sheet, Bottom sheet, gesture↔tap parity, Android Back) · MK Date Picker / MK Time Picker · July leftover FIX-7 / J-25
---

# Pickers handoff (Wave M): our date and time pickers replace every native one

Branch `claude/pickers`, cut from `origin/claude/wave-l` (e94032e). `origin/claude/wave-l` was merged back in later (f853572 toast docking, 62db1fc docs). Nothing merged into master, nothing deployed. `lib/overlayStack.ts` is untouched. No new dependencies and no date-picker library.

## What changed

- **`components/pickerMath.ts`** (pure, tested). Days are `YYYY-MM-DD` keys on the Cairo calendar and times are `HH:mm` Cairo wall-clock. The calendar math runs on UTC dates, so the device zone and DST never touch it. Instants go through `lib/dateShortcuts` and `eventTime.cairoToIso`.
  - `monthGrid`: Monday-first. Blanks before the 1st, then the next month's first days (drawn faint) to fill the last week, as MK draws it.
  - Day helpers: `shiftDay` (clamps 31 Jan + 1 to 28/29 Feb), `quickPicks`, `atDay` (a picked day lands at 09:00 Cairo unless a time is set).
  - Calendar helpers: `daysWithItems` (the dots), `busyOnDay`, `busyAt`, `freeSlots`.
  - Constants: `QUARTERS` (now also TimeField's list), duration chips and their labels.
  - Quick picks: Today, Tomorrow and Next week **are** `scheduleToday`, `scheduleTomorrow` (tomorrow 09:00, never now+24h) and `scheduleNextWeek`. This weekend is the coming Saturday.
- **`components/DatePicker.tsx`**: the MK Date Picker.
  - Phone: a full-height `BottomSheet` with the title plus a mono meta line, and 6 × 52 quick picks built from the ActionSheet row CSS (a ✓ marks the current value).
  - Month header Source Serif 18 with prev/next 48. Weekday row mono 12, 24 tall. Day cells 48 × 44 with a 40 circle.
  - Today has a 1.5px `--acc-terra-ink` ring. Selected is filled `--acc-lavender-text` with a parchment digit. Days with items get a 4px `--ink-faint` dot.
  - Footer: Set time (secondary) + Done (primary).
  - Desktop: the same content in a `kf-overlay-card` popover through `Float`. Arrows move, PageUp/PageDown change the month, Enter picks, Esc and an outside click close it.
  - Accessibility: `role="grid"` with labelled `gridcell`s, `aria-selected` and `aria-current="date"`.
  - Picking: a quick pick commits and closes. A day tap only selects, and Done commits it. Done on an unchanged value writes nothing.
  - Set time switches the same sheet to the time stage for that day, and Back/Esc goes back to the month (`useEscapeStack`). The time stage's Done returns the combined instant, plus the duration if it changed.
  - Also exports `DateField`, a form field (a button that opens the picker, as a popover under the field on desktop). Value contract: `YYYY-MM-DD`, or `""` when cleared.
- **`components/TimePicker.tsx`**: the MK Time Picker.
  - `TimePanel` holds the content. "Free on your calendar" pills are 48 tall; the selected one is `--block-lavender` with a 1.5px inset `--acc-lavender-text` ring. The "Every 15 minutes" rows are 48 tall in Courier 15.
  - Busy rows show in `--ink-faint` and stay selectable. The meeting's chip sits on its first row. The selected row is `--block-sage` with a ✓.
  - Duration chips (15m–2h) show only when the caller has a duration. The list opens with the value, or 09:00, as its third row.
  - `TimePicker` is the phone sheet.
  - Free/busy comes from the cached `['calendar_events']` query and the dots from the cached `['tasks']` + events. Neither opens a request of its own. The demo passes sample arrays instead.
- **Kit additions:**
  - `BottomSheet` gains a `footer` slot (§3: 12/16/28 padding, dashed top rule).
  - `ActionSheet` exports its row CSS so the quick picks reuse it.
  - `ContextMenu` no longer closes when a scroll happens *inside* it. The time list lives in a submenu, and scrolling it used to close the menu.
- **Every native picker swapped.** `grep type="date|time|datetime-local"` in `app/src` now finds only comments. Callers keep their value contracts.
  - `ScheduleMenu` is now a thin wrapper around `DatePicker` (quick picks + Set time). It is what ⋯ → Pick date…, the swipe's Pick date, the bulk bars and the phone task sheet's Schedule open.
    - It takes the task's `due_at` as `value`, so the current day is preselected and its quick pick ticked.
    - It shows No date when the task has a date: new `TaskMenuActions.clearDate`, which is `rescheduleDue(task, null)`.
    - The task sheet also passes `duration`. Time and duration land in **one** row write, because a second `setDuration` write would be overwritten by the stale row.
  - `SnoozeMenu` (Inbox): "Pick a date…" opens the picker titled "Snooze until" (no quick picks, Set time available).
  - `formFields.DateInput` (task editor + QuickCreate) → `DateField`. `TimeInput` passes `day`, so the phone sheet gets that day's free slots.
  - `NewProjectModal` target date → `DateField`. The project work-log date → `DateField` with `max` = today and no clearing (the old `max` rule, kept).
  - `NewRoutineForm` reminder time → `TimeField`.
  - `TimeField` keeps its typed text + list on desktop. On a phone it is read-only (no keyboard) and opens the time sheet.
- **Demo:** `components/KitPickersDemo.tsx` on the dev-only `/design-system` ("Pickers — date & time").
  - It uses the real DatePicker, TimePicker, DateField and TimeField over MK's sample day: free 09:00–09:30, 11:00–12:00 and 14:30–16:00, with a Standup at 09:30.
  - All state stays local, and the sample data is built inside the component so it tree-shakes out of `dist/`.

## Evidence

- **Gate** (no `app/.env.local` in the worktree), after merging `origin/claude/wave-l`:
  - `npx tsc -b` 0 errors.
  - `npx vitest run`: 64 files / 839 tests under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (base 63 / 812).
  - `npm run lint` 0 errors, 25 warnings, none in the new files.
  - `npm run build` ok. The demo strings ("Lunch with Omar", "Quarterly review", "Call the bank about the mortgage", "Pickers — date", KitPickersDemo) are absent from `dist/`, and the picker itself (`kf-pk-day`) ships.
- **New tests:** `components/pickerMath.test.ts` (27).
  - Month grid: Sep 2026 as drawn, Monday/Sunday starts, 4- and 6-row months, the year edge, leap Feb.
  - Day math across month, year and both 2026 DST switches.
  - `atDay` in summer and winter, and on the first day after each switch.
  - Quick picks: the MK hints; the Cairo day, not the device day; Saturday; across the October fall-back; Tomorrow = `scheduleTomorrow`.
  - The dots ignore done and deleted items.
  - Busy blocks: all-day and `busy:false` events are not busy; midnight clipping; the fall-back day's wall clock.
  - Free slots: MK's three; a longer duration skips short gaps; today starts at the next quarter; a past day has none; limit; quarter snapping.
- **Browser checks:** Playwright + system Chrome, 390×844 touch (`isMobile`) and 1280 mouse, day + night. Everything is in `docs/log/assets/pickers/`.
  - `verify.mjs` on `/design-system`: **122/122**.
    - Sheet and layout: the full-height sheet is 796 tall, the quick picks are in MK order at 52 each, and Tomorrow's hint reads "· 09:00" with a ✓ for the current value. Serif 18 month, 48 nav, weekday row mono 12 at 24, Monday-first grid, 44 cells with 40 circles.
    - Token colours: today ring, lavender selection with a parchment digit, 4px dots on the sample days, terra-ink Done.
    - Date flows: next month; tap selects and Done commits at 09:00; Tomorrow / Someday / No date commit at once.
    - Time stage: header "Time · Tomorrow · …"; the three MK slots (48 tall), the 09:00 pill and row selected, rows 48 in Courier 15, opening with the value as the 3rd row. The busy 09:30 row is faint with the Standup chip and stays selectable. Duration chips 15m–2h, 32 tall, 30m selected.
    - Back and Done: Back returns to the month, then closes with nothing written. Done returns day + 14:30 + 45m in one pick.
    - Standalone time sheet: the 45m duration drops the 30-minute gap.
    - Fields: the date field uses day-only hints; the phone time field is read-only and opens the sheet.
    - Desktop: a popover inside the viewport. Focus starts on the selected day; → and ↓ move; PageDown/PageUp change the month; Enter picks 09:00; Esc and outside click close it.
    - Desktop Set time: the time panel swaps in, and scrolling it keeps the popover open. Esc goes back to the month, a second Esc closes.
    - Desktop fields: the date field's popover sits under the field; the typed time field keeps "4:45 pm" → 16:45.
  - `verify-pages.mjs` on **real pages**: **106/106**. Signed in against a mocked backend with gestures' harness (dev server pointed at `127.0.0.1:9`, a made-up session, Playwright answering REST and recording writes), browser zone Africa/Cairo.
    - Tasks: ⋯ → Pick date… gives the full sheet with the task title as meta, the quick picks including No date, and Today ticked. Day + Done writes `due_at` = that day 09:00 Cairo. The swipe's Pick date opens the same sheet, and Tomorrow writes tomorrow 09:00 Cairo.
    - Today: a Top 3 ⋯ → Pick date… shows today's dot. Set time shows "Today · …", the Gym block as a busy row with its chip, and 09:00 selected. A free-slot pill + Done writes that time.
    - Task editor (phone): Schedule → Set time shows the chips with 30m selected. 14:30 + 45m lands as **one** row write.
    - Inbox snooze: Pick a date… opens the "Snooze until" sheet/popover, and the pick writes `snoozed_until` = day 09:00 Cairo.
    - New project: the target date works as a sheet (This weekend) and as a popover (Today). Esc closes the picker, not the modal.
    - Project work log: only Today, no No date, future days disabled.
    - Routine reminder: phone = read-only field → time sheet (no day, so no slots), 07:30 → "7:30 AM". Desktop = typed list, "6:15 am".
    - Desktop Tasks: right-click → Pick date… → popover, focus on the task's day, → → Enter writes today+2 09:00.
    - Desktop editor: Due date popover, and the Due time keeps its typed list.
    - No native date/time input on any of these pages, and no page errors.
  - Screenshots:
    - `docs/log/assets/pickers/`: `{phone,desktop}-{day,night}-{date,time}.png` and `phone-{day,night}-{date,time}-field.png`.
    - `docs/log/assets/pickers/pages/`: Tasks, Today, editor, Inbox, project and routine, phone + desktop, day + night.

## Deviations

- **Next week = the app's Next week.** MK draws "Next week · Mon 5 Oct" on Sunday 27 Sep. The app's one Next week (`scheduleNextWeek`: the `3` key and the planning board) is the coming Monday, which on a Sunday is tomorrow (Mon 28). I kept the app's. Any other weekday matches the drawing. Kai's call if Sunday should mean the Monday after.
- **Quick picks commit at once; a day tap selects, then Done.** The DS doesn't say which. This keeps "Tomorrow" at one tap, as before, and gives the grid's Done a job. On desktop, Enter on a day picks it (select + Done).
- **The full sheet's header shows ✕.** MK draws no ✕, but the BottomSheet row ("full … header gains ✕") wins.
- **Set time swaps the sheet's content** to the time stage instead of stacking a second sheet. It is one sheet, and Back goes to the month first. This matches "Back closes the top layer first … picker → sheet" without a double scrim. On desktop the popover does the same.
- **Free-slot window is fixed at 08:00–20:00** (`ponytail:` in `pickerMath`). There is no working-hours setting yet. Gaps shorter than 30 min (or than the caller's duration) are dropped, at most 4 pills are shown, and pills snap to the quarter grid so each one is a list row.
- **Quick picks on field callers:** DateField (editor, QuickCreate, project target) shows Today / Tomorrow / This weekend / Next week as day values, plus No date when set. The work-log date shows only Today (its `max`). Inbox snooze shows no quick picks, because the snooze menu already offers its own.
- **Snooze's picked day now lands at 09:00 Cairo** (it was 09:00 device time). That is the same for Kai. It follows `pickedDay`'s rule.
- **The task editor's desktop date field is still read in device-local time** (`localDateKey` / `localToIso`, unchanged): the value contract was kept, per the brief. The phone sheet path is Cairo, like `ScheduleMenu` before.

## Risks / not done

- **Free/busy and the dots read the TanStack cache only.** A cold start that never loaded `calendar_events` (e.g. /routines opened first after clearing storage) shows no slots or busy rows. It is not wrong, just empty. A per-day query would fix that if it ever shows up.
- **Real-device feel is not checked on hardware:** haptic tick on day and time picks (`lib/haptics.tick`), Android Back through `useEscapeStack` on the time stage, IME not opening on the read-only phone time field. Headless Chrome with `isMobile` confirmed `readOnly`, but not an actual keyboard.
- **The desktop popover's height is re-measured every render** to clamp and flip it above a low field. It is cheap, but it is a layout read per render while open.
- EventDetailsPanel's inline start/end `TimeField`s get the phone sheet without a `day`, so they show no free slots. The panel is desktop-first. Passing the event's day is a one-line follow-up.
- There is no `docs/log/INDEX.md` line and no ROADMAP edit (the conductor adds them).
