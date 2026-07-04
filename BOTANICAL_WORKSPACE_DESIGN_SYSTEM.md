# Botanical Workspace — Design System Brief

> Handoff document for Claude Design. This defines the visual identity for an all-in-one productivity workspace app.

---

## Design DNA — four references, one language

This system is a synthesis of four design references, each contributing a specific layer:

| Reference | Contributes | Key tokens extracted |
|---|---|---|
| **Kami Parchment** (Open Design №26) | Typography hierarchy, editorial rules, metadata labels, the "feels printed" quality | `#f5f4ed` warm paper, `#1B365D` ink blue, Source Serif Pro, IBM Plex Mono, hairline rules |
| **Open Design Landing** (Atelier Zero) | Layout grid, paper noise texture, structural chrome (topbar strips, side rails, numbered sections), accent color warmth | `#efe7d2` paper, `#ed6f5c` coral, `#e9b94a` mustard, `#6e7448` olive, `feTurbulence` grain overlay |
| **Qelora** (Layered Depth) | Glassmorphism panels, parallax depth, cinematic transitions, dark-mode warmth | `#0e0c0a` dark bg, `rgba(248,245,240, 0.72–0.96)` frosted glass, `backdrop-filter: blur(8–16px)`, scroll parallax |
| **Claude.ai** | Functional clarity, readability standard, generous whitespace, warm sans-serif baseline | Warm cream bg, terracotta accent, clean sans-serif, impeccable contrast ratios |

**The through-line**: every reference uses warm paper as its ground tone. This is not a coincidence — it is the foundation.

---

## Concept: living terrarium

The app is a **terrarium** — a glass container housing a living garden. The user looks through frosted glass panels at warm paper surfaces where botanical motifs grow and respond to their work.

**Not cottagecore.** Not illustrated forests. Not leaf clipart. Think: a single pressed fern frond behind glass on a linen surface. Restraint is the whole point — the botanical elements are *punctuation*, not wallpaper.

---

## Color tokens

### Light mode

| Token | Hex | Role | Origin |
|---|---|---|---|
| `--bg-base` | `#F4F1EA` | Page background — warm botanical linen | Averaged across all four references |
| `--bg-surface` | `#EDE8DC` | Card/panel background — parchment | Open Design `--paper-warm` |
| `--bg-hover` | `#F7F1DE` | Hover states, input fields — bone | Open Design `--bone` |
| `--text-ink` | `#2a2420` | Primary text — bark brown, NOT pure black | Qelora `--ink-3` |
| `--text-muted` | `#6b665b` | Secondary text, metadata | Kami metadata color |
| `--text-faint` | `#8b8676` | Hints, placeholders | Open Design `--ink-faint` |
| `--accent-sage` | `#8A9A7E` | Primary green — leaf anchor | Derived from Open Design olive `#6e7448`, lightened |
| `--accent-terra` | `#B5654A` | CTA, notifications, active states — terracotta | Bellissimo Terra `#A65337` + Open Design coral blend |
| `--border` | `#d4d1c5` | Hairline rules, dividers | Kami `.rule` border-color |
| `--border-faint` | `rgba(21, 20, 15, 0.08)` | Subtle separators | Open Design `--line-soft` |

### Dark mode — "night garden"

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#0e0c0a` | Deep warm black — not blue-black | 
| `--bg-surface` | `rgba(248,245,240, 0.06)` | Ghost parchment on dark |
| `--bg-glass` | `rgba(248,245,240, 0.08)` | Frosted glass panel fill |
| `--glass-border` | `rgba(248,245,240, 0.12)` | Glass panel stroke |
| `--text-ink` | `rgba(248,245,240, 0.88)` | Primary text on dark |
| `--text-muted` | `rgba(248,245,240, 0.55)` | Secondary text on dark |
| `--accent-sage` | `#4A5A42` | Muted sage for dark contexts |
| `--accent-terra` | `#D49880` | Lightened terracotta for dark |

### Flower tab accent ramp

Each app tab gets one muted flower color. These are **dusty and earthy**, never saturated.

| Tab | Flower concept | Accent hex | Why this flower |
|---|---|---|---|
| Chat / messaging | Clover / basil sprig | `#C9A0A0` dusty rose | Small, everyday, quick — not a showy bloom |
| Calendar | Sunflower / daisy | `#A8A0BE` lavender | Petals open/close as the day progresses |
| Docs / notes | Fern (unfurling frond) | `#D4C78A` buttercream | Fern unrolls as a doc grows — natural loading/progress metaphor |
| Tasks / to-dos | Cherry blossom | `#D4A8B0` blush | One petal falls per completed task |
| Projects / boards | Vine with leaves | `#7A946E` deep moss | Leaves grow as milestones complete — literal progress bar |
| Email / inbox | Hydrangea cluster | `#9AB4BE` powder blue | Cluster shrinks as inbox clears |

**Usage rule**: the tab accent tints the active tab icon, its section headers, and progress indicators. It does NOT paint large surfaces — the warm paper base stays dominant everywhere.

