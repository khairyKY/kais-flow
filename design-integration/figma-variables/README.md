# Importing these into Figma Variables

Figma has no built-in "import JSON" button in the base app — variable import is plugin-only, and there is no plugin (that we've found) with a file picker either. The plugin this data is written for — **"Variables Import Export"** by jake-figma ([github.com/jake-figma/variables-import-export](https://github.com/jake-figma/variables-import-export), the multi-mode-capable fork of Figma's own official sample) — has a **paste-into-textarea** UI: you copy a file's JSON text, paste it into a box, pick/type a Collection + Mode, and click Import. There's no "select files" step to batch.

## Install the plugin (it's a dev sample, not searchable in Community)

1. On the GitHub page above: green **Code** button → **Download ZIP** → unzip anywhere.
2. Figma **desktop app** → open any file → Figma icon (top-left) → **Plugins → Development → Import plugin from manifest…** → select the `manifest.json` you unzipped.
3. It now runs from **Plugins → Development → Variables Import Export → Import Variables**.

## Only 3 pastes needed, not 5

Every token in this system is either a **color** or a **number** (the only two types this plugin's format supports, plus aliases) — and one paste = one Collection + one Mode, whatever's nested inside it. So spacing, radius, and typography-as-numbers are combined into one file since they all land in one collection with one mode anyway. Colors need two separate pastes only because they need two different **modes** (Light/Night) inside the *same* collection.

1. **Color — Light**: open the file, copy all of `color.light.json`, paste into the textarea → Collection `Color` (new) → Mode `Light` (new) → Import.
2. **Color — Night**: copy all of `color.night.json` → same run, but now pick the *existing* `Color` collection from the dropdown, and type a new Mode `Night` → Import. Same variable names as step 1, so this adds the second mode to the variables you just made instead of duplicating them.
3. **Foundations**: copy all of `foundations.json` → Collection `Foundations` (new) → Mode `Value` (new) → Import. This creates `spacing/*`, `radius/*`, and `typography/*` variables in one shot.

After step 2, toggle the `Color` collection's mode per-frame in Figma to preview Light vs. Night.

## What's in each file

- `color.light.json` / `color.night.json` — every color token from `ds/tokens/colors.css` / `colors.dark.css`: paper grounds, ink, lines, the block/calendar tints, the ten botanical accents, signal colors, checkbox colors, plus the semantic aliases (`bg-app`, `text-primary`, `border-default`, etc.) as real Figma **variable aliases** pointing at the primitives — matching the CSS's own `var(--x)` chains, not duplicated hex.
- `foundations.json` — `spacing/*` (the 4px scale + gap/padding aliases), `radius/*` (the four corner-radius values, including the 3px "this isn't a rounded-modern UI" card radius), `typography/*` (font sizes, weights, line-heights, letter-spacing as plain numbers you can bind directly to a shape's width/height/radius/gap fields, or to Figma's numeric type-size binding).

**Units aren't carried through this JSON format** — under `typography/fs/*` values are px, `fw/*` and `lh/*` are unitless, `ls/*` are em. Font family itself (Source Serif 4 / Inter Tight / Courier Prime / Caveat) can't be a Figma Variable at all — that's a Text Style, already speced out in `../FIGMA-REBUILD-GUIDE.md` §2.

## Left out on purpose

- Shadows (`--shadow-*`), the paper-noise texture, and the night-only glows (`--firefly`, `--star`, `--glow-*`) aren't colors or numbers — the importer only supports those two types plus aliases. They're Effect Styles / image textures instead; see `../FIGMA-REBUILD-GUIDE.md` §3.
- Motion durations/easings — not a Figma Variable concept; see the same guide's §7.

## If Import still errors

Tell me the exact error text. Two likely causes if it's not a plain JSON-syntax complaint:
- The textarea's Import button silently requires a non-empty Collection **name** even when picking an existing collection from the dropdown — if the name input is still showing empty/disabled oddly, click the dropdown option again before submitting.
- Pasting truncated content (the files are a few hundred lines) — copy the whole file, not a selection.
