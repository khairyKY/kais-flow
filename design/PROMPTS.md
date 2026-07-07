# The Prompt Book — wiring the Open Design UI into live code

**This is the single file of prompts for extracting the approved OpenDesign looks (`design/*.dc.html`) into the running app.** One prompt = one fresh session (Sonnet 5 or smaller). Run in order; don't skip A1. Every prompt is self-contained — paste it as the session's first message, nothing else needed. The anti-drift rules live in `docs/phases/P-DESIGN.md` (hex→token map §3, flower map §4, checklist §7) so this file never goes stale when a rule changes.

| Block | Screens | When |
|---|---|---|
| A1–A7 | chrome, Today, Tasks, Inbox, Calendar, Routines, Settings | now, in order — A2 stops for Kai's approval |
| B1–B6 | Command Bar, Search, Chat, both Rituals, Sign in | after A |
| D | global night theme | after all A+B logged done |
| C1–C10 | feature-phase screens (no "plain first" — built straight from spec/mockup) | only when their phase is being built |

---

## ONE-SHOT — wire the entire light-theme UI in a single session

Use this instead of A1–B6 when you want everything skinned in one run (no per-screen approval stops). Night theme and C-rows stay excluded.

```
For the Kai's Flow project, wire the entire UI built by Open Design into
the live app — the full light theme, in one session.

Read fully, in this order, before touching any code:
1. docs/phases/P-DESIGN.md — the rules; it overrides your own taste
2. design/SKILL.md — house style rules
3. design/PROMPTS.md — the per-screen prompts; each block A1–B6 is the
   spec for that screen's session, and you are running ALL of them
   back-to-back in this one session

Scope — exactly rows A1 through B6, in order: A1 chrome (AppLayout),
A2 Today, A3 Tasks, A4 Inbox, A5 Calendar, A6 Routines, A7 Settings,
B1 Command Bar, B2 Search, B3 Chat, B4 Morning Ritual, B5 Evening
Ritual, B6 Sign in. For each screen follow its own prompt block in
design/PROMPTS.md exactly (its mockup, its SCREENS.md block, its flower
and accent), with these one-shot overrides:
- Do NOT stop for approval after A2 — keep going; Kai audits at the end.
- SKIP everything night/dark: no data-theme="night" work, no
  night-readability checklist item, no B5 night-garden scene — skin
  Evening Ritual as a normal light screen using its mockup's layout.
  Do not delete or modify the night tokens (colors.dark.css) — they
  stay for later; just don't build against them.
- Do not commit anything to git.

Hard rules (from P-DESIGN.md, non-negotiable):
- Skin only. No logic edits, no new dependencies, no new routes, no
  schema changes. Every existing interaction must still work.
- Never write a hex color. Translate every mockup color through the
  P-DESIGN.md §3 map; semantic tokens only; migrate legacy aliases in
  any file you touch.
- Calendar (A5): read P-DESIGN.md §5.1 twice; style FullCalendar via
  .fc-* overrides in CalendarGrid.css only; never fork CalendarGrid.tsx;
  after skinning, manually verify drag-from-rail, drag-select create,
  move, resize, and click-delete all still persist.
- Reuse the component vocabulary (design/components/*.prompt.md);
  extract a shared component the SECOND time a visual repeats, into
  app/src/components/.

Per-screen checkpoint (do not move to the next screen until it passes):
cd app && npm run build passes · no new hex literals in the touched
feature (grep it) · screen matches its mockup at 1440px · mobile intact
at 375px · behavior unchanged · one line appended to P-DESIGN.md §8.

When all 13 are done, finish with: a full production build, a dev-server
click-through of the core loop (capture → inbox file → task complete →
drag a task onto the calendar → run a ritual step), screenshots of
Today, Tasks, Inbox, and Calendar at 1440px, and a final summary table
of every screen with its §8 line and any deviation. Leave everything
uncommitted for Kai's audit.
```

---

