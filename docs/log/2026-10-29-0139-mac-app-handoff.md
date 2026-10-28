# mac-app handoff: the desktop app on macOS (2026-10-29)

Branch `claude/mac-app`, from `claude/kai-bugs-1012`. Not merged, not released, no `claude/ship-*` pushed, no GitHub Release made.

Source: `_claude-cloud/kais-flow-ios-pwa-integrations-research-2026-10-29.md`, PART 1 §1.6 (macOS outside the App Store, no paid account).

## What ships

**CI** (`.github/workflows/desktop.yml`, which `release.yml`'s `desktop` job already calls):
- New **`macos`** job beside `windows`. It runs only on a release (`inputs.tag`) or a manual run (`workflow_dispatch`), not on the `claude/mobile-*` pushes that build Windows. It uses `macos-latest`, free because the repo is public.
- Everything Mac lives in **`.github/scripts/mac-build.sh`**: toolchain targets, `npm ci`, the version stamp, the Supabase public config, `tauri build --target universal-apple-darwin --bundles app,dmg`, the checks, and the named files. A future `codemagic.yaml` can call the same script once the repo goes private (`TAG`, `OUT`, `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; the header lists the env).
- One **universal** .app covers Apple silicon and Intel: one .dmg, one `.app.tar.gz`, one `.sig`. latest.json's `darwin-aarch64` and `darwin-x86_64` both point at it.
- **Ad-hoc signed**: `tauri.conf.json` has `bundle.macOS.signingIdentity: "-"`. No notarization.
- The updater bundle is signed with the **same** `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` secrets as Windows.
- **Release assets**:
  - `kais-flow-vX.Y.Z-mac.dmg`, plus a stable `kais-flow-mac.dmg` (`releases/latest/download/kais-flow-mac.dmg`);
  - `kais-flow-vX.Y.Z-mac.app.tar.gz` and its `.sig`.
- New **`updater`** job (`needs: [windows, macos]`, `if: always() && macos succeeded`):
  - It downloads the release's latest.json, which the Windows job wrote, adds the darwin entries, checks that no existing entry changed, and re-uploads it.
  - Because it waits for the Windows job, the two never race. A failed Mac build leaves latest.json exactly as Windows wrote it.
  - On a manual run it merges into the newest release's latest.json in the runner only, uploads nothing, and requires the Windows entry to survive.
- `release.yml`: comments, plus the release-body line "Android APK, Windows installer and Mac .dmg attached below". The updater endpoint and the release target are unchanged.
- **Checks in the job (fail the build):**
  - `codesign -dv` shows `Signature=adhoc`;
  - `codesign --verify --deep --strict` passes;
  - `lipo` shows x86_64 + arm64;
  - the .dmg mounts and holds the .app plus an `Applications` link;
  - the .dmg copy is ad-hoc signed;
  - Info.plist `CFBundleShortVersionString` matches tauri.conf.json's (stamped) version, and `CFBundleIdentifier` is `com.kaisflow.garden`;
  - the .app copied out of the .dmg (`ditto`) starts from its binary and is still running after 25 s;
  - the updater tarball contains the binary.

**Shell** (`app/src-tauri`):
- Tray: no change needed. tray-icon reports physical coordinates on macOS too, and `anchor()` already opens the flyout down from a top bar (`opens_down_from_a_top_taskbar` test). Right-click goes to our menu window, with the native menu as fallback.
- `notify_local`: on macOS, a Notification Center banner via `mac-notification-sys` (macOS-only dependency). It uses the app's own bundle id, otherwise the banner would come from Finder.
  - No buttons: reading a press means blocking a thread per notice. Marked `ponytail:`.
  - Silent when the app played the sound pack itself, as on Windows.
- `app_restart` command: after `downloadAndInstall` on a Mac, the app restarts itself. The Windows installer reopens the app on its own, but the macOS updater doesn't.
- `RunEvent::Reopen`: a click on the Dock icon brings back a window closed to the menu bar.
- Autostart: already `MacosLauncher::LaunchAgent` with `--minimized`.
- Window decorations: the main window was already native, with no custom title bar, so the native macOS title bar and traffic lights apply. Nothing to do.
- Deep links: none exist in the shell (auth email links go to the web app), so nothing to gate.
- MSIX/Store paths: already `#[cfg(windows)]` (`store_app_id` returns `None` elsewhere). The Store UI only shows on `kind: 'store'`.
- Icon: `icons/icon.icns` already existed and is current (it was regenerated with the Source Serif K in `ce0a9de7`), so `tauri icon` wasn't needed.

**Web app** (`app/src`):
- `lib/appUpdate.ts`:
  - `AppPlatform` gains `'mac'`: a Tauri shell whose UA says Macintosh (`isMacUA`). `releaseAssetName(…, 'mac')` returns `-mac.dmg`, and `LATEST_DOWNLOADS.mac` is added.
  - `downloadOrder` puts the device's own app first, now across 3 platforms.
  - The in-place update covers mac and then calls `app_restart`.
  - The fallback opens the .dmg in the **system browser**, because WKWebView has no downloads and would navigate away.
- `notifications/device.ts` / `plan.ts`: a `'mac'` channel, with test copy that points at System Settings → Notifications.
- `whats-new/check.ts`: the native "vX is out" notice now goes to Mac as well as Windows.
- `DownloadBar`: Android · Windows · Mac (Settings → App's "Download the apps" uses the same links).
- Settings → On this computer, on a Mac:
  - the card note reads "Mac app only";
  - "Show in the system tray" reads **"Show in the menu bar"**;
  - "Start with Windows" reads **"Open at login"** ("Opens quietly to the menu bar").
- Keyboard: every shortcut already accepts `metaKey`, and the overlay says "On a Mac it's ⌘". Copy/paste/⌘Q come from Tauri's default macOS menu.
- Tests: `appUpdate.test.ts` covers the 3-way download order (iPhone stays Android-first), the mac asset name, mac-vs-windows detection, the mac update calling `app_restart`, and the mac fallback using the opener rather than `location.assign`.

**Site** (`site/`, source only, **not deployed**):
- A Mac row in "Get it" (`DMG_LATEST`).
- A `#mac` section on /download/ with 3 steps.
- A new guide, `/guides/install-mac/`: download and drag; "Kai's Flow" Not Opened → Done; Privacy & Security → Open Anyway → password → Open; the one-hour window; `xattr -cr` for Terminal users; menu bar, notifications, Open at login, ⌘; updating and removing. Its share card is `public/og/guide-install-mac.png`.
- The download card now says "Web, Android, Windows and Mac", and so do the platform lists on home, features and what's-new.
- **Deploy the site only after the first release that carries the .dmg**, or the Mac button 404s.
- `docs/INSTALL.md` has a Mac section.

## Verification
- **CI run 1** (`40779385954`, manual, the steps inline): all green.
  - Build Mac app: dmg 68.5 MiB, `Format=app bundle with Mach-O universal (x86_64 arm64)`, `Signature=adhoc`, valid on disk, the .dmg holds `Applications -> /Applications`, the smoke launch ran 25 s without a crash.
  - Build Windows installer: success. Microsoft Store package: success.
  - Updater manifest: `latest.json platforms: windows-x86_64, darwin-aarch64, darwin-x86_64`, with the v1.5.0 Windows URL unchanged.
- **CI run 2** (`40781590271`, the steps moved into `mac-build.sh`): all 4 jobs green.
- **CI run 3** (`40782829663`, after merging `claude/kai-bugs-1012`@e39abf90 with the licence work): all 4 jobs green. The licences prebuild ran in both builds: Mac `licenses: 49 JS packages, 267 Rust crates`, Windows `… 240 Rust crates`. `app/scripts/licenses.mjs` maps Tauri's `universal-apple-darwin` (unknown to cargo) to both slices with a repeated `--filter-platform`, and the heading now reads "Rust crates (the desktop app)".
- Local: `cargo check` (x86_64-pc-windows-msvc) clean before and after the merge, and Cargo.lock gains only `mac-notification-sys`.
- Gate (`gate.ps1`), before and after the merge: vitest ×4 TZ 2680/2680, lint 0, build, ds:check 0 new.
- Site: `node build.mjs` 32 pages; `check-links` all resolve.

## Only a real Mac can tell
- Gatekeeper wording and the Open Anyway flow on 15 / 26, and that the ad-hoc .dmg isn't called "damaged".
- That the WebView works under `tauri://localhost`: sign-in, IndexedDB/outbox, `crypto.randomUUID`, the service worker (expected to be absent), and Supabase realtime.
- The menu-bar K at 2× (the 32 px strip drawn at 18 pt), its light/dark look on a tinted menu bar, flyout placement under the K, the right-click menu, and blur-to-hide.
- Notification Center banners (NSUserNotification is deprecated but works), whether macOS asks permission, and that a click brings the app forward.
- The updater on the next release: latest.json darwin → download → swap → `app_restart` comes back on the new version, with no Gatekeeper prompt.
- Open at login (LaunchAgent) starts it minimized to the menu bar.
- ⌘ shortcuts and copy/paste in text fields.

## Checklist for Kai's first Mac tester
1. **Install**: download `kais-flow-mac.dmg` from the release, open it, drag Kai's Flow to Applications, eject the .dmg.
2. **Open Anyway**:
   - Double-click the app and expect "Kai's Flow" Not Opened (not "damaged"; if it says damaged, report it). Click Done.
   - Go to System Settings → Privacy & Security → Security → Open Anyway, enter your password, then Open. The app opens.
   - Quit and reopen it from Applications, and confirm there's no prompt this time.
3. **Sign in** with your account, and check that Today, the calendar and sync all work (make a task, see it on the web).
4. **Menu bar**:
   - The K shows at the top right, and its states change with focus and offline.
   - Left-click opens the flyout under the K; clicking elsewhere hides it.
   - Right-click opens the menu: Open, Quick capture, focus, Pause, Settings, Quit.
   - Close the main window and the app stays in the menu bar; a click on the Dock icon brings the window back.
   - Settings → App & updates → On this computer reads "Mac app only", "Show in the menu bar" and "Open at login".
5. **Notifications**: Settings → Notifications → Send a test notification. A banner should appear (allow it if macOS asks), the sound pack should play, and a click on the banner should bring the app forward.
6. **Shortcuts**: ⌘K opens the command bar, ⌘, opens Settings, ⌘C / ⌘V work in a text field, ⌘Q quits.
7. **Login item**: turn on Open at login, log out and back in, and check the app starts quietly in the menu bar (no window). Turn it off and check System Settings → General → Login Items no longer lists it.
8. **Updater (on the next release after this one)**: Settings → App → Check for updates shows the new version. Press Update, watch the progress line, and the app should reopen on the new version with no Gatekeeper prompt. If it opens the browser on the .dmg instead, the in-place update failed; send the console output.
9. Report the Mac model (Apple silicon or Intel) and macOS version.

## Next (not done here)
- Moving release publishing to `khairyKY/kais-flow-releases` and building the Mac app on Codemagic is a separate step. `mac-build.sh` is ready for it; the endpoint and target are untouched.
- Notification buttons (Done · Tomorrow) on Mac, if missed.
- The site's longer copy still says "three" apps in places (the features/apps page text).
