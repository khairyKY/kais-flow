---
date: 2026-09-28T18:05+03:00
session: Wave N builder H (the task sheet on the phone)
type: handoff
related: design-export/SCREENS-2026-09-28-sheets.md §Task Sheet.dc.html 4a–4n + §Decisions → Task sheet · design-export/Task Sheet.dc.html · DS-CHANGELOG §3 (Bottom sheet, Action sheet, pickers, Android Back)
---

# The task sheet: a phone opens any task over the page it was on

Branch `claude/task-sheet`, cut from `origin/claude/wave-m` (0e7bad1). Not merged, not deployed. Rituals (`features/rituals/*`, `DayCard.tsx`, `todayLayout.ts`) untouched.

## What changed

- **Opening a task** (`features/tasks/openTask.ts`, `useOpenTask`):
  - Phone (< 768px, read at the tap): `?task=<id>` is pushed onto the current address with `state.taskSheet`. `AppLayout` draws the sheet for that param (lazy chunk, 11.6 KB, warmed with the pages in `App.tsx`).
  - Closing the sheet (✕, scrim, swipe, Esc / Android Back via the overlay stack) pops that history entry, so Back never reopens it. Browser/WebView Back pops it too.
  - A cold link has no pushed entry, so closing just drops the param (replace).
  - Desktop still navigates to `/tasks/:id`, and the editor page is unchanged.
  - A phone that lands on `/tasks/:id` (a copied link, a cold start) redirects to `/tasks?task=<id>`: Tasks behind, the sheet open.
- **Every opener goes through it:**
  - Tasks rows (tap + Enter), which also covers Projects and Planning rows through TaskRow.
  - Today: Top 3 rows, the goal card, the NOW slip, Up next rows, the list's Enter.
  - Calendar: the event panel's Open task, and double-click.
  - Search: overlay and page. On a phone a task hit opens the sheet; desktop keeps the jump to the row.
  - Inbox: a filed capture's "open task →" opens its own task. It used to be a plain `href="/tasks"` that reloaded the whole app.
- **The sheet** (`features/tasks/TaskSheet.tsx` + `taskSheet.css`, 4a–4n):
  - **Title row:** check (22 in 48) · Source Serif 20/26 title · star · ⋯. The title is a textarea that looks like text at rest. Tapped, it becomes a field with the focus ring (4c). Enter / the keyboard's Done saves it.
  - **Chips, in this order:** date · duration · project · priority · repeat · remind · labels · "+ Label".
    - Kit parse-chip tones: date lavender, duration buttercream, project moss, priority terra. Repeat and remind use the lavender date chip. Labels are outlined pills.
    - An unset field is a dashed pill.
    - Each chip opens the row ⋯ menu's own picker (`TaskMenu` opened straight on that sub-picker): MK Date Picker (Tomorrow = tomorrow 09:00 Cairo), Duration, Priority, Repeat, Remind.
    - Project opens the 4d picker sheet.
    - "+ Label" is an inline dashed field. Tapping a label offers Remove label.
  - **Under the chips:**
    - A repeating task shows "Next · Mon 28 Sep 15:00 · then Tue 29" (the same rrule step completing uses).
    - Notes autosave on blur.
    - Subtasks show as "1/3". They check off in place with Done + Undo, and "Add a subtask" adds inline. All of this is hidden on a child task.
  - **Schedule on calendar:**
    - With a block: the buttercream card "On your calendar · Sun 27 · 15:00–15:30 · 30m". Tapping it opens the calendar.
    - Without one: Suggest a time (4m). Up to 3 starts on today's free time (pickerMath `freeSlots`) that fit the duration and end by the due time, the first drawn selected. One tap places the block (`scheduleTask`) and the section becomes the card.
  - **Focus pill** (open tasks): starts the session on this task and goes to /focus (`useStartFocus`).
  - **Footer:**
    - Left: "✓ Saved" (sage) for 1.5s after any edit made in the sheet, then "Edited HH:MM", or "Done 11:24". Offline with the row still queued it reads "○ Pending sync", and the chip that changed keeps its selected ring (4k).
    - Below that, "Created 21 Sep".
    - Right: Mark complete, or Done for today on a repeating task. On a done task, Reopen (secondary).
    - The footer hides while the keyboard is up.
  - **⋯ menu:** Duplicate (`plus` glyph) · Copy link (`send` glyph; copies `/tasks/<id>`) · Delete (terra, last, no confirm).
    - Delete: the sheet leaves first, then the row goes to Trash with its block, and the toast reads "Moved to Trash · Undo".
    - Duplicate: "Duplicated · Undo". Undo removes the copy.
  - **Other states:**
    - 4h (done): struck faint title, a sage "✓ Done · Sun 27 · 11:24" line, chips at full contrast.
    - 4i (loading): skeleton at medium when nothing is cached, with a disabled Mark complete.
    - 4j (not found): the fallen cherry, "This task was deleted on another device.", and Close.
    - Offline: the OfflineChip sits under the title.
  - **Every write goes through the existing helpers and the outbox:** renameTask, the notes writeRow, toggleTop3, rescheduleDue, setProject, setPriority, setRecurrence, setReminder, setDuration, setLabels, createTask (subtasks), scheduleTask, toggleTaskWithUndo, completeTaskWithUndo, reopenTaskWithUndo and deleteTasksWithUndo. The one new helper is `duplicateTaskWithUndo` in `tasks/api.ts`.
