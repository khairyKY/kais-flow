---
date: 2026-09-26 08:02 UTC
session: polish-f2a-worker
type: handoff
related: polish-d-followups (2026-09-26-0724-bohr-decision-polish-d-followups.md), conductor-decides (2026-09-26-0642), Polish D handoff (2026-09-26-0720-polish-d-handoff.md)
---

# Polish F2a: completions, Today and Tasks · handoff

Branch `claude/polish-f2a` off `origin/claude/release-1` (`ddfb21a`). I pushed after every item. Not merged, no PR.

Screenshots are in `docs/log/assets/polish-f2a/`, named `<item>-<what>-<before|after>-<theme>-<viewport>.png`.

| Commit | Item |
|---|---|
| `57015e5` | 1 · Today "Up next" hides events that have ended |
| `e73e627` | 2 · A repeating task's next occurrence reminds again (and "Skip next" moves the reminder) |
| `718c907` | 3 · A second click on a just-checked task reopens it, with Undo (Today and Tasks) |
| `faa6056` | 4 · Undo on every task completion: Focus, task editor, Planning bulk, project "Keeps coming back" |
| `ee27b65` | 5 · The Tasks checkbox petal shows (two causes, both fixed) |
| `48a49b0` | 6 · Tasks sort control gets a subtle ▾ |
| `aad173e` | 7 · Task editor ⌘⏎ hint is the kit `KeyCombo` |
| (this entry) | handoff + screenshots |

## 1. "Up next" hides events that have ended

**Change.**
- `features/today/upNext.ts` gets a pure `upNextEvents(events, now)`. It keeps timed events that end after `now` and that either start today (Cairo) or are still running. The list is sorted by start time.
- The rule is end-exclusive, the same as `isInProgress`: an event leaves the minute it ends.
- An event that began before today and is still running stays, and reads "Now". All-day events never show, as before.
- In `TodayPage.tsx` (CRLF kept), a small `UpNextList` owns the minute tick. It passes `now` to each `EventRow`, so an event drops off without a reload, and the tick doesn't re-render the whole page.
- +8 tests. They cover the Cairo day vs. the UTC day in both directions, an overnight event still running, tomorrow's events, all-day events and sorting.

**Evidence.** Prod build, Cairo, events seeded relative to the real clock.

| | Rows |
|---|---|
| Before (day/night 1280, phone 390) | `8:20 AM Morning walk` (ended), `Now Deep work block`, `1:20 PM Call with Sam` |
| After (day/night 1280, phone 390) | `Now Deep work block`, `1:20 PM Call with Sam` |
| After, with Playwright's clock fast-forwarded past Deep work's end on the open page | `1:20 PM Call with Sam` only |

Shots: `1-upnext-{before,after}-{day,night}-d1280`, `…-day-p390`, `1-upnext-after-day-d1280-running-ended`.

## 2. Repeating tasks keep reminding

**Root cause.** `planCompletion` spread the completed row into the next occurrence. The copy therefore carried the original's past `reminder_at` and `reminder_sent: true`.

`supabase/functions/notify` (read only, not changed) selects `status = todo`, `reminder_sent = false`, and `reminder_at` within `[now − 10 min, now]`. The copy could never match.

**Change.**
- `recurrence.ts` gets a pure `nextReminderAt(reminderAt, fromDue, toDue)`. The reminder keeps the same lead before the new due time ("15 min before" stays 15 min before; a reminder set after the due time keeps that offset). No reminder on the original means none on the copy.
- `planCompletion` writes the copy with that `reminder_at` and `reminder_sent: false`. The completed row keeps its own reminder history.
- **Also fixed:** `skipNextOccurrence` (Perennials "Skip next"). It moved `due_at` and left `reminder_at` at the skipped time, so it was the same bug on the same field. It now moves the reminder too and resets `reminder_sent`.
- +12 tests.

**Evidence.** "Water the plants" repeats Sat/Tue at 09:00 Cairo, with a reminder at 08:45 that was already sent. I checked it on Tasks and read the rows back over REST.

