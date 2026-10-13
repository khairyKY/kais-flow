# 2026-10-13 20:30 · handoff · google-sync (parity audit B1 → a)

Branch `claude/google-sync`, from `claude/kai-bugs-1012`. Not merged and not released.

**Kai's decision (B1 → a):** show outside calendars, and first of all his five prayer times, on Kai's Flow's own grid.

**The conductor's binding values:**
- redirect URI = the function root, `https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/google-connect`;
- scope `calendar.readonly` only;
- secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`;
- the browser goes back to Settings with `?google=connected` or `?google=error`.

## What works

**`google-connect`** (`verify_jwt = false`, because Google's redirect carries no JWT)
- POST `{action:'start', origin}` checks the user's JWT and answers with Google's consent URL: offline access, `prompt=consent`, `calendar.readonly`.
- The user and the return origin ride in `state`, HMAC-SHA256-signed with the client secret, with a 10-minute expiry. That is also the CSRF check.
- The GET with `?code&state` is the callback:
  1. verify `state`;
  2. exchange the code;
  3. require the calendar scope in the grant (Google's consent page lets someone untick it);
  4. store the refresh token and the account's calendar list in `integrations.data` (service role). On a first connect, the calendars shown are the ones ticked in Google Calendar;
  5. redirect to `<origin>/settings?google=connected`, or `?google=error&reason=<code>`.
- `<origin>` is the app that started it, when cors.ts already trusts it: the web app, or localhost for dev. Anything else, including the native shells' own origins, goes to `https://kais-flow.kaidagoat.workers.dev`. In production that means APP_URL/settings, as decided.
- `{action:'calendars'}` re-reads the calendar list.
- `{action:'choose', ids}` saves which calendars show. An unticked calendar's rows are deleted.
- `{action:'disconnect'}` revokes the grant at Google and deletes the synced events and the row.
- Until the two secrets exist, `start` answers `{missing:[…]}`. The app says so in plain words and never errors. If the functions aren't deployed at all, the app says that too.

**`google-sync`** (pg_cron every 15 minutes, migration 0074, and "Sync now")
- Per user: refresh token → access token. It reads each chosen calendar from today − 7 to today + 60 days on the user's clock (`app_settings.timezone`), with `singleEvents=true`, so a repeat arrives as its instances.
- `_shared/google.ts` maps each event (`mapEvent`) and plans the writes (`planGcalSync`):
  - **insert:** new events;
  - **update:** when the etag, colour or calendar name changed, or when something trashed the row in the app (Google is the truth);
  - **hard-delete:** when Google no longer lists the event inside the window (deleted, cancelled, moved out). Rows before the window stay as history.
- A calendar that fails to read leaves its rows alone. One that's gone (404) empties.
- A refused refresh token (`invalid_grant`) sets `status:'failing'`, and Settings says "Access expired — reconnect".

**The app**
- **The grid.** Synced events draw in their calendar's Google colour (`--kf-ev-accent`) with class `kf-synced` and FullCalendar `editable:false`: no drag, no resize, no drag-to-rail. The phone grid never lifts them.
- **The block menu (desktop and phone sheet).** Date, time and "From Google · <calendar name>". The title is read-only. There is no colour, no Delete and no ⌫. Right-click offers only "Details".
- **The root guard.** `calendar/api.ts` `writeEvent` drops any write to a `source 'gcal'` row, so no other path can change one either.
- **Busy.** Synced events are always busy: they count in the rail footer's "N blocked · free today", in free gaps, and in overlap/conflict marks. Google's per-event "Show as: available" is ignored on purpose, because a read-only calendar can't change it.
- **Settings → Integrations → Google Calendar** (phone: Settings → Connections) has:
  - Connect;
  - the account and status ("Connected · synced 13 Oct, 19:03" / "Access expired — reconnect");
  - Sync now and Disconnect;
  - one switch per calendar, which saves at once. A newly shown calendar syncs right away;
  - Last synced;
  - "Look for new calendars".
  "Coming soon" is gone (`SoonChip` deleted). The summary card's row shows the real state.
- Landing back from Google opens Integrations on desktop. It runs the first sync, says "Connected · Synced · N calendars · N events…", strips `?google=` from the address, and scrolls the message into view on the phone.

## Privacy promises (site/src/pages/info.mjs §3): where each is enforced

