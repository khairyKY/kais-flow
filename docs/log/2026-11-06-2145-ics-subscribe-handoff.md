---
date: 2026-11-06 21:45 Cairo
session: ics-subscribe
type: handoff
related: Kai 2026-11-06 ("a normal calendar subscription by link, the way Google Calendar's From URL works, so Kai's Flow can show any .ics feed with no Google account")
---

# ics-subscribe: handoff

Branch `claude/ics-subscribe` (worktree `.claude/worktrees/ics-subscribe`), based on `claude/kai-bugs-1012`, merged with it again at `6c91b5c3` (consent-fix, migration 0093). Pushed, not merged, no release.
**Migration `0094_calendar_subscriptions.sql`** (renumbered from 0093 when consent-fix took it). **One new function, `ics-sync`**: added to `release.yml` FUNCTIONS, `config.toml` (`verify_jwt = true`) and the Rehearsal.

## 1. The real feed (fetched 2026-11-06, saved as `supabase/tests/fixtures/prayer-times.ics`)

`https://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.7952538&…&lang=ar`: 200, `text/calendar`, **212 KB**, 644 VEVENTs, **no RRULE** (one event per prayer per day, 1 Nov 2026 to 31 Jan 2027, 7 a day, Friday swaps Dhuhr for الجمعة with `jumuahDuration=60`). `DTSTART;TZID=Africa/Cairo:20261101T044200`, **no VTIMEZONE at all** (which is why I did not use ical.js: it resolves a TZID only through a VTIMEZONE in the feed). Each event has a `VALARM` (`TRIGGER:-PT5M`, `ACTION:AUDIO`). Arabic titles (الفجر الشروق الظهر العصر المغرب العشاء منتصف الليل الجمعة) and a Hijri date in DESCRIPTION. Colour: `X-APPLE-CALENDAR-COLOR:#E91E63` in the header (the `color=` URL param says the same). `X-WR-CALNAME:مواقيت الصلاة`, `X-WR-TIMEZONE:Africa/Cairo`. Cache `s-maxage=14400`.

## 2. Built

