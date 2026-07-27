# Kai's Flow v1.0 — Remediation Plan

> **Contract:** `V1-PUNCHLIST.md` (65 items, all 5 decisions closed). **Ship: 2026-08-15.** Written 2026-07-26 — 20 days out.
> **Method:** same machine that built the integration — a short serial **Foundation** batch on shared files, then **parallel wave agents each owning one feature folder** in their own worktree (`ws/<name>` off `feature/botanical-integration`), orchestrator reviews + merges, then cross-cutting passes, hardening, deploy, and Kai's judgment loop. Dispatch via fresh-session paste prompts (PROMPT-BANK pattern); prompts get written per workstream on its dispatch day.
> **Rules carried forward:** $0 · no new paid deps · frozen shared files after Foundation (changes route through orchestrator) · agents never read superseded docs · Kai's dev server at localhost:5195 is the only dev server · session quota is account-wide, pace dispatch.

> **Execution model — DECIDED 2026-07-26: Scenario 2** ("Claude writes, free tier reads"), **automatic dispatch** — the orchestrator launches all workers itself via the Agent tool; Kai pastes nothing. Full routing, prompt skeletons, review gate, and preflight state: `V1-DISPATCH.md`. Codex, if it arrives, upgrades to Scenario 3 (calibrates on WA-11 Focus first) without changing this plan.

---

## Timeline at a glance

| Dates | Phase | What |
|---|---|---|
| **Jul 26–28** | **F** Foundation | Shared-file batch F1–F7, serial/near-serial, orchestrator |
| **Jul 29 – Aug 4** | **Wave A** | 11 parallel feature workstreams (long poles first) |
| **Aug 1** ⏰ | **[KAI] gate** | `supabase login` + `db push` MIG-1..3 (see Migrations) |
| **Aug 5–8** | **Wave B** | 4 cross-cutting passes (motion, night, mobile, truth) |
| **Aug 8–10** | **Hardening** | Perf, safety pass, merge → master, deploy |
| **Aug 11–14** | **Judgment loop** | Kai walks all 65 Judge lines on the live build; same-day fix sessions |
| **Aug 15** | **Ship call** | Kai's verdict → beta testers get the URL |

Built-in slack: Wave A has a 1-day buffer, judgment has 4 days for what should be 2. The long poles (Calendar, Motion) start on day 1 of their phase.

---

## Phase F — Foundation (Jul 26–28, shared files, then FROZEN)

Everything here is a file 2+ workstreams would fight over. F1–F4 are judgment-bearing (orchestrator); F5–F7 are mechanical and can run in parallel worktrees alongside.

| # | Work | Punch items | Files |
|---|---|---|---|
| **F1** | **Undo system**: `withUndo` helper + toast action slot (`Jump there →` support too); pattern doc so every wave wires its own call sites | 6, 7 (infra) | `lib/toastStore.ts`, `components/ToastHost.tsx`, new `lib/undo.ts` |
| **F2** | **Growth-stage module**: one `lib/growthStages.ts` — hydrangea/vine/cherry/fern/daisy/wisteria thresholds; delete the per-file copies | 10 (infra) | `lib/gardenAssets.ts` + consumers migrate per wave |
| **F3** | **Keyboard truth + ⌘K nav**: cheatsheet lists only real keys; list-keys (S/P/X/1-2-3/Enter/Space) enabled on Today; one Inbox key set; Esc-stack fixes (ChatPanel registered, EventDetails through the stack, dep-array fix); **⌘K view-jump row** (D-5); G/L removed | 12, 29 (binding), 59 | `lib/shortcuts.ts`, `lib/overlayStack.ts`, `components/useListKeys.ts`, `features/command-bar/` |
| **F4** | **Motion primitives**: 160ms route cut (D-4) on `.kf-route`; overlay exits 140ms + scrims → 20%; `rowIn`/`rowOut` keyframes; check-pop timing corrections (boxFill 90 → pop 180 → strike 240 → dip 120); `--ease-out` token corrected to the canonical curve | 61 (infra), 62 | `styles/tokens/motion.css`, `index.css`, `AppLayout.tsx`, `components/kit.tsx`, `features/tasks/TaskRow.css` |
| **F5** | **Mechanical batch**: escapes fix (3 files) · calm-copy pass (outbox/settings) · topbar (date format, duplicate ◌, syncing colors) · ConfirmCard at the 7 native-confirm sites · **removals** (Library nav out, Sounds hidden, notifications stub route → bell links Activity, planning board hidden, capture gallery dev-only) | 13, 11, 60, 14, 65, part of 8 | scattered, all small |
| **F6** | **Rendering root causes** (time-boxed 1 session): blur cluster (rotated cards / root-zoom interplay) + 100%-zoom layout breakage. If not root-caused in the box → escalate with findings, don't burn the schedule | 15, 16 | `lib/uiScale.ts`, card transforms |
| **F7** | **Collapsed-rail icon set**: simple line glyphs for Inbox/Projects/Routines/Focus/Review (Library row is gone); verify hover labels | 58 | `components/icons/`, `AppLayout.tsx` |

