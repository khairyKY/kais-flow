---
date: 2026-10-07T00:30+03:00
session: builder PF (Kai's projects / organizing bugs, 2026-10-06)
type: handoff
related: docs/DATA_MODEL.md (0050, 0051, 0052 + the type-change and status-update notes) · docs/log/assets/projects-fixes/
---

# Projects & organizing: moves land, names edit in place, domains are first-class, search opens the thing

Branch `claude/projects-fixes`, cut from `origin/claude/wave-r` (145ed48). One commit per item. Merged by the conductor into `claude/wave-s`; not deployed. Three migrations here (**0050–0052**), which are 0052–0054 on wave-s.

Kai's words (2026-10-06) and what each turned out to be:

## 1 · "If there is a task in a project I can't move it to a project"

Two root causes, fixed where every surface routes through:

- **The desktop ⋯ / right-click menu dropped the project list under the cursor.** `ContextMenu` closed an open submenu the instant the pointer crossed a sibling item. Heading diagonally from "Move to project…" into its list crosses Priority / Repeat, so the list was swapped for Repeat's (reproduced in the browser). Now, with a submenu open, a sibling only takes over after the pointer rests on it for 300 ms; reaching the submenu cancels the switch. This fixes every row menu (Tasks, Today, project / area pages, Planning) and every submenu (date, priority, repeat, remind).
- **`setProject` kept `area_id`.** A task moved from an area into a project lived in both, wore the area's tag (`resolveTag`: area wins) and stayed on the area's page, so the move never looked like it happened. Every later "move to another project" looked broken too.
  - `setProject` now clears `area_id` on any move into a project, and drops `milestone_id` when the project changes. "No project" leaves an area task in its area.
  - Every path goes through `setProject`: ⋯ menu, swipe, `p`, task sheet, bulk.
  - **0050** repairs rows already written both ways (keeps the project, which was the later choice). No check constraint, so an older build's queued offline write can't get parked.

Tests: `tasks/api.move.test.ts`.

## 2 · "We can't edit the name of an area, project or a retainer from inside the item"

The page title is the rename: click, tap, Enter or F2 edits it in place. Enter or blur saves through the outbox (`renameProject` / `renameArea`, both logged); Esc keeps the old name. Retainers are projects, so they get the same page. `RenameField` moved from ProjectsPage to `components/RenameField.tsx`. It is shared by the page titles, domain rows, domain chips and the status log.

## 3 · Domains first-class

**Where:** Settings has a new **Organize** card (desktop subnav + phone). The Tasks page's Organize card shares the same rows (`domains/DomainList.tsx`).

**What each row offers:**
- Click a name to rename it.
- ⋯ or right-click: Rename · Colour ▸ (8 swatches) · Move up / Move down · Merge into ▸ · Make it an area… · Delete.
- On a phone this is an ActionSheet, with a second sheet for the pickers.

**Rules** (pure, `domains/organize.ts`, tested):
- **Delete** follows the 0044 pattern: **0051** adds `domains.deleted_at`, and Delete = Trash + "Moved to Trash · Undo", no confirm.
  - What's in the domain is not touched. Projects, areas, tasks, people, routines and notes keep `domain_id`. While the domain is in Trash they read as "no domain", and Undo / Restore brings everything back.
  - `compost_expired()` composts domains after 30 days, and the set-null FKs release the rest.
  - `useDomains`, the parse-capture context and the `slipping` view skip trashed domains. Trash lists and restores them.
- **Merge** is the existing `mergeDomain`, which finally has a caller.
  - It moves every cached row of those six tables into the chosen domain, then trashes the emptied one. One Undo takes it all back.
  - The old version only moved projects and tasks: it left areas pointing at a hard-deleted domain.

## 4 · "I type 'remanage', it brought an entry, but when I clicked it, it wasn't there"

The result → page mapping sent hits to pages that couldn't show them:

| Hit | Was | Why it failed | Now |
|---|---|---|---|
| task in a project | `/projects/:id?focus=` | the page lists open tasks only — a done one was never there | the task itself: the sheet on a phone, the editor on a computer (`openTask`) |
| task elsewhere | `/tasks?focus=` | the default tab may not hold it (done, someday, other day) | same — the task itself |
| journal entry | `/journal` | opens today's page | `/journal?focus=` turns to the entry's day and scrolls to it |
| event | `/calendar` | opens this week | `/calendar?event=` jumps to its day and opens its details (desktop grid `gotoDate`, phone sheet) |
| inbox item | `/inbox?focus=` | filed / dismissed / snoozed captures weren't drawn at Inbox zero | always shown (ringed, with its state and "open task →") |
| project in Trash | `/projects/:id` | "Entity not found" — search still returned trashed projects (0044 came after 0037) | **0052** skips them |
| area | — | not searchable at all | **0052** adds areas (FTS + lexical) → `/projects/:id` |
| person | `/people/:id` | (worked) | same |

- One `searchDestination()` (`search/api.ts`, with the test table `searchDestination.test.ts`) now serves the ⌘/ overlay, /search and **chat citations**. Citations sent people, projects, journal entries and events to the Inbox.
- `supabase/functions/_shared/retrieval.ts` gains the `'area'` type. The search function itself is a pass-through.

## 5 · Status updates: edit and delete

- Click a log note to edit it in place. The row's ✕ deletes it with an Undo toast.
- An update is an `activity_log` row, and that log stays append-only (0002). So edit, delete and Undo are events of their own: `project.update_edited` / `_deleted` / `_restored` `{update_id}`. The feed resolves them in `projects/statusLog.ts` (tested).
- Work entries are `time_entries` rows: the note is upserted; delete is a hard delete whose Undo writes the row back; each is logged.
- `logActivity()` now returns the row it wrote. A just-posted update is therefore the real row. Before, the feed drew a copy under another id, which couldn't be edited until the next fetch.

## 6 · Number inputs

- `components/NumberField.tsx` (rules in `numberDraft.ts`, tested):
  - Focus selects the value, so typing replaces it.
  - The field may be empty while typing.
  - Blur / Enter settles it inside min–max; an empty field keeps the last value.
  - −/+ steppers, and arrow keys step.
- Every number input in the app uses it:
  - both milestone weights (project page, new-project modal; 1–100);
  - Focus's three custom-minute fields (1–180);
  - a challenge's days (1–3650, 0046's check).
