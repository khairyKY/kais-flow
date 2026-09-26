---
date: 2026-09-26T18:39Z
author: conductor (bohr)
type: decision
topic: release-pipeline + v1.0.0
related: docs/DEPLOY-RUNBOOK-v1.md (dated section), .github/workflows/release.yml
---

# Decision: releases ship from GitHub Actions; v1.0.0 = `claude/release-v1`

## Trigger

Kai's laptop run of the runbook stopped on two things:
- `git checkout claude/release-1` was refused because of uncommitted laptop edits;
- `supabase db dump` needs Docker, which isn't installed.

Kai: "figure out smth else … hands-free".

Later Kai:
- added the `SUPABASE_ACCESS_TOKEN` repository secret;
- moved this session out of Auto mode, so production steps now come to him for approval.

## The pipeline (`.github/workflows/release.yml`)

**Trigger:** a `v*` tag, a published Release, or dispatch.

| # | Step | What it does |
|---|---|---|
| 1 | gate | `ci.yml`: tests ×4 TZ, lint, build |
| 2 | merge-tree check | prepares the merge into master **before** any production step; fails if master has commits the release lacks |
| 3 | cron key | Vault `service_role_key` must start `eyJ` |
| 4 | backup | `db dump` schema + data → a private Storage bucket `backups` (same project, so personal data never leaves Supabase) |
| 5 | database | `db push --include-all --skip-vault --yes` |
| 6 | functions | 6 × `functions deploy --use-api` |
| 7 | app | `git push origin master` (Cloudflare builds it) |
| 8 | live check | polls `/version.json` until it shows the merge commit |

**Guards:**
- The repo is public, so nothing prints data or keys (the service key is masked).
- The deploy job runs only for the repo owner.
- `--skip-vault`: CI never writes Vault.

**Checked locally:** the Storage API on the local stack. A missing bucket answers **400** (not 404), so the step checks with GET and then creates.

## What ships as v1.0.0

`claude/release-v1` = `claude/mobile-1` @ 82d568c + this pipeline:
- release-1 (fixes and security) + release-2 (the daily loop) + the M1 web side;
- clover icon, D2 lint fix, native-shell glue that does nothing in a browser.

It's gated in `2026-09-26-1823-bohr-test-run-m1-candidate.md`:
- 752 tests ×4 TZ;
- lint 0 errors;
- sweep 80/80;
- shell-fit 40/40.

The backend changes are exactly release-1's migrations 0030–0037 and the six functions.

**Rollback point:** master `fd54d42`.