| | Spawned Tue copy | notify's own filter, run over REST at Tue 08:50 Cairo |
|---|---|---|
| Before | `reminder_at 2026-09-26T05:45Z`, `reminder_sent true` | `[]` |
| After | `reminder_at 2026-09-29T05:45Z`, `reminder_sent false` | the copy |

- Perennials "Skip next", before: `due_at` Tue, `reminder_at` still Sat 05:45Z, `sent true`.
- After: `due_at` Tue, `reminder_at` Tue 05:45Z, `sent false`.

## 3. A second click on a just-checked row reopens it, with Undo

**Root cause.**
- **Today.** `useBloomCheck` holds a checked row's box drawn checked, so the bloom can play. Its `onChange` always completed, so the second click ran the completion again: "Done" again, and `completed_at` moved.
- **Tasks.** Inside the 650ms grace window the row is still drawn open with its box checked, and a second click completed it again.

**Change.**
- `completion.ts`:
  - `checkAction(done, justChecked)` is pure: a click on a checked box reopens.
  - `planUndoReopen()` puts the check back exactly, with the same `completed_at`. It re-inserts the next occurrence the Reopen removed, unless an open copy of it is on the list again.
- `api.ts` (CRLF kept):
  - `reopenTask` / `undoReopen` / `reopenTaskWithUndo`: a toast **"Reopened"** with Undo.
  - `toggleTaskWithUndo` is for boxes bound straight to the status.
  - `reopenTask` reads the row from the cache, so a row still drawn open reopens the real one.
  - After an Undo, the completion is re-armed, so reopening again still takes the copy back.
  - `uncompleteTask` keeps its old behaviour (no toast) for its other callers, including the calendar.
- **Today:** the bloom box, the filled ✓, the row menu's Reopen and the Up next box all reopen with Undo.
- **Tasks:**
  - `TaskRow` gets `onReopen`, which defaults to `reopenTaskWithUndo`.
  - A just-checked row's second click, its menu (now the done menu while it's in the grace window) and the complete key all reopen it.
  - `TasksPage` ends the row's grace window, so the row stays in its group instead of sliding out.
- +15 tests: the checkAction table, planUndoReopen, a check → reopen → Undo table simulation, and the api flow through a mocked outbox, cache and toast.

**Evidence** (REST after each step):

| Flow | Before | After |
|---|---|---|
| Today, one-off row, second click | toast "Done" again; `completed_at` 07:54:56 → 07:55:00 | toast **"Reopened · Undo"**; DB `todo`. Undo → `done`, `completed_at` restored to the first check's exact value |
| Today, daily repeat, second click | "Done" again; original done and copy left | "Reopened"; original `todo`, **copy deleted**. Undo → original done, **the same copy id back**, with its shifted reminder |
| Today, filled ✓ of a checked Top-3 row | reopens silently | "Reopened · Undo" |
| Tasks, second click at 250ms (inside grace) | "Done" again; row moved to Done today | "Reopened · Undo"; row stays in its group (opacity 1, ★ kept); DB `todo`, `top3` true. Undo → `done` |
| Today, phone 390, night | n/a | "Reopened · Undo" above the tab bar; DB `todo` |

Shots: `3-today-second-click-{before,after}-day-d1280`, `3-tasks-second-click-{before,after}-day-d1280`, `3-today-second-click-after-night-p390`.

## 4. Undo everywhere a task completes

**Change.**
- **Focus** "Done — check it off ✓" uses `completeTaskWithUndo`.
- **Task editor** uses `toggleTaskWithUndo` on:
  - the desktop and phone checkbox,
  - the phone "Mark complete" button,
  - the subtask boxes.
- **Planning board** bulk complete: one "N tasks completed." toast with Undo (`undoCompletion`, so repeats lose their spawned copy), the same pattern as Today and Tasks. A single card's check was already TaskRow's `completeTaskWithUndo`.
- **Also wired:** the project page's "Keeps coming back" checkbox (`ProjectDetailPage.tsx`, CRLF kept). It was the last completion without Undo outside the calendar.

**Evidence** (REST):

