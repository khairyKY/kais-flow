# 2026-10-26 17:53 (Cairo) · handoff · settings-sync — the settings follow the person

Branch `claude/settings-sync` (based on the release branch with settings-build merged). Kai: "the settings should always be the same for both the phone version and desktop".

## The rule

- Every setting that belongs to the person is synced. The ones that were kept on the device stay in that device's localStorage, so they still load before first paint, work offline, and work before sign-in. They are now also mirrored into **`app_settings.prefs`** (migration **0087**) as `{ key: { v, at } }`.
- **The most recent change wins, per setting.**
  - On the server: a `before update` trigger keeps the entry with the later `at` for each key. A device that writes the whole row from an older copy therefore can't take back another device's newer value.
  - On each device: `lib/prefs.ts decide()` takes a newer server entry and sends a newer local one.
  - `at` is the changing device's clock. A clock that is minutes off can lose a race that happens within those minutes.
- **One-time migration.** Values from before this have no time.
  - The first device to open this version sends its values, stamped `1970-01-01`.
  - Every other device adopts what the server has.
  - Any later change, anywhere, beats the seeded values.
  - A device that only ever had Night (no theme mode saved) counts as Dark.
- **Live.** `app_settings` joins the realtime publication (0087) and `lib/realtime.ts`. A change shows on the other devices within the realtime hop, with no reload:
  - every row column (quiet hours, captures, time zone…);
  - every pref.
  - Stores re-read through `onPrefApplied`. Settings redraws its open page on `usePrefsVersion()`, because its rows keep their own copies of the values.
- **Interface size: synced per device class.** The keys are `kf_ui_scale.phone` and `kf_ui_scale.computer`. The class comes from the same rule that picks a device's default size: coarse pointer or a short screen side under 600 counts as a phone.
  - A phone follows phones and a computer follows computers. 100% on a phone and 150% on a 1920 monitor are both right.
  - The row's help says "same on all your phones / computers".
- **Before 0087 is pushed nothing breaks.** Prefs are written only once the fetched row has `prefs` (the 0058 pattern), and the app subscribes to `app_settings` only then. Changes made in the meantime are stamped locally and go up on the first pass after the push.
- **[KAI] `supabase db push` for 0087** before this ships. Until then the app behaves as before, with every device keeping its own values.

## The audit — where every setting lives

