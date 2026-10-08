# notify-fix: handoff (2026-10-08 20:05 Cairo)

Kai: "Notifs are not working for phone and PC." Branch `claude/notify-fix` (from v1.0.26 / 579f84c5).

## The short answer

Kai's PC runs the **Windows app** (WebView2) and his phone runs the **Android app** (Capacitor
WebView). Neither has **Web Push**, and Web Push was the only way the server's notifications went
out (the 5-minute reminder sweep, the 15-minute digest/nudge cron). So:

- On the PC, only two kinds could ever show: task reminders while the app was running (an in-app
  timer) and "focus done". The digest and the nudge never could.
- The phone had **no notification path at all**. It had no FCM, no local notifications, and the
  WebView has no `Notification` API.

## The map (before → now)

| Notice | Trigger | Web / PWA | Windows app | Android app |
|---|---|---|---|---|
| Task reminder (`reminder_at`) | pg_cron `task-reminder-sweep` every 5 min (0016) → `notify` `task_reminder`: todo, `reminder_sent=false`, `reminder_at` in the last 10 min; sets `reminder_sent` | Web Push → `sw-push.js` (needs a stored subscription + permission) | **before:** in-app 30s sweep in `TrayBridge` → `notify_local` toast, app running only. **now:** the same sweep from `plan.ts` (unchanged path) | **before:** nothing. **now:** scheduled with the OS (`android.ts`) for the next 3 days; arrives with the app closed |
| Morning digest | pg_cron `morning-digest` every 15 min, `scheduled:true` (0045) → each user's `morning_digest_at` (default 08:00, their zone) | Web Push | **before:** nothing (no push). **now:** the sweep toasts it at the user's time, silent | **before:** nothing. **now:** scheduled, on the Quiet channel (silent) |
| Evening nudge | pg_cron `evening-nudge` every 15 min (0045), `evening_nudge_at` (default 21:00); skipped on an empty day | Web Push | **before:** nothing. **now:** sweep toast | **before:** nothing. **now:** scheduled; counts are as the phone last synced |
| Focus done | the timer, in the app (`watchFocusDone`), only when nobody's looking | SW `showNotification` if permission is granted | `notify_local` | **before:** nothing. **now:** shown now when the round ends in the app; when the app goes to the background mid-round, its end is scheduled with the OS |
| "vX is out" | the update check (`whats-new/check.ts`) | in-app toast only | `notify_local` (not when looking, paused or in quiet hours) | in-app toast only (unchanged) |
| Overdue | `overdue-sweep` cron (0006) | Web Push | nothing (unchanged) | nothing (unchanged) |
| Test | Settings → Notifications | `notify` `{kind:'test'}` → push to all this account's devices | `notify_local` | **before:** a push to 0 devices. **now:** Android's own notification |

What has to be true for one to show on each platform:

- **Every platform:**
  - the kind's switch is on;
  - notifications aren't paused (tray "Pause for 1 hour");
  - quiet hours (on by default, 22:30–07:00) don't stop anything. They make it silent.
- **Web:**
  - the browser is subscribed (a `push_subscriptions` row for its endpoint);
  - permission is granted;
  - the crons run and the VAPID secrets are set.
- **Windows:**
  - the app is running (the window can be closed to the tray);
  - Windows allows toasts for `com.kaisflow.garden`, and Do not disturb is off.
- **Android:**
  - POST_NOTIFICATIONS is granted (asked once on first launch, and again from the test);
  - the app has run since the reminder was set, so it's on the phone's schedule.

## Root causes

1. **PC (Windows app):** WebView2 has no Web Push, so the digest and nudge had no channel. Reminders
   only fired while the app ran. Windows itself isn't the problem: the coordinator checked that toasts
   are enabled, that `com.kaisflow.garden` is registered, and that the Start-menu shortcut exists.
   `notify_local` uses `app.config().identifier` = `com.kaisflow.garden`, the same AUMID the installer
   stamps on the shortcuts (`SetLnkAppUserModelId` → `BUNDLEID`).
2. **Phone (Android app):** the Android WebView has neither the Push API nor `Notification`.
   `showLocal` returned without doing anything, and Settings offered "Subscribe this device", which can't
   work there. Nothing could reach the phone.
3. **Web:** the code path is intact (harness: `sw-push.js` shows the pushed reminder with Done ·
   Tomorrow). The cron and VAPID state can't be read from here. See "Kai checks" below.
4. **Smaller:**
   - The server reminded about tasks in **Trash** (no `deleted_at` filter).
   - On Windows, a reminder that fired at start-up, before projects had loaded, lost its project ("08:50"
     instead of "08:50 · Car").
   - The test notice said "push is wired up" even when it wasn't a push.

Ruled out:

- quiet hours: these silence notices, they don't drop them;
- `reminder_sent`: the devices don't read it;
- the zone math: covered by the tests ×4 TZ;
- the v1.0.23 sounds work: `playSound` doesn't gate notices;
- the tasks-noise work: it doesn't touch this path.

## What changed

- `app/src/features/notifications/plan.ts` (new, pure, 13 tests): `localPlan` lists what a device
  should show in a time window, using the same rules and wording as `notify`. That covers:
  - reminders, grouped by moment;
  - the digest and the nudge at the user's own times;
  - all through `copy.ts deliver`, so kind switches, pause, quiet hours and lock-screen names apply.

  `blockers()` returns the plain lines the test shows.
