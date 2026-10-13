---
date: 2026-10-12
session: product audit (read-only, kai-bugs-1012)
type: audit
related: docs/DAILY-CYCLE.md · PLAN.md §3 · docs/ROADMAP.md changelog · design-export/SPEC.md · vault "05 - Projects/Kai's Flow/" (Flow Audit, Flow (All Paths), Build Plan, Brainstorm — Notebook page & Paper capture, 2026-07-26 v1.0 review (spoken), The Deal) · vault "03 - Personal OS/Journal/The Notebook.md" · AI-Memory/CRITICAL.md · docs/log/2026-10-12-*.md
---

# Kai's Flow: is every feature meant to be?

Kai, 2026-10-12: *"I feel like AI slop is going to hit me like a truck. I want to make sure that every feature isn't a gimmick or not faithful. I want it all meant to be."*

This is a read-only audit of branch `claude/kai-bugs-1012` at `dcdf2f26`, which is master v1.0.28 plus the 2026-10-12 fixes, including fix-backend. Line numbers are relative to the repo root unless they say otherwise. "In flight" means a builder branch already owns the item. This report only cross-references those items; it doesn't re-audit them.

---

## Summary for Kai (3 minutes)

**Overall, the app isn't slop.** The daily loop is real and is the app's strongest part:

- capture in 2 taps;
- a morning plan that starts from last night's seeds and puts times on the calendar;
- a shutdown that rolls leftovers forward, saves one line to the journal, and plants tomorrow's 3.

On a normal day the loop costs about **14 taps on a phone and 16 on desktop**, plus 2 per capture (§3). That is at or just above the Flow Audit's 10–15 target, down from its measured 30–45.

The slop is at the edges, and it comes in four kinds:

1. **Promises nothing keeps.** A label, button or setting says something that the code doesn't do.
2. **Ceremony in the way.** Decoration placed between you and finishing.
3. **Breadth no one walks.** Big modules built, with their acceptance lists never walked by you.
4. **Builds drifting from your rulings.** In-flight work that follows the design export over a narrower call you made later.

**Verdict counts** (66 rows, §2):

| Verdict | Count |
|---|---|
| CORE | **20** |
| SUPPORTING | **29** |
| HALF-BUILT | **10** |
| GIMMICK CANDIDATE | **7** |

### The 5 most slop-like things

1. **"Not now · back in 5 days" is not true.**
   - The resurfacing card and the Settings sliders let you choose 1–30 days. That was your spec: "high ~2d / medium ~5d / low ~10d".
   - The server never shows anything again within **14 days** of showing it, and after that the pick is random. The migration's own comment admits the 14 days "already covers" your 2/5/10.
   - Evidence: `app/src/features/resurfacing/rules.ts:34-35`, `SettingsPage.tsx:678-711`, `supabase/migrations/0062_notify_drift.sql:82` (`rl.shown_on > current_date - 14`), `0059_resurface_settles.sql:15`.
2. **The Weekly Review's buttons don't act.**
   - The verdict chips ("still moving / park it / needs a look / reviewed ✓") only record a row.
   - "Close the week" logs an event that only the Activity feed reads. There's no toast, and it can be pressed again.
   - With zero domains the page dead-ends.
   - The week starts on a hard-coded Sunday. Your own review is on Friday, and your weekend is set to Fri+Sat in the app.
   - This is the Flow Audit's J12 ("verdicts do nothing → verdicts act"), still open 15 days later.
   - Evidence: `app/src/features/rituals/WeeklyReviewPage.tsx:29-38,63-66,131-134,149,170-187`.
3. **Captures land silently, and seven capture paths follow five different rules.**
   - Enter in ⌘K or the phone sheet writes with no toast naming where it went. There's a sound and nothing else (`CommandBar.tsx:151-176`).
   - The Tasks quick-add placeholder promises `"submit the report tomorrow 3pm #forecasting"`, but the handler only strips `*labels`. The date and project end up in the title (`TasksPage.tsx:799-811`).
   - Your bar was "every tap answers", and the Flow Audit asked for "one capture component".
4. **The pressing ceremony stands between you and "archive".**
   - From a project page: Archive… → confirm → Next → Next → Press it. That's 5 taps, with both an "are you sure?" and an Undo.
   - Leaving mid-ceremony by Back archives nothing.
   - The word "skip" means two different things on the same screen.
   - The Flow Audit said the ceremony is an "optional flourish *after* a one-tap Archive + Undo, never a step in the way".
   - Evidence: `ProjectDetailPage.tsx:977-990`, `HerbariumPage.tsx:160-175,272,291,306`.
5. **The journal scores you, against your own rule.**
   - "Kept · N days of showing up" resets to a coiled fern after one missed day.
   - The Notebook says: *"A missed night is just a blank line. No catching up, no reset."*
   - Evidence: `JournalPage.tsx:1124-1139`, `journalDay.ts:41-45`.

**Runners-up:**

- A repeating task finished late spawns a copy that's already overdue: the next date is computed from the old due date (`tasks/completion.ts:39`, `recurrence.ts:9-12`). This is the same recurrence bug you avoid in Akiflow by setting repeats by hand.
- Perennials "Pause" still pauses nothing (`tasks.paused` is read only by its own page).
- An in-flight Today build would bring back a card during the day (§4.1).
- Theme "Auto" only works while Settings is open (`lib/theme.ts:11` never reads `kf_theme_mode`).
- The Library prints "cover placeholder" and "via capture" on every book and invents 100 pages for unknown Goodreads books.
- The Android Season widget shows Cairo weather in every time zone (`WidgetBridge.tsx:57`).
- Chat forgets the conversation every time you close it.

### The 5 strongest features

1. **Shut down → Plan, the seed handoff.**
   - Tomorrow's 3 are pre-starred from your picks or suggestions and written as seeds (`EveningRitual.tsx:161-178`).
   - The morning plan opens with them selected (`MorningRitual.tsx:83,90`).
   - The one line lands in the Journal (`EveningRitual.tsx:139-149`).
   - The whole loop is real code, and none of it fakes anything.
2. **Plan my day as one screen.**
   - Carry-over, Inbox, Pick 3 and Suggested times. "Start the day" sets the Top 3 order, puts every pick with a time on the calendar, and finishes the ritual (`MorningRitual.tsx:214-229`).
   - A pick can be made goal in place, and every open task is searchable right there.
   - It is faithful to your 2026-10-03 calls.
3. **Hold-to-talk capture and the row grammar.**
   - Hold + to talk, release to file (`CaptureButton.tsx:203-208`).
   - Swipe right means Tomorrow at 09:00 on your clock, swipe left means Trash + Undo, and ⋯ is on every row.
   - For tasks, "Tomorrow" means one thing app-wide (`lib/dateShortcuts.ts:91-96`). A calendar block moves to the same time tomorrow instead, and its menu says so.
4. **Paper capture.**
   - It is your own idea and fits your analog notebook.
   - Pages are capped server-side at 15 a day, photos are swept after 7 days, Arabic is read, and every line is reviewed before it's added.
   - The ticks loop honestly waits for the Notebook page, which is in flight (`paper/PaperFlow.tsx:20`).
