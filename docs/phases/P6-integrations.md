# P6 — Integrations (GitHub first)

**Parity rows:** 21–23 (GitHub issues → inbox + AI prioritization · smart lists · optional email capture) · **Status:** see `../ROADMAP.md`

## Goal
The outside world flows into the Inbox — starting with GitHub issues (Kai's addition, beyond both source products).

## Prereqs
P2 done (inbox pipeline + AI ranking pattern). P5 useful but not required.

## Scope
**In:** `github-sync` edge function + cron, AI prioritization of issues, prioritized GitHub section in Inbox, smart lists (saved filters).
**Out (guardrails):** email-forward capture **only if Kai explicitly asks** (Cloudflare Email Routing → Worker → `inbox_items` — spec'd but dormant); write-back to GitHub (closing/commenting on issues) is opt-in later — read-only this phase; no Slack/Notion/etc. adapters yet.

## Steps
1. `[KAI]` Create a GitHub fine-grained PAT (Issues: read; scoped to relevant repos + anything assigned). Settings UI → save via an edge function into `integrations` (provider `github`) — the PAT never reaches client state beyond the input field.
2. **`github-sync` edge function** + pg_cron every 30 min: fetch open issues assigned to Kai (`/search/issues?q=assignee:… state:open`) + issues in watched repos (list in `integrations.data.repos`) → upsert `inbox_items` (kind `github_issue`, **dedupe by issue `node_id`** stored in `payload` with url/repo/labels/updated_at). Issues closed on GitHub → mark matching pending items dismissed with reason.
3. AI ranking: after sync, batch-call a `parse-capture`-style prompt: given issue titles/labels/ages + current Top-3 + due-soon tasks → `{ node_id, priority: 1–5, reason }` per issue → stored in `payload.rank`.
4. Inbox UI: "GitHub" section ordered by rank, showing repo, labels, age, priority reason; file→task keeps `payload.url` backlink (task shows a "view issue" link).
5. Smart lists (`features/smart-lists/`): saved filter jsonb (domain/label/status/due/priority combos) → pinned entries in nav; a smart list is a stored query, not a copy.

## Files
`supabase/functions/github-sync/` · `app/src/features/{integrations,smart-lists}/` · migration only if `integrations` lacks columns (see `../DATA_MODEL.md`)

## Edge-function contracts
`github-sync`: `{ action: 'sync' }` → `{ fetched, new, updated, dismissed, ranked }`. Cron-invoked via pg_net + manual refresh button.

## Acceptance checklist
- [ ] Newly-assigned GitHub issue appears in Inbox ≤30 min with a sensible priority + one-line reason
- [ ] Re-running sync creates no duplicates (node_id dedupe)
- [ ] Issue closed on GitHub → its pending inbox item auto-dismisses
- [ ] PAT absent from client bundle and from any client-readable table select
- [ ] A smart list ("due this week #shaheen") survives reload and appears on the other device

## Verification
Assign yourself a test issue → wait/trigger sync → check Inbox · `select payload->>'node_id', count(*) from inbox_items where kind='github_issue' group by 1 having count(*)>1;` returns nothing · build-grep for the PAT pattern.

## Pitfalls
- GitHub search API has a lower rate limit (30 req/min) than core — one search call per sync is plenty; page at 100.
- Fine-grained PATs expire — surface "integration failing" state in settings when the API returns 401 instead of failing silently.
- Rank with ONE batched AI call per sync, not per issue (free-tier request budget).

## Notes / deviations
_(filled during execution)_
