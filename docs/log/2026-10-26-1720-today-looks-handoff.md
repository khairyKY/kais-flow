# today-looks handoff — 2026-10-26 17:20 (Cairo)

Branch `claude/today-looks` (worktree `.claude/worktrees/today-looks`). This is a looks task only: **no app source changed.**

Kai (2026-10-26) said: "I want to redesign the homescreen, it doesn't feel as faithful to the entire app and feels too spacious, let's see a couple directions for the redesign".

- **Page.** `design-export/Today options.html`. Open it straight from disk.
  - Tokens come from `ds-bound/styles.css` plus the app's `colors.css` / `colors.dark.css`. The second pair supplies palette C's `--blk-*`.
  - No colour value is changed or added.
  - It has a Day/Night toggle, A/B/C tags, a "This one" button per direction, and "Copy my picks" (copies `Today looks: Today B`, stored under `kf-today-looks-picks`).
- **Assets.** `docs/log/assets/today-looks/`:
  - `audit/` holds the current Today, plus Calendar and Settings for comparison. `audit.mjs` made them.
  - `<A|B|C>-<1|15|phone>-<day|night>.png` is each drawn frame.
  - `page-day.png` and `page-night.png` are the whole page.
  - `results.json` holds the density counts, the overflow check and the copy check. `shoot.mjs` made them.

## Audit: Today as it is now

`audit.mjs` uses the mock backend from today-scale's setup, with Kai's kind of day: Mon 26 Oct, 10:40, two lectures, the CNN goal block, the gym, a study group, a Karpathy block; Top 3, 4 of Today's tasks plus 1 done, 2 overdue, 6 Also open, and 5 routines. Note: Cairo is still UTC+3 on the 26th, because DST ends on 29 Oct.

What Today shows, top to bottom on desktop:

1. The display-serif date (about 48px), the ‹ › stepper, and "1 of 8 done · next up …".
2. The notebook button and the Add pill.
3. The Plan your day ritual card, with the 8–20 ribbon and an Up next line. It is about 225px tall.
4. Today's three: the taped goal card, then 2 rows.
5. Today's tasks · 4, then Overdue · 2 (folded, with Replan all), then Also open · 6 (folded).
6. A right column holding Rituals (Morning 0/4 with its 4 steps listed, and Evening) and Routines 1/5.

On the phone, the Plan my day card, Top 3 and Up next all come before Today's tasks. Today's tasks starts about 1000px down the page.

Task rows fully on screen (goal included):

| | 100% | 125% (desktop default) | 150% |
|---|---|---|---|
| 1280 × 800 | 4 | 1 | 0 |
| 1920 × 1080 | 9 | 6 | 3 |
| Phone 390 | 3 | | |

At 1280, the page is 1.7 screens long at 100% and 2.5 at 150%.

Why it feels unlike the rest of the app:

- Calendar now uses palette C blocks and the docked Now card A. Settings uses two panes and rounded-panel rows.
- Today's ribbon uses its own flat bars. Its ritual card is a big hero card. Its rows are 50–70px with lots of air.

## The three directions

The density figures are tasks fully on screen at 1280 × 800, counted in the drawings by the page itself.

| | 100% | 150% | Phone |
|---|---|---|---|
| Now | 4 | 0 | 3 |
| **A · Command centre** | **10** | **8** | **10** |
| **B · Calendar-led** | **8** | **3** | **4** |
| **C · Focus first** | **8** | **1** | **7** |

- **A · Command centre (Akiflow/Sunsama).**
  - A one-row header and the goal as a slim taped gold strip.
  - The other two of the three as numbered 34px rows.
  - One list with folding sections: Today's tasks / Overdue / Also open.
  - The day as a narrow right column drawn in the calendar's real block look.
  - Rituals and routines become a chip row.
  - At 150% the column gives way to a one-line "Next".
  - Removes: the Plan your day card and the Rituals/Routines column.
- **B · Calendar-led.**
  - The list on the left. On the right, today's column exactly as Calendar draws it: header, lavender today, the "Now" blocks, the now line.
  - Rituals and routines become all-day chips.
  - The Now card A docks at the bottom left.
  - A smaller paper goal card. Overdue and Also open as folded lines.
  - Phone: a 3-hour window of the day over the list, and the Now card docked above the tab bar.
- **C · Focus first, in Settings' panels.**
  - Row 1: the full paper goal card (with Focus on it and Subtask +), and a Now panel (Now card A plus the day ribbon).
  - Row 2: Today's three, Today's tasks, and one Overdue / Also open panel, all as rounded-panel rows, with Rituals and Routines panels on the right.
  - At 150% it becomes one column, so only the goal sits above the fold. This is the trade-off.

Kept in all three:

- the goal card's paper look (tape, clover, gold `✶ Goal of the day`), smaller in A and B;
- the ‹ › stepper (the phone's Yesterday · 📅 · Tomorrow strip in B and C, ‹ › beside the date in A);
- Today's tasks kept apart from Also open;
- Morning (0/4, Begin) and Evening rituals, and the routines.

## Checks

- `node docs/log/assets/today-looks/shoot.mjs` produced the day and night screenshots.
- No page errors.
- Nothing overflows sideways in any frame.
- Copy my picks gives `Today looks: Today B`.
- The mock dev server on :5317 was stopped afterwards.

## Notes

- The worktree had no `node_modules`. I junctioned `app/node_modules` to `settings-build`'s, which has the same `package.json`, and copied `app/.env.mock.local`. Both are untracked.
- `audit.mjs` marks the swipe hint as seen (`kf-help:<uid>`) so it doesn't cover the phone shot.

---

# Phone home (17:42 follow-up): Kai meant the PHONE

The coordinator passed on Kai's clarification: he meant the phone's first screen (Today on the phone) and the Android home-screen widgets, designed together.

- **Page:** `design-export/Phone home options.html`. `Today options.html` stays as the desktop reference.
  - Same rules as before: tokens from `ds-bound` plus the app's colours (palette C), Day/Night toggle, A/B/C, "This one" per direction, and a pick for the widgets too. "Copy my picks" copies `Phone home: phone B, widgets B`.
  - The home-screen wallpapers are CSS pictures, not app colours.
- **Shots:** `docs/log/assets/today-looks/phone/`
  - `<A|B|C>-<360|390|430>-<day|night>.png`: the app's first screen.
  - `widgets-<A|B|C>-<small-medium|large>-<day|night>.png`: the widgets on a home screen.
  - `page-day.png` / `page-night.png`: the whole page.
  - `results.json`: counts, overflow check, copy check.
  - `audit/`: today's phone at 360/390/430, by day and night, each with a full-page shot, plus `audit-phone.json`.
- **Scripts:** `shoot-phone.mjs` and `PHONE=1 node audit.mjs phone/audit`.

## Audit: the phone's Today now

The mock is the same as above, at 390 × 844.

**Above the fold:**
- the date bar (50 px);
- the Yesterday · 📅 · Tomorrow strip plus "Day 26 · not planned yet" (86 px);
- Plan my day (87 px);
- the "Top 3" heading;
- the goal card (147 px, or 171 px at 360);
- Top 3 rows (78–98 px each, because the title wraps over a second meta line).

**Then,** further down:
- Up next (with the scheduled tasks under it);
- Today's tasks · 2;
- Routines (one row each);
- "Later · Evening 0/2";
- Overdue and Also open, folded.

**Tab bar:** 66 px, with the + in the middle.

**Tasks fully on screen:** 3 at 360, 3 at 390 and 3 at 430. The page is 2.4 / 2.1 / 1.9 screens long.

## The three phone directions

Tasks fully on screen above the fold:

| | 360 | 390 | 430 |
|---|---|---|---|
| Now | 3 | 3 | 3 |
| **A · List first** | **8** | **10** | **10** |
| **B · Now + next** | **6** | **7** | **8** |
| **C · Day strip** | **8** | **8** | **8** |

- **A · List first.**
  - ‹ › moves beside the date, under a one-line summary.
  - Rituals and routines become chips.
  - "Next" is one line drawn like a calendar block.
  - The goal is a slim paper strip, and every task is a single 44 px row.
  - Today's tasks, Overdue and Also open are sections that fold.
- **B · Now + next.**
  - The calendar's Now card A at the top, with the next two blocks under it in the "Now" look.
  - The smaller paper goal.
  - Settings-style rounded panels: Top 3, Today's tasks, one Overdue + Also open panel, and Rituals (Begin).
- **C · Day strip.**
  - The day drawn across, in palette C blocks, with the now line. It scrolls sideways.
  - Ritual chips, then the slim goal.
  - A list with a time column on the left, like an agenda.

All three keep:
- the goal's paper look (tape, clover, gold stamp), smaller;
- the day stepper (the strip in B and C, ‹ › beside the date in A);
- Today's tasks kept apart from Also open;
- the Morning and Evening rituals.

## The widgets the app has now

Source:
- `app/native/android/java/com/kaisflow/garden/widgets/` (`KfWidget`, `Render`, `Families`, `Snap`, `WidgetActions`, `WidgetBridge`);
- `app/native/android/res` (`kfw_*` layouts, `xml/kfw_wNN.xml`, `values` / `values-night` colours);
- `app/src/features/widgets/*` (snapshot, bridge, queue);
- the design: `design-export/Phone Widgets.dc.html`.

There are 32 picker entries (W19 and W30 don't exist):

| Group | Widgets |
|---|---|
| Today | W01 Goal of the day · slim 4×1; W02 Goal · card 2×2; W03 Top 3 · small 2×2; W04 Today · Top 3 4×2; W05 Today · full page 4×4; W06 Now 4×2; W07 Up next · tiny 2×1; W08 Day progress 4×1 |
| Capture | W09 seal 1×1; W10 pill 2×1; W11 bar 4×1; W12 Paper capture 1×1; W13 Ask 4×1 |
| Calendar | W14 Agenda 4×3; W15 Agenda + week 4×4; W16 Week strip 4×1; W17 Countdown 2×1 |
| Focus | W18 Focus 2×2; W20 Focus · slim 2×1 |
| Routines | W21 Routines 2×2; W22 Routines · week 4×2; W23 Streak plant 2×2; W24 Streak · tiny 1×1 |
| Triage | W25 Inbox 2×2; W26 Inbox · tiny 1×1; W27 Overdue 2×2; W28 Slipping 2×2 |
| Rituals & reflection | W29 Plan my day · Shut down 4×2; W31 One line 4×2; W32 From a while ago 4×2; W33 Pressed 2×2; W34 Season 2×1 |

How they work today:
- A widget changes its face as it's resized, from the size the launcher reports.
- They redraw every 30 min (`updatePeriodMillis` 1800000), on app pushes, and with one inexact alarm at the next change.
- Ticks are PendingIntent broadcasts (WidgetActions TICK), drawn at once and applied by the app later.
- Cards are drawn at a fixed 22 dp radius.
- Text uses the system `serif` / `sans-serif-medium`.

**Finding:** the widget blocks still use the old five tints (lavender / sage / blossom / hydrangea / goal). They don't use palette C yet.

## The widget families, one per direction

Each is drawn small 2×2, medium 4×2 and large 4×4, on a home screen by day and in dark mode. The cards are opaque paper, so they read on any wallpaper.

- **A · Checklist.**
  - Small: Top 3 with the goal strip.
  - Medium: the goal plus 4 rows you can tick, and +.
  - Large: Next, the goal, Top 3, Today's tasks, Overdue / Also open, and a capture bar.
- **B · Now card.**
  - Small: Up next, its progress bar and times, and "Then".
  - Medium: plus the next two blocks.
  - Large: plus the goal, Top 3 you can tick, and capture.
- **C · Day strip.**
  - Small: the next hours as a calendar column.
  - Medium: the day across, plus Next and the goal block.
  - Large: the goal, and today's column with the now line.

The page lists what Android widgets can and can't do:
- RemoteViews allow stock views only: no custom fonts, tilt, blur or animation;
- Android 12's system corner radius and `@android:id/background`;
- Material You colours exist, but we keep the paper for legibility;
- updates are rationed to a 30-minute minimum, so show clock times or use a Chronometer;
- Android 12+ allows a real CheckBox with `setOnCheckedChangeResponse`; before that, PendingIntent ticks;
- responsive sizes, collection views for scrolling, and `previewLayout`.

## Checks

- No page errors.
- No sideways overflow.
- Copy works.
- The mock server on :5317 was stopped.

---

# Widget modernization and the Samsung lock screen (follow-up 2)

## Push 1: the widget spec is FINAL

**Final: the "Existing widgets: every one, modernized" grid in `design-export/Phone home options.html` (`#existing`).** It's the spec for `claude/widgets-build`. Not final yet: the lock-screen section, which comes in push 2.

The coordinator relayed Kai's decision: build every widget, nothing is cut, and true duplicates are marked "merge with X". Each of the 32 entries shows its gallery-rendered picker preview (`app/native/android/res/drawable-nodpi/kfw_preview_wNN.webp`; the night versions are in `docs/log/assets/widgets/family-*.jpg`) next to its modern face. Each has a verdict and a reason, plus Agree / Not this buttons that feed into "Copy my picks".

**Redo (10): the layout changes**
- W01 goal slim: the title was cut; now a 2-line strip.
- W03 Top 3 small: paper goal plus 2 rows to tick.
- W04 Today · Top 3: date header, paper goal, Up next as a palette C block, 2 rows to tick.
- W05 full page: becomes family B large (Now card, then blocks, goal, Top 3, capture).
- W06 Now: Now card, the Then block, Start focus / Done.
- W07 Up next tiny: a palette C block with a 2-line title.
- W14 Agenda: the calendar's blocks and now line instead of the old 5 tints.
- W15 Agenda + week: the calendar's lavender "today" header plus its blocks.
- W20 Focus slim: smaller ring, 2-line task.
- W29 Plan / Shut down: one header line, the title with Plan, the 4 steps as chips.

**Restyle (21): same content, the family style**
W02, W08, W09–W13, W16–W18, W21–W23, W25–W28, W31–W34.

**Merge (1):** W24 Streak · tiny merges with W23. It becomes W23's 1 × 1 face, so one picker entry resizes.

**The family style (B-led, Now + next):**
- the paper card at the system corner radius;
- a line icon plus a sentence-case label (no spaced mono capitals);
- palette C blocks in the calendar's "Now" look, with check B;
- the Now card's ring, progress line and times;
- the paper goal strip, standing straight, with the real `kfw_tape.png`;
- a terra pill for the main action, a bone outline for the second;
- the app's own `kfw_art_*` drawings;
- system `serif` for the display moments.

**Shots:** `docs/log/assets/today-looks/phone/widgets-existing-day.png` and `widgets-existing-night.png`.
