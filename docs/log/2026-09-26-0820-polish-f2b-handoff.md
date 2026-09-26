---
date: 2026-09-26 08:20 UTC
session: polish-f2b-worker
type: handoff
related: polish-d-followups (2026-09-26-0724-bohr-decision-polish-d-followups.md), conductor-decides (2026-09-26-0642-bohr-decision-conductor-decides.md), T-4
---

# Polish F2b: calendar, phone scale, Inbox and Review · handoff

Branch `claude/polish-f2b`, cut from `origin/claude/release-1` at `ddfb21a`. I pushed after every item. Nothing is merged and there is no PR.

Screenshots and raw run output are in `docs/log/assets/polish-f2b/`. Files are named `<item>-<surface>-<before|after>-<theme>-<viewport>.png` and `<item>-run-<before|after>.json`.

| Commit | Item |
|---|---|
| `94262f8` | 1 · Phones and touch-first screens default to 100% UI scale; computers keep 125% |
| `c07ca9c` | 2 · The calendar block you just dropped stays visible until the next interaction |
| `09a36ef` | 3 · Phone calendar opens with the Unscheduled rail folded, and a 1-hour lead |
| `8d54f3b` | 4 · A calendar left open past Cairo midnight rolls over to the new day by itself |
| `a7f6f1e` | 5 · Calendar QuickCreate reads typed times as Cairo (T-4) |
| `1e7eabf` | 6 · Calendar completions toast "Done" with Undo |
| `5ab333b` | 7 · The phone Inbox card gives its text the full width (Inbox.dc.html 1c) |
| `2c03aa6` | 8 · The Weekly Review routine trellis is readable at 1280 and on a phone |
| `9314bdf` | 9 · Command bar and onboarding shortcut hints are keycaps |
| (this entry) | handoff |

**Files changed (19).** None of them is on the don't-touch list:
- `index.html`
- `lib/uiScale.ts` (+ test)
- `features/settings/SettingsPage.tsx`
- `features/calendar/`: CalendarGrid, CalendarPage, EventDetailsPanel, QuickCreate, eventTime (+ test), gridClock (+ test), overlapLayout (+ test), and the new `useDayRollover.ts`
- `features/inbox/InboxPage.tsx`
- `features/rituals/WeeklyReviewPage.tsx`
- `features/command-bar/CommandBar.tsx`
- `features/onboarding/OnboardingPage.tsx`

I did not touch `PlanningBoard.tsx` or `TaskEditorPage.tsx`; they belong to F2a.

**Line endings are preserved.** For `CalendarGrid.tsx`, `CommandBar.tsx`, `InboxPage.tsx`, `WeeklyReviewPage.tsx` and `SettingsPage.tsx`, I checked every added line in `git diff | cat -A` for the CRLF ending. The other files stay LF.

## 1. Default UI scale per device

**Change**
- `lib/uiScale.ts` gains three pure functions:
  - `defaultUiScale({ coarsePointer, screenShortSide })` returns **1** (100%) when the primary pointer is coarse **or** the screen's short side is under 600 CSS px. Otherwise it returns **1.25**.
  - `resolveUiScale(stored, env)`: a saved `kf_ui_scale` always wins; anything else gets the device default.
  - `readUiScaleEnv()` reads `matchMedia('(pointer: coarse)')` and `screen`.
- `DEFAULT_UI_SCALE` is replaced by `DESKTOP_UI_SCALE` and `TOUCH_UI_SCALE`. Nothing else imported it.
- `index.html`'s pre-paint script repeats the same rule in ES5. Its `localStorage` read now has its own `try`, so blocked storage still gets the device default instead of no zoom.
- `uiScale.test.ts` (9 tests) covers:
  - the rule;
  - "saved wins";
  - a **sync test** that runs the real pre-paint `<script>` from `index.html?raw` against stubbed globals. It checks that the script applies exactly what `resolveUiScale` picks for 6 devices × 8 saved values, including blocked storage.
- Settings: the scale control already reads `useUiScale`, which now resolves the device default, so it shows the right value. Its caption now reads "scales the whole app · 125% is this device's normal" (100% on a touch device). The segmented buttons carry `aria-pressed`.

**Evidence** (`scaleprobe`, preview builds; the before build is base `ddfb21a`)

