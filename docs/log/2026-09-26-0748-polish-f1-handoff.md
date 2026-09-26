---
date: 2026-09-26 07:48 UTC
session: polish-f1-worker
type: handoff
related: conductor-decides, audit-newuser
---

# Polish F1: six decided polish items, plus the S8 line from the evening ritual

**Branch:** `claude/polish-f1`, cut from `origin/claude/release-1` at `0519157` (Polish C merged in). No PR is open and nothing is merged.

`release-1` has moved since then (Polish D, Polish E, SEC-3). The conductor's rule was to merge `release-1` only if `describe.ts` was missing from my base. It was there, so I didn't merge. A read-only `git merge-tree --write-tree HEAD origin/claude/release-1` reports **no conflicts**. I also kept my edits clear of the hunks `release-1` touched:
- `EveningRitual.tsx`: line 3 and lines 151–157
- `streaks.ts`: lines 144–195, plus appends to `streaks.test.ts`, which is why the new trellis tests live in their own file

**Commits (oldest first):**

| SHA | What |
|---|---|
| `6aaf410` | 1: the phone More sheet leads with Tasks and Projects |
| `7b0629b` | 2: the phone topbar always shows the sync status |
| `64778f8` | 3: the sidebar Today badge counts what Today lists (shared selector + tests) |
| `f859ed2` | 4: `Select` stays on a phone screen, with 44px rows under a finger (+ tests) |
| `1dae1c0` | Conductor scope addition: the evening line's words stay out of `activity_log` (S8) |
| `a31432f` | 5: a 0-day streak never claims "rain held" (+ tests) |
| `ef885e2` | 6: the last hand-rolled shortcut hints in my files become keycaps |
| `d772243` | Build fix: `describe.ts` had an unused `payload` binding after the S8 change, and `tsc -b` caught it. This commit also carries the item-1 and S8 screenshots. |
| (this commit) | handoff |

**Files:**
- **Changed, CRLF kept** (`git ls-files --eol` shows `i/crlf w/crlf` for all three):
  - `components/AppLayout.tsx`
  - `components/MobileTabBar.tsx`
  - `features/rituals/EveningRitual.tsx`
- **Changed, LF:**
  - `components/Select.tsx`
  - `components/ShortcutOverlay.tsx`
  - `features/search/SearchOverlay.tsx`
  - `features/tasks/grouping.ts` + test
  - `features/routines/streaks.ts`
  - `features/routines/StreakTrellis.tsx`
  - `features/activity/describe.ts` + test
- **New:**
  - `components/selectPlacement.ts` (+ test)
  - `features/routines/trellisCaption.test.ts`
- **Not touched:** `features/today/**`, `features/tasks/TasksPage.tsx`, `features/calendar/**`, `capture/**`, `command-bar/**`, `onboarding/**`, `journal/**`, `auth/**`, `lib/outbox.ts`, `App.tsx`, `supabase/**`.

Screenshots are in `docs/log/assets/polish-f1/`, prefixed by item number.

## 1. Phone More sheet order (`MobileTabBar.tsx`)

- **New order:** Tasks, Projects, then the designed rows in the export's order (Routines, Inbox, Review, Journal, People, Settings), then Focus, Activity, Trash.
- **Deviation marker:** kept as `deviation(2026-09-26 audit)`. The comment now records the order and why.
- **Why this order:** Tasks and Projects are the pages a phone user reaches for most that have no tab-bar slot.
- **Evidence:** read from the sheet in a real run:
  - Base build: `["Routines","Inbox","Review","Journal","People","Settings","Focus","Tasks","Projects","Activity","Trash"]`
  - Final build: `["Tasks","Projects","Routines","Inbox","Review","Journal","People","Settings","Focus","Activity","Trash"]`
  - Screenshots: `1-more-sheet-phone-before.png` and `-after.png`. There is no desktop shot because the sheet is phone-only.

## 2. Phone topbar (`AppLayout.tsx`)

