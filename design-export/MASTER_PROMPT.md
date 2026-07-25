# MASTER PROMPT — Build the "Kai's Flow" prototype (PLAN FIRST, DO NOT CODE YET)

Paste everything below into Claude Code.

---

You are integrating an **already-finished, high-fidelity design prototype** into one working, navigable app. You are **not** a designer on this job and you are **not** starting from a brief. Every screen, pixel, color, font, shadow, tilt, word, and animation has already been designed and exists in the files I'm giving you. Your job is **faithful reproduction + wiring**, nothing else.

## THE ONE HARD RULE — no improvisation, nothing invented, nothing skipped

- **Reproduce exactly what exists.** Markup, inline styles, CSS tokens, copy strings, asset filenames, animation keyframes, timings, easings, tilts, and layout numbers all come **verbatim** from the exported files. Do not "clean up," "modernize," "improve," round numbers, swap fonts, or re-order anything.
- **Invent nothing.** No new screens, features, copy, icons, colors, data, routes, or interactions that don't already appear somewhere in the export. If something seems missing, it's either in a file you haven't read yet or it's intentionally out of scope — **ask me, don't fill the gap.**
- **Skip nothing.** Every file, every screen, every option/state, every effect, every motion spec, every overlay listed in the inventory below must end up in the build (except items the project's own docs mark as *parked* — see below). Completeness is graded.
- **The exported files are the single source of truth.** When your memory of "how a productivity app usually works" conflicts with the files, the files win, every time.

## THE PROJECT

**Source:** `D:\Coding\kais-flow\kai's flow Design system and UI improvements.zip`
Unzip it and treat the unzipped folder as read-only design truth. Read the files directly — do not rely on my summaries where the file itself is available.

**What it is:** *Kai's Flow*, a personal productivity app (tasks / calendar / projects / routines / journal / review) dressed as a **19th-century botanical field journal** — warm paper, pressed-flower illustrations, ink typography, gentle botanical motion. Each app surface maps to a plant species whose growth stage reflects live state.

**File taxonomy inside the zip:**
- `*.dc.html` — 30 design files. These are the screens and specs. **They are NOT plain HTML** (see "How to read a .dc.html" below).
- `ds/` — the design system: `styles.css` (entry) → `tokens/*.css` (colors, colors.dark, fonts, typography, spacing, motion, effects) + `ds/assets/**` (the botanical PNG illustration sets).
- `support.js` — the proprietary runtime the `.dc.html` files render through. **Do not port or depend on this in the real build** (see architecture note). Use it only if you need to open the originals to compare.
- `AUDIT.md`, `FUTURE_WORK.md`, `ASSET_REQUESTS.md` — **required reading.** `AUDIT.md` is the authoritative per-page status + scope guide (what ships, what's a spec, what's parked). `FUTURE_WORK.md` defines the two parked set-pieces. `ASSET_REQUESTS.md` documents every generated illustration.

## HOW TO READ A `.dc.html` FILE (do this before planning)

Each file is a template that runs on `support.js`. Structure:
- `<x-dc> … </x-dc>` wraps the **template markup** (this is the real HTML you will reproduce).
- An optional `<script type="text/x-dc" data-dc-script> class Component extends DCLogic { … } </script>` block holds **live JavaScript logic** (used only on the "live" options — drag demos, the letter set-piece, data-driven swatches).
- `<helmet>` at the top loads the Google Fonts and `ds/styles.css`, plus per-file `<style>` (keyframes, resets, the `.dv-*` scaffold classes).
- Styling is **inline `style="…"` everywhere**, pulling CSS custom properties (`var(--paper-linen)`, `var(--acc-terra)`, …) from `ds/`. Reproduce the inline styles exactly.
- Template primitives you'll see: `sc-for` (repeat), `sc-if` (conditional), `dc-import`/`x-import` (embed). When porting, resolve these into real markup/loops in your chosen stack.

### Turns and options — critical, read carefully
Screens are organized into **turns** (`t1`, `t2`, …) each containing **options** (`1a`, `1b`, `2a`, …) shown side by side. **These are almost always ADDITIVE, not alternatives to choose between.** Per `AUDIT.md`: each option is a different **state, variant, or breakpoint** of the same surface, and *they all ship* — desktop + iPhone, default + empty + done states, base + dismissed, etc. So `1a` and `1b` are usually "desktop" and "mobile," not "version A vs. version B." **Do not discard options.** The only exceptions are explicitly called out in `AUDIT.md` / `FUTURE_WORK.md` (parked set-pieces + one superseded letter attempt) — follow those two docs to the letter for what to skip.

## ARCHITECTURE — reproduce the visual truth, don't re-implement the runtime

- **Do not** rebuild or depend on `support.js` / the `<x-dc>` runtime. Extract the **template markup inside `<x-dc>`** and render it as ordinary markup in the app.
- **Do** load `ds/styles.css` and the `ds/tokens/*.css` **unchanged**, and copy `ds/assets/**` **unchanged**. All colors/spacing/type/motion/effect values must resolve from these token files, exactly as the originals do — never hard-code a value that a token already defines.
- Preserve **every inline style verbatim.** Preserve the paper-grain `::before`, the card tilts (`--tilt-*`), the washi-tape pseudo-elements, the `.grain` overlay, phone bezel frames, and all `@keyframes`.
- The chosen framework/router is an **open decision for you to propose in the plan** (see Phase 0 questions). Whatever you pick, the rule holds: markup + tokens + assets are reproduced, not redesigned.

## SCOPE — what "build the prototype" means here

IN scope (all sourced from the export, nothing new):
1. **Assemble the standalone canvases into one navigable app** using the shared shell (sidebar + topbar) that already exists in every screen. The sidebar nav already contains relative links (`href="Inbox"`, `href="Tasks"`, `href="Calendar"`, `href="Routines"`, `href="Review"`, `href="Search"`, `href="Chat"`, `href="Settings"`) grouped under **Plan** / **Cultivate** with a streak-plant widget and footer — wire these into real routes.
2. **Make every option/state reachable** — Done/Someday/empty on Tasks, Dismissed/Inbox-zero on Inbox, detail vs. list, archive, new-item forms, etc.
3. **Apply the Effects library** (currently a catalog) to the real screens per the recipes.
4. **Apply the Motion spec** (currently a catalog of 26 micro-interactions across 5 sheets) to the real interactions.
5. **Run the live gimmicks / set-pieces** that already have logic: drag & drop, calendar drags, the Focus timers, the Weekly Letter animation, the data-driven Design-System swatches, hover-lean, pull-to-refresh, toasts, etc.
6. **Day ⇄ Night theme toggle** over the token layer (`colors.css` ⇄ `colors.dark.css` via `data-theme="night"`) — the dark set is complete.
7. **Mobile/iPhone variants** for every screen that has them.
8. **Overlays / command surfaces** (⌘K capture, ⌘/ search, ? shortcuts, G go-to, menus, sheets, toasts, bulk bar, etc.) wired where the screens invoke them.

OUT of scope (do NOT do): new features, new copy, redesigns, a real backend/data model beyond the hard-coded sample content shown in the designs, any screen or interaction not present in the export, and anything `AUDIT.md`/`FUTURE_WORK.md` marks parked.

## YOUR FIRST AND ONLY DELIVERABLE RIGHT NOW: A PHASED PLAN

**Do not write any implementation code yet. Do not scaffold. Do not install anything.** Produce a written **`PLAN.md`** and stop for my approval.

The plan must contain, in order:

**Phase 0 — Ingest, inventory & questions.**
- Unzip and list back to me **every** `*.dc.html` file and **every** option id within it, cross-checked against the "COMPLETE INVENTORY" below. Explicitly flag any discrepancy between the files and my inventory. This proves nothing is skipped.
- Read `AUDIT.md`, `FUTURE_WORK.md`, `ASSET_REQUESTS.md` and restate: which pages ship as screens, which are specs/libraries, which options are parked.
- Ask me the **open decisions** (below) — do not guess them.

**Phases 1…N — the build, sequenced.** Propose the phase breakdown yourself, but it must cover, each as its own phase or clearly-scoped sub-phase, and each with explicit **exit criteria**:
- Foundation: framework/router decision, load `ds/` tokens unchanged, copy `ds/assets`, fonts, paper-grain root, the app shell (sidebar + topbar + streak widget), Day/Night theme plumbing.
- Screen-by-screen port (group logically, e.g. Plan surfaces → Cultivate surfaces → entry/first-run → utility). Each screen lists **every option/state** it must reproduce.
- States & variants wiring (empty / done / offline / sync / conflict — see `States.dc.html`).
- Effects application (map each of the 22 effects to the screen(s) that use it).
- Motion application (map each of the 26 micro-interactions to its trigger).
- Live gimmicks & set-pieces (enumerate each and its source file/option).
- Overlays & command palette surfaces.
- Night theme pass.
- Mobile pass.
- Final fidelity QA: side-by-side against the exported originals; a checklist confirming every inventory item is present and pixel-faithful.

For **every** phase entry, include: the exact source file(s) + option ids it draws from, what "done" means, and how you'll verify fidelity. **No phase may introduce anything not traceable to a source file.**

After you present `PLAN.md`, **stop and wait.** I will approve or adjust before you build Phase 1.

## OPEN DECISIONS — ask me these in Phase 0, do not assume

1. **Tech stack / framework** for the integrated prototype (and confirm the "reproduce markup, don't rebuild the DC runtime" approach).
2. **Data:** keep the hard-coded sample content exactly as shown (recommended, matches "nothing invented"), or wire a light client-side store so state changes (checking a task, filing an inbox item) persist during a session? If the latter, it must only reshuffle **existing** sample content, never invent new content.
3. **Parked items** (`Focus` "A Year in the Garden" 2a/2b; the `Review` Weekly Letter set-piece per `FUTURE_WORK.md`): include as-is, or leave parked? Default: follow `AUDIT.md`/`FUTURE_WORK.md`.
4. Anything in my inventory that doesn't match the unzipped files.

---

# COMPLETE INVENTORY — the completeness checklist (nothing here may be skipped)

> Authoritative source is the unzipped files; this is the cross-check. Confirm each back to me in Phase 0.

## A. Real app surfaces (24 files) and their options

- **Today.dc.html** — 1a Field Journal (full botanical) · 1b iPhone (thumb-first). *Anchor page; two botanical intensities, both keep.*
- **Inbox.dc.html** — 1a Desktop triage (three waiting, one deep-linked, GitHub ranked) · 1b Inbox zero (settles to one bloom) · 1c iPhone triage · 2a Dismissed (compost heap, restorable) · 2b iPhone Dismissed (swipe to restore).
- **Tasks.dc.html** — 1a Desktop (list + right-rail sticky notes) · 1b iPhone (list + filter chips) · 2a Done (fallen petals; check → fade + petal drop) · 2b Someday (quiet shelf) · 2c iPhone Done (petals falling).
- **Calendar.dc.html** — 1a Desktop (task rail + time-grid) · 1b iPhone (day view).
- **Editor.dc.html** — 1a Task detail (expanded page) · 1b Create full page (Task) · 1c Create (Event) · 1d Create (Time block, holds a task) · 1e iPhone create (3 kinds) · 1f iPhone task detail (full-screen sheet) · 1g Sidebar states (Plan folded / rail collapsed) · 2a Quick-create popover (Event) · 2b popover flipped to Task · 2c iPhone slot sheet.
- **Projects.dc.html** — 1a Desktop (active / retainers / areas) · 1b Project detail (milestones, hours, checklist, activity log) · 1c iPhone · 2a Board (forest overview, wisteria per card) · 2b Area detail (cadence, not finish line) · 2c Archive (full cascade, restorable) · 2d New project form.
- **Perennials.dc.html** — 1a /tasks/recurring (grouped by cadence, hover actions, one paused) · 1b Empty (row of pots).
- **Routines.dc.html** — 1a Desktop (rituals + streak garden) · 1b iPhone · 2a New routine form (steps, schedule, goal, plant) · 2b iPhone new-routine sheet · 3a Streak vine (leaf / droplet / bare gap) · 3b The rule surfaced (row by Effects setting) · 4a Streak trellis (one column per day).
- **Rituals.dc.html** — 1a Morning 1/4 (review overdue) · 1b Morning 2/4 (pick Top-3) · 1c Morning 3/4 (inbox to zero) · 1d Morning 4/4 (time-block, drag beds onto calendar) · 1e Evening 1/2 (sweep today) · 1f Evening 2/2 (tomorrow at a glance) · 1g iPhone morning sheet · 2a The way in (dusk-tinted button after sunset) · 2b Day's garden (today only) · 2c One line (saves to journal) · 2d Tomorrow's three (seed envelope) · 2e Goodnight (dusk veil) · 3a Day's garden (sun redrawn: rays, hour ring, dusk halo) · 3b Morning 2/4 arrives already done.
- **Review.dc.html** — 1a Desktop (per-domain sweep, slipping + streaks) · 1b iPhone · 2a Weekly Letter (page opens with it) · 2b Letter states (writing / folded / didn't arrive) · 2c "Season so far" (2×2 widgets + hours band) · 3c "Season so far" redone (focus trend as climbing vine) · **4a Weekly Letter v2 set-piece — PARKED per FUTURE_WORK.md.** *Follow AUDIT.md for exact ship/park set.*
- **Focus.dc.html** — 1a Focus timer (Pomodoro, mid-round) · 1b Garden view (dusk veil, fireflies, falling petals) · 1c Break · 1d Stopwatch · 1e Pomodoro settings popover · **2a "The year" mode + 2b sparse history — PARKED per FUTURE_WORK.md.**
- **Journal.dc.html** — 1a Desktop (write, gather, keep) · 1b iPhone (daily page).
- **Library.dc.html** — 1a Desktop (shelf tree + reader) · 1b Book detail (progress as unfurling frond + kept quotes).
- **Herbarium.dc.html** — 1a /herbarium spread (2-up specimens, seasonal dividers) · 1b Specimen detail · 1c Pressing ceremony (3 beats, on project completion) · 1d Empty.
- **People.dc.html** — 1a Desktop (nudges, then by circle) · 1b Person detail (facts, running log, quiet edit) · 1c iPhone · 2a People list (bloom badge) · 2b Person detail (banner + Moments) · 2c Today card (quiet, dismissible).
- **Activity.dc.html** — 1a Desktop (cross-app timeline, filterable) · 1b iPhone.
- **Search.dc.html** — 1a /search?q=omar (grouped results) · 1b Empty result.
- **Seasons.dc.html** — 1a Seasons row · 1b Three composites (season × live weather) · 1c Topbar echo (+ effects-off).
- **Trash.dc.html** — 1a /trash (age groups, restore toast, empty-trash confirm) · 1b Empty.
- **Settings.dc.html** — 1a Desktop (sub-nav + every live section) · 1b iPhone · 2a /settings/integrations (four connection states + capture-from-anywhere) · 3a Sound (master row, six sounds, quiet hours). *Build as 3 sections, all keep.*
- **Quick Capture.dc.html** — 1a Lock-screen widget · 1b Activated (keyboard up, one send) · 1c Share sheet (sprout pill confirm).
- **Onboarding.dc.html** — 1a 1/7 name · 1b 2/7 workspace · 1c 3/7 Plan · 1d 4/7 Tend · 1e 5/7 Cultivate · 1f 6/7 Connect · 1g 7/7 plant garden · 1h iPhone (CTA pinned).
- **Night.dc.html** — 1a Today (moonflower) · 1b Tasks (command bar) · 1c Calendar (glowing hairlines) · 1d Routines (vine rim light) · 1e Settings (frosted) · 1f Today mobile. *Reference studies for the dark token set; the token set itself is the deliverable.*

## B. Reference / spec pages (6 files) — build what they describe, per AUDIT.md

- **Design System.dc.html** — token + component reference (the contract). Sections: 01 Color, 02 Typography, 03 The living species, 04 Components (buttons, chips/tags, task rows, section labels, washi tape & tilt), 05 Space/radii/motion, 06 House rules, 07 Growth stages. *Data-driven via a live `Component` logic class.*
- **Design System Dark.dc.html** — living reference for the complete dark token set.
- **Screens.dc.html** — index/overview board of the app (a map, not a screen).
- **Overlays.dc.html** — overlay/component gallery (see section C).
- **Effects.dc.html** — 22 effect recipes (see section D).
- **Motion.dc.html** — micro-interaction spec, 26 items across 5 sheets (see section E). *Sheets 4–5 include live drag demos with a `Component` logic class.*

## C. Overlays (26) — Overlays.dc.html

- §00 Garden Postcard (from Review / garden view; exports the week).
- §01 Menus & popovers: Snooze (row/bulk/keyboard S) · Schedule (1·2·3) · Project picker (P) · Priority (!·!!·!!!) · Repeat · Toast (undo 5s).
- §02 Modals & panels: Command bar (⌘K capture) · Search (⌘/) · Event details (calendar) · Task detail (Enter expands) · Confirm (destructive only) · Bulk bar (multi-select) · Notifications (right slide-over) · Chat (⌘J right slide-over).
- §03 Mobile sheets: "More" sheet (phone tab bar) · Snooze/schedule sheet · Voice capture (recording) · Task detail sheet.
- §04 Selection & keyboard: Bulk actions (multi-select in a list, X toggles) · Keyboard shortcuts overlay (press ?, whole keymap).
- §05 Jump, views & labels: Go to (G, jump to any view) · Calendar view options (density/toggles) · Board view options (projects) · Label picker (assign, L) · Label manager (settings).

## D. Effects (22) — Effects.dc.html

Ambient loops: 1a Petal fall · 1b Pollen drift · 1c Firefly dusk · 1d Leaf sway · 1e Bloom glow · 1f Dew glint · 1g Floret drift · 1h Amber drift · 1i Settle-in · 1j Dusk veil.
Applied recipes: 2a Seasonal drift (one particle system, four skins) · 2b Time-of-day paper · 2c Idle life · 2d Day complete (petal-burst + banner) · 2e Milestone bloom (grows plant a stage) · 2f Weekly review flourish · 2g Focus dim (hover, live) · 2h Parasol header (compress on scroll) · 2i Ink bleed (text soaks in) · 2j The soft no (invalid-drop shake) · 2k Boundary resistance (rubber-band) · 2l Long-press bloom.

## E. Motion (26 across 5 sheets) — Motion.dc.html

- Sheet 1 (view-level): 1a Route transition · 1b Today petal fall on complete · 1c Inbox floret drift on file · 1d Project bloom glow at 100% · 1e Projects amber drift · 1f Sidebar streak-plant idle (sway + pollen).
- Sheet 2: 2a Route cut (160ms) · 2b Stack push/pop w/ parallax · 2c Drag & drop (live, wobbly ghost + placeholder) · 2d Filing drag (inbox→project, source heals).
- Sheet 3: 3a Mobile stack (horizontal push/pop) · 3b Task complete (box fills, check pops, strike draws, row dips) · 3c Overlay in/out · 3d Toast (rises w/ undo) · 3e List breathing (rows grow in / slide out, list heals).
- Sheet 4: 4a Hover & press (live) · 4b View entry stagger (60ms) · 4c Calendar drags (ghost floats, placeholder snaps, resize snaps) · 4d Drag polish (catch, edge scroll, stacked ghost) · 4e Stack navigation (live).
- Sheet 5: 5a Checkbox bloom · 5b Drag lift · 5c Pull-to-refresh dew · 5d Hover lean (live, sprigs lean to cursor) · 5e Toast petal-fall · 5f Seed plant (creating anything).

## F. The growth-stage system (7 species) — the core gimmick, from Design System.dc.html §07 + ds/assets

Each surface = a plant whose stage reflects live state. Reproduce the exact stage→asset mapping:
- **Terrarium** (Today) — the day's overall state; assets under `clover/` incl. `four_leaf.png`.
- **Hydrangea** (Inbox) — driven by pending count: `zero` (inbox zero, trophy bloom) · `light` (1–4) · `medium` (5–19) · `heavy` (20+).
- **Cherry blossom** (Tasks) — driven by completion: `bud` (not started) · `opening` (in motion) · `bloom` (waiting) · `fallen` (done, petal falls).
- **Daisy** (Calendar) — driven by the clock: `morning` · `midday` · `evening` · `past` (yesterday, muted) · `future` (tight green bud).
- **Fern** (Review / Journal / Library) — driven by length/progress: `coil` · `unfurl1` · `unfurl2` · `full`.
- **Clover** (Chat / rituals / people) — driven by attention: `resting` · `awake` · `dewdrop` (mention) · `seedling` (first-run) · `four_leaf` (milestone).
- **Vine** (Routines) — driven by streak length: `bare` · `sprouting` · `flowering` · `lush` (30d+). Plus `leaf-left`/`leaf-right` trend leaves.
- **Wisteria** (Projects) — driven by weighted milestone %: `p0 · p20 · p40 · p60 · p80 · p100`.
- Set-piece assets: `envelope/` (front, back, back-open-full, stamp), `seal/` (intact, broken-left, broken-right), `tools/pen.png`, `cherry/*-right.png` (trend tips) — used by the Weekly Letter and trend visuals.

## G. Design tokens — load unchanged from ds/tokens

Colors (light `colors.css` + night `colors.dark.css`, full coverage), fonts (`Source Serif 4` display · `Inter Tight` UI · `Courier Prime` mono/metadata · `Caveat` marginalia), typography scale, spacing (4px base; radii 3/6/8/999), motion (durations, easings, signature keyframes: cloverSway, fireflyDrift, twinkle, petalFall + the micro-interaction set), effects (layered warm shadows, night glows, paper-noise SVG, card tilts). **House rules (Design System §06) are binding:** no pure white / hard black, no bright saturated primaries, no modern rounded-16 cards, no brutalist shadows, tape only on placed standalone cards (never plain list rows), no emoji beyond the ✿ marker, ≤4 section labels per screen, never show a plant stage that contradicts the data.

---

**Reminder before you begin:** produce `PLAN.md` with Phase 0 + the sequenced build phases, ask the open decisions, and **wait for my approval before writing any implementation code.** Nothing invented. Nothing skipped. Exactly as designed.
