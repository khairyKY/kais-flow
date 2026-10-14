---
date: 2026-10-14 15:15 UTC
session: mcp-full (builder)
type: handoff
related: Kai 2026-10-14 "build full mcp functions, I want to be able to tell any ai to do anything"; docs/MCP.md; 2026-10-13-0848-mcp-week-handoff.md; 2026-10-13-0917-mcp-suite-handoff.md
supersedes: none
---

# Full MCP: every area of the app over MCP, the journal / people behind a per-key switch (0080): handoff

Branch `claude/mcp-full`, from `origin/claude/kai-bugs-1012`, base merged in twice (external-links +
download-bar, then msix — neither touches `supabase/functions/mcp`). Pushed, head `8041e2f0`. **Not
merged, no PR.**

## What an assistant can do now

51 tools (15 before): 45 for every key (writers only for Read & write), + 6 journal / people tools only for
a key granted them. Full list, rules and examples: `docs/MCP.md` → The tools.

| Area | Tools |
|---|---|
| Day, tasks, calendar | `today` (+ ritual state, last night's seeds), `search` (+ areas, Library; journal / people when granted), `list_tasks` (+ area, Someday), `get_task` (+ link, area/domain), `add_task` (+ labels, priority, `remind_at`, area, Someday, `parent_id`), `edit_task` (every field: labels, priority, repeat, reminder, Someday, paused, `top3`, `goal`, project / area / domain, Time slot in/out, `place_before`/`place_after`; bulk `ids`), `reschedule_task` (+ `null` = no date; bulk), `complete_task` / `reopen_task` / `move_to_tomorrow` (bulk), `calendar` (+ `remind_min`), `add_event` / `edit_event` (+ `remind_min`; a Time block carries its tasks), `delete_event` (a Time block lets its tasks go) |
| Inbox | `inbox`, `add_to_inbox`, `file_inbox_item` (task / event / Library note / journal* / person*), `update_inbox_item` (dismiss, snooze, unsnooze, restore; bulk) |
| Organize | `projects` (+ areas, domains, templates), `get_project`, `save_project`, `update_milestone`, `update_checklist`, `checklist_template` (save / use / rename / delete), `save_area`, `save_domain` (+ merge), `labels`, `update_label` (create / recolor / rename / merge / delete) |
| Trash, settings | `trash`, `move_to_trash` (tasks with their blocks, Inbox items, projects, areas, domains, journal*; bulk), `restore_from_trash` (+ events), `settings`, `update_settings` (zone, weekend, calendar view, slipping days, names, notification switches / times / quiet hours / pause — never keys or tokens) |
| Routines, focus, rituals | `routines` (with the app's streak), `save_routine` (archive = `active: false`), `check_routine`, `start_focus` / `stop_focus`, `plan_my_day`, `shut_down` (+ a journal line*) |
| Library, insights | `library`, `save_library_item`, `delete_library_item` (for good — no Trash), `insights` (the week, Slipping, streaks), `activity` |
| Personal (scope only) | `journal`, `save_journal_entry`, `people`, `save_person`, `log_interaction`, `delete_person` (for good — no Trash) |

\* only for a key granted that scope.

## The privacy gate

- **Migration 0080** (additive, idempotent): `mcp_keys.scopes text[] not null default '{}'`, check
  `scopes <@ {journal, people}`, column grants gain `scopes`. A new key is made with `scopes: []`.
- **Settings → AI assistants**: two switches under an existing key, **Journal** and **People**, off by
  default; an awaited `update` of the key row (`mcpKey.ts setMcpPersonal`), effective on the assistant's
  next call. The card's footnote no longer says "never shared": "a new key … starts with Journal and People off".
- **Enforced server-side twice**: `server.ts toolsFor` lists / runs a `scope`d tool only for a granted key
  (a call by name is refused); `index.ts` refuses `journal_entries` / `people` / `interactions` to any
  other key at the Store, and drops journal / person search hits. Every other way in is closed too:
  Trash hides trashed entries, Activity hides `journal.*` / `people.*` / `notify.birthday`, Inbox filing to
  journal / person and `shut_down`'s line are refused, a domain merge leaves people where they were.
  The key's scopes are read with `to_jsonb(k)->'scopes'`, so a database without 0080 reads as none.
- The privacy policy text (site info §2) is the conductor's — not touched.

## How (for the next builder)

- `supabase/functions/mcp/`: `tools.ts` (Store, argument checks, task / calendar / inbox tools, shared
  helpers `createTask`, `completeTask`, `replanTask`, slots), `organize.ts`, `life.ts`, `personal.ts`
  (new), `server.ts` (the registry + scope gate, `instructionsFor` naming this key's writers and areas,
  version 2.0.0), `index.ts` (SQL). The Store gained four generic methods (`find` / `insert` / `patch` /
  `remove`: JSON containment to match, `jsonb_populate_record` to write — Postgres converts each value to
  its column's type; identifiers only from code, checked) and four queries (`inboxItems`, `trashed`,
  `activity`, `weekStats`). `insertTask` / `updateTask` / `insertEvent` / `updateEvent` now go through the
  generic writes (`TASK_EDITABLE`), so new columns (labels, priority, paused, slot, sort_order,
  remind_min, external_ref) are written.
- App: `features/settings/mcpKey.ts` (scopes, `withPersonal`, `setMcpPersonal`, New key → `scopes: []`),
  `SettingsPage.tsx` McpCard (switches, copy), `inbox/InboxPage.tsx` (a capture filed as an event / a
  Library note says so).

## Bugs found (and fixed here)

1. `delete_event` on a Time block left the tasks it held pointing at a trashed slot, still "scheduled"
   (the app releases them — calendar/api `releaseSlot`). Now released, said in `changed`.
2. `edit_event` moving / re-timing a Time block left its tasks at the old time (app: `followSlot`,
   `retimeEventWithUndo`). Now they move with it (one-off, one occurrence, a whole series).
3. `reschedule_task` / `move_to_tomorrow` on a task in a Time slot kept `slot_id` / `slot_date` (app:
   `rescheduleDue` → out of the slot). Now it leaves the slot.
4. `projects` showed `target_date` on the user's clock — a western user saw the day before. The app stores
   and reads it as a UTC date; now MCP does too.
5. Found by the rehearsal (run 38583927854, red): my own identifier guard refused digits (`top3`), so every
   task insert failed. Fixed in `3a2ec0ac`; green since.

## Decisions / deviations (Kai to confirm where noted)

- **Deletes for good where the app has no Trash**: `delete_library_item` and `delete_person` delete
  outright, as the app's Remove / Delete do; their descriptions tell the assistant to confirm with the user,
  MCP's `destructiveHint` marks them, and the answer holds everything removed. Adding a Trash to the
  Library / People is a schema + app change — **Kai's call** if wanted.
- **Focus**: a round is a device timer in the app; the server can't start it. `start_focus` writes the
  round's `time_entries` row (note `Focus round (assistant)`, `ended_at` = planned end) and logs
  `project.work_logged` as a finished pomodoro would; `stop_focus` trims it (`project.work_edited`). A
  running server round counts its planned minutes until stopped. `ended_at` is read nowhere else in the app.
- **Activity where the app logs none**: label operations (`label.*`, entity `label`), template rename /
  delete (`template.*`), settings (`settings.updated`), area recolour / description (`area.recolored`,
  `area.updated`) — never task activity, so Slipping is unchanged. An order (`place_before/after`) is not
  logged, as in the app.
- `goal` into a full Top 3 is refused (the app asks before a swap; the assistant asks the user).
- Not offered (not asked, or no app logic to mirror): area merge, "this and following" for a series (end
  it + add a new one, as before), event colour / project / busy, resurfacing marks, Slipping "mark
  reviewed", Paper capture, journal photos (an entry's photos show as a count only).
- `update_settings` refuses a column the server doesn't have yet (the 0058 pattern) instead of sending it.

## Tests

- `npx vitest run` (from `app/`): **160 files, 2219 tests passed**, under `$env:TZ` Africa/Cairo, UTC,
  America/Los_Angeles and Asia/Tokyo (PowerShell). New: `features/settings/mcpFull.test.ts` (34 — the
  gate, every new tool, `streakOf` held to the app's `computeStreak`); `mcp.test.ts` (59) now uses the
  shared fake `features/settings/mcpFake.ts` (test-only; containment + scope guard as index.ts).
- `npm run lint`: 0 errors (21 warnings, none in touched files). `npm run build`: ok. `npm run ds:check --
  --baseline scripts/ds-baseline.json`: 0 new.
- **Rehearsal (CI) `38586866148` — green on `8041e2f0`**: Fresh chain ✓ (deno check every function incl.
  mcp; 0001→0080 from scratch) — fix0-auth 85, sec2 110, notify-prune 12, **mcp-week 158**, **mcp-full
  290**, fix5-search 31, retainer-reload ✓, all 0 failed; Production rehearsal ✓ (0080 applies on
  production's schema). Earlier green run on the first merge: `38584788501`.
- `supabase/tests/mcp-full.sh` (new, in the Fresh chain after mcp-week): the gate on a real stack — a key
  without scopes lists 45 tools and none of the six; each personal tool refused; search / Trash / Activity /
  Inbox filing / move_to_trash / restore / shut_down's line closed; a domain merge leaves the person; no
  journal / people row changed; a scope outside the list refused by the 0080 check (PostgREST 400); scopes
  switched on through PostgREST as the user (204) → 51 tools, A's journal / people readable and writable,
  never B's; switched off → closed again. Then every new tool's SQL with rows read back: task fields, goal
  + ranks, order, bulk, reopen, no-date replan, Trash round trip with blocks, a Time slot in / moved /
  deleted, Inbox list / file as task (AI date + link + block) / event / note / snooze / dismiss / restore /
  Trash, projects / milestones / checklist (task-linked completes) / templates / areas / domains / labels,
  settings, routines + check, focus start/stop, plan_my_day ranks + ritual row, shut_down seed, Library
  progress + delete (the quote unlinked), insights, activity, ownership (A never reaches B's), every row
  `source: mcp`, no error in the function's log, cleanup.
- `supabase/tests/mcp-week.sh`: its tools/list check now asserts the fifteen planning tools are all
  present and no personal tool is (the list grew; nothing weakened).
- Real app, mocked backend (`docs/log/assets/mcp-full/verify.mjs`, 22/22): the switches off for an
  existing key; Journal on → `PATCH mcp_keys?id=eq.… {scopes:["journal"]}`; People on → both; off again;
  New key sends `scopes: []`; no key → no switches; phone 390 day + night, no sideways scroll; no page
  errors. Screenshots beside it.

## Not verified

- No live call from a real assistant (Claude Code / Desktop) against production; no live run at all —
  needs the deploy below.
- How each client renders 51 tools' schemas (all `type: object`; nullable fields use `["string","null"]`,
  as before).

## Deploy (Kai's machine) — in this order

1. `npx supabase db push --include-all` — **0080** (additive). Before it, the function still works (scopes
   read as none) but the app's card would fail to load its key (it selects `scopes`).
2. `npx supabase functions deploy mcp`. Then reconnect the assistant (`/mcp` in Claude Code) so it fetches
   the new tool list (2026-07-28 clients cache it 5 minutes).
3. The app (merge → `master` → Cloudflare builds).
4. The conductor updates the privacy policy text (site/src/pages/info.mjs §2) for the switches.
