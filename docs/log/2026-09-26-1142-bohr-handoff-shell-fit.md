---
date: 2026-09-26 11:42 UTC
session: bohr
type: handoff
related: shell-fit task (Polish G finding task_060eb32f, started by Kai), final-cleanup fb4ae66/5e529d4, release-1
supersedes: none
---

# Shell fit under the root UI zoom: done, measured 40/40

Branch `claude/shell-fit` (off `claude/release-1`).

The core `100dvh × zoom` fix was already in release-1 (`fb4ae66`, `5e529d4`): `--kf-vh` / `--kf-vw` in `index.css` = viewport ÷ `--kf-ui-scale`. The pre-paint script in `index.html` already publishes `--kf-ui-scale`, so the first paint is right. `CalendarGrid.css`'s own zoom compensation is untouched, so there's no double correction. This branch closes the task's two remaining "done means" items.

## Changes

1. **Sidebar footer always visible**
   - The footer rows (Capture, Search, Chat, Settings, Sign out) are pinned below the scrolling column instead of at its end.
   - A pinned 194px footer on a short sidebar pushed Tasks, Calendar and Projects out of view: 1280×800 at 125% is a 640px sidebar, and Projects ends at 587px.
   - So below **800px of sidebar height** (a size container query on `.app-sidebar`, which is zoom-aware, unlike media queries), the footer becomes **one row of icons** (47px). It uses the collapsed rail's own treatment and doesn't apply to the collapsed rail itself.
   - Every footer control gained `title` + `aria-label`. The collapsed rail's footer icons had no accessible name before.
2. **Nothing hides under the phone tab bar**
   - Root cause (not zoom): `.kf-route` had `height: 100%`. A long page overflowed that box, and `.app-main-content`'s bottom padding (the 88px tab-bar clearance) is added after the box, not after the overflowing content. So the last line of a long page ended flush with the screen, under the tab bar. This showed at 110% and up.
   - Fix: `.kf-route` is a flex column with `min-height: 100%`. Full-screen pages (Herbarium, Activity, Trash) already use `flex: 1` and still fill.
   - Only a route holding the calendar keeps the definite `height: 100%` (`.kf-route:has(> .cal-shell)`), because its grid scrolls inside itself.

## Evidence (production builds, local stack, Chromium 1194, kai.local)

**Matrix** (`docs/log/assets/shell-fit/shellfit.mjs`): scales 1 / 1.1 / 1.25 / 1.5 / 1.75 × 1280×800 and 390×844 × /today /calendar /journal /settings. Pass means all of:
- signed in, inside the app shell;
- `scrollingElement.scrollHeight === innerHeight`;
- desktop: the Sign out control is inside the window;
- phone: after scrolling `.app-main-content` to the bottom, no readable or tappable element (own text, media, control) sits below the tab bar's top. Fixed layers and content clipped by an inner scroller count as clear.

| Build | Result | Example |
|---|---|---|
| **before** = master `fd54d42` | 4 / 40 (only phone at 100%, where there is no zoom) | desktop 125% `/today`: doc 1000 vs 800, Sign out at y=1441 |
| **after** = this branch | **40 / 40** | desktop 125% `/today`: doc 800 = 800, Sign out visible |

**Sidebar** (`sidemeasure.mjs`, layout px): Projects is visible at every window/scale tested. The footer is 47px compact at 1280×800 and 1440×900 @125%, and 194px full at @100% and at 1920×1080.

**No regressions:**
- full route sweep **80/80** clean (20 routes × desktop/phone × day/night);
- pixel diff of Herbarium / Activity / Trash / Calendar / Focus / Today against release-1: phone Activity/Herbarium/Trash identical;
- desktop diffs are confined to the sidebar footer region, plus time-dependent Today content and the calendar now-line.

**Screenshots:**
- desktop 125% Today before/after, day + night;
- phone Journal scrolled to the bottom before/after, day + night.

Logs: `before.log`, `after.log`.

**Checks:** `TZ=UTC` and `TZ=Africa/Cairo npx vitest run`: 48 files / 659 tests each. Lint 2 errors (baseline `ProjectsPage.tsx:23–24`). `npm run build` green. `AppLayout.tsx` still CRLF (798/798 lines).

**Environment note:** the container restarted once during this task. Docker was brought back with the recovery recipe in `2026-09-26-0510-bohr-correction-restart.md`, and the stack data was intact.
