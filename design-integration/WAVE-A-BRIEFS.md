# Wave A — what each workstream was actually told to do

> **Why this file exists:** the Wave A table in `V1-PLAN.md` gives each workstream one row; the real dispatch instructions lived only in the orchestrator's conversation. Kai asked to read them (2026-07-27), and he's right that he should be able to — when something looks odd during judging, the question is always *"what was this worker told?"*. This is that record, written after the fact from the dispatches actually sent.
>
> **Naming:** "WA-*n*" is a workstream ID from `V1-PLAN.md`, not a person or a file. Each ran as one agent in its own git worktree, owning one feature folder, merged by the orchestrator after review.
> **Every brief also carried:** read `briefs/_SHARED.md` first (freeze list + what Foundation provides) · your punch items' **Judge:** lines are your acceptance test, run them yourself · use `toastUndo` for anything completing/destructive · never touch a frozen file (report the patch instead) · `tsc -b` + `vitest` + `build` must be green · don't commit to the integration branch, don't merge.

---

## WA-1 — Public gate (sign-up + onboarding) · MERGED `ea47a1d`
**Owned:** `features/auth/`, `features/onboarding/` · **Punch:** 1, 3
- Build the sign-up path (Supabase `signUp`, email verification), calm failure copy, "check your email" state in the app's voice.
- Make onboarding run **once per account** — verify the completion flag is server-side, not localStorage (so a new device doesn't re-run it and a fresh account does), and re-openable from Settings.
- **Found beyond the brief:** `app_settings` had a *global singleton* primary key — one row for the whole table, so a second account could never save anything and onboarding re-ran forever. Migration `0030` moves the key to `user_id`. **Needs `supabase db push`.**

## WA-2 — Calendar (the XL long pole) · MERGED `3c23927`
**Owned:** `features/calendar/` · **Punch:** 32–39 · **Contract:** `briefs/contracts/WA2-calendar-contracts.md`
- **32** View-options popover merging the export's design (Density, Week starts, weekends/completed/declined, 24-hour) with Kai's Akiflow ruling (the 1–6/W/M view row), replacing the N-day cycler; controls that have no real backing must not render; kill text-selection.
- **33** Drag a scheduled block back to the Unscheduled rail to unschedule · **34** Reach task details from a block · **35** Drop-feedback trio (invalid-drop shake, 30-min resize clamp, top-edge resize) · **36** All-day ↔ timed drag conversion, persisted · **37** Edge auto-scroll while dragging · **38** Bounded alignment pass vs the Akiflow reference · **39** Daisy day headers (past/today-by-clock/future).
- Undo on every calendar mutation.

## WA-3 — Tasks · MERGED `c80a4bf`
**Owned:** `features/tasks/`, Perennials page, `features/import/` · **Punch:** 27, 28, 30, 31
- **27** The **All** tab — every open task including undated project filings (their landing).
- **28** Recurring-import dedupe assistant for the 76×"Shower + breakfast" problem: cluster by normalised title, guess cadence from date spacing, **dry-run preview first, per-cluster confirm, nothing auto-merges**, deletions reversible through the outbox.
- **30** Organize rail: centred header, un-clipped Projects sticky · **31** Perennials "Edit rule" opens the themed Repeat menu, not a native select.

## WA-4 — Today · MERGED `81f139d`
**Owned:** `features/today/`, `resurfacing/`, `slipping/` · **Punch:** 17–23
- **17** Cap "All open" at 50 + "View all →" · **18** overdue/due/↻ row meta · **19** click-away deselect · **20** all slipping cards stacked with their **real** wisteria stage (it was hardcoded p20) + undo on reviewed.
- **21** Resurface cooldowns by priority (high ~2d / med ~5d / low ~10d), tunable, reading `kf.resurfaceCooldown.*` — client-side until MIG-1 lands.
- **22** chip font-size bug, terra hover on "Open calendar →", voice-button states · **23** one day-complete celebration (shared module; Tasks' duplicate points at it).

## WA-5 — Inbox + Capture · MERGED `5391243`
**Owned:** `features/inbox/`, `capture/`, new migrations, PWA manifest · **Punch:** 7, 24, 25, 26
- **7** Destination feedback: filing says *where it went* ("Filed to Shaheen website · Today — Undo"), undo on every triage path.
- **24** Android share-target (manifest member + `/share` route) — it was a simulated capability · **25** 30-day compost cron (`0032`) so the "auto-clears after 30 days" copy is true · **26** triage keys match the strip.
- **Found beyond the brief:** manual filing never passed the AI's parsed due date through, so every filed task landed dateless despite the card promising a time. Fixed at the source.

## WA-6 — Settings · MERGED `527c56d` (finished inline by the orchestrator after a session-limit cutoff)
**Owned:** `features/settings/` · **Punch:** 53, 54, 55, 56 + the sliders half of 21
- **53** Paper-texture slider made real (CSS variable + pre-paint application) · **55** Accent row removed per D-3 · **56** animations toggle reads the stored flag instead of conflating it with OS reduced-motion, plus an honest caption when the OS overrides, and it exists on mobile.
- **54** Every row functional or hidden: Capture API card hidden, Integrations de-duplicated, dead Connect buttons → disabled "Soon" chips, push section explained.
- **21** The resurfacing cooldown sliders writing the keys Today's engine reads.

## WA-7 — Journal · IN FLIGHT
**Owned:** `features/journal/` · **Punch:** 47 · **Spec:** decision **D-1**
- Kai's ruling is the spec: **one daily page · unlimited timestamped entries within the day · delete → Trash (restorable) · titled standalone notes are v2/Library, not here.**
- The page is already a faithful transcription of the design, so this is a **model** change, not a re-skin.
- Also: "+ New entry" must actually add an entry (it was decorative — Kai: *"what's the point of having a new entry button if I can't have multiple entries?"*); fern stage on desktop; "Day N" should count days, not entries; the evening ritual's one-line write must keep working; report the un-comment patches to restore the nav rows (frozen files).

## WA-8 — Projects · MERGED `f5a7fca`
**Owned:** `features/projects/` · **Punch:** 40, 41, 42 · **Contract:** `briefs/contracts/WA8-projects-list-contract.md`
- **40** The "edit" chip must **edit** — it was wired to delete. Deletion gets its own control behind a confirm.
- **41** List view rebuilt verbatim against the contract (board + detail already accepted).
- **42** Project-detail open tasks get full parity (bulk select, right-click, schedule) by importing the real TaskRow rather than forking it; month-windowed stats; retainer literals gone.
- **Judging note:** it restyled "+ New area" to the export's bone fill, which differs from R4-33a's outlined styling — but it also split the crowded header into two rows, which is what Kai's *"four big pills"* complaint was actually about. Eyeball at judging.

## WA-9 — Rituals · Routines · Review · MERGED `1e3f2b5`
**Owned:** `features/rituals/`, `features/routines/` · **Punch:** 43, 44, 45
- **43** Evening ritual per **D-2**: keep the 4-beat closing flow, fold "sweep today" in as beat 1 using the export's 1e copy verbatim; "One line" must genuinely land in the Journal; morning `skip` must stop counting the step as done.
- **44** **One** streak algorithm — the row flame and the trellis header must agree, thresholds from the shared module (lush = 30 days), and today's check draws today's leaf.
- **45** Review sweep persists across reloads (via the activity log) and gains the real per-project verdict rows (still moving / park it / needs a look / reviewed) + the loose-tasks row; flourish fires on completion, not on mount.

## WA-10 — People · Activity · Search · Trash · Herbarium · MERGED `63b24f1`
**Owned:** those five feature folders · **Punch:** 46, 48, 49, 50, 51
- **46** People's `later` nudge chip actually snoozes · **48** Activity rows navigate to their source + Projects filter chip + honest range label · **49** search covers people/events/projects/journal (migration `0031`, with graceful degradation until it's pushed) + working chips · **50** Trash reachable (Settings + sidebar) with a "Jump there →" restore toast · **51** Herbarium presses **then** archives.
- **Found beyond the brief:** several `security definer` database functions never had permissions revoked — a cross-tenant exposure. Recorded for punch 4 (public-safety pass).

## WA-11 — Focus · MERGED `9f3efdd`
**Owned:** `features/focus/` · **Punch:** 52 + the Focus half of 9
- Every design **sample literal** replaced with real data or hidden: the session strip's block time, "session 2 of 3", the subtask fallback, the stopwatch's projected hours, the garden's People caption, and a stopwatch clock literal it found on its own.
- The settings icon becomes a gear (Kai: *"the setting icon for the focus page looks like a sun"*), the round counter verified against real state, the garden CTA reaches the evening ritual.
- **Mid-flight scope change:** it was told to delete the chime toggle (sounds were cut); when Kai un-cut sounds, it was redirected to keep the toggle and wire it to the new synthesised engine instead.
- **Found beyond the brief:** the sun icon Kai saw is in the *shell's* footer, a frozen file — reported rather than touched, then patched by the orchestrator.

## WA-12 — Sound · MERGED `67c1850` (orchestrator, not an agent)
Added after Kai un-cut sounds on 2026-07-26. Six voices **synthesised in the Web Audio API** (no audio files — the only way it fits $0 + "light"), master + whisper↔full meter, per-row previews, quiet hours after the garden closes. Wired to task check, the evening ritual's line, and Focus's round end. Punch **54b**.

---

## Foundation (F1–F7) — the serial batch before any of the above
Ran first, orchestrator-owned, then **frozen** so parallel agents couldn't collide: **F1** undo system · **F2** one growth-stage threshold module · **F3** keyboard truth + the ⌘K view-jump (D-5) · **F4** motion primitives (route cut per D-4, overlay exits, list breathing, spec check-pop, corrected ease curve) · **F5** mechanical batch (escapes, calm copy, topbar, ConfirmCard everywhere, v1 removals) · **F6** the blur/zoom root cause · **F7** collapsed-rail icon set.

## Operational notes worth keeping
- **Worktrees spawned on stale history.** Several agents came up on a July-7 commit instead of the integration branch; every brief now opens with a mandatory `git log` check and reset. Worth keeping in any future dispatch.
- **The account session limit kills every agent at once, mid-edit.** It happened on 2026-07-26 and took out four workstreams simultaneously. Nothing was lost because their worktrees keep uncommitted work — the recovery is: commit the WIP inside each worktree, merge one at a time, finish the incomplete ones by hand, verify after each. Later briefs ask agents to commit per item so the salvage is cleaner.
