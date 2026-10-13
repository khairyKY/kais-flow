---
date: 2026-10-13 08:52 UTC
session: keys-undo (builder)
type: handoff
related: 2026-10-13-0808-p7e-parity-audit.md §3 A (rows A3, A7, A8, A9, A31); B3 (key letters, open for Kai); claude/cal-keys (A4, in parallel)
supersedes: none
---

# keys-undo: handoff (P7e A3 · A7 · A8 · A9 · A31)

Branch `claude/keys-undo`, from `origin/claude/kai-bugs-1012` @ 1c5bfb3f. Pushed. **Not merged, no PR.** No migration.
Kai's existing letters (`#`, `p`, `t`, `1/2/3`, Inbox `e`) are untouched (B3 is his); only missing keys were added.

## Commits

| SHA | Row | What |
|---|---|---|
| 95c32cbc | A3 | Ctrl/⌘+Z = the newest toast's Undo (`lib/undo.ts undoLatest`, called from AppLayout's key handler) |
| ef2f8fdd | A7 | `i` Inbox · `u` Upcoming (`/tasks?list=upcoming`) · bare `/` Search · Ctrl/⌘+`,` Settings |
| 0c72e4fc | A8 | Inbox Space = done now · `p` = plan (the card's date picker) |
| c0bacc49 | A9 | ⌘K jumps to projects, areas and labels (`features/command-bar/jump.ts` + tests) |
| f7100f89 | A31 | the `?` cheatsheet reads the real key tables; ↵ on a desktop GitHub row opens the issue |
| f1915966 | A9 | the jump row's name size → `--fs-body-s` (same 13.5px; ds:check) |

## What changed

**A3 · Ctrl/⌘+Z.** Outside a field it runs the newest toast's Undo (the last toast in the queue that has one, on screen or waiting), removes that toast, and plays the undo sound like the button. Inside a field (`input`, `textarea`, contenteditable) nothing is intercepted, so the browser's own undo runs. It also rests while a menu or dialog is open or anything holds the Esc stack.

**A7 · navigation keys.** In AppLayout's existing shell handler, layout-proof the same way as the shell's Ctrl+K: a printable ASCII `key` is compared, else the physical `code` (Arabic I = `ه`/KeyI, U = `ع`/KeyU, `/` = `ظ`/Slash, `,` = `و`/Comma). Bare `/` also matches wherever a layout puts `/` (Shift+7 on German). `i`/`u` need no Shift (Shift+N on Today stays Notebook; `t` stays Top 3; `g` stays inside ⌘K, D-5).

**The guard (A3 + A7).** `keysResting(e)` in AppLayout: typing in a field, **or** `overlayCount() > 0` (every overlay registers on the Esc stack: command bar, search, chat, cheatsheet, pickers, menus, sheets, a list selection), **or** a `[role="dialog"]`/`[role="menu"]` in the DOM (the existing Today Shift+N check). The older keys (`n`, `?`, Ctrl+K/J//) are unchanged.

**A8 · Inbox.**
- **Space = done now** (Akiflow's E): `inbox/api.ts fileDone` files the capture as a task with its card's title, date and place, then `completeTask`. Toast `Filed "<title>" as done`; with a selection, `N captures filed as done`, one toast, one Undo. Undo = the existing `unfile` (the task hard-deleted, the capture pending again).
- **`p` = plan**: opens the card's own date picker. A compact or unsure card opens full first, and a note/person draft turns into a task (only a task has a date). GitHub rows: nothing (no date field). It presses the card's own `Due date` button after the render (a `ponytail:` note marks it), so it is the same picker a click opens; the picker focuses its day cell and stops key propagation, so `d`/`e` can't act on the card behind it. After a pick, focus returns to the card and `e` files it on that day.
- Why these letters: Space already means Complete on every task list, and `p` is Akiflow's Plan and is free in the Inbox. **But `p` = Move to… on task lists**, so if Kai picks B3 (a) the Inbox `p` is the odd one out, and if he picks B3 (b) (Inbox `e` = done) Space and `e` change places. One line each in `INBOX_KEYS` (lib/shortcuts.ts).

**A9 · ⌘K jump.** The one jump row now reaches every project, area and label as well as the 17 views. Rule (`matchJump`): ≥2 characters; an exact name first, then a name starting with what's typed, then a word inside a name; in order views → projects → areas → labels. It is no longer "unique prefix only", so an ambiguous view prefix now offers the first view (`pe` → People) instead of nothing; ↓ is still needed, and plain ↵ still quick-adds. The row says the kind (`Forecasting App · Project`), names through `EmojiText`. Projects and areas open `/projects/<id>`; a label opens `/tasks?list=all&label=<name>`. TasksPage takes `?label=` into its label filter and drops it from the address, so a jump from Tasks itself, or to the same label again, applies.

**A31 · the cheatsheet.**
- Inbox: `INBOX_KEYS` (lib/shortcuts.ts) is now the one table; InboxPage spreads its keys into the bindings and the sheet lists the same table, so they can't drift. New rows: Space Done now, `p` Plan, `r` Restore (Dismissed, Snoozed), ⌘/Ctrl+A Select all; ↵ reads "Edit title · a GitHub issue opens".
- On a task: with no list page mounted the sheet now shows `LIST_SHORTCUTS` itself (so `l` Labels… shows); `TASK_LIST_SHORTCUTS`, the hand copy, is deleted.
- Command bar: `*` Label (*calls), `30m`/`1h` Duration; the jump row label says views, projects, areas, labels.
- Anywhere: `/`, ⌘/Ctrl+/ (Search, even mid-typing), ⌘/Ctrl+Z, ⌘/Ctrl+`,`, `i`, `u`.
- ↵ on a desktop GitHub row clicks its `#482` link (new tab), as the mouse does. Phone keeps "tap opens the row".

**For claude/cal-keys (A4):** the cheatsheet's third column now renders `SHEET_SECTIONS` in lib/shortcuts.ts. The Calendar section is one entry there, e.g. `{ title: 'Calendar', entries: CALENDAR_SHORTCUTS }`. If their branch adds its own `<Category title="Calendar">` in ShortcutOverlay.tsx, that hunk will conflict with this one. Resolve it by keeping the `SHEET_SECTIONS.map` and moving their section into the array. Neither branch binds a key the other uses (this one: i, u, /, Ctrl+, Ctrl+Z, Inbox Space/p).

## Gates (final tree)

- `npx vitest run`: 151 files, **1994 tests** passed (new: undoLatest; `jump.test.ts` 5; the cheatsheet Inbox test).
- `npm run lint`: 0 errors (21 warnings, none new; the one in a touched file, TasksPage `next.has(id) ? …`, is old).
- `npm run build`: passes.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new** (1406 hits, 1 fixed since).
- Browser, mock backend, the worktree's own dev server on :5274 (`--mode mock`), localhost, warmed first:
  - `assets/keys-undo/verify.mjs` **60/60** (u A3 · k A7 · d A8 · j A9 · c A31; day and night cheatsheet shots).
  - Re-run on this branch: fix-inbox **69/69**, fix-tasks **70/70**, search-design **62/62**, today-shell **88/88**, labels **73/73**.

What the keys-undo harness proves, briefly:
- u: Ctrl+Z after `e` puts the task back to todo, and its toast leaves. Ctrl+Z inside the quick add undoes the typing (`abc` → `ab`) and leaves the toast's action alone. With the command bar open it does nothing.
- k: i/u/`/`/Ctrl+, from Today and Settings, also as Arabic-layout keydowns. All of them rest in a field, in the open bar (even with its field blurred) and with a context menu open.
- d: Space writes a done task in the card's project and files the capture; Ctrl+Z deletes the task and brings the card back. `p` on a compact row opens it full plus the picker, `d` inside the picker dismisses nothing, Tomorrow → `e` files due Tue 13. `p` on a note card makes it a Task. Ctrl+A + Space files 3 as done; one Ctrl+Z brings back 3.
- j: `fore` → Project, `heal` → Area, `gard` → Label from Tasks itself (filter on, only the 2 garden tasks), `inbox` still a view.
- c: every new row is present, no Calendar section yet, ↵ on GitHub row → new tab at the issue URL.

## Not verified

- macOS: ⌘Z/⌘,/⌘K were exercised as Ctrl only (headless Chrome on Windows). Chrome on a Mac may keep ⌘, for its own settings; the Tauri/installed app shouldn't.
- The Tauri desktop window (Ctrl+, and the GitHub ↵ new tab go through the webview), a hardware keyboard on Android, and the real backend.
- Ctrl+Z rests while a list selection is active (the selection is on the Esc stack). That's by the rule ("inside a menu or dialog"), but Kai may expect it to undo there too.
- The Guide's Undo line still says "Tap Undo before it fades" (copy left alone).

## Notes

- **Line endings:** CommandBar.tsx and InboxPage.tsx are CRLF in the repo. A scripted edit had turned them LF; the branch was replayed before pushing so each commit holds only its real lines (CR counts = line counts; content identical to the pre-replay tree, `git diff --ignore-cr-at-eol` empty).
- The base moved while this ran (`eb72a156`, A32 docs + two harnesses); nothing here touches those files.

## Files

- `app/src/lib/undo.ts`, `undo.test.ts`, `lib/shortcuts.ts`, `shortcuts.test.ts`
- `app/src/components/AppLayout.tsx`, `ShortcutOverlay.tsx`
- `app/src/features/inbox/InboxPage.tsx`, `inbox/api.ts`
- `app/src/features/command-bar/jump.ts`, `jump.test.ts`, `CommandBar.tsx`
- `app/src/features/tasks/TasksPage.tsx`
- `docs/log/assets/keys-undo/` (verify.mjs, results.json, 9 shots)
