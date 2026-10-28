# motion-cal handoff (lane B · calendar) — 2026-10-28

Branch `claude/motion-cal`, from `claude/kai-bugs-1012`, with `claude/motion-lists` merged in (55d91d20, A1's gate: `reducedMotionNow()`, `.motion-on` on `<html>`). Not merged, not released.

Sources: `_claude-cloud/kais-flow-motion-build-brief-2026-10-28.md`, the gap report's calendar section, the 10-22 calendar audit, and `design-export/Motion fixes.html` (its "Fixed" timings).

## Gates (RM2, A1's rule)
- **Functional** (a settle, a ride home, the fold into the rail, a resize's commit, the view / planning / rail fades, colour and outline eases, the carried dim, the phone day slide, the phone fade-out, the held task's glide back, the put-down): plays with Effects off; reduced motion → cut (CSS via the global rule, Web Animations via `reducedMotionNow()`).
- **Decorative** (D3 lean + trail, D4 snap flash, the just-landed rings, the tick pops, the held task's lift): Effects on only (`.cal-motion-on` on desktop, `.motion-on` on the phone).

## Items

| ID | Status | What | Where |
|---|---|---|---|
| CAL1 | built | Every drop settles onto what now stands for the block: the moved block; a Ctrl+drag's **copy** (the first block to arrive after the drop); a task block dropped in a Time slot → the slot's **row**; the **same spot** settles at once (was a 400 ms wobble, then a cut); onto the **rail** the ghost folds into the task's row (200 ms) and the row breathes in — no fade where FullCalendar put it back. A repeat moved: the ghost settles at once; the scope question follows; "This" then swaps ids under it (the old one fades, the new one rings — same spot). | `CalendarGrid.tsx` settleGhost, foldIntoRail, eventDragStop / eventDrop, `quiet` ids |
| CAL2 | built | A refused drop shakes (320 ms), then rides home (380 ms, `--dur-ghost-home`); the block stays out of sight until the ghost is there. Multi-drag and Ctrl+drag refusals too. | `CalendarGrid.tsx` refuse |
| CAL3 | built | A resize draws the solid block (its fill, edge, full text), not a dashed outline; on release it commits and rings. | `CalendarGrid.css` `.kf-cal-resizing`, commitStretch |
| CAL4 | built | Check B ticked here: boxFill 90 + checkPop 180; repeat B: the arrows turn 180° (240 ms), then the tick pops; slot rows too; the phone's repeat B too. Only a tick made on screen (blockMotion `markTicked` / `takeTicked`) — never a box that arrives ticked (paging, sync). | `CalendarGrid.tsx` tickBox, `PhoneGrid.tsx`, `blockMotion.ts` |
| CAL5 | built | View switch: the new view fades in (160 ms). Planning mode: `.cal-main` fades (160 ms). Rail unfold: its content fades in (120 ms); its width still snaps. | `CalendarGrid.tsx` fcKey effect, `CalendarPage.tsx` |
| CAL6 | built | Phone strip taps and Today slide the day in through the swipe's own settle (200 ms, `--ease-standard`; the neighbour pane shows the target days); the pill fades across (120 ms, as the day settles). Arrivals that are the person's own ring (300 ms); blocks that leave fade where they were (120 ms). | `PhoneGrid.tsx` slideTo, fadeOut, `PhoneCalendar.tsx` goTo, `phoneCalendar.css` |
| CAL7 | built | `.pc-block` carries the transform/shadow transition, so the put-down eases. The held task moves by `translate` and rises with a 120 ms lift. A tray chip let go off the grid (or a cancelled hold) glides back to its chip / row (200 ms). | `PhoneGrid.tsx` glideBack, `phoneCalendar.css` |
| CAL8 | built | `--kf-ev-c` / `--kf-ev-accent` registered (`@property`, `<color>`) and eased 150 ms — only after a block's first paint (`data-kf-hue`), so nothing fades in from the kind's hue. Swatch ring fades, with a quieter hover ring. | `CalendarGrid.css`, `formFields.tsx` |
| CAL9 | partly | Done: S7 `EmojiText` memoised; the zone plugin's offsets cached per minute; S11 the rail hover is one look a frame, hit-testing only over the rail. Not done: S2 (a drop's 2 passes — the settle now hides the old-slot frame), S6 (popover's forced layout), S10 (mounting phone neighbour panes on press would cost every tap a render). | `components/EmojiText.tsx`, `zonePlugin.ts`, `CalendarGrid.tsx` trackRailHover |
| CAL10 | built | Rings only for the person's own arrivals: a block that appears within 1.5 s of a calendar write made here (`api.ts` writeEvent → `noteLocalWrite`). Google sync, another device and a cold load land quietly. A time window, not ids: a restored occurrence comes back under an id no write named. | `blockMotion.ts`, `api.ts`, both grids |
| CAL11 | built (Kai yes) | The block whose details / menu B / task popover is open: a 2 px outline in its own ink, in 120 ms, out with the popover. The keyboard ring and the outbox marks keep the outline when up. | `CalendarPage.tsx` selectedId, `CalendarGrid.css` |
| CAL12 | built | The carried blocks dim over 120 ms, both ways. | `CalendarGrid.css` |
| CAL13 | skipped | Kai's SKIP. The lane list also named its three parts (drag-select unselect, Now card float fade, phone tray chips) — Kai's skip won. | — |
| CAL14 | built | The settle eases the ghost's lift, lean, wobble, shadow **and size** (a narrower overlap lane) from where they are, in one Web Animation, 160 ms ease-out. | `CalendarGrid.tsx` glide |
| D3 | built (Kai yes) | The ghost leans with sideways speed, up to ±6°, decaying back upright when the hand stops; a 22% copy trails it; the wobble stays underneath; eased to 0 on the settle. | `CalendarGrid.tsx` startGhost |
| D4 | built (Kai yes) | Each step of the placeholder flashes its top edge (1.5 px lavender-deep, 120 ms). Resize: the edge runs free under the pointer (a margin on the mirror's harness, once a frame), then commits to the quarter in 160 ms and rings. | `CalendarGrid.tsx` watchSnaps, stretchFreely, commitStretch |

Also fixed on the way: the ghost clone carried the block's `data-kf-id`, so a settle's `data-landing` hid the ghost itself and lookups by id could find the copy; lookups are now scoped to the grid and the clone drops the id.

## Checks
- `docs/log/assets/motion-cal/verify.mjs` — **98/98** (every item with Effects on, Effects off and reduced motion, and its end state; shots beside it). The CAL10 sync case is `app/src/features/calendar/blockMotion.test.ts` (the mock has no refetch path).
- drag-fix **176/176**. cal-clicks: every section green run alone (c 18, p 11, s 28, t 23, x 7, v 9); a full run once crashed late (a 30 s timeout opening a fresh page) — it doesn't repeat alone.
- After merging `claude/kai-bugs-1012` (95d07e78: motion-chrome, shot-bugs): shot-bugs **54/54**, motion-cal 98/98 and drag-fix 176/176 again.
- Other calendar suites: cal-blocks 93/93, cal-polish 229/229, cal-looks 107/107, calendar-rail 101/101, time-slots 153/153, cal-wave 224/224, calendar-phone 180/180, event-detail 71/71. (A first run of cal-blocks / cal-polish / cal-looks caught a resting outline on picked blocks and the trail counted as a ghost — fixed; the re-runs above are after the fix.)
- cal-rail-drop 28/29: `p1` taps a phone block and expects the swatch tray in its sheet — since cal-clicks a tap opens the details sheet and the tray lives in menu B (long-press). Not this lane's; the harness needs cal-clicks' new mapping.
- Gate (`gate.ps1`): vitest ×4 TZ 2677/2677, lint 0, build, ds:check 0 new; `birthday_on` 1/1 in types.ts / settings.ts.

## Notes for Kai / the conductor
- The phone pill moves when the slide lands (200 ms), not on the tap.
- Effects off: blocks don't lift 1 px on hover — so a press 10 px from a block's top lands on its resize edge (that's the old behaviour; harnesses should press the block's middle).
