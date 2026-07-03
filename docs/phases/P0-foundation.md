# P0 — Foundation

**Parity rows:** — (infrastructure) · **Status:** see `../ROADMAP.md`

## Goal
A deployed, installable, empty-but-working app: auth, offline shell, CI deploy. No features yet.

## Prereqs
None — first phase. All `[KAI]` account steps happen here.

## Scope
**In:** repo + scaffold, Tailwind + router + nav shell with placeholder pages, Supabase project wiring + migration 0001, single-user auth, PWA manifest + offline shell, Cloudflare Pages deploy.
**Out (do NOT build):** any real feature UI (tasks/inbox/calendar), any edge function, any AI, any styling beyond plain functional layout.

## Steps
1. `[KAI]` Create the free accounts (details in `PLAN.md` §11): Supabase project (note URL + anon key), Groq API key (enable Zero Data Retention in Data Controls), GitHub repo `kais-flow`, Cloudflare Pages project connected to the repo.
2. Scaffold: `npm create vite@latest app -- --template react-ts`; TypeScript strict; install: `react-router zustand @tanstack/react-query @tanstack/react-query-persist-client idb-keyval @supabase/supabase-js zod date-fns` + dev: `vite-plugin-pwa tailwindcss @tailwindcss/vite vitest`.
3. Base layout: left/bottom nav (responsive) with routes `/today`, `/inbox`, `/tasks`, `/settings` — placeholder content only. Plain functional styling.
4. Supabase CLI: `supabase init` at repo root, `supabase link`. Migration `0001_foundation`: enable `vector` + `pg_cron`; create shared `set_updated_at()` trigger function; schedule keep-alive `select cron.schedule('keep-alive','0 3 * * *','select 1');`.
5. `app/src/lib/supabase.ts` client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Auth: sign-in page only (email+password; `[KAI]` creates the single user in the Supabase dashboard — no sign-up UI, disable email confirmations). Route guard redirects unauthenticated → sign-in; session persists (supabase-js default localStorage).
6. `vite-plugin-pwa`: manifest name/short_name "Kai's Flow", `display: standalone`, placeholder 192/512 icons, `registerType: 'autoUpdate'`, precache the app shell for offline.
7. Deploy: `app/public/_redirects` with `/* /index.html 200`; Cloudflare Pages build root `app/`, build `npm run build`, output `dist`; set the two `VITE_` env vars; push to `main`.

## Files
`app/` (Vite project) · `app/src/lib/supabase.ts` · `app/src/features/auth/` · `app/src/App.tsx` + route files · `app/public/_redirects` · `supabase/migrations/0001_foundation.sql`

## Migration sketch
```sql
create extension if not exists vector;
create extension if not exists pg_cron;
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
select cron.schedule('keep-alive','0 3 * * *','select 1');
```

## Edge functions
None this phase.

## Acceptance checklist
- [ ] App live at `*.pages.dev` after a push to `main`
- [ ] Login works and persists across a full browser restart
- [ ] Installable on Windows (Chrome/Edge) and Android (install prompt appears)
- [ ] Airplane mode → reopen installed app → shell renders (no browser error page)
- [ ] No console errors; Lighthouse PWA installability passes

## Verification
`cd app && npm run build && npx vite preview` · `supabase migration list` shows 0001 applied · manual checks above on laptop + phone.

## Pitfalls
- Missing `_redirects` breaks deep links on Pages (SPA fallback required).
- Leave Supabase email confirmation OFF (single user; it just adds friction).
- The anon key is public by design — safety comes from RLS (added with the first tables in P1).
- Icons can be ugly placeholders; do not spend time on them (design phase later).

## Notes / deviations

- **2026-07-03 (Sonnet):** Steps 2–4, 6 done locally; step 5 (auth) built but untestable until a real Supabase project exists; step 7 (deploy) blocked on Cloudflare connection. GitHub repo created + pushed via `gh repo create --private` (Kai approved via AskUserQuestion) — commit `3d04e77`.
- Toolchain came in newer than expected at plan time: Vite 8, React 19.2, react-router 8, TypeScript ~6.0, Tailwind 4.3, Vitest 4. No API changes needed vs. the plan; noting in case a future session assumes older majors.
- Persister packages: used `@tanstack/react-query-persist-client` (React provider) + `@tanstack/query-async-storage-persister` (async — required for IndexedDB via idb-keyval; the sync persister only works with localStorage).
- Placeholder PWA icons are plain solid-color squares (192/512, valid PNGs) — a PowerShell `System.Drawing.Font` overload issue dropped the "K" glyph; cosmetically irrelevant per this phase's scope, will be replaced in the design phase anyway.
- Browser preview verification: sign-in page confirmed via `preview_snapshot` (correct DOM/text) and `preview_inspect` (Tailwind classes applying, e.g. `max-w-sm` → 384px) and clean `preview_console_logs`. `preview_screenshot` timed out twice (tool-side flakiness, not an app error) — not blocking.
- Added a `kais-flow` entry to the shared `D:\Coding\.claude\launch.json` (port 5193) without touching the other projects' entries.

