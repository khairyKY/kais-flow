# Motion build · lane A2 (pages): handoff (2026-10-28)

Branch `claude/motion-pages` (from `claude/kai-bugs-1012`, with `origin/claude/motion-lists` merged at 55d91d20). Not merged, not released.

- **Brief:** `D:\Coding\_claude-cloud\kais-flow-motion-build-brief-2026-10-28.md`
- **Spec:** the Fixed panes in `design-export/Motion fixes.html` (branch claude/motion-looks)
- **Gap report:** `kais-flow-motion-gaps-2026-10-26.md`

## The Effects rule as applied
- **Decorative motion plays only with Effects on.** That covers blooms, sprouts, ink, the veil, twinkles, breathing, slides and counter rises. It is gated with `useMotionEnabled()`, or with `.motion-on`, which is now on `<html>` (A1).
- **Functional motion always plays.** That covers fades of swapped content, the tally bar, Collapse and row exits.
- **Under OS reduced motion,** everything collapses to a cut or a cross-fade, through the global rule in `tokens/motion.css` and `reducedMotionNow()` / `scrollBehavior()` from A1.
- **No colours changed.** The only new literals are the D10 vignette and the firefly fallback from the spec, both marked `ds-ok`. The Focus dusk veil reuses Focus's own gradient. StreakTrellis's raw `rgba(42,36,32,.3)` is now the `--scrim` token.
- **No new dependencies.**
- **No tap waits.** Writes happen on the tap. Only the 150 ms content fade before a ritual's finish screen and the existing `animateRowRemoval` exits hold the visual swap.

## Items

New shared pieces:
- `components/PageMotion.tsx`: `StageImg` (a growth-stage cross-fade with an optional bloom), `Num` (a counter that rises when it changes, never on first render) and `shakeNo` (the soft no outside the shell).
- `components/pageMotion.css`

