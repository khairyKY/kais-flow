---
date: 2026-09-28T08:27+03:00
session: Wave N builder F (Today on the phone)
type: handoff
related: design-export/SCREENS-2026-09-28.md §Today Phone + §Decisions → Today (rulings 1–8) · design-export/Today Phone.dc.html 2a–2n · MK Now Card / Now Entry Options 1b · MK Workload · MK States · DS-CHANGELOG §3
---

# Today on the phone: the NOW slip, each item once, one screen from the drawing

Branch `claude/today-phone`, cut from `origin/claude/wave-l` (62db1fc). Not merged, not deployed. Picker files (ScheduleMenu, SnoozeMenu, TimeField, formFields, TaskMenu, useRowGrammar, ActionSheet, BottomSheet, ContextMenu …) untouched — Today only imports them.

## What changed

- **Selection logic, pure and tested** (`features/today/todayLayout.ts` + 36 tests):
  - `runningBlock`: the slip's block is a timed calendar block with start ≤ now < end whose task (if any) isn't done. Overlaps → the one that started last. This is the same "running" the app already used (`upNext.isInProgress`, the "Now" label). The focus timer is not a trigger.
  - `topCard`: slip, or the ritual card (plan / shutdown / closed), never both. Nothing during the day. Nothing on an empty day.
  - `upNextItems`: what's running or still to come today, minus the slip's block and any block of a Top 3 task.
  - `blockOf` + `blockMeta`: a Top 3 task shows its block on its own row, as "13:30–15:00 · 1H30M", "· starts in 20M" within 30 minutes, or "· Now" while it runs.
  - `eventMetas`: event-row meta. Each row shows its length; the first one still to come also shows "in 1H20M".
  - `foldOpen`: today's rows minus Top 3, the slip and Up next.
  - `remainingWork` + `workloadLine`: the header line, one per state (below).
  - `dayOfJourney`: "Day N" counted in Cairo calendar days. The old count rounded elapsed time, so it could jump by one partway through a day.
- **Phone Today** (`TodayPage.tsx`, < 768px), in order:
  - **MK top bar.** Serif 26 date, search, ⋯. It sticks at the top. Scrolled, it switches to Inter 18/600 on linen (ruling 7).
    - Search opens the shell's search overlay through a `kf-open-search` window event. That listener is the only change in `AppLayout.tsx`.
    - ⋯ opens an action sheet with Morning ritual and Evening ritual plus their progress. This keeps the Day card's "either ritual one tap away" rule.
    - The shell's mono sync strip is hidden on this page only (`.app-shell:has(.tp)`). Sync state moves into the page.
  - **Workload line** (ruling 1). One text per state:

    | State | Line |
    |---|---|
    | Plan | not planned yet |
    | During the day, nothing done | ~5h planned · you'll finish ~HH:MM |
    | During the day, something done | ~3h left · you'll finish ~HH:MM |
    | All of the Top 3 done | all three done by HH:MM |
    | Shut down | 2 of 3 done · 2h 10m focused |
    | Day closed | 4 done · 2h 10m focused |
    | Empty day | a fresh page |

    - "Focused" is today's `time_entries` total (the existing `useTimeEntries`).
    - A Syncing dot shows while cached data refetches.
    - Offline, the OfflineChip replaces the line.
  - **NOW slip** (MK 11 / 1b):
    - Taped, tilted −0.3°, with a conic time ring that shows minutes left.
    - The caption reads "NOW · UNTIL 10:30". The title wraps.
    - The ✓ is a 40 circle in a 48 target. It completes the task with the usual Done + Undo.
    - Tap opens the task. It uses the task-row grammar (swipe, ⋯, hold), with the block's own Tomorrow and Unschedule.
  - **Ritual card** (`DayCard.tsx` `RitualCard`, ruling 2):
    - Flat, with a 44 glyph, a caption, a title and meta. One secondary action sits on the right: Plan, Shut down, or Resume (Resume adds a hairline).
    - Day closed shows "N seeds planted for Mon" and the Caveat sign-off, with no action.
    - The sun is now fully token-coloured.
  - **Top 3**:
    - Kit goal card: gold tag, 22 gold box, serif 18/600, gold meta, clover (awake, or four-leaf once done). It carries its block time.
    - Kit task rows: check 48, title 15/20, mono meta, star 48, ⋯ 48, min-height 56. A done pick keeps its filled star and shows "Done 11:05".
    - 2i adds the "All three tended. The rest is extra ✿" line with the four-leaf clover.
  - **Up next**:
    - A plain event is an event row (ruling 5): mono time, 3px lavender rule, title and meta, min-height 56, tap opens the calendar, no checkbox and no ⋯.
    - A task's block is that task's kit row with its time in the meta (see Deviations).
    - When empty it shows "Nothing else on the calendar today" (ruling 6).
  - **Routines** as kit rows.
  - **The fold.** "More for today · N" with a chevron. Inside, mono sub-headers Open · Slipping · From a while ago (ruling 7). That keeps the page at 4 section labels.
  - **Page states:**
    - Loading with no cache (2g): kit skeleton rows, and the goal card's loading state (tag, gold box, skeleton title).
    - Error with no data: ErrorCard + Retry.
    - Empty day (2f): the seedling, one line, and a secondary "Add your first three things" button that opens capture (ruling 8).
    - Offline (2h): an unsynced row carries the "Pending sync" ring.
  - **Re-tapping the Today tab** scrolls to the top. This was already in `MobileTabBar`; the browser pass verifies it.
