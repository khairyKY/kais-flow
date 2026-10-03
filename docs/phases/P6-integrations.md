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
- [ ] Newly-assigned GitHub issue appears in Inbox ≤30 min with a sensible priority + one-line reason — *half:* it arrives within 30 min (0042 cron, `docs/log/2026-09-27-0711-p6-github-handoff.md`), but there is no priority or reason: step 3 was skipped on purpose
- [x] Re-running sync creates no duplicates (node_id dedupe) — `docs/log/2026-09-27-0711-p6-github-handoff.md` (mocked run: a node_id known in any status is never re-inserted; 0027's unique index is the backstop; `githubPlan.test.ts`)
- [x] Issue closed on GitHub → its pending inbox item auto-dismisses — `docs/log/2026-09-27-0711-p6-github-handoff.md` (the closed issue dismissed with `dismiss_reason: 'closed on GitHub'`; a still-open one only stamped `checked_at`)
- [x] PAT absent from client bundle and from any client-readable table select — `docs/log/2026-09-27-0711-p6-github-handoff.md` (client selects JSON paths `login`/`status`/`synced_at` only; `grep github_pat_ dist` finds only the input placeholder)
- [ ] A smart list ("due this week #shaheen") survives reload and appears on the other device — not built
- [ ] `buy tires *errand !!` creates a priority-2 task labeled `errand`; the label renders as a chip and a label smart list finds it — not built (`!!` works; there is no `*label` syntax and no smart lists; labels exist as chips on the task)
- [ ] Settings shows integrations status, theme switch (persists via `data-theme`), ritual reminder times that actually reschedule the notify cron, and the org-admin tools; the Tasks page no longer opens with the admin console (#66 closed) — *partly:* integrations status, theme switch and ritual reminder times read by the notify cron are there (`docs/log/2026-10-03-1330-cleanup-handoff.md`); the org-admin move (#66) is not done
- [ ] Sharing a URL from the phone's share sheet lands it in the Inbox with a backlink — the `/share` route lands the text + URL in the Inbox (`docs/log/2026-09-26-0607-polish-a-handoff.md`, checked by URL on desktop); a real phone share sheet hasn't been verified

## Verification
Assign yourself a test issue → wait/trigger sync → check Inbox · `select payload->>'node_id', count(*) from inbox_items where kind='github_issue' group by 1 having count(*)>1;` returns nothing · build-grep for the PAT pattern.

## Pitfalls
- GitHub search API has a lower rate limit (30 req/min) than core — one search call per sync is plenty; page at 100.
- Fine-grained PATs expire — surface "integration failing" state in settings when the API returns 401 instead of failing silently.
- Rank with ONE batched AI call per sync, not per issue (free-tier request budget).

## Notes / deviations
**2026-09-27 — steps 1–4 (GitHub), branch `claude/p6-github`** (handoff: `docs/log/2026-09-27-0711-p6-github-handoff.md`)
- **Multi-user, not Kai-only.** Every user connects their own fine-grained PAT in Settings › Integrations (also on the phone Settings page, which has no Integrations sub-page). `github-connect` checks it with `GET /user` (and each watched repo with `GET /repos/…`) and stores `{token, login, repos, status}` in `integrations.data` via the service role. The client reads back only `login`/`status`/`synced_at` as JSON paths — never the token.
- **Step 3 (AI ranking) skipped.** One shared Groq free key can't rank ~100 users' issues every 30 min. The GitHub section is ordered by the issue's `updated_at` (newest first) and titled "recently updated". Upgrade path is a `ponytail:` comment in `github-sync/index.ts`: rank only newly inserted issues, one batched call per sync, counted against the global parse cap (`_shared/quota.ts`). The contract's `ranked` field is not returned.
- **Search:** one `assignee:<login>` query + the watched repos OR-ed into as few queries as fit 256 chars (max 10 repos), `sort=updated`, one page of 100 each. A query that answers 422 (repo deleted/renamed since connecting) is skipped, not fatal.
- **Closed detection is verified, not inferred.** Pending items missing from the results are checked with `GET /repos/{repo}/issues/{n}` (≤20 per sync, least-recently-checked first): `closed` → dismissed with `dismiss_reason` 'closed on GitHub'; 404/410 → 'gone from GitHub'; still open (unassigned, repo unwatched) → left pending, stamped `checked_at`. This avoids dismissing an issue that merely fell out of scope as "closed".
- **No resurrection:** new issues are inserted only if no row exists for the node_id in any status (filed, dismissed, trashed). Because dismissed rows compost after 30 days (0032), after the first sync only issues updated since the previous sync (minus 1 h slack for search-index lag) are inserted — a dismissed issue returns only if it sees new activity. Reconnecting resets this (first sync after connect is a full one).
- **401 → `status: 'failing'`**; Settings shows "Token expired — reconnect" and the cron skips failing rows until the user reconnects.
- **Not done here** *(the first three are done as of 2026-10-03, below)*: file→task doesn't carry `payload.url` onto the task ("view issue" link), no source icon beyond the existing kind chip, no labels/age/priority-reason columns on the row (the row shows `repo#number ↗` linking to the issue). Steps 5–7 untouched.

**2026-10-03 — cleanup (builder X, branch `claude/cleanup`)** (handoff: `docs/log/2026-10-03-1330-cleanup-handoff.md`)
- **Step 4 finished, minus the AI part.** GitHub Inbox rows: a small GitHub glyph (instead of the "GitHub" kind chip), the title, then `repo#n ↗`, up to three labels (+N) and the issue's age. `github-sync` now stores the issue's `created_at` in the payload; rows stored before that show how long they've been in the Inbox until their issue next changes (no backfill). Filing an issue writes `tasks.external_ref = {source:'github', id: node_id, url}` (0027's column — no migration) and the phone task sheet + desktop task editor show "View issue". Only `https://github.com/` links ever render (`githubUrl`). Still no rank/priority reason (step 3).
- **Step 6, ritual reminder times:** morning digest + evening nudge each have an on/off and a time per user (`app_settings`, migration 0045), on the desktop Notifications card and a phone card. The cron doesn't get rescheduled per user: both jobs now tick every 15 min with `scheduled: true`, and notify sends each user's reminder on the first tick at or after their time (Cairo wall-clock, `notify/ritual.ts`). A manual service-role call without `scheduled` ignores the time (the backend test suites rely on that) but honours off.
- **Settings honesty:** Google Calendar shows "Coming soon" everywhere (no fake Sync now); the Pushover row is gone (never planned, not $0 — web push replaced it); the summary card's GitHub row shows the real state (token expired / connected · synced <day, time> / not synced yet) instead of "configured".
