# Motion lane A1 · lists — handoff (2026-10-28)

Branch `claude/motion-lists` (from `claude/kai-bugs-1012`), worktree `.claude/worktrees/motion-lists`, port 5326.
Brief: `D:\Coding\_claude-cloud\kais-flow-motion-build-brief-2026-10-28.md`. The spec is `design-export/Motion fixes.html` on claude/motion-looks.

- **Shared helpers** were pushed first, at `ec109d52`. `55d91d20` only puts back line endings that `ec109d52` flipped; A2 should merge from `55d91d20` or later.
- **Not merged, not released.**

## The shared helpers (lib/motion.ts + components/Collapse.tsx)

| Helper | What it does |
|---|---|
| `staggerDelay(i)` (T1) | Index capped at 8, so the last row waits 480ms at most. Only staggers inside an 800ms window after a route entry (`markRouteEntry`, called by AppLayout). Rows that mount later wait 0. |
| `useArrivalClass()` (T11) | Returns `kf-row-in` for a row that mounts after that window (capture, Undo, realtime, reopen). |
| `useCompletingRows(leave?, rowEl?)` (T2/T3) | The grace hold Tasks already had (650ms), shared. `hold` / `keep` (Undo) / `rows`. The default exit is `animateRowRemoval`; Today passes a FLIP instead. |
| `cancelRowRemoval` (T5) | An Undo mid-exit now eases the row back (200ms, the exit reversed) instead of snapping. TaskRow also resets `checking` when an Undo clears `completed_at`. |
| `collapseRow` (T7) | After a swipe's fly-off, only the row's height folds (180ms ease-natural). The row is marked so the action's own exit doesn't slide it a second time. |
| `exitOnRemoval(els)` / `exitAll(selector, write)` (T6) | The write is **not** held back. A MutationObserver watches the rows. When the next render takes one off the page (its own node, or the group around it), a still copy (no ids, inert, aria-hidden) goes back where it stood and plays the shared exit, then is removed. Rows the change keeps are never touched, so no page has to say what its list shows. Gives up after 1s. tasks/api uses it for Tomorrow, Plan, bulk dates, Someday, Snooze and Move (menus, keys, bulk bar, drag to sidebar or rail); Inbox, People, facts, Library and Domains use it through `exitAll`. |
| `flip(container, change, selector)` / `flipRows(change)` (T13) | FLIP driven by a MutationObserver: it works whether React renders at once or after TanStack's notify timer. Rows are keyed by `id`, so slot-keyed lists (the Top 3) also glide. |
| `Collapse` (T8) | `grid-template-rows` 0fr↔1fr over `--dur-collapse` on `--ease-standard`. Children unmount once it's shut. `appear` makes a fold that only mounts when opening ease in; `onClosed` fires when it has finished shutting. |
| RM2: one Effects gate | The rule is written at the top of lib/motion: functional motion always plays and is cut or cross-faded under reduced motion; decorative motion needs Effects on. `.motion-on` is now on `<html>`, so portals agree; `kf-motion-on` is kept as an alias and the shell keeps its own `.motion-on`. `reducedMotionNow()` gates functional Web Animations. The overlay card's rise and fade always play; its 0.98 scale only plays with Effects on. |
| RM1 | `scrollBehavior()`. The five JS smooth scrolls (Guide, Inbox, Journal, Project detail, Tasks) now use it. |
| T15 | `LOADER_DELAY` (the loader waits 300ms, then fades in over 160ms) on `Skeleton` and `PageFallback`. `useWasLoading()` gives content that replaces a skeleton a `kf-fade`. |

## Items

