---
date: 2026-10-13 08:42 UTC
session: phone-taps (builder)
type: handoff
related: 2026-10-13-0613-journal-hygiene-handoff.md (Notes: the footer's 18px links), 2026-10-13-0735-ds-fix-3-handoff.md ("Two things I noticed"), 2026-10-12-1919-ds-check-audit.md #26
supersedes: none
---

# Phone taps: handoff

Branch `claude/phone-taps`, from `origin/claude/kai-bugs-1012` @ 94eb2743 (v1.1.1). Pushed. **Not merged, no PR.**
Three small items. Nothing drawn changes: 58/58 views are 0 px and 0 computed styles different (below).

## Commits

| SHA | What |
|---|---|
| 88283504 | 1 · Journal phone tap areas (`.kf-hit-min`), plus the new checks in `journal-media/verify.mjs` |
| 03ce6774 | 2 · TaskRow's "In progress" uses `--acc-blossom-text`; `--kf-chip-tasks` removed from `index.css` |
| 58e4d8e2 | 3 · Nine per-page phone title sizes that never drew, removed |
| 17d61d73 | `ds-baseline.json` re-snapshot: 1407 → 1398 |
| (docs) | This handoff, the INDEX line, `assets/phone-taps/` |

## 1 · Journal phone tap areas

The phone card footer's text controls were drawn **and tapped** at 18px tall: ＋ New entry 93×18, 🎤 Talk 58×18, ＋ Photo 61×18, 12px apart. The plain `.kf-hit` ring (−12px all round) would not do: 18 + 24 = 42 tall, and each ring would reach 12px into a 12px gap, so neighbours would overlap.

New rule beside `.kf-hit` / `.kf-hit-corner` (`AppLayout.tsx`, coarse pointers only):
`.kf-hit.kf-hit-min::after { inset: min(0px, calc(50% - 22px)); }`
The area grows to 44px, centred, and no further. A side that is already 44 or more doesn't grow. For the footer, that means 13px above and below, inside the card's own space: there are 23px up to the photos or words, and 15px down to the card's edge. It never grows sideways.

Why 44 and not `--touch-min` (48): Cancel and Save need it too, and they are 6px apart. At 48 they would meet by 1.9px. At 44 they keep 1.8px between them.

**Every other control in `features/journal/` on a phone** (all measured at 360/390/430 with elementFromPoint; normal, error and editor states):

| Control | Drawn → tap area | Result |
|---|---|---|
| ‹ / › day, the date button, Journal/Notes/Quotes tabs, ↻ prompt, ＋ add a thought | 44+ | already fine |
| photo link 70×70, photo × (`kf-hit-corner`, 49×49), shelf rows (≥61 tall), both "Try again" (kit Button, 48) | 44+ | already fine |
| **Cancel / Save** under a new thought | 37×44 / 42×44 → **45×45 / 45×45** | **fixed** (`kf-hit-min`, phone only) |
| **＋ New entry / 🎤 Talk / ＋ Photo** | 18 tall → **94×45 / 59×45 / 62×45** | **fixed** |
| entry **Delete** (8.5px mono) | 34×13 → 59×38 (`kf-hit`), and that ring already reaches 8px into the textarea below | **not fixed: no room** |
| **mood chips** (Calm…Stretched) | 32 tall, 8px apart | **not fixed: no room** |
| **"Three small things" lines** | inputs 22.5 tall, one every 36.5px | **not fixed: no room** |

Why the last three can't reach 44 without overlapping a neighbour or moving something (a visual change, which is Kai's call):

- **Delete.** It has 4px of space below it before the textarea. Above it, it has the card's 16px padding (first entry), or 25px to the previous entry's photos or words (later entries). A later entry's Delete can own at most about 42px. The current `kf-hit` ring is 38px and already overlaps the textarea's top 8px. I left it alone; it is worth a look, because a tap near the top of an entry's text can delete it (Undo catches it).
- **Mood chips.** On one row, a 44px area fits. But the row wraps: at 360 always, since "Stretched" drops to a second row (the 360 tinted control shot shows it). At 390 it wraps as soon as one mood is picked, because the ✿ adds about 14px and the row needs 358.4 of 358. With wrapped rows 8px apart, two 44px areas can't both fit. Any area big enough would hand a tap 2–6px under "Calm" to "Stretched".
- **Small-things lines.** Three rows sit 36.5px apart, so the middle one can never own 44.

