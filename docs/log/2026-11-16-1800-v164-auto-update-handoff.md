# v164-auto-update handoff (2026-11-16 18:00)

Branch `claude/v164-auto-update` (from origin/claude/kai-bugs-1012). Not merged, not released.

## What it does (Windows + Mac desktop apps only)
- On launch (after 20 s) and every 3 h while running (polled every 30 min, plus when the window comes back into view) the app asks the updater endpoint (latest.json) for a newer version.
- A newer one downloads in the background, no prompt, and is held by the Rust side (`Update.download()`).
- It installs only when the person leaves (or the app has sat idle in the tray, below): Quit from the tray menu, Cmd+Q, closing the window when there is no tray icon, or Settings -> App -> "Restart to update". The only automatic install is the idle one, which needs the window hidden/minimised, so nobody is cut off mid-typing.
- Quit with an update waiting: `src-tauri/src/update.rs` holds the exit, calls `window.__kfQuit`, the page flushes the outbox (5 s cap), runs `install({restartAfterInstall:false})`, and (Mac) calls `app_exit`. A second Quit goes straight through; a page that never answers is overridden after 30 s. If the install fails the app still quits.
- Windows: the installer closes the app itself (so install must run before exit; that is why the quit is held). Mac: the updater swaps the .app, then `app_restart` (Restart) or `app_exit` (Quit).
- Outbox: flushed first; anything still unsent stays in IndexedDB and goes out after the next launch, same as any quit. Nothing is dropped.
- After the update: the existing "Updated to vX" toast (WhatsNewHost), now with the "What's new" link only when notes for that version exist (`noteFor`).
- Settings -> About: "Check for updates" still works. On desktop a found update downloads; the line reads "vX is ready - restart to update" with a "Restart to update" button (also in the What's new sheet and "Coming in" section). The "vX is out" toast and Windows system toast are skipped on desktop (silent). A release without latest.json falls back to the old Update button.
- Off for: Microsoft Store installs (Store updates them), dev servers, web, Android.

## Idle install (no Quit needed; coordinator addition)
- While an update is ready, the page polls every 60 s: `shell_idle` (update.rs) = main window hidden or minimised AND no tray flyout / menu / capture window visible. Idle for 10 min in a row (`idleStep`, `IDLE_INSTALL_MS`) -> flush outbox (5 s cap), re-check idle once more after the flush (back out if the window came back), install, relaunch.
- Any use resets the clock: the poll sees the window up, and `focus` / visible events call `active()` so a short visit between polls still counts. A failed or backed-out try waits a fresh 10 min.
- Relaunch comes back hidden: before installing the page calls `relaunch_hidden(true)`, which writes `relaunch-hidden` (a timestamp) in the app data dir; `tray.rs` setup consumes it (valid 10 min) and skips `show_main`. Cleared with `relaunch_hidden(false)` if the install does not go through.
- "Updated to vX": WhatsNewHost holds the toast (and the "seen" stamp) on desktop until the window is visible and focused, so it appears the next time the window is shown, not while hidden.
- Lock / suspend trigger: skipped. Tauri 2 has no hook for it; it needs a Win32 session-change listener plus a macOS power notification, not cheap.
- Unverified: that WebView2 reports hasFocus/visible correctly for a hidden-to-tray window (the toast would then show early), and the Windows installer relaunching while hidden; both need a real run.

## Files
- New: `app/src/lib/autoUpdate.ts` (+ `.test.ts`, 25 tests: schedule, download, held version, failures, flush cap, install, quit, idle trigger), `app/src-tauri/src/update.rs` (Gate, hold/quit logic, idle + hidden-relaunch marker, 4 Rust tests; commands `update_ready`, `app_exit`, `shell_idle`, `relaunch_hidden`).
- Edited: `lib.rs` (manage Gate, ExitRequested hook), `tray.rs` (commands registered, close-without-tray hook), `whats-new/WhatsNew.tsx`, `whats-new/check.ts`, `settings/SettingsPage.tsx`, `lib/appUpdate.ts` (comment).

## Checks
- Gate (vitest x4 TZ 2892 pass each, lint, build, ds:check): green.
- birthday_on grep 1/1.
- Windows + Mac compile: see the run recorded in the Notes below.

## Notes / left over
- Not exercised in a real Tauri window (needs a published release newer than the installed build). First real proof: release this, then publish the next one and watch it download and install on Quit.
- The downloaded update lives in memory (Rust resource), so an app killed before Quit re-downloads next launch.
