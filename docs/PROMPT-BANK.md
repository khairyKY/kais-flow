# The Prompt Bank — one paste-ready prompt per unit of work

> **If you are ever lost, paste Prompt 0.** It tells you which prompt to paste next.
>
> How this file works: one prompt = one fresh session's first message. Phase prompts are **resumable** — paste the same phase prompt every session until the ROADMAP flips that phase to done; each session finds the next unfinished step by itself. Every prompt starts by verifying the ROADMAP so pasting the *wrong* prompt is harmless: the session stops and redirects you instead of building out of order.
>
> Rules live where they live — phase specs in `docs/phases/`, the design system in `docs/DESIGN_SYSTEM.md` (entry point) + `design/SKILL.md` + `docs/phases/P-DESIGN.md`, per-screen UI prompts in `design/PROMPTS.md`. This file only routes; it never restates a rule, so it can't go stale.

## The queue (mirrors ROADMAP order — check `docs/ROADMAP.md` for live status)

| Order | Work | Prompt |
|---|---|---|
| — | Lost / unsure what's next | **Prompt 0** below |
| now | Botanical Integration — design export → live UI (teardown + rebuild, all screens) | **Prompt GO** in `design-integration/PROMPT-BANK.md` |
| paused | UX Retrofit — remaining *visual* steps superseded by the integration (data/logic stands — see ROADMAP) | **Prompt UX** below |
| next | Motion Retrofit — buttery & botanical (animations, flower theme, polish debt) | **Prompt MOTION** below |
| then | Night theme (UI-only, no feature) | paste `design/PROMPTS.md` § D directly |
| then | P6 Integrations (GitHub → inbox, Settings UI, external capture) | **Prompt P6** below |
| then | P7 Life-OS (Projects, Review, People, Books, review queue, checklists) | **Prompt P7** below |
| then | P8 Matrix & Focus + subtasks (1.0 gate) | **Prompt P8** below |
| then | P9 Integrations v2 (Telegram, Notion, Obsidian, gcal, booking, optimizer) | **Prompt P9** below |
| then | P10 Connector SDK | **Prompt P10** below |

