---
date: 2026-10-06T23:44+03:00
session: builder TZ (per-user time zones — each user's own clock instead of Cairo for everyone)
type: handoff
related: docs/DATA_MODEL.md (0050) · CLAUDE.md (Conventions: the zone rule) · docs/log/assets/user-tz/
---

# Per-user time zones: the app runs on the user's own clock

Branch `claude/user-tz`, cut from `origin/master` (v1.0.20, c55842c). It has `origin/claude/wave-r` (145ed48: v1.0.20 and the explainer site) merged in, with no conflicts. Not merged anywhere else and not deployed.

Until now every "what day is it" in the app read Africa/Cairo. Now it reads each user's `app_settings.timezone`. That column already existed (`text default 'Africa/Cairo'`), so Cairo stays the default, and nothing changes for Kai or any account that never picks a zone.

| # | Commit | What |
|---|---|---|
| 1 | 46fb81a | `lib/appZone.ts` is the one place the zone lives. The `cairo*` helpers become aliases for it, and the hard-coded zones, formatters, AI-parse context, importers and notice copy all follow it. |
| 2 | 3ebe085 | Settings → Timezone picker, the one-time "use this device's zone?" offer, and the shell follows the zone |
| 3 | 54002f6 | Server side: notify, chat and parse-capture read each user's zone. Migration 0050 does the retainer roll per user. Tests for a New York user and a Tokyo user. |
| 4 | f975119 | DATA_MODEL and the CLAUDE.md rule |
| 5 | 0167a15 | Merge `origin/claude/wave-r` |
| 6 | 099c3eb | Test typing fix |
| 7 | this one | Evidence and this note |

## How it works

### The client
- **One zone source: `app/src/lib/appZone.ts`.**
  - `appZone()` returns the current zone. `setAppZone()` changes it; an unknown or empty name falls back to Cairo. `useAppZone()` re-renders when it changes.
  - `perZone(make)` keeps one cached Intl formatter per zone, so grouping stays fast.
  - Also here: `isZone`, `deviceZone`, `zoneCity`, `searchZones`.
  - The zone is saved in localStorage (`kf-app-zone`), so a reload shows the right day before settings arrive.
- **Helpers.**
  - `lib/dateShortcuts.ts` gains `zoneDateKey(d, zone?)`, `zoneOffsetMinutes`, `zoneWallTimeToIso(zone, …)`.
  - `features/calendar/eventTime.ts` gains `zoneTimeKey(d, zone?)` and `zoneToIso(date, time, zone?)`.
  - The old names (`cairoDateKey`, `cairoTimeKey`, `cairoToIso`, `cairoWallTimeToIso`, `cairoOffsetMinutes`, `cairoMin`, `cairoMinutes`) stay as single-argument aliases that read the user's zone. That keeps the ~250 call sites unchanged. The aliases are function declarations, so `arr.map(cairoDateKey)` can't pass an index in as a zone.
  - "Tomorrow" is 09:00 tomorrow on the user's clock, and DST-correct (tested across New York's fall-back night).
- **Hard-coded zones removed.** Every `timeZone: 'Africa/Cairo'` / `const TZ = 'Africa/Cairo'` and every module-level Cairo formatter now reads `appZone()`. That covers:
  - inbox display, the due chip, the journal, Up next, Today's date, row menus, the tray flyout, PaperFlow, `loopDay`, `dayPhase`, the import page and the Settings dates;
  - the importers' default zone (`adapters/shared.ts` `zoneOr` / `naiveLocalToUtc` / `parseLooseDate` / `todayMidnight`);
  - the parse-capture context (`timezone: appZone()`);
  - the app's own notices: TrayBridge `deliver` / `reminderNotice` / `inQuietHours`, trayState's `clock`, and the Activity notice actions.
- **The shell.**
  - `RequireAuth` renders `<AppZoneSync>`, which keeps `appZone()` on `app_settings.timezone` for the shell, the tray flyout and onboarding.
  - AppLayout keys the page on `pathname|zone`, so a zone change re-mounts the page and nothing memoised keeps the old day. The scroll position survives (see `settings-ny.png`).
  - The topbar shows the zone, and its date now reads the user's clock. Before, it read the device's clock, a day off from the page below on a device abroad.
  - The sidebar reads "Personal · New York" (it was hard-coded "· Cairo").
  - The seasons echo shows the user's city. Weather (Cairo's coordinates) only shows when the zone is Cairo.
- **Settings → Timezone**, on desktop and phone (the phone had only a read-out row):
  - "Use this device's zone (Europe/London)" comes first, shown when the device's zone differs from the stored one.
  - Then a search over every IANA zone Intl knows, plus UTC. It shows up to 8 matches with their GMT offset, and a tap writes it.
  - Under that: "current · America/New_York · GMT-4".
