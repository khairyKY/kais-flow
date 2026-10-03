# P-IMPORT — bring your life in (one-time data import)

**Status:** planned 2026-07-17 · **Sequencing:** tier-0 recommended right after the botanical
merge gate (Akiflow task 8.5) and **before R4**, so the exactness audit runs on a populated
app; remaining adapters any time after. · **Distinct from P6/P9:** those are *live* pipes
(GitHub cron sync, Telegram, gcal). This is *migration*: a user's existing corpus, imported
once, idempotently.

## Goal
A new user (starting with Kai) lands with years of tasks/projects/notes in other tools and
gets them into Kai's Flow in minutes — no empty-app cold start. Kai's immediate need:
populate the app with his real Akiflow data for testing.

## Design stance (ponytail)
**Files in, outbox out. No OAuth, no server adapters, no new secrets.** Every source tool
already has an export (CSV/JSON/Markdown), and we already have a write path that is
RLS-safe, offline-capable, and logged: `lib/outbox.ts` `writeRow` + `logActivity`. Import =
client-side parse → normalized batch → preview → outbox writes. Live-API import is
explicitly OUT (that's P9's shape, if ever needed).

**Akiflow special case — no export needed:** Kai's Akiflow is connected to Claude via MCP.
A Claude session dumps tasks+projects to `akiflow-dump.json` (prompt in PROMPT-BANK), and
the importer reads that file. This also defines our canonical JSON import schema.

## Steps

1. **Migration (next free number) — idempotency keys.** Add `external_ref jsonb` (nullable)
   to `tasks`, `inbox_items`, `journal_entries`, `notes`, `people`, `projects` + a partial
   unique index per table on `(user_id, (external_ref->>'source'), (external_ref->>'id'))
   where external_ref is not null`. Re-running an import upserts instead of duplicating.
2. **`features/import/` wizard** (Settings › "Import data", route `/settings/import`):
   source picker → file drop → adapter parse → **preview** (per-entity counts, sample rows,
   duplicate flags vs existing external_refs) → confirm → chunked `writeRow` batches (~50/
   chunk so the outbox and IndexedDB stay happy) → summary. `logActivity('import.run')`
   with source + counts. All UI from the §04 kit + tokens; States.dc.html empty-state rules.
3. **Adapters** — one pure, unit-tested function per file (`parse(file) → ImportBatch`):
   - `akiflow.ts` — our JSON dump schema (tasks incl. status/priority/duration/planned date/
     project, projects). **Tier-0.**
   - `csv.ts` — generic CSV with a column-mapping UI (map columns → task fields; remembers
     mapping per filename pattern). The universal fallback. **Tier-0.**
   - `todoist.ts` — official per-project CSV template.
   - `ticktick.ts` — backup CSV.
   - `notion.ts` — Notion CSV export (databases). Markdown-zip support later; CSV first.
   - `markdown.ts` — a folder/multi-select of `.md` files → `journal_entries`/`notes`
     (Obsidian vaults, plain notes). Front-matter date if present, else file mtime.
   - `slack.ts` — LATER (P9 territory): workspace export zips are admin-only and
     message-shaped, not task-shaped; revisit only with a real use case.
4. **Normalization rules:** unmapped/unknown fields go whole into `external_ref.raw` (nothing
   silently dropped); source ids into `external_ref.id`; done items import as done (history
   matters for streaks/activity only going forward — no synthetic activity_log backfill).
   Dates → UTC store / Cairo render, same as everything.
5. **Optional AI assist (Groq, existing proxy):** suggest column mapping for weird CSVs —
   ONE batched call on headers + 3 sample rows, never row-by-row. Skippable; no personal
   corpus leaves the client otherwise (privacy rule: import parsing is 100% local).
6. `[KAI]` Produce the source files: run the Akiflow-dump prompt (PROMPT-BANK), export
   Notion CSVs / point at the Obsidian folder as desired.

