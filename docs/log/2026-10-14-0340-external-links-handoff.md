# 2026-10-14 03:40 · handoff · external-links (Kai: "Settings → Google Calendar → Connect did nothing")

Branch `claude/external-links`, from `claude/kai-bugs-1012`. Fix commit `22cbd084`. Not merged and not released.

## Cause

Neither shell's web view opens a `window.open` or a `target="_blank"` link, and neither had a way to reach the system browser. There was no Tauri opener plugin and no `@capacitor/browser`. So Google Connect did nothing in the installed apps. The same cause hit every outside link: GitHub links, Inbox and task links, the PAT page, What's new, the auth mailbox button and the `o` task-link key.

## The fix (one place)

- **`openExternal(url)`** in `app/src/lib/platform.ts` picks one route per shell:
  - **Windows (Tauri):** it calls `plugin:opener|open_url` through the injected `__TAURI_INTERNALS__` bridge. This follows the same no-`@tauri-apps/api` pattern as `features/tray/native.ts` and `lib/appUpdate.ts`, so the npm wrapper wasn't added; `openUrl` in that wrapper is this exact call.
  - Rust side: the `tauri-plugin-opener = "2"` crate (2.7.1 in `Cargo.lock`) is registered in `src/lib.rs` (`.plugin(tauri_plugin_opener::init())`).
  - Capability `opener:allow-open-url` for `https://*` and `http://*` is in `capabilities/default.json`, for the main window and the tray window.
  - **Android (Capacitor):** `Browser.open({ url })` from `@capacitor/browser@^8.0.5` opens a Custom Tab, which Google accepts for OAuth. `cap add android` registers the plugin; the CI log shows "Found 4 Capacitor plugins … @capacitor/browser@8.0.5".
  - **Browser:** `window.open(url, '_blank', 'noopener,noreferrer')`, the same as before.
- **Callers updated:**
  - Settings → Google Connect/Reconnect awaits `openExternal`. Its message is unchanged.
  - `lib/links.ts` `openTaskLink` (the `o` key) uses it too.
  - `appUpdate.openDownload` is unchanged: it does a same-window `location.assign`, which already worked.
- **`installExternalLinks()`** runs once from `main.tsx`, in the shells only. It is a capture-phase `click` listener on the document. It picks up any `<a href>` that resolves to an http(s) page on another origin, calls `preventDefault()` and sends the link through `openExternal`.
  - The app's own links (`https://tauri.localhost/…`, `https://localhost/…`), `#` anchors, `mailto:` and `blob:` links are left alone.
  - Other click handlers still run, because it doesn't stop propagation.
  - The rule lives in `externalHref(href, here)`.

## Gate

- `npx vitest run`: 159 files, 2180 tests. New in `platform.test.ts`: the three openExternal branches with the platform mocked, and the externalHref same-origin, scheme and bad-URL rule.
- `npm run lint`: 0 errors (warnings were already there).
- `npm run build`: passes.
- `ds:check`: 0 new.
- CI on `claude/mobile-external-links` (`22cbd084`):
  - **Android APK [38490094579](https://github.com/khairyKY/kais-flow/actions/runs/38490094579)**: green, Build APK plus the emulator smoke test.
  - **Windows app [38490094520](https://github.com/khairyKY/kais-flow/actions/runs/38490094520)**: green. `tauri-plugin-opener v2.7.1` compiled, and tauri-build accepted the capability.

## Not verified on a device

- Not tested on Kai's phone or PC: that a tap on Connect actually opens the browser or Custom Tab, and that Google's consent then completes and lands back. The builds compile and the smoke test boots, but neither clicks a link.
- After Google's consent the browser lands on the web app (the existing design). Back in the app, **Sync now** pulls the calendars in. No deep link back into the shell was added.

Next: install the `claude/mobile-external-links` builds (APK, and the `kais-flow-22cbd08-windows-setup.exe` artifact), then test Settings → Google Connect, a GitHub link in Inbox and the PAT link.