| Setting | Where | Before | Now |
|---|---|---|---|
| Name and workspace | Account | `app_settings` | synced, live |
| Theme (Light / Dark / Auto) | Appearance | localStorage `kf_theme_mode` | **synced** (Auto follows each device's system; the resolved Day/Night `kf_theme` stays local) |
| Interface size | Appearance | localStorage `kf_ui_scale` | **synced per class** (phone / computer) |
| Paper texture | Appearance | localStorage `kf_grain` | **synced** |
| Botanical animations | Appearance | localStorage `kf_effects` | **synced** (OS reduced-motion still applies per device) |
| Time zone, Weekend, Opens on | Calendar & time | `app_settings` | synced, now live |
| Time format, Week starts on, Fit days, Fit hours, Density, Second time zone, Now card (+ View options' Show weekends / Show completed) | Calendar & time · calendar ⚟ | localStorage `kf.calViewOptions` (cal-wave: per device) | **synced** (one entry) |
| File captures for me, Pick a project, Page photos | Capture & AI | `app_settings` | synced, now live |
| Scans today / Read when offline | Capture & AI | server count / device queue | status, not settings |
| 9 notification kinds, digest & nudge times, Quiet hours, lock-screen names, pause | Notifications | `app_settings` | synced, now live |
| Sound, volume, pack, the 7 sounds, Silent after Shut down | Notifications & sound | localStorage `kf_sound_*` | **synced** |
| Domains, Labels (+ colours), smart lists, checklist templates, notebook layout, tour seen | Organize / elsewhere | tables / `app_settings` | synced |
| "Not now" comes back after (high / med / low) | Organize | localStorage `kf.resurfaceCooldown.*` | **synced** |
| Focus round lengths, auto-starts, chime, garden view | Focus page | localStorage `kf_focus_settings` | **synced** (an idle round adopts the new length) |
| Rituals pinned to Today | Routines page | localStorage `kf.ritualPins` | **synced** |
| Google, GitHub, AI assistants, capture key, Groq | Integrations | `integrations` / `mcp_keys` / server | synced (server) |
| Privacy & terms agreed | Privacy | `consents` | synced |
| **This device** (test + what's in the way: permission) | Notifications | browser / OS | **stays here**, row named "This device" |
| **This browser**: push subscription | Notifications | `push_subscriptions`, one per device | **stays here**, tagged |
| **This phone**: Alarms & reminders, Run in the background | Notifications | Android | **stays here**, tagged |
| **On this computer**: tray, Start with Windows | App & updates | localStorage `kf_tray_shown` / OS autostart | **stays here**, tagged |
| **On this phone**: Hide titles on the home screen | App & updates | localStorage `kf_widgets_hide_titles` (widgets live on that phone) | **stays here**, tagged |
| **Kai's Flow** version + Check for updates | App & updates | this install | **stays here**, tagged |

**Layout memory stays per device and is not shown in Settings.** These keys hold where things were left on this screen, not settings:

- sidebar collapsed; Plan open;
- calendar rail width, fold and sections; tray fold; planning panel, its tab and sort; Now card folded;
- the Notebook's last print size;
- a running focus timer;
- ritual drafts;
- chat history;
- import mappings;
- hints, the download bar, what's-new seen, the zone-offer flag, the last email.

Snoozes on people nudges and resurfacing, and the auto-project "not there" memory, are per-device data rather than settings. They are left as they are; syncing them would be a separate job.

## Files

- New:
  - `supabase/migrations/0087_synced_prefs.sql` — the `prefs` column, the merge trigger, the realtime publication.
  - `app/src/lib/prefs.ts` — the key list, `remoteKey`, `decide`, and the written/applied events. It is a leaf module, so stores import it without cycles.
  - `app/src/lib/prefsSync.ts` — `reconcile`, `usePrefsSync`, and the stamps in `kf.prefsAt`.
  - `app/src/lib/prefs.test.ts` — 12 tests: the key mapping, the conflict rule, and two devices seeding, adopting and changing.
- Stores now say when they write, and re-read when another device's value lands:
  - `lib/theme.ts` (the theme mode and the grain helpers moved here from Settings)
  - `lib/uiScale.ts`, `lib/clock.ts`, `lib/motion.ts`, `lib/sounds.ts`
  - `features/calendar/ViewOptionsPopover.tsx` + `CalendarPage.tsx` + `PhoneCalendar.tsx`
  - `features/focus/focusStore.ts`, `features/rituals/ritualPins.ts`
- `lib/realtime.ts` subscribes to `app_settings` once the row has `prefs`.
- `features/auth/RequireAuth.tsx` runs the sync.
- `lib/types.ts` adds `prefs`.
- `features/settings/SettingsPage.tsx`:
  - the `DeviceTag` "This device" on the device-only sections and rows;
  - the interface-size help;
  - the redraw on `usePrefsVersion`;
  - the theme mode, grain and cooldowns now announce their writes.
- `settings.css`: `.st-device`, built from tokens only. No colours changed.
- `docs/DATA_MODEL.md` has the 0087 note.
- All files are LF, as they were.

## Gate

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | 185 files / 2575 tests |
| `npm run lint` | 0 errors |
| `npm run build` | ok |
| `ds:check --baseline` | 0 new |
| birthday_on greps | 1 / 1 |

- The tests were run once, not ×4 TZ, because no date logic changed.
- No edge function was touched, so no deno check was needed.
- **New harness `docs/log/assets/settings-sync/verify.mjs`: 61/61.**
  - Setup: three devices — a computer, a phone, and the Windows app — share one mock `app_settings` row. The mock merges per key like 0087, and changes reach the devices over a routed WebSocket that speaks Supabase Realtime (Phoenix v2 frames: join reply with binding ids, then `postgres_changes`).
  - The seed: the first device sends its values, the others adopt them, and the computer's size goes under its class.
  - Each of these, changed on one device, shows on the other while its Settings page is open:
    - theme, both ways, including Auto;
    - interface size, which goes computer→computer and not to the phone;
    - paper texture, animations;
    - the 7 calendar options;
    - pack, volume, master on/off, all 7 sounds, Silent after Shut down;
    - 3 cooldowns;
    - Focus round, ritual pin;
    - two row columns: Quiet hours and File captures.
  - The phone's Settings list shows the new values.
  - The tray toggle stays on its own computer, and the server holds only synced keys.
  - "This device" tags appear where they should and nowhere on synced rows.
  - No device reloaded and no page errors.
- Mock server `vite --port 5318 --mode mock --host ::` was used, run one harness at a time, and stopped after.
  - Passed unchanged: settings-build 193/193, cal-wave 224/224, desktop-polish 150/150, phone-polish 718/718, motion 48/48.
  - Retargeted: **user-tz 33/33** and **sounds 126/126**. Both were already stale from settings-build (it lists them as needing retargeting):
    - user-tz: Time zone is now on `/settings/calendar`, behind its picker.
    - sounds: Sound is now on `/settings/notify`; the pack is a three-way choice with one ▶ for the picked pack.

## Screenshots (`docs/log/assets/settings-sync/`)

- `1-desk-appearance-seeded.png`, `1-phone-appearance-seeded.png` — after the seed.
- `2-phone-appearance-after.png`, `3-desk-calendar-after.png`, `3-phone-calendar-after.png` — after changes made on the other device.
- `4-phone-list-after.png`
- `5-win-about-device.png`, `5-desk-notify-device.png`, `5-phone-notify-device.png` — the "This device" tags.

## Notes

- Parallel builders:
  - **drag-fix** might touch `CalendarPage.tsx`. My edit there is two lines (the import, and the `onPrefApplied` effect next to `viewOpts`).
  - **today-looks** doesn't touch anything this branch changes.
- Theme Auto still follows a live OS change only while Settings is mounted. That is how it already worked; this branch applies Auto once, when it arrives.
- Out of scope: syncing snoozes and the auto-project memory, which are data rather than settings.
