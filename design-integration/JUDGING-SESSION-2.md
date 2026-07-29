# Live-judging bug register — session 2 (2026-07-28)

> Kai's walkthrough of punch items **1–26** on the deployed build. Continues `JUDGING-2026-07-28.md` (session 1: J-1…J-4). **Flagged and root-caused only — nothing fixed.**
>
> **Passed and ticked by him:** 7, 8, 9, 11, 12, 14, 15, 16, 17, 19, 20, 21, 26. Item 7 he verified end to end — ⌘K capture → Inbox → file with domain + project → *"Filed to…"* toast → **Undo works**.
>
> Read **J-5 first**: it plausibly explains three separate complaints at once.

---

## J-5 · 🔴 CONFIRMED — Root `zoom` breaks `position: fixed` (the whole floating-UI family)

> **Confirmed live by Kai, 2026-07-28:** "the bulk bar scrolls with the page." No longer a hypothesis — this is the proven root cause. Fix at the source; do NOT patch the bars individually.

**Symptoms (Kai):** "the bulk action bar is not centered… the zoom is 100%" · "the bulk bar is covering and scrolling. Like it's not stuck to the bottom area of the page" · "the context menu is clipped, I can't see half of it."

**Mechanism.** `app/index.html:15-19` sets `document.documentElement.style.zoom = 1.25` (the default in `UI_SCALES`). In Chromium, `zoom` on an ancestor **establishes a containing block for `position: fixed` descendants** — so every fixed element in the app anchors to the `<html>` box (document height), not the viewport. Each consequence matches what he saw:

- `bottom: 16` becomes 16px from the bottom of the **document** → the bar sits below the fold and **scrolls with the page** instead of sticking. (`BulkBar.tsx:41-45`, `InboxBulkBar.tsx:53-57`, `ToastHost.tsx:33`.)
- `left: 50%` resolves against the full document width **including the 242px sidebar**, so the bar reads visibly off-centre over the content column.
- `ContextMenu`'s bottom clamp (`components/ContextMenu.tsx:89-92`) computes `maxY` from `window.innerHeight / z` — viewport math applied to an element living in document space, so the clamp misses and tall menus clip (**J-6**).

**Why it survived every pass.** The codebase already knows this family — every *coordinate-taking* popover divides by `uiZoom()` (`ContextMenu:76`, Snooze/Schedule/ProjectPicker/Select). What was never corrected is the **percentage/edge-anchored** elements, because `left: 50%` and `bottom: 16` look like they should just work. F6 studied this zoom for *blur*, not for containment.

**Confirm in 60 seconds before touching anything downstream:** select two rows on the live app and scroll. If the bulk bar travels with the page, it's confirmed. Then fix once at the source rather than patching each bar — either drop root `zoom` for a `rem`-based scale (F6 spec'd this and deliberately didn't implement it), or render the fixed layer through a portal outside the zoomed subtree.

## J-6 · 🔴 Context menu clips — half the menu unreachable

Downstream of J-5's clamp math (`ContextMenu.tsx:89-92`, hardcoded `itemHeight = 34`). Session 1 called this LOW from code-reading; **his live report upgrades it — he could not see half the menu.** The task-row menu carries 10+ items plus submenus, so near the viewport bottom it loses the destructive rows entirely.

## J-7 · 🔴 Search returns everything — the semantic half drowns the literal one

**Symptom:** searched `judge`, got unrelated rows ("rigorous ejection modal…"), not the task he had captured seconds earlier.

**Root cause:** `search_hybrid` (`0008_search.sql:107-125`) is reciprocal-rank fusion over two branches. The vector branch admits anything with cosine distance `< 0.6` and takes **40 rows**, then merges them at the *same RRF weight* as exact FTS hits. For a short literal query a 384-dim `gte-small` embedding sits within 0.6 of most of the corpus, so 40 loose neighbours swamp the handful of real matches. There is also **no `ilike` substring fallback**, so typing an exact word carries no lexical guarantee.

**Fix direction:** tighten the vector threshold (~0.35), weight FTS above vector in the merge, cap the vector arm well below 40, and short-circuit to lexical for one-token queries.

## J-8 · 🔴 Task detail is unreachable with a mouse