## A1 — App chrome (sidebar + topbar)

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md, and any one
mockup (design/Tasks.dc.html) for the chrome reference. Then re-skin row A1:
app/src/components/AppLayout.tsx — 238px sidebar, wordmark, NavItem
bud→bloom states per design/components/garden/NavItem.prompt.md, vine
connector, mono topbar strip. Skin only — no logic, deps, routes, or schema
changes. No hex literals: translate every color via P-DESIGN.md §3; semantic
tokens only. Keep the existing mobile bottom-nav behavior working. When done,
run the §7 checklist with evidence, append one line to §8, and stop — do not
start another screen.
```

## A2 — Today (signature screen)

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Today v3.dc.html, and the "Garden Dashboard (Today)" block in
SCREENS.md. Then re-skin row A2: app/src/features/today/ (TodayPage.tsx +
Terrarium.tsx). Skin only — no logic, deps, routes, or schema changes. No
hex literals: translate via P-DESIGN.md §3; semantic tokens only. Flower
states are picked semantically per §4 using app/public/assets and the
gardenAssets.ts helper pattern. This is the signature screen: after the §7
checklist passes with evidence, STOP and wait for my approval before
logging it in §8. Do not start another screen.
```

## A3 — Tasks

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Tasks.dc.html, and the "Tasks" block in SCREENS.md. Then re-skin row
A3: app/src/features/tasks/. Skin only — no logic, deps, routes, or schema
changes. No hex literals: translate via P-DESIGN.md §3; semantic tokens
only. Cherry blossom is this surface's flower (--acc-blossom); use TaskRow
per design/components/garden/TaskRow.prompt.md. When done, run the §7
checklist with evidence, append one line to §8, and
another screen.
```

## A4 — Inbox

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Inbox.dc.html, and the "Inbox" block in SCREENS.md. Then re-skin row
A4: app/src/features/inbox/InboxPage.tsx. Skin only — no logic, deps,
routes, or schema changes. No hex literals: translate via P-DESIGN.md §3;
semantic tokens only. Hydrangea is this surface's flower (--acc-hydrangea);
the header cluster state comes from the existing hydrangeaAsset() helper in
app/src/lib/gardenAssets.ts. When done, run the §7 checklist with evidence,
append one line to §8, and stop — do not start another screen.
```

## A5 — Calendar (interaction-heavy — read §5.1 twice)

```
Read fully, in order: docs/phases/P-DESIGN.md (§5.1 especially — it lists
every drag/interaction state you must style), design/SKILL.md,
design/Calendar.dc.html, and the "Calendar" block in SCREENS.md. Then
re-skin row A5: app/src/features/calendar/ (CalendarPage unscheduled rail +
CalendarGrid.css). Skin only — no logic, deps, routes, or schema changes.
Style FullCalendar via .fc-* CSS overrides in CalendarGrid.css only — do
NOT fork or replace CalendarGrid.tsx, and do not change slot duration,
snap, or the 30-min drop default. The static mockup can't show drag states:
style ALL of §5.1's table — rail chips, drag mirror, drop highlight,
select ghost, resize handles, now indicator, event chips (task-linked vs
plain). Keep event-click delete-confirm wired as-is (the details panel is
row C6, not this pass). No hex literals: translate via P-DESIGN.md §3;
semantic tokens only; daisy/--acc-lavender is this surface's accent.
Done means §7 checklist with evidence PLUS manually verifying all five
interactions still persist: drag task from rail, drag-select create, move,
resize, click-delete. Append one line to §8 and stop.
```

## A6 — Routines

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Routines.dc.html, and the "Routines" block in SCREENS.md. Then
re-skin row A6: app/src/features/routines/. Skin only — no logic, deps,
routes, or schema changes. No hex literals: translate via P-DESIGN.md §3;
semantic tokens only. Vine is this surface's flower (--acc-moss); streak
cells follow design/components/garden/StreakVine.prompt.md with the `grow`
timing from motion tokens. When done, run the §7 checklist with evidence,
append one line to §8, and stop — do not start another screen.
```

## A7 — Settings

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Settings.dc.html, and the "Settings" block in SCREENS.md /
SCREENS-PART-TWO.md. Then re-skin row A7: app/src/features/settings/.
Skin only — no logic, deps, routes, or schema changes. No hex literals:
translate via P-DESIGN.md §3; semantic tokens only. Seedling/sage is this
surface's accent (--acc-sage). When done, run the §7 checklist with
evidence, append one line to §8, and stop — do not start another screen.
```

