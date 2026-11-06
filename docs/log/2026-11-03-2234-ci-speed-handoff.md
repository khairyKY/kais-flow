# ci-speed handoff (2026-11-03)

Branch `claude/ci-speed` (files: `.github/workflows/release.yml`, `android.yml`, `desktop.yml`). Not merged, no release made.

## Before (last 3 release runs on claude/ship, wall clock from push)

| Run | Gate | Rehearsal | Deploy | Publish | Android build / smoke | Windows | Mac | Whole run |
|---|---|---|---|---|---|---|---|---|
| 40962010808 (Oct 29, v1.5.x) | skipped (preship) | 3:32 | 6:36 | 0:10 | 3:36 / 3:23 | 6:30 | 8:33 | 19:26 (17:35 if Mac off) |
| 40799581039 (Oct 29) | ran, 3:19 | 3:02 | 11:34 | 0:07 | 5:13 / 3:09 | 10:58 | 13:16 | 28:47 |
| 40797503709 (Oct 29) | skipped | 3:07 | 6:46 | skipped (the skipped-ancestor bug) | skipped | skipped | skipped | 10:00 |

Everything was serial: preship, rehearsal, deploy, publish, then the builds. Rust, npm and Gradle caches already hit on claude/ship (the logs show "Cache hit" for node, rust-cache v0-rust-windows/macos and setup-java gradle), so no cache change was needed; it only works on claude/ship, not on a new branch.
Deploy detail (run 40962010808): checkout 0:29, backup 2:29, migrations 0:17, functions 0:41, wait-for-live 2:16, auth 0:09.

## What changed

- `plan` job (10-30 s) works out the label and the version tag exactly like deploy ("Prepare the merge") and builds start from it at second 0, beside the rehearsal and the deploy, from the same commit. Publish fails if its tag differs from the plan's.
- `android.yml` and `desktop.yml` only build and upload artifacts now (the Windows artifact also carries the `.sig`). New `mode` input on android.yml: `build` / `smoke` / '' (all, for the mobile-branch pushes).
- `attach-android` and `attach-desktop` (in release.yml) need `[publish, build]` with explicit `!cancelled() && needs.X.result == ...` conditions. Windows installer, latest.json (windows entry), msix, Mac files and the darwin merge (with its "lost entry" check) run in one job in that order, so latest.json is never raced. releases.sh, latest-json.mjs and the signing are unchanged. Publishing to both repos still goes through `release_upload`.
- Nothing is published or attached if the rehearsal, gate, backup or deploy fails: attach needs publish, publish needs deploy, deploy needs rehearse/backup/gate.
- Emulator smoke test is its own call (`mode: smoke`) after the Android build, beside the attach, not before it. It still turns the run red if it fails.
- Backup is its own job beside the rehearsal (both dumps in parallel); deploy waits for it. Pruning to 14 stays in deploy, so failed rehearsals never evict old backups. Trade-off: the backup is taken a few minutes before `db push` instead of seconds.
- Edge functions: only those changed since the newest `v*` tag merged into HEAD (including folders they import, chat/widget -> mcp). Falls back to all on: no earlier tag, `_shared`/files beside the function folders/`supabase/config.toml` changed, or the FUNCTIONS line in release.yml changed.
- Auth-email step now runs before "wait until live" (it is independent).
- The two rehearsal jobs were already parallel. `rust-cache` and npm cache were already in place.
- New `workflow_dispatch` input `build_only` (+ `build_tag`, default `v0.0.1-ci-test`): plan + builds + smoke only, own concurrency group so it never queues behind a release. Nothing is published, attached or deployed.
- Tried and reverted: sparse checkout for the cargo builds (cargo lists package files via git and failed). Android keeps a sparse checkout.

## After (proof run 41711910052, build_only on claude/ci-speed, cold cargo cache)

| Job | Start offset | Duration |
|---|---|---|
| Plan | 0:00 | 0:29 |
| Android build | 0:32 | 4:55 |
| Emulator smoke (beside, not blocking) | 5:34 | 3:37 |
| Windows installer | 0:32 | 10:47 (cold rust cache: a branch can't read claude/ship's cache; warm it is ~6.5) |
| Whole run | | 11:19 |

Projected real release on claude/ship with warm caches (not run, it would need a real release): critical path = plan + max(rehearsal 3.5 min + deploy ~7 min without the 2.5 min backup, builds ~7 min) + publish 0:10 + attach ~0:30, about 11 min, against 17.5 min (Mac off) / 19.5 min (Mac on) before. With the gate running in CI it is gate/rehearsal then deploy, builds still hidden behind them. Mac (when MAC_ON_RELEASE) now ends around the same time as the deploy instead of 8+ min after it.

## Not proven live

attach-android / attach-desktop, the backup job, the prune step and the changed-functions step only run in a real release (they need the owner, secrets and a publish). They were checked by reading, YAML parse and the workflow loading; first real release should be watched. If it misbehaves, revert the merge of this branch.

## Note

Someone's "docs(log): v1.6.2 release" commit on claude/kai-bugs-1012 swept up my first half-done android.yml/desktop.yml edits (it is in that branch's history; those files are inconsistent with release.yml there until this branch merges).
