---
date: 2026-10-12 19:29 UTC
session: notebook-page
type: handoff
related: Kai 2026-10-12 "where is the copy into my journal feature"; vault brainstorm "Notebook page & Paper capture" §A + phase "Notebook page v1 (S–M)"; Claude Design prompt 10 (not run); Paper Capture.dc.html 11l / 11o
---

# Notebook page v1 + "Bring back your ticks": handoff

Branch `claude/notebook-page` (from `origin/claude/kai-bugs-1012`, 493250f8). Pushed. Not merged, no PR.

> **NO DESIGN YET.** Claude Design prompt 10 ("10 — Notebook page") was written on 2026-10-03 and never
> run, so there's no `design-export/Notebook Page.dc.html`. Per the IDENTITY GUARD, this v1 is built only
> from existing kit parts (BottomSheet, Segmented, Toggle, Chip, Button, ContextMenu, Skeleton, the
> rituals' summary) and tokens: plain and calm. **It's waiting for a design pass:** run prompt 10, then
> rewrite only the view (`NotebookPage.tsx`, `LayoutEditor.tsx`, `notebook.css`). The model, the storage
> and the entry points stay as they are.

Kai asked for the feature he brainstormed on 2026-10-03: the day's plan as a page he copies by hand into
his A5 notebook. It also closes the loop Paper capture's handoff left open (11l "Bring back your ticks").

## What's there

**`/notebook?day=today|tomorrow`** (lazy route, `features/notebook/`):
- **Phone:** a full-height `BottomSheet` titled "Notebook page". It has a Today | Tomorrow segmented
  control, then Print and Edit layout. Sticky footer (11o): "Bring back your ticks · photo of a done
  page" and **Copy as text**. ✕ goes back, or to Today when the page was opened directly.
- **Desktop:** an A5 page (148:210; a long day grows past it) with a side column: Today | Tomorrow,
  **Copy as text**, **Print / Save PDF ▾** (A5 · A6 · Letter), Edit layout, and Bring back your ticks.
  While editing, the editor sits left of the live page.
- **The page** is drawn at reading size for copying by hand: Source Serif at `--fs-lead` (18px, so
  22.5px at the desktop's 125%), line height 1.5, real ☐ boxes, times in one mono column. It stays
  **light paper at night**: `data-theme="day"` on the page, and `tokens/colors.css` now declares
  `:root, [data-theme="day"]`. The chrome around it goes dark.
- **Kai's page** (the default preset) is exactly his format from `Journal/The Notebook.md`:
  `MON · 12 OCT   woke __ · slept __`, then **TASKS** (the Top 3 first, the goal marked ✶, then the
  day's due/scheduled tasks), **HABITS** (one row of his routines that are due that day, so "rep" only
  on Mon–Wed + Sat), **NOTES** (ruled lines), and the four night lines (+ − → ♡). **No preset ever adds
  prayer.** Habits come only from the user's own routines, and a test pins this.
- **Other presets:** Bullet journal (• task, ○ event, – note, × done, the long date, Top 3 + the day's
  plan), and Minimal (date, Top 3, tasks).
- **Blocks:** Date (full date; woke/slept blanks), Top 3 & plan (the plan on/off; 24h / 12h), Habits
  (one row / a list), Tasks (up to 5 / 10 / 15, then "+ N more in the app"), Notes (0 / 4 / 6 / 8 / 12
  lines), Night lines. Each block can be turned on or off and moved up or down. A change saves at once.
- **States:**
  - **Not planned yet** (today, no Top 3, Plan my day not walked): a quiet "Not planned yet · Plan
    first?" link that opens Plan my day. The page still works.
  - **Empty day:** blank ☐ lines to fill in.
  - **Loading:** the kit Skeleton.
  - **Offline:** works from the cache.
  - **Copied:** a toast, "Copied — paste it anywhere".
- **Fun touches** (all from existing assets, all from real data):
  - The Caveat line "Day N · written by hand ✿". N counts from the account's `created_at` in the
    user's zone, the first day being Day 1. It's left out when unknown.
  - The fern-coil asset in the bottom corner. It's hidden in print.
  - A haptic `tick()` on copy (the native shells only).
  - After Copy or Print, a small "✎ on paper" stamp on that day's page.
- **What "the day" means:** "today" = the user's calendar day (`zoneDateKey`, the same as the Today page);
  "tomorrow" = today + 1. Today's Top 3 = `dayTop3` (exactly what Today draws). Before Plan my day it falls
  back to last night's seeds for today. Tomorrow's Top 3 = the seeds Shut down planted for it. Tasks = open,
  not someday, due or scheduled on that day **in the user's zone**. Overdue tasks stay with Plan my day's
  carry-over, not on the page.

**Copy as text** (`pageText`, tested to the character; the harness also checks the exact string handed to
the clipboard):
```
MON · 12 OCT   woke __ · slept __

TASKS
☐ ✶ GCI homework 1 — NumPy
☐ Do GCI lecture 2’s survey
…
HABITS
☐ Qur’an   ☐ rep   ☐ move   ☐ read

NOTES

+  what happened
−  what got in the way
→  tomorrow’s three
♡  one true line
```
Ruled lines are left out of the text, since they're for paper only.

**Print / Save PDF:**
- Print CSS only. One `@page { size: A5|A6|letter portrait }` rule is swapped in per print, then
  `window.print()` runs: the browser's and Windows' own dialog, $0, no PDF library.
- A print-only copy of the page is portalled to `<body>`. While it's mounted,
  `html:has(.nb-print-root)` hides everything else in print.
- The printed page has no flourish, no stamp, and no paper fill or shadow. Ink is `--ink-body` on white.
- Hidden in the Capacitor (Android) shell, because its WebView has no print. **Not verified in the Tauri
  Windows shell:** WebView2 implements `window.print()`, but nobody has clicked it there yet.

**Storage (migration 0063, `supabase/migrations/0063_notebook_layout.sql`):**
- `app_settings.notebook_layout jsonb` (null = Kai's page). It's read through `parseLayout`, which turns
  anything malformed into Kai's page.
- The client keeps a copy per device (`kf-notebook-layout:<uid>`). It writes the column through
  `writeRow` only once the server's row carries the key, the 0058 `help_seen` pattern, so **nothing
  breaks before `db push`**.
- The "✎ on paper" stamp is **per device** (`kf-notebook-stamps:<uid>`, the last 30 days). Read it with
  `useOnPaper(day)` from `features/notebook/store.ts`. That's the hook for the Today redesign's stamp.
- `docs/DATA_MODEL.md` is updated.

## Entry points

- **Plan my day** (`MorningRitual.tsx`):
  - Before: "Start the day" closed the sheet.
  - Now it lands on a success moment built from the evening summary's parts (clover, "The day has a
    shape.", "N picked · N on the calendar").
  - **Write it in your notebook** (secondary, journal glyph) sits beside **Done**.
- **Shut down** (`EveningRitual.tsx`):
  - The summary moment gets a quiet "Write tomorrow’s page ›" link to `/notebook?day=tomorrow`.
  - Between 00:00 and 04:00, when the morning those seeds are for is already today on the calendar, it
    goes to `?day=today` instead.
- **⌘K** (`CommandBar.tsx`): typing "no…" offers the jump "Notebook page".
- **Not touched:** `features/today/*` (another builder: the Today header icon + `N` key just need to
  point at `/notebook`) and Settings (another builder; the layout editor lives on the page).

## 11l · Bring back your ticks

- **capture-image** (`supabase/functions/capture-image/read.ts`), still Groq-only:
  - The prompt asks for each line's `checked`: true = ticked, crossed or filled in; false = an empty box;
    null = no box. The box glyph stays out of the text.
  - `normaliseRead` keeps it, and anything else becomes null. Older rows lack the field, and the client
    type has it optional.
  - Covered in `paper/read.test.ts`. **[KAI] `npx supabase functions deploy capture-image`**. Until then
    the live function never reports boxes, and the ticks review honestly says "No ticks found on this
    page".
- **Matching** (`features/notebook/ticks.ts`, pure, `ticks.test.ts` uses 11l's own page):
  - A line and a title match on the better of shared words (over the longer of the two) or Dice on
    letter pairs, with 0.6 as the cutoff. That catches "✶ GCI homework 1" → "GCI homework 1 — NumPy",
    "GCI lecture 2 survey" → "Do GCI lecture 2’s survey" and "Reply to Omer" → "Reply to Omar".
  - Pairing is one line per task, best pairs first.
  - Lines that are the page's own print (headings, habits, night prompts) are not "new". That check uses
    words only, so "what happened: met Omar" still counts as something written.
- **The flow:**
  1. The page's footer calls `pickPhotos('camera', target)`, where the target holds the day, "Monday’s
     page", the page's task ids and titles, and its print.
  2. The capture is bound to that target at Read (`paperStore.ticksFor`), so the results open as the
     **ticks review**, even after "Leave it reading" and the toast's Review.
  3. The review shows "4 ticked on paper → mark done?" and "Matched to Monday’s page". Each row has a
     checkbox, the task, its handwriting crop and the paper's line. It also shows "1 still open on paper
     · left as they are" and "New on the page · 1".
  4. **Mark N done** calls `completeTask` per task, with **one Undo** for all of them.
  5. New scribbles then open as the usual results (only those lines). Otherwise the capture is marked
     reviewed.
  6. **Not now** leaves the capture in the Inbox's "ready to review" row, and opening it again shows the
     ticks review.
  7. A retake after "Couldn't read" stays a Notebook-page capture.
- **No page code** (`kf·1003·a`): the photo is matched to the day the user chose on the page. Page codes
  are the brainstorm's phase 5.
- **A shared fix it needed** (`components/ToastHost.tsx`): a phone toast handed from one screen to a
  sheet that is opening (ticks review → results) docked off that sheet's footer while it was still
  sliding up, so it landed below the screen with its Undo unreachable. ToastHost now measures again once
  the sheet has slid up (320 ms after a portal change). The fix is in the one place every toast goes
  through.

## Skipped / later

- **Share as image:** skipped. There's nothing to build it from (no canvas/image library, and `html2canvas`
  would be a new dependency). Copy and Print cover the job.
- **Sound on copy:** skipped. Sounds v2 has no paper sound, and borrowing "capture" would say the wrong
  thing. Only the haptic tick is in.
- **Out of v1 scope** (from the brainstorm): the Data block (user metrics, needs a `metrics` table), A
  memory, the weather line, the habits week grid, ink weight, up to 3 saved layouts, group-by-project,
  page codes.
- **Ticking habits from a photo** (routine completions): not done. 11l's job was the ☐ tasks.
- **Evening summary:** it still auto-closes after 3 s (its own ruling 5), so "Write tomorrow’s page" has
  to be tapped in that time. If that's too quick in practice, pause the timer on touch.

## Verified

- `npx vitest run`: **1557 passed** under TZ = UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo
  (PowerShell `$env:TZ`, each zone's offset printed: 0 / −180 / 420 / −540). That's 1532 before plus 25
  new: page 18, ticks 6, read 1.
  - `rituals/reviewWeek.test.ts` fails to load without `VITE_SUPABASE_*`. **This was already true before
    this branch**, on the base too, and CI sets no such env either, so it fails there as well (flag for
    whoever owns it).
  - With the two vars set, **1560 / 128 files pass**.
- `npm run lint`: 0 errors, 22 warnings (baseline 22).
- `npm run build`: green. The page is its own chunk (`NotebookPage-*.js/css`), so the initial bundle only
  gains the route line, the jump row and the small paper/toast edits.
- **Browser harness on the real app against the mock backend**:
  - Ran with `node docs/log/assets/notebook-page/verify.mjs <out> http://localhost:5252` (dev server from
    this worktree, `--mode mock`, `app/.env.mock.local`). **83/83**, `results.json` alongside.
  - n1: desktop day, Kai's page, the exact Copy text, the toast, the stamp, no writes.
  - n2: night (page `rgb(251,246,233)`, chrome `rgb(33,29,48)`).
  - n3: Tomorrow (Tue, the seed leads).
  - n4: the print menu A5 · A6 · Letter, `@page` A6, `window.print` called, print media showing only the
    page, and an A5 PDF (`n4-print-a5.pdf`).
  - n5: the layout editor (Bullet journal, aligned times, toggle and move). It's saved to
    `app_settings.notebook_layout` through the outbox and read back on a fresh device.
  - n6: phone 390×844 day and night, the editor in the sheet, ✕ back to Today, no text under 12px, no
    horizontal scroll.
  - n7: Plan my day's success state → `/notebook`, desktop and phone.
  - n8: ⌘K.
  - n9: Shut down → `?day=tomorrow`.
  - n10: 11l end to end, phone and desktop. A photo of the page goes through Read, then "4 ticked", one
    unticked, Mark 3 done (3 `status: done` writes), "3 done — ticked on paper" with Undo reopening all 3,
    then the one new scribble as a result.
  - n11: not planned → Plan first? → Plan my day.
  - Screenshots are in `docs/log/assets/notebook-page/`.

## Not verified / for Kai

- **[KAI] `npx supabase db push --include-all`** for 0063. Until then the layout is per device, and that
  works.
- **[KAI] `npx supabase functions deploy capture-image`** for the `checked` field. Until then a photo
  finds no ticks.
- **Not checked:**
  - Print from the Windows (Tauri) shell.
  - A real Groq read of a real ticked page: how well the model reports boxes is untested, since the
    harness answers capture-image itself.
  - Kai's real account.
- **Harness to update:** `docs/log/assets/rituals/verify.mjs`, the check "Start the day: … the sheet is
  gone". That ritual now stops at the success moment, so the harness needs one extra tap on **Done**
  before that check. I didn't edit another session's harness.
- **Design:** prompt 10 is ready to paste into Claude Design. When the export comes back, rewrite the
  view and keep `page.ts` / `store.ts` / `ticks.ts`.
