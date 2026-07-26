# Design Export ↔ Live Code Drift Audit — 2026-07-25

> **Job:** every single thing defined by `design-export/` compared against the live `app/` on `feature/botanical-integration`. Read-only — no code was changed.
> **Method:** 8 parallel deep-read agents (tokens/assets · shell · Today/Inbox/Tasks · Calendar/Editor · Cultivate · utility screens · overlays/keys · motion/effects/night), each comparing the `.dc.html` markup, BEHAVIOR docs, CALENDAR.md v2 and SPEC.md against the actual code, file:line by file:line.
> **Ruled exclusions honored (not flagged as drift):** Focus 2a/2b parked · Review 4a Weekly Letter dropped (verified cleanly gone) · Routines 3a/3b skipped (4a trellis is the streak visual) · Editor 1g is the canonical sidebar.

---

## Scoreboard

| Area | Verdict |
|---|---|
| **Copy & static layout** | The strongest area. Built screens are near-verbatim transcriptions — hand lines, ✿ strings, tape geometry, tilts, chip colors mostly exact. |
| **Tokens** | 3 of 7 files byte-identical (effects, spacing, typography). Colors drift: `--paper-event` wrong in both themes, all 12 `--block-*` calendar tints missing, `--ease-out` is the wrong bezier app-wide. |
| **Motion (26)** | 6 verbatim at the right trigger · 12 partial/re-timed · **8 entirely absent** (incl. 4 ★CORE: route cut 2a, stack push 2b/4e, mobile stack 3a, list breathing 3e). |
| **Effects (22)** | 2 verbatim · **8 entirely absent** (seasonal drift live, time-of-day paper, idle life, milestone bloom, parasol header, soft no, boundary resistance, long-press bloom). |
| **Overlays (26)** | 12 present · 3 partial · **11 absent**. |
| **Keyboard map** | ⌘K/⌘//⌘J/?/Esc work. **G and L don't exist. The `?` cheatsheet advertises ~12 keys that do nothing.** Today's list keyboard is entirely dead. |
| **Routes** | 17/18 (`/review` missing — only `/weekly-review` exists). `/trash`, `/seasons`, `/capture` unreachable except by URL. |
| **Undo** | Toast atom is spec-perfect (220/4000/160ms + petal), but **exactly 1 of ~11 toast sites passes `onUndo`**. Every design "— Undo" promise on Today/Inbox/Tasks/Calendar is unmet. |
| **Night theme** | Token set complete + toggle correct, but night is token-only: no frost/silhouettes/glowing hairlines, **paper grain vanishes at night** (multiply vs overlay), ~12 light-only hard-coded clusters break. |
| **Sound** | Settings catalog is verbatim; **no audio runtime exists**. The one real sound (`chime.mp3`) points at a file that doesn't exist anywhere. |

---

## Cross-reference — Kai's manual review (`D:\Downloads\Kai's review.txt`, pre-R4; added 2026-07-25)

Kai's voice review largely *produced* the R4 fix waves, and several register entries above are actually **his rulings, not drift to fix**. Re-classifications:

