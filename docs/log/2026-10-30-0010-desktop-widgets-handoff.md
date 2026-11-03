# 2026-10-30 00:10 · handoff · desktop-widgets: Kai's Flow as Rainmeter Glass skins (direction B)

Branch `claude/desktop-widgets` (from `claude/kai-bugs-1012`). Not merged, not released. Nothing in Kai's live Rainmeter folder was changed, loaded or refreshed; I only read it.

These are the LOOK side of the desktop widgets, on top of the widget-feed handoff (`2026-10-29-2330-widget-feed-handoff.md`).

- **Look:** Kai's pick, **B · Paper on glass** (`design-export/Desktop widgets.html`), in **SF Pro** like his Glass skins. It has:
  - warm parchment at 76% over his blurred-wallpaper glass, with a grain layer and a brighter rim;
  - palette C blocks and dark ink;
  - a flower in each header;
  - the goal's cherry going from bud to bloom on a tick;
  - Night Garden colours from 19:00 to 06:00.
- **Install:** `docs/log/assets/desktop-widgets/Kais-Flow-widgets-1.0.rmskin`. Kai's steps are in `docs/log/assets/desktop-widgets/INSTALL.md`.

## What's built

| Piece | Where |
|---|---|
| 5 skins | `desktop/rainmeter/Glass/KaisFlow/{Today,NowNext,DayBar,Goal,Next}/*.ini`, sized for the Glass grid: Today 360×360; Now + next and Day bar 360×170; Goal and Next 170×170. They include his `GlassVars.inc`, `Snap.inc` and `GlassCard.inc` (backdrop crop, sheen, rim) as-is. On first load each skin moves to the design's spot in the empty left column (20,20 · 20,400 · 20,590 · 20,780 · 210,780), and from then on Snap keeps it on the grid. Context menu: Open Kai's Flow, Add or change my Widget link, Rebuild glass. The .ini files come from `tools/gen-skins.py`, because the six Today rows repeat. |
| Shared bits | `desktop/rainmeter/Glass/@Resources/KaisFlow/`:<br>• `KaisFlow.inc`: variables, the WebParser feed, the RunCommand tick, the InputText "Add my link", MeterStyles.<br>• `Paper.inc`: paper, grain and flower, clipped in their own container above the paper.<br>• `Top.inc`: the B rim, the message and button, the tick note.<br>• `widget.lua`: one script for all five; its `Widget` variable picks the layout.<br>• `kaisflow.lua`: the feed handoff's parser, byte-identical.<br>• `Plants/`, `grain.png`, `tape.png`.<br>• `Fonts/CourierPrime-Regular.ttf` plus its OFL licence.<br>• `sample-feed.json`. |
| Assets | `tools/make-assets.sh` (magick and fontTools):<br>• plants from his `@Resources\KaiFlow` PNGs, sized 1:1 to where they're drawn with a 10 px margin;<br>• night copies with the design's `--plant-filter` (×0.6 brightness, 75% saturation, lavender glow);<br>• washi tape and grain;<br>• Courier Prime from the app's `@fontsource` copy. |
| Package | `tools/build-rmskin.mjs`:<br>• a zip holding `RMSKIN.ini` and `Skins\Glass\KaisFlow\…` and `Skins\Glass\@Resources\KaisFlow\…`, with backslash names as Rainmeter's packager writes them;<br>• then the 16-byte footer: int64 zip size, a flags byte (0), `RMSKIN\0`;<br>• `RMSKIN.ini`: `MergeSkins=1` (add to Glass; don't back it up and replace it), `LoadType=Skin`, `Load=Glass\KaisFlow\Today\Today.ini`, `MinimumRainmeter=4.5.0`;<br>• it never packs `link.txt`, so a reinstall keeps the saved link. |
| Checks | `tools/check.mjs` with `tools/skin.mjs`. `skin.mjs` is a small Rainmeter stand-in: it parses the .ini with its @Includes and MeterStyles, then runs the real `widget.lua` in fengari against a fake `SKIN` with a fixed clock and zone. |
| Preview | `tools/preview.mjs` draws every visible meter at its final X/Y/W/H in Chrome, from the .ini plus what the Lua set:<br>• String, Shape (Rectangle, Ellipse, Line, Path, LinearGradient), Image (crop, tiling, alpha);<br>• containers, InlineSetting/InlinePattern, ClipString 1 and 2.<br>The backdrop is made with make-backdrop.ps1's magick recipe. GetH is measured in a first pass. Output is in `docs/log/assets/desktop-widgets/preview/`. |

### Data and ticking
- **Feed URL.** `FeedURL=` empty (the default) uses the Widget link saved by "Add my link". `FeedURL=sample` uses the shipped sample. Any other value is used as-is (`https://` or `file:///`). That one variable is the whole switch.
  - In sample mode a tick shows but nothing is posted.