**Exit:** build green, freeze list published, every wave brief lists what F provides (undo helper, growth module, keys, motion classes).

---

## Wave A — parallel feature workstreams (Jul 29 – Aug 4)

Common DoD per workstream: its punch items' **Judge lines pass locally**, undo wired via F1 on every listed action, build green, no frozen files touched, worktree `ws/<name>`, orchestrator review before merge. Dispatch order = long poles first.

| WS | Owns | Punch items | Size | Notes |
|---|---|---|---|---|
| **WA-2 Calendar** | `features/calendar/` | 32 view-options popover (Akiflow ref) · 33 drag→rail · 34 task-details from block · 35 drop trio (soft-no, 30-min clamp, top-edge) · 36 all-day↔timed (incl. `all_day` write) · 37 edge auto-scroll · 38 alignment pass · 39 daisy headers | **XL** | Starts day 1. Item 38 ends with a screenshot set for Kai (paired review). |
| **WA-9 Rituals/Review** | `features/rituals/`, `features/routines/` | 43 sweep-as-beat-1 + one-line→journal + skip fix · 44 streak unification (uses F2) · 45 sweep persistence + per-project verdict UI | **L** | Starts day 1. Sweep persistence = small migration or activity-log read-back — prefer read-back, no migration. |
| **WA-3 Tasks** | `features/tasks/` | 27 All tab · 28 dedupe assistant (dry-run first — real data!) · 30 Organize rail · 31 Perennials edit-rule | **L** | Starts day 1. 28 must show a preview diff and require confirm; never auto-merge. |
| **WA-4 Today** | `features/today/`, `features/resurfacing/`, `features/slipping/` | 17 cap+View-all · 18 row meta (reuse Tasks row) · 19 click-away deselect · 20 slipping stack+undo · 21 cooldowns (client side; MIG-1) · 22 chip/hover/button states · 23 day-complete merge | **L** | 21's server fields land with MIG-1; client logic ships behind the field check. |
| **WA-1 Public** | `features/auth/`, `features/onboarding/` | 1 sign-up (page+logic+verification) · 3 onboarding once+re-editable | **M** | Seed-art fallback: reuse existing assets if [KAI] art misses Aug 8. |
| **WA-10 Small batch** | `people/`, `activity/`, `search/`, `trash/`, `herbarium/` | 46 later-nudge · 48 rows navigate + Projects chip · 49 search index expansion (MIG-3) + overlay scroll + chips · 50 Trash entry points · 51 press-then-archive | **M-L** | 49's `search_hybrid` update is the one backend-heavy bit. |
| **WA-5 Inbox/Capture** | `features/inbox/`, `features/capture/`, `vite.config.ts` (manifest — orchestrator patch) | 24 share-target · 25 compost cron (MIG-2) · 26 keyboard triage verify | **M** | Share-target route + manifest member; test on the phone. |
| **WA-6 Settings** | `features/settings/` | 53 paper-texture real · 54 rows functional-or-hidden + integrations dedupe · 55 accent row removed · 56 animations gating (decouple from reduced-motion, gate the 5 loose loops, add to mobile) | **M** | |
| **WA-8 Projects** | `features/projects/` | 40 milestone edit-edits · 41 list verbatim vs export · 42 detail task parity + real month windows | **M** | |
| **WA-7 Journal** | `features/journal/` | 47 model per D-1 (daily page + timestamped entries + delete→Trash) + nav row restored | **M** | Trash feed pairs with WA-10's item 50. |
| **WA-11 Focus** | `features/focus/` | 52 real session data · gear icon · chime toggle removed (sounds are v2) | **S** | |

