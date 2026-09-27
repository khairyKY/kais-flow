# Kai's Flow — Figma Rebuild Guide

Source of truth: `Design System.dc.html` (Claude Design project `Kai's Flow`, id `a323beb8-543d-4171-99fa-0686b32113ff`) + its imported tokens (`ds/tokens/*.css`), `ds/styles.css`, and the botanical asset library (`ds/assets/**`). This doc re-describes that system in **Figma's own vocabulary** — variables, styles, components/variants — so it can be rebuilt by hand in a Figma file rather than read as CSS. It does not cover screen layouts (Today, Tasks, Calendar, …) — only the design-system primitives in §01–§07 of the DC file.

Everything here is a spec to build against, not a file that exists yet. Where a term is Figma-specific (Variable, Style, Component Set, Variant, Auto Layout, Boolean property, Instance-swap property) it's called out so nothing gets mistranslated into Sketch/generic-tool language.

---

## 0. File setup

- One Figma file: **"Kai's Flow — Design System"**.
- Pages: `Cover`, `01 Foundations` (color/type/space/effects), `02 Components`, `03 Botanical Species`, `04 Reference` (a 1:1 canvas trace of the DC page itself, for side-by-side QA).
- Turn on **Local variables** (Figma menu → Local variables, or the right-sidebar Variables panel) before building anything — every color, spacing, and radius below should be a variable, not a hardcoded value, so components stay bound when a mode changes.

---

## 1. Variables (Local Variables panel)

Figma variables live in **collections**, and a collection can carry multiple **modes** (e.g. Light/Night) that every variable in it can override per mode. Create four collections:

### Collection: `Color`
Two modes: **Light** (default) and **Night** — this is the direct equivalent of `:root` vs `[data-theme="night"]` in the CSS. Every variable below must have a Night value; there's no "falls back to Light" in this system (the CSS comment on `colors.dark.css` is explicit about that), so don't leave any Night cell empty in Figma either.

**Group: `paper/`** (type: Color)
| Variable | Light | Night |
|---|---|---|
| `paper/linen` (page bg) | `#EFE9DB` | `#211D30` |
| `paper/parchment` (cards/panels) | `#FBF6E9` | `#262233` |
| `paper/bone` (inputs/hover) | `#F6F0E1` | `#2E2942` |
| `paper/sidebar` | `#EAE3D2` | `#1C1929` |
| `paper/goal` (gold card) | `#F8EFD3` | `#322B22` |
| `paper/event` | `#F4EFE0` | `#2A2639` |

**Group: `block/`** (calendar tints — type: Color, with alpha; Figma variables support alpha channel directly)
| Variable | Light | Night |
|---|---|---|
| `block/lavender` | `rgba(168,160,190,.20)` | `rgba(192,183,224,.22)` |
| `block/moss` | `rgba(122,148,110,.18)` | `rgba(154,190,140,.18)` |
| `block/blossom` | `rgba(212,168,176,.22)` | `rgba(233,191,197,.18)` |
| `block/sage` | `rgba(138,154,126,.20)` | `rgba(168,196,152,.18)` |
| `block/hydrangea` | `rgba(154,180,190,.22)` | `rgba(169,197,211,.18)` |
| `block/buttercream` | `rgba(212,199,138,.24)` | `rgba(232,220,160,.18)` |

**Group: `ink/`** (type: Color)
| Variable | Light | Night |
|---|---|---|
| `ink/body` | `#2a2420` | `#F0EBDD` |
| `ink/muted` | `#6b6455` | `#C9C0D8` |
| `ink/faint` | `#8b8471` | `#8E88A0` |
| `ink/hairline` | `#a49d87` | `#6E687F` |

**Group: `line/`** (type: Color)
| Variable | Light | Night |
|---|---|---|
| `line/solid` | `#cfc7b0` | `rgba(240,235,221,.2)` |
| `line/dashed` | `#d5cdb5` | `rgba(240,235,221,.16)` |
| `line/sidebar` | `#c9c1aa` | `rgba(240,235,221,.14)` |
| `line/card` | `#e0d8c2` | `rgba(240,235,221,.12)` |
| `line/goal` | `#dcc48e` | `rgba(228,195,107,.45)` |

