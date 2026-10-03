---
date: 2026-10-03T13:30+03:00
session: Integrations wave 2, builder X (cleanup — Settings and docs tell the truth, GitHub polish)
type: handoff
related: docs/phases/P6-integrations.md §Notes (2026-10-03) · supabase/migrations/0045_ritual_reminders.sql · docs/log/assets/cleanup/
---

# Cleanup: Settings and the docs tell the truth; ritual reminders reach the server; GitHub polish

Branch `claude/cleanup`, cut from `origin/master` @ `a3a7413` (v1.0.16). Not merged, not deployed.
One migration (**0045**), no new dependency. Edge functions touched: `notify` (+ `notify/ritual.ts`),
`_shared/github.ts` (so `github-sync` and `github-connect` both need a redeploy).

## What changed

1. **Google Calendar, honestly.** The Settings summary card had a "Sync now" button that was always
   disabled and copy describing a sync that doesn't exist. Now: a "Google Calendar · sync" row with a
   "Coming soon" chip, no button. The Integrations page row says "Planned … Not built yet — nothing
   syncs" + "Coming soon"; the phone row says "Coming soon". The `google` integrations lookups are gone.
2. **Pushover row removed** from the Integrations page (never planned, not $0; web push replaced it).
3. **Ritual reminders are real.** `app_settings` gets `morning_digest_on/at` + `evening_nudge_on/at`
   (0045, defaults on / 08:00 / on / 21:00 = what the fixed cron sent). The desktop Notifications card
   has one row per reminder (TimeField + switch; the old device-only `kf_ritual_reminders` toggle is
   gone), and the phone Settings page gets a "Ritual reminders" card (the phone had none). 0045
   reschedules `morning-digest`/`evening-nudge` to `*/15 * * * *` with `{kind, scheduled: true}`;
   `notify` reads the candidates' columns and sends only when the reminder is on and its time falls in
   the tick's window `(tick − 15 min, tick]` on the Cairo wall clock. The time logic is one helper,
   `supabase/functions/notify/ritual.ts` (`ritualDue(kind, settings, now, zone = 'Africa/Cairo')`), so
   the per-user-timezone builder passes `app_settings.timezone` there and nothing else changes.
   A failed `app_settings` read sends nothing (better one missed digest than everyone every tick).