- The dead `.kf-num` spinner CSS is gone.
- **Found while testing on a phone:** the project page's Hours / Milestones grid and its log form forced the card's content sideways, clipping the weight's −/+. The grid stacks on a phone (`minmax(0,1fr)`), and the log form and the two add-rows can shrink and wrap.

## 7 · Change a thing's type (added mid-session by the coordinator)

**Where:**
- "Change type…" on a project / area row's ⋯ (Projects page).
- The same in its page's footer. It replaces the area's "Convert to project…", which hard-deleted the area with no Undo.
- "Make it an area…" in a domain's menu.

**How it works:**
- A one-line ConfirmCard says exactly what moves and what stays.
- One Undo restores every rewritten row and removes the new one.
- Logged: `<project|area|domain>.type_changed` on the source, `<…>.created` on the new row, `<…>.type_restored` on Undo.
- After converting from inside a page, the new thing's page opens; Undo comes back.

**Rules** (pure, `projects/convert.ts`, tested):

| Change | What happens |
|---|---|
| project ↔ retainer | `type` flip only |
| project / retainer → area | new area (name, domain, colour) takes every task in it; the project goes to Trash with its milestones, checklist, hours and updates (restorable 30 days, then `time_entries` cascade with it) |
| area → project | new standard project takes its tasks (with the area's domain); the area goes to Trash |
| area → domain | new domain (name, colour); its tasks get it, with no area; the area goes to Trash |
| domain → area | new area (no domain) takes its loose tasks; its projects / areas / people / routines / notes (and the domain link of tasks inside them) go to no domain; the domain goes to Trash |

**Domain fields everywhere domains appear:** name, colour and order (`sort_order`, via Move up / down) are editable in Settings → Organize, the Tasks Organize card, and the phone's domain chips. On the chips, a long-press (the WebView's contextmenu) opens the same menu and Rename edits the chip in place. The chips are phone-only (`tr-mobile-only`); the desktop's place is the Organize card.

