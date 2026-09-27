---
date: 2026-09-27T06:42Z
session: scale-backend worker
type: handoff
related: scale to 100 users on free tiers (backend half)
---

# Scale backend handoff: indexes, housekeeping, a global AI cap

Branch `claude/scale-backend`, based on `origin/master`. Not merged, not deployed.

## What changed

- **`supabase/migrations/0040_scale_indexes_and_hygiene.sql`** (new, idempotent — every object `if not exists` / `create or replace` / unschedule-then-schedule):
  1. `user_id` indexes for the RLS predicate on 16 client-read tables that had none leading with `user_id` (`activity_log (user_id, created_at)`, `calendar_events (user_id, starts_at)`, plain `(user_id)` on tasks, inbox_items, routine_completions, domains, projects, areas, routines, push_subscriptions, people, interactions, books, notes, quotes, commentary). Skipped where one exists: time_entries, journal_entries, app_settings (PK), integrations / resurfaced_log / ai_usage (unique constraints); embed_queue isn't client-read.
  2. pg_cron `cron-history-prune` at `15 3 * * *`: `cron.job_run_details` older than 7 days, and `embed_queue` rows with `status = 'done'` older than 1 day (by `created_at` — the table has no `updated_at`; pending and error rows are never touched).
  3. `ai_usage_global (day, kind, count)` — RLS on, no policies, no anon/authenticated grants — and `ai_usage_take(p_user_id, p_kind, p_user_limit) → (user_count, global_count)`: security definer, `search_path` pinned, execute for `service_role` only. It calls 0036's **unchanged** `ai_usage_bump` for the per-user count, then bumps the global row only if the user is within their own limit — a call the per-user cap rejects never reaches Groq, so one account hammering past its cap can't burn everyone's day.
- **`supabase/functions/_shared/quota.ts`**: `takeAiAllowance` calls `ai_usage_take` (one round trip) and returns `'over'` past the per-user **or** the global cap. Same 429 `{error:'daily_limit'}` either way, so the client is unchanged (its copy, "Today's AI allowance is used up — it refills tomorrow", is true of both). Per-user defaults lowered to chat 40 / parse 100 / stt 30; new env `AI_GLOBAL_LIMIT_CHAT` / `_PARSE` / `_STT`, defaults 80 / 150 / 1000.
- **`supabase/functions/parse-capture/index.ts`**: a Groq 429 no longer triggers the retry (it would only spend a second call); the capture still lands unparsed via `fallbackResult`. Default parse model is now `openai/gpt-oss-20b`.

## Deviations from the brief (read these)

- **Parse default is `openai/gpt-oss-20b`, not `llama-3.1-8b-instant`.** Groq shut down both `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` for free/developer tiers on **2026-08-16** (console.groq.com/docs/deprecations; neither appears on the free-plan rate-limit table any more). gpt-oss-20b is Groq's named replacement for 8b-instant; JSON-object mode works on all Groq models.
- **Global defaults are far below the brief's 800 / 5000 / 1500.** Groq's free plan (console.groq.com/docs/rate-limits, read 2026-09-27): text models (gpt-oss-20b/120b, qwen3) get 30 RPM, **1K requests and 200K tokens per day** each; whisper-large-v3(-turbo) gets 20 RPM, 2K requests and 28,800 audio-seconds per day. Tokens bind first: a parse (prompt + domain/project lists + reasoning) is ~1–2K tokens → ~100–200/day; a chat (20 retrieved items + history) ~2.5K+ → ~80/day. Hence 80 / 150 / 1000. These are estimates, not measurements — see "Conductor" below.

## Evidence

- PGlite (`docs/log/assets/scale/0040-pglite-check.mjs`, pglite 0.2, stubs roles with Supabase's default grants, auth, cron, touched tables; loads 0036's ai_usage part; runs 0040 **twice**) → `PASS`: all 16 indexes present; exactly one `cron-history-prune` job at `15 3 * * *`; running its command left the 6-day-old and still-running `job_run_details` rows and removed the 8-day-old one, removed only the 2-day-old `done` embed row (fresh done, old pending, old error kept); `ai_usage_take` with limit 2 → user 1,2,3 / global 1,2,null (the over-limit call isn't counted globally), second user → global 3; 20 concurrent-issued parse takes → global counts 1..20 all distinct; `ai_usage_bump` afterwards returns 4 (per-user behaviour unchanged); anon/authenticated can't execute `ai_usage_take` or `ai_usage_bump` or read/write `ai_usage_global`, service_role can execute; definer + `search_path=public, pg_temp`. PGlite is one connection, so true concurrency isn't exercised — it rests on the same `on conflict do update` row lock 0036 relies on.
- `deno check` (deno 2.9.6 via `npx deno@2`; not installed on the machine) on chat, parse-capture, transcribe: clean.
- Scratch Deno run of `takeAiAllowance` against a stubbed PostgREST (not committed): request goes to `rpc/ai_usage_take` with `p_user_limit: 40` and `Accept: application/vnd.pgrst.object+json`; `{1,1}`→ok, `{1,5}`→ok with `AI_GLOBAL_LIMIT_CHAT=5`, `{1,6}`→over, `{41,null}`→over, malformed→unavailable; defaults read 40/100/30 and 150/1000.
- `cd app && npx vitest run`: 54 files, 752 tests passed.
- Not run: `supabase/tests/*.sh` (need Docker).

## Conductor, at deploy

1. **Order matters: `db push` (0040) before deploying chat / parse-capture / transcribe.** New functions against an old database can't find `ai_usage_take` → chat and transcribe answer 503 (they fail closed), parse fails open (unmetered).
2. **Production has `GROQ_PARSE_MODEL=llama-3.3-70b-versatile` set as a secret** (docs/phases/P2-ai-capture.md Notes), which overrides the new default — and that model is gone, so every capture has been landing unparsed since 2026-08-16. Kai must `supabase secrets unset GROQ_PARSE_MODEL` (or set it to `openai/gpt-oss-20b`).
3. **Chat is broken the same way and this branch leaves it alone per the brief**: `GROQ_CHAT_MODEL` defaults to (and may be set to) `llama-3.3-70b-versatile`. Kai should set `GROQ_CHAT_MODEL` to a live free model — `openai/gpt-oss-120b` is Groq's named replacement. Pick a **different** model from parse, or the two kinds share one 1K-request / 200K-token daily budget.
4. The new env vars (`AI_GLOBAL_LIMIT_*`) are optional. Once the real per-call token usage is visible in Groq's console, tune them (and the per-user ones) there rather than in code.
5. Nothing to do for the cron job — the migration registers it.

## Not done (out of scope, noted for the conductor)

- `reasoning_effort: 'low'` on the gpt-oss parse call would cut its token use a lot, but it errors on non-reasoning models if someone sets `GROQ_PARSE_MODEL` to one — left out.
- Old `ai_usage` / `ai_usage_global` rows are never pruned (~110K rows/year at 100 users — small).
- `create index` (not `concurrently`) briefly blocks writes on each table while it builds; the tables are small today.
