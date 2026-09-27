# Test Ledger — Kai's Flow

> Append-only (see `docs/CONDUCTOR.md` → DOCUMENTATION RULES). Update a row's state by adding a dated note, never by erasing. 🆕 = added or changed since the conductor loop started (2026-09-26).
> Columns: steps · expected · covered by (test file or "manual") · state (branch / merged / live) · last verified.

## 🆕 Test these first (check by hand on the live app)

_Nothing user-visible has changed since the loop started. The 2026-09-24 changes below are shipped but not yet re-judged by Kai on live._

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| L-1 | Open Today on a cold load (clear the tab, reopen) | A loading state first, never the "nothing here" empty garden before tasks arrive (J-10) | manual | live since `d14962f` (per FIX-PLAN flow; not verified live by this loop) | — |
| L-2 | On Tasks or Today, click a task's title; double-click a row | The task editor opens (J-8) | manual | live since `d14962f` (unverified by loop) | — |
| L-3 | Tasks page when imported repeating duplicates exist | A "tidy them →" link to Settings › Import dedupe (J-18) | manual | live since `d14962f` (unverified by loop) | — |
| L-4 | Around midnight Cairo time, look at Today / Overdue | A task due 23:00 today is in Today; 23:00 yesterday is Overdue (B2) | `features/tasks/grouping.test.ts` + manual | live since `d14962f` (unverified by loop) | 2026-09-26 unit (UTC + Cairo) |
| L-5 | Queue a change offline, let the session expire, come back online and sign in | The queued change lands; nothing is silently dropped (S7 follow-up) | manual | live since `3ff5c86` (unverified by loop) | — |
| L-6 | With the app open in a tab, deploy a new build | The tab reloads itself onto the new build within a visit/focus (`e96cdde`) | manual | live since `e96cdde` (unverified by loop) | — |

## Automated baseline

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| A-1 | `cd app && TZ=UTC npx vitest run` and `TZ=Africa/Cairo npx vitest run` | 204/204 both | all `*.test.ts` | branch `claude/inspiring-bohr-e2vhqo` (T-1) | 2026-09-26 |
| A-2 | `cd app && npm run lint` | no new errors vs baseline (2 known: `ProjectsPage.tsx:23–24`, D2) | oxlint | master | 2026-09-26 |
| A-3 | `cd app && npm run build` | tsc + vite + PWA green | build | master | 2026-09-26 |
| A-4 | `TZ=America/Los_Angeles npx vitest run` | 204/204 once T-2 lands; today 1 known failure (schedule shortcuts are device-local) | `grouping.test.ts` "stays in Next week" | open (T-2) | 2026-09-26 |

## By area
_Rows get added as each area is audited (Phase A) or changed._

## 🆕 release-1 — pending deploy (added 2026-09-26; state: branch `claude/release-1`)

_Check these by hand on live right after the deploy. The runbook's step 7 is the short version._

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| R-1 | People → New person → sign out → sign in | Person still there; any person lost before is recovered with a "Recovered … hadn't saved earlier" toast | `outbox.test.ts` + local e2e (`docs/log/assets/p0/`) | branch | 2026-09-26 local |
| R-2 | Morning ritual → Next → reload | Step stays done; no "couldn't be saved" toast | `activity.test.ts` + local e2e | branch | 2026-09-26 local |
| R-3 | Journal offline: type a sentence, reconnect | Exactly one entry with the full text | P0-B tests + local e2e | branch | 2026-09-26 local |
| R-4 | Offline with a pending change → Sign out | Prompt "N changes haven't synced yet"; Stay keeps them; "Discard & sign out" really signs out | P0-B tests + local e2e | branch | 2026-09-26 local |
| R-5 | Sign-in page → Forgot password → email link | Reset page; the new password works, the old one doesn't | J-11 e2e 38/38 (local) | branch | 2026-09-26 local — live needs runbook step 5 |
| R-6 | New account via "Create an account" | Onboarding runs once, then Today; later sign-ins go straight to Today | Polish A e2e 49/49 | branch | 2026-09-26 local |
| R-7 | Open `/nope`; open `/seasons` | Calm "This page isn't here"; no developer screen; no "Good morning, Kai" | Polish A e2e | branch | 2026-09-26 local |
| R-8 | Calendar week in Cairo | Today's column labelled TODAY on the right date; opens ≈2h before now; overlaps side by side / shingled / "+N more"; weekends off doesn't crash | FIX-2 tests + local e2e | branch | 2026-09-26 local |
| R-9 | New routine with just a name | Anytime / Every day / reminder off; reads "no streak yet" | Polish B tests + local e2e | branch | 2026-09-26 local |
| R-10 | Search a just-captured word; type the first 3 letters of a task title | Exact item first; prefix finds it | `supabase/tests/fix5-search.sh` 31/31 (local SQL) | branch | 2026-09-26 local — live embeddings unverified |
| R-11 | Settings → Send test notification (two accounts) | Only your own devices buzz | `fix0-auth.sh` 79/79, `notify-prune.sh` 12/12 (harness) | branch | 2026-09-26 harness — real push unverified |
| R-12 | Chat / voice after heavy use | Past the daily allowance: calm "refills tomorrow", no crash | `sec2.sh` 110/110 (harness) | branch | 2026-09-26 harness |
| R-13 | Anon-key curl to any function (audit §1.9) | 401 | `fix0-auth.sh` | branch | 2026-09-26 harness |

_2026-09-26 (conductor): R-1 … R-13 re-verified together on the release candidate `6663c83` (app code `7b50920`). See `docs/log/2026-09-26-0834-bohr-test-run-release1-candidate.md`. State stays "branch" until the deploy; then add a dated "live" note per row._

| # | Steps | Expected | Covered by | State | Last verified |
|---|---|---|---|---|---|
| B-1 | Release v1.0.1 migration 0038: on the 1st of a month (first: 1 Oct 00:00 UTC) open a retainer project with ticked checklist items | All items unticked; Activity shows "retainer reloaded" | `docs/log/assets/v1.0.1/0038-pglite-check.mjs` + manual | branch `claude/release-v1.0.1` | 2026-09-26 PGlite |
| B-2 | v1.0.4: capture "buy milk tomorrow" in ⌘K; ask chat "what is due this week?" | The capture files as a task due tomorrow (AI parse works again on gpt-oss-20b); chat answers from your data | manual | branch `claude/release-v1.0.4` | — |
| B-3 | v1.0.4: open Tasks with >1000 tasks (or check Network) | All tasks show; the request has no `embedding` column; several `range` requests if >1000 | `lib/columns.test.ts` + manual | branch | 2026-09-27 unit |
| B-4 | v1.0.5: Settings › Integrations › External capture endpoint › Create key; copy the bookmarklet into a new bookmark; select text on any page and click it | "Sent to your Kai’s Flow inbox ✿"; the text + page URL appear in Inbox; the card shows "last used" today | `captureKey.test.ts` + manual | branch `claude/release-v1.0.5` | 2026-09-27 unit |
| B-5 | v1.0.5: `curl -X POST <capture url> -H "Authorization: Bearer kf_wrong…"` | 401 `capture_key_invalid`; with the real key, 201 and an Inbox item | manual | branch | — |
| B-6 | v1.0.6: Settings › Integrations › GitHub › Connect with a fine-grained token (Issues: read) → Sync now | "Connected as @you"; your open assigned issues appear under Inbox › GitHub with repo#number links; closing one on GitHub dismisses it at the next sync | `githubPlan.test.ts` + manual | branch `claude/release-v1.0.6` | 2026-09-27 unit |