**What the export shows:** no iPhone `.dc.html` draws the desktop topbar. The phone app bar (Calendar iPhone / `CALENDAR_BEHAVIOR.md`) is flower · date · ⌕. The Cairo weather echo and the `Africa/Cairo` zone appear in no phone variant. The date does appear, as the page header.

**The change (≤767px only):**
- The weather echo and the zone are hidden, following the export.
- The sync button is `flex: none`, so it never shrinks.
- The "name · date ·" run becomes the part that gives: `min-width: 0` plus an ellipsis.
- The weather echo is wrapped in a `display: contents` span, so desktop layout is untouched.

**Evidence** (Playwright at 390, `zoom` 1.25, plus a desktop run at 1280; measurements in visual px). "Before" is the build of `6aaf410`; "after" was re-measured on the final build and gave the same numbers.

| Case | Before | After |
|---|---|---|
| Phone, synced | Sync box at x 270–343, left cluster clipped at 244, so **the status was invisible** | `KAI'S FLOW · SAT 26 SEPT · SYNCED ●`, fully visible |
| Phone, offline with 1 queued change | Invisible | `OFFLINE ◌ — 1 SAVED HERE` fully visible; the date ellipsizes |
| Phone, name "Maximiliana Montgomery", synced | n/a | Name capped (polish-c's 9em) + date + `SYNCED ●` all visible |
| Phone, same long name, offline | n/a | Status fully visible; the name/date run shows as `MAXIMILIANA……` |
| Desktop 1280 | Sync box 603–675 | Identical coordinates in both states: **desktop is unchanged** |

- **Screenshots:** `2-topbar-phone-before.png`, `2-topbar-phone-after-{synced,offline,longname-synced,longname-offline}.png`, `2-topbar-desktop-after.png`.
- **Taste note:** in the long-name + offline + queued case, two ellipses sit side by side ("……"). The name's own cap ellipsizes, then the run does. It is rare and harmless, and I left it alone.

## 3. Sidebar Today badge = what Today lists (`grouping.ts`, `AppLayout.tsx`)

**The selector.** `todayListTasks(tasks, now)` in `features/tasks/grouping.ts` is the Today page's row set, copied verbatim from `TodayPage.tsx` (`visible`, line 161 on release-1):
- every non-someday task without `completed_at`,
- plus tasks whose `completed_at` falls on today's Cairo day (these show struck through).

**The count.** `todayOpenCount(tasks, now)` counts the open rows of that set: Today's open Top-3 plus its "All open · N".

**The badge.** The folded Plan drawer's count ("the Today badge", `AppLayout.tsx` `todayCount`) now uses `todayOpenCount`. It also gets a `title`: "N open on Today".

**Decision — done-today rows aren't counted.** Today still lists them (struck), but a badge counts what's left, so ticking a task drops it by one. This matches the export's "count keeps whispering (6 due today)".

**Decision — the "Due Today" row is unchanged.** Inside the open drawer, that row still counts the Due Today smart list it links to. That is grouping.ts's own invariant, and TasksPage relies on it. So the folded badge and the "Due Today" row can differ by design: each matches the page it opens.

**Placement.** The selector lives in `grouping.ts`, not in a new `features/today/todayList.ts`, because `features/today/**` belongs to another worker. Neither location avoids a TodayPage edit.

**The TodayPage change I did not make.** It is one line on `release-1`, plus the import. TodayPage is CRLF.

```ts
// app/src/features/today/TodayPage.tsx:161
- const visible = tasks.filter((t) => !t.someday && (!t.completed_at || isToday(t.completed_at)))
+ const visible = todayListTasks(tasks)
// and: import { todayListTasks } from '../tasks/grouping'
```

This changes no behaviour. The selector is Today's rule verbatim, and a unit test checks it against an independent restatement of that filter.

**Follow-up for the Today owner (not fixed here).** Today decides done-ness by `completed_at`, not `status`, and the selector copies that on purpose. As a result:
- a `status: 'done'` row with `completed_at: null` (a CSV import of done rows, or an Akiflow done row without `done_at`) shows on Today as open;
- so does a `cancelled` task.

If the owner wants to fix it, the fix is one filter change in `todayListTasks`, made together with the swap above so the badge and the page move as one.

**Tests** (`grouping.test.ts`, 7 new):
- the audit's drift fixture, where the old rule gave 4 and the new count gives 7;
- equality with TodayPage's filter;
- a tick drops the badge by one;
- the Cairo-midnight edge (00:30 counts as today, 23:30 the night before does not);
- empty input.

**Real run** (seeded account `polish-f1@example.com`, desktop 1280, Plan folded):
- Before any tick: badge **7** ("7 open on Today") = 1 open Top-3 + "All open · 6". The old rule would have shown 4.
- After ticking "Due in 5 days": badge **6** = 1 + "All open · 5", and the row stays listed.
- Row check: someday and done-yesterday rows are absent; the done-today row is listed.
- Screenshots: `3-today-badge-desktop.png`, `3-today-allopen-desktop.png`, `3-today-badge-desktop-after-tick.png`. The sidebar doesn't exist on phone.

## 4. `Select` on phone (`Select.tsx`, new `selectPlacement.ts`)

**Root cause:** the left clamp used `window.innerWidth`, which is visual px (390). The fixed-position panel uses layout px (390 / 1.25 ≈ 312). So a right-side trigger's popover ran off the edge.

**The fix:**
- Placement is a pure function, entirely in layout px.
- `minWidth` and `maxWidth` are capped to the screen minus 8px on each side, and `left` is clamped.
- The popover opens upward only when the space below is too small and above has more room.
- `maxHeight` is capped to the side it opens on. Before, a panel opening upward near the top could run off the top edge.
- A layout effect then measures the real panel (`offsetWidth`, which is layout px and ignores the `scale(0.98)` entry animation) and nudges it back inside if long labels widened it.

**Rows:** coarse pointers get `minHeight: 44` layout px. That matches X4's `kf-hit` convention and is 55px on screen at 125%. Fine pointers keep their old rows, so desktop is pixel-identical.

**`Float.tsx` wasn't used.** It's only a portal, and `Select` already portals itself. Nesting through `Float` would also put the panel inside a parent card's entry transform.

**Tests:** `selectPlacement.test.ts`, 9 tests.

**Real run:**

| Case | Before (build of HEAD `64778f8`) | After (final build) |
|---|---|---|
| Phone 390, touch, Tasks "Sort · Smart" | Panel 249→449 of 390 (**59px off the edge**), rows 41.9px | Panel 180→380 (10px margin), rows **55px** |
| Desktop Tasks sort | 1025→1225, rows 41.9 | Identical |
| Desktop Settings timezone | 674→908, rows 41.9 | Identical |

- Screenshots: `4-select-phone-{before,after}.png`, `4-select-desktop-after.png`, `4-select-desktop-settings-after.png`.
- The Tasks phone header itself looks odd in those shots: it's a horizontally scrolled strip. That's `TasksPage.tsx`, not in scope.

## S8 addition (conductor): the evening line's words stay out of `activity_log`

**The change:**
- `EveningRitual.commitLine` now logs `journal.line_added` with `{ date }` instead of `{ text }`.
- The line is still saved as its own journal entry through `upsertJournalEntry`.
- `describe.ts` reads **"Added a line to today's journal"** with the detail "evening ritual". It never prints `payload.text`, so rows written before this change don't show their words either.
- Tests: fixture updated, plus a new test covering the new payload and a legacy `{ text }` row.

**Real run** (`activity_log` read back through REST as the user, newest first):
- Pre-S8 build (`64778f8`): `{"text": "phone line: the fig tree finally fruited", "entity_key": "2026-09-26"}`
- Post-S8 build (the tree committed as `ef885e2`): `{"date": "2026-09-26", "entity_key": "2026-09-26"}`
- In both, `journal_entries` has the line.
- Activity page, showing that same legacy row:
  - Release-1 base build (`0519157`): "Wrote the evening's line / phone line: the fig tree…"
  - Build `ef885e2`: "Added a line to today's journal / evening ritual"
  - Screenshots: `s8-activity-desktop-{before,after}.png`.

**Follow-up (not mine: `supabase/**` is off-limits).** Rows logged before this change still carry `payload.text`, server-side and in any device cache that holds them. A one-line migration would scrub them:

```sql
update activity_log set payload = payload - 'text' where event_type = 'journal.line_added';
```

## 5. No rain caption on a 0-day streak (`streaks.ts`, `StreakTrellis.tsx`)

**Two new pure helpers:**
- `rainHeld(current, rainedDates)`: the header chip's rains, and none when `current === 0`.
- `trellisCaption(days, current, status)`, a tagged result the component turns into words.

**Captions by case:**
- **Live streak:** exactly as before. The latest rain, else the latest snap, else "no missed days…".
- **0-day streak, never tended:** "starts bare, grows with the streak ✿", the existing hint.
- **0-day streak, snapped inside the window:** "it broke {Fri} — the vine started over."
- **0-day streak, snapped before the 14-day window:** **"bare for now — start again ✿"**. This is new copy, echoing the export's own "Bare · start again" card label. It's a taste call; Kai can reword it.

**Tests:** `trellisCaption.test.ts`, 6 tests. It's a separate file because release-1 appends to `streaks.test.ts`.

**Real run** (three seeded routines, desktop + phone, same result on both):

| Routine | Before | After |
|---|---|---|
| Planted yesterday, never tended | `0 days · 1 RAIN HELD` / "it rained Fri — the vine held on." | `0 days` / "starts bare, grows with the streak ✿" |
| Tended Sep 8–12, lapsed | `0 days · 1 RAIN HELD` / "it rained Sun — the vine held on." | `0 days` / "it broke Fri — the vine started over." |
| Live, 13 days with one rain | `13 days · 1 RAIN HELD` / "it rained Mon — …" | Unchanged |

Screenshots: `5-trellis-{new,lapsed}-desktop-{before,after}.png`, `5-trellis-live-desktop-after.png`, `5-trellis-{new,lapsed}-phone-after.png`.

**Kept, not changed:** the per-day droplet on the stem for a forgiven miss. It's the day's record, and the decision covered the caption only. If Kai finds a droplet under "0 days" contradictory too, the fix is to draw forgiven misses of a 0-day streak as plain misses.

## 6. Hand-rolled shortcut hints → `KeyChip`

**Converted:**
- `SearchOverlay.tsx`: the "Open selected ↵" and "View all results ↵" footers use `KeyChip` size `sm`.
- `ShortcutOverlay.tsx`: the header reads `[?] toggle · [Esc] closes`, with md keycaps to match the existing `?`.
- `EveningRitual.tsx`: `[↵] continues`, size `sm`.

**Real run.** "Before" is the build of `64778f8`. "After" is the build of the tree committed as `ef885e2`; `d772243` changes only an unused binding in `describe.ts`.

| Hint | Before | After |
|---|---|---|
| Search footers | No keycaps | `Open selected → ↵`, `View all results → ↵`, each a `<kbd>` |
| `?` overlay | Keycaps `["?"]` | Keycaps `["?","Esc"]` |
| Evening line | Keycaps `[]` | Keycaps `["↵"]` |

- The local stack's `search` edge function fails to boot (`503 BOOT_ERROR`, an environment problem), so the overlay stayed in its resting state. For the results footer only, the Playwright run stubbed `/functions/v1/search` with the account's **real** seeded task row.
- Screenshots: `6-search-footer-desktop-{before,after}.png`, `6-search-footer-phone-after.png`, `6-shortcut-overlay-desktop-{before,after}.png`, `6-evening-line-phone-{before,after}.png`, `6-evening-line-desktop-after.png`.

**Still hand-rolled, in files other workers own:**
- `features/command-bar/CommandBar.tsx:220` (`↵` / `↓ then ↵`) and `:260` ("Enter = quick add · ⌘Enter = AI capture")
- `features/onboarding/OnboardingPage.tsx:292` (`⌘K` feature icon)
- `features/calendar/TaskEditorPage.tsx:422` (`⌘⏎` next to Save)
- `features/capture/QuickCapturePage.tsx:494` (`⇧`), which is on the dev-only gallery

Prose mentions such as "press ⌘K" (TasksPage) and "same as ⌘K" (Settings) are sentences, not hints, so I left them.

## Verification (all run in this session, on the final code `d772243`)

- **`TZ=UTC npx vitest run`:** Test Files **40 passed (40)**, Tests **512 passed (512)**.
- **`TZ=Africa/Cairo npx vitest run`:** Test Files **40 passed (40)**, Tests **512 passed (512)**.
- **`npm run lint` (oxlint):** exactly **2 errors**, both the baseline `features/projects/ProjectsPage.tsx:23:35` and `:24:3`. **26 warnings**, the same as the release-1 base (linted separately), and none in a file I touched.
- **`npm run build` (`tsc -b && vite build`):** passes. The first attempt failed with TS6133 in `describe.ts`, fixed in `d772243`. My earlier preview builds were `vite build` only.

**Real run setup:**
- Production bundle built with `npx vite build` and served with `vite preview --port 5237 --strictPort` (started from a script file, PID-tracked).
- I checked `/version.json` before every probe. The final one read `{"commit":"d7722432…","builtAt":"2026-09-26T07:47:37Z"}`.
- The app used the local Supabase stack at `127.0.0.1:54321` (shared; never reset or stopped) through a gitignored `app/.env.local`.
- Playwright was the global install with Chromium 1194, `timezoneId: 'Africa/Cairo'`. Phone runs were 390×844 at the default zoom (1.25); the Select probe also used `hasTouch` + `isMobile`, which gives a coarse pointer. Desktop runs were 1280×800.
- Account `polish-f1@example.com` was seeded through REST as the user: 10 tasks built to separate the badge rules, and 3 routines for the trellis.
- The copied `smoke.mjs` (account swapped, `timezoneId` added, More-sheet capture added) ran `/today /tasks /routines /activity` on both sizes. The only errors were the open-meteo `ERR_TUNNEL_CONNECTION_FAILED` lines, one per page load (10 across 10 loads).

**Anomalies, reported rather than hidden:**
- A `net::ERR_ABORTED` on `/ds/assets/vine/bare.png` shows up intermittently on phone runs. It also happens on the release-1 base build, so it predates this branch. It's an image load cut off by navigation.
- Two runs of the Select probe on the final build logged a burst of aborted `rest/v1/routine_completions` refetches: 19 in one run; the other run's 103 unexpected errors weren't captured because my grep dropped them. The next two consecutive runs on the same build, including one straight after a reseed, were clean. One base-build run after a reseed was also clean. I didn't find the cause. This diff touches no query or realtime code; the likeliest source is realtime traffic on the shared stack or from my reseeds.

Servers stopped: port 5237 is free, and no `polish-f1` preview process is left.

## Taste calls for Kai (all reversible)

1. More-sheet order: Tasks, Projects, then the designed rows.
2. Phone topbar drops the weather echo and `Africa/Cairo` (the iPhone exports carry neither). The date stays.
3. Today badge counts open rows only (done-today rows are listed but not counted), with a "N open on Today" tooltip.
4. Touch rows in `Select` are 44 layout px (55 on screen at 125%), matching `kf-hit`.
5. New trellis caption "bare for now — start again ✿" for a lapsed routine whose snap is older than 14 days.
6. The `?` overlay's "Esc" is a keycap too.
