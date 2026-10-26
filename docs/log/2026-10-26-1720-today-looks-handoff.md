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
