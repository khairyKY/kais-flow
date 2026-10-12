---
date: 2026-10-12T22:17Z
session: builder today-shell (the shell side of Today 2a + the Today follow-ups)
type: handoff
related: design-export/Today.dc.html §2a (sidebar + top bar) · Inbox.dc.html §3a · Navigation Reference · 2026-10-12-2009-fix-today-handoff.md (conflicts 6, 13 + "For Kai to decide") · 2026-10-12-2016-fix-tasks-handoff.md (BulkBar onTop3, claimDayComplete, ⌘↵ leftovers) · 2026-10-12-1919-ds-check-audit.md
supersedes: none
---

# today-shell: Today 2a's sidebar and top bar, one meaning per key, Plan a step in place

Branch `claude/today-shell`, cut from `origin/claude/kai-bugs-1012` (c6d3bd18). Midway, the conductor merged the Labels branch, so `origin/claude/kai-bugs-1012` (8bdfad40) is merged in (afae04e4, no conflicts). Pushed, not merged back, no PR. No migration.

| SHA | What |
|---|---|
| 058a6040 | All app code (shell, Today, the guide line, the ⌘↵ leftovers) |
| c7d734e3 | `today-shell/verify.mjs` (82/82) + `side.mjs`; `fix-today/verify.mjs` f4 and `today-phone/verify.mjs` follow the intended changes |
| afae04e4 | Merge `origin/claude/kai-bugs-1012` (Labels, routines-2, paper-gaps, github-rules, ds-fix-2) |
| 820e44e6 | **L** on Today opens the Label picker, as on Tasks (conductor, mid-task) |
| 5400c79b | `task-sheet/verify.mjs` follows the Label picker (+ its stale desktop step); `today-shell/verify.mjs` covers L (88/88) |
| (this) | this handoff + the INDEX line |

## What changed

### Shell (AppLayout) — Today 2a's sidebar and top bar (fix-today conflict 13)

- **Streak in the sidebar foot, as 2a draws it:** vine, "6-day streak", "best 21 · day 42".
  - It is the same number the removed terrarium band showed: the highest current routine streak. "best" is the best of those streaks. "day N" is `dayOfJourney`, the phone header's "Day N".
  - It is pinned with the footer rows, outside the scrolling nav column. A short window never scrolls it out of view.
  - Before this, it lived at the bottom of the scrolling column. At 1280×800 @125% it sat below the fold, so it showed nowhere.
