---
date: 2026-09-27
session: local (laptop, bypass)
type: decision
related: Kai's screenshot, "There aren't any releases here"
---

# Every shipped version becomes a GitHub Release with the APK + Windows installer

v1.0.0–v1.0.2 shipped through `claude/ship-v*` branches, so GitHub never had a tag, a Release or a downloadable app.
- **Now:** `release.yml` → after the live check, a **publish** job creates Release `vX.Y.Z` at the live master commit with generated notes. It then **calls** `android.yml` and `desktop.yml` (now `workflow_call` with a `tag` input), which stamp `tauri.conf.json` with the version, build, and attach `kais-flow-vX.Y.Z.apk` and `kais-flow-vX.Y.Z-windows-setup.exe`.
- **Why call instead of trigger:** a Release made with `GITHUB_TOKEN` can't start other workflows.
- **Consequence:** `android.yml`/`desktop.yml` no longer listen for `release: published`. Otherwise a Release published by hand would build twice, because `release.yml` already runs on it.
- **Version stamping:** Android needs a rising version to accept an update over an older install. It still also needs one persistent signing key ([KAI]: the `ANDROID_KEYSTORE_*` secrets).
- **Older versions:** v1.0.0–v1.0.2 get no retroactive Release. Creating one would re-run the pipeline on an old commit, and its merge check would stop it. The first Release is v1.0.3; its notes cover everything since the start.