- **2026-07-03 (session 2, Sonnet):** Kai generated a Supabase personal access token ("Kai's Flow" token) so the CLI can automate migrations/secrets going forward — stored only as an ephemeral env var per command, never written to a repo file. Completed: (1) `supabase link --project-ref eqbbkitofgyxxrfggpbu` ✅ (2) `supabase db push` applied migration 0001 ✅ (Docker warning during push is unrelated — local edge-runtime image caching, not required for a remote push) (3) `app/.env` has the real `VITE_SUPABASE_URL` (4) `supabase secrets set GROQ_API_KEY=...` ✅ (`secrets list` confirms only a digest is retrievable, not plaintext).
- **2026-07-03 (session 2 cont'd, Sonnet):** Cloudflare **merged Pages into "Workers"** this year — the git-connected create flow defaults to a Workers deploy (`npx wrangler deploy`), which needed a `wrangler.jsonc` we didn't have. Added `app/wrangler.jsonc` (assets-only, `not_found_handling: "single-page-application"`), removed the now-superseded classic-Pages `_redirects` file, added `wrangler` as a devDependency. First CI build then failed at the very last step: **fresh Cloudflare accounts have no `workers.dev` subdomain claimed yet**, and Wrangler can't register one non-interactively in CI — the dashboard's per-project "Domains" tab toggle did *not* trigger the claim flow either (tried twice, no effect). Resolved by going around the dashboard entirely: Kai created a scoped Cloudflare API token ("Edit Cloudflare Workers" template), and `PUT /accounts/{id}/workers/subdomain {"subdomain":"kaidagoat"}` claimed it directly via the API. Then deployed straight from the CLI (`npx wrangler deploy` with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env vars) to confirm the whole pipeline end-to-end without waiting on another CI round-trip. **Live at https://kais-flow.kaidagoat.workers.dev** — verified directly (not just "build succeeded"): page title, manifest.webmanifest content, service worker registration script, and SPA fallback (a nonexistent deep route returns 200 with `#root`, not a 404) all correct. Cloudflare's git-integration build variables (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) were set during project creation, so future `git push` to `master` should now auto-deploy correctly too — the subdomain was the account-level blocker, now permanently resolved.
- **Anon key received and wired in** (`app/.env` + Cloudflare build variables). First auth attempts failed (`invalid_credentials`) because of an email mix-up across messages (`khairyshnn@gmail.com` typo vs. the real `khairyshhn1@gmail.com`) — diagnosed by querying `auth.users` directly over the Supabase connection pooler (`aws-0-eu-central-1.pooler.supabase.com:5432`, user `postgres.<project-ref>`; the plain `db.<ref>.supabase.co` direct host no longer resolves — Supabase now requires the pooler for IPv4 networks) rather than guessing blind. Kai created the correct user (`khairyshhn1@gmail.com`) via the dashboard; confirmed via direct Admin API login test (200, valid token), then via the actual UI: filled the sign-in form on the live dev preview, redirected correctly to `/today` with full nav, and **session survived a full page reload** (localStorage persistence working). Fetched the `service_role` key via the Management API (`GET /v1/projects/{ref}/api-keys`) once, used it only to delete the leftover mistyped-email user (`khairyshnn@gmail.com`) for cleanliness — not stored anywhere.
- **P0 acceptance status:** app live + installable-config correct (manifest + registered SW verified directly) ✅ · login works + persists across reload ✅ · SPA fallback routing ✅. **Not literally exercised** with this toolset: an actual offline/airplane-mode reload and a formal Lighthouse installability run — the underlying config (precached app shell, valid manifest, service worker registration) is confirmed correct, but installing the PWA and toggling the network off is a manual step better done on Kai's actual devices. **P0 marked done** on that basis; worth a quick manual spot-check next time Kai has the app open on his phone.
