# Kai's Flow — UI Feature & Navigation Brief

> Purpose: a features-and-navigation inventory to hand to a separate design conversation (Claude Design) — **not a design doc itself**. No visual direction is prescribed here beyond Kai's own one-paragraph seed at the bottom, captured as-is.

## One-line pitch
A single, $0/month, installable PWA that fully replaces Akiflow — universal inbox, NL command bar, calendar time-blocking, guided rituals — merged with a personal life-OS (voice capture, routines/streaks, a "Slipping" staleness tracker, journal/notes/CRM, AI chat and search over everything). Runs identically on desktop (installed window) and phone (home-screen app), synced live.

## Status legend
**Live** = built and in daily use today · **Next** = spec locked, about to be built · **Planned** = spec'd, later phase · **Dormant** = spec'd, deliberately not being built · **Out of scope** = will not be built

---

## 1. Navigation shell (Live)

Current shape: a persistent nav (sidebar on desktop / row across the top or bottom on mobile — same component, responsive) plus two overlay surfaces and one always-available command bar. This is the literal shipped structure today, not a proposal:

- **Nav items:** Today · Inbox · Tasks · Calendar · Routines · Review (weekly) · Settings
- **Overlays (not nav items, triggered by button/shortcut, float above everything):** Search (`Ctrl+/`), AI Chat (slide-over panel)
- **Global, always reachable:** Command bar (`Ctrl+K`) — create/navigate/schedule via natural language, floats over any screen
- **Coming additions to this shell:** an Areas section (Next), a notification bell with unread badge (Next), Smart Lists as pinned saved-filter entries in the nav (Planned), a GitHub-issues section inside Inbox (Planned), and — much later — Library/Notes/Quotes/People/Content sections (Planned, P7)

## 2. Screens & their features

### Today — the single home screen (Live)
The one screen meant to answer "what does my day look like." Contains, top to bottom:
- Morning/Evening ritual launch buttons + voice-capture button, always visible
- A daily "Resurfacing" card — one old task/inbox item surfaced for a second look, with convert / review-later / dismiss actions
- Timeline — today's calendar events, chronological
- Top-3 — the day's three starred priorities, one-tap complete/star
- Today's Routines — checklist grouped by time-of-day, filtered to today's weekday
- Overdue and Due-today task lists, one-tap complete/star
- A "Slipping" sidebar (desktop) — ambient list of projects/domains gone stale, each with a one-tap "reviewed" dismiss
- **Coming:** Areas will also appear in the Slipping sidebar (Next); reminders will surface here too (Next)

### Morning Ritual — guided modal, 4 steps, skippable, <5 min (Live)
Review overdue (reschedule/drop) → pick Top-3 → clear inbox to zero (file/dismiss each item) → time-block the day (jumps to Calendar).

### Evening Ritual — guided modal, 2 steps, skippable (Live)
Sweep today (mark done / roll to tomorrow) → tomorrow preview (Top-3, what's due, what's scheduled).

### Inbox — universal triage queue (Live)
Every capture (typed or voice) lands here first unless AI confidence is high enough to auto-file. Each item: file → task, or dismiss. Voice capture transcribes then runs through the same AI parse.
- **Coming:** a GitHub-issues sub-section, AI-ranked by priority (Planned)

### Tasks (Live)
Full CRUD list: title/notes, due date, snooze, labels, priority, star (Top-3), recurring rule, mark done/cancelled. Organized/filterable by project or domain.
- **Coming:** area assignment as an alternative to project (Next); a per-task reminder field, independent of due date (Next)

### Calendar (Live)
Our own themed week/day grid (not an embedded Google widget). Drag a task onto the grid to time-block it, which creates a linked event. Google Calendar can optionally mirror events in/out invisibly in the background — it is never shown as its own UI.

### Routines (Live)
Separate module from Tasks — a day checklist grouped morning/afternoon/evening, filtered by which days of the week each routine runs. Streaks (current/best) shown as simple bar-style history. Temporary "challenges" (e.g. a 30-day streak goal) show progress and expire automatically.
- **Coming (still parked, not yet scheduled):** an "any time" bucket, an optional exact clock-time per routine, and a per-routine notification on/off toggle

### Weekly Review (Live)
One page: per-domain sweep (project/task counts), the full Slipping list, and streak summaries for all active routines.

### AI Chat (Live)
Slide-over panel. Ask questions over your own data (tasks, inbox items today; will expand as more content types get embedded later); streams its answer with linked citations back to the source entity.

