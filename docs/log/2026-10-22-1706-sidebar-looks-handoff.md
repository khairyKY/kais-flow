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
- `kf-clipboard` (was `kf-review` here; renamed so it never shadows the design system's own `kf-review`): a clipboard with a tick. It replaces the curl Kai read as "a hook".
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

---

# 2026-10-22 18:16 · build · icons A + bottom B

Kai picked **icons A** and **bottom B**. Both are built on `claude/sidebar-looks`, in commits 2f99e66a, 509b16f8 and c268fdec. The phone is untouched: the sidebar is a computer-only `<aside>` that is hidden at 767px and below, and the phone keeps its own tab bar and More sheet (`MobileTabBar.tsx`).

## What changed

**The kf icon set** (`app/src/components/icons/kf/`)
- Eight new glyphs, added to `ICON_NAMES`: `activity`, `chat`, `clipboard` (Review), `guide`, `library`, `plan`, `signout`, `someday`.

**`AppLayout.tsx`, the nav (icons A)**
- `NavItem` is now `{ to, label, icon, badge? }`.
- Every row draws `<Icon>` at 18px, ink-muted, and ink-body when active. This applies open and on the rail.
- Gone from the nav: the dots, the FlowerIcon glyphs, the NavGlyphs rail glyphs, and the fern, pen and clover PNGs.
- The Plan drawer:
  - Its vine became `plan`.
  - Someday's fern coil became `someday`.
  - The ＋ became `<Icon name="plus">`.
  - Smart lists keep the user's own emoji.
- The `/ds/assets` constant is gone from the shell.

**`AppLayout.tsx`, the header and foot (bottom B)**
- `SideHeader`: the name block is a button that opens the kit `ContextMenu`, with:
  - the streak as its header (`SideStreak`, words only);
  - Settings, with ⌘, as a keycap;
  - Guide;
  - the sync row: a dot plus words, the same states as before (`sideSyncLabel`), which opens the queue popover;
  - Sign out (`useSignOut`, the same flow as before).
- The sync dot rides the app icon.
- On the rail, the header is the app icon on its own.
- `SyncStatus side` now takes a render function. The sidebar's popover draws on `<body>` (`Float`, fixed), placed where the menu was, because the scrolling column would clip it.
- `ToolButton`: a wide Capture button (`openCapture`, with ⌘K keycaps), plus Search and Chat.
  - Hover or focus shows a `.kf-nav-flyout` tip with the name and keycaps: above the button when open, beside it on the rail.
  - The shell's keys are unchanged.

**Removed** (everything the old foot and its pinned streak needed)
- `StreakWidget`'s vine.
- The foot's six rows: `footerRow`, its glyphs, the `.kf-settings-row` / `.kf-side-sync` button.
- The container-query rules that squeezed the six-row foot.
- The `.app-vine` sway, and its night silhouette in `night.css`.
- `NavGlyphs.tsx` keeps only what `MobileTabBar` imports.
- The tour's sidebar line now says "Capture, Search and Chat wait at the foot; Settings and the Guide, under your name."

**`Icon.tsx`: a real bug, fixed where every caller goes through**
- React 19 compares `dangerouslySetInnerHTML` by object identity. It rewrote each glyph's markup on every re-render, so a press on a rail icon (which re-renders on hover and focus for its label) lost its mousedown node and never became a click.
- `Icon` now hands React one fixed `{ __html }` per glyph.

**My call (Kai can overrule):** hovered nav icons no longer sway like clover. The sway was a plant motion on what are now flat tool icons, and it made the icon "unstable" under a pointer.

## Gate (app/)

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | 2330 / 2330 (169 files) |
| `npm run lint` | 0 errors (24 warnings, none in touched files) |
| `npm run build` | ok, entry 361.8 kB |
| `npm run ds:check -- --baseline scripts/ds-baseline.json` | 0 new (8 fixed since) |
| `grep -c birthday_on app/src/lib/types.ts` / `'birthday_on: false' settings.ts` | 1 / 1 |

## Harnesses

All runs used the mock dev server `npx vite --port 5297 --strictPort --mode mock --host ::`, warmed first and stopped after. The four existing suites were run one at a time, with output in the scratchpad so their committed screenshots stay as they were.

| Harness | Result | Notes |
|---|---|---|
| **sidebar-ab** (new) | **258 / 258** | `docs/log/assets/sidebar-ab/verify.mjs`, screenshots beside it |
| today-shell | 86 / 86 | updated |
| desktop-polish | 150 / 150 | updated. First run: the task editor's Time field timed out on a cold load. It passed when re-run alone, then 150/150 with the real file. |
| smart-lists | 41 / 41 | unchanged |
| polish | 62 / 62 | unchanged |

What sidebar-ab covers:
- Day and night × 100 / 125 / 150% × open and rail.
- 13 rows, each with its line icon.
- No image or dot in the sidebar.
- A click on an icon navigates.
- Capture, Search and Chat open their surfaces; the tooltips show their keycaps.
- The name menu: the streak, and Settings, Guide, Synced (popover) and Sign out, each of which works.
- Ctrl+K, Ctrl+/, Ctrl+J and Ctrl+, still work.
- The open Plan drawer.
- The phone: the sidebar is hidden and the tab bar shows.

How the two existing harnesses were updated:
- **today-shell:** the old sidebar was asserted in four places.
  - The streak is read from the name menu (it was the foot's `.app-vine`).
  - "● synced" is the app icon's dot plus the menu's "Synced" row (it was `.kf-settings-row .kf-side-sync`).
  - Offline opens the popover from the menu's "Offline" row.
  - On the rail, the dot sits on the app icon (it was on the gear).
- **desktop-polish:** in §10, the rail's footer probe takes `.app-sidebar-footer button` (it was `.kf-side-row`).

## Screenshots (docs/log/assets/sidebar-ab/)

| What | Files |
|---|---|
| Sidebar | `sidebar-{day,night}-{100,125,150}-{open,rail}.png` |
| Name menu | `menu-{day,night}-{100,125,150}-{open,rail}.png`, `menu-window-day-125.png` |
| Tooltips | `tip-open.png`, `tip-rail.png` |
| Sync popover | `sync-pop-night-125.png` |
| Plan drawer | `plan-open-day-125.png` |
| Phone | `phone-day.png` |

## For the merge with claude/today-scale

My `AppLayout.tsx` changes stay inside:
- the nav table (`TEND` / `CULTIVATE`), `NavRow`'s icon and `PlanDrawer`'s three icons;
- the header (now `SideHeader`) and the foot (now `ToolButton`s);
- `SyncStatus`;
- the sidebar CSS for the old foot, streak and sync.

The short-sidebar `@container` block keeps its column/header/row tightening. Only its `.kf-side-sync` and `.app-vine` lines are gone. A clipping fix that touches the old foot rules should take this branch's version.
