# 2026-10-29 23:30 · handoff · widget-feed: Widget links + the desktop widget feed

Branch `claude/widget-feed` (from `claude/kai-bugs-1012`). Not merged, not released.

The DATA side of the Windows desktop widgets. The look comes later (a designer is drawing Rainmeter "Glass"
skins). Kai's current Glass widgets read Kai's Flow through `kais-flow-export.ps1`, which uses the
**service-role key**. This replaces it with a per-user, read-only **Widget link**: a token in a URL, pasted
into a skin. It's the same pattern as Sukoon's Widget link (read from `Glass\Sukoon\Sukoon.ini` + `@Resources\sukoon.lua`:
WebParser fetches the URL, `RegExp=(?s)^(.*)$`, a Lua script parses the body and treats `"error"` as a bad link).

## What's built

| Piece | Where |
|---|---|
| Migration **0090** `widget_links` | `supabase/migrations/0090_widget_links.sql`. It holds only the SHA-256 of the token. RLS is `user_id = auth.uid()`, with column grants so the app can never read the hash or touch the counter. A link has `label`, `can_tick` (off by default), `last_used_at` and `revoked_at`. `docs/DATA_MODEL.md` is updated. |
| Edge function **`widget`** | `supabase/functions/widget/index.ts` handles the database and HTTP. `feed.ts` holds the pure rules, tested from the app's vitest in `app/src/features/settings/widgetFeed.test.ts` (11 tests). `verify_jwt = false` is set in `config.toml`. The function is added to `release.yml` FUNCTIONS. |
| Settings → App & updates → **Windows desktop** | `WidgetLinksCard` in `SettingsPage.tsx`, with its client in `features/settings/widgetLinks.ts`. You name a link and set Allow ticking, then Create shows the link once with Copy. The list shows each link's name, made date, last used, its own ticking switch, and Revoke (with a confirm, since only the hash is stored). The card shows on every platform because the links belong to the account. |
| `kaisflow.lua` + a plain test skin | `docs/log/assets/widget-feed/rainmeter-test/KaisFlowTest/`. It shows the goal, now / next block, 3 tasks and the progress as one plain text meter. It is not a design. |
| Rehearsal suite | `supabase/tests/widget.sh`, wired into `rehearsal.yml` (the step and the summary). |
| UI harness on the mock | `docs/log/assets/widget-feed/verify.mjs`, with screenshots in `docs/log/assets/widget-feed/shots/`. |

### How the function works
- **Auth.** It follows `mcp/index.ts` exactly. Each request is one transaction on `SUPABASE_DB_URL`. As the table owner, it looks up the link by hash (`revoked_at is null`), counts the call against the hour and stamps `last_used_at`. Then it runs `asUser()`, which sets role `authenticated` with `request.jwt.claims.sub` = the owner, so RLS scopes every read and write. **Nothing runs as the service role, and no key is ever in a response.** A malformed token gets a 401 before the database is touched.
- **Reuse.** It uses `mcp/store.ts` (`store().timezone()`, `dayTasks`, `asUser`, `nextOccurrence`, `ruleBetween`), `mcp/tools.ts` (`splitToday`, `openTask`, `completeTask`, `dayWindow`) and `_shared/zone.ts`, `_shared/today.ts` and `_shared/series.ts` (`expandSeries`). It makes one query each for open tasks, today's done tasks and today's calendar, so a GET is about 7 round trips including the link lookup and the role switch.
- **Calendar.** It shows the calendar as the app draws it, Google-synced events included, because this is the owner's own desktop. The MCP leaves those out only because they go to an AI.
- **Limit.** The limit is **300 calls per link per hour** (`HOURLY_LIMIT` in `feed.ts`), which allows four skins refreshing every minute plus ticks. A 429 still counts the call (the `mcp_keys` pattern).
- **Tick.** `POST ?t=&tick=<uuid>` works only on a `can_tick` link; otherwise it answers 403 `read_only`. It runs MCP's `completeTask` with `source: 'widget'`. A repeat spawns its next round, never one for a paused series, and its subtasks go with it. `activity_log` gets `task.completed` and `task.created` with `payload.source = 'widget'`. A task that isn't open, or isn't yours, answers 409 `not_open`.
- **No CORS headers.** Only Rainmeter or curl reads this, and browsers on other sites can't read the response.

