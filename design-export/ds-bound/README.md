# ds-bound — Kai's Flow design system, "Bound Journal" copy

A copy of `../ds/` with **direction B, Bound Journal**, applied (chosen by Kai, 2026-10-14). The original `../ds/` and the app (`app/src/styles/tokens/`) are untouched.

- **Look at it:** open `preview.html`. Day and Night Garden sit side by side, built only from these tokens. If the fonts or the flower don't load, serve the folder: `python -m http.server 8768 --directory design-export`, then open `http://localhost:8768/ds-bound/preview.html`.
- **Use it:** load `ds-bound/styles.css` instead of `ds/styles.css`. **Every token name from `ds/` still exists**, so nothing that reads them breaks. 20 tokens are new.
- **Check it:** `python check_contrast.py`. Every text token is at least 4.5:1 and every line or control at least 3:1 on every ground, day and Night Garden (all pass). It also runs against any token folder: `python check_contrast.py ../ds/tokens`.
- **Background:** `D:\Coding\_claude-cloud\kais-flow-design-brainstorm-2026-10-14\NOTES.md`.

## The rule: tools and pages

| | Tools | Pages |
|---|---|---|
| What | Everything you operate: top bars, the tab bar, task lists, Inbox, the calendar grid, sheets, buttons, Settings, and the **Plan your day** and **Shut down** rituals | What you write and keep: the **goal of the day**; **journal entries, notes, quotes**; the **herbarium** of pressed projects |
| Surface | Clean warm canvas, no grain | Paper with grain, ruled lines where you write |
| Corners | `--radius-card` 16px, inner rows 12px, pills and circles | `--radius-page` 6px (paper isn't rounded) |
| Depth | Tone + 1px hairline, **no shadow** | `--shadow-page` |
| Tilt and tape | Never | Allowed: `--tilt-*`, washi tape |
| Type | Inter Tight, sentence case. Metadata is `--font-meta`, untracked | Serif body; Caveat (`--font-hand`); Courier Prime only as a date stamp (`--font-stamp`) |
| Colour | Terra is the one action colour; selection is ink-filled (`--sel-bg` / `--sel-ink`) | Gold, botanical accents |

## What changed (old → new)

**Colours, day** (`tokens/colors.css`)

| Token | Old | New |
|---|---|---|
| `--paper-linen` (app canvas) | `#EFE9DB` | `#F2EFE8` |
| `--paper-parchment` (tool surface) | `#FBF6E9` | `#FBFAF6` |
| `--paper-bone` (inputs, pressed, segmented track) | `#F6F0E1` | `#ECE8DF` |
| `--paper-sidebar` | `#EAE3D2` | `#E9E5DC` |
| `--paper-event` | `#F4EFE0` | `#ECE8DF` |
| `--line-solid` / `--line-dashed` / `--line-sidebar` / `--line-card` | `#cfc7b0` / `#d5cdb5` / `#c9c1aa` / `#e0d8c2` | `#d6d0c4` / `#cfc9bc` / `#dcd6ca` / `#e3ded3` |
| `--check-bg` | `var(--paper-bone)` | `var(--paper-parchment)` |
| `--check-mark`, `--on-terra`, `--badge-ink`, `--toast-ink`, `--swipe-left-ink` | `#FBF6E9` | `#FBFAF6` |
| Unchanged | | goal paper, all ink, accents, signals, block tints, stars |

**Colours, night** (`tokens/colors.dark.css`): **Night Garden, unchanged** (Kai, 2026-10-14: "revert the dark mode to the old night light"). Every value is `ds/`'s. B only adds:

| Token | Night value |
|---|---|
| `--page-paper` / `--page-line` / `--page-rule` | `#2C2740` (a moonlit sheet, one step above the `#262233` panel) / cream at .16 / cream at .09 |
| `--sel-bg` / `--sel-ink` | `var(--ink-body)` / `#211D30` (cream-filled selection) |
| `--tab-active-bg` | `var(--paper-bone)` |
| `--shadow-card`, `--shadow-crisp`, `--shadow-cta` | `none` (tools are flat) |
| `--shadow-page` | the old night card shadow |
| `--grain-app`, `--grain-page` | `0` |

**Shape** (`tokens/spacing.css`)

| Token | Old | New |
|---|---|---|
| `--radius-sharp` | `3px` | `var(--radius-card)` = 16px (name kept for old code) |
| `--radius-input` | `6px` | `12px` |
| `--radius-md` | `8px` | `12px` |
| `--sheet-radius` | `8px` | `20px` |
| `--capture-size` | `56px` | `48px` (flat in the tab bar) |

**Depth and texture** (`tokens/effects.css`)

| Token | Old | New |
|---|---|---|
| `--shadow-card`, `--shadow-crisp` | two-part warm shadow | `none` |
| `--shadow-cta` | terra drop | `none` |
| `--focus-ring` inner | `#FBF6E9` | `#FBFAF6` |
| Unchanged | | `--shadow-goal`, popover, panel, sheet, toast, tab bar, scrim, noise, tilts |

**Type** (`tokens/typography.css`)

| Token | Old | New |
|---|---|---|
| `--fs-meta` / `--fs-meta-l` (desktop) | `10px` / `10.5px` | `12px` / `12.5px` |
| `--fs-meta` / `--fs-meta-l` (phone) | `12px` / `12.5px` | `12.5px` / `13px` |
| `--ls-meta` | `0.12em` (phone `0.06em`) | `0` |
| `--fs-display-xl`, `--fs-page-title` (phone) | `26px` | `30px` |
| Unchanged | | the four typefaces, desktop sizes, mono sizes (now for stamps), Caveat sizes |

**New tokens (19):** `--page-paper`, `--page-line`, `--page-rule`, `--bg-page`, `--border-page`, `--sel-bg`, `--sel-ink`, `--tab-active-bg`, `--radius-card`, `--radius-page`, `--radius-block` (12px, calendar blocks and time slots), `--radius-check` (7px), `--shadow-page`, `--grain-app` (0), `--grain-page` (1 by day, 0 at night), `--font-meta`, `--font-stamp`, `--fs-section` (14px), `--ls-eyebrow` (0.08em).

**Not changed:** `fonts.css`, `motion.css`, `motion-interactions.css`, `icons/`.

## What components still have to do

Tokens can't carry these. Whoever builds B applies them:

1. **Pages** switch to `--radius-page`, `--bg-page` / `--paper-goal`, `--border-page` / `--line-goal` and `--shadow-page` / `--shadow-goal`, and draw grain at `opacity: var(--grain-page)`. Tape and `--tilt-*` go on pages only.
2. **The app root** draws its grain layer at `opacity: var(--grain-app)` (0), so the canvas is clean.
3. **Metadata** uses `--font-meta` in sentence case: drop `text-transform: uppercase`. One uppercase eyebrow per screen at most (`--ls-eyebrow`).
4. **Section labels** use `--fs-section` semibold, sentence case, with an optional quiet count or link on the right.
5. **Checkboxes** move from `--radius-input` to `--radius-check`.
6. **Selection** (chips, segments, the chosen date) uses `--sel-bg` / `--sel-ink`, not a second accent.
7. **The tab bar** keeps Kai's Flow's own icons (`kf-today`, `kf-inbox`, `kf-calendar`, `kf-more`), drawn flat, with `--tab-active-bg` behind the active one and the terra capture button inline (`--capture-size`, no shadow).
8. **Calendar blocks and time slots** use `--radius-block`. Open slots keep the dashed `--line-dashed` outline.

## Assets

The flower art (`../ds/assets/`, 11 MB) is unchanged by B, so it isn't duplicated here. Point asset paths at `../ds/assets/`. If this copy ever replaces `ds/`, move `assets/` across with it.
