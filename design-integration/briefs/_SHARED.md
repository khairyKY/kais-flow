# Shared brief — every wave agent reads this first

You are one worker in a parallelized botanical UI integration. This file is the
context you share with every other worker. Your per-workstream brief (`<WS>.md`)
adds only what's specific to your surface. **Read both, then build.**

## ⚡ V1 punch-fix mode (2026-07-26) — overrides where it conflicts with the rest of this file

- This is the **v1.0 remediation run** (ship 2026-08-15). You were dispatched
  automatically by the orchestrator into your own worktree; there is no `<WS>.md`
  brief file — **your dispatch prompt IS your brief.**
- **Your DoD source is `design-integration/V1-PUNCHLIST.md`.** Your prompt names your
  punch items; each item's **Judge:** line is your acceptance test. Run it yourself
  before finishing.
- Reading order: dispatch prompt → this file → your punch items → your surface's
  sections in `design-integration/DRIFT-AUDIT.md` (file:line evidence of what's wrong).
- **[K-26] rulings override the export** where they conflict — they're marked in
  `V1-FEATURES.md` and DRIFT-AUDIT's cross-reference table. Everywhere else the
  export stays the pixel contract exactly as below.
- The old `W1-today.md` / `W2-tasks.md` briefs are historical — ignore their scope.
- The "Route transition is automatic" line below predates Foundation F4 (which adds
  the 160ms route cut). After F4 merges, never add your own page-transition motion.
- Undo: Foundation F1 ships `lib/undo.ts` + the toast action slot. Every completing/
  destructive action in your punch items goes through it — never push a bare toast
  for an undoable action.

## The one rule
Reproduce the design export **exactly**. Nothing invented, nothing skipped. The
`.dc.html` file named in your brief is the **pixel contract** — markup, inline
styles, copy strings, layout numbers, colors, tilts come from it verbatim. When
your memory of "how an app usually works" conflicts with the file, the file wins.

**Transcribe, don't interpret (binding, per TEARDOWN.md).** Port the `.dc.html`
markup **node-for-node**: same element tree, same inline style values, same numbers,
same copy. The ONLY allowed substitutions: sample text → real data · static markup →
handlers/loops · `ds/assets/…` → `/ds/assets/…` · the canvas's embedded sidebar/topbar →
omitted (the shell owns them). Restructuring a layout "because React" is a defect.

**Demolition DoD:** delete every file your surface replaces **in the same commit** —
no dead components, no old-skin fallbacks left importable.

## The old UI is dead
Do **not** read, copy, or adapt the pre-existing visual code of the screen you're
rebuilding, and do **not** read any of these superseded docs (they carry stale
tokens/mockups):
`BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md`, `docs/DESIGN_SYSTEM.md`, `SCREENS.md`,
`SCREENS-PART-TWO.md`, `UI_FEATURE_BRIEF.md`, `CLAUDE_CODE_SCREEN_GENERATION_BRIEF.md`,
`docs/phases/P-DESIGN.md`, `design/`, `design-references/`.
What you KEEP from the existing code is strictly invisible: the feature's
`api.ts` / hooks / mutations, pure logic modules, and behavior contracts. You
rebuild the entire *visible* surface from the `.dc.html`.

## What Foundation already gives you (import, never re-implement)
- **Tokens** — `app/src/styles/tokens/*`. Every color/space/type/shadow/motion value
  is a `var(--…)`. Never hard-code a value a token defines. Day + night both covered;
  night flips automatically (`data-theme="night"`), so use tokens and it just works.
- **Assets** — botanical PNGs at `/ds/assets/**` (e.g. `/ds/assets/cherry/bloom.png`).
  The `.dc.html` references `ds/assets/…`; prepend `/`.
- **Component kit** — `app/src/components/kit.tsx`: `Button` (cta/secondary/ghost),
  `Chip` (surface tones), `SectionLabel`, `TapeCard`, `Checkbox` (bloom). Compose these;
  don't reinvent buttons/chips/labels/cards/checkboxes. Living reference: `/design-system`.
- **Shell** — `AppLayout` owns sidebar/topbar/routing/overlays/hotkeys. You render
  inside `<Outlet/>`. Don't touch the shell.
- **Motion** — `app/src/lib/motion.ts`: gate every decorative animation behind
  `useMotionEnabled()`; stagger with `staggerDelay(i)` + `className="kf-stagger-item"`.
  Route transition is automatic. The 22 effect recipes / event motions you need are
  listed in your brief (ported from Effects.dc.html / Motion.dc.html).
- **Theme store** — `app/src/lib/theme.ts` (`useTheme`). Don't add theme controls
  unless your brief says so (W7 owns the Settings control).

## Frozen files — DO NOT EDIT (route changes through the orchestrator)
Editing any of these causes cross-wave merge conflicts. If you truly need a change,
stop and ask the orchestrator for a foundation patch.
- `app/src/styles/tokens/**`, `app/src/index.css`
- `app/src/components/AppLayout.tsx`, `app/src/components/Stub.tsx`, `app/src/components/KitReference.tsx`
- `app/src/components/kit.tsx`
- `app/src/App.tsx` (route registry — orchestrator swaps your stub for your real page)
- `app/src/lib/theme.ts`, `app/src/lib/motion.ts`, `app/src/lib/outbox.ts`,
  `app/src/lib/supabase.ts`, `app/src/lib/queryClient.ts`, `app/src/lib/realtime.ts`,
  `app/src/lib/activity.ts`, `app/src/lib/types.ts` (types are **additive-only** — never edit existing shapes)
- Shared overlays you don't own: `ContextMenu`, `Select`, `Snooze/ScheduleMenu`,
  `ProjectPicker`, `BulkBar`, `ShortcutOverlay`, `useListKeys`, `overlayStack`.
  (Exception: the **R1 overlay-demolition agent** owns the visual rebuild of these
  per TEARDOWN.md; after R1 merges they refreeze. Behavior contracts stay.)

## Your sandbox
You own exactly **your feature folder** (`app/src/features/<feature>/**`) and the files
your brief lists. Don't edit another wave's folder. New shared need → orchestrator.

## Data (real, not sample)
Bind to the real Supabase data via your feature's `api.ts` (TanStack Query hooks +
`writeRow` outbox). The export's sample *states* (inbox-zero, Done petals, empty pots)
become real reachable states of real data. The export's sample *strings* (labels,
empty-state copy, microcopy) are the copy source — copy them verbatim; invent none.
New-surface waves (N*) ship their own migration (uuid/user_id/RLS/updated_at per
`docs/DATA_MODEL.md`) + `api.ts` + `logActivity` events.