## B1 — Command Bar

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Command Bar.dc.html, and the "Command Bar" block in SCREENS.md.
Then re-skin row B1: app/src/features/command-bar/ (global overlay).
Skin only — no logic, deps, routes, or schema changes; keyboard behavior
(⌘K/⌘J, arrows, enter) must remain exactly as it is. No hex literals:
translate via P-DESIGN.md §3; semantic tokens only. When done, run the §7
checklist with evidence, append one line to §8, and stop — do not start
another screen.
```

## B2 — Search

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Search.dc.html, and the "Search" block in SCREENS.md. Then re-skin
row B2: app/src/features/search/. Skin only — no logic, deps, routes, or
schema changes. No hex literals: translate via P-DESIGN.md §3; semantic
tokens only. When done, run the §7 checklist with evidence, append one
line to §8, and stop — do not start another screen.
```

## B3 — Chat

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Chat.dc.html, and the "AI Chat" block in SCREENS.md. Then re-skin
row B3: app/src/features/chat/ (slide-over panel). Skin only — no logic,
deps, routes, or schema changes; streaming rendering and citation links
must keep working. No hex literals: translate via P-DESIGN.md §3; semantic
tokens only. Clover is this surface's flower (--acc-clover) with the
cloverSway hover per SKILL.md. When done, run the §7 checklist with
evidence, append one line to §8, and stop — do not start another screen.
```

## B4 — Morning Ritual

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Morning Ritual.dc.html, and the "Morning Ritual" block in
SCREENS.md. Then re-skin row B4: app/src/features/rituals/
MorningRitual.tsx (+ RitualChrome.tsx if shared chrome fits both rituals).
Skin only — no logic, deps, routes, or schema changes; the step flow and
completion writes stay untouched. No hex literals: translate via
P-DESIGN.md §3; semantic tokens only. When done, run the §7 checklist with
evidence, append one line to §8, and stop — do not start another screen.
```

