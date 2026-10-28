# shot-bugs handoff — 2026-10-28 22:10 (Cairo)

Branch `claude/shot-bugs` (worktree `.claude/worktrees/shot-bugs`, from `claude/kai-bugs-1012` 5f5d725e). Kai sent three screenshots of the Windows app (v1.5.0) and said "I found a couple bugs". Each one is below: what it was, the cause, the fix, and before/after shots in `docs/log/assets/shot-bugs/` (`before-*.png` = this branch with the fix stashed, the rest = after).

No migration. No release, no merge.

## 1 · A task drawn twice (shot 22) — fixed

- **What:** "Study VLSI lecture 3" was a row in the "Study Session" Time block and also a translucent block at 8:45–9:15 PM.
- **Cause:** every card dragged onto the grid (rail, day tray, planning, a slot's held row) uses one FullCalendar `Draggable` (`calendar/cardDrag` `CARD_DRAG`). Its `eventData` left FullCalendar's `create` at its default `true`, so on drop FullCalendar added its own copy of the card to the grid as well as calling our `drop`. When `drop` wrote something, the refetch replaced it and nobody saw it. When it wrote nothing, the copy stayed. That happens when a held row is let go inside the slot that already holds it (`gridDrop` returns null). The copy was 30 minutes long from the drop point, hence 8:45–9:15.
- **Fix:** `cardDragData` returns `create: false` (`calendar/planningMode.ts`). The drop only reports, and `gridDrop` stays the one writer. One line, at the shared root, so every card source is covered.
- **Proof:** b1, at 100% and 150%. Within the slot: nothing written, no stray block, the task drawn once. Out onto empty time: one block, drawn once.
- Shots: `before-b1-within-after.png` (the stray block) → `b1-within-after.png`, `b1-out-after.png`.

## 2 · Hour labels cut to "M" (shot 22) — not a bug

- Shot 22 is a crop of the same window as shot 23. Its column is 833px wide (23's is 828), and the hour lines sit 130px apart in both. The crop's left edge falls inside the gutter, so only the "M" of "7 PM" is in the image.
- **Proof:** b2 checks every hour label is whole, inside its box and the gutter. It passes on desktop 1920 with the rail open and on phone 390, at 100% and 150%.
- Shot: `b2-labels-150.png`.

## 3 · The sidebar's brand under the title bar (shot 23) — fixed

- **What:** "K · Kai's Flow" was half hidden under the Windows title bar.
- **Cause:** the main window keeps the native title bar (`decorations` on), so the page never runs under it. The header sat inside the sidebar's scrolling column (`.app-sidebar-col`). At Kai's scale the nav overflows, the column had been scrolled about 60px, and the header scrolled up against the title bar.
- **Fix:** the header is pinned above the scrolling column (`.app-sidebar-top`), as the foot is pinned below it (`components/AppLayout.tsx`). The 24px top (16px in a short window) moved with it, so an unscrolled sidebar lays out as before.
- **Proof:** b3, in a 700px-tall window at 100% and 150%: the column scrolled to its end, the header is still whole at the top.
- Shots: `before-b3-sidebar-scrolled-150.png` → `b3-sidebar-scrolled-150.png`.

## 4 · An over-full Time block hides its tasks (shot 23) — fixed, smallest version

- **What:** "Study Session" was shortened to 45m but held 1h 30m. It showed "3 tasks · 1h 30m of 45m", and its rows were cut off with no way to reach them.
- **Cause:** a block is as tall as its time. The rows are drawn inside it and clipped (`overflow: hidden`). Even a full 1h 30m block clips its third row at 100%.
- **Fix:**
  - `slots.slotOver()` gives "45m over" when the held tasks outrun the slot.
  - The fill now reads "3 tasks · 1h 30m of 45m · **45m over**". The over part is in `--blk-ran-ink`, palette C's "Ran over" terra (AA on every fill), on desktop and phone.
  - On desktop, an over-full block (`.kf-slot-over`) opens out to all its rows under the pointer or keyboard focus. It draws on paper, over what is below, and goes back to its own 45 minutes when the pointer leaves. It is CSS only. Not redesigned.
- **Proof:** b4, at 100% and 150%.
  - The text and its colour.
  - On hover, all 3 rows sit inside the block, and each box is the element hit at its point.
  - The last row's box ticks its task.
  - The block's height comes back.
  - A full (not over) block says nothing more.
  - Phone: "30m over" on a 1h slot.
  - A unit test for `slotOver` is in `slots.test.ts`.
- **Phone, not changed:** a phone block under 56px is one line and draws no fill and no rows, by design (`PhoneGrid` `stacked`). So the phone's 45m example shows neither. Its tasks are still on Today and Tasks.
- Shots: `before-b4-over-hover.png` → `b4-over-hover.png`, `b4-over-rest.png`, `b4-phone-over.png`.

## 5 · The stray pill at the bottom centre (shot 23) — not Kai's Flow

- The dark pill with the lilac dot sits at x=960, the exact centre of the screen. It is **Sotto's idle overlay pill**: Sotto's "keep the idle pill on screen" mode (N1), anchored "bottom-center" (`D:\Coding\sotto\src\main.rs`, `overlay.js`).
- It is a separate always-on-top window, so nothing in this app draws it. To hide or move it, change it in Sotto's settings (always-visible off, or another anchor).

## 6 · The Ongoing card (shots 23 vs 24) — fixed to the drawn card A

- **The spec** (`design-export/Calendar extras options.html` §4, `.nc .rg` / `.kc`):
  - an event or Time block wears a ring in its colour (`.rg`: decoration, no control);
  - a task wears a square box (`.kc`: 15px, 5px corners, 2px edge) and offers ▶ Focus.
- **What was off:** the task's box was the kit `Checkbox` with `--radius-check` 7px corners. On a 15px box that is a circle, the same shape as the Time block's ring. So in shot 23 the Time block appeared to offer a tick, and in shot 24 the task's tick looked like the ring.
- **Fix:** the card's task box takes the drawn 5px corners and 2px edge (`NowCard.tsx`). The Time block keeps its ring. It was never clickable (aria-hidden, no role), and now it no longer looks like a box. The phone's kit override (22px, 7px corners) is already a rounded square.
- **"Next sits half under the card":** as drawn. Next is a strip hung under the card, tucked 10px behind it (`.nx` margin −10px, 16px top padding). It is unchanged.
- **Proof:** b6, at 100% and 150%.
  - Time block: ring, no box, no Focus.
  - Task: a 15px box with 5px corners and a 2px edge, role checkbox, ▶ Focus.
  - Next tucked exactly 10px.
  - Phone (ph): the Time block's ring, no box.
- Shots: `before-b6-now-task-150.png` (round) → `b6-now-task-150.png` (square), `b6-now-block-150.png`.

## 7 · "Lists…" (shot 23) — not a stub

- It is the rail's opener for an empty Lists section (cal-wave item 18, see the cal-wave handoff). An empty Lists section steps aside, and "Lists…" brings it back with its scope picker.
- **Proof:** b7 clicks it and the scope picker appears.
- If Kai finds it reads like a placeholder, a clearer label ("Show lists") is a one-word change. I left it, because the look is his.

## 8 · Anything else in the three shots

- "8 blocks · 0m free" at 7:49 PM is right. The rail counts free time inside 08:00–20:00 from now (p7e A15), and at 7:49 the Study Session covers the last 11 minutes.
- Nothing else was found.

## Gate

- `gate.ps1`: green.
  - vitest: 189 files / 2673 tests in each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo.
  - lint exit 0, build OK.
  - ds:check 0 new. The Now card box's 5px corners are marked `ds-ok` as the drawn `.kc`.
- birthday_on greps in `types.ts` / `settings.ts`: 1 / 1.

## Harnesses

All were run on `vite --mode mock` at http://localhost:5330, dual-stack, one at a time.

- **shot-bugs** (new, `docs/log/assets/shot-bugs/verify.mjs`): **54/54**. It covers b1–b4, b6 and b7 on desktop 1920×1080 at 100% and 150%, and ph on phone 390 at 100% and 150%.
  - Its mock day is Tue 27 Oct 2026, 19:45 Cairo, with:
    - a ticked Gym task block;
    - "Study Session" holding three 30-minute lectures, the now line inside it;
    - "Commute with your girl";
    - an over-full variant cut to 45m.
  - `ONLY=look` also takes plain screenshots.
- **Re-run alone, all green:** drag-fix 176/176, cal-clicks 96/96, cal-blocks 93/93, time-slots 153/153.
  - time-slots f14 failed on the base too, before this work. phone-today puts the goal row's meta in capitals (CSS), and the check's regex was case-sensitive. The check now matches case-insensitively. The app is right.
