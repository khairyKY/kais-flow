---
date: 2026-10-13 09:12 UTC
session: capture-rules
type: handoff
related: docs/log/2026-10-13-0808-p7e-parity-audit.md §3 A (rows A2, A5, A6, A10, A11, A19, A21; p7e t1, c2, c3); docs/log/2026-10-12-2016-fix-tasks-handoff.md (Kai 2026-10-12, "Enter = the one capture path")
supersedes: none
---

# capture-rules: handoff

Branch `claude/capture-rules`, from `origin/claude/kai-bugs-1012` @ 1c5bfb3f. Pushed. Not merged, no PR. No migration.

## The one capture rule, after this

Every typed capture now lands through `command-bar/quickAdd.ts` `captureTyped`. The command bar's Enter and the tray's field both call it, and Tasks' quick add calls `addTypedTask` inside it. A line lands in one of three ways:

- **Event switch on:** an event (`addTypedEvent`).
- **Any token typed:** a task now. A typed time also gets a calendar block (`capture/api` `blockIfTimed`), a toast says where it went, and the AI fills the empty fields afterwards.
- **No tokens:** the line goes to the Inbox at once, and the AI reads it there.

All tokens come from one local parse, `parseCommand` (chrono on the user's clock). The parse now blanks each token in place, so every index still points into the typed line. In order, it reads:

1. `// notes`
2. a link
3. `*labels`
4. `!`
5. `30m`
6. `every …`
7. the date, with an optional `<` before it
8. `#tag`

It also reports `tokens` (the words each chip took) and accepts `ignore` (words to read as plain words). The AI fill (Groq) is unchanged. Inbox filing (`inbox/api` `fileToTask`) uses the same calendar step and the same link rule.

## Commits

| SHA | Item |
|---|---|
| ad20a97e | A2: a timed inbox card filed with `e` gets its block and its length |
| 7d466828 | A5: "every week" and the other repeat words set the repeat |
| 8ed95d3c | A6: `//` makes the rest notes; `<date` leaves no `<` |
| b47d59fa | A10: the first Esc hands the last recognised token back |
| c055e358 | A11: the bar can make an event |
| a1e6d6ec | A19: a captured link stays on the card and the task; `o` opens it |
| 7ce76c9f | A21: the tray's quick capture follows the bar's rule |
| 9c8290ec | Follow-up: the parse's other readers keep the new tokens (see below) |
| (this commit) | Browser harness, DATA_MODEL note, this handoff |

## Per item

**A2: inbox `e` on a timed card.** `fileToTask` takes `timed`. The value is the card's own pick (the Draft's `timed`, passed by `e`, File, bulk File-as-drafted and bulk File-to). When a caller passes no date, the AI's `has_time` decides (Morning ritual, resurfacing). The filed task gets:

- its block, through `blockIfTimed`;
- its length: a typed `30m`, else the AI's `duration_min`.

Undo (`unfile`) deletes the task's blocks from the calendar cache before deleting the task. On the server, `calendar_events.task_id ON DELETE CASCADE` (0004) removes the block.

Measured: Sat 15:00–15:45 for "…3pm for 45 minutes". p7e t1 reported 15:00 with no block.

**A5: repeats.** The parse reads these phrases:

- "every day / week / month / year"
- "every 2 weeks", "every other week"
- "every monday", "every mon, fri"
- "every weekday"
- "every week on tue and thu"

They go through the importer's `parseRecurrence`. Only "every …" phrases are read, so "Weekly review" stays a title. The due date becomes the series' first day: "every monday 6pm" is the next Monday at 18:00, and an undated repeat starts today at 09:00 (as `setRecurrence` does). `createTask` takes `recurrenceRule`.

- The bar shows a ↻ chip.
- QuickCreate and the phone create sheet copy the typed rule into their Repeat field.
- The unused `stripLabels` / `stripPriorityAndDuration` helpers, and their 4 tests, are deleted.

