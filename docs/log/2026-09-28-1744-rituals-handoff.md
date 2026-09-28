---
date: 2026-09-28T17:44+03:00
session: Wave N builder G (the two rituals)
type: handoff
related: design-export/SCREENS-2026-09-28.md §Plan.dc.html 6a–6m · §Shutdown.dc.html 8a–8h · §Decisions → Plan my day (rulings 1–8) · Shut down (rulings 1–6) · design-export/DS-CHANGELOG.md §3
---

# The two rituals: Plan my day and Shut down, one sheet each

Branch `claude/rituals`, cut from `origin/claude/wave-m` (0e7bad1). Not merged, not deployed. Builder H's files (TaskEditorPage, task-open routing, App.tsx) untouched.

## What changed

- **Pure logic, tested** (`features/rituals/ritualLogic.ts` + 29 tests, 4 time zones):
  - `carryRows` / `carryMeta`: Carry-over is Tasks' Overdue list. Rows keep their place after a choice moves them off "overdue". Meta reads "From yesterday" or "Overdue 64d" on Cairo's calendar.
  - `pickCandidates`: order is last night's seeds, then starred, then due today, then the rest of the week, capped at 4 (a pick is always shown). Carried rows are never listed twice.
  - `withPick` / `swapIn`: three picks at most. A 4th returns "full" and the screen shows the swap toast.
  - `suggestTimes`: every pick gets the earliest start from 09:00 (or the next quarter after now), before 18:00, that fits before the next busy block. Accepted slots and earlier suggestions count as busy.
    - "after Deep work" when a slot starts as an event ends.
    - "Runs past 18:00" only when nothing follows the slot.
    - If no start is free, the slot is "No free slot".
    - A pick already on today's calendar keeps its block.
  - `planWorkload`: the calendar still ahead, clipped to 09–18, plus the picks.
    - "~5h planned · you'll finish around 14:00".
    - "you'd finish" plus "Xh over" once over capacity or past 18:00.
    - "~9h of meetings · the 3 picks don't fit".
    - "Nothing planned yet · the day is open".
  - `planStatus`: "1 of 3 decided" mid carry-over; otherwise "3 picked · 2 timed" or "0 picked".
  - `captureMeta`: "Voice · last night 23:10", "Typed · Fri".
  - `resumeMeta`: "~1 min left · Pick your 3 next".
  - `sweepRows`: Today's own plate. Rows touched here stay listed.
  - `tomorrowSuggestions`: due tomorrow, then today's leftovers (Top 3 first; they read "Left today" even once rolled), then due this week.
  - `closeDay`: which tasks to seed, which seeds to take back, and which starred sweep rows roll.
- **Plan my day** (`MorningRitual.tsx`, rewritten; same `onClose` prop, so Today, Routines and Focus are unchanged):
  - **Container.** Phone: a full-height kit `BottomSheet`. ✕, Back and a swipe down close it and keep progress. Desktop: a centred 1080 panel in two columns, with "Esc closes · keeps progress" (`RitualChrome.tsx` `RitualSheet`). The kit stays at phone size on desktop.
  - **Carry-over.** Kit task rows: check, star, ⋯, plus the row grammar (swipe right = Tomorrow, left = Drop).
    - Second line: the kit Segmented [Today | Tomorrow | Someday] (new, local to rituals) and a ghost terra **Drop**.
    - Choices apply at once and stay on the row: `rescheduleDue` to today or tomorrow 09:00, or `setSomeday`.
    - Drop moves the task to Trash with "Moved to Trash · Undo". No confirm.
    - "Roll all to tomorrow" is in the section header.
  - **Inbox.** No checkbox. Capture meta, a tappable project chip (parsed project → `ProjectPicker`), ghost Dismiss and secondary File. Both use the existing inbox writes with Undo.
  - **Pick your 3.**
    - Seeds come pre-selected with the sprout "Seed".
    - The first pick is gold "✶ Goal".
    - Starring a carried row picks it in place and sets it to Today.
    - A 4th star shows "Top 3 is full — swap one out?" with **Swap**.
    - "All tasks >" opens Tasks.
  - **Suggested times.**
    - The 09–18 mini timeline and legend (calendar lavender, suggested dashed sage, accepted sage, being changed = focus ring).
    - Each row: a time pill that opens our `TimePicker`, and a ✓ in a 40 circle, filled once accepted.
    - **No time** is now the Time Picker's footer ghost (`onClear`, new optional prop). The picker's meta names the task.
    - No free slot, or No time, turns the row into a secondary "Pick one".
  - **Footer.** The workload line (amber and "Xh over" when over), a mono status, and **Start the day**.
  - **Start the day** writes the picks through `top3Diff` + `toggleTop3`, sets the goal (first pick), puts the accepted times on the calendar (`scheduleTask`), logs the steps and `ritual.finished`, and closes.
  - **6f.** Empty sections collapse to one line. "Clear morning — pick your 3." gets an input: `createTask`, due today, becomes a pick.
  - **6m.** Each section finished on the sheet logs its step, reusing the morning ids overdue · inbox · top3 · block. Closed half-way, Today's ritual card reads "Morning · 2 of 4 done · ~1 min left · Pick your 3 next" with Resume and the hairline.