| ID | Status | What / why | Files |
|---|---|---|---|
| R1 | built | The routine check is the kit `Checkbox` with bloom off. A live tick plays boxFill → checkPop, the strike grows and the row dips (TaskRow.css keyframes). A row that loads done stays struck with no replay. | routines/RoutinesPage.tsx |
| R2 | built | The garden plant cross-fades plus one Effects 2e bloom when it crosses a stage. Streak, best-streak and caption counters rise when they change. The last routine of the day gives one "all tended" bloom behind the header vine. | RoutinesPage.tsx, PageMotion.tsx |
| R13 (Routines) | built | Routine rows get the capped entry stagger plus `kf-lift`. | RoutinesPage.tsx |
| R13 (Weekly Review / Journal / Settings / Library) | skipped | Not in A2's list beyond Routines. Journal and Settings belong to other lanes. | — |
| T12 (Routines, rituals, Focus) | built | The Routines tally bar eases with scaleX over 300 ms. The ritual workload line and "Sweep · N of M left" rise when they change. The suggested-times blocks slide to new times. The Focus round dots ease their fill. | RoutinesPage.tsx, RitualChrome.tsx, EveningRitual.tsx, MorningRitual.tsx, rituals.css, FocusPage.tsx |
| T8 (Routines steps) | built | The routine's steps fold now uses A1's `Collapse`. | RoutinesPage.tsx |
| O1 part · StreakTrellis | built (entrance only) | Desktop gets the shared overlay entrance on the `--scrim` token. The exit is skipped per the brief (O1). | routines/StreakTrellis.tsx |
| R3 | built | At round end the ring finishes its sweep and a 600 ms gold bloom plays, then the break view cross-fades in (300 ms, or 200 ms with Effects off). Paused mid-round, the ring dims to 0.55 and, with Effects on, breathes over 3.6 s. The label reads "Paused". | focus/FocusPage.tsx, FocusPage.css |
| R4 | built | While the timer runs, the ring has `stroke-dashoffset 1s linear` (Effects on). | FocusPage.tsx |
| R5 | built | The garden scene fades in over 300 ms, and "Stay a while" fades it out first. Garden and strip plants cross-fade plus bloom on a stage change (`StageImg`). | FocusPage.tsx, FocusPage.css |
| R6 | built | Chat opens at the bottom and pins on send. With Effects on, a long jump first goes to one screen above the end, then glides. It follows the stream only while you're at the bottom; otherwise a "↓ New" pill appears. It uses A1's `scrollBehavior()`. | chat/ChatPanel.tsx, chat.css |
| R7 | built (strike skipped) | Thinking shows three dots that twinkle 200 ms apart (Effects on). A plan card's state change cross-fades its contents over 200 ms. The growing "undone" strike is not built: it would need a per-line pseudo or a background-size animation, which ds-check flags, and the cross-fade already carries it. | ChatPanel.tsx, chat.css |
| T11 (chat) | built | Bubbles that arrive while the drawer is open get `.kf-row-in`. A reopened history does not replay it. | ChatPanel.tsx |
| R8 | built | The ritual's content fades out over 150 ms (`RitualSheet leaving`), then the finish screen plays its beat: the clover rises from its base (`--dur-bloom`), the title soaks in (ink, 480 ms), and the chips stagger 60 ms apart. Effects off gives a 200 ms fade. Applies to both "The day has a shape." and "The garden's closed." (`FinishScreen`). | rituals/RitualChrome.tsx, MorningRitual.tsx, EveningRitual.tsx, rituals.css |
| D10 | built | On the evening close, after the beat (700 ms), Focus's dusk wash settles over 1.2 s, with the 70 px vignette and a firefly, then breathes over 8 s. Effects on only. | RitualChrome.tsx, pageMotion.css, rituals.css |
| T6 (rituals) | built | In Plan my day, a carry-over **Drop** and a ritual inbox row's **File** / **Dismiss** leave through `animateRowRemoval`. A carry-over choice (Today, Tomorrow or Someday) keeps the row listed, so it gets no exit. | MorningRitual.tsx |
| T8 (ritual sections) | built | `FoldSection`: a section that empties (Carry-over, Inbox, Suggested times, Sweep) folds shut with A1's `Collapse` while its quiet line folds open. | RitualChrome.tsx, MorningRitual.tsx, EveningRitual.tsx, rituals.css |
| R9 | built | Flourish dots are 0.5 s apart, so the last one lands with the 2.2 s line. Phones get it too. It plays once per week (`kf_week_flourish`); a revisit shows it already drawn. The fern cross-fades as it unfurls and blooms once when the week closes. "Week closed ✿" fades in. | rituals/WeeklyReviewPage.tsx |
| T8 (Weekly Review) | built | A swept domain's re-open and "The season so far" use `Collapse`. | WeeklyReviewPage.tsx |
| R10 | built | The Projects wisteria swaps stage with `StageImg`: a 400 ms cross-fade, rising 0.92 → 1 from its base. The existing Effects 2e bloom is kept. | projects/ProjectDetailPage.tsx |
| O10 (Import) | built | Each Import step is a keyed card that fades in over 160 ms. | import/ImportPage.tsx |
| O10 (Notebook) | built | Switching the Today/Tomorrow day slides the page the way you went, 24 px over 220 ms (Effects on), or fades (Effects off). The first paint never slides. | notebook/NotebookPage.tsx, notebook.css |
| O10 (Library phone) | built, approximated | The list ↔ reader swap uses the stack's phone direction and curve (32 px, `--ease-stack`, 300 ms), and only after a switch. It does not go through the real stack, which would mean changing App.tsx's pathname-based `stackMove`. That is shared shell code; add it if Kai wants the full 3a ride. | library/LibraryPage.tsx, pageMotion.css |
| R11 | built | The Tour's spotlight glides from the last note's box over 300 ms (ease-standard). It holds there until the next anchor is found, so the dim never blinks. The current dot widens into its pill, and the closing bloom rises (Effects on). | tour/TourHost.tsx, tour.css |
| R12 (auth) | built | A refused sign-in shakes the password box with a soft no (Effects on, WAAPI, since the page is outside the shell). The error card fades in over 160 ms. | auth/SignInPage.tsx, AuthLayout.tsx, PageMotion.tsx |
| R12 (onboarding) | built (seed plant skipped) | "Start" with things sets `html[data-planted]` for 3 s. Today's Top 3 rows rise in at 160, 280 and 400 ms and the goal blooms once, all through pure CSS on Today's existing `data-top3-slot` and `data-tour` hooks (TodayPage.tsx is A1's and is untouched). The Motion 5f seed plant at the onboarding step is not built: it would be new art or a new screen, outside a motion pass. | onboarding/OnboardingPage.tsx, pageMotion.css |

## Evidence
- **Gate** (`gate.ps1`, re-run after merging `origin/claude/kai-bugs-1012` at 95d07e78):
  - vitest 189 files / 2675 tests in each of Africa/Cairo, UTC, America/Los_Angeles and Asia/Tokyo
  - lint exit 0 (warnings only)
  - build exit 0
  - ds:check 0 new
  - `birthday_on` count in types.ts and settings.ts: 1/1
- **New harness:** `docs/log/assets/motion-pages/verify.mjs <out> http://localhost:5327` on the mock backend. Every item runs with Effects on, Effects off and OS reduced motion, using `getAnimations()`, computed styles and timed screenshots. 
  - The full run after the merge was 158/159. The one miss was a read-timing issue: a 70 ms sample can come after the 90 ms boxFill under load. The check now keys on checkPop, and section r re-run alone gives 33/33.
  - Sections f, c, w, v, o, t and a, re-run alone, are 21/21, 24/24, 23/23, 16/16, 21/21, 9/9 and 12/12.
  - The Effects-on frames and `results.json` are in `docs/log/assets/motion-pages/`.
- **Existing harnesses on these surfaces:** 
  - **Green:** rituals 210/210, ai-chat 77/77, resurface-chat 292/292, notebook-page 83/83, first-run 416/416.
  - **rituals needed a harness update.** 6m tapped File and then Dismiss on `.rt-inbox:first` 350 ms apart. The filed row is still sliding out at that point (T6), so the Dismiss tap hit a row that was being removed. A 300 ms wait was added after the File tap. It passes alone, 210/210.
  - **These four fail the same way on the base branch** (5f5d725e, served on :5338 from a throwaway worktree), so they are not regressions:
    - routines-2 44/45: its element screenshot of the static design export times out.
    - tour: Settings has no "Show me around again" button where it looks.
    - plan-replan and projects-fixes: `#settings-Calendar` and `#settings-Organize` are gone since the settings-build layout.

## Notes for the merge
- A1's helper commit flipped line endings; this branch keeps each file's base endings (some files are CRLF, some LF). Merge with `-X ignore-cr-at-eol`.
- `RitualChrome` `Section.label` is now `ReactNode`, so the sweep count can rise.
