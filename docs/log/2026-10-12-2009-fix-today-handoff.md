---
date: 2026-10-12T20:09Z
session: builder fix-today (Today 2a + MK Now Card + Today review fixes)
type: handoff
related: design-export/Today.dc.html §2a · MK Now Card.dc.html · MK Workload.dc.html · docs/DAILY-CYCLE.md · 2026-09-26 Loop A/B · 2026-09-28 today-phone · 2026-10-07 plan-replan · review of 81a4d844
---

# Today 2a on desktop, the Now card states, and the Today review fixes

Branch `claude/fix-today`, cut from `origin/claude/kai-bugs-1012` (81a4d844). Pushed, not merged, no PR. No migration. Files owned: `app/src/features/today/*` (+ harnesses under `docs/log/assets/`).

| SHA | What |
|---|---|
| ced71548 | Today 2a on desktop + the MK Now Card states + the review fixes (all app code) |
| 4bf44e72 | `fix-today/verify.mjs` (115/115) + `side.mjs`; `today-phone/verify.mjs` and `loop-a/r2.mjs` follow the intentional changes |
| (this) | this handoff + the INDEX line |

## What changed

**Desktop Today = Today.dc.html 2a**, wired to real data:
- **Header:** one date (the "TODAY" eyebrow is gone). Under it a one-line summary: "2 of 6 done · next up Sync with Omar at 13:00". The count is today's own work: Top 3, due today, or scheduled today, plus what was finished today. Overdue isn't counted (`todayLayout.dayCounts`).
  - On the right: the typed **"+ Add a task…"** pill (opens the capture bar), with the mic inside (opens the voice sheet), and the Notebook button.
