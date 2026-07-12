# Kai's Flow — Screen Specifications, Part Two

> Continuation of `SCREENS.md`. Generated from the Jerad Hill reference screenshots (`Materials/Screenshots-inspo/`) cross-referenced against `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md`, `PLAN_ADDENDUM.md`, `ROADMAP-V2.md`, and `DATA_MODEL.md`. Covers screens not in Part One: detail pages, CRUD forms, the expanded Library system, Projects/Areas, People CRM, Domains, the Eisenhower Matrix, and the Focus Timer.
>
> **Same rules as Part One apply:** every color is a design-system token. Component and route names are the real ones in the repo (or the forward-specced names from `PLAN_ADDENDUM.md` / `ROADMAP-V2.md`). Re-attach `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md` with every single generation so tokens don't drift.

---

## Flower assignment (carried from Part One, repeated for token coherence)

| Surface | Flower | Accent token | Bloom maps to |
|---|---|---|---|
| **Today** (dashboard) | the whole terrarium — all plants together | — | overall daily state; the vine = streak |
| **Inbox** | hydrangea cluster | `#9AB4BE` powder blue | cluster shrinks as pending items clear → inbox zero = one bloom |
| **Tasks** | cherry blossom | `#D4A8B0` blush | one petal falls per completed task |
| **Calendar** | sunflower / daisy | `#A8A0BE` lavender | petals open as the day fills with events |
| **Routines** | vine with leaves | `#7A946E` deep moss | leaves grow along the streak; buds at 7+, blooms at 30+ |
| **Weekly Review** | fern (unfurling frond) | `#D4C78A` buttercream | frond unfurls down the page as you complete the sweep |
| **AI Chat** | clover / basil sprig | `#C9A0A0` dusty rose | small everyday sprig; leans on hover, no big bloom |
| **Settings / Sign-in / Onboarding** | single seedling | `--accent-sage` | neutral |
| **Projects / Areas** | vine with leaves | `#7A946E` deep moss | leaves grow as milestones complete |
| **Library** | fern (unfurling frond) | `#D4C78A` buttercream | fern unfurls as content grows |
| **People** | clover patch | `#C9A0A0` dusty rose | small blooms per active relationship |
| **Domains** | seedling cluster | `--accent-sage` | neutral organizational container |
| **Matrix** | cherry blossom (shared with Tasks) | `#D4A8B0` blush | same task data, different view |
| **Focus Timer** | sunflower (shared with Calendar) | `#A8A0BE` lavender | petals open as focus time accrues |

---

## Global chrome (unchanged from Part One, repeated for self-contained generation)

- **Nav shell** — `AppLayout`. Desktop: fixed left sidebar `md:w-48`, `--bg-surface` with hairline `--border` right edge, wordmark "Kai's Flow" in Source Serif Pro at top. Mobile: bottom row with top hairline. Order: **Today · Tasks · Routines · Projects · Content · People · Library · Domains**, then overlay triggers **Search · Chat**, then **Capture** (`⌘J`) and **Search** (`⌘K`) in the sidebar footer (desktop), then **Sign out** (desktop only, pinned bottom).
- **Topbar metadata strip** — `KAI'S FLOW · SAT 04 JUL · SYNCED ●`. IBM Plex Mono 10.5px, uppercase, letter-spacing 0.18em, `--text-faint`.
- **Paper noise** — global `body::before` `feTurbulence` overlay, opacity 0.6, `mix-blend-mode: multiply`.
- **Command Bar**, **ToastHost**, **VoiceCaptureButton** (FAB on mobile) mounted globally.

---

## Screen: Task Detail — (Next)

### Route
`/tasks/:id` — `features/tasks/TaskDetailPage.tsx`. Back link "← TASKS" returns to `/tasks`.

### Layout
Single reading column (max 920px), centered. Header band: status badge + source badge + task title (display type) + created-date right-aligned. Below: stacked form sections separated by hairline `--border` rules.

### Components
- **Header** — breadcrumb "← TASKS" in `--text-muted` IBM Plex Mono uppercase. Below: status pill ("OPEN" in `--accent-sage` / "DONE" in `--text-muted` with line-through) + optional source pill ("VIA VOICE" in `--text-faint`). Title in Source Serif Pro display size, editable inline (click-to-edit, blur saves). Right: "Created {date}" in IBM Plex Mono `--text-faint`.
- **Title field** — label "TITLE (REQUIRED)" in mono uppercase `--text-faint`. Full-width underline input, pre-filled.
- **Notes field** — label "NOTES". Textarea, `--bg-hover` background, resizable, 4–6 rows default.
- **Due date / Due time row** — two-up: "DUE DATE" native date input + "DUE TIME" native time input. Below each, a mono helper showing the parsed value (`2026-05-28` / `14:00`) in `--text-faint`.
- **Priority / Project row** — two-up: "PRIORITY" `<select>` (1 · Critical, 2 · High, 3 · Medium, 4 · Low (default)) + "PROJECT" `<select>` (lists all projects + areas + a "(none)" option).
- **Area field** — "AREA" `<select>`, shown only when `area_id` is relevant (task has no project). Mutually exclusive with Project in practice — picking a project clears area, and vice versa. If both are unused, both show "(none)".
- **Content item field** — "CONTENT ITEM (OPTIONAL — FOR VIDEO / ARTICLE / PODCAST TASKS)" `<select>`, `(none)` default. Dormant: hidden when Content Pipeline is dormant (no `content_items` exist).
- **Reminder field** — "REMIND ME (PUSHOVER; REQUIRES A DUE TIME)" `<select>` with options: No reminder, At due time, 5 min before, 15 min before, 30 min before, 1 hour before. Disabled when no due time is set.
- **Repeat field** — "REPEAT (RECURRING TASKS ROLL FORWARD ON DONE INSTEAD OF COMPLETING)" `<select>`: Doesn't repeat, Daily, Weekly, Monthly, Custom RRULE.
- **Save button** — primary terracotta pill "SAVE", full-width on mobile.
- **Delete zone** — at the very bottom: ghost text-button "Delete task…" in `--text-muted`, confirms inline ("Delete "{title}"? This also removes its scheduled calendar block." when linked block exists).

### Botanical element
Inherits the Tasks cherry blossom. A small blossom branch sits beside the title in the header band. Completing the task from this page triggers the petal-fall animation (600ms) on that branch before redirecting to `/tasks`. Accent: blush `#D4A8B0` on the status pill border and the save button's hover ring.

### Content
- Breadcrumb: "← TASKS"
- Status: "OPEN" / "DONE" / "CANCELLED"
- Source: "VIA VOICE" / "VIA COMMAND BAR" / "VIA AI CAPTURE" (only shown when the task was auto-filed from inbox; omitted for manually-created tasks)
- Labels: all-caps mono with tracked letter-spacing, consistent with the topbar metadata strip
- Save: "SAVE"
- Delete: "Delete task…"