- **Pure logic, tested** (`features/tasks/taskSheetMath.ts` + 19 tests): `saveLine`, `createdLine`, `doneLine`, `dayWord`, `dueChip`, `remindChip`, `repeatLabel` (the menu's names, else rrule's words, e.g. "Every weekday"), `nextDates`, `blockLine`, `suggestTimes`, `suggestHint`.
- **Shared with the editor page, not forked:**
  - `features/tasks/useTaskDraft.ts` holds the title / notes / new-subtask commits. Both `/tasks/:id` and the sheet use it.
  - Notes now write only on a real change; before, every blur wrote the row.
  - The page's old phone branch (the Overlays §03 sheet, with its private Schedule/Duration/Notes rows) is deleted.
- **Kit:**
  - `BottomSheet`:
    - A `medium` sheet goes full while the keyboard is up (4c).
    - A full sheet with no title carries its ✕ in a 48px handle row (4b) instead of an empty 56px header.
    - `footer(close, keyboardUp)` may return null to hide.
  - `ProjectPicker` on a phone is now the 4d sheet:
    - "Project" + the task's title.
    - The search field doubles as create ("Create “Tyres”").
    - Each row has the project's hue dot, its domain on the right and a check on the current one. "No project · Inbox" sits under a dashed rule.
    - Tapping a row applies it and closes; there is no Done.
    - Desktop keeps the popover. `TaskMenu` routes the phone's Move to project through it, which replaces its plain ActionSheet list.
  - `TaskMenu` gains a Duration list for the chip.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 66 files / 895 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (+1 file / +19 tests: `taskSheetMath.test.ts`).
  - `npm run lint`: 0 errors, 25 warnings (same as base; none new in touched files).
  - `npm run build`: ok.
