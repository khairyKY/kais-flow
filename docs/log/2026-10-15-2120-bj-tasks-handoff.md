---
date: 2026-10-15
session: bj-tasks (builder, worktree .claude/worktrees/bj-tasks)
type: handoff
related: Bound Journal reskin, design system B (design-export/Design System B.html, Kai's 15 Oct answers)
---

# 2026-10-15 21:20 UTC · handoff · bj-tasks

Branch `claude/bj-tasks`, from `origin/claude/bound-journal` (2c5a66e0). Pushed, not merged, no PR.

## Scope

The tools: Tasks (TasksPage, TaskRow, groups, filters, the bulk bar, the task popover, TaskSheet,
TaskEditorPage, the Move / Plan / Repeat menus), Inbox (Waiting, Snoozed, Dismissed, InboxBulkBar),
the command bar and capture (CommandBar, CaptureButton, the voice sheet, the share page), Search
(page and overlay), the labels picker and manager.

## What changed

- **bound.css folded** for these files: no inline uppercase, 3px corner, one-sided dashed divider,
  tape stripe, sub-degree tilt or terra pill is left in them. The DOM probe over all 58 bjt scenes
  finds bound.css matches only in other areas' components (sidebar / topbar / nav tape, the kit's
  BackLink and BottomSheet footer, calendar/formFields `FLABEL`, MiniFocus, Today's Now card).
  **No bound.css rule was deleted**: every rule is a global attribute selector, and those other
  areas still lean on each of them. The last builder to fold can delete them.
- **D6 section labels** (14px semibold, no rule, the count quiet on the right): Tasks' groups, Done,
  Done today, the Organize cards, the sheet's Subtasks / Schedule, the editor's Linked / Organize /
  Schedule, Inbox's From GitHub and Today / Earlier / Snoozed, Search's groups.
- **D7**: the Organize rail's offset tapes (bound.css missed them: their stripe is 0.30, not 0.32),
  the rail and editor cards' tilt and tape, and every Caveat line in these tools (captions, empty
  states, notes) moved to the interface face.
- **D11 = B**: hand-built secondary buttons → kit `Button variant="secondary"` (Reschedule all to today,
  Someday's → Today / Plan ▾, the editor's Plan ▾, Search's empty-state pills, the voice sheet's
  outlined buttons); the editor's Save → kit primary.
- **D12**: Tasks' domain chips and the editor's Labels / Duration chips are the kit's filter chip
  (visible edge, ink-filled when on).
- **D8**: solid dividers. In Search this also fixed a bound.css side effect: rows drawn
  `border: none; border-bottom: dashed` were forced to `border-style: solid` on all four sides and
  showed a 3px ink frame.
- ds:check: 0 NEW in these files (TaskRow.css's `.kf-swipe-hint` 12px fixed); 45 NEW repo-wide, all elsewhere.

## Judgement calls (Kai's to overrule)

1. Overdue's group label keeps its terra; Search's group labels keep their accent (D6 says ink).
2. Caveat removed from every tool line here (D7 reads "handwriting on pages only"), copy unchanged,
   first letter raised. Includes "Just now ✿", the day-complete line, inbox zero's "one calm bloom ✿".
3. Someday's → Today / Plan ▾ are kit secondary buttons drawn at 32px (as Inbox's `.ib-btn--sm`):
   the kit's 44 squeezed a phone title to one word a line. The 48 touch target stays.
4. The voice sheet's filled button keeps its ink in B's shape (`.kf-voice-ink`); B's primary would be
   terra, right under the terra mic. Its outlined button became the kit's bone secondary.
5. The editor's Save became the kit primary (`--acc-terra-ink`, was `--acc-terra` hand-drawn).
6. Label colour swatches stay squares (3px), not the circles `--radius-sharp` (now 16px) made them,
   so a label still differs from a place's dot.
7. Hand-drawn checkbox look-alikes (done ✓, the quick-add box) keep the kit Checkbox's corner (5 / 4);
   if the kit moves to `--radius-check`, they should follow.
8. Dashed outlines kept where they mean "unset / optional" (TaskChips' unset chips, Inbox's choices,
   "+ Label"); D8 is about dividers.
9. "petals today" under the Done count stays lower-case (reads "2 petals today").
10. Dismissed rows and Search rows stay square-cornered between hairlines (DS B `.row+.row`); a chosen
    Search row takes the 12px corner.
11. Copy written for caps, capitalised: "No project, area or domain", "Via voice", "View on calendar →",
    "Open in inbox →", "+ Label", "Dismissed 4h ago", "Clears after 30 days", "Recently updated first",
    "↵ Quick add · ⌘2 Event", "Labels cut across every domain ✿", "No domain" / "Done" in the rail.

## For other builders / the conductor

- **kit.css** `.kf-chip--bordered { font-size: 9px }` is the old mono-caps size; at Inter it is tiny.
  Overridden locally in TaskChips and Dismissed rows (`fontSize: var(--fs-meta)`); the kit fix is shell's.
- **calendar/formFields.tsx** `FLABEL` (the editor's field labels) is still uppercase inline, patched by
  bound.css rule 1: the calendar builder's file.

## Evidence

- Screens, before → after, day and night (58 shots each, `bjt-*`, `screen-tasks-*`, `screen-inbox-*`):
  `D:\Coding\_claude-cloud\kais-flow-design-brainstorm-2026-10-14\bj-tasks\before\` and `…\after\`
  (`docs/log/assets/bound-journal/verify.mjs`, `ONLY=bjt,screen-tasks,screen-inbox`, 58/58). The before
  `bjt-capture-phone` didn't open the sheet (the scene now taps).
- Old harnesses, all green: fix-tasks 70/70 · fix-inbox 69/69 · task-sheet 149/149 · search-design 62/62 ·
  labels 73/73 · capture-rules 42/42 · keys-undo 60/60 · undo-verbs 88/88 · manual-order 25/25.
  On the base branch task-sheet failed 24, search-design 5, keys-undo 1 (copy compared against caps; c2
  only passed while caps hid the real Calendar section) — expectations now sentence case.
- `npx vitest run` 160 files / 2223 tests; `npm run lint` 0 errors; `npm run build` ok.