### Responsive behavior
Single column at all sizes. The two-up field rows (due date/time, priority/project) stack to single column under 480px. The native date/time pickers are full-width and tappable. Save button goes full-width on mobile. Breadcrumb stays top-left, thumb-reachable.

### Dark mode notes
Card → frosted glass on `#0e0c0a`; input fields use `--bg-glass` fill; the blossom branch renders as a lit silhouette; status pills use translucent fills. Save button uses lightened terra `#D49880`.

---

## Screen: Projects & Areas — (Next)

### Route
`/projects` — `features/projects/ProjectsPage.tsx`

### Layout
Single reading column (max 920px). Header: "Projects" title + count badge right-aligned ("N active · M total" in mono `--text-faint`). Action row: "+ NEW AREA" and "+ NEW PROJECT" as secondary pill buttons. Below: three grouped sections.

### Components
- **Active section** — header "ACTIVE · {N}" in mono uppercase. Each project row: color dot (from the project's `color` field) + project name (Source Serif Pro, clickable → `/projects/:id`) + domain name in `--text-muted` + hours logged mono chip + milestones count mono chip ("1/6 MILESTONES") + target date mono chip ("TARGET {date}"). Rows separated by `--border-faint` hairlines.
- **Retainers section** — header "RETAINERS · {N}". Same row pattern but with "RETAINER" badge replacing milestones count; hours logged shown.
- **Areas section** — header "AREAS · {N}". Simpler rows: color dot + area name + domain in muted + "AREA" badge. No milestones, no target date (ongoing by definition).
- **Empty state** — "No projects or areas yet. Create one to start organizing your work."

### Botanical element
- **Icon:** vine with leaves, `#7A946E` deep moss — same species as Routines (projects and routines share the growth/progress metaphor).
- **Accent:** color dots per project are the project's own chosen color; section headers and the active nav tint use moss `#7A946E`.
- **Animation:** none on this list page — the growth metaphors live on Project Detail. Nav icon blooms when active.
- **Progress metaphor:** the project list itself is the forest overview; each row's milestone chip hints at the growth state.

### Content
- Title: "Projects"
- Count: "{N} active · {M} total"
- Actions: "+ NEW AREA", "+ NEW PROJECT"
- Section headers: "ACTIVE · {N}", "RETAINERS · {N}", "AREAS · {N}"
- Empty: "No projects or areas yet. Create one to start organizing your work."

### Responsive behavior
Single column everywhere. The action buttons wrap below the title on narrow widths. Project rows: on phones, the meta chips (hours, milestones, target) wrap to a second line below the name, preserving the color dot + name on the first line. 1280px+: reading column caps 920px.

### Dark mode notes
Standard token swap; color dots remain vibrant against `#0e0c0a`; section headers use `--text-muted`; rows use `--bg-glass` on hover.

---

## Screen: Project Detail — (Next)

### Route
`/projects/:id` — `features/projects/ProjectDetailPage.tsx`. Back link "← ALL PROJECTS".

### Layout
Single reading column (max 920px). Header band: domain in mono muted + project name (display) + color dot + target date right-aligned. Below: stacked sections separated by 40px spacing.

### Components
- **Header** — breadcrumb "← ALL PROJECTS". Domain name in mono uppercase `--text-faint`. Project name in Source Serif Pro display, preceded by the color dot. Right: "Target {date}" in mono `--text-faint`.
- **Color picker** — "COLOR" label, row of 10 color swatches (the standard project palette: terracotta, forest, navy, mustard, wine, teal, lavender, sage, charcoal, muted-bone). Active swatch has a `--text-ink` ring.
- **Hours section** — "HOURS" label, large display number (Source Serif Pro, 48px) showing total logged hours. Simple and prominent.
- **Milestones section** — "MILESTONES · {percent}%" header with completion percentage in a small terracotta badge. List of milestone rows: checkbox + milestone name + "WEIGHT {N}" in mono `--text-faint` + "EDIT" ghost button right-aligned. Completed milestones show `line-through` + muted. Below the list: "+ Add milestone…" input row with a weight number input and "ADD" button.
- **Open Tasks section** — "OPEN TASKS · {N}" header + "+ ADD TASK" action right-aligned. If tasks exist: standard `TaskRow` list (checkbox, title, due date, star). Empty: "No open tasks." in muted italic.
- **Checklist section** — "CHECKLIST" header. Empty: "No checklist yet. Use this for granular sub-steps that don't warrant a full task or milestone. Recurring items (weekly status report, monthly invoice…) live well here too." Below: "+ Add a checklist item…" input row + "ONE-SHOT (DEFAULT)" / "TASK-LINKED" mode toggle `<select>` right-aligned.
- **Activity section** — "ACTIVITY · {N}" header. Two-tab toggle: "WORK" (default, filled) / "📌 UPDATE". The add-entry row: "What did you work on?" text input + duration input ("1h30m" format) + date-time picker + "LOG" button. Below: reverse-chronological activity entries, each: timestamp (mono) + description + hours chip + "MANUAL" source badge.

### Botanical element
- The vine from the nav extends conceptually into this page: milestone completion grows leaves along the left edge of the milestones section (parallax at 0.15 factor, desktop only). 100% milestones → a small bloom at the bottom of the vine.
- Accent: moss `#7A946E` for the milestone progress badge and completion checks; `--accent-terra` for the add/log buttons.

### Content
- Breadcrumb: "← ALL PROJECTS"
- Milestones empty: "No milestones yet."
- Tasks empty: "No open tasks."
- Checklist empty: "No checklist yet. Use this for granular sub-steps that don't warrant a full task or milestone. Recurring items (weekly status report, monthly invoice…) live well here too."
- Activity tabs: "WORK", "📌 UPDATE"
- Log placeholder: "What did you work on?"

### Responsive behavior
Single column everywhere. The color picker wraps naturally. Milestone rows: the EDIT button hides behind a long-press/hover on mobile to save width. Activity entries stack the timestamp above the description on narrow screens. Hours display stays large and centered.

### Dark mode notes
Frosted glass sections on `#0e0c0a`; the vine renders as lit strokes; milestone progress badge uses lightened moss; activity entries use `--bg-glass` fills.

---

## Screen: New Project / New Area — (Next)

### Route
`/projects/new` — `features/projects/NewProjectPage.tsx`. Back link "← PROJECTS". Right-aligned subtitle: "Initiative within a domain".

### Layout
Single reading column (max 920px), centered. Form sections stacked vertically with 24px spacing.

### Components
- **Type toggle** — "TYPE" label. Two large toggle cards side by side: "PROJECT — Finite outcome · milestones + target date" (left, default active) and "AREA — Ongoing context · Home, Garage, Health…" (right). Active card: `--bg-surface` with `--border` ring. Inactive: `--bg-hover` with `--border-faint`.
- **Name field** — "NAME (REQUIRED)" label, full-width underline input.
- **Description field** — "DESCRIPTION" label, textarea, 3–4 rows.
- **Engagement toggle** (Project type only) — "ENGAGEMENT" label. Two toggle cards: "PROJECT — Bounded · milestones + target date" and "RETAINER — Ongoing · monthly hours, no milestones". Active card same styling as Type toggle.
- **Domain / Type row** — two-up: "DOMAIN" `<select>` with "(none)" + all domains, and "TYPE" `<select>` for optional categorization.
- **Date row** (Project type only) — two-up: "START DATE" native date input + "TARGET DATE" native date input. Below each, mono helper showing parsed value.
- **Quoted hours** (Project type only) — "QUOTED HOURS (DECIMAL OK)" label, number input, "optional" placeholder.
- **Color picker** — "COLOR" label, same 10-swatch row as Project Detail. Default: a neutral bone/no-color option indicated by a dash.
- **Create button** — primary terracotta pill "CREATE PROJECT" or "CREATE AREA" (label changes with type toggle).

### Botanical element
Quiet — the page title carries a small seedling icon (the project hasn't started yet, so no grown plant). When the user submits, the seedling does a brief 200ms sprout animation before navigating to the new project's detail page.

### Content
- Title: "New project" (changes to "New area" when Area type is selected)
- Subtitle: "Initiative within a domain" / "Ongoing context within a domain"
- Type cards: "PROJECT — Finite outcome · milestones + target date", "AREA — Ongoing context · Home, Garage, Health…"
- Engagement cards: "PROJECT — Bounded · milestones + target date", "RETAINER — Ongoing · monthly hours, no milestones"
- Button: "CREATE PROJECT" / "CREATE AREA"

### Responsive behavior
Single column everywhere. Toggle cards stack vertically under 480px. Date row stacks to single column under 480px. All inputs full-width and tappable. Create button full-width on mobile.

### Dark mode notes
Toggle cards use `--bg-glass` with `--glass-border`; active card gets a brighter `--glass-border` ring; standard token swap otherwise.

---

## Screen: Routines — enhanced — (Next, replaces Part One spec)

### Route
`/routines` — `features/routines/RoutinesPage.tsx`

### Layout
Single column. Header band: "Routines" title + "Daily habits" subtitle + date/count right-aligned ("6/8 today · {weekday}, {date}" in mono). Below the header: a stats band, then an add-routine action, then three time-of-day sections + an "Any time" section.

### Components
- **Stats band** — large display number: "{N}%" (30-day completion rate, Source Serif Pro, ~48px). Below: "30-DAY RATE · 7-DAY {N}%" in mono `--text-faint`. Right: a 30-day sparkline chart (thin line chart, ~200px wide, area-filled with `rgba(122,148,110,0.15)`, line stroke `#7A946E`). Far right: streak fire "🔥 {N} days" with a small streak-break indicator if applicable.
- **Add routine** — "+ ADD ROUTINE" secondary pill button, top-right of the "TODAY" section header, navigates to `/routines/new`.
- **Section headers** — "MORNING", "AFTERNOON", "EVENING", "ANY TIME" — each in mono uppercase `--text-faint`.
- **`RoutineRow`** (enhanced) — per active routine: completion checkbox (checked → `line-through` muted), name, then right-aligned: a **7-day history strip** (7 small squares, filled `#7A946E` = done, outlined `--border` = missed, neutral `--bg-hover` = not scheduled) + streak count "🔥 {N}" in `--accent-terra`. The history strip replaces Part One's 14-cell strip with a denser 7-day view that also shows behind-the-text on wider screens.
- **Empty section** — "Nothing here yet." per section.

### Botanical element
Same as Part One (vine with leaves, `#7A946E` deep moss) but the stats band's sparkline doubles as a visual vine: the line's peaks are leaf-shaped bumps, and missed days create gaps in the vine. Streak fire emoji is the only color pop.

### Content
- Title: "Routines"
- Subtitle: "Daily habits"
- Stats: "{N}% · 30-DAY RATE · 7-DAY {N}% · LAST 30 DAYS · DAILY COMPLETION RATE"
- Streak: "🔥 {N} days"
- Action: "+ ADD ROUTINE"
- Empty: "Nothing here yet."

### Responsive behavior
Single column at all sizes. Stats band: on phones, the sparkline moves below the percentage (stacks vertically). The 7-day history strip stays compact (each cell ~8px). Streak number may move below the routine name on the narrowest widths.

### Dark mode notes
Sparkline uses lightened sage stroke on `#0e0c0a`; history "done" cells use lightened sage; "missed" cells a dim ember; fire emoji renders normally.

---

## Screen: New Routine — (Next)

### Route
`/routines/new` — `features/routines/NewRoutinePage.tsx`. Back link "← ROUTINES".

### Layout
Single reading column (max 920px), centered. Stacked form sections.

### Components
- **Header** — breadcrumb "← ROUTINES". Section label "ROUTINES" in mono uppercase. Title "New routine" in Source Serif Pro display.
- **Name field** — "NAME *" label (asterisk = required), full-width underline input. Placeholder: "Read the Bible".
- **Description field** — "DESCRIPTION" label, textarea, placeholder: "Optional — context, what counts, why you're tracking it…"
- **Time of day / Specific time row** — two-up: "TIME OF DAY" `<select>` (Morning, Afternoon, Evening, Anytime) + "SPECIFIC TIME (OPTIONAL)" native time input with placeholder "--:--". Below the time input: mono helper "5:30 PM or 17:30" as format example.
- **Pushover toggle** — checkbox: "Send Pushover at this time" + helper "SET A SPECIFIC TIME ABOVE TO ENABLE." in mono `--text-faint`. Disabled when no specific time is set.
- **Streak goal** — "STREAK GOAL" label. Two-up: `<select>` (Ongoing (no end), Custom) + a number input "Custom (days)" visible only when Custom is selected. Helper: "NO GOAL — KEEPS RUNNING INDEFINITELY." when Ongoing.
- **Create button** — primary terracotta pill "CREATE ROUTINE".

### Botanical element
A small vine tendril beside the title, bare stem with one leaf bud — the routine hasn't grown yet. On submit, the bud unfurls (200ms) before navigating back.

### Content
- Breadcrumb: "← ROUTINES"
- Title: "New routine"
- Placeholder: "Read the Bible"
- Description placeholder: "Optional — context, what counts, why you're tracking it…"
- Time helper: "5:30 PM or 17:30"
- Pushover helper: "SET A SPECIFIC TIME ABOVE TO ENABLE."
- Goal helper: "NO GOAL — KEEPS RUNNING INDEFINITELY."
- Button: "CREATE ROUTINE"

### Responsive behavior
Single column everywhere. Two-up rows stack under 480px. Create button full-width on mobile. Time input uses native time picker on mobile.

### Dark mode notes
Standard token swap. Form fields use `--bg-glass`; the vine tendril renders as a lit stroke.

---

## Screen: People — CRM list — (Planned, P7)

### Route
`/people` — `features/people/PeoplePage.tsx`

### Layout
Single reading column (max 920px). Header: "People" title + count ("N contacts" in mono). Action: "+ NEW PERSON" secondary pill. Below: people list grouped by domain/relationship group.

### Components
- **Group headers** — per domain or relationship category (e.g. "FAMILY", "WORK", "FRIENDS") in mono uppercase `--text-faint`.
- **Person row** — clickable: person name (Inter Tight 500, `--text-ink`) + last interaction summary in `--text-muted` ("Lunch together, Vietnamese · May 22") + "N facts" count chip. Right-aligned: relative time since last contact ("3d ago" / "2w ago") in mono.
- **Empty state** — "No people yet. Add someone to start tracking your relationships."

### Botanical element
- **Icon:** clover patch, `#C9A0A0` dusty rose — small everyday blooms representing relationships.
- **Accent:** the nav icon tint and group headers use dusty rose.
- **Animation:** adding a new person → a small clover bloom (200ms). No ongoing animation.

### Content
- Title: "People"
- Count: "{N} contacts"
- Action: "+ NEW PERSON"
- Empty: "No people yet. Add someone to start tracking your relationships."

### Responsive behavior
Single column. Person rows: the last-interaction summary truncates with ellipsis on narrow screens, time-since stays visible. 1280px+: caps 920px.

### Dark mode notes
Standard swap; dusty rose lightens; rows use `--bg-glass` on hover.

---

## Screen: Person Detail — (Planned, P7)

### Route
`/people/:id` — `features/people/PersonDetailPage.tsx`. Back link "← PEOPLE".

### Layout
Single reading column (max 920px). Header band: group label + person name (display). Below: stacked sections — Facts, Interactions, Edit.

### Components
- **Header** — breadcrumb "← PEOPLE". Group label in mono uppercase `--text-faint` (e.g. "FAMILY"). Person name in Source Serif Pro display.
- **Facts section** — "FACTS · {N}" header. Each fact row: type label ("BIRTHDAY" in mono) + value ("Mal's Birthday") + optional date + "RECURS" badge if recurring. Below the list: an add-fact inline form — type `<select>` (Birthday, Anniversary, Interest, Note, Custom) + value text input + optional date picker + "RECURS" checkbox + "ADD FACT" button.
- **Interactions section** — "INTERACTIONS · {N}" header. Reverse-chronological list: each entry shows date/time in mono left-column + type badge ("IN PERSON" in `--accent-terra` / "CALL" / "TEXT" / "EMAIL" in `--text-muted`) + summary text. Below: an add-interaction inline form — type `<select>` (Call, In person, Text, Email, Video, Other) + "What did you talk about?" text input + datetime picker + "LOG" button.
- **Edit person** — expandable section: "EDIT PERSON ▸" ghost button. Expands to show: name input, group/domain `<select>`, delete with confirmation.

### Botanical element
Dusty rose `#C9A0A0` accent on the type badges and section headers. The clover icon from People sits beside the person's name at reduced size. An interaction logged → the clover does a gentle lean (150ms).

### Content
- Breadcrumb: "← PEOPLE"
- Section headers: "FACTS · {N}", "INTERACTIONS · {N}"
- Fact types: "Birthday", "Anniversary", "Interest", "Note"
- Interaction types: "In person", "Call", "Text", "Email", "Video", "Other"
- Log placeholder: "What did you talk about?"
- Edit: "EDIT PERSON ▸"
- Delete: "Delete person…"

### Responsive behavior
Single column. Fact and interaction rows: the inline forms stack their fields vertically under 480px. Date columns compress to abbreviated format on narrow screens.

### Dark mode notes
Type badges use translucent fills; `--accent-terra` for "IN PERSON" lightens to `#D49880`; frosted glass sections.

---

## Screen: Library — enhanced list — (Planned, P7)

### Route
`/library` — `features/library/LibraryPage.tsx`

### Layout
Single reading column (max 920px). Header: "Library" title + count ("N entries" in mono). Below: a tab strip, then conditional filter bars, then a reverse-chronological entry feed.

### Components
- **Tab strip** — pill toggle group: ALL (default) · NOTES · QUOTES · JOURNAL · BOOKS · INVENTORY. Active tab: `--text-ink` on `--bg-surface` with `--border`; inactive: `--text-muted` on transparent.
- **Source filter** (visible on Notes/Quotes tabs) — "SOURCE" label, pill toggle row: ALL · OWN · READING · MEETING · BRAINSTORM · OBSERVATION · NEEDS REVIEW. Active: filled, inactive: outlined.
- **Tag cloud** (visible on Notes/Quotes tabs) — "TAG" label, a wrapping row of tag pills, each showing the tag name + count in mono ("FAITH 167", "BIBLE 146"). Active tag: `--bg-surface` with `--border`; inactive: `--bg-hover`. Clicking a tag filters the feed. Overflow: "+ {N} MORE" pill that expands the cloud.
- **Entry feed** — each entry is a full-width card with: type label in mono uppercase `--text-faint` (e.g. "JOURNAL", "NOTE · READING RESPONSE", "QUOTE · TONY ROBBINS", "ANNOTATION · TONY ROBBINS"), date right-aligned in mono `--text-faint`, then body text (truncated to 3 lines with ellipsis for long entries). Clicking an entry navigates to its detail page. Optional source/author metadata between the type label and date.
- **Empty state** — "Your library is empty. Start a journal entry, save a quote, or capture a note."

### Botanical element
- **Icon:** fern, `#D4C78A` buttercream — same as Weekly Review (the fern represents accumulated knowledge).
- **Accent:** tab pills and active filter states use buttercream; entry type labels use `rgba(212,199,138,0.15)` fills with `#8A7A3A` text.
- **Animation:** scrolling the feed causes the fern nav icon to unfurl incrementally (parallax, desktop only).

### Content
- Title: "Library"
- Count: "{N} entries"
- Tabs: "ALL", "NOTES", "QUOTES", "JOURNAL", "BOOKS", "INVENTORY"
- Source filters: "ALL", "OWN", "READING", "MEETING", "BRAINSTORM", "OBSERVATION", "NEEDS REVIEW"
- Entry type labels: "JOURNAL", "NOTE", "QUOTE", "ANNOTATION" (for quote annotations with extended context)
- Empty: "Your library is empty. Start a journal entry, save a quote, or capture a note."

### Responsive behavior
Tab strip scrolls horizontally on narrow screens (no wrap). Source filter pills wrap (`flex-wrap`). Tag cloud: show top 10 tags on mobile, collapse rest behind "+ N MORE". Entry cards go full-width. 1280px+: reading column caps 920px.

### Dark mode notes
Tab pills and filter pills use `--bg-glass` fills; entry cards use `--bg-glass` background; type labels use translucent buttercream fills; fern renders lit.

---

## Screen: Note / Journal Entry Detail — (Planned, P7)

### Route
`/library/:id` — `features/library/EntryDetailPage.tsx`. Back link shows the contextual origin ("← LIBRARY" or the specific tab).

### Layout
Single reading column (max 920px), centered. Header band: type label + title (display, optional for journal entries). Below: stacked form/display sections.

### Components
- **Header** — type label in mono uppercase `--text-faint` (e.g. "READING RESPONSE", "JOURNAL", "NOTE · OTHER"). Title in Source Serif Pro display (large, editable inline). For journal entries without a title, the first ~60 chars of the body serve as the visual heading.
- **Source metadata** — "SOURCE · {reference}" in mono `--text-faint` (e.g. "SOURCE · SOUL CARE (BOOK)"). Clickable when linked to a book → navigates to `/library/books/:id`.
- **Title field** — "TITLE (OPTIONAL)" label, full-width underline input.
- **Body field** — "BODY" label, large textarea (8+ rows), `--bg-hover` background. Pre-filled with the entry content. This is the primary editing surface.
- **Source type / Source reference row** — two-up: "SOURCE TYPE" `<select>` (Reading response, Own thought, Meeting notes, Brainstorm, Observation, Other) + "SOURCE REFERENCE" text input (freeform: book title, article name, podcast, conversation).
- **Tags field** — "TAGS (COMMA-SEPARATED)" label, text input showing comma-separated tags.
- **Needs review checkbox** — "Needs review" checkbox. When checked, this entry appears in the Review Queue on Today.
- **Images section** — "IMAGES" label, a row of image thumbnails (if any) + "+ ADD IMAGE" secondary pill button.
- **Save button** — primary terracotta pill "SAVE".
- **Delete zone** — ghost text-button "Delete entry…" at the bottom.

### Botanical element
The fern frond unfurls along the left margin as the user scrolls through a long entry (parallax 0.15, desktop only). Accent: buttercream `#D4C78A` on the source type badge and section rules.

### Content
- Type labels: "READING RESPONSE", "JOURNAL", "NOTE · OTHER", "OWN THOUGHT"
- Title placeholder: varies by type — "Give this note a title…" / (journal entries: none, date is the identifier)
- Source types: "Reading response", "Own thought", "Meeting notes", "Brainstorm", "Observation", "Other"
- Tags placeholder: "faith, reflection, parenting"
- Button: "SAVE"
- Delete: "Delete entry…"

### Responsive behavior
Single column. Source type/reference row stacks under 480px. Image thumbnails scroll horizontally. Save button full-width on mobile. The left-margin fern is hidden on mobile.

### Dark mode notes
Textarea uses `--bg-glass`; source badges use translucent fills; the fern renders lit; standard token swap.

---

## Screen: Quote Detail — (Planned, P7)

### Route
`/library/quotes/:id` — `features/library/QuoteDetailPage.tsx`. Back link "← LIBRARY".

### Layout
Single reading column (max 920px), centered. The quote itself is the hero: large italic serif display text. Below: an edit section, then the Thoughts/Commentary feed, then a danger zone.

### Components
- **Header** — "QUOTE" label in mono uppercase `--text-faint`. The quote text in Source Serif Pro italic, display size (clamp 28px–48px), wrapped in curly quotes (" "). Author attribution below in `--text-muted`.
- **Edit highlight** — "EDIT HIGHLIGHT ▸" expandable ghost button. Expands to reveal: editable quote text, author, source reference, tags. This collapses the large display text into an editable form state.
- **Thoughts section** — "THOUGHTS · {N}" header. A reverse-chronological list of commentary entries: each shows "ON CAPTURE · {date}" or "ADDED · {date}" in mono `--text-faint` + the thought body in `--text-ink` + a "DELETE" ghost button right-aligned. This is the running commentary feed — the user adds thoughts over time to revisit and deepen the quote.
- **Add thought form** — "ADD A THOUGHT" label. Textarea with placeholder "Add a thought on this quote…" + "ADD THOUGHT" primary terracotta button.
- **Danger zone** — "DANGER ZONE" label in mono uppercase `--text-muted`. "DELETE QUOTE…" ghost button with confirmation.

### Botanical element
A pressed-flower motif in the left margin beside the large quote text — subtle, low-opacity, echoing the "pressed specimen on linen" motif from the Sign-in page. Buttercream `#D4C78A` accent on the section headers.

### Content
- Type label: "QUOTE"
- Edit: "EDIT HIGHLIGHT ▸"
- Thoughts header: "THOUGHTS · {N}"
- Thought attribution: "ON CAPTURE · {date}" / "ADDED · {date}"
- Add thought placeholder: "Add a thought on this quote…"
- Button: "ADD THOUGHT"
- Danger: "DANGER ZONE", "DELETE QUOTE…"

### Responsive behavior
Single column. The large quote text scales down on narrow screens via `clamp()`. Thought entries go full-width. The pressed-flower motif is hidden on mobile. Add-thought textarea and button stack vertically.

### Dark mode notes
The large quote text uses `--text-ink` on dark; the pressed-flower motif renders as a faint lit line drawing; thought entries use `--bg-glass` fills; terra buttons lighten.

---

## Screen: Books — grid view — (Planned, P7)

### Route
`/library/books` (or `/library` with Books tab active) — `features/library/BooksPage.tsx`

### Layout
Full-width below the tab strip (inherited from Library). Header: "Books" title + count ("N books · M highlights" in mono). Filter rows. Then a responsive image grid.

### Components
- **Tab strip** — same as Library list, with BOOKS active.
- **Status filter** — "STATUS" label, pill toggle row: ALL · WANT · READING · FINISHED · ABANDONED.
- **Sort selector** — "SORT" label, pill toggle row: TITLE (default) · AUTHOR · FINISHED · RATING · RECENT.
- **Add action** — "+ ADD BOOK" secondary pill, right-aligned on the sort row.
- **Book grid** — responsive grid (`grid-cols-2` mobile, `grid-cols-3` tablet, `grid-cols-4` desktop, `grid-cols-5` wide). Each card: cover image (aspect-ratio ~2:3, `border-radius: 8px`, `object-fit: cover`) + title (Inter Tight 500, max 2 lines, truncate) + author (mono `--text-faint`) + highlight count ("N HL" in mono). Clicking a card navigates to the book's detail page. Books without a cover show a placeholder card (solid `--bg-surface` with the title text centered).
- **Empty state** — "No books yet. Add one manually or import a CSV."

### Botanical element
Books shares the fern/buttercream from Library. No per-card botanical element — the grid layout is dense and the cover images provide all the visual interest. Accent: buttercream on the active filter pills.

### Content
- Title: "Books"
- Count: "{N} books · {M} highlights"
- Status options: "ALL", "WANT", "READING", "FINISHED", "ABANDONED"
- Sort options: "TITLE", "AUTHOR", "FINISHED", "RATING", "RECENT"
- Action: "+ ADD BOOK"
- Empty: "No books yet. Add one manually or import a CSV."

### Responsive behavior
Grid auto-adjusts column count. On phones (2 cols), cards are tight with smaller cover images. Filter pills scroll horizontally if they overflow. "+ ADD BOOK" may collapse into the sort row on narrow widths.

### Dark mode notes
Cover images stay as-is; placeholder cards use `--bg-glass`; filter pills use standard glass fills; the grid background is `--bg-base`.

---

## Screen: Book Detail — (Planned, P7)

### Route
`/library/books/:id` — `features/library/BookDetailPage.tsx`. Back breadcrumb derived from context.

### Layout
Single reading column (max 920px). Header band: author attribution in mono + book title (display). Below: a two-column header section (cover left, metadata right on desktop), then stacked form sections.

### Components
- **Header** — author in mono uppercase `--text-faint` ("BY {AUTHOR}"). Title in Source Serif Pro display.
- **Cover + metadata band** — desktop: two-column, cover image left (`max-w-40`, aspect ~2:3, rounded 8px) + metadata stack right. Mobile: cover centered above metadata.
- **Metadata fields (stacked):**
  - "TITLE (REQUIRED)" — full-width underline input.
  - "AUTHOR" — full-width underline input.
  - "COVER IMAGE URL" — full-width text input showing the URL (pasted manually or from import).
  - "STATUS" / "FORMAT" — two-up selects: Status (Want to read, Reading, Finished, Abandoned) + Format (Physical, Kindle, Audiobook, PDF, (none)).
  - "STARTED" / "FINISHED" — two-up native date inputs with mono helpers.
  - "RATING (1–5, BLANK FOR NONE)" — `<select>` with options (no rating), 1, 2, 3, 4, 5.
  - "ISBN" — text input, "optional" placeholder.
  - "MY SUMMARY / NOTES" — textarea, 4+ rows.
- **Linked quotes section** — "HIGHLIGHTS · {N}" header. List of quotes linked to this book (each showing truncated quote text + "VIEW" link to the quote detail). If none: "No highlights linked to this book yet."
- **Save / Import row** — "SAVE" primary button. Optionally: "IMPORT CSV" secondary button (on the books list, not here — but if the user navigates here from an import flow, show a success status).
- **Delete zone** — "Delete book…" ghost button with confirmation.

### Botanical element
Quiet — a small fern frond beside the title. The book's cover image is the visual anchor, not a botanical. Buttercream accent on section headers.

### Content
- Author line: "BY {AUTHOR}"
- Status options: "Want to read", "Reading", "Finished", "Abandoned"
- Format options: "Physical", "Kindle", "Audiobook", "PDF", "(none)"
- Rating: "(no rating)", "1", "2", "3", "4", "5"
- Highlights empty: "No highlights linked to this book yet."
- Button: "SAVE"
- Delete: "Delete book…"

### Responsive behavior
Cover + metadata stacks on mobile (cover centered, full-width fields below). Two-up rows (status/format, started/finished) stack under 480px. Save button full-width on mobile.

### Dark mode notes
Cover image stays as-is; form fields use `--bg-glass`; standard token swap.

---

## Screen: Domains — (Next)

### Route
`/domains` — `features/domains/DomainsPage.tsx`

### Layout
Single reading column (max 920px). Header: "Domains" title. Below: the domain list with inline edit/merge controls, then an add form.

### Components
- **Domain row** — each domain: color dot + domain name (editable inline: click to focus the text input, blur saves rename) + count chips ("N projects · M areas · K open tasks" in mono `--text-faint`). A "DELETE" ghost button appears on hover/focus, with confirmation if entities are linked.
- **Merge control** — visible when >1 domain: "MERGE" label + two `<select>`s ("merge {A} into {B}") + "MERGE" button. The source domain is absorbed into the target; all linked entities re-parent.
- **Add domain form** — "ADD DOMAIN" label, text input + color picker (compact inline swatches) + "ADD" button.
- **Empty state** — "No domains yet. Domains group your projects, areas, and tasks by life context."

### Botanical element
Seedling cluster in `--accent-sage` — domains are the soil layer, the organizational root. No animation; this is an admin page.

### Content
- Title: "Domains"
- Counts: "{N} projects · {M} areas · {K} open tasks"
- Add: "ADD DOMAIN"
- Merge: "merge {A} into {B}"
- Empty: "No domains yet. Domains group your projects, areas, and tasks by life context."

### Responsive behavior
Single column. Domain rows: counts wrap below the name on narrow screens. The merge control stacks its selects vertically under 480px.

### Dark mode notes
Standard swap; color dots stay vibrant; inline edit fields use `--bg-glass`.

---

## Screen: Eisenhower Matrix — (Planned, P8)

### Route
`/matrix` — `features/matrix/MatrixPage.tsx`

### Layout
Two-by-two grid filling the main content area, with a filter bar above. Desktop: four equal quadrants in a `grid-cols-2 grid-rows-2` layout, each quadrant a bordered card. Mobile: the four quadrants stack vertically (Q1 → Q2 → Q3 → Q4).

### Components
- **Filter bar** — domain `<select>`, project `<select>`, and a "⚙ THRESHOLDS" settings button (opens an inline popover: "Urgent = due within {N} hours" number input, "Important = priority ≥ {level}" select). All in mono uppercase.
- **Quadrant cards** — each a parchment card with:
  - Header: quadrant label + subtitle in mono — "Q1 · DO FIRST" / "Q2 · SCHEDULE" / "Q3 · MINIMIZE" / "Q4 · DELETE". Header background uses a faint version of the quadrant's accent:
    - Q1: `rgba(181,101,74,0.12)` (terra tint — urgent+important)
    - Q2: `rgba(122,148,110,0.12)` (sage tint — important, plan it)
    - Q3: `rgba(168,160,190,0.12)` (lavender tint — urgent, not important)
    - Q4: `rgba(107,102,91,0.12)` (muted tint — neither)
  - Subtitle: "urgent + important" / "important, not urgent" / "urgent, not important" / "neither"
  - Task list inside: standard `TaskRow`s (checkbox + title + optional due-time chip). Tasks are draggable between quadrants.
  - Q2-specific: each task card carries a "block time →" ghost affordance that navigates to `/calendar` with the task ready to drop.
  - Q4-specific: each task card carries an "archive ✕" ghost button (one-tap archive).
- **Drag feedback** — dragging a task between quadrants shows a translucent ghost card with a dashed drop zone in the target quadrant. Drop rewrites the underlying `priority`/`due_at` fields (via outbox) with a toast + undo.
- **Empty quadrant** — muted italic: "Nothing here."

### Botanical element
Shares the cherry blossom from Tasks (same data). The four quadrants' header tints form a seasonal metaphor: Q1 (terra) = autumn urgency, Q2 (sage) = spring growth, Q3 (lavender) = twilight delegation, Q4 (muted) = dormant. No per-quadrant flower — restraint; the accent tints are enough.

### Content
- Title (implied by the grid, no separate heading — the four quadrant labels ARE the page title)
- Quadrant labels: "Q1 · DO FIRST", "Q2 · SCHEDULE", "Q3 · MINIMIZE", "Q4 · DELETE"
- Subtitles: "urgent + important", "important, not urgent", "urgent, not important", "neither"
- Q2 affordance: "block time →"
- Q4 affordance: "archive ✕"
- Empty: "Nothing here."

### Responsive behavior
Desktop: 2×2 grid, equal quadrants, each scrollable internally when the task list exceeds the visible height. Tablet: same 2×2 but tighter padding. Mobile (<768px): the quadrants stack vertically in order Q1–Q2–Q3–Q4, each a collapsible section with the header as a toggle (expanded by default for Q1/Q2, collapsed for Q3/Q4 to prioritize the important half). Drag-to-reorder works via touch on mobile.

### Dark mode notes
Quadrant cards use `--bg-glass` with their respective tinted headers; drop zones use dashed `--glass-border`; task rows use standard dark tokens.

---

## Screen: Focus Timer — persistent chip + expanded panel — (Planned, P8)

### Route
No route — the timer lives as a persistent UI element in the nav/chrome, not a standalone page. Components in `features/focus/FocusTimer.tsx` (chip) and `features/focus/FocusPanel.tsx` (expanded).

### Layout
**Chip state (nav):** a small persistent chip in the sidebar (desktop: below the nav items, above Sign out) or in the topbar metadata strip (mobile). Shows: timer icon + remaining time + optional task name truncated. Clicking expands the panel.

**Panel state (expanded):** a frosted-glass popover (`max-w-sm`, 18px radius, `backdrop-filter: blur(8px)`), anchored to the chip's position. Contains: large countdown, task context, and controls.

### Components
- **Timer chip** (persistent while active) — "⏱ {MM:SS} · {task title}" in IBM Plex Mono, `--text-ink`. Background: `rgba(168,160,190,0.15)` (lavender tint, matching Calendar's accent — focus = scheduled time). Clicking toggles the expanded panel.
- **Expanded panel:**
  - Large countdown: "{MM:SS}" in Source Serif Pro display, centered, ~48px.
  - Phase label: "FOCUS" or "BREAK" in mono uppercase, with a session counter "SESSION {N}/4".
  - Task context (optional): if wired to a task, show the task title + a "→ open task" link.
  - Controls row: "PAUSE" / "RESUME" secondary pill + "CANCEL" ghost button.
  - Settings row (only shown in idle state, before starting): duration inputs — "Focus: {N} min" + "Break: {N} min" + "Long break: {N} min after {N} sessions". All with number inputs.
  - Start: "START FOCUS" primary terracotta pill (idle state).
- **Command bar integration** — `Ctrl+K → "focus 25"` or `"focus 25 on {task name}"` starts the timer immediately. Parse-preview shows: "⏱ 25 min focus" chip + optional "→ {task}" match chip.
- **Completion state** — when the timer ends: in-app banner notification with a chime, the chip pulses once, and the panel auto-opens showing "Focus complete! Take a {N}-min break." + "START BREAK" button.

### Botanical element
Shares the sunflower/lavender from Calendar (focus = time = calendar). The chip carries a tiny sunflower petal that opens further with each completed pomodoro in the current session sequence. After 4 sessions: a small full bloom. Cancel resets to closed. Accent: lavender `#A8A0BE` on the chip background and panel border.

### Content
- Chip: "⏱ {MM:SS} · {task title}"
- Phase: "FOCUS" / "BREAK" / "LONG BREAK"
- Session: "SESSION {N}/4"
- Start: "START FOCUS"
- Break prompt: "Focus complete! Take a {N}-min break."
- Controls: "PAUSE", "RESUME", "CANCEL"
- Defaults: "Focus: 25 min", "Break: 5 min", "Long break: 15 min after 4 sessions"
- Command bar: "focus 25", "focus 25 on {task name}"

### Responsive behavior
Chip: on desktop, lives in the sidebar below nav items. On mobile, lives in the topbar metadata strip (replaces the date/sync text while active, since the timer is higher priority). Panel: on desktop, a popover near the chip. On mobile, a bottom sheet. Controls are always thumb-reachable.

### Dark mode notes
Chip uses `rgba(168,160,190,0.15)` which reads well on `#0e0c0a`; panel is frosted glass; countdown text is `--text-ink` on dark; the sunflower petal renders as a lit stroke.

---

## Screen: Voice Capture — overlay — (Live, not in Part One)

### Route
No route — triggered by the `VoiceCaptureButton` (global FAB on mobile, pill button on Today). Overlay in `features/capture/VoiceCaptureOverlay.tsx`.

### Layout
**Mobile:** a dark bottom sheet overlay covering the lower ~30% of the screen, above the bottom nav. Semi-transparent dark backdrop dims the content above.

**Desktop:** a compact frosted-glass popover near the voice capture button, `max-w-xs`.

### Components
- **Recording state** — "LISTENING — TAP MIC TO STOP" in mono uppercase `--text-faint`. Large timer display "00:{SS}" in IBM Plex Mono, ~32px. A pulsing red dot indicator (3px, `animation: pulse 1.5s ease-in-out infinite`). Tap anywhere on the overlay or the mic button again → stops recording.
- **Processing state** — "Transcribing…" in mono, disabled, with a small spinner.
- **Done state** — overlay closes; the captured text flows through the AI parse pipeline and either auto-files (toast: "Captured: {summary}") or lands in Inbox (toast: "Captured → Inbox").

### Botanical element
None during recording — the mic is functional, not decorative. The `VoiceCaptureButton` itself is terracotta (`--accent-terra`), and while recording it shifts to a red state with a subtle dark glow. The botanical restraint is intentional: this is a utility overlay, not a screen.

### Content
- Recording: "LISTENING — TAP MIC TO STOP", "00:{SS}"
- Processing: "Transcribing…"
- Button states: "🎤 Voice capture" (idle), "● Stop" (recording), "Transcribing…" (busy)

### Responsive behavior
Mobile: bottom sheet, full-width, 30% height, rounded top corners (18px). Desktop: compact popover, anchored to the VoiceCaptureButton's position. Timer and controls are always centered and prominent.

### Dark mode notes
Recording overlay is already dark-toned (semi-opaque `rgba(14,12,10,0.85)` backdrop). Timer text is white/`--text-ink` on dark. The red recording indicator stays red in both modes.

---

## Screen: Settings — full version — (Planned, P6)

### Route
`/settings` — `features/settings/SettingsPage.tsx` (replaces the P0 stub)

### Layout
Single reading column (max 920px). Header: "Settings" title. Right-aligned: "Integrations · sync" link for quick navigation to the integration section. Below: stacked section cards.

### Components
- **Timezone section** — "TIMEZONE" header. Descriptive text: "Used everywhere the app needs to know "what day is it" — task due dates, routine completions, the daily-summary cron, photo timestamps, the activity log. Server time doesn't enter into it; timestamps are stored in UTC and converted at the edges." Two-up: "COMMON TIMEZONES" `<select>` (pre-populated with common IANA zones) + "OR CUSTOM IANA NAME" text input (placeholder: "e.g. America/Boise"). Below: "CURRENT: {TIMEZONE}" in mono + "SAVED" confirmation badge (appears after save, fades after 3s).
- **Integration status section** — "INTEGRATION STATUS" header. Descriptive text: "Live inventory of which env-var-backed services are configured. No secret values shown — just "configured / partial / missing" per integration with helpful detail. Use it after deploys or env var rotations to verify everything is wired correctly." "OPEN INTEGRATIONS STATUS →" secondary pill button (navigates to a dedicated integration-status page or inline expander).
- **Google Calendar card** — "GOOGLE CALENDAR" sub-header. Status line: "STATUS · CONNECTED · LAST SYNCED {date, time}" in mono. Two actions: "SYNC NOW" primary terracotta pill + "DISCONNECT" secondary pill. Below: "Scopes: {list}" in mono `--text-faint` (informational, not editable).
- **Push notifications card** (carried from Part One) — "PUSH NOTIFICATIONS" sub-header, device count, subscribe/unsubscribe toggle, "SEND TEST PUSH" button, unsupported-browser guidance.
- **Capture API section** (P6 addition) — "CAPTURE API" header. Shows the personal access token (masked, with a "reveal" toggle and "regenerate" button) + a copy-pasteable Tasker/HTTP example recipe.
- **Appearance section** (Planned) — "APPEARANCE" header. Theme toggle (Light / Dark / Auto), paper-texture intensity slider (0–100%), botanical-animation toggle, accent-color override. A small live terrarium preview swatch responds to the slider and theme changes.

### Botanical element
Single seedling beside the page title, sage-tinted, no animation. The Appearance section is where the user tunes the botanical system — the live preview swatch is the one place botanicals are interactive on this page.

### Content
- Title: "Settings"
- Timezone descriptive: (as above)
- Integration descriptive: (as above)
- Google Calendar status: "STATUS · CONNECTED · LAST SYNCED {date}"
- Buttons: "SYNC NOW", "DISCONNECT", "SEND TEST PUSH"
- Capture API: "Your capture token", "Regenerate", example recipe
- Appearance: "Light / Dark / Auto", "Paper texture: {N}%", "Botanical animations: on/off"
- Stub line (for unbuilt sections): "More integrations and preferences land here in later phases."

### Responsive behavior
Single column. The timezone two-up stacks under 480px. Integration cards go full-width. The terrarium preview swatch scales to fit. All buttons full-width on mobile.

### Dark mode notes
Section cards → frosted glass; the Appearance section shows the current mode live; the terrarium preview swatch renders in whichever mode is being previewed.

---

## Screen: Notifications — full page variant — (Next)

### Route
`/notifications` (or accessible via the bell icon → "View all →") — `features/notifications/NotificationsPage.tsx`

### Layout
Single reading column (max 920px). Header: "Notifications" title + count ("{N} shown" in mono). Tab strip below header. Action: "MARK ALL READ" right-aligned.

### Components
- **Tab strip** — pill toggle: UNREAD (default) · ALL · DISMISSED.
- **Notification row** — bullet indicator (filled `--accent-terra` = unread, empty = read) + event type bold + timestamp right-aligned in mono `--text-faint` (e.g. "MAY 27, 3:03 PM"). Description line below: the human-readable event text. Action row: "MARK READ" / "DISMISS" ghost buttons. For actionable notifications: an additional type-appropriate button (e.g. "open task").
- **Time grouping** — rows grouped under date headers: "TODAY", "YESTERDAY", "THIS WEEK", "OLDER" — matching the panel spec from Part One.
- **Empty state** — "All caught up." with a settled-sprig illustration.

### Botanical element
Same bud/bell system from Part One's Notifications panel spec. The full-page version gains a small sprig beside the title that leans when unread count > 0 and settles when cleared.

### Content
- Title: "Notifications"
- Section label: "AUDIT LOG" in mono above the title
- Tabs: "UNREAD", "ALL", "DISMISSED"
- Action: "MARK ALL READ"
- Row actions: "MARK READ", "DISMISS"
- Empty: "All caught up."

### Responsive behavior
Same as the panel variant but expanded to fill the page. Rows go full-width. Tab strip stays top. On mobile, this is the primary notifications surface (the bell navigates here instead of opening a slide-over panel).

### Dark mode notes
Standard swap; unread bullets use lightened terra `#D49880`; rows use `--bg-glass` on hover.

---

## Cross-screen notes for Design (Part Two additions)

- **Detail page pattern** — all detail pages (Task, Project, Person, Note, Quote, Book) share a common structure: mono breadcrumb top-left → type/status label → display-size title → stacked form sections → primary save button → danger zone at bottom. Design one detail-page template, then skin per entity.
- **Inline editing** — domain names, task titles, and project names are editable inline (click to focus, blur to save). Design this as a subtle affordance: the text gains a thin `--border-faint` underline on hover, and the input appears borderless until focused (then shows `--accent-sage` focus ring).
- **Form label convention** — all form labels use IBM Plex Mono, uppercase, letter-spacing 0.12em, `--text-faint`. Required fields show an asterisk or "(REQUIRED)" suffix. Helper text below inputs uses the same mono but smaller (11px).
- **Color pickers** — Projects and Domains use a shared 10-swatch inline palette. Active swatch: `--text-ink` ring (2px). No custom color input — the palette is curated.
- **Tab strips** — Library and Notifications both use pill-toggle tab strips. Active pill: filled `--bg-surface` with `--border`, `--text-ink`. Inactive: `--bg-hover`, `--text-muted`. These are NOT the nav tabs — they're in-page content filters.
- **Generate order for Part Two** — Task Detail → Projects & Areas → Project Detail → New Project → Routines (enhanced) → New Routine → People → Person Detail → Library (enhanced) → Note/Journal Detail → Quote Detail → Books → Book Detail → Domains → Eisenhower Matrix → Focus Timer → Voice Capture → Settings (full) → Notifications (full page). Re-attach `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md` with every single generation.