5. **Notifications that now tell the truth**, fixed on this branch and not yet released:
   - routine reminders actually send;
   - the hourly Overdue push nobody could turn off is gone;
   - the digest uses the same Top 3 rule as the app.
   - Evidence: `docs/log/2026-10-12-1842-fix-backend-handoff.md`, `0062_notify_drift.sql`.

**Honourable mentions:** Search, which opens the actual thing and covers 7 kinds; the MCP server, which this audit session itself had connected; and the 2026-10-12 Top 3 release rule.

### What matters more than any single row

The north star is "never needing an Akiflow subscription", and the P7e parity audit is the checkpoint for it. It has never been walked (`docs/ROADMAP.md:7,45`). Meanwhile the vault still says Akiflow is your real task tool:

- CRITICAL.md: "Real task tool = Akiflow".
- The Notebook (2026-09-26): "TASKS (copied from Akiflow each morning)".
- On 2026-09-24 your week went "directly in Akiflow".

So since the v1 punch list froze on 2026-07-26, the app has grown in breadth faster than you have lived in it. The additions include 32 widgets, the tray, paper capture, MCP, the tour, the Guide, What's new, three sound packs and 8 importers. Most of these you asked for, so they are not gimmicks. But **"meant to be" is proven by use**, and the cheapest anti-slop step is not a cut. It is **one week running your real day on Kai's Flow instead of Akiflow**, then cutting whatever you never touched.

The 2026-10-12 "build the unbuilt designs" queue (`docs/log/2026-10-12-1839-local-decision-unbuilt-designs.md`) is where new slop is most likely. §4.3 sorts it with the loop test.

---

## 1. How to read the verdicts

- **CORE**: serves a loop step (Capture → Plan → Do → Shut down → Review) or one of your stated life-OS needs, and works end to end.
- **SUPPORTING**: earns its place; the named weakness still needs fixing.
- **HALF-BUILT**: the idea is meant to be, but the build is hollow. That means a stub, a dead button, a promise not kept, data written and never read, an invented number, or no entry point.
- **GIMMICK CANDIDATE**: ornament or extra steps that don't serve the loop, or something no one asked for. If you asked for something, it is **not** a gimmick; the row says so. You decide every cut; the recommendation includes what keeping it costs.
- Line counts are non-test TypeScript/TSX unless noted.

---

## 2. Every feature

### 2.1 Capture

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| ⌘K bar and phone capture sheet (one component) | **CORE**, with a gap | 2 taps on either platform (`CaptureButton.tsx:220-222` → `CommandBar.tsx:304,370`). Typed tokens win and the AI fills only the gaps (`CommandBar.tsx:151-176`). **But nothing names where the capture went**: `createTask` and `captureText` don't toast (`tasks/api.ts:64-98`, `inbox/api.ts:45-63`). Design prompt 03 asked for "Added to Today · Undo / Added to Inbox · Undo" with the sheet staying open; the sheet closes on submit (`CommandBar.tsx:175`). | Add one destination toast with Undo inside `submit()`. Small, and it closes "every tap answers". |
| Hold-to-talk voice (phone) | **CORE** | One gesture: hold 400ms, talk, release (`CaptureButton.tsx:203-208`, `holdToTalk.ts:53`). Toast `Added "x"` + Undo, but "Added to Inbox for review" has **no Undo** (`capture/api.ts:164,178`). Costs 1 speech-to-text + 1 parse call; 30 speech-to-text per day (`_shared/quota.ts:21`). | Add Undo to the Inbox toast and name the destination. |
| AI fill on typed captures (`aiFill.ts`) | **SUPPORTING**. You asked for it (2026-10-07: "let the AI understand the intent and decide", `aiFill.ts:1-3`). | It adds priority from wording, duration from words, notes, reminder, and a project without `#`. It costs **1 Groq parse per Enter**, up to 2 on retry (`parse-capture/index.ts:117-126`). The global parse cap is 150 a day for *all* users (`_shared/quota.ts:43`). `CONFIDENCE_THRESHOLD = 0.75 // TODO(P4)` is hard-coded while `app_settings.confidence_threshold` is never read (`aiFill.ts:10`, `0003_capture.sql:8`). | Keep. Skip the call when the local parse already filled title + date + project, which saves quota. Drop the dead column, or read it. |
| The other capture paths: ⌘↵ AI-first, tray field, Tasks quick add, Calendar QuickCreate, `/share` raw | **HALF-BUILT** | 7 paths follow 5 different rules (`CommandBar.tsx:178-188`, `TrayFlyout.tsx:89-94`, `TasksPage.tsx:795-814`, `QuickCreate.tsx:136-160`, `SharePage.tsx:25`). The Tasks quick-add placeholder promises a parse it doesn't do (`TasksPage.tsx:811` vs `:799-800`), which is placeholder copy that lies (also in flight on claude/fix-tasks). The Flow Audit §5 said: "Five capture paths → **One** capture component." | Route every path through `CommandBar`'s `submit()`. Delete ⌘↵, which gives Enter a second meaning (`CommandBar.tsx:301,539`). |
| QuickCapturePage (`/capture`) | **GIMMICK CANDIDATE** (dead weight) | A W8 phone mock with a fake lock screen and keyboard, registered only in dev builds (`App.tsx:58-74`). Still 892 lines, and it still makes real `captureWithAI` writes. | Cut (892 lines). |
| Share to the app (PWA `share_target` + Android SEND) | **CORE** | `vite.config.ts:56-60`, Android `MainActivity.java:72-79` → `/share`. Flow Audit J3/J4 asked for it. | Keep. Run it through the same `submit()` parse. |
| Capture key + `capture` endpoint | **GIMMICK CANDIDATE** (cheap) | Built for iPhone Shortcuts, Tasker and bookmarklets (`docs/CAPTURE.md`). You're on Android with share, and MCP `add_to_inbox` covers scripted capture. On 2026-07-26 you said "Capture API: hide until real" (spoken review). It is real now (v1.0.5) but redundant. About 250 lines. | Fold it into MCP, or move it under Settings › Advanced. Low priority. |
| Paper capture | **SUPPORTING** (your brainstorm, 2026-10-03) | The 15 pages/day cap is enforced on the server (`capture-image/index.ts:121-129`). It is also duplicated on the client (`paperMath.ts:41`), so the two can drift. The 7-day photo sweep is scheduled (`0049_paper_capture.sql:91-104`). The ticks loop is not built and honestly waits for the Notebook page (`PaperFlow.tsx:20`). 1,673 + 312 lines. | Keep. Read the cap from the server's answer instead of the constant. |
| Inbox triage (File / Dismiss / AI suggestion) | **CORE**; t3 in flight (claude/fix-inbox) | Filing uses the AI's project and names the destination: "Filed to X · Today" (`inbox/api.ts:79-82,131`). That's the one surface that meets "says where it went". **Honesty gaps:** a Groq *failure* reads as "AI unsure · 0%" (`parse-capture/index.ts:72-86` → `InboxPage.tsx:712-715`); the LLM's self-reported confidence is shown as a precise percentage (`InboxPage.tsx:598,703`); "✎ edit parse" edits only the title (`:706-709`). | Hand to t3: say "AI couldn't read this" on failure, and show high/low instead of a percentage. |
| Inbox snooze and "Someday" | **HALF-BUILT** | Snoozed items appear in neither tab: there's only Waiting and Dismissed (`InboxPage.tsx:131`, `inbox/api.ts:27`). Inbox "Someday" is a **365-day snooze** (`InboxPage.tsx:430,452,773`), so the item disappears for a year. This breaks "nothing hidden". | Show a "Snoozed · N" line, or file Someday as a someday *task*. In t3's scope. |
| GitHub issues → Inbox | **SUPPORTING** (your addition, `PLAN.md:21`) | Cron at :07/:37, dedupe by `node_id`, closed issues auto-dismissed, filing keeps the link (`0042`, `inbox/api.ts:117-127`). AI ranking was skipped on purpose. No log shows it connected to your account. 477 lines. | Keep. Confirm you actually use it. |
| MCP server (10 tools, per-key scope) | **SUPPORTING** | `supabase/functions/mcp/tools.ts:345-635`, 500 calls a day, no Groq. Provenance: "P10 inherits the Kai's-Flow MCP-server idea" (ROADMAP 2026-07-08). It's in real use: this session had `kais-flow` connected. 1,142 lines. | Keep. It suits how you work. |
| Import: Akiflow, CSV, Markdown | **SUPPORTING** | Akiflow ran on your real data: 655 tasks, re-import a no-op (ROADMAP 2026-07-19). Events are held behind a toggle (`ImportPage.tsx:160`). | Keep. |
| Import: Todoist, TickTick, Notion | **SUPPORTING**. You asked: "the one-time import should have multiple options… Notion, Google Docs" (spoken review 2026-07-26). | Built for a new user (`docs/log/2026-10-03-0723-importers-handoff.md`). No sign that anyone has used them. Part of the 1,859-line import feature. | Keep, frozen. No more adapters until a real user asks. |
| Import: Kindle, Goodreads → Library | **SUPPORTING if the Library stays** | They write into the Library, which is un-parked as of 2026-10-12 (see 2.6). Goodreads invents **100 pages** when the count is unknown (`import/adapters/goodreads.ts:5`), and that number drives "% read" (`LibraryPage.tsx:453`). | Store null, not 100. |

