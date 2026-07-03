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
_(filled during execution)_
