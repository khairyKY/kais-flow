# OpenDesign package vs. codebase — implementation reconciliation (2026-07-08)

> Companion to `UX-AUDIT-2026-07-08.md` (behavioral audit). This one reconciles the **OpenDesign export** (18 page comps + full design system + complete dark "Night garden" theme, in `design/`) against what the app actually implements. Findings are routed into phases by `research/AKIFLOW-GAP-ANALYSIS.md` — this file is the evidence, not the plan.

**Bottom line:** 12 of 18 comps implemented and mostly faithful · 1 half-built (Settings) · 5 don't exist at all — and the missing five are one cluster: the entire Projects/Areas surface plus Task Detail. The dark theme exists as complete CSS tokens wired to nothing.

## ❌ Not implemented at all (5 pages)

| Comp | What it specifies | What the app has | Routed to |
|---|---|---|---|
| **Task Detail** | Full editor: title, notes, due date+time w/ NL parse, priority 1–4, project, area, content item, reminder, repeat, complete/re-open, delete-with-confirm | Nothing — tasks are immutable after creation (issue #61) | UX Retrofit **step 15** |
| **Projects & Areas** | Dedicated page: domain filter tabs, project cards (hours logged, milestones x/y, target date), Retainers group, Areas group | No `/projects` route; design's nav "Projects" item was replaced by "Activity"; projects = bare CRUD list on Tasks | **P7d** (issue #78) |
| **Project Detail** | Milestones w/ weights + % complete, logged hours, checklist (one-shot/task-linked), work-log + status-update tabs, accent color | Nothing | **P7d** (#78) |
| **New Project / Area** | Full form: Project vs Area, engagement model (Project/Retainer), domain, dates, quoted hours, 11-color accent palette | One-line "New project" input + domain dropdown on Tasks | **P7d** (#78) |
| **New Routine** | Full form: name, description, time-of-day, specific time, per-routine alert, streak goal (ongoing/custom days) | Quick-add + time picker (custom times shipped in UX 6.5e). No description, no per-routine alert, no streak goal | **P7d** (issue #80) |

DB schema is largely ready (`area_id`, reminders, projects with domains in `types.ts`) — these are UI gaps, not data-model gaps.

## ⚠️ Half-implemented

**Settings** — design has three cards: Terrarium ✓ (sidebar popover, matches comps), Push notifications ✓, **Appearance (Theme Light/Dark/Auto, paper-texture slider, botanical-animations toggle) — entirely missing**. `colors.dark.css` fully implements the Night garden tokens and `index.css` has the `[data-theme="night"]` hooks, but **nothing ever sets `data-theme`** — the whole dark theme is shipped dead code. (The Settings page itself is also unreachable — #55.) → Theme switch: night-theme pass (`design/PROMPTS.md` § D, issue #79); Appearance card: **P6 Settings step**; reachability: UX Retrofit **step 12**.

## ✅ Implemented, with fidelity gaps (routed via issue #81 unless noted)

- **Sign in** — faithful, but "Send reset link" / "Create your workspace" links missing → lockout risk. Reset link → UX **step 12**.
- **Command Bar** — parse incl. `#tag`→project chip ✓. Date chip shows raw `7/9/2026, 3:00:00 PM` vs design's "Tue 7 Jul · 3:00 PM" (#71) → UX **step 14**.
- **Search** — groups + inbox deep-link ✓. Missing: ↑↓/↵ keyboard nav (footer even promises it in the design), metadata lines (project · due) under hits → UX **step 14**.
- **Tasks** — matches (incl. the domains/merge admin panel — it IS in the design; relocation to Settings still worthwhile, #66 → P6). Missing: **completed-tasks row** ("✓ … a petal fell") — no completed view at all (#60) → UX **step 13**; scheduled-time chips hidden (#62) → **step 14**; one-click "snooze 1d" vs buried menu — superseded by SnoozeMenu, accept deviation.
- **Today v3** — Goal, Slipping, Resurfacing all wired but render nothing without data; Goal starved by Top-3-excludes-overdue (#67) → UX **step 13**. Needs-review category chips (Own/Reading/Meeting/Brainstorm) vs File→task/Dismiss → decide at design level with **P7a** (file-as-note lands there).
- **Calendar** — grid, all-day row, task rail ✓. Business-hours window vs 24h-from-midnight (#63) → **step 14**; recurring ↻ glyph not rendered → **step 14**; rail language ("Unscheduled … drag to block") vs "Scope" — accept ours.
- **Morning/Evening Ritual, Chat, Inbox, Review, Routines** — faithful (sparkline is 14-day vs design's 30 — accept). Chat citation labels/dedupe = #59 → **step 12**. Inbox note-action gap is a gap in the *design* too → P7a decision.