| Surface | Before | After |
|---|---|---|
| Editor desktop checkbox | no toast; stays `done` | "Done · Undo" → Undo → `todo` |
| Editor phone "Mark complete" (closes to /tasks) | no toast | "Done · Undo" on /tasks → Undo → `todo` |
| Focus check-off | no toast; "No active task selected" | "Done · Undo" → Undo → `todo`, and the task is the active task again |
| Planning, 2 cards selected → Complete | "2 tasks completed." (no Undo) | "2 tasks completed. · Undo" → Undo → both `todo` |

Shots: `4-editor-check-*`, `4-editor-phone-mark-complete-*`, `4-focus-check-off-*`, `4-focus-after-undo-*`, `4-planning-bulk-complete-*`.

## 5. The Tasks checkbox petal

I found two causes and fixed both where they start.
1. **Completion clears `top3`, and the grace window only put `status` back.** So the grace row re-rendered as a plain row the moment it was checked:
   - `checking && task.top3` was false, so there was no petal;
   - ★ turned ☆, and ✶ Goal vanished;
   - a Top-3 task not due today left the Today tab at once.

   `TasksPage` now keeps the Top-3 flag each row had when it was checked (the grace `Set` became a `Map`).
2. **The petal rode the ambient `petalFall` (a 90px drop).** The open row clips at its own edge (`overflow: hidden`, which the swipe panels need), so even when mounted the petal left the row about 50ms in.

   It now uses `tr-petalShed`: a 14px drop over 400ms, shed beside the check as Motion 5a frame 3 draws it. It animates transform and opacity only, and still renders only while motion is on (`useMotionEnabled`).

**Evidence.** Top-3 "Call the dentist" on Tasks at 1280, sampled at 20 to 450ms after the click.

| Run | Result |
|---|---|
| Before | no `.tr-petal-live` at any sample; star ☆ |
| After (day and night; day re-run on the final `aad173e` build) | petal present at every sample, `animationName tr-petalShed`; opacity ≈0.99 by 60ms, ≈0.75 at 220ms, 0 by 450ms; stays inside the 70px row; star ★ |
| Effects off | no petal (the row goes straight to done, as before) |

Shots: `5-petal-before-effects-on-day-d1280`, `5-petal-after-effects-on-{day,night}-d1280`, `5-petal-after-effects-off-day-d1280`.

## 6. Sort caret

- The `display` node now ends in `▾`, with `color: var(--ink-hairline)` at the label's own size. It matches the caret BulkBar, Inbox bulk and People use.
- **No `Select.tsx` change.**
- Shots: `6-sort-caret-{before,after}-{day,night}-d1280`, `…-day-p390`, `6-sort-open-{before,after}-day-d1280`.

## 7. Editor keycap

- The hand-rolled `⌘⏎` span is now `<KeyCombo keys={['⌘', '⏎']} size="sm" />`.
- After the change the page's `<kbd>`s read `⌘ K ⌘ / ⌘ J ⌘ ⏎`. Before, the Save hint was plain text.
- Shots: `7-editor-keycap-{before,after}-{day,night}-d1280`.

## Decisions I made (small, open, best-UX)

1. **TaskEditorPage and PlanningBoard live in `features/calendar/`**, not `features/tasks/` as the brief said. Items 4 and 7 can't be done without them, so I touched **only those two files** in `features/calendar/` with minimal diffs. The calendar grid, block and page (F2b's) are untouched.
2. **Reopen toast copy is "Reopened"**, matching the activity feed's "Reopened a task". The Undo on it puts the check back exactly: the same `completed_at`, and the same next-occurrence row re-inserted. It doesn't make a fresh completion.
3. **Every click-to-reopen on Today, Tasks and the editor now toasts with Undo**, not only the second click: the filled ✓, the menu's Reopen, the Up next box and the editor box. One behaviour everywhere.
4. **Tasks' complete key (`e`) on a just-checked row reopens it**, the same as a second click.
5. **Focus Undo keeps the focused minutes already logged**, because that time was spent. The timer reset is not undone.
6. **"Skip next" moves the reminder too.** It was the same bug on the same field.
7. **Up next shows an event still running from yesterday** (as "Now"). "Running" is running.
8. **Petal keyframe.** The petal now has its own 14px keyframe instead of the 90px token `petalFall`. That is the only way it stays visible inside a clipped row. Kai may want to tune the distance.
9. **`sm` keycap in the editor**, so the hint stays as quiet as the text it replaced.

