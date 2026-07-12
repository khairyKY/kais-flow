# Prompt bank — generate the botanical integration, one surface per session

**Why this exists:** so you never re-explain anything and your chat context stays tiny.
Each block below is a complete prompt for **one surface**. Paste it into a **fresh
Claude Code session** (new context) — the agent reads the shared rules from a file, builds
that one screen, commits it on its own branch, and reports. Run them one at a time or fan
several out in parallel. The orchestrator session reviews the PRs and merges.

## How to use (Prompt 0)
1. Make sure you're on branch `feature/botanical-integration` (Foundation lives here).
2. Open a **new** session and paste ONE `Wxx`/`Nxx` block below. That's it.
3. The agent reads `design-integration/briefs/_SHARED.md` itself (frozen-file list, kit /
   token / motion APIs, house rules, growth-stage map, definition of done, git protocol) —
   so you don't paste any of it.
4. When it reports done, tell the orchestrator session "review ws/<name>" — it verifies
   fidelity against the `.dc.html` and merges.
5. **Order:** any `Wxx` can run now (backends exist). `Nxx` need a migration first (the
   prompt says so). The `Xx` passes run **after** the waves merge. Long-poles first:
   W3 (XL), then W2/W5/W6 (L).

**Every prompt already contains the standard preamble** (read `_SHARED.md`, reproduce the
`.dc.html` exactly, real data, own only your feature folder, don't touch frozen files, the
shell owns the sidebar/topbar so you only rebuild the `.dc.html` MAIN content, `ds/…`→`/ds/…`,
build green + commit on `ws/<name>` + don't push + report). Don't add anything.

---

## R1 — Overlay demolition (run FIRST — see TEARDOWN.md)

The old skin bleeds over every page through the shared menus/popovers/toasts. This wave
kills that. It is the ONE wave allowed to edit the frozen overlay files (they refreeze after).

```
Build R1 (overlay demolition) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and design-integration/TEARDOWN.md §R1, then rebuild the ENTIRE shared overlay layer as node-for-node transcriptions of design-export/Overlays.dc.html: §01 (Snooze, Schedule, Project picker, Priority, Repeat, Toast — SnoozeMenu/ScheduleMenu/ProjectPicker/ToastHost), §02 (Command bar ⌘K, Search ⌘/, Chat ⌘J slide-over, Confirm, Bulk bar, Notifications slide-over), §04 (Bulk actions, Keyboard shortcuts ?), §05 (Go to G, Calendar/Board view options, Label picker + manager). Files you own for this wave ONLY: app/src/components/{ContextMenu,Select,SnoozeMenu,ScheduleMenu,ProjectPicker,BulkBar,ShortcutOverlay,ToastHost}.tsx, app/src/features/command-bar/**, app/src/features/search/SearchOverlay.tsx, app/src/features/chat/ChatPanel.tsx. PRESERVE every behavior contract: component props/APIs, overlayStack Escape handling, body portals, keyboard shortcuts, useListKeys. Visuals come 100% from Overlays.dc.html; delete old icon usages as they fall out. Transcribe, don't interpret. Build green, commit on ws/overlays, don't push, report.
```

## Reskin waves (backends already exist)

> Every wave below now also carries the TEARDOWN rules: **transcribe node-for-node** and
> **delete every file your surface replaces in the same commit** (see _SHARED.md).

### W1 — Today  ✅ desktop done (14bf759); remaining: mobile 1b + empty states
```
Build W1 (Today), remaining scope, of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md then design-integration/briefs/W1-today.md. Desktop 1a is already built in app/src/features/today/TodayPage.tsx — ADD: the iPhone variant 1b (phone width ≤767px), the States.dc.html empty/done vignettes (1a Empty Today, 1b Done Today) as real reachable states, AND rebuild the three old-skin stragglers whose designs live inside Today.dc.html 1a: features/resurfacing/ResurfaceCard.tsx ("From a while ago" card), features/capture/VoiceCaptureButton.tsx (the header CTA), features/today/Terrarium.tsx (delete it if the 1a terrarium band fully replaces it — demolition DoD). Pixel contract Today.dc.html 1a/1b + States.dc.html 1a/1b. Transcribe node-for-node. Own app/src/features/today/**, features/resurfacing/ResurfaceCard.tsx, features/capture/VoiceCaptureButton.tsx. Build green, commit on ws/today-mobile, don't push, report.
```

### W2 — Tasks  (also builds the shared TaskRow that W1/W3 import)
```
Build W2 (Tasks) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md then design-integration/briefs/W2-tasks.md, then reproduce design-export/Tasks.dc.html options 1a·1b·2a·2b·2c EXACTLY, on real data. Species: cherry by completion (bud/opening/bloom/fallen). Build the shared app/src/features/tasks/TaskRow.tsx first (stable props — W1/W3 import it). Own only app/src/features/tasks/**. Discover hooks from tasks/api.ts + grouping.ts/taskDisplay.ts (reuse as-is). Effects/motion: Motion 3b task-complete, 5a checkbox bloom, 3e list breathing — gate via useMotionEnabled(). Build green, commit on ws/tasks, don't push, report.
```

### W3 — Calendar + Editor  (XL — start first)
```
Build W3 (Calendar + Editor) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Calendar.dc.html (1a·1b) and design-export/Editor.dc.html (1a–1g, 2a–2c) EXACTLY, on real data. Species: daisy by clock (morning/midday/evening/past/future). Keep the FullCalendar wrapper contract in CalendarGrid.tsx; theme it via CalendarGrid.css mapped to tokens. Own app/src/features/calendar/** (CalendarPage, CalendarGrid, EventDetailsPanel, PlanningBoard, quick-create). Discover hooks from calendar/api.ts + eventTime.ts (reuse as-is). The shell owns sidebar/topbar; rebuild the MAIN content. Overlays: Event details, quick-create popover. Effects/motion: Motion 4c calendar drags. Build green, commit on ws/calendar, don't push, report.
```

### W4 — Inbox
```
Build W4 (Inbox) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Inbox.dc.html options 1a·1b·1c·2a·2b EXACTLY, on real data. Species: hydrangea by pending count (zero/light/medium/heavy). Own only app/src/features/inbox/**. Discover hooks from inbox/api.ts (reuse as-is). Reproduce triage, inbox-zero bloom, iPhone triage, Dismissed compost (restorable), iPhone swipe-restore. Effects/motion: Motion 1c floret drift on file, 2d filing drag. Gate via useMotionEnabled(). Build green, commit on ws/inbox, don't push, report.
```

### W5 — Routines  (Kai's ruling: skip turn 3; keep the rest)
```
Build W5 (Routines) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Routines.dc.html options 1a·1b·2a·2b·4a EXACTLY (SKIP turn 3 / 3a·3b per Kai; 4a's 14-day trellis is the live streak visual), on real data. Species: vine by streak (bare/sprouting/flowering/lush) + leaf-left/right trend leaves. Own only app/src/features/routines/**. Discover hooks from routines/api.ts + streaks.ts + routineGrouping.ts (reuse as-is). Build green, commit on ws/routines, don't push, report.
```

### W6 — Rituals + Review
```
Build W6 (Rituals + Review) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Rituals.dc.html (1a–1g, 2a–2e, 3a, 3b) and design-export/Review.dc.html (1a·1b·2a·2b·2c·3c — turn 4 / Weekly Letter is PARKED, do NOT build) EXACTLY, on real data. Own app/src/features/rituals/** (MorningRitual, EveningRitual, RitualChrome, WeeklyReviewPage). Discover hooks from the feature + tasks/routines/slipping apis (reuse as-is). Rituals are takeovers opened from Today's pinned cards; 2c saves a line to the journal feed. Effects/motion: Effects 2f weekly review flourish. Build green, commit on ws/rituals, don't push, report.
```

### W7 — Settings + Search  (also wires the theme + effects toggles)
```
Build W7 (Settings + Search) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Settings.dc.html (1a appearance, 1b iPhone, 2a Integrations — four connection states, 3a Sound catalog) and design-export/Search.dc.html (1a results, 1b empty) EXACTLY, on real data. Own app/src/features/settings/** and app/src/features/search/**. In Settings appearance, wire the canonical day/night control to useTheme (lib/theme) and the Effects on/off control to setEffectsEnabled (lib/motion) — these are the app-wide toggles Foundation left for you. Discover hooks from settings/api + lib/settings.ts + search/api. Build green, commit on ws/settings, don't push, report.
```

### W8 — Command bar + Chat + Quick Capture
```
Build W8 (Command bar + Chat + Quick Capture) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce EXACTLY, on real data: design-export/Overlays.dc.html §02 Command bar (⌘K) + Chat slide-over (⌘J), §03 Voice capture sheet; and design-export/Quick Capture.dc.html (1a lock-screen widget, 1b activated, 1c share sheet). Own app/src/features/command-bar/**, app/src/features/chat/**, app/src/features/capture/**. Discover hooks from each feature's api + parseCommand.ts (reuse as-is). Keep the overlayStack Escape contract. Effects/motion: Motion 3c overlay in/out. Build green, commit on ws/command, don't push, report.
```

---

## New-surface waves (ship a migration + api + UI)

Each `Nxx` ships its own migration (uuid id, `user_id uuid default auth.uid()` + RLS
`user_id = auth.uid()`, `created_at`, `updated_at` via the shared trigger — see
`docs/DATA_MODEL.md`), an `api.ts` routing writes through `lib/outbox.ts` `writeRow`, and
`logActivity('<event>')` for domain events. Schema specs are in `docs/phases/P7-life-os.md`.

### N1 — Projects + Perennials
```
Build N1 (Projects + Perennials) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md and the Projects/Perennials specs in docs/phases/P7-life-os.md, then reproduce design-export/Projects.dc.html (1a·1b·1c·2a·2b·2c·2d — t1+t2 are two switchable views of one cluster) and design-export/Perennials.dc.html (1a·1b — reached via the Tasks header "↻ Repeating" chip) EXACTLY, on real data. Species: wisteria by weighted milestone % (p0…p100). Own app/src/features/projects/** (+ a perennials page). Ship the migration + api.ts + logActivity. The recurrence engine already exists (recurrence.ts). Build green, commit on ws/projects, don't push, report.
```

### N2 — Journal + Library
```
Build N2 (Journal + Library) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md and the P7a specs in docs/phases/P7-life-os.md, then reproduce design-export/Journal.dc.html (1a·1b) and design-export/Library.dc.html (1a·1b) EXACTLY, on real data. Species: fern by length/progress (coil/unfurl1/unfurl2/full). Own app/src/features/journal/** and app/src/features/library/**. Ship migrations (journal_entries, notes, quotes, commentary) + api.ts + logActivity. Build green, commit on ws/journal, don't push, report.
```

### N3 — People
```
Build N3 (People) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md and the P7b specs in docs/phases/P7-life-os.md, then reproduce design-export/People.dc.html options 1a·1b·1c·2a·2b·2c EXACTLY, on real data. Species: clover by attention (resting/awake/dewdrop/seedling/four_leaf). Own app/src/features/people/**. Ship migrations (people, interactions) + api.ts + logActivity. Includes People Moments (bloom badge, detail banner, dismissible Today card). Build green, commit on ws/people, don't push, report.
```

### N4 — Herbarium + Activity + Trash
```
Build N4 (Herbarium + Activity + Trash) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce EXACTLY, on real data: design-export/Herbarium.dc.html (1a spread, 1b specimen, 1c pressing ceremony on project completion, 1d empty), design-export/Activity.dc.html (1a·1b — a filterable reader over activity_log), design-export/Trash.dc.html (1a age groups + restore + empty-trash confirm, 1b empty). Own app/src/features/herbarium/**, app/src/features/activity/**, app/src/features/trash/**. Herbarium + Activity are READERS (completed projects / activity_log). Trash needs a small soft-delete migration. Build green, commit on ws/herbarium, don't push, report.
```

### N5 — Focus
```
Build N5 (Focus) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Focus.dc.html options 1a·1b·1c·1d·1e EXACTLY (turn 2 / "A Year in the Garden" 2a·2b is PARKED — do NOT build), on real data. 1a Pomodoro timer, 1b garden view (dusk veil, fireflies, falling petals), 1c break, 1d stopwatch, 1e settings popover. Own app/src/features/focus/**. Ship a time_entries migration (P7 draft) + api.ts + logActivity. Timers run live. Effects: Effects 1c firefly dusk, 1j dusk veil, 1a petal fall — gate via useMotionEnabled(). Build green, commit on ws/focus, don't push, report.
```

### N6 — Onboarding + Seasons
```
Build N6 (Onboarding + Seasons) of the Kai's Flow botanical integration. Read design-integration/briefs/_SHARED.md and _TEMPLATE.md, then reproduce design-export/Onboarding.dc.html (1a–1g the 7 steps, 1h iPhone CTA-pinned) and design-export/Seasons.dc.html (1a seasons row, 1b three composites season×weather, 1c topbar echo + effects-off) EXACTLY. Onboarding is a real first-run over the existing auth (P0 shipped none) — plays once, then never. Seasons fills the topbar echo slot Foundation left in the shell (coordinate a one-line shell hook with the orchestrator — do NOT edit AppLayout yourself). Own app/src/features/onboarding/** (+ seasons content). Build green, commit on ws/onboarding, don't push, report.
```

---

## Cross-cutting passes (run AFTER the waves merge)
Thin prompts — each is a whole-app audit against one library. Run in the orchestrator or a
fresh session with the branch fully merged.
- **X1 Effects** — apply all 22 Effects.dc.html recipes to their surfaces; verify each fires, gated by useMotionEnabled() + reduced-motion.
- **X2 Motion** — apply all 26 Motion.dc.html micro-interactions to their triggers; timings verbatim.
- **X3 Night** — sweep every surface on `data-theme="night"`; zero daylight fallbacks; match the 6 Night.dc.html studies.
- **X4 Mobile** — every iPhone variant at phone widths; safe-areas, `dvh`, touch counterparts for hover/keyboard-only interactions.
- **X5 States** — every empty state matches States.dc.html t1; wire the topbar sync states to a real outbox pending-count (add the reactive count to lib/outbox); "error" appears nowhere.

## Teardown passes (TEARDOWN.md — after R1 + waves merge)
- **R3 Legacy purge** — delete the index.css legacy-alias block + old public/assets tree + unused icon exports; migrate stragglers; grep gates (alias names, `IBM Plex`, `src="assets/`) must return zero with a green build.
- **R4 Exactness audit** — Kai logged in; served .dc.html canvas beside each live route, day+night, desktop+phone; already-rebuilt surfaces first (shell, Today, Tasks, Calendar/Editor — they predate the transcription rule); every flagged deviation = a fix commit.
- **No-contract stragglers** (only surfaces with no .dc.html): PlanningBoard, SignInPage — restyle quietly with kit + tokens + house rules; explicitly flag for Kai's eye.