| Register entry | Status |
|---|---|
| Quick-add / onboarding placeholder copy changed (C-5, Onboarding #3) | **RULED** — Kai: no personal names in placeholders, keep activities generic. Not drift. |
| Overdue tab + Reschedule-all (Tasks app-only #1) | **RULED** — Kai asked for both explicitly. |
| `⚟ Filter` → Sort cycler (C-3) | **RULED** — Kai: static filter button is dead weight, "add a sort button". (Whether a real *filter* returns is a v1-scope question.) |
| `Organize` header display font (C-8) | **RULED** R4-19 — Kai asked for the page-title font, subtle but popping. |
| Checkbox bloom gated to Top-3/goal/milestones (Motion 5a "wrong condition") | **RULED** — Kai: bloom only on Top-3 + goal + milestones, "not every task". Overrides the spec's last-item petal. |
| Effects 2g focus-dim parked | **RULED** ✓ (audit already noted). |
| Planning board unstyled | **PARKED by Kai** until he redesigns it. |
| CALENDAR.md v2 block language (P5 #7) | **RULED** — his "calendar blocks look like shit" note is what produced v2. |
| Domain reparent on projects (app-only) | **RULED** — Kai: "I can't assign a domain to an already created project." |
| Journal drift items (P3) | **SUSPENDED** — whole surface awaits Kai's journal-model decision (multiple entries? titles? delete→trash?). |

**His review items confirmed FIXED since** (he should re-verify today): inbox dismiss/file bouncing back (P0 outbox reapply), project color resets (same), onboarding loop on refresh (same), collapsed-rail icon cluster (R4-1), rituals↔routines split (R4-D), ritual pin toggle, ?focus deep-link, popover clipping (zoom clamps), resizable rail divider, iOS emoji (needs his dev-server restart), long-name bump + onboarding overflow scroll, Connect buttons → disabled `Soon` chips.

**His review items STILL OPEN** (confirmed by this audit or unverified): resurface "Later" cooldowns — his spec: priority-based intervals (high ~1.5–2d, med ~5d, low ~10–14d) + user-tunable in Settings (R4-6, blocked on `supabase login`); 76 recurring-import dupes → wants an AI merge-into-recurring suggestion; "where did my filed task go" — filing needs destination feedback; search overlay scrolling + post-click highlight; divider between tasks; text-selection while clicking the N-day cycler; project log limited to today/yesterday (wants any past day); Focus static literals (audit P0 #11 confirms); Settings rework (paper texture, accent, sound previews, capture API — audit confirms all inert); journal model; seed art for onboarding flowers 3 & 5 [KAI art].

**New conflict for P5 (as #11):** Kai banned Motion **1a** ("root transition, view to view — a no-go"). The export itself says 1a is *superseded by* **2a** (the 160ms route cut), which is a different, ★CORE item. Does the ban cover 2a, or should 2a be wired? Needs a ruling before touching route motion.

---

## P0 — Visible bugs (would show up in a live session today)

1. **Literal `\uXXXX` escapes paint on screen.** Escapes written into JSX text render as raw text (`Kai's Flow · Activity`) at 26 spots: `ActivityPage.tsx:322,337,351,361,386,402,407` · `HerbariumPage.tsx:180-340` (14 spots) · `TrashPage.tsx:125,142,199,211,228`.
2. **Milestone "edit" chip deletes the milestone.** `ProjectDetailPage.tsx:465` — label `edit`, handler `removeProjectMilestone`.
3. **Offline topbar renders a duplicate `◌`** — `AppLayout.tsx:422` + `:440` → `Offline ◌ — 3 saved here ◌`.
4. **Esc cannot close the ⌘J Chat panel.** `ChatPanel.tsx` never registers `useEscapeStack`; Esc silently fires on whatever is beneath it.
5. **Topbar date format wrong:** `Fri, Jul 25` (`AppLayout.tsx:421`, en-US) vs design `Fri 10 Jul`.
6. **Hydrangea stage contradicts itself across screens.** `lib/gardenAssets.ts:3-9` uses ≤3/≤7 thresholds; `TodayPage.tsx:270` uses the spec's 1-4/5-19/20+. Same count → different stages on Today vs Inbox. (House rule: never show a stage that contradicts data.)
7. **Vine "lush" threshold disagrees with itself:** `RoutinesPage.tsx:23-28` lush at 21 days; `EveningRitual.tsx:125` (spec-correct) lush at 30. Same streak, two stages.
8. **Slipping card hardcodes `wisteria/p20.png`** (`TodayPage.tsx:784`) regardless of the project's real progress — stage contradicts data.
9. **House-rule violation ("error" never appears):** `outbox.ts:110,121` toasts raw Postgrest messages + `'Unknown error'`; `SettingsPage.tsx:352` surfaces raw `e.message`.
10. **`chime.mp3` doesn't exist** in `app/public/` or the export — the Focus gentle chime silently never plays (`focusStore.ts:165`).
11. **Design sample literals ship as live UI:** `FocusPage.tsx:560,563` (`9:00 – 11:00`, `session 2 of 3 today`), `:812` (`subtask 2 of 3 · draft the cohort model` fallback), `:385` (11.5→12.1 hours); `LibraryPage.tsx:1077` (`resurfaced twice`), `:1100` (balcony-rebuild chat flag); `QuickCapturePage.tsx:10,15-16,125,137`; sun-dial lit dots hardcoded (`EveningRitual.tsx:190-191`); retainer `6.5h / 10h this month` + `renews 1 Aug` (`ProjectsPage.tsx:452,458`).
12. **Petal pile shows 1 petal under the label "0 petals"** — `EveningRitual.tsx:229` floors at 1.
13. **Review sweep state is not persisted** (`WeeklyReviewPage.tsx:63` useState) — reload resets every domain to unswept; `domain.swept` is logged but never read back.
14. **Day-complete celebration can fire twice** — Today and Tasks each own it with different localStorage keys (`kf.dayDoneShown` vs `kf_day_complete`) and dwells (4.2s vs 3.4s vs spec 3s).
15. **"Botanical animations" toggle lies under OS reduced-motion** (`SettingsPage.tsx:170` seeds from the conflated `useMotionEnabled()`), and the toggle is missing entirely from mobile Settings.
16. **Reduced-motion leak:** `SettingsPage.tsx:617` `scrollIntoView({behavior:'smooth'})` — CSS `scroll-behavior: auto !important` can't override a JS argument.
17. **Dead controls** (cursor:pointer, no handler): People nudge `later` (`PeoplePage.tsx:307`), Search filter chips (`SearchPage.tsx:175-187`), Settings Connect/Disconnect (`SettingsPage.tsx:512,515,537,550`), Library resurface `keep`/`dismiss` (`LibraryPage.tsx:1101`), Activity rows not clickable (spec: click → source page).
18. **"One line" evening ritual never lands in the journal** — copy promises it (`lands in the journal`), code only writes `logActivity` (`EveningRitual.tsx:89`); `upsertJournalEntry` has no caller outside JournalPage.

---

## P1 — Missing cross-cutting systems (design defines them everywhere; app has them nowhere)

1. **Route cut 2a** (swiftA/B 160ms, every route change) — deliberately omitted (`index.css:21-31`), but the spec composes 2a *and* 4b, not either/or (`MOTION_RETROFIT.md:122`). ★CORE.
2. **Stack push/pop 2b/4e** (380ms cubic-bezier(0.32,0.72,0,1), parent −26px/0.98/14% dim) + **mobile stack 3a** — no keyframes exist; every drill-in is a plain route swap. ★CORE ×3.
3. **List breathing 3e** (`rowIn` 240ms / `rowOut` 200ms + 180ms collapse) — keyframes don't exist. All removals (inbox file/dismiss, slipping reviewed, resurface triage, task delete) are instant or a bare fade. ★CORE.
4. **Undo system.** Design: every action toasts with Undo (5s). App: `onUndo` exists in the store, rendered by ToastHost, produced by exactly one call site (`capture/api.ts:126`). Dwell 4s (Motion 3d) vs "Undo 5s" (Overlays/SPEC) is also an unresolved design-internal conflict.
5. **Go to (G) and Label picker (L)** — no handlers, no components; both advertised in the `?` overlay / cheatsheet. `Task.labels` is typed, writable, populated by importers, surfaced nowhere. Label manager absent from Settings.
6. **Overlay exit motion** — 140ms out is skipped everywhere except VoiceCaptureSheet (documented decision, `xfx.css:6-7`); Motion 3c calls it ★CORE. **No overlay uses the 20% scrim** (observed 14–42%).
7. **Effects with zero code:** seasonal drift on live screens (2a — exists only inside `/seasons`), time-of-day paper (2b), idle life (2c), milestone bloom stage-crossfade (2e), parasol header (2h), soft no (2j), boundary resistance (2k), long-press bloom (2l), pull-to-refresh dew (5c), seed plant (5f).
8. **Sound runtime.** Six per-sound toggles persist to `localStorage['kf_sounds']` that nothing reads; no quiet-hours logic; no paper-rustle/pencil-scratch hooks.
9. **Night surface language.** Only one `[data-theme="night"]` component rule in the whole app (and its comment is stale). No frosted glass, no botanical silhouettes, no glowing hairlines; **grain**: `index.css:55-64` multiply/0.5 vs Night.dc overlay/0.25 → grain effectively disappears at night. Auto theme follows OS, not Cairo sunset. ~12 light-only hard-coded clusters (worst: `kit.tsx:44` `#8A4A58` chip text, `TodayPage.tsx:624,636` white checkbox wash, soil gradients in Today/Search/Onboarding, warm-brown scrims/shadows in 6 files).
10. **Task detail is a route, not an overlay** — no Enter-opens-detail binding anywhere, no slide-over, no "Open full ↗", no 2b motion. Mobile task-detail sheet and mobile snooze/schedule sheet don't exist (desktop popovers render at all widths).
11. **Notifications slide-over** — route is a Stub; `useRecentActivity` has no consumer.
12. **"Needs a look ⚠" sync state** — not implemented (self-acknowledged pending conflict detection); States 2c conflict card (two "Keep this one" buttons) also absent.
13. **Share-target is a simulation.** `vite.config.ts` manifest has no `share_target`; no `/share` route. Quick Capture 1c renders a flow the OS can never invoke. The Integrations "capture from anywhere" endpoint shows "not set up yet".
14. **Hover & press 4a coverage** — `.kf-lift` is verbatim but applied to buttons/cards on ~3 features; task rows, inbox cards, calendar events, chips have neither the −1px lift nor the 0.97 press. Hover lean 5d replaced by an infinite ±1.4° sway loop.
15. **`ConfirmCard` exists and matches the design but 7 destructive paths still use native `window.confirm`** (`TasksPage.tsx:461,483`, `TaskRow.tsx:222,368,492`, `TodayPage.tsx:184`, `PlanningBoard.tsx:258`, `InboxPage.tsx:730`).
16. **Escape-stack fragility:** `useEscapeStack` re-pushes on every render (inline closures in deps) letting parents steal "topmost"; `EventDetailsPanel` uses a private listener outside the stack.

---

## P2 — Tokens, assets, fonts

- **`--paper-event` drifted in both themes:** light `#F4EFE0`→`#F3EDDA`, dark `#2A2639`→`#2C2740` (duplicate of `--sky-panel-strong`).
- **All 12 `--block-*` calendar tint tokens missing** (6 light + 6 dark); `CalendarGrid.css:134-135,224,312` hard-codes the equivalents at slightly different alphas.
- **`--ease-out` is the wrong curve app-wide:** app ships `cubic-bezier(0.16,1,0.3,1)` (from `motion-interactions.css`, which `ds/styles.css` does **not** import); canonical `motion.css` says `cubic-bezier(0.22,0.61,0.36,1)`. Every `var(--ease-out)` consumer runs easeOutExpo.
- App-only tokens: `--ink-hand` (both themes), `--text-on-accent`, `--ease-spring` — all in real use; not in the export.
- **Assets:** `envelope/` (4) + `seal/` (3) never copied (consistent with the Weekly Letter drop, but undocumented); `daisy/future.png`, `cherry/bloom-right.png`, `cherry/bud-right.png` shipped unused; `daisyAsset()` never returns `future` (pre-dawn falls to `past`); daisy clock boundaries shifted +1h vs CALENDAR.md §0.
- **Fonts:** families/weights exact via self-hosted @fontsource, but **Source Serif 4's variable `opsz 8..60` axis is lost** (static instances installed, `@fontsource-variable` not); `index.css:14` comment claims a `<link>` mechanism that doesn't exist.
- Scrollbar: 11px→10px, thumb hex → night-safe color-mix (deliberate).
- Hard-coded color offenders: `QuickCapturePage.tsx` (46 hexes), `EveningRitual.tsx` (42), `FocusPage.tsx` (12), `#D4A8B0` raw in 10 files, `#C9A55A` in 8.
- Stale: `CalendarGrid.css:272-277` night guard for a token that has since landed; `ToastHost.tsx:8-9` comment describing a 6s dwell that is already 4s.

---

## P3 — Per-screen drift (condensed; every item verified with file:line in the agent passes)

### Shell
- Collapsed 64px rail drops the `K` monogram, the 30×30 Plan tile, and the foot vine; keeps 5 footer glyphs vs the designed 3. Toggle stays at top:20 vs top:54.
- Sidebar width 242px (Editor 1g) vs 260px (SPEC + Navigation Reference) — design-internal conflict, app followed 1g.
- Tend group label uses Cultivate's padding; open-state Plan chevron not right-aligned; folded Plan count hidden at 0.
- **Focus + Library are app-only sidebar rows inserted mid-order** in Cultivate (and in the More sheet); Journal row parked (documented). Herbarium correctly has no row (no design file gives it one).
- Syncing state shows a spurious sage dot + wrong color; queue popover missing last-sync time in the synced state; row verbs collapsed to `saved`/`removed`; popover not Esc-stacked.
- Entry stagger (4b) present on only 8-12 pages; missing on Inbox, Calendar, Routines, Journal, Focus, Search, Seasons, Settings, Rituals. First-mount suppression is timing-fragile (`data-initial` ref pattern).

### Today
- Terrarium eyebrow drops `· Day 42` on desktop. "All open" rows miss overdue/due/`↻` meta (Tasks' own TaskRow has them; Today uses a local row). Up-next rows print time ranges on every row + app-only checkboxes (design: read-only).
- Slipping renders only `slipping[0]` (design: stack). No rowOut/toast/undo on reviewed-dismiss, resurface chips, or task check. Routines header/labels aren't links. Resurface `Still relevant` chip vanishes for task-type rows (one-chip card); chip font-size clobbered by `font:'inherit'` ordering.
- Two different done-marks in one column: sage `Checkbox` vs near-black `--sig-done` DoneCheck.
- Empty/all-done vignettes verbatim but scoped to the Top-3 slot only (Up next still renders below). Day-complete banner copy invented (`that's the day, gently done ✿` vs `The day's goal is done.`).
- App-only: birthday cards, bulk bar + multi-select, context menus, Up-next checkboxes, "Anytime" routine group, terrarium kill-switch.

### Inbox
- 1a/2a/2b/1b near-verbatim incl. swipe-restore geometry. Drift: card 2's `→ Journal` button replaced by `Snooze`; mobile card hides the parse chips and keeps desktop button labels; file = fade-only (no rowOut slide/collapse, 260ms hold); dismiss instant; **no toasts, no undo, no inbox-zero bloom celebration**; hover-lift absent; GitHub repo slug hardcoded.
- Hydrangea thresholds wrong (P0 #6).

### Tasks
- Verbatim: rows, Done view, Someday view, mobile swipe panels, rail tape cards (exact tilts/tapes), strikeGrow 240ms, rowDip 1.5px.
- Drift: app-only `Overdue` tab; `⚟ Filter` replaced by a Sort cycler; group labels `Today`/`Scheduled on calendar`/… vs design's `Due today`; check pop 260ms (spec 180) gated to Top-3 rows only; rowDip 320ms (spec 120); boxFill absent; petal on `top3` not last-item; no toast on check; title click doesn't open detail; tab switches have no crossfade; Done-view petals static; quick-add placeholder copy changed; swipe hint styled mono instead of hand.

### Calendar + Editor (158 findings; strongest CALENDAR.md v2 conformance in the app)
- **Verbatim:** grid maths (54px/27px/30min/0.9px-min), §2 base block recipe, grip, in-block checkbox, temporal axis (past/in-progress/ran-over), outbox pending/failed marks, just-landed ring, ghost/placeholder split + 120ms snap flash, rail copy (`drag onto a time to plant it ✿`), Editor 2a/2b/2c popover + sheet chrome, TaskEditorPage ≈ Editor 1a, Event details chrome.
- **Missing:** daisy stage images in day headers; badge ranks (2/7) and semantic statuses (2/10 — no tentative/declined/cancelled/free/recurring/RSVP); ritual hatch; focus-block elapsed fill/lock; overlap shouldering + 3+ shingle `+N more`; short-tier CSS (`kf-tier-short` has no rule); multi-day/midnight-span treatments; hover empty-slot ghost `+ New`; long-press create; top-edge resize; 30-min clamp; all-day↔timed drag conversion (`all_day` hardcoded false); edge auto-scroll; soft-no; rubber-band; focus dim 2g; toast+undo on any calendar action; conflict `· overlaps n` suffix; View-options popover; `Meet` method suffix.
- **Drift:** hour lines `--line-dashed` vs `--line-card`; today wash ~1.7× spec; now-chip unstyled/position; ghost opacity/radius/no static tilt; rail→grid drags get no free ghost (FC mirror only); resize snap-line 320ms vs 120; segmented control Day/N-day/Week/Month with Week default vs Day/4-day/Week with 4-day default; `Today` doesn't scroll to now-line; empty-rail copy `Nothing here to block.` invented; all-day band lavender/26px vs sage/34px; colored events edge at 55% vs 35%; mobile keeps 54px/hour (spec 60) and lacks the week strip; Editor 1b full-page create is a centered modal without Notes; 1e/1f mobile variants don't exist as designed; quick-add rail field is a popover-opener, not an inline input (no seed-plant).
- App-only (sanctioned but unspecced): rolling week + h-scroll + zoom compensation (Kai's inline asks), month view, N-day cycler, right-click menus, resizable rail, scope selector, PlanningBoard, resize→duration writeback.

### Projects / Routines / Review / Journal / Rituals
- **Projects:** closest match of all. Drift: milestone "edit" deletes (P0), archive lacks the `dropped` state, retainer numbers hardcoded, area "This month" is all-time, cadence chips genericised to `↻ repeats`, area Recent log stubbed, detail palette = form's 8 not 1b's 10, board plant-slot in every column, Timeline tab dead, no 380ms stack push.
- **Routines:** vine threshold split (P0 #7); hero caption re-worded; form dropped per-step minutes/reorder/total and the 5-species plant picker (documented); trellis vine static; today never draws a leaf (`key === todayKey → 'off'`); tick colors re-purposed (terra = broke vs design's today); two streak algorithms visible at once (row flame vs trellis grace).
- **Review:** frond spine missing; expanded domain-card sweep UI (per-project rows + still moving/park it/needs a look chips + loose-tasks row) missing — sweep is just "Mark swept"; `last swept` stamp missing; sweep not persisted (P0); flourish fires on open not completion, dots are a fixed table; fern stage not wired; consistency widget uses 2c's grid not 3c's bars, with inverted colors (broke = neutral grey, rained = warm); week-number computed two ways that can disagree; mobile hides the Close-the-week block. Weekly Letter: **cleanly gone, zero remnants** ✓.
- **Journal:** 1a/1b near pixel-perfect. First-entry state has the copy but no notebook vignette/pencil SVG; "Day N" counts entries not days; quote-rail titles genericised; ink bleed on prompts/quotes but not newly typed text; fern stage wired mobile-only.
- **Rituals:** Morning 1a-1d/1g + Closing 2c-2e/3a/3b built with verbatim copy. **Missing: Evening 1e/1f (sweep today / tomorrow at a glance)** — the built Closing Ritual is a different 4-beat flow (evening total 4 vs spec 2, and Today's `n/4` reflects it); **2a "Close the garden" post-sunset entry point missing**; 2b flat sun dial unreachable (3a only); `skip` logs the step as complete; seed glyphs replaced by ★; 2e's "dimmed Today · no sounds" aftermath unimplemented.

### Utility screens
- **People:** BUILT, near-verbatim incl. 2b banner/Moments/2c Today card. `later` nudge chip dead; nudge action always `call`.
- **Activity:** BUILT. Escape bug (P0 #1); dots colored by source category not event type (no `starred` type); rows not clickable; Projects events have no filter chip; `last 7 days` vs design `last 3 days`.
- **Settings:** PARTIAL. Appearance/Timezone/Sound catalog/Push verbatim. Integrations missing the error/"Reconnect needed" and connecting states, the whole GitHub rules panel, and Google Rules/Disconnect; Connect/Disconnect buttons dead; capture endpoint "not set up yet"; Sound volume meter missing; Sound nav row filtered out of subnav; `PAGE_BEHAVIORS`' Keyboard-shortcuts/Data-privacy/Account sections absent in both design and app (doc drift).
- **Focus:** BUILT and the best-covered motion surface (veil, fireflies, motes, petals, dew glint). Session strip literals hardcoded (P0 #11); `5-min` break qualifier dropped; garden CTA routes to `/weekly-review` instead of the evening ritual.
- **Search:** PARTIAL. Only Tasks+Inbox groups (backend indexes only those; design wants People/Events/Journal/Projects — and Overlays version wants Tasks+Journal); chips dead; no Show-all/Related/priority/done affordances; empty state verbatim ✓.
- **Library:** BUILT, near-verbatim; `resurfaced twice` + chat-flag hardcoded, resurface chips dead; quote rows drop the `· N thoughts` count; **Remove book deletes with no confirm**.
- **Herbarium:** BUILT incl. the 3-beat pressing ceremony; escape bug; ceremony fires on archive (already archived before beat 1; Skip and Press It call the same handler); "see the garden as it was →" dangles to parked Focus 2a (links to /projects).
- **Perennials:** BUILT at `/perennials` (design says `/tasks/recurring`); Tasks-header chip lacks the count; row-menu "Manage repeats…" missing; paused row's `Resume` hover-only; Edit rule is a native select not the Repeat popover.
- **Seasons:** BUILT as a reference page; **the live integration (Today header/terrarium season layer) is missing** — `SEASON_META` has no consumer outside the page. Topbar echo wired ✓. Rain↔sound wiring absent.
- **Trash:** BUILT, node-for-node confirms; escape bug; restore toast lacks `Jump there →` (toastStore has no action slot); **no entry point anywhere** (design: Settings row + sidebar ghost link).
- **Onboarding:** BUILT, 7 steps + 1h verbatim; step 6 rewritten to `Soon` chips (integrations don't exist — copy invented, honestly).
- **Quick Capture:** the page is a bezel-framed mockup gallery at an unreachable route; the real voice sheet is verbatim and wired ✓; share-target missing (P1 #13).

---

## P4 — App-only additions (not in any design file; inventory, not necessarily bad)

Bulk bars + multi-select on Today/Inbox/Tasks · right-click context menus (rows, calendar blocks, empty grid) · Remind submenu · Overdue tab + Reschedule-all · sort cycler · duration totals in group headers · keyboard list-nav layer · birthday cards on Today · inline New-person form · Library add-book/log-session forms · month view + N-day cycler + resizable rail + scope selector + PlanningBoard · NL parsing chips in quick-create · `n` key · Space-to-complete · `⌘A` select-all · hover flyouts on collapsed rail · range cycling on Activity · Import settings card · Groq row · custom pomodoro minutes + MiniFocus · `--ease-spring`/`--ink-hand`/`--text-on-accent` tokens · `checkPop`/`entryFadeUp`/`itemFadeIn` keyframes ending at `transform:none` (documented positioning fix).

---

## P5 — Design-internal conflicts (need a ruling before "fixing" would even be defined)

1. **`--ease-out`:** `motion.css` (canonical per `ds/styles.css` import graph) vs `motion-interactions.css`. App follows the non-canonical file.
2. **Toast undo:** Overlays/SPEC "Undo 5s" vs Motion 3d "dwell 4s". App implements 4s.
3. **Sidebar groups:** SPEC §3 "Plan/Cultivate everywhere" vs Editor 1g "Plan/Tend/Cultivate" (ruled: 1g wins; SPEC stale).
4. **Sidebar width:** Editor 1g 242px vs SPEC/Navigation Reference 260px.
5. **Inbox-zero copy:** `Inbox.dc.html 1b` (`one calm bloom ✿`) vs SPEC/PAGE_BEHAVIORS (`Inbox zero — the garden can rest.`, which lives in `Kai's Flow.dc.html`). App follows the dc option.
6. **Amber drift trigger:** Motion 1e "slipping/days-since-tended" vs Effects 1h + retrofit "board ambient". App implements the former.
7. **Event block language:** CALENDAR_BEHAVIOR §2 (left accent bar, primary/standard shadow tiers, `--paper-event`) vs CALENDAR.md v2 §2 (full border, no shadow). App follows v2 (documented Kai ruling) — the primary/standard emphasis tier is gone as a consequence, and `--paper-event` is now dead in the calendar.
8. **Hydrangea thresholds:** SPEC (1-4/5-19/20+) vs `gardenAssets.ts` (≤3/≤7). SPEC is the design; the lib is just wrong — listed here because Today re-implements it correctly, so fixing means consolidating.
9. **Search groups:** Search.dc.html (5 groups) vs Overlays §02 (Tasks+Journal). App has Tasks+Inbox — matches neither.
10. **Evening ritual shape:** Rituals 1e/1f (2-step) + PAGE_BEHAVIORS vs the built 4-beat Closing Ritual (2c-2e/3a). The app's Closing Ritual is itself designed (t2/t3) — what's missing is 1e/1f, but Today's `n/4` semantics follow the 4-beat flow.

---

*Full per-finding detail (every DESIGN vs APP quote with file:line) lives in the eight agent passes that produced this synthesis; this file is the consolidated register.*
