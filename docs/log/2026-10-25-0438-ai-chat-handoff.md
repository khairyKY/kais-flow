# 2026-10-25 04:38 (Cairo) · handoff · ai-chat — queue items 5, 7, 17

Branch `claude/ai-chat` (based on v1.4.1). Brief: `D:\Coding\_claude-cloud\kais-flow-queue-2026-10-23.md` items 5, 7, 17.

## Item 5 — a chat that acts, honestly

Kai asked for three gym sessions; the old chat said "I've added the three training sessions", wrote nothing, swapped sessions 2 and 3, printed raw pipes, and ended with unrelated ↗ chips.

- **Same tools as the MCP, as the user.** `supabase/functions/mcp/store.ts` (moved out of `mcp/index.ts`, no logic change) holds the Store, `asUser` (role `authenticated` + `request.jwt.claims.sub` → RLS), `nextOccurrence`, `ruleBetween`. `chat/index.ts` calls `runTool` from `mcp/tools.ts` with that Store, the user's zone, `source: 'chat'`, and **no personal scope**, so journal/people tables are refused. The chat reads them only through search hits as context, as it did before.
- **Groq tool calling.** The model is `GROQ_CHAT_MODEL` (gpt-oss-120b by default; it can call tools). The read tools are `calendar`, `search`, `list_tasks`, `inbox`, `projects` and `get_task`. Every write comes as **one `propose` call holding a list of steps**, because gpt-oss makes one tool call per turn (no parallel calls). Descriptions are kept short: about 3.6K chars, roughly 1K tokens, inside the free plan's 8K TPM. An action request also leaves the search hits and the app guide out of its prompt. Each question takes at most 3 model rounds.
- **The confirmation card.** Each step goes through `chat/plan.ts stepToCall`:
  - Refs like `[t2]`, `[e1]` and `[i3]` come from the snapshot.
  - `when` is read by `chat/when.ts`.
  - The whole plan is **dry-run inside a transaction that's rolled back**. The card is drawn from the tools' own answers: "Add 3 events · Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7) …".
  - It offers Confirm / Edit / Cancel. Anything typed next supersedes a card that's still waiting.
  - Confirm sends `{ run: calls }`. Each call runs in its own savepoint, and each tool's real answer or refusal is shown word for word, e.g. "1 of 2 done · Couldn't move "Dentist": No task with id …".
  - Undo exists where the app has one: an add goes to Trash, a completion reopens, a trashed item comes back. It's on the card and in the toast (⌘Z works).
  - `run` takes no AI allowance.
- **Honesty.**
  - The model's own words never accompany a card.
  - A reply that claims an action with no plan gets one nudge, then is replaced with "I haven't changed anything yet…".
  - The history the model reads back says exactly what was proposed, cancelled or done.
- **Dates.** `chat/when.ts`: a weekday means the coming one, never today. With no day, a time means today if it's still ahead, otherwise tomorrow. 12h ranges are read whole ("5:45–7:00 PM"). It reads "26 Oct", "in 2 hours" and "tonight 8". The prompt also carries a 14-day table ("Mon 26 Oct = 2026-10-26").
- **Rendering.** `chat/markdown.ts` parses paragraphs, lists, tables, headings, bold, italics and code into text-only parts, and ChatPanel draws them. No HTML from a reply.
- **Chips.** None for action requests. For questions, `relevantCitations` keeps a chip only when the answer uses every meaningful word of its title (at most 3).
- **Tone and model.** The new system prompt covers Top 3 and the goal, tasks vs events, Time blocks and slots, rituals and the Inbox. It asks for 1–3 sentences or a short list, no tables, times in the device's 12h/24h style (the app sends `hour24`), and the user's language.
- **Quota.** One allowance per question, as before; the daily-limit message is unchanged. A Groq 429 (the TPM limit) now shows "The AI is catching its breath — try again in a minute."

## Item 7 — "File captures for me" (default OFF)

- Migration **0086** adds `app_settings.auto_file_captures boolean default false`.
- **Settings → Capture & AI** has the toggle. It's disabled until the server has the column (the 0058 pattern).
- **Off:** voice, ⌘K/tray plain lines and queued captures (endpoint, MCP, chat) stay in the Inbox. The AI's read goes in `ai_parse`, and the Inbox card's "Suggested" row files it in one tap. Share and paper already never auto-filed.
- **On:** the old auto-file behaviour, with Undo.
- The `capture` endpoint queues `needs_parse` when `?file=1` is set or the switch is on. MCP/chat `add_to_inbox` sets `needs_parse` while the switch is on.
- A queued row from any server source is claimed before parsing, so one capture isn't filed twice.
- One notice for existing users (onboarded before 2026-10-26): "Captures now wait in your Inbox — the AI's guess is one tap away." · Settings. It's remembered in `help_seen` as `notice:autofile`.

