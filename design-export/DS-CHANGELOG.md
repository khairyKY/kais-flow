# Kai's Flow — Design System changelog

## 2026-09-27 · Refresh: readability, touch, phone kit

This is a refresh, not a rebrand. The field journal, the paper, the seven species, the four fonts, washi tape, grain and the house rules are all unchanged. What changed: contrast, phone type sizes, touch targets, and the phone components that were missing. **Every variable that existed in Jul 2026 still exists with the same name.** The app can keep loading `ds/styles.css` unchanged.

Ratios are WCAG 2.x contrast. Day papers: parchment `#FBF6E9` / linen `#EFE9DB` / bone `#F6F0E1` / sidebar `#EAE3D2` / goal `#F8EFD3`. Night papers: deep `#211D30` / panel `#262233` / bone `#2E2942` / sidebar `#1C1929` / goal `#322B22`.

---

### 1 · Changed tokens (old → new)

#### `ds/tokens/colors.css` (day)

| Token | Old | New | Why |
|---|---|---|---|
| `--ink-muted` | `#6b6455` | `#5f5849` | Keeps a clear step above faint. 6.53 / 5.82 / 6.20 / 5.51 / 6.14 |
| `--ink-faint` | `#8b8471` (3.45 on parchment, 2.91 on sidebar ✗) | `#6A6354` | Secondary text failed AA almost everywhere. Now 5.52 / 4.92 / 5.24 / 4.66 / 5.18. Brief baseline `#6f685a` failed on sidebar (4.32), so it went one step darker. |
| `--ink-hairline` | `#a49d87` (2.51 ✗) | `#88816E` | **Non-text only** (hairlines, done-strike). ≥3:1 on every paper: 3.60 / 3.21 / 3.41 / 3.03 / 3.38. Brief baseline `#8c8572` was 2.87 on sidebar. |
| `--acc-gold` | `#9a7b3a` (3.69 ✗) | `#7f6428` | Used as text on the Goal card and as the goal-tag fill. 5.18 / 4.62 / 4.92 / 5.18 (4.37 on sidebar, not used there). Tag label parchment-on-gold 5.18. |
| `--acc-lavender-deep` | `#7c6a9a` (4.44 ✗) | `#6a5988` | Links and labels. 5.73 / 5.11 / 5.44 / 4.83 / 5.38 |
| `--acc-buttercream-text` | `#9a8b52` (3.14 ✗) | `#716431` | Review headers. 5.45 / 4.86 / 5.17 / 4.60 / 5.12 |
| `--sig-overdue` | `#B5654A` (3.95 ✗ as text) | `#9C5139` | "OVERDUE 64D" is text. Same value as the new `--acc-terra-ink`. |
| `--check-border` | `#b3ac95` (2.00 on bone ✗) | `#88816E` | Unchecked box edge must be 3:1. 3.41 on bone. |
| `--check-fill` | `var(--acc-sage)` (2.78 ✗) | `var(--acc-sage-text)` | Checked square must be 3:1. `#4d6650` = 5.84; ✓ mark on it 5.84. |

#### `ds/tokens/colors.dark.css` (night)

| Token | Old | New | Why |
|---|---|---|---|
| `--ink-faint`, `--moon-faint` | `#8E88A0` (4.09 on bone ✗) | `#9A94AC` | 5.62 / 5.30 / 4.77 / 5.90 / 4.79 |
| `--ink-hairline` | `#6E687F` | `#7A748A` | Non-text ≥3:1: 3.66 / 3.45 / 3.10 / 3.85 / 3.12. Brief baseline `#716B81` was 2.73 on bone. |
| selector | `[data-theme="night"]` | `[data-theme="night"], :root[data-theme="night"]` | When the theme sits on `<html>`, effects.css `:root` (same specificity, loaded later) was overriding night shadows. `:root[…]` out-ranks it. |

#### `ds/tokens/typography.css` — phone only (`@media (max-width: 767px)`), desktop untouched

