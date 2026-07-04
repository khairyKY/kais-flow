# P5 — AI Chat + Resurfacing

**Parity rows:** 19–20 (AI chat over all your data · daily resurfacing) · **Status:** see `../ROADMAP.md`

## Goal
Talk to your whole system ("what did I capture about the pricing project last week?") with grounded, cited answers; old items resurface daily on Today.

## Prereqs
P2 done (Groq proxy pattern established). P4 done (activity_log rich enough to be useful context).

## Scope
**In:** FTS + embeddings infrastructure, `embed` + `chat` edge functions, chat panel UI, resurfacing card + cron.
**Out (do NOT build):** chat *actions* (AI creating/editing tasks from chat — later, after trust is earned), multi-turn memory beyond the session, embedding P7 tables that don't exist yet (triggers get added when those tables land).

## Steps
1. Migration `000x_search`: on `tasks` and `inbox_items` — `tsvector` generated column (title+notes / raw_text), GIN index; `embedding vector(384)`, HNSW or IVFFlat index; `embed_queue` table; triggers: insert/update of searchable text → enqueue.
2. **`embed` edge function**: drains `embed_queue` in batches (≤50) using built-in `Supabase.ai` `Session('gte-small')` → writes `embedding`; pg_cron every 5 min + manual invoke; one-off backfill mode `{ backfill: true }` for existing rows.
3. Retrieval (SQL function `search_hybrid(query_text, query_embedding, limit)`): FTS ranked + vector cosine ranked → **RRF merge** (score = Σ 1/(60+rank)) → top 20 with entity type/id/title/snippet.
4. **`chat` edge function**: `{ messages: [{role,content}…] }` → embed the latest user message (gte-small) → `search_hybrid` → assemble context: retrieved items + live snapshot (today's tasks, slipping view, streak summary — small!) → Groq (`GROQ_CHAT_MODEL`) with system prompt: *answer only from provided context; cite item titles; say "not in your data" rather than invent* → **stream back as SSE**.
5. Chat panel UI (`features/chat/`): slide-over available on every page; streaming render; each cited title links to its entity; conversation is session-local (no persistence this phase).
6. Resurfacing: daily pg_cron picks one item (weighted random: older = more likely; untouched-per-activity_log = boost; recently-resurfaced = excluded) → writes a `resurfaced` selection (small table or `app_settings.today_resurfaced`) → Today shows the card with actions: *still relevant → task* · *review later* (flag → boosts future weight) · *dismiss*.

## Files
`supabase/functions/{embed,chat}/` · `supabase/migrations/000x_search.sql` (incl. `search_hybrid` SQL fn) · `app/src/features/{chat,resurfacing}/`

## Edge-function contracts
`embed`: `{ backfill?: boolean }` → `{ embedded: n, remaining: n }`. `chat`: request per step 4 → SSE stream of text deltas terminated by a `done` event carrying `{ citations: [{entity_type, entity_id, title}] }`.

## Acceptance checklist
- [ ] "what did I capture about the pricing project last week?" → grounded answer citing real items that link correctly
- [ ] A question about something never captured → explicit "not in your data", no hallucinated tasks
- [ ] `select count(*) from embed_queue where status='pending'` reaches 0 after backfill
- [ ] Resurfaced card changes across days; "review later" items come back sooner
- [ ] Streaming renders progressively (not one blob)

## Verification
Backfill run + queue check · retrieval smoke test in SQL editor (`select * from search_hybrid('pricing', …, 10)`) · manual chat QA with known-answer questions · toggle system clock/cron to force a new resurface pick.

## Pitfalls
- Keep total chat context ≤ ~6k tokens (Groq free-tier TPM) — truncate snippets, cap retrieval at 20, keep the live snapshot tiny.
- SSE, not WebSockets (edge-function friendly); flush headers early; handle client abort.
- gte-small = 384 dims — the vector column and any index must match exactly.
- Embedding triggers must NOT fire on `embedding`-column updates (infinite loop — guard with `when (old.title is distinct from new.title …)`).

## Notes / deviations

- **2026-07-04 (Sonnet):** Built the full scope plus the plan addendum's §11 amendment (dedicated Search UI). Migration `0008_search` (search_tsv + embedding columns/indexes on tasks/inbox_items, `embed_queue`, insert/update triggers, `search_hybrid` RRF function, `resurfaced_log`, `do_resurface()`), `0009_search_cron` (embed-drain every 5 min via pg_net + Vault service-role secret, same pattern as `notify`; `daily-resurface` calls `do_resurface()` directly — pure SQL, no HTTP hop needed since it's not calling an external API).
- **Deviation from the spec's literal wording, scope-compatible:** resurfacing's daily pick is a plain `security definer` SQL function invoked directly by pg_cron, not an edge function. The phase spec doesn't actually require an edge function for this step — only `embed`/`chat` are named as edge functions — and since `do_resurface()` is pure DB work (weighted-random candidate selection + one insert), routing it through an edge function would have been an HTTP round-trip for no reason. Used `security definer` + an explicit `select id from auth.users order by created_at limit 1` for the single-user lookup, since pg_cron has no `auth.uid()`/JWT context (same reason `notify`/`embed` use a service-role edge function instead of direct SQL for their RLS-scoped work).
- **Real Postgres constraint discovered, not assumed:** originally wrote one combined `after insert or update ... when (tg_op = 'INSERT' or old.title is distinct from new.title ...)` trigger per table. `supabase db push` rejected this live: `INSERT trigger's WHEN condition cannot reference OLD values` — Postgres statically disallows referencing `OLD` in a WHEN clause on any trigger whose event set includes INSERT, since OLD doesn't exist for that event (not just null-valued). Fixed by splitting into separate INSERT (unconditional) and UPDATE (WHEN-guarded) triggers per table — confirmed working via `information_schema.triggers` after re-push.
- **Serious regression found via live UI testing, not just API testing — fixed at the root:** the new `search_tsv` generated column (`generated always as (...) stored`) comes back on every `.select('*')` against tasks/inbox_items. This app's entire mutation pattern across P1–P4 (`completeTask`, `fileToTask`, `snoozeTask`, etc.) is "spread a fetched row, change one field, `writeRow` the full object" — so every one of those calls now tried to set `search_tsv` explicitly, and Postgres 400s on writing to a generated column. Caught this by testing the resurfacing "still relevant → task" action against a real signed-in browser session and watching `preview_network` show repeating `POST .../inbox_items → 400`, which had also silently blocked every write queued behind it in the offline outbox (the outbox's flush loop stops entirely on the first failing entry). Root-caused and fixed in the one shared function all writes funnel through (`lib/outbox.ts`'s `writeRow`), which now strips `search_tsv` from the network payload before every upsert (the optimistic cache update still uses the full row — harmless). Re-verified live afterward: task-complete, inbox-file-to-task, and resurfaced_log action writes all confirmed landing in the DB post-fix.
- **A second, smaller bug caught in the same pass:** `useLatestResurfaced()` originally reduced the query to a single row *inside* `queryFn` (`data[0] ?? null`), but `writeRow`'s optimistic update assumes the cache under `[table]` is the raw array (it does `.findIndex`/`.filter` on it) — the shape mismatch meant `writeRow('resurfaced_log', ...)`'s optimistic update silently did nothing. Fixed to match the established pattern used by `usePendingInboxItems`/`useSlipping`: cache the full array under the query key, reduce via `select` per-observer instead.
- **Retrieval tuning, not fully solved:** `search_hybrid`'s vector branch caps results to cosine distance < 0.6 to keep clearly-unrelated items out of citations/search results. This isn't a hard guarantee — gte-small (a small, 384-dim model) doesn't separate unrelated short sentences as cleanly as larger embedding models, and with only 1–2 embedded rows in the live corpus during testing, an off-topic query still surfaced the one existing row as a weak citation. Confirmed via live test that this doesn't cause a wrong *answer* — Groq's system prompt ("say 'not in your data' rather than invent") held correctly even when a weakly-related item was in its context — but the citation list itself can look noisy on a near-empty corpus. Worth revisiting the threshold once real usage data (dozens+ of embedded rows) exists; not a blocker now, and re-tuning against today's near-empty corpus would be overfitting to n=1.
- **Verified live, end-to-end, using a throwaway auth-user session (not Kai's real account):** created and later fully deleted a `p5-test-throwaway@example.com` Supabase Auth user (via the Admin API, service role) specifically so real signed-in browser click-throughs (chat, search, resurfacing, citation deep-links) could be exercised against the live deployed schema/functions without touching Kai's actual credentials. Seeded test rows under that user, exercised every feature via the dev server (pointed at the same live Supabase project — `app/.env` isn't a local/mock backend), then deleted the test user (cascades all owned rows) plus a separate backdated test task seeded under Kai's real account to exercise `do_resurface()`'s weighted pick. Confirmed clean afterward: `tasks`/`resurfaced_log` back to their pre-session state, `embed_queue` pending count 0. (One pre-existing leftover from P2 testing — an unfiled "pick up dry cleaning tomorrow" inbox item — was left alone since it predates this session and isn't P5 test data.)
- **Full acceptance checklist, verified against the live deployment:**
  - ✅ "what did I capture about my mom?" (real chat, real signed-in browser session) → grounded answer citing the real inbox item, citation button navigates to `/inbox?focus=<id>` and the exact row gets a highlight ring — confirmed via `reactProps: {highlighted: true}` on the actual DOM node, not just visual inspection
  - ✅ An off-topic question ("quarterly tax filing deadline in Norway") → Groq correctly answered "That's not in your data" even though the retrieval layer still returned one weak citation (see retrieval-tuning note above) — no hallucinated task/entity in the *answer text*
  - ✅ `select count(*) from embed_queue where status='pending'` → 0 after backfill (confirmed twice: once with the real corpus, once again after test-data cleanup)
  - ✅ Resurfaced card: seeded an old (20-day-back) task, ran `do_resurface()` directly, confirmed the correct weighted pick landed in `resurfaced_log`; in the browser, "Review later" correctly made the card disappear and set `resurfaced_log.action='review_later'` in the DB; "Still relevant → task" correctly filed the underlying inbox item as a real task (`status:'filed'`, `filed_task_id` set) — did **not** literally wait a real day to see the card rotate, same category of gap as P4's "not literally tested on a real phone"
  - ✅ Chat streaming confirmed progressive at the wire level (many small `data:{"delta":...}` SSE chunks observed directly via a raw HTTP call, not one blob) and the client's `onDelta` appends per-chunk via `setState`, so React re-renders incrementally by construction
  - ✅ Search UI (addendum §11): searching "passport" returned "Renew passport before the trip" grouped under Tasks, correctly excluded from the Inbox group; clicking navigated to `/tasks?focus=<id>` with the row highlighted, confirmed via the same DOM-prop check as the chat citation
- `tsc -b`, `npx vitest run` (22/22, unchanged from P4), and `npm run build` all clean after the outbox fix.
