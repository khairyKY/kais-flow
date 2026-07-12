# Motion Retrofit — Buttery & Botanical

**Parity rows:** none (experience quality) · **Status:** see `../ROADMAP.md`

> Retrofit against every shipped screen. The Open Design export specified a full motion system — `design/tokens/motion-interactions.css` (rescued 2026-07-08 from the gitignored workspace) binds hover lifts, press feedback, entry fades, list staggers, checkbox pops and toast slides to the mockup DOM. When tokens were copied into the app, **only the keyframes came over; none of the bindings did.** Result: the app has a motion vocabulary and almost zero motion. This phase ports the bindings to the real component tree, adds route transitions, and takes the flower theme from "static PNGs" to "a garden that responds" — without a single new dependency.
>
> Runs **after** the UX Retrofit (it animates surfaces that phase restructures — task rows, sidebar, calendar rail, planning board). Blueprint for every binding: `design/tokens/motion-interactions.css` + `docs/DESIGN_SYSTEM.md` §3. Night-only motion (fireflies, twinkle, moon) stays in the night-theme pass (design/PROMPTS.md § D) — do not build it here.

## Goal

The app *feels* buttery: every interactive element acknowledges hover and press, lists and pages arrive with a breath instead of a pop, switching tabs glides, completing a task drops a cherry petal, and the flowers behave like living things — states bloom into each other instead of teleporting. All of it at 60fps, all of it transform/opacity only, all of it silent under `prefers-reduced-motion`.

## Prereqs

UX Retrofit done (task rows/smart lists/planning board in final shape). Motion tokens + 7 keyframes already live in `app/src/styles/tokens/motion.css`. No new dependencies: CSS + the native View Transitions API cover everything below. (Framer Motion is the documented escape hatch **only if** a real spring-physics need appears that CSS can't fake — it hasn't yet.)

## Scope

**In:**
- The universal interaction layer (hover/press/entry/stagger) ported from `motion-interactions.css` to real app classes.
- Route/tab transitions via the View Transitions API + sidebar active-indicator morph.
- Micro-interactions: checkbox pop, petal fall on complete, vine growth, overlay/panel choreography, drag polish, toast slide.
- Flower theme next level: consolidated `gardenAssets.ts`, animated state crossfades, ambient life budget, milestone moments.
- Debt sweep absorbed from superseded P5.5: flower assets not loading (D3), sidebar search icon (E), terrarium responsiveness (F), select standardisation + placeholder cleanup (C/D1) — polish debt belongs in the polish phase.
- A performance + reduced-motion gate.

**Out:**
- Night theme motion (fireflies, stars, moon) — design/PROMPTS.md § D, after this phase.
- Any behavior/schema change. This phase is motion + polish only; if an animation needs new state, the design is wrong.
- Skeleton loaders, spinners, page-load theatrics — the app is local-first and opens instantly; don't animate waiting that doesn't exist.

## Steps