## Item 17 — project for new tasks/events (default "suggest")

- Migration **0086** adds `app_settings.auto_project` (`off` | `suggest` | `assign`), shown in the same card.
- `features/projects/autoProject.ts` scores from the user's own history only: titles already filed in projects, recency, the project's name in the title, labels, and the Time block's project. Archived/done projects are never offered.
- **Suggest:** a toast "→ Forecasting App?" · Apply.
- **Assign:** used when sure; it puts the item there with "→ Forecasting App" · Undo.
- **Learning:** history is where things are now, so a manual move teaches it. An assignment taken back with Undo is remembered as "not there" on that device.
- A `#word` left in the title (chip removed with Esc) gets no suggestion.
- **Wired into:** ⌘K / quick add / tray tasks and typed events, the grid's quick create (task, event, Time block) and the phone add sheet.
- **Groq is used only where it already runs:** the typed task's AI read (`enrichTypedTask`). It now **puts** a project only on "assign"; otherwise its pick becomes the chip when history had none.
- Never touches journal or people content.

## Gate

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` ×4 TZ (PowerShell `$env:TZ`: UTC, Cairo, Los Angeles, Tokyo) | 176 files · **2401 passed** each |
| `npm run lint` | exit 0, **0 errors** (24 old warnings, none in these files) |
| `npm run build` | OK |
| `ds:check --baseline` | **0 new** |
| Deno functions | deno isn't installed. `chat`, `mcp` and `capture` were type-checked with `tsc --strict` plus a small Deno/postgres shim instead: clean |
| New unit tests | `chat/when.test.ts` (the "Mon 7:00–8:15" set), `chat/plan.test.ts` (steps → calls, undo, honesty, relevance, the tool budget), `chat/planCard.test.ts` (card / report / history lines, markdown), `projects/autoProject.test.ts`, capture `api.test.ts` (auto-file off/on), `mcp.test.ts` (`add_to_inbox` + `needs_parse`) |
| Harness `docs/log/assets/ai-chat/verify.mjs` | **59/59**. The chat function is mocked at the network layer the way the server behaves: scripted tool-call rounds (a read, then `propose`) go through the real `chat/plan.ts`. Covers G (Kai's gym request → card with the right days in his order → Confirm → 3 event writes at the right instants → honest summary → Undo; Cancel, Edit; phone), F (failed tool → "1 of 2 done" with the refusal; a refused plan said in words), M (table), A (notice; off keeps the capture in the Inbox; switched on files it), P (chip → Apply; Assign + Undo) |
| Sibling suites, one at a time on `:5308` (dual stack) | resurface-chat 292/292 · capture-rules 42/42 (one b1 flake on a cold first capture: passes alone 3/3 and on the full rerun) · fix-inbox 69/69 · paper-capture 122/122 · journal-media 123/123 |
| `birthday_on` greps | 1/1 |

The server was stopped afterwards.

## What Kai must do

- **Push migration 0086** (`supabase db push`) **before** the frontend ships. Until then the two Settings rows show disabled, and everything reads as off / suggest.
- **Deploy the functions:** `chat`, `mcp` and `capture` (`supabase functions deploy chat mcp capture`). `chat` now needs `SUPABASE_DB_URL`, which edge functions get by default (`mcp` already uses it).
- **Nothing new to set for the model.** `GROQ_CHAT_MODEL` defaults to `openai/gpt-oss-120b`, which can call tools. If he ever sets a different model, it must support tool calling.
- **His decisions:**
  1. **Typed tokens still file directly.** With auto-file off, a typed ⌘K line that has a date or `#project` still becomes a task at once. That's him filing it, not the AI (his "Enter = the one capture path" rule). Plain lines, voice and queued captures wait in the Inbox. Say if he wants typed tasks held too.
  2. **Undo coverage.** Undo exists for adds, completions and trash. Edits and moves show their result but have no Undo; he can ask the chat to change them back.
  3. **Free-plan budget.** The free plan is tight: about 8K tokens a minute and 200K a day on gpt-oss-120b. An action that needs a read first costs two model calls in one question. The global chat cap stays 80 questions a day.

## Notes

- **Other builders.** Another builder's script once wrote duplicate lines into this worktree's `lib/settings.ts` and `lib/types.ts` (`birthday_on` / notice kinds, 03:03). I reverted them. Builders writing to app settings or notice kinds should check their script paths.
- **New files:**
  - `supabase/functions/chat/{when,plan}.ts`
  - `supabase/functions/mcp/store.ts`
  - `app/src/features/chat/{planCard,markdown}.ts`
  - `app/src/features/capture/autoFileNotice.ts`
  - `app/src/features/projects/autoProject.ts`
  - migration `0086_capture_choices.sql`
