# Kai's Flow — Design Integration Plan

> **Job:** faithful reproduction + wiring of the finished design export into one navigable app.
> **Source of truth:** `design-export/` (unzipped from `kai's flow Design system and UI improvements.zip`, treated read-only).
> **Rule:** nothing invented, nothing skipped, markup/tokens/assets reproduced verbatim; `AUDIT.md` + `FUTURE_WORK.md` govern what ships vs. parks.
> **Status v3 (Jul 12):** Kai's mandate — *final product live on desktop + web + Android + iOS, high performance, smooth UX, token-efficient parallel agents after a serial foundation.* A full audit of the older docs + codebase (below) found the production app already live and already token-based, so **the separate prototype is scrapped: the export integrates directly into `app/`**. This file is now the orchestration master plan. The export inventory (Phase 0 sections) is unchanged and remains the fidelity contract.

---

# PLATFORM TARGET & DELIVERY — one codebase, real apps, still $0

**Kai's ruling (Jul 12): no browser-installed "apps."** Desktop and mobile must be real packages — not a Chrome tab wearing an icon. Start = **web + Android APK**; **macOS is intended**; iOS later. Under the hard rules ($0, no Electron, light), the architecture is: **one React codebase; the same built `dist/` wrapped in native shells.**

| Platform | Delivery | Cost | Notes |
|---|---|---|---|
| **Web** | **Already live:** https://kais-flow.kaidagoat.workers.dev — Cloudflare Workers, `git push master` auto-deploys | $0 | The PWA/offline plumbing already there stays as a bonus for web users, but it is no longer the app-distribution story. |
| **Android** | **Real APK via Tauri v2 (mobile)** — native shell around the system WebView, assets bundled in-app, own icon/splash, no browser chrome | $0 | Sideload/direct-install first (Kai's "start with web + apk"). Play Store = one-time $25 **[KAI] decision, later**. Fallback if Tauri Android misbehaves: Capacitor (same $0, same wrapper model). |
| **Windows** | **Tauri v2 desktop** — real `.exe`/installer, system WebView2, ~5MB binary, low RAM | $0 | Tauri is not Electron: no bundled Chromium, respects the "light" hard rule. Unsigned binary → one-time SmartScreen "run anyway" (code-signing certs cost money; parked). |
| **macOS** | **Tauri v2 desktop** — real `.app`/`.dmg` via WKWebView, built on GitHub Actions' free macOS runners (no Mac needed) | $0 | Unsigned/un-notarized at $0 → first launch is right-click → Open (Apple notarization needs the $99/yr account; **[KAI] decision, later**). |
| **iOS** | Web for now. Native iOS shell (same Tauri/Capacitor route) **requires a Mac build + $99/yr Apple account** → future work **[KAI]** | $0 today | Nothing in the architecture blocks it later — same codebase, one more shell. |

Consequences baked into the phases below:
- **Packaging is a workstream, not an afterthought** (see SHIP): `src-tauri/` config in-repo, GitHub Actions matrix (Windows/macOS/Android) producing artifacts per release tag, deep-link/external-link handling (Supabase auth redirects must work inside the shells — custom scheme or localhost callback), update story (Tauri updater with self-generated keys = $0, or "download new APK/installer" for v1).
- **Notifications in shells:** current Web Push works on web; inside Tauri, local notifications via plugin now, FCM-based push = future work. Notification UI ships as designed regardless.
- **Touch/viewport correctness is part of fidelity** (Wave 3): safe-area insets, `dvh` on mobile sheets, tap targets, hover-dependent designs paired with their *designed* touch counterparts (long-press bloom 2l, §03 sheets, pull-to-refresh 5c, swipe-restore Inbox 2b) — all of it applies identically inside the Android shell's WebView.
- **Input-mode mapping is already designed:** keyboard surfaces (⌘K, ⌘/, ⌘J, G, ?, S, P, L, X) have designed mobile counterparts (More sheet, voice capture, snooze/schedule sheet, task-detail sheet). Wire the right surface per input mode.
- **Install & platform QA** is the ship gate: real installs — `.exe` on Windows, `.dmg` on macOS, `.apk` on Android — offline-tolerant launch, no browser chrome anywhere.

> ⚠️ **Filename note:** the repo root already has `PLAN.md` (the project master plan referenced by `CLAUDE.md`). To avoid clobbering it, this deliverable lives at `design-integration/PLAN.md`. Say the word if you want it elsewhere.

---

# PHASE 0 — Ingest, inventory & questions (EXECUTED)

## 0.1 File census

The zip contains **30 `*.dc.html` files** — your inventory's 24 + 6 checks out with one bookkeeping wrinkle (see discrepancy D1). Also present: `ds/` (styles.css → 7 token files + 45 PNG assets in 12 sets), `support.js` + `image-slot.js` (DC runtime — **not ported**), `AUDIT.md`, `FUTURE_WORK.md`, `ASSET_REQUESTS.md`, and reference-only folders `_check/` (design screenshots), `_ref/` (inspiration/generation refs), `uploads/` — none of which ship.

## 0.2 Complete option inventory — files vs. your checklist

Every turn/option id extracted from the files (`<section class="dv-turn" id="tN">` / `<div class="dv-opt" id="Nx">`), cross-checked against your inventory:

| File | Options found in file | vs. your inventory |
|---|---|---|
| Today.dc.html | t1: 1a 1b | ✓ exact |
| Inbox.dc.html | t1: 1a 1b 1c · t2: 2a 2b | ✓ exact |
| Tasks.dc.html | t1: 1a 1b · t2: 2a 2b 2c | ✓ exact |
| Calendar.dc.html | t1: 1a 1b | ✓ exact |
| Editor.dc.html | t1: 1a–1g · t2: 2a 2b 2c | ✓ exact |
| Projects.dc.html | t1: 1a 1b 1c · t2: 2a 2b 2c 2d | ✓ exact |
| Perennials.dc.html | t1: 1a 1b | ✓ exact |
| Routines.dc.html | t1: 1a 1b · t2: 2a 2b · t3: 3a 3b · t4: 4a | ✓ exact |
| Rituals.dc.html | t1: 1a–1g · t2: 2a–2e · t3: 3a 3b | ✓ exact |
| Review.dc.html | t1: 1a 1b · t2: 2a 2b 2c · t3: 3c only · t4: 4a | ✓ exact (3a/3b deleted in-file, as documented) |
| Focus.dc.html | t1: 1a–1e · t2: 2a 2b | ✓ exact (t2 parked) |
| Journal.dc.html | t1: 1a 1b | ✓ exact |
| Library.dc.html | t1: 1a 1b | ✓ exact |
| Herbarium.dc.html | t1: 1a 1b 1c 1d | ✓ exact |
| People.dc.html | t1: 1a 1b 1c · t2: 2a 2b 2c | ✓ exact |
| Activity.dc.html | t1: 1a 1b | ✓ exact |
| Search.dc.html | t1: 1a 1b | ✓ exact |
| Seasons.dc.html | t1: 1a 1b 1c | ✓ exact |
| Trash.dc.html | t1: 1a 1b | ✓ exact |
| Settings.dc.html | t1: 1a 1b · t2: 2a · t3: 3a | ✓ exact |
| Quick Capture.dc.html | t1: 1a 1b 1c | ✓ exact |
| Onboarding.dc.html | t1: 1a–1h | ✓ exact |
| Night.dc.html | t1: 1a–1f | ✓ exact |
| **States.dc.html** | t1: 1a 1b 1c 1d · t2: 2a 2b 2c 2d | ⚠ **see discrepancy D1** |
| Design System.dc.html | no turns — sections 01–07 (+ live swatch logic) | ✓ matches B |
| Design System Dark.dc.html | no turns — sections 01–08 living dark reference | ✓ matches B |
| Screens.dc.html | no turns — index/overview board | ✓ matches B |
| Overlays.dc.html | no turns — §00–§05, 26 overlay components | ✓ all 26 present (Postcard, Snooze, Schedule, Project picker, Priority, Repeat, Toast, Command bar, Search, Event details, Task detail, Confirm, Bulk bar, Notifications, Chat, More sheet, Snooze/schedule sheet, Voice capture, Task detail sheet, Bulk actions, Keyboard shortcuts, Go to, Calendar view options, Board view options, Label picker, Label manager) |
| Effects.dc.html | t1: 1a–1j (10) · t2: 2a–2l (12) | ✓ all 22 |
| Motion.dc.html | t1: 1a–1f · t2: 2a–2d · t3: 3a–3e · t4: 4a–4e · t5: 5a–5f | ✓ all 26 across 5 sheets |

**Totals:** 168 turn-options + 26 overlay components + 4 sectioned reference canvases. Not built: 5 options — Focus 2a/2b + Review 4a (parked, future work incl. the whole Weekly Letter set-piece per D5), Routines 3a/3b (skipped per Kai's D6 ruling; 4a trellis is the streak visual). **Everything else ships.**

Live `data-dc-script` logic exists in exactly three files — **Design System** (data-driven swatches), **Motion** (drag & drop demos, sheets 2/4), **Review** (Weekly Letter set-piece, parked). All other "live" behaviors (Focus timers mid-round, hover-lean, pull-to-refresh, toasts…) are CSS/keyframe-driven within their markup and port with it.

Growth-stage asset sets in `ds/assets/` match inventory F exactly: cherry (bud/opening/bloom/fallen + bud/half/bloom-right trend tips), clover (resting/awake/dewdrop/seedling/four_leaf), daisy (morning/midday/evening/past/future), fern (coil/unfurl1/unfurl2/full), hydrangea (zero/light/medium/heavy), vine (bare/sprouting/flowering/lush + leaf-left/leaf-right), wisteria (p0–p100), envelope (front/back/back-open-full/stamp), seal (intact/broken-left/broken-right), tools/pen.png. Terrarium (Today) draws from `clover/` incl. `four_leaf.png`, as your inventory states.

## 0.3 Docs restated — what ships, what's a spec, what's parked

Per `AUDIT.md`:

- **Ship as screens (✅):** Today, Tasks, Calendar, Activity, Inbox, Journal, Quick Capture, Onboarding, People, Rituals, Routines, Herbarium, Perennials, Search, Seasons, Trash, Focus (t1 only).
- **Ship as screens after settled decisions (🟡, both already decided in AUDIT):** Projects (t1+t2 combined — two switchable views of one cluster); Review (ship = t1 + t2 + 3c; letter takes 3a/3b already deleted; t4 parked).
- **Specs/libraries to *implement*, not port as screens (🔵):** Design System (component contract), Screens (map), Overlays (each built where used), Effects (catalog → apply per recipe), Motion (spec → apply per trigger), Settings (3 real sections — this one *is* a screen), States (state-family rules applied everywhere), Night (deliverable = the complete `colors.dark.css` token set + runtime toggle; the 6 studies are references).
- **Parked (⚑, per FUTURE_WORK.md):** Focus t2 "A Year in the Garden" (2a/2b) — not worth shipping as-is; Review t4 Weekly Letter set-piece — animation done but needs live data/teaser/photo/cherry-tip logic to ship. **Default: both stay parked** (open decision Q3).
- **Turns are additive.** The only supersession in the whole project is Review's letter (3a/3b → t4), and those options are already deleted from the file.

## 0.4 Discrepancies found (files vs. your inventory) — **please confirm**

- **D1 — States.dc.html is missing from your inventory lists.** Section A's header says "24 files" but lists 23; States appears in neither A nor B (only in your scope prose "see States.dc.html"). The file exists with 8 options: t1 empty/first-run rule + 3 vignettes (1a–1d), t2 offline/sync — 4 topbar states, queue popover, conflict card (2a–2d). AUDIT classes it 🔵 spec. **Plan treats it as the 30th file, spec category, fully built in Phase 8.**
- **D2 — AUDIT.md says "all 29 pages"; the export has 30.** `Design System Dark.dc.html` post-dates the audit (the audit's own Night row references it as the new living reference). No action needed — it ships as the dark-token reference.
- **D3 — Sidebar drift across files.** The shell sidebar grew as screens were added. Today/Journal-era files link Inbox·Tasks·Calendar·Routines·Review·Search·Chat·Settings (+ **Rituals**, which your prompt's list omits); the newest files (Projects, Activity) additionally link Today·Projects·People·Journal·Editor·Herbarium·Activity (and Projects.dc.html even links "Screens"). One app needs one canonical sidebar → **Q5**.
- **D4 — No Chat screen exists.** `href="Chat"` appears in every sidebar, but Chat exists only as the ⌘J slide-over in Overlays §02. Plan wires the Chat nav row to open that slide-over (the only Chat surface in the export) → confirm in **Q5**.
- **D5 — `envelope/flap.png`** doc drift. **RESOLVED (Kai, Jul 12): everything regarding the Weekly Letter feature is future work** — consistent with Review 4a parked; no action in this project. **SUPERSEDED (Kai, 2026-07-19): the Weekly Letter is DROPPED entirely** — removed from all plans, not future work; the Review page ships without it (its "didn't arrive" stub gets removed in the audit-fix wave 2).
- **D6 — Routines t4 vs t3. RESOLVED (Kai, Jul 12): skip t3, keep the rest** — 3a/3b are not built; 4a trellis is the streak visual; Routines t1/t2 ship. → **Q6**.
- **D7 — Rituals t3 refinements.** 3a redraws 2b's sun; 3b is 1b "arrives already done." Same additive rule: all reproduced; in the wired flow the refined beats (3a sun, 3b pre-done state) are what the user hits, with 2b/1b variants still reachable → confirm in **Q6**.

## 0.5 Open decisions — **ANSWERED (Kai confirmed Jul 12; Q1 amended by the multi-platform end goal)**

**Q1 · Tech stack — ✅ FINAL (v3): the production app itself.** React 19 + TypeScript + Vite + `vite-plugin-pwa` in `app/` — no second codebase. Kai: "I don't care in the slightest what you use, I just want the exact visuals." The audit found `app/` already styles every component with inline `var(--…)` tokens against the *same token vocabulary* as the export (names ~identical; see audit), so the export lands as: token **values** swapped in place, then per-surface markup rebuilt **to match the `.dc.html` pixel-for-pixel** — each export screen is the *pixel contract*, verified side-by-side. The DC runtime (`support.js`) is still not ported.

**Q2 · Data — ✅ SUPERSEDED by the live-product mandate: real data.** Surfaces bind to the real Supabase data layer (which the audit rates fully reusable, untouched). Export sample-content states (inbox zero, Done petals, empty pots…) become real reachable states of real data, not hard-coded copies. Designed sample *strings* are still the copy source for labels, empty states, and microcopy — invented copy remains forbidden.

**Q3 · Parked items — ✅ confirmed:** Focus 2a/2b and Review 4a stay parked, per AUDIT/FUTURE_WORK. **Amended 2026-07-19: Review 4a (Weekly Letter) is no longer parked — it is DROPPED from the plan entirely (Kai's ruling; see D5).**

**Q4 · Inventory mismatches — ✅ confirmed:** D1–D7 accepted as resolved in this plan (States = 30th file, spec category, Phase 8).

**Q5 · Canonical shell — ✅ RULED by Kai (Jul 12): Editor 1g is the sidebar.** Groups **Plan / Tend / Cultivate**, rows Today·Inbox·Tasks·Calendar·Routines·Review·Journal·Search·Chat·Settings, **including its designed states: Plan folded + rail collapsed.** Destinations introduced by files created *after* Editor 1g (Projects, People, Activity, Herbarium — any new window/subwindow) are accounted for: added as rows/links following 1g's own row pattern, placed per the newer files that introduced them. Chat row opens the ⌘J slide-over; `href="Screens"` is a canvas-era dev link → reference route, not a sidebar row.

**Q6 · Refinement placement — ✅ RULED by Kai (Jul 12): Routines t3 is SKIPPED entirely** (3a streak vine, 3b rule-surfaced row do not get built); **4a trellis is the streak visual**; the rest of Routines (t1, t2) ships. Rituals unchanged: 3a/3b are the live beats, 2b/1b still reproduced and reachable.

**Q7 · Mobile rendering — ✅ confirmed:** bezel/Dynamic-Island chrome is canvas presentation only; phone-width viewports render the iPhone variant edge-to-edge; desktop widths render the desktop variant.

**Q8 · Location — ✅ SUPERSEDED (v3):** no separate integration app. Work happens in production `app/` on an integration branch; `design-export/` stays read-only; `design-integration/` holds this plan + agent briefs only.

---

# AUDIT — what already exists (docs + code sweep, Jul 12)

Two parallel audits (docs/plans; `app/src`) + a direct token diff. Full findings condensed to what changes decisions:

## The app is much further along than "prototype" assumed
- **Live in production:** https://kais-flow.kaidagoat.workers.dev — Cloudflare Workers static assets, `git push master` auto-deploys, Supabase backend (migrations 0001–0019, 6 edge functions), PWA with offline cache + outbox write queue already working.
- **The design system is already in the app.** A previous P-DESIGN pass botanically skinned 13 screens. `app/src/styles/tokens/` mirrors the export's `ds/tokens/` — measured drift: **typography/spacing/effects token names 100% identical** (0–2 changed value lines); colors.css 44 shared vars, 5 new in export, ~19 changed values; **colors.dark.css is the real upgrade** (32 new vars, ~96 changed lines — the export's complete night set). Fonts already load. Every component styles via `var(--…)`. **The reskin is a token-value swap + per-surface markup rebuild, not greenfield.**
- **Data layer: 100% reusable, untouched.** Every feature's `api.ts` (TanStack Query + `writeRow` outbox) is cleanly separated from views — a Page can be visually rebuilt without touching data code. Pure logic modules (`parseCommand`, `streaks`, `grouping`, `recurrence`, `dateShortcuts`, `eventTime`…) are unit-tested and reused verbatim.
- **Overlays: all rewire, none rewrite.** CommandBar, SearchOverlay, ShortcutOverlay, ContextMenu, Snooze/ScheduleMenu, ProjectPicker, Select (portal), BulkBar, `useListKeys`, `overlayStack` — token-styled, behavior decoupled. Swap markup/values, keep contracts (Escape-stack, portals under tilted ancestors).

## Build-state per export surface
| State | Surfaces |
|---|---|
| **BUILT — reskin only (Wave 1)** | Today, Inbox, Tasks*, Calendar, Task detail*, Routines*, Rituals, Review (sweep), Settings (minimal), Search (overlay + page), Chat (⌘J), Command bar, Quick Capture (voice/text), Notifications feed. *= parts sitting uncommitted (Gate 0) |
| **PARTIAL — reskin + finish (Wave 2)** | Projects (basic; full cluster spec'd P7d), Perennials (engine built, page absent), Quick Capture share-target (P6 step 7) |
| **ABSENT — schema + UI (Wave 2)** | Focus, Journal (P7a), Library (P7a), Herbarium, People (P7b), Activity page (log exists — reader only), Seasons, Trash, Onboarding |
P7 already drafts the schemas for the absent surfaces (`journal_entries`, `notes`, `quotes`, `commentary`, `people`, `interactions`, `content_items`, `time_entries`). The export supplies the pixels; P6/P7 supply the data contracts. Complementary, not competing.

## The blocker (root cause of the retrofit-phase parallelism pain)
The **entire UX Retrofit is uncommitted**: ~33 modified files (+2227/−534), ~12 untracked new components, 3 untracked migrations (0017–0019) — sitting on branch `feature/day-count-views-50` whose name no longer matches its contents. These are exactly the hotspot files every reskin touches (`AppLayout`, `TasksPage`, `CalendarPage`, `types.ts`, `NavIcons`, `outbox.ts`…). Parallel agents branching from this state = guaranteed collisions and possible loss of untracked files. **Nothing fans out before Gate 0.**

## Doc hygiene (so agents never read stale truth)
- **SUPERSEDED by the export — agents forbidden from reading:** `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md`, `docs/DESIGN_SYSTEM.md`, `SCREENS.md`, `SCREENS-PART-TWO.md`, `UI_FEATURE_BRIEF.md`, `CLAUDE_CODE_SCREEN_GENERATION_BRIEF.md`, `docs/phases/P-DESIGN.md`, `design/` (old mockups), `design-references/`. Foundation stamps each with a superseded banner.
- **LIVING:** root `PLAN.md` (architecture, $0 rules), `docs/ROADMAP.md` (register this integration as the active phase; fix stale "commit the retrofit" notes), `docs/DATA_MODEL.md`, `P6`/`P7` specs, `docs/UI-OVERHAUL-SPECS.md` (**Kai's protected copy/concept names**), AKIFLOW research docs.

---

# STRATEGY — one sentence

Land the in-flight work, then a serial Foundation freezes every shared file (tokens, shell, component kit, motion/effects primitives, routes), then parallel agents each own exactly one feature folder + its `.dc.html` pixel contract — reskinning built surfaces and building absent ones on their P7 schemas — followed by cross-cutting fidelity passes, a performance gate, and ship.

**The old UI is dead, not a reference (Kai, Jul 12: "the old ui was shit, I don't want to rely on it in the slightest").** What survives from the current app is strictly *invisible*: the data layer (api.ts/hooks/outbox/migrations), pure logic modules, behavior contracts (Escape-stack, portals, keyboard handlers, route paths), and the token *variable names* as plumbing. **Every visible surface — markup, layout, structure, styling — is rebuilt from its `.dc.html` alone.** No old JSX visuals are adapted, tweaked, or used as a starting point; the P-DESIGN-era skin and all old design docs are off-limits to agents. If the export shows it differently, the export wins; if the export doesn't show it, it doesn't exist.

---

# GATE 0 — land the baseline 🔴 [KAI — one reply unblocks everything]

1. Commit the uncommitted UX-Retrofit working set (33 files + untracked components + migrations 0017–0019) as coherent commit(s) on the current branch.
2. Merge `feature/day-count-views-50` → `master` (note: **push to master deploys to the live site** — the work is marked done in ROADMAP, so this ships the UX retrofit).
3. Cut the integration branch `feature/botanical-integration` from the new master. All waves branch from it, merge back to it; it merges to master (= deploy) at Ship.

I can execute all three on your word — reply **"land it"** (or tell me to hold the master push and I'll keep the baseline on a branch). Also fixes the three stale "[KAI] commit the retrofit" notes in ROADMAP/PROMPT-BANK.

---

# FOUNDATION — serial, orchestrator-owned. The parallelism enabler.

Everything here is a file that 2+ workstreams would otherwise fight over. After Foundation these are **frozen**: wave agents may not edit them; needed changes route through the orchestrator as foundation patches.

| # | Work | Sources | Notes |
|---|---|---|---|
| F1 | **Token swap:** export `ds/tokens/*` values land in `app/src/styles/tokens/*` (names kept); reconcile 2 app-only color vars + 1 motion var + `index.css` legacy aliases; copy `ds/assets/**` (45 PNGs) in unchanged | `ds/` | The measured diff is small; whole app instantly shifts to final palette |
| F2 | **Night theme:** complete dark set lands; `data-theme="night"` toggle wired (infra exists, control missing) in topbar/Settings per design | `colors.dark.css`, Design System Dark, Settings 1a | |
| F3 | **Shell:** `AppLayout.tsx` rebuilt to **Editor 1g** — Plan/Tend/Cultivate groups, streak-plant widget + idle sway, footer, **Plan-folded + rail-collapsed states**, later-introduced destinations (Projects, People, Activity, Herbarium…) added per the files that introduced them — + topbar (seasons echo slot, **sync states wired to the real outbox queue** — States 2a–2d become real, not simulated) | Editor 1g (Q5), newer files' nav rows, States t2, Seasons 1c, Motion 1f | Chat row → ⌘J slide-over (D4) |
| F4 | **Routes registry:** all export destinations registered in `App.tsx` (stubs for Wave-2 surfaces) + **route-level code splitting** (`React.lazy` — currently zero; FullCalendar leaves the initial bundle) | export nav map | The perf quick-win |
| F5 | **Component kit** per Design System §04: TaskRow, checkbox (bloom), buttons, chips/tags, section labels, washi-tape/tilt card + reskin of shared overlays/menus (ContextMenu, Select, Snooze/ScheduleMenu, ProjectPicker, BulkBar, ShortcutOverlay, toasts) | Design System §04, Overlays §01/§04 | Consumed by every wave agent; never redefined |
| F6 | **Motion/effects primitives:** route transition (160ms cut), overlay in/out, toast system (petal-fall), particle system (seasonal drift skins), petal/floret emitters, ink-bleed, parasol header, drag kit (ghost/placeholder/soft-no/boundary), entry stagger — as shared modules honoring `prefers-reduced-motion` + the Effects setting | Motion sheets 1–5, Effects t1/t2, `motion-interactions.css` | Agents *apply*, never re-implement |
| F7 | **Agent enablement:** per-workstream brief files in `design-integration/briefs/` (see Protocol); superseded-doc banners; ROADMAP updated to register this phase |  | The token-economy core |

**Exit criteria:** app builds + all existing screens function on new tokens/shell; night toggle works end-to-end; routes lazy-load; kit components pixel-match the DS reference page side-by-side; briefs written; hotspot freeze list published in each brief.

---

# WAVE 1 — parallel reskins (backend exists; agents touch only their feature folder)

Common definition of done for every workstream: every listed export option reproduced pixel-faithful **on real data** and reachable through the affordance the design shows; day + night; desktop + iPhone variant; copy verbatim from the export; consumes Foundation kit/primitives only; fidelity screenshots vs. the `.dc.html` attached to the PR.

| WS | Owns | Pixel contract (source options) | Effort |
|---|---|---|---|
| W1 | `features/today` (+Terrarium) | Today 1a·1b | L |
| W2 | `features/tasks` | Tasks 1a·1b·2a·2b·2c (rows/checkbox from kit) | L |
| W3 | `features/calendar` (grid, EventDetailsPanel, PlanningBoard, quick-create) | Calendar 1a·1b · Editor 1a–1g·2a–2c · Overlays §02 event details | XL |
| W4 | `features/inbox` | Inbox 1a·1b·1c·2a·2b | M |
| W5 | `features/routines` | Routines 1a·1b·2a·2b·4a (t3 skipped per Q6; trellis = the streak visual) | L |
| W6 | `features/rituals` (incl. WeeklyReview) | Rituals all 14 (3a/3b = live beats per Q6) · Review 1a·1b·2a·2b·2c·3c | L |
| W7 | `features/settings` + `features/search` | Settings 1a·1b·2a·3a · Search 1a·1b | M |
| W8 | `features/command-bar` + `features/chat` + `features/capture` | Overlays §02 ⌘K + Chat slide-over · §03 voice capture · Quick Capture 1a–1c | M |

FullCalendar note (W3): keep the `CalendarGrid` contract; theming stays contained in `CalendarGrid.css` mapped to tokens.

# WAVE 2 — parallel new surfaces (schema + api + UI; own migration files = no conflicts)

Same DoD + each ships its migration (per `DATA_MODEL.md` conventions: uuid/user_id/RLS/updated_at trigger), `api.ts` (via `writeRow` outbox), and `logActivity` events. P7 specs are the data contracts.

| WS | Owns | Pixel contract | Data contract |
|---|---|---|---|
| N1 | `features/projects` + Perennials page | Projects 1a–1c·2a–2d (two switchable views) · Perennials 1a·1b | P7d cluster spec; recurrence engine exists |
| N2 | `features/journal` + `features/library` | Journal 1a·1b · Library 1a·1b | P7a: journal_entries, notes, quotes, commentary |
| N3 | `features/people` | People 1a·1b·1c·2a·2b·2c | P7b: people, interactions |
| N4 | `features/herbarium` + `features/activity` + `features/trash` | Herbarium 1a–1d (pressing ceremony on project completion) · Activity 1a·1b · Trash 1a·1b | Readers of projects/activity_log; Trash = small soft-delete migration |
| N5 | `features/focus` | Focus 1a–1e (2a/2b stay parked) | time_entries (P7 draft) |
| N6 | `features/onboarding` + Seasons content | Onboarding 1a–1h · Seasons 1a·1b·1c (fills the F3 topbar slot) | Onboarding = real first-run over existing auth (P0 shipped none) |

# WAVE 3 — cross-cutting fidelity passes (parallel by concern, after Waves 1–2 merge)

| WS | Pass | Sources |
|---|---|---|
| X1 | Effects application audit — all 22 firing on their surfaces, Effects-setting + reduced-motion respected | Effects t1/t2 recipes |
| X2 | Motion application audit — all 26 on their triggers, timings verbatim | Motion sheets 1–5 |
| X3 | Night sweep — every surface on dark tokens, zero daylight fallbacks; 6 Night studies matched | Night 1a–1f, DS Dark |
| X4 | Mobile pass — iPhone variants at phone widths, safe-areas, `dvh`, touch counterparts for every hover/keyboard-only interaction | §03 sheets, Q7 |
| X5 | States conformance — designed empty states everywhere (States t1 rule), sync chrome verified against real outbox behavior, "error" appears nowhere | States t1/t2 |

# HARDENING — performance gate (Kai's explicit ask)

- Bundle: route-splitting verified (F4), FullCalendar/rrule/chrono out of initial chunk, budget: initial JS < 200KB gz.
- Assets: the 45 botanical PNGs sized/compressed (render ~3–4× display per ASSET_REQUESTS → downscale to 2× actual display, keep originals in `design-export/`), lazy-loaded below the fold.
- Animation: transform/opacity only, no layout-thrashing keyframes, particle counts capped, `content-visibility` on long lists, 60fps drag verified.
- Lighthouse ≥ 90 perf / PWA installable on the deployed build; airplane-mode boot test (never actually run before — audit).
- House-rules audit (DS §06) + full option checklist: every §0.2 inventory item screenshotted vs. source, day/night/mobile.

# SHIP — web live + real packages

**P1 · Web:** merge `feature/botanical-integration` → master → auto-deploy to the live URL. Manifest hygiene while we're there (`theme_color` → paper token, icons: [KAI] art, interim clover four_leaf).

**P2 · Packaging workstream (parallelizable — can start right after Foundation, it wraps `dist/` and touches no feature code):**
1. `src-tauri/` scaffold — window config (min sizes per desktop designs), app icons, custom URL scheme for Supabase auth redirects, external links open in system browser.
2. **Android:** Tauri v2 mobile target → signed-with-debug-keystore APK for direct install; verify WebView rendering fidelity (same Chromium engine family — low risk), voice capture (mic permission), safe areas. Capacitor fallback documented if any blocker.
3. **Windows:** Tauri build → `.exe` + NSIS installer.
4. **macOS:** GitHub Actions macOS runner → `.app`/`.dmg` (unsigned at $0: first-launch is right-click → Open — documented in INSTALL.md).
5. CI: release-tag workflow building all three artifacts; INSTALL.md per platform for Kai.

**P3 · Device QA [KAI]:** install APK on his Android, `.exe` on the laptop, `.dmg` if a Mac is available — offline-tolerant launch, auth flow inside the shell, no browser chrome. 

**P4 · Logged for later, not executed:** Play Store ($25), Apple notarization/App Store ($99/yr + Mac), FCM push inside shells, Tauri auto-updater keys.

---

# ORCHESTRATION PROTOCOL — parallel agents without the retrofit pain

**Roles.** I orchestrate: write briefs, run Foundation, review every wave PR against its pixel contract, own merges and the freeze list. Wave agents build; they never touch frozen files, never read superseded docs, never edit another workstream's folder.

**Briefs (`design-integration/briefs/<WS>.md`)** — the token-economy core. Each is self-contained so an agent needs almost zero repo context: source `.dc.html` + option ids; owned paths; frozen/forbidden paths; kit/primitive import map; data contract (which api.ts/hooks, or which P7 schema); protected copy list; DoD + fidelity-verification steps. Agent reads brief + its design file + its feature folder — nothing else.

**Isolation.** One git worktree + branch per workstream (`ws/<name>`) off `feature/botanical-integration`. Merge order: orchestrator merges small/independent first, rebases long-poles (W3) last. Any needed change to a frozen file = a foundation patch by me, immediately rebased into active worktrees.

**Token routing.** Heavy reading (audits, big design files → briefs): free-tier reader agents. Mechanical extraction/boilerplate (markup blocks, migration scaffolds): bulk workers on free providers. Wiring + anything judgment-bearing: Sonnet-class agents. Review/integration/merges: orchestrator only. Every wave PR gets one orchestrator fidelity review — cheaper than any redo.

**Cadence.** Waves 1+2 can run up to ~6 agents concurrently (bounded by review bandwidth, not by conflicts — that's what Foundation buys). Long-poles (W3 XL, W1/W2/W5/W6 L) start first.

---

**Sequence:** GATE 0 [KAI] → Foundation (serial, me) → Waves 1+2 (parallel) → Wave 3 (parallel passes) → Hardening → Ship. The only human-blocking step is Gate 0 and the final device installs.
