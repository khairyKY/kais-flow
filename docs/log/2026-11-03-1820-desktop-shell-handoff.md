# 2026-11-03 18:20 · handoff · desktop-shell: global quick-capture popup + kaisflow:// deep links (Windows + Mac)

Branch `claude/desktop-shell` (from `claude/kai-bugs-1012`). Not merged, not released.

## Why the shortcut is not plain Ctrl+K (tell Kai)

Kai asked for "the same Ctrl+K". A **global** shortcut owns the key system-wide: while Kai's Flow runs, Ctrl+K would stop working in every browser (address bar search), Slack (jump to), VS Code (chord prefix), Notion and so on. So the default is **Ctrl+Shift+K (⌘⇧K on a Mac)**.

- **Where it changes:** Settings → About → On this computer → **Quick capture shortcut**: Ctrl+Shift+K (default) · Ctrl+Alt+K · Ctrl+K · Off. (Ctrl+K is offered for anyone who wants it everywhere.)
- **Inside Kai's Flow, Ctrl+K is untouched:** it still opens the in-app command bar exactly as before.
- **If another app already owns the chosen key,** the row says so ("Another app already uses that shortcut") and the working one stays.
- **Per device** (localStorage `kf_capture_shortcut`), like "Show in the system tray". The app registers the default at start-up and sends this device's choice as soon as the signed-in shell loads, so after a restart there is about a second where the default is live even if Kai chose Off.

## 1 · Quick capture popup

