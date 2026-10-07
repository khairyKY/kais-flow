---
date: 2026-10-07T09:50+03:00
session: builder CB (capture-block, follow-up to capture-type + calendar-rail)
type: handoff
related: docs/log/2026-10-07-0412-capture-type-handoff.md · app/src/features/calendar/replan.ts (THE RULE) · docs/log/assets/capture-type/
---

# A capture with a time lands on the calendar

Branch `claude/capture-block`, cut from `origin/claude/wave-u` (2fe568e = v1.0.22 + calendar-rail). Not merged, not deployed.

Kai's rule is already in calendar-rail (`calendar/replan.ts`): a task given a TIME is on the calendar as a block, and a date alone isn't. The command bar still broke it. "crypto session 4am", or the AI filling in a time, made a task with a due time but no block, so the task never showed on the calendar. That was Kai's 4am complaint.

## What changed

**Local parse.** `parseCommand` now returns `dueTimed`, which is chrono's `isCertain('hour')`.
- Timed: "4am", "tomorrow 3pm", "nov 5 10:30", "in 2 hours".
- Not timed: "tomorrow", "friday". Here chrono only implies an hour.

**Decision: only an explicitly typed time counts.**
- The date chip now shows a clock only when there will be a block. "Tomorrow · 4:00 AM" means a block; plain "Tomorrow" means a date alone.
- That makes the rule visible before Enter.
- The stored due time for a date alone is unchanged (chrono's implied hour).

**`capture/api.blockIfTimed(task, timed)`** is the one place a capture makes a block:
- It goes through calendar-rail's `placeTask` (one block per task, never a second).
- Start = the time; length = the task's estimate, or 30 minutes.
- It returns the block's Undo.

Where it is called:
- **Typed capture (command bar / phone sheet):** after `createTask`, when `dueTimed`.
- **AI fill (`enrichTypedTask`):**
  - If the AI filled `due_at` and says `has_time`, the block is made.
  - If the AI only filled a length, it stretches the 30-minute block the typed time just made. This happens only if that block is still untouched (one block, at the task's time, 30 minutes long).
  - "✦ Filled by AI · Undo" now takes that block off (or shrinks it back) before restoring the fields.
- **AI-filed captures:** `enrichTypedInboxItem`, voice / ⌘↵ `captureWithAI`, and queued / endpoint `processQueuedCaptures` all block when `has_time`. Their Undo removes the block before deleting the task.

**parse-capture:**
- New optional `has_time` key in the schema, the prompt and the app's `parseSchema`.
- The prompt says: true only when a clock time was said or clearly meant; false for a date alone; never invent a time.
- **Needs `supabase functions deploy parse-capture`.** Until then `has_time` is missing, so AI paths make no block and a date stays a date. That is the safe default; typed times work without a deploy.

## Evidence

All numbers below are on the merged head: `origin/claude/wave-u` was merged in after it gained sounds, tasks-noise and the AppLayout keyboard-layout fix. The merge had no conflicts.

**Gate:**
- `tsc -b`: 0 errors.
- vitest: 110 files / 1357 tests, under each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Kolkata (PowerShell `$env:TZ`).
- oxlint: 0 errors (21 warnings, none in touched files).
- `npm run build`: ok.

**Unit tests:**
- `parseCommand.test`: `dueTimed`.
- `dueChip.test`: a date alone shows "Tomorrow".
- `capture/api.test`:
  - `blockIfTimed` makes a block for a time and none for a date alone.
  - An AI time with `has_time` makes a block, and its Undo calls the block's undo.
  - `has_time` false, or missing, makes no block.
  - An AI length stretches the default block.
  - An AI-filed timed task gets its block, and Undo removes the block before deleting the task.
  - Voice gets its block.
- `parsePrompt.test`: `has_time`.

**`capture-type/verify.mjs`: 100/100** (mock mode, localhost:5262, the AI call mocked). The new `block-*` scenes:
- "crypto session 4am" on /calendar: a task due 04:00 with a 04:00–04:30 `type: task` block, the task row's `scheduled_start` set, and the grid drawing it in that day's column.
- "call Omar tomorrow": the chip reads "Tomorrow", the task is due tomorrow, and there are no calendar writes.
- "crypto session before sunrise !": no block at first. The AI reads 05:00 with `has_time` and fills the date, making a 05:00–05:30 block ("✦ Filled by AI: date"). Undo deletes the block and resets due to none.
- The phase-1 checks now also verify the block: "tomorrow 9am" gives 09:00–09:30 and "tomorrow 3pm" gives 15:00–15:30. They now tolerate the outbox sending a task create and its `scheduled_start` as one row or two.

**calendar-rail's `verify.mjs` on this build: 115/115.** Results are in `capture-type/calendar-rail/`.

**Harness timing under load.** While other builders' harnesses pegged the CPU, the capture-type harness flaked twice. I hardened it rather than the app:
- It now waits for the capture bar's chunk to be warm and for the voice sheet's mic to be live.
- `goto` gets 90 seconds.
Both harnesses pass cleanly when run alone.

## Not done / risks

- **A date-only local parse plus an AI time on the same day** ("gym tomorrow at dawn") stays date-only. The typed date counts as explicit, so the AI can't add a time to it. Upgrading a date-only due to the AI's time on the same day would be a small `aiFill` change if Kai wants it.
- **Paper capture lines** (`capture-image` → tasks) and the onboarding first-things don't go through `blockIfTimed`. Paper events already make events.
- **Quick-add Undo.** Quick add has no Undo toast. A typed timed capture's block is undone the normal way: delete the block, or replan.
