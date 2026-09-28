---
date: 2026-09-28T00:51Z
session: kit-core builder (A)
type: handoff
related: design-export/DS-CHANGELOG.md §3 (Button, Chip, Checkbox, Star, Tab bar, Capture button, Icons) · MK Tab Bar · MK Capture · DS Kit · Icons
---

# Kit core handoff: icons, kit atoms, phone tab bar, hold-to-talk capture

Branch `claude/kit-core`, cut from `origin/claude/ds-refresh` (tokens already landed there). Not merged, not deployed.

## What changed

- **Icons** — `app/src/components/icons/kf/kf-*.svg` (38 files, copied from `design-export/ds/icons/`), `icons/kf/index.ts` (`ICON_NAMES`, `IconName`, inner markup via `import.meta.glob(..., { query: '?raw', import: 'default', eager: true })`), `app/src/components/Icon.tsx` — `<Icon name="today" size={24} label? />`, inline SVG, `currentColor`, `aria-hidden` unless `label`.
- **`kit.tsx` + new `kit.css`** — the phone sizes and states live in CSS (a media query can't be inline); desktop keeps its Jul 2026 sizes.
  - Button: `--acc-terra-ink` fill / `--on-terra` label (all widths); phone h48 (min-height), pill, Inter 15/500, padding 22 / 18 / 14; new `loading` (16px ring spinner, presses blocked, `aria-busy`) and `selected` (secondary: sage wash + sage-text border/label + check 18, `aria-pressed`). Secondary outline `--line-control`.
  - Chip: tints are the `--block-*` tokens with the matching `-text` ink (overdue/terra ink → `--acc-terra-ink`, tasks → `--acc-blossom-text`); bordered = `--line-control`; phone h32, padding 0 12, mono 12. New tones `date` / `project` / `duration` / `priority` (capture parse chips, 16px glyph, no ✕), new `icon`, `selected` (1.5px inset ring + check 16), `loading`, `disabled`, `onClick` (renders a button with the touch hit).
  - Checkbox: SVG check at 2.2 in `--check-mark` (was the ✓ glyph); phone 22 × 22 radius 6 with a 48 hit whatever `size` says; new `subtask` (18 on phone) and `disabled`; pressed = 48 halo + box 0.9.
  - New `Star` (Top 3): 22 glyph in a 48 hit, `--star-empty` stroke / filled `--star-on`, `aria-pressed`.
  - All atoms: pressed = `--pressed-overlay` + `scale(--press-scale)` over `--dur-press`; focus-visible = `--focus-ring`; disabled 0.42. Every existing prop kept; callers' inline `style` still wins.
- **`MobileTabBar.tsx`** — 64 + `--tabbar-inset`, parchment + `--shadow-tabbar`; Today · Inbox · capture · Calendar · More with kf icons 24, labels Inter 12/16 (500 `--ink-faint` / 600 `--ink-body`), 56 × 32 indicator in `--block-sage` / `-hydrangea` / `-lavender` / `-buttercream`, badge `--badge-bg/--badge-ink` 1 · 12 · 99+, pressed overlay + 0.95, `replace` navigation, re-tap of the active tab scrolls `.app-main-content` to top (no-op at top). More sheet untouched (More lights while the sheet is open or you're on one of its pages). `TabItem` is exported for the reference page.
- **Capture** — new `features/capture/CaptureButton.tsx` + pure `holdToTalk.ts` (gesture state machine, `pickMimeType` moved here, `formatTake`) + styles appended to `capture.css`. Tap = opens the command bar (never the mic). Hold ≥ `--dur-longpress` = records while held: grows to 72 with the 100 halo, recording pill (timer + live level bars) and the 48 × 112 lock rail. Release = send; slide up 96px = locked bar [Cancel · timer · waveform · Send]; slide left 120px (or Cancel / Esc when locked) = discard with an Undo toast. Mic refused → toast "Mic blocked — allow it in site settings" + Retry. Sending hands the take to `VoiceCaptureSheet` (new optional `recording` prop), which transcribes and files it with the existing APIs, and keeps it (Try again / Save to Inbox) if that fails. No API contract changed.
- `VoiceCaptureButton` (page-header "Voice capture") — dropped the now-unused `iconOnly`; mic is the kf glyph in `currentColor`.
- `/design-system` (KitReference) — every new state: button loading/disabled/selected, parse chips, chip states, checkbox subtask/disabled, Star, four tab-bar state rows, the icon grid; at ≤767px the live tab bar is pinned at the bottom (with a ToastHost) so hold-to-talk can be tried signed-out.

## Evidence

Gate (app/.env.local absent): `npx tsc -b` 0 · `npx vitest run` 59 files / 782 tests (new: `holdToTalk.test.ts`, `icons/kf/icons.test.ts`) · `npm run lint` 0 errors (no warnings in touched files) · `npm run build` ok.

Playwright + system Chrome on the dev server (`/design-system`, placeholder Supabase env, fake mic), 390 × 844 and 1280, day + night — `docs/log/assets/kit-core/`:

- Phone kit: `kit-390-day-buttons-chips.png`, `kit-390-day-tabbar-states.png`, `kit-390-day-checkbox-star.png`, `kit-390-night-buttons-chips-tabs.png`, `focus-ring-390.png`
- Desktop kit (sizes unchanged): `kit-1280-day.png`, `kit-1280-night.png`
- Live tab bar: `tabbar-live-390-day.png`, `tabbar-live-390-night.png`, `more-sheet-390.png`
- Capture: `capture-pressed.png`, `capture-holding.png`, `capture-slide-up.png`, `capture-locked.png`, `capture-locked-night.png`, `capture-discarded-undo.png`, `capture-sent-kept.png` (no backend signed-out → the take is kept, not lost), `capture-mic-denied.png`
- `qa-log.json` — measured: phone CTA 48 tall / 15px, chip 32 / 12px, checkbox 22 (subtask 18), star 48, tab bar 390 × 64, capture 56, indicator 56 × 32, badge 20, label Inter Tight 12/16; tap opens the command bar with no mic; hold transform scale 1.2857; lock survives release; Cancel → "Recording discarded · Undo" → Undo re-sends; slide-left discards; Enter on capture = tap; focus ring = `--focus-ring`; re-tap scrolls to 0; tab tap keeps `history.length` (replace); denied mic → toast + Retry, nothing left recording.

## Deviations / notes

- Re-tap scroll uses the browser's smooth scroll (off when motion is off), not a hand-tuned 300ms emphasized-decel curve.
- Icon files have the export's c2pa `<metadata>` block stripped (~8 KB each); drawing is byte-identical. The export ships 38 glyphs, not the 39 the changelog counts.
- Phone Checkbox sizing overrides call sites with `!important` (22, or 18 with the new `subtask` prop). No call site passes `subtask` yet, so subtask rows draw 22 on a phone until their owners opt in.
- Button paddings (22/18/14) and the recording pill/rail offsets (20, 34, 112) are spec px with no token; everything colour/type/motion is a token (the spinner turns once per `--dur-grow`).
- Chip "Offline" and the Goal-gold checkbox variant aren't in the kit yet (callers style them today).
- The command bar has no mic, so the tap path to voice ("tap capture → mic in the sheet") is still the page-header Voice capture button; adding a mic to the command bar belongs to its owner.
- Not verified inside the signed-in shell (no test account in this session); the shell's `.app-tabbar` / `.app-main-content` rules in AppLayout are unchanged and already size for a 64px bar. `index.html` has no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` stays 0 on iOS until it's added.
- AppLayout's `.kf-btn:hover { translateY(-1px) }` desktop lift is still there (not in scope).
