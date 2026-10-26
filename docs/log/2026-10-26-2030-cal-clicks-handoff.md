---
date: 2026-10-26 20:30 Cairo
session: cal-clicks
type: handoff
related: Kai 2026-10-26 (clicks the mainstream way; the recurring scope question); coordinator (menu B off-screen at 125%; merge kai-bugs)
---

# cal-clicks: handoff

Branch `claude/cal-clicks` (worktree `.claude/worktrees/cal-clicks`), on the release branch with today's merges, then
`claude/kai-bugs-1012` merged in (drag-fix, settings-sync, notif-sounds, widgets-build, lockscreen). Not merged up, no PR.
No migration. Every write goes through the outbox (`writeRow`); every Undo through `toastUndo`.

## 1. Clicks, the mainstream way

| | Desktop | Phone |
|---|---|---|
| Event / Time block | click or Enter → the **details** popover (when, time + length chips, project, repeat, remind, Link a task…, More, Delete) | tap → the details sheet (same rows, length chips; a **⋯** in its head) |
| Task block | click or Enter → its **task popover** (title, notes, chips — the task's full details) | tap → its task sheet (an overdue one: Replan sheet, as before) |
| Google event | click → read-only details | tap → read-only details |
| any block | right-click, the hover ⋯, **Shift+F10** or the **menu key** → **menu B** | long-press or the details' ⋯ → **menu B's sheet** |

- **Menu B** (`blockMenuSpec(e, { mode: 'menu' })`, `BlockMenu mode="menu"`, `BlockSheet mode="menu"`): the title, the
  swatch tray, Duplicate (Ctrl D), Work with AI ›, Copy link, Delete.
- **The old small right-click menu is retired.** What it had that menu B lacked is folded in:
  - **Details** (the old "Edit" / "Details") on events, Time blocks and Google events — opens the details in place;
  - **Complete / Reopen**, **Open task** (the old "Edit Task"), **Replan…** (missed blocks) and **Unschedule** on task blocks.
- A Google event's menu B: Details · Work with AI · Copy link (no tray, no Delete).
- Copy link's `/calendar?event=` now opens the block's details.
- Phone long-press: the block still lifts (its handles still resize it); the sheet opens over it, and Back closes the sheet
  first. The click a released finger sends is eaten, so it can't close the sheet it just opened.
- **Coordinator item:** every `ContextMenu` is capped at the window's height (12px clear top and bottom) and scrolls
  inside itself, on top of its existing nudge. At 125% in an 800px window the menus fit; in a 480px window they scroll
  and Delete stays pressable (harness V).

## 2. The recurring scope question

**One question, one model.** Every change to an occurrence of a repeating event — or to a repeating task's open round —
asks before anything is written:

- events: **This event · This and following events · All events**;
- tasks: **This one · This and following · All**;
- desktop: a small dialog by the block, with Cancel; phone: an action sheet;
- the first answer has the focus, so Enter means "This";
- Esc, Cancel or a click away writes nothing, and a dragged or resized block goes back (`info.revert`).

**Events** (`features/calendar/scope.ts`, pure, on the series model already here):

- **this** is the exception: an exdate, plus a detached copy carrying the change;
- **following** is the split. `splitSeries` moved to `_shared/series.ts` so the MCP splits the same way;
  `features/calendar/series.ts` wraps it;
- **all** changes the series row;
- **time moves** carry BYDAY with a day drag (Mon → Tue becomes "every Tuesday") and keep the wall time across DST;
  `alignToRule` keeps the block in place if a move leaves the anchor off the rule;
- **delete following** ends the series before the occurrence and takes the one-offs moved out of it from there;
- **duplicate** copies just this occurrence ("This", the default), a series from it on, or the whole series;
- a **Time block**'s held tasks follow the occurrences the change leaves (the existing reseat).

`calendar/api.applySeriesChange` writes the plan with **one Undo per answer**: rows back, new rows removed.

**Tasks** (`features/tasks/taskScope.ts`, on the one-open-row model):

- **This one:** the round leaves its series (rule cleared) with the change, and the series goes on unchanged as its next
  round, spawned now (completion's own next copy). A paused or undated series keeps its rule.
- **Following:** this and later open rounds.
- **All:** every round, done ones too. "Same series" is completion's test: same title and rule, with COUNT/UNTIL ignored.

**Where it asks** (`features/calendar/scoped.ts` is the glue; `scopeQuestion.ts` + `ScopeAsk.tsx` in AppLayout):

| Change | Event | Task round |
|---|---|---|
| title | details title (desktop, phone) | task popover / sheet / editor (`useTaskDraft`) |
| notes | — events have no notes or location | task popover / sheet / editor |
| colour | menu B tray | **never asks**: the colour is the block's, and later rounds' blocks are new |
| project | details Project | task Move to… (`taskActions.move`, so the task ⋯ menus ask too) |
| kind, busy / free, remind | details More, Remind | — |
| time move | drag, Date row, Time ▸, typed time | drag of its block ("This one" detaches first, so the series keeps its time) |
| resize / length | drag, length chips | drag of its block |
| delete | menu B / details Delete (the old This/All submenu is gone) | menu B Delete: **This** skips the round (rolls to the next, block off); **Following / All** go to Trash |
| duplicate | menu B, Ctrl D | menu B, Ctrl D: **This** = a one-off copy |
| complete | — | the block's box, menu B, the phone check: **This** = the usual tick; **Following / All** end the series |

**Today's series behaviour, before → after:**

- field edits on an occurrence silently changed all → now asked;
- the popover's Time / length silently did "this and following" → now asked;
- drag / Date row silently did "this" → now asked;
- Delete was a This / All submenu → now the question;
- Duplicate was always "this" → now asked, "This" first.

**Not asked, on purpose:**

- **Repeat** changes stay "from this occurrence on" (the existing split): "this" makes no sense for a rule.
- **Ctrl+drag** duplicates and **multi-select** moves stay "this".
- A drag across the all-day line on a series stays "this".
- **List rows'** ticks, renames and swipes (Tasks, Today) don't ask; only the calendar surfaces and the task popover /
  sheet / editor and task menus do. A daily habit ticked in a list would otherwise ask every day. Say if you want it there too.
- A task's title from a list row's inline rename doesn't ask.

**MCP** (`supabase/functions/mcp/tools.ts`):

- `edit_event`, `delete_event` and `duplicate_event` take `scope: this|following|all`. **"this" is the default, and the
  descriptions say so**; "this" and "following" need `occurrence`.
- A series change with neither `occurrence` nor `scope: "all"` now answers with what to give and **to ask the user**,
  instead of silently changing the whole series. Old calls that meant the whole series must say `scope: "all"`.
- `edit_task` takes `scope` for what later rounds inherit (title, notes, duration, labels, priority, where it lives):
  - **this (default):** the round leaves the series, which goes on from its next round;
  - **following** and **all:** the later rounds, or every round including done ones.
- A repeat set, a pause, Top 3, Someday or a slot never splits a round.
- `completeTask` shares a new `nextRound`.
- The chat's propose steps pass `occurrence` (read like "when") and `scope` through.

## 3. Gate (after the kai-bugs merge)

- `npx tsc -b` clean.
- `npx vitest run` ×4 TZ in PowerShell (Cairo, UTC, Los Angeles, Tokyo): **188 files / 2667 tests**, all green.
  - New: `scope.test.ts` (every op × scope × 4 zones, both DST edges, all-day, BYDAY) and `taskScope.test.ts`;
  - MCP scope tests in `mcp.test.ts` / `mcpFull.test.ts`;
  - `blockMenuSpec.test.ts` covers details vs menu B.
- `npm run lint`: 0 errors.
- `npm run build`: OK.
- `ds:check --baseline`: **0 new**.
- `deno check` mcp + chat: clean.
- birthday_on greps: 1 / 1.

## 4. Harnesses

All run on `vite --mode mock` at :5320, **one at a time**.

**cal-clicks** (new, `docs/log/assets/cal-clicks/verify.mjs`): **96/96**. It covers:

- **C:** left-click details and right-click menu B for an event, a task block, a repeating task, a Time block, a Google
  event and an occurrence; the hover ⋯; Enter, Shift+F10 and the menu key; the old quick menu gone.
- **P:** phone tap details, the ⋯ to menu B and back, long-press menu B (still lifted after), a task's sheet and its
  menu, the question as an action sheet.
- **S:** rename, colour, project, move, resize, length, delete and duplicate × This / Following / All on a daily
  series, each checked in the stored mock rows. Undo checked for rename-following and delete-all.
- **T:** complete, move, title, project, delete and duplicate × This one / Following / All on a weekly task. Undo checked
  for complete-following and delete-this. Colour never asks.
- **X:** Esc and Cancel revert a drag and a resize, of a repeat and of a repeating task's block, with nothing written.
- **V:** the menus at 125% in 800 and 480px windows.

**Older suites, after the merge:** cal-blocks 93/93 · cal-looks 107/107 · cal-polish 229/229 · event-detail 71/71 · cal-wave2 84/84 · calendar-phone 180/180 · time-slots 153/153 · google-sync 101/101 · mcp 35/35.

**Expectations updated because the click mapping changed:**

- **cal-blocks:**
  - M: menu B by right-click, the event's menu-B rows, and the link now opens the details;
  - K: a repeating tick answers "This one";
  - X: waits for the "3 blocks moved" toast before reading writes (a race).
- **cal-looks:**
  - h: the ⋯ is menu B;
  - o: half a second after a drop for its IndexedDB write (a race).
- **cal-polish:**
  - d6: the length row on an event; a task block's length goes through its task's Duration;
  - d9: a task block's click opens its task;
  - b1: the popover range on Standup, then Undo.
- **event-detail:**
  - a1: the details rows;
  - a2: the tray on menu B;
  - a3: a task block's rows on menu B, and its click opens its task;
  - b2, b3: answer the question (Delete is the dialog now; "Deleted · Standup · all events"; a later occurrence's length answers "This and following");
  - p1: the details sheet, then ⋯ to menu B, and Delete's three answers.
- **calendar-phone, time-slots:** a hold opens menu B's sheet over the lifted block; Back closes it first (`holdLift`).
- **time-slots f12:** the occurrence drag answers "This event".
- **google-sync g2:** a Google event's menu B (Details · Work with AI · Copy link).
- **mcp:** the card is on `/settings/integrations/mcp`. This was broken by settings-build, not by this branch.

## 5. Overlap with drag-fix

- drag-fix is merged in.
- My drag changes are only these:
  - `CalendarGrid` hands `info.revert` to `onMove` / `onResize`;
  - `CalendarPage`'s onMove / onResize go through `scoped.moveBlock`;
  - `PhoneCalendar.commit` goes through `scoped.moveSpan`;
  - `PhoneGrid`'s hold-release opens menu B (`onHoldBlock`).
- The only merge conflict was CalendarPage's imports. drag-fix had turned that file's line endings to LF, so it stays LF.

## 6. Seen, not changed

- In headless Chrome, a FullCalendar drag now and then doesn't take, and a drop's write can land more than 400ms after
  the mouse-up (IndexedDB first). cal-clicks retries a drag that never asked; the other two races are fixed in the harnesses.
- Repeating tasks have no series id, so "same series" is title + rule. A round renamed with "This and following" no
  longer matches its done rounds for a later "All".
