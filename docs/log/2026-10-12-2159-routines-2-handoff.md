---
date: 2026-10-12T21:59Z
session: builder (routines-2 — Kai 2026-10-12 "build the unbuilt designs" + "every feature meant to be, no drift from the design system")
type: handoff
related: design-export/Routines.dc.html 2a/2b; 2026-10-12-1758-edit-after-create-handoff.md; 2026-10-12-1910-fix-grammar-handoff.md; 2026-10-12-1922-local-audit-product.md (routine steps row); 2026-10-12-1919-ds-check-audit.md; docs/log/assets/routines-2/
---

# Routines 2: step minutes + total, step reorder, the five-species plant

> **Revised before merge (conductor, 2026-10-12 ~22:15Z):** step minutes moved out of `routines.steps` into a parallel column, `routines.step_minutes` (same migration 0067), so `steps` stays an array of plain strings and builds already installed keep working. The Release order, Data and Gate sections below describe the shipped shape; the first version (minutes inside `steps` as `{text, minutes}`) was never merged.

Branch `claude/routines-2`, cut from `origin/claude/kai-bugs-1012` (c6d3bd18). Pushed, not merged, not deployed. One migration (0067), no edge functions, no new dependencies (`@dnd-kit/core` was already installed — Today's Top 3 drag uses it). Every write still goes through `lib/outbox.ts` `writeRow`.

## Release order

1. `db push` **0067 first.** The new client writes `plant` and `step_minutes` on every routine save; before 0067 PostgREST rejects the unknown columns and the write dead-letters in the outbox.
2. Then the frontend.
3. **Builds already installed (Android / Windows, updated only when their owner checks) keep working**, because `steps` is still the array of strings they read. What an old build does with a routine:
   - **shows** its steps as always (no minutes, no species: it draws the vine);
   - **edits** it: its outbox upserts the row it fetched, so `step_minutes` and `plant` go back unchanged (or, from a copy cached before 0067, are left out and PostgREST leaves them as they are);
   - **plants** one: it gets `plant 'vine'` and `step_minutes []` from the column defaults;
   - **reorders, removes or inserts a step**: `steps` changes but `step_minutes` stays by position, so minutes may then sit on the wrong step (or past the end). Accepted (conductor). The new build reads whatever lines up, treats the rest as no minutes, and its next save rewrites both together.

## What 2a/2b draw, and what was built

| 2a / 2b | Built |
|---|---|
| Each step's "2 min" (2b "2m") | A minutes chip on every step row: typing replaces it, digits only, 1–999, empty = no minutes (`parseMinutes`). |
| "10 min total" (2a: end of the add row; 2b: "Steps · 10 min total") | Both, from `stepsTotal`; hidden while no step has minutes. |
| ⠿ drag handle (2a) | The ⠿ (2a's glyph, `--ink-faint` since `--ink-hairline` fails as text) on every row. **Mouse:** press and move. **Touch:** hold 250 ms, then move (a quick swipe still scrolls the sheet). **Tap / click it:** Move up / Move down / Remove step (ContextMenu on a computer, ActionSheet on a phone). **Keyboard:** ↑/↓ on the handle, Alt+↑/↓ in the step's text; focus follows the step. Right-click a step row (computer) = the same menu. |
| "Its plant" — Vine · Cherry · Fern · Clover · Daisy (2a) | The picker (radio group), 2a's swatches (vine/flowering, cherry/opening, fern/unfurl1, clover/awake, daisy/morning). The form header and the Plant routine button draw the picked species' sprouting stage. |
| ✕ per step (2a) | Kept on desktop. |

**Deviations (recorded in `NewRoutineForm.tsx`'s header):** 2b's phone rows draw no handle and no ✕ — the phone rows carry 2a's ⠿ (the only way to reorder by touch) and its sheet holds Remove step, so the phone row is 2b's plus the handle. 2b's picker shows four tiles and leaves Clover out; the phone shows all five in 2a's order (5 × 60px fit at 390 with no scroll).

**Where the routine's plant now renders its species** (`features/routines/plant.ts`, `plantOf` / `plantSrc`):
- the garden card (Routines page, desktop rail + phone strip) — its species at the streak's stage;
- the streak trellis — its species at its stage in the header, the "grew" marks (the vine keeps its pressed leaves; the others press their flowering drawing), the legend, and the caption ("the cherry held on");
- the New/Edit form header + button.

Every species buckets the streak on the vine's thresholds (`lib/growthStages` `vineStage`: bare 0 · 1–6 · 7–29 · 30+), so two routines with the same streak are always at the same stage. Drawings per stage: vine bare/sprouting/flowering/lush · cherry bud/opening/bloom/bloom · fern coil/unfurl1/unfurl2/full · clover seedling/resting/awake/four_leaf · daisy future/morning/midday/midday (cherry's `fallen` and daisy's `evening`/`past` are their screens' "spent" states, never a growing streak). `lib/growthStages` itself is unchanged.

**Steps made meaningful (the audit's point):** the steps fold under a Routines row reads "3 steps · 10 min ▸" and lists each step with its minutes. **Today's routine rail is unchanged:** Today.dc.html (desktop rail, Today Phone) draws a routine as a box + name only — no plant, no steps — so nothing was added there and Today needed no helper. The ritual flows don't draw routine steps either.

**Not this builder's (left as is, noted):** the sidebar streak widget (`components/AppLayout.tsx`) and Focus's vine (`features/focus/FocusPage.tsx`) show the best streak of any routine, unnamed, as the vine — Routines' page species — not one routine's plant.

## Data

- `routines.plant text not null default 'vine'` + `routines_plant_check` (the five) — `supabase/migrations/0067_routine_plant.sql`. Idempotent (`add column if not exists`).
- `routines.step_minutes jsonb not null default '[]'` + `routines_step_minutes_array` (`jsonb_typeof = 'array'`), same migration: `step_minutes[i]` = minutes of `steps[i]`, or null; `[]` = no step has minutes. `routines.steps` (0028) is unchanged: always plain strings.
- `lib/types.ts`: `Routine.steps?: string[]` (as before), `Routine.step_minutes?`, `Routine.plant?`, `RoutinePlant`.
- Read: `newRoutine.ts` `readSteps(routine)` pairs `steps[i]` with `step_minutes[i]`; a missing, null, short, long or non-array `step_minutes`, or a junk entry, = no minutes there. Defensive: a step stored as `{ text, minutes }` still reads; anything else is skipped. Write: `writeSteps(drafts)` → `{ steps: string[], step_minutes: (number | null)[] }` from the one ordered list (so a reorder moves both together), blanks dropped with their minutes, `[]` when nothing has minutes.
- `docs/DATA_MODEL.md`: the routines row + a "Migration 0067" note.

## ds:check

`npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 NEW in `features/routines`** (was 6: NewRoutineForm ✕ 13px + Cancel 14.5/13; RoutinesPage steps toggle 0.06em, fold 13.5px, "Start a challenge" 0.1em; StreakTrellis ✕ 12px — all now tokens). Every new line uses `--fs-*` / `--ls-*`; the Plant button got the same tokens as Cancel. The 114 NEW hits the run still lists are all in folders this branch didn't touch (tasks, today, trash, …).

## Gate

- `npx vitest run`: **1863 passed** (144 files), +16 tests. `newRoutine.test.ts`: an **old-build row** fixture (string steps, no `step_minutes`) reads with no minutes and saves as strings + `[]`; `steps[i]` + `step_minutes[i]` pairing with short / long / junk lists; object-shaped steps still read; strings + aligned minutes written, blanks dropped with their minutes; round-trip; total; minutes chip; move; a reordered step takes its minutes along in both columns; plant default + pick. New `plant.test.ts`: the five in 2a's order **= 0067's check list**, 0067 adds `step_minutes jsonb not null default '[]'`, stage mapping, every drawing exists in `public/ds/assets`, unknown/absent → vine. Same 1863 green under TZ = UTC, Africa/Cairo, America/Los_Angeles, Pacific/Kiritimati (PowerShell `$env:TZ`).
- `tsc -b`: clean. `npm run lint`: **0 errors** (21 warnings, none in routines). `npm run build`: green.
- PGlite, 0067 run twice: **19/19** (`docs/log/assets/routines-2/0067-pglite-check.mjs` + `.txt`): `plant` text/not null/default vine, old rows vine, each species accepted, `rose` and null rejected; `step_minutes` jsonb/not null/default `[]`, old rows keep their string steps and get `[]`, a non-array and null rejected; the new client's strings + `[2, null, 5]` read back in order; **an old build's upsert** (only the columns it knows) keeps `step_minutes` and `plant`; an old-build reorder leaves `step_minutes` by position (the accepted misalignment); an old-build insert gets `vine` + `[]`; one of each named check after two runs.
- Browser, real app on the mock backend (`docs/log/assets/routines-2/verify.mjs`, dev server from this worktree, `--mode mock`, http://localhost:5259): **45/45**, each write asserted on the row the outbox POSTed:
  - desktop: 2a's sample filled → "10 min total", five tiles with Vine chosen; mouse drag of step 3's ⠿ onto step 1 moves it (minutes travel with it, the drop opens no menu); ↓ on a handle moves it and focus follows; Alt+↑ in a step moves it; clicking the first ⠿ offers Move down / Remove step; Move down; Cherry draws a cherry in the header + button; the planted row has plain-string `steps` in their final order, `step_minutes: [2, 5, 3]` aligned, `plant: 'cherry'`;
  - edit a pre-0067 row (no `plant`, `step_minutes [null, 3]`): prefilled `['Neck rolls' (no minutes), 'Hamstrings & hips' 3]`, opens on Vine, "3 min total" → minutes 4 → "7 min total", Fern → saved over the same id with `steps` still `['Neck rolls', 'Hamstrings & hips']`, `step_minutes: [4, 3]`, `plant: 'fern'`, the rest kept;
  - rendering (day + night): garden cards draw vine/bare (no streak), cherry/bloom (8 d), fern/unfurl1 (2 d), clover/four_leaf (31 d), daisy/midday (12 d); the fold reads "2 steps · 3 min" with "3 min" on its step; an **old-build row** (no `step_minutes`) folds as "1 step" with no minutes; a **short** `step_minutes` (`[10]` for two steps) reads "2 steps · 10 min" with the second step bare; the cherry routine's trellis is headed by its cherry, grows cherry marks (no vine leaves), and the caption names the cherry; the phone clover trellis;
  - phone: "Steps · 10 min total", "2m", no ✕, five tiles inside 390; **hold-and-drag with real touch events** (CDP) moves step 3 to the top and opens no sheet; a quick swipe over the ⠿ moves nothing; a tap on the ⠿ opens Move up / Move down / Remove step; Move up; Daisy → planted row with string `steps` in order, `step_minutes: [2, 5, 3]`, `plant: 'daisy'`;
  - Today desktop + phone render the routine rail; no page errors anywhere.
- Side-by-side vs the export (design | app top | app scrolled to the picker), 1280×800 and 390×844, day and night: `side-by-side-2a-day.png`, `side-by-side-2a-night.png`, `side-by-side-2b-day.png`, `side-by-side-2b-night.png` (the export draws day only; night is the app's tokens).

**Found and fixed on the way:** the desktop New/Edit routine card was taller than the window at the default 125% interface size (`maxHeight: 90dvh` is zoomed) — its header sat above the top edge (visible in the edit-after-create screenshot too). It now caps at `calc(var(--kf-vh) * 0.9)`, the variable NewProjectModal already uses.

**Not verified:** a real signed-in run against Supabase; Safari/iOS touch (Chrome touch emulation only); the Android/Windows shells; an older installed build against the migrated table (its writes are simulated in the PGlite check; the app itself wasn't run).

## Not changed (seen)

- Copy the export has that the form doesn't, outside this scope: 2b's "Repeats · custom" label and its hand note "grows with the streak ✿" (the phone shows 2a's "starts bare, grows with the streak ✿"); 2b's sheet has no reminder / challenge / domain rows (the app keeps them on the phone).
- Routines 3a/3b stay parked (Q6, not built); nothing here scores anything new (no prayer anywhere).
- The fold's ⋯/Edit path is unchanged: steps are edited only in the form.

## Files written

- `supabase/migrations/0067_routine_plant.sql` (new)
- `app/src/features/routines/plant.ts` (new), `plant.test.ts` (new)
- `app/src/features/routines/NewRoutineForm.tsx` (CRLF kept), `RoutinesPage.tsx`, `StreakTrellis.tsx`, `api.ts`, `newRoutine.ts`, `newRoutine.test.ts`
- `app/src/lib/types.ts` (CRLF kept)
- `docs/DATA_MODEL.md` (CRLF kept)
- `docs/log/assets/routines-2/` — `verify.mjs`, `results.json`, `0067-pglite-check.mjs`, `0067-pglite-check.txt`, the screenshots and side-by-sides
- `docs/log/2026-10-12-2159-routines-2-handoff.md` (this), one line in `docs/log/INDEX.md`

## Rerun

```
cd app && npx vite --port 5259 --strictPort --mode mock      # app/.env.mock.local from the main checkout
node docs/log/assets/routines-2/verify.mjs docs/log/assets/routines-2 http://localhost:5259
# 0067: npm i @electric-sql/pglite@0.2 in a scratch dir, copy 0067-pglite-check.mjs there, node 0067-pglite-check.mjs <repo root>
```
