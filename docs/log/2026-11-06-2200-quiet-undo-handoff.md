# quiet-undo — one global undo history, quieter toasts (2026-11-06)

Kai: "too many notifications when changing any event or stuff. Keep Ctrl+Z global."

## Audit
`toastUndo` (lib/undo.ts) was already the single choke point: ~130 call sites across calendar, tasks, inbox, projects, people, library, paper, capture, today, rituals. Every one pushed an Undo toast. `toastAction`/plain `push` toasts (copied, sync, offline, errors, what's-new) are not undos and are untouched.

## What changed
- **One history** (lib/undo.ts): every `toastUndo` call is an entry on a single app-wide stack (100 deep), cleared on sign-out. Ctrl+Z / Cmd+Z undoes the newest from any page; Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y redoes (AppLayout). Resting rules unchanged: native undo wins in inputs, textareas and contenteditable, and the keys rest while a dialog, menu or overlay is open. No call site was rewritten; they all keep passing their own undo function.
- **Redo without rewriting undos** (lib/writeTape.ts): while an undo runs, `writeRow` notes each row's prior state; that tape becomes the redo (and the redo's tape becomes the next undo), so undo, redo, undo works indefinitely. Ceiling: an undo that changes something outside `writeRow` (templates in localStorage, a setting) records no tape, so it undoes but is not redoable.
- **Which actions toast** (`isLoud`, exported, unit-tested): destructive (deleted, trash, archived, dismissed, discarded, cleared, merged, finished, removed ·), bulk (2+ tasks/blocks/items/lines/pages...), repeat scope results (· this event / this and following / all), AI-filed (✦), and any wording not on the routine list (unknown errs loud). Quiet: move, resize, plan, schedule, unschedule, out of slot, done/reopened, snooze, rename, link, someday, Top 3, priority, labels, reminder, repeat set, duplicate.
- **Computer**: no toast for quiet edits; the first 3 show a one-line "Undo with Ctrl+Z · redo with Ctrl+Y" (Cmd on Mac), then nothing. **Phone**: one toast with Undo; edits within 6s share it ("2 changes"), its Undo takes them all back.
- **Settings → Notifications & sound → Undo toasts: Fewer (default) / All.** Stored as `kf_undo_toasts` and synced through the existing `app_settings.prefs` (lib/prefs SYNCED_PREFS), so no migration.
- Loud toast's Undo button and Ctrl+Z are the same entry (undoing one removes the toast / the entry).

## Checks
- Gate green: vitest x4 zones 2854/2854, lint, build, ds:check 0 new; `birthday_on` 1/1. Merged origin/claude/kai-bugs-1012 (clean) before the final gate.
- New unit tests (lib/undo.test.ts): history across tables ("cross-page"), undo after redo, new action clears redo, nested toasts ignored, delete loud + same entry, All/Fewer + hint cap, classifier.
- New harness docs/log/assets/quiet-undo/verify.mjs: 33/33 (silent move + resize; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk; Ctrl+Z from another page; delete still toasts and Ctrl+Z removes the toast; Ctrl+Z in an input stays native; All brings the toast back; Settings row; phone "2 changes" + Undo). a4 was fixed after the first run (harness clicked the wrong category), a-only rerun 5/5.
- Re-run: undo-verbs 88/88, drag-fix 176/176, motion-lists 82/82, worth-fireworks 45/45, cal-clicks 96/96. These assert toast wording for routine edits, so their init script now sets `kf_undo_toasts=all` (one line each). Three unit test files that assert routine toasts (capture/api, tasks/api.completion, tasks/api.order) do the same.

## Left over
- Mac Tauri app: not testable here. If its default Edit menu swallows Cmd+Z before the page sees keydown, it needs the Undo/Redo menu items removed or routed to the page; Windows app and browsers use the keydown path verified here.
- An undo/redo in flight ignores new `toastUndo` calls until it settles (a user edit in that sub-second window would not be on the history).
- Keys rest while any dialog or overlay is open (existing rule), so Ctrl+Z does nothing inside e.g. the command bar.