The fix for all three is spacing: about 12px between chip rows, about 11px of row padding on the lines, and about 16px below the Delete row. That needs Kai's eyes.

## 2 · `--kf-chip-tasks` → `--acc-blossom-text`

- `TaskRow.tsx:327` "In progress" went from `var(--kf-chip-tasks, #8A4A58)` to `var(--acc-blossom-text)`.
- Both resolve to the same colours:
  - Old by day: the #8A4A58 fallback. Old at night: `index.css`'s #E9BFC5.
  - Token: `colors.css:78` #8A4A58 and `colors.dark.css:108` #E9BFC5.
- Measured in the harness: the label's computed colour is `rgb(138, 74, 88)` by day and `rgb(233, 191, 197)` at night, before and after, desktop and phone.
- The only `data-theme="day"` island inside a night page is the Notebook paper, and it has no TaskRow. Nothing else read `--kf-chip-tasks` (`git grep`: only the baseline and old log entries), so its definition and the stale "there is no --acc-blossom-text" note are gone from `index.css`.

## 3 · Dead phone title sizes

`typography.css`: `@media (max-width: 767px) { .app-main-content h1 { font-size: 26px !important } }`. An `!important` rule beats any non-important declaration, inline or CSS, whatever its specificity. So a page's phone size is dead whenever its h1 renders inside `.app-main-content` on a phone. A size counted as dead only when it is phone-only:
- a `useIsMobile()` branch (`(max-width: 767px)`, the same query as the rule);
- the phone arm of a ternary;
- a rule in a phone media query;
- or a component that only renders on a phone.

| Removed | Value | Why dead |
|---|---|---|
| Activity, People, Projects h1 | 24 | kit `useIsMobile` phone branches |
| Journal h1 | 26 | phone branch |
| Weekly review h1 | `isMobile ? 24 : 40` → `40` | phone arm |
| Routines h1 | `isMobile ? 26 : 40` → `40` | phone arm |
| `guide.css` `.gd-h1` / `.gd-h1.is-article` | 26px / 32px | `@media (max-width: 767px)` |
| `settings.css` `.st-phone-title h1` | 26px | `MobileSettings` only |
| `today.css` `.tp-bar h1.tp-bar-title` | `var(--fs-page-title)` | `PhoneBar` only; its scrolled variant is `18px !important` and also wins |

Kept on purpose:
- **New routine** 22 (`isMobile ? 22 : 26`) draws: its phone form is a BottomSheet portalled to `<body>`, outside the rule.
- **Library** 20: Library's own `useIsMobile` is also true on a desktop page narrower than 880px, so the value draws there.
- Shared-code sizes (Focus 38, Trash 38, Person 34, …) are desktop sizes.

`typography.css`'s comment now says a page's h1 carries its desktop size only.

