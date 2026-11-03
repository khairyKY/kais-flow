# 2026-11-03 18:15 · handoff · widgets-v2: no flowers, a Day / Night choice, app-or-website clicks, 1.1 package, Mac widgets

Branch `claude/widgets-v2` (from the 1.6.1 release line, where desktop-widgets 1.0 is already merged). Not merged, not released. Nothing in Kai's live Rainmeter folder was changed, loaded or refreshed; I only read it (to confirm where 1.0 keeps the link, and to borrow his fonts for the previews).

Builds on `2026-10-30-0010-desktop-widgets-handoff.md` (the Rainmeter look) and `2026-10-29-2330-widget-feed-handoff.md` (the feed).

## What changed (Windows, Rainmeter 1.1)

1. **No flowers.** Removed the header flowers, the goal card's bud and the 1×1 cherry. `Plants/` (14 images), `KFPlant`, `GoalBud`, `PlantX/Y`, the `PLANT` table and the plant code in `make-assets.sh` are gone. The only images left are `grain.png` and `tape.png`. Kept: paper on glass, SF Pro, palette C, the grain.
   - Header icons use the app's line style (`kf-clock`, `kf-calendar`), drawn as Rainmeter shapes in the muted ink: Today **sun**, Now + next **clock**, Day bar and Next **calendar**. The Goal 1×1 has none, because its stamp already has the ✶.
   - A ticked goal shows the filled sage check, the title struck through, and the stamp **✶ DONE**.
