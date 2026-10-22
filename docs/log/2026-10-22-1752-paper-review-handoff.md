---
date: 2026-10-22 17:52 (Cairo)
session: paper-review (builder, branch claude/paper-review off v1.3.0 @ 410251f4)
type: handoff
related: 2026-10-04-0457-paper-capture-handoff.md · 2026-10-12-2202-paper-gaps-handoff.md · docs/log/assets/paper-review/
---

# Paper capture: the review gets dismiss, delete, and "add one line"

Kai (2026-10-22): "the review a scanned paper feature is missing a lot of things like dismiss or delete".

Branch `claude/paper-review`, pushed. Not merged, no PR. Only `features/paper/*` changed, plus two lines
in each of the older paper harnesses (see "Changed on purpose").

## The map: state → what you could do → what's added

Compared with Apple Notes / Evernote / Notion scans (retake, add a page, keep, delete the scan), Google
Lens (pick some text, not all) and Todoist's email-to-task review (edit, then add or drop each one).

| State | Before | Added |
|---|---|---|
| **Waiting to be read** (Groq busy, daily limit, a read that stalled) | The Inbox row showed the status. No action | The row's ⊞ (or right-click / Android long-press): **Try again** (busy or stuck), **See the photo**, **Dismiss page**, **Delete page and photo** |
| **Reading** (11d) | Leave it reading | The Inbox row's ⊞ works while it reads. Dismiss or delete stops the read at the next page |
| **Read, in review** | Edit the text, the chips, swipe to drop (Undo), hold to select → Type · Date · Project · Drop, Select all, ✕, Add all, Inbox only, the photo (thumb, side by side on desktop, View full size), close | **Lines:** Add this line now (its ⊞, ⏎ on desktop). Drop is now **Dismiss**, remembered on the page, with Undo and **Bring back**. Change the type… is in the ⊞ too. Right-click a line on desktop. On a phone the ⊞ is the action sheet. **Selection:** an **Add** button, **A** selects all, Del. **Page:** a ⊞ in the head with See the photo, Scan another page, **Keep for later**, **Dismiss page**, **Delete page and photo** |
| **Partly added** | Couldn't happen: Add all was all or nothing | **Added already**: each line and where it went (in Tasks, on the calendar, in the Inbox, in the journal). The Inbox row says "2 added". Edits are kept for the session |
| **Everything added or dismissed** | Reviewed, gone | Same, by itself when the last line goes. Undo brings the page back |
| **Failed** | Try again / Later; the Inbox row's Try again | Plus the row's ⊞: Try again, See the photo, Dismiss, Delete |
| **Couldn't read** | Retake / Pick another photo; closing drops the photo | Plus the row's ⊞: Dismiss, Delete |
| **Several pages** | The strip, the page chips | The page ⊞ acts on all of them: "Dismiss pages", "Delete pages and photos" |
| **The ready entry** (Inbox row + badge) | Review | Dismiss or delete from the row; the badge drops with it |

## How it works

- **Where a line went** is kept on the capture: `items[n].done = {to, id}` (`to` is task / event / inbox /
  journal, `id` is the row it became) or `'skipped'` when dismissed.
  - It sits inside the `items` jsonb, so there's **no migration**.
  - `fileLines` is used for Add all, Inbox only, one line, or the selection. It writes through the usual
    helpers, then marks those lines.
  - `dismissLines` marks the lines skipped. Each has one toast with Undo, which puts back only those
    lines' marks (and the review state), so an Undo can't undo a later change.
  - When nothing is left, the page is reviewed, and the "Keep / Delete after reading" photo rule applies
    as before.
- **Dismiss page:** the page is reviewed and nothing more is added. The photo follows Settings.
- **Delete page and photo:**
  - The read is wiped (`items`, `drawings`, `title`) and the page is reviewed.
  - `expires_at` is set to 10 minutes from now, so the hourly sweep in `capture-image` removes the photo,
    the same way "Delete after reading" does.
  - The 10 minutes mean an Undo can never race the sweep. The toast says "the photo goes within the hour".
  - Undo writes the row back as it was. What was already added stays where it went.
  - The app never deletes photos itself: a delete while offline would leave them in Storage forever.
- **A read in progress** stops at the next page once its capture has been dismissed or deleted.
- **Pure helpers** (`paperMath`): `lineKey`, `markItems`, `pendingKeys`, and `planWrites` now says which
  lines each write comes from (`keys`).

### Desktop keys

The cheatsheet has no collisions: bare `a` isn't a global key, and `i` / `u` / `n` / `?` aren't used
here. The footer reads "↑↓ a line · ⏎ add · ⌫ dismiss · T type · A select all".

| Key | What it does |
|---|---|
| ↑ / ↓ | Rings a line |
| ⏎ | Adds the ringed line (or the selection). With nothing ringed, Add all still has the focus when the panel opens, so ⏎ adds them all, as 11m drew it |
| ⌫ / Del | Dismisses the ringed line (or the selection) |
| T | Changes the type |
| A | Selects all |
| Esc | Ends a selection first, then closes. Closing is "keep for later" |

