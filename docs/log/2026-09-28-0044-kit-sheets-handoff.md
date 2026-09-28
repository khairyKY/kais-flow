---
date: 2026-09-28T00:44Z
session: kit-sheets builder (B)
type: handoff
related: design-export/DS-CHANGELOG.md §3 (Bottom sheet, Action sheet, Undo toast, Loading/Empty/Error/Offline); MK Bottom Sheet / Action Sheet / Undo Toast / States / Underlay
---

# Kit sheets handoff: bottom sheet, action sheet, undo-toast queue, states

Branch `claude/kit-sheets`, based on `origin/claude/ds-refresh` (4f03638). Not merged, not deployed. `lib/overlayStack.ts` untouched (read-only; `useEscapeStack` used as-is).

## What changed

- **`components/BottomSheet.tsx`** (rewritten, props backward compatible). Parchment, top radius `--sheet-radius`, `--shadow-sheet`. Handle 32×4 (`--ink-hairline`) inside a 120×48 `<button>` hit area (`touch-action: none`) that drags with pointer capture. Detents: `'content'` (default, the old behaviour: sized to content up to full), `'medium'` 60%, `'full'` 100% − 48; tapping the handle (or Enter/Space on it) toggles full and back; at full the header gains ✕. Release rules live in the pure `sheetRelease(dy, v, h)`: past 30% or a >0.5 px/ms fling closes, up 48px or an upward fling opens full, a 48px+ drag down from full drops to rest, otherwise it springs back. The scrim (`--scrim`) fades with the drag; tap = close. Enter is `sheetIn` 300ms emphasized-decel. Exit is new: a `transform` transition to `translateY(100%)` over 200ms emphasized-accel, starting from wherever the finger let go. Reduced motion cross-fades both ways, and a `.kf-bs-fade` `!important` rule keeps the fade at 300/200ms against the global 0.01ms rule. Keyboard: `visualViewport` gives the IME inset, and the fixed layer's `bottom` rides it, so detent percentages resize to the space above the keyboard. The focused field is `scrollIntoView({block:'nearest'})`'d, and the scrim still extends under the keyboard. Scroll lock is reference-counted on `.app-main-content` (overflowY hidden → restored), not `body`. The sheet portals to `document.body`, and `onClick`/`onPointerDown` stop at the portal root so a sheet rendered inside a row can't feed the row its taps. Focus moves into the dialog (`tabIndex=-1`, unless a field inside already has it) and returns on close. Drag re-renders don't re-run the caller's render prop (memoised on `children`). `useIsMobile` and `SheetRow` are unchanged. Deltas are divided by `uiZoom()`, so drags track the finger at the desktop 125% zoom.
  - **Closing never discards** (documented on `onClose`). Every close path (✕, scrim, Esc/Back, swipe, fling, render-prop `close`) first blurs the focused field inside the sheet, so its `onBlur` commit runs; the sheet owns no state. A scrim tap already blurred the field. Esc and the render-prop `close` don't move focus, and Safari doesn't focus a tapped button (the handle). Without the explicit blur, an un-committed title/notes edit in TaskEditorPage's phone sheet could unmount unsaved.
