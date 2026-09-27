---
date: 2026-09-27T07:11Z
session: p6-github worker
type: handoff
related: P6 steps 1–4 (GitHub issues → Inbox), multi-user
---

# P6 GitHub handoff: connect a PAT, issues sync into the Inbox

Branch `claude/p6-github`, based on `origin/master`. Not merged, not deployed, no `db push`, no secrets set.

## What changed

- **`supabase/functions/_shared/github.ts`** (new): pure logic + one fetch wrapper, no Deno APIs (the app's vitest imports it). `ghGet` (User-Agent + API version headers), `parseRepos` (`owner/name`, max 10), `searchQueries` (assignee query + repos packed under GitHub's 256-char limit), `toPayload` (github.com URLs only), `planSync` → `{insert, update, recheck}`.
- **`supabase/functions/github-connect/index.ts`** (new): `requireUser` → validates token shape → `GET /user` (401 → `invalid_token`) → `GET /repos/{r}` per watched repo (404 → `repo_not_found` + the repo name) → service-role upsert `integrations {provider:'github', data:{token, login, repos, status:'ok'}}` on `(user_id, provider)` → `{login}`.
- **`supabase/functions/github-sync/index.ts`** (new): service role (cron) syncs every row with `data->>status = 'ok'`, 4 users at a time; a signed-in user syncs only themselves. Per user: search → pending rows + "known" node_ids (any status) → `planSync` → insert new (batch; row-by-row fallback on 23505 if a concurrent sync won) + `inbox.captured` activity → update changed pending rows → recheck ≤20 missing ones via `GET /repos/{r}/issues/{n}` (closed → dismissed + `dismiss_reason`, + `inbox.dismissed` activity) → write `status:'ok', synced_at`. GitHub 401 → `status:'failing'`. The integrations write is guarded by `updated_at = <value read>` so a mid-sync reconnect isn't clobbered. Stable error codes: `not_connected`, `token_expired` (409), `github_unavailable`, `server_error`.
- **`supabase/migrations/0042_github_sync_cron.sql`** (new): pg_cron `github-sync` at `7,37 * * * *`, pg_net + Vault `service_role_key` (0006/0007 pattern), `timeout_milliseconds := 150000`, unschedule-if-exists first.
- **`supabase/config.toml`**: `[functions.github-connect]` / `[functions.github-sync]` with `verify_jwt = true`. **`.github/workflows/release.yml`**: both added to `FUNCTIONS`.
- **`app/src/features/settings/api.ts`**: `useIntegrations` also selects `login:data->>login, status:data->>status, synced_at:data->>synced_at` (JSON paths — the token never enters client state); `connectGithub` (connect, then a first sync), `syncGithub`, `disconnectGithub` (direct delete under RLS); error codes → sentences.
- **`SettingsPage.tsx`**: `GithubProvider` replaces the GitHub "Soon" row — Connect → inline form (password field for the PAT, link to github.com/settings/personal-access-tokens/new with a one-line how-to, optional watched repos) · "Connected as @login · synced 10:32" · Sync now · Disconnect · failing → "Token expired — reconnect" + Reconnect. Also rendered on the phone Settings page (it has no Integrations sub-page); the phone's GitHub read-out says "Token expired" when failing. `ProviderRow` gained an optional `children`.
- **`InboxPage.tsx`**: GitHub section sorted by `payload.updated_at` desc, heading "GitHub · recently updated" (was "ranked by AI"), each row shows `repo#number ↗` linking to the issue (github.com URLs only).
- Docs: `docs/DATA_MODEL.md` (0042 bullet), `docs/phases/P6-integrations.md` Notes (deviations — read them).

## Evidence

- `npx deno@2 check github-sync/index.ts github-connect/index.ts`: clean.
- `app/src/features/settings/githubPlan.test.ts` (11 tests): repo parsing/injection, query packing ≤256 chars, login injection dropped, payload URL allowlist, insert dedupe, no re-insert of known ids, watermark (old skipped / fresh + 1 h slack kept), update only on change, recheck ordering + cap.
- Scratch Deno runs (not committed) of both functions with `fetch` stubbed for PostgREST, auth and GitHub:
  - cron path → `{users:1, failed:0, fetched:3, new:1, updated:1, dismissed:1}`; the request log shows the exact PostgREST filters (`external_ref->>source=eq.github`, `external_ref->>id=in.(…)`, `status=eq.pending`, `user_id=eq.u1` on every write), the known-dismissed issue not re-inserted, the closed one dismissed with `dismiss_reason: 'closed on GitHub'`, the still-open missing one only stamped `checked_at`, and `synced_at` written with the `updated_at` guard. User path → same counts. GitHub 401 → `status:'failing'`, `failed:1`.
  - The PAT appears only in GitHub `Authorization` headers and in the integrations POST/PATCH body — never in a URL, a response, or a log line.
  - connect: good token → 200 `{login}` + upsert; wrong token → `invalid_token`; unknown repo → `repo_not_found` + name; malformed repo / short token → `bad_request`; no bearer → 401.
- PGlite (`docs/log/assets/github/0042-pglite-check.mjs`, stubs cron/net/vault, runs 0042 twice) → `PASS`: exactly one `github-sync` job at `7,37 * * * *`, other jobs kept, the command POSTs to `…/functions/v1/github-sync` with `Bearer <vault key>`, body `{action:'sync'}`, timeout 150000.
- App gate: `npx tsc -b` clean · `npx vitest run` 56 files / 767 tests passed · `npm run lint` 0 errors (23 pre-existing warnings, none in touched code) · `npm run build` ok · `grep -E "github_pat_[A-Za-z0-9_]{20}" dist` → nothing (the only `github_pat_` hit is the input placeholder `github_pat_…`).
- **Not done:** a visual check of the Settings/Inbox UI (no local `.env`/test account in the worktree) — worth a look at desktop + phone width before release.

## Conductor, at deploy

1. `db push` (0042) and deploy `github-connect` + `github-sync` (the release workflow now does both functions). No new secrets.
2. Order doesn't matter much: the cron just gets 404s until the function exists.
3. **Kai (and each user):** create a fine-grained PAT at https://github.com/settings/personal-access-tokens/new — resource owner = the account/org owning the repos, repository access = the repos to track, Repository permissions → Issues: Read-only (Metadata read-only is added automatically), pick an expiry. Paste it in Settings › Integrations › GitHub › Connect. Org repos may need the org to allow fine-grained PATs.

## Risks

- **Fine-grained PATs + search:** results only cover repos the token can see; issues assigned to you in other orgs' repos won't show unless the token's resource owner is that org (one token = one owner).
- **Wall clock:** 100 users × (2 searches + a few DB calls) at concurrency 4 should stay well under the free plan's 150 s; if it doesn't, raise `CONCURRENCY` (tokens are per-user, so GitHub's limits don't interact).
- One page (100) per query: a user with >100 open assigned issues only gets the 100 most recently updated; the rest are never auto-dismissed-wrongly, because dismissal is verified per issue.
- A dismissed issue that composted (30 days) comes back if it gets new activity on GitHub — deliberate.
- `integrations` RLS is still `for all`: a user can read their own `data` (their own token) with a hand-written query. The app never does.
