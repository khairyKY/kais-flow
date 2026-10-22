---
date: 2026-10-22
session: sidebar-looks (designer-builder, worktree .claude/worktrees/sidebar-looks, branch claude/sidebar-looks from v1.3.0)
type: options
related: Kai 22 Oct, "I don't like the icon set that we have for the sidebar" + "I don't like this last screenshot" (the sidebar's bottom)
---

# 2026-10-22 17:06 · options · sidebar looks

This is a looks-only page for Kai to pick from by eye. **Nothing is built** and `app/` is untouched.

- **Page:** `design-export/Sidebar options.html`. Open it from disk. It has a Day / Night Garden toggle, and `?night` opens it at night.
- **How Kai picks:** he chooses one option in each section, then presses "Copy my pick", which gives for example "Sidebar icons: B · bottom: A".
- **Screenshots:**
  - `docs/log/assets/sidebar-looks/sidebar-options-day.png`
  - `docs/log/assets/sidebar-looks/sidebar-options-night.png`
  - Both are full-page shots from headless Chrome, with no console errors.

## 1 · Icon sets

Each option is drawn four ways: the open sidebar and the rail, each by day and by night, shown side by side. The drawings use the app's default 125%, and Calendar is the active row.

| | Look | What goes |
|---|---|---|
| A | One kf line icon on every row, the same pen as the rest of the app. | All watercolour/PNG species, the FlowerIcon glyphs, the dots. |
| B | The same icons as A. The active row gets a small five-petal flower (`kf-bloom`) tucked on its icon's top-right corner. The flower is in the row's accent, with a gold-warm centre. | Every other flower and every dot. |
| C | The same icons as A, each on a 26px tile washed in the row's current dot colour: `color-mix(var(--acc-*) 24%)`, and 46% on the active row. The rows are 4px tighter, so the column stays the same height. | Flowers and bare dots. The colours stay. |

**Common to all three:**
- On the rail, a hairline now splits Tend from Cultivate.
- The Plan drawer's vine PNG becomes `kf-plan`.

**Icon map.** Reused from the kf set:
- today
- inbox
- calendar
- tasks
- projects
- routines
- focus
- journal
- people
- `delete` for Trash
- settings
- search
- plus
- chevdown

**New icons** are in `design-export/sidebar-icons/`. Each is a 24 grid, stroke 1.6, round:
- `kf-review`: a clipboard with a tick. It replaces the curl Kai read as "a hook".
- `kf-library`
- `kf-activity`
- `kf-plan`: for the Plan drawer.
- `kf-someday`: an archive box. It is meant for the open drawer's fern-coil PNG and is not drawn on the page.
- `kf-chat`
- `kf-guide`: a question mark in a circle. It is no longer a book, so Guide doesn't echo Journal.
- `kf-signout`
- `kf-bloom`: B only. Filled, accent through `currentColor`.

Note: the "brown dot and grey dot" on Kai's rail are **Activity** (`--acc-gold`) and **Trash** (`--ink-hairline`). They are not domains.

## 2 · Bottom section

All three bottom options use set A's icons, so the two picks are independent.

**How it is drawn:**
- Each option is shown in a window 720px tall, at 125% and at 150%. That is 576 and 480 layout px. Each zoom shows the open sidebar and the rail.
- The app's short-sidebar tightening (rows at 6px padding) applies.
- Under each drawing is a measured count: how many of the 13 pages fit before the column scrolls.

| | Look | Fit (open 125 / rail 125 / open 150 / rail 150) |
|---|---|---|
| A | The streak becomes one faint text line, with no twig. Below it, one row of six icon buttons: Capture, Search, Chat, Guide, Settings (with the sync dot) and Sign out. Keycaps appear only in a hover tooltip. | 7 / 9 / 5 / 6 |
| B | The bottom is one wide Capture button (⌘K keycaps), with Search and Chat beside it. The header becomes "Kai's Flow ▾", and its menu holds the streak, Settings ⌘,, Guide, "Synced · all caught up" and Sign out. The sync dot sits on the K. | 8 / 10 / 5 / 8 |
| C | A search field (⌘/), a terra `+` for Capture (the kit's one action fill) and Chat move under the header. The foot is a streak chip, Guide and Settings (with the dot). Sign out moves into Settings, which doesn't have it yet. | 7 / 9 / 5 / 7 |

**What the counts show:**
- At 150% the open sidebar fits 5 pages whichever bottom Kai picks. The header and the Plan drawer cost more height than the bottom does.
- The rail is where the bottom options differ.
- If Kai wants more in view at 150%, the next lever is the header and Plan. That is a separate decision and is not drawn here.

## Rules kept

- No colour value was changed. Everything is ds-bound tokens.
- The night frost values (`--frost-bg`, `--frost-line`, `--shadow-frost`, `--glow-dot`) are copied from `app/src/styles/tokens/colors.dark.css`. ds-bound doesn't carry them.
- The day panels keep the day tokens when the page is flipped to night: they are copied from `:root` at load.
- There are no Sukoon components.
- There is no watercolour anywhere in A, B or C.

## Deviation

The brief named `design-export/Delete task options.html` as the pattern, but it doesn't exist on this branch or on master. I followed `Subtasks options.html` (pick bar, "This one", localStorage) and `Bound Journal review.html` (Day / Night Garden toggle) instead.

## For the build, once Kai picks

1. Copy the picked SVGs into `app/src/components/icons/kf/`.
2. Add their names to `ICON_NAMES` in `index.ts`.
3. Swap `NAV` `activeIcon` / `img` / `activeImg` / `dot` in `AppLayout.tsx` for `<Icon>`.
4. Remove the parts of `NavGlyphs.tsx` the sidebar no longer uses. Keep whatever `MobileTabBar.tsx` still imports (`FlowerIcon`, `GuideGlyph`).
5. For the bottom, follow the picked option. Then re-check the `@container kf-sidebar (max-height: 799px)` rules, which exist only to squeeze today's six-row foot.
