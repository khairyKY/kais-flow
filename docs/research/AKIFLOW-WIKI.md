# Akiflow — Feature & UX Reference Wiki

> **Purpose:** A fact-gathering reference to plan Kai's Flow against, using **Akiflow as the benchmark**. This catalogs *what Akiflow does and why people love it* — feature-for-feature, plus its UI/UX language for future design work.
> **This is research, not a plan.** No decisions, priorities, or "we should build X" here. Compiled 2026-07-08.
>
> **Sources:** Two layers. (1) **Verified official** — pulled directly from `akiflow.com` and Akiflow's own help/how-to docs (command syntax, keyboard map, integrations, pricing, changelog). These are exact and authoritative. (2) **Synthesis** — a Gemini deep-research pass over ~56 sources (review sites, Reddit, G2, Product Hunt, competitor comparisons) for sentiment, philosophy, and UX narration. Where the two conflict, **official wins** and the conflict is flagged inline.

---

## 0. What Akiflow is, in one paragraph

A premium, **keyboard-first** desktop app that consolidates tasks from dozens of tools into **one universal inbox**, then makes you **drag each task onto a calendar** to give it a real block of time. Its identity is the **Command Bar** (a global quick-capture/command palette) and **manual time-blocking** — you stay the scheduler, the app just makes it fast. As of 2026 it has pivoted toward AI ("Aki" assistant, a hosted MCP server, an auto-join meeting transcriber, and a schedule optimizer) but still keeps the human in the approver seat. Positioned between mindful manual planners (Sunsama) and fully-automated AI schedulers (Motion). $34/mo, no free tier, polished desktop / weak mobile.

The tagline currently on the homepage: **"One app for tasks & calendars powered by AI"** — *"Save hours every week with your calendars, tasks, and assistant. All in one place."* Older positioning leaned on **"save up to 2 hours/day."** Target audience named on-site: *"founders, operators, and obsessed doers."*

---

## 1. The philosophy — "The Method"

Akiflow markets a named 5-step methodology (`akiflow.com/method`). This is the mental model the whole product is shaped around — worth internalizing because *the features are just this loop made fast*:

1. **Capture** — brain-dump everything into a single **universal inbox**; externalize all commitments across platforms so nothing lives only in your head.
2. **Process / Prioritize** — triage the inbox to zero. Framework they cite: the **Eisenhower Matrix** (urgent × important). Use projects + labels for context.
3. **Plan** — **time-blocking**: allocate a specific calendar slot to each task, with buffer time. "A to-do list without a calendar is useless — it ignores the finite capacity of a day."
4. **Execute** — work one block at a time, no multitasking. They cite the **motion vs. action** distinction (planning ≠ doing) to reduce decision fatigue.
5. **Review** — a **daily shutdown ritual**: review what got done, replan what didn't, prep tomorrow. Grounded in closing "open loops" (Zeigarnik effect) so you can psychologically detach in the evening.

Recurring blog/marketing themes reinforcing this: **single source of truth** ("everything that takes time belongs in one place"), **context-switching is the enemy of deep work**, **inbox zero applied to tasks**, and **self-automation via rituals** (offload memory to the system).

---

## 2. Complete feature catalog

### 2.1 Universal Inbox (the flagship data-aggregation feature)
- One triage view for tasks created natively **plus** items auto-imported from **3,000+ tools** (native integrations + Zapier/IFTTT).
- Instead of checking Gmail, Slack, Asana, Jira separately, everything flagged/assigned/saved lands in one feed.
- **Inbox-Zero workflow** (the intended loop): process ~twice daily. For each item decide:
  - < 2 min → do it now, press **`E`** (done).
  - Needs time → press **`P`** (Plan → schedule on calendar).
  - Not now → **`Cmd/Ctrl + S`** (Plan for Someday) or move to Inbox with **`Cmd/Ctrl + I`**.
- **Two-way sync:** completing/editing in Akiflow reflects back in the source app (check off a Todoist task in Akiflow → done in Todoist).
- **Bulk triage:** select many (`Cmd + A`) and label/schedule/defer at once.

