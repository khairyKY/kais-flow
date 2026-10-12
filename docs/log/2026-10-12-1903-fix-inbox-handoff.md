---
date: 2026-10-12 19:03 UTC
session: fix-inbox
type: handoff
related: Inbox t3 (design-export/Inbox.dc.html §3 "3a Desktop reviewed pass", "3b iPhone reviewed pass"; UI_REVIEW.md:51-68), the verified Inbox findings at 81a4d844
---

# fix-inbox: handoff

Branch `claude/fix-inbox` (from `origin/claude/kai-bugs-1012`, 81a4d844). Pushed. Not merged, no PR.

A review found that Kai's reviewed Inbox (t3, added to `Inbox.dc.html` in the 2026-09-28 export
landing) was never planned or built. The app still showed t1. It is built now, from the design,
and keeps every later ruling. The verified Inbox findings are fixed with it.

## Commits

| SHA | What |
|---|---|
| `3ccf403b` | Triage logic + tests: summary, confidence words, card shapes, people a capture names, zone-aware labels. Filing to a task in an AREA, to the journal and to People. Bulk actions with one Undo. Clear now goes to Trash |
| `7beae3a9` | `tasks/SwipeRow.tsx`: optional `tomorrowLabel` / `tomorrowIcon` / `deleteIcon` (the one change outside `inbox/`) |
| `22b53183` | The page: `InboxPage.tsx` (CRLF kept), new `InboxCards.tsx`, `Inbox.css` |
| (the next two) | The select box moved clear of the title; the browser harness + screenshots; this handoff + INDEX line |

## What changed (by the review's list)