### 2.2 Plan

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Plan my day | **CORE**, faithful | One sheet: Carry-over (Today / Tomorrow / Someday / Drop → Trash + Undo), Inbox (File / Dismiss / project chip), Pick 3 (seeds pre-selected, search everything, Make goal), Suggested times 09–18 (`MorningRitual.tsx:155-229`). It matches the Flow Audit J5 proposal and your 2026-10-03 rulings: no ✓ needed, search in place. | Keep. One small issue: the sheet says "about 3 minutes" (`:370`) while the desktop card says "~5 min" (`DayCard.tsx:34`). Neither is measured. Pick one, or compute it from the logged step times. |
| Day card (Plan / Shut down / Day closed) | **CORE**, faithful to your 2026-09-27 "no card during the day" | `DayCard.tsx:75-80` returns null during the day. The phone slip shows only while a block runs (`todayLayout.ts:33-39`). The time estimates disagree: desktop ~5 / ~3 min, phone ~3 / ~2 min (`DayCard.tsx:34,45,183`). `docs/DAILY-CYCLE.md:26` still says 18:00, but the code (by your ruling) uses 17:00. | Fix the copy and the doc. **The in-flight rewrite is a drift risk (§4.1).** |
| Top 3, goal of the day, Top 3 release rule | **CORE** | The 2026-10-12 rule: a pick moved off today gives its place up (`features/tasks/top3Rule.ts`, enforced in `writeRow`). The server copies it in `_shared/today.ts` (fix-backend). The first pick is the goal (`MorningRitual.tsx:189-201`). | Keep. |
| Suggested times → calendar blocks | **CORE** | `suggestTimes` and the workload line are real (`ritualLogic.ts`). The day is hard-coded 09–18 (`MorningRitual.tsx:117`), and a pick with no estimate counts as 30 min (`:123`). | Later: take the day window from your routine wake time and curfew. |
| Calendar: desktop FullCalendar, phone grid, the Overdue · Today · Inbox · Lists rail | **CORE**; event popover and repeats in flight (claude/event-detail) | The rail was your 2026-10-07 request. The default view (0043) is read on both platforms (`CalendarPage.tsx:349`, `PhoneCalendar.tsx:69`). The 2026-10-12 work (block → rail drop, colour repaint) is merged. **Two implementations**: desktop about 3,620 lines, phone about 1,495, shared about 950. Drag, resize and quick-create are written twice. One bug: Trash's event restore bypasses `restoreEvent`, so a linked task isn't re-stamped and nothing is logged (`trash/api.ts:83`). | Keep both; the platforms really do differ. **Don't add a third planning surface** (see §4.3, Calendar §4). |
| Planning board (`/planning`) | **GIMMICK CANDIDATE**. You parked it: "looks like shit, park it until I redesign it" (`AppLayout.tsx:197-199`). | Still routed (`App.tsx:27,125`) with no entry point. It's still in `pageLoaders`, so **every app start downloads it** (`App.tsx:18-21`; same for the Library page). Its drops write with no toast (`PlanningBoard.tsx:21-38`). The 2026-10-07 calendar rail and Plan my day do its job. 354 lines + `grouping.ts:185-223`. | Delete it (git keeps it). If Calendar §4 "collapsed planning mode" is the redesign, say so, and build that *instead*. |

