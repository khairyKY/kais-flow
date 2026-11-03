# Kai's Flow desktop widgets for Mac (Übersicht)

Five widgets in the "Paper on glass" look: Today (tick things off), Now + next, Day bar, Goal, Next.
They are free. They need the free **Übersicht** app, and your Kai's Flow **Widget link**.

## 1. Get Übersicht (once)

1. Download **Übersicht** from https://tracesof.net/uebersicht/ (it is free).
2. Open the download, drag **Übersicht** into **Applications**, and open it.
   - If macOS says it can't check the app: right-click Übersicht, choose **Open**, then **Open** again.
3. A small icon appears in the menu bar. Your desktop now shows widgets (there are none yet).

## 2. Put the widgets in

1. Click the Übersicht icon in the menu bar, then **Open Widgets Folder**.
2. Unzip `Kais-Flow-mac-widgets-1.0.zip`.
3. Drag the whole **Kais-Flow** folder into the Widgets folder.
   - It holds five `.widget` folders and one file, `kaisflow.config.json`. Keep them together in that folder.

The widgets appear straight away and say "Add your Kai's Flow Widget link".

## 3. Make your link in Kai's Flow

1. In Kai's Flow, go to **Settings → App & updates → Windows desktop**. (The link works on a Mac too.)
2. Give it a name, for example "Mac desktop".
3. Turn on **Allow ticking**, so you can tick tasks off from the desktop.
4. Click **Create link**, then **Copy link**. Kai's Flow shows the link only this once.

## 4. Paste it in

1. Open `Kais-Flow/kaisflow.config.json` in TextEdit (right-click, **Open With**, **TextEdit**).
   - Or click the **Open it** button on any widget.
2. Replace `PASTE YOUR WIDGET LINK HERE` with your link. Keep the quote marks around it.
3. Save. The widgets pick it up within a minute (or choose **Refresh All Widgets** from the Übersicht icon).

All five widgets read this one file. You paste the link once.

## Day or night

In the same file, change `"theme"` to:

- `"auto"`: night colours from 7 PM to 6 AM (the hours are `nightFrom` and `nightTo`), day colours otherwise;
- `"day"`: always day colours;
- `"night"`: always night colours.

## Move a widget

The `"positions"` part of the same file has an `x` and a `y` for each widget (pixels from the top-left of the screen). Change them, save.

## Clicks

- A click on a task, the goal, a block or the **+** button opens it in the **Kai's Flow** desktop app, if it is installed on this Mac.
- If the app is not installed, the same click opens the website, https://kais-flow.kaidagoat.workers.dev.
- A click on a tick box ticks the task, and does not open anything.

## If something looks wrong

| The widget says | What to do |
|---|---|
| Can't find kaisflow.config.json | The file must be in the **Kais-Flow** folder, next to the five `.widget` folders. |
| Add your Kai's Flow Widget link | Step 4. The link must start with `https://`. |
| This link was turned off or mistyped | Make a new link (step 3) and paste it in. |
| Ticking is off for this link | In Kai's Flow, turn on **Allow ticking** for the link (Settings → App & updates → Windows desktop). |
| Offline / Can't read Kai's Flow right now | Check your internet, then click **Try again**. |

## Fonts (optional)

The widgets use your Mac's own font (SF Pro). The goal title and the date look best with **Source Serif 4**, and the little label on the goal card with **Courier Prime**. Both are free from Google Fonts. Without them the widgets fall back to the Mac's New York and Menlo fonts.

## Remove

Delete the **Kais-Flow** folder from the Widgets folder. Nothing else was installed. In Kai's Flow, Revoke the link (Settings → App & updates → Windows desktop) if you don't want it to work any more.