1. **Debt sweep first** (superseded P5.5 steps 2–5, one session): fix flower asset paths + graceful fallback (D3) · magnifying-glass icon in the sidebar per `NavIcons.tsx` conventions (E) · terrarium responsive grid 6/3/2-col + percentage tape positions (F). *(The old C/D1 Select item moved to UX-retrofit step 6.5c per Kai's 2026-07-08 audit — he wants the popup itself themed, which a native-`<select>` wrapper can't do; by the time this phase runs, `components/Select.tsx` exists. This step only gives it enter/exit motion per step 3's overlay rules.)* Clean canvas before choreography.

2. **The universal interaction layer** — new `app/src/styles/motion-bindings.css` (imported after tokens), translating `motion-interactions.css` mockup selectors to real app classes/components:
   - Interactive lift: shared `.m-press` behavior — hover `translateY(-1px)` + `--dur-instant` background shift, active `scale(0.97)`. Applied to PillButton, quick-add buttons, nav links, rail chips, snooze/context/bulk items, toggle cards.
   - Nav items: hover `translateX(3px)` slide; flower badge sway on hover (`cloverSway` single iteration).
   - Entry: page sections `entryFadeUp` (`--dur-normal --ease-out`); list rows `itemFadeIn` staggered 30ms/row, capped at the first 8 rows (`nth-child` delays, rest appear instantly).
   - Checkbox/star: `checkPop` (`--ease-spring`) on check; the custom checkbox everywhere gets it, not just Tasks.
   - ToastHost: `toastSlideIn` on enter, fade+translate out. *(Amended 2026-07-08, research replan: UX step 13 makes toasts+Undo app-wide — the undo variant gets a subtle 5s progress cue, transform/opacity only, and exits early on Undo.)*
   - **Drag grip** *(added 2026-07-08 — Akiflow wiki §8.3 micro-pattern, adapted)*: draggable cards (calendar rail chips, planning-board cards) reveal a six-dot grip on hover, fade-in `--dur-instant` — affordance for what already drags, no behavior change.
   - Rule: bindings live in this one file (or the component's own scoped style if truly unique) — no scattered inline `transition:` strings; migrate the existing inline ones (AppLayout toggle, ContextMenu hover, chat sprig) into it in passing.

3. **Route/tab transitions** (the "transporting from tab to tab" ask):
   - React Router's `viewTransition` on sidebar `<Link>`s + `::view-transition-old/new(root)` CSS: outgoing fades `--dur-normal --ease-in`, incoming fades up 8px `--ease-out`. Browsers without View Transitions degrade to instant — acceptable, no polyfill.
   - Sidebar active indicator: shared `view-transition-name: nav-active` on the active item's tape/underline so it *morphs* between items on navigation.
   - Overlays are not routes: command bar/search/snooze/context menus get fade+scale-from-0.98 `--dur-normal`; chat + event-details + **Task Detail (new in UX step 15)** slide-overs translate from their edge `--dur-slow`; backdrops fade in parallel. One consistent enter/exit pair per overlay type.

4. **Micro-interactions & drag polish:**
   - **Petal fall on task complete** (the deferred A3 item): completing a task spawns one petal element at the checkbox that runs `petalFall` (`--dur-bloom`) while the row settles into its done state; Someday rows leaving via a plan action use the same exit (per C7's spec). *(Amended 2026-07-09, recovered round-1 audit item 13 — Kai's flagged-for-later variant: the completion **toast** reads "a petal fell" (UX step 13 owns the toast itself) while a petal animates falling **from the page-identity flower in the top-right corner**, not only from the checkbox. Build-session judgment on whether corner-flower petal replaces or joins the checkbox petal — one petal per completion, not two.)*
   - Routines *(amended per Kai's 2026-07-08 audit, item 5 — the vine is horizontal and streak-bound after UX step 6.5e)*: vine/streak cells grow in one at a time (`--dur-grow`, staggered) when the page opens; checking a routine pops + advances the vine image with a crossfade; the streak counter gets a small **animated flame** (CSS-only flicker, transform/opacity, counts against the ≤2 ambient budget and stays still under reduced-motion).
   - Calendar: rail chip lifts + tilts ~1° while dragging (`.fc-event-mirror` shadow `--shadow-card`), drop settles with a single soft landing (no bounce); event resize handle fades in on hover.
   - Planning board: dragged card tilts, target column's dashed outline breathes in (`--dur-quick`).

5. **Flower theme, next level:**
   - **Consolidate every species mapper into `lib/gardenAssets.ts`** (cherry/wisteria currently inline in `Terrarium.tsx`, vine in `RoutinesPage.tsx`) — one file owns species→state logic; components just call it.
   - New `components/FlowerImage.tsx`: renders a species/state PNG and, when the state prop changes, crossfades old→new with a slight `--ease-spring` scale-in (`--dur-bloom`). Every flower render site switches to it — **no flower ever teleports between states again.**
   - Ambient life, budgeted: terrarium plants get `cloverSway` with randomized 5–8s durations + phase offsets (a garden, not a metronome); elsewhere max one ambient loop per screen (DESIGN_SYSTEM.md §3 budget: ≤2 continuous animations per screen, terrarium counts as one).
   - Milestone moments (each a one-shot, ≤1s, no sound, no confetti): streak extends → vine crossfades up a state with a brief `twinkle` dewdrop at the new cell · inbox reaches zero → hydrangea settles to `zero` with the Caveat caption fading in · all top-3 done → the goal card's gold border breathes once.

6. **Performance + reduced-motion gate (the "buttery" proof):**
   - Grep audit: every animated property is `transform`/`opacity`/`background-color` — nothing animates layout (width/height/top/left/margin/padding).
   - DevTools performance trace on Today, Tasks (50+ rows), Calendar week, planning board: no frame over ~16ms during hover/scroll/route change on Kai's laptop; `will-change` only where a trace proves it helps.
   - `prefers-reduced-motion`: the existing reset must now cover the new bindings + View Transitions (`::view-transition` gets `animation: none`); click through the whole app with it enabled — zero movement, full function.
   - Stagger/entry animations never delay interactivity — rows are clickable from frame 0.

## Files

`app/src/styles/motion-bindings.css` (new) · `app/src/index.css` (import) · `app/src/components/{Select,FlowerImage}.tsx` (new) · `app/src/components/{AppLayout,ContextMenu,ToastHost}.tsx` · `app/src/lib/gardenAssets.ts` (consolidation) · `app/src/features/{tasks,today,routines,calendar,inbox,command-bar,search,chat}/` (bindings + petal/vine/drag touches) · `app/src/features/today/Terrarium.tsx` (responsive + sway) · reference: `design/tokens/motion-interactions.css` (read-only blueprint)

## Acceptance checklist

- [ ] Every button, nav item, chip, row and card responds to hover (lift/shift) and press (scale) — sampled across all 7 routes
- [ ] Switching sidebar tabs animates (fade-up in, fade out; active indicator morphs); browsers without View Transitions degrade silently
- [ ] Completing a task drops a petal; checking anything pops; toasts slide
- [ ] No flower PNG swaps instantly — state changes crossfade (verify by completing a top-3 task and watching cherry, checking a routine and watching the vine)
- [ ] Terrarium plants sway out of phase; no screen runs more than 2 continuous animations
- [ ] Debt sweep: flowers all load with graceful fallback · search icon present · terrarium 3-col at 768px / 2-col at 375px with tape aligned · the `Select` popover (built in UX 6.5c) animates per the overlay rules
- [ ] Streak flame flickers (transform/opacity only) and freezes under reduced-motion
- [ ] `prefers-reduced-motion`: whole app fully usable with zero movement
- [ ] Performance trace on Tasks with 50+ rows and Calendar week: no dropped-frame bursts during hover/scroll/navigation
- [ ] Zero new dependencies in `package.json`; zero new hex literals; `npm run build` clean
- [ ] Grep proves no layout-property animations (`animation`/`transition` audit)

## Verification

`cd app && npm run build` · click-through of all routes + overlays at 1440px and 375px, watching for the checklist behaviors · DevTools performance recording while scrolling Tasks and switching tabs (attach the summary to Notes) · OS-level reduced-motion toggle click-through · `grep -rn "transition\|animation" app/src --include="*.tsx" --include="*.css"` reviewed against the transform/opacity rule.

## Pitfalls

- **Butter dies in layout.** Animating `height` on collapsing sections or `left` on the sidebar indicator will jank — use transforms and View Transitions morphs. If something seems to need height animation, crossfade instead.
- Staggered `itemFadeIn` on a list that TanStack Query refetches will re-play on every invalidation — animate on **mount only** (a `data-entered` guard or animation on the container, not per-row on every render).
- `view-transition-name` must be unique per snapshot — exactly one element (the active nav item) may carry `nav-active` at a time.
- FullCalendar owns its DOM: drag polish goes through `.fc-*` CSS only (same contract as A5); never wrap FC internals in animated containers.
- PNG crossfades double-mount images briefly — `FlowerImage` should keep both layered absolutely inside a fixed-size box so layout never shifts mid-fade.
- The clover already sways via inline style — remove the inline version when the binding lands, or it will double-animate.
- Don't animate the paper-grain overlay or anything `position: fixed` full-viewport — compositor cost with zero perceptual payoff.
- `// ponytail: CSS + View Transitions only; add framer-motion only when a real spring/gesture need is written down here first`

## Notes / deviations

_(filled during execution)_