## Changed on purpose (Kai may want to look)

- **"Drop" → "Dismiss"** everywhere in the review: swipe, menu, selection bar, toasts ("Line dismissed").
  It's the Inbox's word and Kai's. The 11e design said "drop".
- **The banner's glyph:** it says ⊞, the glyph the ⋯ button actually draws, as v1's banner did.
- **The phone line menu** is now the action sheet, not a popover (MK Action Sheet: "the ⋯ menu on a
  phone").
- **The older harnesses' expectations**, updated to match:
  - `paper-capture` (1 check): "Line dismissed".
  - `paper-gaps` (4 lines): the phone ⊞ selector, the bar's "Add Type Date Project Dismiss", "2 lines
    dismissed".

## Gate

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | **169 files / 2334 tests passed** (plain, no TZ matrix) |
| `npm run lint` | exit 0, **0 errors**, 24 warnings, none in `features/paper` |
| `npm run build` | ok |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | **0 new** (781 hits, 5 fixed since) |
| `deno check` | not run: no edge function touched, and deno isn't installed |
| `grep -c birthday_on app/src/lib/types.ts` / `'birthday_on: false'` in settings.ts | 1 / 1 |

New tests are in `paperMath.test.ts` (+4): line keys, `planWrites` keys (the journal joins its lines),
`markItems` (sets, clears, never mutates), and `pendingKeys` (the whole page, or a ticks review's leftovers).

### Browser harnesses

They ran against the mock dev server from this worktree: `npx vite --port 5296 --strictPort --mode mock
--host ::`, `app/.env.mock.local` copied in. They ran one at a time, and the server is stopped now.

| Harness | Result |
|---|---|
| **`paper-review/verify.mjs` (new)** | **97/97** |
| `paper-capture` | **122/122**. 121/122 before its "Line dropped" check was updated |
| `paper-gaps` | **80/80**. Before its phone ⊞ selector was updated, the run stopped at that selector |
| `journal-media` | **123/123** |
| `fix-inbox` | **69/69** |

The new harness covers phone (390, touch) and desktop (1280), day and night. Its mock keeps `captures`
writes, and three captures are seeded: read, failed, waiting.

- **Inbox rows:** each has its ⊞; the waiting row's menu has no Try again.
- **Delete page and photo:** the wiped read and a ≤10-minute expiry are written; Undo restores the row.
- **Failed page:** ⊞ → Try again → read → results. The page ⊞'s five items. Dismiss page → Undo.
- **Line ⊞:** its items. Add this line writes the task with its photo link, the `done` mark and "Added
  already". Undo deletes the task.
- **Dismissing:** swipe dismiss → Undo; dismiss → Bring back.
- **Keep for later:** edit a line's text, change a type from the ⊞, then Keep for later. On reopening,
  the edits and the dismissal are still there.
- **Selecting:** hold → "Add Type Date Project Dismiss". Select all, then ✕. Add two lines (the edited
  text is what's written). Dismiss three.
- **The last line:** adding it reviews the page and it leaves the Inbox. Undo brings it back as "1 thing
  · 2 added".
- **Desktop:** the badge 2 → 1 → 2 on Dismiss / Undo; See the photo; right-click a line (⏎ / T / ⌫ caps).
  Then ↓ ⏎ ⌫ Del A Esc Esc, reopen, Delete + Undo, and Add all writes only what's left.
- **Every screen:** no horizontal scroll, no text under 12 px, no page errors.

Screenshots are in `docs/log/assets/paper-review/`.

## Not done

- **Taking back an added line after its toast is gone:** delete it where it lives (Tasks, the calendar,
  the Inbox). "Added already" shows where that is. A journal line is joined into an entry, so there's
  no clean way to take one line back out.
- **Dismissing one page inside a multi-page capture:** the page ⊞ acts on the whole capture. Lines can
  be dismissed per line.
- **Pages waiting on this device while offline** (IndexedDB) have no dismiss or delete. They aren't in
  the Inbox; Settings shows the count.
- **The reading screen (11d)** has no Stop. Use the Inbox row's ⊞.
- **The 4-TZ vitest matrix** wasn't run; the plain run passed.

## Files

- `app/src/features/paper/PaperFlow.tsx`
- `app/src/features/paper/PaperInbox.tsx`
- `app/src/features/paper/PaperMenu.tsx` (new: the shared ⊞ menu, the action sheet on a phone, the
  context menu on desktop)
- `app/src/features/paper/api.ts`
- `app/src/features/paper/paperMath.ts`
- `app/src/features/paper/paperMath.test.ts`
- `app/src/features/paper/paperStore.ts`
- `app/src/features/paper/paper.css`
- `docs/log/assets/paper-review/` (`verify.mjs`, `verify-results.json`, screenshots)
- `docs/log/assets/paper-capture/verify.mjs`, `docs/log/assets/paper-gaps/verify.mjs` (the expectation
  updates above)
- this file and one line in `docs/log/INDEX.md`
