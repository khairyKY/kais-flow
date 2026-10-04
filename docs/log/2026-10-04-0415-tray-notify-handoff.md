---
date: 2026-10-04T04:15+03:00
session: builder N (tray icon & notifications — Kai's Claude Design prompt 12)
type: handoff
related: design-export/Tray and Notifications.dc.html (12a–12l) · Kai's Vault "Claude Design Prompts/12 — Tray & notifications.md" · docs/DATA_MODEL.md (0048)
---

# Tray & notifications: the K by the clock, one notification language, the settings and the history

Branch `claude/tray-notify` (also pushed as `claude/mobile-tray` for the CI builds), cut from `origin/claude/wave-q` (2a23071). Not merged, not deployed. In `SettingsPage.tsx` only the Notifications section changed. Untouched: `features/capture`, `features/inbox` (imported only), `site/`, `docs/ROADMAP.md`, `docs/log/INDEX.md`.

| # | Commit | What |
|---|---|---|
| 1 | `feat(notifications)` | One notification language (`supabase/functions/notify/copy.ts`), notify respects the user's rules, the PWA service worker shows and acts, migration 0048, badge + Android small icon |
| 2 | `feat(tray)` | Windows tray: icon states, native menu, `/tray` flyout, close-to-tray, single instance, autostart, toasts with buttons |
| 2b | `fix(tray)` | The Windows reminder sweep waits for tasks before moving its window |
| 3 | `feat(settings)` | Settings → Notifications as drawn (12i), desktop + phone |
| 4 | `feat(activity)` | The notification history on Activity (12j): same glyphs, working buttons |
| 5 | `docs(log)` | This handoff, the harness and the evidence |

## 1 · Notifications, one language (12e–12k)

- **`supabase/functions/notify/copy.ts`** (pure, no Deno APIs — the `ritual.ts` pattern) builds every notice: title, body, ≤2 actions, url, tag, silent, taskIds.
  - Task reminder: "Call the tyre supplier · in 10 min" / "09:50 · Car" · **Done · Tomorrow**. Several at once → "3 reminders" · Open.
  - Morning digest: "Good morning — 3 to tend today" / "✶ goal, then A and B." · **Plan my day · Open** · silent by default.
  - Evening nudge: "The garden’s ready to close" / "4 done · 2 left" · **Shut down**.
  - Focus done (local): "25 minutes tended ✿" · **Break 5 min · Keep going**.
  - `deliver(notice, prefs, now)`: kind off or paused → nothing; quiet hours → `silent`; a test always goes.
  - Lock-screen names off (the default, as drawn in 12g) → "A reminder" / "Unlock to see it"; no task name anywhere in the payload.
- **notify** builds payloads from it and reads each user's `app_settings` with `select('*')` (runs before 0048 too, with defaults). Behaviour changes, deliberately, to match the drawing:
  - The digest no longer counts slipping areas (notify no longer reads `slipping`).
  - The nudge is "N done · M left" (tasks finished today / open and due by end of today), not "missed routines"; an empty day sends nothing.
  - Digest/nudge sends log `notify.morning_digest` / `notify.evening_nudge` activity rows; `task.reminder_sent` rows now carry `notice:{title, body}`.
  - Typechecked strict with a Deno shim (`tsc`, no deno on this machine); **not deployed** — `supabase functions deploy notify` + `supabase db push` are Kai's.
- **Web Push / PWA** — `app/public/sw-push.js`, pulled into the generated worker by `workbox.importScripts`:
  - Shows the payload with `icon-192.png` and the new monochrome **`badge-96.png`**.
  - `notificationclick` holds no key and no session. With a window open it posts the action to it; Done / Tomorrow / Break / Keep going run there without bringing it forward. With no window it opens the notice's page with `?kfAction=…&kfTasks=…`.
  - The app (`features/notifications/actions.ts`) runs every action through its own outbox: RLS, offline-safe, logged. **Tomorrow = `moveToTomorrowWithUndo`** (tomorrow 09:00 Cairo; the reminder keeps its lead via `carryReminder`).
  - Plan my day / Shut down land on `/today?ritual=morning|evening` (Today opens the ritual, then drops the param).
- **Android** (design-ready, no FCM): the white K status-bar icon `ic_stat_kf.png` at mdpi…xxxhdpi in `app/native/android/res/drawable-*` (24dp, the K fitted to the 20dp live area by its real glyph box). When push reaches the APK:
  - point FCM's `com.google.firebase.messaging.default_notification_icon` meta-data at `@drawable/ic_stat_kf`;
  - set `default_notification_color` to terra;
  - create the channels Reminders · Rituals · Focus · Captures · People · Sync.
  - Kai's Firebase project is still the prerequisite.
- **Migration `0048_notification_prefs`** on `app_settings`: `task_reminder_on`, `focus_done_on`, `quiet_hours_on` (default **on**), `quiet_from` 22:30, `quiet_to` 07:00, `lock_screen_names` (default **off**), `notify_paused_until`. DATA_MODEL.md is in sync. It also records that `notification_history` was never built: Activity is the history.

## 2 · The Windows tray (12a–12e) — `app/src-tauri/src/tray.rs`, desktop only

- **Icon:** `design-integration/render_tray_icons.mjs` renders 12a's geometry into strips `icons/tray/tray-{light,dark}-{16,20,24,32}.png`.
  - Eight states each: normal, focus ¼ ½ ¾ full, needs you, changes waiting, quiet.
  - Overlays sit inside the tile, with a real cut-out (the drawing lets them hang 1.5px over the edge).
  - Baked in with `include_image!`. The web app picks the state (`tray_set`); the size follows the main window's DPI.
  - Precedence: running focus > needs you > offline/waiting > quiet (quiet hours or paused).
- **Right-click** (12d), native and in the drawn order: Open Kai’s Flow · Quick capture… · Start focus · 25:00 / Stop focus · N min left · Pause notifications for 1 hour / Resume notifications · paused until 10:41 · Settings · Quit Kai’s Flow.
  - Rows run in the app through `window.__kfTray`.
  - Double-click opens the app.
- **Left-click → flyout** (12b/12c): a 340×460 borderless, always-on-top, skip-taskbar window on the new **`/tray`** route (`features/tray/TrayFlyout.tsx`).
  - Created on first click, then shown and hidden.
  - Sits centred over the K, above a bottom taskbar, inside the work area. Hides on blur or Esc.
  - Date + Day N. Now/Next with a check (completes its task).
  - Top 3, goal first, finished picks struck through (Today's own rules).
  - "Write it down…" → `captureWithAI`; the mic → the voice sheet.
  - Start focus · 25:00 → Pause/Resume · Stop with the running ring and timer.
  - Open Kai’s Flow · Settings.
  - The one focus timer stays in the main window. The flyout mirrors and drives it over a `BroadcastChannel` (`focusChannel.ts`).
- **Close / launch behaviour:**
  - Closing the main window hides it to the tray while "Show in the system tray" is on; else it quits, as before.
  - The main window now starts hidden and `setup` shows it, unless launched `--minimized` by "Start with Windows" (`tauri-plugin-autostart`).
  - `tauri-plugin-single-instance` brings a second launch forward instead of adding a second K.
- **Toasts** with the same copy and up to two buttons, via `tauri-winrt-notification` (Tauri's own crate; `tauri-plugin-notification` drops buttons on desktop). A button runs `window.__kfNotifyAction` → the same action code as a push.
  - Fired for focus done, and for reminders the app finds due while it runs (its own 30s sweep — WebView2 has no Web Push).
  - Silent when the notice is silent; on a dev build they come from PowerShell's AUMID.
- **App side:** one lazy null component in the shell (`features/tray/TrayBridge.ts`). Its re-renders never touch the shell.
- **Focus ticker** now counts real seconds. Hidden windows are throttled to ~1 run/min (closed to the tray, a background tab), which used to stretch a 25-minute round.
- **Glyphs:** `kf-bell`, `kf-moon`, `kf-focus-ring` (12l), `kf-sprout` (12k digest).
- **No new JS dependency.** The web app talks to tray.rs through `__TAURI_INTERNALS__.invoke`, the `lib/appUpdate.ts` pattern.

## 3 · Settings → Notifications (12i)

- One card, desktop and phone. It replaces the old push card and, on the phone, the old "Ritual reminders" card.
- **Kinds** (glyph · channel · sound/silent · on/off; the digest and nudge with their times).
- **Quiet hours** with the moon, from–to.
- **Show task names on the lock screen.**
- **Send a test notification:** a push on the web; a local toast in the Windows app.
- **This device:** subscribe / unsubscribe (web).
- **Windows only:** Show in the system tray (this device, localStorage + `tray_shown`) · Start with Windows (`autostart_get/set`).

## 4 · The history (12j)

- Activity's describe maps `task.reminder_sent` and `notify.*` to their notice copy. Each row gets its kind's glyph (`KindGlyph`, shared with Settings) and its buttons (Done · Tomorrow while the task is open · Plan my day · Open · Shut down).
- A **Notifications** filter chip lists only these, on desktop and phone.

## Gate

- `npx tsc -b`: 0.
- vitest under TZ = UTC / Africa/Cairo / America/Los_Angeles / Asia/Tokyo (PowerShell `$env:TZ`): **91 files, 1114 tests, all pass ×4**.
  - New: `copy.test.ts`, `actions.test.ts`, `sw.test.ts` (runs `public/sw-push.js` against a fake worker global: push → `showNotification`, click with and without a window), `trayState.test.ts`, +3 in `describe.test.ts`.
- `npm run lint`: 0 errors (19 warnings, all pre-existing).
- `npm run build`: ok. `dist/sw.js` has `importScripts("sw-push.js")`.
- `cargo check` (app/src-tauri, scratch target dir): clean, no warnings.
- **Mocked-backend browser harness** `docs/log/assets/tray-notify/verify.mjs`: **57/57**. It ran on the dev server at :5253, `--mode mock`, with a stub `__TAURI_INTERNALS__` recording every tray.rs command. It covers:
  - the flyout at 340×460, day idle and night with focus running, driving the main window's timer;
  - capture, ticking a Top 3 row, Esc / Open / Settings IPC;
  - tray states and menu rows;
  - the focus-done toast and its Keep going;
  - the reminder sweep toast, Tomorrow from the toast, the needs-you dot cleared by the flyout;
  - Pause 1 hour, Quick capture, `tray_open(route)`;
  - Settings writes on desktop (Windows) and phone (web), test notification both ways, autostart/tray IPC;
  - the history filter, glyphs, Done, Plan my day → ritual;
  - `?kfAction=done` from a cold window.
- **Evidence:**
  - `12b-flyout-day`, `12b-flyout-night-idle`, `12c-flyout-focus-night`, `12i-settings-{desktop-day,phone-night}`, `12j-history-{desktop-day,phone-night}`.
  - Side-by-sides `side-12b/12c/12i/12j`.
  - `icons-side-by-side.png` (every tray state ×4 sizes ×2 taskbars, the badge, the Android icon, beside 12a/12h/12f), made by `icons-sheet.mjs`.
- **CI:** see the final report for the run URLs.
  - The first Windows installer build (commits 1–2) passed: https://github.com/khairyKY/kais-flow/actions/runs/37166549753.
  - It was dispatched by hand: the first push of `claude/mobile-tray` carried no commits new to the repo, so the `paths` filter skipped it.

## Deviations and risks

- **Only a real Windows run proves the shell.** Nothing here ran the installer.
  - That the K shows, crisp at the machine's DPI, and swaps state.
  - The flyout's position above the tray and its blur-to-close (incl. the click-on-K toggle).
  - Close-to-tray, `--minimized` start, single instance.
  - That toast buttons call back. They rely on the toast's WinRT `Activated` event while the process lives; if they don't fire, the toast still shows and a click opens the app.
  - That toasts carry the app's name/icon under the installer's AUMID.
- **Taskbar theme** = the WebView's `prefers-color-scheme` (Windows' *app* theme), not the taskbar's own setting. They differ only if someone mixes them.
- **Menu focus row** reads "Stop focus · 19 min left" (minutes), not "18:42 left": it updates once a minute, not every second. "Open" isn't bold (muda can't). No accelerator text on Quick capture (there's no global shortcut).
- **Sound names:** Settings shows "sound" / "○ silent", not "soft chime" / "paper rustle". Web Push and Windows toasts can only play the system sound or none.
- **Quiet hours mean silent, not suppressed** (the drawing's "nothing makes a sound"). Defaults on, 22:30–07:00.
- **`lock_screen_names` defaults off**, as drawn: after `db push`, Kai's reminders read "A reminder / Unlock to see it" on every device until he turns names on. The setting is per account; web push can't tell a phone's lock screen from a desktop.
- **Kinds not built yet** (paper capture ready, birthday, sync problem) have no Settings row or notice. Paper capture belongs to builder P; its notice can be added to `copy.ts` and `KIND_LOOK`.
- **Two windows share the outbox** (main + flyout), the same multi-tab race the PWA already has: writes are idempotent upserts, but a simultaneous read-modify-write of the queue in two windows could drop one entry.
- **Migration number 0048** may collide with builder P if P also adds one. Rename one of them before `db push`.
- **Pause notifications for 1 hour** pauses push and toasts for the account (`notify_paused_until`), not just this machine.