### 2.3 Do

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Today page (phone) | **CORE** | Order: Top 3 → Up next → Routines → Overdue fold → "More for today" (Open capped with View all, Slipping, From a while ago) (`TodayPage.tsx:618-722`). This is DAILY-CYCLE's order. | Keep. |
| Today page (desktop) | **CORE** | The design's two columns: Routines, Slipping and Resurfacing sit in the right rail instead of the quiet fold (`TodayPage.tsx:845-904`, per Today.dc.html 1a). Birthday cards' "Plan something" and ✕ are `<span onClick>`, and ✕ has no Undo (`:502-516`). | Turn the spans into buttons and add Undo. Fold is fine as drawn. |
| NOW slip (phone, only while a block runs) | **CORE**, faithful to your 2026-09-28 "1b, shown only while something is running" | `todayLayout.ts:21-39`. | **In flight: claude/fix-today adds Next / Free states (§4.1).** |
| Task row grammar + bulk bar | **CORE**, faithful to Flow Audit §4 | One grammar everywhere: checkbox done + Undo; swipe right = Tomorrow 09:00; swipe left = Trash + Undo; hold = select; ⋯ on every row (`tasks/useRowGrammar.tsx:62-118`, `SwipeRow.tsx`, `taskMenuSpec.ts:43-63`). Bulk actions share one Undo (`TodayPage.tsx:286-300`). **Gaps:** single-task Someday, Priority, Repeat and Remind set with no toast or Undo (`useRowGrammar.tsx:25`, `tasks/api.ts:336-342,492-500`). The `1` and `3` keys are silent too (`TodayPage.tsx:311,313`). Two reminder lists: 0/5/15/30/60 in ⋯ vs 10/30/60/1440 in the editor (`TaskMenu.tsx:82-89`, `TaskEditorPage.tsx:41-47`). Someday-row chips are invisible but still tappable on touch (`TaskRow.tsx:244-256`, `TaskRow.css:12-13`). | Mostly in flight (claude/fix-tasks: "every setter writes the current row; edits log activity"). Add: one reminder list, visible Someday chips. |
| Task sheet (phone) / editor page (desktop) | **CORE**; desktop popover in flight (claude/fix-tasks) | Phone edits save at once. The desktop editor can't set priority; it only shows a chip. | In flight. |
| Repeating tasks | **HALF-BUILT** | The next copy is computed from the **old due date**: `rule.after(due)` (`tasks/completion.ts:39`, `recurrence.ts:9-12`). A daily task finished 5 days late spawns a copy that's already 4 days overdue. A repeat set on an undated task never repeats (`completion.ts:38`), and nothing warns you. "Custom…" is a dead end, in flight (`TaskMenu.tsx:120` → `TaskEditorPage.tsx:49-54`). You set repeats by hand in Akiflow because "it's usually bugged out" (CRITICAL.md, 2026-09-24); this is the same class of bug. | Roll from max(due, today) and block Repeat without a date. Small, with tests. |
| Subtasks (0029) | **HALF-BUILT** | Created with `parent_task_id` (`tasks/api.ts:93`), but no list filters on it (nothing in `grouping.ts`), so a subtask also shows as an ordinary task with no parent marker. | Hide children from the lists, or show the parent. |
| Labels (`*label`, chips, filter) | **SUPPORTING**. You asked (v1.0.17 changelog). | Parse (`parseCommand.ts:22-33`), chips, Tasks filter (`TasksPage.tsx:176-186`). Smart lists (P6 step 5) aren't built; don't build them. | Keep. The queued Labels picker + manager is low value (§4.3). |
| Perennials (repeating overview) | **HALF-BUILT** | Reachable from Tasks' "↻ Repeating" (`TasksPage.tsx:174`) and ⌘K. **Pause is a no-op**: `tasks.paused` is read only by this page (`PerennialsPage.tsx:255-327`). Completion, lists and notify ignore it, so a "paused" series still shows on Today, still reminds you and still respawns. This is the Flow Audit §5 item "make it work or remove", still open. "Skip next" and "End series" have no Undo (`:249-268`). The rows can't be checked or opened (DAILY-CYCLE: "no display-only task rows"). 447 lines. | Make Pause real with a `!t.paused` filter in grouping, completion and notify, or remove the button. Give rows the TaskRow behaviour. |
| Focus (timer, MiniFocus, garden view) | **SUPPORTING**. You asked: KAI-AUDIT-2026-07-20 #40-45, "multiple ways to enter it… a mini version". | Sessions write `time_entries` + `project.work_logged`. These are read by Today's workload line, the evening stats and project hours (`TodayPage.tsx:992`, `EveningRitual.tsx:70`, `ProjectsPage.tsx:104`). **But:** `FocusPage.tsx` is 1,271 lines with 10 queries, mostly for a decorative garden strip. Its project plant uses an unweighted % with its own thresholds, which contradicts Projects (`FocusPage.tsx:300-318` vs `lib/growthStages.ts`). `logTimeEntry` and `useTimeEntries` are duplicated (`focus/api.ts:25` vs `projects/api.ts:261`). The log row's `entity_id` falls back to a **random UUID** labelled as a project (`focus/api.ts:48`). | Keep the timer and MiniFocus; trim the garden strip (about 300 lines), use `wisteriaStage`, merge the helpers, drop the fake ids. |
| Trash (30-day compost) | **CORE** | Restores 7 kinds of item (`trash/api.ts:79-88`). Only "Delete forever" and "Empty trash" confirm (`TrashPage.tsx:161-170,237-244`), matching the Flow Audit rule 7. Has a nav entry. | Fix the event restore (see Calendar). |
| Notifications: task reminder, routine reminder, morning digest, evening nudge, focus done | **CORE**; fixed on the branch, **not released** | Before this branch the routine "Reminder" never sent, and an hourly Overdue push couldn't be turned off. Both fixed (`0062_notify_drift.sql`, `notify/routine.ts`). A routine notice has no Done button (fix-backend handoff, "Left alone"). | Release: `db push` 0062 *before* the frontend (handoff). |
| Windows tray + flyout | **SUPPORTING**. You asked: design prompt 12, "Start with Windows". | Flyout: Now/Next, Top 3 check-off, capture, focus controls (`features/tray/TrayFlyout.tsx`). **Tension with CLAUDE.md's hard rule** "no background processes on Kai's laptop": it starts with Windows and runs a 30-second local reminder sweep (`TrayBridge.ts:55`). Its capture field is the AI-first path, not ⌘K's rules. 882 TS + 341 Rust lines. | Keep. You decide whether the hard rule or the tray wins, and write the answer into CLAUDE.md. |
| Android widgets (32 entries for 34 designs) | **SUPPORTING**. You asked: "all widgets" (`docs/log/2026-10-08-1700-local-release-v1.0.26-widgets.md:5`). | About 1,410 Java (`app/native/android/java/…/widgets/`, plus a 336-line debug gallery) + 46 layouts + 642 TS. **Never tried on your phone** (same log: "Kai's phone was never touched"). Dead affordances: the Journal widget's mic only opens `/journal` (`widgets/bridge.ts:96-98`); "opens the camera" lands on the text sheet (`:76-80`); the specimen art is always `wisteria_p80` (`snapshot.ts:258`); the weather is Cairo's in every zone (`WidgetBridge.tsx:57`, no zone guard, unlike `TopbarEcho.tsx:17`). | Install them, keep the 3–5 you actually pin, and hide the rest from the picker. Fix the mic and camera promises. |
| Sounds (3 packs, 7 events) | **SUPPORTING**. You asked: "Redesign the sounds, I hate the current sounds", and picked Felt (`lib/sounds.ts:43`). | On by default at 0.35 volume (`:34-44`), silent after Shut down. 443 lines, no audio files. | Keep. |

### 2.4 Shut down

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Shut down ritual | **CORE**, faithful to Flow Audit J11 | Sweep (Done / Tomorrow / Roll all / long-press bulk), One line → Journal, Tomorrow's 3 pre-starred, Close the day (`EveningRitual.tsx:93-178`). After that comes a 3-second "garden's closed" summary that closes itself. "Close the day" marks Sweep as walked even if leftovers remain (`:170-171`); minor. | Keep. The summary beat is the only non-decision tap, and it's optional. |
| Evening "one line" → Journal | **CORE** | `upsertJournalEntry` (`EveningRitual.tsx:139-149`). Read back by the Journal, the evening's last-two-lines view and the widget. Prompt is "How did today go?", but your notebook has 4 night lines (+ / − / → / ♡). | Optional: let the one line follow your ♡ "one true line" wording. Shut down already covers → (tomorrow's 3). |

