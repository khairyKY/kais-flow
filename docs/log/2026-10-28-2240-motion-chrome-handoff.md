# 2026-10-28 22:40 · handoff · motion-chrome (lane C of the motion build)

Branch `claude/motion-chrome`, from `claude/kai-bugs-1012`, with `claude/motion-lists` (A1's shared helpers, up to 55d91d20) merged in.
Brief: `D:\Coding\_claude-cloud\kais-flow-motion-build-brief-2026-10-28.md`. Spec: `Motion fixes.html` on `claude/motion-looks`.
Gate rule followed: RM2 from A1's `lib/motion.ts`. Functional motion (enter, exit, settle, ≤200ms) always plays and is a cross-fade or a cut under reduced motion. Decorative motion needs `.motion-on` / `motionOnNow()`.

## Items

| ID | Built / skipped | What | Files |
|---|---|---|---|
| **O2** (Kai) | built | The voice capture sheet lives in `BottomSheet`. It rises in 300ms, follows the finger, closes on a swipe past 30% or a fling, and plays a 200ms exit. Every close (Cancel, done tick, mic denied, Discard, Save) goes through the exit. While a take is kept or in flight it can't be dismissed: a swipe follows the finger, then settles back. The dead 210/140ms keyframes are gone. The linen paper and 440 width are kept. The `open` prop is gone; the 7 callers now just mount it. | `VoiceCaptureSheet.tsx`, `BottomSheet.tsx`, `capture.css`, 7 one-token caller edits |
| **O3** (Kai) | built | The phone More sheet is a `BottomSheet` with a handle, drag, swipe-down and exit. A link navigates at once while the sheet plays its exit over the new page. | `MobileTabBar.tsx` |
| O11 · sheet content drag | built | A downward touch on a sheet's content at scroll-top drags the sheet, as on iOS. Native non-passive `touchmove`. It doesn't take the gesture when an inner scroller isn't at its top, when the move is sideways, or when a child already claimed it. | `BottomSheet.tsx` |
| O11 · DatePicker | built | A month change slides the grid in from its side, and date ⇄ time steps the same way (the calendar's kfCalNav values, 160ms; its own keyframes, since the calendar chunk may not be loaded). | `DatePicker.tsx`, `pickers.css` |
| **D15** (Kai: FAST) | built | Parasol header on the phone Today. Driven by `animation-timeline: scroll()`, so the title's scale IS the scroll position, with no timer or JS in between: 26 → 17px over the first 80px, the Workload line fades over 40px, and a paper feather fades in under the bar over 24px. Effects off / reduced motion: the old small-title swap. | `today.css` |
| K2 | built | ⌘K: the part that changes as you type eases its height (150ms, measured with a ResizeObserver), chips fade up (itemFadeIn 120ms), and the Jump selection transitions in 80ms. | `CommandBar.tsx` |
| O5 | built | Search uses ⌘K's recipe (`kf-scrim` + `kf-overlay-card`). `ResultGroup` is moved out of render, so rows stay mounted through typing and arrow keys. | `SearchOverlay.tsx` |
| K3 | built | Hold-to-talk: no transform transition while held, so the button sits exactly under the finger. It grows to 72 over 200ms. On release it springs home (`--ease-spring`, 320ms, WAAPI from where the finger let go). The pill, rail and hands-free bar slide in over 200ms. | `CaptureButton.tsx`, `capture.css` |
| O6 | built | Tab bar: the active pill is the indicator's `::before`. It expands from the centre (scaleX 0.4 → 1 plus a fade, 200ms emphasized-decel) and fades back when the tab turns off. | `MobileTabBar.tsx`, `kit.css` |
| O7 | built | Sidebar fold: labels fade out (120ms), then the width eases 242 → 64 (200ms). Opening reverses it: width first, then the labels fade in. A cut under reduced motion. | `AppLayout.tsx` |
| O8 | built | `Segmented` has a sliding thumb measured to the pressed option (200ms; re-measured on resize or wrap). Settings' lit search row fades out over 600ms. | `kit.tsx`, `kit.css`, `SettingsPage.tsx`, `settings.css` |
| O9 | built | Toasts keep their buttons until they unmount, so they no longer shrink mid-fade. A leaving toast folds its slot, so the other slides instead of jumping. The older toast's dim eases. On a phone, a sideways swipe past 60px flings it off (M3 snackbar), and vertical moves still scroll. | `ToastHost.tsx` |
| O12 | built | A theme change cross-fades the page as a root view transition (250ms). Decorative: Effects on, no reduced motion, and only where `startViewTransition` exists. This also covers Auto at sunset and a theme change synced from another device. | `lib/theme.ts`, `tokens/motion.css` |
| O13 | built | Dismissing the download bar folds it with A1's `Collapse` (200ms). | `DownloadBar.tsx` |
| D12 (Kai yes) | built | Seasonal drift: one particle layer behind the Today header (desktop `.td-head`, phone `.tp-bar`) with four skins by the real season. Spring has blossom petals, summer a buttercream shimmer, autumn amber leaves crossing, and winter thin hydrangea rain. Tokens only. It exists only with `.motion-on`. | `features/seasons/SeasonDrift.tsx`, `seasons.css`, 3 lines in `TodayPage.tsx` |
| D16 (Kai yes) | built, see note | The streak's vine is back beside the words in the name menu (the existing `/ds/assets/vine/sprouting.png`; no new art). It idles with cloverSway 7s and has two pollen motes (fireflyDrift + twinkle), `.motion-on` only. **Note:** Bottom B (2026-10-22) had made this block "words only". It is back because of the 2026-10-28 yes, and it is one block to remove if Kai prefers words. | `AppLayout.tsx` |
| W1 · tray | built | The tray document now sets the motion gate on `<html>` (so the kit Checkbox animates there). It follows Effects from the main window through `storage`. On window focus the flyout arrives with a 150ms fade and 6px rise. Buttons and menu rows ease their hover over 150ms; this adds a quiet `--paper-bone` hover on the outlined pills. The focus ring's share eases through `@property --pct`. Top 3 rows stay checked rather than leaving, so there's no row exit to add. | `tray/entry.tsx`, `TrayFlyout.tsx`, `tray.css` |
| BottomSheet travel gate | changed | The sheet's rise and drop count as functional (RM2), so they play with Effects off; reduced motion stays a cross-fade. New props: `dismissible` and `sheetProps` (label, data-*, style). | `BottomSheet.tsx` |
| O4 anchored popovers → kf-pop | **not built** | Not in any lane's list. It belongs with whoever owns Select / DatePicker / SnoozeMenu / ProjectPicker popovers. | — |
| O10 lateral swaps | **not built** | The parts not in a lane: the smart-list / Settings-category `routeKey` and the Library phone list ↔ reader. The Notebook day and Import steps are A2's. | — |
| O11 leftovers | **not built** | Not in the lane list: the ContextMenu submenu origin when it flips left, the BottomSheet rubber band on an upward drag, and the content → full detent jump. | — |
| O14 interactive back | **not built** | Not in any lane (P3 · L). | — |

## Evidence
- Gate (`gate.ps1`): vitest ×4 TZ 189 files / 2674 tests green, lint 0, build OK, ds:check 0 new (the spec'd non-transform transitions are marked `ds-ok` with their item ID). `birthday_on` grep 1/1.
- New harness `docs/log/assets/motion-chrome/verify.mjs <out> [base]` (sections `ONLY=o2,o3,k2,o5,k3,o6,o7,o8,o9,o12,o13,dp,d12,d16,w1,d15`): **163/163**. Each item is checked with Effects on and with Effects off and/or reduced motion, through `getAnimations()`, computed styles and in-page timed samples, plus the end state.
- Existing harnesses re-run on :5329: see the results below.

Existing harnesses re-run against this branch (:5329):

| Harness | Result |
|---|---|
| capture-type (voice sheet, hold-to-talk, ⌘K) | 100/100 |
| kit-sheets (BottomSheet, ActionSheet, toasts) | 117/117 |
| download-bar | 49/49 |
| pickers (DatePicker/TimePicker) | 122/122 |
| motion (stack, AppLayout) | 48/48 |
| gestures (rows, action sheet, toasts) | 100/100 |
| today-days (Today header, day picker) | 90/90 |
| motion-lists (A1) | 20/20 |
| bugs-1023 | 80/80 without d5. **d5 fails on the base too**: run alone against `claude/kai-bugs-1012`'s own server, it fails the same way. cal-clicks made a block click open details instead of the length menu, and the harness predates that. Calendar is lane B's surface, not this lane's. |

## Notes for the merge
- Line endings: Python on Windows had flipped a few files' EOL. They are restored to the base's per file, and there are no mixed-EOL files on the branch.
- `TodayPage.tsx` (A1's file) has only 3 added lines here: the import and two `<SeasonDrift />`. `AppLayout.tsx` has the O7 fold, the D16 vine and the CSS for both.