| Token | Desktop (unchanged) | Phone |
|---|---|---|
| `--fs-display-xl` | 44px | 26px (page title) |
| `--fs-display-l` | 26px | 22px |
| `--fs-display-m` | 22px | 20px |
| `--fs-lead` | 18px | 17px |
| `--fs-body-l` | 16px | 16px |
| `--fs-body` | 14.5px | 15px |
| `--fs-body-s` | 13.5px | 14px (body floor) |
| `--fs-caption` | 12.5px | 13px |
| `--fs-mono-l` | 11px | 13px |
| `--fs-mono` | 10.5px | 12.5px |
| `--fs-mono-s` | 10px | 12px |
| `--fs-mono-xs` | 9.5px | 12px |
| `--fs-hand` / `--fs-hand-l` | 16 / 18px | 18 / 20px |
| `--ls-mono-tight` | 0.12em | 0.05em |
| `--ls-mono` | 0.18em | 0.07em |
| `--ls-mono-wide` | 0.22em | 0.07em |

Why: phones render true pixels (desktop's 125% zoom hid the 8–10px sizes). 110 of 181 text items on Tasks were 10px mono at 0.18em and wrapped. At 12px / 0.06em, "OVERDUE 64D · IN PROGRESS · SAT 07:00 · 8H30M" fits one line in 358px.

`spacing.css`, `motion.css`, `effects.css`: **no existing value changed** — additions only.

---

### 2 · New tokens

#### colors.css (day) → colors.dark.css (night)

| Token | Day | Night | Use |
|---|---|---|---|
| `--ink-hand` | `#6c6557` (5.35 / 4.77 / 5.08 / 4.51 / 5.03) | `#B3ABC4` (7.43 / 7.02 / 6.31) | Caveat marginalia. Replaces the literal `#7a745f`. |
| `--line-control` | `#88816E` (3.60 / 3.21 / 3.41 / 3.03) | `#7A748A` | Input, select, toggle, segmented outline (3:1). Decorative `--line-*` stay soft. |
| `--acc-terra-ink` | `#9C5139` (5.33 / 4.75 / 5.06 / 4.50 / 5.01) | `#E29473` | Terra as **text** and as the **CTA fill**. `--acc-terra` stays for dots, star, tape, illustration. |
| `--acc-blossom-text` | `#8A4A58` (6.08) | `#E9BFC5` | Text on blossom chips (was a literal). |
| `--block-terra` | `rgba(181,101,74,0.14)` | `rgba(226,148,115,0.16)` | Overdue / priority chip wash, recording halo. |
| `--sig-amber` | `#7f6428` | `#E4C36B` | Workload over capacity. |
| `--sig-offline` | `#4d6a75` | `#A9C5D3` | Offline chip, pending-sync dot. |
| `--star-on` | `#B5654A` (3.95) | `#E29473` | Filled Top-3 star. |
| `--star-empty` | `#88816E` (3.60; was 1.39 ✗) | `#7A748A` | Outline star. |
| `--on-terra` | `#FBF6E9` (5.33 on terra-ink) | `#211D30` (6.79) | Label/icon on the CTA and capture button. |
| `--focus` | `#4d6a75` | `#A9C5D3` | Focus-visible ring colour. |
| `--badge-bg` / `--badge-ink` | `#9C5139` / `#FBF6E9` (5.33) | `#E29473` / `#211D30` | Tab badges. |
| `--toast-bg` / `--toast-ink` | `#2a2420` / `#FBF6E9` (14.19) | `#F0EBDD` / `#211D30` | Snackbar, inverted. |
| `--toast-action` | `#C9A55A` (6.7 on bark) | `#9C5139` (4.95 on cream) | "Undo", "Retry". |
| `--swipe-right-bg` / `-ink` | `#8A9A7E` / `#2a2420` (5.11) | `#A8C09A` / `#211D30` | Tomorrow swipe. |
| `--swipe-left-bg` / `-ink` | `#9C5139` / `#FBF6E9` (5.33) | `#E29473` / `#211D30` | Delete swipe. |
| `--select-bg` | `rgba(77,106,117,0.10)` | `rgba(169,197,211,0.12)` | Selected row wash. |
| `--skeleton` / `--skeleton-hi` | `rgba(42,36,32,.07)` / `.035` | `rgba(240,235,221,.08)` / `.04` | Loading placeholders. |

Night file also gains (coverage rule): `--shadow-sheet`, `--shadow-toast`, `--shadow-tabbar`, `--scrim rgba(12,10,20,0.62)`, `--pressed-overlay rgba(240,235,221,0.10)`, `--focus-ring 0 0 0 2px #211D30, 0 0 0 4px #A9C5D3`.

#### typography.css

`--fs-page-title` 44 → phone 26 · `--fs-meta` 10px → phone **12px** · `--fs-meta-l` 10.5px → phone 12.5px · `--fs-tab-label` 12px · `--fs-badge` 12px · `--ls-meta` 0.12em → phone 0.06em.

#### spacing.css

`--touch-min 48px` · `--gutter-phone 16px` · `--row-min 56px` · `--topbar-h 56px` · `--tabbar-h 64px` · `--tabbar-inset env(safe-area-inset-bottom, 16px)` · `--capture-size 56px` · `--sheet-radius 8px` · `--sheet-handle-w 32px` · `--sheet-handle-h 4px` · `--sheet-handle-hit 48px` · `--sheet-h-medium 60%` · `--sheet-h-full calc(100% - 48px)` · `--toast-gap 8px` · `--swipe-commit 0.4`.

#### motion.css

`--dur-press 100ms` · `--dur-sheet-enter 300ms` · `--dur-sheet-exit 200ms` · `--dur-toast 200ms` · `--dur-longpress 400ms` · `--dur-toast-life 6000ms` · `--dur-swipe-settle 200ms` · `--dur-collapse 200ms` · `--ease-emphasized-decel cubic-bezier(0.05,0.7,0.1,1)` · `--ease-emphasized-accel cubic-bezier(0.3,0,0.8,0.15)` · `--ease-standard cubic-bezier(0.2,0,0,1)`.
Keyframes: `sheetIn`, `sheetOut`, `scrimIn`, `toastIn`, `toastOut`, `skeletonPulse`, `recPulse`. All transform/opacity only; the existing reduced-motion rule covers them (sheets and toasts cross-fade instead of travelling).

#### effects.css (day; night values in colors.dark.css)

`--shadow-sheet 0 -1px 2px rgba(60,52,38,.10), 0 -12px 32px rgba(60,52,38,.16)` · `--shadow-toast 0 2px 4px rgba(42,36,32,.22), 0 10px 24px rgba(42,36,32,.18)` · `--shadow-tabbar 0 -1px 0 rgba(60,52,38,.10)` · `--scrim rgba(42,36,32,0.36)` · `--pressed-overlay rgba(42,36,32,0.08)` · `--focus-ring 0 0 0 2px #FBF6E9, 0 0 0 4px #4d6a75` · `--press-scale 0.97`.

---

### 3 · Components — new or changed (phone sizes, px)

**Interaction rules (all components).** No hover dependence anywhere. Pressed = `--pressed-overlay` layered on the surface + `scale(0.97)`, 100ms `--ease-standard`. Focus-visible = `--focus-ring` (keyboard / D-pad only). Disabled = opacity 0.42, never the only signal. Every tappable thing has a ≥48×48 target even when drawn smaller.

| Component | Spec |
|---|---|
| Button · primary | h 48 · pill · padding 0 22 · Inter Tight 15/500 · `--acc-terra-ink` fill · `--on-terra` label · `--shadow-cta`. One per view; on phone the capture button *is* that CTA, and a sheet's primary replaces it while the scrim is up. Loading: 16px ring spinner + "Saving". |
| Button · secondary | h 48 · pill · padding 0 18 · `--paper-bone` · 1px `--line-control` · `--ink-body`. Selected: `--block-sage` + `--acc-sage-text` border/label + check 18. |
| Button · ghost | h 48 · padding 0 14 · transparent · `--ink-muted`. |
| Chip · surface | h 32 visual / 48 hit · pill · padding 0 12 · Courier Prime 12 / 0.06em uppercase · block tint + matching `-text` ink (tasks blossom, inbox hydrangea, routed sage, overdue terra). Meeting: 1px `--line-control`, radius 3. Offline: 1px `--sig-offline` outline + offline icon 16, Inter 13. Selected: 1.5px inset ring in the chip ink + check 16. |
| Chip · capture parse | same box + 16px icon: date (lavender, calendar), project (moss/sage-text, folder), duration (buttercream, clock), priority (terra, flag). **No inline ✕** (would be a 16px target) — tap the chip, its picker has "Remove". |
| Checkbox | 22 × 22 · radius 6 · 1.5px `--check-border` on `--check-bg`; checked = `--check-fill` + 2.2px mark in `--check-mark`; hit 48 (pressed halo = 48 circle of `--pressed-overlay`, box scale 0.9). Goal variant uses `--acc-gold`. Subtask variant 18. |
| Star (Top 3) | glyph 22 in a 48 hit · empty stroke `--star-empty` 1.6 · on = filled `--star-on`. |
| Select | h 48 · radius 8 · `--paper-bone` · 1px `--line-control` · value 15 · chevron 20 `--ink-muted`. Open (selected) = 2px `--focus` border + chevron up. Loading = skeleton bar + spinner. |
| Input | h 48 · radius 8 · same box · placeholder `--ink-faint` (passes 4.5). Focus = ring + 1.5px terra-ink caret. Filled = value + clear ✕ 18 (48 hit). |
| Toggle | track 52 × 32 pill · off: bone + 2px `--line-control`, thumb 16 `--line-control`; on: `--check-fill` track, thumb 24 `--paper-parchment`; pressed thumb 24 + 8px halo; hit 48. |
| Segmented | container pill, 1px `--line-control`, 3px inset; segments h 40 (48 row) · Inter 14 · selected `--block-sage` + `--acc-sage-text` 600 + check 16. |
| Section label | Courier Prime 12.5 / 0.07em `--ink-faint` · dashed rule · optional link 12.5 mono `--ink-muted` + chevron 16, 48 tall hit. ≤4 per screen (unchanged). |
| Goal card | radius 3 · 1px `--line-goal` · `--paper-goal` · `--shadow-goal` · tilt −0.4° · gold tape 72 × 17. Tag: mono 12 parchment on `--acc-gold`. Title Source Serif 18/600. Checkbox 22 gold. Done = strike + four-leaf clover. States: default, pressed (0.98 + overlay), focus, loading (skeleton), done. Never disabled. |
| Task row | min-h 56 (`--row-min`) · padding 4 · [check 48][body flex, padding 14/12][star 48][⋯ 48] · title Inter 15/20 wraps (never truncates, `text-wrap: pretty`) · meta Courier 12 / 0.06em, gap 12, wraps · project dot 7 · overdue in `--sig-overdue` · done = `--ink-faint` + strike in `--ink-hairline` · subtasks: 18 checks, 14/19 text, 44 rows · pending sync: 7px ring `--sig-offline` + "PENDING SYNC". States: pressed overlay; focus = 2px inset ring; selected = `--select-bg` + select circle. Body: tap = open, hold 400ms = select, swipe = Tomorrow / Delete. |
| Tab bar | 390 × 64 + gesture inset 16 · Today · Inbox · capture · Calendar · More · item ≈72 × 64 · indicator 56 × 32 pill in the surface block tint (sage / hydrangea / lavender / buttercream) · icon 24 · label Inter 12/16 (500 idle `--ink-faint`, 600 active `--ink-body`) · badge h 20, min-w 20, 12/600, `--badge-bg`, 2px parchment ring (1 · 12 · 99+) · pressed: overlay + 0.95 · re-tap active tab = scroll to top (300ms emphasized-decel; no-op at top). Replaces the 9px dots. |
| Capture button | 56 circle · `--acc-terra-ink` · mic 24 `--on-terra` · pressed 0.94 · hold ≥400ms = record: grows to 72, halo 100 (`--block-terra`), recording pill h 48 (timer mono 12 + 3px waveform bars) · lock rail 48 × 112 above · slide up onto the lock = locked: bar becomes [Cancel 48 · timer · waveform · Send 56] · release unlocked = send · slide to Cancel = discard + Undo. |
| Bottom sheet | `--paper-parchment` · top radius 8 · `--shadow-sheet` · handle 32 × 4 (`--ink-hairline`) in a 120 × 48 hit · medium 60% (506 at 844) · full 100% − 48 (796), header gains ✕ · scrim `--scrim`, tap = close · enter 300ms decel / exit 200ms accel, translateY only · swipe down past 30% or fling → close, **edits kept as draft** · keyboard: sheet bottom = IME top (visualViewport), header and field stay visible · Back closes the sheet first. Footer: 16 side padding, 12 top, 28 bottom, dashed top rule. |
| Action sheet (⋯) | content-sized sheet ≤ medium · header title Source Serif 20 + meta mono 12 · rows 52 · icon 24 `--ink-muted` · label 15/20 · hint mono 12 right · order: Tomorrow (Mon 09:00), Pick date…, Move to project…, Priority, Repeat, Remind, Add to Top 3, Select, — Delete (terra-ink, last, no confirm). |
| Undo toast | min-h 48 · 12 from screen edges · bottom = tab bar + 8 (88) · radius 3 · `--toast-bg` / `--toast-ink` 14/20, wraps to 2 lines · action 14/600 `--toast-action`, 48 hit · 2px life line · 6s, paused while touched · queue: max 2 visible, newest at the bottom, older above at 0.92 opacity, 3rd waits · in 200ms (translateY 12 + fade) / out 200ms fade. |
| Swipe row | right partial: 3 × 64 actions on `--swipe-right-bg` (Tomorrow · Pick date · Project, icon 24 + 12/16 600) · past 40% (`--swipe-commit`): collapses to one "Tomorrow · Mon 09:00", haptic tick · commit: row flies off 200ms, gap closes 200ms, toast · left partial: Delete 96 wide on `--swipe-left-bg` · commit: scaleY → 0 + fade 200ms, then "Moved to Trash · Undo" · under threshold: springs back 200ms. |
| Selection mode | enter: long-press 400ms (haptic) or ⋯ → Select · app bar: ✕ 48 · "3 selected" Inter 18/600 · "Select all" 15/600 `--acc-hydrangea-deep` · select circle 24 (1.5px `--line-control`; selected = `--acc-hydrangea-deep` fill + check) in 48 · selected row `--select-bg` · bulk bar replaces tab bar (80): Done · Tomorrow · Pick date · Project · Delete (terra-ink) · exit: Back, ✕, or deselect last. |
| Date picker sheet | full height · quick picks 6 × 52: Today (Sun 27), Tomorrow (Mon 28 · 09:00), This weekend (Sat), Next week (Mon), Someday, No date · month header Source Serif 18 + prev/next 48 · weekday row mono 12, h 24 · day cells 48 × 44 hit, 40 circle · today = 1.5px `--acc-terra-ink` ring · selected = `--acc-lavender-text` fill + parchment digit (6.8) · has items = 4px dot `--ink-faint` · footer: Set time (secondary) + Done (primary). "Tomorrow" is always tomorrow 09:00. |
| Time picker sheet | free slots as 48 pills (selected: `--block-lavender` + 1.5px inset `--acc-lavender-text`) · 15-minute list, rows 48, Courier 15 · busy times in `--ink-faint` + meeting chip (still selectable) · selected row `--block-sage` + check · duration chips 32 in a 48 row: 15m 30m 45m 1h 1h30 2h · opens at current value or 09:00. |
| Week strip | 7 columns, each a 48 × 76 target · day letter mono 12 (`--ink-faint`; today `--acc-terra-ink`; selected `--ink-body`) · **40 circle** with the date Inter 16 (500; 600 for today/selected) · today: 1.5px `--acc-terra-ink` inner ring + terra-ink digit · selected: `--ink-body` fill, `--paper-parchment` digit · has items: 4px `--ink-faint` dot under the circle. (Sep 28: circles replaced the 44 × 64 pills.) |
| Now line | 1.5px `--acc-terra-ink` · 10px dot at the hour gutter · time tag h 22 pill, mono 12 `--on-terra` on terra-ink · hour height 64, labels mono 12. |
| NOW slip | *(Sep 28, replaces the NOW card — option 1b)* 358 × ≈72, 16 side margin · `--paper-parchment` · 1px `--line-card` · radius 3 · `--shadow-card` · tilt −0.3° · sage washi 40 × 13 at −4° · padding 10 / 4 / 10 / 12, gap 12 · **ring** 44: conic `--acc-sage-text` on `--line-card`, 36 parchment core, minutes left mono 12 · **caption** mono 12 / 0.07em `--acc-sage-text` ("NOW · UNTIL 11:30") · **title** Inter 15/20 500, wraps · **Done** 40 circle (`--paper-bone`, 1px `--line-control`, check 20 sage-text) in a 48 target. States: pressed (overlay + 0.98) · Done pressed (0.92 + 48 halo) · focus ring · Next (empty ring, count-down, `--ink-faint`) · Running over (`--sig-amber` full ring, "+20") · Paused (`--ink-hairline` ring, frozen) · Just done (strike, Undo) · Free (→ pick from Top 3) · Loading (skeleton) · Offline (pending ring). Tap slip = task sheet (Done · +15m · Tomorrow · Focus) · tap ✓ = done + Undo · swipe / hold behave as a task row. |
| Loading | skeleton rows/cards (`--skeleton`, radius 2) **only when nothing is cached**; otherwise show cache + quiet refresh · pulse opacity 1 → 0.55, static under reduced motion. |
| Empty | the species at its zero stage (≈120 wide) · one line Inter 16 `--ink-muted` · one secondary action. |
| Error | inline card where the data would be: 1px `--line-control`, radius 3, alert 20, text 14, Retry 14/600 terra-ink in 48 · background failures use a Retry toast. |
| Offline | chip h 32 "Offline — changes will sync" under the title · 7px pending ring on each unsynced row. |
| Workload line | Inter 14/20 · clock 20 `--ink-faint` · "~5h planned · you'll finish ~17:30" in `--ink-muted`; over capacity: `--sig-amber` + alert 20 + mono 12 "2H OVER". |
| Progress hairline | 2px · `--line-card` track · `--acc-sage-text` fill · radius 1. |
| Icons | 39 glyphs (12 navigation, 16 actions, 11 utility) · 24 grid · stroke 1.6 · round caps/joins · `fill="none"` (star is the one fill) · 48 target · `currentColor`. Files `ds/icons/kf-*.svg`; inline SVG on `Icons.dc.html`. |

**Gesture ↔ tap parity** (every gesture has a tap path): swipe right = ⋯ → Tomorrow · swipe left = ⋯ → Delete · long-press = ⋯ → Select · hold-to-talk = tap capture → mic in the sheet · swipe-down sheet = ✕ / scrim / Back. **Android Back** closes the top layer first: keyboard → picker → sheet → selection mode → search → page.

---

### 4 · Deliberately NOT changed

- Paper, block, accent and line **values** except those listed in §1 — including `--acc-terra #B5654A` (still the terra of dots, star, tape and illustrations; `--acc-terra-ink` carries text and CTA fills).
- The desktop type scale, desktop sizes of every component, desktop screens.
- Fonts (Source Serif 4, Inter Tight, Courier Prime, Caveat), species and growth stages, washi-tape recipe, grain, tilt tokens.
- Radii: cards stay 3px. `--sheet-radius` (8, top corners only) is a sheet, not a card; buttons/chips stay pill.
- Existing motion durations and curves; existing shadows.
- House rules: no pure white or black, one terra CTA per view, one Goal card, each surface keeps its accent.

### 5 · Deviations from the brief (and why)

- `--fs-meta` phone = **12px**, not 11.5 — the brief's own rule is "nothing under 12px on a phone, ever". `--fs-meta-l` = 12.5 to keep a step.
- Day `--ink-faint #6A6354` (brief `#6f685a`: 4.32 on sidebar) and `--ink-hairline #88816E` (brief `#8c8572`: 2.87 on sidebar). Night `--ink-hairline #7A748A` (brief `#716B81`: 2.73 on bone).
- Known pairs that still fail and are **not used**: `--acc-gold` on sidebar 4.37, `--acc-clover-text` on sidebar 4.45.

### 6 · Files

- Tokens: `ds/tokens/colors.css`, `colors.dark.css`, `typography.css`, `spacing.css`, `motion.css`, `effects.css`. Jul 2026 snapshot: `_archive/tokens-2026-07/`.
- `Design System.dc.html` / `Design System Dark.dc.html` — §01 contrast (`DS Colour`, `DS Colour Night`), §02 type + §03 touch (`DS Type Touch`), §04 kit (`DS Kit`); children are shared by both files.
- `Now Entry Options.dc.html` — five NOW-entry explorations; 1b chosen.
- `Mobile Kit.dc.html` — 00 kit proof + 13 pieces, day and night; each piece is an `MK …` file (+ `MK Underlay`).
- `Icons.dc.html` + `ds/icons/kf-*.svg`.
- `_archive/Design System Jul2026.dc.html`, `_archive/Design System Dark Jul2026.dc.html` — previous pages, rendered with the Jul token snapshot.
- `_gen/lib.js` — the generator the kit pages were built from (not loaded by any page).