### 2.2 Command Bar (the identity feature)
- **Summon:** **`Cmd/Ctrl + E`** globally (anywhere on the OS via the desktop app), **`Cmd/Ctrl + K`** from inside Akiflow.
  - *(Conflict flag: the deep-research synthesis claimed `Cmd+K`/`Opt+Space`; Akiflow's own command-bar doc says **`Cmd+E` global / `Cmd+K` in-app**. Trust the official values.)*
- **Natural-language parsing:** type a task in plain English and it extracts metadata. e.g. *"Call John today at 3pm for 1 hour"* → title "Call John", scheduled today 15:00, duration 60 min. Understands weekdays ("Monday"), relative dates ("Tomorrow", "next Friday"), dates ("6/6", "June 6"), and recurrence ("Every Week").
- **Special-character quick-add syntax** (verbatim from Akiflow docs — this is the exact grammar):

  | Symbol | Sets |
  |---|---|
  | `>` | Assign task to a **time slot** |
  | `=` | **Duration** (task/event) |
  | `#` | **Project** |
  | `*` | **Tags** |
  | `<` | **Deadline** |
  | `!` | **Priority** |
  | `\|` | **Calendar** (which calendar the task/event lands on) |
  | `@` | **Guests** (event) |
  | `//` | **Description** (task/event) |
  | `ESC` | Remove a recognized token |

- **Create paths:** type + `Enter` → task into Inbox. `Ctrl/Cmd + 2` → "New Event" instead. Type "Zoom" → prompt to create a Zoom meeting.
- **Capture from anywhere:** copy text on a webpage → open command bar → `Enter` saves it to Inbox (with a link back); press `O` to jump back to the source.
- **In-app command palette:** navigate to any feature/project/tag, adjust the calendar, switch theme, open support — all from the bar.

### 2.3 Keyboard shortcuts (the full verified map)
Akiflow is strictly keyboard-first; **every shortcut is customizable** in Settings › Shortcuts. On Windows use `Ctrl` for `Cmd` and `Alt` for `⌥`.

**Global / navigation**
| Action | Keys |
|---|---|
| Go to Inbox | `I` or `Cmd 1` |
| Go to Today | `T` or `Cmd 2` |
| Go to Upcoming | `U` or `Cmd 3` |
| Go to any feature/view/page | `G` |
| Search tasks & events | `/` or `Cmd F` |
| Open Aki Chat | `A` |
| Record message to Aki | `⌥ A` |
| Share Availability | `S` |
| "Meet with" | `@` |
| Show/hide Tasklist | `0` |
| Show/hide Akiflow (desktop) | `Cmd Shift` |
| Help & Guides | `?` |
| Settings | `Cmd ,` |
| Close notifications | `Shift Cmd Backspace` |

**Task navigation & actions**
| Action | Keys |
|---|---|
| Prev/next task | `J`/`K` or `↑`/`↓` |
| Move task up/down | `Cmd ↑`/`↓` |
| Focus mode | `F` |
| Focus mode while working | `Cmd Shift F` |
| Filters / Sorting | `Shift F` / `Shift S` |
| Select all | `Cmd A` |
| Move to Inbox | `Cmd I` |
| Create task | `C` |
| Create task in calendar | `Cmd Click` |
| Plan (schedule) | `P` |
| Plan for Someday | `Cmd S` |
| Duplicate | `Cmd D` or `⌥ Click` |
| Open link / Copy link | `O` / `Cmd O` |
| Copy task titles | `Cmd C` |

**Edit task**
| Action | Keys |
|---|---|
| Edit | `Enter` |
| Mark done | `E` |
| Undo | `Cmd Z` |
| Assign project | `#` |
| Assign/remove tag | `*` |
| Assign deadline | `<` |
| Set as priority Goal | `H` |
| Edit priority | `!` |
| Edit duration | `Cmd =` |
| Edit links | `L` |

**Calendar views & navigation**
| Action | Keys |
|---|---|
| Day / 2–6 days / Week / Month | `D` or `1` / `2`–`6` / `W` or `7` / `M` |
| Return to Today (desktop) | `Cmd T` |
| Prev/next period | `-`/`=` or `'`/`` ` `` |
| Secondary time zone | `Z` |
| Join upcoming meeting | `Cmd J` |
| Show/hide calendar in Upcoming | `0` |

**Events / time slots** — create `⌥ Click`, delete `Backspace`, duplicate `Cmd D`, edit recurring instance `Shift Click`; time-slot pin `F`, plan `P`. **Command bar** — open `Cmd E` (global) / `Cmd K` (in-app), exit `ESC`. **Menu bar** — `Cmd Y`.

### 2.4 Calendar & time-blocking
- **Views:** Overview, Day, 2–6 day, Week, Month. Week view is the time-blocking centerpiece.
- **Overlays:** aggregates multiple Google + Outlook accounts side-by-side; meetings and tasks share the grid.
- **Drag-to-schedule:** the core mechanic — drag an unscheduled task from Inbox/Today onto the timeline to create a visual block.
- **Calendar locking:** "lock" a task to a real calendar account → it becomes a **busy event** on that Google/Outlook calendar, protecting the time from colleagues.
- **Inline resize:** drag a block's edge to change duration; the task's duration updates live.
- **Conflict detection**, customizable event colors, per-event notifications.
- **Secondary time zones** shown side-by-side on the grid.
- **Schedule Optimizer** (2026, AI): one click auto-reflows the rest of the day into open slots if a task ran long. Still user-approved, not silent auto-scheduling.

### 2.5 Tasks — properties & actions
- **Rich task object:** title, description, planned time, duration, recurrence, priority, status, **deadline**, embedded links to source content.
- **Deadline vs. scheduled date** are *separate* concepts (due-by vs. done-on). *Known gap users complain about: deadlines are date-only, no time-of-day.*
- **Subtasks** (native, shipped v2.76 / June 2026) — nested checklists, independently schedulable.
- **Recurring tasks:** daily/weekly/monthly/yearly/custom; sync to Google Calendar as recurring events without duplicating.
- **Bulk actions:** multi-select → label / schedule / snooze / move.
- **Task history / stats:** time-usage analytics; task countdown within a time slot.
- **Daily goals:** designate 1–3 key tasks as **Goals** (`H`) for visual prominence.

### 2.6 Rituals (guided routines — prevents the system rotting into a task graveyard)
- **Daily Planning (morning, ~5–10 min):** review yesterday → set 1–3 goals for today → clear the universal inbox → time-block the day. Rendered as a **wizard-like full-screen flow** replacing the 3-pane layout.
- **Daily Shutdown (evening):** review completed work, replan undone tasks (drag missed tasks to tomorrow to prevent overload), prep tomorrow, rate the day / check stats. Rationale: close open loops → detach.
- **Weekly Planning:** review last week's done/overdue + goals → write new weekly goals → jot reference notes → pull tasks from Inbox/Month/Someday into the active week → time-block the week.
- **Weekly Shutdown (~5 min, Friday):** review time-spent stats, rate the week, wrap loose ends.
- **Configurable reminders:** Settings › Rituals lets you set when Akiflow nudges you, with custom times per ritual.
- Three-beat framing marketed as: **Reflect → Plan → Refine**.

### 2.7 Time Slots & Availability Sharing (replaces Calendly)
- **Time Slots:** reusable templates for *kinds* of work (e.g. "Deep Work", "Admin"); drag tasks into them. Can be recurring and **locked**.
- **Booking links / Share Availability (`S`):** select open blocks → generate a scheduling link; invitees book one-off or recurring meetings inside your rules without disturbing pre-planned blocks.

### 2.8 Focus Mode
- Trigger **`F`**. Hides calendar/inbox/chrome and shows only the current task + a built-in **focus timer**. `Cmd Shift F` enters focus while working.

### 2.9 Snooze / Someday / defer
- Traditional **Snooze was removed**, replaced by a **"Someday" page + Time Frames**. Non-actionable tasks go to Someday (off the calendar, still sortable by priority/age/project) and get pulled back during Weekly Planning. One-click "Someday planning" on desktop (v2.75).

### 2.10 Labels, priorities, organization
- Custom **labels/tags** for filtering + color-coding the day.
- **Smart Tags** (AI) auto-bucket tasks into Work/Personal.
- **Projects** + **sections** (create section `Cmd Shift C`) for structure.
- **Goal** priority flag for daily/weekly prominence.

### 2.11 Notifications & reminders
- **Menu-bar / tray app** keeps the current schedule glanceable without opening the main window.
- **Smart meeting alerts:** desktop reminder before meetings with a one-click **"Join Meeting"** button (`Cmd J`) — no hunting for the Zoom/Meet URL.

### 2.12 Search
- Universal search (`/` or `Cmd F`) across tasks, events, **meeting transcripts**, and contacts.

### 2.13 Aki — the AI assistant (2025→2026 build-out)
- **Aki Chat** (`A`) + **voice capture** (`⌥ A`, and Siri): natural-language planning, prioritization, daily briefings, reminders.
- **Aki Meeting Assistant:** auto-joins Zoom / Google Meet / Teams calls (from selected calendars), records, transcribes with **speaker labels**, produces an AI **summary** (default view post-meeting), auto-detects action items into a tab → one-click into Inbox, and drafts ready-to-send recap emails (tone customizable).
- **Daily Dashboard** (mobile): AI morning/midday briefs.
- **Smart Time Slots / auto-scheduling / recurring handling** assisted by Aki.
- *"Phone call" capability marked "Coming soon" on the homepage.*

### 2.14 Platforms, sync, offline
- **Native desktop (Windows + macOS), web app, iOS, Android.** PWA-style menu-bar presence on desktop.
- **Offline mode:** process inbox + plan calendar offline on desktop; syncs on reconnect.
- **Mobile is the weak spot** — mostly quick capture + Daily Dashboard, not full schedule manipulation; frequently cited as underdeveloped.

---

## 3. Integrations (verified native list + sync direction)

Native connectors generally do **two-way sync** (state changes flow back to the source). ~18 native + 3,000 via Zapier/IFTTT.

| Category | Integrations | What syncs |
|---|---|---|
| **Calendars** | Google Calendar, Outlook Calendar | Two-way. Events pulled in; tasks dragged onto Akiflow create real busy blocks back |
| **Meetings** | Zoom | Schedule/create meetings & pull links into the calendar |
| **Email** | Gmail, Outlook Email | Flagged/starred emails → tasks (body → description, deep link back). Also Superhuman / Apple Mail (iOS) routing |
| **Task managers** | Todoist, Microsoft To Do, Google Tasks | Two-way task/list sync (Todoist pulls projects+labels; complete-in-Akiflow checks off source) |
| **Project mgmt** | Asana, Trello, ClickUp, Notion | Boards/tasks/DB items → Inbox (Notion & ClickUp lean import-only per some reviews) |
| **Dev tools** | Jira, GitHub, Linear | Assigned issues / PRs / tickets → daily plan (marketed as "native 2-way, tailored to developers") |
| **Comms** | Slack, Microsoft Teams | Saved/starred messages → tasks (often practically one-way into Akiflow) |
| **Automation** | Zapier, IFTTT (+ Make) | Webhooks push anything (Evernote, Things, HubSpot, Salesforce, etc.) into the Inbox |

Notable **missing** native connectors users complain about: **Apple/iCloud Calendar**, **Fastmail**.

---

## 4. Developer / API surface

- **No traditional public REST API.** For years users asked for one (to extract stats, build dashboards, bidirectional niche sync); Akiflow declined, pushing people to Zapier/Latenode/Make webhooks (some hunting hidden Inbox UUIDs via devtools).
- **The pivot = a hosted MCP server** (`mcp.akiflow.com`, Summer 2026). Instead of REST, they exposed Akiflow to **AI assistants via Model Context Protocol** (OAuth-authed). Compatible clients: Claude, ChatGPT, Cursor, Windsurf.
- **MCP capabilities:** create/edit/plan/reschedule tasks; create/edit events & time slots; manage multiple calendars & invite guests; query schedule across any date range (returned in your time zone); pull meeting transcripts into the AI workflow.
- **Webhooks** still available via Zapier/IFTTT/Make for inbound JSON → Inbox.
- The `akiflow.com/developers` page itself is a marketing page (dev pain points → capture/plan/execute → Jira/GitHub/Linear integrations + FAQ), **not** technical API docs. There's a community-built third-party `akiflow-mcp` on GitHub too.

---

## 5. Changelog trajectory (what they've been building)

The arc: **calendar/task aggregator → AI-assisted daily OS**, while staying manual-first.

- **v2.59 (Oct 2025)** — mobile parity push; iOS/Android **Live Activities** (current task on lock screen).
- **v2.64 (late 2025)** — first AI: **Siri voice capture**.
- **~v2.68.5 / v2.70.7 (Mar–Apr 2026)** — **Aki Meeting Assistant** (auto-join, transcribe, summarize, extract tasks); subscribers got 3 free transcripts.
- **v2.69.3 (Mar 2026)** — Google Calendar **hidden calendars** support + filtering.
- **v2.71.8 (Apr 2026)** — stabilization: recurring-event bugs, GCal sync reliability, better date NLP ("next Friday").
- **v2.72 (Apr 2026)** — calendar editing + recurring-task reliability.
- **v2.74 (May 2026)** — 90+ fixes; notification-badge cap; auto-lock default off.
- **v2.75 (Jun 2026)** — 80+ fixes; one-click **Someday planning**; mobile drag-reorder.
- **v2.76 "Summer Release" (Jun 2026)** — biggest of the year, 4 majors: **MCP server**, native **Subtasks**, mobile **Daily Dashboard** (AI briefs), **Schedule Optimizer** (auto-replan).
- **v2.77 (Jul 2026)** — Focus Timer in command bar, custom event messages, 100+ fixes, mobile battery overhaul.

**Read:** heavy investment in **stability**, **AI (MCP/Aki/meetings)**, **task depth (subtasks/recurring)**, and **mobile catch-up** — automation is being added cautiously with the user as approver (to answer Motion) rather than full auto-scheduling.

---

## 6. Why people love it / what makes it "naturally good"

Sentiment is **sharply split**: adopters of the keyboard workflow become evangelists; people expecting mobile parity or automated magic churn fast.

**What people praise**
- **Keyboard-first speed** — `Cmd+E` → type a thought → categorized + scheduled without touching the mouse is repeatedly called the "magical" moment. A shortcut for *everything*.
- **Consolidation (the real job-to-be-done)** — cures tab/tool fatigue; people report saving 30–60 min/day of admin overhead; daily planning drops from ~30 min to <5.
- **Visual drag-and-drop** — dragging an email/task onto a 2 pm slot is described as intuitive and stress-relieving; the tactile plan-your-day feel.
- **Rituals** give structure that keeps the system honest.
- **White-glove onboarding** — 1:1 onboarding calls during trial are frequently praised.

**Common complaints / churn reasons**
- **Price** — $34/mo is among the most expensive personal-productivity subs.
- **Billing practices** — Trustpilot/Reddit reports of surprise post-trial / ~$228 annual charges and a strict refund policy ("billing nightmares").
- **Mobile app** — underdeveloped vs. desktop; bugs, sync delays, limited views.
- **Missing native integrations** — Apple/iCloud Calendar, Fastmail.
- **Overwhelm** — piping *every* email/Slack message into one list can create clutter/anxiety instead of relief.

**The core value proposition:** eliminate context switching by making one app the single source of truth for everything that takes time — and make committing time to a task a one-keystroke, one-drag act.

**Competitor contrast (for positioning context)**
| Tool | How it differs from Akiflow |
|---|---|
| **Motion** | Algorithmic auto-scheduler (deadlines → auto-plans day). Akiflow = manual/precise, user places blocks. Motion better for chaotic team/dependency workloads. |
| **Sunsama** | Mindful, deliberately slow daily manual pull; discourages over-scheduling. Akiflow = speed + high-volume auto-capture + fast triage. |
| **Morgen** | Cheaper (~$15/mo), background AI planning, but weaker ecosystem integrations + no Command-Bar speed. |
| **Reclaim AI** | Team-scheduling + habit protection across a company. Akiflow = single-player personal tool. |
| Others named for contrast | Todoist, Amie, Routine. |

---

## 7. Pricing & plans

Premium-positioned, **no permanent free tier**.

| Plan | Price | Notes |
|---|---|---|
| **Pro Monthly** | **$34 / mo** | No commitment; all integrations/tasks/meetings, all Power Features, Aki, free 1:1 onboarding |
| **Pro Yearly** | **$19 / mo** (billed $228/yr) | ~44% off; "PROMO" on-site |
| **Believer (legacy)** | ~$14.90/mo (2-yr) or ~$8.33/mo ($500 / 5-yr) | Availability to new users varies |
| **Teams** | ~$60/user/yr (sales-gated) | Shared workspaces + admin |
| **Trial** | **7 days free** | Booking the 1:1 onboarding call extends to 14 days |

- **Discounts:** ~50% for students/researchers (.edu), military, healthcare; $25 referral credits.
- **Possible add-on cost:** some reviewers report the **Aki Meeting Assistant** (transcription) may need a paid add-on beyond Pro; standard Aki features are in Pro.

---

## 8. UI / UX design language (for future design work)

Designed for **power users**: high information density *without* clutter — speed, stark contrast, keyboard-first.

### 8.1 Macro layout — the three-pane interface
1. **Left sidebar (nav + inbox):** collapsible narrow vertical pane. Profile, settings gear, top-level nav (**Inbox / Today / Upcoming / Someday**). The **Universal Inbox** lives here as a vertical list of unscheduled task cards pulled from integrations. A small **pie/donut widget** shows scheduled vs. available time for the day.
2. **Center column (timeframes + triage):** the working area. Vertical columns for **Today / This Week / This Month**, each a list of **draggable task cards**. Clean sans-serif, tuned for dense lists.
3. **Right column (calendar):** vertical Google-Calendar-like grid, hour markers on the Y-axis, a horizontal **"Now" line**, color-coded overlays per connected account.

### 8.2 The Command Bar
Floating **modal centered on screen**, dims/blurs the background (Spotlight / Raycast feel). One large text input. As you type, **NLP-recognized dates/times highlight in an accent color**; a dropdown below auto-populates commands ("Create task", "Schedule", "Search") and recent projects, arrow-key navigable.

### 8.3 Aesthetics & theming
- **Light + dark modes.** Dark mode uses **deep grey (~`#121212`), not pure black**, so colored calendar blocks pop without vibration.
- Accents are subtle; **source-app icons** (Slack, Gmail logos) get appended to task cards to show origin. User-defined **label colors** carry most of the color.
- **Micro-patterns that make it feel fast:**
  - **Drag handles:** hovering a task card reveals a six-dot grip.
  - **Snackbars/toasts:** brief bottom-of-screen confirmations ("Task scheduled", "Meeting transcribed").
  - **Inline editing:** drag a calendar block's edge to resize duration; changes commit live.
  - Hover actions on cards; everything also reachable by keyboard.

### 8.4 Representative screens (narrated, for reference)
- **Main dashboard:** the three panes above — inbox list left, Today/Week task columns center, live calendar grid right, "Now" line, donut time-budget widget.
- **Command bar in action:** dimmed backdrop, centered input mid-type ("Tomorrow 9am standup =30m #Work"), tokens highlighted, suggestion dropdown open.
- **Calendar / time-blocking:** week grid with color-coded blocks from multiple accounts; a task card mid-drag from the inbox landing on a time slot; resize handle on a block.
- **Inbox triage:** dense vertical list of source-tagged cards; keyboard cursor on one; the `E`/`P`/`Someday` decision flow.
- **Rituals flow:** three-pane layout **replaced by a focused wizard modal** — screen 1 lists yesterday's tasks to review, screen 2 an empty input to declare today's 1–3 goals, screen 3 returns to the calendar to time-block the inbox.
- **Settings / integrations:** master-detail — left list of tools (Slack, Notion, Zoom…), right pane with OAuth connect buttons, per-integration sync toggles, and webhook fields.

---

## Appendix — primary sources (directly fetched, authoritative)

- Homepage & positioning — https://akiflow.com/
- Features overview — https://akiflow.com/features
- The Method — https://akiflow.com/method
- Rituals — https://akiflow.com/features/rituals
- Command bar reference — https://product.akiflow.com/en/help/articles/6483573-command-bar
- Keyboard shortcuts — https://product.akiflow.com/en/help/articles/7262522-keyboard-shortcuts
- Integrations — https://akiflow.com/integrations
- Pricing — https://akiflow.com/pricing
- Developers (marketing) — https://akiflow.com/developers
- MCP server — https://product.akiflow.com/en/help/articles/4302815-akiflow-mcp · https://product.akiflow.com/p/mcp-model-context-protocol-connector-for-ai-assistants
- Changelog — https://product.akiflow.com/changelog

**Synthesis layer (sentiment / competitor / UX narration)** grounded by a Gemini deep-research pass over ~56 sources incl. G2, Product Hunt, Capterra, Trustpilot, Reddit r/productivity, and review sites (efficient.app, thebusinessdive.com, dhruvirzala.com, saner.ai, morgen.so comparisons). Full cited report saved alongside this file's research run. Where synthesis conflicted with official docs, official values were used and flagged (see §2.2).