- **`components/ActionSheet.tsx`** (new): `ActionSheet({ title, meta?, items, onClose })`, items `{ label, icon?, hint?, destructive?, onSelect }[]`. Header Source Serif 20 + meta mono 12/0.06em. Rows are 52px buttons with a 24px icon slot (`--ink-muted`), label 15/20, and a mono 12 hint on the right. Pressed shows `--pressed-overlay`; focus-visible shows an inset `--focus` ring. Destructive rows are pulled out and rendered last, under a dashed rule, in `--acc-terra-ink`. A tap runs `onSelect`, then closes. Not wired into pages yet.
- **Undo toast queue**
  - **`lib/toastStore.ts`**: the store is just the queue. `push` no longer schedules its own 4s removal. New pure helpers: `visibleToasts(queue)` (first 2) and `lifeLeft(left, since, now)`, plus the constants `TOAST_MAX_VISIBLE=2` and `TOAST_LIFE_MS=6000`. The `Toast` shape and `push`/`dismiss` are unchanged; `lib/undo.ts` is untouched.
  - **`components/ToastHost.tsx`**: rewritten to MK Undo Toast. Inverted `--toast-bg`/`--toast-ink` 14/20, clamped to 2 lines (wraps, no nowrap), min-h 48, radius 3, `--shadow-toast`. Actions are 14/600 `--toast-action` in 48-tall buttons. The 2px life line is a `scaleX` sweep that pauses with the timer.
  - **Placement:** on a phone 12px from the edges, bottom `calc(var(--tabbar-h) + var(--tabbar-inset) + var(--toast-gap))`; desktop keeps bottom-centre at 16px.
  - **Queue:** at most two visible, oldest above at 0.92, the newest visible at the bottom, a third waits. Each card owns its 6s clock, which only runs while it is on screen and not hovered, touched (pointerenter/leave covers finger-down too) or focused.
  - **Motion:** in `toastIn` 200ms, out `toastOut` 200ms. Reduced motion cross-fades, and the life line becomes static.
  - **Stacking:** z-index 1100, so the Undo sits above a sheet's scrim.
  - **Removed:** the old corner flower and petal (not in the new spec).
- **`components/States.tsx`** (new): `Skeleton({ variant: 'rows'|'card', rows })` uses `--skeleton`/`--skeleton-hi`, radius 2, with `skeletonPulse` (the global reduced-motion rule makes it static), `role="status"`. `EmptyState({ image, line, action })` shows a species zero stage 120 wide (default `/ds/assets/hydrangea/zero.png`), one Inter 16 line in `--ink-muted`, and one kit `Button variant="secondary"`. `ErrorCard({ message, onRetry })` has a 1px `--line-control` border, radius 3, alert icon 20, text 14, and Retry 14/600 `--acc-terra-ink` in a 48 hit, `role="alert"`. `OfflineChip()` is h32, 1px `--sig-offline`, with offline icon 16 and "Offline — changes will sync".
- **Skeleton adoption:** each page gates on TanStack `isPending`, which means status `'pending'`, i.e. no data yet, so the skeleton never covers cached data. `isPending` already implies `data === undefined`, so there's no separate check.
  - `TodayPage.tsx` (CRLF kept): Top 3 showed `null` while pending. It now shows a card skeleton + 2 rows.
  - `TasksPage.tsx` (CRLF kept): the list shows a skeleton while pending, covering both the Done view and the "Nothing here" empty state.
  - `InboxPage.tsx` (CRLF kept): the Waiting tab shows a skeleton while pending, instead of the Inbox-zero card.
  - `CalendarPage.tsx`: the rail shows a 3-row skeleton while pending, instead of "Nothing here to block."
  - All edits went through a line-ending-preserving script; `git ls-files --eol` still reports `i/crlf w/crlf` for the three CRLF files.