**Symptom:** "I can't go to the details of each task or any task."

**Root cause:** punch 29 wired `Enter` → detail (`listShortcuts.ts`, `open` action) — **keyboard only**, and it requires the row to already be roving-focused via arrow keys. The row title has **no click handler** (unchanged since drift-audit C-17); the only mouse path is the context menu. For anyone using a mouse, task detail effectively does not exist.

**Fix direction:** title click (or row double-click) opens detail — the export's 2b stack-push affordance.

## J-9 · 🔴 Swipe: the WRONG row moves

**New mechanism, beyond J-1.** "I can drag a task or click on the first one, and then the third one is moving."

Each row owns its own `useRowSwipe()` state, so a *different* row reacting means the pointer stream is reaching the wrong element — most likely `setPointerCapture` (`TaskRow.tsx:153`) on a row that then re-orders or re-keys underneath the capture (lists re-sort on completion; `justCompletedId` and the 650ms grace window re-render the group). A captured pointer keeps delivering to the captured node even after React moves it in the list. **This upgrades the swipe bug from "wrong platform" to "wrong target".** Same fix door as J-1: gate the gesture to touch, and release capture on re-render.

## J-10 · 🟡 Today flashes its EMPTY state before data arrives

"It showed me the empty view first, and then… my data." The empty gate (`TodayPage.tsx`, `nothingPlanned = open.length === 0 && doneToday === 0`) is true while the query is still loading, so a returning user is told *"Nothing planted for today yet"* — the app lying for a beat about his own day. Needs an `isLoading` guard (same class as the OnboardingGate bug fixed under punch 2). He also reports **first load feels slow** in general.

## J-11 · 🟡 Sign-up affordance reads as decoration; no password reset at all

"New here? Plant your garden" doesn't parse as *create an account* — he expected the conventional underlined **Create an account** / **Forgot password?** pair. **And password reset does not exist anywhere in the app** — a real v1 gap for public users, not a styling note. Missing piece: `supabase.auth.resetPasswordForEmail` plus a `/reset` route.

## J-12 · 🟡 Sort is a click-cycler, not a menu

He has to click through Smart → Due → Priority → A-Z to reach the one he wants; he wants a popover listing the options. (The cycler was the R4-era replacement for the dead `⚟ Filter` button — it fixed "dead control" but chose the wrong control.) He also asked again for real **filtering** on the task list.

## J-13 · 🔴 Overlapping calendar events are unreadable

His two screenshots show three same-time events rendering **on top of each other with colliding text** — titles and time labels overprinted, one block's text spilling across another. CALENDAR.md §6 specifies "overlap-2 → each `calc(50% − 2px)` with a 4px gutter; 3+ → shingle 56% with `+N more`". The drift audit flagged it as never implemented (findings #32/#33 — FullCalendar's default `slotEventOverlap` shingle left in place), and WA-2's eight items didn't include it. **This is the most visually broken thing he has shown so far.**

## J-14 · 🟡 Wrong icon on the week/view button

"The icon on the week button is incorrect." Needs him to point at which control exactly (the view segmented control vs the ↻ Repeating / Sort row) — flagged pending clarification.

## J-15 · 🟡 Calendar opens on yesterday and doesn't scroll to now

"The bar is showing yesterday, not today. It should be scrolling down to show today." Two candidates, both in `CalendarGrid.tsx`: the rolling-week window starting a day early, and `scrollTime="08:00:00"` applying only on mount (drift-audit #93 — `Today` navigates but never scrolls to the now-line).

---

## Not a bug, but it confirms a queued item

His Tasks screenshot shows **five consecutive "Shower + Breakfast" rows** — exactly the Akiflow import duplication that punch item **28** exists to clean up. The dedupe assistant is built and waiting on `/settings/import`; it needs his consent-click to run.

## Severity roll-up for the fix session

**Fix first (blocks judging the rest):** J-5 (confirm, then fix at source) → J-9 + J-1 (rows misbehave under any interaction) → J-8 (no mouse path to detail) → J-13 (calendar unreadable) → J-7 (search useless).
**Then:** J-6, J-10, J-15, J-11.
**Design calls first:** J-12 (sort menu shape), J-3 from session 1 (right-click selecting), J-14 (which icon).