| Device | Before: zoom / layout width | After |
|---|---|---|
| phone 390 (isMobile, touch) | 1.25 / 312 | **1 / 390** |
| tablet 820 (isMobile, touch) | 1.25 / 656 | **1 / 820** |
| desktop 1280 | 1.25 / 1024 | 1.25 / 1024 |
| desktop, 700px window on a 1920 screen | 1.25 / 560 | 1.25 / 560 (screen-based, so resizing never flips it) |
| phone 390 with a saved 125% | 1.25 / 312 | 1.25 / 312 (saved wins) |
| desktop 1280 with a saved 100% | 1 / 1280 | 1 / 1280 |

- On desktop, Settings shows **125%** selected (before and after).
- Phone shots before/after, all at 390 with isMobile and hasTouch: Today, Tasks, Inbox, Calendar and the More sheet (`1-{today,tasks,inbox,calendar,more-sheet}-{before,after}-day-p390.png`).
- Settings row: `1-settings-scale-*-d1280.png`.

## 2. A dropped block stays visible

**Pure layout:** `overlapLayout.layoutOverlaps(blocks, keepVisible?)`. If the kept block would be hidden past the third shingle index:
- it takes the top lane (2);
- every top-lane block overlapping it goes under it, together with what those blocks were hiding;
- so its "+N more" still reaches every block. A test asserts that every block is either drawn or listed.

It changes nothing when the block is already visible or not in a stack. That makes +5 tests.

**CalendarGrid**
- `pinnedId` is set on `eventDrop` and `eventResize`, and from CalendarPage's `justDroppedId` for rail drops. `justDroppedId` is now reported whether motion is on or off; the settle-in animation stays CSS-gated by `.cal-motion-on`.
- The pin lets go on the **next key press**, or on a **press anywhere except the pinned block itself**. Pressing the block to open or re-drag it keeps it; otherwise it would vanish under the pointer.
- While pinned, the block keeps its own title. Its "+N more" rides the time row: "2:30 PM · +1 more".

**Evidence** (1280, Day view; seeded trio at 14:00, 14:00 and 14:30; `2-run-*.json`)

| Flow | Before | After |
|---|---|---|
| Rail card "Water the balcony plants" (30m) dropped at 14:30 | hidden (`kf-ov-hide`); top sheet reads "+1 more" | **visible on the top lane with its title**; 1:1 Omar goes under it |
| …then a press on the page header | unchanged | back to plain §6: top sheet "+1 more", Water hidden and listed |
| Block "Standup" moved 10:00 → 14:30 | hidden | visible on top: "Standup with the team · 2:30 PM · +1 more" |
| …then a click on the Standup block itself | n/a | stays pinned (details open) |
| …then Esc | n/a | released |

Shots: `2-rail-drop-*`, `2-rail-drop-next-press-*`, `2-move-*`.

## 3. Phone calendar

- **Rail.** On a phone it starts folded to one strip: "UNSCHEDULED · N" plus the round knob pointing down, with a 44px-high hit area, in 1b's chip-strip language.
  - The open rail folds back from a knob beside its label (`kf-hit` for 44px).
  - The choice is remembered per device under its own key, `kf.calRailFoldedPhone`.
  - Desktop keeps `kf.calRailFolded` and Polish D's auto-fold.
- **Lead.** `gridClock.scrollTimeNear(now, leadMinutes)`, with `SCROLL_LEAD_PHONE_MIN = 60` and `SCROLL_LEAD_DESKTOP_MIN = 120`. The grid lands with it, and Today re-scrolls with the same lead (+1 test).

**Evidence** (390, 10:50 Cairo; `3-run-*.json`)

| | Before | After |
|---|---|---|
| Rail at landing | open, stacked above the grid | folded strip |
| Grid visible at landing | **0px** (the grid starts below the tab bar) | **394px** |
| Grid lands on | 08:30 (2h lead) | **09:30** (1h lead) |
| Now-line on screen | no (y=946, tab bar at 783) | yes (y=415) |
| Tap strip → reload → hide → reload | n/a | open, stored "0" · still open · folded, stored "1" · still folded |
| Desktop 1280 | lands 08:30 | lands 08:30 (unchanged) |

Shots: `3-calendar-phone-{before,after}-{day,night}-p390.png`, `3-calendar-phone-rail-opened-after-day-p390.png`.

## 4. Midnight rollover