- **Windows** (`TrayBridge.ts`): the 30-second sweep now runs `localPlan`, so the digest and the nudge
  toast too. Each one shows once (`kf_reminded` keys). The sweep waits one round while projects
  load. Toasts still go through `notify_local`, unchanged.
- **Android:**
  - `@capacitor/local-notifications@8.3.1` ($0).
  - `notifications/android.ts` keeps the OS schedule in step with the data:
    - The next 3 days are scheduled, then replaced whenever tasks, projects, settings or the focus timer change.
    - Going to the background with a round running also schedules that round's "minutes tended".
    - Four channels: Reminders, Rituals, Focus, and Quiet (silent ones).
    - Done/Tomorrow/Plan/Shut down buttons run through `runNotificationAction`, the same handler a push uses.
    - Small icon: the K (`res/drawable-nodpi/ic_stat_kf.png`).
  - Exact alarms are used when allowed. `android-native.sh` adds `USE_EXACT_ALARM`, which Android
    grants at install, and the app falls back to inexact alarms rather than opening a Settings screen.
  - POST_NOTIFICATIONS is asked once on first launch.
- **Settings → Notifications** (only inside the card):
  - "Send a test notification" goes the way a real notice does on this device: a Windows toast,
    Android's own notification, or a push.
  - A list under the button names what's in the way:
    - permission denied, or not asked yet;
    - this device isn't subscribed;
    - paused until HH:MM;
    - quiet hours on;
    - the kinds that are off;
    - no delivery channel.
  - On Android, the push "Subscribe" block is replaced by one line explaining that the phone sets
    its own notifications.
  - The web "subscribed" check uses this browser's real endpoint, not the user-agent label.
- **`notify`**:
  - a task in Trash never reminds;
  - the test copy now reads "Test notification — this device can show them."

  ⚠️ This needs a functions deploy (release workflow) to go live. Nothing was deployed.

## Evidence

- vitest ×4 TZ (Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata, run from PowerShell): **1483/1483**
  each. New tests: `plan.test.ts` (13) and `android.test.ts` (9, against a stand-in for the plugin).
- `npm run lint`: exit 0, no warnings in the touched files. `npm run build`: green.
- `docs/log/assets/notify-fix/verify.mjs`: **26/26**. Results and screenshots are in that folder. It checks:
  - Windows: a due reminder → `notify_local` once, with its project;
  - trashed, paused or kind-off → nothing;
  - 08:00 digest and nudge toasts;
  - web: the tab never toasts a reminder itself, and `sw-push.js` shows the pushed one;
  - the test button's states: clear, paused/quiet/kinds off, not subscribed, never asked, denied, web push sent.
- Re-runs: tray-notify **57/57**. Its lead-time check now accepts "in 8 min" as well as "in 9 min",
  because the sweep may wait 30 s for projects. today-phone **158/158**. desktop-polish **150/150**.
- **Android:**
  - `npx cap add android` + `android-native.sh` + `gradlew assembleDebug` built `app-debug.apk`
    (36 MB) with the plugin. Kotlin 2.0.21 came from Maven Central, so CI needs nothing new.
  - The manifest has POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM (from the plugin) and USE_EXACT_ALARM.
  - **Not run on the emulator.** D: had 4.4 GB free, not 13, and the emulator took about 3 GB.
    D: dropped to 0.7 GB, so my watchdog killed it twice. The generated `app/android/` and `dist/`
    are deleted. The Android behaviour is covered by `android.test.ts`, not by a device. **The first
    real proof is Kai pressing the test on the phone.**

## Kai: what to do and check

1. **Phone:**
   - Install the next APK that has this branch. The phone is on v1.0.21 today.
   - Open the app once, and tap **Allow** on the notification prompt.
   - Settings → Notifications → **Send a test notification**. The list above it should say
     "Nothing in the way on this device."
   - If it says permission denied: Android Settings → Apps → Kai's Flow → Notifications → on.
   - The phone plans from what it last synced. A reminder set on the PC reaches the phone's schedule
     the next time the phone app opens. Real server push to the phone is FCM, still on the "later" list.
2. **PC:**
   - Press **Send a test notification** in the Windows app.
   - If nothing shows in the corner, check Windows Settings → System → Notifications → **Kai's Flow**
     (on, banners on) and **Do not disturb** / Focus.
   - Reminders, the digest and the nudge need the app running. Closing the window keeps it in the
     tray; Start with Windows keeps it there after a reboot.
3. **Server (web/PWA), only Kai can read these:**
   - In the Supabase SQL editor:
     `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname in ('task-reminder-sweep','morning-digest','evening-nudge') order by d.start_time desc limit 20;`
     All three should be `succeeded` every 5/15 min.
   - Then `select status_code, content from net._http_response order by created desc limit 10;`
     should be 200 with `sent` counts, not 401/400. A 400 `bad_request` usually means `VAPID_KEYS` is
     unset or malformed (edge-function secrets).
4. **Expect duplicates** when the same device has two channels. For example, a Chrome tab
   subscribed to push on the PC *and* the Windows app will each show a reminder. Unsubscribe the
   browser if that's noisy.

## Not done

- No FCM.
- No iOS.
- The overdue sweep still pushes only.
- Settings' phone summary row still says "N devices" (push devices). It's outside the Notifications
  card, which `claude/ui-pass` owns.