- **Short sidebar** (1280×800 @125% = 640 layout px): the pinned streak costs ~50px. The short-height container query now tightens the column (top padding, header gap, group-label gap, the streak's own spacing). Tend's five rows stay in view with the Plan drawer open (checked, below).
- **"● synced" on the Settings row**: a mono note with a 6px sage dot. It is its own button beside the link, and it opens the same queue popover, now above the row.
  - Wording: "synced" / "syncing…" / "offline · N" / "N not saved". The dot is hollow when offline and terra when something isn't saved.
  - In the icon rows (a short or collapsed sidebar) only the dot shows, on the gear's corner, with the words as its title.
  - This is the computer's one sync home. The phone keeps the top bar strip, since it has no sidebar.
- **Top bar:**
  - Gone on a computer's **Today** (2a: "Date said three times … Now it's only the H1") and **Inbox** (3a: "The top bar is removed").
  - Kept on every other page, as their frames draw it (Tasks, Calendar, …), but without the sync words. Those are on the Settings row now, so the status shows once.
  - The phone is unchanged: Today and Calendar still draw their own bars.
- **Header:** the app icon (`/icon-192.png`, the same K art as the design's `kai-icon-80`) beside the wordmark. 2a's hand line "a field journal of days ✿" is gone.
- `SyncStatus` is one component (the button and the popover) used in both places. `TopBar` renders it only on a phone.

### Today

- **Keys:**
  - N is New task everywhere (one meaning per key). Only the shell takes `n` now.
  - The Notebook page is **Shift+N**. It is registered in Today's cheatsheet section ("⇧ N  Notebook page").
  - The "Add a task…" pill shows the **N** keycap as 2a draws it.
  - Plain n on Today opens the capture bar.
- **Worth a look:**
  - **Plan a step** opens the capture bar on `#Project ` with the caret after it. Enter files the step into that project.
    - The tag is the first word of the name that the command bar's rule (`#(\S+)`, first project whose name contains it) resolves to *this* project: `todayLayout.projectTag`.
    - An area or a domain has no `#tag` in the command bar, so it still opens its page.
  - **Snooze a week** toasts "Snoozed a week". It is still the review mark, which keeps the card away while the project has been untouched for less than 7 days.
- **Over capacity** imports Plan my day's window (`rituals/ritualLogic` `DAY_FROM` / `DAY_TO`). `todayLayout`'s own `WORK_FROM_MIN` / `WORK_TO_MIN` copy is gone.
- **`claimDayComplete`** keys on the user's day (`zoneDateKey`), not the device's `localDateKey`. Tasks' import of it gets the same fix.
- **Bulk bar Top 3** is wired: `onTop3={bulkTop3}`.
- **L = the Label picker** (conductor, after the Labels merge), wired exactly as on Tasks:
  - the `listShortcuts` `labels` action on the focused row;
  - the bulk map, so L with a selection labels every selected task in one picker (`tasks/LabelPicker`, anchored at the first row);
  - the list keys pause while it's open;
  - the cheatsheet lists "l Labels…" from the same bindings.
- **Day of the journey** lives in `today/journey.ts` (`dayOfJourney` + `firstCreatedAt`), so the shell can import it without `todayLayout`'s graph (that would pull the rrule/pickerMath chunk into the first load). `todayLayout` re-exports `dayOfJourney` for the tray and widgets.
- **Design-system drift in today/: 12 NEW → 0, all with tokens:**
  - `.tp-over` / the Syncing span → `--ls-meta`
  - `.td-date` → `--fs-page-title`
  - `.td-now` → `--radius-sharp`
  - `.td-cap` / `.td-rail-sub` / `.td-goal-tag` → `--ls-mono-tight`
  - `.td-star` → `--fs-body-l`
  - `.td-goal-title` → `--fs-lead` (the token's own "goal-of-day headline")
  - `.td-rit-box` → `--radius-input`
  - the routines link → `--fs-hand`
  - the 15px `.is-pick` rule removed (the 0.5px step to `--fs-body` isn't visible)
- **Header fit:**
  - The date at the page-title token (44, Inbox's choice for the same 40px design header) is wider than 2a's 40.
  - A long date ("Wednesday, September 30") used to run under the pill even at 40.
  - Now the header wraps: the actions drop to their own line only when the date can't share it.
  - At 1280×800 @125% with the sidebar open, Wednesdays wrap. Monday, Tuesday, Thursday and Saturday don't (measured).

### Outside Today

- `guide/articles.ts`: "Settings → **Capture from anywhere**" → "Settings → Advanced → **External capture endpoint**".
- `capture/aiFill.ts` comment and `capture/api.test.ts` test name: "⌘↵" removed.
- **`docs/log/assets/task-sheet/verify.mjs`** (conductor): the step that typed into the removed "+ Label" field now taps the label chip → the Label picker sheet → Create "garage" → a tap on the checked row takes it off.
  - Its desktop step had also gone stale with fix-tasks' task popover: a row opens the popover, Open full ↗ opens the editor. The run crashed there before, so that step is updated too. 149/149.
- **One edit outside my files:** `slipping/api.ts` `markReviewed(row, message = 'Marked reviewed')`. Its toast had no other way to say "Snoozed a week". The default keeps the Weekly Review's wording.

## Decisions (conductor-delegated UX calls; Kai may overrule)

1. **Sync words moved off the desktop top bar** to the Settings row, so the status is said once (2a review note 1, "each lives in one place"). The Tasks/Calendar frames show "Synced ●" in their top bars. That predates 2a and Kai's 2026-10-07 quiet-strip ruling.
2. **Inbox's desktop top bar removed**: 3a says so explicitly. Phone Inbox is unchanged. 3b has no top bar either, but the phone has no other sync home, so it stays. That is the Inbox owner's call.
3. **The workspace · city line stays** under the wordmark: `deviation(2026-10-13 today-shell)`. 2a drops it, but:
   - it is the only place the onboarding workspace answer shows (Onboarding 1b promises it "at the top");
   - with no top bar on Today/Inbox, it is the only place the user's zone shows there.
4. **The streak stays hidden on the collapsed 64px rail**, as before (the rail hides every label).

## Evidence

- **Unit:** `npx vitest run`, under PowerShell `$env:TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo (offsets −180 / 0 / 420 / −540 confirmed). Each gives **146 files / 1909 tests** on the merged tree (143 / 1851 before the merge).
  - New tests: `projectTag` (the first word; skips a word an earlier project holds), `firstCreatedAt`, and `claimDayComplete` keying on a Kiritimati user day. The last one fails with the old device key in all four TZs.
- **Lint:** `npm run lint` → exit 0, 0 errors, 21 warnings (same as base), none in my files.
- **Build:** `npm run build` (tsc -b + vite + PWA) ok.
  - Before the merge, my changes took the main chunk from 387.03 to 390.54 kB (+0.96 kB gzip). The BottomSheet chunk was already a static import of the main chunk.
  - After the merge it is 399.11 kB (the merged branches).
- **ds:check:** `npm run ds:check -- --baseline scripts/ds-baseline.json` → **0 NEW in my files** (today/ had 12; all fixed with tokens). The run still exits 1 on 14 NEW hits in other builders' files on the merged tree (108 before the ds-fix merges). The baseline predates their merges.
- **Browser**, real app on the mock backend:
  - Setup: dev server from this worktree, `--mode mock` (`app/.env.mock.local` copied from the main checkout), http://localhost:5258.
  - Desktop 1280×800 at the 125% default (checked); phone 390×844 with touch.
  - **`today-shell/verify.mjs` → 88/88** (merged tree). Today / Inbox / Tasks / Calendar, day and night:
    - top bar gone (Today, Inbox) or kept without sync words (Tasks, Calendar);
    - "1-day streak / best 1 · day 12" in view; Settings "● synced"; Tend all in view; shell fit; no page errors.
    - Also: a tall window (the labelled foot, "● synced"); offline ("offline", hollow dot, the popover above the row inside the window); the collapsed rail (dot on the gear); the phone Tasks strip says Offline.
    - Keys: the pill keycap is N; the cheatsheet has "n New task" and "⇧ N Notebook page"; N → capture on Today and Tasks; Shift+N → `/notebook?day=today`.
    - Plan a step (Garden club) → "#Garden " with the caret at the end, still on /today → typing + Enter files "Sketch the beds" into Garden club. Snooze a week → "Snoozed a week" (and never "Marked reviewed").
    - Bulk bar: two picks → Top 3 takes both out, with Undo; then an open row → Top 3 puts it in.
    - L: on the focused goal → the picker → Enter creates "errand" on it. With two rows selected → one picker → "calls" goes on both. The cheatsheet shows "l Labels…".
  - **`fix-today/verify.mjs` → 116/116** (was 115). f4 changed: N → the capture bar, Shift+N → the Notebook.
  - **`today-phone/verify.mjs` → 160/160.** Its desktop check now expects no shell top bar on Today.
  - **`task-sheet/verify.mjs` → 149/149** (results + chips/desktop frames in `today-shell/task-sheet/`).
  - All four reran green on the merged tree (afae04e4 + 820e44e6).
  - **Side by side (`side.mjs`):**
    - `side-2a-sidebar.png`: 2a's sidebar | build day @125% | night | tall window.
    - `side-2a-today.png`: 2a | build.
    - `side-pages.png`: Today, Inbox, Tasks and Calendar, day and night.
  - The reruns' `results.json` files sit in `today-shell/fix-today/` and `today-shell/today-phone/`, with the desktop Today frames. Their other screenshots match the originals and aren't committed again.

## Not verified

- Kai's real account and data (mock only), a real phone, the Windows/Android shells, live.
- "day N" in the sidebar is computed at render. It rolls over at midnight on the next re-render (any refetch), not on a timer.
- Plan a step on a project whose every name word is also a date to chrono (e.g. "#May"): the command bar would read it as a date (`ponytail:` note in `projectTag`).

## For Kai to decide

- Keep the workspace · city line (decision 3), or follow 2a and drop it?
- Is a two-line header on long dates acceptable at 1280 @125%? The other option is 2a's 40px (a `ds-ok` exception), which fits everything but "Wednesday, September 30"-length dates.

## Follow-ups for other owners

- **Inbox (phone):** 3b draws no top bar. If it should go, the sync status needs a phone home first, as Today's header line has.
- **ds baseline:** re-snapshot after this wave merges. 14 NEW hits outside today/ are on the base now.
- **TrayFlyout / WidgetBridge** still build "first record" by hand. `today/journey.firstCreatedAt` is there to share.

## Files written (all inside `.claude/worktrees/today-shell/`)

- `app/src/components/AppLayout.tsx`
- `app/src/features/today/TodayPage.tsx`, `today.css`, `todayLayout.ts`, `todayLayout.test.ts`, `dayComplete.ts`, `journey.ts` (new)
- `app/src/features/slipping/api.ts` (one optional parameter)
- `app/src/features/guide/articles.ts`, `app/src/features/capture/aiFill.ts`, `app/src/features/capture/api.test.ts`
- `docs/log/assets/fix-today/verify.mjs`, `docs/log/assets/today-phone/verify.mjs`, `docs/log/assets/task-sheet/verify.mjs`
- `docs/log/assets/today-shell/` (`verify.mjs`, `side.mjs`, screenshots, `results.json`, the reruns' results under `fix-today/`, `today-phone/`, `task-sheet/`)
- `docs/log/2026-10-12-2217-today-shell-handoff.md` (this) + one line in `docs/log/INDEX.md`
- Not committed: `app/.env.mock.local` (copied for the mock server; gitignored)