- **`components/KitSheetsDemo.tsx`** (new) plus 2 lines in `KitReference.tsx`: the dev-only `/design-system` route gains sections for the Bottom sheet (Medium / Full / Content, with a draft field whose state lives in the page), the Action sheet (the spec's 9-item ⋯ menu), the Undo toast (push one / three / long) and States. The demo mounts its own `ToastHost`, because the route sits outside AppLayout. The production build drops it: no demo strings in `dist/`.
- **Tests:** `lib/toastStore.test.ts` has 4 tests: two visible and the third waits; a second action keeps the first Undo, and the waiting toast steps in when a slot frees; the store never expires a queued toast; pause/resume arithmetic. `components/BottomSheet.test.ts` has 3 tests on the release thresholds. Neither imports `lib/supabase`.

## Evidence

- Gate: `npx tsc -b` passes cleanly. `npx vitest run` (no `app/.env.local` in this worktree) passes 59 files / 776 tests. `npm run lint` finds 0 errors and 29 warnings; one of the warnings is new: `only-export-components` on the exported `sheetRelease`, in the same file that already exports `useIsMobile`. `npm run build` is green.
- Browser run: `docs/log/assets/kit-sheets/verify.mjs` (playwright-core driving local Chrome) passed **111/111** against `npm run dev -- --port 5202 --strictPort` with placeholder `VITE_SUPABASE_*` values. Per-check results are in `verify-results.json`. Viewports: 390×844 (touch, UI scale 1) and 1280×800 (desktop 125% zoom), each in day and night. Checks:
  - **Sheet heights:** medium = 60% (506 at 844); handle tap → full = 100% − 48 (796; 740 at 125% zoom); full shows ✕, and ✕ closes; a second tap returns to medium; the `'full'` detent opens at 100% − 48.
  - **Drag:** 15% springs back. A 42% drag moves the sheet (transform follows the finger, scrim opacity 0.58), and on release it closes. The draft typed before the swipe survives, and reopening shows it. A short fast flick closes. Scrim tap closes; Esc closes.
  - **Action sheet:** rows are 52 tall (65 at 125%), Delete is last in `--acc-terra-ink`, and Delete is reachable without scrolling. Selecting a row closes the sheet and pushes the toast.
  - **Toast queue:** 3 pushed → 2 visible, oldest above at opacity 0.92, the newest at the bottom. On the phone the toast is 12px from each edge. Hovering the bottom toast past 6s keeps it alive, while the older one leaves and the third steps in. A long message wraps to 2 lines. No page errors.
  - **Keyboard:** faking a 300px IME (`visualViewport.height` override + resize) puts the sheet bottom exactly 300px up, with the focused field visible above it.
  - **Scroll lock:** `.app-main-content` goes to `overflow-y: hidden` while open and is restored to `auto`; `body` is never touched.
  - **Reduced motion:** the sheet enters with `scrimIn` at 0.3s (a cross-fade), and the exit fades in place (opacity < 1, transform none).
- Screenshots in `docs/log/assets/kit-sheets/`: `{phone,desktop}-{day,night}-{sheet-medium,sheet-full,action-sheet,toasts,toast-long,states}.png`, `phone-day-sheet-drag.png` (mid-drag, 42%), `desktop-day-sheet-drag.png`, `phone-day-sheet-keyboard.png`.

## Deviations

- **Action sheet is content-sized up to full, not "≤ medium".** The spec's own ⋯ menu is 9 rows (~600px; MK Action Sheet draws it 640 tall). Capped at medium (506), Delete would sit below a scroll. So `'content'` sizes to content up to full for every sheet, and there is no separate "≤ medium" state.
- **Handle row is 24px + `handleGap`,** so un-titled legacy sheets (Snooze, Schedule, task detail) start their content ~8px lower than before.
- **Phone toast offset is 72px + safe area, not 88.** It is set with tokens, and 88 is what the mock shows with a 16px gesture inset. The current (pre-kit) tab bar is ~67–70px tall, so there is ~2–5px of air until the new 64px tab bar lands.

## Risks / not done

- The skeleton adoption on Today/Tasks/Inbox/Calendar was **not seen in a browser**. Those pages need a signed-in session, and I didn't use real credentials. It is verified by typecheck and review only; each edit is a single `isPending ?` branch.
- Android hardware Back is only as good as `overlayStack`: the sheet registers through `useEscapeStack` and has no `popstate` handling of its own. The real IME was only simulated through `visualViewport`; check on a device.
- `/design-system` itself overflows 390px by ~17px, from the pre-existing "Keycaps — every shortcut hint (J-17)" label. That makes Chrome's mobile emulation (`isMobile: true`) zoom the layout viewport out. The browser run used touch without `isMobile` to measure true 390 px. My demo sections fit.
- **Not done:**
  - Queued toasts no longer expire unless a `ToastHost` is mounted. That is by design: they wait for their slot. Only `ResetPage` pushes outside the shell, and it navigates into it.
  - Background failures don't get a Retry toast.
  - `ErrorCard` and `OfflineChip` are not adopted in pages. Pages still render their own empty states; only the skeletons were adopted.
  - The ActionSheet is not wired into pages (later builder).
  - No `docs/log/INDEX.md` line was added, to avoid append conflicts with the parallel builder. The conductor can add one.
