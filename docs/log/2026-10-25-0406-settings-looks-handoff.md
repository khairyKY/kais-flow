---
date: 2026-10-25
session: settings-looks (designer-builder, worktree .claude/worktrees/settings-looks, branch claude/settings-looks from v1.4.1)
type: options
related: queue item 22 (D:\Coding\_claude-cloud\kais-flow-queue-2026-10-23.md); Kai 25 Oct, "The settings need grouping, where the settings are categorized and the user chooses what he wants to do"
---

# 2026-10-25 04:06 · options · Settings grouping and looks

This is a looks-only page for Kai to pick from by eye. **Nothing is built** and `app/` is untouched.

- **Page:** `design-export/Settings options.html`. Open it from disk. It has a Day / Night page toggle, and `?night` opens it at night.
- **How Kai picks:** "This one" under each option, then "Copy my picks", which gives for example `Settings: layout A, rows B`.
- **Screenshots:** made with headless Chrome by `docs/log/assets/settings-looks/shoot.mjs`, with no console errors. Each theme is two images, because Chrome repeats a capture past 16384px:
  - `-1` = the grouping table + Layout; `-2` = Rows and controls + Search + Notes;
  - `docs/log/assets/settings-looks/settings-options-day-1.png`, `settings-options-day-2.png`;
  - `docs/log/assets/settings-looks/settings-options-night-1.png`, `settings-options-night-2.png`.
- **Drawn:** every screen comes from one list of settings in the page (`CATS`), so all layouts show the same rows. Each layout is drawn as:
  - a computer at 1280 and 100%, by day and in Night Garden;
  - the same window at 150%;
  - three phone screens at 390.
- **Kept as is:** colours are the app's tokens and none is changed. The sidebar is v1.4.1's (line icons, name menu on top, Capture · Search · Chat at the foot).

## Options on the page

| Group | Option | What it is |
|---|---|---|
| Layout | **A · Two panes** | Categories with icons on the left, one category on the right; search heads the list. The phone gets a list that drills into one page per category. |
| Layout | **B · Cards home, then one page** | Settings opens on 11 cards that say what's inside, with a status where it helps. A card opens one category with ‹ Settings to go back. The phone works the same way. |
| Layout | **C · One page with an index** | Everything stays on one page, with the 11 categories as chapters in one column. A sticky index lights the current chapter and its sections. The phone keeps one long page with a sticky row of chips. |
| Rows | **A · Panels** | Rounded panels with hairlines and the controls on the right. More than three choices become a picker. The danger zone is a terra-edged panel. |
| Rows | **B · Open form** | No panels: serif section titles, and the controls in their own aligned column. Every choice stays visible and each switch says On or Off. The danger zone is one tinted row. |
| Search | one drawing | Search sits at the top of the list, cards home or index, reached with Ctrl F. Results are grouped by category, each with its live control and › to open its category. Matching goes by meaning ("dark" finds Theme). |

The layout drawings use the rows pick (A until one is picked), and a switch redraws them in B.

## Settings today: the full inventory (v1.4.1, `app/src/features/settings/SettingsPage.tsx` + sub-files)

Desktop has two columns of cards, a left sub-nav that scrolls to them, and a separate Integrations page. The phone has one column in a different order, with GitHub, Google, photos and MCP inline under "Connections".

| Where today | Setting / row / action | Control | Stored |
|---|---|---|---|
| Appearance | Theme | Light / Dark / Auto | device |
| Appearance | Interface size | 100 / 110 / 125 / 150 / 175% | device |
| Appearance | Time format | 12-hour / 24-hour | device |
| Appearance | Paper texture | slider 0–100% + preview | device |
| Appearance | Botanical animations | toggle | device |
| Sound | Sound (master) | Whisper / Soft / Full + toggle | device |
| Sound | Sound pack | Kalimba / Felt / Glass radio cards, each with ▶ | device |
| Sound | Task done · Goal done · Captured · Focus begins · Focus ends · Ritual · Undo | ▶ preview + toggle each | device |
| Sound | Silent after Shut down | toggle | device |
| Calendar | Opens on | Day / 3 days / Week | synced |
| Calendar | Weekend | Fri+Sat / Sat+Sun / Sun only / Custom (7 day buttons) | synced |
| Calendar | Plan shortcuts | "What do these mean?" glossary popover / sheet | — |
| Time zone | Current zone + offset | "Use this device's zone" link, search + list | synced |
| Resurfacing | High / Medium / Low priority "Not now" cooldown | slider 1–30 days each | device |
| Notifications | What's in the way on this device | status list | — |
| Notifications | Send a test notification | button | — |
| Notifications | Task reminder · Event reminder · Routine reminder · Morning digest (+ time) · Evening nudge (+ time) · Focus done · Paper capture ready · Birthday · Sync problem | toggle each | synced |
| Notifications | Quiet hours | from / to times + toggle | synced |
| Notifications | Show task names on the lock screen | toggle | synced |
| Notifications | Hide titles on the home screen (Android widgets) | toggle | phone |
| Notifications | Show in the system tray · Start with Windows (Windows app) | toggle each | device |
| Notifications | This phone note (Android) / Subscribe or Unsubscribe this device (web) | text / button | — |
| Integrations (card) | GitHub · Google Calendar · Groq status | chips + "Open integrations" | — |
| Integrations page | GitHub: Connect (token form), Sync now, See issues, Disconnect, Reconnect; rules: Watching repos, New issues land in (Inbox / Tasks), Priority in inbox ordering, Pause this source | buttons, chips, segmented, toggle | server |
| Integrations page | Google Calendar: Connect, Sync now, Disconnect, Reconnect; each calendar on/off, Show my plan in Google as busy (or Reconnect to allow), Last synced, Look for new calendars | buttons, toggles, link | server |
| Integrations page | Share target (info) | — | — |
| Integrations page | Capture · photos: Photos of your pages (Keep 7 days / Delete after reading), Scans today, Read when offline | segmented, meter, value | synced / device |
| Integrations page | AI assistants (MCP): Create / New key, Turn off, Journal and People access, Access (Read & write / Read only), server address + Copy, Connect an assistant (Claude Code, Claude Desktop, other) | buttons, toggles, segmented | server |
| Organize | Domains: new, rename, recolour, merge, delete | list + menus | synced |
| Organize | Labels: new, edit, delete | list + menus | synced |
| Your data | Import (Open importer → /settings/import) | link button | — |
| Your data | Export: Everything (.json) · Tasks (.csv) · Calendar (.ics) | buttons | — |
| Your data | Trash (Open trash → /trash) | link button | — |
| Profile | Email, Rerun the welcome | link | — |
| App | Version, build, Check for updates (+ Reload / Update) | button | — |
| App | Download the apps (Android, Windows) | links | — |
| App | The tour: Show me around again | button | — |
| App | What's new notes | list | — |
| Advanced | External capture endpoint: Create / New key, Copy key, Copy bookmarklet, Turn off, How to send things here | buttons, details | server |
| Name menu (sidebar) | Sign out | menu item | — |