**Group: `accent/`** (the seven botanical accents + goal/gold — type: Color)
| Variable | Light | Night | Used for |
|---|---|---|---|
| `accent/sage` | `#8A9A7E` | `#A8C09A` | Plant / leaves, primary green |
| `accent/moss` | `#7A946E` | `#8FB098` | Projects (Wisteria) |
| `accent/terra` | `#B5654A` | `#E29473` | CTA / alert — the one warm color |
| `accent/blossom` | `#D4A8B0` | `#E9BFC5` | Tasks (Cherry) |
| `accent/lavender` | `#A8A0BE` | `#C0B7E0` | Calendar (Daisy) |
| `accent/hydrangea` | `#9AB4BE` | `#A9C5D3` | Inbox |
| `accent/buttercream` | `#D4C78A` | `#E8DCA0` | Docs / Review (Fern) |
| `accent/clover` | `#C9A0A0` | `#DDB3B3` | Chat |
| `accent/gold` | `#9a7b3a` | `#E4C36B` | Goal-of-day emphasis |
| `accent/gold-warm` | `#C9A55A` | `#C9A55A` | Washi-tape gold (same both modes) |

Plus paired **text-on-tint** colors used inside chips (`accent/lavender-text`, `accent/sage-text`, `accent/hydrangea-text`, `accent/clover-text`, `accent/buttercream-text`) — Light/Night values are in `colors.css` / `colors.dark.css` if you want the exact pairs; functionally each is just a darker (light mode) or lighter (night mode) reading of its accent, tuned for contrast on that accent's 15–20%-alpha chip background.

**Group: `signal/`** — `signal/overdue` and `signal/streak` both alias `accent/terra` (Light) / `#E4C36B` gold (Night, streak only — overdue stays terra-derived `#E29473`); `signal/done` aliases `ink/body` (Light) / `ink/body`-night (Night). In Figma, make these **variable aliases** (a variable whose value is "another variable") rather than duplicate hex values — that's the direct equivalent of the CSS `var(--ink-body)` reference chain, and it's how you keep "done" always matching body-ink if body-ink ever moves.

**Group: `check/`** — checkbox states: `check/border` (`#b3ac95` / `rgba(168,192,154,.65)`), `check/bg` (alias to `paper/bone`), `check/fill` (alias to `accent/sage`), `check/mark` (alias to `paper/parchment` Light / `paper/linen` Night).

### Collection: `Spacing`
Single mode. Type: Number (Figma lets you bind a Number variable directly to padding/gap/corner-radius fields on a frame).
`sp-1`=4, `sp-2`=8, `sp-3`=12, `sp-4`=16, `sp-5`=20, `sp-6`=24, `sp-7`=28, `sp-8`=32, `sp-10`=40, `sp-12`=48, `sp-16`=64.
Semantic aliases (variable-to-variable, same as the color aliases above): `gap-tight`→16, `gap-default`→24, `gap-section`→40, `gap-major`→64. Card padding presets: `pad-card-sm`→14, `pad-card`→22, `pad-card-lg`→28.

