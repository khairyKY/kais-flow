---
date: 2026-10-12 22:02 UTC
session: paper-gaps (builder, branch claude/paper-gaps off claude/kai-bugs-1012 @ 821534af)
type: handoff
related: design-export/Paper Capture.dc.html 11c · 11d · 11e–11h · 11i · 11m · Vault "Claude Design Prompts/11 — Paper capture.md" §3 · 2026-10-04-0457-paper-capture-handoff.md (what v1 skipped) · 2026-10-12-2011-tray-notices-handoff.md (the paper-ready notice) · 2026-10-12-1919-ds-check-audit.md
---

# Paper capture: the gaps the design review found

Branch `claude/paper-gaps`, pushed. Not merged, no PR.

Kai (2026-10-12): "build the unbuilt designs" and "every feature meant to be and not drift from the design
system". The design-coverage review said Paper capture was built except five things. Here is each one.

| Gap | Verdict | What changed |
|---|---|---|
| **11d lock-screen notice** | **Already built, no change.** The merged paper-ready notice (tray-notices, 12k) is the 11d lock-screen notification: a read reaching `done` sends it to the owner's phone or PC when nobody is looking. The words differ from 11d: see "11d vs 12k" below | none |
| **Chip editing** (11e–11h) | Was: only the type chip could be changed. Now every chip 11e draws can be edited | date, project, priority, type, plus the "page title" label |
| **Page reorder** (11c) | Was missing | hold-and-drag (touch), drag (mouse), ⌥← / ⌥→ |
| **Long-press select** | Was missing | hold to select, then Type · Date · Project · Drop |
| **HEIC** | Was dropped silently on Windows | Safari reads it. Elsewhere 11i says "Convert it to JPEG first". No new dependency |

## 11d vs 12k: the notice's words

11d's lock screen says:

- **Title:** "Your page is read"
- **Body:** "7 things from “OS lecture 3”. 2 need a quick look."

12h (Chrome) and 12k ("Every notification · title, body, actions, sound") say:

- **Title:** "Your page is read — 7 things"
- **Body:** "From “OS lecture 3”. 2 need a quick look."

Same words, in a different order. Both were drawn in the same design session (commit 5d30e474). **I kept 12k's
words.** Three reasons:

- 12k is the notification system's copy table, and 12h draws the same words.
- tray-notices pins them with tests.
- The copy lives in `notifications/` and `supabase/functions/notify/`, which my brief says not to edit.

**For Kai:** if you want 11d's order instead, it's two strings in `supabase/functions/notify/copy.ts`
`paperReadyNotice` plus its test.

The rest of 11d was already built in v1: the scanning page, "Page 2 of 3 · about 20 seconds", the ticking
thumbnails, "Leave it reading", and the Inbox's "ready to review" row.

**Not built:** 11d's Inbox badge going 12 → 13 for a ready page. The badge counts `inbox_items` only, in
`components/AppLayout.tsx`, which isn't mine. Counting ready captures there would also pull
`paper/api.ts` into the first-load bundle. It's a small follow-up if Kai wants it.

## What was built

### Chip editing (11e–11h, 11f)

**The chips, as 11e draws them.** Assignment 2 reads `Task · Thu 8 Oct · 23:59 · OS · P1`, and the heading
line reads `Note · OS · page title`. Each chip opens the picker the Inbox triage card already uses for the same
field, so nothing new was built:

| Chip | Opens |
|---|---|
| **date** (task, event) | `ScheduleMenu`, the kit date picker: quick picks, the calendar, Set time. A sheet on the phone, a popover on desktop. An untimed date on an Event still means all-day |
| **project** | `MovePicker`: project, area, domain or none. The current place is ticked. A line moved to an area writes `area_id` |
| **priority** (task) | The task menu's levels, `P3 · Medium` … `P1 · Critical`, in their colours. An ActionSheet on the phone, a ContextMenu on desktop. The chip reads P1–P3 like TaskRow and the task sheet |
| **type** | 11f's popover: dot · Task / Event / Note / Journal · mono hint. The hints now match 11f: "to do", "on the calendar", "to Inbox", "to today’s entry" (they were "to the Inbox", "today's journal") |

