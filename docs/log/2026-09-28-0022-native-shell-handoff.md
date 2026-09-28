---
date: 2026-09-28T00:22Z
session: native-shell builder (C)
type: handoff
related: M1b — Android moves from Tauri to Capacitor (Kai, 2026-09-27); docs/phases/M1-android.md Notes
---

# Native shell handoff: the Android app on Capacitor 8

Branch `claude/native-shell`, based on `origin/claude/ds-refresh`. Not merged, not deployed, no functions deployed, no secrets set.

## What changed

**Shell (Android only; the Windows installer stays on Tauri, `desktop.yml` untouched)**
- `app/capacitor.config.ts`: appId `com.kaisflow.garden` (same as the Tauri APK, never change), appName `Kai’s Flow` (U+2019), webDir `dist`, `server.androidScheme: 'https'` → origin `https://localhost`.
- `app/package.json`: `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/haptics` (8.x, MIT), `@capacitor/cli` (dev).
- `app/android/` is **generated in CI** (`npx cap add android`, which also syncs `dist/` and the plugins) and gitignored. Committed overrides live in `app/native/android/`, copied over it:
  - `MainActivity.java`: Capacitor 8's SystemBars already pads the WebView clear of the status bar, the navigation bar and the keyboard. This activity paints the strips that padding leaves in the page's colour: the web app calls `window.KaisFlowShell.setChrome(hex, light)`, the same contract as the Tauri shell, so `lib/platform.ts` `syncShellChrome` and `lib/theme.ts` are unchanged. It re-applies after every configuration change, because SystemBars resets the bars to the phone's theme there. The interface is added from a tiny plugin, since plugins load before the first page.
  - `res/`: the clover launcher icons (moved from `src-tauri/icons/android`); `values/styles.xml` (launch = clover on paper instead of Capacitor's blue splash; window, status bar and navigation bar = paper); `values{,-night}/kf_colors.xml` (`kf_page` #EFE9DB / #211D30, so a dark phone launches dark).
  - The manifest gets `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` by `sed`, as before.
- Removed: `app/src-tauri/android/MainActivity.kt` (Tauri-Android only).
- `.github/workflows/android.yml`: node 22 + Temurin 21 → `npm ci` → Supabase public config (unchanged script) → `npm run build` → `cap add android` + overrides → stamp `versionName`/`versionCode` from `tag` → `./gradlew assembleRelease` → zipalign + apksigner (same `ANDROID_KEYSTORE_B64`/`ANDROID_KEYSTORE_PASSWORD` logic, else a one-off key) → artifact `kais-flow-<tag or sha7>.apk` → attached to the Release when called with `tag`. `workflow_call` + `tag` contract unchanged, so `release.yml` needs no change. Push trigger adds `claude/native-shell`. No Rust, no NDK.
  - versionCode = major·1000000 + minor·1000 + patch (Tauri's formula), so a release stays "newer" than the Tauri APKs. Branch builds are `0.0.0-dev.<sha7>` / code 1.
- `.github/scripts/android-smoke.sh`: same install → launch → day screenshot → UI dump → night screenshot, plus:
  - the WebView must start below the status bar (kept), and less than two bars down (insets applied twice);
  - **Back on the sign-in page must leave the app** (activity no longer resumed, process alive). Without the JS handler, Back does nothing there;
  - the night screenshot now comes after a relaunch and `uimode night yes`, so it shows the strips surviving a configuration change.
- `supabase/functions/_shared/cors.ts`: `https://localhost` + `capacitor://localhost` added to the static allowlist.

**Web layer**
- `lib/platform.ts`: `isCapacitorShell()` = `Capacitor.isNativePlatform()`; `isNativeShell()` = Capacitor or Tauri. No service worker in either shell (`main.tsx`, unchanged rule). `authLinkOrigin()` unchanged.
- `lib/overlayStack.ts`: `pushOverlay()` + `closeTopOverlay()` under the unchanged `useEscapeStack` API; Escape and Back share them. Morning and Evening rituals now register (Esc / Back = their "skip"); the evening line survives as a draft (same loop day, in memory) until it lands in the journal.
- `lib/androidBack.ts` (a separate chunk, loaded only in the Capacitor shell; wired in `App.tsx`): Back closes the top overlay; else `history.back()` inside the app's own history (`history.state.idx > 0`); else Today; at Today (or sign-in/reset/onboarding) the app **minimizes**. The keyboard takes Back itself before any of this.
- `lib/haptics.ts`: `tick()` / `confirm()` / `longPress()`, no-ops outside the shell. Nothing calls them yet.
- `index.css`: tap highlight off; `touch-action: manipulation` on buttons/links/roles; `user-select: none` + `-webkit-touch-callout: none` on nav, buttons, roles, `.app-sidebar`, `.app-tabbar`, `.app-topbar` (inputs re-enabled); `overscroll-behavior: none` on html/body, `overscroll-behavior-y: contain` on vertical scrollers (`.overflow-y-auto`, inline `overflow-y: auto`).
- `App.tsx`: lazy pages go through `page()`, which records each loader; once the page has loaded, `requestIdleCallback` fetches every page chunk, so a tab switch doesn't show the blank fallback.
- `CalendarGrid.tsx`: `longPressDelay`, `eventLongPressDelay`, `selectLongPressDelay` = 400. Nothing else there.
- `enterKeyHint`: command bar `done`, search overlay `go`, evening line `next`.

## Deviations from the brief (on purpose)
- **No `@capacitor/status-bar`.** Its `setBackgroundColor` is a no-op from Android 15 (`StatusBar.java` `shouldSetStatusBarColor`), where edge-to-edge is enforced, so Night would get a paper strip on Kai's phone. Its style re-apply on configuration change also races Capacitor 8's own SystemBars. The strips come from `MainActivity` instead, with the same JS contract as before.
- **No `@capacitor/keyboard`.** On Android, SystemBars already keeps the WebView above the keyboard, and the plugin's resize modes are iOS-only. Add it with iOS.
- **Back at Today minimizes** (`App.minimizeApp()`), not `App.exitApp()`. Android 12+ does the same for a root activity, and the next open resumes instantly instead of cold-starting the WebView.

## Hover-only UI found (for the visual builders, not changed)
- `features/tasks/TaskRow.css`: `.task-row-hover` (row actions) and `.tr-someday-hover` (promote pills) show only on hover or focus-within.
- `features/calendar/CalendarGrid.css`: `.kf-ev-check` (the block's check) and the resize handle show only on hover or focus.
- `features/inbox/Inbox.css` already has an `@media (hover: none)` fallback. The rest are hover polish only (lift, tint, sway) and need nothing.

## Evidence (local, Windows, Node 24)
- `npx tsc -b`: exit 0.
- `npx vitest run` (no `.env.local`): **58 files / 776 tests passed**, including the new `lib/overlayStack.test.ts` (LIFO, closing underneath, refusing to close, Back decisions) and the Capacitor case in `platform.test.ts`.
- `npm run lint`: exit 0, no findings in touched files (warnings are the existing baseline).
- `npm run build`: green; `androidBack` is its own 1 kB chunk; `@capacitor/core` rides the main chunk (about 3 kB gzip).
- `npx cap add android` ran locally (no SDK needed to generate): `com/kaisflow/garden/MainActivity.java`, `namespace`/`applicationId` `com.kaisflow.garden`, `app_name` `Kai’s Flow`, plugins app + haptics. The workflow's override, manifest and version-stamp shell ran against it: permissions added, `v1.0.8` → 1000008 / "1.0.8", no tag → 1 / "0.0.0-dev.<sha7>". Gradle wasn't run (no Android SDK or JDK 21 here).
- `android.yml` parses (PyYAML); every multi-line step and `android-smoke.sh` pass `bash -n`.

## What the first CI run must prove
1. `cap add android` + overrides + `./gradlew assembleRelease` succeed on `ubuntu-latest` with JDK 21 (SDK platform 36 present or auto-installed). `MainActivity.java` compiles.
2. A signed `kais-flow-<sha7>.apk` artifact exists and `apksigner verify` prints the cert.
3. Smoke: the app installs and opens to sign-in; `WebView top edge` > 0 and < 2 × the status bar; Back leaves the app with the process alive; the night screenshot shows paper strips with dark icons (the app is still in Day), not white or indigo.
4. Logcat has no `AndroidRuntime` crash and no console errors.

## How to verify on a device [KAI]
1. Open the old Tauri app, wait for **Synced**, uninstall it. The new app's storage is at a new origin, so it can't take over the old one's cache or unsent queue.
2. Install the APK from the green run (docs/INSTALL.md), sign in.
3. Status bar: paper with dark icons in Day; switch to Night in Settings → the strip turns night paper with light icons; turn the phone's dark mode on and off → the strip stays the app's colour.
4. Back: open a sheet or menu → Back closes only it; select tasks → Back leaves selection mode; open search → Back closes it; go Today → Inbox → Back returns to Today; Back at Today → the app goes to the background; reopen → instant, same screen.
5. Typing: open the keyboard in a sheet → Back hides the keyboard only; the sheet's text is still there. Evening ritual: type a line, press Back, reopen → the line is still there.
6. Tap feel: no grey flash on taps, no page bounce at the top/bottom, long-press on a tab or button selects no text. Calendar: a 400ms hold picks up a block.
7. Tab switches right after launch show no blank flash. Voice capture asks for the mic once, then records. Airplane mode → the app opens and shows cached data. Links (GitHub issue, "Create one on GitHub") open in the browser.

## Risks
- **CORS:** edge functions (capture parse, transcribe, chat, search…) reject `https://localhost` until the functions are deployed from this branch's `cors.ts` (the next release does it). Until then, AI features fail in the new APK; plain reads and writes (PostgREST/Auth) work. A stopgap without a deploy: set the `ALLOWED_ORIGINS` secret to `https://localhost`.
- **Release signing:** `release.yml` calls `android.yml` without `secrets: inherit`, so release APKs are always signed with a one-off key even once the keystore secrets exist. Existing behaviour, not changed here; one line when Kai wants in-place updates.
- **Unsent writes in the old app** are stranded after the uninstall (new origin). Hence step 1 above.
- **Old WebViews (< 140) and Android ≤ 14:** the strips depend on Capacitor's padding path plus `MainActivity`. The emulator (API 34) covers one case, Kai's phone the other.
- **`overscroll-behavior-y: contain` via `[style*='overflow-y: auto']`** is a selector on the inline style; harmless, but a scroller styled another way (e.g. `overflow: auto`) doesn't get it.
- **Preloading every chunk** after load costs web users the whole app's JS once. The service worker precaches it all anyway.
- Hover-only controls above: invisible on touch until a tap focuses the row.
