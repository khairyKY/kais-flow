# Kai's Flow — UI Review Log

A running record of every change made in the UI review pass, page by page. Each entry says what was wrong, what changed, and where to find it. The earlier variants are never overwritten: each review lives in a new turn at the top of its page.

## Rules applied across every page
1. **Say it once.** Each fact (date, done-count, streak, inbox count, ritual progress) appears in exactly one place per screen.
2. **"Now" first.** The current or next time block is the first content under the header.
3. **One hero.** Only the Goal of the day keeps tape and a tilt. Every other card sits flat.
4. **Legible metadata.** The smallest text is 10.5px. Metadata uses `--ink-muted` (#6b6455), never `--ink-faint` or `--ink-hairline`, so it meets 4.5:1 contrast. `--ink-faint` is used only for placeholder text.
5. **Mobile touch.** Every tap target is at least 44px. Rows are 52px, checkboxes 22px, tab labels 10.5px sans.
6. **Capture is type-first.** A typed quick-add field, with the mic next to it. The mic is not a tab.
7. **No contradictions.** Nudges never flag something the screen is already treating as a priority.
8. **Every list has an exit.** A truncated list always ends with "Show N more →".
9. **Actions are verbs.** Vague links like "reviewed" become buttons with clear actions ("Plan a step", "Snooze a week").

---

## Today — Turn 2 (`Today.dc.html`, options 2a desktop, 2b iPhone)

1. **Stats were repeated three times.** The done-count, streak and inbox count appeared in the terrarium band, the sidebar and the badges. Now the done-count is in the header summary, the streak is in the sidebar footer, and the inbox count is the sidebar badge.
2. **The date was repeated three times** (top bar, eyebrow, H1). Removed the top bar and the eyebrow. Only the H1 "Friday, July 10" remains, with a one-line summary under it: "2 of 6 done · next up Sync with Omar at 1:00".
3. **"Now" was buried** as the first row of "Up next", halfway down the page. It's now a card at the top showing the block, the time left ("48 min left"), the task in progress, and a Start focus button.
4. **Added a day ribbon** inside the Now card: an 8 AM–8 PM track with colored blocks (rituals, deep work, meetings) and a terracotta "now" line. It replaces both the decorative terrarium band and the "Up next" list. The next two events are listed under the ribbon, with a "Calendar →" link.
5. **Rituals were duplicated** in the pinned cards and the right-rail routines list. Now they live only in the rail: Morning is expanded with its checklist, and Evening stays collapsed ("from 7 PM") until it's relevant.
6. **Too many taped and tilted cards** (terrarium band, goal, slipping, memory, sidebar item). Only the goal card keeps tape and a tilt.
7. **Contradictory nudge.** "Forecasting · 5 days untouched" sat next to today's Forecasting goal. The nudge now points to a project that's actually stale ("Portfolio site · untouched for 9 days"; placeholder data). The "reviewed" link became two buttons: "Plan a step" and "Snooze a week". The rail is titled "Worth a look · 1 of 2", and the memory card rotates through that same slot.
8. **Text was too small and too faint.** Mono captions and metadata were 8–9px in `--ink-hairline`/`--ink-faint`. The minimum size is now 10.5px, and metadata is `--ink-muted` sans at 12.5px.
9. **Capture was voice-only.** Added an "Add a task…" pill with an `N` shortcut hint and the mic button inside it. On iPhone, the capture bar sits above the tab bar.
10. **The mic was the middle tab on iPhone.** Replaced it with Tasks. The tabs are now Today, Inbox (badge 3), Tasks, Calendar, Garden. "Garden" is a new label and needs confirming.
11. **Mobile hit targets were too small.** Rows are now 52px, checkboxes 22px, the Focus button 36px inside a 48px card row, and tab cells 44px.
12. **Redundant stars.** The ★ on Top-3 rows was removed, since being in the section already means "starred". The ☆ on other rows was removed as well; starring moves to swipe or hover actions.
13. **"All open · 14" showed only 3 items and had no way to see the rest.** Renamed it "Also open · 14", sorted overdue first, put due dates in a right-aligned column, and added "Show 11 more →".
14. **Checkboxes were three different sizes** (19, 17 and 16px). All are now 20px on desktop and 22px on iPhone, with the same `--ink-hairline` border.
15. **Section header row.** "Today's three" now shows the planned time total ("1h 30m planned") on the right.
16. **Sidebar.** Added the app icon next to the wordmark. Removed the tape from the active item. Moved "Synced" from the removed top bar to the Settings row. Section labels are now 10px `--ink-faint` instead of 9px hairline.
17. **Removed filler copy.** Cut "pressed & kept, one day at a time" and "The terrarium · Day 42". Day 42 now lives in the sidebar streak ("best 21 · day 42").

18. **Filled out the iPhone screen (2b).** Added "Up next", showing the next 2 events (time, colored bar, title, place and length), and a one-line "Worth a look" nudge with a "Plan a step" button. The Now card no longer repeats the next event; it shows the block's time range instead.
19. **Time-aware Today (new 2c, iPhone after 7 PM).**
    - The Now card becomes "Evening ritual · 0 of 2 — Close the day", with a full-width "Start evening ritual" button.
    - "Today's three" becomes "How today went": done items are checked, and anything unfinished gets a "→ Tomorrow" button.
    - "Up next" becomes "Tomorrow · Sat 11": the first event, plus a prompt to pick tomorrow's goal.
    - The rule: mornings show rituals and the agenda; evenings show the review and tomorrow.
20. **The fifth tab is called "More"** (decided).
21. **Unified sidebar.** Added Projects (under Plan), plus Journal and People (under Cultivate), so Today's sidebar matches Inbox's. This sidebar is now the standard for every reviewed page.

---

## Inbox — Turn 3 (`Inbox.dc.html`, options 3a desktop, 3b iPhone)

1. **Dates didn't add up.** The capture said "Call Omar… tomorrow 3pm" and was logged Sun 6 Jul, but the suggested due date was Sat 11 Jul. The capture now says "Saturday 3pm", logged "Voice · Thu 9:14 PM", so Sat 11 Jul 3:00 PM is correct.
2. **The count didn't match.** The header said "Three waiting", but one of the three cards was already filed. The header is now "Inbox", with the summary "3 to sort · 2 from GitHub · oldest is 1 day old". The already-filed state became a dark Undo toast at the bottom left ("Filed '…' as a task · Undo").
3. **The AI suggestion was shown twice**: once as a sentence ("Call Omar about pricing · due Sat 3:00 PM · → Forecasting App") and again as dropdowns (Freelance, Forecasting App, Sat 3:00 PM). It's now a single row labeled "Suggested", made of editable fields: type (Task ▾), title, date (Sat 11 Jul, 3:00 PM ▾), project (Forecasting App ▾). The "✎ edit parse" link was removed, because the fields themselves are editable.
4. **Confidence as a word, not a number.** "AI · Task · 87%" became "high confidence" at the end of the row. A low-confidence card ("AI unsure · 44%") now asks "Where does this go?" and shows three dashed choices: Task, Journal note, Salma (People). It no longer shows empty Domain/Project dropdowns.
5. **Keyboard shortcuts on the buttons.** The E / S / D keys are shown inside the File as task / Snooze / Dismiss buttons. The faint 9px keyboard footer and its tagline ("one keystroke per capture — that's the whole game") were removed.
6. **All buttons are 36px tall** on desktop, and every card uses the same order: primary (terracotta) → Snooze (outlined) → Dismiss (text only).
7. **Waiting/Dismissed** moved from tabs under the header to a toggle on the right of the header: Waiting 3 | Dismissed 6.
8. **Search deep-link banner.** It's now a 13.5px sans sentence ("From Search: your match is highlighted below.") with a 28px close button, instead of 9.5px mono caps. The highlighted card keeps its hydrangea outline.
9. **A plain capture gets a compact row** ("renew hosting before the 15th · Email · Wed · Task · due Tue 14 · File") instead of a full card.
10. **GitHub section.** Renamed to "From GitHub · Shaheen/website — most urgent first". Each row shows the issue number (mono, sage), the title, an age ("3 days"), a File button and a Dismiss link. The internal "rank 1" label was removed.
11. **Cards sit flat.** Removed the ±0.2° tilt from triage cards, and removed the handwritten line "clear them and the hydrangea calms ✿" from the header.
12. **Same frame as Today 2a.** The unified sidebar with Inbox active and a terracotta badge; the top bar is gone; H1 plus a one-line summary; minimum text 10.5px; metadata in `--ink-muted`.
13. **iPhone (3b).**
    - The header shows "Inbox" with "3 to sort · 2 from GitHub" underneath, and a "Dismissed 6" link on the right (44px tall).
    - A confident card shows three field chips and three 44px buttons, laid out 2 : 1 : 1 (File as task / Snooze / Dismiss).
    - An unsure card shows three 44px dashed choices: Task / Journal / Salma.
    - GitHub rows are 48px tall.
    - It uses the shared capture bar ("Capture something" + mic) and the new tab bar, with Inbox active and a badge of 3.
