# Kai's Flow desktop widgets: how to install

Five widgets in your Glass set, in the "Paper on glass" look: Today (big), Now + next, Day bar, Goal, Next.

**Wait for Kai's Flow 1.6.1.** The widgets read a feed that goes live with that release. Before then they say "Can't read Kai's Flow right now".

## 1. Install

1. Double-click **`Kais-Flow-widgets-1.0.rmskin`**.
2. Rainmeter's installer opens. Click **Install**.
   - It only adds new files: `Glass\KaisFlow\` and `Glass\@Resources\KaisFlow\`.
   - Your Clock, Agenda, Media, Sukoon and CGM skins stay as they are. So does `GlassVars.inc`.
3. The **Today** widget appears in the top-left corner.
4. Load the other four:
   - right-click any widget, then **Glass → KaisFlow**;
   - pick **NowNext**, **DayBar**, **Goal** and **Next**, then click the `.ini` under each one.
   - Each one moves to its own spot in the left column. You can drag them, and they snap to the grid like your other Glass widgets.

## 2. Make your link in Kai's Flow

1. Go to **Settings → App & updates → Windows desktop**.
2. Give the link a name (for example "Desktop").
3. Turn on **Allow ticking**, so you can tick tasks off from the desktop.
4. Click **Create link**, then **Copy link**. Kai's Flow shows the link only this once.

## 3. Paste it into a widget

1. Click **Add my link** on any widget.
2. Paste the link (Ctrl+V) and press **Enter**.
3. All five widgets pick it up. You don't need to paste it into each one.

To change the link later, right-click a widget and choose **Add or change my Widget link**.

## 4. Remove the old export

The old hourly script used the master database key. You don't need it any more.

1. **Delete this file:**
   `Documents\Rainmeter\Skins\Glass\@Resources\kais-flow-export.ps1`
2. **Delete this folder:**
   `Documents\Rainmeter\Skins\Glass\@Resources\KaiFlow\`
   - Mind the spelling: it's **KaiFlow**, not the new **KaisFlow**.
   - No skin uses it. It holds old TSV files from 11 October and copies of the flower pictures.
3. **The scheduled task:** none was found. On 30 October, `schtasks` listed no "kais-flow-export" task; the only match was "Akiflow agenda sync", which is a different job. Keep that one.
4. **Old Kai's Flow skins:** there are none to remove. Your Glass set only has Clock, Agenda, Media, Sukoon and CGM (CGM is unloaded), and no skin loads the old KaiFlow folder.

## Good to know

- **Ticking:** click a box and it ticks straight away. If Kai's Flow doesn't accept it (for example, ticking is off for this link), the tick goes away and a short note says why.
- **Clicking:** a row, the goal card or **+** opens Kai's Flow.
- **Night colours:** the Night Garden colours show from 7 pm to 6 am. To change the hours, edit `NightFrom` and `NightTo` in `Glass\@Resources\KaisFlow\KaisFlow.inc`, then right-click a widget and choose **Refresh skin**.
- **New wallpaper:** right-click a widget and choose **Rebuild glass**, as with your other Glass widgets.
- **Try it with sample data:** set `FeedURL=sample` in `KaisFlow.inc` to see a sample day. To go back to your own day, set `FeedURL=` with nothing after it. Refresh the skins after either change.
