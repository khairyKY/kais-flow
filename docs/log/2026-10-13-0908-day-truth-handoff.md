---
date: 2026-10-13 09:08 UTC
session: day-truth (builder)
type: handoff
related: 2026-10-13-0808-p7e-parity-audit.md §3 list A, rows A23, A26, A27, A29, A30 · docs/DAILY-CYCLE.md · P7 7b/7d
supersedes: none
---

# Day truth (P7e A23, A26, A27, A29, A30): handoff

Branch `claude/day-truth`, from `origin/claude/kai-bugs-1012` @ `1c5bfb3f`. Pushed. **Not merged, no PR.**

## Per row

| Row | Result | Commit |
|---|---|---|
| **A23** Slipping skips archived projects | Migration **0072** replaces the `slipping` view (0053's, same columns, still `security_invoker`) with `p.status <> 'archived'` on projects. | `72523684` |
| **A26** Birthday 7 days ahead | `notify/birthday.ts` `birthdayGroups(people, spoke, today, zone)`: the day's birthdays (`inDays` 0), then the ones exactly 7 days out (`inDays` 7, "last spoke" counted to today). `birthdayNotice(people, prefs, inDays)`: "Omar's birthday is in a week" / "2 birthdays in a week" / private "A birthday in a week", tag `birthday-soon-<id>` so it never replaces the day's. notify sends one push per group (and logs each to Activity); the Windows/Android planner (`notifications/plan.ts`) plans the same groups. Same Birthday switch, same 08:00, 29 Feb as on the day. | `f67a6744` |
| **A27** New Routine description | Migration **0072** adds `routines.description text`. The form has an optional **Description** under Name (the words of `design/New Routine.dc.html`, the Name field's look); Edit reads it back. A create leaves the column out when empty; an edit writes it only when the row has or gets one, so a server/build from before 0072 never sees it unless it is used. Not shown anywhere else yet (see below). | `ca0623c8` |
| **A29** Loop-day bugs | (1) **Shut down after midnight**: the evening ritual does its date math on `loopNow()` (rituals/loopDay.ts: now from 04:00, else 23:59:59 of the day you're still living), so at 00:30 the Sweep is yesterday's plate, Tomorrow lands on the morning the seeds are for (not the day after), the hint says "→ Tue 09:00". (2) **Evening nudge after Shut down**: notify skips it when the user's `ritual.finished` rows hold an evening run for the current loop day; the planner does the same from its cache (TrayBridge now loads those rows and re-plans Android when they change). One rule: `notify/ritual.ts shutDownOn`. (3) **Weekly-review prompt**: Today now reads the Weekly review's own events and rule (`reviewWeek.ts weekClosedAt`, latest close/reopen for this review week wins), so Undo brings the prompt back and a late close (last week's, on the weekend's 2nd day) no longer hides next week's; both use the loop day's week, so a close at 00:30 belongs to the week you were closing. `today/api useWeekClosedAt` is gone. The loop-day rule moved to `supabase/functions/_shared/zone.ts loopDay(now, zone)`; `loopDayKey` calls it with the user's zone, so app and notify can't drift. Found on the way and fixed: at 00:30 the Day card fell back to Now / Plan and the desktop rail folded Evening to "from 17:00" — `dayPhase isEvening` (17:00 → 04:00) now drives both. | `ccd14018`, `87195ad3`, `615a3da8` |
| **A30** Small truths | **confidence_threshold** is read: `aiFill.confidenceThreshold()` from the settings row the app holds (0.75 until it loads / for anything outside (0, 1]); auto-file, the AI's place and the Inbox card's "Where does this go?" use it. **Every running challenge gets a card** (was `find`, now one card each, spaced for the tape strip). **A focus round survives a reload**: the session is kept in `localStorage` (`kf_focus_session`) on every change with its write time and restored on load; the shell's ticker catches a running timer up (`resumeAway`) — a phase that ran out while away ends there (a pomodoro logs its round once, from its real start) and the next waits paused; a stopwatch adds the time. **Retainer month in the user's zone: already true** since 0050 (the audit cited 0047's superseded body) — no change; `retainer-zone-pglite-check.mjs` runs 0050's function with owners in UTC+14, UTC−11 and no settings row. | `ebc2ab5b`, `a19bca18`, `5ef83370`, `23dbc64d` |

Harness + assets: `7ddbb26a`. This file + INDEX line: the last commit.

## Migration 0072 (additive, idempotent)
`create or replace view slipping` (A23) + `alter table routines add column if not exists description text` (A27). `docs/DATA_MODEL.md`: the routines row and a 0072 note. Proof without Docker: `docs/log/assets/day-truth/0072-pglite-check.mjs` → 8/8 (the archived project slipping under 0053, gone under 0072, back when restored; same columns; the column, nullable; an old build's upsert keeps it; run twice).

## Deploy (order)
1. `npx supabase db push --include-all` → **0072** (before the app: the form writes `description` once used).
2. `npx supabase functions deploy notify` → A26 (week-ahead birthday) + A29 (no nudge after Shut down). It imports `_shared/zone.ts` (new `loopDay`, additive). No other function changed in behaviour.
3. The app (and the Windows/Android shells pick up the planner change with the web bundle).

## Evidence
- `npx vitest run`, PowerShell `$env:TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo: **150 files, 2013 tests** pass in each (base 1987, +26).
- `npm run lint`: exit 0, **0 errors** (21 warnings, pre-existing). `npm run build`: green, entry `index-*.js` 128.27 kB gzip. `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**.
- notify type-check: no deno here, so `notify/index.ts` (+ `ritual.ts`, `birthday.ts`, `copy.ts`, `_shared/*`) was checked with `tsc --strict` against the app's `@supabase/supabase-js` types, a `Deno` shim and a `jsr:@negrel/webpush` stub: exit 0. Rehearsal's `deno check` is the real gate.
- Browser, mock backend (dev server from this worktree, `--mode mock`, http://localhost:5275, routes warmed): `docs/log/assets/day-truth/verify.mjs` **49/49** — 00:30 Tue: Day card "Shut down the day", rail Evening open, Sweep = Monday's leftover only, Tuesday's task "Due tomorrow", Tomorrow writes Tue 09:00 (desktop + phone, night), Close the day logs Monday's `ritual.finished` and seeds for Tuesday; review prompt shown after close+undo and after a late close, hidden after a close this week, live Close → Undo → Today asks, Close (kept) → gone, rows all keyed to the week of Wed 7 Oct, at 00:30 still asked and a close then keys that week; Description field present, planted trimmed, read back, edited, an untouched routine's save omits the column (desktop + phone); two running challenges → two cards (desktop + phone); an 0.8 read is a suggestion at 0.75 and asks at 0.9; a started pomodoro is still running after `page.reload()` and caught up (1497 → 1494 s).
- Reruns on the same server, 3 lanes: **fix-today 116/116, today-shell 88/88, routines-2 45/45, fix-grammar 97/97**.
- Also ran `rituals` (not asked, but it covers Shut down): 133 pass, **1 fail + a crash at 6t-desktop**, both in the morning ritual / desktop panel. **Pre-existing**: the same harness against the base sources (checked out temporarily in this worktree, then restored) fails the same check, one more, and crashes at the same line. Worth a look by whoever owns that harness.

## Not verified / known gaps
- Nothing ran against real Supabase: the view, the column and notify's new query are proven by pglite + tsc + unit tests only. Push delivery (week-ahead birthday, no nudge after Shut down) is not seen on a device.
- The planner's nudge skip on Windows/Android relies on `['activity_log','ritual_finished']` being in the cache (TrayBridge loads it in those shells); not run in a Tauri/Capacitor shell.
- The routine description is only shown in the form. Where else to show it (row, trellis) is a design call for Kai.
- After midnight Today's phone header still says the calendar date ("Tuesday, Oct 13") while the Shut down sheet says MON 12 OCT. Left as is (out of the rows' scope).
- The Inbox card reads the threshold at render; there is no Settings control for it (the column was never exposed), so it only changes by editing the row.
- **Base moved while I worked**: `origin/claude/kai-bugs-1012` is now `74d92494`. `git merge-tree` shows **one conflict, `supabase/functions/notify/index.ts`**, the evening-nudge `Promise.all`: base added `.eq('paused', false)` to the `left` query; this branch added a third query (`shut`). Keep both. The other overlaps (WeeklyReviewPage, RoutinesPage, DATA_MODEL) auto-merge. The ds baseline moved there too (1407 → 1398); this branch adds no hits.
- Untracked, not committed: `app/.env.mock.local` (copied from the main checkout for the mock server).