**A6: `//` and `<`.** `//` at a word start (so a link's `https://` keeps its slashes) makes everything after it the notes, read as written. Notes on their own count as structure, so the line becomes a task. A `<` right before a date goes away with the date: one date, as in B4 (a). The bar shows a `// Notes` chip.

**A10: Esc.** On desktop, each Esc moves the last chip's words into `ignore`: the chip disappears and the words stay in the title. When no chip is left, Esc closes the bar. The ignore list clears with the line.

I read Akiflow's "ESC removes a recognized token" as *un-recognising* the token (the words stay as text), not deleting the text. The audit's own wording ("removes … a second Esc closes") also fits this reading. If Kai meant deleting the words, the change is one line in `CommandBar`.

**A11: events.** The bar has a Task | Event switch (kit `Segmented`, in the hint row on desktop and the chip row on the phone), plus ⌘/Ctrl+2 (and ⌘/Ctrl+1 to go back). An event from the bar:

- sits at the typed time, for the typed length (else 30 minutes);
- is all day when a date has no time;
- is today when no day is named;
- repeats when "every …" is typed;
- gets `project_id` from `#project`;
- keeps a typed link in its title.

The toast reads "Added to Calendar · Tomorrow · 8:00 PM", and its Undo moves the event to Trash. The priority, label and notes chips hide while the switch is on Event. **The switch has no design yet: flag it for Phase C.**

**A19: links.**

- **New helpers:** `lib/links.ts` has `webUrl` (http/https only), `urlIn`, `linkRef`, `taskLink`, `linkLabel` and `openTaskLink`.
- **Inbox card:** shows "example.com ↗" from `payload.url` (the endpoint), else from the first link in `raw_text` (a share).
- **Filed task:** gets `external_ref {source:'link', id:<random>, url}`. The field and its 0027 index already exist; the random id means the index never collides. The AI's own filings keep the link too (`capture/api` `taskFromCapture`: voice, and typed or queued Inbox lines).
- **Bar:** a typed link leaves the title and shows as a chip.
- **Task sheet and editor:** show any link: "View issue" for a GitHub one, else the site name.
- **`o`:** works on every task list, because `buildListBindings` adds it by default. The cheatsheet lists it.

**A21: tray.** `TrayFlyout` used to call `captureWithAI`, which waited on the AI and skipped the local parse. It now calls `captureTyped(parseCommand(…, { zone: 'cairo' }))`. `captureWithAI` stays for voice.

**Follow-up (9c8290ec).** QuickCreate, the phone create sheet and onboarding's first things read the same parse. They would have silently dropped notes, links and repeats, so they now keep them:

- notes go into the task's notes (a typed notes field still wins);
- a link becomes the task's `external_ref`;
- a repeat goes into onboarding's task.

## Verified

- **Unit tests:** `npx vitest run` gives **2011 passed in 151 files**, in each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo (PowerShell `$env:TZ`, offsets confirmed −180/0/420/−540). The base was 1986: 29 tests added, 4 removed with the dead helpers.
- **Static checks:**
  - `npm run lint`: 0 errors (21 warnings, the same kinds as before).
  - `npm run build`: OK. The entry chunk is 130.24 kB gzip, against 127.91 kB for the base commit, built the same way (+2.3 kB).
  - `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- **Browser, on the mock backend** (dev server from this worktree, `--mode mock`, http://localhost:5273, routes warmed first). Edge functions answer 500, so only the local rule is tested.
  - `docs/log/assets/capture-rules/verify.mjs`: **42/42**. Screenshots cover the desktop bar in day and night (repeat, Esc, Event), the phone sheet in day and night, the Inbox links in day and night, the editor link, and the tray after a capture.
  - Re-run on the final tree: **fix-inbox 69/69**, **fix-tasks 70/70**, **fix-grammar 97/97**, **tray-notices 59/59**.
  - One earlier tray-notices run failed 2 paper checks with `__kfNotifyAction is not a function`. I had edited source mid-run and Vite reloaded the page. Run alone afterwards, it passed 59/59.
- **Line endings:** the CRLF files I touched are still CRLF (`git ls-files --eol`): `CommandBar.tsx`, `InboxPage.tsx`, `tasks/api.ts`, `capture/api.ts`, `listShortcuts.ts`, `DATA_MODEL.md`.

## Not verified / open

- Nothing was tested on Kai's real account, the live site, the Windows tray app or Android. The tray was tested as the `/tray` route with a stubbed `__TAURI_INTERNALS__`, and `o` with a stubbed `window.open`.
- **AI fill not exercised:** the harness's AI always fails, so the AI fill after a typed repeat, notes or link was not run in a browser. Its rule (fill only what is empty) is unchanged and covered by unit tests.
- **Phone Esc:** Esc-to-un-read is desktop only. The phone sheet keeps its own Esc/Back, which closes it.
- **Esc edge case:** a date whose span includes another token ("tomorrow !! 3pm") is handed back whole, so that token goes back too.
- **Ignore by words:** ignored words are matched by their text, so the same words typed again elsewhere in the line also stay words (`ponytail:` note in `parseCommand`).
- **Chrome reserves ⌘/Ctrl+1/2** for tab switching, so in a browser tab use the switch. The desktop app gets the keys.
- **Repeat links:** a repeat's next copy doesn't carry the link. `external_ref` is never copied to a duplicate or next occurrence (0027).
- **Undo cascade:** the Undo of a timed inbox filing relies on the server cascade when this device has no calendar cache loaded. The mock doesn't cascade, so the harness checks the task DELETE and the order of writes.
- `origin/claude/kai-bugs-1012` moved after I branched (MCP, notify). There is no merge here, and I did not check for conflicts.