- `gridClock.dayStamp(now)` pairs Cairo's day with the device's day.
- `gridClock.msUntilNextDay(now)` gives the ms to the next **Cairo midnight**, from the tz database. On an off-Cairo device it is the device's own midnight if that comes first, because the FullCalendar grid is device-local. +5 tests in 3 zones, including the night summer time ends: Thu 29 Oct, 24:00 EEST → 23:00 EET.
- New `useDayRollover(onRollover)`:
  - a timer set for that boundary, re-armed daily;
  - a re-check on `visibilitychange`, for a throttled background tab or a laptop that slept through midnight.
- **CalendarPage** moves the grid to today only if it was showing the day that just ended. A range the user paged to with ‹ › stays put. The page also re-renders, so the rail's Today list and footer re-read.
- **CalendarGrid** re-renders its headers at once.

**Evidence** (Playwright `page.clock`, 1280; `4-run-*.json`). The fake clock starts the night before the real date, so the real session JWT is never "expired" in the page's eyes.

| Scenario | Before | After |
|---|---|---|
| Open at 23:58:30 Fri 25, clock runs to 00:00:36 | title stays "Sep 25 — Oct 1", yesterday is the first column | **"Sep 26 — Oct 2"**, first column "SAT · TODAY 26", now-line and `fc-day-today` on 26 |
| Open at 23:50; system time jumps to 00:05 with no timer firing, then `visibilitychange` | range unchanged | rolled over, same as above |
| Paged to "Oct 2 — 8" with ›, then past midnight | stays | **stays** (not yanked back) |

Shots: `4-midnight-{2358,0000-timer,0005-visible}-{before,after}-day-d1280.png`.

## 5. QuickCreate reads typed times as Cairo (T-4)

- `eventTime.ts`:
  - `cairoTimeKey` / `cairoToIso` are an inverse pair, built on `cairoWallTimeToIso` from `lib/dateShortcuts`.
  - `slotFields(start, end, allDay)` turns a grid slot into the form's fields.
- **QuickCreate**:
  - fields default to Cairo today;
  - the title is read with `parseCommand(…, { zone: 'cairo' })` for every kind, and the direct chrono call is gone;
  - the parse chip renders in Cairo;
  - every save goes through `cairoToIso`.
- **CalendarPage** builds both slot paths (click/drag and right-click) with `slotFields`.
- **Round trip.** Tests cover every 15 minutes across both 2026 DST switches and a year end, and pass under UTC, Cairo, LA and Tokyo. The one wall hour Cairo repeats (23:00–24:00 on 29 Oct) reads as its second, EET pass; that is documented and tested. An all-day slot keeps the date the grid drew. +4 tests.

