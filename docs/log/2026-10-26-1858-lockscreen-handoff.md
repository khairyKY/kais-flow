# lockscreen handoff — 2026-10-26 18:58 (Cairo)

Branch `claude/lockscreen`, built on `claude/kai-bugs-1012` (which already has notif-sounds). The spec is the "Samsung lock screen" section of `design-export/Phone home options.html` (`#lockscreen`, worktree today-looks). The research is in `2026-10-26-1720-today-looks-handoff.md` → "Push 2". Kai asked for all three options. Not merged, not released.

## What was built

### A · Top 3 on the lock screen (Good Lock › LockStar)
- **`LockWidget`** is a separate small AppWidget, "Top 3 · lock screen", in its own files:
  - `java/.../widgets/LockWidget.java`
  - `res/xml/kfl_top3.xml`
  - `res/layout{,-v31}/kfl_top3.xml`
  - `kfl_top3_preview.xml`
  - `kfl_*` drawables
  - `values{,-night}/kfl_colors.xml`
  - `kfl_strings.xml`
- `widgetCategory="home_screen|keyguard"`, with an `initialKeyguardLayout` and a `previewLayout`.
- The goal comes first (✶, serif, gold), then the two picks, with a done count.
- **Ticks:**
  - Android 12 and later use a real `CheckBox` with `setOnCheckedChangeResponse`, so a tick works without opening the app.
  - Before 12, it's a tappable box.
  - Either way the tick goes through `Snap.tick`, the same queue as a home-screen tick. The app applies it next time it runs, and the home-screen widgets redraw too.
- **Night:** `values-night` gives light ink on night paper, so the widget is readable on the AOD.

### B · Now Bar (Android 16 Live Update)
- On Android 16 it posts a promoted ongoing `NotificationCompat.ProgressStyle` notification:
  - today's blocks are the segments, in palette C (Rose for an event, Iris for a task, gold for the goal, a block's own colour if it has one);
  - the gaps are a faint grey;
  - the progress is now's position in the day;
  - it calls `setRequestPromotedOngoing(true)`;
  - `POST_PROMOTED_NOTIFICATIONS` is added to the manifest by `android-native.sh`.
- **The chip ("20 min")** comes from `setWhen(end of the block, or the next start)`. Android 16 draws the remaining time itself once `when` is ≥ 2 min away and keeps it current.
  - **Deviation:** I did *not* use `setShortCriticalText("20m")`. A fixed string would go stale between redraws, and we don't poll. If Kai wants the exact "20m" wording, it needs a redraw every minute.
- **Below Android 16:** the same notification posts as an ordinary ongoing one, with a countdown Chronometer and the day as one progress bar.
- **Words:**
  - title: the block that's on, or "Next · …";
  - text: "11:00–12:30 · then ✶ CNN notes 13:30".
- **When it's shown:** while a block is on, and from 2 hours before the next one. Nothing shows overnight.

### C · Day strip notification
- An ongoing notification with `DecoratedCustomViewStyle`:
  - **collapsed:** the title and the strip;
  - **expanded:** title, text and strip.
- The strip is a bitmap drawn on a Canvas:
  - palette C blocks; past or done blocks are faded;
  - a terra now line;
  - hour marks (8 · 12 · 16 · 20);
  - the span is 8:00–22:00, wider if the day is.
- It has a Chronometer countdown and a **Start focus** action.
- It works on every version. A custom layout can't be promoted, and Settings says so.
- The design also showed "Snooze 10 min". I skipped it, because it isn't clear what it would snooze.

