---
date: 2026-10-15
session: bj-today (builder, worktree .claude/worktrees/bj-today)
type: handoff
related: Bound Journal reskin (Design System B, Kai's answers of 15 Oct) — area: Today, Focus, the rituals
---

# 2026-10-15 21:22 UTC · handoff · bj-today

Branch `claude/bj-today`, from `origin/claude/bound-journal` (2c5a66e0). Not merged. It merges cleanly with
`origin/claude/bound-journal` as of c518a196 (bj-calendar + bj-tasks in). Only the INDEX line below will need a hand.

## What changed

- **Today** (desktop + phone): the Now card, ritual card, NOW slip, nudge and birthday card are flat 16px tool
  cards; the slip loses its tape and tilt (D4/D7); the goal card stays the one page (6px, gold, tape, tilt, stamp).
  The desktop Overdue fold and "A moment coming" are D6 section labels. Checkbox-likes use `--radius-check`.
  Start focus is the kit secondary. The app's asides are Inter Tight, muted (`.tp-hand` → `.tp-note`).
- **Rituals** (Plan my day, Shut down): D6 section labels (14 semibold ink, no rule), D12 segments (no track,
  ink-filled choice, no check), the desktop panel at `--sheet-radius`, inputs 12. The phone calendar's switches use
  the same `RitualChrome` Segmented, so they follow too.
- **Weekly review**: hand-built terra/secondary buttons → kit B; cards 16, flat, no tape or tilt; rail labels → kit
  SectionLabel; verdict chips D12; CSS-caps copy in sentence case ("13h", not "13H").
- **Focus** (timer, break, stopwatch, settings, dusk garden, MiniFocus, task picker): kit Segmented for the mode,
  kit filter chips for the lengths, kit B buttons everywhere; no washi tape or grain; cards 16, inputs 12, solid
  hairlines, sentence-case metadata.
- **bound.css**: `.tp-tape` and `.washi-tape-settings` deleted from the tape list (folded into their components).
  The global attribute rules are shared with other areas, so they stay; my files no longer depend on them (only
  on `.kf-page`, the page mechanism).

## Judgement calls (Kai's to overrule)

1. **Handwriting off the tools.** D7 + "Caveat only writes on pages" + the brainstorm ("many marginalia → pages
   only"): every Caveat aside in my area is now Inter Tight, ink-muted, untilted, sentence case — Today's "All three
   tended…", the first-visit hint, the day-complete banner, empty/done states, "Day closed"; Focus's lines and the
   dusk garden's captions; Shut down's sign-offs; the weekly review's lines. **Kept**: Kai's own journal lines in
   Shut down's One line (they are page content).
2. **Phone Today row titles were serif 17/600** — `tasks/taskSheet.css`'s `.tp-title` (the popover title) leaked
   into Today's `.tp-title`. A scoped rule in today.css puts them back to the body face (Inter Tight 15). One rule
   to delete if Kai liked the serif.
3. **Start focus**: was 2a's dark ink pill (option D's look, not chosen) → kit B secondary.
4. **Hand-built terra buttons → kit primary**, which paints `--acc-terra-ink` (the kit's primary since before B),
   not `--acc-terra`. Close the week, disabled, is a disabled secondary.
5. **Text actions → kit ghost (terra text, D11 B)**: End early…, Discard, Reset to classic, Open the garden →,
   Reviewed. The dusk garden's "Stay a while" stays a quiet span (terra on the dusk veil would shout).
6. **D12 beyond the chips the spec drew**: Focus lengths and the custom-length field ink-fill when chosen (were
   terra/moss washes); weekly verdicts ink-fill when chosen (others no longer dim), unchosen get the 3:1 edge;
   "Park it" keeps its dashed edge, "Needs a look" its terra wash.
7. **Radii where the spec is silent**: ritual desktop panel 20 (the sheet's desktop form); Focus settings card 16;
   task picker 12 (as the task popover); small links, pressed rows and the drop slot 12; ribbon and mini-timeline
   bars keep their small chart radii.
8. **Section labels**: the weekly rail's "Slipping" loses its terra (D6 = ink); Focus settings' title is a section
   label, its field labels stay quiet metadata.
9. **Dashed → solid** with the same `--line-dashed` colour (what bound.css rendered). Kept dashed: suggested
   times (a proposal), Park it, Sort them, chart marks, the dusk garden's soil line (illustration).
10. **Colour unchanged (D2)**: the Worth a look nudge keeps goal paper (now flat, 16) — a second gold surface
    beside the goal page; the dusk garden keeps its literal palette (`ds-ok` markers).
11. **Copy**: capitalised what was written for CSS caps (Remaining, Recording, Round 1 of 4, Session 2 today, Esc
    leaves quietly, Swept 12:30, Last week…). Left lower case: "of 25 min · …" under the clock (it continues the
    number) and the dusk garden's data captions (from lib/gardenAssets).
12. D13 not built: Replan all stays the B secondary.

## Evidence

- `npx vitest run` 160 files / 2223 tests · `npm run lint` 0 errors · `npm run build` ok ·
  `ds:check --baseline` 0 NEW in today/, focus/, rituals/.
- Harnesses on my dev server (mock, :5288): fix-today 116/116 · rituals 210/210 · day-truth 49/49 ·
  today-phone 160/160 · small-gaps (3) 24/24 · calendar-rail 99/99 · cal-wave2 83/83 · today-shell 78/86.
  - today-shell's 8 fails are one check, "Tend rows all in view" at 1280×800 (the sidebar's Projects row is
    clipped) — the shell's, identical on the base build before my changes.
  - calendar-phone fails 7a/7d on calendar copy and on the strip's old three segments (Lists was added since),
    then times out at its Time row — the calendar builder's harness; the segments' roles and text are unchanged.
- Harness updates (behavioural checks kept): fix-today / today-phone read "1h 20m", "50m", sentence case and a flat
  slip; small-gaps' hint is the interface face, under `.td-now`; today-shell's calendar has no top bar (D10).
- **Screenshots** (local, both themes): `docs/log/assets/bj-today/before/` (base build) and `after/` — 30 each:
  `screen-today-*`, `bj-today-scrolled-phone`, `bj-today-evening-*`, `bj-focus-*`, `bj-focus-settings-desktop`,
  `bj-garden-desktop`, `bj-plan-*`, `bj-shutdown-*`, `bj-review-*`. Scenes: `ONLY=screen-today,bj-` in
  `docs/log/assets/bound-journal/verify.mjs` (new `o.at` sets the clock).
