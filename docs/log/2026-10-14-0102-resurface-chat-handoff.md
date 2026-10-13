---
date: 2026-10-14 01:02
session: resurface-chat (builder)
type: handoff
related: P7e parity audit A24, A28 (docs/log/2026-10-13-0808-p7e-parity-audit.md)
---

# 2026-10-14 01:02 · handoff · resurface-chat (A24 + A28)

Branch `claude/resurface-chat`, from `claude/kai-bugs-1012`. Pushed, not merged, not released.

## A24 — resurfacing brings back journal entries, quotes and notes (`563eb9df`)

- **Migration 0078** `0078_resurface_memories.sql`: `resurfaced_log.entity_type` also takes `journal_entry | quote | note`; `do_resurface()` = 0066's body with every rule kept (a snooze holds until `snoozed_until`, an unacted pick rests 14 days, let go = never, same weights, one pick per user per UTC day, RPC revoked) plus three pools:
  - journal entries with words, not in Trash, for a day **30+ days back**;
  - quotes with words saved **14+ days** ago;
  - library notes with a title or body saved **14+ days** ago.
- The pick is only an id. Journal text stays in our DB and our own card, with no AI. The harness checks that no request carries it.
- The card (`features/resurfacing`): it quotes the words (long pages are cut to an excerpt).
  - Meta lines: "Journal · 14 Jul 2026 · 2 months ago", "Quote · The Overstory · Richard Powers · saved 5 weeks ago" and "Library note · saved 3 weeks ago".
  - Tapping it opens that day's journal (`/journal?focus=`) or the Library item, through the search destinations.
  - The buttons are **Keep · Let it go · Not now**. Put off twice, it asks Keep or Let it go. Letting go only stops it coming back and deletes nothing; the `?` text says so.
  - The Memory widget names the kind. The journal, library and books lists are fetched only when the pick needs them.
- PGlite: `docs/log/assets/resurface-chat/0078-pglite-check.mjs` passes **25/25**. It runs 0066's four rules for tasks plus a snooze on a journal entry, and covers the windows, wordless and trashed rows, per-user scoping, the check constraint replaced by name, idempotence and the revoked grant.
- Known ceiling: the weight is unchanged (days since the last touch), so a big, old journal can outweigh tasks. Revisit only if Kai finds the card is "always journal".

## A28 — the chat keeps the conversation until Clear, and has a mic (`ada0b41e`)

- `features/chat/history.ts` keeps the conversation per device and per account in localStorage (`kf.chat.<uid>`, newest 100).
  - Only the last 20 messages are sent with each question, so a long chat doesn't spend the Groq allowance.
  - A visible **Clear** in the header empties it, with an Undo toast.
  - Sign-out (`SIGNED_OUT`) forgets every account's chat, like the query cache.
- The mic beside the field opens the existing `VoiceCaptureSheet` with its words routed back to the chat (`onText`).
  - **Tap** starts listening; **Stop & send** ends it.
  - **Hold** while speaking and **let go** to send, via the sheet's new `release` prop.
  - The take goes through `transcribeAudio`, the existing Groq path, and the words become the message, sent at once.
  - The sheet's never-lose-a-recording choices still apply. "Type it instead" closes back to the chat field.

## Evidence (`de07e360`)

| Check | Result |
|---|---|
| `npx vitest run`, TZ UTC / Africa/Cairo / America/Los_Angeles / Asia/Tokyo (PowerShell `$env:TZ`) | 2120/2120 each |
| `npm run lint` | 0 errors |
| `npm run build` | ok |
| `ds:check --baseline` | 0 new |
| `docs/log/assets/resurface-chat/verify.mjs` (new; phone + desktop, day + night, Chrome fake mic) | **292/292** |
| `resurface/verify.mjs` rerun | **320/320** |
| `fix-today/verify.mjs` rerun | **116/116** |

All three harnesses ran on a mock dev server on :5282 from this worktree; the server has been stopped.

## Deploy order

1. **[KAI]** `npx supabase db push --include-all`, which pushes **0078** first. It is additive: the client handles a pick of any kind, and before the push the server just never picks the new kinds.
2. No edge function changes.
3. Frontend: merge and push `master`. The chat persistence and mic need no backend change.
