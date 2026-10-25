# 2026-10-25 05:40 (Cairo) · handoff · ai-chat follow-up

Branch `claude/ai-chat`. This continues `2026-10-25-0438-ai-chat-handoff.md` with Kai's two answers and the double-task bug. The release branch `origin/claude/kai-bugs-1012` is merged in twice: once before the work, and again at the end with `-X ignore-cr-at-eol`. The second merge brought bugs-1023, tray and the v1.4.2 sync-fix. All 139 files the merges touched kept their line endings.

## 1. Undo for every chat write (Kai: "no, add the undo bit")

- **One Undo for the whole confirmed batch.** It covers edits, moves, reschedules, unschedules, status and project changes, as well as adds, completions and trashes.
- **Server.** In the same transaction as the run, `chat/index.ts` snapshots the user's rows (RLS) before and after the batch, in `tasks`, `calendar_events`, `inbox_items` and `notes`. The pure `chat/plan.ts restorePlan` diffs them:
  - `put`: every row the batch changed or removed, exactly as it was.
  - `drop`: every row the batch made, blocks before their tasks.
  - `{ run }` returns `{ results, restore }`. The per-call `undoFor` tool calls are gone.
  - **Cost:** each snapshot reads whole tables, twice per Confirm. It's exact and simple; narrow it to the touched ids if a big account makes Confirm slow.
- **App.** Undo writes every `put` row back and every `drop` row as a delete, all through the outbox, the way the app's own `toastUndo` verbs do. No second tool run happens.
  - The card turns to "Undone — back as it was", with its lines struck through.
  - The model reads back "What the app did, then the user undid".
  - The toast's Undo and the card's Undo share one guard, so the batch is undone only once.

## 2. Auto-filing off also holds ⌘K lines with a date or #project (Kai: "I guess?")

- **Off (the default):** a ⌘K or tray line with tokens lands in the Inbox (`quickAdd holdTyped`).
  - Its tokens become the read: `ai_parse` with confidence 1, the title, due date and time, and the project or domain.
  - The card shows them as the one-tap suggestion: "Call the plumber · Tomorrow · 3:00 PM · Forecasting App · File as task".
  - Priority, length, `*labels`, repeat and `// notes` ride along on the payload. `inbox/api fileToTask` now applies them, so nothing typed is lost.
  - The toast reads "Added to Inbox · Tomorrow · 3:00 PM · Forecasting".
- **Task fields still add at once:**
  - the Tasks page's quick add (`addTypedTask`);
  - the rail's "Quick add task…" and the grid's quick create (QuickCreate);
  - Today's "Add a task…" row, "Add your first three things", Plan a step and the birthday's "Plan something". These open the bar through `openTaskCapture()`, which sets `asTask` in the command-bar store.
- **⌘2 Event** still makes an event.
- **The Settings help line names the split.**
  - Off: "Captures wait in your Inbox, ⌘K lines with a date or #project too — one tap files them · quick add on Tasks and Today still makes tasks".
  - On: "A capture with a date or #project, or one the AI is sure of, becomes a task (Undo) · quick add always makes tasks".

## 3. One capture, two tasks (Kai's log, 2026-10-23 16:20: `inbox.filed` + `capture.autofiled`)

- **The race.** `processQueuedCaptures` read a pending item and waited for the AI read, which takes seconds. In that window the capture was filed by hand (`inbox.filed`). When the read landed, the loop filed it again from its stale copy (`capture.autofiled`). `enrichTypedInboxItem` had the same window whenever the Inbox list wasn't cached.
- **The fix.** `features/inbox/filing.ts` (`claimFiling` / `releaseFiling`) makes filing once per inbox item.
  - Every filer claims the item first: `fileToTask` (now returns `null` when the item is already filed), `enrichTypedInboxItem` and `processQueuedCaptures`.
  - A claim is refused if the item is claimed, filed or trashed. The check reads both the caller's copy and the cached row.
  - Undoing a filing gives the claim back.
  - The queued loop re-reads the row after the read lands, so it never sets a filed item back to pending.
  - The server claim now also requires `status = 'pending'`.
- **Callers handle `null`:** `fileQuietly` ("Already filed", no Undo), `fileDone`, `fileToCalendar` (returns `null`), and resurfacing's convert ("Already a task").

## Gate (merged tree)

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `vitest` ×4 TZ (PowerShell: UTC, Cairo, Los Angeles, Tokyo) | 181 files · **2499 passed** each |
| `npm run lint` | exit 0, **0 errors** |
| `npm run build` | OK |
| `ds:check --baseline` | **0 new** |
| Deno functions (deno isn't installed; strict tsc + shim) | clean |
| `birthday_on` greps | 1/1 |

New tests:
- `plan.test` restorePlan;
- `quickAdd.test` held lines and the task field;
- `api.filing.test` labels/repeat/notes on filing, and filing twice files once;
- capture `api.test` for the race: queued capture, typed line, and a second filer is a no-op.

Harnesses on `:5308` (dual stack), one at a time:

| Harness | Result |
|---|---|
| `ai-chat` | **77/77** |
| resurface-chat | 292/292 |
| capture-rules | 42/42 |
| fix-inbox | 69/69 |
| paper-capture | 122/122 |
| journal-media | 123/123 |

New `ai-chat` sections:
- **U:** "Push the dentist to Friday 4pm, file it under Forecasting, add a swim" → Confirm → Undo puts the dentist back exactly (due, project) and removes the swim, with no second tool run.
- **A:** a ⌘K line with a date and #project is held; the card offers Tomorrow 3:00 PM · Forecasting App; one tap files it; Today's "Add a task…" adds at once.
- **R:** a queued capture is filed by hand while its read is out → one task, no `capture.autofiled`. With the old `capture/api.ts` this same section fails with exactly Kai's two events.

Two sibling harnesses needed small edits:
- **capture-rules:** its mock now has "File captures for me" on, because its checks are about the filing rule itself.
- **fix-inbox d3:** it now counts tasks by id. The merged bugs-1023 blockLength code writes a timed filing's task a second time as its block lands. That's one task, written twice.

The server was stopped afterwards.

## For Kai / the conductor

- **Nothing new to deploy beyond the first handoff:** migration 0086, then `functions deploy chat mcp capture`.
- **Other harnesses may need the same one-line mock change.** Any harness that captures ⌘K lines with a date and expects a task now needs `auto_file_captures: true` in its mock settings, as capture-rules got. Candidates: fix-tasks, time-slots, keys-undo, undo-verbs, sounds, today-shell, small-gaps, capture-type, sotto-voice, sidebar-ab, bound-journal, notebook-page, phone-polish, today-scale. I didn't run those.
