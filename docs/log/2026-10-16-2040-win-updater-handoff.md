---
date: 2026-10-16
session: win-updater (builder, worktree .claude/worktrees/win-updater)
type: handoff
related: Kai 2026-10-16, no more "Windows protected your PC" on every Windows update ($0: no code signing, no Store account needed)
---

# 2026-10-16 20:40 Cairo · handoff · win-updater

Branch `claude/win-updater`, from `claude/kai-bugs-1012` (master v1.2.0). Pushed. Not merged, not released.

## Why

Update on Windows used to open the new `.exe` in the browser. A browser download carries Mark-of-the-Web, so
SmartScreen showed its blue screen on every update. Now the app downloads the signed installer itself and runs
it: no browser, no Mark-of-the-Web, no SmartScreen. The first install of the version that has this still shows
it once, because that one still comes from the browser.

## What changed

- **Key** (minisign, free): private key + password only in `C:\Users\khair\.kaisflow-signing\`
  (`tauri-updater.key`, `tauri-updater-password.txt`, public half `tauri-updater.key.pub`). GitHub secrets
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set from those files. Public key in
  `tauri.conf.json` `plugins.updater.pubkey`.
- **Shell** (`app/src-tauri`): `tauri-plugin-updater` 2.14 (desktop deps), registered in `src/lib.rs`;
  `serde_json` added (generate_context! needs it once `plugins` has config); `updater:default` in
  `capabilities/default.json`; `bundle.createUpdaterArtifacts: true`; endpoint
  `releases/latest/download/latest.json`; Windows `installMode: passive`. No process plugin: on Windows the
  updater exits the app itself and the installer's `/R` reopens it.
- **Installer** (`installer/installer.nsi` `.onInstSuccess`): after an update it reopens the app without the old
  run's `/ARGS`. A start-with-Windows run has `--minimized`, which would have brought the new version back
  hidden in the tray.
- **CI**: `desktop.yml` Build gets the two secrets. With them it builds normally and gets the `.sig`. Without
  them it passes `--config '{"bundle":{"createUpdaterArtifacts":false}}'` and stays green. Collect copies the
  `.sig` beside the versioned exe; Attach writes `latest.json` (version, notes = release body, pub_date,
  `windows-x86_64` = the `.sig` + the versioned `kais-flow-<tag>-windows-setup.exe` URL) and uploads it with
  the `.sig` in the same `gh release upload --clobber`. `release.yml`'s `desktop` job now has
  `secrets: inherit`. The msix job is untouched.
- **App**: `lib/appUpdate.ts` `installUpdate(url, onProgress)`: on Windows, dynamic-imports
  `@tauri-apps/plugin-updater`, `check()` and `downloadAndInstall()`. Any error, or no update in
  `latest.json`, falls back to `openDownload(url)`. `progressLine()` writes "Downloading… 42%".
  `features/whats-new/WhatsNew.tsx` `UpdateButton` calls it and shows the progress line in place of the
  button (`useWhatsNew.installing`). Settings → App's lone "Download" button is now that same `UpdateButton`.
  Android is unchanged (browser download). A Store install is still `kind: 'store'`, so it never gets there.
- **Docs**: `docs/MICROSOFT-STORE.md` "Updates", `docs/INSTALL.md` step 4.

## Gate

- `npx tsc -b`: 0 errors.
- `npx vitest run`: 164 files, 2269 tests pass. 4 new in `appUpdate.test.ts`: installs with progress, three
  fallbacks, Android untouched, progress line.
- `npm run lint`: exit 0, 0 errors (24 old warnings).
- `npm run build`: OK. Entry `index-*.js` 361.60 kB (115.08 gz), about +0.9 kB. The updater is its own 3 KB chunk.
- `ds:check --baseline`: 0 new.
- `cargo check`: OK.
- Local `tauri build --bundles nsis` with the key: OK (8m40s). It writes `Kai’s Flow_1.0.0_x64-setup.exe` and its
  `.sig`. A node check (Ed25519 over BLAKE2b, what the updater checks) verified that `.sig` under the pubkey in
  `tauri.conf.json`, also for a renamed copy (the CI case). It rejected a tampered file.
- The same build without the key, with CI's `--config '{"bundle":{"createUpdaterArtifacts":false}}'`: OK, and no `.sig`.

## Not verified

- A real update end to end: an installed app updating from a release that has `latest.json`. The first chance
  is the release after the next one. The next release still installs through the browser, because v1.2.0 has
  no updater. It is the first version that can update in place.
- The CI steps themselves: no tag run was made from here.
