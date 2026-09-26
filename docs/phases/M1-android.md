# M1 — The Android app (Tauri v2 APK)

> Kai, 2026-09-26: "start building the mobile version". This was already decided on 2026-07-12 (`design-integration/PLAN.md`, *Platform target* + SHIP P2): real packages, not a browser tab wearing an icon. Start = **web + Android APK**; Windows/macOS next; iOS later (needs a Mac + $99/yr).

## Shape

One codebase. The same `app/dist/` the web app serves, wrapped in a **Tauri v2** shell (`app/src-tauri/`) around Android's system WebView:
- about 5 MB of shell, no bundled browser, $0;
- sideloaded, no Play Store (that's $25 one-time, a Kai decision for later).

| Piece | Where | Notes |
|---|---|---|
| Shell | `app/src-tauri/` | `tauri.conf.json`, `Cargo.toml` + `Cargo.lock`, `src/lib.rs` (mobile entry point), `capabilities/default.json` (core only), icons |
| Build | `.github/workflows/android.yml` | GitHub's runner has the Android SDK + NDK. `tauri android init` → icons + mic permissions → `tauri android build --apk --target aarch64` → zipalign + apksigner → artifact; a published Release gets the APK attached |
| Backend config | `.github/scripts/supabase-public-config.py` | the public URL + anon key: repo variables if set, otherwise read from the live web bundle, so the APK talks to the same backend |
| App code | `lib/platform.ts` `isNativeShell()` | skips the service worker in the shell (the APK bundles `dist/`; Android WebView has no Push API) |
| Icon | `public/icon-{192,512}.png`, `src-tauri/icons/**` | interim four-leaf clover on paper (SHIP P1's "interim clover four_leaf"), inside the maskable safe zone. Replaced the blank navy placeholder the web app shipped with. |

## Decisions

- **Identifier `com.kaisflow.garden`.** Stable forever: Android ties installs and updates to it.
- **Origin `https://tauri.localhost`** (`useHttpsScheme`).
  - It's a secure context, so `crypto.randomUUID` and the mic work.
  - It's already on the edge functions' CORS allowlist (FIX-0), so **no backend change** is needed.
- **arm64 only.** It covers every current phone and halves build time. An x86_64 build can be added for an emulator smoke test.
- **Auth** is email + password over HTTPS, so there's no redirect into the app.
  - A reset-password email link opens the web app in the browser. Kai then signs in inside the app.
- **Signing.** A persistent key needs the `ANDROID_KEYSTORE_B64` + `ANDROID_KEYSTORE_PASSWORD` secrets (a [KAI] step: secrets can't be written by CI).
  - Without them, each build is signed with a one-off key, which works for installing.
  - Installing a *newer* build over it then needs an uninstall first. Data is in Supabase, but wait for "Synced".
- **Push notifications** don't work inside the shell (no Web Push in WebView). The Settings screen already shows the "not supported here" state.
  - The web app / installed PWA keeps working for reminders.
  - FCM push = SHIP P4, later.

## Steps

1. Scaffold + icons + platform detection + CI build. *(this commit)*
2. First green CI build → APK artifact. Read the build log.
3. Emulator smoke test in CI: an x86_64 build, install, launch, screenshot the sign-in screen. It checks that the app launches and renders. Signing in needs the real backend, so that stays on Kai's device.
4. [KAI] Install on the phone. Checks:
   - sign in;
   - Today;
   - capture;
   - voice (mic prompt);
   - offline launch;
   - no browser chrome.
5. Windows `.exe` (same shell, `windows-latest` runner).

## Acceptance

- [ ] CI produces a signed APK from a clean checkout.
- [ ] [KAI] It installs on Kai's Android. The icon is the clover. The app opens to sign-in with no browser chrome.
- [ ] [KAI] Sign in → Today with his data. Changes sync with the web app.
- [ ] [KAI] Voice capture asks for the mic once, then records.
- [ ] [KAI] Airplane mode → the app still opens and shows cached data; changes queue and sync later.

## Notes
- 2026-09-26 17:29 — **First APK built green** (run 36258798680, commit 6dc3583).
  - Signed, 31.7 MB, arm64.
  - The Supabase public config was read from the live bundle.
  - `tauri android init` → icons + mic permissions → build → zipalign + apksigner (one-off key, cert `CN=Kai's Flow`).
  - Two fixes on the way:
    - Cloudflare answers 403 to `Python-urllib`, so the resolver now sends a browser user agent;
    - Android string resources reject a bare apostrophe, so a post-init step writes `Kai\'s Flow`.
- 2026-09-26 17:32 — **Windows installer failed in makensis.** NSIS treats `'` as a string quote, so "Kai's Flow" split `IsShortcutTarget`'s parameters (7 for 4). Fix: `tauri.windows.conf.json` names the Windows app `Kai’s Flow` (U+2019).
- 2026-09-26 17:40 — **Emulator smoke test** (API 34, x86_64): the APK now carries arm64 + x86_64 so the emulator runs the same file.
  - Blob-storage artifacts are unreachable from the conductor's sandbox (403). So the job also prints small base64 JPEGs of the screens, the UI tree with bounds, and the WebView console to its log.