### 2.5 Review

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Weekly Review | **HALF-BUILT** | Verdict chips only record a row (`WeeklyReviewPage.tsx:63-66,131-134`); "park it" parks nothing (by the punch-45 ruling). "Close the week" writes `review.week_closed`, which only `activity/describe.ts:573` reads; no toast, can be pressed again (`:174`). With zero domains it can never be pressed (`:149,173`). Sunday start is hard-coded (`:29-38`), while Activity uses Monday on the device clock (`ActivityPage.tsx:103-108`), Calendar defaults to Monday (`ViewOptionsPopover.tsx:22`), and your weekend setting is Fri+Sat (`lib/weekend.ts:1-4`). "Sweep all three and the frond unfurls flat", but "three" is the design's sample count, and the fern is fixed at `unfurl2` (`:170,260`). **No loop entry:** Review is the only loop step with no Today prompt (only nav, ⌘K and the More sheet). | Make two chips act: park it → someday or paused; needs a look → Today's Slipping. Close the week → toast + a "week closed ✿" state. Start the week from `weekend_days` (your Friday). Add your three Friday questions (floors held? what got finished, and who saw it? next week's one thing). Show a Review card on Today on your review day. |
| Slipping | **SUPPORTING**, with a data bug | Days since the last activity per domain, project or area (`0053_trash_domains.sql:64-115`); "reviewed" really writes a touch (`slipping/api.ts:55`). **Archived projects are included**: the view filters only `deleted_at` (`0053:26`), so a pressed project shows up "untouched". Routine check-ins don't count as touches (`routines/api.ts:134`). Threshold fixed at 7, while `app_settings.slipping_default_days` is never read (`slipping/api.ts:9`, `lib/settings.ts:19`). Areas and domains always show plant stage `p0` (`TodayPage.tsx:458-459`). | Add `status <> 'archived'`, and count routines toward their domain. |
| Resurfacing "From a while ago" | **HALF-BUILT** (the rule is honest; the promise is not) | It's a plain weighted-random rule, not AI (`0059`). Its actions do real things with Undo (`resurfacing/api.ts:101-160`). **"Not now · back in N days" is false**: there's a 14-day floor, and after it the pick is random (summary item 1). "Keep" on a filed note writes a mark that changes nothing (`api.ts:162-165`). PLAN.md promised "old entries/quotes", but it only rotates tasks and inbox items. | Have `do_resurface` honour `snoozed_until` *instead of* the 14-day floor for snoozed rows, or change the label to "rests at least two weeks". Your call: give quotes a reader here, if the Library stays. |
| Activity feed | **SUPPORTING**. You kept it (ROADMAP 2026-07-16). | Also serves as notification history (`ActivityPage.tsx:42`). The journal autosave writes `journal.updated` on every 800ms pause (`JournalPage.tsx:277-285`), which floods the feed. Filters run *after* a 50-row fetch (`ActivityPage.tsx:196`). Day headers use the device clock. | Log `journal.created` only, or collapse repeats. Link Review → "what got finished this week". |

### 2.6 Beside the loop (life-OS)

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Routines (streaks, goal days, time-of-day fold, reminders) | **CORE**: your notebook's HABITS row (Qur'an · rep · move · read) | Streak + vine, goal days (0046), fold by time of day, archive + Undo (`routines/api.ts:105-109`). Edit after create was merged 2026-10-12. Reminders now really send (0062). Rituals vs routines was decided: fully separate (KAI-AUDIT-2026-07-20 row 6). No prayer anywhere (searched `app/` and `supabase/`). 1,587 lines. | Keep. Add a "don't score this one" flag before any devotional routine goes in (2.8). |
| Routine steps (0028) | **HALF-BUILT** | Written by the form (`NewRoutineForm.tsx:91`) and read back **only into the edit form** (`newRoutine.ts:99`); they never show when you check the routine. Flow Audit §5: "show them when you check the routine, or drop the field". The queued Routines 2a/2b builds *more* on this field (§4.3). About 55 lines of rate/sparkline helpers have lost their UI and are used only by tests (`routines/streaks.ts:198,213,312`). | Show steps on check (a fold under the row), or drop them. Delete the dead helpers. |
| Projects / Areas / Domains | **SUPPORTING**, but not yet "simple" | You ruled "projects stay simple but get easier" (v1.0.21). Things that earn their place: rename in place, change type, Organize card, editable status updates (your 2026-10-06 asks), area tended weeks. 3,107 lines; `ProjectDetailPage.tsx` alone is 1,220. | See the next row for the cuts that deliver "simple". |
| Project checklist "task-linked" items + milestone-linked tasks | **HALF-BUILT** | A "task-linked" checklist line creates a task *and* a checklist line holding its `task_id` (`ProjectDetailPage.tsx:411-418`, `projects/api.ts:207-225`). Nothing reads that `task_id`, so ticking one never ticks the other, yet the row is tagged "task-linked" (`:792`). Three places compute "milestone done when its linked tasks are done" (`ProjectsPage.tsx:122`, `ProjectDetailPage.tsx:354,569`), but nothing in the UI ever *sets* `tasks.milestone_id`; it's only cleared (`inbox/api.ts:189`, `projects/convert.ts:80`). Archive has two rules: Detail goes confirm → ceremony, while ⋯ "Finish & press" skips the confirm (`ProjectsPage.tsx:243`). | Drop the task-linked type and the milestone-linked-task branches (about 150 lines). One archive rule: tap + Undo. |
| Retainers (monthly reload, 0038/0047) | **SUPPORTING** (Jerad row 28; your Shaheen retainer) | Open tasks roll to the 1st and the checklist resets (cron `retainer-reload-monthly`). | Keep. |
| Journal page | **SUPPORTING** (the line is CORE; the page around it is half ornament) | Entries, Talk it out and Photo now work (2026-10-12; Photo fails until **0060 is pushed**). **The "Kept · N days of showing up" streak resets after a gap** (`JournalPage.tsx:1124-1139`, `journalDay.ts:41-45`), against your Notebook rule. "Quote of the day" is just the newest quote, forever (`JournalPage.tsx:163-165`). On a phone you can't open another day (`:617-760`). The page ignores Paper texture (`:629,824`). `journal_entries.transcript` is written and never read (`:333,337`). The 🎤 emoji breaks SPEC rule 6. | Cut the streak and Quote of the day (about 60 lines). Ask yourself whether mood / "Three small things" are used; they don't map to your four night lines. The Notebook page (in flight) is the right bridge to paper. |
| Library | **HALF-BUILT**; un-parked by the conductor on 2026-10-12 | The 2026-10-12 decision log reads your "build the unbuilt designs" as un-parking it. **You never named it**; your only words were "park the library" (2026-07-26). On every book it prints "cover placeholder" (`LibraryPage.tsx:953`) and "via capture" (`:946`), which is false. Quotes have no reader except the frozen Journal quote. Edit-after-create was just added to a page with no nav entry. 1,518 lines, 4 tables. | **One yes or no from you before the nav row ships** (claude/fix-grammar). If yes, fix the three false copies first. |
| People (CRM) | **SUPPORTING** | Demo people purged by 0039, shipped in v1.0.2 (`git merge-base` ancestry: commit `31673a00` is in v1.0.2). Nudges are a plain rule (>21 days, ≤4) (`PeoplePage.tsx:127-134`). The birthday card on Today is built. The quick chips log "Phone call catch up" silently with no Undo (`PeoplePage.tsx:148-151`). Interaction ✕ deletes permanently with no Undo (`PersonDetailPage.tsx:335`). A fact's "recurs" flag is stored but no logic reads it (`:107`, `api.ts:74`). One field has three names (Circle / domain / Domains); in flight on fix-grammar. | Add Undo to the chips and the delete, and drop "recurs". |
| Herbarium (shelf of finished projects) | **SUPPORTING** | `HerbariumPage.tsx`. Restore lives on Projects (`ProjectsPage.tsx:853`). Specimen art is hash-picked, so an abandoned project can show p100 (`:26-31`). `<span onClick>` controls (`:198-218`). Grammar pass in flight. | Keep the shelf. |
| Pressing ceremony on archive | **GIMMICK CANDIDATE** in its current form | 5 taps, confirm + Undo, "skip" means two things, Back mid-ceremony archives nothing (summary item 4). Provenance: `docs/UI-OVERHAUL-SPECS.md:117` and punch 51 (`design-integration/V1-PUNCHLIST.md:162`). You commented only on its pacing (2026-10-03, `HerbariumPage.tsx:101`) and never asked for it to gate the archive. | One-tap Archive + Undo; offer "Press it ✿" afterwards from the toast or the shelf. About 130 lines become optional. |

