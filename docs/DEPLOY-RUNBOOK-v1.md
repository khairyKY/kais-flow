# Deploy runbook — v1.0 (release-1)

> For Kai, on the Windows laptop, PowerShell, from the repo root. About 20 minutes, done once.
> Order matters: **backup → database → functions → email → frontend → checks.**
> Sources: the FIX-0, SEC-2, FIX-5 and J-11 handoffs in `docs/log/`. This file is append-only: fixes go at the end, dated.

---

## 0 · Get the release code (1 min)

```powershell
cd D:\Coding\kais-flow          # wherever your clone lives
git fetch origin
git checkout claude/release-1
git pull
$env:SUPABASE_ACCESS_TOKEN = (Get-Content supabase\.env | Select-String 'SUPABASE_ACCESS_TOKEN=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value })
npx supabase link --project-ref eqbbkitofgyxxrfggpbu   # once per machine
```

## 1 · Backup (mandatory, 3 min)

Why this is mandatory: migration 0032 turns on the 30-day compost. At its first 03:30 UTC run it **permanently deletes** two kinds of rows:
- Trash rows (tasks, events, journal entries, inbox items) deleted more than 30 days ago;
- dismissed inbox captures untouched for 30 days.

The UI already promises this. The backup makes it recoverable.

Docker Desktop must be running:

```powershell
New-Item -ItemType Directory -Force D:\Coding\backups\kais-flow | Out-Null
npx supabase db dump --linked -f D:\Coding\backups\kais-flow\2026-09-26-schema.sql
npx supabase db dump --linked --data-only -f D:\Coding\backups\kais-flow\2026-09-26-data.sql
```

✅ Both files exist and aren't empty.

## 2 · Two read-only checks (2 min) — Dashboard → SQL editor

```sql
-- a) The cron key must be the legacy service_role JWT (starts with eyJ).
select left(decrypted_secret, 3), length(decrypted_secret)
from vault.decrypted_secrets where name = 'service_role_key';

-- b) Devices whose push endpoint isn't a real push service (they'll stop getting pushes).
select user_id, split_part(endpoint, '/', 3) as host, device_label
from push_subscriptions
where endpoint !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+push\.apple\.com|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+notify\.windows\.com)/';
```

✅ (a) starts with `eyJ`. If it starts with `sb_`, stop: put the legacy service_role key (Dashboard → Settings → API) into Vault as `service_role_key` first, or the cron jobs will get 401.
✅ (b) is informational. Any listed device just needs to turn notifications on again once.

## 3 · Database: migrations 0030–0037 (2 min)

```powershell
npx supabase migration list --linked   # expect 0030 … 0037 pending
npx supabase db push
npx supabase migration list --linked   # expect nothing pending
```

What they do, in one line each:

| Migration | Change |
|---|---|
| 0030 | Settings per user |
| 0031 | Search covers people, events, projects and journal |
| 0032 | 30-day compost |
| 0033 | Many journal entries per day |
| 0034 | Cron functions locked from public calls |
| 0035 | Resurfacing per user; search scoped to the user |
| 0036 | Daily AI allowance; slipping scoped to the owner |
| 0037 | Search finds the literal thing first |

## 4 · Edge functions (3 min) — only after step 3

```powershell
npx supabase functions deploy notify
npx supabase functions deploy embed
npx supabase functions deploy transcribe
npx supabase functions deploy parse-capture
npx supabase functions deploy chat
npx supabase functions deploy search
```

Optional (the defaults are already these): `npx supabase secrets set AI_DAILY_LIMIT_CHAT=150 AI_DAILY_LIMIT_PARSE=300 AI_DAILY_LIMIT_STT=60`

## 5 · Email for real users (10 min) — Dashboard → Authentication

**a. The sending account ($0, no card):**
1. Create a new Google account for the app (e.g. `kaisflow.app@gmail.com`).
2. Turn on 2-Step Verification.
3. Google Account → Security → 2-Step Verification → **App passwords** → create one named "Supabase". Copy the 16 characters.

**b. Emails → SMTP settings → enable custom SMTP:**

| Field | Value |
|---|---|
| Sender email | the new Gmail address |
| Sender name | `Kai's Flow` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the new Gmail address |
| Password | the app password (no spaces) |

Labels may differ slightly in the dashboard.

**c. URL configuration:**
- **Site URL** = `https://kais-flow.kaidagoat.workers.dev` (not localhost).
- **Redirect URLs**: add exactly `https://kais-flow.kaidagoat.workers.dev/reset`. **Never a wildcard** like `https://*.workers.dev/**`, because reset tokens would go to anyone's site.

