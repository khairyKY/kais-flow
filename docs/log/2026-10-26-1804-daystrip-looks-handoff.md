# Day view looks: handoff (2026-10-26 18:04)

Branch `claude/daystrip-looks` (from `claude/kai-bugs-1012`). Looks only. No app code was changed.

## Ask
The phone Today has two views: B, Now + next (picked, being built), and a Day view. Kai turned down the old C, the sideways day strip in `Phone home options.html` on `claude/today-looks`, and asked for a different design. This page has 4 directions, each drawn as B's sibling.

## Deliverable
- `design-export/Day strip options.html`: plain file:// page with a Day / Night toggle and **Copy my picks** (for example "Phone Today, Day view: Day view 3 (Hours), widget 3"). Every direction is drawn at 360 / 390 / 430. Each has a "Borrows" note, the number of tasks above the fold (measured in the page), tap and drag notes, and a 4 × 2 Android widget sketch. B and the old C sit at the top for reference.
- Screenshots in `docs/log/assets/daystrip-looks/`: `{1,2,3,4}-{360,390,430}-{day,night}.png`, `4open-390-*.png` (the bar tapped open), `widget-{1..4}-{day,night}.png`, `page-{day,night}.png`, `ref/` (B and the old C), and `results.json`. To shoot them again: `node docs/log/assets/daystrip-looks/shoot.mjs` (playwright-core + system Chrome, no server).

## The demo day (Mon 26 Oct, 10:40 AM)
- 8 blocks: ML lecture (past), CV lecture 11:00–12:30, office hours 12:00–12:45 (overlaps it), ✶ CNN notes 1:30–3:30 (the goal, a task block), coffee 3:00–3:45 (overlaps it), gym, study group, and the Karpathy task block.
- Rituals: Morning at 7:30 (0/4, not started) and Evening from 5:00 PM.
- Top 3, Today's tasks (one timed at 6:30 PM, one done), 2 overdue, 6 also open.

## Directions (tasks above the fold at 390 / 360 / 430; B is 7 / 6 / 8)
1. **Thread** (2 / 2 / 3). Borrows from Structured and Akiflow. One vertical line runs through the day, with each block as a capsule as tall as it is long. Free gaps show how long they are and which task fits. An overlapping capsule shifts right and says "overlaps 30m". The paper goal card sits on the line at 1:30. Anytime tasks and Overdue come after the line. Drag a capsule to move it in 15-minute steps, or drag a task onto the line.
2. **Dial** (8 / 7 / 9). Borrows the iOS bedtime dial and Watch complications. A 24-hour ring sits beside B's Up next and Then rows: arcs in palette C, overlaps on an inner track, a gold arc for the goal, the night dotted, and a sun and moon for the rituals. Below it, the page is exactly B. You can scrub the hand round the ring. It's the closest of the four to B.
3. **Hours** (3 / 3 / 4). Borrows Google Calendar's Schedule view and Sunsama. One row per hour from now on: chips for blocks, a box for a timed task, a thin coloured line while a block continues into the next hour, and dashed free slots that offer one task with **Put here**. Earlier hours fold into one line that still has Begin.
4. **Day bar** (9 / 8 / 10). Borrows Fantastical's DayTicker and Amie. The whole day sits in one bar, 7 AM to 11 PM, with a second lane for overlaps and a Next line under it. Tap the bar to open the calendar's own column for today (`4open-390-*`). Drag a task onto the bar and it opens so you can drop it on a time. It's the densest of the four.

## Decisions and deviations
- None of the four scrolls sideways. That's the main fault of the old C: blocks cut to two words, and the afternoon off screen.
- **The Now · Day switch** replaces the date icon in the Yesterday / Tomorrow line. Tapping the date title opens the picker. This is a proposal, and B would need the same switch.
- **Colours**: only app tokens are used (`ds-bound/styles.css` and `app/src/styles/tokens/colors*.css`, palette C `--blk-*`). The widget wallpaper is a gradient between `--acc-hydrangea` and `--acc-sage`, so no hex values were added. The workspace SKILL.md defaults (Inter, indigo accent, no shadows) give way to the app's own tokens, as the project CLAUDE.md says. The 4 / 8 px spacing and the type scale are followed where the page doesn't copy B's own sizes.
- **Widget feasibility (RemoteViews)**: 1 and 3 are fixed rows (3 could be a ListView). 2's ring and 4's bar are bitmaps drawn into an ImageView and redrawn when a block starts or ends and every 30 minutes, so the hand can be up to 30 minutes behind between redraws.
- The task counts are measured in the drawing: `[data-task]` rows fully above the tab bar, with the goal counted as one. A task block on a timeline (CNN, Karpathy) counts as a task.

## Research sources
- Structured: https://help.structured.app/en/articles/380546 , https://daveswift.com/structured/
- Akiflow mobile: https://akiflow.notion.site/Mobile-App-8f185ebd7236498798f7fcb7ed67c050 , https://akiflow.featurebase.app/en/changelog/iphonemobile-huge-release-calendar-calendar-fire-nlp-and-much-more
- Sunsama: https://help.sunsama.com/docs/timeboxing-the-basics , https://www.sunsama.com/features/timeboxing
- Amie: https://screensdesign.com/showcase/amie-todos-calendar , https://amie.so/changelog
- Fantastical: https://www.flexibits.com/fantastical-ios/help/calendar-views , https://www.macworld.com/article/219839/review-fantastical-for-iphone-shines-despite-ios-caused-limitations.html
- Google Calendar Schedule view: https://www.androidcentral.com/googles-updated-calendar-app-gorgeous-addition-android-50-lollipop , https://9to5google.com/2024/09/30/google-calendar-new-illustrations/

## Checks
`results.json`: no page errors, no broken images, no sideways overflow in any phone frame, and Copy my picks returns the expected line.

## Next
Kai picks a Day view and a widget. The build then goes into `features/today` next to B's Now + next. Direction 4's open column could reuse `CalendarGrid`.