- **Shut down** (`EveningRitual.tsx`, rewritten; CRLF kept; night first):
  - **Sweep.**
    - Checkbox = Done: the row stays, struck, with Undo. A second tap reopens it.
    - The secondary **Tomorrow** toggles: selected shows sage and a check, and the meta gains "→ Mon 09:00". A second tap puts the old date back.
    - Swipe right = Tomorrow (`SwipeRow` can now take Tomorrow alone). There is no left swipe, no ⋯ and no star.
    - Long-press selects. The sheet footer becomes "N selected · Tomorrow · Done". Back leaves selection before the sheet.
    - "Roll all to tomorrow". With nothing to sweep it reads "Everything tended ✿".
  - **One line.**
    - The last two journal lines show in Caveat (`--ink-faint`) with mono dates.
    - Save writes a journal entry (and `journal.line_added`) and shows "Saved to journal ✓" with Edit.
    - Edit updates the same entry.
  - **Tomorrow's 3.**
    - Seed rows: star, title and why. No checkbox, no ⋯.
    - Pre-starred with tonight's seeds, else the first three suggestions. The first is "✶ Goal".
    - A 4th star shows the swap toast.
    - Seedling plus "Planted for Monday — the morning plan opens with these ✿".
  - **Close the day** does these in order:
    1. Writes an unsaved line.
    2. Plants and takes back seeds (`setSeed`).
    3. Rolls starred open sweep rows to tomorrow 09:00.
    4. Logs sweep · line · seeds · goodnight and `ritual.finished`.
    5. Quiets the garden.
    6. Shows the summary: clover, "The garden's closed.", "See you in the morning ✿", mono stats, **Goodnight**. It closes itself after ~3s, and Today shows "Day closed ✿ · 3 seeds planted for Mon".
  - Header sub-line: "Sun 27 Sep · 4 done · 2h 10m focused".
- **Today** (`dayPhase.ts`, `DayCard.tsx`, `useDay.ts`):
  - From **17:00** the card offers Shut down. It was 18:00, and 17:00–18:00 showed Now.
  - The Resume card meta follows 6m. `Day.steps` carries the logged steps.
  - `RITUAL_STEP_COUNT.evening` 5 → 4. The old "garden" beat is gone.
- **Deleted:** the four-step morning wizard (overdue list, star list, inbox list, dnd-kit hour grid) and the five dusk beats (sweep card, sun dial, line card, seeds, goodnight). Also removed: `RLink`, `Pill`, `CtaButton` and the module-level `lineDraft`. Replaced by `useDraft` (`rituals/api.ts`): per loop day, in localStorage `kf.ritual.plan` / `kf.ritual.shutdown`.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 66 files / 905 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (base 65 / 876; +1 file, +29 tests in `ritualLogic.test.ts`; `dayPhase.test.ts` updated to 17:00).
  - `npm run lint`: 0 errors, 24 warnings, none in touched files.
  - `npm run build`: ok.