### Search (Live)
Separate from Chat — a plain keyword/semantic search overlay, no AI round-trip, instant ranked results across searchable entities, each linking to its source.

### Settings (Live placeholder → real page Planned)
Currently a stub route. The real version (Planned, bundled with GitHub integration): per-integration status (connected/error/last-synced), a manual "sync now" button per integration, and a timezone control.

### Command Bar (Live, global)
`Ctrl+K` from anywhere: create tasks/events, navigate, and schedule using typed natural-language dates (parsed instantly, client-side).

### Areas — new section (Next)
A new container type sitting alongside Projects, for ongoing work with no end date and no milestones (the kind of thing Projects' milestone/end-date shape doesn't fit). Simple CRUD, same cheap rename/merge affordance as Projects and Domains. Appears in the Slipping sidebar and Weekly Review alongside Projects once stale.

### Notifications — new bell icon + panel (Next)
Persistent, browsable history of what actually happened — autofiled captures, reminders sent, routine checks, "reviewed" actions — distinct from the ephemeral toast popups already in the app. Unread-count badge on the bell.

### Smart Lists (Planned)
Saved filters (e.g. domain + label + due-date combos) pinned into the nav as one-click views — a stored query, not a copy of the data.

### Library — Journal, Notes, Quotes (Planned, later)
Journal entries (text/voice/photo), freeform Notes, and Quotes — each quote/note can carry a "commentary" feed (add a new thought to an old entry over time, visible as a running thread). A separate "Review queue" surfaces AI-flagged follow-ups embedded in notes/journal entries (distinct from the daily Resurfacing card — this one persists until you dismiss or convert it, it doesn't rotate away on its own).

### Books (Planned, later)
A simple personal book database — title/author/status/rating/dates — built via CSV import (no Kindle device yet; that import path exists but is secondary). Quotes can link to a book as a highlight.

### Personal CRM — People (Planned, later)
People, key facts about them (birthday, interests, etc.), and a running interaction/contact-history log per person.

### Projects — expanded (Planned, later)
Projects gain milestones with % complete, checklist templates (each checklist item can be configured as either a lightweight checkbox or a real linked task — your choice per item), and time-tracking totals. "Retainers" (a project sub-type) auto-reload their task list and checklist at the start of each month.

### Content Pipeline (Dormant — spec exists, will not be built)
A kanban (Idea → Editing → Published) for content creators. Explicitly parked: not relevant, since content creation isn't part of your workflow.

### Health / glucose tracking (Out of scope, undecided — no plan either way right now)
Not in this app's data model. You're separately considering a dedicated CGM-focused app for this; deliberately left unresolved rather than folded in here.

### External capture endpoint (Planned, no dedicated screen)
An API surface (not a visible screen) letting an Android automation (e.g. Tasker, a share-sheet action) post text/voice directly into the same capture pipeline as in-app capture — appears in Settings as a token + example recipe, not its own page.

---

## 3. Cross-cutting interaction patterns (apply across screens, relevant to how components should feel)
- **Capture is always ≤2 seconds, zero forced decisions.** Text or voice, from anywhere; you never pick a category up front — AI files it, uncertain ones wait in Inbox.
- **Keyboard-first on desktop, fully tappable on mobile** — same codebase, same features, responsive layout only.
- **Rituals are guided step-by-step flows**, not blank pages — always skippable, always short.
- **Ambient nudges, not interruptions** — Slipping and Resurfacing surface passively on Today/sidebar; nothing forces a popup.
- **One-tap actions everywhere** — complete, star, snooze, dismiss, "reviewed" are all single-click/tap, no confirmation dialogs.
- **Cross-linking** — entities reference each other (task ↔ event ↔ project/area ↔ eventually person/note) and every reference is a clickable jump, not just a label.
- **Works offline** — opens instantly with last-known data even with no connection; writes apply instantly to the UI and sync when back online.

## 4. Platform constraints relevant to screen design
- Installable PWA — same build is a desktop app window and a phone home-screen app. Design for both, not a "mobile-adapted desktop site."
- No native app-store chrome to lean on — the app supplies its own nav/header entirely.
- Single responsive layout, not two separate designs — the existing nav already collapses from a side column (desktop) to a row (mobile); any new nav items need to fit that same pattern.

---

## 5. Vibe seed — Kai's own words, not expanded on here

> Earthy — actually, more "natural": clean and minimal, with a papery feel. Interactive elements — buttons, tabs, maybe even the nav bar itself — imagined as scraps of paper.

This is the seed for the separate design conversation, captured verbatim intent only — no palette, texture, or component treatment has been decided or suggested here.