**Other details:**

- **page title:** a plain label, not a button, on the page-0 note whose text starts with the capture's title.
- **⋯ menu:** it now also offers Add a date… / Add a project… / Add a priority…. That's how a line with no
  date, project or priority gets one, since 11e draws no empty chips. It also offers Select.
- **Chip hit area:** chips are 28 px tall, but each tap area is 48 px, the way the type chip already worked.
- **"Editing 1 line":** 11f's banner shows while a line's text is open.

**Writes.** "Add all" writes everything edited. `planWrites` now carries `areaId` and `priority`, and
`createTask` gets them. Notes and the journal entry are unchanged.

**Priority from the page (`capture-image`, 11e's P1).** 11e draws P1 on a line, so the read now asks for it.
`read.ts` gets one prompt rule, the `priority` field (1–3 or null), and its normalising.

- **The rule:** set only when the page marks the line: `!!!` / "urgent" / "asap" / a star or box → 1,
  `!!` / "important" → 2, a single `!` → 3. The mark stays out of the text.
- **Older reads:** lines from before this have no field, and their chip simply doesn't show.
- **Deploy:** **[KAI] `npx supabase functions deploy capture-image`**. It rides with the deploys notebook-page
  and tray-notices already need. Until then there's no P1 from the page, but the chip can still be set by hand.

### Page reorder (11c)

- **Gestures:** hold a thumbnail for 400 ms (touch, the kit's long press with its haptic) or drag it with the
  mouse (6 px threshold), then drop it on another page's place. ⌥← / ⌥→ move the focused page.
- **What it uses:** `@dnd-kit/core`, which is already installed and already used by Today and the Planning
  board. No sortable package was added.
- **Looks:** the lifted page gets the popover shadow, and the place it would take is dashed.
- **Strip label:** "hold to reorder" as drawn, or "drag to reorder" on desktop.
- **Which page shows:** the page on screen stays on screen (`movePage`, tested). The order is the read order,
  so it's the upload order `<n>.jpg` too.
- **Guards:**
  - The images can't be dragged natively. A native image drag carries "Files" and would light the drop overlay.
  - There's no callout, text selection or context menu on the hold.
- **Night fix (small):** the thumbnail's page number now keeps day ink (`data-theme="day"`). The photo keeps
  its colours at night (11n), and the number was light-on-light before.

### Long-press select

The selection grammar is the one task rows and the Inbox use, through `SwipeRow`'s
`onLongPress` / `selecting` / `onSelectTap` and the kit `SelectCircle`.

- **Entering it:**
  - Hold a line.
  - Desktop: ⌃/⌘-click.
  - ⋯ → Select.
- **While selecting:**
  - Taps add or remove lines.
  - Swipes are off.
  - The ⋯ hides.
  - Selected rows get the `--select-bg` wash.
- **The banner** becomes MK Selection's app bar: ✕ · "N selected" · Select all. It sticks to the top of the
  sheet while the list scrolls.
- **The footer** becomes the selection's actions: **Type · Date · Project · Drop**, icon over label like the
  phone bulk bar.
  - The frames draw no results bulk bar, so these are the line's own pickers applied to every selected line.
  - Drop is one "N lines dropped" toast with one Undo.
  - Each action ends the selection.
  - Esc (and Android Back) clears it first.
- **Why it isn't `BulkBar`:**
  - BulkBar's actions are task writes (Done, Tomorrow), which don't fit lines that aren't written yet.
  - Its fixed bars would sit under the results sheet / panel.
  - So, like `InboxBulkBar`, it's a small local sibling, inside the sheet. The tab bar isn't under a sheet to
    be replaced.

### HEIC

The decode-to-JPEG step already existed: `preparePage` = `createImageBitmap` → canvas → JPEG. Safari decodes
HEIC there, so on Safari an iPhone photo just works. Chromium can't decode it (Chrome, Edge, the Windows
Tauri shell, Android Chrome), and no dependency was added. What changed:

- **`isHeic`** (pure, tested) matches by type, or by the `.heic` / `.heif` name when the browser gives no type.
  Chromium on Windows gives none.
- **`imageFiles` keeps HEIC files.** Before this, a dropped or picked `.heic` with no type was silently
  ignored.
- **The picker's `accept`** adds `.heic,.heif`, because Windows pickers hide them under `image/*`. Capacitor
  maps extensions to MIME types.
- **When the quick look can't draw a page** (`<img onError>`):
  - **The only page:** the designed 11i state, with a photo glyph (there's no picture to blur), the same
    title and actions, and the line "It’s an iPhone photo (HEIC), and this browser can’t open those.
    Convert it to JPEG first, then pick it again." A Notebook page's ticks target is kept for the retake.
  - **One of several:** it leaves the look with a toast ("…convert it to JPEG first"), and the other pages
    stay.
- **Drop overlay:** still says "JPG · PNG · WEBP", not 11m's "JPG · PNG · HEIC · PDF". HEIC works only in
  Safari, and the overlay is desktop, where Chrome/Edge can't decode it. PDF isn't supported.
- **To read HEIC everywhere** we'd need a decoder library (libheif-js / heic2any, ≈1 MB wasm). That's not
  added; it's Kai's call.

## Verification

| Check | Result |
|---|---|
| `npx vitest run` | **141 files / 1811 tests passed** in each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo (PowerShell `$env:TZ`, offsets printed −180 / 0 / 420 / −540). Also green plain, with no env vars |
| `npm run lint` | exit 0, 0 errors, no warnings in `features/paper` |
| `npx tsc -b` | clean |
| `npm run build` | green |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | **0 NEW in `src/features/paper/`**. The new CSS uses tokens only (`--fs-*`, `--sp-*`, `--radius-sharp`, `--select-bg`, `--shadow-popover`, `--pressed-overlay`). The run's other NEW hits are in people/projects/today/trash, from the base, not this branch |

**New tests:**

- **`paperMath.test.ts` (+7):**
  - `editLines` (bulk edit, no mutation) and `toggleKey`;
  - `placeEdit` for all four places;
  - edited priority / area / picked dates reaching `planWrites` (an untimed picked date → an all-day event on
    that day, a timed one → an hour);
  - `movePage` (the shown page follows, edges, off-strip);
  - `isHeic` (type, name, no-type, look-alikes);
  - `imageFiles` keeping a typeless `.heic`.
- **`read.test.ts` (+1):** the priority prompt rule and its normalising.

### Browser checks, mock backend

The dev server ran from this worktree: `npx vite --port 5257 --strictPort --mode mock`, with
`app/.env.mock.local` copied from the main checkout, at http://localhost:5257. It's stopped now.

**New harness `docs/log/assets/paper-gaps/verify.mjs`: 80/80** (`verify-results.json`). It copies
paper-capture's mock and page drawing, and one line gains `priority: 1`. It covers:

- **11c, phone (day + night):**
  - "3 pages · page 2 / hold to reorder";
  - hold page 3 → it lifts;
  - drop on page 1 → "page 3" shown;
  - read in the new order (upload sizes prove the lecture is now 2nd);
  - no horizontal scroll, no text under 12 px, no page errors.
- **11c, desktop:** "drag to reorder", a mouse drag 1 → 3, then ⌥← → read as [second, lecture, third]; a plain
  click still picks a page.
- **11e (day + night):**
  - the chips exactly `Task Thu 8 Oct · 23:59 OS P1`;
  - `Note OS page title`;
  - every chip but "page title" is a button.
- **11f:**
  - the type menu's four hints;
  - Quiz → Event, keeping Sun 11 Oct;
  - "Editing 1 line" while the text is open, then back.
- **Chips, phone:**
  - date → Tomorrow ("Mon 5 Oct");
  - project → Study;
  - priority P1 → P2;
  - ⋯ → Add a priority… → P1 on a line that had none.
- **Selection, phone (day + night):**
  - hold → "1 selected" + 7 circles;
  - a tap → "2 selected" + Type · Date · Project · Drop;
  - bulk Type → Note;
  - bulk Drop → "2 lines dropped" → Undo → 7 again;
  - Select all → 7;
  - ✕ clears it.
- **Add all writes what was edited:**
  - Assignment 2 P2, due 5 Oct (Cairo), OS;
  - Read ch. 4 in Study;
  - Buy blue pens P1;
  - the Quiz an all-day event on 11 Oct;
  - 3 notes;
  - the toast "Added 3 tasks · 1 event · 3 notes".
- **Desktop (day + night):**
  - ⌃-click ×2 → "2 selected";
  - bulk Project → Study on both;
  - Esc ends the selection, not the panel;
  - priority → P3;
  - date → Next week;
  - Add all writes them.
- **HEIC, phone (day + night):**
  - a real `ftypheic` file Chrome can't draw → 11i with "Convert it to JPEG first";
  - Pick another photo → gallery → quick look;
  - a HEIC added beside a JPEG → toast, the JPEG kept.
- **HEIC, desktop:** a dropped `.heic` with **no type** → 11i (before this it was ignored).

**Side-by-sides** (the drawing | this build) are `side-11c.png`, `side-11e.png`, `side-11f.png`, `side-11i.png`
and `side-11m.png`. The drawing frames are rendered by `design-frames.mjs` into `design-11*.png`. The
screenshots are 390×844 (touch) and 1280×800, day and night.

### Regression harnesses (same server)

- **`paper-capture/verify.mjs`: 122/122.**
- **`notebook-page/verify.mjs`: 83/83 only with one selector scoped, and it fails as committed.** The cause is
  in the base, not this branch:
  - **The failure:** n9 clicks `getByRole('button', { name: 'Close the day' })`, which now matches two buttons
    and stops the run with a strict-mode violation.
  - **Where the second button comes from:** the Rituals step `.td-rit-step` that fix-today (Today 2a, d4e968f6)
    added to the desktop Today page. This branch doesn't touch `today/` or `rituals/`.
  - **The scoped run:** a scratch copy using `getByLabel('Shut down').getByRole(…)` passed 83/83, including n10,
    the 11l ticks loop through this branch's results.
  - **Not edited:** I didn't change the notebook session's harness. **For the conductor:** n9 needs that
    one-line selector fix.

## Not verified

- **Safari decoding a real HEIC.** There's no WebKit here. The claim rests on Safari's `createImageBitmap` and
  `<img>` supporting HEIC, plus iOS's picker usually handing over JPEG anyway.
- **Real devices:**
  - the Android shell (Capacitor's file chooser with `.heic,.heif` in `accept`);
  - touch drag on a real phone: the harness drives CDP touch events.
- **The live model:** whether Groq's model actually reports `priority` well on real pages. The harness answers
  `capture-image` itself.
- **The edge function:** `capture-image/index.ts` was not type-checked with Deno (Deno isn't installed).
  `read.ts` is checked through the app's tsc and vitest, and `index.ts` doesn't change.

## Still unbuilt in Paper capture (out of this brief, for the list)

- **11e "1 drawing skipped (CPU → ready → run) · Add as image":** this needs the read to report drawings, and
  somewhere to keep an image crop.
- **11m's desktop keys "⏎ Add all · ⌫ drop line · T change type":** v1 skipped them too.
- **11d's Inbox badge counting a ready page:** see above.

## Files written (all inside `D:\Coding\kais-flow\.claude\worktrees\paper-gaps`)

**Code (commit aebe0146):**

- `app/src/features/paper/PaperFlow.tsx`
- `app/src/features/paper/paperMath.ts`
- `app/src/features/paper/paperMath.test.ts`
- `app/src/features/paper/image.ts`
- `app/src/features/paper/paperStore.ts`
- `app/src/features/paper/api.ts` (one line: `createTask` gets `areaId` and `priority`)
- `app/src/features/paper/paper.css`
- `app/src/features/paper/read.test.ts`
- `supabase/functions/capture-image/read.ts`

**Evidence and docs (second commit):**

- `docs/log/assets/paper-gaps/verify.mjs`, `design-frames.mjs`, `verify-results.json`, and the
  `*.png` screenshots + side-by-sides
- this file
- one line in `docs/log/INDEX.md`

**Also:**

- `app/.env.mock.local` was copied in (gitignored).
- Scratch scripts and runs went to the session scratchpad.
- Nothing outside the worktree was edited. `inbox/`, `notebook/` and `notifications/` were not touched.
