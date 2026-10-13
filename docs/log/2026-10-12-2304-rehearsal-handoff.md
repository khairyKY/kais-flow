---
date: 2026-10-12 23:04 UTC
session: rehearsal
type: handoff
related: docs/HANDOFF.md §2.5 (release pipeline), §3.2 (0014/0020/0022 drift, 0034 stop), §8 ("rehearsal step") · .github/workflows/release.yml · docs/log/2026-09-26-0450-bohr-decision-local-stack.md
---

# rehearsal: migrations and functions against real Supabase Postgres, before a release

Branch `claude/rehearsal`, cut from `origin/claude/kai-bugs-1012` @ `1fbfbb63`. Not merged. Nothing was deployed, nothing was pushed to production.

**Result: green.** Every migration 0001→0069 applies from scratch on real Supabase Postgres. The pending batch (0060–0067, 0069) applies cleanly on a copy of **production's own schema**. All 11 function entries pass `deno check`, and all five harness suites pass. **No real migration or function bug was found.** The only failures were stale test expectations and one test bug, all listed below.

## What runs: `.github/workflows/rehearsal.yml`

**Triggers:** `workflow_dispatch`, a push to `claude/release-*` (the same branches as CI; never `claude/ship-*`), and `workflow_call` (release.yml uses this).

**Pinned:** Supabase CLI `2.118.0` (the same as release.yml, so migrations apply here exactly as the release applies them) and Deno `2.9.7`.

### Job A "Fresh chain" (no secrets, ~3 min)

1. **`deno check --no-lock`** on every `supabase/functions/*/index.ts`, one function at a time. This is the first type-check most of this Deno code has had: capture, capture-image, chat, embed, github-connect, github-sync, mcp, notify, parse-capture, search, transcribe.
2. **Local auth without email.** This edits the runner's copy of `config.toml` only:
   - `[auth.email] enable_confirmations = false`;
   - `[auth.email.smtp] enabled = false`.

   Why: the file carries production's Gmail sender and Confirm email, so a local sign-up would wait on a mail that never goes out. A tomllib assert proves the edit landed.
3. **`supabase start -x studio,imgproxy,logflare,vector,supavisor`** (the bohr recipe). This applies 0001→latest from scratch, and any migration error fails the job.
   - The local cron jobs are then paused with `cron.alter_job(…, active := false)`. They POST to production's URL, and a runner shouldn't.
