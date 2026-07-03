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
_(filled during execution)_
