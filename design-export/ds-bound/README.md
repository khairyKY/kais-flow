# ds-bound — Kai's Flow design system, "Bound Journal" copy

A copy of `../ds/` with **direction B, Bound Journal**, applied (chosen by Kai, 2026-10-14). The original `../ds/` and the app (`app/src/styles/tokens/`) are untouched.

- **Look at it:** open `preview.html`. Day and Night Garden sit side by side, built only from these tokens. If the fonts or the flower don't load, serve the folder: `python -m http.server 8768 --directory design-export`, then open `http://localhost:8768/ds-bound/preview.html`.
- **Use it:** load `ds-bound/styles.css` instead of `ds/styles.css`. **Every token name from `ds/` still exists**, so nothing that reads them breaks. 21 tokens are new.
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
| Type | Inter Tight, sentence case. Metadata reads `--font-mono`, which is now the interface face, untracked | Serif body; Caveat (`--font-hand`); Courier Prime only as a date stamp (`--font-stamp`, tracked `--ls-stamp`) |
| Colour | Terra is the one action colour; selection is ink-filled (`--sel-bg` / `--sel-ink`) | Gold, botanical accents |

## What changed (old → new)

**Colours, day** (`tokens/colors.css`)

The paper stays `ds/`'s warm cream: canvas `#EFE9DB`, surfaces `#FBF6E9`, bone `#F6F0E1`, sidebar `#EAE3D2`, and the warm hairlines (Kai, 2026-10-14: "what happened to the main color?" — an earlier cut of B had a cooler near-white `#F2EFE8` / `#FBFAF6`). B only adds:

| Token | Old | New |
|---|---|---|
| Unchanged | | all paper and hairlines, goal paper, all ink, accents, signals, block tints, stars |

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
| `--capture-size` | `56px` | `56px` — unchanged (Kai 2026-10-15 denied the flat 48) |

**Depth and texture** (`tokens/effects.css`)

| Token | Old | New |
|---|---|---|
| `--shadow-card`, `--shadow-crisp` | two-part warm shadow | `none` |
| `--shadow-cta` | terra drop | `none` (CTA buttons are flat) |
| `--shadow-capture` | — | NEW · the old terra drop, for the capture button only |
| Unchanged | | `--shadow-goal`, popover, panel, sheet, toast, tab bar, scrim, noise, tilts |

**Type** (`tokens/typography.css`)

| Token | Old | New |
|---|---|---|
| `--font-mono` | `'Courier Prime', …` | `var(--font-ui)`: it is the metadata role, so every metadata style turns Inter Tight at once |
| `--font-stamp` (new) | | `'Courier Prime', …`: the only typewriter, for date stamps on pages |
| `--ls-mono-tight` / `--ls-mono` / `--ls-mono-wide` | `0.12` / `0.18` / `0.22em` (phone `0.05` / `0.07` / `0.07em`) | `0` |
| `--ls-meta` | `0.12em` (phone `0.06em`) | `0` |
| `--ls-stamp` / `--ls-eyebrow` (new) | | `0.12em` / `0.08em` |
| `--fs-meta` / `--fs-meta-l` (desktop) | `10px` / `10.5px` | `12px` / `12.5px` |
| `--fs-meta` / `--fs-meta-l` (phone) | `12px` / `12.5px` | `12.5px` / `13px` |
| Unchanged | | Source Serif 4, Inter Tight and Caveat; desktop sizes; mono sizes; Caveat sizes |

**New tokens (20):** `--wash-terra` (D13: the soft terra wash, day `rgba(181, 101, 74, 0.12)` · night `rgba(226, 148, 115, 0.12)` — `--acc-terra` at 12%), `--page-paper`, `--page-line`, `--page-rule`, `--bg-page`, `--border-page`, `--sel-bg`, `--sel-ink`, `--tab-active-bg`, `--radius-card`, `--radius-page`, `--radius-block` (12px, calendar blocks and time slots), `--radius-check` (7px), `--shadow-page`, `--grain-app` (0), `--grain-page` (1 by day, 0 at night), `--font-stamp`, `--ls-stamp`, `--fs-section` (14px), `--ls-eyebrow` (0.08em).

**Not changed:** `fonts.css`, `motion.css`, `motion-interactions.css`, `icons/`.

## What components still have to do

Tokens can't carry these. **In the app (branch `claude/bound-journal`) they are done**: the values are in `app/src/styles/tokens/`, and the rules below are folded into the components (the reskin of 15–16 Oct retired the interim `bound.css`): a page's paper, corner and grain are `.kf-page` in `app/src/features/projects/xfx.css`; metadata's even digits are one rule in `app/src/styles/tokens/typography.css`. Pages carry the class `kf-page`: the goal card (Today, phone and desktop), the journal writing and quote cards, the notebook paper, the Library's open note and open quote, and the Herbarium's specimens and sheets. Copy written for CSS caps was capitalised in the source. The phone page title stays 26px because Today's title shares its row with three buttons.

The rules:

1. **Pages** switch to `--radius-page`, `--bg-page` / `--paper-goal`, `--border-page` / `--line-goal` and `--shadow-page` / `--shadow-goal`, and draw grain at `opacity: var(--grain-page)`. Tape and `--tilt-*` go on pages only.
2. **The app root** draws its grain layer at `opacity: var(--grain-app)` (0), so the canvas is clean.
3. **Metadata** keeps reading `--font-mono` (now Inter Tight) and drops `text-transform: uppercase`; the `--ls-mono*` tracking tokens are 0. One uppercase eyebrow per screen at most (`--ls-eyebrow`).
4. **Section labels** use `--fs-section` semibold, sentence case, with an optional quiet count or link on the right.
5. **Checkboxes** move from `--radius-input` to `--radius-check`.
6. **Selection** (chips, segments, the chosen date) uses `--sel-bg` / `--sel-ink`, not a second accent.
7. **The tab bar** keeps Kai's Flow's own icons (`kf-today`, `kf-inbox`, `kf-calendar`, `kf-more`), drawn flat, with `--tab-active-bg` behind the active one and the terra capture button inline (`--capture-size` 56, `--shadow-capture`).
8. **Calendar blocks and time slots** use `--radius-block`. Open slots keep the dashed `--line-dashed` outline.

## Assets

The flower art (`../ds/assets/`, 11 MB) is unchanged by B, so it isn't duplicated here. Point asset paths at `../ds/assets/`. If this copy ever replaces `ds/`, move `assets/` across with it.

## Kai's answers (15 Oct 2026, `Design System B.html`)

Approved: D1 tools and pages · D2 colour unchanged · D3 rounded tools, near-square pages · D4 flat tools · D5 metadata in Inter Tight, sentence case · D6 section labels · D7 tape, tilt, grain, hand on pages only · D8 solid hairlines · D10 the Akiflow calendar · D12 chips with a visible edge (selection ink-filled).

Denied: D9 — the capture button stays 56px with its terra shadow (`--shadow-capture`).

D11 buttons: **B** — 12px corners, 44px drawn (48 hit on the phone), flat; secondary is a bone tone with no outline; the text button is terra. Kai liked C too: D13 proposes it as the tonal tier (open).

D13, approved (Kai, 2026-10-16): **C inside B · tonal**. B stays the button; the kit's `Button variant="tonal"` (`.kf-button--tonal`) is B's shape filled with `--wash-terra` in `--acc-terra-ink`, for an action that matters but isn't the view's one terra action (an empty state's suggestion; the conductor moves Replan all and a row's Plan ▾ onto it). The same wash is the terra text button's hover and pressed fill.
