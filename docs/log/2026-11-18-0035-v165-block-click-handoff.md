# v1.6.5 · a click on a calendar block keeps its popover — handoff (2026-11-18)

Branch `claude/v165-block-click` (from `origin/claude/kai-bugs-1012` at 004f07d2). Not merged, not released. No migration.

## What Kai saw (v1.6.5-test, Windows, ~1110x598, his 12 s recording)
Clicking "Do your Homework" (Day view, 12 AM row) flashed a popover that faded out at once: sometimes the colour menu, sometimes the details (length chips, Starts / Ends). After that the block could not be opened at all.

## Root cause
Not v165-cal-add (empty-grid create, never involved: block clicks reach `eventClick`, not `select`) and not v165-colours. It is `lib/motion.ts useOverlayExit`, which CalendarPage uses for the block popover (and ContextMenu / AppLayout):
1. A press on the block with its popover open = an "outside press" for `ContextMenu`, so it closes (`selected = null`, exit starts, `closing = true`, a 100 ms timer to end it).
2. The press's own click then runs `handleEventClick` and opens the popover again, inside those 100 ms.
3. `open` flipped back to true, so the effect's cleanup cleared the exit timer and its early return (`if (open || !was) return`) never reset `closing`. `closing` stayed true while the popover was open: drawn with `kf-pop--out` (opacity 0), Esc and outside presses ignored while "closing". Dead until a reload.
The right-click colour menu then click on the block (menu B -> details) is the same hop, which is why both popovers flashed. Reproduced in the mock with a 40 ms press (Playwright's default 0 ms hold had hidden it). It was a time window: a fast human click hits it, a slow one doesn't.
The "details left, clipped" shot is the details popover placed by `besideBlock` (left of a full-width block, over the sidebar) while fading; in the mock it is fully on screen at 1110x600 and 1440x900 (UI scale 100 and 125). The recording is cropped at the left edge of the window.

## Fix
- `lib/motion.ts`: a reopen resets the flag (`if (open) setClosing(false)`), and the hook returns `overlayPhase(open, closing)` (pure: `closing && !open`) so even the one render before the effect is not "closing".
- `components/ContextMenu.tsx`: optional `isAnchor(target)`: a press on the thing the menu hangs off does not close it (the TaskPopover already did this with `anchor.el.contains`). A drag from it (>4 px) does close it. `BlockMenu` passes the block (`.fc-event[data-kf-id]`). So a second click on the same block no longer closes then reopens (no flicker, no remount).
- Empty-grid click, type-in-place create, outside press, Esc: unchanged.

## Checks
- Unit: `lib/overlayExit.test.ts` (4 cases, incl. the stuck flag). Gate: 218 files / 3022 tests x4 time zones, lint, build, ds:check all green. `birthday_on` 1/1.
- Harness `docs/log/assets/v165-block-click/verify.mjs` (1110x600 @125%, 1440x900 @125%, 1110x600 @100%): all pass; on the base commit 21 checks fail (popover at opacity 0 after the second click, Esc / outside ignored, menu then click dead). Phone: not affected (its block opens a BottomSheet, not a ContextMenu).
- Re-runs, all green: v165-cal-add 54/54, v165-colours 22/22, cal-scroll 52/52, drag-fix 176/176.
