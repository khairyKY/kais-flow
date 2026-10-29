# notif-sounds handoff — 2026-10-26 18:07 (Cairo)

Branch `claude/notif-sounds`, built on the release branch, which already has notif (`2026-10-26-0409-notif-handoff.md`). Kai, on the sounds page: "include all of them and keep them separated, each in its pack".

## The packs
Every one of the 28 candidates ships, each in exactly one pack. Every pack has a sound for all ten kinds.

| Pack | What it is |
|---|---|
| **Felt** (the default) | The A/B options in the felt voice: muted felt piano, warm and low. |
| **Glass** | The A/B options in the glass voice: soft glass bells, airy. |
| **Mixed** | Every C option, felt and glass together, with more chords. Two sounds were made for it: **break end** (glass, G up to the high C) and **terms** (felt, C up to E). |

- The A and B options were already one felt and one glass per kind, so they make the Felt and Glass packs without any picking.
- The files are `app/public/notification-sounds/<pack>/<kind>.wav`.
- `design-export/notification-sounds/make.mjs` writes them. Run `--check` to re-render and compare:
  - the 28 existing sounds are byte-identical after the move (git sees them as renames);
  - all 30 are about −16 LUFS, with true peak ≤ −1.1 dBTP and nothing clipped;
  - `--check` also fails if any pack is missing a kind.
- ffmpeg `ebur128` on the two new sounds: −15.7 and −16.0 LUFS.

## How a pack is chosen
- **Separately from the app's own sounds.** Settings → Notifications & sound → **Notification sounds** sits under the existing **Sound** card. It has:
  - **Pack** (Felt · Glass · Mixed);
  - a ▶ row for each of the ten kinds.

  The per-kind on/off switches stay in **Kinds**, unchanged.
- **Why separate:**
  - The app sounds are synthesised on each device (kalimba / felt / glass), use that device's volume, and are kept in localStorage.
  - Notification sounds are files. The pick must sit on the server, because the Android planner needs it when it schedules a week of alarms, and a notification should sound the same on every device.
  - The two sets also differ: there is no kalimba notification pack, and the app sounds have no Mixed.
- **Synced key:** `app_settings.notification_sound_pack` (migration **0088**), `text not null default 'felt'`, with a check that it is felt, glass or mixed.
  - It is read through `features/notifications/sounds.ts notifyPack()`. Absent or unknown reads as Felt.
  - It is written only once the fetched row has the column (`settingSynced`, the 0058 pattern). Until the push, the row says "Choosing arrives with the next server update", and ▶ still auditions any pack.
- **settings-sync** (parallel) adds 0087 `prefs jsonb` for settings that live in localStorage first. The sound pack is a server-read notification setting, so it uses its own column like the other notification settings. If its number collides at merge, renumber 0088.

## What each platform does
**Which sound each notice plays** (`soundOf`):

| Notice | Sound |
|---|---|
| task reminder | task reminder |
| snoozed reminder coming back | snoozed again |
| routine | task reminder |
| test | task reminder |
| event reminder | event starting |
| birthday | event starting |
| focus done | focus round end |
| digest, nudge, paper ready, terms, sync problem | their own sound |

- A snoozed reminder is marked `again` by the device planner (`plan.ts`, `Notice.again`).
- Silent notices play nothing: the digest, and everything during quiet hours or Pause.

**Android:**
- Each sound of the chosen pack is its own channel, `kf_<pack>_<sound>`, named e.g. "Task reminder (Felt)". It plays `res/raw/kf_<pack>_<sound>.wav`. Quiet stays as before for silent notices. Importance is 4 for reminders, events, snoozed, focus end and break end, and 3 for the rest.
- `.github/scripts/android-native.sh` copies the 30 WAVs into `res/raw` with a `keep.xml`. It fails the build if the count doesn't match.
- **Switching packs:**
  1. The app re-plans (the `app_settings` cache change already triggers this) onto the new pack's channels; the same ids replace their alarms.
  2. Then it deletes the other packs' channels and the pre-pack Reminders / Rituals / Focus channels.
  3. A failed schedule deletes nothing. Android's own channels are never touched.

**Windows (Tauri):**
- The app plays the pack's WAV and sends the toast with `silent: true`.
- If the WebView can't play (nobody has clicked it since it started hidden to the tray), the toast keeps Windows' sound, so a notice is never silent by accident.
- No Rust was changed.

**Web / PWA:**
- A local notice works like Windows: the app plays the sound and the notification is silent, or the browser's sound plays if the app can't.
- **A push:**
  - `sw-push.js` asks a window that is on screen to play the sound (`kf-notification-sound` over a MessageChannel, 600 ms).
  - If it played, the notification goes out silent. Otherwise, or with no window on screen, the browser's own sound plays.
  - Settings says this on the web: "Played when the app is open; otherwise your browser's own sound".
