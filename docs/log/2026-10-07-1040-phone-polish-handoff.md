---
date: 2026-10-07T10:40+03:00
session: builder (phone-polish, Kai's phone review 2026-10-07)
type: handoff
related: docs/log/assets/phone-polish/ · design-export/Routines.dc.html #1b · MK Action Sheet · MK Capture · MK Undo Toast
---

# Phone polish: Routines, every More page at 360–430, the capture glyph, toasts over modals

Branch `claude/phone-polish`: cut from `origin/master`, then `origin/claude/wave-t` (v1.0.22) merged, then `origin/claude/wave-u` (v1.0.22 + calendar-rail) merged with no conflicts. Not merged anywhere else, not deployed.

Kai reviewed the phone UI as installed on his Android phone (390 CSS px). This wave is the feedback, not a ROADMAP phase. Other builders own Today, the calendar, the task menu / pickers and the sync strip; nothing of theirs was edited (see "For other owners").

## 1 · Routines (`features/routines/RoutinesPage.tsx`, `api.ts`)

- **Ritual cards.**
  - On a phone the two cards stack. Side by side, even with an icon-only pin, "CLOSE ITS LOOPS" can't fit at 430.
  - The pin is its icon alone, in a 48×48 target. It keeps `aria-label`, `title` and `aria-pressed`.
  - The title and subtitle stay on one line (ellipsis as a last resort).
  - Desktop keeps the labelled "📌 PINNED". Its cards can now shrink (`minWidth: 0`): at 1280 × 125% "PINNED" poked ~10px past the column. That was there before this wave.
- **Row ⋯ menu.** The bare 11px "archive" link is gone. Each row has a ⋯ (48px on a phone, 28px and always visible on desktop).
  - Phone: it opens the kit `ActionSheet` (title = routine, meta "Routine").
  - Desktop: it opens the `ContextMenu`.
  - Rows: **Streak trellis** (a big target for what the 8px day dots open) and **Archive**. There is no Edit, because no edit form exists for a routine.
  - Archive writes through the outbox (`active:false`) and toasts "Routine archived" with **Undo**. Undo uses the new `restoreRoutine`, which writes `active:true` and logs `routine.restored` (Activity reads it as "Brought back the routine …"). `archiveRoutine` had no undo before.
- **Rows on a phone.**
  - The name gets the full width. The clock, streak and last-7-days sit on a line under it. At 360 "Stretch / for / ten / minutes" wrapped a word per line.
  - The check is now a real `<button>` (`aria-pressed`) with a 48px hit; it was a 19px `<span>`.
  - "＋ New routine" is 48px tall.
- **Gutter.** On a phone the page's own 20px padding is gone, so the shell's 16px gutter is the page's, as on Today.

## 2 · The audit: every More page, 360 / 390 / 430, Day + Night

`verify.mjs` loads each page at each width and theme (18 pages × 3 × 2 = 108 loads) and measures:
- sideways scroll;
- text wrapping one word per line (per text node);
- the last content vs the tab bar's top, after scrolling to the end;
- overlapping text;
- page errors.

It also records the header and gutters and every sub-48 target (`audit-after.json`; the before run is `before/audit-before.json`). Shots are at 390 in Day and Night: `before/before-<page>-390-<theme>.png` and `after-<page>-390-<theme>.png`.

| Page | Issue (before) | Fix |
|---|---|---|
| Routines | ritual titles/subtitles a word per line; row names a word per line at 360; 11px "archive"; 19px check; 36px gutter | §1 |
| Projects | 34px gutter; "+" 44px | shell gutter; "+" 48 + aria-label; title is an h1 |
| Project detail | text at x=87 (shell 16 + card 36 + spine 34); "ALL / PROJECTS" wrapped and overlapped the meta; title squeezed to 4 lines beside TARGET; milestones "Audit / every / page"; "📌 / Update" | card padding 16 on a phone; BackLink never wraps (kit); the meta wraps under it; the title gets its own line with the target under it; milestone title shrinks, meta nowrap; toggle nowrap |
| Retainer detail | as project detail | as project detail |
| Area detail | as above, plus the two health cards side by side ("no / target / — / areas…") | as above; the cards stack on a phone |
| Perennials | — | fine |
| Tasks | — (the chip strip scrolls sideways by design) | fine |
| Inbox | "Scan / paper" at 360 | kit buttons keep one line (`kit.css`) |
| Review | verdict chips wrapped inside ("STILL / MOVING", "PARK / IT"); header squeezed | chips nowrap and wrap whole; ±12 halo; the header wraps |
| Journal | 36px gutter | shell gutter |
| People | 34px gutter; "+" was a 44px `<span>` | shell gutter; "+" is a 48px `<button>` with aria-label; h1 |
| Person detail | "PEOPLE" overlapped the meta; chips "LOG A / CALL"; fact "12 / March" | breadcrumb wraps; chips nowrap and wrap whole; fact rows wrap whole |
| Library | 49px text gutter | shell gutter; h1 |
| Herbarium | "The / Herbarium" and "← Back to / the garden" side by side; 50px gutter | the header stacks on a phone; shell gutter |
| Focus | controls ran off the right edge ("END EARLY…" clipped, Start at x=0); "esc / leaves / quietly", "ROUND / 1 / OF / 4…"; the garden strip and the last controls under the tab bar; caption overlapped "open the garden →" | on a phone the view grows with its content (no fixed height); rows wrap whole; 48px buttons; "esc leaves quietly" hidden (no Esc on a phone); the link moves up |
| Settings | "Calendar opens on" ran 7px past the card at 360 (sideways scroll) | own line, full-width segments (like Interface size); shell gutter; h1 |
| Activity | 34px gutter | shell gutter; h1 |
| Trash | 50–60px gutter; the title squeezed to "Old…" | shell gutter; the title shrinks before the meta (nowrap) |
| More sheet | rows ~40px; Search / Chat / Sign out ~20px | 48px rows and buttons |

The before audit also reported some things that weren't bugs, and the harness now handles them:
- Settings "overlaps" were inside closed `<details>`.
- Activity's "under the tab bar" was an empty decorative element.
- A long two-word title ("Monthly bookkeeping") wrapping at 360 is not a word-per-line bug.

**Still under 48 (not primary actions; left for a design call):**
- Settings' segmented controls are 36px tall (a kit `Seg` size), and its 34×20 switches.
- Project detail's colour dots (20px), milestone "edit" / "✕" spans, and the checklist's "Add" (29px).
- Person detail's "edit" / "✕".
- The Focus settings gear (now ±12 halo → 50).

## 3 · The capture button glyph (`features/capture/CaptureButton.tsx`)

- The centre glyph is now the kit's **plus**, byte-for-byte the desktop Capture button's. While a take records it shows the **mic**.
- Unchanged: hold-to-talk (hold → record → release sends to the voice sheet), the aria-label "Capture — tap to type, hold to talk", and the first-opens hint "Tap to type · hold to talk".
- The capture sheet sits on the bottom edge over the tab bar and rides the keyboard (visualViewport). The harness proves this for three cases: a fake IME, the IME going away, and a WebView resized for the IME (the Android shell's way), with no double gap.
- **Android gap.** The likely cause of the band under the sheet with the keyboard down is native, not CSS:
  - The shell pads the WebView clear of the gesture bar.
  - `MainActivity` paints that strip in the *page* colour, undimmed.
  - While any kit BottomSheet is up, `holdShellChrome` (`lib/platform.ts`, ref-counted) now paints the strips in the sheet's colour, and hands them back to the page when the last sheet closes.
  - **Needs a look on the phone with the next APK.** I couldn't run it on a device.

## 4 · Toasts over phone modals (coordinator's add, `components/ToastHost.tsx`, `features/paper/PaperFlow.tsx`)

**Problem.** Over any `aria-modal` a phone toast docked at the top. Over Paper capture's full-screen "A quick look" that covered ✕ and Rotate for 6s, and the one-time "Updated to …" toast swallowed Rotate taps.

**Fix.**
- Paper's screens mark their bottom bars `data-sheet-footer`. The toast docks 8px above the bar (Add page · Read).
- A full-screen modal with no footer gets the tab-bar dock, never its header.
- Sheets without a footer (the ⋯ action sheet) keep the top dock.
- Plan my day / Shut down / What's new are kit sheets with footers, so they already docked above their footers. That was re-proved for Plan.
- The other full-screen modals:
  - Focus is a page, not a modal.
  - Onboarding renders outside the shell, with no ToastHost.
  - The rituals' desktop panel is desktop-only.

## Tests and evidence

- vitest ×4 TZ (PowerShell): **108 files / 1304 tests** passed in Africa/Cairo, UTC, America/Los_Angeles and Asia/Kolkata, on the merged tree. New: `holdShellChrome` (platform.test), `routine.restored` (describe.test).
- `npm run lint` clean (warnings only, all pre-existing). `npm run build` OK.
- `docs/log/assets/phone-polish/verify.mjs` on the merged tree: **@@PP@@**. It covers the audit (540 checks), the More sheet, Routines (phone 360/390/430 + desktop), capture (glyph, hold, sheet, keyboard, Android strips) and toasts.
- Re-run on the merged tree:
  - capture-type: **@@CT@@**. One check's *name* changed, from "keeps the mic glyph" to the label check. It still checks the label; phone-polish proves the plus.
  - paper-capture: **@@PC@@**.
  - small-gaps: **@@SG@@**.
  - rituals: **@@RT@@**.
  - today-phone: **@@TP@@**.
  - projects-fixes: **@@PF@@**.
- `desktop-polish` fails 2 "updates" checks on this tree (update card copy: "v1.0.22 is out" vs the harness's v1.0.15 fixture). That card is What's new (wave-t) territory; nothing here touches it.

## For other owners (found, not edited)

- **Tasks / Today rows (TaskRow, tasks owner):** fine at 360–430 in this data.
- **Sync strip (AppLayout, other builder):** fine. The phone `.app-main-content` padding (20 top / 16 sides) is what every page now leans on.
- **Calendar:** not audited (its owner's).

## Kai decides

1. **The plus.** Is the plus right for the centre button at rest (mic only while recording)? It is what the brief asked for.
2. **Android strip under a sheet.** Painted the sheet's colour while it's up. Check on the next APK that the band is gone and that the status-bar strip (also parchment while a sheet is up) looks right.
3. **Routines ⋯.** It has Streak trellis + Archive. Want an **Edit routine** form? None exists yet.
4. **Project / area detail on a phone** keeps its 34px vine spine and card. Hide the spine for a flat 16px page?
5. **Settings' segmented controls** are 36px tall and its switches 34×20. Raise the kit to 48 on a phone?