**Pacing:** ≤4 concurrent agents (quota + review bandwidth). Suggested dispatch: day 1 = WA-2, WA-9, WA-3; day 2 = WA-4, WA-1; then continuous as merges land. Orchestrator merges small/independent first, rebases WA-2 last.

## Wave B — cross-cutting passes (Aug 5–8, after Wave A merges)

| WS | Pass | Punch items |
|---|---|---|
| **WB-1 Motion application** | Wire the absent motions on every surface with F4's primitives + spec timings: list breathing on all row add/remove, drag-lift grammar on all draggables, seed-plant on create, mobile stack, drag polish (catch dip, edge scroll outside calendar), floret/petal durations; reduced-motion audit | 61 |
| **WB-2 Night sweep** | Grain blend fix (overlay/0.25 at night), the ~12 hardcoded light-only clusters, walk every page in night | 57 |
| **WB-3 Mobile** | Bottom sheets for snooze/schedule + task detail; full phone walkthrough (tab bar, swipes, FAB, safe areas, `dvh`) | 63, 64 |
| **WB-4 Truth sweeps** | Dead-controls final sweep · sample-literals final sweep · keyboard re-verify against the shipped cheatsheet · fresh-account walkthrough with a second test account | 8, 9, 12 (verify), 2 |

## Hardening + deploy (Aug 8–10)

### Measured 2026-07-27 (orchestrator, in parallel with Wave B)
- **Initial JS = 232.7 KB gz vs the 200 KB budget** (index 100.6 · tanstack-query split across `activity` 55.1 + `useQuery` 11.0 · hooks 22.2 · schemas 17.2 · api 14.4 · rest ~10). FullCalendar/rrule/chrono are correctly OUT (CalendarPage is its own 316 KB chunk), so the overage is the shell itself.
  **The fix, deferred to avoid racing Wave B's edits to AppLayout:** `AppLayout` eagerly imports `CommandBar`, `ChatPanel`, `SearchOverlay`, `ShortcutOverlay` — four surfaces that render only after a keypress. `React.lazy` them behind their open-state (they already have one) and the shell chunk drops materially. Do this first in hardening, then re-measure.
- **Assets:** 38 PNGs / 5.2 MB, intrinsic ~350px against display sizes of 16–96px. At 1.25 root zoom on a 2× screen the largest use needs ~240px, so only the big-render cases are near-honest and the small ones are heavily oversized. Downscaling changes pixels Kai judges, so it needs his eye or a same-size lossless recompress — **not** a blind resize. PWA precache is 188 entries / 8.3 MB; leaving the botanicals precached is deliberate (a garden app with missing plants offline is worse than a heavier install).
- **Security (punch 4):** `0034_revoke_cron_function_grants.sql` written — see the migrations register.

- Perf: Lighthouse ≥ 90 deployed, initial JS ≤ 200KB gz (currently ~232 — route-split the new surfaces, verify FullCalendar stays out of initial), airplane-mode boot. *(item 5)*
- Safety: RLS spot-checks with account B via REST, edge-function rate limits, capture endpoints auth-gated. *(item 4)*
- **Merge `feature/botanical-integration` → `master`** (= live deploy) once Wave B is green. Earlier is fine if Kai wants mid-flight judging — he's the only prod user.
- **[KAI]:** migrations pushed (see below), phone PWA reinstall, judging time blocked Aug 11–14.

## Judgment loop (Aug 11–14) → Ship (Aug 15)

Kai walks `V1-PUNCHLIST.md` top to bottom on the live URL, checking boxes; every ❌ becomes a same-day fix session scoped to that one Judge line. Aug 15: verdict. Pass → beta testers (Mohamed Yasser, Ahmed Elkassrawy, Youssef Sanafawy, Mohamed Tagy, Reem) get the URL and sign up like strangers; their feedback goes to the v2 parking lot.

