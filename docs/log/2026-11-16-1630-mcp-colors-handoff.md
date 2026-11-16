# mcp-colors handoff (2026-11-16)

Branch `claude/mcp-colors` (from `origin/claude/kai-bugs-1012`). Nothing deployed, no live data touched. Gate green (vitest x4 zones, lint, build, ds:check), `deno check` clean, Rehearsal green (run 43886198664, mcp-week.sh included; the first run's one red was `notify-prune.sh` timing out waiting for its harness port, unrelated, green on rerun).

## What changed
- `supabase/functions/_shared/blockColors.ts`: the name -> hex map, a mirror of `blockHue.ts` (functions can't import the app). `blockHue.test.ts` fails if the two drift (same 16 swatches, same 9 legacy hexes, same nearest-swatch result).
- `color` argument (writes `calendar_events.color`, a hex) on `add_event`, `edit_event`, `add_task` (the task's block; needs a date-time `due`) and `reschedule_task` (recolours the block it ends up with; "no calendar block to colour" is said, not an error, when a date-only move leaves none). Accepts the 16 palette names, the 9 older names (nearest palette swatch), any case; `null` / `"none"` clears; anything else is refused with all names listed.
- `edit_event` scopes this / following / all apply to colour like every other field. `edit_event` with only `id` + `color` also recolours a **task's calendar block** (any other field on a block is still refused, pointing at `reschedule_task`) - that is the way to recolour Kai's existing task blocks without moving them.
- `duplicate_event` keeps the colour. A moved block keeps its colour.
- Read: `calendar` (and every event answer) returns `color` (palette name; a custom hex has no name so it is the hex) and `color_hex`. Fixed on the way: the store's `events()` SELECT omitted the column (the Rehearsal caught it; the in-memory fake hid it).
- Tests: `mcp.test.ts` "MCP: block colours" (5), `blockHue.test.ts` mirror (2), `realtime.test.ts` (1), `mcp-week.sh` new section "block colours" (~25 checks against real Postgres, incl. series scopes and a task block).

## Mapping table (brief's key -> what the MCP stores)
| Brief key | Use | Palette C name it maps to | Hex |
|---|---|---|---|
| Hydrangea | Classes | Lagoon | #47BFC5 |
| Clover | Study blocks | Rose | #E58F99 |
| Buttercream | GCI | Ochre | #C9A658 |
| Gold | Money | Ochre | #C9A658 |
| Moss | The rep | Moss | #768A42 |
| Sage | Gym | Moss | #768A42 |
| Blossom | Reem | Rose | #E58F99 |
| Lavender | Planning | Iris | #B59CE3 |
| None | Meals | (cleared) | - |

Collisions: Clover = Blossom (both Rose), Gold = Buttercream (both Ochre), Sage = Moss (both Moss). Study / Reem, Money / GCI, Gym / the rep would be the same colour. When recolouring, pass explicit distinct palette names instead of the old ones (e.g. Study Fern, GCI Honey, Gym Pine, Reem Wine). "Moss" is the palette's Moss (#768A42) whichever era the caller means.

## Bug: MCP writes missing in the open desktop app
Server side is fine: `calendar_events` and `tasks` are in `supabase_realtime` (0004, 0002); MCP inserts omit `user_id`, so the column default `auth.uid()` fills it under the role switch, and the new mcp-week check asserts `user_id` = the key's owner (so the app's `user_id=eq.<uid>` filter matches). WAL-based postgres_changes don't care which role wrote.

Client side was the gap (`app/src/lib/realtime.ts`): the channel is closed while `document.hidden`, and on return it only reopened - nothing refetched what it missed, and TanStack's focus refetch only fires if the webview flips visibility (a Tauri `window.hide()` to the tray may not). A socket dropped by sleep also rejoined without replaying. Fix (small): `resyncAll()` invalidates every synced table (the existing 300 ms debounce makes it one refetch each) on visibility-show, window `focus`, `online`, and any rejoin of the channel after the first join. Unit-tested; **not verified in the real Tauri window** (I can't drive the tray). Kai should confirm: hide to tray, run an MCP add_event, show the window. If it still needs a restart, the next suspect is the Tauri webview's websocket being suspended, and `focus` would not help - then check whether `tray.rs` show path emits a focus event.

## Left for the conductor
Deploy the `mcp` function; the live recolour (use `edit_event` with `scope: "all"` for the class series, `edit_event` id + color for task blocks). Not run: Playwright harnesses (no UI change).
