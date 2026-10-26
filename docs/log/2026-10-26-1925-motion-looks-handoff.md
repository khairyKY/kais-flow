# 2026-10-26 19:25 · motion-looks handoff

Kai asked to SEE each motion from the motion-gaps audit (`D:\Coding\_claude-cloud\kais-flow-motion-gaps-2026-10-26.md`, 81 gaps) before anything is built. Branch `claude/motion-looks`, cut from `claude/kai-bugs-1012` (e1e84c17). **No app code changed.**

## What's here

- **`design-export/Motion fixes.html`**: one static page, open it from disk. The app's token files (`colors`, `colors.dark`, `effects`, `spacing`, `typography`, `motion`) are inlined verbatim (minus their `@media` blocks). Every demo reads durations and curves from those tokens at run time (`T('--dur-pop-in')`, `E('--ease-out')`). Plant images are downscaled copies of `app/public/ds/assets` embedded as data URIs; icons are the kf-* line glyphs. The only network request is Google Fonts, and the page falls back to the token font stacks without it.
- Every item has two panes, **Now** and **Fixed** (or **Proposed** in C), each with ▶ Replay, plus a ▶ Replay both. Each item plays once when it scrolls into view. Most mocks are live: tick boxes, right-click, fold sections, swipe sheets and rows (mouse or touch), drag blocks and resize grips in mini calendar columns, scroll the parasol header.
  - **A.** The top 10, in the audit's order: T1, T2+T3 (path: Project detail / Today), K1, O2+O3 (path: Voice / More), R6, R1, R3, R8 (path: evening / morning), O1 (path: menu / ⌘K / modal), T8.
  - **B.** CAL1–CAL14, opening with a table that maps the 10-22 audit's open items (S2/S6/S7/S10/S11 → CAL9, M1 → CAL14, M2 → O1, M4 → CAL4, M7/M11 → CAL5/6, M8 → CAL6/10, M10 → C, M12 → CAL7). CAL1's four drop paths share one demo with a path selector. CAL11 and the snap flash (D4) live in C.
  - **C.** The 12 "Kai's call" items, each with Yes / No: D12 (season selector), D13 (hour slider), D14, D15, D16, D11, D8, D9, D10, D3, CAL11, D4. Per the coordinator, **D15 parasol, D3 velocity tilt, CAL11 selected outline and D4 snap flash are pre-marked Yes**. The other 8 are open.
  - **D.** The other 26 P2 items as compact demos, grouped by surface: Today/Tasks/Inbox, overlays and chrome, ⌘K and capture, rituals/Focus/Chat/Routines, designed-never-built, reduced motion. After them, the 18 P3 items not shown elsewhere, as a one-line list.
- **Page controls:** Day/Night, Full motion/Reduced (it starts on Reduced when the OS asks for reduced motion), and **Copy my picks**, which collects C's answers plus every "Not this" in A, B and D, copies the text and shows it. Picks are kept in localStorage, in that browser only.
- **Reduced preview** follows the audit's RM2 rule. Now panes behave like the app's global 0.01 ms rule, so everything jumps. Fixed panes keep only the fade of functional motion and drop decorative motion.

## Evidence (`docs/log/assets/motion-looks/`)

- `shoot.mjs` drives the page with installed Chrome through playwright-core: `node shoot.mjs` (`ONLY=check|shots|video`). `results.json` has **15/15 passing**:
  - section counts A10 / B13 / C12 / D26
  - the four Yes answers pre-marked
  - no page errors while every demo played, in day and in night + reduced
  - Copy my picks lists the C answers and the "Not this" items
  - 10 videos written
- `shots/`: 61 item screenshots in day (`<ID>-day.png`), 4 in night + reduced, the picks dialog, and the top of the page.
- `video/01…10-<ID>-fixed.webm`: Playwright recordVideo of each top-10 Fixed pane on its own (the rest of the page hidden).

## Notes

- **Video setup:** Playwright's video needs its own ffmpeg, which wasn't installed. I copied the system `D:\tools\FFmpeg\…\ffmpeg.exe` to `%LOCALAPPDATA%\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe`; nothing was downloaded.
- **Mock fidelity:** the mocks redraw the real screens from the app's CSS values, at 125% for the calendar. They are not the app itself. Timings and curves are exact; layout is close.
- **Colours:** none are new. The Effects 1j dusk-veil gradient and the season particles use the design export's own recipe values.
- **Assembly:** the page was put together from parts by a one-off build script. Edit `Motion fixes.html` directly from now on.

## Next

Kai answers C (8 open) and marks any "Not this", then pastes the picks. The build follows the audit's §4: shared `ContextMenu`/`OverlayCard`/`Scrim` exits, `Collapse`, `useCompletingRows`, `flip()`, the `staggerDelay` cap and `motionTier`, plus the calendar items.
