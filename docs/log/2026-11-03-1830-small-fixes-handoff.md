# 2026-11-03 18:30 (Cairo) · handoff · small-fixes — four small fixes

Branch `claude/small-fixes` (worktree `.claude/worktrees/small-fixes`), from `claude/kai-bugs-1012` at `eb114114`. Not merged, not released.

## 1. Raw tags in chat answers

The snapshot gives each listed item a ref (`[t1]` task, `[e1]` event, `[i1]` Inbox capture), and the model echoed them after items.

- **Server** (`supabase/functions/chat`): `plan.ts resolveTags` runs on the final answer. A tag that resolves to a task or event stays, and the `done` event carries `refs: { t1: { entity_type, entity_id, title } }`. Any other tag (unknown, or an Inbox capture, which has no page) is removed together with the space before it. `stripTags` also takes the tags out of earlier turns before the model reads them, because each request numbers the refs afresh and a stale `[t1]` would name the wrong item. `prompt.ts` now records the item's title on each ref.
- **App**: `markdown.ts inlineParts` reads `[t1]` as a `ref` piece (inside bold/italics too). `ChatPanel` draws it as a chip, "↗ task" / "↗ event", named for the item in its aria-label and title, and tapping it closes the panel and opens the item (the same `useOpenSearchHit` the citations use). The refs are kept on the message, so the chips survive a reload; a tag with no refs (an older saved message) shows nothing, not the raw text. `chat.css .kf-chat-ref`, tokens only.

## 2. Notifications in 12-hour time

- `notify/copy.ts`: `is24h(prefs)` = the device's own `hour24` if it sent one, else `app_settings.prefs['kf.calViewOptions']` (the clock switch settings-sync mirrors, migration 0087), else **12-hour**. `clock()` takes `h24` (default 12-hour). Every time in a notice goes through it: the task reminder body and its "at 2:00 PM" lead, the event reminder span ("6:00–7:30 PM", the meridiem once when both ends share it), the routine title ("Stretch — 7:30 AM").
- `notify/index.ts`: the history rows (`logNotice`) are built with the person's clock too (`NAMES(prefs)`), so Activity matches the push. No other server code changed; `select('*')` already returns `prefs`.
- App side, so the Windows/Mac sweep and the phone's schedule read the same way: `notifications/local.ts noticePrefs()` adds this device's own `hour24()`. `TrayBridge` uses it for `localPlan` (the Windows/Mac sweep and Android's 7-day plan) and replans on Android when the switch flips (`useClockStore` subscription). `plan.ts blockers`, `tray/trayState.ts pauseMenuLabel` and Settings' "what is in the way" lines use it too. The native Android code takes its text from the JS notice (the widgets already followed the clock).
- Existing tests that asserted 24-hour times now assert 12-hour (the new default); `copy.test.ts` gained the 12h/24h cases and the prefs reading.

## 3. Phone Today's Day bar on an empty day

`DayStripView` returns nothing when the day has no timed blocks in the bar's window and no Now/Next item (all-day events are never drawn there). No placeholder line: Day view then starts at the goal card. The Now view is unchanged.

## 4. Weekly review day and time

- **Migration 0091** `app_settings.review_day smallint` (check 0–6) and `review_time time`; both null = how it was (first day of the weekend, all day). `docs/DATA_MODEL.md` updated. Shown in Settings only once the fetched row has the keys (`settingSynced`), so nothing breaks before the push. **[KAI] `supabase db push` for 0091.**
- `lib/weekend.ts`: `parseReviewWhen` / `reviewWhen()`. `todayLayout.ts reviewDue(now, weekend, events, when)`: the chosen weekday replaces the weekend-start rule; with a time, the prompt waits for it on the loop day (04:00 rollover), then stays up until the week is closed, as before. Closing the week (and Undo) work as before; the review week is still the weekend-based week.
- Settings → Calendar & time → **Weekly review**: a day picker (default "Weekend start · Friday" etc., then Sunday–Saturday) and a "at a set time" switch that shows a time field (18:00 when first turned on). Synced like every row (outbox, realtime).
- **Not built: a review reminder in notify.** There isn't one today (notify has no weekly-review notice), so there was nothing to drive; the columns are on the row for it when it's added.

## Checks

- Gate (`gate.ps1`): vitest 196 files / 2743 tests in Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo, all green; lint 0; build ok; ds:check 0 new.
- `grep -c birthday_on types.ts settings.ts`: 1 / 1.
- `deno check --quiet --no-lock` on `chat/index.ts` and `notify/index.ts`: clean.
- New harness `docs/log/assets/small-fixes/verify.mjs`: **20/20** (chat chips and the dropped tags and the chip opening a task; the device planner's words under both clock settings; the empty-day Day bar; the Settings row writing `review_day` / `review_time`; Today's prompt on five day/time cases). Shots in the same folder.
- Existing harnesses, one at a time against the mock server on :5347: ai-chat 77/77, today-shell 86/86, phone-today 94/94, notify-fix 26/26 (two expectations retargeted to 12-hour: the reminder body "8:50 AM · Car" and "paused until 11:41 PM"; the harness file's own PW path is the old dead one, so it was run from a temporary copy that is not committed), settings-sync 58/61.
  - settings-sync's 3 failures are `no page errors` ("Transition was skipped. New ViewTransition started"), the same on base `eb114114` and when run alone.
- Rehearsal (`gh workflow run rehearsal.yml --ref claude/small-fixes`, run 41674525013): green, fresh chain and production rehearsal both (0091 applies on a copy of production's schema).

## Notes

- `app/.env.mock.local` was added for the mock server (gitignored).
- The other `NoticePrefs` callers (sounds, whatsNew, check) don't print times, so they were left alone.
