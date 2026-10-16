---
date: 2026-10-16
session: bj-final (builder, worktree .claude/worktrees/bj-final, branch claude/bj-final from claude/bound-journal e2014e10)
type: handoff
related: the Bound Journal reskin (Design System B), its five area handoffs of 15 Oct
---

# 2026-10-16 14:51 · handoff · bj-final

The last pass of the Bound Journal reskin. Branch `claude/bj-final` is pushed. Not merged, and there is no PR.

## Items

1. **D13 call sites: none shipped (contrast).** By day, tonal text (`--acc-terra-ink` on `--wash-terra`)
   measures 4.64:1 on parchment, 4.42 on bone and 4.17 on the linen canvas. Night Garden passes everywhere.
   Every call site sits on the bare canvas or on a hovered bone row:
   - Today's Replan all ▾ (phone and computer).
   - The calendar rail's Plan ▾ (it shows on a hovered row; the tray's rows hover bone too).
   - Tasks' Someday Plan ▾, and Reschedule all to today.

   So each stays the B secondary, with a comment at the site. Today rows have no Plan ▾. The shell had
   made every EmptyState suggestion tonal. Two of them are on the canvas (an empty Today on a phone, a
   missing task's page), so those two now pass `variant="secondary"`. A clear calendar day and a task
   deleted elsewhere sit on parchment and stay tonal. A stronger wash makes this worse: a darker fill
   under the same ink. That is the question for Kai below.
2. **Leftovers.**
   - `paper.css`: the 5 NEW hits take tokens with exactly the same value (12 → `--fs-tab-label`,
     14 → `--fs-section`), so nothing moves.
   - `tray.css` is now a tool:
     - no grain;
     - a 16px Now card;
     - 12px field, icon buttons and buttons;
     - the B flat bone secondary;
     - the empty line in the UI face;
     - "Top 3" as a D6 section label.
   - LabelManager had nothing left to fix: bj-tasks (33fb2008) had already moved `.lm-foot` off Caveat.
   - ds:check: 0 NEW. The baseline went from 1398 to 786.
3. **Harnesses.**
   - calendar-phone: 176/176 on today's UI.
   - desktop-polish: 150/150. The project-menu check was **stale**: "Finish & press" became "Finish" on
     purpose in 4784af36.
4. **Full pass** (mock, :5293, 3 lanes, then each failure re-run alone). The counts are below.
5. **The review page:** `design-export/Bound Journal review.html`, opened from disk. Its shots are in
   `design-export/bound-review/` (136 webp, 2.9 MB). Every area is shown before and after, day and Night
   Garden, computer and phone. Each builder's calls have Approve / Overrule / Note, there is a
   "Copy my answers" button, and the D13 question sits at the top.

## Real bugs fixed

- **Make goal on a task dated another day** (plan-replan): with a full Top 3, the swap took the last pick
  out, and then the outbox's Top 3 rule handed the new goal's star straight back. `makeGoalWithUndo` now
  brings the task to today at its own time, as `flipTop3` does. The test is in `api.plan.test.ts`; its
  writeRow stand-in now applies `releaseTop3`.
- **Quick create on a phone** (calendar-phone 7c): with the keyboard up, the tapped slot was drawn over
  the sheet's chips until the first keystroke. `Held` now re-measures on a visualViewport resize.
- **Paper capture's desktop key hint** was 11px. It is now `--fs-meta`, B's metadata size (D5).

## Stale checks updated

All behaviour checks are kept. The app had changed on purpose:

- capture-anywhere and mcp: the confirm on "Turn off", the key's move to Advanced, mcp `scopes`.
- day-truth: the challenge card has no tape.
- capture-type: Today 2a's "Add a task…" pill.
- importers: the kit Select.
- paper-capture, tray-notify, user-tz: sentence case.
- gestures: the desktop menu shows Tomorrow first and has Labels.
- small-gaps:
  - the v1.1.10 onboarding rule;
  - Manage labels…;
  - a 22.75px chip at 12.5px phone metadata.
- tasks-noise:
  - /planning is gone;
  - on a computer, the sync status is on the sidebar;
  - the bulk bar has Top 3 and More.
- plan-replan: Today 2a's labels, Tomorrow first, B's 44px buttons on a phone (48px hit area).
- phone-taps: "Add a thought".

## Suite counts (final)

bound-journal 260/260 · first-run 407/407 · resurface-chat 292/292 · rituals 210/210 · calendar-phone 176/176 ·
today-phone 160/160 · task-sheet 149/149 · desktop-polish 150/150 · google-sync 101/101 · calendar-rail 99/99 ·
cal-rail-drop 33/33 · cal-keys 69/69 · cal-wave2 83/83 · capture-anywhere 30/30 · capture-rules 42/42 ·
cleanup 21/21 · download-bar 49/49 · day-truth 49/49 · edit-after-create 25/25 · capture-type 100/100 ·
event-detail 68/68 · event-reminders 37/37 · fix-inbox 69/69 · fix-tasks 70/70 · fix-grammar 97/97 ·
gestures 100/100 · github-rules 53/53 · importers 99/99 · journal-media 123/123 · kit-sheets 117/117 ·
keys-undo 60/60 · manual-order 25/25 · fix-today 116/116 · mcp 35/35 · labels 73/73 · mcp-full 22/22 ·
notebook-page 83/83 · motion 48/48 · notify-fix 26/26 · night (checks) 57/57 · paper-gaps 80/80 ·
paper-capture 122/122 · pickers 122/122 · plan-replan 103/103 · polish 62/62 · phone-polish 718/718 ·
routines-2 45/45 · projects-fixes 222/222 · resurface 320/320 · search-design 62/62 · sounds 126/126 ·
templates 33/33 · small-gaps 154/154 · time-slots 52/52 · today-shell 86/86 · tasks-noise 202/202 ·
tour 123/123 · tray-notices 59/59 · tray-notify 57/57 · undo-verbs 88/88 · user-tz 33/33.

A few suites need a note:

- **p7e-audit, 17/18 (exits 0).** The one is an audit "gap" that has since been closed: recurrence is
  now parsed.
- **ds-fix-3 and phone-taps** are shot-and-diff proofs. Their `shots` ran clean (96 and 58 views). A
  `diff` against old trees is meaningless after a reskin.
- **gestures, kit-sheets and pickers** import a bare `playwright-core`. They ran from a scratch copy
  sitting beside a `node_modules` junction.
- **small-gaps** had one night routine flake under load. It passed alone.

## Gate

`npx vitest run`: 162 files, 2227 tests. `npm run lint`: 0 errors (warnings were already there).
`npm run build`: ok. ds:check: 0 NEW. The server is stopped.

## For Kai

- **Q1 (D13):** where should tonal go, given it fails AA on the canvas?
  - A: put these actions on a card.
  - B: a lighter wash (5% passes, but barely shows).
  - C: a deeper terra for tonal text (a new colour).
  - D: keep the bone secondary there.
- **The builders' calls** are on the review page to approve or overrule. bj-final adds two of its own:
  the tray flyout's look, and Paper's 12px metadata.
