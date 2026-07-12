# UI Overhaul — Notes

> Kai's running list while doing a UI overhaul pass. Captured as raw ideas, **not yet triaged or routed** into a phase file — nothing here is scheduled. When ready to build any of these, route through `docs/ROADMAP.md` / `docs/PROMPT-BANK.md` like everything else.

## Functional gaps (missing views/features)

- **Full search results page** — ⌘/ is only an overlay; no page for "everything matching 'Omar'" across tasks, journal, people, projects.
- **Night theme, drawn** — Settings offers Day/Night/Auto and Focus has dusk effects, but not a single product screen exists in night mode.
- **Integrations page** — GitHub/Voice chips appear in Inbox, and Settings lists "Integrations" in its nav, but the page itself was never drawn (connect, per-source rules, ranking).
- **Recurring tasks manager** — a Repeat popover exists; there's no place to see and edit everything that repeats.
- **Trash / archive + restore** — Confirm-delete exists; deleted things have nowhere to go or come back from.
- **Empty & first-run states** — Inbox zero is lovely; empty Today, unplanted Projects, first-ever Journal entry aren't drawn (the "seedling" versions of each surface).
- **Offline / sync-conflict state** — topbar says "Synced ●"; the un-synced story doesn't exist.
- **Insights/Stats** — Focus logs hours to projects; nothing aggregates them (hours per domain per week, focus trends). Could live inside Review.
- **Mobile quick-capture surface** — lock-screen/widget mock showing capture without opening the app.

## Feel-good / experience elevation

- **Seasons & weather** — the garden already has day-phases (daisy morning/midday/evening); add real seasons + local weather. Rainy day in Cairo = soft rain over the Today header, plants glisten.
- **The Herbarium** — when a project completes, its plant is pressed into a keepsake page: dried flower, dates, hours, a handwritten line. Milestones become a collectible field guide. This is the payoff the whole metaphor is begging for.
- **A year in the garden** — scrub through months and watch your garden's history; the long-term version of Focus's Garden view.
- **Gentle rain (grace day)** — streak forgiveness, framed botanically: "it rained yesterday — the vine held on."
- **The weekly letter** — Review opens with a short AI-written field-notes letter in the hand-script voice, not just widgets.
- **Closing ritual** — a nightly "close the garden" moment: garden view + one-line journal + tomorrow's top 3, then dusk veil.
- **Sound catalog** — paper rustle, distant chime, birdsong at dawn; a small documented set next to Effects (Settings already has the motion toggle — sound belongs beside it).
- **Micro-interaction spec** — checkbox bloom, drag lifts a leaf, pull-to-refresh dew drop; a companion sheet to Effects for interaction moments rather than ambience.
- **Garden postcard** — export/share a snapshot of your week as a postcard image.
- **People moments** — birthdays/anniversaries surface as clover blooms; the CRM gets warmth, not just "last touch 21d."

## Motion & feedback system (plumbing — mostly non-visual)

> These three govern *how* the effects above actually fire. They're system rules, not screens — captured to brainstorm, but the UI verdict on each is the point: only haptics adds a single pixel. Guiding line: **authored config, not user preference.** For a one-person app, Kai-as-builder edits a registry; Kai-as-user only wants the master dials. An in-app editor for any of this would be over-engineering.

- **Wiring recipes into the real screens** — which screen gets which effect and when it fires (checkbox bloom on task-complete, dew on pull-to-refresh, petal on toast dismiss…). The mapping layer between the micro-interaction sheet and live triggers. **UI verdict: no management screen, not user-editable.** It's an authored registry in code; its human-readable form is the micro-interaction sheet itself. Nobody re-maps which animation fires on complete from a settings panel.
- **Haptics mapping on mobile** — what bumps on drop, check, pop, etc. **UI verdict: one toggle only** — "Haptics" on/off, mobile-only, folded into the Sound/Effects settings cluster (respects the OS haptics setting + reduced-motion). The per-event map itself is authored, not user-editable.
- **Motion budget rules** — how many ambient/one-shot effects can coexist, and priority when they collide (bloom + toast petal + rain at once — what wins, what's suppressed). **UI verdict: no new UI.** The only user-facing expression is the motion toggle's tiers (off / reduced / full); the budget rules define what each tier *means* internally. Never a "max concurrent effects" knob.
