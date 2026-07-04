# Kai's Flow — Roadmap & Build Status

> **Single source of truth for "where are we".** Update the status column after every working session. Parity rows refer to the feature parity matrix in `PLAN.md` §3.

## ➤ Current phase: **P3 — Calendar & time-blocking** (not started)

**P0, P1, and P2 are done.** Live at **https://kais-flow.kaidagoat.workers.dev**. P2 shipped real AI capture: `parse-capture` + `transcribe` edge functions (Groq), confidence-gated auto-filing (only `kind:'task'` ever auto-files — everything else always lands in Inbox regardless of confidence), voice capture (MediaRecorder) on Today + Inbox, `Ctrl+Enter` AI mode in the command bar, undo, and offline capture queueing with auto-parse on reconnect. Every acceptance item verified against the **live** Groq + Supabase deployment (real API calls) — see `phases/P2-ai-capture.md` Notes, including confirming the Groq key never reaches the client bundle.

| Phase | Name | Status | Depends on | Spec | Parity rows |
|---|---|---|---|---|---|
| P0 | Foundation | **done** ✅ | — | [P0-foundation.md](phases/P0-foundation.md) | — (infrastructure) |
| P1 | Task core + sync engine | **done** ✅ | P0 | [P1-task-core.md](phases/P1-task-core.md) | 1–5 |
| P2 | AI capture | **done** ✅ | P1 | [P2-ai-capture.md](phases/P2-ai-capture.md) | 6–8 |
| P3 | Calendar & time-blocking | **not started (current)** | P1 | [P3-calendar.md](phases/P3-calendar.md) | 9–11 |
| P4 | Routines & rhythm | not started | P1 (P2 useful) | [P4-routines.md](phases/P4-routines.md) | 12–18 |
| P5 | AI chat + resurfacing | not started | P2, P4 | [P5-ai-chat.md](phases/P5-ai-chat.md) | 19–20 |
| P6 | Integrations (GitHub first) | not started | P2 | [P6-integrations.md](phases/P6-integrations.md) | 21–23 |
| P7 | Life-OS completion (7a–7e) | not started | P5 | [P7-life-os.md](phases/P7-life-os.md) | 24–32 |

**Definition of done for a phase:** all acceptance checklist items pass with evidence · ROADMAP status updated · deviations logged in the phase file's Notes · DATA_MODEL.md updated if the schema changed.

## Decision changelog

- **2026-07-03** — Plan v2 accepted: installable PWA + Supabase (free) + Groq (free) replaces the rejected Kairos plan (Electron + SQLite + Ollama — too heavy, no sync). North star: full Akiflow replacement with more features. Docs suite created; no app code yet.
- **2026-07-03** — Locked: our own themed calendar (never a Google embed); GitHub issues → inbox (P6); OS-global hotkey dropped (optional AHK snippet in PLAN.md Appendix B).