## House rules (Design System §06 — binding)
No pure white / hard black · no bright saturated primaries · card radius 3px (never
modern-rounded 16) · tape only on *placed standalone* cards, never plain list rows ·
tilt ±0.3–0.5° sparingly · one terra CTA + one gold Goal card per view · the only
emoji is the ✿ marker · ≤4 section labels per screen · **never show a plant growth
stage that contradicts the data.**

## Growth stages (bind stage → data; assets under /ds/assets)
Terrarium/Today=clover · Hydrangea/Inbox by pending count (zero/light/medium/heavy) ·
Cherry/Tasks by completion (bud/opening/bloom/fallen) · Daisy/Calendar by clock
(morning/midday/evening/past/future) · Fern/Review·Journal·Library by length
(coil/unfurl1/unfurl2/full) · Clover/Chat·People·rituals by attention · Vine/Routines
by streak (bare/sprouting/flowering/lush) · Wisteria/Projects by weighted milestone %
(p0…p100). Your brief names your species + the exact stage→data mapping.

## Definition of done (every workstream)
1. Every option/state in your brief reproduced **pixel-faithful** on **real data**,
   reachable through the affordance the design shows.
2. Day + night both correct (use tokens — verify by toggling `data-theme`).
3. iPhone variant(s) at phone widths if your brief lists them.
4. Copy verbatim from the export.
5. Only Foundation kit/motion/tokens used; no frozen file edited.
6. `npm run build` green; no console errors.
7. Fidelity note in your PR: which `.dc.html` options → which routes, with the
   computed-style / screenshot checks you ran.

## Protocol
- Branch/worktree `ws/<name>` off `feature/botanical-integration`; PR back to it.
- The orchestrator reviews every PR against the pixel contract and owns merges +
  the freeze list. Long-poles (Calendar) merge last.
- **A dev server is already running at `http://localhost:5195`, logged in with real
  data (Kai keeps it up for the duration of this plan).** Use it directly for visual
  QA — screenshot, computed-style checks, day/night toggle, phone-width resize.
  **Do not start your own** (`npm run dev`, `preview_start`, or otherwise) — a second
  instance either fights the port or spawns a redundant process for no reason. If
  `localhost:5195` isn't reachable, say so and fall back to `npm run build` +
  structural/computed-style checks only; don't spend turns fighting a server.
