# P6 — Integrations (GitHub first)

**Parity rows:** 21–23 (GitHub issues → inbox + AI prioritization · smart lists · optional email capture) · **Status:** see `../ROADMAP.md`

## Goal
The outside world flows into the Inbox — starting with GitHub issues (Kai's addition, beyond both source products).

## Prereqs
P2 done (inbox pipeline + AI ranking pattern). P5 useful but not required.

## Scope
**In:** `github-sync` edge function + cron, AI prioritization of issues, prioritized GitHub section in Inbox, smart lists (saved filters) **+ labels UI**, **full Settings page** (incl. Appearance card + ritual reminder times + relocated org-admin, steps 6), **external capture endpoint** (step 7). *(Steps 5–7 amended/added 2026-07-08 by the research replan — routing rationale in `../research/AKIFLOW-GAP-ANALYSIS.md`.)*
**Out (guardrails):** email-forward capture **only if Kai explicitly asks** (Cloudflare Email Routing → Worker → `inbox_items` — spec'd but dormant); write-back to GitHub (closing/commenting on issues) is opt-in later — read-only this phase; no Slack/Notion/etc. adapters yet.

## Steps
1. `[KAI]` Create a GitHub fine-grained PAT (Issues: read; scoped to relevant repos + anything assigned). Settings UI → save via an edge function into `integrations` (provider `github`) — the PAT never reaches client state beyond the input field.
2. **`github-sync` edge function** + pg_cron every 30 min: fetch open issues assigned to Kai (`/search/issues?q=assignee:… state:open`) + issues in watched repos (list in `integrations.data.repos`) → upsert `inbox_items` (kind `github_issue`, **dedupe by issue `node_id`** stored in `payload` with url/repo/labels/updated_at). Issues closed on GitHub → mark matching pending items dismissed with reason.
3. AI ranking: after sync, batch-call a `parse-capture`-style prompt: given issue titles/labels/ages + current Top-3 + due-soon tasks → `{ node_id, priority: 1–5, reason }` per issue → stored in `payload.rank`.
4. Inbox UI: "GitHub" section ordered by rank, showing repo, labels, age, priority reason; file→task keeps `payload.url` backlink (task shows a "view issue" link). A small **source icon** on each card denotes origin (github/text/voice/email) — the Akiflow §8.3 pattern, our icon language.
5. Smart lists (`features/smart-lists/`): saved filter jsonb (domain/label/status/due/priority combos) → pinned entries in nav; a smart list is a stored query, not a copy. **Labels land here, with their consumer** *(2026-07-08 replan — `tasks.labels` exists in schema, dead in UI)*: label chips on TaskRow + a labels field in Task Detail (UX step 15 built the panel) + `*label` command-bar syntax (parse, strip, chip — unit-tested beside the `#`/`!` tests) + label criteria in the smart-list filter builder.
6. **Settings, the full page** *(2026-07-08 replan; UX step 12a made `/settings` reachable — this makes it complete)*. No single mockup — build from `SCREENS-PART-TWO.md` § "Settings — full version" + `design/Settings.dc.html` (3-card comp) + DESIGN_SYSTEM §4: master-detail integrations list (GitHub connect/PAT status/"integration failing" state per the step-1 pitfall, webhook URL from step 7) · **Appearance card** — Theme Light/Night/Auto writing `data-theme` (the night-theme § D pass builds the theme itself; this card is its switch — if § D hasn't run yet, ship the card with Light + a disabled Night row) · **Rituals card** — per-ritual reminder times feeding the existing `notify` cron (wiki §2.6) · **Manage data** — the Tasks-page org-admin console (domains merge/CRUD, areas/projects lists) relocates here behind a disclosure (#66); Tasks keeps only a "Manage…" link.
7. **External capture endpoint** *(from PLAN_ADDENDUM, scheduled here)*: an authed edge function `capture` accepting `{ text, source?, url? }` → `inbox_items` (kind `text`, payload keeps the backlink) + a PWA **share-target** manifest entry so Android share-sheet → inbox works; a bookmarklet snippet documented in Settings › Integrations. This is the $0 Zapier-equivalent inlet.

## Files
`supabase/functions/{github-sync,capture}/` · `app/src/features/{integrations,smart-lists,settings}/` · `app/src/features/command-bar/parseCommand.ts` (`*label`, +tests) · `app/public/manifest` (share target) · migration only if `integrations` lacks columns (see `../DATA_MODEL.md`)

## Edge-function contracts
`github-sync`: `{ action: 'sync' }` → `{ fetched, new, updated, dismissed, ranked }`. Cron-invoked via pg_net + manual refresh button.

## Acceptance checklist
- [ ] Newly-assigned GitHub issue appears in Inbox ≤30 min with a sensible priority + one-line reason
- [ ] Re-running sync creates no duplicates (node_id dedupe)
- [ ] Issue closed on GitHub → its pending inbox item auto-dismisses
- [ ] PAT absent from client bundle and from any client-readable table select
- [ ] A smart list ("due this week #shaheen") survives reload and appears on the other device
- [ ] `buy tires *errand !!` creates a priority-2 task labeled `errand`; the label renders as a chip and a label smart list finds it
- [ ] Settings shows integrations status, theme switch (persists via `data-theme`), ritual reminder times that actually reschedule the notify cron, and the org-admin tools; the Tasks page no longer opens with the admin console (#66 closed)
- [ ] Sharing a URL from the phone's share sheet lands it in the Inbox with a backlink

## Verification
Assign yourself a test issue → wait/trigger sync → check Inbox · `select payload->>'node_id', count(*) from inbox_items where kind='github_issue' group by 1 having count(*)>1;` returns nothing · build-grep for the PAT pattern.

## Pitfalls
- GitHub search API has a lower rate limit (30 req/min) than core — one search call per sync is plenty; page at 100.
- Fine-grained PATs expire — surface "integration failing" state in settings when the API returns 401 instead of failing silently.
- Rank with ONE batched AI call per sync, not per issue (free-tier request budget).

## Notes / deviations
_(filled during execution)_