**d. Sign In / Providers → Email:**
- minimum password length **8**;
- **Confirm email ON**. Turn this on only after (b) works.

**e. Emails → Reset Password template:** keep the default `{{ .ConfirmationURL }}` link.

✅ Test: on the sign-in page, "Forgot password?" with your own email. The email should arrive from the new Gmail address, and the link should open the reset page.

## 6 · Frontend (1 min, done by the conductor after your OK)

Say **"looks good, push it"**. The conductor then:
1. confirms the tested tree = the merge tree;
2. merges `claude/release-1` into `master`;
3. pushes.

Cloudflare builds and deploys automatically.

## 7 · Live checks (5 min) — you, on https://kais-flow.kaidagoat.workers.dev

- [ ] `…/version.json` shows the merge commit the conductor names.
- [ ] Sign in → Today loads your tasks. Complete a task → an Undo toast appears → Undo works.
- [ ] Create a person → sign out → sign in → the person is still there.
- [ ] Morning ritual → Next → reload → the step is still done. No "couldn't be saved" toast.
- [ ] Journal: type a line → reload → one entry.
- [ ] Calendar: today's column says TODAY under the right date; it opens near now.
- [ ] Search a word you just captured → it's the first result.
- [ ] Settings → Send test notification → your phone buzzes.
- [ ] Open `…/nope` → a calm "This page isn't here".
- [ ] Phone: More sheet → Tasks and Projects are there.
- [ ] Next day after 03:30 UTC, in the SQL editor: `select status_code, left(content::text,200) from net._http_response order by created desc limit 10;` → `200`s, no `401`.

## If something breaks

**Frontend broken:** tell the conductor "roll back". It reverts the merge on `master` (`git revert -m 1 <merge>` + push). Or use the Cloudflare dashboard → Deployments → roll back to the previous deployment.

**Functions misbehaving:** from an older checkout (`git checkout d14962f`), re-run step 4's deploy for that function.

**Data problem:** restore the relevant tables from the step 1 dumps.
- Migrations have no "down" scripts; fixes go forward as a new migration.
- Tell the conductor before restoring anything.

---

## 2026-09-26 16:45 — Hands-free release (replaces steps 0–4, 6 and the first live check)

Kai asked for no laptop steps. `.github/workflows/release.yml` now does the whole backend + frontend order on GitHub's runners (Docker is there, nothing installed on the laptop):

**gate** (`ci.yml`: tests ×4 TZ + build) → **cron-key check** (step 2a, fails if the Vault key isn't `eyJ…`) → **backup** (step 1: schema + data dump, uploaded to a private Storage bucket `backups` in the same project) → **`db push`** (step 3) → **6 functions** (step 4, server-side bundling) → **merge into `master`** (step 6, only if the merge tree = the tested tree; prepared before anything touches production, pushed last) → **waits until `/version.json` shows the merge commit**.

### Once: the token (1 min)
1. https://supabase.com/dashboard/account/tokens → **Generate new token** → name it `GitHub Actions` → copy it.
2. https://github.com/khairyKY/kais-flow/settings/secrets/actions → **New repository secret** → name `SUPABASE_ACCESS_TOKEN` → paste → **Add secret**.

Revoke it any time from the same Supabase page. Fork PRs never see it, and only the repo owner's run can deploy.

### Each release
Push a `v*` tag on the release branch's tested commit (the conductor does this when asked to deploy). Or publish a Release by hand:

#### By hand (30 s)
https://github.com/khairyKY/kais-flow/releases/new →
1. **Choose a tag** → type `v1.0` → *Create new tag on publish*.
2. **Target** → `claude/release-1`.
3. Title `v1.0` → **Generate release notes**.
4. **Publish release**.

Then watch Actions → Release. Green = backend and app are live. The run's summary names the backup file and the live commit.

### If a step fails
Everything stops at that step. Nothing after it runs.

| Failed step | What's true |
|---|---|
| Up to and including the backup | Production untouched. |
| Database | Nothing after it ran. |
| Functions | Database is new, functions and app are still old. Re-publish soon; don't leave it half-done. |
| Wait (last step) | Backend + master done; check Cloudflare → Workers Builds. |

Tell the conductor the failed step; re-publishing (a new tag, e.g. `v1.0.1`) is safe. Pushes already applied are skipped.

### Restoring the backup
Dashboard → Storage → `backups` → download the `.tar.gz` → it holds `schema.sql` + `data.sql`. Tell the conductor before restoring anything.

### Still manual
- Step 5 (Gmail SMTP + URL config): needs the new Gmail account's app password, so it's yours.
- Step 7's human checks.
