---
date: 2026-10-12 19:49 UTC
session: builder (search-design)
type: handoff
related: design-coverage review 2026-10-12 (Search 1a PARTIAL); Kai "build the unbuilt designs"; design-export/Search.dc.html 1a/1b, Overlays.dc.html "Search ⌘/", States.dc.html t2
---

# Search 1a/1b as drawn: filters, Library, Show all, Related, and every state

Branch `claude/search-design`, cut from `origin/claude/kai-bugs-1012` (493250f8). Pushed. Not merged,
no PR, not deployed.

The review found `features/search/SearchPage.tsx` had no "Open only" or "Any time ▾", no Library group,
no "Show all N →" and no "Related" rows. All of them are built now, on the computer and the phone. The
⌘/ overlay uses the same groups.

**Note:** the brief said "⌘K overlay". In the app ⌘K is the capture bar. The search overlay is ⌘/
(`SearchOverlay.tsx`; `Overlays.dc.html` also calls it "Search · ⌘/"). That overlay is the one I changed.

**Note:** `Search.dc.html` 1b is the *empty result*, not a phone frame. The export draws no phone
screen for Search. For the phone it gives only one line under 1a: "Mobile: chips scroll, input pins,
groups stack." I built that.

## What it does now

| 1a / 1b element | Built as |
|---|---|
| Groups | People · Tasks · Events · Inbox · Journal · Projects · Areas · **Library** (1a's order; Inbox, Areas and Library fill the gaps). The chips use 1a's own order: All · Tasks · Events · Inbox · Projects · Journal · People · Library. |
| **Library** | New migration `0064_search_library.sql` (see below). Books, notes and quotes form one group. A hit opens the item: `/library?tab=books&bookId=` / `tab=notes&noteId=` / `tab=quotes&quoteId=` (LibraryPage already reads those). |
| **Show all N →** | Under All, each group shows a peek: Tasks 5 rows, Journal 2, the others 3 (1a shows Tasks 5 of 9 and Journal 2 of 5). "Show all N →" picks that group's chip, and the chip lists every row. When a group has a Related row, the last peek place goes to it, as 1a does with "Invoice the retainer". |
| **Open only** | Hides done or cancelled tasks, filed or dismissed captures, archived projects, past events and finished books. People, areas, journal entries, notes and quotes are never "done". |
| **Any time ▾** | Any time · Today · This week (Monday to Sunday, the planning board's week) · This month · This year. Days are counted on the user's clock (`zoneDateKey` / `appZone`). Each thing's day: a task → its planned day, else the day it was done, else the day it was made. An event → its start. A capture → when it was captured. A journal entry → its own date. A person → their last touch. A project, area or book → when it was last changed. A note or quote → when it was written. The export doesn't list the windows. These are mine. |
| Filters | Both filters run in the app, over the answer, using the cached lists (every list is fetched whole). The RPC is unchanged for them. A row the cache doesn't hold yet is never hidden: a filter only hides what it knows doesn't fit. Chip counts and the "N results for 'q'" line count what is listed after the filters. |
| **Related** | Built only from links the data really has. (a) A matched project's or area's **open tasks** get the line "RELATED · In ‹project›". (b) A matched book's **notes and quotes** get "RELATED · From ‹book›". There are at most 3 per group, the soonest due first, and a row that is already a hit is never repeated. |
| Rows | Task: the check (filled ✓ and a struck title when done), "!!", a day chip ("Tomorrow 15:00" when it has a block, else "Fri 17 Jul"). Its line is a quoted note when the note matches, else "place · note", and when done "Done Tuesday · place". Event: a lavender bar, "Sat 11 Jul · 15:00 – 15:45"; a past event fades with "Past · Tue 30 Jun". Journal: the "JUL 08" date column and a quoted passage. Project: its own dot, "‹summary› · N open · retainer", and "11h this month" from time entries. Person: the flower and "Last touch · 2d ago". Capture: "Captured Thu 9 Jul" or "Filed · …". Library: "Book · author", "Note · "…"", "Quote · author · source". Every place the query occurs is marked. |
| **1b empty** | Now reachable (see the next section). The ⌘/ overlay shows its short line in the same case. |
| States (`States.dc.html`) | **Loading:** skeleton rows, only while there's no earlier answer on screen (the last answer and its chips stay while the next one comes). **Offline:** "Offline ◌ — search wakes when the connection does." There is no Try again, and the search asks again by itself when the connection comes back. **Didn't answer:** the existing "Search is resting" plus Try again. **Filters hide everything:** "Nothing here with these filters." plus Clear filters, so it can't pass for "nothing found". The word "error" never appears. |
| Phone | The search box pins (sticky) while the groups scroll under it. The chips and the two filters sit in one row that scrolls sideways. Groups stack. There's no sideways page scroll at 390px. A task hit opens the Task sheet over the page. |

## "Search never returns zero" — verified, and fixed

- **Cause:** `search_hybrid`'s vector arm accepts any task or capture within cosine distance 0.35
  (similarity > 0.65). gte-small puts most of a small corpus that close to almost any short query.
  0037's own note says that at 0.45 the arm "filled all 40 of its slots" for `judge`. So every
  answer carried up to 12 loose neighbours, and 1b's empty state could not be reached.
- **What I proved:** on PGlite, a query that shares no word with anything still returns the vector
  neighbour. The score bands are also exact: a lexical hit scores ≥ 1, the 40th FTS hit scores exactly
  1/100, and the best vector-only hit scores 0.5/61 ≈ 0.0082.
- **What I couldn't prove:** I could not measure gte-small's real spread here (no model, no live
  data). That part rests on 0037's recorded evidence.
- **Fix (in the app, `searchState.ts` `literalAnswer`, applied in `searchHybrid`):**
  - An answer where every hit scores below `LITERAL_FLOOR = 0.009`, meaning only the meaning arm
    found it, is treated as empty. 1b then shows "…try fewer words, or let the chat dig deeper", and
    its pill opens the chat, which keeps the whole retrieval.
  - When at least one hit shares the query's words, the neighbours stay, so search still finds
    things with no shared words.
  - The RPC, the chat and the MCP are untouched.
  - Nothing to deploy for this part.

## Backend: 0064_search_library.sql

- **Body:** 0054's body verbatim, plus three arms in both the FTS and the lexical CTEs:
  - `book`: title; snippet = author; FTS over title + author.
  - `note`: title, or the body's first 80 characters when the title is empty or blank; snippet =
    body; FTS over title + body + tags.
  - `quote`: the text's first 80 characters; snippet = "author · source" (null when both are
    missing); FTS over text + author + source.
- **Kept from 0054:** the same signature, **SECURITY INVOKER**, `user_id = auth.uid()` on every arm
  (0035's defence in depth, including the new arms), the same RRF weights and the same tiers.
  `create or replace` keeps the grants.
- **FTS-only for the Library, on purpose:** embeddings exist only on `tasks`/`inbox_items`. Extending
  them needs new columns, triggers and the `embed` function's write-back. That is not a clean
  extension, and a title, an author or a remembered line is a keyword search anyway.
- **No skip-trashed guard:** `books`/`notes`/`quotes` have no `deleted_at` (0021), because the
  Library's Remove deletes the row.
- `supabase/functions/_shared/retrieval.ts` `SearchHit` gains `book | note | quote` (type only). The
  `search` function doesn't filter types, so it is unchanged.
- **MCP (`supabase/functions/mcp/tools.ts`): no change.** Its `search` tool keeps an allowlist
  (task / inbox / project / event) and types `entity_type` as `string`, so Library hits never reach
  AI assistants. If Kai wants them there, add `'book','note','quote'` to `SEARCHABLE` and the tool's
  description.
- **PGlite check:** `docs/log/assets/search-design/0064-pglite-check.mjs` → `.txt`, **24/24**.
  - The schema is stand-in tables with exactly the columns `search_hybrid` reads, the real generated
    `search_tsv`, pgvector, owner RLS and two users.
  - It covers: each Library arm (author, title, half-typed title via lexical tier 2, body, tag,
    untitled note, empty-string title, quote by text and by author + source, null snippet), FTS +
    lexical merging into one hit, A never seeing B's rows (and the reverse), signed-out seeing
    nothing, the other arms unchanged, the score bands, the 0.35 distance cut, and STABLE + INVOKER.
- **Not verified against real Supabase** (no Docker here).

## Deviations (marked in code where they live)

1. `deviation(2026-10-12)` in `searchView.ts` `relatedRows`: **no Related people.** 1a's "Youssef
   Hamdan · Related · Shares the Shaheen retainer with Omar" needs person ↔ person or person ↔
   project links, and the app keeps neither. Related reasons are the plain fact ("In Shaheen
   website", "From Four Thousand Weeks"), not 1a's prose ("Retainer billed to Omar's studio
   monthly"), which nothing in the data says. Nothing is invented.
2. A Related task keeps its own day chip ("FRI 31 JUL"). 1a's Related row has none. The date is true
   and useful.
3. Small mono labels (the Related tag, "!!", chips, "Last touch", the journal date) use `--fs-meta`,
   not 1a's 8.5–9.5px. Done and past titles use `--ink-faint`, not `--ink-hairline`. Both follow the
   2026-10-08 UI pass rules: no text under 10px, and hairline is never a text colour (AA).
4. The chips wrap to two lines at 1280px. The app's 125% interface size makes them wider than in the
   export. The two filters sit at the top right as drawn.
5. There is no design for the offline, filtered-empty and loading lines on this page (Phase C). They
   are built only from 1b's parts (the hand note and the pill) and the kit's `Skeleton`.

## Verified

- `npx vitest run`: **1581 passed** (baseline 1532, +49).
  - The new `searchView.test.ts` covers windows, open-ness, the user-zone day, filters, Related,
    groups and peek, chips, excerpts and every row line. `searchState.test.ts` covers the literal
    gate and its bands, and `searchDestination.test.ts` the Library destinations.
  - The search tests also pass under TZ = Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo
    (PowerShell `$env:TZ`).
  - One suite, `rituals/reviewWeek.test.ts`, **fails to load in a fresh worktree** because it
    imports `lib/supabase` without a mock and there's no `.env`. That predates this branch; it
    passes 3/3 with the two `VITE_SUPABASE_*` vars set. The 1532 baseline already excluded it.
- `npm run lint`: 0 errors (22 warnings, the same as the baseline). `npm run build`: green.
- **Browser, mock backend:** `docs/log/assets/search-design/verify.mjs` → **62/62** (`results.json`).
  - Setup: Playwright + Chrome, dev server from this worktree, `--mode mock`, port 5253,
    `http://localhost`, with the clock at Fri 10 Jul 2026 10:00 Cairo (1a's day) and 1a's data.
  - The `search` function's answers are mocked in 0064's shapes and score bands.
  - **a** (desktop, day + night): the count line, chips and order, group order, peeks, Show all,
    every row line, the done task struck, Open only 22 → 19, Any time list and This week → 6, Back,
    a Library hit and a task hit opening the right place.
  - **b**: 1b reached for a neighbours-only answer, day + night.
  - **c**: resting + Try again.
  - **d**: offline line, then the answer arrives by itself on reconnect.
  - **e**: filtered-empty + Clear filters.
  - **f**: a book plus its note and quote as Related, opening in the Library.
  - **g**: the ⌘/ overlay shows the Library, "View all results" lands on /search, and the overlay
    says nothing came up for a neighbours-only answer.
  - **p** (390×844, day + night): no sideways scroll, the chips scroll, the box is still pinned after
    a 900px scroll, and a task opens the sheet.
  - **s**: side-by-side images.
- **Side by side with the export** (`side-*.jpg`): `side-1a-desktop-day` / `-night`,
  `side-1a-phone-day` / `-night`, `side-1b-empty-day` / `-night`.

## Not verified

- 0064 on real Postgres/Supabase (PGlite only), and ranking on Kai's real data.
- gte-small's real similarity spread (taken from 0037's recorded evidence).
- A real device or a signed-in run.

## [KAI] to ship

1. `npx supabase db push --include-all` (0064, after the other builders' 0060–0063). Until then, the
   live search simply returns no Library hits and the group stays hidden. The rest of this work needs
   no backend.
2. No edge-function deploy is needed. `retrieval.ts` changed only a TypeScript type, and the `search`
   and `chat` functions pass the new types through as they are.
