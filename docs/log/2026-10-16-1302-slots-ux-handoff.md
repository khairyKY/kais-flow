---
date: 2026-10-16
session: slots-ux (builder, worktree .claude/worktrees/slots-ux, branch claude/slots-ux from claude/bound-journal b8efb595)
type: handoff
related: 2026-10-13-1720-time-slots-handoff.md, 2026-10-13-2205-slots-phone-handoff.md
---

# 2026-10-16 13:02 · handoff · slots-ux

Kai (16 Oct): "there is something wrong with the logic of the time slots, how do I remove a task from the time slot". Branch `claude/slots-ux` is pushed. Not merged, no PR. No migration.

## The flows (mapped first, each run in the browser against the mock backend)

| Flow | Desktop | Phone | What was wrong | Now |
|---|---|---|---|---|
| Put in: drag a rail card onto a slot | drop | (no drag on phone) | fine | same (s1) |
| Put in: drag a task's block onto a slot | drop | — | fine | same (s5) |
| Put in: ⋯ → Into a slot… | submenu | action sheet | fine | same (p2, p3) |
| Put in: `>code` in the bar | Enter | Enter | fine | same (p4) |
| Put in: the slot's own Link a task… | pick a task | pick a task | **turned the slot into that task's block; every task it held vanished** (off the calendar, out of the rail, Tasks still said "in Code block") | the task goes IN the slot (f8) |
| Take out: ⋯ → Out of the slot | 3 clicks | 2 taps | the only way out, and hidden | still there (s2) |
| Take out: drag the row out | — | — | not possible: a press on the row moved the whole slot | rail → out (Today section also dates it today, Overdue says no); empty time → its own block there; another slot → into it; its own slot → nothing (f1–f5) |
| Take out: hover × on the row | — | — | — | 1 click (f6) |
| Take out: the task sheet | — | tap the row | **sheet offered "Schedule on calendar" free times and never said the task was in a slot** | "In Code block💻 · Mon 12 · 10:00–12:00" under the chips, with **Out of the slot** (m1) |
| Click / right-click a held row | click, right-click | tap | **opened the slot's menu** | click opens the task, right-click its task menu (f7) |
| Complete | the row's box | the row's box | fine | same (s2, p1) |
| Move / resize the slot | drag | hold + drag | fine | same (s3, f11) |
| Slot into the all-day band | drag | — | **tasks stayed held, stamped 00:00 ("in Code block · 03:00"), not drawn** | they come out, with the move's Undo |
| Repeat: one occurrence moved | drag | drag | fine | same (f12) |
| Repeat → Does not repeat / a new rule / from a later day / a rule that skips the slot's day | popover | sheet | **tasks on days that no longer exist stayed held: lost** | each task goes to its day's occurrence of what the edit leaves, else out of the slot; one Undo (f10) |
| More → Event (the slot's kind) | popover | sheet | **its tasks vanished the same way** | they come out to the rail; toast "Out of the slot · …" with Undo, which makes it a slot again with them (f9) |
| Delete the slot / one occurrence / all | menu | sheet | fine | same (s4) |
| Reschedule a held task (Plan, Tomorrow, a time) | menu, keys | swipe, menu | fine | same (f13) |
| Its own block vs a slot | — | — | never both: a block takes it out of the slot, a slot takes its block off | checked after every move (f1, f3, f4, f13) |
| Today: Top 3 | — | — | **desktop lower-cased the slot's name ("in code block💻"); phone showed no slot at all** | "in Code block💻 · 10:00" on both (f14) |
| Today: Also open / the phone fold | — | — | said only "Due today" | "in Code block💻 · 10:00" (f14) |
| Tasks list | — | — | fine; a slot that was gone still named | names only a live Time block (s6, f3, f13) |

## What changed

- `calendar/api.ts`:
  - `reseat` re-homes a series' held tasks after any repeat or re-time edit (it replaces the old `tasksTo`).
  - `releaseRow` lets every task of a slot go.
  - `followSlot` lets go in the all-day band.
  - `updateEvent` releases a slot's tasks on a kind change, with Undo.
  - `linkTaskWithUndo` on a Time block = `putInSlotWithUndo`.
  - `slotTitleOf` only names a live Time block.
  - `slotLabel` is the one "in X · time" line for every row.
- `calendar/slots.ts`: `occurrenceOn` (pure).
- `CalendarGrid`: a held row is its own FullCalendar `Draggable`, like a rail card, and its press never reaches the slot's drag. It also has the hover ×, click and right-click. `CalendarPage` wires these up and ignores a drop back on the row's own slot.
- `TaskSheet`: the slot card. `TodayPage` and `TaskRow`: `slotLabel`.
- The look uses existing tokens and classes only (`ts-block`, the block's accent). No colour changed.

## Gates

- `npx vitest run`: 162 files, **2236 tests** pass. New: 9 tests in `slots.test.ts` (occurrenceOn, Link, kind change, Repeat none, split, align, re-time, all-day band, slotLabel).
- `npm run lint`: 0 errors. `npm run build`: OK. `npm run ds:check -- --baseline scripts/ds-baseline.json`: 0 new.
- Browser, mock backend, this worktree on :5294 (since stopped):
  - `time-slots/verify.mjs`: **110/110** (52 before + 58 new; shots in `assets/slots-ux/`).
  - `cal-rail-drop`: 33/33.
  - `event-detail`: 70/70.
  - `cal-wave2`: 83/83.
  - `calendar-phone`: 176/176.
- `app/src/lib/types.ts` and `settings.ts`: checked, no duplicated lines.
- `event-detail` a3 was changed on purpose: Link a task… on a Time block now puts the task in it. It still checks the old link, on a plain event.

## Not done / notes

- The **MCP** (`supabase/functions/mcp/tools.ts` `edit_event`, not touched here) still leaves held tasks in two cases: a repeat-rule change and a kind change. It only restamps them for a re-time. It needs the same `reseat` rule.
- `friday >code`, when Code block💻 doesn't fall on or after Friday: the chip still says "In Code block💻", but the task lands with no slot. The toast says where it really went.
- On the phone there is still no drag into or out of a slot, because a hold lifts the slot. The ways out are the sheet's button and ⋯.
- In a 7-day week the held rows are narrow, so the × shows only on hover. Dragging the row works at any width.
