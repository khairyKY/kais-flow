# AI assistants (MCP)

Kai's Flow runs a small **MCP server** — the Model Context Protocol that Claude and other AI assistants
use to talk to apps. Connect one and you can ask it "what's on today?", "find the tyre invoice task",
"add *call the bank* for Thursday" or "move the domain renewal to tomorrow", and it works on your real
lists. It's $0: one Supabase edge function (`supabase/functions/mcp`), nothing else.

## Set it up

1. **Make a key.** Settings → **Integrations** → **AI assistants (MCP)** (on the phone it's a card on the
   Settings page). Pick **Read & write** (the assistant can also add and tick off tasks) or **Read
   only** (it can look, never change anything), then **Create key**.
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
| `calendar` | Events between two days (default: today + 6 days, at most 31) | |
| `projects` | Your projects (ids for `list_tasks` / `add_task`) | |
| `add_task` | A new task: title, optional due, project, Top 3, notes | ✓ |
| `complete_task` | Ticks an open task off; a repeating task gets its next occurrence | ✓ |
| `move_to_tomorrow` | Due tomorrow 09:00 — the app's "Tomorrow" | ✓ |
| `add_to_inbox` | A note (and link) into your Inbox to sort later, like a quick capture | ✓ |

Same rules as the app:

- **Your clock.** Every time an assistant sees or sends is wall-clock in your time zone
  (Settings → Timezone; Cairo when unset), and every result names it. A date without a time
  (`2026-10-08`) means 09:00 that day; `2026-10-08T15:30` means 15:30 on your clock.
- **Today** is the Today list's rules: Top 3 picks, then anything due or scheduled today, then anything
  dated before today (someday tasks only when starred).
- **Top 3** holds 3 open picks — a fourth is refused with a message the assistant can pass on.
- **Every change is logged** like one made in the app (`task.created`, `task.completed`,
  `task.rescheduled`, `inbox.captured`, `task.starred`), with `source: "mcp"`, so Slipping, streaks and
  the digests count it. Changes show up in the open app through realtime.
- **Read-only keys** don't even list the four writing tools, and calling one by name is refused.
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

- Code: `supabase/functions/mcp/server.ts` (protocol), `tools.ts` (tools, zone math), `index.ts` (SQL
  as the user). The first two are pure and tested from `app/src/features/settings/mcp.test.ts`;
  `index.ts` needs Deno and a database.
- Schema: `mcp_keys` (migration 0050, docs/DATA_MODEL.md). Config: `[functions.mcp] verify_jwt = false`.
  The release pipeline deploys `mcp`; it needs no secret of its own (`SUPABASE_DB_URL` is built in).
- App: `features/settings/mcpKey.ts` (key + snippets) and the `McpCard` in `SettingsPage.tsx`.