### Deviations / simplifications (ponytail)
- **Top 3.** A pick finished today keeps its place only through `top3_rank`, which the app keeps on completion. The app's star-log fallback for unranked finished picks (`today/top3Today.ts`) isn't read, so an *unranked* pick done today drops out of the widget's Top 3.
- **Plant.** It is `cherryStage` (`lib/growthStages.ts`, "Cherry (Tasks/Today)"), fed today's open work and today's done count from the same counts as progress.
- **Over-planned figure.** `load` is today-v2's `dayLoad`, and the test checks it against the app's to the minute. It is always present. The app shows it only while the day is planned and before the evening. The skin decides when to show it: for example, show it when `over_min > 0` and the local hour is between 09 and 18.
- **Ticking control.** "Allow ticking" is the Settings kit's Toggle, not a raw checkbox, to match every other Settings switch.
- **Writes.** The link writes are awaited, not outboxed, for the same reason as the AI and capture keys: a link must never be shown before it's stored.
- **ROADMAP.** `docs/ROADMAP.md` is not touched, to avoid a conflict with parallel builders. Add a changelog line when merging.

## The feed: JSON for the skin builder

`GET https://<project>.supabase.co/functions/v1/widget?t=kf_w_<43 chars>` · add `&names=0` to hide titles.
`Cache-Control: max-age=30`. Poll once a minute (`UpdateRate=60` at `Update=1000`). A full example is in
`docs/log/assets/widget-feed/sample-feed.json`.

```jsonc
{
  "v": 1,                          // schema version: refuse anything else
  "updated_at": "2026-10-29T11:00:00.000Z",
  "now": 1793271600,               // epoch SECONDS, server clock
  "zone": "Africa/Cairo",          // the user's own zone (Settings → Time); every *_hm and *_min is on it
  "date": "2026-10-29",            // today on that clock
  "goal": Item | null,             // the goal of the day = top3[0]; null with nothing picked
  "top3": [Item],                  // ≤ 3, goal first, then open picks, then picks finished today (done: true)
  "tasks": [Item],                 // today's open tasks (due or scheduled today), not picks, not overdue; ≤ 20
  "tasks_more": 0,                 // how many more weren't listed
  "overdue": 3,                    // open tasks dated before today (count only)
  "now_block": Block | null,       // a timed block running now whose task isn't done (the latest started)
  "next_blocks": [Block],          // ≤ 2, the next to start today
  "day": [DayBlock],               // every timed block today (or running now), by start, for a Day bar
  "progress": 0.25,                // done ÷ total, 0–1 (3 decimals); 0 when total is 0
  "done": 1,                       // tasks finished today
  "total": 4,                      // done + today's open work (Top 3 + tasks; not overdue)
  "plant": "bloom",                // bud (nothing yet) · opening (work, none done) · bloom (some done) · fallen (all done)
  "load": { "planned_min": 150, "free_min": 240, "over_min": 0 },  // today-v2: plan vs what's left of 09:00–18:00
  "can_tick": false                // this link may POST ticks
}
// Item     { "id": uuid, "title": string, "done": bool, "priority": 1 | 2 | 3 | null }   (1 critical · 2 high · 3 medium)
// Block    { "title", "start", "end" (epoch s), "start_hm", "end_hm" ("HH:mm"), "color" ("#RRGGBB"),
//            "kind": "task" | "time_block" | "event", "task_id": uuid | null, "is_goal": bool }
// DayBlock { "start", "end" (epoch s), "from_min", "to_min" (minutes past the user's midnight, clamped 0–1440),
//            "color", "is_goal", "done" (its task is done) }
```
- **`color`** is the block's colour as the calendar draws it. A palette C swatch is its day hex, and a colour saved before palette C becomes its new swatch. A custom colour keeps its own hex. With no colour, a task or Time block is Iris `#B59CE3` and an event is Rose `#E58F99`. `kaisflow.lua`'s `K.rgb()` turns it into Rainmeter's `r,g,b`.
- **`names=0`** masks titles: goal → "Your goal", picks → "Pick 2" / "Pick 3", tasks → "A task", and blocks → "Your goal" (the goal's), "A task" (a task's) or "Busy". Ids stay.
- **Errors** are JSON with HTTP status:

  | Status | Body | Meaning |
  |---|---|---|
  | 401 | `{"error":"unauthorized"}` | Bad or revoked link. Show "make a new link". |
  | 429 | `{"error":"rate_limited"}` | Over the hourly limit. |
  | 403 | `{"error":"read_only"}` | A tick on a link without Allow ticking. |
  | 409 | `{"error":"not_open"}` | The task is already done, gone, or not yours. |
  | 400 | `{"error":"bad_task"}` | The tick id isn't a uuid. |
  | 405 | | Wrong method. |
  | 500 | `{"error":"server"}` | Server error. |

  WebParser hands the body over whatever the status, so the Lua checks `error` (Sukoon does the same).