- The WAVs are not precached. A CacheFirst runtime cache keeps each one after it first plays.

## Not done / notes
- **Break end:** the sound is in every pack, but the app sends no break-end notification yet. When the focus timer gets one, `soundOf` maps it.
- **Snoozed again on web push:** `notify` doesn't mark `again`, so a snoozed reminder sent by push plays the task reminder sound. Android and Windows plan locally and do mark it. One line in `notify` would fix it, but no edge function was touched.
- **Kinds help line:** it still shows the old channel labels ("Reminders · with sound"). They are labels only.
- **APK size:** the WAVs are in the APK twice, about 2.5 MB each: `res/raw` for the channels, and `assets/public` for the WebView's ▶ previews.
- **Migration 0088 is not pushed.** It goes with the release (`supabase db push`).

## Gate
- `tsc -b`: clean.
- `vitest`: 185 files / 2573 tests.
- `lint`: 0 errors.
- `ds:check`: 0 new.
- `build`: OK.
  - Entry `main-*.js` is 174.73 kB (gzip 56.01) against 173.10 kB (55.36) on the base, about +1.6 kB.
  - No WAV is precached (precache is 312 entries).
- **Unit tests:**
  - `sounds.test.ts`: every pack × kind has its WAV and nothing else is there; res/raw names are valid and unique; kind → sound; parse.
  - `android.test.ts`: channels per pack, `channelFor`, `staleChannels`, the switch order (schedule, then delete), and that a failed schedule deletes nothing.
  - `sw.test.ts`: a window on screen plays, so the push is silent; a window that refuses keeps the system sound; a hidden window or a silent notice asks nothing.
  - `plan.test.ts`: a snoozed reminder is `again`.
- **Harness `docs/log/assets/notif-sounds/verify.mjs`: 24/24.**
  - Settings: the picker with ▶ for all ten kinds, and all 30 WAVs served.
  - Switching packs writes the synced value and the ▶ rows follow. Before 0088, nothing is written.
  - Windows: a reminder gives a silent toast plus Glass's WAV; Windows' sound when the app can't play; Mixed's "snoozed again".
  - Web: a push for an event plays Mixed's event sound and answers "played"; a window that can't play answers false.
  - Shots: `settings-desktop-day/night.png`, `settings-phone-day.png`.
- **Other harnesses**, one at a time on the dual-stack mock (:5319), server stopped after:

  | Harness | Result |
  |---|---|
  | sounds | 126/126 |
  | notify-fix | 26/26 |
  | tray-notices | 59/59 |
  | tray-notify | 57/57 |
  | event-reminders | 37/37 |
  | settings-build | 193/193 |

  - sounds, notify-fix, tray-notices, tray-notify and event-reminders still opened `/settings` (the settings-build handoff listed them for retargeting). They now open `/settings/notify`, and tray-notify's Windows rows open `/settings/about`.
  - The sounds harness's Sound-card checks follow the three-way pack picker.
  - event-reminders w1 accepts "with sound" as the pack's WAV played by the app.
  - settings-build's inventory has the new rows.
- **Android:** `android.yml` was dispatched on `claude/notif-sounds`, run **40339167126**: success.
  - The APK built; the log shows "notification sounds: 30 in res/raw".
  - The downloaded APK has 30 res WAVs, path-shortened by AGP, and `resources.arsc` names them `kf_felt_task_reminder`, … .
  - The emulator smoke test passed.
- `grep -c birthday_on app/src/lib/types.ts` = 1; `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.

## Kai: check
1. Settings → Notifications & sound → Notification sounds: press ▶ on each kind, then switch packs.
2. Phone, after the next APK:
   - Android Settings → Apps → Kai's Flow → Notifications lists "Task reminder (Felt)" and the rest.
   - Switch to Glass in the app, open it once, and the list becomes "(Glass)".
   - A reminder 3 minutes ahead rings with the pack's sound.

## Files
- `design-export/notification-sounds/make.mjs`, `sounds.js`, `measurements.json`
- `design-export/Notification sounds options.html`: now the packs view
- `app/public/notification-sounds/{felt,glass,mixed}/*.wav` (30)
- `app/src/features/notifications/sounds.ts` (new), `sounds.test.ts` (new)
- `app/src/features/notifications/android.ts`, `local.ts`, `actions.ts`, `plan.ts`
- `app/src/features/notifications/android.test.ts`, `sw.test.ts`, `plan.test.ts`
- `app/public/sw-push.js`
- `app/src/features/settings/SettingsPage.tsx`: `NotificationSoundsCard`
- `app/src/lib/types.ts`
- `app/vite.config.ts`
- `supabase/functions/notify/copy.ts`: `Notice.again`, type only
- `supabase/migrations/0088_notification_sound_pack.sql`
- `docs/DATA_MODEL.md`
- `.github/scripts/android-native.sh`
- `docs/log/assets/notif-sounds/` (new), plus the retargeted harnesses above
