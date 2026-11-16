# v165-shutdown-why: the end-of-day "why" (lighter version)

Kai picked the lighter way of "End-of-day review that asks why" on 2026-11-16 (Next up decisions, 4.3): one optional question in Shut down, saved to the journal.

## What changed
- **Shut down** (`app/src/features/rituals/EveningRitual.tsx`): the old "One line" step is now the one question, **"What helped today, and what got in the way?"**. Optional ("Optional. Saved to today's journal."), **Skip** always there (folds to "Skipped. A line is always welcome." with **Write one** to bring it back), Close the day never needs it. A skipped or empty answer logs no `line` step and writes nothing.
- **Where it goes:** a small `Shut down` block in the day's journal entry: the entry already holding the block, else the day's last entry, else a new entry. Written through `upsertJournalEntry` (journal path + outbox), mood / gratitude / photos on the row are kept. Saving again **replaces** the block, saving identical text writes nothing, and re-opening Shut down the same day (or on another device) shows the answer with Edit instead of an empty field.
- **Pure logic:** `supabase/functions/_shared/shutdownNote.ts` (`withShutdownNote`, `shutdownNote`, `noteHome`, `tidyNote`), shared by the app and the MCP like `blockLength.ts`. A block = the `Shut down` heading line + the answer lines, ended by a blank line or the end of the entry, so text you write after it is left alone.
- **MCP `shut_down`** already had a `line` input; it now writes the same block (patching the day's entry, or inserting one) instead of inserting a new entry every call. Description updated.

## Privacy
Nothing new: the journal still goes only through `journal_entries` (outbox write, `journal_entries` is in `UNPERSISTED_QUERY_ROOTS`, so it never reaches IndexedDB), and `logActivity('journal.line_added')` carries the date only. No new network path, no Groq or other provider involved. (The ritual's per-day draft already held the typed line locally before this change.)

## Checks
- Unit: `app/src/features/rituals/shutdownNote.test.ts` (append, replace, no-duplicate, text after the block kept, no false match, home-entry choice) + `mcpFull.test.ts` (`shut_down` twice = one entry, one block).
- Harness `docs/log/assets/v165-shutdown-why/verify.mjs` (phone 390 + desktop 1280): answer -> Journal page shows it under "Shut down" on the same entry; no entry yet -> one created; Skip -> nothing written, day closes, `line` step not logged; re-open same day -> shows saved + Edit, same text writes nothing, edit replaces (one entry, one heading); fresh load with the block already there -> Edit, not a second copy.
- `docs/log/assets/rituals/verify.mjs` (8a, 8c, 8d re-run): updated the section label and the saved body (`Shut down\n...`) assertions; all pass.
- Gate green (vitest x4 time zones 2979/2979, lint, build, ds:check 0 new); `deno check supabase/functions/mcp/index.ts` clean; v165 harness 34/34; rituals harness 8a/8c/8d 31/31.

## Left over
- The "Skip" and "Write one" buttons use the existing ghost button; no new tokens or colours.
- The journal body is plain text, so the heading shows as the literal line `Shut down` on the Journal page.
