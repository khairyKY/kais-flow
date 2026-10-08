# Android home-screen widgets: handoff

**Branch:** `claude/widgets` (from `claude/wave-v` = v1.0.25). **Design:** `design-export/Phone Widgets.dc.html` (generator `design-integration/render_widgets.mjs`).

All 34 designs and the six states are built. They ship as **32 picker entries**, because the design pairs two of them:

- **Focus.** W18 (timer) and W19 (idle) are one widget. It shows the timer while a round runs and the fern when no round runs.
- **Rituals.** W29 (Plan my day) and W30 (Shut down) are one widget with two faces, as the design says.

## How it's built

**Stack.** Java `AppWidgetProvider` with XML `RemoteViews`, under `app/native/android/`. I didn't use Glance, because it would bring Kotlin, Compose and the Glance dependencies into a project that `cap add android` generates fresh on every build. Plain RemoteViews needs nothing new in Gradle.

**Native files (`app/native/android/java/com/kaisflow/garden/widgets/`):**

| File | What it does |
|---|---|
| `KfWidget.java` | One provider class per picker entry (`W01`…`W34`). Each one is a kind plus a default size. It picks its face from its family by the size the launcher gives it (Top 3 2×2 → Today 4×2 → Today 4×4). It also redraws everything and sets the one redraw alarm. |
| `Render.java` | The Today family, the shared row and tick helpers, and the states. |
| `Families.java` | Capture, Calendar, Focus, Routines & streaks, Triage, Rituals & reflection. |
| `Snap.java` | The snapshot and the tick queue, kept in SharedPreferences. Also the optimistic tick rules. |
| `WidgetActions.java` | Receives ticks, Stop and Done, and the redraw alarm. |
| `WidgetBridge.java` | `window.KaisFlowWidgets` (`setSnapshot`, `takeQueue`). It's registered in `MainActivity` the same way as `KaisFlowShell`. |

**Other native pieces:**

- **Resources.** Layouts are in `res/layout/kfw_*`. Day and night colours come from the app tokens in `res/values{,-night}/kfw_colors.xml`. Picker metadata is in `res/xml/kfw_wNN.xml`, and labels and descriptions are in `values/kfw_strings.xml`, in the design's own words.
- **Bitmaps.** The garden art, grain, tape, dash tile and picker previews (`drawable-nodpi`) come from `design-integration/render_widget_res.py`.
- **CI.** The workflow's copy-and-patch step now lives in `.github/scripts/android-native.sh`, which both `android.yml` and local builds run. It copies `java/`, `res/` and the debug-only gallery. A small python step inserts `native/android/widgets-manifest.xml` (the receivers) before `</application>`, and the build fails if fewer than 30 provider entries land.
- **Smoke test.** `android-smoke.sh` now also checks that `dumpsys appwidget` lists all 32 providers.

**Web side (`app/src/features/widgets/`):**

| File | What it does |
|---|---|
| `snapshot.ts` | A pure `buildSnapshot()` built from Today's own reads, plus the "Hide titles" mask. Tested. |
| `WidgetBridge.tsx` | Mounted in AppLayout, Android app only. It writes the snapshot when it changes (debounced 0.8 s), on resume, at the day rollover (minute clock) and at least every 15 minutes. It takes the tick queue and installs `window.__kfWidgetOpen`. |
| `queue.ts` | The tick rules, pure and tested. |
| `bridge.ts` | Applies ticks through the app's own writes and runs the widget taps. |
| `native.ts` | The shell bridge. It has no store imports, so AuthProvider can import it to send the signed-out snapshot (S4). |

**Freshness, with no background process:**

- The app pushes whenever its data changes.
- Android's own `updatePeriodMillis` fires every 30 minutes.
- One inexact, non-waking `AlarmManager.set` fires at the next moment something drawn changes: a block starts or ends, a focus round runs out, 17:00 (the ritual face) or midnight. While a round runs it also fires once a minute, to move the ring and the minutes.
- Times are drawn as clock times. "In 20m" and "1h 23m left" are a `Chronometer` counting down, and the focus timer is a `Chronometer` too.
- Now, Up next, the now line and past-block fading are worked out on the phone from the day's blocks, so they stay right between pushes.
- After midnight, a snapshot from yesterday reads as a new day (Nothing yet / Plan my day) instead of showing yesterday's Top 3.

## Ticks and taps: how changes get written back

I chose **queue + outbox**. No session token ever reaches native code.

