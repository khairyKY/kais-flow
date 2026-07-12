# Akiflow Gap Analysis — dedup & routing (2026-07-08)

> **What this is:** the decision layer between the research (`AKIFLOW-WIKI.md`, the benchmark; `akiflow-deep-research-report.md`, raw synthesis) and the build plan. Every wiki feature gets exactly one verdict so nothing is built twice and nothing falls through. Evidence for the design-side gaps: `../DESIGN-RECONCILIATION-2026-07-08.md`. Behavioral evidence: `../UX-AUDIT-2026-07-08.md` (issues #55–#76).
>
> **Adaptation rule (Kai's direction):** we take the *concept, logic, smoothness, and ease of use* — never the UI verbatim. Every adapted surface is built from our own design system (`docs/DESIGN_SYSTEM.md` + comps in `design/`), so it reads as Kai's Flow, not an Akiflow clone.
>
> **Verdicts:** ✅ built · 🟡 partial (gap routed) · 📋 already planned (phase named) · ➕ new (routed by this replan) · ⛔ skipped (reason given).

## §1 The Method

The 5-step loop (Capture → Prioritize → Plan → Execute → Review) is already the app's spine: command bar/inbox → triage → calendar time-blocking → today/focus → rituals. Nothing to build; P7e's parity audit should check the *loop* end-to-end, not just feature nouns.

## §2.1 Universal Inbox

| Feature | Verdict | Where |
|---|---|---|
| Single triage view | ✅ | P2 |
| Auto-import from external tools | 📋 | P6 (GitHub) → P9 (Telegram/Notion/Obsidian/gcal) |
| One-key inbox-zero triage (E/P/Someday) | ✅ | UX step 6 (`f`/`d`/`x`/`s`) |
| Two-way sync back to source | 📋 | P6 read-only first; write-back opt-in later (P6 Out) |
| Bulk triage in inbox | ➕ | P8 odds (flagged in #40's closing comment) |

## §2.2 Command Bar

| Feature | Verdict | Where |
|---|---|---|
| OS-global summon | ⛔ | No Electron (hard rule); optional AHK snippet PLAN.md App. B |
| NL parsing (dates, recurrence) | ✅ | P1/P2 (chrono + AI) |
| `#` project · `!` priority · duration | ✅ | steps 6.5/9/11e (`30m`/`1h` is our duration grammar — keep it, don't add `=`) |
| `<` deadline vs scheduled split | ✅ | Schema already separates `due_at` vs `scheduled_start`; dates parse to due |
| `*` tags/labels | ➕ | **P6 step 5** — `labels` column exists, dead in UI; syntax + chips + filters land together |
| `//` description | ➕ | **UX step 15** (with Task Detail notes UI) |
| `\|` calendar · `@` guests | ⛔ | One calendar, single-player |
| `>` assign to time slot | 📋 | P9 (Time Slots) |
| ESC removes a recognized token | ➕ | **UX step 14** |
| Capture-from-page with backlink | 📋 | P6 external capture endpoint |
| Palette navigation (go to any view/project) | ➕ | **UX step 14** (`g` go-to palette — capture bar stays capture-only) |

## §2.3 Keyboard map

| Feature | Verdict | Where |
|---|---|---|
| List/task keys (j/k, e, s, t, p, x, #, 1/2/3, n, ?) | ✅ | UX steps 6/6.5/7 |
| Single-key nav `i`/`t`/`u` + `g` go-to + bare `/` search | ➕ | **UX step 14** |
| Plan (`P`) / Goal (`H`) | ✅ | Equivalents: ScheduleMenu + `1/2/3`; `t` top-3 |
| Undo (⌘Z) | ➕ | **UX step 13** (rides the undo-toast layer) |
| Calendar keys (`d`/`w`/`m`, `-`/`=` period, today) | ➕ | **UX step 14** |
| Focus (`F`) | 📋 | P8 |
| Customizable shortcuts | ⛔ | YAGNI single-user; keymap is already data-driven |
| Duplicate / copy-titles / 2nd time zone | ⛔ | Revisit only if Kai misses them |

## §2.4 Calendar & time-blocking

| Feature | Verdict | Where |
|---|---|---|
| Day / N-day / Week / Month views | ✅ | Steps 8 + 11a |
| Drag-to-schedule · inline resize | ✅ | Resize writes `duration_min` back — better than Akiflow |
| Multi-account overlays · calendar locking (busy push) | 📋 | P9 (gcal, invisible background sync only) |
| Custom event colors | ✅ | #47 |
| Per-task reminders | ✅ | Areas retrofit |
| Per-event reminders | ➕ | P8 odds (small) |
| Conflict detection | ⛔ | Personal scale; overlap is visible on the grid |
| Secondary time zones | ⛔ | Cairo-only life |
| Schedule Optimizer | 📋 | P9 (#46) |
| Opens at now / business-hours window | ➕ | **UX step 14** (#63) |
| "Now" line | ✅ | `nowIndicator` on |
| Donut time-budget widget (scheduled vs free today) | ➕ | P8 odds |
| Calendar view-options popover (1–6/W/M · density · weekends · done-tasks) | ➕ | **UX step 17b** (Kai's 2026-07-09 screenshots, `../KAI-AUDIT-2026-07-09.md`; 1–6/W/M consolidates shipped 11a) |
| Declined-events toggle | 📋 | P9 — meaningless until gcal sync exists |
| Unscheduled-tasks tray under the grid | 🟡 | Rail is already unscheduled-only → **UX step 17e** (labeling + board tray) |

## §2.5 Tasks

| Feature | Verdict | Where |
|---|---|---|
| Rich task object (notes, priority, duration, links…) | 🟡 | Schema ✅ (`notes`, `labels` exist, no UI) → **UX step 15 Task Detail** closes it; source links ride P6 backlinks |
| Editable tasks at all (#61) | ➕ | **UX step 15** — the single biggest hole |
| Subtasks | 📋 | P8 (#41) |
| Recurring · bulk actions · daily goals (top-3/goal) | ✅ | P4 / step 7 / P4+Today |
| Time-usage analytics / task history | 📋 | P7d time tracking |
| Task countdown in a slot / focus timer | 📋 | P8 (wiki v2.77: focus timer in command bar — note for the P8 file) |

## §2.6 Rituals

| Feature | Verdict | Where |
|---|---|---|
| Morning planning / evening shutdown (sweep, roll-forward) | ✅ | P4 |
| Weekly Review | ✅ | C4, shipped early |
| Weekly *Planning* beats (weekly goals, pull from Someday/Month into week) + rate-the-week | ➕ | P8 odds ("Weekly Planning upgrade") |
| Configurable ritual reminder times | ➕ | **P6 Settings step** (notify infra exists) |
| Wizard full-screen feel | ⛔ | Rituals are already dedicated pages; route transitions land in Motion |

## §2.7–§2.14 (the rest)

| Feature | Verdict | Where |
|---|---|---|
| Time Slots + booking links | 📋 | P9 (#45, C9) |
| Focus Mode | 📋 | P8 |
| Someday + Time Frames | ✅ | Step 4 (#43) |
| Upcoming granularity (Overview·D·W·M columns) + board view options (compact · show done · sort · project filter) | ➕ | **UX step 17c/17d** (2026-07-09 screenshots) |
| Labels/tags UI + color-coding | ➕ | **P6 step 5** (also adds the board's Filter-by-Tags row, deferred from UX 17d) |
| Smart Tags (AI auto-bucket) | ✅ | AI capture already assigns domain/project |
| Projects + sections | 🟡 | Projects ✅; sections ⛔ (areas+projects suffice) |
| Tray/menu-bar app | ⛔ | No Electron; PWA push covers the nudge job |
| Meeting alerts + Join button | ⛔ | Not meeting-driven; per-task reminders cover; revisit on request |
| Universal search | ✅ | P5 (+ fidelity gaps → **UX step 14**) |
| Aki chat | ✅ | P5 (citation leak #59 → **UX step 12**) |
| Voice capture | 🟡 | Built in P2, currently a silent no-op (#68) → **UX step 12** |
| Daily briefing | 🟡 | P4 digest push exists; leave until Kai asks for more |
| Meeting transcription assistant | ⛔ | $0 + privacy rules; transcripts of Kai's life ≠ Groq batch budget |
| Offline + cross-device sync | ✅ | Outbox + IndexedDB + realtime |
| Mobile parity | 🟡 | PWA responsive by design; Akiflow's weakness is our standing check at 375px |

## §3 Integrations

GitHub → P6 (planned). Telegram/Notion/Obsidian/gcal → P9 (planned). Everything else ⛔ until Kai names a tool he actually uses — the P6 external-capture webhook endpoint is the generic escape hatch (Akiflow's Zapier equivalent, $0). Wiki's sentiment lesson (§6 "overwhelm — piping everything into one list creates anxiety"): P6's read-only, scoped-repo guardrails already encode this; keep them.

## §4 Developer surface / MCP

➕ **P10**: a hosted **Kai's Flow MCP server** (Supabase edge function, OAuth-authed) exposing create/edit/plan tasks, query schedule, search — Akiflow's own pivot validates P10's Connector-SDK bet. Note added to the P10 prompt; spec written when P10 is reached.

## §8 UI/UX design language

| Pattern | Verdict | Where |
|---|---|---|
| Three-pane layout | ✅ adapted | Sidebar + content + calendar's scope-able rail (step 8) — ours, deliberately |
| Command bar modal, tokens highlighted live | ✅ | Live chips (step 9) |
| Snackbars/toasts confirming every action | ➕ | **UX step 13** (states) + Motion step 2 (slide) |
| Undo instead of confirm | ➕ | **UX step 13** (#60/#76) |
| Six-dot drag grip on hover | ➕ | **Motion step 2** |
| Source-app icons on cards | ➕ | P6 step 4 (with GitHub items) |
| Inline resize commits live | ✅ | Step 2 |
| Dark mode deep-grey (~#121212), not black | ✅ designed | Night garden tokens exist, unwired → § D pass (#79) + Appearance card in P6 Settings |

## What got injected where (routing summary)

- **UX Retrofit steps 12–15** (same Prompt UX paste): 12 = P0 repair batch (#55–#59, voice #68, sign-in reset link, code health #73/#74/#75) · 13 = feedback layer (toast+undo everywhere, completed/dismissed views, space unbind, ritual feedback #67; #60/#76) · 14 = one grammar + one taxonomy + keyboard v2 + fidelity (#62–#65, #69–#72 parts, ESC token, go-to palette, calendar comfort) · 15 = **Task Detail** (C1 comp; closes #61; `//` syntax).
- **UX Retrofit step 17** *(added 2026-07-09, Kai's view-options screenshots — `../KAI-AUDIT-2026-07-09.md`, same Prompt UX paste)*: calendar view-options popover + board Overview/D/W/M granularity + board view options + "Not scheduled" tray; one `view_prefs` jsonb migration. Secondary TZ stays skipped; declined events → P9; Tags filter → P6 step 5.
- **Motion Retrofit**: drag grips, undo-toast choreography, Task-Detail panel entry, completed-row petal (amendments in place).
- **P6**: labels UI + `*` syntax (step 5) · full Settings page incl. Appearance card, ritual reminder times, relocated admin console #66 (new step 6) · external capture endpoint (new step 7) · source icons (step 4).
- **P7**: Projects/Areas surface — 4 comp pages (#78) + New Routine full form (#80) explicit in 7d · file-as-note inbox action noted in 7a (#70's other half).
- **P8** (file written when reached — prompt updated): subtasks #41, Matrix, Focus + focus timer, weekly-planning upgrade, donut widget, per-event reminders, inbox multi-select, task countdown.
- **P9/P10**: unchanged scope; P10 gains the MCP-server note.
- **Skipped for good** (don't re-litigate): OS-global hotkey, tray app, guests, multi-calendar `\|`, secondary time zones, conflict detection, customizable shortcuts, meeting transcription, sections, per-seat/teams anything, pricing-page features. Reasons inline above; all trace to the $0/light/single-player hard rules.

**Parity audit note:** P7e's audit now benchmarks against `AKIFLOW-WIKI.md` §2–§3 feature-for-feature (and this file's verdicts), not just PLAN.md §3's noun matrix — the 2026-07-08 audit proved nouns lie.