- **Where the link lives.** It's kept in `@Resources\KaisFlow\link.txt`, written by Lua (`io.open`), so all five skins share it. `!RefreshGroup KaisFlow` follows a save. Junk pastes are refused with a note.
- **Ticking is optimistic.** The box fills, the title strikes through and the count goes up at once. Then:
  1. `!SetOption MeasureTick Parameter` gets `K.tickCommand(link, id)` (curl.exe `-s -f -X POST …&tick=`);
  2. `!UpdateMeasure`, then `Run`;
  3. on finish, output without `"done"` takes the tick back with a note;
  4. then all five configs get `!CommandMeasure MeasureFeed Update`.
- **Ticking limits.**
  - Ticks queue one at a time.
  - A read-only link (`can_tick: false`) doesn't post; it shows "Ticking is off for this link".
  - Done picks can't be re-ticked, because the feed has no untick.
  - A pending tick clears once the feed has it (done, or gone from the open lists), or after 120 s.
- **States.**
  - No link: "Add your Kai's Flow Widget link" + **Add my link**.
  - 401: "This link was turned off or mistyped" + Add my link; this also clears the day.
  - Not JSON, a 404 (feed not deployed yet) or `v ≠ 1`: "Can't read Kai's Flow right now" + Try again.
  - Offline: "Offline" + Try again.
  - 429: keeps the last day; with no day yet it shows "Too many refreshes".
  - A bad fetch after a good one keeps the last good day on screen.

### Deviations / simplifications (ponytail)
- **Encoding.** His `.ini`/`.inc` files are plain ASCII/UTF-8 without a BOM, not UTF-16 as the brief said. I checked all of them, so mine match: ASCII with `[\x….]` char refs.
  - What is UTF-16 LE in his set is `agenda.lua`. Its own note says Rainmeter only hands Lua UTF-8, keeping Arabic and emoji titles, when the script is UTF-16 LE. So **`widget.lua` is UTF-16 LE with a BOM**, and its code is ASCII using UTF-8 byte escapes.
  - `kaisflow.lua` stays ASCII, because `dofile` reads raw bytes.
  - `.gitattributes` keeps `widget.lua` byte-exact.
- **Fonts.**
  - SF Pro Display for text, at weights 400, 500 and 700. His set has no 600, so the design's 600 labels are 700.
  - Source Serif 4 (his variable TTF) at 600 for the date and goal title.
  - Courier Prime for the stamp, letter-spacing 1 px instead of 1.14, so "✶ GOAL OF THE DAY" fits the 1×1.
- **Meta on rows.** The feed's Items have no time or duration. A row shows "● 3:30 PM" in its block colour only when a now or next block is that task, and is otherwise empty.
- **Tomorrow.** The design's "Tmrw" fallback is dropped; the feed has no tomorrow. An empty next shows "Nothing else today".
- **Custom colours.** A custom (non-palette-C) block colour's text is its hex mixed 55% into the body ink. The app works out an AA tone in OKLCH for these. Palette C and the nine legacy colours use the exact tokens; the legacy-to-nearest-swatch map was computed once with `blockHue.ts`'s maths.
- **Clock and markers.**
  - Night and "now" use this PC's clock, which assumes the PC's zone is the account's zone (both Cairo).
  - Sunrise and sunset on the Day bar are fixed marks at 7am and 5:05pm, as in the design.
- **Box shadows.** The goal card's shadow is a 1 px offset rect; Rainmeter shapes have no blur shadow. There's no tick "pop"; the design notes allow that.
- **Refreshing all five.** It's one `!CommandMeasure … Update <config>` per config. A config that isn't loaded logs a harmless "skin not found" line in Rainmeter's log.
- **ROADMAP.** `docs/ROADMAP.md` is not touched, to avoid a conflict with parallel builders.

### Rainmeter behaviour I relied on but could not run
Each one is written the documented or common way. If one misbehaves on first load, it is a one-line fix:

1. A meter in a `Container` is drawn at the container's place in the z-order. That's why `KFClip` sits after the paper; `GlassBackdrop` in `GlassMask` works the same way in his set.
2. `!SetOption` on a measure takes effect without `DynamicVariables`, given an `!UpdateMeasure`.
3. `ClipString=2` with `W` and `ClipStringH` auto-sizes the height, and `GetMeter():GetH()` reads it after `!UpdateMeter`. The Today goal card grows from one to two lines this way, and the Next 1×1 colour bar follows its title.
4. `InlinePattern` with a capture group styles only the group.
5. A Shape filled at alpha 1 (rows at rest) still takes the mouse.
6. `SKIN:Bang('[!Delay 5000][!HideMeter KFNote][!Redraw]')` runs as an action list.
7. Variable fonts. `LocalFont` registers `SourceSerif4-var.ttf`, and `FontWeight=600` reaches the Semibold instance through DirectWrite.