4. **GitHub summary row shows the real state** (`githubState` in `features/settings/api.ts`, from the
   row github-sync keeps): "Not connected" / "Token expired — reconnect" (status `failing`, set on a
   401) / "Connected · synced 3 Oct, 11:37" (Cairo) / "Connected · not synced yet". The date makes a
   stuck sync visible (non-401 failures aren't recorded on the row). Same text on the phone row and in
   the Integrations page's GitHub card (which used to show only a time of day).
5. **Dead code:** `CaptureApiCard` (exported, imported nowhere) deleted; the comments claiming the
   capture endpoint "doesn't exist yet" (sub-nav + card list) and the Sound card's "exported only to
   keep it compiling while hidden" fixed or removed. Y's live `CaptureKeyCard` untouched.
6. **GitHub polish.** Inbox GitHub rows: a 16px GitHub glyph (`aria-label="GitHub issue"`) instead of
   the "GitHub" text chip, the title, then `repo#n ↗` (link), up to three labels + "+N", and the age.
   `toPayload` stores the issue's `created_at`; a row stored before this shows its inbox age until its
   issue next changes (no backfill — `planSync` only rewrites changed issues). The dead `rank` read is
   gone. Filing writes `tasks.external_ref = {source:'github', id: node_id, url}` (0027's column, no
   migration; duplicates and next occurrences already strip it); the phone task sheet ("View issue ↗",
   `.ts-next` line) and the desktop task editor (a chip beside the status) link to it. Every href goes
   through `githubUrl` (only `https://github.com/…`). No AI ranking.
7. **Docs:** ROADMAP current-phase header + Botanical/UX-retrofit/P6/P7 rows + one changelog line;
   DATA_MODEL (capture + github-connect functions, github-sync without the AI claim, gcal-sync marked
   not built, `capture_keys` 0041, 0045, `external_ref` GitHub link, `created_at` in the payload,
   `content_items` dropped, `digest_hour` marked unread); README (GitHub + capture shipped, no "ranked
   by AI", apps shipped, P6/P7 status); P6 + P-IMPORT checklists ticked only where evidence exists.
   Small extra: `TimeField` takes an optional `ariaLabel` (default "Time") so the two reminder fields
   are named apart.

## Evidence

- **Gate** (worktree, no `app/.env.local`; the mock env file moved aside for the run):
  - `npx tsc -b`: exit 0.
  - `npx vitest run` (PowerShell, `$env:TZ` each of UTC, Africa/Cairo, America/Los_Angeles,
    Asia/Tokyo): **85 files / 1066 tests passed** in all four.
    New: `features/notifications/ritual.test.ts` (6: wall clock across zones/DST, defaults, first tick
    at/after the time exactly once, midnight wrap, off + malformed time, zone argument),
    `features/settings/api.test.ts` (2: the four GitHub states), `features/inbox/api.filing.test.ts`
    (2: a filed issue keeps its link; no link → no `external_ref`), `githubUrl` in
    `inboxDisplay.test.ts`, `created_at` in `githubPlan.test.ts`.
  - `npm run lint`: 0 errors, 19 warnings (baseline; the two in touched files are pre-existing lines).
  - `npm run build`: ok.
  - `deno` isn't installed here, so no `deno check`: the `notify` change is ~20 typed lines over the
    existing client; `ritual.ts` is pure and type-checked by `tsc -b` through its test import.
- **Migration 0045** (`docs/log/assets/cleanup/0045-pglite-check.mjs`, output in
  `0045-pglite-check.txt`) on PGlite with cron/net/vault stubs, run twice: **PASS** — an existing
  row gets the defaults (`08:00:00`/`21:00:00`), a client write of `'07:45'` reads back `07:45:00`,
  `'25:00'` is rejected, exactly one `morning-digest` + one `evening-nudge` job at `*/15 * * * *`,
  the unrelated `task-reminder-sweep` kept, each job POSTs `…/functions/v1/notify` with the Vault key
  and body `{kind, scheduled: true}`.
- **Browser** (`docs/log/assets/cleanup/verify.mjs`, mocked backend, http://localhost:5250, desktop
  1280 + phone 390): **52/52 passed** (`verify-results.json`, `verify-output.txt`, screenshots):
  - desktop Settings: no "Sync now", Google Calendar "Coming soon", no Pushover, no "configured";
    the GitHub row's four states (`desktop-summary-github-{failing,ok,fresh}.png`);
  - reminders: two named fields at 8:00 AM / 9:00 PM, typing 7:45 writes `morning_digest_at:'07:45'`
    to app_settings, the evening switch writes `evening_nudge_on:false` (keeping 07:45), the field
    dims, nothing in localStorage (`desktop-ritual-reminders-edited.png`);
  - Integrations page: "Coming soon", no Pushover (`desktop-integrations.png`);
  - phone Settings: Google Calendar "Coming soon", GitHub "Token expired — reconnect", the Ritual
    reminders card writes app_settings, no sideways scroll (`phone-settings.png`);
  - Inbox, desktop + phone: glyph on both rows, `acme/app#7 ↗` → the issue, `bug ui p1 +1`, age
    `5d` (opened) and `2d` (fallback), no "rank"; File writes the task with
    `external_ref {source:'github', id, url}` and marks the row filed (`*-inbox-github-row.png`);
  - the filed task: desktop editor and phone sheet show "View issue ↗" → the issue; a plain task
    shows none.

Re-run:

1. Create `app/.env.mock.local` with `VITE_SUPABASE_URL=http://127.0.0.1:9` and `VITE_SUPABASE_ANON_KEY=mock-anon-key`.
2. `npm run dev -- --port 5250 --strictPort --mode mock` in `app/`, warm `/settings`.
3. `node docs/log/assets/cleanup/verify.mjs <outDir> http://localhost:5250`.

## Deploy (conductor / release pipeline)

- `supabase db push` → 0045 (additive columns; the two cron jobs are rescheduled in the same file).
  Push the DB **before** the functions: the new `notify` selects the 0045 columns.
- Redeploy `notify`, `github-sync`, `github-connect` (the last two share `_shared/github.ts`).
- No secrets, no `[KAI]` steps.

## Decisions / deviations

- **The cron isn't rescheduled per user** — the phase file's wording. Both jobs tick every 15 minutes
  and notify filters: 192 invocations a day in total instead of 2 (not per user), well inside the
  free tier's 500K a month.
- **`scheduled: true`** only comes from the cron. A manual service-role call without it (the backend
  suites `fix0-auth.sh`, `sec2.sh`, `notify-prune.sh` call `{"kind":"morning_digest"}`) ignores the time
  as before but honours "off"; their users have no settings row, so their expectations are unchanged.
- **`digest_hour` kept, unread.** Dropping it would break an installed older app's full-row
  `app_settings` upsert (it still sends the column). DATA_MODEL says so.
- **No `localStorage` → server migration** for the old toggle: it was never honoured, so anyone who
  turned it off gets both reminders until they turn them off again.
- **Times stay Cairo wall-clock** (as asked). `app_settings.timezone` is already per user; the
  per-user-timezone pass changes the `zone` argument in `runForAllUsers`.
- **`evening_nudge`'s "today"** is still the UTC date of the run (unchanged): fine for nudge times
  from 03:00 to 23:59 Cairo; a nudge set between 00:00 and 03:00 Cairo checks the day that just ended,
  which is arguably right. Revisit with per-user timezones.

## Risks / for the conductor and the other builders

- **Migration number:** 0045 was free at `a3a7413`. If Y or Z also add a 0045, renumber one on merge
  (the file is idempotent and has no dependency on 0044 beyond `app_settings` existing).
- **Shared lines in `SettingsPage.tsx`:** my edits sit next to Y's capture card (the import line, the
  Integrations page's "Capture from anywhere" block below the Google row, the phone rows array).
  Expect small conflicts there; mine never change `CaptureKeyCard`.
- **For Y:** the phone Settings rows still say "Capture API · not set up" (`MobileSettings` rows) —
  untrue since v1.0.5; left for Y because it's the capture card's read-out.
- **For Z:** `TaskSheet.tsx` (one `githubUrl` import + one `.ts-next` link after the repeat line) and
  `TaskEditorPage.tsx` (one chip beside "via voice") are touched; no change to task-row labels.
- **GitHub rows' age** is the issue's opened date only for rows synced after `github-sync` is
  redeployed (new issues, or old ones the next time they change on GitHub).