- **Browser** (`docs/log/assets/rituals/verify.mjs`): **155/155**.
  - Setup: Playwright with system Chrome and real CDP touch, on the real `/today` page against builder D/F's mocked backend. The dev server ran with `VITE_SUPABASE_URL=http://127.0.0.1:9`. The mock keeps writes for the scene, so refetches see them, and the checks read them. The clock is fixed to each scene's Cairo time.
  - Phone 390×844 touch, day: 6a, 6b, 6c, 6d (two frames), 6e, 6f, 6j, 6l, 6m (card + resumed), 6k (390×1540), 8g.
  - Phone night: 6i, 8a, 8b (+ bulk), 8c, 8d, 8e (summary → Today), 8h (390×1200).
  - Desktop 1280×800, day + night: 6h, 8f.
  - Each phone scene also checks: no horizontal scroll, no text under 12px in the sheet, every control ≥ 40 tall (48 hit), and no page errors.
  - Writes asserted:
    - A carry-over choice's due date.
    - Drop goes to Trash.
    - Start the day: the Top 3 set, two calendar blocks at Cairo 10:30 / 12:30, the goal id, `ritual.finished`.
    - Sweep: roll, un-roll (old date back), done, bulk done.
    - The journal line, and Edit updating the same row.
    - Seeds for 2026-09-28.
    - Starred sweep rows rolled on close.
  - Screenshots:
    - `6a…6m`, `8a…8h`, desktop `6h-desktop-{day,night}` and `8f-desktop-{night,day}`.
    - `side-plan-6*.png` / `side-shutdown-8*.png`: design frame | build in the same state, for 20 frames.

## Deviations

- **Shut down from 17:00.** Kai's rule: after 17:00 Today offers Shut down, and Plan my day stays today's plan. 6g "Plan tomorrow" is not built. `SHUTDOWN_FROM` moved 18:00 → 17:00, so Today Phone 2i's quiet line now holds until 17:00.
- **Picks and accepted times are a draft until Start the day** (brief 06: "Start the day writes the picks and accepted times"). Carry-over and Inbox choices write at once. The draft survives ✕, Back, a swipe down and a reload for that loop day.
- **Step ids reused.** Plan's sections log the old morning ids: overdue = Carry-over, block = Suggested times. The activity copy for them still reads "review overdue" / "time-block your day".
- **Suggested-time placement is earliest-fit.** The sample lands differently from the drawing: the call goes 12:30–13:00, before lunch, not 14:00.
- **Workload numbers are computed, not the drawing's samples.** For example, 6e's data gives "30m over", not "2h over". "Over" = max(planned − what's left of 09–18, a slot running past 18:00). An 18:00 gym is not workload.
- **"→ starred" in the suggestion order adds nothing.** Every open star is already on today's plate, so it counts as a leftover. 8c's "STARRED" row can't occur with real data; the harness shows due-this-week instead.
- **Swap** puts the new pick in the last seat. The goal (first) always stays.
- **Toasts dock at the top while a sheet is up** (the v1.0.9 kit rule), not above the footer as drawn in 6l and 8d. For their 6s they cover the sheet's ✕; Back and a swipe down still close it.
- **The summary sheet shows the kit sheet's ✕** (the full-height header). 8e draws none.
- **The Time Picker's free-slot pills are the kit's own** (08–20 around the calendar). They can differ from the plan's 09–18 suggestions.
- **Desktop at 1280** with the app's UI zoom: the panel fills the width and scrolls. The drawing is 1440×900 with no scroll.
- **Not built (not drawn):**
  - Long-press select on Plan rows. They have swipe and ⋯ from the row grammar.
  - The Sweep's bulk bar lives in the sheet footer.
- **Project dots are moss for every project.** The drawing colours them per project.
- **Tapping a row body opens `/tasks/:id`.** That leaves Today, so the sheet closes and progress is kept. Builder H's task sheet may change this.
- **The night's line is dated by the loop day** (Cairo, 04:00 rollover). A 00:30 line lands on the day being closed.

## Risks / not done

- **Not checked on hardware:** sheet swipe-down with long content, the Segmented's 40px segments on narrow phones (fine at 390), haptics.
- **Logged steps stay.** A section completed mid-plan and then undone still counts toward "N of 4". The draft is only cleared by Start the day or Close the day. Otherwise it lives until the loop day turns.
- **Stale check:** `docs/log/assets/today-phone/verify.mjs` asserts "Closing · 1 of 5" when Shut down opens. That copy no longer exists.
- **Desktop Day card copy unchanged:** "Plan your day · ~5 min" / "Begin".
- No `docs/log/INDEX.md` line and no ROADMAP edit (parallel builders; the conductor adds them).