---

## Typography

Three type roles, pulled from the references:

| Role | Typeface | Source reference | Usage |
|---|---|---|---|
| Display / headlines | Source Serif Pro (500 italic for emphasis) | Kami Parchment | Hero text, page titles, empty-state headlines. Serif gives editorial warmth. |
| UI / body | Inter Tight (400, 500, 600) | Open Design Landing | All UI text, nav labels, body copy, buttons. Clean and functional. |
| Metadata / mono | IBM Plex Mono (400, 500) | Kami Parchment | Timestamps, keyboard shortcuts, code, tab metadata strips, file sizes. Always uppercase, wide letter-spacing (0.12–0.18em). |

**Type scale**: 11px metadata → 13px caption → 14px body → 16px lead → 20px subheading → clamp(28px, 4vw, 48px) display.

**Hierarchy rule from Kami**: "Ring or whisper, never shout." Headlines are large but light-weight. Metadata is tiny but tracked wide. Nothing is bold and large simultaneously.

---

## Layout system

### From Open Design — editorial grid chrome

- **Topbar metadata strip**: a thin mono-text bar across the top showing app context (workspace name, current date, status dot). Font: IBM Plex Mono, 10.5px, uppercase, letter-spacing 0.18em, `--text-faint` color.
- **Side rail** (optional, desktop only): fixed vertical text on the right edge, rotated 180°. Shows context like "workspace · personal" or a subtle botanical illustration strip. Width: 36px. Border-left: 1px solid `--border-faint`.
- **Section labels**: coral-dashed prefix pattern from Open Design — a small line dash before an uppercase label. Used for section headers within panels.

### From Qelora — depth and glass

- **Frosted glass panels**: `background: rgba(248,245,240, 0.72)` + `backdrop-filter: blur(8px)` + `border-radius: 18px` + `box-shadow: 0 2px 20px rgba(0,0,0,0.08)`. Used for popovers, command palette, quick-add dialogs, notification center.
- **Parallax depth**: subtle scroll parallax on decorative botanical elements (background fern, flower illustrations). Keep it to `transform: translateY(scrollY * 0.15)` — less than Qelora's aggressive 0.3 factor.
- **Layered z-ordering**: nav (z:100) → glass panels (z:50) → content cards (z:2) → botanical bg elements (z:0).

### From Claude — functional clarity

- **Max content width**: 920px for reading views (docs, email), matching Kami's `max-width: 920px`.
- **Card padding**: 22–28px internal, matching Qelora's glass panel padding.
- **Spacing rhythm**: 8px base unit. Margins between sections: 40px (compact), 64px (standard), 96px (section breaks).

---

## Texture

### Paper noise overlay (from Open Design)

Apply a fixed `body::before` pseudo-element with an SVG `feTurbulence` noise pattern:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='...' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  mix-blend-mode: multiply;
  opacity: 0.6;
}
```

**Key difference from Open Design**: opacity reduced from 0.92 to 0.6. This is a productivity app, not a landing page — the texture is felt, not seen.

---

## Nav bar — the botanical spine

### Structure

Left-anchored vertical sidebar (desktop), bottom bar (mobile).

### Flower icon system

Each tab icon is a stylized botanical SVG:

- **Active state**: flower in full bloom, tinted with the tab's accent color
- **Inactive state**: closed bud or seed, tinted `--text-faint`
- **Hover state**: bud begins to open (mid-bloom), plus a subtle "dew" highlight — `box-shadow: 0 0 12px rgba(138,154,126, 0.2)`
- **Transition**: 200ms ease-out bloom animation between states

### Vine connector (desktop sidebar)

A thin vine SVG (`stroke-width: 1px`, `--accent-sage` color) runs vertically along the sidebar connecting the tab icons. As the user's daily streak or session length grows, the vine extends and small leaves appear. This is ambient — never attention-demanding.

### Mobile bottom bar

5 tab icons max. The active icon blooms and gets a terracotta dot indicator below it (3px circle). The inactive icons stay as buds. No vine on mobile — too small.

---

## Interactive states

### Bloom = active tab (from brainstorm)

The selected tab's flower is in full bloom. Others sit closed/dormant. This is a wayfinding device, not decoration — each flower shape is distinct enough to identify without reading the label.

### Growth = progress (from brainstorm)

- **Tasks**: cherry blossom. Petals fall (CSS `@keyframes` with `transform: translateY` + `opacity`) as tasks complete. Satisfying micro-celebration.
- **Projects**: vine leaves grow along a progress bar. At 100%, a small flower blooms at the end.
- **Docs**: fern frond unfurls as a scroll progress indicator.
- **Calendar**: sunflower petals open as the day progresses, close for past/empty days.

### Leaf-morph transition (between tabs)

Instead of a hard cut, the active tab's bloom icon morphs into the next tab's bloom shape over ~150ms. Uses SVG path interpolation (GSAP `MorphSVGPlugin` or a lightweight alternative).

---

## Component patterns

### Cards

```
border-radius: 12px
background: var(--bg-surface)
border: 1px solid var(--border-faint)
padding: 22px
```

No drop shadows on cards in light mode. In dark mode, use `box-shadow: 0 2px 20px rgba(0,0,0,0.1)`.

### Buttons

Primary: `background: var(--accent-terra)`, `color: #fff`, `border-radius: 999px` (pill), `padding: 10px 20px`.
Secondary: `background: transparent`, `border: 1px solid var(--border)`, `color: var(--text-ink)`.
Ghost: `background: transparent`, `color: var(--text-muted)`, hover reveals `var(--bg-hover)`.