| ID | Status | Where |
|---|---|---|
| T1 Tasks stagger cap | built: the cap is in `staggerDelay`, so every caller gets it; later rows have no delay | lib/motion.ts, AppLayout.tsx |
| T2 Project detail / Perennials check moment | built (useCompletingRows; Perennials exits the whole series row `#per-<id>`) | ProjectDetailPage.tsx, PerennialsPage.tsx |
| T3 Today row jumps to the bottom | built: the ticked row keeps its place (list sort and Top 3 order), then FLIPs down | TodayPage.tsx |
| T5 Undo mid-exit | built | lib/motion.ts, TaskRow.tsx |
| T6 "leaves this list" exits | built for every task list (Tomorrow, Plan, Someday, Snooze, Move, bulk, drag to sidebar or rail), Inbox single snooze + every bulk action, People delete + nudge card, person facts ✕, Library remove, Domains delete. A first version held each write back until the exit had played (380ms, as Delete does); fix-inbox caught that as slower bulk actions, so writes now go out at once and the exit plays on a copy. **Not done:** rituals carry-over Drop/choose and inbox-in-ritual (A2's files). | lib/motion.ts, tasks/api.ts, InboxPage.tsx, PeoplePage.tsx, PersonDetailPage.tsx, LibraryPage.tsx, DomainList.tsx |
| T7 swipe commit | built | SwipeRow.tsx |
| T8 Collapse everywhere | built: Today (Also open "Show N more", More for today, both phone folds), SubtaskNest (incl. auto-fold), Tasks DoneView "Earlier this week", Inbox GitHub fold + open GitHub row, sidebar Plan drawer, Trash confirm cards. Today's routine fold-lines no longer exist in code. **Rituals and Weekly Review folds are in A2's files:** A2 wraps them in `Collapse` after merging. | Collapse.tsx/.css + the files listed |
| T11 new rows breathe in | built: Today rows, nested subtasks, Slipping card on Undo, Tasks done rows, WorthALook "1 of 2" cross-fade. Chat bubbles are A2's (Chat). | TodayPage.tsx, TaskFields.tsx, TaskRow.tsx |
| T12 progress hairline | built: Today's Day-card hairline and Projects card bars use scaleX over 300ms ease-out. The other T12 bars (Routines, rituals, Focus) are A2's. | DayCard.tsx, today.css, ProjectsPage.tsx |
| T13 reorders FLIP | built: ⌘↑/↓ (Tasks, Today, Project detail), Alt+↑/↓ and the menu's Move up/down on the Top 3, Top 3 drops, Domain move up/down | motion.ts, TodayPage.tsx, useRowGrammar.tsx, DomainList.tsx |
| T14 sync / offline marks | fade in only (150ms). **Fade out skipped:** it would need each mark kept mounted while it leaves; add it if the cut out shows. | today.css, States.tsx |
| T15 loading handoffs | built: loader delay; content fade on Tasks, Trash and Activity; Activity uses `Skeleton`; Trash's empty state fades in. Inbox has the delay but no content fade (its list is a fragment). | States.tsx, PageFallback.tsx, ActivityPage.tsx, TasksPage.tsx, TrashPage.tsx |
| T16 selection cross-fade | built: the circle fades in going into selection, the checkbox fades back in coming out (120ms) | TaskRow.tsx/.css |
| O9 toast stack slide | built: toasts glide to their new slots (FLIP), and the older toast's dim eases. Keeping toast content during the exit and swipe-to-dismiss are lane C's. | ToastHost.tsx |
| RM1 / RM2 | built (see above) | lib/motion.ts, AppLayout.tsx, xfx.css |
| RM3 dead code | the stale `.kf-overlay-card` copy in xfx.css is deleted. `sheetOut`, `recPulse` and `slideKeyboardUp` are left for lane C (O2/K3 may adopt them). | xfx.css |
| T4, T9, T10, K1, O1, CAL13 | skipped (Kai) | — |

## Evidence

- **Gate** (`gate.ps1`): vitest ×4 TZ 190 files / 2677 tests green, lint 0, build, ds:check 0 new (the Collapse transition is marked `ds-ok`). `birthday_on` 1/1.
- **New unit test:** `staggerDelay` cap and window (lib/motion.test.ts).
- **Harness** `docs/log/assets/motion-lists/verify.mjs <out> http://localhost:5326`. Sections h, g, p, t, x, w, c, f, l, o, n; each item is run with Effects on, Effects off and reduced motion. The checks look at Web Animations and computed height or opacity mid-move, and at the end state.
- **Existing harnesses** re-run against this branch: see the INDEX line.
