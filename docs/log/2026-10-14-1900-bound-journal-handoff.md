---
date: 2026-10-14
session: bound-journal (builder, worktree .claude/worktrees/bound-journal)
type: handoff
related: Kai 2026-10-14 "build B in the app from ds-bound, and I want to see all calendar states and formats, and revert the dark mode to the old night light"
---

# 2026-10-14 19:00 UTC · handoff · bound-journal

Branch `claude/bound-journal`, from `claude/kai-bugs-1012`. **Not merged, not released: Kai's explicit OK on the look comes first.**

## What Kai chose

Look direction **B, Bound Journal** (brainstorm: `D:\Coding\_claude-cloud\kais-flow-design-brainstorm-2026-10-14\NOTES.md`): modern **tools**, paper **pages**. Pages = the goal of the day; journal entries, notes and quotes; the herbarium. Everything you operate is a tool (rituals included). Kai's Flow's own tab icons. Inter Tight stays. **Night stays Night Garden** (Kai reverted the Lamplight night). Ruling: borrow Sukoon's craft, never its components.

## What changed

**Design system copy.** `design-export/ds-bound/` = a copy of `design-export/ds/` with B's values; every token name kept, 19 added. `check_contrast.py` gates text ≥4.5:1 and non-text ≥3:1 on every ground, day and night (all pass); `preview.html` shows both themes; `README.md` has the old → new table. `design-export/ds/` is untouched.

**App tokens** (`app/src/styles/tokens/`): the same values. Tools are rounded (`--radius-sharp` → `--radius-card` 16px, inputs 12px, sheets 20px) and flat (`--shadow-card` / `--shadow-crisp` / `--shadow-cta` → none); pages keep a near-square 6px corner and `--shadow-page`. The canvas is cleaner (`--paper-linen` #F2EFE8, surfaces #FBFAF6) and grain lives on pages only. `--font-mono` (the metadata role, 482 inline uses) now reads Inter Tight; the typewriter is `--font-stamp`, for date stamps on pages. Metadata tracking → 0. Night colour values are unchanged.

**`app/src/styles/bound.css`** (imported from `main.tsx`): the rules tokens can't carry, as attribute selectors so ~80 component files stay untouched while other branches edit them. (1) inline `text-transform: uppercase` → sentence case, untracked; (2) `.kf-stamp` keeps the typewriter; (3) inline 3px corners → card / input radius; (4) the app root's grain off, `.kf-page` gets paper, page shadow and grain (the Settings paper-texture slider now sets page grain); (5) tape and the sub-degree tilt only inside `.kf-page`; (6) one-sided dashed dividers → solid outside pages. Its header says how to fold each rule into components later.

**Components.**
- Pages tagged `kf-page`: Today's goal card (phone, desktop, loading), the journal writing / ruled / quote cards, the notebook paper, Library's open note and open quote, Herbarium specimens and both sheets.
- Section labels (`SectionLabel`, Today's `.tp-label` / `.td-cap`) → 14px semibold ink, sentence case, no dashed rule.
- CSS-file and CSS-in-TSX uppercase metadata → sentence case (57 + 20 rule blocks); the goal tags and the notebook stamp keep the typewriter.
- Calendar blocks, slots, ghosts and skeletons → `--radius-block` 12px; the desktop grid card is flat.
- `formatDuration` → "30m" / "1h" / "1h 30m" (no-break space) instead of "30M" / "1H30M"; its test updated.
- Copy written for CSS caps capitalised where it is shown (Library tabs, journal moods, Focus, Routines, Weekly review verdicts and links, Search, Projects, Notebook, the calendar's "All day"). Stored values (review verdicts, moods, the `?tab=` param) are unchanged.
- The phone page title stays 26px: Today's title shares its row with three buttons, and 30px truncated it.

## Evidence

- `npx tsc -b --noEmit` clean; `npx vitest run` 159 files / 2185 tests pass.
- `docs/log/assets/bound-journal/verify.mjs`: one realistic Wednesday (14 Oct, 12:10 Cairo) + its week and month, 35 scenes × day/night = 70 shots, every calendar format (Day, 3 days, Week, Month × desktop/phone) and state (block menu, quick create, drag, +N more, planning mode, loading, block sheet, tap-to-create, tray, empty day) plus 8 screens on both devices. 70/70 on the branch. The same harness on the integration build gives the before shots. `SCAN=caps` lists copy that only read right in caps.
- The old harnesses, run on both builds: SWEEP_RESULTS

## Seen, not caused by B (identical on the integration build)

- Month pills overlap their neighbours' titles on busy weeks.
- Three blocks stacked at 2:45 PM squeeze to unreadable widths on the phone and in Week.
- The Week grid is narrow beside the task rail at 1280px.

## For the conductor

Merge after Kai's OK on the gallery. `bound.css` must load after `index.css` (it does: `main.tsx`). No migrations, no edge functions.