- **Ticking from a skin.** WebParser can only GET. Use the RunCommand plugin with `Program=curl.exe` (built into Windows 10 and 11) and `Parameter=` set to `K.tickCommand(link, id)` (`-s -f -X POST "<link>&tick=<id>"`), then `!CommandMeasure MeasureFeed Update` to refresh.

### `kaisflow.lua` (for the real skins)
Load it with `local K = dofile(SKIN:GetVariable('@') .. 'kaisflow.lua')` once it's in `@Resources`:
- `K.parse(body)` returns the feed or `nil, err`, where `err` is `unauthorized` / `read_only` / `rate_limited` / `not_open` / `bad_json`.
- `K.decode(s)` is a small JSON reader (Lua 5.1, \u escapes to UTF-8). JSON null reads as nil.
- `K.link(raw)` extracts the link from whatever was pasted.
- `K.rgb(hex)` converts a hex colour to Rainmeter's `r,g,b`.
- `K.tickCommand(link, id)` builds the curl arguments for a tick.

To install the test skin, copy `rainmeter-test/KaisFlowTest/` to `Documents\Rainmeter\Skins\`, put the link in `Link=` in the .ini, and load it.

## Deprecate the export (Kai)
Once the new skins are installed:
1. **Delete `C:\Users\khair\OneDrive\Documents\Rainmeter\Skins\Glass\@Resources\kais-flow-export.ps1`** and the `@Resources\KaiFlow\` TSV folder it writes, if it's there.
2. **Delete its scheduled task.** The script's header names it "kais-flow-export" (hourly), but on 2026-10-29 `schtasks /query` found no task with "kais-flow" in its name. If it exists under another name, find it with `schtasks /query /fo list /v | findstr /i kais-flow-export` and remove it with `schtasks /delete /tn "<name>"`.
   - The task "Akiflow agenda sync" is a **different** job (it runs `D:\Installations\akiflow-sync\sync.mjs` every 15 min) and is not this export. I didn't touch it.
3. **Nothing to rotate.** The service-role key never left this machine: the script reads it from the repo's `supabase/.env` at run time and the skins never held it. But it is the **all-powerful key**. It bypasses RLS and can read and write every user's data, plus the auth admin API (the script uses that to find the user id). A script that loads it into a PowerShell process every hour is a standing risk with no upside now. Remove it.

I edited nothing in the Rainmeter folder. I only read `Sukoon.ini`, `sukoon.lua` and the export script.

## Evidence
- **Gate** (`gate.ps1`): vitest **2711/2711** ×4 TZ (Cairo, UTC, Los Angeles, Tokyo), lint 0, build ok. ds:check had 1 new hit (a `fontSize: 13` in the new card), fixed to `var(--fs-body-s)`, and is now 0 new. The full gate was not re-run for that one-token change; `tsc -b` and ds:check were re-run.
- **`birthday_on`**: 1/1 in `types.ts` / `settings.ts`.
- **`deno check`** on `supabase/functions/widget/index.ts`: exit 0.
- **Rehearsal** (`rehearsal.yml`, workflow_dispatch on `claude/widget-feed`): run [40958121227](https://github.com/khairyKY/kais-flow/actions/runs/40958121227) **green**.
  - Fresh chain: `deno check` all functions; every migration from scratch incl. 0090; **widget.sh 52/52**; mcp-week 163, mcp-full 367 and the other suites green.
  - Production rehearsal: pending `0090` applied cleanly on production's schema.
  - The first run ([40957351484](https://github.com/khairyKY/kais-flow/actions/runs/40957351484)) had 2 test-only fails, both the suite expecting `t` where Postgres's `||` prints `true`; fixed.
- **UI harness** (`verify.mjs` against the mock on :5340): **28/28**. It covered:
  - the empty state;
  - Create, which inserts only `id, token_hash, label, can_tick`, with the hash = SHA-256 of the shown token and the token never sent;
  - Copy link;
  - the per-link ticking switch, which updates `can_tick` for that link only;
  - Create with ticking on;
  - Revoke, which asks first and then sets `revoked_at`;
  - Settings search for "rainmeter";
  - phone at 390 px, day and night, with no sideways scroll.
- **Lua** (`rainmeter-test/check-lua.mjs`, kaisflow.lua + the test skin's script run in fengari with a fake `SKIN`): **9/9**. It covered:
  - the sample feed;
  - the 401 body;
  - non-JSON;
  - escapes and `\u` surrogate pairs;
  - the pasted link;
  - the tick command;
  - the skin's three states (feed, no link, revoked).

  Fengari is Lua 5.3, and the code sticks to 5.1. **Not loaded in Rainmeter itself**, because I was told not to touch the Rainmeter folder. The first real load is Kai's.
