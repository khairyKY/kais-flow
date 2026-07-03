# Kai's Flow — Project Instructions

**Kai's Flow** is a lightweight, $0/month, cross-device life-OS: a full replacement for Akiflow (universal inbox, NLP command bar, calendar time-blocking, rituals) merged with Jerad Hill's AI life-management dashboard (voice capture → AI filing, routines/streaks, Slipping metric, CRM, library, resurfacing, AI chat over your data). One person's whole life in one app — tasks, habits, routines, journals, people, content.

- Master plan & research: `PLAN.md`
- Build state: `docs/ROADMAP.md` ← **always check first**
- Schema reference: `docs/DATA_MODEL.md`
- Phase specs: `docs/phases/P0…P7`

## Session workflow (follow every time you build)

1. Read `docs/ROADMAP.md` → find the current phase and its status.
2. Read that phase's file in `docs/phases/` **fully** before writing any code.
3. Execute the steps in order. Steps tagged `[KAI]` are human-only (account creation, dashboard clicks, secrets) — stop and ask Kai to do them.
4. Run the phase's acceptance checklist and show evidence for each item.
5. Update `docs/ROADMAP.md` status; record deviations in the phase file's **Notes** section; keep `docs/DATA_MODEL.md` in sync with any migration you add.
6. Never start the next phase in the same session unless Kai explicitly asks.

## Hard rules (non-negotiable)

- **$0 only.** Never add a paid service, paid tier, or anything that needs a credit card.
- **Light.** No Electron, no local models, no background processes on Kai's laptop. All background work = Supabase pg_cron + edge functions.
- **Secrets stay server-side.** `GROQ_API_KEY`, Google tokens, GitHub PAT live only in Supabase edge-function secrets / the `integrations` table — never in client code or any `VITE_`-prefixed env var.
- **Never embed Google UI.** The calendar is ours; Google Calendar is optional invisible background sync only.
- **Phase discipline.** Build only the active phase's scope. Out-of-scope ideas → one line in the ROADMAP changelog, then move on.
- **Visual design belongs to Kai.** Until a dedicated design phase happens with him, keep UI functional and plain — sensible spacing, no styling rabbit holes. When styling starts, the workspace design conventions (`D:\Coding\.claude\skills\SKILL.md`) apply.
- **Privacy.** Journal/health/personal content goes through Groq only (no-training policy, ZDR enabled). Never route personal data to a provider that trains on free-tier inputs.

## Stack cheat-sheet

React 19 + TypeScript strict + Vite PWA (`app/`) · Supabase = DB/auth/realtime/storage/edge functions/pg_cron (`supabase/`) · TanStack Query 5 + IndexedDB persister + **outbox** for offline writes (`app/src/lib/outbox.ts`) · Zustand · Tailwind 4 · `chrono-node` (instant NL dates) · `rrule` (recurrence) · FullCalendar time-grid wrapped in our own `CalendarGrid` component · Groq via edge-function proxy, models from env: `GROQ_PARSE_MODEL` / `GROQ_CHAT_MODEL` / `GROQ_STT_MODEL`.

**Conventions:** vertical slices in `app/src/features/<feature>/` (components, hooks, api, types per feature); shared plumbing in `app/src/lib/`. Every table: `id uuid` (client-generated `crypto.randomUUID()`), `user_id uuid default auth.uid()` + RLS `user_id = auth.uid()`, `created_at`, `updated_at` (shared `set_updated_at()` trigger). All client writes go through the outbox helper. Domain events append to `activity_log` via a single `logActivity()` helper — Slipping/streaks/digests/resurfacing only ever read that log. One Zod schema per entity, shared by forms and edge functions. Store UTC, render Africa/Cairo.

## Commands

- `cd app && npm run dev` — dev server
- `cd app && npm run build && npx vite preview` — production check
- `supabase migration new <name>` / `supabase db push` — schema changes
- `supabase functions deploy <name>` / `supabase secrets set KEY=value` — edge functions
- Deploy = push to `main` (Cloudflare Pages auto-builds)