- **The first-sign-in offer.**
  - It shows once per device and account (`kf-tz-offered:<uid>`), only while the account still has the default and the device is somewhere else.
  - It waits for the server's row, not a cached default the user already changed on another device.
  - It is a toast: "Your device is in Europe/London — use it?" · Use it. Nothing changes unless the user taps.
  - If storage is blocked, it never asks.
- **Journal.** "Today" was the device's date; it is now the user's. The week list read UTC midnight with local getters, so it was a day off west of UTC; it is fixed.

### The server
- **`supabase/functions/_shared/zone.ts`:**
  - `userZone(tz)`: the stored zone when Intl knows it, else Cairo, so a typo never breaks a cron run.
  - `wallClock(at, tz)`: "Saturday, 3 October 2026 at 21:00 (America/New_York, GMT-04:00)".
- **notify.** Each user's `timezone` drives:
  - when the digest and the nudge are due (`ritualDue`);
  - quiet hours (`deliver`);
  - the evening nudge's "today" (`ritual.ts` `dayBounds`, which replaces the run-wide Cairo `dayStart`/`dayEnd`);
  - the reminder clocks.
- **chat.** It reads the user's `app_settings.timezone` (RLS: their own row) and passes it to `dayStart` and `snapshotText`.
- **parse-capture.** The prompt now says "Now, on the user's clock: … Read every date and time on that clock, then give due_at in UTC". Before, it gave a bare UTC instant plus a zone name. The zone comes from the app.
- **capture and capture-image need no change.** capture (the capture key) has no date step: `?file=1` items are parsed later by the app, with `appZone()`. capture-image returns date words, which the app reads with `parseCommand(…, { zone: 'cairo' })`, and that now means the user's zone.
- **Migration 0050 (`reload_retainers()`).**
  - Each retainer now rolls on its owner's month, keeping each task's time of day on that clock.
  - The job moves from `0 0 1 * *` to `0 * 1,2 * *` (hourly through the 1st and 2nd, UTC), a window that contains every zone's month start.
  - A once-per-month guard (the `retainer.reloaded` activity row since the owner's month began) means each retainer reloads exactly once.
  - Why: at the old 00:00 UTC slot, a Los Angeles user was still on the 31st and would have been rolled into the month that was ending.
  - An unknown zone, or no settings row, uses Cairo (checked against `pg_timezone_names`).

## Still Cairo-global, and why
- **The AI allowance's day.** This covers `ai_usage` / `ai_usage_global` (0036/0040, `_shared/quota.ts`) and the client's matching reads: the voice-limit memo (`aiAllowance.ts`), "Scans today" (`paper/api.ts`) and a daily-limited page's resume (`paperMath.shouldResume`). It is one shared Groq budget, so its day must be one day for everyone. The client now pins these to Cairo explicitly (`zoneDateKey(…, DEFAULT_ZONE)`), so they don't drift to the user's zone.
- **The topbar weather.** The app only has Cairo's coordinates, and a zone has none. Non-Cairo users see their city without weather.
- **Defaults and fallbacks.** These stay Cairo: the column default, a missing settings row, an unknown zone, `RITUAL_ZONE`, and the default parameters of `dayStart` / `snapshotText`.
- **Names only.** The `cairo*` helper names and `parseCommand`'s `zone: 'cairo'` option value are historical; they read the user's zone. Renaming them would have changed ~250 call sites.
- **The existing tests and hand tests** still pin Cairo semantics (the default). `supabase/tests/*.sh` and `retainer-reload.sql` use a user with no zone, which means Cairo.

## Not Cairo, and still device-local (unchanged, and outside this job)
These read the device's own day, as before. They are right whenever the device is in the user's zone; they would differ for someone travelling.
- Routines and streaks (`routines/streaks.ts` `localDateKey`: completions are stamped and read with it).
- Focus page counts, the project work-log date.
- The desktop FullCalendar grid, which is laid out in device time (`gridClock.ts`).
- `taskDisplay.daysOverdue`, the Weekly Review's week, and `getSeason` (device month, northern hemisphere).

I tried moving streaks to the user's zone. `localDateKey` is shared with the device-local desktop calendar forms (`localToIso` round-trips) and `daysOverdue`, so changing it broke those, and I reverted it. The right fix is a separate `userDayKey` for routine completions, plus key-based walks in streaks.ts. Resurfacing's once-a-day gate stays on `current_date` (UTC), as before.

## Evidence

### Gate
| Check | Result |
|---|---|
| `cd app && npx tsc -b` | 0 errors |
| vitest, PowerShell `$env:TZ` = UTC / Africa/Cairo / America/Los_Angeles / Asia/Tokyo | 96 files, 1171/1171 in each (baseline 94 files, 1146; +25 new) |
| `npm run lint` (oxlint) | 0 errors; the 19 existing warnings, none in files I touched |
| `npm run build` | ok |
| Edge functions (notify, chat, parse-capture) | strict `tsc` with a Deno shim: 0 errors. There is no deno on this machine. |

There is no `app/.env.local` in this worktree, so there was nothing to move aside.

### New tests
- **`app/src/lib/userZone.test.ts`** (15) runs a New York user late on Wed 8 Jul (already Thursday in Cairo) and a Tokyo user at 01:00 Thursday (still Wednesday in Cairo). It covers:
  - day keys and clocks;
  - Today / Tomorrow / Next week at 09:00 New York, including across the fall-back night;
  - form round-trips;
  - the date picker's quick picks;
  - "tomorrow 3pm" in the command bar, and its chip;
  - the Up next split (tonight's event stays, tomorrow morning's goes; on Cairo's clock both are today's);
  - the now-line minute;
  - the loop day's 04:00;
  - the vision quota staying on Cairo's day;
  - the zone source's fallbacks, search, and `shouldOfferDeviceZone`.
- **`app/src/features/notifications/userZone.test.ts`** (10) covers:
  - `userZone` / `wallClock`;
  - the digest due at 08:00 New York (not 08:00 Cairo), and a custom evening time in Tokyo;
  - `dayBounds` for the nudge;
  - quiet hours on the user's clock;
  - reminder clocks;
  - chat's `dayStart` / `snapshotText` splitting today from tomorrow on New York's calendar.

### Browser
Mocked backend (`app/.env.mock.local`, `npm run dev -- --port 5255 --strictPort --mode mock`, warmed). The dev server is stopped.

`docs/log/assets/user-tz/verify.mjs` passes **33/33** (`verify-results.json`). The user has `app_settings.timezone = America/New_York`, the browser is in New York, and the clock is Sat 3 Oct 21:30 EDT (already Sunday 04:30 in Cairo).

| Scene | What it checked |
|---|---|
| `today-ny` | Header "Saturday, Oct 3"; tonight's rent in Top 3 |
| `tasks-ny` | The shell's date is SAT 3 OCT; TODAY · 2 / TOMORROW · 1. On Cairo's clock all three would be today (I checked that with a probe). |
| `tomorrow-ny` | Quick picks are Today SAT 3 · Tomorrow SUN 4 · 09:00 · Next week MON 5 (no "This weekend" on a Saturday). Tomorrow writes `due_at 2026-10-04T13:00:00.000Z` (09:00 New York), and the chip reads TOMORROW · 09:00. |
| `calendar-ny` | The phone calendar's now tag reads **21:30**. Tonight's events are on today; Sunday's market is not. |
| `settings-ny` | Topbar `America/New_York`, sidebar "Personal · New York", "current · America/New_York · GMT-4", no device button (the device is already there). Searching "tokyo" and tapping writes `app_settings.timezone = Asia/Tokyo`, and the shell follows at once (topbar Asia/Tokyo, SUN 4 OCT). |
| `offer-ny-device` | A default (Cairo) account on a New York device: the toast "Your device is in America/New_York — use it?". Nothing is written until the tap; the tap writes America/New_York and the shell follows. The next visit on the same device doesn't ask again. Settings offers "Use this device's zone (America/New_York)", which writes it. |
| `settings-phone` | The picker is on the phone, with no sideways scroll at 390. |

### Regressions
The default Cairo user, re-run on this tree. Summaries are in `docs/log/assets/user-tz/regress-*.json`.

| Harness | Result |
|---|---|
| today-phone | 157/157 |
| task-sheet | 147/147 |
| calendar-phone | 175/175 |
| small-gaps | 154/154 |

calendar-phone's first two runs died on a `page.goto … networkidle` timeout, in a different scene each time, while the dev server was still compiling under the other harnesses. The next two consecutive runs passed 175/175.

## Deviations and risks
- **Migration 0050** is numbered by hand (`0050_user_timezones.sql`, the repo's convention) rather than made with `supabase migration new`. The Supabase CLI isn't installed here, and I didn't download it. It has **not been run against Postgres**: there is no psql or docker on this machine. The hand test `supabase/tests/retainer-reload.sql` was not re-run either; it still applies, since its user has no zone, which means Cairo. Needs: `supabase db push`, then deploy `notify`, `chat` and `parse-capture`.
- **A zone change re-mounts the open page.** That is how nothing memoised keeps yesterday. Local UI state on that page resets: for example, Settings' desktop subnav highlight goes back to Appearance. The scroll position stays.
- **On a brand-new device the first paint is Cairo** until settings arrive, then it switches. Later loads use the saved `kf-app-zone`.
- **The offer is an MK Undo toast,** so it lives about 6s while not hovered. If it's missed, Settings → Timezone still offers the device's zone.
- **notify's `dayBounds` keeps the old ceiling:** on a DST-change day "today" is an hour off. It's marked `ponytail:` in the code.
- **The retainer job now runs 48 times a month.** Each run is a loop over active retainers plus one activity-log lookup each. If someone deleted a `retainer.reloaded` row mid-window, that retainer would reload again; its tasks would already be on the 1st, so only its checklist would clear again.
- I did not touch `docs/ROADMAP.md` or `docs/log/INDEX.md`. The parallel MCP builder's area (`supabase/functions/mcp`) is untouched.
