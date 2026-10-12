---
date: 2026-10-12 22:05 UTC
session: labels
type: handoff
related: 2026-10-12-1839-local-decision-unbuilt-designs.md (Labels un-parked); design-export/Overlays.dc.html "Label picker" + "Labels"; docs/phases/P6-integrations.md step 5; 2026-10-12-2016-fix-tasks-handoff.md; 2026-10-12-1919-ds-check-audit.md
---

# labels: handoff

Branch `claude/labels` (from `origin/claude/kai-bugs-1012` @ c6d3bd18, fast-forwarded to af650557 for the ds-fix-1 merge, then merged with 975a150f — ds-fix-2 + github-rules; P6 Notes kept both entries). Pushed, not merged, no PR.

## Commits

| SHA | What |
|---|---|
| 7107f835 | The Label picker (L) and the Labels manager; migration 0069 `app_settings.label_meta`; tests; harness 73/73 |
| e99c1ae0 | ds: RepeatMenu / TaskPopover / taskSheet.css back on tokens — 0 NEW in `features/tasks` (conductor's request) |
| 1b000c93 | This handoff, P6 note |
| 29107771 | Merge of the base (ds-fix-2, github-rules) — gates re-run on the merged tree |
| (next) | INDEX line |

## What exists now

**Label picker** (Overlays.dc.html "Label picker · assign · keyboard L") — `tasks/LabelPicker.tsx`.
Desktop: the drawn 230-wide popover. "Find or create…", every label with its colour square, how many tasks carry it, and a check on this task's labels. With several tasks, a label only some of them have shows "–". Then a rule and "＋ Create new label…", which reads `Create "x"` once something is typed. A tap toggles the label and the picker stays open, because a task takes several. ↑/↓ move the highlight. Enter toggles the highlighted label, or creates the typed name, and clears the search. Esc closes the picker first and anything under it after.
Phone: a sheet with the same rows, 52 px tall.
It opens from:
- **the chips** (`TaskFields.tsx` TaskChips, so the phone task sheet and the desktop task popover both get it): every label chip opens the picker, and a task with no labels shows a dashed "Label" chip. This replaces the inline "+ Label" field and its "Remove label" menu.
- **the desktop row menu**, as right-click or ⋯ → **Labels ▸**, right after Priority (`taskMenuSpec.ts`). It is on desktop only: the phone's action sheet stays as MK Action Sheet draws it, and the phone edits labels in the task sheet.
- **the L key** on Tasks (`listShortcuts.ts` `labels`, wired in `TasksPage.tsx`). With a selection, L acts on all of the selected tasks, like T does: one picker, and each tap is one toast ("Added "Quick win" to 2 tasks") with Undo. The cheatsheet lists it ("l Labels…") because it reads the registered keys.

**Labels manager** (Overlays.dc.html "Labels · manage · settings") is in `tasks/LabelManager.tsx`, drawn as its own panel:
- The header shows "Labels · N total · ＋ New".
- Each row shows the colour, the name, "N tasks" and ⋯. Clicking a name, or ⋯ → Edit, opens the drawn edit row: the name field, the six swatches and Save. Enter saves and Esc cancels.
- ⋯ → Delete removes the label (phone: an action sheet).
- The footer reads "labels cut across every domain ✿".
- It lives in **Settings → Organize**, under the Domains card (desktop and phone; `SettingsPage.tsx` OrganizeCard only). It also opens from the **Tasks Label filter → "Manage labels…"**: as a panel under the filter on desktop, as a sheet on the phone.

**Rename / delete** (`tasks/labels.ts`):
- **Rename** rewrites the label on every task that carries it, trashed ones included, so a restore brings back the new name. Renaming onto an existing name, in any case, merges into that label and no task ends up with it twice. A case-only rename stays a rename.
- **Delete** takes the label off every task.
- Each runs in one pass through `writeRow`, with one Undo that puts back every task's labels (over the current row, so later edits to other fields survive) and the colour map. They are deliberately **not** logged as task activity, because the slipping view would read 40 relabelled tasks as touched. A single-task toggle still logs `task.updated {field: labels}` like any field edit.

**`*label` quick-add syntax:** untouched (`command-bar/parseCommand.ts`). The fix-tasks harness q1 still passes with `*calls`.

## Storage decision: `app_settings.label_meta` (migration **0069**), no new table

The design draws colours (six swatches in the edit row, a coloured square on every picker row), so a colour has to live somewhere tasks can't hold it. Labels stay free text on `tasks.labels`, and that already gives rename and delete everything they need. The only new data is **one small map per user**, `{ "Urgent": "var(--acc-terra)", … }`, which also holds a label made with ＋ New before any task carries it. That is a jsonb column on the per-user `app_settings` row:
- no new table, RLS policy or sync path
- it rides the outbox like every other setting
- `parseLabelMeta` keeps only the six drawn swatch tokens, because the value lands in a style

It follows the 0058/0063 pattern. The client writes the column only once the fetched row carries the key, so **before the push** labels work fully (picker, L, rename, delete) but every label wears the neutral hairline square, the manager hides ＋ New and the swatches, and nothing is sent that the server would refuse. Harness section p checks this.

Numbering: renamed from 0067 at the conductor's request (0067 = Routines `routines.plant`, 0068 = GitHub rules). `[KAI]` `db push` with the release.

## Deviations (marked in code)

- **No drag-to-reorder.** The drawn ⠿ handles and "drag to reorder" are left out. Labels list A–Z everywhere (picker, manager, filter). A stored order can join `label_meta` when the list drag-and-drop (Motion 2c/2d) lands (`ponytail:` note in LabelManager.tsx). The footer reads only "labels cut across every domain ✿", so it doesn't promise a drag that doesn't exist.
- **＋ New is the secondary button**, not the drawn terra pill. Settings' UI pass keeps one terra CTA per view (DomainsSettings' Add made the same call). It is marked `deviation(2026-10-13 labels)`.
- **Counts in the picker.** The conductor's brief asked for counts and the frame doesn't draw them. They sit as a quiet mono number before the check.
- The manager title is `--fs-lead` at weight 500, not the drawn 19/600. That is the nearest token, and bold + large is house-banned.
- The labels' colours show in the picker and the manager only. Row label chips and the sheet chips keep their bordered look: no row design draws coloured labels.

