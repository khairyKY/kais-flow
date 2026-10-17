---
date: 2026-10-17
session: export (builder, worktree .claude/worktrees/export, branch claude/export from claude/kai-bugs-1012 @ 79b27d16)
type: handoff
---

# 2026-10-17 13:50 · handoff · export

Kai: build it. The gap audit's #1 was "no data export or backup". Todoist, TickTick and Things all let
you take your data out. Built on `claude/export` and pushed. Not merged, no PR, no migration.

## What it is

**Settings → Your data → Export your data**, between Import and Trash. The help line says
"A copy for you to keep · it can’t be imported back yet". It has three buttons:

1. **Everything (.json)** saves `kais-flow-YYYY-MM-DD.json` as
   `{ app: "Kai's Flow", version: "1.2.2", exported_at, tables: { … } }`. It holds every table the
   user owns, as rows: app_settings, domains, areas, projects, tasks, inbox_items, calendar_events,
   routines, routine_completions, time_entries, journal_entries, people, interactions, books, notes,
   quotes, commentary, captures, resurfaced_log and activity_log. Trash rows are included, marked by
   their `deleted_at`. Google's calendar rows are included too: it is a full copy.
   Left out are keys and tokens (`integrations`, `mcp_keys`, `capture_keys`, `push_subscriptions`)
   and the server's own bookkeeping (`ai_usage`, `ai_usage_global`, `embed_queue`). For tasks and
   inbox items, every column is read except the search ones (`lib/columns.ts`: an embedding is
   about 4.5 KB a row).
2. **Tasks (.csv)** saves `kais-flow-tasks-YYYY-MM-DD.csv`, one row per task that is not in Trash.
   The columns are: Title, Status, Due date, Scheduled start, Scheduled end, Duration (min),
   Priority (Critical / High / Medium), Labels, Project, Area, Domain, Parent task, Notes, Created,
   Completed. It uses names, not ids. Times are on the user's clock (`appZone`) as
   `2026-10-17 09:30`, which Excel and Sheets read as a date-time. It follows RFC 4180 quoting with
   CRLF rows and starts with a UTF-8 BOM, so Excel shows Arabic and emoji correctly. Text that starts
   with `= + - @` gets a leading `'`, because a GitHub issue or a captured page can name a task and a
   formula should never run when the file opens.
3. **Calendar (.ics)** saves `kais-flow-calendar-YYYY-MM-DD.ics` (RFC 5545). It holds the user's own
   events, Time blocks and task blocks that are not in Trash. Google's (`source 'gcal'`) are left
   out, since they already live in Google. UID is the row id. A one-off is in UTC. An all-day block
   is written as dates with an exclusive end. A free block gets `TRANSP:TRANSPARENT`. Text is
   escaped and lines are folded at 75 octets, never inside a UTF-8 character.
   **Deviation from the brief ("UTC times"):** a *repeating* timed event is written as
   `DTSTART;TZID=<user zone>:<wall time>` + `RRULE` + `EXDATE;TZID=…`. The app runs a series on the
   wall clock (`calendar/series.ts`), so "Mondays 09:00" stays 09:00 through Egypt's DST switch. A UTC
   anchor would move it an hour for half the year, and could land a `BYDAY` on the wrong day. Its
   `UNTIL` is already UTC, as RFC 5545 asks. There is no `VTIMEZONE` block: Google, Apple and
   Outlook read IANA zone names, but a strict validator would want one (a `ponytail:` note in
   `files.ts`).

Reads use the person's own session, so RLS scopes every table to them. They go 1000 rows a page
through `lib/fetchAll`, which now takes an optional per-page callback. While an export runs, the help
line shows the progress ("Exporting… tasks 1,200") and all three buttons wait. When it is done, a
toast says "Saved kais-flow-2026-10-17.json". If it fails, the toast says "Couldn’t export: …".

## Saving the file on each platform (`lib/platform.ts saveFile`)

- **Web / PWA:** Blob + `<a download>`.
- **Windows app (Tauri v2, WebView2):** the same Blob download. WebView2 saves it to Downloads and
  shows its download flyout. The app did the same with the installer before the updater (see the
  2026-10-03 desktop-polish handoff). No Rust plugin, so `cargo check` was not needed.