## Files
`app/src/features/import/**` (wizard + `adapters/*.ts` + tests) · one migration ·
`docs/PROMPT-BANK.md` gains Prompt IMPORT + the Akiflow-dump prompt · Settings gains the
entry card (Settings.dc.html 2a Integrations card language — flag for Kai's eye, no
dedicated canvas exists for the wizard itself).

## Acceptance checklist
- [ ] Kai's real Akiflow dump imports: tasks with priority/duration/dates/projects intact;
      counts in the summary match the dump
- [ ] Re-importing the same file twice → zero duplicates (external_ref upsert proven)
- [ ] A generic CSV maps via the column mapper and lands correctly
- [ ] A folder of .md files lands as journal/notes entries with sane dates
- [ ] Airplane-mode import works (outbox queues, syncs on reconnect)
- [ ] No import data hits any network endpoint except Supabase (and Groq ONLY if the user
      clicks the mapping-assist button)
- [ ] Every import run visible in Activity via logActivity

## Pitfalls
- Big dumps: chunk the outbox writes; don't build one 5,000-row transaction. Show progress.
- Idempotency depends on stable source ids — the CSV adapter has none, so hash
  (title+due+project) into `external_ref.id` and say so in the preview.
- Done-task floods: default the preview to "import open items; completed items optional
  toggle" so Today/Tasks don't drown in history on day one.
- Timezones: Akiflow datetimes are user-local; convert explicitly, don't trust `Z` suffixes.

## Notes / deviations

**Tier-0 shipped 2026-07-18** (build-agent G):

