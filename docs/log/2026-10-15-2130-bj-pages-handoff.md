---
date: 2026-10-15
session: bj-pages (builder, worktree .claude/worktrees/bj-pages)
type: handoff
related: Bound Journal reskin (Design System B, Kai's answers of 15 Oct) — PAGES + TOOLS slice
---

# 2026-10-15 21:30 UTC · handoff · bj-pages

Branch `claude/bj-pages`, from `origin/claude/bound-journal`. Pushed, **not merged, no PR**.

## Scope

- **Pages** (paper: 6px corner, page edge, page shadow, grain via `.kf-page`, tape and tilt allowed, Caveat, the Courier Prime stamp): Journal (writing card, quote cards, photos), Notebook paper, Library open note / open quote (phone and computer), Herbarium (specimens, the open specimen, the press).
- **Tools** (flat, rounded, solid hairlines, no tape / tilt / grain / handwriting): Journal around its pages, Library lists and books, Projects, Areas, Domains (DomainList row), ProjectDetail (milestones, checklist, templates, activity), NewProjectModal, ConfirmCard, Routines (+ New routine form, trellis), People, PersonDetail.

## bound.css

Deleted (their only targets were my pages, now painted in the components):
- `.kf-stamp` — moved to `features/projects/xfx.css` (imported by every page in this slice) without the `!important`s; used for page date stamps.
- `.kf-page[style*="var(--paper-parchment)"]`, `.kf-page[style*="var(--line-card)"]`, and the `.kf-page:not(goal):not(popover)` page shadow.

Kept: `.kf-page` corner + grain `::after` (Today's goal card still uses them) and the global attribute rules (caps, 3px, tool tape / tilt, dashed, terra pill, tabular-nums). Nothing in this slice relies on them any more: no inline caps, 3px corners, tool tape or tilt, dashed tool rules or terra pills are left in these files.

## Judgement calls (Kai's to overrule)

1. **Kit B for terra buttons too.** Hand-built terra CTAs became the kit `Button` (Herbarium Press it, Journal ＋ New entry, Library + Add book / Add / + Plant a book, Projects + New project / + Plant the first one / Log, Routines ＋ New routine / Plant routine, People + New person / Add fact / Log, ConfirmCard). The kit draws `--acc-terra-ink`: by day one step darker than the old `--acc-terra` pills (#9C5139 vs #B5654A, AA on cream); identical at night. The phone "+" buttons (Projects, People) take the same ink. Small inline "Add" buttons (milestone, checklist, library forms) keep their size and `--acc-terra`, with B's 12px corner.
2. **Handwriting off the tools (D7).** Caveat lines that sat on tools are Inter Tight muted now, copy kept: Journal's "A quiet page, only for you ✿" and its empty / offline lines, Library aside and book footnotes, Projects, ProjectDetail, NewProjectModal, Routines, New routine, the trellis caption, People, PersonDetail. Kept on pages: journal thoughts, specimen names, the notebook — and the Herbarium header line, since D1 lists the herbarium as a page.
3. **Section labels (D6)** go through the kit `SectionLabel` (14px semibold ink, no rule), including the Journal's buttercream "Today's prompt" / "Three small things". Accent label text the previous pass kept (Active sage, Say hi clover, routine groups sage, commentary buttercream) stays.
4. **Selection (D12).** Kit segmented control for: phone Journal / Notes / Quotes, phone Library Notes / Quotes / Books, Projects List / Board, Work / 📌 Update, Time of day, Repeats — natural width (they were full-width tabs). Mood is the kit filter chip (ink when on; the "✿" prefix on the chosen mood is gone). Moss selection kept where it is the surface's own accent: NewProjectModal type cards, the plant picker, routine weekday cells.
5. **Desktop Library reader is a page now** — the open note / quote sits on page paper with its shadow and grain (it was a buttercream left rule on the canvas); commentary below stays a tool. No tape added to Library pages (D1 says "maybe"); the Journal's tapes stay.
6. **Stamps** (Courier Prime caps): a journal entry's time, the phone Library page's date, a specimen's number, the press ledger's dates / hours. The specimen card ledger stays metadata.
7. **Corners.** Tool cards 16 (incl. desktop dialogs NewProject / NewRoutine / ConfirmCard / trellis — D3 says sheets 20; I kept 16 for centred dialogs), rows and inputs 12 (incl. 6/8px inputs bound.css never touched), board column 16 (Projects.dc.html's 10 retired), board cards 12, checkbox 7, notebook "on paper" stamp 2px, photos on a page 6. The routine Challenge card keeps its gold paper but is a flat 16px tool (no tape, tilt or goal shadow).
8. **Type tokens.** Literal font sizes on every edited line snapped to `--fs-*` (13 → 13.5 body-s, 11 → mono-l, 15 → body…); the journal's writing type is `--fs-body` on a phone (15, was 14.5) and `--fs-body-l` on a computer (16, was 15.5). Metadata tracking dropped everywhere it was literal (D5); tabular figures still come from bound.css.
9. **Copy for caps → sentence case**: Slipping, Retainer, Area, Target, Done, Restore, Weight, Edit, Use, Save as template, + Add task, One-shot / Task-linked, Update, Manual, Renews, Tended…, Log a call, Met in person, Text, Later, Yearly ✓, Once, ↻ Recurs, Edit person ▸, Today / Yesterday, Day streak, Last 14 days, Grew / Rained, held / Broke, + Quote / + Note / Log a session / Mark finished, Quotes shelf, Back to list, Plant a book, All domains, ← Back to active, Plant area / Plant project, Engagement model / client. Stored values unchanged.
10. **Shared bits outside the slice that changed look:** ConfirmCard (also used by Settings, Sign out, Import) now has kit buttons; DomainList rows (Tasks sidebar, Settings) are 12px. `.kf-lift-tilt` was deleted from xfx.css (no users left); `main.tsx`'s comment still names it.

## Evidence

- `docs/log/assets/bound-journal/verify.mjs` gained bj-pages scenes (`page-*`: projects, project, routines, people, person, lib-note / lib-quote / lib-book, new project), with their own rows via `o.rows` so the shared screens are untouched. Before / after, day and Night Garden: `docs/log/assets/bj-pages/before/` and `docs/log/assets/bj-pages/after/` (webp).
- Harnesses (mock server, port 5291): RESULTS
- Updated for B's copy and shapes (behaviour checks kept): journal-media (the phone footer links are one 12.5px line, 18.8px), notebook-page (page paper `#FBF5E6`, n2 / n6), routines-2 (plant labels in sentence case), fix-grammar (fact "Edit"), edit-after-create (`/^edit$/i`).
- `npx vitest run` 160 files / 2223 tests; `npm run lint` 0 errors (22 warnings, all pre-existing); `npm run build` ok; `npm run ds:check -- --baseline` 0 NEW in this slice's files (the two NEW in bound.css predate it).

## Seen, not mine

- fix-grammar: 4 Settings checks (Resurfacing card, importer, capture key in Advanced ×2) fail on the base branch too.