- **Android app (Capacitor):** the WebView has no download handler. `@capacitor/android` has no
  DownloadListener, so a Blob download does nothing there. Instead the file is written to the app's
  cache (`@capacitor/filesystem`) and the share sheet opens on it (`@capacitor/share`, through the
  FileProvider + `cache-path` that Capacitor's template already ships). From the sheet the person
  picks Files, Drive, mail and so on. The toast then says "Shared …". Closing the sheet shows no toast
  and no error. Both plugins are official and free (8.1.5 / 8.0.3), and they are **dynamic-imported
  only in that branch**: the web entry chunk is 362.28 kB both before and after (gzip
  115.30 → 115.31). No `npx cap sync` was run, because there is no `android/` in the repo.
  `android.yml` runs `npx cap add android` each build, which syncs every npm plugin. No manifest
  change is needed.

## Files

- `app/src/features/export/files.ts`: pure builders (`exportEnvelope`, `exportFileName`, `csvCell`,
  `tasksCsv`, `icsText`, `icsFold`, `calendarIcs`), with tests in `files.test.ts` (14).
- `app/src/features/export/api.ts`: `EXPORT_TABLES` (add a new table here) and `runExport`.
- `app/src/lib/platform.ts`: `saveFile`. `app/src/lib/fetchAll.ts`: the `onPage` callback.
- `app/src/features/settings/SettingsPage.tsx`: `ExportRow` in `DataCard`.
- `app/package.json`: + `@capacitor/filesystem`, `@capacitor/share`.
- `docs/log/assets/export/`: `verify.mjs`, `results.json` and screenshots (desktop / phone,
  day / night, mid-export, the toast, Android shared).

## Gate

- `npx tsc -b`: clean. `npx vitest run`: 166 files, 2297 tests passed. `npm run lint`: 0 errors
  (24 warnings, none new). `npm run build`: OK, entry 362.28 kB. `ds:check --baseline`: 0 new.
- `grep -c birthday_on app/src/lib/types.ts` = 1. `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.
- Harnesses against a mock dev server on :5291:
  - **export: 166/166.** On desktop + phone, day + night, it clicks each export, captures the
    download and reads the file back. For the JSON it checks the envelope, all 20 tables, 1,234
    tasks read over two pages, Trash flagged, no key, hash or token, and that the export never asked
    for integrations or keys. For the CSV it checks the BOM, quoting, names, the clock, Arabic, the
    parent and the formula guard. For the ICS it checks the UIDs, UTC, all-day, TZID + RRULE +
    EXDATE, 75-octet folding and the emoji title. It also checks the progress line, the toast, the
    buttons waiting mid-run, 44 px phone targets and no sideways scroll. The Tauri bridge gives the
    same Blob download. **Simulated Android:** a fake native bridge answers `Filesystem.writeFile`
    (CACHE, utf8, the right name) and `Share.share` (that file URI), with no Blob download, a
    "Shared …" toast, and silence on cancel.
  - **download-bar: 49/49.**
  - **desktop-polish: 148/150.** The 2 failures are `projects-day/night right-click a project`: the
    harness expects the old menu, but the project menu now has **Duplicate**
    (`a454efa8 feat(projects): Duplicate project`, from dup-open, already in the base). This is a
    stale expectation that has nothing to do with export, and it failed the same way on all 3 runs.
    One run also failed `settings-night @150% wheel` (scroll 0). It passed on the other two runs, so
    it is a flake.

## Not verified

- A real save on the **Windows app** (WebView2's download of a Blob URL) and on a real **Android**
  phone (the native Filesystem + Share plugins, and what the share sheet offers). Both are checked
  only in Chromium with the shells' bridges simulated. Kai: on the next APK / installer, try each of
  the three exports once.
- Opening the files in real Excel / Google Sheets / Google Calendar / Outlook. The format is checked
  byte by byte in tests, but the files were never opened in those apps.
- A real account's size. Paging and progress are checked with 1,234 mock tasks.

## Left out (on purpose)

- Restoring from the .json (out of scope; the help line says so).
- Trashed tasks and events in the .csv / .ics: they are in the .json.
- A `VTIMEZONE` block for repeating events (see above).