**Kai's "don't take away its simplicity":**
- The Projects page gains one menu item.
- The detail pages gain one footer link.

## Gate (on head)

- `npx tsc -b` → 0.
- `npm run lint` → 0 errors (21 warnings, 19 before). The two new ones are `only-export-components` for the `useChangeType` / `useDomainMenu` hooks exported beside their components (fast-refresh only).
- vitest ×4 time zones (PowerShell `$env:TZ`, offsets checked): UTC / Africa/Cairo / America/Los_Angeles / Asia/Tokyo — **100 files, 1182 tests** each. No `app/.env.local` exists in this worktree, so nothing needed moving aside.
- `npm run build` → ok.
- Browser (mocked backend, `npm run dev -- --port 5257 --strictPort --mode mock`):
  - `docs/log/assets/projects-fixes/verify.mjs` → **222/222** (full run, on head). An earlier full run failed one check: the item-3 domains-menu expectation was stale after item 7 grew the menu. It now expects the item-7 menu (Rename · Colour · Move up / down · Merge into… · Make it an area… · Delete).
  - Coverage:
    - desktop 1280 at 100% and 150% interface size, plus phone 390, day and night;
    - items 1–7, including a real-hand diagonal pointer path into the "Move to project…" submenu;
    - every search entity type on desktop and phone;
    - type changes and their Undo.
  - Screenshots and `verify-results.json` are beside it.
- `docs/log/assets/desktop-polish/verify.mjs` → **100 PASS, 0 FAIL** before a page-load timeout in its last section (the Windows updates card). A second run reached 60 / 0 and a third 65 / 0, each cut short by the same kind of timeout on a different page. Every check that ran passed, including the Projects-menu and area-delete ones.
  - Its two Projects-menu expectations now include "Change type…" (item 7 added that row on purpose); nothing else in it changed.
  - Cause of the timeouts: every page fetches the topbar weather from the real `api.open-meteo.com`, which the harnesses don't mock. A slow answer holds `waitUntil: 'networkidle'` past 30 s.
  - The conductor fixed it once for every harness in `claude/wave-s` (f0594db: the weather query is off in `--mode mock`) and re-runs everything on the merged tree.

## Risks / for the conductor

- **Migration numbers:** this branch keeps 0050 / 0051 / 0052. The conductor renumbered them to **0052 / 0053 / 0054** when merging into `claude/wave-s`; in what follows, 0051 = wave-s 0053 and 0052 = wave-s 0054. They each restate a whole function or view, so merge order matters:
  - 0051 restates `compost_expired()` and `slipping`, from 0044's bodies.
  - 0052 restates `search_hybrid`, from 0037's body.
  - If another branch redefines the same function, re-apply both changes on top.
  - Nothing is pushed to the live DB.
- **Merge reads caches.** A people / routines / notes cache never loaded this session isn't moved by a domain merge or a domain → area conversion. Those rows read as "no domain" and come back with Undo. The callers load projects, areas and tasks first (`ponytail:` note in `domains/api.ts`).
- Search's task hits no longer jump to the task's row inside its project (Kai 2026-07-21's rule). They open the task itself, as this brief asked. The editor shows its project.
- `lib/types.ts`, `lib/activity.ts`, `CalendarGrid.tsx` and `PhoneCalendar.tsx` are small edits in shared files; builder TZ may touch the same date helpers nearby.
