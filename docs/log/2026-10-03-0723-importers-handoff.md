---
date: 2026-10-03T07:23+03:00
session: Integrations wave 1, builder W (file importers)
type: handoff
related: docs/phases/P-IMPORT.md §Notes (2026-10-03) · app/src/features/import/ · docs/log/assets/importers/
---

# File importers: Todoist, TickTick, Notion, Obsidian/Markdown, Kindle, Goodreads

Branch `claude/importers`, cut from `c1b3446`. Not merged, not deployed. No migration, no new
dependency. Only `app/src/features/import/**` and docs changed.

## What changed

- **Settings › Import data** lists 8 sources: Akiflow JSON, Todoist, TickTick, Notion,
  Obsidian / Markdown, Kindle highlights, Goodreads books, Generic CSV. Each pick card shows one
  line on where the source's export lives.
- **Flow:** pick → file(s) → (Notion/CSV: map columns) → preview → import → summary.
  - **Preview:** counts per kind with "· N already here", a 5-row sample (tasks, or books with
    their highlight count), and toggles: completed tasks, Akiflow events, the Goodreads
    want-to-read shelf. All three are off by default.
  - **Summary:** "See the tasks" or "See the library", "Import another file", and **Undo this import**.
- **Writes** still go only through `writeRow` (outbox, ~50-row chunks, flushed between chunks),
  with one `logActivity('import.run')` per run. Undo logs `import.undone`.

## Per source

| Source | Input | Lands as | Idempotency key |
|---|---|---|---|
| Todoist | per-project CSV, several at once | project = file name; sections → labels; comments → notes; `@labels`; INDENT → subtasks; DATE via chrono on TIMEZONE (else Cairo); `every …` → RRULE; DEADLINE beats DATE; PRIORITY 1/2/3/4 → 1/2/3/none | hash(file + section + content + nth) |
| TickTick | backup CSV (preamble skipped) | List → project (Inbox → none); NOTE kind → notes; all-day → that day's Cairo midnight; timed start<due → scheduled block + duration; RRULE; priority 5/3/1 → 1/2/3; status 1/2 → done | `taskId` |
| Notion | database CSV | the column mapper, Notion defaults (Name/Date/Done-or-Status/Priority/Project/Tags; never "Created time"); relation URLs stripped; date ranges → start | hash(title + due + project) |
| Obsidian / Markdown | .md files or a vault folder | `- [ ]`/`- [x]`/`- [-]` → tasks; 📅 due, ⏳/🛫 fallback due, ✅/❌ completed, 🔁 → RRULE, 🔺⏫/🔼/🔽⏬ priority; `#tags`; indented → subtask; projects from none / heading / file name; paragraphs → Inbox (opt-in) | hash(path + title + nth) |
| Kindle | `My Clippings.txt` | a Library book per title (reading); highlights → quotes (page or "loc N-M"); notes → notes on the book; bookmarks skipped; edited highlights keep their last version | books by main title, quotes by book + text |
| Goodreads | library export CSV | books: read → finished at last page, currently-reading → reading p0, to-read/custom → opt-in, reading p0; review/private notes → a note on the book | books by main title; review note `review:<Book Id>` |

## Evidence

- **Gate** (worktree, no `app/.env.local`):
  - `npx tsc -b`: exit 0.
  - `npx vitest run`: 78 files / 1014 tests passed under each of TZ=UTC, Africa/Cairo,
    America/Los_Angeles and Asia/Tokyo. The import folder has 83 of those, in 10 files.
  - `npm run lint`: 0 errors (19 warnings, all outside `features/import`).
  - `npm run build`: ok.
- **Browser** (`docs/log/assets/importers/verify.mjs`, mock backend, http://localhost:5249,
  desktop 1280 + phone 390): **99/99 passed** (`verify-results.json`). It covers:
  - for each source: the export line on the pick card, preview counts, the written row counts per
    table, the mapped fields (priority, labels, parent ids, RRULE, Cairo-time dues, `book_id`
    links, finished-book pages), exactly one `import.run`, and no page errors;
  - Todoist Undo: 5 tasks to the Trash with `external_ref: null`, 2 project deletes;
  - Kindle against a Library that already holds "Four thousand weeks" and one of its highlights:
    "3 books · 1 already here", "4 highlights · 1 already here", and only 2 books + 3 quotes written,
    the note tied to the existing book;
  - the Goodreads want-to-read opt-in.

  Screenshots are in the same folder.
- **Big files** (measured once in a throwaway vitest file, not committed):

  | Input | Parse time | Longest blocking slice |
  |---|---|---|
  | 5,000-row Todoist CSV (all-distinct NL dates) | 1.7 s | ~90 ms |
  | 5,000-row Notion CSV | 1.4 s | ~30 ms |
  | 20,000-clipping (4.4 MB) My Clippings | 1.1 s | ~20 ms |
  | 2,000-file × 20-task vault | 2.0 s | ~40 ms |

  The vault took 27.8 s before Intl formatters were cached per zone.

Re-run:

1. Create `app/.env.mock.local` with `VITE_SUPABASE_URL=http://127.0.0.1:9` and `VITE_SUPABASE_ANON_KEY=mock-anon-key`.
2. Start the dev server: `npm run dev -- --port 5249 --strictPort --mode mock`.
3. Warm `/settings/import`.
4. Run `node docs/log/assets/importers/verify.mjs <outDir> http://localhost:5249`.

## Decisions / deviations (also in P-IMPORT §Notes)

- **Books and quotes have no `external_ref` column**, and adding one would need a migration, which
  is out of scope for this wave. They match by title, and by book + text, instead. Ceilings:
  - two books with the same main title collapse into one;
  - the rating of a Goodreads book with no review isn't stored.

  Follow-up: `external_ref` on `books`/`quotes`.
- **Todoist PRIORITY is not inverted in the CSV.** Its help page says 1 = p1 (highest), which
  matches ours. The REST API is the inverted one. The wave brief assumed inverted, so check one
  real export to confirm.
- **Obsidian ⏳/🛫 dates map to `due_at`, not `scheduled_start`.** In the app `scheduled_start`
  is a timed calendar block.
- **Fixed in passing:**
  - The preview's "already here" never matched: the page keyed refs with a space, `api.ts` with a
    NUL. Both now use `refKey`, and `api.ts` is text to git again.
  - The generic CSV read "October 5, 2026" on the device's zone. It now reads on Cairo's.

## Risks / for Kai

- **Copy left alone:** the Onboarding link still says "Import from Akiflow / CSV instead", and the
  Settings card says "Open importer". Both are outside this builder's files.
- **Dropping a whole folder** onto the drop zone isn't supported. Dropping files is; folders come
  in through "Pick a vault folder…".
- **Inbox notes:** Markdown paragraphs imported to the Inbox enqueue embeddings, like any capture.
  This is opt-in and off by default.
- **Other languages:**
  - Kindle set to another UI language: highlights still import, but without page numbers, and its
    notes are read as highlights (the meta words are matched in English). Bookmarks carry no text
    and are still skipped.
  - Todoist with a non-English `DATE_LANG`: the task lands with no due date. The DATE string stays
    in `external_ref.raw`.