- **What it is:** a third small window, `tray.html?capture`, built the same way as the tray flyout/menu (`tray_window`: borderless, always on top, off the taskbar, https scheme so it shares the session, kept warm once made). It renders the **existing `CommandBar`** with a new `floating` prop, so parsing, chips, the Task/Event switch, ⌘1/⌘2, the mic and "Jump to…" are the real ones; only the shell differs: the card fills the window (no scrim, corner or shadow of its own), no camera (Paper capture's quick look lives in the main window), never the phone sheet.
- **Opens:** the shortcut (a second press closes it), the tray's / menu's "Quick capture…" (it used to open the main window), `kaisflow://capture`. It appears centred, a fifth of the way down, on the monitor the pointer is on, and the field has the cursor.
- **Closes:** Esc (first Esc still hands a recognised token back to the title, as in the app), a click away (blur), or a filed line.
- **Saves** through `captureTyped` → the outbox, as everywhere (the outbox already holds a Web Lock across windows, the flyout uses it). It works while the main window is hidden in the tray / menu bar, because it is its own window and shares the session.
- **Window height** follows the bar (chips, the Jump row): the page reports `capture_size`, Rust resizes keeping the top edge.
- **First press** creates the window and waits for the page to say it has drawn (`capture_ready`, up to 4 s); if it never does, the old way stands in (main window + its bar).
- **Signed out:** the popup says "Sign in in Kai's Flow" with an Open button.
- Rust: `app/src-tauri/src/capture.rs` (+ small hooks in `tray.rs`, `lib.rs`); web: `features/tray/CapturePopup.tsx`, `captureShortcut.ts`, the Settings row, `TrayBridge.ts` (registers this device's shortcut at start).
- **Plugin:** `tauri-plugin-global-shortcut` 2. The Mac one is a Carbon hot key, so no Accessibility prompt.

### Known limits (ponytail)
- No confirmation toast after Enter (the window hides at once, Akiflow-style); the item lands in the Inbox/Tasks and the capture sound plays.
- Four fixed choices, not a "press the keys you want" recorder.
- Mac: the popup is a normal always-on-top window; it does not float above another app's native full-screen Space.

## 2 · Deep links: `kaisflow://`

| Link | Does |
|---|---|
| `kaisflow://today` | opens/focuses the app on `/today` |
| `kaisflow://calendar` | `/calendar` |
| `kaisflow://focus` | `/focus` |
| `kaisflow://task/<id>` | `/tasks/<id>` (the task editor page) |
| `kaisflow://capture` | opens the quick-capture popup (the main window stays as it is) |

Anything else (`kaisflow://settings`, a bad id, a path like `task/../x`) just opens/focuses the app and goes nowhere. `<id>` must be `[A-Za-z0-9_-]{1,64}`. Trailing slashes and `kaisflow:today` are read too (Windows and browsers add them).

- **Running app:** a second launch with the link is handed to the running copy (single-instance), which shows the window and navigates; no second K by the clock. On a Mac the OS delivers it as an Apple event (deep-link plugin `on_open_url`).
- **Cold start:** the link that started the app is kept in Rust until the signed-in shell is up (`deep_link_take`), so it works after a start-up login too; signed out, it waits until sign-in.
- **Registration:**
  - Windows .exe install: the NSIS installer's existing `deep_link_protocols` block (from `tauri.conf.json` `plugins.deep-link.desktop.schemes`), per-user.
  - Microsoft Store install: new `windows.protocol` extension in `msix/AppxManifest.xml`.
  - Mac: the bundler writes `CFBundleURLTypes` into Info.plist.
  - A dev build (`tauri dev`) registers itself at run time; an installed one never does.
- **Plugins:** `tauri-plugin-deep-link` 2; `tauri-plugin-single-instance` was already there (its callback now reads the links in the arguments).

### How a widget / script tells from outside whether the app is installed
- **Windows:** the key `HKCU\Software\Classes\kaisflow` exists with a `URL Protocol` value, and `HKCU\Software\Classes\kaisflow\shell\open\command` (default) is `"C:\Users\<you>\AppData\Local\Kai’s Flow\kais-flow.exe" "%1"`. Rainmeter: `[MeasureReg] Measure=Registry RegHKey=HKEY_CURRENT_USER RegSubKey=Software\Classes\kaisflow\shell\open\command` — a non-empty string means installed; check that its exe exists to be sure. The Microsoft Store install has no HKCU key you can read (the manifest registers it): look for the package instead (`Get-AppxPackage *KaisFlow*` / the Store identity), or just call the link and fall back to the website if nothing opens.
  (The .exe installer checks this on the CI runner: install `/S`, read the key, open `kaisflow://today`, the app stays up, a second link does not start a second copy — manual `desktop.yml` runs.)
- **Mac:** the app is `/Applications/Kai's Flow.app` (or `~/Applications`); `test -d "/Applications/Kai's Flow.app"`, or `mdfind "kMDItemCFBundleIdentifier == 'com.kaisflow.garden'"`. Info.plist has `CFBundleURLSchemes = kaisflow`, which `mac-build.sh` now checks. `open kaisflow://today` is the call.
- **Opening one:** Windows `start kaisflow://today` / Rainmeter `[!CommandMeasure ... ]`/`!Execute ["kaisflow://today"]`; Mac `open kaisflow://today`. Always `kaisflow://<route>` with `//`.

## Checks
- `cargo check --tests` and `cargo test --lib` on Windows locally: 12/12 (5 new: popup placement ×3, link reading ×2).
- vitest: new `deepLink.test.ts`, `captureShortcut.test.ts`.
- Harness `docs/log/assets/desktop-shell/verify.mjs` (Playwright, mock backend, fake Tauri bridge): **35/35** — Settings row (default, 4 choices, accelerator sent, saved, refused-by-another-app keeps the old one, Mac wording, sent at start), popup page (ready once, opens on `__kfCapture`, cursor in field, window told its height, chips grow it, no camera, Enter files through the outbox and hides, Esc hides, blur resets, Jump opens the main window), deep links (today, calendar, focus, task/<id>, trailing slash, unknown link ignored, link arriving while running).
- CI: `desktop.yml` run on `claude/desktop-shell` — see the result line in INDEX / the reply. New steps: a Windows installer check (registry key + open link + single copy) and a Mac Info.plist scheme check.
- Gate: see the reply.

## Not done / for Kai
- The real first run on Kai's PC (shortcut over a game or an elevated app: Windows blocks hot keys over elevated windows from a normal process).
- Another builder does the Rainmeter skins; they only need the table above.
- Docs the site/install guides could mention (the new shortcut, the links): not touched.
