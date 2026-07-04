# Botanical Workspace — Screen Generation Brief for Claude Code

> **Project:** `D:\Coding\kais-flow` · Product name: **Kai's Flow**
> **Purpose:** Claude Code reads this alongside the codebase, then outputs `SCREENS.md` — structured screen descriptions. That file is handed to Claude Design together with `BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md` so Design can generate each screen from its description alone.

## Context

Kai's Flow is a $0/month, installable-PWA life-OS: a full Akiflow replacement (universal inbox, NL command bar, calendar time-blocking, guided rituals) merged with a personal life-OS (voice capture, routines/streaks, a "Slipping" staleness tracker, AI chat + search over everything). The design system is already defined (`BOTANICAL_WORKSPACE_DESIGN_SYSTEM.md`). This brief is **not** a request to build UI — it is a request to *describe* every screen the app needs, precisely enough that a designer who has never seen the app can generate a pixel-accurate mockup from the description alone.

## Design system summary (key constraints — full spec in the design system doc)

- Base: warm linen `--bg-base #F4F1EA`, **not** white
- Surface/cards: parchment `--bg-surface #EDE8DC`, 12px radius, no drop shadows in light mode
- Text: bark brown `--text-ink #2a2420` (never pure black), muted `--text-muted #6b665b`
- Primary accent: sage `--accent-sage #8A9A7E`; CTA accent: terracotta `--accent-terra #B5654A`
- Type: Source Serif Pro (display), Inter Tight (UI), IBM Plex Mono (metadata)
- Nav: left sidebar (desktop), bottom bar (mobile); each tab a botanical flower icon that blooms when active
- Glass panels: `rgba(248,245,240,0.72)` + `backdrop-filter: blur(8px)` for overlays, popovers, command palette
- Paper texture: subtle `feTurbulence` noise overlay at 0.6 opacity across all pages
- Dark mode ("night garden"): warm black `#0e0c0a`, frosted glass cards
- Topbar: thin mono metadata strip (workspace, date, status dot) — IBM Plex Mono, 10.5px, uppercase, tracked wide

## Reconciliation note — this app's real screens vs. the generic inventory

The generic screen inventory in the original brief (Slack-style chat, Notion-style docs, an email client, kanban project boards) describes a *hypothetical* all-in-one workspace. **Kai's Flow is a specific app with a specific, already-shipped shell.** Per the rules below, `SCREENS.md` was written against the *real* routes and components in `app/src/`, not the generic list. The mapping:

| Generic inventory screen | Kai's Flow reality |
|---|---|
| Garden dashboard (home) | **Today** (`/today`, `TodayPage`) — the signature screen |
| Chat / messaging (Slack-like) | **AI Chat** slide-over (`ChatPanel`) — chat over *your own data*, not people-to-people messaging |
| Calendar | **Calendar** (`/calendar`, `CalendarPage` + `CalendarGrid`) |
| Documents / notes (Notion-like) | **Not built** — Library (journal/notes/quotes) is P7, Planned. Described as a forward spec. |
| Tasks / to-dos | **Tasks** (`/tasks`, `TasksPage`) |
| Projects / boards | Partially — `Project`/`Domain` CRUD live inside Tasks; **Areas** is a Next entity. No kanban board. |
| Email / inbox | **Inbox** (`/inbox`, `InboxPage`) — universal capture-triage queue, *not* an email client |
| Command palette | **Command Bar** (`Ctrl+K`, `CommandBar`) + **Search** overlay (`Ctrl+/`, `SearchOverlay`) |
| Notifications center | **Next** — bell + panel; `features/notifications/api.ts` exists, no UI yet |
| Settings | **Settings** (`/settings`, `SettingsPage`) — currently push-only stub |
| Onboarding / first-run | **Not built** — described as a forward spec |
| Auth | **Sign in** (`/sign-in`, `SignInPage`) — email+password, Supabase auth |

Plus real screens with no generic-inventory equivalent, all Live and all described in `SCREENS.md`: **Routines** (`/routines`), **Weekly Review** (`/weekly-review`), **Morning Ritual** & **Evening Ritual** (guided modals), the **Resurfacing** card, and **Voice capture**.

## Output format (one block per screen)

```markdown
## Screen: [Name]
### Route
### Layout
### Components
### Botanical element
### Content
### Responsive behavior
### Dark mode notes
```

Save the output as `SCREENS.md` in the repo root alongside the design system doc.

## Rules

- **Pull from the codebase first.** Real routes, component names, and data shapes from `app/src/` — invent nothing that already exists.
- **Reference design tokens by name** (`--bg-base`, `--accent-sage`, …), never describe a color in prose when a token exists.
- **Describe, don't design.** No CSS, no JSX, no layout code.
- **Mobile *and* desktop** for every screen (single responsive build — same component collapses sidebar→bottom-bar).
- **Empty states are mandatory** for every screen that can be empty (the codebase already ships real empty-state copy — reuse it).
- **Real UI copy**, sentence case, active voice — no "Lorem ipsum".
