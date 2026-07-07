# SKILL.md — how to build with Kai's Flow

This is a botanical, paper-textured workspace. Read this before starting a new screen.

## 1. Load the system

Every DC / HTML file starts with the same two things:

```html
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400;1,8..60,500&family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Caveat:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
```

For the Night theme, add `data-theme="night"` to the outermost element (a root `<body>` or an inner section).

## 2. The paper ground

The light theme is warm linen with subtle noise. Put this once on the body:

```css
body{background:var(--paper-linen);color:var(--ink-body);font-family:var(--font-ui)}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:1;
             background-image:var(--noise-url);mix-blend-mode:multiply;opacity:0.5}
```

## 3. Layout rhythm

- **1440×1024** is the canonical desktop canvas. **238px** sidebar, main padded `36px 56px`.
- Sections are opened with a **SectionLabel**: mono uppercase caption + dashed hairline rule + optional trailing action.
- Cards use `border-radius: 3px` — NOT modern rounded. Add a tiny `transform: rotate(±0.3–0.5deg)` for the pinned-note feel.
- One (and only one) card per view carries the **gold Goal-of-Day** treatment.

## 4. Type rules

- **Display**: Source Serif 4 at 500–600. Big sizes are quiet weights — never bold + huge.
- **UI/body**: Inter Tight, 14.5px baseline.
- **Metadata**: IBM Plex Mono, `text-transform: uppercase`, `letter-spacing: 0.14–0.22em`. Always.
- **Caveat**: marginalia only. One per card, max. Never in a button or a label.

## 5. Color use

- One `--acc-terra` action per view (the CTA). Terra is a moment, not a texture.
- Each surface has one accent flower color. Don't mix surfaces' colors on the same card unless you're intentionally showing cross-surface links (e.g. Inbox chip on a Task).
- Overdue = terra. Everything else muted mono.
- The gold palette is reserved for the day's single goal.

## 6. Flower avatars

Use PNGs from `assets/flowers/<species>/<state>.png`. Pick states semantically:
- 3 unread → `hydrangea/light`, 12 unread → `hydrangea/medium`, 40+ → `hydrangea/heavy`.
- A task in progress → `cherry/opening`. Completed today → `cherry/fallen`.
- Habit streak this week: `vine/bare|sprouting|flowering|lush` per day.

Always add `filter: drop-shadow(0 2px 2px rgba(60,52,38,0.18))` so they read as *pressed* onto paper.

## 7. Washi tape decoration

Cards that need to feel *placed* get one (rarely two) small washi tape strips on the top edge. Pair the tape color with the card's role (sage for Today, blossom for Tasks, gold for Goal). See `guidelines/brand-tape.card.html`.

Never put tape on a plain list item. Never put tape and drop-shadows both on a small chip.

## 8. Night garden (the dark theme)

The dark theme is not "invert the light theme." It's a whole scene — an evening garden under a deep-blue sky:

1. Set `data-theme="night"` on the root. This flips the semantic tokens (`--bg-app`, `--text-primary`, etc.) automatically.
2. Add the sky backdrop as a fixed layer (`radial-gradient` from `#2a3a70` at the moon → `#0B1330` at the horizon).
3. Sprinkle **stars** in the upper half — 40–80 tiny `border-radius:50%` spans at `rgba(255,250,230,0.9)` with `twinkle` animation. Bigger ones get a warm glow.
4. Add a **moon** — a soft radial gradient blob near the top-right.
5. Add **fireflies** — 8–14 small `#F6E28C` dots with layered box-shadows and the `fireflyDrift` keyframe. Concentrate them in the lower half (near the "garden"). *Every extra firefly is one too many* — atmosphere, not swarm.
6. Cards become **MoonlitCard**: frosted glass panels (`backdrop-filter: blur(6px)`) with subtle inner top highlight.
7. The Goal card gets a firefly perched on its top-right and a golden inner glow instead of a shadow.
8. Buttons stay pill-shaped, but the primary becomes warm firefly-yellow instead of terra — the terra CTA in a dark garden would feel like a warning light.

Copy that helps the night mood: "Tonight" instead of "Today", "Softly in the dark", "the garden after dark", "Save for morning", "Whisper capture".

## 9. Motion

- Nav switches at 200ms, `ease-out`.
- Clover badge sways slightly on hover (`cloverSway`).
- Vine cells grow one at a time (`grow` 800ms).
- Fireflies drift continuously in a slow figure-8.
- All animations respect `prefers-reduced-motion`.

## 10. What NOT to do

- No hard black. `#2a2420` bark is as dark as text goes in light mode. In night mode, cream-white (`rgba(245,240,220,0.92)`) is as light as text goes.
- No pure white. Backgrounds are linen (`#EFE9DB`) or midnight (`#0B1330`), never `#fff` or `#000`.
- No bright saturated primaries. All accents are botanically desaturated.
- No sharp brutalist shadows. Shadows are two-part, warm, soft.
- No modern rounded-16 cards. Sharp 3px is the house radius.
- No emoji outside the ✿ flower marker used sparingly in Caveat notes.
- No stacking more than 4 SectionLabels on one screen — density is a design smell here.
- No fireflies in the light theme. They're a night creature.