- **Shared with desktop:**
  - Up next skips Top 3 blocks, and Top 3 rows and the goal card show their block time (each item once).
  - The page reads one minute clock from the new `useDay.ts` hook, lifted out of `DayCard`. Desktop's Day card uses the same state.
  - **`dayPhase`:** a finished Top 3 no longer triggers Shut down before 18:00. It counts as "planned" instead (2i draws a quiet line at 16:20, not a prompt). `dayPhase.test.ts` was updated to match.
  - Everything else on desktop keeps its layout.
- **Deleted or replaced:**
  - Removed: the phone-only header (cherry glyph), the phone terrarium band, the `compact` branches of `DayCard`/`Shell`, the `UpNextList` wrapper, and Today's private `useIsMobile` (it now uses the kit's).
  - Moved: Journal's private `useOnline` became `lib/useOnline.ts` and is shared with Today.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 64 files / 849 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (base 63 / 812; +1 file, +37 tests: `todayLayout.test.ts` 36, `dayPhase.test.ts` +1).
  - `npm run lint`: 0 errors, 25 warnings (same as base, none in touched files).
  - `npm run build`: ok.
- **Browser** (Playwright + system Chrome, real CDP touch, mocked backend as in builder D's recipe; `docs/log/assets/today-phone/verify.mjs`): **153/153**.
  - Setup: the real `/today` page at 390×844 touch. The browser clock is set to each scene's Cairo time. The design's sample day is served as REST rows: Sunday 27 Sep, Day 84, the four blocks, Review Kai 64 days overdue, and so on.
  - Phone checks, day: 2a, 2b, 2c, 2d, 2e, 2f, 2g, 2h, 2i, 2m, 2n.
  - Phone checks, night: 2j, 2k, 2l.
  - Every phone scene also checks: no horizontal scroll, no text under 12px, the shell strip hidden, and no page errors.
  - Specific checks:
    - Plan sits to the right of the card text, and the card is flat.
    - 4 section labels.
    - Up next lists (2a: deep work, call, gym; 2b: call, gym).
    - Slip caption and ring (50M). Tilt and tape. ✓ is 48/40. ✓ gives Done + Undo, and the slip leaves.
    - Header text per state.
    - Day closed: seeds and sign-off, no button.
    - A check keeps the row struck, with Undo.
    - Shut down opens the evening ritual.
    - Empty-day button is secondary and opens capture.
    - Skeletons and the goal-card loading state.
    - Cache paints at once, with the Syncing dot.
    - Offline chip, and "Pending sync" on a row checked offline.
    - Fold sub-headers.
    - Small title pinned when scrolled. Re-tapping Today returns to the top at 26px.
    - ⋯ lists both rituals. Search opens the shell's search.
  - Desktop 1280, day + night (2a, 2b): the desktop layout and shell strip are intact, the Day card reads Plan your day, the running block reads "Now" in Up next with no slip, the goal card shows its block time, and there are no errors.
  - Screenshots: `2a…2n-{day,night}.png`, `2b/2k-*-slip-done.png`, `desktop-*.png`, and `side-<frame>.png` (design frame | build, same state) for 13 frames.

## Deviations

- **A task-backed block in Up next is a task row, not an event row.** Kai's "a task as a task row, an event as an event row" rule and "keep every write path" together mean it needs its checkbox. So it is the kit task row with its time as the first meta ("09:00–10:30 · 1H30M · IN 1H20M"). The drawing's Up next only has events.
- **A plain event running** gets the slip with no ✓: there is nothing to complete. Tapping it opens the calendar. The kit has an `action: 'none'` slip for this.
- **The slip is phone only.** On desktop the running block stays in Up next, reading "Now". Desktop keeps its layout.
- **Shell sync strip hidden on phone Today.** The drawing has no strip. Sync lives in the header (Syncing dot / offline chip). The strip's queue popover isn't reachable from phone Today. Every other page keeps the strip.
- **Top bar ⋯ holds Morning ritual / Evening ritual.** The drawing doesn't say what ⋯ holds. This keeps the old Day card links' promise.
- **Routines** keep all of today's time groups under mono sub-labels, with the label "Routines · 1/5". The drawing shows only the current group ("Routines · Morning 1/3"), which would hide the evening set in the morning. This is Kai's call.
- **Fold Slipping / From a while ago** reuse the existing `SlippingCard` and `ResurfaceCard`. The drawing has a slimmer Slipping row with a chevron.
- **"Seeded last night"** in the goal meta (2a) isn't drawn from data. The meta is the block time, else project · duration.
- **Row order:** done rows sort after open ones (the existing A3 rule). The drawing keeps Review Kai (done) above the open row.
- **dayPhase:** a finished Top 3 before 18:00 no longer prompts Shut down (Loop A had "every picked Top 3 done → shut down"). This follows drawing 2i.

## Risks / not done

- **The page re-renders every minute.** The minute clock now lives in `useDay`, called by the page, so the slip ring, Up next and the header stay in step. This is cheap on the data sizes seen, but it is a whole-page render.
- **"You'll finish" is simple.** It is now + remaining work, but never before the last block ends, rounded up to 10 minutes. It ignores gaps and overlaps, and all-open tasks outside Top 3 don't count.
- **Not checked on hardware:** real device feel (sticky bar under the Android status inset, haptics on the slip's swipe).
- `:has()` hides the shell strip. It is supported in current Chrome/WebView and Safari; an older WebView would show the strip, which is harmless.
- **Other phone pages** still show the mono sync strip rather than a kit top bar. Lifting `PhoneBar` into the shell is the conductor's call.
- No `docs/log/INDEX.md` line and no ROADMAP edit (parallel builders; the conductor adds them).
