---
date: 2026-11-03 19:15 Cairo
session: gcal-events
type: handoff
related: Kai 2026-11-03 ("When Google Calendar is connected there are a lot of bugs. You can't edit the events coming from there, you can't right- or left-click any event, and it gets super laggy and buggy.")
---

# gcal-events: handoff

Branch `claude/gcal-events` (worktree `.claude/worktrees/gcal-events`), merged with `claude/kai-bugs-1012` as of `feadd3d2`. Pushed, not merged, no release.
**No migration.** `external_ref` is jsonb; nothing new in the schema. One function changed (`google-sync`, plus a two-line change in `google-connect`); no new function, so `release.yml` FUNCTIONS is unchanged.

## 1. What was going on

| Kai said | What I found |
|---|---|
| Can't edit them | By design. google-sync wrote Google rows as mirrors and `calendar/api.writeEvent` dropped every write to one; the grid drew them `editable: false`. The grant already carries `calendar.events.owned` (the "plan as busy" feature), so nothing stopped writing back. |
| Can't left- or right-click any event | **Not reproducible as a dead click.** On the base (before any change) every Google event I reached on a dense week opened its details on a left-click and menu B on a right-click, in the mock (probe, then `c1`/`c2` here). What does fail is a press that lands while the main thread is blocked: every sync landing redraws the whole grid for 0.7 to 1.5 s (section 3), and a realtime burst repeats it. A click or a drag in that window is late or lost, which reads as "can't click". I cannot prove that is exactly what Kai hit; the rest of this list is what I could measure and fix. |
| Laggy and buggy | Three causes, all on the Google path (section 3). |

## 2. Built

**Editing.** A Google event is editable when google-sync stamps `external_ref.edit` on its row: the grant can write, the event is on a calendar the account **owns** (`calendarList.accessRole = owner`; the owned scope reaches no other), it is a plain event (not a birthday, Gmail booking, focus block), not locked, and organised on that calendar, or guests may modify. Otherwise it stays read-only.

| | Editable | Read-only |
|---|---|---|
| title | details title, phone sheet title | read-only field |
| time | drag, resize (top and bottom), Date row, Time ▸, typed time, length chips | none |
| delete | menu B, details Delete, ⌫, multi-select, phone footer; Undo | none |
| repeating | This · This and following · All, the same question as ours | none |
| always | Join meeting (Meet / video link), Open in Google Calendar, Duplicate as my event (a native copy, never sent to Google; Ctrl D), Copy link, Work with AI | same |