- **Header.** "N waiting" counted rows the floret animation hadn't written yet. The design's "Inbox" + one line replaces it:
  - desktop: "3 to sort · 2 from GitHub · oldest is 5 days old";
  - phone: "3 to sort · 2 from GitHub" (`inboxSummary`, calendar days on the user's clock).
  - Offline, the line becomes the OfflineChip.
  - The hydrangea image and the handwritten "clear them and the hydrangea calms ✿" are gone.
- **Waiting | Dismissed** is a toggle in the header on desktop (kit `Segmented`). On the phone it is a "Dismissed 6" / "Waiting 5" link (44px). The tabs row is gone.
- **Confidence as a word** (`confidenceWord`): high ≥ 0.85, medium ≥ 0.75. Below 0.75 the card asks instead. No "NN%" anywhere.
- **One "Suggested" row of editable fields.** It replaces the sentence + Domain/Project selects + "✎ edit parse". Each field opens its own picker:
  - type → ContextMenu, or ActionSheet on the phone;
  - title → RenameField;
  - date → ScheduleMenu (the MK date picker);
  - place → `tasks/MovePicker` (domains, areas, projects; a sheet on the phone).
  - The title it files is the AI's short `title` (dates pulled out), else `cleaned_text`. `aiFiling` (calendar rail) uses the same rule now.
- **Unsure card:** "Where does this go?" and dashed choices: Task · Journal note · the person it names. The person comes from a whole-word name match, `mentionedPerson`, any script. A choice files straight there, with Undo.
- **Compact row for plain captures** (`cardShape` = `plain`): either no AI read, or a confident read that only confirms the words and places nothing. The row reads "renew hosting before the 15th · Email · Wed · Task · due Wed 14 · File". Click or tap the words to open it into the full card.
- **Keys on the buttons** (E / S / D keycaps inside File / Snooze / Dismiss, 36px). The keyboard footer and its tagline are gone.
- **Cards sit flat.** `kf-lift-tilt` and `--kf-tilt` are gone; the cards use plain `kf-lift`.
- **Search banner:** "From Search: your match is highlighted below." in sentence case, with a 28px close.
- **GitHub:** "From GitHub · Shaheen/website" when every issue is from one repo, else "From GitHub".
  - Desktop row: #482 (mono sage, a link to the issue) · title · "3 days" · File · Dismiss.
  - Phone row: 48px, "#482 · title · 3d".
- **Phone (3b):**
  - Field chips, then File as task / Snooze / Dismiss at 2 : 1 : 1.
  - Dashed unsure choices, 44px.
  - Compact row with File.

## The verified findings

| Finding | Fix |
|---|---|
| HIGH bulk File/Snooze/Dismiss/Restore plain toasts | `fileMany` / `snoozeMany` / `dismissMany` / `restoreMany`: priors collected, ONE `toastUndo`. Filing undoes through `unfile` (task hard-deleted, capture pending). "Restore all" uses it too |
| HIGH "Clear now" said "can't be undone" but went to Trash | `purgeMany`: no confirm, "Moved N captures to Trash" + Undo. The Undo sends `deleted_at: null` explicitly, because an upsert leaves out what it isn't given. `purgeInboxItem`'s comment corrected |
| Phone can't choose where; nobody can file to an AREA | The place field / bulk "File to…" is `MovePicker` (areas included; a sheet on the phone). `fileToTask` takes `areaId`; the toast names the area |
| Keys ignore a mouse selection; dead on Dismissed | `useListKeys(…, { selected, runAll })`. Waiting: E files each as its card says, D dismisses, S opens the bulk snooze. Dismissed: j/k, Ctrl+A, **R** restores (one Undo) |
| GitHub rows can't be dismissed on the phone | Tap opens File / Dismiss (+ "Open on GitHub ↗"); swipe left = Dismiss |
| Phone tap selected a card; no swipe on waiting cards; Dismissed used its own swipe | Every phone row is a `SwipeRow`: hold selects (then taps toggle), tap opens, swipe left = Dismiss. Dismissed rows: swipe right = Restore. `useRestoreSwipe` deleted |
| Esc on the title kept the typing | The title edit is `RenameField` (Esc = no change) |
| Skeleton-only loading | `listState` (journal's helper): Skeleton → ErrorCard "Your Inbox didn't load." + Retry → offline line; OfflineChip in the header while offline |
| Device-zone date in the resolved card (`toLocaleDateString` with no zone) | `dayWord` (user zone). Every new label (`capturedLabel`, `dueLabel`, `dueShort`, `inboxSummary`) reads the user's zone too |

Also:
- A cleared date now files with no date. Before, `opts.dueAt ?? parsedDue` brought the AI's date back.
- Dead helpers deleted: `countWord`, `formatCaptured`, `daysAgo`, `KindChip`, `useRestoreSwipe`, `ConfirmCard`/`Select`/`ProjectPicker` use in the inbox.

## Design vs rulings: conflicts and choices (later ruling wins)

1. **Capture + Scan paper in the header.** 3a's header has only the toggle. Kai's 2026-10-07 ruling puts "Capture" in the Inbox header. Paper Capture 11g/11m (the 2026-10-04 export) puts "Scan paper" there, on the phone too. All are kept. The header is a 2×2 grid: title | buttons / summary | toggle, so the toggle stays level with the summary as 3a draws it.
2. **"most urgent first" → "recently updated first".** Nothing ranks GitHub issues: P6 step 3, the AI ranking, was skipped on purpose. They are in last-updated order, and the line says so (`deviation(Inbox t3)` comment in code).
3. **GitHub labels and the glyph dropped.** The 2026-10-03 cleanup added a glyph, `repo#n ↗` and labels per the P6 spec; 3a draws `#482 · title · age`. The export won over code. The number still links to the issue, and repo names come back when issues are from more than one repo. *Kai: say if you want the labels back.*
4. **Waiting count = every pending item, GitHub included** ("Waiting 5" beside "3 to sort · 2 from GitHub"). 3a shows Waiting 3, but the sidebar badge counts all 5. Two different numbers for the same list on one screen would break "say it once".
5. **Toggle look:** the kit `Segmented` (sage active), not 3a's parchment pill. One segmented control in the app.
6. **Times are 24h** ("Sat 17 Oct · 15:00", "Thu 21:14"), like every picker and chip since Wave M. 3a's mock says "3:00 PM".
7. **Kit sizes win on the phone:** buttons 48px (`--touch-min`), not 44; the phone H1 is 26px (the shell's phone rule), not 29.
8. **Desktop compact row and unsure card keep a Dismiss.** 3a draws the compact row with File only. A mouse user would otherwise have no way to dismiss it, and the GitHub rows in the same design carry Dismiss.
9. **Filing toast:** 3a's `Filed "…" as a task`, plus where and when when the task has them (punch 7). Example: `Filed "Call Omar about Q4 pricing" as a task · Health · Sat, Oct 17`.
10. **Selection** stays the 2026-07-18 D2/D3 ruling: desktop surface click selects, sage wash, and a hover box that sits in the card's corner, so no space is held for it. On the phone, hold selects (Wave L grammar).
11. **A confident AI "note"** suggests "Journal note" as its type; everything else suggests Task. On a phone the confidence word isn't shown: 3b's meta line is source · time only.

## Verified

- `npx vitest run`: **1560 passed** (125 files). The count went from 1530 to 1560:
  - new tests in `inboxDisplay.test.ts` (summary, confidence words, shapes, people, places, labels);
  - new tests in `api.filing.test.ts` (area / journal / person filing, the bulk undo builders, Clear now);
  - the `countWord` / `daysAgo` tests went with their helpers.
- The same suite under 4 zones from PowerShell `$env:TZ`, offsets checked: UTC 0, Africa/Cairo −180, America/Los_Angeles 420, Asia/Tokyo −540. All 1560 passed.
- `npm run lint`: 0 errors, and no warning in any file I touched.
- `npm run build`: OK. The Inbox route chunk is 33.1 kB (9.5 kB gzip). The entry chunk gains nothing new, since `journal/api` and `people/api` were already in it via paper + widgets.
- **Browser, mock backend:** `docs/log/assets/fix-inbox/verify.mjs`, dev server from this worktree on :5250, `--mode mock`, http://localhost. **69/69** (`results.json`).
  - Desktop 1280×800 and phone 390×844, day and night.
  - Writes are recorded and applied to the mock rows.
  - The checks cover every row above: honest header, words not %, the fields, Esc revert, file into an area, journal + person filing with Undo, keys on a mouse selection, Ctrl+A, bulk File to… an area with one Undo, Dismissed keys, Clear now without a confirm + Undo, search banner, offline chip, error card + Retry.
  - Phone: 2:1:1 grid, dashed 44px choices, tap ≠ select, tap opens the compact row, place sheet with areas, hold selects, swipe left dismisses (card + GitHub), swipe right restores. No page errors anywhere.
- **Screenshots:** `docs/log/assets/fix-inbox/`.
  - Side by side with the design: `side-3a-desktop-{day,night}.png`, `side-3b-phone-{day,night}.png` (the design frame rendered from `Inbox.dc.html`).
  - States: `d1-desktop-*-lower`, `d4-*`, `d6-dismissed-desktop`, `d7-*`, `d8-error`, `p1-phone-place-sheet`, `p2-phone-dismissed`.

## Not verified

- A real device: touch was CDP touch in Chromium. Not checked on Kai's Android or an iPhone.
- The real backend:
  - `interactions` / `journal_entries` writes from the Inbox went only to the mock. The tables and RLS are the existing ones.
  - The undo of Clear now, which un-Trashes via upsert, was not run against PostgREST.
- Real AI reads: parse rows were hand-made. Old rows without `title` fall back to `cleaned_text` (unit-tested).
- `?` cheatsheet: `lib/shortcuts.ts` (not mine) still lists e/d/s/↵. The Dismissed tab's **R** isn't in it. One line to add when lib is open.

## Files

- Mine: `app/src/features/inbox/{InboxPage.tsx, InboxCards.tsx (new), Inbox.css, api.ts, api.filing.test.ts, inboxDisplay.ts, inboxDisplay.test.ts}`.
- Outside (minimal, additive): `app/src/features/tasks/SwipeRow.tsx`. It gains three optional `SwipeActions` fields; the defaults are unchanged for task rows.
- Imports only:
  - `tasks/MovePicker`, `tasks/move`, `tasks/SwipeRow`;
  - `journal/api` (`upsertJournalEntry`), `journal/journalDay` (`listState`);
  - `people/api` (`usePeople`, `createInteraction`, `deleteInteraction`);
  - `areas/api`, `capture/aiFill` (`CONFIDENCE_THRESHOLD`).

## For Kai

- Labels on GitHub rows: back, or as drawn (gone)?
- "Waiting" counts GitHub too, matching the sidebar badge. 3a's own numbers didn't.
- On the phone, the unsure card has no Snooze button (as 3b draws it). Snooze is a hold-select → bulk bar away. OK?