2. **Theme: Auto / Day / Night.** Right-click menu items `Theme: Auto (7 PM - 6 AM)`, `Theme: Day`, `Theme: Night`. A pick writes `%APPDATA%\Rainmeter\KaisFlow-theme.txt` (Rainmeter's own settings folder, which no package install touches), then tells all five skins (`!CommandMeasure MeasureKF "LoadTheme()" <config>`) to read it and redraw, and the widget you used shows a note ("Theme: Night"). Auto is the 1.0 rule (`NightFrom`/`NightTo`, 19 and 6). Unreadable file = Auto.
3. **Clicks open the desktop app, else the website.** New `[MeasureApp]` and `[MeasureAppValue]` Registry measures read `HKEY_CLASSES_ROOT\kaisflow` (the merged view of `HKCU\Software\Classes` and `HKLM\Software\Classes`): the subkey list, and the default value, so a registration with either counts. `widget.lua`'s `Go(what)` refreshes both measures at each click (the app may be installed later), then runs `kaisflow://<path>` or `https://kais-flow.kaidagoat.workers.dev/<web path>`.

   | Click | App link | Website |
   |---|---|---|
   | Context menu "Open Kai's Flow" | `kaisflow://today` | `/today` |
   | A Top 3 row, a task row, the goal card | `kaisflow://task/<id>` | `/tasks/<id>` |
   | `+` on Today | `kaisflow://capture` | `/new` (the web app has no `/capture`) |
   | The running or next block (Now + next, Day bar, Next) | that block's `task/<id>`, else `calendar` | `/tasks/<id>` or `/calendar` |
   | The day bar's track | `kaisflow://calendar` | `/calendar` |

   `Go('focus')` is supported (`kaisflow://focus`, `/focus`) but no widget calls it yet. The `kaisflow://` scheme and its paths come from the other builder's app change; I only use `today`, `calendar`, `task/<id>`, `capture`, `focus`. Clicking a tick box ticks and doesn't open anything.
4. **Package `Kais-Flow-widgets-1.1.rmskin`** (`MergeSkins=1`, `Version=1.1`), which upgrades 1.0 in place.
   - **Where 1.0 kept the link:** `Glass\@Resources\KaisFlow\link.txt` (confirmed present on Kai's PC; contents not read). The package never contained it, so a 1.0 reinstall never lost it either.
   - **Now:** the link lives in `%APPDATA%\Rainmeter\KaisFlow-link.txt`, next to the theme file. On first run 1.1 reads the old `link.txt` once and copies it across, so Kai pastes nothing. A link in the settings folder wins. `build-rmskin.mjs` refuses to pack anything named `link.txt`, `theme.txt` or `KaisFlow-link/theme.txt`, and `read-rmskin.mjs` checks that.
   - Leftover: the installer only adds and replaces, so 1.0's `@Resources\KaisFlow\Plants\` stays on his disk until he deletes it (INSTALL.md says so).
   - `RMSKIN.ini` has no `VariableFiles`, so a hand edit of `NightFrom`/`NightTo` in `KaisFlow.inc` is replaced on upgrade. INSTALL.md says to use Theme: Day / Night for a lasting choice.

## What was built (Mac, Übersicht 1.0)

`desktop/ubersicht/`: five widgets with the same look and data, no flowers.

- **Source** `src/core.jsx` (one file: the shell command, state, feed parsing, palette C table, the five widget bodies, the CSS). `tools/build.mjs` bundles it with esbuild (from `app/node_modules`) into `dist/Kais-Flow/kais-flow-<widget>.widget/index.jsx`, one standalone JSX file per widget (each Übersicht widget folder is loaded alone), plus `kaisflow.config.json` and `INSTALL.md`, and zips them as `Kais-Flow-mac-widgets-1.0.zip` (forward slashes, 0644/0755 modes, LF text).
- **Config** `kaisflow.config.json` (one file for all five): `link`, `theme` (`auto`/`day`/`night`), `appUrl`, `nightFrom`, `nightTo`, and `positions` (x, y per widget; defaults are the Windows left column). Found by the command in `./`, `../`, `~/Library/Application Support/Übersicht/widgets/Kais-Flow/` and `~/`.
- **Data** The widget's `command` is a `/bin/sh` script on a 60 s refresh: it finds the config, reads the link with `sed`, runs `curl` against it, and checks for the app (`/Applications/Kai's Flow.app`, `~/Applications`, then `mdfind` for `com.kaisflow.garden`). It prints marker lines, then the config, the app flag and the feed. Only an `https://` link, or `localhost`, is ever fetched.
- **Ticking** `run()` + `curl -s -f -m 20 -X POST '<link>&tick=<id>'`. Optimistic like the skins: the box fills at once; a POST without `"done"` takes it back with a note; then the widget re-runs its command. A read-only link says so and doesn't POST.
- **Clicks** The same table as the Windows skins, through `run('open "…"')`: `kaisflow://…` when the app is found, else the website.
- **Glass** `backdrop-filter: blur(36px) saturate(1.5) brightness(1.2)` under the 76% paper, with grain and a bright rim, CSS ported from `design-export/Desktop widgets.html` direction B. Day and Night tokens as in the app.
- **Fonts** The Mac's own SF Pro; Source Serif 4 and Courier Prime if installed, else New York and Menlo. Not bundled.
- Clean-up of messages is the same as Windows (no link, bad config, 401, offline, 429, can't read), with "Open it" opening the config in the default text editor.

## Evidence

- **Rainmeter** `FENGARI=… node desktop/rainmeter/tools/check.mjs`: **143/143** (was 106). Kept or updated: files, includes and fonts, rows, ticks, hover, night, errors. New: no plant art or mention anywhere and only `grain.png` and `tape.png` left; the four header icons; ticked goal = filled check + Done; the link is saved in the settings folder (not beside the skins), 1.0's `link.txt` is still used and copied once, the package ships no link or theme file; Auto follows the clock, Day and Night are fixed, SetTheme writes the file, tells all five skins, shows the note, and LoadTheme switches another skin at once; the menu has the three Theme items, each calling SetTheme, titles ≤ 30 characters; app installed (subkeys, or default value only) opens `kaisflow://…`, not installed opens the website, for today, calendar, focus, capture, a task, a row, the goal card, + and blocks; no click still uses `AppURL` directly.
- **`.rmskin`** `node read-rmskin.mjs`: **14/14** (footer key, flags, size = zip length, CRC of every entry, backslash names, `RMSKIN.ini` Version 1.1 / MergeSkins 1 / Load Today, no VariableFiles or Backup, only `Glass\KaisFlow` and `Glass\@Resources\KaisFlow` written, 15 files byte-equal to source and none left out, only the two images, no link or theme file, `widget.lua` UTF-16 LE with BOM). Read again with .NET `ZipArchive`: 16 files, 0 mismatches, footer 67,610 + 16 = 67,626 bytes. Neither the live Glass set's other skins nor `GlassVars.inc` are in it. Kai's live `Glass\KaisFlow` exists (1.0), so this is an in-place upgrade.
- **Previews** `docs/log/assets/desktop-widgets/preview/`: `day`, `night` (Theme: Night forced at 2 pm), `ticked`, `hover`, `setup`. The old `compare-*` images are gone: the design they compared against has the flowers.
- **Mac** `node desktop/ubersicht/tools/check.mjs`: **30/30**. The real `command` runs in bash against a local fake feed (config found, link read, feed fetched, app flag, no config, bad JSON, non-https link, 401, 429, 404 page, v2, server down, a bad fetch keeps the day, the script writes nothing), then the state machine, ticks, link table (app and website), and Auto/Day/Night at 14:00, 21:00, 05:00 and 06:30 on the feed's own zone. `node desktop/ubersicht/tools/shots.mjs`: **30/30** in headless Chrome, each widget rendered from the real command's output on `sample-feed.json`: text of every widget, the five at the Windows set's positions and sizes, `backdrop-filter`, grain and rim, hover "Open ↗", tick (curl POST text, optimistic, 3 of 5, the 1×1 goal filled check + Done, self-refresh), failed tick, read-only link, clicks on the website and with the app, night palette, both setup states, no page errors, no `<img>` anywhere. Screenshots in `docs/log/assets/mac-widgets/` (`day`, `night`, `ticked`, `hover`, `setup`, `setup-link`, and `widgets/<name>.png` each alone).
- **Package** `Kais-Flow-mac-widgets-1.0.zip` read back with Python `zipfile`: `testzip()` clean, 7 files, modes 0644/0755, LF text.
- **Gate** (`gate.ps1`; `app/` is untouched, so this confirms nothing moved): vitest **2724/2724** ×4 TZ (Cairo, UTC, Los Angeles, Tokyo), lint 0, build ok, ds:check 0 new. `birthday_on` 1/1 in `types.ts` / `settings.ts`. No edge function or migration touched, so no deno check or rehearsal.
- **Copies** `D:\Coding\Kais-Flow-widgets-1.1.rmskin` and `D:\Coding\Kais-Flow-mac-widgets-1.0.zip` (the 1.0 rmskin still sits there beside it).

## Not verified (no Rainmeter, no Mac here)

Written the documented way; if one misbehaves on first load it is a one-line fix.

- **Rainmeter:** (1) the Registry measure with `HKEY_CLASSES_ROOT`, `OutputType=SubKeyList`, and `UpdateDivider=-1` plus `!UpdateMeasure` at click time; (2) a quoted string through `SKIN:Bang('"https://…"')` runs as a URL; (3) `SKIN:ReplaceVariables('#SETTINGSPATH#')`; (4) `!CommandMeasure MeasureKF "LoadTheme()" <config>` reaching the other skins; (5) with 8 context items Rainmeter folds the menu under "Custom skin actions" (its docs: more than 3 items), so Theme is three plain items there, not a nested "Theme →" submenu (Rainmeter has none), and no item shows a tick for the current choice; the note says it instead.
- **Übersicht:** (1) the command-result event is treated as any event with a string `output` (so `UB/COMMAND_RAN` and our own), (2) the command's working directory is unknown, so the config is searched in four places, (3) JSX is shipped uncompiled with no React import (Übersicht's documented style), (4) `backdrop-filter` blurring the wallpaper in Übersicht's web view (WebKit does it through the window server; unproven here), (5) `mdfind`/`open -t`/`open` on a real Mac.

## For Kai

1. Double-click `Kais-Flow-widgets-1.1.rmskin` and Install. Your link and positions stay. Right-click any widget to try Theme. Then delete `@Resources\KaisFlow\Plants\`.
2. On a Mac: INSTALL steps are in `Kais-Flow/INSTALL.md` inside the zip.
3. Merge needs the app's `kaisflow://` change (other builder) to make the app half of the clicks do anything; until then the Registry check finds nothing and clicks open the website.

## Leftovers
- After a tick, the Mac widgets refresh themselves at once; the other four catch up within 60 s (the Windows skins refresh all five together).
- `docs/ROADMAP.md` is not touched, to avoid conflicts with parallel builders. Add a changelog line when merging.

## Rebuild
```
cd desktop/rainmeter/tools
python gen-skins.py                    # after a layout change
FENGARI=<fengari dir> node check.mjs
FENGARI=<fengari dir> node preview.mjs ../../../docs/log/assets/desktop-widgets/preview
node build-rmskin.mjs ../../../docs/log/assets/desktop-widgets/Kais-Flow-widgets-1.1.rmskin
node read-rmskin.mjs ../../../docs/log/assets/desktop-widgets/Kais-Flow-widgets-1.1.rmskin

cd ../../ubersicht/tools               # needs `npm ci` in app/ (esbuild, react), bash + curl, Chrome
node check.mjs
node shots.mjs ../../../docs/log/assets/mac-widgets
node build.mjs ../../../docs/log/assets/mac-widgets
```
