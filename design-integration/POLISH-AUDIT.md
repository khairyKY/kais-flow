# POLISH-AUDIT — rendering/scroll/motion defects vs design-export (2026-07-17)

Deep audit of `feature/botanical-integration` against `design-export/` (3 parallel code
audits + live computed-style checks on localhost:5195). Scope: blurry text, extra/infinite
scrolling, misbehaving **implemented** animations. Not-yet-built animations are X2's job, not here.

Fix order below is dependency order — P1 enables P2. Every item: file:line → defect → fix.
The **DO NOT TOUCH** list at the bottom is as binding as the fixes: those were investigated
and are design-faithful or non-issues; "fixing" them creates deviations.

---

## A · Scroll & viewport

**P1 — Shell has no bounded scroll region (enabler for everything).**
`AppLayout.tsx:393` `.app-shell{min-height:100vh}`; `main` (`:480`) and `.app-main-content`
(`:482`) lack `min-height:0`/`overflow`. The body is the only scroller; pages can never clip
to the viewport. Export intent (`Calendar.dc.html:89,149,182`): fixed shell, `main` scrolls.
→ `.app-shell`: `height:100dvh` (drop min-height:100vh); `main`: add `min-height:0`;
`.app-main-content`: `flex:1; min-height:0; overflow-y:auto`.

**P2 — Calendar scrolls forever.**
`CalendarGrid.tsx:124` `height="auto"` + default slotMin/Max (00:00–24:00) × `CalendarGrid.css:73`
27px slots = ~1360px page growth; FullCalendar builds no internal scroller. Export 1a: grid
panel `flex:1;overflow:hidden`, time body scrolls internally; mobile 1b: fixed `height:396px`.
→ `height="100%"` + `scrollTime="08:00:00"`; add `min-height:0` to `.cal-shell`/`.cal-main`
(`CalendarPage.tsx:226,229`). Requires P1 or it's inert.

**P3 — `100vh` never `dvh` (phantom scroll under mobile address bar).**
`AppLayout.tsx:393`, `QuickCreate.tsx:490,504` (88vh), `NewRoutineForm.tsx:276`,
`ShortcutOverlay.tsx:79`, `SignInPage.tsx:44`. → replace vh→dvh in these spots only.

**P4 — Overlays scroll-chain to the page; no body lock anywhere.**
Scrollable overlay panels: `QuickCreate.tsx:490,504`, `NewRoutineForm.tsx:276`,
`ShortcutOverlay.tsx:79-80`, `ChatPanel.tsx:92`, `EventDetailsPanel.tsx`, `SearchOverlay.tsx:98`,
`CommandBar.tsx:92`. → `overscroll-behavior:contain` on each scrollable panel; body
`overflow:hidden` while a full-screen overlay is open (one shared hook, not per-overlay copies).

**P5 — QuickCreate desktop popover can spill off-screen.**
`QuickCreate.tsx:518` fixed `width:330`, computed `left`, no clamp.
→ `maxWidth:calc(100vw-16px)` + clamp `left` into viewport.

## B · Blurry text

**P6 — Task/Inbox rows sit on a permanent GPU layer at rest (worst real blur).**
`TaskRow.tsx:448`, `InboxPage.tsx:669`: unconditional `transform:translateX(${swipe.x}px)` —
at rest that's `translateX(0px)` ≠ `none`, so the densest text in the app stays rasterized on a
composited layer. Export rows have no resting transform.
→ `transform: swipe.x !== 0 ? … : undefined`.

**P7 — Missing font-smoothing pair.**
`index.css:66` has only `-webkit-font-smoothing:antialiased`; every export page also sets
`-moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility`. → add both to `body`.

**P8 — Sub-10px fractional calendar labels (softest text in app).**
`CalendarGrid.css:111` 8.5px, `:123,:134` 9.5px (off the token scale).
→ round: 8.5→9, 9.5→10. Do NOT touch the token scale itself (see DO NOT TOUCH).

