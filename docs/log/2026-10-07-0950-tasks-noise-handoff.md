---
date: 2026-10-07T09:50+03:00
session: builder tasks-noise (Kai's feedback 2026-10-07: Ctrl+A · areas & domains · sync noise)
type: handoff
related: docs/log/assets/tasks-noise/ · app/src/features/tasks/move.ts · app/src/components/syncQueue.ts
---

# Ctrl+A everywhere, "Move to…" areas and domains, and a sync status that stays quiet

Branch `claude/tasks-noise`, cut from `origin/master` (v1.0.21, 71675dd). Three feature commits, then `origin/claude/wave-u` (v1.0.22 + calendar-rail) merged in on the coordinator's request. No migration, so `docs/DATA_MODEL.md` is unchanged. Not deployed.

| Commit | What |
|---|---|
| `e33e217` | Ctrl+A selects on every task list |
| `2687fb6` | "Move to…" a project, an area or a domain; areas and projects take their tasks to a new domain |
| `2eac291` | the sync status stays quiet unless something is slow, offline or not saved |
| `0c9d3a6` | merge `origin/claude/wave-u` (conflicts below) |

## 1 · "Ctrl+A isn't working for tasks"

### Root causes

There were three, found by driving the real app (mock backend) on every list.

1. **Only three pages had it.** Ctrl+A lived inside `useListKeys`, so only Tasks, Today and Inbox handled it. Project pages, area pages and the Planning board never wired it. The browser's own select-all ran instead and highlighted the page's text (390 / 405 / 174 characters in the probe).
2. **The quick add swallowed it.** The Tasks page's quick add keeps focus after Enter, and any focused input skipped Ctrl+A. The common flow (type a task, Enter, Ctrl+A) therefore did nothing: the field was empty, so there was not even text to select.
3. **Non-Latin layouts.** The match used `e.key` only. On an Arabic layout Chrome reports Ctrl+A as key `ش` (code `KeyA`), so the shortcut never matched.

The Tauri shell does not eat the key. It has no app menu and no accelerators: `lib.rs` only installs the tray, whose menu is a right-click tray menu. Capabilities are `core:default`. WebView2 delivers Ctrl+A to the page.

### Fix

- **One hook.** `useSelectAllKey(onSelectAll, active)` in `components/useListKeys.ts` is the only Ctrl/Cmd+A handler.
  - `useListKeys` uses it, so Tasks, Today and Inbox keep working.
  - The project page, the area page and the Planning board now call it.
  - The Planning board selects the cards you can see.
- **The guard** is the pure `isSelectAllKey`:
  - A field that has text keeps the browser's select-all.
  - An empty field on the page hands the key to the list.
  - A field inside an overlay never does: the command bar, a picker's search, any `[role=dialog]` or `[role=menu]`.
  - Ctrl+Shift+A and Ctrl+Alt+A are ignored.
  - A non-Latin `e.key` falls back to `e.code === 'KeyA'`.
- **Someday rows** are now selectable like every other list. Before, Ctrl+A selected them but the rows could not show or act on it.
- **Esc** clears the selection on every page, through each page's existing `useEscapeStack`.
- **The Done tab** stays unselectable on purpose: bulk actions only act on open tasks. There, the browser's own select-all still runs.

## 2 · Tasks into areas and domains; areas (and projects) into domains

### "Move to…"

"Move to project…" is now **"Move to…"** on every path:
- the ⋯ / right-click menu;
- the swipe (its label is now "Move");
- the `p` key;
- the task sheet's chip, which now shows the task's place: project, else area, else domain;
- the bulk bar ("Move" on both desktop and phone) on Tasks, Today, project and area pages, and the Planning board.

All of these open one picker, `features/tasks/MovePicker.tsx`:
- On desktop it is a popover; on a phone it is a sheet with 52px rows.
- It is searchable. Enter takes the first match.
- It is grouped by domain: the domain itself, then its areas, then its projects. After the domains comes "No domain", then **None**.
- The current place is checked.
- On a phone, a search that matches nothing offers "Create project “x”".

### Rules

The rules are pure and tested in `features/tasks/move.ts` (`placeTask`).

| Pick | project_id | area_id | domain_id |
|---|---|---|---|
| a project | the project | cleared | the project's domain |
| an area | cleared | the area | the area's domain |
| a domain | cleared | cleared | the domain |
| None | cleared | cleared | cleared |

A milestone stays behind whenever the task leaves its project.

### Writes and Undo

`moveTasksWithUndo` (in `tasks/api.ts`) replaces `setProject`, which is deleted.
- It makes one outbox write per task.
- It logs `task.moved {project_id, area_id, domain_id}`.
- It shows one toast for a single task or a whole bulk selection: "Moved to Health", "11 tasks moved to Garage" or "Unfiled", each with Undo.
- Undo restores only the place fields, on top of the current row.

Activity describes the new moves ("Moved … into Health / Work") and `area.reparented`.

### Behaviour change

**None now clears all three fields.** The old "No project" kept an area task in its area, as the brief asked.

### An area's domain

- The area page has a **Domain** field, the same as the one on the project page. It is ≥ 48px tall on a phone.
- The Projects page's row ⋯ / right-click menu gains **"Domain…"** for both areas and projects. On desktop it opens a context menu; on a phone, an action sheet.
- `reparentArea` / `reparentProject` move the container's tasks to the new domain through `carryTasksToDomain`. One Undo puts everything back.

**The same gap existed for projects.** The project page's Domain field changed the project only, so its tasks kept their old `domain_id`. A task's own `domain_id` wins in `effectiveDomainId` / `resolveTag`, so those tasks still read and filtered as the old domain. Fixed the same way.

### Merge with the other builder

The edits to `taskMenuSpec.ts` / `TaskMenu.tsx` are kept to the label and the picker:
- the label `Move to…`;
- `ProjectPicker` swapped for `MovePicker`, in two places;
- `move` / `onMove` now take a `MoveTarget`;
- `TaskMenu` no longer takes `projects` / `domains`.

The key stays `'project'`, and `ctx.projectName` now carries the place name.

## 3 · The sync status and "a notification for changes every 2 seconds"

**What it was.** It was the topbar's sync strip. Every write flipped it to "Syncing ↻ 1", then back to "Synced ●" with the reconnect glint. The glint's condition (`was > 0 && n === 0`) is true after every flush. Each change round-trips a task row and its activity row, about two seconds, so every action produced a two-second blink.

The same blink appeared in three more places:
- **The phone strip.** It showed the steady "KAI'S FLOW · TUE 6 OCT · SYNCED ●" (the coordinator's screenshot note) on every page that draws the strip: Routines and the rest of More, Tasks, Inbox, Projects and Settings.
- **The Windows tray icon.** It switched to its offline look whenever `waiting > 0`.
- **Today's phone "Syncing" dot.** It lit up for each refetch, and every write's realtime echo causes one.

There was no toast or system notification behind "every 2 seconds". I checked:
- `lib/realtime.ts` only invalidates queries. It was not touched, so it won't clash with the teammate's local edit.
- System notifications are only real reminders, focus-done and the server's digests.
- The service worker auto-reloads without a prompt.

**New rule.** `syncStep` in `components/syncQueue.ts` is pure and tested. `useSyncStatus` feeds it from the outbox, its dead letters and the connection.

| State | Shows |
|---|---|
| writes flushing normally | **nothing.** The strip is "name · date"; the " · Synced ●" is gone |
| a write still pending after 4s | "Syncing…" |
| offline | "Offline", or "Offline · N waiting" |
| the server set a write aside (dead letter) | "N change(s) not saved ⚠", in terra, until its popover is opened. The popover lists the change and says to make it again |
| an offline or not-saved spell clears | "Synced ●" with the glint for 2.5s, then nothing |

Related changes:
- A quick write during that brief "Synced" doesn't blink it off.
- The outbox now fires `kf-outbox-change` once a dead letter is stored, so "not saved" shows at once.
- The tray reads the same status. Its K changes only for a slow, offline or not-saved write.
- Today's phone dot shows only for a fetch still running after ~4s (`useLingering`).
- Seasons' Effects demo of the topbar dropped its hard-coded "Synced ●".

**Consistency.** The strip is one component, `AppLayout`'s TopBar. On a phone it is hidden only where the page draws its own app bar: Today (`today.css`) and Calendar (`phoneCalendar.css`). The harness checks /routines, /people, /settings, /projects, /tasks and /inbox at 390 and 1280: none shows a sync word at rest, and offline shows on the same strip.

**Notices kept, and why:**
- Error toasts: "One change couldn't be saved…" and the rest.
- Undo toasts for your own actions.
- Real reminders, focus-done notices and the server's morning/evening notices. These are deliberate features.
- v1.0.22's one-time "Updated to vX · What's new" toast. It is deliberate too; the harness seeds it as seen.

**Notices changed.** These were plain "N tasks scheduled / moved / parked for someday." toasts and the Overdue tab's "N overdue tasks moved to today." They are now Undo toasts, through shared helpers (`rescheduleTasksWithUndo`, `somedayTasksWithUndo`, `moveTasksWithUndo`), on four surfaces: Tasks, Today, the project/area pages and the Planning board.

**Left alone.** Some confirmations elsewhere stay: Perennials ("Paused repeating …"), Routines ("Routine completed!"), capture ("Added to Inbox for review"), and "Link copied". Each is one per explicit action, not change spam. They are listed here in case Kai wants them gone too.

## Merge with `origin/claude/wave-u`

Conflicts came from calendar-rail's `rescheduleDue`, which now returns its own Undo:
- `rescheduleTasksWithUndo` collects those Undos, so a bulk Undo also puts each task's calendar blocks back. It takes `{ timed, message }`, and `moveToTomorrowWithUndo` goes through it.
- Every bulk Pick date passes the picker's `timed` flag through, as the single-task paths already did: Tasks, Today, project/area pages and the Planning board.
- `useRowGrammar` keeps both import sets. `setProject` stays deleted.

## Evidence

### Gate (on the merged head)

- `npx tsc -b` → 0.
- `npm run lint` → 0 errors, 21 warnings (the same 21 as before; none in touched code).
- vitest from PowerShell, with the offset checked in each zone: Africa/Cairo −180, UTC 0, America/Los_Angeles 420, Asia/Kolkata −330. Each zone ran **110 files, 1328 tests**, all green. This branch adds 32 tests:
  - `useListKeys.test` 5 (the Ctrl+A guard);
  - `move.test` 11 (placeTask, the picker list, place names, planReparent);
  - `api.move.test` 8 (single, bulk, Undo, area/project domain cascade);
  - `syncQueue.test` +6 (the status machine);
  - `describe.test` +2.
- `npm run build` → ok.

### Browser (mocked backend)

`npm run dev -- --mode mock --port 5273`, `http://localhost:5273`, warmed first.

`docs/log/assets/tasks-noise/verify.mjs` covers desktop 1280 and phone 390, day and night. Result on the merged head (0c9d3a6): **210/210** (the pre-merge full run was also 210/210). It seeds v1.0.22's What's new memory, so that toast never takes a slot. It also waits for a list's first row, because a cold dev server can still be compiling a chunk after networkidle; the first post-merge run tripped on that (4 Ctrl+A checks before the rows existed).
- Ctrl+A on 12 views:
  - Tasks: default, today, all, overdue, upcoming, someday, week, month;
  - the project page and the area page;
  - the Planning board and Today.
- In each view: it selects every open task and leaves no page text selected, and Esc clears it.
- Also covered: the Done tab; the empty quick add after Enter; a field with text keeps its select-all; the Arabic layout; Ctrl+A at phone 390.
- Move to…:
  - the picker's groups;
  - a single task into an area, a domain, and None, with Undo;
  - `p` + type + Enter;
  - bulk Ctrl+A → Move → a project, with Undo;
  - the phone sheet (all rows 52px) and the phone bulk bar.
- Area and project domains:
  - the area page field, with the tasks cascading and Undo;
  - the project page field, with the tasks cascading and Undo;
  - Projects ⋯ → Domain… on desktop and phone;
  - the phone field is ≥ 48px.
- Sync:
  - the strip is quiet at rest on six pages, and offline shows there;
  - a burst of 24 writes never shows the status and raises no toast;
  - a write held for 5.5s: nothing at 2s, "Syncing…" at 4.6s, nothing after;
  - offline → "Offline · 1 waiting" → "Synced" → nothing;
  - a refused write → "1 change not saved ⚠" plus its toast; the popover names the change; then "Synced", then nothing.
- Screenshots and `verify-results.json` are beside the script.

### Other harnesses

These were re-run against this branch before the merge, from a scratch out-dir so committed assets weren't overwritten:

| Harness | Result | Expectation updates (intentional) |
|---|---|---|
| projects-fixes | 222/222 | "Move to project…" → "Move to…" |
| task-sheet | 147/147 | 4d now expects the Move to picker (domains, then projects, None last; "Create project “x”") |
| small-gaps | 154/154 | none |
| desktop-polish | 150/150 | the Projects row menu gains "Domain…" |
| today-phone | 158/158 | 2m checks the Syncing dot is absent early and present at ~4.4s |
| gestures `verify.mjs` | 94/104 | "Move to…", swipe "Move", bulk "Move" |
| gestures `verify-pages.mjs` | 48/56 | "Move to…" |

The gestures failures were already there before this branch, and are documented as stale in `2026-09-28-1805-task-sheet-handoff.md`. They are the haptic ticks, plus the ⋯ list predating "Start focus".

## Deviations

- **"None" in Move to… clears project, area and domain.** The old "No project" kept the area, as the brief asked.
- **The not-saved state ends when its popover is opened.** A dead-lettered write is never retried, so "resolves" means "seen". The brief Synced flash then plays, because everything else did sync.
- **The bulk-action toasts became Undo toasts**, rather than being removed.
- **Swipe and bulk-bar labels changed.** "Project" became "Move", because they open Move to….

## Follow-ups / for the conductor

- `docs/log/INDEX.md` has no line for this handoff yet; it's the conductor's log.
- **Gestures harness:** its pre-existing stale expectations are still not refreshed (haptics, the ⋯ list with "Start focus").
- **Shortcut matching elsewhere:** Ctrl+K / Ctrl+J / Ctrl+/ in `AppLayout` also match on `e.key` only, so on an Arabic layout they fail the same way Ctrl+A did. The fix would be to reuse `isSelectAllKey`'s `code` fallback. That is out of scope here.
- **Phone sheet search:** `MovePicker`'s phone search creates a project, not an area. Adding "Create area" is one line if Kai wants it.

Kai should confirm two things: that None clearing all three fields is what he means by "no place", and whether the remaining one-off confirmations (Routines, Perennials, capture) should also go.
