# Kai's Flow — Project Plan

> **A lightweight, free, syncable life-OS: full Akiflow replacement merged with Jerad Hill's AI life-management dashboard.**
> Plan v2 · July 2026 · Supersedes the Kairos plan (`D:\Coding\kairos\PLAN.md`)
> Folder is `kais-flow` (apostrophes/spaces in paths break npm & friends); the product name stays **Kai's Flow**.

---

## ⚡ TL;DR — Every Major Decision in One Table

| Decision | Choice | Why |
|---|---|---|
| **App shape** | **Installable PWA** — React 19 + TypeScript + Vite + `vite-plugin-pwa` | One codebase = Windows desktop app + Android/iOS home-screen app. Runs as a browser tab (~100–300 MB RAM) instead of Kairos's ~5–7 GB Electron+Ollama stack. |
| **Backend / sync** | **Supabase free tier** (Postgres + Auth + Realtime + Storage + Edge Functions + pg_cron) | The entire backend in one free service. Realtime subscriptions = instant cross-device sync. Same backend Jerad used. |
| **AI** | **Groq free tier only** — llama-3.3-70b class for parsing/chat, **Whisper large-v3-turbo for voice (free)** | Free, extremely fast, **does not train on your data** (zero-data-retention toggle available). No local model → laptop stays cool. |
| **Embeddings** | Supabase Edge Functions built-in `Supabase.ai` (gte-small) → **pgvector** | Free, private, no external provider (Groq has no embeddings API). |
| **Offline strategy** | IndexedDB cache (TanStack Query persister) + **outbox queue** for offline writes, last-write-wins | Akiflow's own mobile pattern (local DB + sync service), minus CRDT complexity — you're one user. |
| **Calendar** | **Our own calendar** — native `calendar_events` table + app-themed week/day grid. Google Calendar is *optional invisible plumbing* (background mirror in / push blocks out) | Never an embedded Google widget. App works fully without Google connected. |
| **Voice capture** | PWA MediaRecorder → Groq Whisper → AI cleanup & auto-categorize | Jerad's watch-capture flow, phone-first, $0. |
| **Push notifications** | Web Push via Edge Function + pg_cron | Free Pushover replacement. Android/Windows now; iOS via installed PWA (16.4+). |
| **GitHub issues** | Edge function polls GitHub API → issues land in Inbox → AI prioritizes | Kai's addition — beyond both source products. |
| **Hosting** | **Cloudflare Pages** (free, unlimited bandwidth) + GitHub repo | $0, and the repo doubles as a portfolio piece. |
| **Desktop global hotkey** | **Dropped.** In-app `Ctrl+K` command bar + pinned PWA instead | OS-global hotkeys need a native helper; low value. Optional 6-line AutoHotkey snippet in Appendix B. |
| **UI design** | **Out of scope here** — information architecture only | Kai designs it later with Claude. |
| **Monthly cost** | **$0** | See cost table §6. |

**The one architectural idea to remember (kept from Kairos):** every module writes domain events (`task.completed`, `routine.checked`, `journal.created`…) into one `activity_log` table. **Slipping, streaks, resurfacing, and daily digests are all just readers of that log** — no module ever depends on another module's code.

---

## 1. North Star

**Kai's Flow is not a companion to Akiflow — it is its full replacement, and it must end with MORE features than Akiflow.** Success criterion: never needing an Akiflow subscription (~$19–34/mo saved).

The "more" comes from merging in Jerad Hill's entire life-OS — journals, routines, streaks, CRM, library, resurfacing, AI chat over your own data — plus Kai's additions (GitHub issue ingestion). The bar Akiflow markets but doesn't reach: **everything actually in one place** — todos, habits, routines, journals, people, content — reachable in ≤2 interactions.

Hard constraints, in priority order:
1. **UX first** — frictionless capture, keyboard-first, one unified home.
2. **Light** — no Electron, no local models, no background processes on the laptop. All background work runs on Supabase's servers.
3. **Free** — $0/month across every service.
4. **Syncs everywhere** — laptop + phone see the same data live; mobile version is the same app.

---

## 2. Research — What We're Building On

### 2.1 Source 1: Akiflow (the product being replaced)

How Akiflow actually works, feature by feature:

- **Universal Inbox** — tasks flow in from connected apps (Gmail, Slack, Notion, Todoist, PM tools) into one triage queue instead of living in five places.
- **Command Bar** (`Ctrl+E`, system-wide) — create tasks/events with natural language: typing `Call John tomorrow 3pm for 1h #Marketing` parses date, time, duration, and project instantly.
- **Time-blocking** — drag a task from the inbox onto the calendar; the block is written to your real calendar so others see you're busy. Widely considered the cleanest time-blocking implementation anywhere.
- **Rituals** — guided morning (review yesterday → pick 1–3 goals → clear inbox → time-block the day, ~5–10 min), evening shutdown, and weekly review flows.
- **Task mechanics** — snooze, recurring tasks, labels/projects, smart lists, priorities; everything has a keyboard shortcut.
- **Architecture lesson** (from their public Flutter mobile repo): each device keeps a **local database** with a **sync service** reconciling against the backend — offline-first, syncs when connectivity returns. That's the sync pattern we copy.

### 2.2 Source 2: Jerad Hill's life-OS dashboard (YouTube video + Substack)

His stack: Node.js web app used as a **PWA saved to the phone home screen**, Supabase database, Anthropic API (parsing + chat-with-DB), OpenAI transcription for voice, Google Calendar API (pull events — don't rebuild a calendar), Pushover for push. Built in days with Claude (chat → spec, Claude Design → mockups, Claude Code → app).

His modules (full extraction in Appendix A): Domains → Projects → Tasks hierarchy · frictionless voice/text capture with AI cleanup & auto-filing · Top-3/Today dashboard · **Slipping** metric (flags stale projects/areas) · routines fully separated from tasks, with streaks & temporary challenges · projects with milestones/checklists/time-tracking · **retainers** that auto-reload monthly · content kanban (Idea → Editing → Published) · personal CRM · Library (journal with text/voice/photos, notes & quotes with a commentary feed, Kindle highlight sync) · **Resurfacing** (daily rotation of old entries/quotes) · AI chat over everything · push notifications for missed routines/overdue tasks/daily summaries.

**Two post-launch lessons from his Substack, baked in from day 1:**
1. **Domain boundaries needed restructuring after a month** → our domains must be cheap to rename, merge, and re-parent. No hard-coded categories anywhere.
2. **He added an Inbox for low-confidence AI captures** — when the AI isn't sure where something goes, it must *stay in the inbox* for manual triage rather than guess and misroute. Confidence thresholds are a first-class concept in our capture pipeline.

### 2.3 Free-tier verification (checked July 2026)

- **Supabase free**: 500 MB Postgres (pgvector included), auth (50k MAU), realtime, 1 GB file storage, 500k edge-function invocations/mo, pg_cron. **Pauses after 7 idle days** — a scheduled self-ping prevents it (and daily use makes it moot).
- **Groq free**: ~1,000 req/day on the 70B-class model (~14,400/day on smaller ones), 30 req/min — ample for one person. **Whisper transcription: ~2,000 req/day free.** Inputs/outputs are **not used for training**; not retained by default; explicit Zero-Data-Retention setting exists. JSON-schema structured outputs supported (guaranteed-parseable capture parsing).
- **Gemini Flash free tier rejected** for runtime use despite bigger quota (1,500 req/day): Google's free tier may use your inputs/outputs to improve its models — unacceptable for journals and health notes.
- **GitHub REST API**: 5,000 req/hr authenticated — free.
- **Cloudflare Pages**: free static hosting, unlimited bandwidth, 500 builds/mo.
- **Google Calendar API**: free.

---

## 3. Feature Parity Matrix

> **Highlight:** nothing from either source gets silently dropped. Every feature, its source, and the phase it ships in.

| # | Feature | Source | Phase |
|---|---|---|---|
| 1 | Universal inbox (all captures → one triage queue) | Akiflow | **P1** |
| 2 | Command bar with natural-language parsing (`Ctrl+K`) | Akiflow | **P1** (chrono-node) → P2 (AI) |
| 3 | Domains → Projects → Tasks hierarchy (freely restructurable) | Jerad | **P1** |
| 4 | Today view + Top 3 | Jerad | **P1** |
| 5 | Snooze, labels, priorities | Akiflow | **P1** |
| 6 | Text capture → AI cleanup → auto-categorization w/ confidence | Jerad | **P2** |
| 7 | Voice capture → Whisper → AI parse | Jerad | **P2** |
| 8 | Cross-device live sync (laptop ↔ phone) | Kai's requirement | **P2** (verified) |
| 9 | Our own themed calendar (week/day grid) | Akiflow (re-skinned) | **P3** |
| 10 | Drag-task-to-calendar time-blocking | Akiflow | **P3** |
| 11 | Google Calendar background mirror in / block push out (optional) | Akiflow + Jerad | **P3** |
| 12 | Routines fully separated from tasks; time-of-day buckets | Jerad | **P4** |
| 13 | Streaks + temporary challenges w/ progress charts | Jerad | **P4** |
| 14 | Recurring tasks | Akiflow | **P4** |
| 15 | `activity_log` event spine | Kairos carry-over | **P4** |
| 16 | **Slipping** metric (stale project/area sidebar) | Jerad | **P4** |
| 17 | Push notifications (overdue, missed routines, daily digest) | Jerad | **P4** |
| 18 | Morning / evening / weekly ritual flows | Akiflow | **P4** |
| 19 | AI chat over all your data (RAG: FTS + vectors) | Jerad | **P5** |
| 20 | Resurfacing (daily rotation of old entries/quotes) | Jerad | **P5** |
| 41 | Dedicated keyword/semantic Search UI (non-AI, over `search_hybrid`) | Jerad + gap-fill | **P5** |
| 21 | **GitHub issues → inbox + AI prioritization** | **Kai** | **P6** |
| 22 | Smart lists (saved filters) | Akiflow | **P6** |
| 23 | Email-forwarding capture (optional) | Akiflow | **P6** |
| 24 | Library: journal (text/voice/photo), notes & quotes w/ commentary feed | Jerad | **P7** |
| 25 | Personal CRM (people, facts, interactions, birthdays) | Jerad | **P7** |
| 26 | Content pipeline kanban (Idea → Published) | Jerad | **P7** |
| 27 | Projects: milestones, % complete, checklist templates, time tracking | Jerad | **P7** |
| 28 | Retainers (monthly auto-reload) | Jerad | **P7** |
| 29 | Kindle highlights import | Jerad | **P7+** |
| 30 | Handwriting-photo journal parsing | Jerad (WIP) | **P7+** |
| 31 | Home inventory module | Jerad (WIP) | **P7+** |
| 32 | Capacitor native mobile wrap (only if PWA ever falls short) | Kai | **P7+** |
| — | **Akiflow-parity audit → cancel Akiflow** | North star | **P7 checkpoint** |

---

## 4. Why This Is Light (vs. the rejected Kairos plan)

| | Kairos plan (rejected) | **Kai's Flow** |
|---|---|---|
| Shell | Electron (~0.7–1.2 GB RAM) | Browser tab / installed PWA (~100–300 MB) |
| AI | Ollama: 3.2–6 GB VRAM/RAM per model, GPU spun up | Groq cloud — **0 bytes local** |
| Voice | whisper.cpp sidecar (~0.9 GB while transcribing) | Groq Whisper — 0 local |
| Background jobs | Node processes running on the laptop 24/7 | Supabase pg_cron + edge functions — **run on their servers** |
| Sync / mobile | None (explicit non-goal) | Realtime sync + same app installs on phone |
| Laptop working set | **~5–7 GB** | **~0.3 GB** |

---

## 5. Architecture

```
┌─ Laptop (installed PWA) ─┐      ┌─ Phone (home-screen PWA) ─┐
│ React SPA                │      │  same build               │
│ IndexedDB cache + outbox │      │  IndexedDB cache + outbox │
└───────────┬──────────────┘      └────────────┬──────────────┘
            │  supabase-js (REST + Realtime WebSocket)
            ▼
┌──────────────────── Supabase (free tier) ────────────────────┐
│ Postgres (+ RLS, FTS, pgvector)   Auth    Storage (photos)   │
│ Realtime (change feed → both devices)                        │
│ Edge Functions:  parse-capture · transcribe · chat ·         │
│                  gcal-sync · github-sync · notify · embed    │
│ pg_cron: digests · slipping recompute · retainer reload ·    │
│          github poll · keep-alive self-ping                  │
└──────┬────────────────┬─────────────────┬────────────────────┘
       ▼                ▼                 ▼
   Groq API        Google Calendar     GitHub API
 (LLM + Whisper)    (optional)          (issues)
```

### 5.1 Sync design (the Akiflow pattern, simplified)

- Every row has a **client-generated UUID** and `updated_at` (server trigger).
- Reads: TanStack Query, persisted to IndexedDB → app opens instantly offline with last-known data.
- Writes: applied optimistically to the local cache **and** appended to an IndexedDB **outbox**; a flusher pushes the outbox to Supabase whenever online. Retries are idempotent (UUID upserts).
- Conflict rule: **last-write-wins** on `updated_at`. Single user + per-field-small rows = conflicts are rare and harmless. CRDTs deliberately avoided (v1 complexity killer).
- Other devices receive changes via a Realtime subscription that invalidates the relevant queries → UI updates live.

### 5.2 AI pipeline (all through one edge-function proxy; Groq key never ships to the client)

1. **Capture** (text from command bar, or audio → `transcribe` → Whisper text).
2. `parse-capture` calls Groq with a **JSON-schema-constrained** prompt → `{ kind: task|event|routine|journal|note|unknown, cleaned_text, domain_guess, project_guess, due, duration, priority, confidence }`.
3. `confidence ≥ threshold` → auto-file into the right table + `activity_log` event. Below threshold → stays in **Inbox** for manual triage (Jerad's lesson).
4. **Chat** (`chat` fn): hybrid retrieval — Postgres FTS + pgvector similarity, RRF-merged — → context → Groq streaming response.
5. **Embeddings** (`embed` fn): `Supabase.ai` gte-small on insert/update of searchable content.
6. Provider adapter is OpenAI-compatible → swapping/adding a provider (or local Ollama someday) is an env-var change, not a rewrite.

### 5.3 Calendar design

- **Native `calendar_events` table is the source of truth for the UI.** Week/day grid is our component, themed with the app (headless library or hand-rolled — decided in the design phase with Claude). **No Google embeds, ever.**
- Time-blocking = drag task onto grid → creates an event linked to the task (`task_id`).
- **Optional** Google connect: `gcal-sync` edge function does incremental `syncToken` pulls on a cron → upserts mirrored events (`gcal_id` set, read-mostly); pushes our time blocks out so external viewers see busy slots. Disconnecting Google leaves native events untouched.

### 5.4 GitHub issues (Kai's addition)

- PAT stored in `integrations` (server-side only). `github-sync` cron pulls open issues assigned to Kai (+ watched repos) → `inbox_items` (kind `github_issue`, deduped by issue node id).
- AI prioritization: rank issues against current Top-3, due dates, and Slipping data → suggested order + "schedule it?" affordance.
- Closing the task can optionally comment/close the issue (write scope — opt-in later).

---

## 6. Cost Table — Proving the $0

| Service | Used for | Free-tier limit | Our realistic usage |
|---|---|---|---|
| Supabase | DB, auth, sync, storage, functions, cron | 500 MB DB · 1 GB storage · 500k fn calls/mo | Years of text data; a few k fn calls/mo |
| Groq | Parsing, chat, Whisper voice | ~1k req/day (70B) · ~2k transcriptions/day | Tens of requests/day |
| Cloudflare Pages | Hosting the PWA | Unlimited bandwidth · 500 builds/mo | A few builds/week |
| GitHub | Repo + issues API | 5,000 API req/hr | Polling every 30 min ≈ 50/day |
| Google Calendar API | Optional mirror | Free | Light |
| Web Push (VAPID) | Notifications | Free (browser standard) | — |
| chrono-node, FullCalendar-class libs, dnd-kit… | OSS | Free | — |
| **Total** | | | **$0 / month** |

No credit card is required by any service above.

---

## 7. Data Model (Postgres, single-user RLS on everything)

| Table | Key columns / notes |
|---|---|
| `domains` | name, color, sort. **Renamable/mergeable freely** (Jerad's lesson #1). |
| `projects` | domain_id, type `standard|retainer`, status; later: milestones jsonb, checklist template ref, time-tracking totals |
| `tasks` | project_id? domain_id, title, notes, status, due_at, `scheduled_start/end`, top3 bool, snoozed_until, recurrence rule (RRULE string), labels text[], priority |
| `calendar_events` | title, start/end, all_day, task_id?, `gcal_id?` + sync meta. Native events first-class. |
| `routines` | name, time_of_day `morning|afternoon|evening`, cadence, challenge window (start/end dates) |
| `routine_completions` | routine_id, date — streaks are computed, never stored |
| `inbox_items` | kind `text|voice|github_issue|email`, raw payload, transcript, ai_parse jsonb, confidence, status `pending|filed|dismissed` |
| `activity_log` | event_type, entity ref, payload jsonb, created_at. **The spine.** Slipping/streaks/digests/resurfacing read only this. |
| `integrations` | provider, encrypted tokens/PAT, cursor/syncToken state |
| `push_subscriptions` | per-device Web Push endpoints |
| Later (P7+) | `journal_entries`, `notes`, `quotes` (+ commentary feed), `people`, `interactions`, `content_items` |
| Search infra | `tsvector` columns + pgvector `embedding` columns on searchable tables |

**Slipping** = a SQL view: latest `activity_log` touch per domain/project vs. configurable staleness thresholds.

---

## 8. UX Principles (information architecture only — visuals designed later with Claude)

1. **Capture in under 2 seconds, zero decisions.** Text or voice, from any device; you never pick a category at capture time — the AI files it, the Inbox catches uncertainty.
2. **Keyboard-first.** `Ctrl+K` command bar creates, navigates, schedules; natural-language dates parse as you type (instant, local).
3. **One home: Today.** Top-3, the time-blocked day (our calendar), today's routines, and one resurfaced memory — a single screen that answers "what does my day look like."
4. **Rituals as guided flows**, not empty pages: morning (review → Top-3 → clear inbox → block time), evening shutdown, weekly review.
5. **Routines never pollute the task list.** Separate module, separate mental space (Jerad's split).
6. **Nothing falls through cracks silently** — Slipping sidebar + push digests do the remembering.
7. **Everything is one place, genuinely**: any module ≤2 interactions away; entities cross-link (task ↔ event ↔ project ↔ person ↔ note).

---

## 9. Roadmap — Each Phase Ships Something Used Daily

| Phase | Ships | You can now… |
|---|---|---|
| **P0 Foundation** | Repo, Vite PWA scaffold, Supabase project + auth + first migrations, Cloudflare Pages CI deploy, offline app shell | Open your app on laptop & phone, log in |
| **P1 Task core** | Domains/projects/tasks CRUD, Inbox + triage UI, Today + Top-3, `Ctrl+K` bar with chrono-node dates, snooze/labels | Run your task life in it |
| **P2 AI capture** | `parse-capture` + `transcribe` edge fns, JSON-schema parsing w/ confidence, voice capture UI, **verified phone↔laptop live sync** | Speak into your phone; task appears filed, on your laptop, in seconds |
| **P3 Calendar & time-blocking** | `calendar_events` + themed week/day grid, drag-task-to-block; optional Google mirror/push | Plan your day Akiflow-style |
| **P4 Routines & rhythm** | Routines/streaks/challenges, `activity_log`, Slipping sidebar, push digests, ritual flows, recurring tasks | Morning ritual in 5 min; streaks tracked; nothing slips |
| **P5 AI chat + resurfacing** | Hybrid retrieval + Groq chat over all data; daily resurfacing card | Ask "what did I say about X last month?" |
| **P6 Integrations** | GitHub issues → inbox + AI prioritization; smart lists; email-capture (opt.) | Your repos' issues triage themselves |
| **P7+ Life-OS completion** | Library (journal/notes/quotes), CRM, content kanban, milestones/retainers/time-tracking, Kindle import, handwriting parse, inventory, Capacitor wrap if needed. **Parity audit → cancel Akiflow.** | Everything in one place — the north star |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase free project pauses after 7 idle days | App unreachable until resumed | pg_cron self-ping; daily use makes it moot; data is never lost |
| Groq rate limits / model deprecations | AI features throttled | Limits are ~30× personal usage; OpenAI-compatible adapter → second provider is an env var |
| iOS PWA quirks (push needs installed PWA; mic permissions) | Mobile capture friction on iPhone | Install-to-home-screen onboarding; Capacitor wrap as the escape hatch |
| Google OAuth "unverified app" warning | Scary consent screen (personal use only) | Documented one-time acceptance; Google is optional anyway |
| 500 MB DB ceiling | Long-term growth | Text ≈ years of usage; photos/audio go to Storage (1 GB) with compression; export/archive script later |
| Sensitive journal data in cloud | Privacy | Groq: no-training + ZDR; Supabase: private project, RLS, encrypted at rest; option later: client-side encryption for journal bodies |

---

## 11. First-Session Setup Checklist (all free, no card)

1. **GitHub**: create `kais-flow` repo (private ok) + a PAT (`repo` read scope) for the issues integration (P6).
2. **Supabase**: create project → note URL + anon key; enable pgvector & pg_cron extensions.
3. **Groq**: create account at console.groq.com → API key; flip on Zero Data Retention in Data Controls.
4. **Cloudflare**: Pages project connected to the GitHub repo (auto-deploy on push).
5. **Web Push**: generate VAPID key pair (one command, stored as edge-function secrets).
6. *(Optional, P3)* **Google Cloud**: project + OAuth client with Calendar scope.

---

## Appendix A — Full Feature Extraction from the Source Video (reference)

Jerad Hill's build, as extracted from the video (via Gemini) and his Substack posts — kept here so no feature is lost:

- **Motivation**: Notion/Apple Notes fragmentation; existing tools either inflexible or high-maintenance; wanted one frictionless system for work, content, home, relationships.
- **Stack**: Node.js app on ExCloud; Supabase DB; Anthropic API (parse inputs + chat with DB); OpenAI transcription; Google Calendar API; Pushover push; built via Claude chat (spec) → Claude Design (mockups) → Claude Code (app).
- **Hierarchy**: Domains (e.g. Home, Hill Media Group, each YouTube channel) → Projects/Retainers → Tasks/Routines/Checklists.
- **Capture**: Apple Watch shortcut → transcribe → AI strips filler, rewrites cleanly, auto-categorizes w/ due date; mobile web voice+text capture; desktop global `Cmd+J`.
- **Dashboard**: Top-3 & Today; Google Calendar events pulled in background; **Slipping** sidebar (flags untouched projects/areas after N days); Pushover alerts (missed routines, overdue, daily summaries).
- **Routines**: fully separated from tasks; morning/afternoon/evening buckets; temporary challenges (e.g. "run a 5K daily in June"); streak bar charts.
- **Projects**: milestones w/ % complete, linked tasks, templated checklists, active time tracking. **Retainers**: auto-reload open tasks + monthly checklist at month start.
- **Content pipeline**: kanban (Idea → Editing → Published), channel links, markdown outline box in each card.
- **Personal CRM**: people, facts (birthdays, kids, interests), interaction history.
- **Library**: journaling (text/voice/photos/video); notes & quotes with tags + commentary feed over time; Kindle sync (covers, status, ratings, highlights); **Resurfacing** (daily rotation of one old entry/quote/verse + AI-flagged review items); AI chat over all accumulated context.
- **WIP**: handwritten-journal photo parsing; home inventory (photos + dates, for insurance/declutter).
- **Substack lessons**: restructured domain boundaries after month 1; added an Inbox layer for captures the AI couldn't confidently place.

## Appendix B — Optional Desktop Global-Hotkey Helper (dropped from roadmap)

A PWA cannot register OS-global hotkeys. If you ever want `Ctrl+Alt+K` to work from any app, this AutoHotkey v2 script is the entire cost:

```ahk
; kais-flow-hotkey.ahk — global capture hotkey (optional)
^!k:: Run 'https://YOUR-APP.pages.dev/capture'
```

## Appendix C — Sources

- Akiflow features & rituals: [akiflow.com](https://akiflow.com/) · [akiflow.com/features](https://akiflow.com/features) · [Morgen's Akiflow review](https://www.morgen.so/blog-posts/akiflow-vs-motion) · [Saner.ai review](https://www.saner.ai/blogs/akiflow-reviews) · [dawid.ai usage guide](https://dawid.ai/how-to-use-akiflow-effectively/)
- Akiflow mobile architecture: [akiflow-flutter-app on GitHub](https://github.com/emanueltesoriello/akiflow-flutter-app)
- Jerad Hill: [the video](https://www.youtube.com/watch?v=WX-HS9o5VMY) · [Dashboard Substack post](https://jeradhill.substack.com/p/the-dashboard-i-built-in-claude-code) · [Health/AI Substack post](https://jeradhill.substack.com/p/i-asked-ai-about-my-health-for-a)
- Supabase free tier: [supabase.com/pricing](https://supabase.com/pricing)
- Groq limits & privacy: [rate limits](https://console.groq.com/docs/rate-limits) · [your data / ZDR](https://console.groq.com/docs/your-data) · [speech-to-text](https://console.groq.com/docs/speech-to-text)
- Free LLM tier comparison: [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) · [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
