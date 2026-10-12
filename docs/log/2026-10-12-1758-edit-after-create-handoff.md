---
date: 2026-10-12T17:58Z
session: builder (edit-after-create, Kai 2026-10-12 "if you have an entry there, you cannot edit it after it's created — a recurring pattern")
type: handoff
related: docs/log/assets/edit-after-create/ (harness + screenshots + results.json)
---

# Edit after create: routines, library, project details, interactions

Branch `claude/edit-after-create`, cut from `origin/master` (v1.0.28). Pushed, not merged, not deployed. No migrations, no new dependencies, no edge-function changes: every write goes through `lib/outbox.ts` `writeRow` (spread the cached row, change the fields).

## UX decisions (Kai delegated them)

- **One rule everywhere: edit where the thing is shown, in the page's own grammar.** A text value is click / tap / Enter to edit in place (the shared `RenameField`, same as project titles and log notes); a date is the app's own date picker (`DateField`, sheet on phone / popover on desktop); a number is the shared −/+ `NumberField`; a multi-field record reuses that page's existing form (routines: the New routine form; library: the page's own inline "Add" card style).
- **Routines:** "Edit" is the first item in the row's ⋯ (phone ActionSheet + desktop ContextMenu), and tapping the routine's name opens it too — like a task row's title. No new screen: the New routine form opens prefilled, titled "Edit routine", button "Save routine". Steps are shown (and editable) there — the only place they appear, as before.

## What changed (all under `app/src/`)

| Area | Change | Files |
|---|---|---|
| Routines | `updateRoutine` (writeRow + `routine.updated`); form takes `routine?` and prefills; Edit in ⋯ menus; name opens edit | `features/routines/api.ts`, `NewRoutineForm.tsx`, `RoutinesPage.tsx` |
| Routines (pure) | `routineToForm` / `applyRoutineForm` / `addDays` (moved from the form) + 8 tests | `features/routines/newRoutine.ts`, `newRoutine.test.ts` |
| Library | "edit" chip on book detail (beside log session / finish) and on note + quote readers, phone + desktop; inline edit card | `features/library/LibraryPage.tsx`, `LibraryEditForm.tsx` (new) |
| Library | new `updateBook`; existing `updateNote` / `updateQuote` now wired | `features/library/api.ts` |
| Library (pure) | `bookFromForm` (bad page count keeps the old, blank year clears, pages read capped at the new total), `parseTags` + tests | `features/library/edits.ts`, `edits.test.ts` (new) |
| Projects | target / renews date → `DateField` calling `updateProjectTargetDate` (Clear in the picker footer) | `features/projects/ProjectDetailPage.tsx` |
| Projects | engagement line ("Freelance · started …") click-to-edit → `updateProjectEngagement` | same |
| Projects | milestone "weight N" → tap for `NumberField`, each step saves (`reweighProjectMilestone`, new) | same + `api.ts` |
| Projects | checklist line rename in place (`renameProjectChecklistItem`, new — renames the checklist line only, a task-linked item's task keeps its title) | same + `api.ts` |
| Projects | work entry duration chip → tap to edit ("1h30m" / "45m" / "90"); its day → `DateField` (not the future, time of day kept) | same |
| Projects (pure) | `parseDuration` (now null on junk; the log form keeps its old "→ 60" fallback) / `formatDuration` + tests | `features/projects/duration.ts`, `duration.test.ts` (new) |
| Areas | area page gets the project page's colour swatch row → `recolorArea` (shared `colorRow` in the page) | `ProjectDetailPage.tsx` |
| People | interaction summary click-to-edit; its day → `DateField`; new `updateInteraction` (+ `people.interaction_edited`) | `features/people/PersonDetailPage.tsx`, `api.ts` |
| Activity copy | `routine.updated`, `book.updated`, `project.milestone_reweighted`, `project.checklist_item_renamed`, `people.interaction_edited` + coverage rows | `features/activity/describe.ts`, `describe.test.ts` |

Line endings kept per file (CRLF: `NewRoutineForm.tsx`, `LibraryPage.tsx`, `ProjectDetailPage.tsx`, `PersonDetailPage.tsx`; checked with `git ls-files --eol`).

## Verified

- `npx vitest run`: **1503 passed** (baseline 1484; +19 new). Touched suites also green under TZ = UTC, Africa/Cairo, America/Los_Angeles, Pacific/Kiritimati (PowerShell `$env:TZ`).
- `npm run lint`: 0 errors, no warnings in touched files. `npm run build`: green.
- Real app on the mock backend (`docs/log/assets/edit-after-create/verify.mjs`, dev server `--mode mock` with `app/.env.mock.local`): **25/25 checks**, each asserting the row the outbox actually POSTed — routine ⋯ lists Edit first, form prefilled incl. steps, save upserts the same id with every other field intact; phone name-tap opens the sheet; book pages/year (progress kept), note body, quote author; project target date via the picker, weight 2→3, checklist rename, work duration 90→120 and day moved with time kept, engagement; area recolour; interaction summary + day; no page errors on any page. Screenshots in the same folder (desktop 1280 day, phone 390 day).

Not verified: night theme screenshots, a real signed-in run against Supabase, Safari (see the weight note below).

## Skipped / notes

- **Nothing needed a schema change**, so nothing was skipped for that reason.
- Engagement can be changed but not cleared back to "Standard" — `RenameField` treats an emptied field as "no change" (same as titles). Add an explicit clear if Kai wants it.
- Milestone weight field closes when focus leaves it; on Safari a click on −/+ may not move focus, so there it closes on the first tap (typing a number still works). Chrome/Android/Windows fine.
- Library edit buttons copy the page's existing small "Add" form buttons (under the 44px phone target, same as their neighbours) — part of the Library's design pass, not changed here.
- Routine edit doesn't play the seed-drop animation (that's "planting"); toast says "Routine updated".
