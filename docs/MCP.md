# AI assistants (MCP)

Kai's Flow runs a small **MCP server** — the Model Context Protocol that Claude and other AI assistants
use to talk to apps. Connect one and you can ask it "what's on today?", "find the tyre invoice task",
"add *call the bank* for Thursday" or "move the domain renewal to tomorrow" — or hand it your week: "put
deep work on Monday 9–11, the gym Mon/Wed/Fri at 7 and the tax return Thursday at 3". It works on your
real lists and calendar. It's $0: one Supabase edge function (`supabase/functions/mcp`), nothing else.

## Set it up

1. **Make a key.** Settings → **Integrations** → **AI assistants (MCP)** (on the phone it's a card on the
   Settings page). Pick **Read & write** (the assistant can also add, edit, move and tick off tasks, and
   add, edit and delete events) or **Read only** (it can look, never change anything), then **Create key**.
   The key looks like `kf_ai_` + 43 characters and is shown **once** — copy it then. Only its SHA-256
   is stored. **New key** replaces it (the old one stops working at once; that's also how you change
   read/write); **Turn off** deletes it.
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

| Tool | Does | Needs write |
|---|---|---|
| `today` | Your Top 3, open tasks due or scheduled today, overdue tasks, today's events | |
| `search` | Tasks, inbox notes, projects and events by meaning and keywords (the app's hybrid search) | |
| `list_tasks` | Tasks filtered by status (open/done/all), project, label, due range | |
| `get_task` | One task in full: notes, dates, project, labels, repeat, reminder | |
| `calendar` | Events between two days (default: today + 6 days, at most 31): events, Time blocks (`kind: time_block`, with the `tasks` that occurrence holds — Time Slots, 0073; `today` too) and tasks' blocks (`kind: task` + `task_id`); a repeating event once per occurrence, with its series' id; an all-day event as its days | |
| `projects` | Your projects (ids for `list_tasks` / `add_task` / `edit_task`) | |
| `add_task` | A new task: title, optional due, duration, project, Top 3, notes, repeat. A due **time** also blocks the calendar (duration, else 30 min), as typing a time in the app does | ✓ |
| `edit_task` | Title, notes, duration, project, repeat — only what's given; `null` clears | ✓ |
| `reschedule_task` | To a day (09:00, off the calendar) or a day and time (on the calendar there) — the app's replan | ✓ |
| `complete_task` | Ticks an open task off; a repeating task gets its next occurrence, unless it's paused | ✓ |
| `move_to_tomorrow` | Due tomorrow 09:00 — the app's "Tomorrow"; the reminder keeps its lead, a block on another day comes off the calendar | ✓ |
| `add_to_inbox` | A note (and link) into your Inbox to sort later, like a quick capture | ✓ |
| `add_event` | An event or Time block: timed or all-day, optionally repeating | ✓ |
| `edit_event` | Title, kind, time, repeat — of an event, a whole series, or one occurrence on its own | ✓ |
| `delete_event` | An event, one occurrence of a series, or a whole series — to Trash | ✓ |

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
  message the assistant can pass on. `add_task` with `top3: true` and a later due date brings the task to
  today at its own time (as starring does in the app); `move_to_tomorrow` gives a pick's place up.
- **A time puts a task on the calendar; a date alone doesn't** (Kai 2026-10-07, as in Akiflow —
  `features/calendar/replan.ts`). `reschedule_task` to a day and time moves the task's block there,
  keeping its length (else a new one as long as its duration, 30 minutes by default) and takes any other
  block off; to a day alone it's 09:00 that day in that day's list, a block already on that day stays and
  any other comes off. A timed `add_task` gets its block the same way. The task's schedule follows the
  block it ends on.
- **Tomorrow** is that same replan to tomorrow 09:00.
- **Every task write settles like the app's** (`lib/outbox` writeRow): a reminder keeps its lead time when
  the task moves (re-armed when it lands in the future — `lib/carryReminder.ts`), a Top 3 pick moved to a
  later day gives its place up, and a date clears Someday. Blocks taken off the calendar are soft-deleted
  (Trash can bring them back).