- **Migration `0027_external_ref.sql`** — `external_ref jsonb` + partial unique index on the six
  listed tables **plus `calendar_events`** (deviation: the Akiflow adapter imports events behind
  the default-OFF toggle, so they need the same idempotency key). **Needs `supabase db push`
  before any import runs** — until then task upserts carrying `external_ref` will 400.
  `docs/DATA_MODEL.md` not updated (outside this agent's file ownership) — one line needed.
- **`features/import/`** — `ImportPage.tsx` (wizard at `/settings/import`: source picker →
  drop/pick → csv column mapping → preview with duplicate flags + toggles [completed OFF,
  events OFF] → chunked commit with progress → summary), `api.ts` (fetch existing refs,
  `commitBatch` = ~50-row `writeRow` chunks with `flushOutbox()` awaited between, projects
  before tasks so FKs resolve, `logActivity('import.run')` with source + written/skipped
  counts), `adapters/shared.ts` (types, Cairo-naive→UTC via Intl two-pass — no tz lib
  installed, `mapPriority`, djb2 `stableHash`), `adapters/akiflow.ts`, `adapters/csv.ts`,
  colocated vitest tests (20 passing: mapping, DST-aware tz conversion both halves of the
  year, idempotency-key stability, RFC 4180 quoting).
- **Mapping decisions:** priority GOAL/HIGH→1, MEDIUM→2, LOW→3, NONE→null (app has no goal
  tier; raw survives). `deadline`→`due_at` (Cairo midnight→UTC); `datetime`→`scheduled_start`
  (+duration→`scheduled_end`, default 30) and doubles as `due_at` when no deadline; bare
  `date`→`due_at` fallback. `status:'someday'`→`someday`; "planned for …" strings are
  redundant display text, kept in raw only. `tags`→`labels`. `description` `<br />`→newlines.
  The WHOLE source row goes into `external_ref.raw` — nothing dropped. `plan_week/plan_month/
  parent_task_id/links/url` live only in raw (no app fields).
- **Duplicate strategy:** client-side skip against fetched existing `(source, id)` refs
  (shown in preview as "already here"); already-imported Akiflow projects are *reused* as
  `project_id` targets, not re-created. DB unique index is the backstop only.
- **CSV:** no source ids → `external_ref.id = hash(title+due+project)` (stated in the preview);
  identical-key rows in one file collapse; mapping remembered in localStorage per filename
  pattern (digits stripped). Groq mapping-assist **not** built (step 5 optional; header
  guesser covers the common case — add if a real CSV defeats it).
- **The import run itself is `[KAI]`/orchestrator:** push 0027, open Settings › Import data
  in the browser, drop `akiflow-dump.json`, confirm, re-import once to prove zero duplicates.
  Acceptance items stay unchecked until that run.
- Later-tier adapters (todoist/ticktick/notion/markdown) untouched.

**Integrations wave 1 — file importers, 2026-10-03** (builder W, branch `claude/importers`;
handoff `docs/log/2026-10-03-0723-importers-handoff.md`):

- **Six more sources** in the picker, each a pure `adapters/<x>.ts` + a hand-written-fixture test,
  with a one-line "how to export" on the pick card: `todoist.ts` (per-project CSV, several files
  at once), `ticktick.ts` (backup CSV), Notion (the csv mapper with Notion-aware defaults, source
  `notion`), `markdown.ts` (Obsidian/Markdown files or a vault folder), `kindle.ts`
  (`My Clippings.txt` → Library), `goodreads.ts` (library export → Library).
- **`api.ts` `planCommit`** — the pure plan the preview counts from and `commitBatch` writes.
  `ImportBatch` grew `books`/`quotes`/`notes`/`inbox`; `ImportTask` grew `recurrence_rule` and
  `sourceParentId` (subtasks nest one level deep, under the top-level ancestor, parents written
  first). **Undo this import** on the summary: tasks/events/inbox items to the Trash with
  `external_ref` cleared (so the file can be imported again), projects/books/quotes/notes removed;
  `logActivity('import.undone')`.
- **Deviation — books/quotes dedupe without `external_ref`:** neither table has the column (0027
  skipped them) and this wave adds no migration. Books match by main title (`titleKey`: before the
  first `:`/`(`, letters+digits only), quotes by book + text. An existing hand-added book is reused.
  Ceiling: two different books sharing a main title collapse; the Goodreads rating of a book with
  no review is kept nowhere (a review/private notes becomes a note on the book holding the whole
  row in `external_ref.raw`). Follow-up: `external_ref` on `books`/`quotes` for exact idempotency.
- **Deviation — Todoist priority is NOT inverted:** Todoist's CSV help page says PRIORITY 1 = p1
  (highest) … 4 = p4 — the same way round as ours (1 = "!!!"). 4 → no priority. (Its REST API is
  the inverted one.)
- **Deviation — ⏳ scheduled / 🛫 start → `due_at`**, not `scheduled_start`: in the app that is a
  timed calendar block and an Obsidian date has no time.
- **Dates:** free text goes through `shared.parseLooseDate` — chrono with the command bar's Cairo
  reference; no time → that day's Cairo midnight (like every other date-only import); "every …"
  → `parseRecurrence` → RRULE, due = its next occurrence. The generic CSV adapter now uses it too
  (it used `new Date(text)`, which read "October 5, 2026" on the device's zone).
- **Fixed:** the preview's "already here" flags never matched — the page keyed refs with a space,
  `api.ts` with a NUL. Both use `refKey` now (the NUL is written `\u0000`, so git sees text again).
- **Big files:** adapters hand the event loop back every 50–250 rows (`eachChunked`); one
  `Intl.DateTimeFormat` per zone instead of one per date. 5,000-row Todoist/Notion CSVs, a
  20,000-clipping file and a 2,000-file vault parse in 1–2 s with no slice over ~90 ms.
- Not built: a dropped folder via drag (pick it with "Pick a vault folder…" instead — drop takes
  files); non-English Todoist `DATE_LANG` (chrono is English-only here; the string stays in raw);
  Markdown → `journal_entries`/`notes` from the step-3 bullet (paragraphs go to the Inbox on
  opt-in, per the wave brief).