## Not done / for other owners

- **The editor page (`calendar/TaskEditorPage.tsx`) still has its own inline "+ label" input.** I was told not to edit `calendar/`. It already builds on `useTaskControls`, so the calendar owner's change is one line: replace the `<input … aria-label="Add a label">` (and the ✕ buttons) with chips that call `open('labels', e)`, the same way its "Project or area" field calls `open('project', e)`.
- **Today** has no L (not my folder). It can wire `labels: (t) => …` into its `buildListBindings` with a `LabelPicker` the same way TasksPage does.
- **BulkBar** has no Labels button. L covers the keyboard. A phone bulk path would need a bar button; that is not drawn.
- ds:check's remaining NEW hits on the merged tree are all in folders I didn't touch (calendar, routines, today). The 2 SettingsPage confirm-delete hits I saw before the merge were fixed upstream (`ds-ok` on the key cards).
- The old `docs/log/assets/task-sheet/verify.mjs` fills `.ts-label-add`. That step is superseded by the picker (labels/verify.mjs section s).

## Verified

- `npx vitest run`: **1881 passed** on the merged tree (1869 before the base merge; 145 files) under TZ = UTC, Africa/Cairo, America/Los_Angeles, Asia/Tokyo (PowerShell `$env:TZ`; offsets confirmed 0 / −180 / 420 / −540). New tests:
  - `labels.test.ts` (16): list/counts/colours, meta sanitising, picker filtering, L-on-selection toggle + Undo, rename/merge/case-only/delete batching + one Undo, Undo keeping later edits, pre-push sends nothing, case-insensitive ＋ New
  - `listShortcuts.test.ts` (3): L binding, runAll on a selection, layouts
  - `taskMenuSpec.test.ts` (+1): desktop Labels after Priority, none on the phone
- `npm run lint`: 0 errors (warnings only, same kinds as before). `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 NEW in every file I touched** — all of `features/tasks` (new and old), `SettingsPage.tsx`, `lib/types.ts`.
- Browser, real app on the mock backend, dev server from this worktree (`--mode mock`, http://localhost:5261):
  - `docs/log/assets/labels/verify.mjs`: **73/73**, twice in a row on the merged tree (and three times before it)
  - `docs/log/assets/fix-tasks/verify.mjs`: **70/70**, still green (before and after the merge)
- Screenshots in `docs/log/assets/labels/` (1280×800 and 390×844, day + night):
  - k1: picker from L
  - b2: L on a selection
  - m2: row menu → Labels
  - c1: picker inside the popover
  - s1: phone label sheet
  - g1/g2: Settings manager + edit row (desktop and phone, day and night)
  - g10: phone ⋯ sheet
  - f1: "Manage labels…" over Tasks (desktop + phone)
  - p1: pre-push
  - **o1/o2: side by side with the Overlays frames.** The app is at the shipped 125% interface zoom, so it reads larger.
- CRLF files kept CRLF (`git ls-files --eol`): `TasksPage.tsx`, `SettingsPage.tsx`, `listShortcuts.ts`, `lib/types.ts`, `DATA_MODEL.md`, `INDEX.md`, `P6-integrations.md`.

## Not verified

- Nothing on Kai's real account or the live site (mock backend only). Migration 0069 was not pushed or run against a database.
- The phone picker and manager were checked in Chromium at 390×844 with touch emulation, not on a device.

## Files I wrote

New:
- `app/src/features/tasks/labels.ts`
- `app/src/features/tasks/labels.css`
- `app/src/features/tasks/LabelPicker.tsx`
- `app/src/features/tasks/LabelManager.tsx`
- `app/src/features/tasks/labels.test.ts`
- `app/src/features/tasks/listShortcuts.test.ts`
- `supabase/migrations/0069_label_meta.sql`
- `docs/log/assets/labels/verify.mjs`, `results.json` and the PNGs
- this file

Edited:
- `app/src/features/tasks/TaskFields.tsx`
- `app/src/features/tasks/TaskMenu.tsx`
- `app/src/features/tasks/taskMenuSpec.ts`
- `app/src/features/tasks/taskMenuSpec.test.ts`
- `app/src/features/tasks/listShortcuts.ts`
- `app/src/features/tasks/TasksPage.tsx`
- `app/src/features/tasks/RepeatMenu.tsx` (ds only)
- `app/src/features/tasks/TaskPopover.tsx` (ds only)
- `app/src/features/tasks/taskSheet.css` (ds + dead `.ts-label-add`)
- `app/src/features/settings/SettingsPage.tsx` (OrganizeCard + one import)
- `app/src/lib/types.ts` (`label_meta?`)
- `docs/DATA_MODEL.md` (0069 column + note)
- `docs/phases/P6-integrations.md` (Notes)
- `docs/log/INDEX.md` (one line)

Nothing outside `D:\Coding\kais-flow\.claude\worktrees\labels`: `git status` in `.claude/worktrees/kai-bugs` is clean. `app/.env.mock.local` was copied in, and is gitignored.
