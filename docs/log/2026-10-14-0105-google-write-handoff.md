# 2026-10-14 01:05 · handoff · google-write (B1(a), second half: our plan out to Google as busy)

Branch `claude/google-write`, from `claude/kai-bugs-1012`. Not merged and not released.

**Kai's decision (2026-10-14):** "write blocks to google as busy".

## The scope (verified)

`https://www.googleapis.com/auth/calendar.events.owned`

It exists. Google's Calendar API scopes page (developers.google.com/workspace/calendar/api/auth, checked 2026-10-14) describes it as "See, create, change, and delete events on Google calendars you own". That is exactly what we need: write to the user's own primary calendar and nothing shared with them. I didn't fall back to `calendar.events`.

`authUrl` now asks for `calendar.readonly calendar.events.owned` together (`_shared/google.ts` `GOOGLE_SCOPE`, `GOOGLE_WRITE_SCOPE`).

## What works

**Incremental auth**
- The callback still requires the read scope (`scope_missing` otherwise). The write scope is optional.
- `integrations.data.can_write` records whether the grant has the write scope. Every sync refreshes it from the token answer's scopes.
- A grant from before today has no `can_write`. Settings shows **"Allow Kai's Flow to show your blocks in Google"** with **Reconnect**, which is the existing `start` flow, now asking for both scopes. Read sync carries on untouched until the user reconnects.

**Write-out** (`google-sync`: the same 15-minute cron plus Sync now, after the read sync, only when `can_write`)
- **Which rows:** every `source 'native'`, `all_day false`, `deleted_at null` row in the read window (today − 7 … + 60 days on the user's clock): time blocks, task blocks and the user's own events. A repeating series becomes one Google event per occurrence in the window (`expandSeries` with exdates), keyed `<row id>::<start ISO>`.
- **What each Google event gets:**
  - `transparency 'opaque'`;
  - `visibility 'private'`;
  - `summary` = the title (`'Busy'` if the title is empty);
  - start and end in UTC;
  - `reminders {useDefault:false}`, so Google doesn't ring on top of our own reminders;
  - private extended properties `kaisflow = <our id>` and `kaisflow_mirror = '1'`.
- **The plan** (`_shared/google.ts`):
  - `mirrorBodies` decides what Google should hold;
  - `listMirrored` lists ours through `privateExtendedProperty=kaisflow_mirror=1`, so Google itself filters to our events, across all time;
  - `planMirror` sorts them into create / update (title, times, busy/free or visibility drifted, including edits someone made in Google) / delete (row gone, trashed, all-day, out of the window, duplicates);
  - `writeMirror` applies the plan four at a time: removes, then updates, then creates (soonest first). It caps at 150 writes a run, treats 404/410 as done, and stops on 401/403/429.
- **Guards:**
  - `isMirrored` requires both private properties, so no event without them is ever patched or deleted;
  - `mirrorBodies` takes `source 'native'` only, so Google rows are never written back;
  - `mapEvent` drops our own events when the primary calendar is read back in, so they don't come back as `gcal` rows. No loop either way.
- A write-out failure never fails the read sync. `out: {blocks, written, failed, pending}` comes back in the sync answer, and Settings' sync line ends "· N blocks busy in Google".

**The setting:** Settings → Integrations → Google Calendar (phone: Connections) has "Show my plan in Google as busy".
- It's on by default once the grant can write (`integrations.data.mirror`; absent counts as on).
- Off: `google-connect {action:'mirror', on:false}` deletes ours from Google at once, and every later sync wants none.
- On: it saves, then runs a sync, which writes them.

**Disconnect:** deletes ours from Google first (best effort, only if the grant could write), then the existing revoke and cleanup.

**Not to AI:** unchanged. Native rows already go to chat, and Google rows still don't.

## Deviations

- **No column and no migration 0080. `gcal_id` stays null on native rows.**
  - Google holds the map instead, through our private property, and the property is the "ours" guard anyway.
  - A server-written column on `calendar_events` would be clobbered by the client's whole-row outbox upserts of a cached row, which would lose the mapping and duplicate events in Google.
  - A series has no row per occurrence to hold an id.
  - It also stays clear of the other builders editing `calendar_events` (0077).
- **A second private property, `kaisflow_mirror = '1'`.** Google's `privateExtendedProperty` filter matches exact values only, so listing "ours" needs a constant tag next to `kaisflow = <id>`.
- **A block marked Free in the app goes to Google as `transparent` (free), not busy.** That keeps the user's own Busy/Free choice. It's a one-line change in `mirrorBodies` if you want everything busy.
- **Past blocks leave Google once they're older than 7 days.** "Out of the window" includes the past edge, so Google holds only the window and Disconnect always has a bounded set (a few hundred events at most) to delete.
- **Kai's Flow is the truth.** An event of ours that someone edits or deletes in Google is put back on the next sync.

## Numbers

- `npx vitest run`: **2118 passed** (154 files). `googleSync.test.ts` grew from 19 to 28 tests:
  - the auth URL's two scopes and the exact scope string;
  - `hasScope`;
  - the mirror body;
  - which rows go (no gcal, all-day, trashed or out-of-window rows, no zero-length rows, the window edge);
  - Free → transparent, an empty title → Busy;
  - a weekly series with an exdate (8 occurrences) and a trashed series;
  - the plan: create / leave / update (Google's own offset, omitted transparency) / remove / duplicates / cancelled;
  - the our-property guard (foreign, key-only, tag-only and shared-props events are never touched, even when nothing is wanted);
  - the read side dropping our own events.
- `npm run lint`: **0 errors** (21 warnings, all from before).
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- Browser, mock backend (dev server from this worktree, `--mode mock`, port 5284, http://localhost): **`docs/log/assets/google-sync/verify.mjs` 101/101**. Output in `verify-output.txt`, screenshots in the same folder. New checks:
  - **s8:** the switch is on by default; off posts `mirror:false` with no sync; on posts `mirror:true` and then a sync; Sync now says "12 blocks busy in Google"; the client makes no writes.
  - **s9:** an old grant gets "Allow … Reconnect" and no switch, while reading carries on; Reconnect goes to Google with `calendar.events.owned`; day and night.
  - **s3, s7:** extended for the two scopes and the phone switch.
- There's no deno locally, so `deno check` for `google-sync` / `google-connect` runs in CI. Both are already in release.yml `FUNCTIONS`. Edge code mirrors chat's rrule import and google-sync's own patterns.

## Deploy order

1. No `db push` is needed (no migration).
2. `supabase functions deploy google-sync`, then `google-connect` (config.toml keeps `verify_jwt = false`).
3. The app (the Settings row). If the app goes out first, nothing breaks: the switch only shows for `can_write`, and Reconnect with the old function just re-grants read.
4. `[KAI]`, any time after step 2:
   - Google Auth Platform → Data Access: add `https://www.googleapis.com/auth/calendar.events.owned`;
   - then Settings → Google Calendar → **Reconnect**, leaving both boxes ticked (GOOGLE-SETUP.md step 8).

## Left for the conductor

- Privacy policy `site/src/pages/info.mjs` §3, promise (a) "Read-only, nothing changed in Google": no longer true. Not touched, as instructed.
- In `docs/GOOGLE-SETUP.md`, I added step 8 (Reconnect and what the write does), two troubleshooting rows, and replaced the "Not built yet" note. **Still saying read-only, and yours to change:**
  - the intro line "It only reads them: nothing is ever written back to Google";
  - the values table's Scope row;
  - step 3's Data Access scope;
  - step 7's "leave … ticked" wording.
