# Kai's Audit — Round 2 (2026-07-08, post-steps-8/9/10)

> **Source:** Kai's live feedback in chat after using the app with UX-Retrofit steps 8–10 (calendar planning surfaces, command bar v2, routine stats) built. Quotes below are near-verbatim from his message, lightly cleaned. Unlike the first audit (`KAI-AUDIT-2026-07-08.md`, OneNote → step 6.5), this round arrived as text — no screenshots.
>
> **Disposition (decided 2026-07-08):** injected as **UX-retrofit step 11 (a–e)**, same pattern as round 1 → step 6.5. Prompt UX in `PROMPT-BANK.md` is unchanged — it routes by "first unfinished step in the phase file", so the same paste picks this up. Item 6 (routine stats) is **not** planned — flagged as future re-plan only, see the Out-list note in the phase file.
>
> Each item below carries the **investigation findings from the code** (done at injection time, so the build session starts from root causes, not symptoms).

## The six items

### 1 · Calendar — N-day view missing from the switcher

> "In step eight, calendar planning surfaces, closed at GitHub #42: the month view — I see it's mentioned that there is an N-day view. I only see the day, week, and month views. I don't see any N-day view. N-day is supposed to be a custom amount of days that I pick for the amount of days I want displayed in the calendar."

**Root cause (found):** `CalendarGrid.tsx:59` builds the toolbar as `timeGridDay, (Week OR customDayCount), dayGridMonth` — the N-day view **replaces** Week and only when `app_settings.calendar_day_count ≠ 7`. The setting defaults to 7, so out of the box the N-day button simply doesn't exist. And N is only settable from the Settings page (`SettingsPage.tsx:58`), not from the calendar itself. This is the seam between feature #50 (day-count setting, pre-retrofit) and step 8's month view — each correct alone, together they hide N-day.