| Promise | Where |
|---|---|
| **(a) Read-only, nothing changed in Google** | The only scope is `calendar.readonly` (`_shared/google.ts` `GOOGLE_SCOPE`, `authUrl`). The only calls to Google are the token endpoint, GETs (`gGet`: `calendarList`, `events`) and the revoke endpoint; there is no write call in the code. On our side, Google rows are read-only too: `calendar/api.ts` `writeEvent`; `mcp/index.ts` `getEvent` / `updateEvent` / `deleteEvents` are `source = 'native'` only. |
| **(b) Disconnect revokes and deletes** | `google-connect` `{action:'disconnect'}`: (1) POST `https://oauth2.googleapis.com/revoke` with the refresh token (best effort: if Google can't be reached, the token is still deleted on our side); (2) `delete from calendar_events where user_id and source = 'gcal'`; (3) delete the `integrations` row. Unticking one calendar deletes its rows (`{action:'choose'}`). |
| **(c) Never sent to an AI** | `chat/index.ts`: (1) search hits run through `dropSynced` (`_shared/google.ts`, tested in `app/src/features/settings/googleSync.test.ts`) against the hits' `source 'gcal'` ids. If that look-up fails, every event hit is dropped (fails closed). (2) The today/tomorrow snapshot's events query has `.eq('source', 'native')`. `mcp/index.ts`: `events()` (calendar and today) has `source = 'native'`; `search()` filters `search_hybrid` hits whose event is `source 'gcal'`. Events have no embeddings (only tasks and inbox items do), so `embed` never sees them. The app's own Search UI (`search`, no AI) still finds them. |
| **Refreshed every 15 minutes** | `supabase/migrations/0074_google_sync.sql`: pg_cron `google-sync` at `3,18,33,48 * * * *`. |

## Numbers

- `npx vitest run`: **2097 passed** (153 files). New:
  - `googleSync.test.ts`, 19 tests: mapping (timed, zones, all-day, cancelled, recurring instances, no title), the window, the plan (insert / update / delete / failed read / unchosen / trashed / duplicates), calendars, `readChosen`, the auth URL, signed state (tamper / foreign / expired), `returnTo`, and `dropSynced`;
  - the read-only menu spec in `blockMenuSpec.test.ts`.
- `npm run lint`: **0 errors** (21 warnings, all from before).
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new** (2 fixed: the deleted `SoonChip`).
- Browser checks against the mock backend (dev server from this worktree, `--mode mock`, port 5277):
  - **google-sync 79/79** (`docs/log/assets/google-sync/verify.mjs`, output and screenshots in that folder);
  - cleanup 21/21: its "Coming soon" checks now assert the real row, "Not connected" + Connect;
  - event-detail 68/68;
  - cal-wave2 83/83.
- No deno locally. `deno check` runs in CI (rehearsal.yml), and `google-connect` / `google-sync` were added to release.yml's `FUNCTIONS`.

## [KAI] steps, in order (details: `docs/GOOGLE-SETUP.md`)

1. Google Cloud project `Kais Flow` (free, no billing).
2. Enable the **Google Calendar API**.
3. Set up the Google Auth Platform:
   - Branding: `Kai's Flow`.
   - Audience: External.
   - Data Access: `https://www.googleapis.com/auth/calendar.readonly`.
   - **Publish app → In production.** Don't submit for verification. Testing mode makes the grant expire after 7 days. Unverified In-production use is allowed for personal use under 100 users; you click through the "unverified app" warning once.
4. OAuth client: **Web application**, redirect URI exactly `https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/google-connect`.
5. `supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… --project-ref eqbbkitofgyxxrfggpbu`
6. After the deploy: Settings → Integrations → Google Calendar → Connect, click through the warning, then switch on the prayer-times calendar.

## Deploy order

1. `supabase db push`: **0074** (index + the cron job; additive and idempotent).
2. `supabase functions deploy google-connect` (config.toml gives it `verify_jwt = false`), then `google-sync`, `chat` and `mcp` (the privacy filters).
3. The app (Settings row, read-only grid).
4. `[KAI]` the secrets (they can come before or after 1–3: until then Connect says what's missing, and the cron answers `skipped: not_configured`).

The release workflow does 1–3 in that order: `db push` first, then every function in `FUNCTIONS`, then the app.

## Deviations and follow-ups

- **Not built: our blocks out to Google as busy.** Read-only for now (conductor). It needs `calendar.events` and a writer.
- **No incremental `syncToken`.** A sliding window doesn't mix with a sync token: an unchanged event sliding into day +60 never shows up in the token's changes. So the sync does a full read of the window every run, about 335 events for a prayer calendar. Upgrade path in the `google-sync` header.
- **The calendar list isn't re-read by the cron.** It's read at connect and on "Look for new calendars". A renamed calendar's new name lands on its events then.
- **The MCP doesn't see Google events** (privacy), so its own free-slot picks don't avoid prayer times. The app's planning does.
- **Controls:** each calendar has a kit `Toggle` (switch), not a `Checkbox`. The kit Checkbox's accessible name is the task-completion "Complete "…"", which would read wrong for a calendar.
- **Native shells:** Connect opens Google's page in the system browser (Google refuses embedded web views). The landing goes to the web app, and back in the app, Sync now picks the calendars up.
- **Not done here:** the 4-zone TZ vitest matrix (CI's Linux matrix covers it); `deno check` (CI).
