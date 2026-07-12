# Kai's Flow — Design System

> **The single entry point for building any new screen, component, or concept.** The mockups in `design/` cover 19 screens; everything built after them (smart lists, snooze menus, planning boards, whatever Kai dreams up next) is built **from this system directly** — no mockup needed, no mockup made.
>
> Precedence when documents disagree: `app/src/styles/tokens/*.css` (canonical values) → `design/SKILL.md` (house rules) → `docs/phases/P-DESIGN.md` §3–§4 (hex→token map, flower map) → this file. This file is deliberately an **index plus the motion vocabulary** — it names rules and points at their canonical home instead of copying values, so it cannot drift.

---

## 1. Identity in one paragraph

Kai's Flow is a **field journal of days**: warm linen paper with visible grain, near-square parchment cards pinned slightly crooked, washi tape holding down the important ones, botanical flower photographs pressed onto the page as living status indicators, a quiet serif for display, a wide-tracked mono for metadata, and one line of handwriting per card at most. Color is scarce and botanical; terra-cotta is a *moment* (the single CTA), gold belongs to the day's one goal. At night the garden goes dark under a navy sky with fireflies. Nothing is loud, nothing is glassy-modern, nothing is pure white or black.

## 2. Where everything canonical lives

| Layer | Canonical home | What's in it |
|---|---|---|
| Color tokens (light) | `app/src/styles/tokens/colors.css` | paper/ink/line scales, 10 botanical accents + text-on-tint variants, signals, semantic aliases (`--bg-*`, `--text-*`, `--border-*`, `--accent-*`, `--text-on-accent`) |
| Color tokens (night) | `app/src/styles/tokens/colors.dark.css` | `[data-theme="night"]` remap of the same semantic names + `--firefly`, `--star` |
| Typography | `app/src/styles/tokens/typography.css` | `--font-display/ui/mono/hand`, `--fs-*`, `--fw-*`, `--lh-*`, `--ls-mono*` |
| Spacing & radii | `app/src/styles/tokens/spacing.css` | 4px `--sp-*` scale, `--gap-*`, `--pad-card*`, the 4 radii (`--radius-sharp` 3px cards · `--radius-input` 6px · `--radius-md` 8px · `--radius-pill`) |
| Effects | `app/src/styles/tokens/effects.css` | warm two-part shadows, `--noise-url` paper grain, `--tilt-*` card rotations, night glows |
| Motion tokens + keyframes | `app/src/styles/tokens/motion.css` | durations, easings, the 7 keyframes, `prefers-reduced-motion` reset |
| **Motion interaction blueprint** | `design/tokens/motion-interactions.css` | the full Open Design motion spec (hover lifts, press scale, entry/stagger bindings) — **reference only**, ported to real app classes in the Motion Retrofit |
| House rules | `design/SKILL.md` | type/color/tape/night/do-not rules — read before any new screen |
| Hex→token + flower maps | `docs/phases/P-DESIGN.md` §3–§4 | translate any mockup hex; surface → flower species → accent token |
| Component vocabulary | `design/components/**/*.prompt.md` | Button, Card, Checkbox, Chip, SectionLabel, Tape, FlowerBadge, GoalCard, NavItem, StreakVine, TaskRow, FireflyField, MoonlitCard, StarField |
| Flower state helpers | `app/src/lib/gardenAssets.ts` | species→state mapping functions (being consolidated here; add new species helpers here, never inline) |
| Per-screen functional specs | `SCREENS.md`, `SCREENS-PART-TWO.md` (repo root) | what each screen does, block by block |