4. **The suites**, each in its own step. Each one runs even if an earlier one failed:
   - `fix0-auth.sh --harness`
   - `sec2.sh`
   - `notify-prune.sh`
   - `fix5-search.sh`
   - `retainer-reload.sql` (an extra: one psql line, and 0020's drift was exactly the retainer reload)
5. **Step summary:** per-function check marks, the applied migration list, and each suite's pass/fail line plus any FAIL lines.

### Job B "Production rehearsal" (owner only, `if: github.actor == github.repository_owner`, ~3 min)

1. `supabase link --project-ref eqbbkitofgyxxrfggpbu` with `SUPABASE_ACCESS_TOKEN`.
2. **Production's migration history:** one `select version, name from supabase_migrations.schema_migrations`.
   - It goes through the Management API `database/query` with `"read_only": true`.
   - Pending = files that production hasn't recorded.
   - A version recorded in production with no file here gets a ⚠ line (`db push` refuses that case too).
3. **`supabase db dump --linked`**, the CLI default: schema only, every non-Supabase-managed schema, which here means `public`.
   - A guard fails the step if the file has any `COPY`/`INSERT INTO` line.
   - The dump lives in `$RUNNER_TEMP`, is deleted right after the restore, and is never uploaded.
4. **A fresh local stack with no migrations:** `supabase/migrations` is moved aside for `supabase start`, then put back.
5. **Restore:** `psql -v ON_ERROR_STOP=1 -f` the dump.
   - About 500 "no privileges were granted" warnings come from pg_dump's GRANTs on the vector extension's functions. They are filtered out; errors still stop the restore.
   - Then production's history is written into the local `supabase_migrations.schema_migrations`.
6. **`supabase migration up --local --include-all`.** This applies only the pending files, in order, with the same applier and flag `db push --include-all` uses. The summary lists each pending migration as ✓, ✗ (with the error), or "not reached".

**Toward production, Job B only reads:** the link, one read-only SELECT, and a schema dump. Nothing is written to production's schema or data.

One footnote: the CLI's dump prints "Initialising login role…". That is the Supabase CLI's own temporary login role, the same mechanism release.yml's backup step already uses on every release. No data is printed. The workflow prints only migration versions, counts and line numbers.

### release.yml now needs the rehearsal before `deploy`

```yaml
rehearse:
  uses: ./.github/workflows/rehearsal.yml
  secrets:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
deploy:
  needs: [gate, rehearse]
```

- `gate` (CI) and `rehearse` run in parallel, which adds about 3 minutes. `deploy`, which holds the backup and `db push`, starts only if both are green.
- So a migration that fails against production's real schema stops the release **before the backup or any push**, where 0034 did not.
- Both rehearsal jobs gate the release. A failing harness suite or `deno check` also blocks a ship, which is deliberate: those are the server-side security checks.
- **Not exercised end to end.** The release workflow was not run (as instructed). The called workflow and its secret wiring were validated by the three dispatch runs below. The caller side uses the same pattern as `gate: uses: ./.github/workflows/ci.yml`. Both files parse as YAML.

## Runs

| Run | What | Result |
|---|---|---|
| [38318918352](https://github.com/khairyKY/kais-flow/actions/runs/38318918352) | Push-triggered, once, to register the workflow (a `workflow_dispatch` 404s for a workflow not on master until it has run) | Both jobs stopped at the workflow's own `update cron.job` (permission denied for `postgres`). Before that, **0001–0069 applied from scratch**, all 11 `deno check` ✓, and the production schema restored cleanly. |
| [38319231976](https://github.com/khairyKY/kais-flow/actions/runs/38319231976) | Dispatch | **Production rehearsal ✓.** Fresh chain ✗: fix0-auth 80/5 and sec2 109/1 (stale expectations), retainer-reload test bug. notify-prune 12/0, fix5-search 31/0. |
| [38319927999](https://github.com/khairyKY/kais-flow/actions/runs/38319927999) | Dispatch | **Both green** |

The temporary `claude/rehearsal` push trigger was removed in `57837a10`. Dispatch works now: `gh workflow run rehearsal.yml --ref <branch>`.

### Per suite (run 38319927999)

| Suite | Result |
|---|---|
| `deno check` × 11 functions | all ✓ |
| fix0-auth.sh --harness | 85 passed, 0 failed, 0 skipped |
| sec2.sh | 110 passed, 0 failed, 0 skipped |
| notify-prune.sh | 12 passed, 0 failed |
| fix5-search.sh | 31 passed, 0 failed |
| retainer-reload.sql | all checks passed |

### Per migration

**Fresh chain:** 66 files, 0001–0055 and 0058–0069 (0056/0057/0068 don't exist). All applied ✓ on Supabase Postgres 17.

**Production rehearsal:**
- Production records **0001–0059**.
- Pending = **0060 0061 0062 0063 0064 0065 0066 0067 0069**. Each one applied ✓ on production's restored schema:

| Migration | On production's schema |
|---|---|
| 0060_journal_media | ✓ |
| 0061_event_series | ✓ |
| 0062_notify_drift (`overdue-sweep` unschedule guard, `routine-reminder-sweep`, do_resurface, top3 flag cleanup, realtime publication) | ✓ |
| 0063_notebook_layout | ✓ |
| 0064_search_library | ✓ |
| 0065_notice_kinds (`birthday-notice` cron) | ✓ |
| 0066_resurface_snooze_truth | ✓ |
| 0067_routine_plant | ✓ |
| 0069_label_meta | ✓ |

- No version is recorded in production without a file.

## Changes to the suites (what, and why each is truthful)

**Env fix (fix0-auth, sec2, notify-prune):**
- `npx supabase status` became `${SUPABASE:-npx supabase} status`. CI sets `SUPABASE=supabase`, the pinned CLI on PATH; `npx` would have fetched the latest CLI from npm.
- Kai's usage is unchanged.

**fix0-auth.sh: stale expectations, fixed to the code's truth.**
- **The 2026-10-12 notify changes** (`notify/copy.ts digestNotice`). The morning digest is now "Good morning — N to tend today" / "✶ goal, then … ." with "N overdue." appended. It no longer counts slipping areas. The old wording was "Top-3: … N area(s) slipping."
- **The 2026-10-04 privacy default.** With `lock_screen_names` off, every push says "Unlock to see them".
  - So the test accounts now turn `lock_screen_names` on in setup.
  - Without that, the S1 checks "each user gets their own payload" and "no device got the other user's titles" would pass vacuously on identical bodies. With it, they still bite.
  - The leak check now scans the whole payload rather than only `.body`, so it is stricter than before.
- **task_reminder.** One undated reminder's notice is its title, with an empty body. The check is now on `title | body` = `FIX0 alpha reminder | `.
- **activity_log check.** The digest now writes a `notify.morning_digest` history row per user, by design. The "reminder side effects under A only" check now looks at `task.%` events only. The A-only assertion itself is unchanged.

**sec2.sh: stale end-to-end check.**
- The digest no longer reads the slipping view, so "digest on a1 still counts A's 3 stale entities" has no subject any more.
- It now checks that A's device gets A's own Top 3 while B's activity rows point at A's entities.
- The slipping owner-scoping checks (0013 vs current under RLS, and "0036: A's entities keep A's own last touch") are untouched and pass.

**retainer-reload.sql: a test bug, not a function bug.**
- In the DO block, the table alias `t` in `from tasks t join snapshot b … where t.id …` collided with the PL/pgSQL record variable `t`. That raised `record "t" has no field "id"` at line 82.
- The alias is renamed to `x`.
- `reload_retainers()` had already passed every check before that line (b001/b002 rolled to the 1st at their Cairo times, no copies). After the fix, all checks pass.

No security check was weakened or removed.

## Commits

- `08af2483` ci(rehearsal): the workflow, the release.yml wiring, the `$SUPABASE` env fix
- `0509c624` ci(rehearsal): a temporary push trigger to register the workflow
- `57837a10` ci(rehearsal): `cron.alter_job` instead of `update cron.job`; drops the temporary trigger
- `41efde9e` test(harness): the suite expectations, the retainer-reload alias, the summary fix
- (this handoff)

## For Kai / next

- **Merge `claude/rehearsal`** into the next release branch. From then on, every `claude/release-*` push rehearses, and every ship rehearses before `db push`.
- To rehearse any branch by hand: `gh workflow run rehearsal.yml --ref <branch>`. Once the file is on master, there is also the Actions → Run workflow button.
- **Known limits:**
  - The rehearsal restores production's `public` schema, not Supabase-managed state. That excludes cron jobs, storage buckets and auth triggers, which pending migrations here only touch idempotently or behind guards.
  - A future migration that depends on an existing cron job or bucket in production would need those added to the restore.
