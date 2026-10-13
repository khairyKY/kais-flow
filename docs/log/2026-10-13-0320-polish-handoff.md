---
date: 2026-10-13 03:20 UTC
session: polish (builder, worktree .claude/worktrees/polish)
type: handoff
related: 2026-10-12-2148-ds-fix-2-handoff.md (focus card) · 2026-10-12-1922-local-audit-product.md (Inbox row) · 2026-10-12-2202-paper-gaps-handoff.md ("Still unbuilt") · design-export/Inbox.dc.html t3 · design-export/Paper Capture.dc.html 11d/11e/11m
branch: claude/polish (from origin/claude/kai-bugs-1012 @ 626c526d)
---

# Polish pass: items 1–3 (Focus fit, Inbox snoozed + Someday, Paper leftovers)

Mid-session scope change from the conductor: **finish item 3 and stop.** Items 4–8 went to other
branches (night → claude/night-2, items 5/6/8 → claude/drag-polish, item 7 → the conductor). This
branch carries **items 1–3 only.**

I had already built 4–8 before the message came. Those commits are **not pushed**. They sit on a
local-only branch in this worktree, **`claude/polish-items4-8-local`** @ `9f7d2a5b`, in case the
new owners want them:

| SHA | What |
|---|---|
| `79390a96` | night: frosted sidebar row + glowing dots, rim-lit header plants, ⌘K night scrim + dim. Day 12/12 at 0 px |
| `c174ade2` | DomainList rows → DropZone |
| `76986997` | Top 3 drag on the shared kit |
| `0558175d` | dead `planningColumns` / `scheduleThisWeek` removed |
| `9f7d2a5b` | @dnd-kit out of the entry. Entry 140.48 → 127.06 kB gzip; motion 48/48 |

Their gates ran green on that tree: vitest 1980 × 4 TZ, lint 0, build, ds:check 0 NEW, motion
48/48, fix-inbox 69/69, paper-gaps 80/80. Nothing from 4–8 is in what I pushed.

## Commits (pushed)

| SHA | Item |
|---|---|
| `0ac80c1b` | 1. Focus settings card fits 360/390/430 (and the computer) |
| `21545268` | 2. Inbox: "· N snoozed" → Snoozed view; Someday = a someday task |
| `a147eefb` | 3. Paper: 11e skipped drawings → Add as image (migration 0070); 11m desktop keys; 11d badge counts a ready page |
| (docs) | this handoff, the INDEX line, `docs/log/assets/polish/` |

## 1. Focus settings card (`features/focus/FocusPage.tsx`)

**The cause.** Two things pushed the card off the screen:

- The Long-break row of chips plus the custom field didn't fit half the card. At 390 px it ran
  **178 px** past the card's edge. On the computer it ran **90 px** past.
- On a phone the page itself was 32 px short of the right edge. `width:100%` and the bleed's negative
  margins together left that gap, so the card sat off-centre at x = 0.

**The fix:**

- On a phone the two break groups stack (`.fp-breaks` → one column).
- The chip rows wrap.
- On a phone the bleed is `width:auto`.

There are no new values. On the computer the 2-column layout stays as 1e draws it, and the custom
minutes field wraps under its chips.

**Evidence.** `f1` passes 16/16: 360/390/430 × day/night plus desktop.

- The card sits inside the screen and is centred.
- No descendant runs past its edge.
- `scrollWidth` equals the viewport.
- The top is not clipped, and "reset to classic" can be scrolled to and tapped.

The same check against the old file fails 8/8: card at x = 0, 89–208 px of overflow.

## 2. Inbox snoozed + Someday (`features/inbox/*`, `tasks/api.ts`)

t3 draws no snoozed state, so this follows the brief and reuses the Dismissed view's own parts.

**The count line gains "· N snoozed".** It is a dotted-underline button that opens the Snoozed view.

- N counts pending captures whose `snoozed_until` is in the future (`snoozedOf`, pure and tested).
- A capture whose time has passed is already back in Waiting, and it is not counted.