**Evidence** (REST read-back with the user's JWT; `5-run-*.json`)

| Device | Action | Before | After |
|---|---|---|---|
| LA | type 3pm–3:30pm | 22:00Z (**01:00 Cairo next day**) | **12:00Z = 15:00 Cairo** |
| LA | title "tomorrow 4pm" (rail quick add) | due 23:00Z (02:00 Cairo) | **13:00Z = 16:00 Cairo** |
| LA | click the 13:00 local slot → Enter | form "1:00 PM", saved 20:00Z | form "11:00 PM" (Cairo), saved **20:00Z** (same instant, round trip) |
| Cairo | all three | 12:00Z / 13:00Z / 10:00Z | identical (no change for Kai's device) |

## 6. Undo on calendar completions

`completeTaskWithUndo` (Polish D) is wired to:
- the task block's checkbox;
- the block's right-click **Complete**;
- the block details' **Complete** (`EventDetailsPanel`);
- the Unscheduled rail card's checkbox.

Reopening from a done block's checkbox still uses `uncompleteTask`.

**Evidence** (`6-run-*.json`). Each of the 4 paths, before: no toast, and the DB stays `done`. After: a "Done · Undo" toast; the DB is `done`, and after Undo it is `todo`. The rail card comes back.

Shots: `6-block-check-{before,after}-day-d1280.png`.

## 7. Phone Inbox card

**Root cause.** The title row also held the unbreakable "KIND · captured" caption. At 390 (and at 312 under the old 125%) the title got ~54 CSS px and wrapped word by word.

**Change.** On a phone only (`compact`), the card now follows 1c:
- the text has the row to itself (`minWidth: 0`, and long words may break);
- the AI read is a wrapping row of kit `Chip`s: AI · kind · %, → due, project. The caption sits at the end of that row. There is no tinted bar, because the title already shows the cleaned text. "AI unsure" and "no AI read" keep their own wording;
- the actions sit under a dashed rule, with File first and Dismiss at the far edge.

Desktop (1a) is untouched.

**Evidence** (`7-run-*.json`, visual px)

| | Before | After |
|---|---|---|
| Title width at 390 | 67 | **299** |
| The long capture | 11 lines | **2 lines** |
| With a saved 125% | 67 wide, 11 lines | 277 wide, 3 lines |
| 1280 | 581 | 581 (unchanged) |

Shots: day and night at 390, 390 at 125%, and 1280.

## 8. Weekly Review trellis

**Root cause.** "The season so far" draws its 4 widgets 2×2, as in Review.dc.html 2c/3c on an 880px card. Beside the sidebar and the right rail at 1280, and on a phone, each widget was ~194 CSS px. The 30 cells measured **0 px**, and the focus trend ran out of its card.

**Change**
- The widgets wrap to one column when two can't each keep 260px: `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`. 1600 keeps 2×2.
- A trellis row in a card narrower than 320 CSS px (container query) puts its 30 cells on their own full-width line under the name and %.
- All 30 days stay, because the % beside them counts the same 30.

**Evidence** (cell width in CSS px; `8-run-*.json`)

| Width | Before | After |
|---|---|---|
| 1280 | 0 | **8.0** |
| 1600 | 3.1 | **6.4** |
| 390 | 0 | **7.2** |
| 390 with a saved 125% | 0 | **4.6** |

Shots: day and night.

## 9. Keycaps

- CommandBar jump hint: "↓ then ↵" / "↵" become KeyChip caps.
- CommandBar footer: "Enter = quick add · ⌘Enter = AI capture" becomes **↵** quick add · **⌘ ↵** AI capture. These are the same keys the `?` overlay lists for the command bar.
- Onboarding step 2 icon: the plain mono "⌘K" becomes `KeyCombo` ⌘ K (sm, 2px gap, so both caps fit the 36px seed chip).

**Evidence** (`9-run-*.json`)
- `<kbd>` count: 0 → 5 in the command bar, and 0 → 2 on onboarding.
- Content width 34 inside a 36px chip at 100%.
- Shots in day and night.

## Automated checks (HEAD `9314bdf`, from `app/`)

**Tests**
- `TZ=UTC npx vitest run`: **Test Files 46 passed (46) · Tests 594 passed (594)**
- `TZ=Africa/Cairo npx vitest run`: **Test Files 46 passed (46) · Tests 594 passed (594)**
- `TZ=America/Los_Angeles npx vitest run`: **Test Files 46 passed (46) · Tests 594 passed (594)**
- Base `ddfb21a`: 45 files, 568 tests.
- New file: `uiScale.test.ts`. Extended: `overlapLayout`, `gridClock`, `eventTime`.

**Lint.** `npm run lint` gives exactly **2 errors**, the baseline `features/projects/ProjectsPage.tsx:23` and `:24`. None of the 19 files I changed has a warning of mine; the only one in them is `InboxPage.tsx:157`, which is identical on the base.

**Build.** `npm run build` (tsc -b + vite + PWA) is green. Gzip sizes, base → HEAD:

| Chunk | Base | HEAD |
|---|---|---|
| CalendarPage | 93.09 kB | 94.06 kB |
| InboxPage | 8.05 kB | 8.17 kB |
| WeeklyReviewPage | 7.07 kB | 7.29 kB |
| entry `index` | 99.61 kB | 99.61 kB |

**Merge check.** `origin/claude/release-1` moved while I worked (F2a and Polish G merged; tip `5345783`).
- `git merge-tree` of HEAD with it: **no conflicts**.
- I extracted the merged tree to scratch: `tsc -b` is clean, and `TZ=Africa/Cairo vitest` gives **48 files / 658 tests passed**.

## Real-run setup

- **Stack.** The shared local stack at `http://127.0.0.1:54321`; not reset or stopped. `app/.env.local` (gitignored) holds the local URL and anon key.
- **Account.** `polish-f2b@example.com`, seeded over REST with its own JWT:
  - 10 tasks, including a task-linked block;
  - 11 events, including a 14:00 trio;
  - 4 inbox items: a confident one, an unsure one, a plain one and a GitHub issue;
  - 3 routines with 30 days of completions.
- **Servers.**
  - The base build `ddfb21a` for "before", served with `vite preview` on **5259** from a scratch `before-dist`.
  - This branch's build on **5239**, rebuilt after each item.
  - Before starting either, I checked that the port was free, and I checked `/version.json` before every run.
  - Both are **stopped**; I killed them by exact port match, via `/proc`.
- **Playwright.** Chromium 1194 with `timezoneId: Africa/Cairo` (item 5 also used `America/Los_Angeles`). Phones ran with `isMobile` and `hasTouch` at 390×844.
- **Console.** Only the known `api.open-meteo.com` tunnel failures (plus their console twin), and occasional `net::ERR_ABORTED` on `/ds/assets/vine/bare.png` when a navigation cut the image off; the file serves 200. No app errors or pageerrors.
- **Final smoke on HEAD.** Today, Tasks, Inbox, Calendar, Weekly review and Settings at 390 (zoom 1) and 1280 (zoom 1.25): no sideways page scroll on any.
- Scripts are in my scratchpad (`polish-f2b/*.mjs`).

## Decisions I made (Kai delegated UX; the reasoning is inline above)

1. **Scale default:** "small or touch" means a coarse primary pointer **or** a screen whose short side is under 600 CSS px.
   - Tablets get 100% too.
   - A touchscreen laptop whose trackpad is its primary pointer keeps 125%.
   - The rule is screen-based, not window-based, so resizing a desktop window never changes the default.
2. **Pin release:** the next key press, or a press anywhere but the pinned block. Resize and move count as drops, not just rail drops.
3. **Phone rail:** it has its own remembered key. Its folded look is the rail's mono label plus the sidebar's round knob. No new component.
4. **Rollover:** at a device's own midnight too, when that comes before Cairo's (the grid is device-local). A paged-away range is never yanked back.
5. **QuickCreate on an off-Cairo device:** a slot clicked at 1 PM LA shows as "11:00 PM" in the form (Cairo) and saves the exact clicked instant. That is T-4's rule applied to the form. The grid itself stays device-local; see below.
6. **Calendar Undo:** also covers the rail card's checkbox and the details panel's Complete, since both are on the calendar surface and no other worker owns them.
7. **Inbox 1c:** kept the kit `Button`s (File / Snooze / Dismiss) instead of 1c's mono text links. That keeps touch size and one button language. The caption moves to the end of the chip row rather than disappearing.
8. **Trellis:** kept 30 cells and wrapped the row, rather than showing fewer days, so the cells and the % stay the same 30 days.
9. **Keycaps:** used ↵ and ⌘ ↵, as in the `?` overlay, not the word "Enter".

## Found, not fixed (outside this brief)

- **Phone Settings has no Interface size control.** `MobileSettings` only has Theme and a *static* Paper-texture bar that isn't wired to anything. A phone user who wants 110% or 125% can only get it by setting it on a desktop-width window.
- **The calendar grid is device-local.** FullCalendar has no named-zone plugin here. On a device outside Cairo, blocks and headers show local time while QuickCreate (T-4) and the rest of the app show Cairo. `EventDetailsPanel` also still edits in device time (`localTimeKey`/`localToIso`). Kai's Cairo devices are unaffected. A full fix is the grid's `timeZone` plus a tz plugin; that's a product call.
- **While a 30-min block is pinned**, FullCalendar hides its time row ("short" event), so its "+N more" can't be reached until the pin lets go on the next press.
- **Stale comments in other workers' files still say "the default 125% on phones":** `MobileTabBar.tsx:48` and `TasksPage.tsx:645`. `weekFit.ts` and CalendarPage's own Polish D comment are still true for desktop.
- Not tested: Safari/WebKit and real touch hardware (only Chromium exists in the cloud container).

## Not done here

- No ROADMAP, TEST-LEDGER, phase Notes or `INDEX.md` edits; the brief limited me to the listed items plus this entry.
- Suggested ledger rows:
  - "Phone default scale 100% / desktop 125% / saved wins"
  - "Dropped block stays visible"
  - "Phone calendar rail folded + 1h lead"
  - "Calendar midnight rollover"
  - "QuickCreate T-4"
  - "Calendar completion Undo"
  - "Phone Inbox card 1c"
  - "Review trellis readable at 1280/390"
  - "Command bar/onboarding keycaps"
