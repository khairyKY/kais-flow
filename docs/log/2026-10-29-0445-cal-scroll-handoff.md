# cal-scroll handoff — 2026-10-29

Branch `claude/cal-scroll`, from `claude/kai-bugs-1012` (980ca1f5). Not merged, not released.

Kai's ask: "Calendars should be horizontally scrollable" — he picked **glide through days** (Notion Calendar / Amie), desktop and phone.

## Flows first (Kai's rule)

1. **Notion Calendar**: a trackpad swipe or Shift + wheel pans the days continuously; the toolbar's month/date label updates live as columns slide; any number of days (1–9 keys). It rests on a whole day.
2. **Amie**: smooth sideways scroll through days in the main grid (and a scrolling day list in the menu bar); no paging.
3. **Akiflow** (Nov 2024 changelog): while you hold a task/event, a two-finger sideways scroll moves to past/future days — drags carry across days by scrolling, not by dropping on an arrow.
4. Snapping: on a **day** in every view (the rolling week already starts on any day — Kai's 2026-07-21 rule — so a week that starts Thursday is normal here). Phone week: on a **week** (seven ~45px columns read as one page, and the strip is that week).
5. Momentum: desktop takes the OS's own (a trackpad's momentum arrives as more wheel events), then eases onto the day; the phone computes a fling (v² / 2a) and glides there.
6. A mouse notch (Shift + wheel) must move: a gesture that went ≥ 15% of a column one way commits a day that way.
7. Header: the title, the range and (phone) the strip's selected day follow the leftmost day mid-glide — once per day crossed, never per pixel.
8. Drags near the left/right edge: the days scroll under the held block (FullCalendar's own edge scroll, now sideways too); the block lands on the day under it.
9. Keyboard and buttons: ‹ › (and ← →, - =) glide a screen; Today glides back (jumps with the M7 slide when it's further than the drawn days).
10. Reduced motion: no eased settle and no momentum animation — the settle is instant.

## What shipped: the real glide (not the paging fallback)

**Desktop** (`gridGlide.ts`, `CalendarGrid.tsx`, `CalendarGrid.css`): FullCalendar draws the screen's days plus a buffer either side (Week 7 + 7 + 7 = 21 columns; N days N either side, at least 3; Day 3 either side). Each column is a screen's share wide (`--kf-glide-w` on the wrapper, over FullCalendar's inline table widths), the time gutter / all-day label / zone labels are `position: sticky` at the left, and FullCalendar's three scrollers (day row, all-day band, hours) get the same `scrollLeft` in the same frame — the header never trails. The wheel listener (non-passive, one axis per gesture) moves them 1:1; 140 ms without a wheel event ends the gesture and the days ease onto a day (160–360 ms, ease-out; instant with reduced motion). When less than half a screen of drawn days is left on a side, 220 ms after the settle the buffer re-centres: `gotoDate` redraws synchronously and the same day is put back at the left in the same task (`datesSet` → `restore`), so nothing jumps.

Why it works where the brief feared it wouldn't: FullCalendar v6 renders synchronously on `gotoDate` (DelayedRunner with no delay, flushSync in the React adapter), and its drag code follows the `scrollLeft` of every scrolling ancestor (OffsetTracker) — so drags, resizes, selections and rail drops keep hitting the right day mid-glide, and its AutoScroller scrolls the hours sideways at the left/right 50px edge while a block is held (the day row and all-day band follow from the scroll event). The buffer never re-centres while any button is held.

The header and CalendarPage's range follow `onAnchor` (a transition, once per day crossed); `rangeInfo` is now the screen's days, not FullCalendar's drawn range. The day tray under the grid lays its days out where they sit in the grid's content and follows the glide with a transform (`onGlide`); it keeps the days on screen and one either side.

**Phone** (`PhoneGrid.tsx`, `phoneGridMath.ts`, `PhoneCalendar.tsx`): the swipe still follows the finger (`--pc-swipe`), with more neighbour panes while it moves (Day ±3 days, 3 days ±6, Week ±1 week, their day names too). On release `glideTarget` adds the fling (v² / 2·0.0025 px/ms²), settles on a day (a week in Week), clamps to the drawn reach, and keeps the old rule that a short flick still moves one. The settle's length follows the distance (200–480 ms, ease-out; 0 with reduced motion). `onPeek` moves the title and the strip's selected day while the finger is down; `onShift(n)` replaces `onPage(dir)`. The grid's event range now covers the reach, so a glided-to day is never blank.

Not gliding (on purpose): Month (its own pager), the planning strip (its own ‹ ›).

## Performance
- A glide is three `scrollLeft` writes a frame (plus the tray's transform); React hears a day change, through a transition. Scripted three-day glide + settle: **0 long tasks** (harness f-perf).
- The one heavy step is the re-centre (FullCalendar redraws every drawn day: ~70–100 ms in the **dev** build for 21 columns). It runs 220 ms after a settle, only when the buffer runs low; mid-gesture only at the buffer's very end (a fling of more than a screen in one go), where it's a one-frame hitch. A cheaper redraw (fewer React portals per header) is the upgrade path if that shows on Kai's laptop.
- `headerDay` now shares one `Intl.DateTimeFormat` (it made one per header, ×21).

## Gotchas found on the way
- `.fc { zoom: 1 / ui-scale }` can land a style pass after the first draw (seen with reduced motion): the scroller's width changes without any ResizeObserver hearing it. `glide.check()` re-measures after every grid render and at each gesture/nav start.
- The Interface size: FullCalendar's px are the screen's (its root undoes the zoom), so the wheel is 1:1 with no zoom division; the tray (outside `.fc`) converts with `/ uiZoom()`.
- Cairo leaves summer time on Thu Oct 29 (UTC+3 → +2): harness times are read on Cairo's clock.

- Multi-select drag's "would leave the days on screen → soft-no" now reads the glide's days on screen, not FullCalendar's drawn range (which includes the buffer).
- Menus and the view options close on scroll. The glide's invisible scroll writes (a re-centre, the same day put back after a redraw) are marked (`lib/quietScroll.ts`) and `ContextMenu` / `ViewOptionsPopover` let them through — a right-click right after ‹ › kept closing under the deferred re-centre. A real glide still closes them, as a vertical scroll does.
- With reduced motion, Chrome left a freshly mounted FullCalendar root at zoom 1 until its next restyle (normally the view fade restyles it): the glide attach toggles a class on it first.

## Checks
- `docs/log/assets/cal-scroll/verify.mjs` — **52/52**: wheel deltaX + Shift+wheel move the days, mid-glide the header follows and the three scrollers agree, settles on a day boundary (incl. a 0.3-day nudge back), a vertical wheel still scrolls hours; ‹ › Today (animated, past the buffer, back from two weeks), → key; blocks on screen for every day in 12 looks during a ten-day glide and after the re-centre; a drag one column right after a glide writes Sun Oct 25 10:00; a block held at the right edge scrolls the days on and lands past the last shown day at 10:00; a click opens details; no long task in a glide; reduced motion instant; motion eases; 100% / 150% interface; Day view with the second clock and fit hours; 3 days settles by the day; phone: title follows mid-swipe, 7 panes with neighbours' blocks, a resting finger settles one day, a fling crosses 2–3 days, the strip follows, a fling back, a tap opens details, 3 days by the day, Week by the week.
- `app/src/features/calendar/gridGlide.test.ts` — settle rule, wheel reading, re-centre threshold, phone fling/peek math (7 tests).
- Gate: lint 0, build ok, ds:check 0 new (one `ds-ok`: the phone settle's transform transition has a template duration); `birthday_on` 1/1 in types.ts / settings.ts. Vitest ×4 TZ: **2687/2687** on the first run (03:57); the final run (04:41) had **1 failure, `src/lib/sounds.test.ts` › quiet › "starts when the garden closes and lifts the next day"** in all four zones — it reads the real clock (`new Date()`, the 04:00 loop day), this branch doesn't touch sounds; a time-of-day flake to look at separately.
- Re-runs alone/in lanes against :5338 after the last change: drag-fix **176/176**, cal-clicks **96/96**, motion-cal **98/98**, shot-bugs **54/54**, cal-blocks **93/93**, cal-polish **229/229**, calendar-phone **180/180**, time-slots **153/153**, calendar-rail **101/101**, cal-scroll **52/52**.
- Harness change: calendar-phone `7h-day` asserted the old paging ("a swipe pages three days → Sep 30 – Oct 2"); it now asserts the glide (a 200px swipe settles 2–4 days on, by the day). Nothing else in another harness changed.
- Playwright: `omniroute`'s playwright-core went missing mid-session (another install?); runs used `npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs` as the harnesses' 3rd argument (calendar-phone's 4th).

## Not done / for Kai
- Momentum on a real trackpad is the OS's; the harness drives wheel events (CDP), so the feel on Kai's Windows touchpad and the Mac app's WKWebView is worth a minute of his hands.
- A held block can scroll as far as the drawn buffer (a week either side in Week view) — the buffer never re-centres under a held button.
- The phone's neighbour panes mount at the swipe's start (Day 7 columns, 3 days 15, Week 21): more than the old 3 panes on a slow phone.
