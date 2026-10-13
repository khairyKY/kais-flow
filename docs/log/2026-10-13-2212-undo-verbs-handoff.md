---
date: 2026-10-13 22:12 UTC
session: undo-verbs (builder)
type: handoff
related: 2026-10-13-0808-p7e-parity-audit.md §3 A (rows A17, A18); B3 (key letters, open for Kai); 2026-10-13-0852-keys-undo-handoff.md (the key tables); claude/manual-order (⌘↑/↓, in parallel)
supersedes: none
---

# undo-verbs: handoff (P7e A17 · A18)

Branch `claude/undo-verbs`, from `origin/claude/kai-bugs-1012` @ ab728417. Pushed. **Not merged, no PR.** No migration.
Kai's existing letters (`p`, `t`, `#`, `1/2/3`, Inbox `e`) are untouched (B3 is his). Only free keys were added. ⌘↑/↓ was left alone for claude/manual-order.

## Commits

| SHA | Row | What |
|---|---|---|
| 3f213586 | A17 | Undo for the silent setters |
| f31b2d41 | A18 | the remaining list verbs |
| ffbbbadf | A18 | desktop bulk pill: Priority and Labels behind More (the pill overflowed 1280px) |
| 1ccb7d9a | — | `assets/undo-verbs/verify.mjs` + shots |

## A17 · Undo, at the shared setter

- **`tasks/api.ts`** gets 3 functions:
  - `editWithUndo(tasks, message, write)` runs the setter, then Undo writes back every field it changed. Picking the same value again writes nothing and shows no toast.
  - `prioritizeWithUndo(tasks, p)` handles one task or a selection.
  - `planWithUndo(task, dueAt, timed)` writes one task's date: "Planned · <day>" or "Date taken off".
- **`taskActions`** (useRowGrammar) is the one action table behind the row menus, the task sheet/popover and the editor:
  - Priority, Repeat, Remind and Duration now go through these, so every surface gets the toast. Duration moved into this table, so the sheet uses it too.
  - The Plan list's dates go through `planWithUndo`.
- **Keys 1 and 3** on Tasks, Today and the project/area page use `planWithUndo`. Key 2 already had Undo.
- **Someday "→ Today"** uses `planWithUndo`.
  - Its two pills now show on touch: `@media (hover: none), (pointer: coarse)`.
  - Each pill gets a `--touch-min` tall hit area through `::after`, with no visual change.
- **Labels:** every Label picker tap now goes through `labels.ts toggleLabel`, which toasts for one task too ("Added “garden”").
  - The sheet's `onSet` / `TaskMenuActions.labels` is now only the "Saved" flicker.
- **Editor:** the Due date and Due time fields use `planWithUndo`. The Someday toggle uses `editWithUndo`.
- **The bar's "Added to Inbox"** gets Undo through `inbox/api uncapture`:
  - The capture goes to Trash.
  - If the AI's read already filed it, the filed task is removed outright, as `unfile` does.
  - `enrichTypedInboxItem` skips a capture that is already in Trash, so a late AI read can't bring it back.

## A18 · the list verbs

