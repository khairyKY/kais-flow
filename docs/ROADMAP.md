# Kai's Flow — Roadmap & Build Status

> **Single source of truth for "where are we".** Update the status column after every working session. Parity rows refer to the feature parity matrix in `PLAN.md` §3.

## ➤ Current phase: **Retrofit — Areas, Reminders & Notification History** (not started)

**P0 through P5 are done.** Live at **https://kais-flow.kaidagoat.workers.dev**. P5 shipped FTS + pgvector embeddings infrastructure (`search_tsv` generated columns + gte-small `embedding vector(384)` on `tasks`/`inbox_items`, insert/update-triggered `embed_queue`, `search_hybrid` RRF retrieval), the `embed`/`chat`/`search` edge functions (Supabase.ai for embeddings — Groq has no embeddings API — Groq streaming SSE for chat), a chat slide-over panel with progressive streaming + linked citations, a dedicated Search UI (addendum §11, no LLM round-trip), and daily resurfacing (weighted-random pick over `tasks`/`inbox_items`, pure-SQL `do_resurface()` cron, card on Today with convert/review-later/dismiss actions). Also applied the plan addendum's P5 amendment (§11): a dedicated keyword/semantic Search UI, since the phase file's original scope only wired retrieval into chat.

Found and fixed two real bugs along the way, both against live behavior, not assumed: (1) Postgres rejects `WHEN tg_op = 'INSERT'` in a trigger whose event set includes INSERT (OLD doesn't exist for that event) — split into separate INSERT/UPDATE triggers per table; (2) a serious regression discovered via live UI testing — `search_tsv` (new `generated always as (...) stored` column) comes back on every `select('*')`, and this app's entire write pattern is "spread a fetched row, change a field, re-upsert the full object" (used by every mutation across P1–P4, not just P5) — Postgres 400s on any such write once the row carries a generated column. Fixed at the root in the one shared `lib/outbox.ts` `writeRow` helper (strips `search_tsv` before every network write), verified live end-to-end afterward (task-complete, inbox-file, resurfaced-log actions all confirmed landing in the DB post-fix). See `phases/P5-ai-chat.md` Notes for full detail, including what was verified via a throwaway auth-user session vs. what's still worth a click-through on Kai's real account.

**2026-07-04 life-context validation pass:** before starting P6, Kai reviewed the app's spec against his real life and made four decisions (full detail in `../PLAN_ADDENDUM.md` and the changelog below): build the `areas` entity + per-task reminders + in-app notification history next, ahead of P6 (spec in [P1-P4-retrofit.md](phases/P1-P4-retrofit.md)); extend Slipping to cover Areas; leave health/glucose tracking undecided and untouched; keep P6 exactly as spec'd, just sequenced after this retrofit lands.

| Phase | Name | Status | Depends on | Spec | Parity rows |
|---|---|---|---|---|---|
| P0 | Foundation | **done** ✅ | — | [P0-foundation.md](phases/P0-foundation.md) | — (infrastructure) |
| P1 | Task core + sync engine | **done** ✅ | P0 | [P1-task-core.md](phases/P1-task-core.md) | 1–5 |
| P2 | AI capture | **done** ✅ | P1 | [P2-ai-capture.md](phases/P2-ai-capture.md) | 6–8 |
| P3 | Calendar & time-blocking | **done** ✅ (3a only; 3b Google skipped) | P1 | [P3-calendar.md](phases/P3-calendar.md) | 9–11 |
| P4 | Routines & rhythm | **done** ✅ | P1 (P2 useful) | [P4-routines.md](phases/P4-routines.md) | 12–18 |
| P5 | AI chat + resurfacing | **done** ✅ | P2, P4 | [P5-ai-chat.md](phases/P5-ai-chat.md) | 19–20, 41 |
| Retrofit | Areas + reminders + notification history | **not started (current)** | P1, P4 | [P1-P4-retrofit.md](phases/P1-P4-retrofit.md) | 33–34, 39 |
| P6 | Integrations (GitHub first) | **not started (next)** | P2 | [P6-integrations.md](phases/P6-integrations.md) | 21–23 |
| P7 | Life-OS completion (7a–7e) | not started | P5 | [P7-life-os.md](phases/P7-life-os.md) | 24–32 |

**Definition of done for a phase:** all acceptance checklist items pass with evidence · ROADMAP status updated · deviations logged in the phase file's Notes · DATA_MODEL.md updated if the schema changed.

## Decision changelog

- **2026-07-03** — Plan v2 accepted: installable PWA + Supabase (free) + Groq (free) replaces the rejected Kairos plan (Electron + SQLite + Ollama — too heavy, no sync). North star: full Akiflow replacement with more features. Docs suite created; no app code yet.
- **2026-07-03** — Locked: our own themed calendar (never a Google embed); GitHub issues → inbox (P6); OS-global hotkey dropped (optional AHK snippet in PLAN.md Appendix B).
- **2026-07-04** — `docs/PLAN_ADDENDUM.md` (video-validation gap-fill) landed; only §11 (dedicated Search UI) was in P5's own scope and got built this session. The rest — `areas` entity, per-task reminders, routines schema expansion, notification-history log (all retrofit debt on P1/P4), Settings UI, Books entity, review queue, external capture endpoint (P6/P7 additions) — are **not built yet**, per the addendum's own "schedule deliberately" guidance. Still tracked in `PLAN_ADDENDUM.md` until picked up.
- **2026-07-04** — Life-context validation pass: Kai decided on four open items from `PLAN_ADDENDUM.md`. (1) Health/glucose tracking stays undecided/parked — no doc changes. (2) Build the `areas` entity next, ahead of P6. (3) Extend `slipping` to cover Areas (was flagged open in addendum §3, now decided: yes). (4) Bundle per-task reminders + in-app notification history into the same batch as Areas (addendum §4, §9) since they address Kai's own stated pain point (forgets reminder/planning steps most of the time). P6 stays exactly as spec'd, just sequenced after this retrofit. New phase file: `phases/P1-P4-retrofit.md`.
