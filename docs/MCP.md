# AI assistants (MCP)

Kai's Flow runs a small **MCP server** — the Model Context Protocol that Claude and other AI assistants
use to talk to apps. Connect one and you can ask it "what's on today?", "find the tyre invoice task",
"add *call the bank* for Thursday" or "move the domain renewal to tomorrow" — or hand it your week: "put
deep work on Monday 9–11, the gym Mon/Wed/Fri at 7 and the tax return Thursday at 3". Since 2026-10-14
(Kai: "build full mcp functions, I want to be able to tell any ai to do anything") it reaches every area
of the app: tasks in full, the Inbox's triage, projects / areas / domains / labels, the calendar's Time
slots and reminders, routines, focus rounds, the two rituals, the Library, Trash, insights and the safe
settings — and, only when you switch them on for a key, your journal and the people you keep. It works on
your real data, with the app's own rules. It's $0: one Supabase edge function (`supabase/functions/mcp`),
nothing else.

## Set it up

1. **Make a key.** Settings → **Integrations** → **AI assistants (MCP)** (on the phone it's a card on the
   Settings page). Pick **Read & write** (the assistant can also add, change, tick off and delete — to
   Trash — for you) or **Read only** (it can look, never change anything), then **Create key**.
   The key looks like `kf_ai_` + 43 characters and is shown **once** — copy it then. Only its SHA-256
   is stored. **New key** replaces it (the old one stops working at once; that's also how you change
   read/write); **Turn off** deletes it.
   - **Journal** and **People** (two switches under the key, both **off** for every key, a new one
     included): switch one on and that key may also read and write your journal entries, or the people
     you keep and your notes about them. Off, the assistant can't see them at all — not as tools, not in
     search, Trash or Activity (see Privacy). The switch takes effect on the assistant's next call.
2. **Give it to your assistant.** Right after you make the key, the card's **Connect an assistant**
   section shows each setup below with your key filled in, with a copy button.

The server address is `https://<project>.supabase.co/functions/v1/mcp` (the card has **Copy server
address**). The key always goes in the `Authorization` header, never in the address.

### Claude Code

One command in a terminal:

```sh
claude mcp add --transport http kais-flow https://<project>.supabase.co/functions/v1/mcp --header "Authorization: Bearer kf_ai_…"
```

`claude mcp list` (or `/mcp` inside Claude Code) should show `kais-flow` as connected.

### Claude Desktop

Claude Desktop's own **Add custom connector** only signs in with OAuth, so a key goes through the
`mcp-remote` bridge (needs Node.js). Settings → **Developer** → **Edit Config**, and add to
`claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`):

```json
{
  "mcpServers": {
    "kais-flow": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<project>.supabase.co/functions/v1/mcp", "--header", "Authorization:${KF_AUTH}"],
      "env": { "KF_AUTH": "Bearer kf_ai_…" }
    }
  }
}
```