| Key | Does | With a selection |
|---|---|---|
| `d` | Plan… (the whole Plan list) | Plan for all |
| `s` | Someday | all (the page's bulk) |
| `!` | Priority… | one Undo for all |
| `=` | Duration… | the focused row |
| `h` | Make goal of the day | the focused row |
| `f` | Start focus | the focused row |
| `⇧F` | Tasks: opens the Label filter | — (page key) |
| `⇧S` | Tasks: opens the Sort | — (page key) |
| `l` | now on the project/area page too | all |

- **Letters:** Akiflow's where they were free: S (its ⌘S, which is the browser's Save), !, H, F, = (its ⌘= is the browser's zoom), ⇧F and ⇧S. `D` for Plan…, because Akiflow's P is our Move to…. Under B3 (a), Plan… would move to `p` in one line of `LIST_SHORTCUTS`.
- **`tasks/useListVerbs.tsx`** is the one place these live:
  - It uses the row menu's own pickers (TaskMenu with `anchor.sub`, LabelPicker), opened under the focused row or for the selection with the page's bulk handlers.
  - A key-opened menu puts focus on its first choice, so Tab and ↵ work. Esc closes it.
  - The list keys pause while a picker is open.
  - Each page adds about 10 lines: spread `verbs.actions` / `verbs.bulk`, add `!verbs.picking`, render `{verbs.node}`.
- **The bulk bar** gets **More** (Priority…, Labels…). On a phone it is an action sheet, the phone's first way to label a selection. On desktop it is a menu. The project/area page's bar gets **Top 3**.
- **`bindingFor`:**
  - Shift + a letter now means that capital letter's binding when one exists (⇧F, ⇧S), and the plain letter otherwise, as before. Caps Lock alone never selects a capital binding.
  - Non-Latin layouts still match by `code`.
  - Page keys (`page: true`) run with no row focused, even on an empty list.
- **The cheatsheet and menus stay accurate:**
  - Every key is a row in `LIST_SHORTCUTS`, so the `?` sheet lists exactly what each page binds. Tasks shows ⇧F/⇧S; Today and the project page don't.
  - The row menu shows the new key hints (D, !, L, H, F).
- **Tasks/Today edits are kept small** for claude/manual-order: their `kbLabelIds` / `kbProjectId` stay as they were, and the verbs are spread in front of the page's own actions.

## Gates (final tree)

- `npx vitest run`: 154 files, **2115 tests** passed. New tests:
  - `editWithUndo` / `prioritizeWithUndo` (2)
  - the A18 keys: Shift/Caps/Arabic, page keys, each key bound once (4)
  - quickAdd and labels tests updated to the Undo contract
- `npm run lint`: 0 errors, 21 warnings (unchanged).
- `npm run build`: passes.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- Browser: mock backend, this worktree's dev server on :5279 (`--mode mock`), localhost, warmed first. Results:
  - `assets/undo-verbs/verify.mjs` **88/88** (a A17 · p phone · v A18 · c cheatsheet; day and night).
  - Re-run on the final tree: keys-undo **60/60**, fix-tasks **70/70**, fix-inbox **69/69**.

## Not verified

- A real backend, the Tauri window, Android hardware keyboards.
- ⇧F only works once at least one label exists (the filter isn't drawn before that).
- Arrow keys don't move inside ContextMenu or the Plan list. A key-opened picker is driven with Tab and ↵.
- With a selection, Ctrl+Z still rests (keys-undo's rule). The toast's Undo button works.
- Clicking a toast counts as a click-away and clears the selection. That is the existing rule.

## Notes for Kai

- Choosing a Repeat on an undated task shows two toasts: "Repeats from today" (the setter's note) and "Repeats · Weekly · Undo". Merging them would need a quiet flag on `setRecurrence`. I left that out.
- Undoing "Added to Inbox" puts the capture in Trash rather than deleting it outright. It works the same way as Undo on an added task or event.

## Files

- `app/src/features/tasks/api.ts`, `useRowGrammar.tsx`, `TaskFields.tsx`, `TaskMenu.tsx`, `LabelPicker.tsx`, `labels.ts`, `TaskRow.tsx`, `TaskRow.css`, `listShortcuts.ts`, `useListVerbs.tsx` (new), `TasksPage.tsx`
- `app/src/features/today/TodayPage.tsx`, `projects/ProjectDetailPage.tsx`, `calendar/TaskEditorPage.tsx`
- `app/src/features/command-bar/quickAdd.ts`, `inbox/api.ts`, `capture/api.ts`
- `app/src/components/useListKeys.ts`, `BulkBar.tsx`
- tests: `tasks/api.setters.test.ts`, `tasks/listShortcuts.test.ts`, `tasks/labels.test.ts`, `command-bar/quickAdd.test.ts`
- `docs/log/assets/undo-verbs/` (verify.mjs, results.json, 19 shots)
- **Line endings:** CRLF files stayed CRLF, line by line (`git diff --ignore-cr-at-eol` equals `git diff`).