### Input fields

```
background: var(--bg-hover)
border: 1px solid var(--border)
border-radius: 8px
font-family: Inter Tight
focus: border-color: var(--accent-sage)
```

### Tags / pills

Use the flower tab accent as the background at 15% opacity, with the accent at full saturation for text. Example for a "Tasks" tag: `background: rgba(212,168,176, 0.15)`, `color: #8A4A58`.

---

## Motion language

| Context | Duration | Easing | From |
|---|---|---|---|
| Tab switch | 200ms | ease-out | Qelora panel transitions |
| Hover bloom | 150ms | ease-in-out | Custom |
| Page transitions | 300ms | cubic-bezier(0.22, 0.61, 0.36, 1) | Open Design nav transition |
| Parallax scroll | passive, 60fps | linear | Qelora slab parallax |
| Task completion (petal fall) | 600ms | ease-in | Custom |
| Vine growth | 800ms | ease-out | Custom |

All animations respect `prefers-reduced-motion: reduce` — disable everything except opacity fades.

---

## What this is NOT

- **Not cottagecore**: no illustrated leaves scattered everywhere, no watercolor textures, no handwritten fonts
- **Not a plant app**: the botanical elements are structural metaphors (progress, state, navigation), not decoration
- **Not dark-mode-first**: light mode with warm paper is the primary experience. Dark mode is a deliberate "night garden" variant, not an afterthought
- **Not maximalist**: the Open Design and Qelora references are landing pages with big gestures. This is a **workspace** — restraint is mandatory. Take their *tokens*, not their *drama*

---

## Decided: shared garden + independent tabs (both)

The app uses **both** models:

- **Garden dashboard** (home screen / `/`): a shared terrarium view where ALL tabs' plants live together. Each plant reflects its tab's real state (task completion %, calendar fill, unread count). This is the app's signature screen and the first thing users see.
- **Independent per-tab**: each tab maintains its OWN flower icon state in the nav bar (bloom = active, bud = inactive). The tab's accent color tints its section headers and progress indicators independently.
- **The vine connects them**: the vine/streak indicator lives in the sidebar nav, growing vertically to connect all tab icons. It reflects the user's daily streak and current session length. Short session = bare vine. Long session = vine with small leaves. Multi-day streak = vine with tiny buds. The vine is the through-line that ties the independent tabs into one living organism.

### Garden growth timeline

The garden dashboard evolves over time based on actual usage:

| User tenure | Garden state |
|---|---|
| First session | Empty terrarium with soil. Seeds drop in during onboarding (animated). |
| Day 2–7 | Small sprouts appear for each tab the user has actually used. Unused tabs stay as seeds. |
| Week 2–4 | Sprouts become small plants with recognizable shapes (fern frond, cherry branch, clover patch). |
| Month 2+ | Full plants. Flowers bloom proportionally to usage. A neglected tab's plant wilts slightly (not dead — recoverable). |
| Power user (3+ months, daily streak) | Lush terrarium. Occasional butterfly/firefly particle effects (subtle, `prefers-reduced-motion` respected). |

### Vine streak system

The sidebar vine is an SVG path that connects tab icons vertically:

- **No streak (0 days)**: bare stem, `--text-faint` color, no leaves
- **1–3 day streak**: stem + 2–3 small leaves, `--accent-sage` color
- **4–7 day streak**: fuller vine with 5–6 leaves, slight curl tendrils
- **7+ day streak**: lush vine, small buds appearing at leaf junctions
- **30+ day streak**: vine flowers — tiny blooms at intervals along the vine

The vine resets gently (leaves fall one by one over a broken-streak day, not instant death) so missing a day feels recoverable, not punishing.

---

## Remaining open decisions

1. **Font pairing**: Source Serif Pro (Kami) vs. Playfair Display (Open Design) for display headlines. Leaning Source Serif for daily-use readability.
2. **Noise texture toggle**: consider a Settings > Appearance slider for paper grain intensity (0–100%).
3. **Sidebar width**: collapsible — 64px (icons + vine only) ↔ 220px (icons + labels + vine). Default to expanded on desktop, collapsed on narrow viewports.

---

*Generated from brainstorm session. References: Kami Parchment (Open Design №26), Open Design Landing (Atelier Zero), Qelora (Layered Depth), Claude.ai interface, Bellissimo SPA palette.*
