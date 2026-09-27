# Kai's Flow — Data Model Reference

> Consolidated schema. Each table notes the phase that introduces it. **Update this file whenever a migration lands.** Sketches here are the contract; exact SQL lives in `supabase/migrations/`.

## Universal conventions (every table)

- `id uuid primary key` — generated **client-side** (`crypto.randomUUID()`) so offline writes are idempotent upserts.
- `user_id uuid not null default auth.uid()` + RLS policy `user_id = auth.uid()` for all of select/insert/update/delete.
- `created_at timestamptz default now()` · `updated_at timestamptz default now()` bumped by the shared `set_updated_at()` trigger.
- All timestamps stored UTC; the client renders Africa/Cairo.
- Realtime: tables the UI subscribes to must be added to the `supabase_realtime` publication.
- **Soft delete (0023):** `deleted_at timestamptz?` on `tasks`, `inbox_items`, `calendar_events`, `journal_entries` (partial index `where deleted_at is not null`) — these four are what the Trash page lists. **Compost (0032, V1 punch 25):** `compost_expired()` (`security definer`, `execute` revoked from `public`/`anon`/`authenticated` so only the cron owner can call it) hard-deletes those rows 30 days past `deleted_at`, plus `inbox_items` left `status = 'dismissed'` 30 days past `updated_at`. pg_cron job `compost-expired`, daily 03:30 UTC; returns the row count so it can be verified by hand.
- **Import idempotency (0027, P-IMPORT):** `external_ref jsonb` (nullable) on `tasks`, `inbox_items`, `journal_entries`, `notes`, `people`, `projects`, `calendar_events` — `{source, id, raw}` — with a partial unique index on `(user_id, external_ref->>'source', external_ref->>'id')`. Re-importing the same file is a no-op; the whole source row survives in `raw`.

**Extensions:** `vector` (pgvector, P0), `pg_cron` (P0), `pg_net` (P4 — lets cron call edge functions over HTTP).

## Tables by phase