**P9 — Double rotation on hand captions (two resamples).**
Caption rotated inside an already-rotated card: `MorningRitual.tsx:167` (−2° inside tilted card),
`TaskEditorPage.tsx:326` (−1°). → rotate card OR caption, not both (keep the caption's look:
net visual angle stays the same; remove the inner rotation and bake the total into one node).

## C · Implemented-animation misbehavior

**P10 — VoiceCaptureSheet exit animation never plays (sheet pops out).**
`VoiceCaptureSheet.tsx:35-45,147`: `setVisible(false)` fires synchronously when `open` flips,
unmounting before `captureSheetSlideOut`/scrim fade (capture.css:9-30) can run.
→ drive unmount from `onAnimationEnd` (or 140ms timeout fallback).

**P11 — Double entrance animation on route land.**
`index.css:49-57`: `.kf-route` runs `entryFadeUp` on the whole page while `.kf-stagger-item`
children run the same animation → multiplied opacity + double translate, muddy arrival.
Motion.dc.html §4b specs ONE mechanism. → remove `entryFadeUp` from `.kf-route` (keep per-item
stagger); also skip animation on first app mount (ref guard on `AppLayout.tsx:484`).

**P12 — Decorative CSS animations bypass the Effects toggle.**
`.kf-route` (`index.css:49`), `.kf-side-row` hover translate + `cloverSway` (`AppLayout.tsx:414,417`),
`.tr-checking` rowDip/strikeGrow (`TaskRow.css:25,31`), checkPop (`kit.tsx:163`) play even with
Effects off (only OS reduced-motion stops them). _SHARED.md mandates the gate.
→ body-level `motion-on` class toggled by the same state `useMotionEnabled()` reads, mirroring
the existing `.cal-motion-on` pattern; scope those animations under it.

**P13 — Timings diverge from Motion.dc.html for interactions that exist.**
`CalendarGrid.css:176` snap flash 220ms→**120ms** · `TaskRow.css:37` petal 600ms→**400ms** ·
`kit.tsx:163` checkPop 200ms→**260ms** · `index.css:56` stagger item 200ms→**240ms**.

**P14 — Theme toggle: partial lazy fade.**
Theme flip is an instant cut everywhere EXCEPT `.kf-side-row` (`AppLayout.tsx:411`,
background/color 200ms) and `.task-row .kf-checkbox` (`TaskRow.css:20`, 90ms) which fade late.
→ drop background-color/color from those transitions (keep transform/hover), so the flip snaps
uniformly.

**P15 — Minor cleanup.**
`TaskRow.css:42` `.tr-enter` dead CSS → delete. `TaskRow.tsx:148,171` `checking` never resets —
reset it when a completed row is reopened inline (stale strikethrough otherwise).

---

## DO NOT TOUCH (investigated; changing these = deviation, not polish)

- **Card tilt / whole-card rotation** (`kit.tsx:109` + ~40 inline) — export rotates whole cards
  identically (114 uses); the softness is the design signature. Never un-tilt.
- **Fractional typography tokens** (14.5/13.5/12.5/10.5/9.5 in `styles/tokens/typography.css`) —
  identical to export tokens. Only the P8 calendar sizes (off-scale) get rounded.
- **Paper-grain overlay** (`index.css:70-79`) — same multiply/0.5 as export. Leave it.
- **backdrop-filter overlays** (CommandBar/SearchOverlay/etc.) — blurs backdrop, not own text.
- **Stagger re-running on refetch** — verified NOT happening (stable `t.id` keys). Don't "fix".
- **Layout-property transitions** — none exist; all transitions are transform/opacity/shadow. 
- **Ritual/inbox/calendar JS-gated motion** — correctly gated already.

## Verification (all on the running http://localhost:5195 — NEVER start a server)

1. Calendar route: page body must not grow; grid scrolls internally; opens at 08:00; mobile
   width day view bounded. 2. Any overlay open: page behind must not scroll. 3. Computed style
   of a resting task row: `transform: none`. 4. Toggle Effects off in Settings: route fade,
   sidebar sway, row dip all stop. 5. Voice capture sheet: visible slide-out on close.
   6. `cd app && npm run build` + `npx vitest run` green.