**Coming from the builders running now** (labels taken from their working trees where they exist):

| Builder | Rows |
|---|---|
| legal | Privacy & terms card: Privacy Policy (Read), Terms of Use (Read), What we keep and where. Delete account… (legal puts it under Your data). |
| ai-chat | Capture & AI card: File captures for me (toggle, default off), Pick a project for new things (Off / Suggest / Assign, default Suggest). |
| cal-wave | Fit days to the window (Responsive), Fit hours to my day (Dynamic), Density, Second time zone, the Now card on/off. Week starts and Density are already in the calendar's View options today. |
| tray | No new settings so far. Its two existing rows (system tray, Start with Windows) move to App & updates. |
| typing | The typing guide's content goes in Shortcuts as a reference. |

## Proposed grouping (11 categories)

| # | Category | Icon | What's in it | From today |
|---|---|---|---|---|
| 1 | Account | person (new) | Email · Sign out · Name and workspace (Rerun the welcome) · Danger zone: Delete account | Profile; Sign out from the name menu; Delete account (legal) |
| 2 | Appearance | half disc (new) | Theme · Interface size · Paper texture · Botanical animations | Appearance (Time format leaves) |
| 3 | Calendar & time | calendar | Time: Time zone · Time format · Weekend · Week starts on. Calendar: Opens on · Fit days to the window · Fit hours to my day · Density · Second time zone · Now card. Planning: Plan shortcuts · Google Calendar (link) | Calendar + Time zone; Time format from Appearance; Week starts and Density from View options; cal-wave rows |
| 4 | Capture & AI | inbox | File captures for me · Pick a project for new things · Page photos · Scans today · Read when offline · Share to Kai's Flow | ai-chat; photos and Share target from Integrations |
| 5 | Notifications & sound | bell | This device + Send a test · the 9 kinds · Quiet hours · Task names on the lock screen · Sound, pack, 7 sounds, Silent after Shut down · This browser (web only) | Notifications + Sound |
| 6 | Organize | label | Domains · Labels · "Not now" cooldowns | Organize + Resurfacing |
| 7 | Integrations | link | Google Calendar › · GitHub › · AI assistants (MCP) › · Groq (built in) · Capture key & bookmarklet › (each › is its own page with today's controls) | Integrations card + page; capture key from Advanced |
| 8 | Your data | cylinder (new) | Import · Export · Trash | Your data (Delete account goes to Account) |
| 9 | Privacy & terms | lock | Privacy Policy · Terms of Use · What we keep and where · What AI assistants can see (link) | legal |
| 10 | Shortcuts | keyboard (new) | Keys (Capture, Search, Chat, Settings, calendar D/W/M, ?) · Typing a task (dates, #project, *label, !, length, repeat, //) | the ? overlay; typing (item 9) |
| 11 | App & updates | info (new) | Version + Check for updates · What's new · Download the apps · The tour · Guide · On this computer (tray, Start with Windows) · On this phone (hide widget titles) | App; Windows rows and widgets row from Notifications |

- **List groups:** the category list is split by hairlines into:
  - you (Account);
  - how it looks and behaves (2–6);
  - what it connects and keeps (7–9);
  - help (10–11).
- **Gone:** Advanced, the separate Integrations page, and the Profile / App names.
- **Shows in two places:** Google Calendar is a link row in Calendar & time. "What AI assistants can see" in Privacy & terms links to the same switches.
- **Platform-only sections** show only where they apply, as today: On this computer (Windows app), On this phone (Android app), This browser (web).

## Notes for the build (after Kai picks)

- **Wait for the builders.** The build depends on legal and ai-chat (and cal-wave for its rows), per item 22. They each add a card to `SettingsPage.tsx`, so build on top of their merges.
- **Delete account:** legal's row sits under Your data. The proposal moves it to Account's danger zone, a one-line move.
- **Five new glyphs** need to go into `app/src/components/icons/kf/`: person, appearance, data, keyboard, info. Their markup is in the page's `IC` map.
- **Deep links:** `?google=` must still land on Integrations › Google.