Evidence: every phone title computes **26px before and after** (Activity, Journal, People, Projects, Weekly review, Routines, Guide, Guide article, Settings, Today's bar), and every desktop title is unchanged.

Not touched:
- `lineHeight` on the same phone h1s is just as dead (the rule also sets `line-height: 1.08 !important`). This item was sizes only.
- `phoneCalendar.css` `.pc-h1 { font: inherit }`: the shorthand's size is dead, but its family and weight are live, so the size can't be dropped without splitting the shorthand.

## Proof: 0 px different

`docs/log/assets/phone-taps/verify.mjs` is ds-fix-3's harness pointed at these pages.
- **Setup.** The real app, `--mode mock`, a frozen clock, images hidden, pointer parked. The same data plus one in-progress task, so "In progress" draws.
- **Views.** 58 in all, day and night:
  - journal at phone 360/390/430 and desktop 1280×800;
  - the thought editor open at 360/390/430;
  - Tasks (Today + All), Activity, People, Projects, Weekly review, Routines, Guide, a Guide article, Settings and Today, each at 1280×800 and 390×844.
- **Checks.** A PNG pixel diff plus every element's computed type, colour and size. The style dump leaves out `kf-hit*` class names. Adding the class is the point, and the PNG and the styles show what it draws.

| Comparison | Result |
|---|---|
| BEFORE vs BEFORE (two runs at once, untouched tree) | **58/58 identical**, 0 px, 0 styles (`diff-before-vs-before.txt`) |
| BEFORE vs AFTER (items 1–3) | **58/58 identical**, 0 px, 0 styles (`diff-before-vs-after.txt`) |
| Control: the tap area tinted red for one run, then restored byte-for-byte | 12/12 phone views FAIL (9328 px footer, 13373 with Cancel/Save); both desktop views stay identical, since a fine pointer gets no area (`negative-control.txt`, `control-*.png`) |

**Hit-area checks**, added to `journal-media/verify.mjs`. At 360/390/430, every px around the controls goes through elementFromPoint. The quote card's −0.4° turn is undone while measuring, because a turned box samples stair-stepped. Each control gets 4 checks:
- still drawn small;
- a solid ≥44×44 area;
- no two areas meet;
- no px of a nearby control's drawn box (photos, ×, textarea, chips, 21–24 controls) answers to one of them.

With the fix: **120/120** (96 existing + 24 new). Before the fix (HEAD's `AppLayout.tsx` + `JournalPage.tsx` for one run, then restored): **114/120**. The 6 "≥44" checks fail: footer 94×19 / 59×19 / 62×19, Cancel 39×45, Save 43×45 (notched).

## Gates

| Gate | Result |
|---|---|
| `npx vitest run` | 150 files, **1987 passed** |
| `npm run lint` | exit 0, **0 errors** (21 warnings, all pre-existing; ProjectsPage:59 is on a line not touched) |
| `npm run build` | OK |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | **0 new** after the re-snapshot. Before it: 11 fixed and 2 "new". The 2 are re-keyed, not new: Weekly review's and Routines' h1 keep the desktop 40, but their line text changed and the baseline is keyed by line. Baseline 1407 → **1398**; its diff touches only those lines. |
| Harnesses vs http://localhost:5269 (mock, this worktree, routes warmed) | journal-media **120/120**, fix-tasks **70/70**, today-shell **88/88** |
| Line endings | Kept. CRLF files (AppLayout, JournalPage, Activity, People, Projects, Weekly review) are still all-CRLF; LF files are still LF. Edits were byte-level replacements (no `sed -i`). |
| Dev server | Stopped (port 5269 free) |

## Not verified

- Real fingers on real phones. Everything here is Chrome's touch emulation (`pointer: coarse`) and elementFromPoint.
- Today's scrolled phone bar wasn't in the pixel set. The removed declaration there is non-important under two `!important` rules, so this rests on the cascade rule alone.
- `$env:TZ` ×4: not run (no date logic touched); the default-zone run is green.

## Files written

- `app/src/components/AppLayout.tsx`: the `.kf-hit-min` rule.
- `app/src/features/journal/JournalPage.tsx`: the footer, Cancel/Save, and the phone h1.
- `app/src/features/tasks/TaskRow.tsx`, `app/src/index.css`.
- `app/src/features/{activity/ActivityPage, people/PeoplePage, projects/ProjectsPage, rituals/WeeklyReviewPage, routines/RoutinesPage}.tsx`.
- `app/src/features/{guide/guide, settings/settings, today/today}.css`, `app/src/styles/tokens/typography.css` (comment).
- `app/scripts/ds-baseline.json`.
- `docs/log/assets/journal-media/verify.mjs` (`measureTaps`, `tapChecks`; `open()` takes `quotes`).
- `docs/log/assets/phone-taps/`:
  - `verify.mjs`;
  - `diff-before-vs-before.txt`, `diff-before-vs-after.txt`;
  - `negative-control.txt`;
  - `journal-media-results.json`;
  - two `control-*.png` (the tap areas tinted, so you can see where a finger lands).
- This file, plus one line in `docs/log/INDEX.md`.
- Untracked, not committed: `app/.env.mock.local` (copied from the main checkout).