| | |
|---|---|
| **Settings → Calendar & time → "Subscribed calendars"** | **Add by link:** paste `webcal://` or `https://`, **Preview** (name, "Found 644 events in the next 400 days and the last 60, with reminders", colour, reminders switch), **Subscribe**. Name defaults to X-WR-CALNAME and is editable. **Colour:** the feed's (X-APPLE-CALENDAR-COLOR / COLOR / X-WR-CALCOLOR, else the link's `?color=`), else the first palette C swatch no other subscription wears; the swatch tray (palette C + Custom) changes it. Each subscription: host, event count, "updated 6 Nov, 9:30 AM", or the error in a sentence plus "Last updated …"; **Refresh**, **Edit** (rename, colour, **Use the calendar's reminders**), **Remove** (asks, names the events that go). Multiple subscriptions (20 at most). |
| **Data (0094)** | `calendar_events_source_check` admits `'ics'`. `calendar_subscriptions`: `url` is **private** (the client has column-level SELECT on everything but `url`, and no INSERT/UPDATE/DELETE: add, rename, recolour, refresh and remove all go through `ics-sync`); `host`, `name`, `color`, `use_alarms`, `status`/`error` (stable codes), `synced_at`, `event_count`; unique `(user_id, url)`. pg_cron `ics-sync` `21 */3 * * *`. An event = `calendar_events` row, `source 'ics'`, `external_ref {source:'ics', id:'<sub>/<uid>/<recurrence-id>', sub_id, uid, recurrence_id, calendar, calendar_id, url?}` (0027's unique index dedupes). |
| **`ics-sync`** | `preview` / `add` / `refresh` / `update` / `remove` (user) and `sync` (cron). Fetch on add, Refresh, every 3 h. Parser in `_shared/ics.ts` (own, tested): unfold, TZID by Intl, DATE / DATE-TIME / DURATION, RRULE (through `series.ts`, so DST is right) / EXDATE / RDATE / RECURRENCE-ID (moved or cancelled instances), STATUS:CANCELLED, TRANSP, VALARM (relative to start or end, or absolute). Window 60 days back, 400 ahead. Upsert by `uid + recurrence-id`; what left the feed goes (rows older than the window are pruned too). A failed read changes nothing and is recorded on the subscription. |
| **SSRF + limits** | http(s) only, `webcal` = https, no password in the link; IP literals (any spelling: `2130706433`, `[::ffff:127.0.0.1]`) and names resolving to loopback / private / link-local (cloud metadata) / CGNAT / multicast are refused **before any request**; redirects by hand (3) with every hop re-checked; 5 MB streamed cap; 15 s timeout; 20 000 rows max (refused, not cut); HOURLY/MINUTELY rules are not expanded. |
| **Reminders** | A VALARM becomes `remind_min` (0 to 1440) per occurrence when the subscription's switch is on (default); off clears them all. `notify`'s event sweep and the device planner ring from it (`eventReminder.ts` only ever skipped `'gcal'`); notify reads subscribed rows apart, only those starting within a day of the window, because a feed holds thousands of rows against PostgREST's 1000. |
| **Display** | Same as Google events: grid, phone grid, Today's Now card and agenda, details, menu B, the widgets feed (`widget/index.ts` selects every source). Read-only (`isSynced`): no drag, resize, rename or Delete; details say "From subscription · <name>", **no** "Open in Google Calendar", **Duplicate as my event** (a native copy, nothing sent), Copy link, Join meeting when the event has its own https URL. Phone sheet kind "Subscribed event". Not in our own .ics export. |
| **AI** | Chat's hit filter and the MCP search drop `source in ('gcal','ics')`; chat's snapshot and the MCP events / getEvent already read `source = 'native'`. The link is never selected by anything but `ics-sync`. |
| **Arabic** | `dir="auto"` on the grid event title (both renderings), the phone block name and band chip, the details' title field, Today's "next up", on top of the Now card, Today's phone lines and the tray that already had it. Verified: Arabic resolves right-to-left, an English title stays left-to-right. |

## 3. Checks

- **`supabase/tests/ics.test.ts`** (Deno, 11 tests, in the Rehearsal before the stack starts): the real prayer feed (644 events, Fajr 04:42 Cairo = 02:42Z, 5-minute alarm, colour, name), reminders switch, the mixed fixture (weekly in Europe/Berlin with EXDATE, a moved and a cancelled instance, all-day, DURATION, folded line, floating, UTC, END-relative and absolute alarms, a repeat across the March DST switch, window edges, a feed of junk), floating vs X-WR-TIMEZONE vs an unknown TZID, 21 000 rows refused, the SSRF list (22 addresses, 14 URLs), the plan (idempotent, update, remove, duplicate, trashed row), `eventRemindersDue` for ics and gcal.
- **`supabase/tests/ics.sh`** (real Postgres, feeds mocked by `harness/ics-mock.ts`, the runner now shims `*.feeds.test`): who may call, the url column not selectable, nothing writable through PostgREST, another user's id is "not found", 17 SSRF refusals with the runner's fetch log proving nothing was requested, the 6 feed refusals (HTML, 404, over the cap, a hang, a redirect loop, NXDOMAIN), the real feed through a `webcal://` link (644 rows, colour, alarm on every row, `external_ref`, idempotent second read, duplicate in both spellings), reminders off/on, rename + recolour, a feed with repeats/zones/all-day, an edit landing as add/update/remove, a down feed recorded and recovered, cron across users, Remove, the 20 cap, the log has no link. **Not runnable on this machine (no Docker, psql or jq), so it ran in the Rehearsal** (section 5). Before that I ran its SSRF/feed half through the real runner and function against the mock with a fake Supabase: 21 of 21.
- `deno check` ics-sync, notify, chat, mcp, widget clean. `birthday_on` greps 1 / 1.
- Gate: vitest x4 TZ **205 files / 2848 tests** green, lint 0, build OK, ds:check 0 new (final numbers in section 5).
- New vitest: `settings/icsSync.test.ts` (6: the real feed under every TZ, the link guard, read-only mirror, export leaves it out, row text), `blockMenuSpec.test.ts` +1.
- **Settings/grid harness** `docs/log/assets/ics-subscribe/verify.mjs` **84/84** on the mock (S settings incl. the real webcal link, the feed colour, palette C default, rename / recolour / reminders / Refresh / Remove, six refusal sentences, a failing feed, phone at 390; G grid incl. Arabic direction, details, menu B, Join, Duplicate, no drag, Today; P phone sheet). Screenshots beside it.
- **Re-runs on the merged tree:** cal-clicks **96/96**, gcal-events **61/61**, google-sync **101/101**.

## 4. Left over / for you

- **Privacy copy** (`site/src/pages/info.mjs` §5, §8) and `PRIVACY_VERSION` (docs/LEGAL.md): the page does not mention subscribed calendars yet. One sentence is enough ("a calendar link you add is fetched by our server, kept private, shown read-only, never sent to the AI"). Not bumped: that is your call, and consent-fix just touched the notice flow.
- **Deploy:** `ics-sync` is new (FUNCTIONS in release.yml is updated). Until it is deployed, Settings says "Calendar subscriptions aren't on the server yet".
- **SSRF ceiling:** the DNS answer is checked, then `fetch` resolves again (Deno cannot pin the address). Supabase's edge runtime has no route to private networks, so this is defence in depth, not the only wall. If `Deno.resolveDns` is missing in the runtime, only the literal and name checks stand (it falls back, it does not fail).
- **TZID Intl doesn't know** (Outlook's "W. Europe Standard Time") reads on the feed's X-WR-TIMEZONE, else the person's zone. A Windows-to-IANA table or VTIMEZONE parsing is the upgrade.
- Not done: basic-auth links, description / location text (calendar_events has no such columns), RANGE=THISANDFUTURE overrides, conditional GET (etag) to skip an unchanged read.
- A subscribed event still offers "Work with AI" in menu B (types a request about it into the chat for the person to send), same as a Google event.
- The Settings list does not live-update from the cron (no realtime on `calendar_subscriptions`); it refreshes on open and after every action.

## 5. Rehearsal and the final gate

- Rehearsal run **42282514184** on the final push: **Fresh chain and Production rehearsal both green** (0094 applies on production's schema and history). `ics.test.ts` 11/11 and `ics.sh` 103/103 inside it.
- The first run (42281786729) was 101/103: two expectations in my own script were wrong (psql prints `f` for false; one helper call had `count` for `count(*)`); fixed, nothing in the function changed. An earlier push run failed in 0 s: a colon in a step name broke the workflow file; fixed.
- Final gate on the merged tree (after merging `claude/kai-bugs-1012` at `6c91b5c3`): vitest x4 TZ 205 files / 2848 tests, lint 0, build OK, ds:check 0 new.
