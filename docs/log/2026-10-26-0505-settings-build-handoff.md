# 2026-10-26 05:05 (Cairo) · handoff · settings-build — Settings layout A, rows A + the phone's line icons

Branch `claude/settings-build` (based on v1.5.0). Kai's picks: "Settings: layout A, rows A" (`settings-looks/design-export/Settings options.html`, handoff `2026-10-25-0406-settings-looks-handoff.md`), and "the new icons didn't land on the phone version".

## 1 · Settings, as drawn

- **Layout A.** Desktop: the 11 categories with kf line icons down the left, in four groups split by hairlines (Account · Appearance → Organize · Integrations → Privacy & terms · Shortcuts, App & updates), search at the top of the list (Ctrl/⌘ F, Esc clears), one category on the right (serif title + one line, then its sections). The list is sticky; when it's taller than the window (150% on 720) it scrolls on its own, and the wheel passes on to the page at its ends.
- **Rows A.** Each section is a rounded panel (`--radius-card`, `--line-card` hairlines inset 16, 58 after a lead), label + help on the left, the control on the right. More than three choices became pickers: Interface size, Weekend (Custom opens the seven days under it), Time zone and Second time zone (a picker that opens the zone search under its row). The danger zone is a terra-edged panel in Account. On a phone a three-way choice spreads full width under its label.
- **Phone.** `/settings` is the list: Account card on top (name, email), then the other ten in their groups with where each stands (Light · 100%, Cairo, Inbox first, Quiet 10:30 PM, 2 domains, 1 connected, v1.5.0). A row drills into its page with ‹ Settings; Integrations' rows drill once more with ‹ Integrations.
- **Search.** The matching rows themselves, real controls and all (the same components rendered filtered, so a result can't drift from its row), grouped "Category › Section", a › on each to open its category with the row lit, "N settings match". Word-start matching over label, help and per-row keywords: "dark" → Theme, "delete" → Delete account + Trash, "AI" → the Capture & AI rows + AI assistants, "time" → zone, format, second zone, digest, nudge, quiet hours.
- **Deep links.** `/settings/<category>` (`account appearance calendar capture notify organize integrations data privacy shortcuts about`), `/settings/integrations/<google|github|mcp|capture-key>`, `/settings?q=…` (also on any category URL). The old anchors redirect and scroll: `#settings-Sound` → notify, `#settings-Advanced` → integrations/capture-key, `#settings-Legal` → privacy, and so on (`categories.ts OLD_ANCHORS`); the section ids are kept on their new sections. `?google=` lands on Integrations › Google. `/settings` alone opens Appearance on a computer (URL unchanged) and the list on a phone. Bad paths fall back.
- **Where everything went** (every v1.5.0 setting, once):
  - Account: email + **Sign out** (new here), Name and workspace (Rerun the welcome), Danger zone: **Delete account** (moved from Your data).
  - Appearance: Theme, Interface size, Paper texture, Botanical animations.
  - Calendar & time: Time zone, **Time format** (from Appearance), Weekend, **Week starts on**; Opens on, **Fit days to the window, Fit hours to my day, Density, Second time zone, Now card** (cal-wave's View options, same per-device store `kf.calViewOptions`, so both places agree); Plan shortcuts, Google Calendar (link row → Integrations › Google).
  - Capture & AI: File captures for me, Pick a project for new things; Page photos, Scans today, Read when offline; Share to Kai's Flow.
  - Notifications & sound: This device (Send a test + what's in the way), the 9 kinds, Quiet hours, lock-screen names; Sound, **Sound pack** (now a three-way choice with ▶ for the picked pack), the 7 sounds, Silent after Shut down; This browser (web) / This phone (Android).
  - Organize: Domains, Labels, "Not now" comes back after (high/medium/low).
  - Integrations: Google Calendar ›, GitHub ›, AI assistants (MCP) ›, Groq, Capture key & bookmarklet › (was Advanced). Each › is its own page with today's controls.
  - Your data: Import, Export, Trash. Privacy & terms: both policies, What we keep (copy now says delete is under Account), **What AI assistants can see** (→ the MCP page).
  - Shortcuts: the cheatsheet's own tables (`lib/shortcuts`: Keys, On the calendar, Typing a task), so it can't drift — the typing builder's new syntax lands here by itself.
  - App & updates: version + Check for updates, What's new, Download the apps, The tour, Guide; On this computer (tray, Start with Windows — Windows app only); On this phone (Hide titles on the home screen — Android only).
  - Learn's "Continue setup": not in v1.5.0, so nothing to move.
- **Five new kf glyphs:** person, appearance, data, keyboard, info (`components/icons/kf/`, from the page's IC map; data's ellipse listed last so the set's test stays as is).
- **Other links moved:** the terms-changed activity row → `/settings/privacy`, the auto-file notice's Settings → `/settings/capture`, Weekly review and Trash's domain link → `/settings/organize`.
- **Opening Settings still checks for updates** once (the shell does it now, not the card). Desktop category moves don't remount the page (`AppLayout` route key) and don't play the phone's push (`App.tsx`); the phone's drill does.

## 2 · The phone's nav icons

The More sheet's rows wear the sidebar's kf icons, the same glyph per destination as `AppLayout` NAV (checked glyph-for-glyph by the harness): Tasks, Projects, Routines, Inbox, Review (clipboard), Journal, Library, People, Guide, Settings, Focus, Activity, Trash (delete). No watercolour PNGs, FlowerIcon or dots remain; `NavGlyphs.tsx` is deleted. Search · Chat · Sign out carry icons too. The page you're on is lit like the sidebar's active row (frost at night, parchment by day, ink icon, 600 label). The tab bar already wore kf icons; its tinted pill is unchanged.

## Files

`app/src/features/settings/SettingsPage.tsx` (rebuilt), `settings.css` (rewritten), `categories.ts` + `categories.test.ts` (new), `app/src/components/MobileTabBar.tsx`, `components/icons/kf/` (+5 svg, index), `components/AppLayout.tsx` (route key), `App.tsx` (routes, no push on desktop moves), `features/paper/PaperSettings.tsx` (deleted — its rows are in Capture & AI) + `paper.css` (its rules), `features/activity/describe.ts`, `features/capture/autoFileNotice.ts`, `features/rituals/WeeklyReviewPage.tsx`, `features/trash/TrashPage.tsx`, `components/icons/NavGlyphs.tsx` (deleted). Line endings kept per file (CRLF: MobileTabBar, AppLayout, WeeklyReviewPage, TrashPage).

## Gate

- `npx tsc -b` clean · `npx vitest run` 183 files / 2522 tests · `npm run lint` 0 errors · `npm run build` ok · `ds:check --baseline` 0 new (one `ds-ok`: the 28px category title as drawn) · birthday_on greps 1 / 1.
- New harness `docs/log/assets/settings-build/verify.mjs`: **193/193** (every category opens, every setting present once, pickers, danger zone, provider pages, Windows-app rows, search, 12 deep links, phone drill-down day + night, phone nav icons day + night, day + night × 100/125/150% on four categories).
- Run one at a time against the mock (`vite --port 5312 --mode mock --host ::`, stopped after): desktop-polish 150/150, phone-polish 718/718, legal 158/158, export 166/166, download-bar 49/49, google-sync 101/101, github-rules 53/53, sidebar-ab 258/258, today-shell 86/86, ai-chat 77/77.
- **Harnesses updated** (they reached Settings rows by their old place): desktop-polish (Calendar & time and App & updates pages; the wheel over the list moves the list or the page), phone-polish (the More sheet's foot labels measured as text, not icon + text), legal (Privacy & terms from the list; Delete account in Account's danger zone), export (`/settings/data`), download-bar (`/settings/about`), google-sync (Integrations › Google page, `.st-panel`, `aria-current="page"`), github-rules (Integrations › GitHub page), ai-chat (`/settings/capture`). sidebar-ab and today-shell needed nothing.
- **Not run here, will need the same retargeting** (they open `/settings` or use `#settings-*`/`.st-card`/`data-sound-pack`): bound-journal, cal-polish, capture-anywhere, cleanup, event-reminders, final/*, fix-grammar, importers, keys-undo, labels, mcp, mcp-full, night, notify-fix, paper-capture, phone-taps, plan-replan, projects-fixes, release-2/sweep, shell-fit, small-gaps, sounds, tasks-noise, today-scale, tour, tray, tray-notices, tray-notify, ui-pass, user-tz, whats-new.

## Screenshots, beside the drawing

Drawing: `settings-looks/docs/log/assets/settings-looks/settings-options-day-1.png` (layout A: computer, 150%, phone) and `-day-2.png` (rows, search); `-night-1/-2.png`. Built, in `docs/log/assets/settings-build/`:

| Drawing frame | Built |
|---|---|
| Computer 100% day · Calendar & time | `7-desktop-calendar-day-100.png` (also `-125`, `-150`, and `-night-*`) |
| Night Garden · Notifications & sound | `7-desktop-notify-night-100.png` (`-125`, `-150`) |
| 150% · Capture & AI | `7-desktop-capture-day-150.png`, `-night-150.png` |
| Phone · the list | `5-phone-list-day.png`, `-night.png` |
| Phone · Capture & AI | `5-phone-capture-day.png`, `-night.png` |
| Phone · Account, night | `5-phone-account-night.png` (`-day`) |
| Search "time", computer / phone | `3-search-time-day.png` / `5-phone-search-day.png` (`-night`); also `3-search-ai-day.png` |
| (new) Phone More sheet | `6-phone-more-day.png`, `-night.png` |

## Notes for the merge

- Parallel builders: **notif** may add rows to Notifications — they now go into `NotificationsCard`'s sections ("Kinds" / "Quiet") or `SoundCatalogCard` as `<Row label help keys>`; give them `keys` for search and add their labels to `EXPECT.notify` in the harness. **typing** edits `lib/shortcuts` → Shortcuts follows. **cal-blocks** shouldn't touch Settings; `ViewOptionsPopover`'s exports (`readViewOptions`/`writeViewOptions`/`CalViewOptions`) are now read by Settings.
- Colours: none changed. Mixes used: the lit row and search marks (`--acc-buttercream` with transparency), the danger edge (`--acc-terra-ink` 45% into `--line-card`), as drawn.
- Left out: the drawing's "Not it? Ask Chat" line under search results (chat can't change settings today).