## B5 — Evening Ritual

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md (§8 Night
garden especially), design/Evening Ritual.dc.html, and the "Evening
Ritual" block in SCREENS.md. Then re-skin row B5: app/src/features/
rituals/EveningRitual.tsx. This screen gets the night-garden treatment
scoped to its own subtree via data-theme="night" — sky backdrop, sparse
stars, MoonlitCard panels per design/components/night/*.prompt.md,
fireflies 8–14 MAX. Skin only — no logic, deps, routes, or schema changes.
No hex literals: translate via P-DESIGN.md §3 (night values come from the
[data-theme="night"] tokens automatically). When done, run the §7
checklist with evidence, append one line to §8, and stop — do not start
another screen.
```

## B6 — Sign in

```
Read fully, in order: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Sign in.dc.html, and the "Sign in" block in SCREENS.md. Then
re-skin row B6: app/src/features/auth/. Skin only — no logic, deps,
routes, or schema changes; the auth flow itself is untouched. No hex
literals: translate via P-DESIGN.md §3; semantic tokens only. When done,
run the §7 checklist with evidence, append one line to §8, and stop — do
not start another screen.
```

## D — Night theme (global pass)

```
Read fully, in order: docs/phases/P-DESIGN.md (§5 row D), design/SKILL.md
§8, design/components/night/*.prompt.md, and design/ui-kit/
tonight-dark.card.html. Prerequisite: rows A1–B6 are logged done in
P-DESIGN.md §8 — verify that first and stop if they aren't. Then build the
global night theme: a data-theme="night" toggle in Settings (persisted in
the existing settings store), the fixed sky backdrop layer, stars in the
upper half, one moon glow, fireflies (8–14 max, lower half), MoonlitCard
treatment for cards, firefly-yellow primary button instead of terra. All
colors come from the [data-theme="night"] tokens — no new hex. Verify
every A/B screen stays readable in night mode. Run the §7 checklist on
Today + Tasks + Settings as spot checks, append one line to §8, and stop.
```

## C1 — Task Detail  *(only when the Retrofit phase is being built)*

```
We are building the Retrofit phase (docs/phases/P1-P4-retrofit.md). For the
Task Detail UI, read: docs/phases/P-DESIGN.md, design/SKILL.md,
design/Task Detail.dc.html, and the "Task Detail" block in
SCREENS-PART-TWO.md. Build the screen's UI directly from the mockup — there
is no plain-first version. All P-DESIGN rules apply: no hex literals (§3
map), semantic tokens only, flower per §4. Feature logic follows the phase
file; visuals follow the mockup. Run the §7 checklist with evidence and
append one line to §8 when the screen ships.
```

## C2 — Projects / Project Detail / New Project  *(only when P7 is being built)*

```
We are building P7 (docs/phases/P7-life-os.md), Projects slice. For the UI,
read: docs/phases/P-DESIGN.md, design/SKILL.md, design/Projects.dc.html +
design/Project Detail.dc.html + design/New Project.dc.html, and the
Projects blocks in SCREENS-PART-TWO.md. Build these screens' UI directly
from the mockups — no plain-first version. All P-DESIGN rules apply: no
hex literals (§3), semantic tokens only; wisteria p0→p100 by progress per
§4. Feature logic follows the phase file; visuals follow the mockups. Run
the §7 checklist per screen with evidence and append lines to §8.
```

## C3 — New Routine form  *(with Retrofit or P7, whichever adds routine CRUD)*

```
We are building the phase that adds routine CRUD. For the UI, read:
docs/phases/P-DESIGN.md, design/SKILL.md, design/New Routine.dc.html, and
the "New Routine" block in SCREENS-PART-TWO.md. Build the form UI directly
from the mockup — no plain-first version. All P-DESIGN rules apply: no hex
literals (§3), semantic tokens only, vine accents per §4. Run the §7
checklist with evidence and append one line to §8.
```

## C4 — Weekly Review  *(only when P7 is being built)*

```
We are building P7's Weekly Review. For the UI, read: docs/phases/
P-DESIGN.md, design/SKILL.md, design/Review.dc.html, and the "Weekly
Review" block in SCREENS.md / SCREENS-PART-TWO.md. Build the screen's UI
directly from the mockup — no plain-first version. All P-DESIGN rules
apply: no hex literals (§3), semantic tokens only; fern unfurls down the
page as the sweep completes, per §4. Run the §7 checklist with evidence
and append one line to §8.
```

## C5 — People  *(only when P7 is being built)*

```
We are building P7's People CRM. For the UI, read: docs/phases/
P-DESIGN.md, design/SKILL.md, design/People.dc.html, and the "People"
block in SCREENS-PART-TWO.md. Build the screen's UI directly from the
mockup — no plain-first version. All P-DESIGN rules apply: no hex literals
(§3), semantic tokens only; clover patch accents (--acc-clover) per §4.
Run the §7 checklist with evidence and append one line to §8.
```

## C6 — Calendar Event Details panel  *(only when Kai schedules P3c — this one adds behavior)*

```
We are building P3c (docs/phases/P3-calendar.md §3c — Event details &
editing). This row adds behavior AND skin together; there is no mockup —
the written spec is the design source. Read fully, in order:
docs/phases/P3-calendar.md §3c, the "Calendar Event Details — panel" block
+ "Cross-screen notes" in SCREENS-PART-TWO.md, docs/phases/P-DESIGN.md,
and design/SKILL.md. Build features/calendar/EventDetailsPanel.tsx: a
420px right-edge slide-over (bottom sheet under 768px) replacing the
event-click delete-confirm in CalendarPage. Fields per spec: inline-edit
title, date, start/end, all-day + busy toggles (existing columns, no
migration); linked-task card with Open task / Complete / Unschedule;
delete zone with linked-vs-unlinked confirm copy. Skip the Notes field
unless Kai asks (needs a migration). All writes go through the outbox
helpers in features/calendar/api.ts. P-DESIGN rules apply: no hex
literals, semantic tokens only, --acc-lavender accent, popover treatment
per --shadow-popover. Run P3c's acceptance checklist AND P-DESIGN §7 with
evidence, append one line to §8, update P3-calendar.md Notes + ROADMAP,
and close the matching GitHub issue.
```

## C7 — Someday view  *(with P6 — rides smart lists)*

```
We are building P6 (docs/phases/P6-integrations.md), step 6: the Someday
bucket (parity row 57, issue #43). Read fully, in order: docs/phases/
P6-integrations.md step 6, SCREENS-PART-TWO.md § "Akiflow UX parity
additions" → "Someday view", docs/phases/P-DESIGN.md, and design/SKILL.md.
Build behavior + skin together: tasks.someday migration, exclusion from
Today/Overdue/Slipping/Matrix, a built-in "Someday" smart list pinned in
nav (fern coil icon), header caption "no dates, no guilt" in Caveat, rows
animate out via petalFall when a plan action clears the flag. All writes
via outbox; no hex literals — P-DESIGN §3 tokens only. Run P6's Someday
acceptance items + P-DESIGN §7 with evidence, append one line to §8,
update DATA_MODEL.md with the migration, and close issue #43.
```

## C8 — Akiflow UX bundle  *(with P8 — context menus, keyboard map, bulk bar, subtasks, month/planning views)*

```
We are building P8's Akiflow UX parity bundle (docs/phases/
P8-matrix-focus.md § "Akiflow UX parity bundle", rows 52–56, issues
#38–#42). Read fully, in order: that P8 section, SCREENS-PART-TWO.md §
"Akiflow UX parity additions" (context menu, cheatsheet overlay, bulk bar,
subtasks, month/planning views blocks), docs/phases/P-DESIGN.md, and
design/SKILL.md. Build one work item per session in this order: #38
ContextMenu → #39 keyboard map + ? overlay → #40 bulk actions → #41
subtasks (tasks.parent_id migration, depth 1, update DATA_MODEL.md) → #42
month + planning views (dayGridMonth stays inside CalendarGrid — never
fork it). Every action dispatches existing outbox mutations — zero new
API surface except the parent_id migration. No hex literals — P-DESIGN §3
tokens only; popover treatment per --shadow-popover; keycaps per the
cheatsheet spec. Per item: run its P8 acceptance line + P-DESIGN §7 with
evidence, append one line to §8, close its issue. Stop after each item.
```

## C9 — Public booking page  *(with P9 — Time Slots)*

```
We are building P9's Time Slots (docs/phases/P9-integrations-v2.md §
"Time Slots — availability booking", row 59, issue #45). Read fully, in
order: that P9 section, SCREENS-PART-TWO.md § "Akiflow UX parity
additions" → "Booking page — public", docs/phases/P-DESIGN.md, and
design/SKILL.md. Build: booking_pages + bookings tables (RLS'd, update
DATA_MODEL.md), the 'book' edge function (GET = free-slot computation +
server-rendered page, POST = validate + insert + calendar_events row +
logActivity → notification; rate-limited — this is the app's ONLY
unauthenticated surface, expose nothing else). The public page: paper
ground + noise, no app chrome — wordmark, display-serif title, week strip
of free-slot pills (mono times), name+email form, terra Book CTA,
confirmation card with cherry bloom. Booked slots on our calendar get the
dashed --acc-lavender "BOOKED" chip. Secrets stay server-side; $0 rule
holds. Run P9's booking acceptance items + P-DESIGN §7 with evidence,
append one line to §8, and close issue #45.
```

## C10 — Schedule Optimizer preview card  *(with P9)*

```
We are building P9's AI Schedule Optimizer (docs/phases/
P9-integrations-v2.md § "AI Schedule Optimizer", row 60, issue #46). Read
fully, in order: that P9 section, SCREENS-PART-TWO.md § "Akiflow UX
parity additions" → "Schedule Optimizer preview", docs/phases/P-DESIGN.md,
and design/SKILL.md. Build the suggest-then-apply flow: chat/command-bar
action → Groq (via the existing chat edge function, Groq only per the
privacy rule) proposes blocks for today's unfinished tasks into free
calendar gaps → render the preview card (mini day-timeline, mono times,
additions in --acc-sage, moves as strikethrough old → new) with terra
"Apply plan" (batch outbox write, ONE undo toast) and ghost "Dismiss".
Hard rules: never auto-apply; never move booked or Google-mirrored
events; only its own task blocks. No hex literals — P-DESIGN §3 tokens
only. Run P9's optimizer acceptance items + P-DESIGN §7 with evidence,
append one line to §8, and close issue #46.
```
