# Kai's Flow — Data Model Reference

> Consolidated schema. Each table notes the phase that introduces it. **Update this file whenever a migration lands.** Sketches here are the contract; exact SQL lives in `supabase/migrations/`.

## Universal conventions (every table)

- `id uuid primary key` — generated **client-side** (`crypto.randomUUID()`) so offline writes are idempotent upserts.
- `user_id uuid not null default auth.uid()` + RLS policy `user_id = auth.uid()` for all of select/insert/update/delete.
- `created_at timestamptz default now()` · `updated_at timestamptz default now()` bumped by the shared `set_updated_at()` trigger.
- All timestamps stored UTC; the client renders Africa/Cairo.
- Realtime: tables the UI subscribes to must be added to the `supabase_realtime` publication.
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

### P5 — search & chat
- `tsvector` generated columns (`search_tsv`) + `embedding vector(384)` (gte-small) added to `tasks` (title+notes), `inbox_items` (raw_text) — GIN index on `search_tsv`, HNSW (`vector_cosine_ops`) on `embedding`. `search_tsv` is `generated always as (...) stored` — **never include it in a client upsert payload** (`lib/outbox.ts`'s `writeRow` strips it automatically; Postgres 400s if a write tries to set it).
- `embed_queue` — `entity_type`, `entity_id`, `content text`, `status text ('pending'|'done'|'error')`, unique `(entity_type, entity_id)` — filled by insert/update triggers on `tasks`/`inbox_items` (update triggers are WHEN-guarded on the actual searchable columns so the `embed` function's own `embedding`-only writes don't loop), drained by the `embed` edge function (cron every 5 min via pg_net, same Vault-secret pattern as `notify`).
- `search_hybrid(query_text, query_embedding, match_limit)` — SQL function (`security invoker`, so RLS on `tasks`/`inbox_items` scopes it per-user automatically): FTS (`websearch_to_tsquery`) + vector (cosine, capped at distance < 0.6 to keep unrelated matches out) each ranked and capped at 40, merged via Reciprocal Rank Fusion (`1/(60+rank)`), top `match_limit` (default 20) returned.
- `resurfaced_log` — `entity_type`, `entity_id`, `shown_on date`, `action text ('pending'|'converted'|'review_later'|'dismissed')`, unique `(user_id, shown_on)` — one pick per day. `do_resurface()` (SQL function, `security definer`, called directly by pg_cron daily — pure DB work, no HTTP hop needed) does a weighted-random pick (weight = days since the entity's last `activity_log` touch, +20 boost if previously `review_later`, excludes anything shown in the last 14 days) over `tasks`/`inbox_items` older than 3 days.

### P7 — life-OS
| Table | Columns |
|---|---|
| `journal_entries` | `body text` (md), `entry_date date`, `mood text?`, `transcript text?`, `media_paths text[]` (Supabase Storage) |
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