### 2.7 Find, ask, settings and teaching

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Search (⌘/ + page) | **SUPPORTING** | Covers 7 kinds, and every hit opens the thing itself (`search/api.ts:19-55`, 0054). The embeddings barely affect ranking: vectors cover tasks and inbox only, at half weight, and word tiers dominate (`0054:105-196`). Costs one embedding per query plus `embed-drain` every 5 minutes. All free, no Groq. | Keep. Don't extend embeddings to more tables; claude/search-design (0064) is queued. |
| Chat (⌘J) | **SUPPORTING** | Sends search hits, journal snippets of ≤200 characters, Top 3, slipping, today and tomorrow, Groq only (`chat/index.ts:52-73`). 40 a day per user, 80 globally. **Every close wipes the conversation** (`ChatPanel.tsx:25`, unmounted at `AppLayout.tsx:845`), against Flow Audit J15/J16 "Chat keeps the conversation until you clear it". | Move the messages into a store (about 10 lines) and add a Clear button. |
| Settings | **SUPPORTING** | All checked settings are read: zone, weekend, size, animations, paper texture, cooldowns. **Theme "Auto" only follows the system while Settings is open**: `kf_theme_mode` is read only in Settings' own hook (`SettingsPage.tsx:151-166`); `lib/theme.ts:11` and `index.html:12` read `kf_theme`. The Groq row shows an "off" dot although Groq runs chat and parsing (`:496`). "Coming soon" is Google Calendar, shown twice (`:494`, `:1070`), honestly disabled. Dead columns: `digest_hour` ("never read", DATA_MODEL), `confidence_threshold`, `slipping_default_days`, `notifications_last_seen_at`. | Fix Auto in `lib/theme.ts` plus the pre-paint script. Drop the dead columns in a tidy migration. |
| Themes (Light / Dark / Auto) | **SUPPORTING** | 47 lines. Four more themes (prompt 15) and colour packs (prompt 18) wait for designs you haven't run. Both came from a friend's feedback (2026-10-04, prompt index), not from you. | Fix Auto. Treat prompts 15 and 18 as optional; they add no loop value. |
| Onboarding ("your first 3 things" → Top 3) | **CORE** | Flow Audit J2: the three things become the first Top 3 (`onboarding/api.ts:17`). Its parse uses a hard-coded `zone:'cairo'` (`onboarding/firstThings.ts:22,28`). | Keep. Fix the zone. |
| Tour (5 garden notes) + Guide (illustrated articles) + What's new | **SUPPORTING**. Prompt 14 came from a friend's feedback; you ran the designs and asked for What's new. | 1,369 lines + 441 CSS + 53 screenshots. The same how-to copy lives in **four** places: Guide, tour, the `?` sheet, and chat's built-in guide (`chat/prompt.ts:48`). The Guide crops come from the mock app and are about to go stale (event and task popovers are in flight). | Keep the tour and What's new. Have chat read `guide/articles.ts`. Drop the crops, or make regenerating them a release step. |
| Auth (sign-up, sign-in, reset) | **SUPPORTING** | Built. Email confirmation is off until there's an SMTP sender. **Password reset reaches only project members** (Supabase built-in mail, v1.0.19 log). | Fine for one user; it's an SMTP decision before a friend relies on it. |

### 2.8 Garden ornament

| Feature | Verdict | Why (evidence) | Recommendation |
|---|---|---|---|
| Terrarium band (desktop Today) | **GIMMICK CANDIDATE** | Its stages are data-driven (`TodayPage.tsx:397-441`), but it repeats the streak (also in the sidebar), the inbox count (also on the nav badge and the Plan card), and the task count. `terrariumStore.toggleOn` exists, but nothing calls it, so it can't be turned off. Already dropped on the phone (2026-09-28). The export's own review note says it should be replaced ("Stats said three times"). | Cut on desktop, or move it into the fold. Overlaps in-flight Today 2a. |
| Growth stages / plants (7 species) | **SUPPORTING** | Mostly data-driven (`lib/growthStages.ts`). Exceptions: the Review fern is always `unfurl2`; Slipping areas and domains are always `p0`; the widget specimen is always `p80`; the Herbarium uses a hash. Thresholds are copied in 3 places (`TodayPage.tsx:105`, `AppLayout.tsx:327`, `TasksPage.tsx:59`). That breaks SPEC rule 8, "never a stage that contradicts the data". | Make the four fixed stages read data, or use a neutral image. Import the thresholds from `growthStages.ts`. |
| Sidebar streak vine | **SUPPORTING** | The highest current streak of any routine, unnamed (`AppLayout.tsx:305-327`). **No prayer defaults anywhere** (searched for pray, salah, fajr and qur in `app/src` and `supabase/`: 0 hits). But there's no per-routine opt-out of scoring (`lib/types.ts:131-150`), so a prayer routine you add would be scored. | Add a "don't count this one" flag on a routine before you ever add Qur'an or prayer as one. |
| Effects (petal fall, day-complete burst, check bloom, vine sway) | **SUPPORTING** | Gated by the Effects setting and reduced motion (`lib/motion.ts:42-56`). Check bloom is Top 3 only, by your R4-24 ruling. The day-complete burst can fire twice a day (Today and Tasks each keep their own gate, `TasksPage.tsx:506`). `animateRowRemoval` ignores the Effects setting (`motion.ts:97`). | Use one day-complete gate. |
| Seasons page + weather | **GIMMICK CANDIDATE** (dead weight) | `SeasonsPage` (222 lines) and `SEASON_META` exist only in dev builds (`App.tsx:58-73`). What ships: the desktop topbar's "· Cairo · 34° clear" (Cairo zone only, `TopbarEcho.tsx:17`) and the Season widget, which shows Cairo weather in every zone. You live in New Borg El Arab and Tanta, not Cairo. Seasonal drift itself is in your v2 parking lot (The Deal). | Cut the gallery. Gate or drop the weather. |
| Twemoji (iOS-look emoji) | **SUPPORTING**. You asked (ROADMAP 2026-07-20). | `app/public/emoji` is 28 MB. It's excluded from the precache (`vite.config.ts:87-96`), but no rule strips it from the Android/Windows bundles. | Check the APK and installer size, and strip it there if it's bundled. |
| Dev galleries and stubs | **GIMMICK CANDIDATE** (dead code) | `components/Stub.tsx` is imported nowhere. `ScheduleMenu` is used only by `KitGesturesDemo`. `streakRiskMessage` has no caller, and its copy pressures ("streak is on the line", `routines/streaks.ts:312-323`). | Delete. |