- **Terrarium band removed.** `terrariumStore.ts` is deleted too. Its toggle had no UI anywhere, so nothing is left dangling.
- **Now card:**
  - **Head** = the moment while something runs (states below). At Plan / Shut down / Day closed the head is the Day card's next move (`DayCard.tsx DeskRitualHead`: Plan your day · Begin / Resume, and so on).
  - **Ribbon:** 8–20, every timed block today in its calendar colour. The card's block is outlined in terra with its spent part filled, and a terra line marks now. Clicking a block opens it.
  - **The next two** (2a's replacement for the Up next list) + **Calendar →**. A task's block is the task: checkbox, click opens it, right-click gives the task menu. A plain event opens `/calendar?event=<id>`, and its right-click offers Open in calendar · Delete.
  - Blocks after the next two stay on the ribbon, and their tasks stay rows in Also open, so every task still shows as a row.
- **"Today's three · 1h 30m planned"** (`top3Planned`: each pick's block length, else its duration).
  - The goal card in 2a's anatomy: a 20 gold box, a serif 20 title, and a meta line led by "✶ Goal of the day". It shows the real due state, not a hard-coded "Due today".
  - No stars on Top 3 rows. "in progress" shows in terra while a pick's block runs or it is the task in focus. Drag, Alt+↑/↓ and Make goal are unchanged.
- **Overdue · N** fold with Replan all ▾ (unchanged).
- **"Also open · N":** three rows, then **"Show N more →"**. Each row has the title and its one fact right-aligned; ☆ appears on hover; ⋯ stays.
- **Rail:**
  - **Rituals** with Edit (→ Routines, where the pins live). Morning is open as a checklist of Plan my day's four steps. Evening shows "· from 17:00" and is folded until then.
  - **Routines** (unchanged).
  - **Worth a look · 1 of 2.** Slipping cards and the resurfaced memory share one slot, and "1 of 2" steps through them. The goal's / an open pick's own project is never nudged (2a rule 7).
    - **Plan a step** opens the project.
    - **Snooze a week** is the review mark (the card stays away while the project has been untouched for less than 7 days).
- **Sizes:** 20px boxes, sans meta in `--ink-muted`, tokens only. The header keeps the date on one line at 1280 @125%; the pill gives way (340 → 180).

**MK Now Card states** (pure `nowCard.ts` + `focusNow.ts`), the phone slip and the desktop card alike:

| State | When | Card |
|---|---|---|
| In progress | A block is running | Ring = time spent, minutes left inside |
| Running over | A task's block ended ≤ 60 min ago, the task is still open, and nothing has started since | Amber full ring "+20", "NOW · 20M OVER" |
| Paused | The focus round is paused inside a work block | Hairline ring frozen; "PAUSED · SINCE 11:02" when this device saw the pause |
| Just done | A Now item was checked within the toast's 4.2 s | Struck through, ↶ Undo, then the card moves on |

- A meeting, or another task's block, running at the same time outranks a paused round.
- **Not built (ruling):** "Next" (≤ 15 min count-down) and "Free" (gap → pick from Top 3). See conflict 1.

**MK Workload (phone):**
- The Today line turns amber with an alert and a mono "2H OVER" when the plan doesn't fit what's left of 09:00–18:00. That window is Plan my day's own capacity rule; an evening block isn't workload (`overCapacity`).
- A 2px progress hairline under the line shows today's done share.

**Weekly review** (conductor, 2026-10-12):
- Prompted on the user's review day, the first day of their weekend (`lib/weekend`): Fri + Sat → Friday, the default Sat + Sun → Saturday.
- Hidden once a `review.week_closed` row lands within the last 7 days (`reviewDue`; a small read, `today/api useWeekClosedAt`, since `useReviewEventsThisWeek` doesn't fetch that event).
- Desktop: a "Weekly review · today" row in the rail's Rituals. Phone: a flat ritual-card "Weekly review" with **Review**. Both go to `/weekly-review` (the real route; there is no `/review`).

**Notebook page entry** (conductor): a `journal` icon in the phone top bar beside search, and an icon button in the desktop header. **N on Today** (not while typing, no dialog or menu open) opens `/notebook?day=today`; it takes over the shell's global N on this page only.

**Review fixes (81a4d844):**
1. A row's ⋯ / right-click menu now acts on the selection. Today builds `BulkActions` like Tasks, including `onTop3` → `toggleTop3ManyWithUndo`, and passes them to every row, the goal card, the Now card's task and the next two.
2. Up next events link to `/calendar?event=<id>`: the next two, ribbon blocks, the phone event rows, and a plain-event slip or head.
3. Phone event rows get the row grammar: ⋯ (and right-click) → the action sheet Open in calendar · Delete. The menu is the row's sibling, so a tap in it never opens the row.
4. The goal card (phone and desktop) Ctrl/⌘-clicks into a selection.
5. User zone everywhere in my code:
   - Routines' done-today key is `zoneDateKey(now)`, not `localDateKey(new Date())`.
   - Today's "Overdue Nd" counts the user's days (`taskDayDiff`), not tasks/taskDisplay's device-local `daysOverdue`.

**Phone bulk bar Top 3:** `components/BulkBar.tsx` has no `onTop3` prop on this base (81a4d844). Today's bulk bar is not wired to it. Once that prop lands it is a one-line `onTop3={bulkTop3}` in `TodayPage.tsx` overlays; `bulkTop3` already exists.

## Evidence

- **Unit tests** (`npx vitest run`, PowerShell `$env:TZ`): Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo each give **126 files / 1554 tests** (base 1530; +24).
  - New `nowCard.test.ts` covers the four states, the idle null, the outranking rules, the Just done window, all-day events and an overnight block.
  - `todayLayout.test.ts` adds topCard, overCapacity, dayCounts, top3Planned, the ribbon and reviewDue (Fri + Sat / Sat + Sun / Sun / none, closed earlier this week, a Cairo-midnight edge).
- **Lint:** `npm run lint` → 0 errors, 21 warnings, none in `features/today`.
- **Build:** `npm run build` (tsc -b + vite + PWA) → ok.
- **`docs/log/assets/fix-today/verify.mjs` → 115/115.** Mock backend: dev server `--mode mock` on :5251 from this worktree, `http://localhost`, PostgREST filters honoured and writes applied. Desktop 1280×800 (125% default, checked); phone 390×844 with touch.
  - Desktop: plan / running / idle 11:18 / over / just done → idle / idle 14:10 / paused (Start focus → /focus → pause → back) / shut down / closed. Night: running, over, shut down.
  - Phone: plan (+ the event row's ⋯ sheet → `/calendar?event=`), running, idle, over, just done → gone, paused, over capacity. Night: running, over, over capacity.
  - Fixes: Ctrl+click goal → bulk bar · 1. Two picks selected → the menu reads "Plan… (2)", "Delete (2)"; Remove from Top 3 writes both, and Delete (2) bins both. An event → `/calendar?event=…`. N → `/notebook?day=today`. The pill focuses the capture input.
  - Weekly review: shown on its day, hidden once closed, hidden on other days (desktop + phone).
  - Every scene: no page scroll, no sideways scroll (the shell-fit rule), no page errors. `results.json` sits beside the harness.
- **Side by side** (`side.mjs`): `side-2a-desktop.png`, `side-2a-desktop-night.png`, `side-now-desktop.png`, `side-now-phone.png`.
- **`today-phone/verify.mjs` → 160/160** after the intentional updates (event row ⋯, Just done before the slip leaves, desktop Up next = the next two, the running block = the Now card).
  - One run of three failed "2d header: 2 of 3 done" ("0 of 1"): the line read before the star log arrived. It passed on the rerun. This is a timing sensitivity in the header, not something this branch changed.
- **Not runnable here:** `loop-a/r2.mjs`, `release-2/sweep.mjs` and `shell-fit/shellfit.mjs` sign in to a local Supabase stack, and there is no Docker on this machine.
  - `r2.mjs`: its Today selectors (Up next → `.td-now`, the fold → "Also open … Show N more") are updated. It was already stale since Wave N: the ritual screens and the card's Done button changed.
  - `sweep.mjs` and `shellfit.mjs`: route-generic, no selector breaks. Their fit checks are folded into `fix-today/verify.mjs` on the mock.

## Not verified

- Kai's real account and data (mock only).
- A real phone, and the Windows / Android shells.
- Live.
- "Paused · since" after a reload. The focus store isn't persisted, so a reload ends the round anyway.

## Design ↔ ruling conflicts (the ruling won; Kai may overrule)

1. **2a's Now card during the day vs Kai 2026-09-27 ("no card during the day") and 2026-09-28 (the slip "only while something runs", v1.0.10).** The card's head shows only while something runs (in progress / over / paused / just done).
   - Idle, the desktop card keeps only its ribbon and the next two. They are 2a's replacement for Up next, so dropping them would lose Up next.
   - The MK "Next" and "Free" states aren't built. Marked `deviation(2026-10-12 ruling)` in `nowCard.ts`.
2. **2a's "Also open" (always three rows visible) vs Loop A's collapsed "More for today" fold.** Three rows show, and "Show N more →" is the fold, remembered under the same `kf.today.more-open` key. The "More for today" label is gone on desktop; the phone keeps its fold unchanged.
3. **2a sorts overdue first inside Also open vs Kai 2026-10-07 (an Overdue fold with Replan all).** The fold is kept, above Also open.
4. **2a's rail "Rituals" lists routine-like items (Check email, Vitamins) vs R4-D1 (a ritual's progress is its own steps; routines are separate).** Rituals = Plan my day / Shut down steps, and Routines keep their own rail section.
5. **2a "Evening · from 7 PM" vs Kai 2026-09-28 (Shut down from 17:00).** It reads "from 17:00".
6. **2a's pill keycap "N" vs the conductor's N → Notebook on Today.** The keycap shows ⌘K (the sidebar's capture chord), and N on Today opens the Notebook. **Needs Kai's call:** the global `?` sheet still says N = New task everywhere.
7. **2a removes row stars.** Top 3 rows have none; other desktop rows show ☆ on hover. The phone keeps the MK kit star.
8. **2a's card has Start focus only; DAILY-CYCLE says every task row has its checkbox.** No Done / Open buttons (Kai 09-27). A task the card stands for that isn't a Top 3 row gets its checkbox in the head.
9. **2a drops the card's ritual links ("rituals live only in the rail") vs DAILY-CYCLE "either ritual one tap away from the card".** Both are one tap away in the rail's Rituals.
10. **2a's 12-hour times ("9:00–11:00", axis 8…2…8) vs Today's 24-hour clock** (phone MK, the Top 3 block meta). 24-hour, with the axis reading 8 … 20.
11. **2a's ribbon colours and ritual markers vs CALENDAR.md v2's kinds.** A meeting is blossom, a task / time block lavender, and an event's own colour wins. No ritual markers: rituals aren't calendar blocks.
12. **2a's "3 days overdue" vs punch 18** (the same "Overdue Nd" as Tasks). It reads "Overdue Nd".
13. **2a's shell changes are AppLayout's, not mine:**
    - Streak "6-day streak · best 21 · day 42" in the sidebar foot.
    - "synced" on the Settings row.
    - No top bar.
    - The app icon by the wordmark.
    
    Until the shell owner does them, the desktop streak shows nowhere on Today (it lived in the removed terrarium band), and the shell's top bar still shows the date (2a removed it).

## For Kai to decide

- **N on Today:** Notebook (as built) or capture (2a and the global shortcut sheet)?
- **Plan a step:** opens the project. Should it rather open capture prefilled `#project`?
- **Snooze a week:** reuses the review mark, so its toast reads "Marked reviewed" (`slipping/api`, not mine). Should the toast change, and should "a week" be a real snooze?
- **Over capacity** measures against 09:00–18:00, Plan my day's rule. Is that also right for Today?

## Follow-ups for other owners

- `components/BulkBar.tsx`: `onTop3`, then a one-line wire-up on Today (above).
- `/notebook` route (the Notebook builder): Today links to `/notebook?day=today`; it resolves once that branch merges.
- `focus/focusStore`: a stamped `pausedAt` would make "Paused · since" survive a Today chunk loaded after the pause.
- `AppLayout`: the 2a shell items (conflict 13).
- `rituals/ritualLogic`: export `STEP_NAME`. Today keeps a copy of its eight words.