- **How it goes to Google:** `google-sync` gets `{action:'edit', id, scope, change}` and `{action:'undo', calendar, ops}`. Google first, then that one calendar is re-read so the rows never run ahead of Google. The grid shows the change at once and puts it back, with a sentence ("… · put back"), when Google says no. Not an outbox write (a Google call, not a table write); offline it fails with that sentence.
- **The plan** (`_shared/gcalEdit.ts`, pure, shared with the vitest and the Deno suite): This = patch / delete the instance. All = patch / delete the master; a move shifts the master by the same days to the same time of day and rotates BYDAY (`shiftByDay` moved to `_shared/series.ts`). Following = the master ends before the occurrence (UNTIL; COUNT carries what is left, through the app's own `splitSeries`), and an edit starts a new series on it with the master's description, place, colour, guests and reminders. From the first occurrence, Following is All. A series with EXDATE / RDATE lines is not shifted (`unsupported`: "change just this event"). All writes send `sendUpdates=none`, so a drag never mails guests.
- **Undo:** every answer carries the ops that put every event back as it was (patch the old fields, confirm a cancelled event again, delete a created tail); a half-failed Following rolls itself back.
- **Meet links:** `hangoutLink`, else a `conferenceData` video entry point, stored as `external_ref.url` (https only). The Now card's Join already read `external_ref.url`; the details and menus now show **Join meeting**.
- **Also stored:** `link` (`htmlLink`), `master` (`recurringEventId`), and per-calendar `role` in `integrations.data.calendars` (read fresh each sync, so an old connection fills in without Reconnecting). A grant from before the write scope offers Reconnect (Settings copy now says it also enables editing).
- **Sync fix on the way:** `planGcalSync` also updates a row whose title or times drifted, not only when the etag changed (Google may not change an instance's etag when its master is edited).
- **Privacy:** Settings and the privacy page said "it never changes or deletes any other event". That is no longer true, so `site/src/pages/info.mjs` §5 now says it changes or deletes an event only when you rename, move or delete it yourself, and `app/public/privacy.html` is regenerated. **I did not bump `PRIVACY_VERSION`** (that would send every user the "we updated our terms" card): that is your call, per `docs/LEGAL.md`.

## 3. Lag: what was slow, what changed, the numbers

Harness section `L`, same data both sides: 485 rows, 480 of them Google (prayer times, meetings, a weekly standup's instances, all-day holidays) plus four native repeating series; Chrome headless, dev server, 1280×800. "Before" is the same harness run on `eb114114`.

| | Before | After |
|---|---|---|
| Realtime burst of 335 messages (a first sync): reads of `calendar_events` | **335** (each message cancelled the refetch before it and started another) | **1 to 3** |
| A sync lands 100 rows **off screen** (a later month): main thread | **747 / 1165 ms** | **0 ms** |
| A sync lands 20 new rows in the week on screen | 849 / 1491 ms | 631 / 722 / 790 ms (about the same: FullCalendar redraws the week) |
| A sync lands 30 changed rows in the week | 896 / 1260 ms | 676 / 677 / 898 ms (about the same) |
| Opening the calendar (long tasks) | 4 to 6, 1180 / 1401 ms | 3 to 4, 1062 / 1157 ms |
| Click to details at 4× slower CPU: median / worst | 532 / 769 ms (a second run: 527 / 3069 ms) | 467 / 596 ms, 480 / 684 ms |

Causes and fixes:

1. **Realtime storm** (`lib/realtime.ts`): one invalidation per Realtime message, each cancelling the refetch in flight. Now `invalidateSoon`: one per table after 300 ms of quiet, at most 2 s of waiting however steady the stream.
2. **Everything ever stored went to the grid** (`useCalendarEvents(range)`; the desktop grid's window snaps to four weeks, a one-week snap redrew mid-glide and failed cal-scroll f-perf): a repeating-series expansion passes every one-off through, in or out of range, so the overlap layout, conflict badges and FullCalendar got every Google row ever synced (history is never pruned), and a landing a month away redrew the visible week. A grid's range now keeps only what touches it; unranged readers are unchanged.
3. **Twenty readers each expanded and sorted every row** on every landing: one expansion per (rows, window, zone) is shared (`api.expanded`, a WeakMap on the rows array).

**Not fixed, and why:** a landing *in* the visible week still redraws it (about 0.65 s dev, roughly a third of that in production): FullCalendar's React integration re-renders every visible event's content when its data changes, and each press costs two forced layouts (FullCalendar's hit prepare, the popover's anchor). Memoising `eventContent` per block signature is the next step; I left it, it touches the whole grid. The calendar itself is quiet when idle (profiled: 0 ms in 5 s) and hover and scroll hold 16 ms frames.

## 4. Checks

- `npx tsc -b` clean · gate: vitest ×4 TZ **203 files / 2834 tests** all green, lint 0, build OK, ds:check 0 new · `birthday_on` greps 1 / 1.
- New vitest: `gcalEdit.test.ts` (28: mapEvent edit / url / link / master, the planner for This / Following / All incl. COUNT, all-day and EXDATE, runOps and its inverse, error codes), `gcal.flow.test.ts` (16: real api + gcal against a fake google-sync), `realtime.test.ts` (4), blockMenuSpec additions.
- **Server suite** `supabase/tests/gcal-edit.test.ts` (10 tests, added to `rehearsal.yml`): the real `google-sync` function under plain Deno on a fake Calendar API and a fake PostgREST. A real sync stocks the rows, then edit / delete / undo of a one-off, This / All / Following on a weekly series (rename, move, delete, split, undo), read-only gates (another calendar, someone else's event, a stranger's row, a grant without the scope), bad requests, rollback of a half-failed split. Runs locally: `npx deno@2 test --no-lock --allow-env --allow-net=127.0.0.1,localhost --allow-read supabase/tests/gcal-edit.test.ts`. `deno check` google-sync, google-connect clean.
- **Rehearsal:** run `41676972455` on the first push: **Fresh chain and Production rehearsal both green**, `gcal-edit` 10/10 inside it. Re-dispatched after the final push.
- **Harness** `docs/log/assets/gcal-events/verify.mjs` **61/61** on the final tree (C clicks on every Google event of the week, left and right; A actions; E edit, drag, resize, delete, Undo, "no" puts it back; R scope question; N Now card Join; P phone; L the numbers above).
- **Re-runs on the merged tree:** cal-clicks **96/96** (two expectations updated: menu B of a Google event, and a Time block now has focus-d3's Focus row) · drag-fix **176/176** · cal-scroll **52/52** (after widening the window; it failed f-perf and f-motion with a one-week snap) · google-sync **101/101** · motion-cal **98/98**.
- google-sync harness: g2 and p1 expected the read-only rows to be three; they are now five (Open in Google Calendar, Duplicate as my event), updated 1 for 1.

## 5. Left over / for you

- **PRIVACY_VERSION bump** (section 2): the text is accurate now; the notice is your decision.
- **Dead click not reproduced** (section 1). If it comes back on Kai's machine, the first thing to read is the harness's `c` section run against his real week, and the browser console during a sync.
- A *read-only* Google event on the phone still doesn't lift on a long-press (as before); its details are a tap and its ⋯.
- Ctrl+drag still doesn't copy a Google event (menu B's Duplicate does).
- Colour, project and remind stay local-only things Google events don't have (no tray on them).
- Not done: editing attendees, description, location, or the Meet link itself from here; moving an event to another calendar.
