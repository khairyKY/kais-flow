---
date: 2026-09-26 07:04 UTC
session: polish-c-worker
type: handoff
related: audit-newuser
---

# Polish C: the app belongs to whoever signs in, and every page is reachable on a phone

**Branch:** `claude/polish-c`. It branched off `origin/claude/release-1` at `0116ce0`, and `release-1` was merged back in at `0fc3216` (P0-B, SEC-2, Polish B) before item 5. Nothing is merged into `release-1` and no PR is open.

**Commits (oldest first):**

| SHA | What |
|---|---|
| `6eac0db` | item 1: the phone More sheet reaches Tasks, Projects, Activity and Trash |
| `649db71` | item 2: the shell names the owner; duplicate in-page strips removed |
| `80b5009` | item 3: Activity labels |
| `ed4a485` | item 4: a failed search is not "no results"; one search box |
| `e2e1e4d`, `36d18d3` | layout guards for items 1 and 2 (More-sheet grid, long names) |
| `9fad9ac` | merge of `release-1` (clean; `AppLayout.tsx` kept both sides: P0-B's `useSignOut` and my owner labels) |
| `1552820` | item 5, the conductor's scope addition: the sync popover counts changes and names them |
| `912b526` | keeps the Activity copy out of the initial bundle |
| (this commit) | handoff + evidence |

**Kai delegated all UX calls to me for this batch.** The decisions I made are listed under "Taste calls for Kai" below, so he can reverse any of them.

## Files

- **Changed (CRLF kept):**
  - `components/AppLayout.tsx`
  - `components/MobileTabBar.tsx`
  - `features/activity/ActivityPage.tsx`
  - `features/herbarium/HerbariumPage.tsx`
  - `features/trash/TrashPage.tsx`
  - `features/library/LibraryPage.tsx`
- **Changed (LF):**
  - `components/icons/NavGlyphs.tsx`
  - `lib/settings.ts`
  - `features/onboarding/OnboardingPage.tsx`
  - `features/search/SearchPage.tsx`, `SearchOverlay.tsx` and `api.ts`
- **New:**
  - `lib/owner.ts` (+ test)
  - `features/activity/describe.ts` (+ test)
  - `features/search/searchState.ts` (+ test)
  - `features/search/useSearch.ts`
  - `components/syncQueue.ts` (+ test)
- **Not touched:** `App.tsx`, `features/auth/**`, `features/routines/**`, `features/journal/**` and `lib/outbox.ts`. I only *import* `useRoutines` and `unsyncedChanges` from them.

## 1. Phone navigation (`components/MobileTabBar.tsx`)

- **Adds:** Tasks, Projects, Activity and Trash, appended after Focus in the More sheet. This follows the same precedent Focus set: added rows go after the designed rows, never between them.
- **Row pattern and icons:** each new row uses the sheet's existing row pattern. The icon for each is the one the collapsed sidebar rail already gives it:
  - Tasks: the blossom `FlowerIcon`. It moved from `AppLayout` into `icons/NavGlyphs.tsx`, so both places share one copy.
  - Projects: `ProjectsGlyph`.
  - Activity: the gold dot.
  - Trash: the hairline dot.
- **Deviation marker:** `deviation(2026-09-26 audit)`, because the export's sheet omits all four.
- **Grid fix:** the grid was `repeat(3, 1fr)`, and at the default **125% interface size** (`lib/uiScale.ts`) a 390px phone lays out only about 312 CSS px.
  - Before this branch, the right column already ran about 10px past the sheet's padding.
  - With "Projects" added, it ran off the screen edge.
  - Plain `minmax(0,1fr)` truncated every label ("Routi…"), so I rejected it.
  - Now: `repeat(auto-fill, minmax(112px, 1fr))`. That gives three columns where they fit (390px at 100%, which is the export's look) and two where they don't. The export's own caption for this sheet reads *"More" sheet contents (2-column grid)*.

## 2. Kai-specific text shown to every user

`lib/owner.ts` holds one rule, which onboarding's live preview and the shell share:
- `flowName(display_name)` gives "Mira's Flow". If the name is unset or blank, it gives "Kai's Flow".
- `workspaceName(workspace_name)` gives "Nile Studio". If unset, it gives "Personal".

`useOwner()` in `lib/settings.ts` reads them. The text stays `visibility:hidden` only while the very first settings read is in flight. A persisted cache skips that wait, and an offline (paused) or failed read shows the fallback. So no one ever sees someone else's name flash.

**Decisions, string by string:**

| Where | String | Decision |
|---|---|---|
| Sidebar header, title | "Kai's Flow" | **The owner's.** Onboarding promises "type it, and the whole app takes your name" and previews `${name}'s Flow`, so this becomes `flowName()`. It ellipsizes; long names no longer wrap. |
| Sidebar header, subtitle | "Personal · Cairo" | **The owner's workspace** + "Cairo". Onboarding step 2 says the workspace "shows up quietly at the top of every page". Becomes `{workspace} · Cairo`. |
| Topbar, left | "Kai's Flow · {date} · {sync}" | **The owner's** (the SPEC §2 app-name slot). On phone only, the name is capped at about 12 chars with an ellipsis, so it doesn't push the date off. |
| Topbar, right | "Africa/Cairo" | **Kept.** The app's day boundary is Cairo for every account (B2), and `app_settings.timezone` isn't read anywhere yet. Deriving the label from the setting would state a zone the app doesn't compute in. |
| Sidebar "Cairo", onboarding preview "Cairo" | "Cairo" | **Kept**, for the same B2 reason. |
| Onboarding step 2 preview strip | "Kai's Flow · {workspace} · Cairo" | **The owner's.** It hard-coded "Kai's Flow" even after you typed your name one step earlier. Now it shows `{appName} · {workspace} · Cairo`, the exact rule the shell uses. |
| Onboarding name placeholder | "Kai" | **Kept.** It's example text in an empty field, and the product's namesake. |
| Onboarding step-0 header / empty-name fallback | "Your Flow" / "Kai's Flow" | **Kept**: the product name while no name is typed. |
| `index.html` title, PWA manifest, Settings "Share to Kai's Flow…", sign-in doorway (`AuthLayout`), `/reset` "← Back to Kai's Flow" | "Kai's Flow" | **Kept**: the app's name (it's what the PWA installs as). The auth ones are also off-limits here. |
| `/capture` share-sheet mock, `/seasons` "Good morning, Kai" ×7 | | **Left.** Polish A made both galleries dev-only (`d6a5f63`), so they're not in production. |
| Topbar weather echo "Cairo · 22° …" (`features/seasons/TopbarEcho.tsx`) | "Cairo" | **Left**: it's Cairo's weather for everyone. It isn't trivially derivable (it would need a location), so it's an open question below. |
| `seed_avatar` | — | **Still unread.** No shell spot names a seed in the export. Open question. |

**In-page "KAI'S FLOW · … / AFRICA/CAIRO" strips (audit):**
- Each page's `.dc.html` has that strip as `<main>`'s first child: 42px, the exact topbar style. It is the export's mock of the shell topbar, and in the app the real shell already draws one above the page. The copies are clearly leftovers, so I removed them from **Activity, Herbarium, Trash and Library**.
- **Journal has the same leftover**, and a hard-coded "Synced ●" that stays on while the topbar says Offline (audit #20). `features/journal/**` is owned by another worker, so I only report it: `JournalPage.tsx:~652-661`.

## 3. Activity labels (`features/activity/describe.ts`)

- **How it's built:**
  - I read every `logActivity()` caller for its event name and payload.
  - `describeActivity(entry, names)` maps each written event type to a verb-first sentence plus a quiet detail line (Activity.dc.html voice).
  - Names come from the payload, or else from the lists the page already holds: tasks, projects, areas, domains, people, routines, inbox items, events.
  - A thing that no longer exists gets copy that reads without a name ("Deleted a task"), never a placeholder in quotes.
  - Event names in the database are unchanged.
- **The audit's four:**
  - person created → **Added "Salma" to People** (detail "new in the clover patch")
  - a real interaction → **Logged an interaction with "Salma"** (detail = the summary)
  - capture → **Captured "basil seeds for the balcony"** (detail "quick capture", or voice / "saved offline" / "back from Tasks")
  - journal save → **Kept writing in the journal** (created: "Wrote a journal entry")
  - routine created → **Planted a new routine — "Evening stretch"** (detail "evening")
- **Also fixed:**
  - Routine checks and task completions now find their names. Their payloads carry none, so they used to read "routine" / "task".
  - A milestone event names the milestone, not the project. The old code read `payload.title` as the entity name.
  - Nothing prints `Action: raw.event_name` any more.
  - Both count lines say "1 event", not "1 events".
- **Chips:** new categories `review`, `library` and `garden` (onboarding, and anything newer than the map) show under All only. The filter chips are the export's, unchanged.
- **Not changed:** times are still device-local under the Africa/Cairo topbar (audit #22, T-2 follow-up, B2), because that's day math.

## 4. Search (`features/search/**`)

- **One lifecycle for both surfaces:** `searchState.ts`, a pure reducer, plus `useSearch.ts`.
  - `done` with no hits is the real empty result: "Nothing's come up for that…".
  - `resting` is a search that didn't answer, whether network down, a 5xx, or a reply without a results list.
- **Page, when resting:** clover/resting.png, the hand note **"Search is resting — try again in a moment."** and a **Try again** pill. There is **no count line**, because it doesn't know a count.
- **Overlay, when resting:** the same line plus an underlined **Try again**.
- **Never the word "error":** there's a test for it.
- **Stale answers:** a slow answer for an older query can no longer land on a newer one.
- **Double box:** the empty state drew a second search box and its own "0 RESULTS", copied from the export's standalone 1b frame. On `/search` those are the real box and count line above, so the empty state is now the soil, the note and the chat pill only.

## 5. Topbar sync chrome (the conductor's addition)

- **Count:** the strip's count is now P0-B's `unsyncedChanges()`, reused rather than copied. It counts user actions, not queue rows: 2 actions offline read "Offline ◌ — 2 saved here", where they used to read "4".
- **Rows (`components/syncQueue.ts`):** the popover lists one row per change.
  - Each row has a human kind for every table the app writes: Task, Inbox, Journal, Event, Routine, Person, Project, Area, Domain, Focus, Settings, Resurfaced, Library, and "Change" for anything unknown.
  - The verb comes from the change's own activity row: `'buy milk' · completed`, `'offline seeds' · captured`, `'Water the basil' · added`.
  - Journal bodies never appear; the row reads "Journal · updated".
- **Header:** **"Offline ◌ · 2 changes saved here"** / **"Syncing ↻ · 1 change waiting to sync"**.
- **Activity-only queue:** when only activity rows wait (a ritual step, a review verdict), they are the changes, e.g. "Ritual · step completed".
- **Agreement test:** `syncRows()` loads the real `lib/outbox.ts` (idb + supabase mocked) and checks that its length always equals `unsyncedChanges()`.
- **Follow-up for the outbox owner:** the "non-activity rows, else all" rule necessarily lives in both files. If `lib/outbox.ts` ever exports its filter, `syncQueue.ts` should use it.

## Taste calls for Kai

1. **More-sheet order:** Routines · Inbox · Review · Journal · People · Settings · Focus · **Tasks · Projects · Activity · Trash** (appended; a placeholder). A case exists for putting Tasks and Projects first, since they're Tend-group primaries.
2. **More-sheet columns:** two at the default 125% interface size, three at 100%.
3. **Owner name in the topbar too**, not only the sidebar. Onboarding says "the whole app takes your name", and on a phone the topbar is the only place it shows.
4. **The workspace name has no spot on a phone:** the sidebar is hidden there, and I didn't add it to the crowded topbar.
5. **"Cairo" kept** in the sidebar subtitle and the topbar zone (B2). When B2 makes the timezone setting real, both should read it.
6. **Search resting state:** the resting clover and a "Try again" pill. No design exists for it (Phase C). I built it only from the empty state's own parts.
7. **Activity copy voice:** conventional verbs and garden details, e.g. "Added "Salma" to People" / "new in the clover patch", "Planted a new routine — …". All of it is in one table in `describe.ts`, so it's easy to re-voice.
8. **Sync popover header wording:** "N changes saved here" / "N changes waiting to sync". The strip itself keeps the export's shorter "Offline ◌ — N saved here" / "Syncing ↻ N".

## Evidence (all run in this session)

**Automated, from `app/`, at `912b526`:**
- `TZ=UTC npx vitest run`: **Test Files 38 passed (38), Tests 489 passed (489)**.
- `TZ=Africa/Cairo npx vitest run`: **Test Files 38 passed (38), Tests 489 passed (489)**.
- The branch-point baseline was 28 files / 279 tests. The merged `release-1` adds its own; mine add `lib/owner.test.ts` (7), `features/activity/describe.test.ts` (113, including one per written event type), `features/search/searchState.test.ts` (7) and `components/syncQueue.test.ts` (12).
- `npm run lint`: **2 errors**, the baseline pair at `features/projects/ProjectsPage.tsx:23–24`.
  - Warnings: **26**, against **30** on `release-1` `0fc3216`, which I measured by linting a `git archive` of it with the same config.
  - The 4 that went away were ActivityPage `exhaustive-deps`. None were added.
- `npm run build` (`tsc -b` + vite + PWA): green.
  - Initial `index-*.js`: **326.66 kB / 99.93 kB gzip**, against **322.98 / 98.67** for `release-1` built the same way. That's **+1.26 kB gzip** for the whole branch.
  - A first version pulled `describe.ts` into the shell (+5.3 kB gzip). `912b526` fixes that.

**Real run: production build + local Supabase stack.**
- Setup: `vite build && vite preview --port 5233 --strictPort`. Every run's `version.json` is printed at the top of its log, and the final runs served `912b526`. Chromium 1194 via Playwright, `timezoneId: 'Africa/Cairo'`, desktop 1280×800 and phone 390×844, day and night.
- Script: `assets/polish-c/polish-c-e2e.mjs`, a copy of the conductor's `smoke.mjs` that I extended; logs are `assets/polish-c/e2e-*.log`.
- **Account:** `polish-c@example.com`, signed up **through the app's form**.
  - It landed on `/onboarding` (Polish A's gate).
  - I completed onboarding with the name **Mira** and the workspace **Nile Studio**.
  - REST check: `app_settings` = `{display_name: Mira, workspace_name: Nile Studio, seed_avatar: cherry/bud}`.
- **Seeded through the UI**, and the outbox drained to 0 with 0 dead letters:
  - 2 people
  - 1 interaction
  - 2 ⌘K captures
  - journal writing
  - 2 routines

**Results:**

- **`shots`: 28/28.**
  - The sidebar shows "Mira's Flow / NILE STUDIO · CAIRO" and the topbar "MIRA'S FLOW · SAT 26 SEPT · SYNCED ●", day and night.
  - The phone More sheet reaches **/tasks, /projects, /activity, /trash**. Every row is ≥44px, and there's no horizontal overflow.
  - Activity:
    - no in-page strip
    - "Added "Salma 0634" to People"
    - exactly one interaction row, "Logged an interaction with "Salma 0634""
    - "Captured "basil seeds for the balcony 0634""
    - "Kept writing in the journal"
    - "Planted a new routine — "Evening stretch 0634""
    - "Planted your garden"
    - no raw names
    - no "1 events"
  - `/search` has one box and no "0 results" line, and shows "Search is resting". **Try again** re-asks (a new request, still resting locally) and the word "error" never appears. The ⌘/ overlay also rests and never says "error".
  - **kai.local** (no app_settings row, so no answers): it gets offered `/onboarding` by the gate, and the script goes to `/today` **without answering**, since it's a shared account. The header still reads "Kai's Flow / PERSONAL · CAIRO" and the topbar "KAI'S FLOW · …".
- **`offline`: 12/12**, desktop day and phone night.
  - Queue `[inbox_items, activity_log, tasks, activity_log]` gives the strip "OFFLINE ◌ — 2 SAVED HERE".
  - The popover reads "OFFLINE ◌ · 2 CHANGES SAVED HERE | INBOX 'offline seeds …' · captured | TASK 'Water the basil …' · added".
  - Back online, it returns to SYNCED.
  - **Before** (`AppLayout.tsx` from `9fad9ac`), 4/12: "4 SAVED HERE", with two `ACTIVITY_LOG saved` rows.
- **`sheet`: 12/12.**
  - 390px at 125%: 2 columns. 390px at 100%: 3 columns. 360px at 125% and at 100%: 2 columns.
  - No label is truncated, no row passes the screen edge, and rows are ≥44px (54 / 44).
- **`longname`: 2/2.**
  - It temporarily set polish-c's own display_name to "Alexandria-Rosemary" over REST, then restored "Mira".
  - The sidebar title ellipsizes ("Alexandria-Rose…").
  - On phone, the name caps as "ALEXANDRIA-… · SAT 26 SE". The date loses its last letters at that extreme length, because the phone topbar is crowded (see below).
- **`strips`, at HEAD: 4/4.** Herbarium, Trash and Library have no in-page strip, and the onboarding preview (reached via `?replant=1`, never finished, nothing saved) reads "MIRA'S FLOW · NILE STUDIO · CAIRO".
  - Before: **0/4**, against the `release-1` `0fc3216` baseline build served on :5239, whose `version.json` was checked against the build's own stamp.
- **Kai fallback, pixel diff** against the verified `release-1` baseline build:
  - **Phone:** byte-identical PNG.
  - **Desktop:** 178 of 1,024,000 px differ, max channel delta 37/255. All of it is anti-aliasing:
    - 6 px on the sidebar title and subtitle's left glyph edge (the new ellipsis clip);
    - 172 px from a sub-pixel shift of the topbar's "SYNCED ● · CAIRO" run. The text before it is pixel-identical; the owner name now sits in its own span.
  - I shot HEAD twice, 3s apart: identical, so this is deterministic and not timing.
- **Console,** other than the known open-meteo `ERR_TUNNEL_CONNECTION_FAILED`:
  - the `search` 503s, which are the failure path under test (edge functions don't run locally);
  - `ERR_ABORTED` asset requests, from the script leaving kai.local's `/onboarding` mid-load.
  - Nothing else.

**One mistake I made and corrected:** my first "before" run for the strips went to **:5234**, which belongs to another worker's preview (polish-d, commit `86947f6`). My baseline server had failed its `--strictPort` start without my noticing. I didn't touch their process. I re-ran on :5239 after checking the port was free, and verified the served `version.json` matched my baseline build. The logs in `assets/` are the re-run.

**Screenshots:** `docs/log/assets/polish-c/`. Pairs are `before-*` / `after-*`. Those are 42 PNGs; the other 13 files are the e2e script, `pixdiff.cjs` and 11 logs.

## Open questions and findings outside my scope

- **Phone topbar is over-full at 390px / 125%.** Even for Kai, "SYNCED ●" is never visible: the strip clips after the date. Opening the popover scrolls the strip to the status button (visible in `after-offline-phone-night-popover.png`, and the same before this branch). It needs a Phase C pass for the phone topbar.
- **Journal** keeps its own "Kai's Flow · date · Synced ●" strip (hard-coded "Synced") under the real topbar. That's for the journal owner, `JournalPage.tsx:~652-661`.
- **Weather echo** is Cairo's weather for every account. Location would need a setting or geolocation.
- **`seed_avatar`** is saved but shown nowhere. Is there a spot for it?
- **Activity times** are device-local under an "Africa/Cairo" topbar (audit #22, B2 / T-2). I didn't touch them, because that's day math.
- **Lint baseline** is still 2 errors (`ProjectsPage.tsx:23–24`, audit D2).
