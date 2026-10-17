---
date: 2026-10-17
session: smart-lists (builder, worktree .claude/worktrees/smart-lists, branch claude/smart-lists from claude/kai-bugs-1012)
type: handoff
---

# 2026-10-17 13:45 · handoff · smart-lists

Kai: *"build smart lists"*. Built on `claude/smart-lists` and pushed. Not merged, no PR. **One
migration: 0081** (snooze has 0082).

Todoist filters / TickTick smart lists: save a view such as "work tasks under 30 min this week" and open
it from the sidebar. Plain chips, no query language.

## What Kai sees

- **Make one.** On the Tasks page, beside the domain chips: **＋ Save as smart list**. It opens the
  editor already set to what the page shows (the tab's days, the domain chip, the label filter). Or
  **＋ New smart list** at the end of the sidebar's Plan group (an empty editor).
- **The editor** (a card on a computer, a sheet on the phone): a name, then chip groups. Every group is
  optional, all of them have to hold, and inside a group any pick will do:
  Where (domains, areas, projects) · Labels · When (Overdue, Today, This week, Next 7 days, No date,
  Someday) · Priority at least (! / !! / !!!) · Length (≤ 15 / 30 / 60 min, No length) · On the
  calendar (Planned / Not planned) · Text contains · Show done tasks too. A live line says how many open
  tasks match. Saving a new one opens it.
- **Use it.** Each list sits in the Plan group under Someday, with its open count, like the fixed
  lists. A click opens `/tasks?list=<id>` (survives a reload): its name as the title, its conditions in
  plain words under the tabs ("Career · Overdue or Today · ≤ 30 min"), the rows grouped as usual, done
  ones last under **Done** when the list shows them. The domain chips and the label filter still narrow
  it further. On the phone the lists are at the end of the Tasks strip (where This Week / This Month
  are), and **Edit smart list** replaces "Save as smart list" while one is open.
- **Change it.** ⋯ (on hover) or right-click on a sidebar list: **Edit… · Rename** (in place) **· Move
  up / Move down · Delete** (gone at once, "Deleted “…”" with Undo, no confirm). The phone edits and
  deletes from the editor sheet.

## The rules (one file, shared with the MCP)

`supabase/functions/_shared/smartList.ts` (pure, the `_shared/today.ts` pattern):

- Open tasks only unless Show done; never cancelled, paused (a resting series) or in Trash.
- A **Someday** task only when When picks Someday (it's parked everywhere else, as on every fixed list).
- Where: the task's project, area, or domain; a domain counts the task's own or its container's
  (`grouping.ts effectiveDomainId`, moved there from TasksPage so the page, sidebar and editor agree).
- When, on the user's clock (`appZone()` in the app, `ctx.zone` in the MCP): a task's day is its due
  date, else its block. Overdue = before today. Today = today, or blocked today. This week = Monday to
  Sunday of this week (the app's weeks start Monday). Next 7 days = today + 6. No date = neither.
- Length ≤ N needs a length set; "No length" = none. Planned = it has a calendar block.
- `readFilter` is the one schema: a stored filter with anything malformed dropped, never thrown. It is
  hand-written, not Zod, because `mcp/tools.ts` may not import npm packages (it runs under the app's
  vitest); the app and the MCP both call it.
- `describeFilter`: the plain words for the caption and the MCP.

Tests: `app/src/features/smart-lists/filter.test.ts` (15): the reader, each condition, combinations, and
"when" across Cairo / UTC / Los Angeles / Tokyo with an explicit zone (Fri 00:30 in Cairo is still
Thursday in UTC; a Sunday in LA; a Monday in Tokyo).

## Storage

`supabase/migrations/0081_smart_lists.sql`: `smart_lists (id, user_id, name 1–80, icon, filter jsonb,
position, deleted_at, created_at, updated_at)`, owner RLS (using + with check), the `set_updated_at`
trigger, explicit grants to `authenticated` (new tables aren't auto-exposed), in the
`supabase_realtime` publication (`lib/realtime.ts` subscribes). Delete is soft so the Undo and other
devices (Realtime) see it; the rows never reach Trash and aren't composted (a saved view; a handful of
tiny rows). No activity_log events: a saved view, not something that happened. Writes go through the
outbox (`features/smart-lists/api.ts`); the query is `['smart_lists']`, persisted like `areas`.
`docs/DATA_MODEL.md` has the row.

## MCP (54 tools: 48 for every key + 6 personal)

- `smart_lists` (read): each live list in sidebar order — id, name, icon when set, `conditions` in plain
  words, the stored `filter`, `open` count now.
- `list_tasks` gains `smart_list` (id or name, any case): the list's own conditions over every row of
  the status asked (default: open, or all when the list shows done ones), combined with the other
  filters, then `limit`. Unknown → "No smart list "…". The smart_lists tool lists them."
- `index.ts`: `smart_lists` is reachable by the generic reads. Read-only — no write tool (Kai makes and
  changes lists in the app), so no jsonb write path.
- Tests: `mcp.test.ts` tool lists; `mcpFull.test.ts` "MCP full: smart lists" (2); `mcp-full.sh` counts
  48 / 54 and a list made through PostgREST (proves the grants + RLS), read back, invisible to the other
  user's key. `docs/MCP.md` updated.

## Gate

In `app/`:

- `npx tsc -b`: clean.
- `npx vitest run` ×4 (PowerShell `$env:TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo):
  **166 files, 2300 tests passed** in each.
- `npm run lint` (oxlint): **0 errors** (24 warnings, none in these files).
- `npm run build`: passes. Entry chunk **362.67 kB / 115.42 kB gzip** (before: 362.28 / 115.30). The
  sidebar rows are their own chunk (`SmartListNav` 5.3 kB, lazy in AppLayout; they first made the entry
  370 kB), the editor too (`SmartListEditor` 5.6 kB). TasksPage 26.6 → 29.3 kB.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new** (5 fixed since).
- `grep -c birthday_on app/src/lib/types.ts` = 1; `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.
- `deno check`, the local migration and `supabase/tests/mcp-full.sh`: **not run — no Deno, Supabase CLI
  or Docker on this machine.** The release rehearsal applies 0081 to a fresh chain.

Harnesses (mock backend, `npx vite --port 5292 --mode mock`, http://localhost:5292):

| harness | result |
|---|---|
| **smart-lists** (new) | **41/41** (first full run 40/41: e9 read the sidebar before the now-lazy rows loaded — the harness waits for them; alone after the fix 41/41) |
| labels | 73/73 |
| tasks-noise | 202/202 |
| fix-tasks | 70/70 |
| manual-order | 25/25 |
| desktop-polish | 150/150 after one fix: its project menu expectation predated dup-open's **Duplicate** (148/150 before, both day/night on that line; not this change) |
| phone-polish | 718/718 |

Screenshots in `docs/log/assets/smart-lists/` (editor day/night, made list, menu, show done, deleted,
phone strip + edit sheet day/night).

## Not done / for Kai

- **No icon picker.** The `icon` column exists (shown in the 16px slot when set); the fixed lists carry
  no icons, so the editor doesn't ask. Add a picker if Kai wants emoji lists.
- **Phone:** no Move up / down or in-place Rename (the sidebar is the computer's); the sheet edits the
  name and deletes.
- Not verified on a real database here: **no Supabase CLI, Docker or Deno on this machine**, so the
  migration wasn't applied locally, `mcp-full.sh` wasn't run and `deno check` wasn't run. The release
  rehearsal applies 0081 to a fresh chain; `mcp-full.sh` covers the grants/RLS once a stack is up.
- The data-export builder: `smart_lists` is a new user table, if export lists tables by name.
- Out of scope, one line each: a smart list as the calendar rail's scope (`filterByScope`); sort order
  saved with a list.