**The hard rules that apply to every line of UI code:** never a hex literal (semantic tokens only) · one terra CTA per view · one gold card per view (the day's goal) · each surface keeps its own accent flower color · metadata is always mono-uppercase-tracked · Caveat is marginalia only, ≤1 per card · tape never on plain list items · ≤4 SectionLabels per screen · no pure white/black · cards are 3px radius, tilted ±0.3–0.8°.

## 3. Motion vocabulary (the "buttery" contract)

All motion uses **transform and opacity only** — never width/height/top/left/margin (layout thrash kills the butter). Every animation respects the `prefers-reduced-motion` reset already in `motion.css`.

### Durations & easings (tokens, already live)

| Token | Value | Use for |
|---|---|---|
| `--dur-instant` 120ms | hover color/background shifts, press feedback |
| `--dur-quick` 150ms | chip/checkbox state, small reveals |
| `--dur-normal` 200ms | nav switches, overlay open/close, route transitions |
| `--dur-slow` 300ms | panels sliding (chat, event details), toasts |
| `--dur-bloom` 600ms | flower state crossfades, petal fall |
| `--dur-grow` 800ms | vine/streak growth, terrarium changes |
| `--ease-out` | default for everything entering/settling |
| `--ease-in` | things leaving |
| `--ease-spring` | playful pops: checkbox, flower bloom, tape settle |
| `--ease-natural` | continuous ambient loops |

### Keyframes (defined in `motion.css`) and what they're for

| Keyframe | Meaning | Bound where (after Motion Retrofit) |
|---|---|---|
| `entryFadeUp` | a card/section arriving on the page | page sections, cards on mount |
| `itemFadeIn` | one row in a list arriving | list rows, staggered `nth-child` 30–150ms |
| `checkPop` | a checkbox/toggle celebrating | checkbox on check, star on pin |
| `petalFall` | something completed lets go | task-complete petal, Someday row leaving |
| `cloverSway` | ambient idle life | flower PNGs, gentle & staggered |
| `fireflyDrift`, `twinkle` | night only | night theme pass (phase D) |

### Interaction states (the universal bindings — blueprint in `design/tokens/motion-interactions.css`)

- **Hover** on any interactive card/button/chip: `translateY(-1px)` lift + `--dur-instant` background shift. Nav items slide `translateX(3px)`. Flower badges sway.
- **Press** (`:active`): `scale(0.97)`, `--dur-instant`. Everything clickable acknowledges the finger.
- **Entry**: sections `entryFadeUp`, list rows `itemFadeIn` staggered. Never animate more than the first ~8 rows — beyond that, appear instantly.
- **Route/tab change**: View Transitions API (native, no dependency) — outgoing view fades `--dur-normal --ease-in`, incoming rises with `entryFadeUp` semantics. Sidebar active indicator morphs between nav items via a shared `view-transition-name`.
- **Overlays** (command bar, search, snooze menu, context menu): fade+scale from 0.98, `--dur-normal --ease-out`; backdrop fades in parallel. Slide-overs (chat, event details) translate from their edge at `--dur-slow`.
- **Flower state changes**: never swap a PNG instantly — crossfade old→new with a slight `--ease-spring` scale-in of the new state (`--dur-bloom`).
- **Ambient budget: ≤2 continuous animations per screen.** Atmosphere, not a screensaver.

## 4. Recipe — designing a brand-new screen or concept (no mockup)

1. **Name the surface and its flower.** Pick species + accent from P-DESIGN §4. New concept that fits no existing surface? Choose the closest species semantically; never invent one. The flower must *mean* something (a state, a count, a progress) — never pure decoration.
2. **Read the functional block** in `SCREENS.md` / `SCREENS-PART-TWO.md` if one exists; if not, write 5–10 lines there first (what the screen does, its data, its actions) — the block is the spec, this system is the look.
3. **Lay the paper**: `--bg-app` ground (grain comes free from `index.css`), main content in the existing layout rhythm (`36px 56px` desktop padding, sections opened by SectionLabels — max 4).
4. **Cards**: `--bg-surface`, `--radius-sharp`, `--line-card` hairline, `--shadow-card`, a `--tilt-*` if the card is "placed" (standalone), flat if it's in a list. Tape only on placed cards, colored to the surface accent.
5. **Type**: serif display at 500/600 for the one big thing, Inter Tight body, mono-uppercase-tracked for every piece of metadata (dates, counts, durations, statuses). One Caveat marginalia if the screen deserves a human aside.
6. **Color budget**: the surface's accent for its identity moments; one `--acc-terra` CTA; overdue/danger = terra; gold only if this screen hosts the day's goal (it almost never does).
7. **Motion**: wire §3's universal bindings (hover/press/entry/stagger) — they come free once the Motion Retrofit's shared classes exist. Add at most one screen-specific flourish (a flower state change, one ambient sway).
8. **Keyboard**: every primary action reachable without the mouse; Escape always closes; the screen's shortcuts join the global map + `?` cheatsheet.
9. **Night check**: set `data-theme="night"` — semantic tokens should carry it; anything unreadable means you used a raw value somewhere.
10. **Acceptance** (same bar as P-DESIGN §7): build passes · zero new hex (grep) · 1440px composed, 375px no horizontal scroll · reduced-motion clean · SKILL.md §10 audit (CTA/gold/tape/SectionLabel counts).

## 5. Component inventory (reuse before you build)

Shared React components already extracted: `components/AppLayout.tsx` (chrome), `components/ContextMenu.tsx`, `components/ToastHost.tsx`, plus the per-feature patterns (PillButton/RitualChrome in rituals, TaskRow in tasks, SectionHeader in today). **The rule from P-DESIGN §6 stands: extract a shared component the *second* time a visual repeats, into `app/src/components/` — not the first.** The design-side vocabulary (`design/components/*.prompt.md`) describes the intended look of each; follow the prompt file when extracting.

---

*Created 2026-07-08 from the audit + Open Design extraction recon. Update this file only when a rule genuinely changes — it indexes the system, it is not a scratchpad.*
