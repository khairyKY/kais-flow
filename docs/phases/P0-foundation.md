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

**Next session must do, in order:** (1) `[KAI]` finish Supabase project / Groq key / Cloudflare Pages per step 1 and hand back Supabase URL + anon key; (2) `supabase link --project-ref <ref>` + `supabase db push` to apply migration 0001; (3) replace `app/.env` placeholders with real values; (4) `supabase secrets set GROQ_API_KEY=...` (not needed until P2, but fine to set now); (5) `[KAI]` create the single auth user in the Supabase dashboard (no sign-up UI by design); (6) connect Cloudflare Pages to the `kais-flow` GitHub repo (root `app/`, build `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) and push to trigger the first deploy; (7) re-run the full acceptance checklist against the live deployment (installability, offline shell, login persistence) before marking P0 done.

- **2026-07-03 (session 2, Sonnet):** Kai generated a Supabase personal access token ("Kai's Flow" token) so the CLI can automate migrations/secrets going forward — stored only as an ephemeral env var per command, never written to a repo file. Completed: (1) `supabase link --project-ref eqbbkitofgyxxrfggpbu` ✅ (2) `supabase db push` applied migration 0001 ✅ (Docker warning during push is unrelated — local edge-runtime image caching, not required for a remote push) (3) `app/.env` has the real `VITE_SUPABASE_URL` (anon key still placeholder, pending Kai) (4) `supabase secrets set GROQ_API_KEY=...` ✅ (`secrets list` confirms only a digest is retrievable, not plaintext).
- **Still blocked on Kai:** anon key (Project Settings → API), creating the single auth user (Authentication → Users → Add user), and connecting Cloudflare Pages (guide given in chat — root dir `app/`, branch `master`, build `npm run build`, output `dist`).
