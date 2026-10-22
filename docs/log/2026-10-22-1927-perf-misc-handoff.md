---
date: 2026-10-22 19:27 (Cairo)
session: perf-misc (builder, branch claude/perf-misc)
type: handoff
related: D:\Coding\_claude-cloud\kais-flow-calendar-motion-audit-2026-10-22.md (S8, M3) · docs/log/assets/perf-misc/
---

# S8: the first tick is no longer blocked by the chime · M3: done boxes stop re-popping

Two app-wide items from the calendar and motion audit. I changed only `lib/sounds.ts` and the kit `Checkbox`,
plus a small new pure helper. Branch `claude/perf-misc` is pushed. It is not merged and has no PR.

## S8: the first checkbox tick of a session

**Cause:** `player.play` built the Web Audio context with `new AudioContext()` inside the click, before
the tick could paint. With a gesture behind it, Chrome also opens the audio stream synchronously.

**Fix (`app/src/lib/sounds.ts`):**
- The context is built once, in `requestIdleCallback` after the page's `load`. It is never built on an
  interaction path.
- Before any gesture, Chrome creates it **suspended**, which is cheap: 28–90 ms here, against
  378–604 ms when it was built inside the click.
- The first sound calls `resume()` from inside its own click and does not wait for it. That satisfies
  the autoplay rule. The voice is scheduled at `currentTime` and plays once the context runs.
- A context that comes up running anyway (a WebView that allows autoplay) is suspended until a sound
  wants it. That matches the old "nothing running until the first sound".
- When the master volume is 0 at load, nothing is built. A preview made later builds the context in
  idle time after its click, then plays. The same fallback covers any sound asked for before the idle
  build has run.
- Sounds, packs, volume, quiet rules and the 80 ms throttle are unchanged. `playCompletion` remains the
  only completion call: it is untouched, as are all call sites.

**Measured** with `docs/log/assets/perf-misc/measure.mjs`:
- Setup: mock dev server :5299, desktop Today, headless Chrome with the **real** autoplay policy.
- Each scenario was run 3×, each time in a fresh session. Raw data is in `measure-before.json` and
  `measure-after.json`.

| First tick of a session | Before | After |
|---|---|---|
| Click → next paint (Event Timing duration) | 424–672 ms | 40–64 ms (one 168 ms headless presentation outlier, with its frame at 27 ms) |
| aria-checked flip → next frame | 405–648 ms | 18–27 ms |
| Long tasks from the click to +3 s | one of 402–643 ms (+ ~50 ms React) | none |
| `new AudioContext()` | 378–604 ms, **inside the click** | 28–90 ms, at load idle (3.5–5.2 s before the tick) |
| Chime scheduled after the click | 392–629 ms | 5–10 ms (context `running` afterwards) |
| Second tick, click → paint | 40–56 ms | 40 ms |

### Two variants I tried first, and why they were dropped

1. **Build in idle after the first click or key anywhere** (the audit's suggestion).
   - The tick painted fast, but the ~0.5 s headless build then landed right *after* the action.
   - The harnesses' shared `settle()` gives writes a 400 ms quiet window, and about 20 harnesses use it.
     They then missed the write: fix-tasks q1 failed 3/3, against 0/2 on base.
   - It also charged a build to sessions that never play a sound.
2. **Build on demand when the first sound asks, after its paint.**
   - Sessions without sound were clean, but every capture flow still failed:
     fix-tasks c2 failed 2/3, and today-shell w failed.
   - The sound comes first and the write follows the build.

Building at load idle keeps both the click path and the time after the action clean. It is also cheaper,
because the context starts suspended.

**Known ceiling:**
- WebKit wants `resume()` inside the gesture itself. We call it in the click's own `play`, so that
  holds, except for a sound asked for before the load-idle build has run.
- All of Kai's targets are Chromium (WebView2, Android WebView, Chrome).

## M3: ticked boxes popped again on every phone day swipe

**Cause:** the kit `Checkbox` set `boxFill` / `checkPop` whenever it was checked and motion was on. Every
mount of a ticked box therefore replayed them: each swipe's neighbour panes, opening a list, a view change.

**Fix:**
- `app/src/components/checkTick.ts` holds a pure state, `{checked, pop}`. `nextTick` turns `pop` on only
  when an unticked box becomes ticked. It stays on while the box stays ticked, so a re-render mid-pop
  doesn't cut the animation. An untick clears it.
- The Checkbox holds that state and updates it during render ("adjusting state when a prop changes",
  so it never lags a render). It animates only when `pop && motionOn`.
- Reduced motion and animations-off still mean no animation (`useMotionEnabled`).
- Today's `bloom.toggle` still pops, because its box goes `checking` false → true while mounted.
  `DoneCheck` is not the kit box and is untouched.

**Measured** with `docs/log/assets/perf-misc/m3.mjs`:
- Setup: phone 390 calendar, done blocks on yesterday, today and tomorrow, one open block. It counts
  `animationstart` for boxFill and checkPop.
- Raw data is in `m3-before.json` and `m3-after.json`.

| | Before | After |
|---|---|---|
| Load (1 done box on screen) | boxFill + checkPop | none |
| Swipe → tomorrow | 3× boxFill + 3× checkPop | none |
| Swipe ← back to today | 2× boxFill + 2× checkPop | none |
| A real tick | boxFill, checkPop | boxFill, checkPop |
| Reduced motion: load / swipes / tick | none / none / none | none / none / none |

A one-off check on desktop Today gave the same before and after: no pops on load, and a plain row's
tick → boxFill, checkPop.

## Gate (all in `app/`)

- **Static checks:**
  - `npx tsc -b` clean.
  - `npx vitest run`: 2337 passed, including the new `components/checkTick.test.ts` (3 tests).
  - `npm run lint`: 0 errors.
  - `npm run build` OK.
  - `ds:check --baseline`: 0 new.
  - `birthday_on` greps: 1 / 1.
- **Harnesses on the final code**, run one at a time against :5299:
  - sounds 126/126.
  - fix-tasks 70/70.
  - today-shell 86/86. One full run had a single `l …"calls" goes on both selected tasks` miss; the
    `l` section alone passed 2/2, and a full rerun gave 86/86.
  - phone-polish 718/718.
  - motion 48/48.
  - perf-misc m3 6/6.
- The sounds harness rewrites its WAVs in `docs/log/assets/sounds/`. They came out ±1 LSB different
  (offline-render rounding), so I restored them and nothing there is committed.

## Files

- `app/src/lib/sounds.ts`: context lifecycle only (load-idle build, suspended until a sound, no build on an interaction).
- `app/src/components/kit.tsx`: Checkbox pops only on an in-life tick (CRLF kept).
- `app/src/components/checkTick.ts` + `checkTick.test.ts`: new.
- `docs/log/assets/perf-misc/`:
  - `measure.mjs` (S8).
  - `m3.mjs` (M3).
  - The before and after JSON.