- **Browser** (`docs/log/assets/task-sheet/verify.mjs`: Playwright + system Chrome, real CDP touch, mocked backend as in builder D's recipe, clock at Sun 27 Sep 12:50 Cairo, every write recorded): **147/147**.
  - **Phone 390×844, day:**
    - **4a:** opened from a Tasks row over Tasks (`?task=`); 506 tall; the chip list in order with Repeat dashed; the title row's 48 targets. The star makes one write, then "Saved" → "Edited 12:50".
    - **4b:** a handle tap goes to 796, with ✕ in the handle row. Subtasks show 1/3; a subtask check writes + toasts "Done"; Add a subtask writes a child row. The block card line is checked. Focus → /focus.
    - **4c:** keyboard simulated through `visualViewport` (300px) → full height, bottom on the keyboard, footer hidden, title focus ring. Enter saves the new title.
    - **4n:** mid-drag the sheet follows the finger at 42%. Release closes it and pops `?task`. The notes edited before the swipe stay written.
    - **4m:** three slots, Today 13:00 · 14:00 · 14:30, before a 15:00 due. A tap writes a 14:00–14:30 block and the card appears.
    - **4d:** picker rows with domains and the current one checked; a second scrim. A row tap writes project + domain and closes, with Saved. Search → Create “Tyres” creates the project and moves the task.
    - **Chips:** date → Tomorrow 09:00 Cairo · duration 1h · priority P1 · repeat Weekly (next dates + Done for today appear) · remind 30 min before · + Label · Remove label. Each is a single write.
    - **4e:** ⋯ list and header. Duplicate writes a new open copy + toast. Copy link puts `/tasks/<id>` on the clipboard.
    - **4f:** Delete: sheet gone, `deleted_at` on the task and its block, "Moved to Trash" + Undo, the row gone from the list.
    - **4g:** "Every weekday", "Next · Mon 28 Sep 15:00 · then Tue 29". Done for today writes done + the Mon 28 15:00 occurrence, toasts Done and closes.
    - **4h:** done line, footer "Done 11:24", Reopen secondary, chips not dimmed. Reopen writes + toasts "Reopened", and the sheet stays.
    - **4i:** a cold `/tasks/:id` with REST held 6s → `/tasks?task=`, skeleton + disabled Mark complete, then filled in.
    - **4j:** not found over Today; Close drops the param.
    - **4k:** offline chip, "Pending sync", the date chip ringed after Tomorrow.
    - **Back:** history Back closes; Forward reopens; Esc (the overlay stack Android Back calls) closes and pops. A cold link + scrim tap lands on /tasks.
    - **Opened from** Today, Inbox, Calendar (block → Open task) and Search, each over its own page.
  - **Night:** 4l-a, 4l-b.
  - Every phone scene: no horizontal scroll, no text under 12px in the sheets, no page errors.
  - **Desktop 1280, day + night:** a row click still goes to the `/tasks/:id` editor page (no sheet). Its title saves on blur; a notes blur with no change writes nothing.
  - **Regression:** `today-phone/verify.mjs` against this branch: 153/153.
    - `gestures/verify*.mjs` fail 10 + 8 checks. Every failure expects the pre-"Start focus" ⋯ list, or a `navigator.vibrate` buzz that `lib/haptics` no longer makes on the web. Both predate this branch.
  - Screenshots: `4a…4n-day.png`, `4l-a/4l-b-night.png`, `4b-day-toast.png`, `chips-day.png`, `from-{today,inbox,calendar}.png` and `desktop-{day,night}.png`. There are 15 `side-<frame>.png` (design frame | build).

## Deviations

- **Date chip wording:** "Today · 15:00" / "Tomorrow · 09:00", else "Sun 27 Sep · 15:00". Frame 4g says TODAY. 4a and 4k print the absolute date even for today and tomorrow.
- **Primary closes the sheet:** Mark complete / Done for today close the sheet, and the Done + Undo toast lands on the page.
  - The title checkbox toggles in place, which is how you reach 4h. Reopen keeps the sheet open.
  - The drawing doesn't say either way.
- **Delete toast:** "Moved to Trash · Undo" (Kai), not the drawing's "Deleted".
- **Block card** opens `/calendar` on its current view. There is no per-day deep link and no 07d block sheet yet; Unschedule stays off the task sheet, as decided.
- **Suggest a time:**
  - Every slot places on one tap; the first is only drawn selected.
  - With no due time binding and nothing left today, it offers tomorrow.
  - The hint names why there are none ("No free time before 15:00").
- **Labels:** the drawing has no label picker. "+ Label" is an inline dashed field; tapping a label offers Remove label.
- **Chips after a date change:** rescheduling keeps `reminder_at` (as every surface does), so the Remind chip reads e.g. "18h10 before". 4k draws "10m before", as if the reminder followed the due.
  - **Kai / conductor:** should `rescheduleDue` move the reminder with the due (keep the lead), like the repeat spawn does? That changes every surface, so it is not done here.
- **Kit-wide on the phone:**
  - The project picker is now the 4d sheet everywhere a phone picks a project (row ⋯, swipe Project, the bulk bars), in place of the ActionSheet list and the popover.
  - Any untitled full sheet shows ✕ in its handle row.
- **Fidelity details:**
  - The priority chip reads "P2" as drawn; the ⋯ menu still says High/Critical/Medium.
  - The kit ActionSheet title wraps the long task name to two lines in 4e; the drawing shows one.
  - The 4j cherry is the kit EmptyState size (120 wide), larger than drawn.
  - The Focus pill shows the pomodoro length (settings) and no running-timer state.

## Risks / not done

- **Keyboard behaviour** is verified with a simulated `visualViewport`, not a real IME. Not checked on hardware: real Android Back through Capacitor (it calls the same `closeTopOverlay`), sheet drag feel, keyboard inset.
- **The title uses `field-sizing: content`** to grow with the text. An engine without it (WebView < 123) shows one line of a long title.
- **Back after leaving from the sheet reopens it.** If you leave through the sheet (block card → calendar, Focus pill → /focus), Back returns to the page with the sheet open. That is the history entry, and "Back returns where you were".
- **Repeat → Custom… on a phone** navigates to `/tasks/:id` and so lands on Tasks with the sheet (pre-existing: no custom rrule editor exists).
- **`?task=` on a desktop address** also draws the sheet. Only a hand-edited URL gets there; Copy link copies `/tasks/:id`.
- **Stale harnesses:** `gestures/verify*.mjs` expectations are stale (above). They are not updated here.
- No `docs/log/INDEX.md` line and no ROADMAP edit (parallel builders; the conductor adds them).