---

## Migrations register — all blocked on [KAI] `supabase login`, needed by **Aug 1** ⏰

| # | Migration | Serves |
|---|---|---|
| MIG-1 | Resurface cooldown fields (priority-based intervals + settings values) — the parked R4-6 work | item 21 |
| MIG-2 | pg_cron: 30-day compost for dismissed inbox items + trash | item 25 |
| MIG-3 | `search_hybrid` expansion: people, events, projects, journal | item 49 |
| 0030 | `app_settings` PK global-singleton → per-user (a 2nd account could never save) | item 1/3 |
| 0032 | pg_cron 30-day compost | item 25 |
| 0033 | journal `(user_id, entry_date)` UNIQUE dropped → many entries per day | item 47 |
| 0034 | revoke EXECUTE on the cron-only SECURITY DEFINER functions + pin `reload_retainers` search_path | item 4 |

(Journal D-1 needs no migration — `journal_entries` from P7a already fits the model; entry shape is client-side.)

## [KAI] critical path

1. **Aug 1:** `supabase login` on the laptop + `supabase db push` when MIG-1..3 land. *(Was declined-by-Claude before — vault creds stay with Kai; he runs it.)*
2. **By Aug 8 (soft):** seed art for onboarding flowers 3 & 5 — fallback: existing assets, not a blocker.
3. **Aug 5-ish:** paired 30-min session on item 38 (calendar alignment vs Akiflow) — his eye decides what "off" is.
4. **Aug 11–14:** judging time blocked.
5. **Aug 15:** ship call + tester invites.

## Coverage matrix — every punch item has an owner

| Items | Owner |
|---|---|
| 1, 3 | WA-1 |
| 2 | WB-4 (verify) |
| 4, 5 | Hardening |
| 6, 7 | F1 infra + every wave's call sites |
| 8 | F5 (removals) + WB-4 (final sweep) |
| 9 | WA-11/WA-8 (sources) + WB-4 (final sweep); Library literals moot via 65 |
| 10 | F2 + consumers per wave |
| 11, 13, 14, 60, 65 | F5 |
| 12, 29, 59 | F3 (+WB-4 verify) |
| 15, 16 | F6 |
| 17–23 | WA-4 (21 ⇢ MIG-1) |
| 24–26 | WA-5 (25 ⇢ MIG-2) |
| 27, 28, 30, 31 | WA-3 |
| 32–39 | WA-2 (38 ⇢ [KAI] pair) |
| 40–42 | WA-8 |
| 43–45 | WA-9 |
| 46, 48–51 | WA-10 (49 ⇢ MIG-3; 50 ⇢ +WA-7) |
| 47 | WA-7 |
| 52 | WA-11 |
| 53–56 | WA-6 |
| 57 | WB-2 |
| 58 | F7 |
| 61 | F4 infra + WB-1 application |
| 62 | F4 |
| 63, 64 | WB-3 |

All 65 assigned; decisions D-1..D-5 all closed and folded into their items.

## Risks & mitigations

1. **Session quota (account-wide)** — cap 4 concurrent agents, mechanical work to bulk-tier, fresh-session paste prompts to keep the orchestrator context lean.
2. **Blur/zoom root cause unknown (F6)** — time-boxed; if unfixed by Jul 28, options: drop the root `zoom` approach for a rem-based scale, or accept a documented default-90% recommendation. Kai chooses on the findings.
3. **Calendar XL long pole** — starts first, merges last; nothing else touches its folder.
4. **Dedupe assistant on real data (28)** — dry-run preview + explicit confirm; the outbox makes writes reversible but don't rely on it.
5. **Migrations slip past Aug 1** — items 21/25/49 have client work that lands anyway; only the server halves slip. Judgment loop flags them if still unpushed.
6. **Judging churn** — 4 days for a 2-day walk; fix sessions scoped to single Judge lines to avoid regression sprawl.
7. **Multi-session collisions** (it has happened) — worktrees only, never the main checkout; re-check branch tips before merges.