1. A tick (task, goal or routine) or focus Stop / Done is a broadcast to `WidgetActions`.
2. `Snap.tick()` draws it straight into the stored snapshot (box filled, title struck, progress +1) and appends `{t, id, at}` to a queue in SharedPreferences. Every widget redraws at once.
3. If the app is running, the shell calls `window.__kfWidgetQueue()` straight away. Otherwise the app takes the queue the next time it starts or resumes.
4. The app applies each item through its normal writes:
   - tasks go through the notification **Done** path (`runNotificationAction('done')`, then outbox, activity log);
   - routines go through `toggleCompletion`, which only ever checks, never unchecks;
   - focus goes through `applyFocusCommand('stop')`.
5. Until the queue is taken, every snapshot the app writes gets the queued ticks folded in again, so a tick never flickers back.

**Taps that open the app** are `PendingIntent`s to `MainActivity` carrying a route:

- **App already open.** `MainActivity.openFromWidget` runs the route in place through `window.__kfWidgetOpen`.
- **Cold start.** The route loads, and the notification actions' `?kfAction=` reader runs it.

**The routes:**

| Action | Route |
|---|---|
| Open a task | `/today?task=<id>` (the task sheet) |
| Capture | `kfAction=capture`: the type sheet; the shell then calls `showSoftInput` so the keyboard comes up |
| Talk | `voice` (the voice sheet) |
| Paper | `paper` |
| Ask | `ask`, with the chip's question pre-typed |
| Start focus | `focus-start` (on the goal, or the block's task) |
| Plan / Shut down | `plan` / `shutdown` (existing) |
| Replan all | `replan` → `/today?ritual=replan`, which opens the overdue fold's Plan list |
| Tap a day | `/calendar?date=…` (the phone calendar now honours it) |
| Sort them | `/inbox` |
| One line | `/journal` |

**Privacy.** I added **Settings → Notifications → "Hide titles on the home screen"** for Android only. It applies to this phone, because widgets are per device, so it's a local setting, not a synced one. It sits next to the lock-screen names setting. When it's on, `mask()` swaps every name before the snapshot leaves the WebView, so the names never reach SharedPreferences. Tests check that no task title appears in the masked JSON.

## How it was verified (emulator only, `-s emulator-5554`; Kai's phone was never touched)

- **Local build of the CI steps:** `npm ci`, `npm run build`, `npx cap add android`, `android-native.sh`, then `gradlew assembleDebug` (JDK 21, android-36). It compiles.
- **Gallery.** A debug-only `WidgetGallery` activity (`src/debug`, never in release builds) draws every widget through the real `Render` with the design's sample day, in Day and Night, at the design's grid sizes.
  - 82 / 82 renders succeeded. `RemoteViews.apply` uses the same class filter as a launcher, so a layout a launcher would refuse would fail here too.
  - It also runs a self-check of the tick rules (`selfcheck ok`). The self-check caught one real bug: focus Done ticked the wrong task. That's fixed.
- **Real launcher (AOSP Launcher3, API 34).**
  - I pinned W04, W09, W16, W18 and W25 through `requestPinAppWidget`. The pin dialog shows the label, size, description and preview.
  - With a seeded snapshot, I tapped the goal's box on the home screen. It filled and struck at once, and the queue held `{t: task, id: g1}`.
  - I switched the system to dark mode and the widgets turned Night with no redraw.
- **Gate:** vitest 1461 / 1461 in each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Kolkata (PowerShell `$env:TZ`). `npm run lint` passes and `npm run build` is green.

## Widget status

Every widget below is built, day and night. Screenshots are in `docs/log/assets/widgets/`.

| Family | Widgets | Sheet |
|---|---|---|
| Today | W1 goal slim · W2 goal card · W3 Top 3 small · W4 Today 4×2 · W5 full page · W6 Now (running and next) · W7 Up next · W8 Day progress | `family-today.jpg` |
| Capture | W9 seal · W10 pill · W11 bar · W12 Paper · W13 Ask | `family-capture.jpg` |
| Calendar | W14 Agenda · W15 Agenda + week · W16 Week strip · W17 Countdown | `family-calendar.jpg` |
| Focus | W18 timer · W19 idle · W20 slim | `family-focus.jpg` |
| Routines & streaks | W21 · W22 week · W23 streak plant · W24 tiny | `family-routines.jpg` |
| Triage | W25 Inbox · W26 tiny · W27 Overdue · W28 Slipping | `family-triage.jpg` |
| Rituals & reflection | W29 / W30 Plan · Shut down · W31 One line · W32 From a while ago · W33 Pressed · W34 Season | `family-rituals.jpg` |
| States | S1 All done · S2 Nothing yet · S3 Offline / stale · S4 Signed out · S5 First paint (also every widget's `initialLayout`) · S6 Inbox zero | `family-states.jpg` |
| On a launcher | the pin dialog, a tick before and after, Night | `launcher-*.jpg` |

## Where it differs from the design

1. **Fonts.** A launcher inflates widgets in a *restricted* context, and there `TextView` ignores an app's font resources. I bundled the fonts, confirmed on Launcher3 that they're dropped, and removed them. The widgets use the phone's own faces instead: Source Serif → `serif` (Noto Serif), Courier Prime → `serif-monospace` (Cutive Mono, a typewriter), Caveat → `cursive`, Inter Tight → `sans-serif`. Weight 600 becomes bold. The only way to get the real faces is to draw text as bitmaps (see the decisions below).
2. **Long-press to talk isn't possible.** Android gives a long press on a widget to the launcher, for moving and resizing. The seal's tap types. Talking happens through the mic buttons (W5, W11, W31). W10's line reads "tap to type" instead of "tap · hold to talk".
3. **Paper opens the capture sheet, not the camera.** A WebView only opens the camera from a tap of its own, so Paper capture's tap opens the capture sheet, where the camera button is one tap away.
4. **Ask's chip pre-types** "What should I drop?" in the chat. It doesn't send it.
5. **Effects RemoteViews can't do:**
   - The grain is a tiled translucent bitmap, not a multiply blend. It's clipped to the corners from Android 12 on and hidden below 12.
   - The tape is a pre-rotated bitmap.
   - Goal cards aren't turned by −0.4°.
   - The block rule is a 3dp bar, not a curved border.
   - The icon on a terra button uses `on-terra`, which is dark at night, instead of always white.
6. **Countdown.** The app has no "pin a countdown" yet, so W17 counts to the soonest priority-1 task with a date, or else the next all-day event.
7. **One line** shows today's written line, or a faint "one line about today…". The design's sample line was example content, not a placeholder. Both of its buttons open the Journal; the mic doesn't record into the journal.
8. **From a while ago** shows the app's real resurfaced item, a task or Inbox item, with "Task · 3 weeks ago". The app doesn't resurface journal lines.
9. **Agenda 4×3** shows three blocks; the design's four don't fit at 260dp. The free-hours count runs until 21:00.
10. **Responsive sizes are guessed from dp.** The launcher reports dp, not cells: under 130 / 240 / 330 dp wide means 1 / 2 / 3 columns, and under 160 / 270 / 380 dp tall means 1 / 2 / 3 rows. On Launcher3 a "4×2" was placed 3 columns wide, so Today keeps its wide face down to 3 columns and only switches to the small Top 3 at 2.
11. **Stale (S3)** shows when the app was offline at its last write, or when the snapshot is more than 3 hours old. The foot says "syncs when online" or "open to refresh".

## For Kai to decide

1. **Fonts.** Is the phone's Noto Serif / typewriter mono close enough, or should the headline text (dates, goal titles, big counts, the Caveat lines) be drawn as bitmaps in the real faces? Bitmaps are more code and memory, and that text no longer scales with the font size setting.
2. **W10's copy.** "tap to type" for now, since hold-to-talk can't exist on a widget.
3. **Countdown.** Do you want a real "pin as countdown" on a task or event? It would need a small migration.
4. **When "stale" shows.** The 3-hour threshold means a widget dims after a few hours without opening the app. That's honest, since nothing refreshes the data without the app, but it may feel noisy.
5. **Hide titles.** It's a per-phone setting and separate from "Show task names on the lock screen". Should one switch drive both?

## Reproduce locally

```bash
cd app && npm ci && npm run build && rm -rf android && npx cap add android && bash ../.github/scripts/android-native.sh
echo "sdk.dir=D:/Coding/Tools/android-sdk" > android/local.properties
cd android && JAVA_HOME=/d/Coding/Tools/jdk21 GRADLE_USER_HOME=/d/Coding/Tools/gradle-home ./gradlew assembleDebug
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -W -n com.kaisflow.garden/com.kaisflow.garden.widgets.WidgetGallery            # PNGs → files/widgets
adb -s emulator-5554 shell am start -n com.kaisflow.garden/com.kaisflow.garden.widgets.WidgetGallery --es seed 1   # sample day → the real widgets
adb -s emulator-5554 shell am start -n com.kaisflow.garden/com.kaisflow.garden.widgets.WidgetGallery --es pin W04  # pin dialog
```
