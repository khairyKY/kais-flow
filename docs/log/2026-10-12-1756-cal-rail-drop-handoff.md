---
date: 2026-10-12 17:56 UTC
session: cal-rail-drop
type: handoff
related: Kai's report 2026-10-12 (calendar → rail drag; colours can't be edited)
---

# cal-rail-drop: handoff

Branch `claude/cal-rail-drop` (from `origin/master` v1.0.28, 366ac69c). Not merged, no PR.

Kai: "I wanted to drag an event from the calendar into the left side — Overdue / Inbox / Today
sections. It didn't accept any of them and wiggled." And: "you can't edit the colours after
they've been created."

## A. Calendar block → rail section

**Cause.** `CalendarGrid` `eventDragStop` only checked "is the pointer anywhere on the rail". It
never looked at which section. `CalendarPage.handleDragToRail` then returned false for anything
without a `task_id`, so every plain event and empty time block got the soft-no shake.

**Now.** The drop resolves the `data-section` under the pointer. A pure table
(`app/src/features/calendar/railDrop.ts`, `railDropAction`) decides what happens:

| Section | Task block | Plain event / empty time block |
|---|---|---|
| Overdue | soft-no (computed bucket) | soft-no |
| Today | unscheduled + due today, no time (`rescheduleDue`, date-only) | new task due today (09:00 = the app's date-only Today), `duration_min` = event length; event to Trash |
| Inbox | unscheduled (task stays a task) | new `inbox_items` row (`raw_text` = title, via `captureText`); event to Trash |
| Lists | unscheduled | new task in the rail's scope: project / area (with its domain, per `tasks/move.ts`), or domain; a smart list gives a plain task; event to Trash |
| rail chrome outside any section | unscheduled (as before) | soft-no |

- The writes live in `inbox/api.ts` `eventToRail`, next to `fileToCalendar`, its reverse. That
  module already imports both `tasks/api` and `calendar/api`, so no new import cycle. Every write
  goes through `writeRow`. Activity is logged by the existing helpers (`calendar_event.deleted`,
  `inbox.captured`, `task.created`, `task.rescheduled`, and `task.deleted` on Undo).
- There is one toast with one Undo each time: "Moved to Inbox · …", "Now a task · Tasks · Today"
  or "Now a task · <project>", and "Unscheduled · … · Today". Undo hard-deletes the row it created
  (the same as `unfile`), un-trashes the event, and puts the due date back.
- While a block is dragged, the section under the pointer gets `data-drop-over`. CalendarPage
  styles it with the grid's own drop-target look (lavender 16% wash and a dashed lavender
  outline). Overdue never lights.
- `CreateTaskInput` gained `areaId` (it was always written as `null`).
- **Small extension:** a Lists scope set to a *domain* also links the domain. The brief named only
  project and area, but without the link the new task would not show in that list.
- **Trash vs hard delete:** a converted event is soft-deleted (`deleted_at`), like the other
  deletes, so it is in Trash until compost.

## B. Colour edits

- **Cause:** the hue was painted only in `eventDidMount`. FullCalendar keeps the element when an
  event changes, so a new colour never showed until a remount, and picking None never cleared the
  old CSS vars.
- **Fix:** `paintColor()` (sets the vars, or clears them when there is no colour) now runs from
  `eventDidMount` and from a `useLayoutEffect` after every render. That effect repaints each
  `[data-kf-id]` block from the current data.
- `QuickCreate`: the time-block swatches were given `color ?? 'var(--acc-lavender)'`, which matches
  no swatch. They now get `color`. `ColorDots` now marks None as picked too (a faint ring), and each
  swatch has `aria-label` and `aria-pressed`.
- Phone: `BlockSheet` (the 7d event sheet) has the same `ColorDots` row for plain events (not task
  blocks, which wear their project's hue). A tap saves through `updateEvent` and shows "✓ Saved".
  **For Kai's eye:** the swatches are 28px so all ten fit on one row at 390px. That is below the
  44px touch-target guideline. At 32px the tenth one wrapped onto a row of its own.

## Verified

- `npx vitest run`: **1496 passed** (baseline 1484 + 12 new in `railDrop.test.ts`). These cover the
  table, `scopeTarget`, `eventMinutes`, and the real `eventToRail` writes and Undo against the
  in-memory outbox cache, as in `replan.flow.test.ts`. The new file also passes under TZ = UTC,
  Africa/Cairo, America/Los_Angeles and Asia/Tokyo (PowerShell `$env:TZ`).
- `npm run lint`: 0 errors. `npm run build`: green.
- **Browser** (Playwright + Chrome, mock backend, dev server `--mode mock` on :5246,
  `http://localhost`): `docs/log/assets/cal-rail-drop/verify.mjs` passes **42/42**. Results are in
  `results.json`, with screenshots beside it. The mock applies writes to its rows, so a refetch
  can't hide a stale cache. It covers:
  - **r1:** an event onto Inbox (only Inbox lit while hovering, the capture written, the event
    trashed, Undo).
  - **r2:** a time block onto Today (a 60-min task due today, shown in the rail's Today, Undo).
  - **r3:** an event onto Lists scoped to a project.
  - **r4:** Overdue soft-no with no writes; a task block onto Today with Undo; a task block onto
    Inbox, unscheduled only.
  - **c1:** Terra, then Sage, then None repaint without a reload; the New Time Block picker shows
    None picked.
  - **p1:** the phone sheet's swatches save, and the grid block takes the hue.
- **Negative control:** the repaint effect was disabled and c1 run again. "Terra → repaints" and
  "Sage → repaints" both FAIL, so the harness catches the original bug.
- The existing `docs/log/assets/calendar-rail/verify.mjs` was re-run on this branch: **115/115**.

## Not done / for later

- Night theme for the new section highlight was not screenshotted. It uses only tokens
  (`--acc-lavender`).
- Kai has not tried this on his real account. There is no live check: the branch is not merged.