- **Repeats** are RRULE bodies on your clock — `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE,FR`,
  `FREQ=MONTHLY;BYMONTHDAY=1`, `FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235959Z` (DAILY to YEARLY,
  INTERVAL, COUNT or UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST; anything else is refused). A task
  repeat on an undated task dates it today 09:00 (the app's `setRecurrence`). An event series must start
  on its rule — its first occurrence is its start; a start the rule skips is refused with the first day
  it would fall on, rather than silently vanish.
- **Events and series** (migration 0061: a series is one row): `edit_event` on a series changes every
  occurrence — its title, kind, repeat, and its time of day and length (the dates of `start`/`end` aren't
  used: the series keeps its days). With `occurrence` (one occurrence's start, as `calendar` lists it)
  only that one changes, to any day and time: the series skips it and it becomes an event of its own
  (linked back by `series_id`, as a drag in the app does). `delete_event` with `occurrence` skips that one
  ("This event"); without it the whole series goes, with any occurrence moved out of it ("All events").
  To change a series from a day on, end it (`UNTIL` in its rule) and add a new one. A task's block is
  the task's: these tools refuse it and point to `reschedule_task`.
- **A paused series** (Perennials ‖) rests until it's resumed: it's in no Today list or Top 3, and
  `complete_task` doesn't make its next copy (nor does notify remind about it).
- **Every write says what it changed** (`changed`: the new due date, the block it placed, the blocks it
  took off, a Top 3 place given up, a moved reminder…) and **is logged** like one made in the app
  (`task.created`, `task.completed`, `task.rescheduled`, `task.scheduled`, `task.updated`, `task.moved`,
  `task.recurrence_set`, `task.starred`, `inbox.captured`, `calendar_event.created` / `.updated` /
  `.deleted`), with `source: "mcp"`, so Slipping, streaks and the digests count it. Changes show up in
  the open app through realtime.
- **Read-only keys** don't even list the nine writing tools, and calling one by name is refused.
- **500 tool calls a day per key** (UTC day). Past that, each call answers "used up for today"; the
  assistant's list of tools still loads.

## Privacy — what an assistant can see

- **Can see:** your tasks (titles, notes, dates, labels, projects), projects, calendar events, and inbox
  notes that come up in a search.
- **Never:** journal entries and people. They aren't behind any tool, and search drops them even though
  the app's own search includes them. (Journal and personal content only ever go to Groq — CLAUDE.md.)
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
  has: per user, hashed at rest, revocable, scoped (read / read & write). Claude Code and Claude Desktop
  (through `mcp-remote`) take a header today. Upgrade path if claude.ai's connector UI is ever needed
  without the header beta: Supabase Auth's OAuth 2.1 server + a `/oauth/consent` page, the function then
  accepting those tokens through `_shared/auth.ts`'s `requireUser`.
- **Running as the user without a JWT:** a key holder has no Supabase session and functions get no
  signing secret, so the function can't forward or mint a user token. Instead each request is one
  transaction on the function's database connection: it finds the key (and counts a tool call) as the
  table owner, then sets role `authenticated` and `request.jwt.claims = {sub: <you>}` — exactly what the
  Data API does for a signed-in request — checks that took, and only then runs the tool.

### Errors

| Answer | Meaning |
|---|---|
| `401 {"error":"mcp_key_required"}` | No `Authorization: Bearer …` header |
| `401 {"error":"mcp_key_invalid"}` | Not a `kf_ai_…` key, or a replaced / turned-off one |
| `403` | A browser page from an origin the app doesn't own |
| `405` | Not a POST |
| `400` JSON-RPC `-32700` / `-32600` | Not JSON / not one JSON-RPC message (batches aren't taken) |
| `400` `-32020` / `-32022` / `-32602` | 2026-07-28 clients: headers don't match the body / unsupported version / missing `_meta` |
| tool result with `isError: true` | A bad argument, a full Top 3, an unknown id, the daily limit — plain words the assistant can act on |

### Try it with curl

```sh
curl -s -X POST https://<project>.supabase.co/functions/v1/mcp \
  -H "Authorization: Bearer kf_ai_…" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"today","arguments":{}}}'
```

## For the developer

- Code: `supabase/functions/mcp/server.ts` (protocol), `tools.ts` (tools, zone math, the replan and
  series rules), `index.ts` (SQL as the user). The first two are pure and tested from
  `app/src/features/settings/mcp.test.ts` against an in-memory Store; `index.ts` needs Deno and a
  database (CI's `deno check` covers its types). Shared: `_shared/zone.ts` (the user's clock),
  `_shared/today.ts` (Top 3), `_shared/repeat.ts` (task repeats), `_shared/series.ts` (event series).
- Schema: `mcp_keys` (migration 0051, docs/DATA_MODEL.md). Config: `[functions.mcp] verify_jwt = false`.
  The release pipeline deploys `mcp`; it needs no secret of its own (`SUPABASE_DB_URL` is built in).
- App: `features/settings/mcpKey.ts` (key + snippets) and the `McpCard` in `SettingsPage.tsx`.
