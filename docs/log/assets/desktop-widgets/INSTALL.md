# Kai's Flow desktop widgets: how to install (version 1.1)

Five widgets in your Glass set, in the "Paper on glass" look: Today (big), Now + next, Day bar, Goal, Next.
Version 1.1 has no flowers, a Day / Night choice, and clicks that open the Kai's Flow desktop app.

## 1. Install, or upgrade from 1.0

1. Double-click **`Kais-Flow-widgets-1.1.rmskin`**.
2. Rainmeter's installer opens. Click **Install**.
   - It only adds or replaces files in `Glass\KaisFlow\` and `Glass\@Resources\KaisFlow\`.
   - Your Clock, Agenda, Media, Sukoon and CGM skins stay as they are. So does `GlassVars.inc`.
3. **Upgrading from 1.0?** That is all. The installer replaces the 1.0 files in place.
   - Your **Widget link is kept**. 1.0 saved it in `Glass\@Resources\KaisFlow\link.txt`, and the package never contains that file. The first time 1.1 runs, it copies the link to Rainmeter's settings folder (`%APPDATA%\Rainmeter\KaisFlow-link.txt`), where no install can touch it.
   - The widgets stay where you put them.
   - You don't paste the link again.
4. **New install?** The **Today** widget appears in the top-left corner. Load the other four:
   - right-click any widget, then **Glass → KaisFlow**;
   - pick **NowNext**, **DayBar**, **Goal** and **Next**, then click the `.ini` under each one.
   - Each one moves to its own spot in the left column. You can drag them, and they snap to the grid like your other Glass widgets.
5. Optional tidy-up after upgrading: delete the old folder `Documents\Rainmeter\Skins\Glass\@Resources\KaisFlow\Plants\`. The flower pictures in it are not used any more, and the installer doesn't delete files.

## 2. Make your link in Kai's Flow (new install only)

1. Go to **Settings → App & updates → Windows desktop**.
2. Give the link a name (for example "Desktop").
3. Turn on **Allow ticking**, so you can tick tasks off from the desktop.
4. Click **Create link**, then **Copy link**. Kai's Flow shows the link only this once.

## 3. Paste it into a widget (new install only)

1. Click **Add my link** on any widget.
2. Paste the link (Ctrl+V) and press **Enter**.
3. All five widgets pick it up. You don't need to paste it into each one.

To change the link later, right-click a widget and choose **Add or change my Widget link**.

## Day or night

Right-click any widget. In the menu (it's under **Custom skin actions** if Rainmeter folds it) pick:

- **Theme: Auto (7 PM - 6 AM)**: Night Garden colours at night, day colours otherwise. This is how 1.0 worked.
- **Theme: Day**: always the day colours.
- **Theme: Night**: always the Night Garden colours.

All five widgets change at once, and a short note says which one you picked. The choice is remembered across refreshes, restarts and upgrades. It is saved in `%APPDATA%\Rainmeter\KaisFlow-theme.txt`.

## Clicks

- A click on a task, the goal, a block, the day bar or **+** opens it in the **Kai's Flow desktop app**, if that is installed. The widget looks for the app's `kaisflow://` link in Windows' registry, each time you click.
- If the app is **not** installed, the same click opens the website, https://kais-flow.kaidagoat.workers.dev.
- Right-click → **Open Kai's Flow** opens Today.
- A click on a tick box ticks the task, and does not open anything.

## Remove the old export (if you haven't yet)

The old hourly script used the master database key. You don't need it any more.

1. **Delete this file:**
   `Documents\Rainmeter\Skins\Glass\@Resources\kais-flow-export.ps1`
2. **Delete this folder:**
   `Documents\Rainmeter\Skins\Glass\@Resources\KaiFlow\`
   - Mind the spelling: it's **KaiFlow**, not the new **KaisFlow**.
   - No skin uses it. It holds old TSV files from 11 October and copies of the flower pictures.
3. **The scheduled task:** none was found. On 30 October, `schtasks` listed no "kais-flow-export" task; the only match was "Akiflow agenda sync", which is a different job. Keep that one.

## Good to know

- **Ticking:** click a box and it ticks straight away. If Kai's Flow doesn't accept it (for example, ticking is off for this link), the tick goes away and a short note says why. A ticked goal shows a filled check and "Done".
- **New wallpaper:** right-click a widget and choose **Rebuild glass (new wallpaper)**, as with your other Glass widgets.
- **Night hours for Auto:** edit `NightFrom` and `NightTo` in `Glass\@Resources\KaisFlow\KaisFlow.inc`, then right-click a widget and choose **Refresh skin**. A newer package version puts the 7 PM and 6 AM back, so use **Theme: Day** or **Theme: Night** if you want a lasting choice.
- **Try it with sample data:** set `FeedURL=sample` in `KaisFlow.inc` to see a sample day. To go back to your own day, set `FeedURL=` with nothing after it. Refresh the skins after either change.