---

## 3. Taps for the five daily jobs

Counted from code: one tap = one tap, click, key chord or swipe. Typing and scrolling are not counted. Phone means the Capacitor app; desktop means the web/Windows app. Targets are from the Flow Audit (§2 and Appendix A).

| Job | Phone | Desktop | Target | Feedback | Pure overhead |
|---|---|---|---|---|---|
| **1. Capture a thought** | **2**: centre **+** (keyboard comes up, `CaptureButton.tsx:220-222`), type, **Send** (`CommandBar.tsx:370`). Voice = **1** hold-and-release. | **2**: Capture / `n` / ⌘K (`AppLayout.tsx:578-586`, `TodayPage.tsx:737`), type, **Enter** (`CommandBar.tsx:304`). | 2 + visible confirmation | Typed: **no toast naming the destination**, only a sound (`CommandBar.tsx:154`). A toast comes later only if the AI changed something. Voice: toast, with Undo only when it became a task. | None in taps; the missing confirmation is the gap. |
| **2. Plan the morning** | **1** (Plan on the card, `DayCard.tsx:192`) **+ 1 per carried task** (Today / Tomorrow / Someday / Drop), or 1 "Roll all to tomorrow" (`MorningRitual.tsx:260`) **+ 1 per inbox item** (File / Dismiss; +2 to change project, `:475-482`) **+ 0 picks** when last night seeded (else 1 star each, up to 3) **+ 0 times** (no ✓ needed, `:557-559`) **+ 1 Start the day** (`:392`). A typical morning (2 carried, 2 inbox, seeded) is **6**. A clean morning is **2**. A worst normal morning (5 carried, 5 inbox, nothing seeded) is **15**. | Same, through "Begin" (`DayCard.tsx:37`); `/` jumps to search. | 3–6, no drag | Each section logs its step; "2 of 4 done · Resume" if closed half-way. | None required. On a phone the four sections stack, so it's scroll-heavy, but the CTA is in the sticky footer. |
| **3. Finish a task** | **1** tap on the checkbox: a Top 3 row or the goal (`TodayPage.tsx:1417`, `:1297`), or a task-backed Up next row (`:662`) → `completeTaskWithUndo` (`tasks/api.ts:149-156`). | **1** click (`TodayPage.tsx:1437,1310,1486`), or `j` then `e`/Space = 2 keys (`listShortcuts.ts:16`). | 1 + Undo | "Done · Undo". A second tap reopens, also with Undo (`:1220-1224`). Bloom only on Top 3 (your R4-24 ruling). | None. |
| **4. Move a task to tomorrow** | **1** full right swipe on a Today or Tasks row, no long-press needed (`SwipeRow.tsx:125-132` → `useRowGrammar.tsx:21` → `tasks/api.ts:257`). It lands at 09:00 tomorrow on your clock. Tap path: ⋯ → Plan… → Tomorrow = **3** (`TaskMenu.tsx:127`, `PlanMenu.tsx:120`). An Up next **block** swiped right moves to the *same time* tomorrow (`today/rowMenus.ts:40-46`; the menu says "Tomorrow, same time"). | **3**: right-click → Plan… → Tomorrow (`taskMenuSpec.ts:49`). Or **2** keys: `j` + `2` (`TodayPage.tsx:312`). A mouse never swipes (`SwipeRow.tsx:12,72`). | 1 swipe (phone) | "Moved to tomorrow · Undo" | **Desktop: the "Plan…" submenu level.** Tomorrow was 2 clicks on 2026-09-27 (Flow (All Paths) App. A, J8) and is now 3, because the 2026-10-07 Plan/Replan menu nested it. |
| **5. Shut down** | **1** (Shut down on the card) **+ 1** "Roll all to tomorrow" (or 1 per row: ✓ / Tomorrow, `EveningRitual.tsx:219,244`) **+ 1** tap the one-line field, then type (Save is optional; Close the day saves it, `:165`) **+ 0** Tomorrow's 3 (pre-starred, `:67`) **+ 1** Close the day (`:358`) = **4**. "Goodnight" is optional; the summary closes itself after 3s (`:179-183`). | Same, **4** (Begin, Roll all, field, Close the day). | 3–4 | Toasts with Undo on ✓ and Tomorrow; the summary lists "N done · N seeded". | The 3-second summary beat (optional). |

**Day total:**

| Part | Phone | Desktop |
|---|---|---|
| Plan | 6 | 6 |
| Three Top 3 finishes | 3 | 3 |
| One move to tomorrow | 1 | 3 |
| Shut down | 4 | 4 |
| **Loop total** | **≈ 14** | **≈ 16** |
| Each capture | +2 (or 1 by voice) | +2 |

That is inside or at the edge of the Flow Audit's 10–15 target, against the 30–45 it measured on 2026-09-27. **Every remaining tap is a decision except one**: on desktop, Tomorrow sits one level down inside "Plan…". Pulling a plain "Tomorrow" back to the top of the right-click menu restores 2 clicks.

**Overhead outside the five jobs:**
- Weekly-review verdict taps that do nothing (2.5).
- The 4–5-tap pressing ceremony (2.6).
- "Not now" on resurfacing, a tap whose promise isn't kept (2.5).
- Inbox "Someday", which hides an item for a year (2.1).
- Perennials "Pause", which pauses nothing (2.3).

**The one design gap in the loop:** Review, the 5th step, has no "next move" card on Today. The Day card covers only Plan and Shut down (`today/dayPhase.ts:5-9`). The only way into Review is the nav.

---

## 4. Faithfulness: where a later build drifted, or is about to

### 4.1 In flight: Today 2a + MK Now Card (claude/fix-today) would bring back a card during the day
- **The builder's version.** It shows the slip in `next` (a block within 15 minutes) and `free` ("Free until 14:30 — pick from Top 3") states whenever nothing runs. See `.claude/worktrees/agent-ad50c6157d64e11ce/app/src/features/today/todayLayout.ts:41-46` (uncommitted) and `nowCard.ts:9,116-118`. On desktop it replaces the Day card with a "Now" card at the top, citing "Today.dc.html 2a (Kai's reviewed desktop pass)".
- **Your rulings.**
  - 2026-09-27: *"why display the same thing twice… why does that next even exist if I see the Top 3 and Up next?"* The card exists "only for ritual moments" (Flow Audit §7d; `docs/DAILY-CYCLE.md:25`).
  - 2026-09-28: you chose 1b "Taped slip", **"shown only while something is actually running"** (vault Build Plan; `docs/log/2026-09-28-0827-today-phone-handoff.md`).
