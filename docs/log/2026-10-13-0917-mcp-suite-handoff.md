---
date: 2026-10-13 09:17 UTC
session: mcp-suite (builder)
type: handoff
related: 2026-10-13-0848-mcp-week-handoff.md (A1, A14); docs/MCP.md
supersedes: none
---

# MCP write tools proven on Postgres (mcp-week.sh) + one real bug fixed: handoff

Branch `claude/mcp-suite`, from `origin/claude/kai-bugs-1012` (74d92494, which carries the mcp-week merge).
Pushed. **Not merged, no PR.** No migration.

| Commit | What |
|---|---|
| `37614025` | `supabase/tests/mcp-week.sh` + rehearsal.yml step (fresh chain, after notify-prune; tee'd log, Summary line) |
| `d6ad193d` | **fix(mcp)**: JSON parameters reach Postgres as JSON, not as a JSON string |
| `82c4b2e6` | suite: a glued argument (`"7""$(…)"`) |
| `142d592b` | suite: positive controls beside the isolation checks |

## CI evidence (Rehearsal, `gh workflow run rehearsal.yml --ref claude/mcp-suite`)

- `38374096146` — **red**, before the fix: every `add_task` / `add_event` answered **HTTP 500**; `add_to_inbox`
  logged `inbox.captured` with no `source`. (The script also stopped early on its own typo, fixed in `82c4b2e6`.)
- `38374717209` — green after `d6ad193d`: 154 passed, 0 failed.
- **`38375248557` — green, final: 157 passed, 0 failed**; Fresh chain ✓ (deno check ✓ for every function incl.
  mcp, all six suites ✓), Production rehearsal ✓.

## The bug (`d6ad193d`)

`mcp/index.ts` passed JSON as `${JSON.stringify(x)}::jsonb`. postgres.js 3 (3.4.9) describes every
parameterised query first and serializes a parameter whose server type is `jsonb` with `JSON.stringify`
itself (`types.js typeHandlers`: `serializers[3802]`), so the value was encoded twice and stored as a
**jsonb string**. Effects:

- `jsonb_array_elements_text('"[]"')` → *cannot extract elements from a scalar* in `insertTask` (labels),
  `insertEvent` / `updateEvent` (exdates) and `deleteEvents` (ids). postgres.js re-throws any failed
  query of a `begin()` even when the tool caught it, so the request answered **500** and rolled back.
- `log()` and `insertInbox()` succeeded but stored `payload` as a string: `payload->>'source'` (and
  `field`, `title`, `url`…) read null.

Fix: every JSON parameter is cast `::text::jsonb` (7 sites), so its parameter type is text and it passes
through untouched; comment at `textArray`. Only `mcp` uses postgres.js (grep). Not pure logic, so no
vitest: the suite is the regression check (red → green above).

**Production since `6067827b` (2026-10-06, the MCP server's first deploy), as far as this code shows:**
`add_task` has always answered 500 (nothing written), and so has `complete_task` on a **repeating** task
(the spawn's insert — the task stays open) and `move_to_tomorrow` on a task with a block on another day
(the old `clearBlocks` took its ids the same way). `complete_task` on a one-off, `move_to_tomorrow`
without such a block, and `add_to_inbox` worked, but their `activity_log` rows — and the Inbox row's
`payload` — hold a JSON string instead of an object. Not verified against production (no access, by rule). Kai's call,
not done here — a data repair, review first:

```sql
-- look first: should be MCP rows only, since 2026-10-06
select event_type, count(*), min(created_at) from activity_log where jsonb_typeof(payload) = 'string' group by 1;
select count(*) from inbox_items where jsonb_typeof(payload) = 'string';
-- then
update activity_log set payload = (payload #>> '{}')::jsonb where jsonb_typeof(payload) = 'string';
update inbox_items  set payload = (payload #>> '{}')::jsonb where jsonb_typeof(payload) = 'string';
```

## What the suite does (`supabase/tests/mcp-week.sh`)

Notify-prune pattern: `mcp` served by `harness/runner.ts` under Deno with `SUPABASE_DB_URL` = the local
stack's database (so each request is the real transaction + role switch + RLS). Refuses a non-local
`API_URL` / `DB_URL`. Two throwaway users signed up through Auth; each key made as the app makes it
(`kf_ai_` + 32 random bytes base64url, its SHA-256 upserted on `user_id` **as the user through
PostgREST**). Users deleted before and after (cascade); the last check proves none of their rows remain.
Legacy-era JSON-RPC (`tools/list`, `tools/call`, `MCP-Protocol-Version: 2025-11-25`), rows read with psql in
UTC. Dates fixed in January 2028. 157 checks:

- `tools/list`: all 15 names for a read & write key.
- `add_task` with a time: task due/schedule/duration + exactly one `task` block, Cairo (15:30 = 13:30Z)
  and **Los Angeles** (20:00 → 04:00Z the next UTC day; default 30 min).
- `reschedule_task`: day+time → the **same** block moves keeping its 45 min, no second row; day only on
  the block's day → 09:00, block and schedule stay; day only elsewhere → 09:00 (07:00Z Cairo, 17:00Z LA),
  block soft-deleted, schedule cleared; an unblocked task → a new block of its duration;
  `move_to_tomorrow` → tomorrow 09:00 Cairo, block off. edit/delete_event refuse a task's block.
- `edit_task`: title, notes, duration, project (+ its domain, no area/milestone) → then `null` clears all
  four (domain with the project); a repeat on an undated task dates it today 09:00; `title: null` refused;
  an unchanged title writes nothing.
- `complete_task`: a **paused** daily task → done, no `next`, no new row; a running one → next at
  07:00Z the next day (proves `openOccurrence` + the spawn insert).
- `add_event`: event (60 min), Time block (`end`), all-day (UTC midnights, end exclusive; `calendar`
  shows its days), series Mon+Wed (`calendar` lists both occurrences); a Tuesday start under `MO,WE` is
  refused naming **2028-01-19 09:00**, nothing written.
- `edit_event`: one-off moved keeps its length; title + kind; **one occurrence** → exdate on the series +
  a one-off copy with `series_id`; **whole series** retimed → same first day, the exdate moves with it,
  no rows added, `calendar` shows Wed still skipped and the copy on Thu.
- `delete_event`: one occurrence → second exdate, series live, `calendar` shows Wed only; whole series →
  the row **and** its moved-out copy in Trash (two `calendar_event.deleted`); a one-off → Trash, others untouched.
- Every write: its exact `activity_log` event types for that call, each with `source: "mcp"`; the four
  edit tools' `changed` compared word for word; at the end no row of either user lacks `source: "mcp"`.
- Ownership: with A's key, B's task / event / task block are "No task/event with id" for get, edit,
  reschedule, complete, move, edit_event, delete_event; B's project refused for edit_task and add_task;
  A's calendar, list and search show none of B's (and do show A's own — positive controls); B's rows
  byte-for-byte unchanged (incl. `updated_at`); A logged nothing about B's ids.
- Read tools answer from the DB: today (the task due today is listed), list_tasks (7), get_task,
  projects (A's only), search (finds A's task), add_to_inbox row + log.
- The function's own log has no `mcp:` / `mcp tool …:` error line.

## Not covered

- The 2026-07-28 protocol era (`_meta` + `Mcp-*` headers), read-only keys, the 500/day limit, `Origin` —
  unchanged by mcp-week and covered by the vitest; not re-run on the stack.
- Top 3 on a real stack (add_task `top3`, a pick moved to a later day giving its place up), reminder lead
  carried by `settle`, Someday cleared — pure rules, vitest-covered; no reminder/top3 rows seeded here.
- All-day series edits, `repeat` changed on an existing event via edit_event, a DST switch day on the
  stack (vitest covers Cairo's autumn change).
- mcp-week's A14 (notify/chat paused) and A20 (github-sync) query edits — still not executed.
- Wording: `add_task`, `add_event`, `complete_task`, `move_to_tomorrow`, `add_to_inbox` answer with
  `added` / `done` / `moved` (+ `calendar_block`, `next`, `calendar_blocks_removed`), not a `changed` list;
  only the four edit tools return `changed`. The suite checks each tool's own answer. docs/MCP.md's "Every
  write says what it changed (`changed`: …)" is looser than the code — left as is (not a behaviour bug).
- Never run on this machine (no Deno, Docker, jq or psql here): CI is the only run.

## Deploy

`npx supabase functions deploy mcp` (with mcp-week's changes it carries). No migration, no secret. After
it, reconnect the assistant (`/mcp`). The data repair above is separate and Kai's call.