**→ UX-retrofit step 11a.** Switcher always shows all four (Day · N-day · Week · Month); `calendar_day_count` becomes purely "the N in the N-day view"; N is pickable from the calendar page itself (themed `Select` in the page header — FullCalendar's own toolbar buttons are FC-rendered, our chrome lives outside it), Settings select stays as a second writer of the same setting.

### 2 · Planning board cards — controls crowd the title

> "The cards themselves seem a bit weird. The task is taking space, and of that space, more than half is taken by two other buttons — I think the snooze and repeat buttons. This shouldn't be the case. These options should be introduced in the pop-up that is planned later on for the task details, or at least be part of the context menu that pops up when you press the three dots next to the task. There you can pick deadline, priority, snoozing, repeating, all of that stuff, even due dates and possibly a time associated — like, this is one hour or five hours, even if it's not planned in the calendar."

**Root cause (found):** the board reuses the shared `TaskRow` verbatim (`PlanningBoard.tsx:48`), and `TaskRow`'s hover-reveal area carries two inline `Select`s — **repeat** and **reminder** (what Kai read as "snooze and repeat") — plus the "⋯" trigger. In a 260px board column the reveal leaves the title a sliver. The Selects were session 2's stopgap (pre-dating the context menu); the menu is now the right home.

**→ UX-retrofit step 11b.** Remove the two inline Selects from `TaskRow` **globally** (not board-only — Kai's ask is "these options live in the menu/popup", and the row-stays-calm rule from step 3 agrees); the ⋯ context menu grows **Repeat ▸ · Remind ▸ · Priority ▸ · Duration ▸** submenus (all four setters — `setRecurrence`/`setReminder`/`setPriority`/`setDuration` — already exist in `tasks/api.ts`; zero new API). The full task-details popup stays future work (Task Detail screen, design/PROMPTS.md C-row) — the menu is the "at least" Kai named.

### 3 · Planning board — placement doesn't make sense

> "Its place doesn't really make sense. It should be accessible from somewhere else, depending on the best user experience possible. This needs to be re-planned. Maybe even move the planning board to the Plan section, because that makes a little bit more sense if you ask me."

**Current state (found):** route `/planning`, reachable only via two header links — Calendar page (`CalendarPage.tsx:171`) and the Upcoming smart list's header (`TasksPage.tsx:449`). Nothing in the sidebar.

**→ UX-retrofit step 11c.** The board becomes a **PLAN-spine entry** in the sidebar (Kai's own suggestion — it's a view over the same smart-list buckets, so it belongs with them). Existing header links can stay as secondary paths. Naming/icon per the build session's judgment, logged for Kai's override like the "Due Today" call was.

### 4 · Sub-context menus — open on hover, beside the parent

> "Regarding the sub-context menus (i.e., when you add a task to a project — you press the project button and it shows you the projects you have): we should have all of these sub-context menus as hover, and they would show next to the primary context menu."

**Current state (found):** `ContextMenu.tsx` submenu items (`submenu: true`) work click-only, and the click **closes the parent menu** then opens the child popover at the parent's old anchor (`ContextMenu.tsx:65` — `item.onClick(); onClose()`). No hover, no side-by-side.

**→ UX-retrofit step 11d.** ContextMenu v3: submenu-bearing items open their child on hover (with a short intent delay), anchored to the item's right edge (flip left when clamped), **parent stays open**; hovering a different item closes the child; click still opens it (touch/keyboard path — hover must never be the only way, per the phase's own accessibility pitfall); Escape closes child-first via the existing `overlayStack` ordering. This is the *mechanism* step — 11b's four new submenus ride on it, so **11d builds before 11b** (they share `ContextMenu.tsx`/`TaskRow.tsx`).

### 5 · Command bar v2 — priority token leaks into the title; priority colors

> "When a priority is entered — the one, two, or three — it shouldn't exist in the name of that entry anymore. When I press Enter it takes the priority I typed, but then it should be removed from the name of the entry. Maybe as a label, but not as a name. Also pick different colors for each priority: max (three) should be red, two should be yellow, one should be blue."

**Root cause (found):** `parseCommand.ts` strips `!`/`!!`/`!!!` correctly — but `CommandBar.tsx:52`'s submit gate is `parsed.dueAt || parsed.domainId || parsed.projectId`. Text carrying **only** a priority and/or duration (e.g. "buy milk !!") fails the gate and falls to `captureText(trimmed)` — the **raw text including `!!`** becomes the inbox item (→ eventually the task title) and the parsed priority is discarded entirely. Same leak on the Ctrl+Enter AI path: `captureWithAI(trimmed)` sends raw text; `ParseResult` has no priority field, so the token survives or is dropped at the LLM's whim.

**→ UX-retrofit step 11e.** Root-cause fixes: (1) the gate counts `priority`/`durationMin` as structure → such text creates the task directly with the cleaned `parsed.title`; (2) the AI path strips locally-parsed priority/duration tokens from the text before sending and passes them through (`captureWithAI` gains optional overrides; `createTask` already accepts both). Colors: new `priorityColor()` in `taskDisplay.ts` — **careful with the mapping direction**: Kai's "max (three)" = three bangs `!!!` = **DB priority 1** → red; `!!` = DB 2 → yellow; `!` = DB 3 → blue. Semantic tokens only (candidates: red → `--sig-overdue`, yellow → `--acc-gold`/`--acc-gold-warm`, blue → `--acc-hydrangea-deep`; final pick per DESIGN_SYSTEM at build time, never raw hex). Applied wherever the flag renders: `TaskRow`, the command-bar live chip, and 11b's Priority submenu.

### 6 · Routine stats — flagged, NOT planned

> "Flag the routine stats UI and its logic to be re-planned, because I'm not happy with it, but I don't want to get into that right now — so I'll just flag it as future work."

**→ No step.** Recorded in the phase file's **Out** list and the ROADMAP changelog so no session "improves" it in passing. Step 10's implementation stays as-is until Kai re-plans it deliberately.