### P1 — task core
| Table | Columns (beyond universal) |
|---|---|
| `domains` | `name text`, `color text`, `sort_order int` — must survive rename/merge/re-parent cheaply (Jerad's lesson) |
| `projects` | `domain_id uuid FK`, `name`, `type text check in ('standard','retainer')`, `status text`, `color text?` (P7), `target_date timestamptz?` (P7), `milestones jsonb` (P7 default '[]'), `checklist jsonb` (P7 default '[]'), `engagement_model text?` (P7) |
| `tasks` | `project_id uuid?`, `domain_id uuid?`, `area_id uuid?` (FK areas, P1–P4 retrofit), `title text`, `notes text?`, `status text check in ('todo','done','cancelled')`, `due_at timestamptz?`, `scheduled_start/scheduled_end timestamptz?`, `top3 bool default false`, `snoozed_until timestamptz?`, `recurrence_rule text?` (RRULE), `labels text[]`, `priority int?`, `duration_min int?` (UX Retrofit, migration 0017 — null renders as no chip, calendar falls back to 30), `someday bool default false` (UX Retrofit, migration 0017), `reminder_at timestamptz?` (per-task reminder, P1–P4 retrofit), `reminder_sent bool default false`, `completed_at timestamptz?`, `milestone_id uuid?` (P7 FK), `paused bool` (P7 default false), `parent_task_id uuid? → tasks on delete set null` (subtasks, one level deep — migration 0029; completing the parent never completes children) — indexes: `(status, due_at)`, `(domain_id)`, `(area_id)`, `(top3) where top3`, `(reminder_sent, reminder_at)` for notify sweep, `(parent_task_id) where not null` |
| `inbox_items` | `kind text check in ('text','voice','github_issue','email')`, `raw_text text`, `transcript text?`, `ai_parse jsonb?`, `confidence real?`, `status text check in ('pending','filed','dismissed')`, `filed_task_id uuid?`, `payload jsonb?` (source metadata, e.g. GitHub issue url/repo/node_id), `snoozed_until timestamptz?` (UX Retrofit, migration 0018 — hides from the pending triage queue until this time; no push reminder, that half of SPECS.md's Snooze backlog item stays future-phase) |
| `activity_log` | `event_type text` (e.g. `task.created`, `task.completed`, `routine.checked`, `journal.created`, `entity.reviewed`), `entity_type text`, `entity_id uuid`, `payload jsonb` — **append-only; the spine.** Slipping, streaks, digests, resurfacing only read this. Index `(entity_type, entity_id, created_at)` |

### P1–P4 retrofit — areas, reminders, notification history
| Table | Columns |
|---|---|
| `areas` | `name text`, `domain_id uuid? FK`, `sort_order int` — named life areas (e.g. Work, Health) that tag tasks independently of domain/project |
| `notification_history` | `event_type text`, `entity_type text`, `entity_id uuid`, `payload jsonb`, `notified_at timestamptz default now()` — records push notifications sent, separate from `activity_log` (which is user-initiated) |

### P3 — calendar
| Table | Columns |
|---|---|
| `calendar_events` | `title text`, `starts_at timestamptz`, `ends_at timestamptz`, `all_day bool`, `task_id uuid?` (time block for that task), `source text check in ('native','gcal')`, `gcal_id text?`, `gcal_etag text?`, `busy bool default true`, `type text check ('time_block','event','task') default 'event'`, `color text?` (hex accent) |
| `integrations` | `provider text` ('google','github'), `data jsonb` (tokens, cursors, syncToken) — **server-side only; never selected by the client beyond connection status** |

### P4 — routines & notifications
| Table | Columns |
|---|---|
| `routines` | `name text`, `time_of_day text?` (one of `'morning'/'afternoon'/'evening'`, a free-text custom label like `'dusk'`, or null for no time — was `not null` + 3-value check until UX Retrofit migration 0019 relaxed it), `clock_time text?` (`HH:MM` 24h, migration 0019 — independent of `time_of_day`), `cadence jsonb` (weekday mask), `challenge_start date?`, `challenge_end date?`, `active bool`, `steps jsonb default '[]'` (ordered step labels, migration 0028), `domain_id uuid? → domains` (migration 0028) |
| `routine_completions` | `routine_id uuid FK`, `completed_on date`, unique `(routine_id, completed_on)` — streaks are always computed, never stored |
| `push_subscriptions` | `endpoint text`, `keys jsonb`, `device_label text` |
| `app_settings` | single row **per user** (pk `user_id` since migration 0030 — was a table-wide `id boolean` singleton that locked out every account after the first): `timezone text default 'Africa/Cairo'`, `digest_hour int`, `confidence_threshold real default 0.75`, `slipping_default_days int default 7`, `display_name text?`, `workspace_name text default 'Personal'`, `seed_avatar text?`, `onboarded_at timestamptz?` (N6 onboarding, migration 0025 — null until the first-run wizard is completed) |

**View `slipping`** — last `activity_log` touch per domain/project/area vs threshold → rows that are going stale. (`slipping_areas` migration 0013 added the `area_id` variant).
- **Migration 0036 (SEC-2):** `slipping` recreated with the same columns and `security_invoker`, adding owner filters: every `activity_log` subquery requires `al.user_id` = the scored domain/project/area's `user_id`, and every `projects`/`tasks`/`areas` membership subquery requires the same owner — so under the service role (notify's digest bypasses RLS) another account's rows can't count as a touch. Same rows as before under a user's JWT.
- **`push_subscriptions.endpoint` (migration 0036, SEC-2):** check constraint `push_subscriptions_endpoint_known_service` — `https://` on a known Web Push host only (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`; anchored). Added `NOT VALID`, so rows from before 0036 aren't checked; `notify` skips (never contacts) any endpoint off that list and reports `skipped_endpoints`.

### P5 — search & chat
- `tsvector` generated columns (`search_tsv`) + `embedding vector(384)` (gte-small) added to `tasks` (title+notes), `inbox_items` (raw_text) — GIN index on `search_tsv`, HNSW (`vector_cosine_ops`) on `embedding`. `search_tsv` is `generated always as (...) stored` — **never include it in a client upsert payload** (`lib/outbox.ts`'s `writeRow` strips it automatically; Postgres 400s if a write tries to set it).
- `embed_queue` — `entity_type`, `entity_id`, `content text`, `status text ('pending'|'done'|'error')`, unique `(entity_type, entity_id)` — filled by insert/update triggers on `tasks`/`inbox_items` (update triggers are WHEN-guarded on the actual searchable columns so the `embed` function's own `embedding`-only writes don't loop), drained by the `embed` edge function (cron every 5 min via pg_net, same Vault-secret pattern as `notify`).
- `search_hybrid(query_text, query_embedding, match_limit)` — SQL function (`security invoker`, so RLS on the underlying tables scopes it per-user automatically): FTS (`websearch_to_tsquery`) + vector (cosine, capped at distance < 0.6 to keep unrelated matches out — tightened to 0.45 in migration 0026) each ranked and capped at 40, merged via Reciprocal Rank Fusion (`1/(60+rank)`), top `match_limit` (default 20) returned.
  - **Migration 0031 (punch 49)** widened the **FTS branch only** to `people` (name + every fact label/value), `calendar_events` (title), `projects` (name + `completion_summary`) and `journal_entries` (body + transcript), and added `deleted_at is null` guards so trashed rows stop matching. Returned `entity_type` values are now `task | inbox_item | person | calendar_event | project | journal_entry` (mirrored by `SearchEntityType` in `lib/types.ts`). Those four tables deliberately have **no** `search_tsv` column and **no** GIN index — `to_tsvector` is computed per row inside the query, which is sub-millisecond on a one-person corpus; add stored columns + indexes (exactly as 0008 does for `tasks`) if it ever gets slow. The **vector branch stays `tasks` + `inbox_items`**: only those two have `embedding` columns and `embed_queue` triggers, so the new types are keyword-only.
  - **Migration 0037 (FIX-5, J-7):** same signature, still `security invoker` with `user_id = auth.uid()` on every branch; vector gate tightened to cosine **distance** `< 0.35` (similarity > 0.65; was `< 0.45`) and the vector arm capped at **12** (was 40); RRF weights FTS `1.0/(60+rank)` over vector `0.5/(60+rank)`, so every FTS hit outranks every vector-only hit; for 1–2 word queries a lexical arm (`ILIKE`, the query's `\ % _` escaped) adds a tier to rows whose returned `title` contains every word — **3** the title equals the query, **2** the phrase starts the title or a word in it, **1** anywhere — so a literal title match always ranks, exact titles first; ties go to the shorter title. Checks: `supabase/tests/fix5-search.sh`.
- `resurfaced_log` — `entity_type`, `entity_id`, `shown_on date`, `action text ('pending'|'converted'|'review_later'|'dismissed')`, unique `(user_id, shown_on)` — one pick per day. `do_resurface()` (SQL function, `security definer`, called directly by pg_cron daily — pure DB work, no HTTP hop needed) does a weighted-random pick (weight = days since the entity's last `activity_log` touch, +20 boost if previously `review_later`, excludes anything shown in the last 14 days) over `tasks`/`inbox_items` older than 3 days.
  - **Migration 0035 (FIX-0, audit S4/S6):** `do_resurface()` now loops over every user (was: only the oldest account) and draws each pick only from that user's own `tasks`/`inbox_items`, de-duplicated/boosted against their own `resurfaced_log` and weighted by their own `activity_log` (`on conflict (user_id, shown_on) do nothing`; `execute` still revoked from `public`/`anon`/`authenticated`); `search_hybrid` keeps its signature and `security invoker` but restates `user_id = auth.uid()` on every branch as defence in depth.
- `ai_usage` (migration 0036, SEC-2) — per-user daily AI allowance: `day date` (Africa/Cairo date), `kind text ('chat'|'parse'|'stt')`, `count int`, unique `(user_id, day, kind)`; RLS read-own only, no user writes. Only writer is `ai_usage_bump(p_user_id, p_kind) → int` (`security definer`, `search_path` pinned, `execute` for `service_role` only), an atomic `insert … on conflict do update` that returns the new count; `chat`/`transcribe`/`parse-capture` call it after `requireUser` and answer 429 `{error:'daily_limit'}` past `AI_DAILY_LIMIT_CHAT`/`_STT`/`_PARSE` (defaults 150/60/300).
- **Migration 0038 (drift repair, 2026-09-26):** production ran older copies of 0020/0022, so it re-creates `reload_retainers()` (`security definer`, `search_path` pinned, no RPC grant — 0034's hardening folded in) + the `retainer-reload-monthly` pg_cron job (`0 0 1 * *`: every active retainer project's `checklist` items reset to `completed:false`, one `retainer.reloaded` activity row each), and adds `people_domain_id_idx`, `interactions_person_id_idx`, `interactions_occurred_at_idx` `if not exists`. A no-op on any database that ran the current files.
- **Migration 0040 (scale, 2026-09-27):** (1) `if not exists` indexes for the RLS predicate on every client-read table that lacked one leading with `user_id`: `(user_id)` on `tasks`, `inbox_items`, `routine_completions`, `domains`, `projects`, `areas`, `routines`, `push_subscriptions`, `people`, `interactions`, `books`, `notes`, `quotes`, `commentary`; `activity_log (user_id, created_at)`; `calendar_events (user_id, starts_at)`. (2) pg_cron `cron-history-prune` (`15 3 * * *`): deletes `cron.job_run_details` older than 7 days and `embed_queue` rows with `status = 'done'` and `created_at` older than 1 day (pending/error untouched). (3) `ai_usage_global` — `day date` (Cairo), `kind text ('chat'|'parse'|'stt')`, `count int`, PK `(day, kind)`; RLS on, no policies, no `anon`/`authenticated` grants. Only writer is `ai_usage_take(p_user_id, p_kind, p_user_limit) → (user_count, global_count)` (`security definer`, `search_path` pinned, `execute` for `service_role` only): bumps the per-user counter via the unchanged `ai_usage_bump`, then the global one only if `user_count <= p_user_limit` (else `global_count` is null). The functions now call `ai_usage_take` and answer the same 429 `{error:'daily_limit'}` past either cap; per-user defaults 40/100/30 (chat/parse/stt), global `AI_GLOBAL_LIMIT_CHAT`/`_PARSE`/`_STT` defaults 80/150/1000.

### P7 — life-OS
| Table | Columns |
|---|---|
| `journal_entries` | `body text` (md), `entry_date date`, `mood text?`, `transcript text?`, `media_paths text[]` (Supabase Storage), `gratitude text[]` — **one row per _entry_, many rows per day (D-1, migration 0033).** 0021's UNIQUE `(user_id, entry_date)` index is dropped; `created_at` is the entry's timestamp and the day reads back in that order via `(user_id, entry_date, created_at)`. `mood` + `gratitude` are day-level and ride on the day's **first** entry (handed to the next entry when that one is deleted). Deletes are the shared `deleted_at` soft delete → Trash. Titled standalone notes are **not** here — they're `notes`, parked to v2 with Library |
| `notes` | `title text?`, `body text`, `tags text[]`, `domain_id uuid?` |
| `quotes` | `text`, `author text?`, `source text?` (book/podcast), `tags text[]` |
| `commentary` | `parent_type text`, `parent_id uuid`, `body text` — add-thoughts-over-time feed on notes/quotes |
| `people` | `name text`, `facts jsonb` (birthday, kids, interests…), `domain_id uuid?` |
| `interactions` | `person_id uuid FK`, `summary text`, `occurred_at timestamptz` |
| `content_items` | `title`, `status text check in ('idea','outline','editing','published')`, `channel text?`, `domain_id uuid?`, `outline_md text?`, `sort_order int` |
| `time_entries` | `project_id uuid FK?`, `task_id uuid FK?`, `note text?`, `duration_min int`, `started_at timestamptz`, `ended_at timestamptz?` |

## Edge functions (contracts live in the phase files)

| Function | Phase | Purpose |
|---|---|---|
| `parse-capture` | P2 | text (+ domain/project context) → structured JSON parse + confidence (Groq, schema-constrained) |
| `transcribe` | P2 | audio blob → text (Groq Whisper) |
| `gcal-sync` | P3b | incremental Google Calendar pull/push (optional) |
| `notify` | P4 | Web Push sender — digests, missed routines, overdue, task_reminder (called by pg_cron via pg_net; task_reminder added in P1–P4 retrofit) |
| `embed` | P5 | drain `embed_queue` → gte-small embeddings (Supabase.ai); `{backfill:true}` one-off mode |
| `chat` | P5 | hybrid retrieval (FTS + pgvector RRF) → Groq streaming SSE, citations |
| `search` | P5 | same hybrid retrieval as `chat`, no Groq round-trip — powers the Search UI |
| `github-sync` | P6 | poll assigned issues → `inbox_items` + AI priority ranking |
