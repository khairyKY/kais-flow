# 2026-11-16 18:00 · handoff · v164-focus-widget (F6: phone Focus widget redrawn to Focus D3)

Branch `claude/v164-focus-widget` (from `origin/claude/kai-bugs-1012`). Not merged, not released. No migration, no edge function, no new dependency.

## What's built

The home-screen Focus widget (W18 2x2, W20 slim 2x1) no longer draws the ring. It draws Focus D3's segment bar: focus rounds in the block's colour (Iris with none), breaks in sage, kept = filled, the one under way filled to how far through it is, the rest pale. No flowers.

| Piece | Where |
|---|---|
| Snapshot | `features/widgets/snapshot.ts`: `WidgetFocus` gains `mode` (focus / break / idle), `round`, `rounds`, `color`, `segments` (`kind`, `min`, `state` kept / now / todo; at most 16 = `MAX_SEGS`, the 16 around the one under way) and `breakEndsAt`. New `buildFocus()` builds it from `phaseOf` / `timelineOf` (focusPlan), so a break works too, not only pomodoro. `FocusInput` gained optional `block`, `kept`, `breakType`, `pomodoroStartIso`, `plan`. Hide titles: `mask` is unchanged (title becomes "Your focus"); segments carry no names. |
| Bridge | `WidgetBridge.tsx` passes the focus store's block / kept / breakType / settings, re-renders on them, and rounds `breakEndsAt` in the push key like `endsAt`. |
| Bar | new `FocusBar.java` (bitmap per theme, copied from DayBar; `DayBar.theme` is now package-private) + `layout{,-night}/kfw_focusbar.xml`. |
| Widget | `Families.focus` + `kfw_focus_run.xml` (task, big Chronometer, "Round 3 of 4", bar, Stop, Done) and `kfw_focus_slim.xml` (minutes, "Focusing · 3 of 4", task, bar). Break: "Break", sage countdown to `breakEndsAt`, "After round 2 of 4", "Next: <task>", bar with the break "now", Stop only. Paused: static time, "paused", same buttons as running. Idle layout is unchanged. Ring drawables (`kfw_ring_big/small`) deleted. |
| Colour | one new resource `kfw_sage` = `--acc-sage` (day #8A9A7E, night #A8C09A) in `kfw_colors.xml`; the block colour is the existing palette C `kfw_blk_<swatch>`. |
| Previews | `kfw_preview_w18/w20.webp` redrawn; mock faces in `docs/log/assets/widgets-build/mock.html` (`focusFace`). |

## Choices the spec didn't cover

- `color` in the snapshot is the palette C **swatch name** (`'rose'`), like `WidgetBlock.color`, not a hex: the Java palette is keyed by name and gives the night value for free. A custom hex maps to the nearest swatch; the `var(--blk-x)` token to `x`.
- The bar is the rounds and breaks only; the leftover time in the block (drawn empty on the page) is not shown.
- Break "next round's title" is the session's task title (the block goes on with the same task). A break that is waiting to start (phase `end`) is shown as a paused break at its full length, the break segment at nought.
- The "now" fill is computed in Java from the time left, so it stays right between pushes (nothing about fraction in the snapshot).
- No Resume button: none exists in the widget bridge today (only Stop / Done / start), so paused keeps Stop + Done and tapping opens /focus.
- Slim idle keeps the existing "Start on your goal" with no bar.

## Checks

- Gate (vitest x4 zones, lint, build, ds:check): see the run line at the end of this file. `birthday_on` 1/1.
- vitest: `features/widgets/snapshot.test.ts` 20 tests (7 new: running, break, break waiting, paused / idle, 16-segment window, colour mapping, hide titles).
- Java: `FocusBarTest` (JUnit, geometry: widths follow minutes, gap, narrow bar, fraction) runs in android.yml's Build step with `LockPlanTest`.
- Mock harness: `docs/log/assets/v164-focus-widget/shoot.mjs` draws run / break / paused / idle, 2x2 and slim, day and night (`after-*.png`, `after-day.png`, `after-night.png`), no overflow, no page errors (`results.json`); `before-w18.png` / `before-w20.png` are the ring faces.
- No Android SDK here, so Java is only compiled by CI: Android APK run id at the end of this file.
- Smoke: `android-smoke.sh` can't draw the widget (signed out, none placed on a home screen), so it only gets a logcat check that the widget code did not throw while the app ran. Running / break / idle are drawn in the mock and checked on the phone (below).

## Left

- Rendering the three states on the emulator needs a placed widget with a signed-in snapshot; not possible in the current smoke without a debug-only hook (not added: it would ship in the release APK).

## Manual checklist for Kai (phone)

1. Install the branch APK (android.yml artifact). Place the Focus widget 2x2 and 2x1 (re-add them if the picker still shows the old ring preview).
2. Start a focus on a task that has a Time block: the widget shows the task, a ticking countdown, "Round 1 of N", one segment filling in the block's colour, breaks in sage.
3. Wait a minute: the filled part grows; the countdown never stops.
4. Pause in the app: the widget says paused and holds the time. Resume: it ticks again.
5. Let the round end: a break shows "Break", a sage countdown, "After round 1 of N", "Next: <task>", Stop only.
6. Stop: back to "Start focus". Turn on Hide titles on the home screen: the task reads "Your focus".
7. Switch the phone to dark mode: the bar and the sage move to the night values without a redraw.