## Evidence
- **`node desktop/rainmeter/tools/check.mjs`** (FENGARI = scratch fengari): **106/106**.
  - **Files:** every .ini/.inc is ASCII.
    - `widget.lua` is UTF-16 LE with a BOM and ASCII inside.
    - `kaisflow.lua` is ASCII and identical to the handoff's.
    - Per skin, all @Includes resolve (package or his Glass `@Resources`), along with every ImageName, ScriptFile and LocalFont. Meter and measure types are valid and MeterStyles exist.
    - Every section the Lua touches exists in that skin. Every image the Lua picks exists, and so does every plant name, day and night.
  - **Today:**
    - header "Thursday 29 / Today · 1 of 5 done";
    - goal card and stamp "✶ GOAL OF THE DAY · 1:30–3:00 PM";
    - rows: 2 Call Omar, 3 Gym (done, struck through, sage box), the "Today's tasks 2" label, Pay rent, Water the plants, rows 5–6 hidden;
    - a 2-line goal moves the rows down 18 px;
    - six tasks fill 5 rows, with the footer "Overdue 3 · Also open 7 ›".
  - **Ticks:**
    - The goal shows done at once: stamp DONE, strike-through, bud → `cherry-bloom-bud.png`, 2 of 5.
    - The curl parameter and the SetOption → UpdateMeasure → Run order are checked.
    - Success refreshes all five. Failure reverts and shows a note. Once the feed has the tick there is no double count.
    - A read-only link refuses with a note, and a done pick can't be re-ticked.
    - Sample mode reads `file://…sample-feed.json` and ticks without curl.
  - **Hover:** the row lifts, the box darkens and "Open ↗" shows. Moving from the row onto its box keeps it lifted, and leaving settles it.
  - **Goal 1×1:**
    - `cherry-opening-54.png` turns into `cherry-bloom-54.png` on a tick, and into the `-night` copy at night;
    - with no goal: "No goal picked yet", no box.
  - **Now + next:** "Now · 1:30–3:00 PM", "1h left", a progress fill of 109.3/328, Cornflower block `Fill 222,228,234 / edge 129,173,237,115 / ink 50,83,131` (worked by hand), and at 16:15 it shows "free" with Deep work next.
  - **Day bar:**
    - 6 shapes;
    - the goal block at x 133.3, w 30.8, colour 213,197,230;
    - the now line at 142.5.
  - **Next:** "Next · in 1h 30m", Standup, 3:30–4:00 PM, "Then 4:30 · Deep work"; the bar follows the title height.
  - **Night (21:40):** Night Garden paper `38,34,51,194`, ink, no grain, night terra, night plants, night sage boxes, night palette C accents (101,121,161,115). It's day again at 06:40.
  - **Link:** no link → message + Add my link, content hidden. First load moves the skin to its spot. A saved link enables the feed. Save writes `link.txt` and refreshes the group; junk is refused.
  - **Errors:** 401, HTML, 429 and v2 messages; offline; a bad fetch after a good one keeps the day; a revoked link clears it.
- **`check-lua.mjs`** (the feed handoff's own): 9/9, still green.
- **The .rmskin**, read back with .NET's `ZipArchive` after stripping the footer:
  - footer size = zip length (227,455 bytes total), flags 0, key `RMSKIN`;
  - 30 files plus RMSKIN.ini, every one CRC-checked and byte-equal to the source;
  - neither `Glass\KaisFlow` nor `Glass\@Resources\KaisFlow` exists in his live set, so nothing is overwritten.
- **Previews** in `docs/log/assets/desktop-widgets/preview/`, the left column at 1:1 on the design's walls:
  - `day.png` and `night.png`;
  - `ticked.png` (goal + Call Omar; the bud and the 1×1 cherry bloom, 3 of 5);
  - `hover.png`;
  - `setup.png` (no link yet);
  - `compare-day.png` and `compare-night.png`: the design's own B (left, its sample data) beside these skins (right, the feed sample). Layout, sizes, plants, tape, blocks and colours line up.
- **Old Kai's Flow bits on his PC** (read-only):
  - no skin config named KaiFlow or KaisFlow exists in `Rainmeter.ini` or the Skins folder;
  - `@Resources\KaiFlow\` holds TSVs last written 2026-10-11 plus the plant PNGs, and no skin reads it;
  - `kais-flow-export.ps1` is still there;
  - `schtasks` shows no kais-flow task, only "Akiflow agenda sync", a different job.

## For Kai
1. When v1.6.1 is out, double-click the .rmskin, then follow `INSTALL.md`. It covers making the link (with Allow ticking), Add my link, and deleting `kais-flow-export.ps1` and `@Resources\KaiFlow\`.
2. This is the first real Rainmeter load. If anything looks off, check Rainmeter's log (About → Log). The 7 behaviours listed above are the places to look first.

## Rebuild
```
cd desktop/rainmeter/tools
bash make-assets.sh                   # only if the art changes
python gen-skins.py                   # after a layout change
FENGARI=<fengari dir> node check.mjs
FENGARI=<fengari dir> node preview.mjs ../../../docs/log/assets/desktop-widgets/preview
node build-rmskin.mjs ../../../docs/log/assets/desktop-widgets/Kais-Flow-widgets-1.0.rmskin
```