Done and out of the queue: P0–P5, the botanical skin A1–B6 + audit (logged in `P-DESIGN.md` §8), calendar context menus (#49), Areas/reminders/notifications Retrofit (built — needs the commit above). The old P5.5 design-debt batch was **superseded 2026-07-08**: its routine-stats item moved into the UX Retrofit, everything else into the Motion Retrofit step 1.

**2026-07-08 research replan:** the Akiflow benchmark + feature-by-feature dedup/routing live in `docs/research/AKIFLOW-GAP-ANALYSIS.md`. The phases above already carry all the injected work (UX steps 12–15, Motion amendments, P6 steps 5–7, P7d's Projects cluster) — no new prompt exists and none is needed; the queue and every paste stay exactly as listed.

---

## Prompt 0 — "What do I run next?"

```
For the Kai's Flow project: read docs/ROADMAP.md, docs/PROMPT-BANK.md, and
docs/phases/P-DESIGN.md §8 (the deviations log). Then tell me exactly which
ONE prompt from PROMPT-BANK.md (or design/PROMPTS.md) I should paste into a
fresh session next, and why, in three sentences or less. Also list anything
uncommitted or unlogged that needs my attention first. Do not write any code.
```

## Prompt COMMIT-CHECK — verify the uncommitted Retrofit work, then Kai commits

```
For the Kai's Flow project: the Retrofit phase (Areas, reminders,
notification history) is marked done in docs/ROADMAP.md but its changes are
still uncommitted in the working tree. Read docs/phases/P1-P4-retrofit.md,
then run `git status` and `git diff`, and check every changed/untracked
file belongs to that phase's Files list (plus its docs/migrations). Run
`cd app && npm run build` and `npx vitest run`. Report: files that belong,
files that don't (and what they are), build/test results, and a suggested
commit message. STOP there — I commit myself, you don't.
```

## Prompt UX — current phase: UX Retrofit (Akiflow core)

```
For the Kai's Flow project: we are building the UX Retrofit. First read
docs/ROADMAP.md — if the current phase is not "UX Retrofit — Akiflow Core",
STOP and tell me which PROMPT-BANK.md prompt to paste instead. Then read
docs/phases/UX-retrofit.md FULLY and follow the CLAUDE.md session workflow.
Find the first unfinished step (phase-file Notes section + acceptance
checklist) and execute from there, in order. Stop and ask me for any [KAI]
step.

Most of this phase's surfaces have no mockup — that is intended. Build
every such UI element (smart-list nav, snooze menu, bulk bar, cheatsheet
overlay, month view, planning board, the step 12–14 repair/feedback/
coherence work) straight from docs/DESIGN_SYSTEM.md (§4 recipe) +
design/SKILL.md + P-DESIGN.md §3–§4 rules: semantic tokens only, never raw
hex, mono metadata, one terra CTA per view. The Someday step additionally
follows SCREENS-PART-TWO.md § "Someday view" and the intent of
design/PROMPTS.md § C7 (pulled forward from P6). **Exception: step 15,
Task Detail, DOES have a mockup** (design/Task Detail.dc.html +
design/PROMPTS.md § C1) — build it from that comp, adapted to app idioms,
not invented from the recipe. Defer all animation work to the Motion
Retrofit — build the states, not the choreography.

Stop at the phase file's natural checkpoint or after a completed step with
its acceptance evidence — do not rush multiple risky steps. Before
stopping: update ROADMAP status if the phase state changed, log deviations
in the phase file's Notes, keep DATA_MODEL.md in sync with any migration,
close shipped GitHub issues (#39, #40, #42, #43 live here now). Never
start the next phase.
```

## Prompt MOTION — Motion Retrofit (buttery & botanical)

```
For the Kai's Flow project: we are building the Motion Retrofit. First read
docs/ROADMAP.md — if the current phase is not "Motion Retrofit — Buttery &
Botanical", STOP and tell me which PROMPT-BANK.md prompt to paste instead.
Then read docs/phases/MOTION-retrofit.md FULLY and follow the CLAUDE.md
session workflow. Find the first unfinished step (Notes + acceptance
checklist) and execute from there, in order.

The binding blueprint is design/tokens/motion-interactions.css and the
motion vocabulary is docs/DESIGN_SYSTEM.md §3 — port bindings to real app
classes, don't invent new timings. Hard rules: zero new dependencies (CSS +
native View Transitions only), transform/opacity only (never animate
layout), prefers-reduced-motion fully respected, ≤2 continuous animations
per screen, night-only motion (fireflies/stars) stays out — that's
design/PROMPTS.md § D later. No behavior, schema, or route changes.

Stop after a completed step with its acceptance evidence (the performance
gate step requires an actual DevTools trace summary in Notes). Before
stopping: update ROADMAP status if the phase state changed, log deviations
in the phase file's Notes. Never start the next phase.
```

## Prompt P6 — Integrations (GitHub first)

```
For the Kai's Flow project: we are building P6. First read docs/ROADMAP.md —
if the current phase is not P6, STOP and tell me which PROMPT-BANK.md prompt
to paste instead. Then read docs/phases/P6-integrations.md FULLY and follow
the CLAUDE.md session workflow. Find the first unfinished step (Notes +
checklist + GitHub milestone issues) and execute in order. Stop and ask me
for any [KAI] step (GitHub PAT, dashboard clicks — secrets go in Supabase
edge-function secrets / integrations table, NEVER client code).

Note: the Someday bucket (old step 6, issue #43) was pulled forward into
the UX Retrofit — skip it here if the phase file still lists it, and log
the skip in Notes. Settings UI + external capture (steps 6–7) have no
single mockup: build from their SCREENS-PART-TWO.md blocks + the
design/Settings.dc.html comp + docs/DESIGN_SYSTEM.md + P-DESIGN.md rules
(tokens only, never raw hex).

Stop after a completed step with acceptance evidence. Before stopping:
update ROADMAP, phase Notes, DATA_MODEL.md for migrations, close shipped
issues. Never start the next phase.
```

## Prompt P7 — Life-OS completion (7a–7e)

```
For the Kai's Flow project: we are building P7. First read docs/ROADMAP.md —
if the current phase is not P7, STOP and tell me which PROMPT-BANK.md prompt
to paste instead. Then read docs/phases/P7-life-os.md FULLY and follow the
CLAUDE.md session workflow. Find the first unfinished sub-phase/step (Notes
+ checklist + GitHub milestone issues) and execute in order. Stop and ask
me for any [KAI] step.

UI is built WITH the feature, straight from the mockups:
- Projects / Project Detail / New Project → design/PROMPTS.md § C2 (#78)
- New Routine full form → design/PROMPTS.md § C3 (#80)
- People CRM → design/PROMPTS.md § C5
- Books / review queue / checklist modes have NO mockup: build from their
  SCREENS-PART-TWO.md blocks + docs/DESIGN_SYSTEM.md + design/SKILL.md.
(Weekly Review C4 already shipped early — see P-DESIGN.md §8.)

Privacy rule is hard here: journal/health/personal content goes through
Groq only. Stop after a completed step with acceptance evidence; update
ROADMAP, phase Notes, DATA_MODEL.md; close shipped issues. Never start the
next phase.
```

## Prompt P8 — Matrix & Focus + subtasks (1.0 gate)

```
For the Kai's Flow project: we are building P8. First read docs/ROADMAP.md —
if the current phase is not P8, STOP and tell me which PROMPT-BANK.md prompt
to paste instead. Then read docs/phases/P8-matrix-focus.md FULLY (write it
first with me if it doesn't exist yet — most of the old "Akiflow UX bundle"
shipped in the UX Retrofit: #38 context menus, #39 keyboard map, #40 bulk
actions, #42 month/planning views, #43 Someday are DONE; what remains here
is #41 subtasks (tasks.parent_id, depth 1) plus the Matrix and Focus
views, plus the Akiflow odds routed by docs/research/AKIFLOW-GAP-ANALYSIS.md:
focus timer, weekly-planning ritual upgrade, donut time-budget widget,
per-event reminders, inbox multi-select). Follow the CLAUDE.md session
workflow; Matrix/Focus screens have no
mockup: build from SCREENS-PART-TWO.md + docs/DESIGN_SYSTEM.md +
design/SKILL.md.

Stop after one completed work item with acceptance evidence; update
ROADMAP, phase Notes, DATA_MODEL.md for the parent_id migration when it
lands; close the item's issue. Never start the next phase. Reminder: P8
shipping + P7's parity checkpoint = 1.0 — run the Akiflow-parity audit and
cancel-Akiflow check at the end.
```

## Prompt P9 — Integrations v2

```
For the Kai's Flow project: we are building P9. First read docs/ROADMAP.md —
if the current phase is not P9, STOP and tell me which PROMPT-BANK.md prompt
to paste instead. Then read docs/phases/P9-integrations-v2.md FULLY and
follow the CLAUDE.md session workflow. Find the first unfinished step
(Notes + checklist + GitHub milestone issues) and execute in order. Stop
and ask me for any [KAI] step (bot tokens, OAuth apps — secrets stay
server-side, $0 rule holds, never embed Google UI).

UI is built WITH the feature:
- Time Slots public booking page (issue #45) → design/PROMPTS.md § C9
- AI Schedule Optimizer preview (issue #46) → design/PROMPTS.md § C10
- Telegram/Notion/Obsidian/gcal surfaces have no mockup: SCREENS-PART-TWO
  blocks + docs/DESIGN_SYSTEM.md + P-DESIGN.md rules.

Stop after a completed step with acceptance evidence; update ROADMAP,
phase Notes, DATA_MODEL.md; close shipped issues. Never start the next
phase.
```

## Prompt P10 — Connector SDK

```
For the Kai's Flow project: we are building P10. First read docs/ROADMAP.md —
if the current phase is not P10, STOP and tell me which PROMPT-BANK.md
prompt to paste instead. Then read docs/phases/P10-connector-sdk.md FULLY
(write it first with me if it doesn't exist yet — the 2026-07-08 gap
analysis routes one headline item here: a Kai's Flow MCP server, an
edge function exposing tasks/calendar/search to AI clients, Akiflow's own
2026 pivot) and follow the CLAUDE.md session workflow. Find the first
unfinished step
(Notes + checklist + GitHub milestone issues) and execute in order. Any UI
surface follows docs/DESIGN_SYSTEM.md + P-DESIGN.md rules (tokens only,
never raw hex) and its SCREENS-PART-TWO.md block if one exists. Stop after
a completed step with acceptance evidence; update ROADMAP, phase Notes,
DATA_MODEL.md; close shipped issues.
```
