---
date: 2026-09-26 04:50 UTC
session: bohr
type: decision
related: CONDUCTOR.md TEST STANDARD, FIX-0, FIX-2, FIX-4
supersedes: none
---

# Cloud sessions can do signed-in real runs — local Supabase recipe

Verified this session (screenshot of a signed-in Today at 1280px and 390px):
1. `dockerd &` (as root; the daemon isn't started by default in the cloud container).
2. From the repo root: `npx supabase start -x studio,imgproxy,logflare,vector,supavisor` — pulls images from docker.io, applies **all 34 migrations 0001–0034 cleanly from scratch** (useful evidence for K-c: the unpushed 0030–0034 apply without error on a fresh database).
3. `app/.env.local` (gitignored by `*.local`): `VITE_SUPABASE_URL=http://127.0.0.1:54321` + the stack's public demo `ANON_KEY` (`npx supabase status -o env`). Never production keys.
4. Test user via the local auth API (`POST /auth/v1/signup`); one user per worker so data doesn't collide. Mail (password reset etc.) lands in Mailpit at `http://127.0.0.1:54324`.
5. Dev server on a free port (`npm run dev -- --port 52xx --strictPort`), then Playwright with the pre-installed Chromium (the conductor's smoke script signs in and screenshots desktop + phone).

Rules: the stack is shared by parallel workers — **never `supabase db reset` / `supabase stop`** while others run; never `--linked`, `db push` or `functions deploy` from the cloud.

Environment trap: `api.open-meteo.com` (the weather chip) is blocked by the cloud network policy → one `ERR_TUNNEL_CONNECTION_FAILED` console error per page load. Not an app bug; ignore it in cloud runs only.