- **Where the conflict comes from.** DS-CHANGELOG §3 lists Next and Free as slip states. The UI_REVIEW "Now first" card is what you narrowed down.
- **Ask before it merges:** slip only while running (your ruling, the current code), or Next/Free too (the export)?

### 4.2 Already drifted
| Drift | Your words | Code |
|---|---|---|
| Week start | "My weekend is Friday and Saturday… Don't force people to be someone they're not" (`lib/weekend.ts:1-3`); your review is Friday (The Notebook) | Review hard-codes Sunday (`WeeklyReviewPage.tsx:29-38`); Activity uses device-clock Monday (`ActivityPage.tsx:103-108`); Calendar defaults to Monday |
| Journal streak | "A missed night is just a blank line. No catching up, no reset." | `writtenStreak` resets (`journalDay.ts:41-45`) |
| Pressing ceremony | Flow Audit §5: optional, after one-tap archive + Undo | The ceremony *is* the archive, behind a confirm (`ProjectDetailPage.tsx:977-990`) |
| Resurfacing cooldowns | Your spec: high ~2d / medium ~5d / low ~10d (The Deal, punch 25) | A 14-day floor makes all three meaningless (`0062_notify_drift.sql:82`, `0059_resurface_settles.sql:15`) |
| One capture | Flow Audit §5: "Five capture paths → One" | 7 paths, 5 rule sets (2.1) |
| Chat memory | Flow Audit J15/J16: "Chat keeps the conversation until you clear it" | Wiped on close (`AppLayout.tsx:845`) |
| Hard-coded zone | CLAUDE.md: "never hard-code a zone" | `onboarding/firstThings.ts:22,28` (`zone:'cairo'`); weather is Cairo for the widget in every zone |
| Library parked | You, 2026-07-26: "park the library" | Un-parked by the conductor's reading of "build the unbuilt designs" (2026-10-12 decision log). Needs your explicit yes |

### 4.3 The "build the unbuilt designs" queue, run through the loop test
From `docs/log/2026-10-12-1839-local-decision-unbuilt-designs.md`. You did ask for these, so none is a gimmick by definition. A blanket "build everything drawn" is exactly where slop sneaks in, though, so each line says whether it serves the loop.

| Queued build | Serves the loop? | Suggest |
|---|---|---|
| Search 1a/1b (filters, Library group, Related) | Yes, Find | Build |
| Calendar §5 block detail + repeats (in flight) | Yes: you reported the dead popup and missing repeats | Build |
| Today 2a + Now states (in flight) | Partly: the Now card conflicts with your ruling (4.1) | Ask first |
| Inbox t3 (in flight) | Yes, Capture → Plan | Build; include the honesty fixes (2.1) |
| Task detail popover, Repeat custom (in flight) | Yes, Do | Build |
| Library nav row (in flight) | Only if you want the Library | Ask first |
| Calendar §4 collapsed planning mode (4a/4b) | It's the parked Planning board again, as a third planning surface beside the rail and Plan my day | Ask first: does it *replace* `/planning`? |
| Calendar 3e (multi-day «», midnight ⌄/⌃) | Yes, small | Build |
| Editor 1b–1e full create pages | No: more ways to create, against "one capture component" | Re-confirm |
| Labels picker (L) + manager | Organizing, not the loop; labels already have a filter | Re-confirm; low value |
| Routines 2a/2b (step minutes, reorder, plant species picker) | No: builds on a steps field nothing displays (2.6). The species picker invites tinkering, which is your noted avoidance pattern (CRITICAL.md) | First show steps on check, or drop them |
| Settings 2a GitHub rules panel | Only if GitHub is actually connected | Ask first |
| Tray notices (paper ready, birthday, sync problem) | Mildly | Build after release |
| Paper capture extras (lock-screen notice, reorder, HEIC) | Mildly; HEIC matters for iPhone friends only | Defer HEIC |
| Motion 2b/4e/3a stack push/pop · Effects 2j/2k/2l | Ornament. 2l "long-press bloom" sits on a gesture that already gives haptics and select mode | Re-confirm; gate behind Effects |
| Night 1a–1f (moonflower + fireflies on Today, rim-lit vine) | Ornament, and touches every surface | Re-confirm; last, gated |

---

## 5. Data written that nothing reads, and write-only settings
| What | Written at | Read by |
|---|---|---|
| `review.verdict` (`park it`, `needs a look`) | `WeeklyReviewPage.tsx:133` | The page itself; Slipping counts it as a touch |
| `review.week_closed` | `WeeklyReviewPage.tsx:174` | Activity text only |
| `journal_entries.transcript` | `JournalPage.tsx:333,337` | Nothing |
| Person fact `recurs` | `PersonDetailPage.tsx:107` | Displayed only; birthday maths ignores it (`people/api.ts:74`) |
| `app_settings.confidence_threshold`, `slipping_default_days`, `digest_hour`, `notifications_last_seen_at` | Settings row defaults (`lib/settings.ts:17-21`) | Nothing (hard-coded constants instead) |
| `kf_theme_mode` ("Auto") | `SettingsPage.tsx:151` | Only while Settings is mounted |
| `terrariumStore.on` | `today/terrariumStore.ts` | Read, but `toggleOn` has no caller |
| Resurfacing `snoozed_until` | `resurfacing/api.ts` | `do_resurface`, but the 14-day floor overrides every value under 14 |
| `tasks.paused` (Perennials "Pause") | `tasks/api.ts:502-510` | Only `PerennialsPage.tsx`; completion, lists and notify ignore it |
| `projects.checklist[].task_id` ("task-linked", jsonb) | `projects/api.ts:207-225` | Nothing; the two copies never sync |
| `tasks.milestone_id` | Never set by the UI | Read by 3 "milestone done" computations (`ProjectsPage.tsx:122`, `ProjectDetailPage.tsx:354,569`) |
| `routines.steps` | `NewRoutineForm.tsx:91` | Only the edit form (`newRoutine.ts:99`) |
| `time_entries.task_id` | `focus/api.ts`, `projects/api.ts` | Nothing |
| `activity_log` `project.work_logged` with a random `entity_id` | `focus/api.ts:48`, `projects/api.ts:281` | Points at nothing |

---

## 6. Method and limits
- **How this was done.** Four read-only auditors each read one slice of `app/src/features/*` and its migrations and functions. I re-verified every "most slop-like" and "strongest" claim in the code, plus the tap counts for Plan and Shut down. Ground truth was DAILY-CYCLE, PLAN §1/§3, the ROADMAP changelog, design-export/SPEC, the vault notes listed at the top, CRITICAL.md and The Notebook.
- **Not done.** No app was run, no live database was queried, and no device was used. "Never tried on your phone" and "no log shows it connected" come from the release logs, not from your accounts. The demo-seed purge (0039) is in master since v1.0.2; whether every demo row is gone from your live account wasn't checked (the MCP server doesn't expose people or journal).
- **Kept out of scope.** Visual design (yours), the website (claude/site-3), and ds-check.
- **Release blockers noted in passing.**
  - `db push` for 0060 (journal photos) and 0062 (notify) must go before the frontend.
  - 0062 clears stale Top 3 stars. That is non-destructive but worth a line in the release note.