### Collection: `Radius`
Single mode, Number type. `radius-sharp`=3 (cards — **this is not a rounded-modern UI**, keep repeating that to yourself when it's tempting to bump it to 8 or 12), `radius-input`=6 (nav links, checkbox), `radius-md`=8 (form inputs), `radius-pill`=999 (buttons only).

### Collection: `Typography`
Number-type variables for the scale, so type styles can reference them instead of hardcoding sizes (optional but keeps things consistent if the scale ever shifts): `fs-display-xl`=44, `fs-display-l`=26, `fs-lead`=18, `fs-body`=14.5, `fs-caption`=12.5, `fs-mono`=10.5, `fs-mono-xs`=9.5.

---

## 2. Text styles

Figma **Text styles** (not variables — Figma doesn't support variable-bound font family/weight yet the way it does color/number) for each named role below. Name them with the `role/case` convention so the Assets panel groups them sensibly.

Four font families total — install/link all four before starting: **Source Serif 4** (display), **Inter Tight** (UI/body), **Courier Prime** (mono/metadata), **Caveat** (handwritten marginalia). All four load from Google Fonts in the web build; in Figma just search each by name in the font picker.

| Style name | Family | Weight | Size | Line height | Letter spacing | Case |
|---|---|---|---|---|---|---|
| `Display/XL` (page title) | Source Serif 4 | 500 | 44–52px | 1.0 (tight) | -0.015em | — |
| `Display/L` (card title) | Source Serif 4 | 600 | 22–26px | 1.0–1.3 | -0.015em | — |
| `Display/Lead` | Source Serif 4 | 600 | 18px | 1.3 | -0.015em | — |
| `Body/L` | Inter Tight | 400 | 16px | 1.5 | — | — |
| `Body/Default` | Inter Tight | 400 | 14.5px | 1.4 | — | — |
| `Body/Small` | Inter Tight | 400 | 13.5px | 1.4 | — | — |
| `Body/Caption` | Inter Tight | 400/500 | 12.5px | 1.4 | — | — |
| `Mono/Label` (section labels, timestamps) | Courier Prime | 400 | 11px | 1.3 | 0.18–0.22em | UPPERCASE |
| `Mono/Metadata` (card metadata strips) | Courier Prime | 400 | 9.5–10px | 1.3 | 0.12–0.18em | UPPERCASE |
| `Hand/Marginalia` | Caveat | 400–500 | 16–22px | 1.3 | — | — |

**The rules to encode as a Figma component-description or a sticky note on the type page** (these are content/usage constraints Figma variants can't enforce automatically, so they need to be documented, not built):
- Never combine a large display size with a bold/600+ weight — "big is quiet."
- Metadata (`Mono/*`) is always uppercase and tracked wide; never mixed-case mono.
- `Hand/Marginalia` (Caveat) is an aside only — at most one per card, never inside a button/label.
- No text ever goes darker than `ink/body` (`#2a2420`) — there is no pure black in this system.

---

## 3. Effect styles (shadows)

Figma **Effect styles** support stacking multiple shadow layers inside one style — use that, because every shadow here is genuinely two effects (a crisp near-edge shadow + a soft ambient one), not one blurry drop-shadow:

| Style name | Layer 1 (crisp) | Layer 2 (ambient) |
|---|---|---|
| `Shadow/Crisp` | Y1 Blur2 `rgba(60,52,38,.12)` | — |
| `Shadow/Card` | Y1 Blur2 `rgba(60,52,38,.14)` | Y5 Blur12 `rgba(60,52,38,.08)` |
| `Shadow/Panel` | Y1 Blur2 `rgba(60,52,38,.14)` | Y10 Blur26 `rgba(60,52,38,.10)` |
| `Shadow/Goal` | Y1 Blur2 `rgba(60,52,38,.14)` | Y8 Blur20 `rgba(154,123,58,.14)` |
| `Shadow/Popover` | Y2 Blur3 `rgba(60,52,38,.12)` | Y24 Blur60 `rgba(60,52,38,.20)` |
| `Shadow/CTA` | Y2 Blur4 `rgba(120,60,40,.30)` | — |

Make a second set for Night mode (`Shadow/Card — Night` etc.) since Figma effect styles don't support modes the way variables do — Night shadows are deeper/cooler (`rgba(0,0,0,…)` base) and the CTA/Goal styles gain a companion **glow** style instead of relying on shadow alone:
- `Glow/Firefly` (Night only): two stacked drop shadows, Blur12 + Blur24, `rgba(246,226,140,.85)` / `.35` — used behind fireflies/emphasis dots at night.
- `Glow/Window` (Night only): Blur40 `rgba(228,195,107,.12)` — ambient warm glow behind lit elements.

Two more effect styles worth setting up even though they're textures, not shadows:
- **Paper noise** — there's no Figma-native fractal-noise filter, so import the noise as a **static PNG/SVG texture image**, apply it as a full-canvas rectangle above every screen frame, set blend mode to **Multiply**, opacity **50%**. This is the literal equivalent of the CSS `body::before` noise overlay — don't skip it, it's core to the "warm paper" read, not decoration.
- **Card tilt** — not an effect style, a **rotation value** applied per-frame: alternate `-0.3° / -0.5° / -0.8°` and `+0.3° / +0.5° / +0.8°` across cards for a "pasted-in" feel. Rotate the whole card frame in Figma (not just its shadow) so the shadow's angle looks physically consistent.

---

## 4. Spacing, radius & grid

- Base unit **4px**, not 8px — don't default to a stock 8pt grid. Card gaps/section rhythm run 16 / 24 / 40 / 64.
- Corner radius scale is small and squarish on purpose: **3px for cards** (the signature "this isn't a rounded-modern UI" value), 6px for nav-link/checkbox shapes, 8px for form inputs, and **999px (pill) reserved for buttons only**. If you're about to set a card's corner radius to anything above 3px, that's a deviation — flag it rather than defaulting to Figma's usual 8/12/16 rounding habits.
- Card padding presets: 14 / 22 / 28px (small / default / large).

---

## 5. Components (Component Sets + Variants)

Build each of these as a Figma **Component Set** with a **Variant** property where the DC file shows multiple states side by side, and as a plain single **Component** where it doesn't. Bind every fill/stroke/text style to the variables/styles above — don't hardcode a hex inside a component.

### `Button` — variant property `Type`: Primary / Secondary / Ghost
- **Primary**: pill (`radius-pill`), fill `accent/terra`, text color `paper/parchment`, `Mono` not used here — label uses `Body/Default`-ish 13px Inter Tight, `Shadow/CTA` effect, one leading icon slot (component: instance-swap property for the icon).
- **Secondary**: pill, 1px stroke `line/solid`, fill `paper/bone`, text `ink/body`, `Shadow/Crisp`.
- **Ghost**: no fill/stroke, text `ink/muted`, no shadow.
- House rule to note in the component description: **one Primary/terra button per screen** — Secondary and Ghost are unlimited.
- Add hover/press as additional variant states if you want Figma prototyping to demo them: hover = translateY(-1px) + scale 1.01 (recreate as a slightly-offset auto-layout position or just note it can't be done with static variants and belongs in a prototype smart-animate instead); press = scale 0.97.

### `Chip` — variant property `Kind`: Tasks / Inbox / Routed / Overdue / Outline
- Filled kinds: pill shape, `radius-pill`, background = the accent's 15–20%-alpha tint (not the raw accent — **never fill a chip with a raw accent color**, always the washed/tinted version), text = that accent's paired `-text` variable, `Mono/Metadata` style, uppercase.
- `Outline` kind: no fill, 1px stroke `line/solid`, `radius-sharp` (3px, square-ish, not pill) — this one is visually distinct on purpose (a plain tag vs. a status chip).

### `Task Row` — variant property `State`: Open / Done
- Auto-layout row: checkbox (17×17, `radius-input`-ish 5px corner, 1.5px stroke `check/border`) + text column (title `Body/Default` + metadata row: colored dot + project name + duration, all `Mono/Metadata`) + optional star icon (`accent/terra`, priority marker).
- **Done** variant: checkbox filled `check/fill` with a ✓ mark in `check/mark`, title text strikethrough and recolored to `ink/hairline`, metadata row hidden.
- Divider: 1px dashed `line/dashed` between rows (Figma: dashed stroke on a horizontal line/frame border, not a drawn line layer, so it stays with auto-layout reordering).

### `Section Label` — single component (not a variant set)
Row: `Mono/Label` text (uppercase, tracked) + a flexible dashed rule (auto-layout "fill container" horizontal line, 1px, `line/dashed`) + optional trailing "View all →" link (`Mono/Metadata`, `ink/faint`). House rule: **max 4 section labels per screen** — put this in the component description so it surfaces in the Assets panel.

### `Goal Card` — single component (feature card, not a variant — there's only ever one per screen)
- Background `paper/goal`, 1px stroke `line/goal`, `Shadow/Goal`, `radius-sharp`, rotated **-0.4°**.
- Washi tape: a small rectangle (~82×19px) positioned overlapping the card's top edge, fill `accent/gold-warm` at ~42% opacity with a repeating diagonal stripe pattern (Figma: an image fill of a generated stripe texture, or a rotated-hatch vector — there's no native repeating-gradient fill in Figma the way CSS has `repeating-linear-gradient`).
- A small pill label ("✶ Goal of the day") pinned near the top-left, fill `accent/gold`, text `#FBF4E0`-equivalent, `Mono/Metadata`.
- A checkbox slot, a title (`Display/Lead`, weight 600, custom warm-dark color `#4a3a1e` — this one deliberately isn't `ink/body`, it's a special warmer tone reserved for this card), a caption line (`Mono/Metadata`, `accent/gold`), and a botanical image slot (instance-swap property pointing at the Clover/four_leaf illustration) in the trailing corner.
- House rule: **at most one Goal card per view.**

### `Botanical Illustration Frame` — one Component Set per species (see §6), each with a variant property `Stage`
Shared shell across all seven: `paper/parchment` card, 1px stroke `line/card`, `Shadow/Card`, `radius-sharp`, centered image slot (image fill, bottom-aligned, drop-shadow effect `Shadow/Drop-sm` — a single soft shadow under the illustration itself, separate from the card's own shadow), a small colored dot (fill = that species' accent) + surface name (`Display/L` small, 16px/600), plant name caption (`Mono/Metadata`), and a one-line "what this state means" caption (`Body/Caption`).

---

## 6. The seven botanical species (Component Sets, variant property = `Stage`)

Each is its own Component Set; the `Stage` variant swaps the image fill (use an **instance-swap property** or just separate variants each with its own placed image — instance-swap is cleaner if you're also using these standalone elsewhere). Import the corresponding PNGs from `ds/assets/<species>/` as the fills.

| Species | Surface | Driven by | Stages (variant values) |
|---|---|---|---|
| **Hydrangea** | Inbox | pending count | `zero` (trophy bloom) → `light` (1–4) → `medium` (5–19) → `heavy` (20+) |
| **Cherry blossom** | Tasks | completion | `bud` (not started) → `opening` (in motion) → `bloom` (the day's work, waiting) → `fallen` (done) |
| **Daisy** | Calendar | time of day, not data | `morning` → `midday` → `evening` → `past` (muted) → `future` (tight bud) |
| **Fern** | Review · Journal · Library | length/progress | `coil` (empty) → `unfurl1` → `unfurl2` → `full` (complete) |
| **Clover** | Chat · rituals · people | attention | `resting` (quiet) → `awake` (unread) → `dewdrop` (a mention) → `seedling` (empty/first-run) → `four_leaf` (milestone) |
| **Vine** | Routines | streak length | `bare` (none) → `sprouting` (a few days) → `flowering` (established) → `lush` (30d+) |
| **Wisteria** | Projects | weighted milestone % | `p0` → `p20` → `p40` → `p60` → `p80` → `p100` |

`Clover/four_leaf` doubles as **Today**'s "terrarium" icon (all plants together, the day's overall state) — that's a second usage of the same asset, not an eighth species; note it as an alias in the component description rather than duplicating the component.

Extra directional/mirrored assets exist in the library beyond what the DC page documents (`cherry/bloom-right`, `bud-right`, `half-right`; `vine/leaf-left`, `leaf-right`) — these are used elsewhere in the live app (calendar mirroring, etc.), not part of the canonical stage set above. Import them into the same component's assets if you're rebuilding those screens too, but they're not additional `Stage` variants.

There are also three asset families in `ds/` that never made it into the Design System page at all — `envelope/` (front, back, back-open-full, stamp), `seal/` (intact, broken-left, broken-right), and `tools/pen.png`. These belong to the onboarding/quick-capture "letter" motif. Worth a note to Kai rather than silently including them: **should these get a §08 in the DC file**, or are they intentionally out of the canonical system doc?

**Rule to carry over, verbatim, as a component-set description**: the stage shown must always match the underlying data — a `zero` bloom instance should never be placed next to copy implying pending items. This is a content-authoring rule, not something Figma variants enforce on their own.

---

## 7. Motion (for prototype/handoff notes, not static Figma objects)

Figma variants/effects are static; motion has to live as **prototype smart-animate settings** or as a note in the component description for whoever builds it in code. Durations: 120ms (hover/press) · 150ms (chips, checks) · 200ms (nav, overlays) · 300ms (panels, toasts) · 600ms (flower crossfade, "bloom") · 800ms (vine/streak growth, "grow"). Budget: **≤2 continuous ambient animations per screen**, everything respects reduced-motion. If you set up Smart Animate transitions between `Stage` variants, use an ease-out curve (not linear) to match the "gentle, nothing snappy" brief.

---

## 8. House rules (put these as a sticky-note frame on the Cover page)

**Always**: semantic tokens/variables only, never a raw hex pasted into a layer · one terra CTA + at most one gold Goal card per view · each surface keeps its own accent color · metadata is always mono/uppercase/tracked.

**Never**: pure white or true black anywhere · card corner radius above 3px (pill is for buttons only) · washi tape on a plain list item · invented flower species · more than 4 section labels per screen · a growth stage that contradicts its underlying data.
