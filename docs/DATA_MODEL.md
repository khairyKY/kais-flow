# Kai's Flow — Data Model Reference

> Consolidated schema. Each table notes the phase that introduces it. **Update this file whenever a migration lands.** Sketches here are the contract; exact SQL lives in `supabase/migrations/`.

## Universal conventions (every table)

- `id uuid primary key` — generated **client-side** (`crypto.randomUUID()`) so offline writes are idempotent upserts.
- `user_id uuid not null default auth.uid()` + RLS policy `user_id = auth.uid()` for all of select/insert/update/delete.
- `created_at timestamptz default now()` · `updated_at timestamptz default now()` bumped by the shared `set_updated_at()` trigger.
- All timestamps stored UTC; the client renders Africa/Cairo.
- Realtime: tables the UI subscribes to must be added to the `supabase_realtime` publication.

**Extensions:** `vector` (pgvector, P0), `pg_cron` (P0), `pg_net` (P4 — lets cron call edge functions over HTTP).

## Tables by phase

### P1 — task core
| Table | Columns (beyond universal) |
|---|---|
| `domains` | `name text`, `color text`, `sort_order int` — must survive rename/merge/re-parent cheaply (Jerad's lesson) |
| `projects` | `domain_id uuid FK`, `name`, `type text check in ('standard','retainer')`, `status text` |
| `tasks` | `project_id uuid?`, `domain_id uuid?`, `title text`, `notes text?`, `status text check in ('todo','done','cancelled')`, `due_at timestamptz?`, `scheduled_start/scheduled_end timestamptz?`, `top3 bool default false`, `snoozed_until timestamptz?`, `recurrence_rule text?` (RRULE), `labels text[]`, `priority int?`, `completed_at timestamptz?` — indexes: `(status, due_at)`, `(domain_id)`, `(top3) where top3` |
| `inbox_items` | `kind text check in ('text','voice','github_issue','email')`, `raw_text text`, `transcript text?`, `ai_parse jsonb?`, `confidence real?`, `status text check in ('pending','filed','dismissed')`, `filed_task_id uuid?`, `payload jsonb?` (source metadata, e.g. GitHub issue url/repo/node_id) |
| `activity_log` | `event_type text` (e.g. `task.created`, `task.completed`, `routine.checked`, `journal.created`, `entity.reviewed`), `entity_type text`, `entity_id uuid`, `payload jsonb` — **append-only; the spine.** Slipping, streaks, digests, resurfacing only read this. Index `(entity_type, entity_id, created_at)` |

### P3 — calendar
| Table | Columns |
|---|---|
| `calendar_events` | `title text`, `starts_at timestamptz`, `ends_at timestamptz`, `all_day bool`, `task_id uuid?` (time block for that task), `source text check in ('native','gcal')`, `gcal_id text?`, `gcal_etag text?`, `busy bool default true` |
| `integrations` | `provider text` ('google','github'), `data jsonb` (tokens, cursors, syncToken) — **server-side only; never selected by the client beyond connection status** |

### P4 — routines & notifications
| Table | Columns |
|---|---|
| `routines` | `name text`, `time_of_day text check in ('morning','afternoon','evening')`, `cadence jsonb` (weekday mask), `challenge_start date?`, `challenge_end date?`, `active bool` |
| `routine_completions` | `routine_id uuid FK`, `completed_on date`, unique `(routine_id, completed_on)` — streaks are always computed, never stored |
| `push_subscriptions` | `endpoint text`, `keys jsonb`, `device_label text` |
| `app_settings` | single row: `timezone text default 'Africa/Cairo'`, `digest_hour int`, `confidence_threshold real default 0.75`, `slipping_default_days int default 7` |

**View `slipping`** — last `activity_log` touch per domain/project vs threshold → rows that are going stale.

### P5 — search & chat
- `tsvector` generated columns + `embedding vector(384)` (gte-small) added to `tasks`, `inbox_items` (and P7 content tables as they land).
- `embed_queue` — `entity_type`, `entity_id`, `content text`, `status` — filled by triggers on searchable tables, drained by the `embed` edge function on a cron.

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
| `time_entries` | `task_id uuid?`, `project_id uuid?`, `started_at`, `ended_at?` |

## Edge functions (contracts live in the phase files)

| Function | Phase | Purpose |
|---|---|---|
| `parse-capture` | P2 | text (+ domain/project context) → structured JSON parse + confidence (Groq, schema-constrained) |
| `transcribe` | P2 | audio blob → text (Groq Whisper) |
| `gcal-sync` | P3b | incremental Google Calendar pull/push (optional) |
| `notify` | P4 | Web Push sender — digests, missed routines, overdue (called by pg_cron via pg_net) |
| `embed` | P5 | drain `embed_queue` → gte-small embeddings (Supabase.ai) |
| `chat` | P5 | hybrid retrieval (FTS + pgvector RRF) → Groq streaming SSE |
| `github-sync` | P6 | poll assigned issues → `inbox_items` + AI priority ranking |
