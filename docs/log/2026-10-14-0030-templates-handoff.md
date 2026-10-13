---
date: 2026-10-14 00:30 (Cairo)
session: templates builder
type: handoff
related: parity audit A25 (docs/log/2026-10-13-0808-p7e-parity-audit.md), P7 7d, PLAN_ADDENDUM §12
---

# 2026-10-14 00:30 · handoff · checklist templates (A25)

Branch `claude/templates`, from `claude/kai-bugs-1012` (`ab728417`). Feature commit `2955d294`. Not merged, not released.

## What it does

- **Save as template:** Project page → Checklist → **save as template** (shown only when the checklist has lines). One tap saves it, then the name opens in place, starting as the project's name. Toast: "Saved as a template · N items · Undo". A template keeps each line's title and type only. It does not keep ticks or task links.
- **Use:** the Project page's **Templates · N** list (under the checklist) → **use**. Every item is added to that project's checklist as an unticked line. A `task-linked` item also becomes a real task under the project, with the project's domain and no area (the tasks/move.ts rule), linked by `task_id`. A `one-shot` item stays a line only. This is the split in PLAN_ADDENDUM §12, using the checklist's existing `type` field (§12's `mode` field never existed). There is one Undo for the whole batch. It removes the new tasks outright (like Duplicate's Undo) and takes the lines back. Logged as `project.template_used` / `project.template_unused` plus `task.created` for each task, all with Activity copy.
- **Manage:** tap a template's name to rename it, or tap ✕ to delete it. Both have Undo, and Undo puts a deleted template back in its old place. Templates are managed on the Project page, next to the checklist, because the checklist's own lines already use the same tap-to-rename and ✕-with-Undo pattern. They are not in Settings → Organize.

## Storage

`app_settings.checklist_templates jsonb?` (**migration 0079**, additive, `add column if not exists`), read through `features/projects/templates.ts` `parseTemplates`. It follows the 0069 `label_meta` pattern: the client writes the column only when the fetched settings row already has it. **Before 0079 is pushed, the page shows no "save as template" and sends nothing.** `docs/DATA_MODEL.md` is updated.

## Not decided (still Kai's)

- **Milestones vs checklist link model** (fix-grammar handoff "Needs Kai #2"): left alone. Templates hold only checklist lines and never touch `milestone_id`, so they work with whichever model Kai picks.
- **The brief vs §12:** the brief said "the template's items become real tasks". A25 cites §12's accept line, so only `task-linked` items become tasks and `one-shot` items stay inline. If Kai wants every item as a task, it is a one-line change in `instantiate()`.
- The retainer monthly reload (P7 7d) does not use templates. That was out of scope.

## Gates

- `npx vitest run`: 155 files / **2118 passed** (new `templates.test.ts`: 6; `describe.test.ts` +3 event rows).
- `npm run lint`: **0 errors**.
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- Browser, mock backend, my worktree on :5283:
  - `docs/log/assets/templates/verify.mjs` **33/33**: save, use, Undo, rename + Undo, delete + Undo, the pre-push gate, phone + night fit and 44px rows. Screenshots are in the same folder.
  - Re-runs: `edit-after-create` **25/25**, `fix-grammar` **97/97**.
- Server stopped.

## [KAI]

`npx supabase db push --include-all` (0079) has to run before the frontend ships, per the release order.