### Keeping B and C current (no polling)
B and C use the same triggers (`LockScreen.refresh`):
- **The snapshot changes:** a `SharedPreferences` listener on the widgets' `kf_widgets/snap` catches the app's pushes and the ticks.
- **One exact alarm** (`setExactAndAllowWhileIdle`, RTC_WAKEUP, using the app's existing `USE_EXACT_ALARM`) at the next start, end or 2-hour lead-in, or at midnight.
- **Boot and app updates:** a `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` receiver.
- **Settings toggles.**

### Notification channel
- One new channel, `lockscreen` ("Lock screen"): `IMPORTANCE_LOW`, no sound, no vibration, no badge.
- It has no `kf_` prefix, so notif-sounds' `staleChannels` never deletes it.
- The per-pack channels are untouched.

### Privacy
- B and C follow **Settings → Notifications → "Show task names on the lock screen"**. It's off by default, as for reminders.
- With it off they say "A block" / "✶ Goal of the day", and the lock widget says "Your goal / Pick 2 / Pick 3".
- `LockScreenSync`, mounted in AppLayout, pushes the switch to the shell.
- The home-screen "Hide titles" mask applies too, because everything reads the same snapshot.

### Settings → Notifications & sound → This phone
Each row is marked **This device**:
- **Lock screen: Now Bar.** Only on Android 16+. On by default.
- **Lock screen: Day strip notification.** Off by default. Its help says it can't also sit in the Now Bar. Both can be on together.
- **How to add the Top 3 to your lock screen.** Three numbered steps through Good Lock › LockStar.
- An APK from before this (no `window.KaisFlowLock`) shows none of these rows.
- The choices are kept natively (the `kf_lock` prefs) and read and written by `src/features/lockscreen/native.ts`.

## Evidence
- **Web gate** (`gate.ps1`):
  - vitest 2585/2585 in Cairo, UTC, Los Angeles and Tokyo;
  - lint 0, build OK, ds-check 0 new.
- **Harness** `docs/log/assets/lockscreen/verify.mjs`: **18/18** on the mock server :5325 (`results.json`, shots `this-phone-a16-day/night.png`, `this-phone-a14-day.png`). It checks:
  - mock Android 16: the three rows, This device tags, defaults, switches writing through, and the names push;
  - mock Android 14: no Now Bar row;
  - an older APK: no lock rows;
  - the web: none of it.
- **CI**, Android APK run [40353007056](https://github.com/khairyKY/kais-flow/actions/runs/40353007056), `gh workflow run android.yml --ref claude/lockscreen`, both jobs green:
  - **Build:** `assembleRelease testReleaseUnitTest`. `:app:testReleaseUnitTest` ran `LockPlanTest`: colours, current/next, the lead-in, next change, segments (incl. overlaps and a widened window), words with names on and off, and the countdown target.
  - **Smoke (emulator, API 34):** `LockWidget` is registered, `POST_PROMOTED_NOTIFICATIONS` is declared, the `lockscreen` channel exists at importance 2, and there's no FATAL.
  - The smoke app is signed out, so nothing is posted. The notifications themselves need Kai's phone (below).
- compileSdk and targetSdk are already 36 in the Capacitor 8 template, so nothing was raised. `release.yml` calls the same `android.yml`.

## Files outside lockscreen's own (for the merge)
- **`android-native.sh`:**
  - copies `native/android/test/`;
  - adds `androidx.core:core:$androidxCoreVersion` (1.17, for ProgressStyle) to the app module;
  - adds `POST_PROMOTED_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`;
  - inserts `lockscreen-manifest.xml` alongside `widgets-manifest.xml`, which is untouched.
- **`android.yml`:** adds `testReleaseUnitTest`.
- **`android-smoke.sh`:** adds the lock checks.
- **`MainActivity.java`:** one `registerPlugin(LockScreen.LockBridge.class)`.
- **`AppLayout.tsx`:** one `LockScreenSync` mount.
- **`SettingsPage.tsx`:** `LockScreenRows`.
- **widgets-build:** its shared style helpers weren't on kai-bugs, so the lock widget has its own minimal `kfl_*` resources. It *does* call `Snap` (`load`, `tick`, `minutes`, `day`, `nextMidnight`), `KfWidget.open` / `updateAll`, `WidgetBridge.nudge` and `Render.top3` / `struck`. If widgets-build renames those, fix the calls in `LockScreen.java` / `LockWidget.java`. Once its shared style lands, the `kfl_*` drawables could move onto it.

## Kai's checklist on the Samsung
1. **One UI version:** Settings › About phone › Software information. Note it (6.1 / 7 / 8 / 8.5).
2. Install the APK from run 40353007056 (or the next release). Open the app once and sign in. Open Today so the snapshot is fresh.
3. **A · LockStar:** install Good Lock from the Galaxy Store, then LockStar from inside it.
   - Does LockStar's widget list show **Kai's Flow › Top 3 · lock screen**?
   - Does it sit under the clock? Does it show on the AOD?
   - Does a tick work without unlocking?
4. **B · Now Bar** (One UI 8 only): Settings → Notifications & sound → This phone → **Lock screen: Now Bar** should be on. Plan a block that starts within 2 h.
   - Does the lock screen show the **Now Bar pill**, with the segments and the "x min" chip? Does it also show in the status bar and on the AOD (with "Show Now bar" on)?
   - If not: check Developer options → "Live notifications for all apps", and Settings › Notifications › Kai's Flow › "Live notifications".
5. **C · Day strip:** turn on **Lock screen: Day strip notification**.
   - Does an ongoing "now / next" notification show the strip with the now line on the lock screen?
   - Does it change when a block starts or ends, without the app being opened?
6. Optional: turn on "Show task names on the lock screen" (Notifications → Quiet). Do the names appear on all three?
