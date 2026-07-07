# Kai's Flow — Design System

A botanical workspace for personal task-keeping. Two themes live in the same system:

- **Day garden** (light) — warm paper, dashed hairlines, washi tape, six flower plants that stand in for the six top-level surfaces.
- **Night garden** (dark) — deep midnight-blue sky, twinkling stars, drifting fireflies, a soft moon spill on frosted-glass cards.

## Voice
Ring or whisper, never shout. Handwritten Caveat asides are used sparingly. Cards look pinned to a linen board — tiny tilts, tape, layered shadows. Nothing here should look like a modern SaaS dashboard.

## What's inside

- `styles.css` — one entry point; pulls all tokens.
- `tokens/` — colors (light + dark), typography, spacing, motion, effects, fonts.
- `assets/flowers/` — 32 PNG botanical illustrations across 7 species and their growth states.
- `guidelines/` — foundation cards (color, type, spacing, brand).
- `components/` — reusable components split into `core/`, `garden/`, `night/`. Each component ships a `.jsx` implementation, a `.d.ts` contract, a `.prompt.md` usage guide, and a `.card.html` preview.
- `ui-kit/` — full-page examples: `today-light`, `routines-light`, `tonight-dark`.
- `SKILL.md` — how to build with the system.

## Getting started

```html
<link rel="stylesheet" href="path/to/styles.css">
<body>                        <!-- light theme is the default -->
<body data-theme="night">     <!-- opt-in dark theme -->
```

Then reach for tokens, not raw hex codes:

```css
color: var(--ink-body);
background: var(--paper-parchment);
border: 1px dashed var(--border-dashed);
```

## The species map

| Plant | Surface | State axis |
|---|---|---|
| Clover | Chat | mood / four-leaf on rare wins |
| Hydrangea | Inbox | count → light / medium / heavy |
| Daisy | Calendar | time of day |
| Cherry | Tasks | bud → opening → bloom → fallen |
| Wisteria | Projects | progress p0 → p100 |
| Fern | Docs | coil → full |
| Vine | Streaks / habits | bare → sprouting → flowering → lush |

Never invent a species. Use existing states semantically.