Restart Claude Desktop. (`Authorization:${KF_AUTH}` with the space inside `env` is on purpose: Claude
Desktop on Windows doesn't quote arguments that contain spaces.)

### claude.ai (web) custom connector

If your claude.ai account shows **Request headers** in **Customize → Connectors → Add custom connector**
(Anthropic's beta, not on every account): server URL = the address, Authentication = **No sign-in**,
Request header `authorization` = `Bearer kf_ai_…`. Without that section, use Claude Desktop or Claude
Code.

### Any other MCP client

Anything that speaks remote MCP over Streamable HTTP with a custom header (Cursor, VS Code, …):

```json
{ "mcpServers": { "kais-flow": { "type": "http", "url": "https://<project>.supabase.co/functions/v1/mcp", "headers": { "Authorization": "Bearer kf_ai_…" } } } }
```

## The tools

51 tools: 45 for every key (the writers only for a Read & write key), plus 6 for the journal and people
that a key lists only when its owner switched them on. A tool that takes `id` also takes `ids` (a list,
at most 50) where it says *bulk*: the same change on each, as the app's bulk bar does — a refusal for one
(say, an already-done task) is reported in `failed` and the rest go ahead.

### Your day, tasks and the calendar

| Tool | Does | Write |
|---|---|---|
| `today` | Top 3 (the goal of the day first), open tasks due or scheduled today, overdue, today's events, and whether Plan my day / Shut down were done today (with last night's seeds) | |
| `search` | Tasks, Inbox notes, projects, areas, events and the Library by meaning and keywords (+ journal / people for a key allowed them) | |
| `list_tasks` | Tasks by status (open/done/all), project, area, label, Someday, due range | |
| `get_task` | One task in full: notes, dates, block or Time slot, project / area / domain, labels, priority, repeat, reminder, link | |
| `add_task` | A new task: title, due, duration, project **or** area, Top 3, notes, repeat, labels, priority (1 critical · 2 high · 3 medium), `remind_at`, Someday, `parent_id` (a subtask, one level). A due **time** also blocks the calendar | ✓ |
| `edit_task` | *Bulk.* Any field: title, notes, duration, labels (the whole list), priority, repeat, `remind_at`, Someday, `paused`, `top3`, `goal` (the goal of the day), where it lives (`project_id` / `area_id` / `domain_id`), a Time slot (`slot_id` + `slot_occurrence`; null = out), its place in a list (`place_before` / `place_after`) | ✓ |
| `reschedule_task` | *Bulk.* To a day (09:00, off the calendar), a day and time (on the calendar there), or `null` (no date, every block off) — the app's replan | ✓ |
| `complete_task` / `reopen_task` | *Bulk.* Tick off (a repeat's next copy comes, unless paused) / open again | ✓ |
| `move_to_tomorrow` | *Bulk.* Due tomorrow 09:00, the app's "Tomorrow" | ✓ |
| `calendar` | Events between two days (at most 31): events, Time blocks with the tasks each occurrence holds, tasks' blocks; a series once per occurrence; `remind_min` | |
| `add_event` | An event or Time block: timed or all-day, optionally repeating, optionally reminding (`remind_min`, timed only) | ✓ |
| `edit_event` | Title, kind, time, repeat, reminder — of an event, a whole series, or one occurrence on its own. A Time block moved takes the tasks it holds along | ✓ |
| `delete_event` | An event, one occurrence, or a whole series — to Trash. A Time block lets its tasks go (back unscheduled) | ✓ |

### The Inbox

| Tool | Does | Write |
|---|---|---|
| `inbox` | The captures waiting to be sorted (or snoozed / dismissed / filed / all), newest first, with the AI's suggested title | |
| `add_to_inbox` | A note (and link) into the Inbox, like a quick capture | ✓ |
| `file_inbox_item` | Sort one: as a **task** (the AI's date applies when none is given; a time puts it on the calendar; its link rides along), an **event**, a Library **note**, into today's **journal** (journal key), or onto a **person** (people key) | ✓ |
| `update_inbox_item` | *Bulk.* Dismiss, snooze until a day or time, unsnooze, restore a dismissed one | ✓ |

### Projects, areas, domains, labels

| Tool | Does | Write |
|---|---|---|
| `projects` | Projects (status, type, target, domain), areas, domains, and the checklist templates — the ids for everything else | |
| `get_project` | One project: milestones, checklist (a task-linked line reads done when its task is), open tasks | |
| `save_project` | Create (no id) or change: name, domain (its tasks move with it), type standard / retainer, status active / archived (Finish), colour, target date, engagement | ✓ |
| `update_milestone` | Add, rename, reweigh, complete, reopen, remove | ✓ |
| `update_checklist` | Add a line (one-shot, or task-linked — a real task in the project), rename, check / uncheck (a linked line completes / reopens its task), remove | ✓ |
| `checklist_template` | Save a project's checklist as a template, use one on a project (task-linked items become tasks there), rename, delete | ✓ |
| `save_area` / `save_domain` | Create or change (a new domain takes the area's tasks along); `save_domain` with `merge_into` merges one domain into another (then to Trash) | ✓ |
| `labels` | Every label, its count and colour | |
| `update_label` | Create (with a colour), recolour, rename (onto an existing name: a merge), merge, delete — across every task | ✓ |

### Trash and settings

| Tool | Does | Write |
|---|---|---|
| `trash` | What's in Trash, newest first | |
| `move_to_trash` | *Bulk.* Tasks (their blocks too), Inbox items, projects, areas, domains (+ journal entries for a journal key). Events: `delete_event` | ✓ |
| `restore_from_trash` | *Bulk.* Any of those back (a task with its blocks; an event re-links its task) | ✓ |
| `settings` | Time zone, weekend, calendar view, the slipping threshold, names, the notification switches, times and quiet hours | |
| `update_settings` | Those, and pausing notifications until a time. Never keys, tokens or connections | ✓ |

### Routines, focus, rituals

| Tool | Does | Write |
|---|---|---|
| `routines` | Days, time, steps with minutes, done today, the streak (the app's: one missed day a month is forgiven), goal, challenge | |
| `save_routine` | Create or change; `active: false` archives (true brings it back) | ✓ |
| `check_routine` | Tick today (or a past day), or take the tick back | ✓ |
| `start_focus` / `stop_focus` | A focus round on a task, logged as its time (and its project's) from the start; stopping keeps what was spent, and can tick the task off | ✓ |
| `plan_my_day` | The morning ritual's Start the day: carry overdue tasks to today / tomorrow / Someday, make the Top 3 (in order, the first the goal), mark the ritual done | ✓ |
| `shut_down` | The evening's Close the day: roll tasks to tomorrow, plant tomorrow's 3 (seeds), a journal line (journal key), mark the ritual done | ✓ |

### Library, insights

| Tool | Does | Write |
|---|---|---|
| `library` | Books (with progress), notes, quotes; `query` narrows | |
| `save_library_item` | Add or change a book (progress past the last page finishes it), note or quote | ✓ |
| `delete_library_item` | Remove one **for good** — the Library has no Trash (as in the app); the answer holds the row so it can be added back. The only tool besides `delete_person` marked `destructiveHint` | ✓ |
| `insights` | This week so far (done, added, focus minutes, routine check-ins, captures — from the day after the weekend), what's Slipping, every routine's streak | |
| `activity` | The activity log, newest first, by type or prefix and since a day | |

### Journal and people (only for a key with that switch on)

| Tool | Does | Write |
|---|---|---|
| `journal` | Entries, newest first (last 14 days by default, or a range, or a query), with mood and gratitude | |
| `save_journal_entry` | Write a new entry (today unless `date`) or change one; the day's mood and gratitude ride on its first entry. Delete: `move_to_trash` | ✓ |
| `people` | The people you keep, their facts and when you last spoke; one person with their interactions | |
| `save_person` | Add or change a person: name, facts (a Birthday fact with `date` MM-DD), domain | ✓ |
| `log_interaction` | Note a call / meeting / message with someone (or change one) | ✓ |
| `delete_person` | A person and their interactions, or one interaction — **for good** (People has no Trash); the answer holds them | ✓ |

### Examples

What a user can now say, and what the assistant calls:

- "Make the tax return my goal today and push everything else overdue to tomorrow" → `plan_my_day {carry: [{id, to: "tomorrow"}, …], top3: [<tax return>]}`.
- "Label these three *money* and make them high priority" → `edit_task {ids: [a, b, c], labels: ["money"], priority: 2}`.
- "Put *write the report* into my Deep work block on Thursday" → `calendar` (find the block) → `edit_task {id, slot_id: <block>, slot_occurrence: "2026-10-15T09:00"}`.
- "File everything in my Inbox that has a date as a task" → `inbox` → `file_inbox_item {id, as: "task"}` for each.
- "Archive the Shaheen project and delete the old Errands area" → `save_project {id, status: "archived"}`, `move_to_trash {type: "area", id}`.
- "I did my stretches" → `routines` → `check_routine {id}`.
- "Start a 50-minute focus round on the slides" → `start_focus {task_id, minutes: 50}`.
- "How did my week go? What's slipping?" → `insights`.
- "Turn off the evening nudge and set my weekend to Friday and Saturday" → `update_settings {evening_nudge_on: false, weekend_days: ["fri", "sat"]}`.
- "Undo — bring that task back" → `trash` → `restore_from_trash {type: "task", id}`.
- With Journal on: "Write in my journal that today was calm" → `save_journal_entry {body: "Today was calm."}`.

```sh
curl -s -X POST https://<project>.supabase.co/functions/v1/mcp \
  -H "Authorization: Bearer kf_ai_…" -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"edit_task","arguments":{"id":"<task id>","goal":true}}}'
```

Same rules as the app:

- **Your clock.** Every time an assistant sees or sends is wall-clock in your time zone
  (Settings → Timezone; Cairo when unset), and every result names it. A date without a time
  (`2026-10-08`) means 09:00 that day; `2026-10-08T15:30` means 15:30 on your clock.
- **Today** is the Today list's rules: Top 3 picks (the goal of the day first — `top3_rank`), then anything
  due or scheduled today, then anything dated before today. Someday tasks never (since 2026-10-12; they
  used to show when starred), nor a paused series.
- **Top 3** is today's (the app's `features/tasks/top3Rule.ts`, restated in
  `supabase/functions/_shared/today.ts`): a pick counts while it is undated or dated today or earlier, and
  never when it's someday, paused, in Trash, done or cancelled. It holds 3 such picks — a fourth is refused with a
  message the assistant can pass on (the app asks before a swap; the assistant asks the user). Starring (`add_task` / `edit_task` `top3`, `goal`,
  `plan_my_day`) a task dated a later day brings it to today at its own time, and takes it out of Someday.
  `goal` makes it first (`top3_rank` 1) and renumbers the other picks behind it (`task.goal_set`).
  `move_to_tomorrow` gives a pick's place up.
- **A time puts a task on the calendar; a date alone doesn't** (Kai 2026-10-07, as in Akiflow —
  `features/calendar/replan.ts`). `reschedule_task` to a day and time moves the task's block there,
  keeping its length (else a new one as long as its duration, 30 minutes by default) and takes any other
  block off; to a day alone it's 09:00 that day in that day's list, a block already on that day stays and
  any other comes off; to `null` every block comes off. A timed `add_task` gets its block the same way. The task's schedule follows the
  block it ends on, and a replanned task leaves its Time slot.
- **Time slots** (0073): a Time block holds tasks. `edit_task slot_id` puts a task into one occurrence
  (its own block comes off; a missed due date follows); `slot_id: null` takes it out, unscheduled. Moving
  the block moves its tasks; deleting it lets them go.
- **Tomorrow** is that same replan to tomorrow 09:00.
- **Every task write settles like the app's** (`lib/outbox` writeRow): a reminder keeps its lead time when
  the task moves (re-armed when it lands in the future — `lib/carryReminder.ts`), a Top 3 pick moved to a
  later day (or to Someday, or to Trash) gives its place up, and a date clears Someday. Blocks taken off the calendar are soft-deleted
  (Trash can bring them back).
- **A task lives in one place** (0052): a project (its domain with it), an area (its domain with it) or a
  domain alone; a milestone stays only in its own project. A project or area moved to another domain takes
  its tasks along.
- **Order** (0076): `place_before` / `place_after` give the task a key between its neighbour and the next
  task on that side, on the dates' scale — so it sits there in every list holding both. As in the app, an
  order isn't logged.
- **Repeats** are RRULE bodies on your clock — `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE,FR`,
  `FREQ=MONTHLY;BYMONTHDAY=1`, `FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235959Z` (DAILY to YEARLY,
  INTERVAL, COUNT or UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST; anything else is refused). A task
  repeat on an undated task dates it today 09:00 (the app's `setRecurrence`). An event series must start
  on its rule — its first occurrence is its start; a start the rule skips is refused with the first day
  it would fall on, rather than silently vanish.
- **Events and series** (migration 0061: a series is one row): `edit_event` on a series changes every
  occurrence — its title, kind, repeat, reminder, and its time of day and length (the dates of `start`/`end` aren't
  used: the series keeps its days). With `occurrence` (one occurrence's start, as `calendar` lists it)
  only that one changes, to any day and time: the series skips it and it becomes an event of its own
  (linked back by `series_id`, as a drag in the app does). `delete_event` with `occurrence` skips that one
  ("This event"); without it the whole series goes, with any occurrence moved out of it ("All events").
  To change a series from a day on, end it (`UNTIL` in its rule) and add a new one. A task's block is
  the task's: these tools refuse it and point to `reschedule_task`. `remind_min` (0077) is an offset, so it
  follows a moved event and every occurrence; never on an all-day event.
- **A paused series** (Perennials ‖) rests until it's resumed (`edit_task paused: false`): it's in no Today list or Top 3, and
  `complete_task` doesn't make its next copy (nor does notify remind about it).
- **Deletes go to Trash** wherever the app has one — tasks (with their blocks), events, Inbox items,
  projects, areas, domains, journal entries — for 30 days, and `restore_from_trash` brings them back. The
  Library and People have no Trash in the app either: `delete_library_item` and `delete_person` delete for
  good (their tool descriptions say to confirm with the user first; MCP's `destructiveHint` marks them) and
  answer with everything they removed. A routine is archived, never deleted.
- **The rituals** are the app's Loop B: `plan_my_day` and `shut_down` write the same `ritual.step_completed`
  / `ritual.finished` / `ritual.seeded` / `ritual.unseeded` rows the sheets write, on the loop day (04:00
  rollover — a Shut down at 00:30 still closes the day you lived), so Today's Day card shows them done.
- **Focus** rounds are a device timer in the app; what the server sees is the round's time entry. So
  `start_focus` logs the round on the task (and its project) from now for its length — as a finished
  pomodoro would — and `stop_focus` trims it to what was spent. A device's Focus timer doesn't start.
- **Every write says what it changed** (`changed`, or what it `added` / `saved` / `filed` / `deleted`)
  and **is logged** like one made in the app (`task.*`, `inbox.*`, `calendar_event.*`, `project.*`,
  `area.*`, `domain.*`, `routine.*`, `book.*` / `note.*` / `quote.*`, `journal.*`, `people.*`, `ritual.*`),
  with `source: "mcp"`, so Slipping, streaks and the digests count it. Where the app writes no activity row
  (a label rename across tasks, a settings change) MCP writes one on its own entity (`label.*`,
  `settings.updated`) — never as task activity, so Slipping isn't fooled. Changes show up in the open
  app through realtime.
- **Read-only keys** don't even list the writing tools, and calling one by name is refused.
- **500 tool calls a day per key** (UTC day). Past that, each call answers "used up for today"; the
  assistant's list of tools still loads.

## Privacy — what an assistant can see

- **Can see:** your tasks (titles, notes, dates, labels, projects), projects, areas, domains, calendar
  events (your own, never Google's), Inbox captures, routines, focus time, the Library (books, notes,
  quotes), Trash, Activity and the settings listed above.
- **Only with its switch on:** your **journal** (entries, their mood and gratitude — photos only as a
  count) and **people** (people, their facts and interactions). A key starts with both off
  (`mcp_keys.scopes`, migration 0080). Off, the key doesn't list their tools, and every other way in is
  closed too: search drops journal entries and people, Trash hides trashed entries, Activity hides
  journal / people events (and birthday notices), filing an Inbox capture to the journal or a person is
  refused, `shut_down`'s journal line is refused, a domain merge leaves people where they were — and the
  function itself refuses those tables to the key, so no tool can reach them by mistake. (Journal and
  personal content only ever go to Groq — CLAUDE.md; switching one on sends what that assistant reads to
  its provider — see below.)
- **Never:** keys, tokens, Google / GitHub connections, the app's internal state, Google-synced events.
- **Where it goes:** whatever a tool returns is read by the assistant you connected, so that assistant's
  provider and its data policy see it. Connect only assistants you trust with your task list, and pick
  **Read only** if it should never change anything.
- **Revoke any time:** **Turn off** (or **New key**) in the card. The very next call from that assistant
  gets `401`; nothing is cached on our side.
- **Every call runs as you.** The server never uses an admin key for your data: each request is one
  database transaction that switches to your own signed-in role, so the same row-level security that
  guards the app guards the assistant — it cannot see anyone else's data even through a bug in a tool.

## How it works

- **Transport:** MCP Streamable HTTP, **stateless** — every POST stands alone, the reply is one
  `application/json` body, no session id, no SSE. It speaks both protocol eras: clients that open with
  `initialize` (protocol 2025-03-26 to 2025-11-25) and 2026-07-28 clients that send `_meta` and the
  `Mcp-Method` / `Mcp-Name` / `MCP-Protocol-Version` headers on every request (checked against the body;
  `server/discover` answers too). Tools only — no resources or prompts. `GET`/`DELETE` → 405.
- **Auth: a personal key, not OAuth.** MCP's own spec prefers OAuth 2.1, and Supabase Auth can act as an
  OAuth server, but that needs a consent screen in the app, dynamic client registration and dashboard
  setup — far more surface than this feature. A key is the capture key's model (0041) the app already
  has: per user, hashed at rest, revocable, scoped (read / read & write, plus the journal / people switches — 0080). Claude Code and Claude Desktop
  (through `mcp-remote`) take a header today. Upgrade path if claude.ai's connector UI is ever needed
  without the header beta: Supabase Auth's OAuth 2.1 server + a `/oauth/consent` page, the function then
  accepting those tokens through `_shared/auth.ts`'s `requireUser`.
- **Running as the user without a JWT:** a key holder has no Supabase session and functions get no
  signing secret, so the function can't forward or mint a user token. Instead each request is one
  transaction on the function's database connection: it finds the key (and counts a tool call) as the
  table owner, then sets role `authenticated` and `request.jwt.claims = {sub: <you>}` — exactly what the
  Data API does for a signed-in request — checks that took, and only then runs the tool. The key's `scopes` come with it (read through `to_jsonb`, so a database without 0080 reads as none) and decide which tools it lists and which tables it reaches.

### Errors

| Answer | Meaning |
|---|---|
| `401 {"error":"mcp_key_required"}` | No `Authorization: Bearer …` header |
| `401 {"error":"mcp_key_invalid"}` | Not a `kf_ai_…` key, or a replaced / turned-off one |
| `403` | A browser page from an origin the app doesn't own |
| `405` | Not a POST |
| `400` JSON-RPC `-32700` / `-32600` | Not JSON / not one JSON-RPC message (batches aren't taken) |
| `400` `-32020` / `-32022` / `-32602` | 2026-07-28 clients: headers don't match the body / unsupported version / missing `_meta` |
| tool result with `isError: true` | A bad argument, a full Top 3, an unknown id, the daily limit, a journal / people tool or table this key wasn't allowed — plain words the assistant can act on |

### Try it with curl

```sh
curl -s -X POST https://<project>.supabase.co/functions/v1/mcp \
  -H "Authorization: Bearer kf_ai_…" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"today","arguments":{}}}'
```

## For the developer

- Code: `supabase/functions/mcp/server.ts` (protocol, the registry and its scope gate), `tools.ts` (the
  Store, argument checks, zone math, the replan and series rules, the task / calendar / inbox tools),
  `organize.ts` (projects, areas, domains, labels, Trash, settings, the Inbox's triage), `life.ts`
  (routines, focus, rituals, Library, insights, activity), `personal.ts` (journal, people — each tool
  carries its `scope`), `index.ts` (SQL as the user). All but `index.ts` are pure and tested from
  `app/src/features/settings/mcp.test.ts` and `mcpFull.test.ts` against the in-memory Store in
  `mcpFake.ts`; `index.ts` needs Deno and a database: CI's `deno check` covers its types and
  `supabase/tests/mcp-week.sh` + `mcp-full.sh` run every tool's SQL on a real stack (Rehearsal → Fresh chain).
- The Store: a few specific queries (today's tasks, lists, search, Trash, activity, the week) plus four
  generic ones — `find` / `insert` / `patch` / `remove` on a fixed list of tables, matching by JSON
  containment on the row and writing through `jsonb_populate_record` (Postgres converts every value to
  its column's type). Table and column names only ever come from the tools' own code; the journal /
  people tables are refused to a key without their scope. Shared: `_shared/zone.ts` (the user's clock),
  `_shared/today.ts` (Top 3), `_shared/repeat.ts` (task repeats), `_shared/series.ts` (event series).
- Schema: `mcp_keys` (migration 0051; `scopes` 0080 — docs/DATA_MODEL.md). Config: `[functions.mcp] verify_jwt = false`.
  The release pipeline deploys `mcp`; it needs no secret of its own (`SUPABASE_DB_URL` is built in).
- App: `features/settings/mcpKey.ts` (key, the Journal / People switches, snippets) and the `McpCard` in `SettingsPage.tsx`.