## Automated checks (code at `aad173e`, from `app/`)

- `TZ=UTC npx vitest run`: **Test Files 45 passed (45) · Tests 603 passed (603)**.
- `TZ=Africa/Cairo npx vitest run`: **Test Files 45 passed (45) · Tests 603 passed (603)**.
- Also `TZ=America/Los_Angeles`: 45 / 603 green.
- Release-1 baseline was 45 / 568 (per the 0724 decision). +35 new tests: `upNext` +8, `recurrence` +6, `completion` +11, `api.completion` +10.
- `npm run lint` shows 2 errors, both the baseline `features/projects/ProjectsPage.tsx:23–24`. Warnings are 23 vs. 24 on the base: I diffed a base `git archive` linted with the same oxlint, and one ternary-statement warning in TaskEditorPage is gone.
- `npm run build` (tsc -b + vite + PWA) is green.
- Bundle, gzip vs. release-1:
  - entry `index` +278 B (shared tasks api/completion/TaskRow)
  - TasksPage +98 B, TodayPage +89 B, PlanningBoard +49 B
  - FocusPage and TaskEditorPage about −5 B
- Line endings were kept on every file. CRLF: TodayPage, TasksPage, tasks/api, FocusPage, ProjectDetailPage. LF: the rest.

## Real-run setup

- Shared local stack at `http://127.0.0.1:54321`. It was not reset or stopped. `app/.env.local` is gitignored.
- **Ports.** `:5238` was already serving someone else's build (`version.json` commit `0519157`), so I left it alone.
  - This branch's `vite preview` ran on **:5246**.
  - The release-1 base build ran on **:5247**.
  - Both were started from a script file and stopped by recorded PID at the end.
- Account `polish-f2a@example.com`, seeded over REST with its own JWT:
  - 10 tasks: the repeating "Water the plants" with a sent reminder, a daily "Stretch break", Top-3 one-offs, the Focus task, the editor task, and a Planning pair for tomorrow;
  - 4 events relative to the clock: ended, running, later today, tomorrow.
  - I re-seeded before every before/after run.
- Playwright: global install, Chromium 1194, `timezoneId: 'Africa/Cairo'`, `reducedMotion: 'no-preference'`.
- Console: every run's error list was empty after dropping the known `api.open-meteo.com` tunnel failure.
- Scripts are in my scratchpad and not committed: `seed.mjs`, `lib.mjs`, `upnext.mjs`, `reminder.mjs`, `skip.mjs`, `second.mjs`, `undo4.mjs`, `petal.mjs`, `shots67.mjs`.

## Not done here

- No ROADMAP, TEST-LEDGER, phase-Notes or `INDEX.md` edits: the brief asked for this entry only.
- `supabase/**`, `Select.tsx`, `AppLayout`, `MobileTabBar`, `lib/outbox.ts`, `lib/uiScale.ts`, `App.tsx` and `index.html` are untouched.
- Suggested ledger rows:
  - "Up next hides ended events"
  - "Repeat copy reminds (and Skip next)"
  - "Second click reopens + Undo (Today/Tasks)"
  - "Undo on Focus/editor/Planning bulk"
  - "Tasks petal on Top-3 check"
  - "Sort ▾"
  - "Editor ⌘⏎ keycap"

## Found, not fixed (outside this brief)

- **Today's goal card loses a finished goal.** Completion clears `top3`, and the card picks its task from the `top3` list, so a checked goal falls out and the card shows the next Top-3 task. This conflicts with R4 ("stays, crossed out"). The same goes for a checked Top-3 row, which moves down to "All open". It was true before this branch.
- **Today's "All open" lists every open task**, including tomorrow's (for example the spawned next copy of a daily repeat). This is existing behaviour, noted only because a repeat's copy shows up right under the checked original.
- **Calendar surfaces** (block checkbox, EventDetailsPanel "Complete", CalendarPage menu) still complete without Undo. They belong to F2b. `completeTaskWithUndo` / `toggleTaskWithUndo` are ready for them.