**The Snoozed view** uses DismissedRow, now taking `meta`, `mark` and `act` props:

- Each row is marked with a clock and reads "back Tomorrow · 09:00" or "back Mon 19 Oct · 09:00",
  on the user's clock (`backLabel` = `dueLabel`, tested).
- Rows are soonest-back first.
- To bring a capture back now, use **Unsnooze** (computer), **R**, swipe → (phone), or bulk Restore.
  This reuses `restoreInboxItem` / `restoreMany`, so the toast reads "Restored to Inbox" with Undo,
  and the Undo puts the snooze time back.

**Back to Waiting**, the same toggle as t3:

- On the computer, the segmented control shows a third "Snoozed N" segment only while you're in the
  view. Tapping Waiting returns and the segment goes.
- On a phone, the header link reads "Waiting N".

**Someday.** The card's Snooze menu, S, and bulk Snooze all file the capture as a **someday task**.
They used to set a 365-day snooze. The path:

- `fileMany` → `fileToTask(…, { someday: true })` → `createTask({ someday })`. That is a new optional
  input, defaulting to false.
- The task keeps the card's title and place, and gets **no date**, even when the AI read one.
- The toast reads `Filed "Learn the cello" to Someday · Forecasting App` (a selection: "N captures
  filed to Someday"). Undo deletes the task and the capture waits again.

**Not changed:** the motion handoff's note stands. The sidebar's Someday row still doesn't take an
Inbox drag; that's a drag-polish call.

**Evidence:**

- `i1`–`i3`: 22/22, desktop and phone, day and night. Covers the count, the view, Unsnooze + Undo
  restoring the exact time, R, the toggle back, the phone link, and nothing off the edge.
- `i2`: the someday task as written (`someday: true`, `due_at: null`, the project), the toast, and Undo.
- Tests: `inboxDisplay.test.ts` +2, `api.filing.test.ts` +2.

## 3. Paper leftovers

### 11e "1 drawing skipped (CPU → ready → run) · Add as image"

**What the read reports.** `capture-image`'s prompt now asks for `drawings`. These are the diagrams,
sketches, charts and labelled drawings it skips (not margin doodles), each as `{what, box}` on the
same 0–1000 grid.

- `normaliseRead` keeps up to 6 per page.
- `afterPage` replaces a re-read page's drawings, the way it does `items`.
- The function stores them in `captures.drawings` and returns them.
- Nothing counts drawings. "N things" and the paper-ready notice still count lines.

**Migration `0070_capture_drawings.sql`:**

- `alter table captures add column if not exists drawings jsonb not null default '[]'` plus an
  array check.
- It is strictly additive: a constant default, so no row is rewritten.
- It is idempotent, and the client reads the column as optional.
- PGlite check: `docs/log/assets/polish/0070-pglite-check.mjs`, 5/5. A pre-0070 row reads `[]`;
  a run twice is fine; an object or null is refused.
- `docs/DATA_MODEL.md` has its entry.

**What the results show.**

- One row per drawing under the lines, as 11e draws it.
- **Add as image** writes an Inbox note in the 0049 photo-note shape: `raw_text` "Drawing: …" and
  `payload {source:'photo', source_ref, page, box, title, drawing:true}`. Its 📷 link opens the page.
- It has its own toast and Undo, and the row then reads "In the Inbox".
- If a drawing was added, Add all keeps the photo even under "Delete after reading". That photo is
  what the note shows, for its usual 7 days.

### 11m keys, on the computer only, through `useListKeys`

The footer shows "⏎ Add all · ⌫ drop line · T change type".

- **Add all** has the focus when the results open, so ⏎ works at once.
- **↑ / ↓** move a focus ring over the lines.
- **⌫ / Delete** drops the ringed line ("Line dropped" + Undo) and the ring moves on. With a
  selection, it drops the selection.
- **T** opens the type menu for that line, or for the selection.
- While any menu is up, the keys stand down.

### 11d badge

**Built, and clean.** The badge counts pending captures plus pages read and waiting for review.

- The captures list query moved to `features/paper/captures.ts`, which imports only supabase and
  react-query.
- `paper/api.ts` shares it: same key, same queryFn. Reading progress and Add all therefore move the
  badge live.
- A build check confirms no paper flow or api code is in the entry or any modulepreload. The
  `kf-paper-queue` string appears only in the lazy `api-*.js` chunk.
- The first-load bundle didn't move: entry 140.41 kB gzip on this tree. At the item boundary it
  measured 140.48 with items 4–7 present.

### Evidence for item 3

`p1`–`p4`: 24/24.

- **Badge:** "2" for 1 capture + 1 ready page, on the sidebar and the tab bar.
- **Drawing row:** shows on phone and desktop, day and night. Add as image writes the payload
  exactly; Undo works.
- **Photo kept:** Delete after reading keeps `expires_at` with a drawing added, and drops it without.
- **Keys:** the hint text, the focus, ↓↓⌫ dropping "Assignment 2" with the ring moving on, T → Event
  on the ringed line, ⌫ under an open menu dropping nothing, and ⏎ writing what's left.
- **Tests:** `read.test.ts` +2, and one expectation updated for the `drawings` field.

## Gates (tree @ `a147eefb` + docs)

| Check | Result |
|---|---|
| `npx vitest run` | **1987 passed**, 149 files, in each of Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo (PowerShell `$env:TZ`; offsets −180 / 0 / 420 / −540) |
| `npm run lint` | exit 0, 0 errors (21 warnings, the same count as before) |
| `npm run build` | OK |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | **0 NEW** |
| Harnesses (mock backend, dev server from this worktree `--mode mock` on http://localhost:5265) | fix-inbox **69/69** · paper-gaps **80/80** · fix-grammar **97/97** (focus) · polish `verify.mjs` **62/62** |

`docs/log/assets/polish/verify.mjs` reruns everything:
`node verify.mjs <out> http://localhost:5265`, with `ONLY=f1,i1,…` for a subset. Results are in
`results.json`; the shots are the `*.png` files.

## [KAI] / release order

1. `npx supabase db push --include-all` (0070).
2. Then `npx supabase functions deploy capture-image`. The function selects and writes the column,
   so it must not go out before 0070.
3. The frontend can ship on either side.

Until the deploy, there are no drawing rows, and everything else works.

## Not verified

- **Groq's real vision model actually reporting `drawings` well.** The harness answers for it.
- **Deno type-check of `capture-image/index.ts`.** Deno isn't on this machine; `read.ts` is checked
  through the app's tsc and vitest.
- **Real devices, Kai's account, Kai's eyes.**

## Files written

**Code:**

- `app/src/features/focus/FocusPage.tsx`
- `app/src/features/inbox/InboxPage.tsx`
- `app/src/features/inbox/InboxCards.tsx`
- `app/src/features/inbox/Inbox.css`
- `app/src/features/inbox/api.ts`
- `app/src/features/inbox/inboxDisplay.ts`
- `app/src/features/inbox/inboxDisplay.test.ts`
- `app/src/features/inbox/api.filing.test.ts`
- `app/src/features/tasks/api.ts`
- `app/src/features/paper/PaperFlow.tsx`
- `app/src/features/paper/api.ts`
- `app/src/features/paper/captures.ts` (new)
- `app/src/features/paper/paperMath.ts`
- `app/src/features/paper/paper.css`
- `app/src/features/paper/read.test.ts`
- `app/src/components/AppLayout.tsx` (the badge only)
- `supabase/functions/capture-image/read.ts`
- `supabase/functions/capture-image/index.ts`
- `supabase/migrations/0070_capture_drawings.sql` (new)

**Docs:**

- `docs/DATA_MODEL.md` (one 0070 entry)
- `docs/log/assets/polish/verify.mjs`
- `docs/log/assets/polish/0070-pglite-check.mjs`
- `docs/log/assets/polish/results.json`
- `docs/log/assets/polish/*.png` (9)
- this file
- one line in `docs/log/INDEX.md`

**Untracked:** `app/.env.mock.local`, copied in for the harness (gitignored).
