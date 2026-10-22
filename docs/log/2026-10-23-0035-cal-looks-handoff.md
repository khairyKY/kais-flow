---
date: 2026-10-23
session: cal-looks (builder, worktree .claude/worktrees/cal-looks, branch claude/cal-looks)
type: handoff
---

# 2026-10-23 00:35 · handoff · cal-looks

Kai's picks from `design-export/Calendar blocks options.html`: **"blocks: Now · overlap B · goal A · selected B"**. On "Now" he added: "the Now that we have isn't the one that we are using". So the blocks are built as the page's **"Now" drawing**, not as the app drew them.

Everything is on `claude/cal-looks` and pushed. It is not merged: no PR, no migration. Every check ran against a mocked backend.

## 1 · Blocks = the "Now" drawing

How it was compared: the harness opens the options page and reads the drawing's computed styles (title, time row, check, edge, fill, insets), then reads the same parts of the app's blocks at 125%, by day and in Night Garden (`verify.mjs` c1). At 150% it compares the rendered geometry with the drawing's "Fri at 150%" column (c2). Both now match.

### Differences closed (desktop)

| Property | The app before | Now (as drawn) |
|---|---|---|
| Edge | Lavender blocks: a fixed `rgba(124,106,154,.35)`, the same at night. Events: blossom at 55%. Coloured blocks: their hue at 55% | Every block: its accent at 45%, re-themed at night |
| Time row and check ink | Events: clover text. Coloured blocks: the raw light hex (e.g. #D4C78A) | The accent's own text tone: blossom text for events, buttercream text, hydrangea deep, sage text… |
| A swatch colour at night | The day hex, unchanged at night | Its token (`blockHue.ts`), so Night Garden draws the night value |
| Insets | 7 / 10px at every scale | 7 / 10 at 125%, 8.4 / 12 at 150% (the drawing zooms the block), 5.6 / 8 at 100%. The gap between the check and the title follows (6px at 125%) |
| Title line height | 1.2 (1.3 on the tallest blocks) | 1.25 |
| Title wrapping | 2 lines only from 90 min. Overlapping and narrow (< 170px) columns: 11px, one line, ellipsis | 12px × scale everywhere, wrapping as far as the block holds over its time row (the line count comes from the length); the last line ends in an ellipsis |
| 30 minutes or less | One line only when FullCalendar thought it short (< 30px), so a 30-min block stacked its title and time | One line: the check, the title, no time row |
| 15–25 minutes | A mono 8px strip with no check | The same one line as any short block: the 12px × scale title, the check on hover |
| Meta line | "range · length" only from 90 min; overlapping and narrow blocks showed the start only | "range · length" from an hour ("9:00–10:00 AM · 1h"); the range below that; a slot holding tasks reads its start ("1:30 PM") |
| Past | .55 opacity plus saturate(.6) | .62, hue kept |
| Ran over | Terra 10% fill, dashed terra 55% edge, terra time | Own hue kept, a solid terra edge, the time in terra ink |
| Done | Fill drained to paper, faint title, `--line-solid` edge, a petal badge | Hue kept, filled check, struck title in body ink, no petal |
| In progress | The lived-share wash sat inside the padding (from the content box), in the edge hue | It washes in from the block's top edge across the whole width, the deep tone at 14% (`--kf-elapsed` on the block) |
| Hover | Grips and the check | Also ▶ Focus (tasks) and ⋯ (the block's menu) at the end of the title's line: 20px marks in the block's ink. ▶ starts a focus on the task and opens /focus; ⋯ opens the right-click menu. **Choice:** they show only on a block at least 120px wide (a container query). In a week column at 1280, about 109px, they would cover half the block and a click there would start a focus instead of opening the block. The drawn 150px column shows them |
| Focus | FullCalendar's 25% black overlay and shadow on a clicked (focused) block (the dark "Pay the rent" in the before shot) | Gone; the keyboard ring (`:focus-visible`) stays |
| Check glyph | 9px × scale | 10px at 125% |
| Time slot | 12px × scale row titles, 15px checks, rows 4px apart; the fill line's hairline was 22% of the edge | 13px titles and 12px checks (at 125%), the drawn 6px after the check, rows 3px apart; the fill line sits under an accent hairline (30%), 4px down |

### Differences closed (phone)

- **Edge and fill.**
  - Blocks get the 1px edge (the accent at 45%).
    - It is drawn as an inset ring, not a border. With a border, a block held in the 3-day view no longer lifted (calendar-phone 7h; found by swapping the files one at a time).
    - The goal, ran-over, cascade and lifted looks all compose with the ring.
  - The fills are the accent at 24% (they were the `--block-lavender` 20% and `--block-blossom` 22% tokens).
  - Swatches use their tokens, so they change at night.
- **Title:** regular weight (it was medium).
- **States.**
  - Past is .62 with no desaturation.
  - **Ran over** is new on the phone: a terra edge and "Ran over · 10:30 AM", not faded.
  - The lived-share wash is new on the phone.
- **Check:** edged in the block's ink, no fill while open, 4px corners.
- **Time slot:**
  - The fill line sits under the hairline.
  - The slot's time row shows its start.
- **Meta line:** "range · length" from an hour.

### Kept (the app does it, the drawing doesn't show it)

- ⚠ (conflict) and ↻ (repeat) badges.
- The overdue state: .55 plus saturate, "Overdue · Replan", on the desktop and the phone (calendar-rail checks both).
- The resize grips, the drag ghost and its wobble, the hover lift.
- The outbox marks.
- The narrow class's trimming of "Overdue · ".
- "+N more" for a fourth block at once.
- The slot rows' × and ⋯.
- **Held task cards keep their soft card**: the slot's wash under each, from slot-outline pick A (`design-export/Slot task outline.html`, time-slots o1/o2). The "Now" drawing shows the rows outlined only; that pick was Kai's own call for exactly these cards, so it wins here. Say if the drawing should win instead (one CSS line on each of desktop and phone).
- A done held row stays struck (time-slots o1). The drawing's rows show no strike.
- A held row's own × and ⋯ (not drawn) sit 2px apart. With the drawn 6px gaps, a row in a week column at 1280 lost its whole title while they showed, so a click on it missed (time-slots f7).
- The check is centred on the title's first line (cal-polish A, which Kai asked for). The drawing's flex-start puts it 2px high.
- The time row stays on one line with an ellipsis. The drawing lets it wrap in a narrow lane.
- The 12px corner radius stays fixed. The drawing's zoomed 150% would be 14.4px.
- The phone keeps its touch sizes: the 14px title and the kit's 17px check, always shown (no hover on a phone). Its short one-row blocks keep their time where the row has room.

## 2 · Overlap B: cascade

- Overlapping blocks no longer sit in equal lanes. Each later block steps 22% right over the one under it and keeps the rest of the width: lanes 0, 22% and 44%, each higher than the one before.
- `overlapLayout.ts` still decides the lanes. A fourth block and beyond still go under lane 2's "+N more".
- FullCalendar's own options can't do this:
  - `slotEventOverlap` only toggles its fixed shingle.
  - `eventOrder` only orders.
- So the harness is placed with `:has()` on `.fc-timegrid-event-harness`, as before.
- Each cascaded block's tint sits on paper, so it hides what it covers, with a 2px paper edge on its left.
- The block carries the paper itself, so it lifts with the block on hover.
- Overlapping blocks now read like any other block: full type, title wrapping, range and length.
- **Choice: no hover raise.** The old rule lifted a hovered block to the top. In a cascade, that made a hovered lower block cover the ones above it for as long as the pointer stayed on it (the harness caught a drag landing on the wrong block). Each block stays reachable where it shows:
  - Lower blocks' checks and titles sit in their visible strip ("the peek").
  - The menu is on a right-click in the peek.
- **Phone:** the same cascade (`PhoneGrid` geometry: inline z-index 1–3). The "+N" chip is raised to z 4 and a lifted block to z 5.
- **Checked (harness o / op):**
  - A click on a covered block's peek opens that block.
  - The bottom block's check is on top where it sits, and completes its task.
  - The middle block of three drags by its own part.
  - The upper block of two drags.
  - On the phone, the bottom block's check completes its task and a tap on the middle block opens its sheet.

## 3 · Goal A

- The goal is the first of today's Top 3: `goalIdOf(tasks, legacyGoalId(), cachedStarEvents())` in `today/top3Order.ts`, as Tasks' ✶ Goal chip reads it.
- Only that task's block **on today's date** wears the goal look:
  - a 3px gold edge inside its left;
  - the goal paper's edge colour (`--line-goal`);
  - a gold ✶ before the title.
- Desktop: `CalendarGridEvent.goal` → `.kf-goal`. Phone: `BlockLook.goal` → `.is-goal`.
- The edge stays while the block lifts on hover, and when the block is cascaded.
- A ran-over goal shows the terra edge.
- Checked: the same task's Thursday block and Top 3 #2 (Crypto) don't get it.

## 4 · Selected B

- A picked block gets a wash of the selection ink (13%, the block's `::after`) and a 16px check badge in its top corner: 5px off the edges, a 5px corner, `--sel-bg` / `--sel-ink`.
- On a one-line block the badge sits on the line's middle.
- The title stops short of the badge.
- The plain outline is gone.
- The phone has no multi-select, so this is desktop only.

## 5 · Motion

- Hover lift: 1px with `--shadow-hover`, as built. Goal blocks keep their gold edge while they lift.
- The drag wobble is unchanged.
- Under reduced motion or with Effects off, there is no lift (harness h, cal-polish h1). The hover actions still show.

## Gate

**Checks:**

- `npm ci`: passed.
- `npx tsc -b`: clean.
- `npx vitest run`: **172 files / 2351 tests**, passing in UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo (PowerShell `$env:TZ`). `blockHue.test.ts` (3 tests) is new.
- `npm run lint`: **0 errors**. The 24 warnings were all there before this work.
- `npm run build`: passed (entry `index` 363.82 kB, gzip 116.54 kB).
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**, 22 fixed since.
  - These were marked `ds-ok` on purpose, each one the drawing's own value:
    - the check's glyph;
    - the slot rows' 13px type and 12px check;
    - the ▶ ⋯ marks;
    - the badge's ✓ and its 5px corner;
    - the phone check's 4px corner;
    - the phone's unchanged 14px title line, flagged only because its weight changed;
    - the hover-only actions (touch has the popover and the long-press menu).
- `grep -c birthday_on app/src/lib/types.ts` = 1 and `grep -c 'birthday_on: false' app/src/lib/settings.ts` = 1.

**Harnesses** (mock dev server `--mode mock --host ::` on 5303, warmed, one at a time):

| Harness | Result |
|---|---|
| `cal-looks` | **107/107** |
| `cal-polish` | 229/229 |
| `calendar-rail` | 101/101 |
| `cal-rail-drop` | 33/33 |
| `cal-wave2` | 84/84 |
| `calendar-phone` | 180/180 |
| `time-slots` | 153/153 |
| `event-detail` | 70/70 |
| `dup-open` | 23/23 |
| `desktop-polish` | 150/150 |

- cal-polish's c1 (the splitter) once timed out waiting for `.cal-rail` in a full run. It passed alone, and in the last full run.
- cal-wave2, event-detail, dup-open, desktop-polish and cal-rail-drop last ran at `51fc30dc`. The only change after that is the slot rows' spacing and their restored fill.
- Nothing failed on the 12-hour range wording the other builder is changing.
- My dev server on 5303 is stopped.

## Screenshots: the app next to the drawing

All in `docs/log/assets/cal-looks/`:

- **Blocks:** `side-by-side-blocks-day.png`, `side-by-side-blocks-night.png`.
- **Overlap:** `side-by-side-overlap-{day,night}.png`. The phone: `op-cascade-phone-{day,night}.png`.
- **Goal:** `side-by-side-goal-{day,night}.png`. The phone: `g-goal-phone.png`.
- **Selected:** `side-by-side-selected-{day,night}.png`.
- **The whole page:**
  - `s-desktop-{day,night}.png` (3 days at 125%, two picked, the pointer on Design review);
  - `s-phone-{day,night}.png`;
  - `c2-desktop-{100,125,150}.png`.

## Files

- **Calendar** (`app/src/features/calendar/`):
  - `CalendarGrid.tsx`, `CalendarGrid.css`, `CalendarPage.tsx` (goal, ▶ focus);
  - `PhoneGrid.tsx`, `PhoneCalendar.tsx`, `phoneCalendar.css`;
  - `blockHue.ts` (new) and `blockHue.test.ts` (new).
- **Harness:**
  - `docs/log/assets/cal-looks/verify.mjs` (new): S survey · C1 property by property · C2 states, lengths and 100/125/150% · G goal · O cascade · P selected · H motion · V side by side.
  - `cal-polish/verify.mjs`:
    - d9 reads selected B (with the keyboard focus ring blurred first: a Ctrl-click can leave it).
    - d2 grabs a held row just past its check. In a week column the hover's × takes the title's room (the drawn row's 6px gaps), so a point at 45% of the row could land on the ×.
  - `cal-polish/verify.mjs`, more:
    - b1 reads a week block's range ("12:00–1:00 PM · 1h"); it was the start alone.
    - Its 24-hour check reads the 1h block, because a 30-minute block has no time row now.
    - g2 grabs the held row as d2 does.
  - `calendar-phone/verify.mjs`:
    - It reads the 24% fills.
    - 7a's past task block now reads "Ran over", not faded.
  - `calendar-rail/verify.mjs` p5: a 10-minute task block past its end today reads "Ran over · 11:10".
  - `cal-rail-drop/verify.mjs` p1 and `event-detail/verify.mjs` a2: a swatch now draws as its token (`var(--acc-sage)`), not the hex.
  - `time-slots/verify.mjs`:
    - The block title's selector is `.kf-ev-head > .fc-event-title`.
    - A held row is grabbed just past its check.

## Notes

- **Not touched:** `lib/clock.ts` and the other builder's harnesses.
- **A scratchpad mix-up during the gate.** My first gate run wrote its logs into a shared session scratchpad folder (`…/scratchpad/h/`) that held another builder's harness logs. It may have overwritten their `cal-polish`, `cal-rail-drop`, `cal-wave2` and `calendar-phone` outputs there. Those runs were stopped, and all the numbers here come from a clean folder.
- Commits are grouped, not one per step. Blocks, overlap, goal and selected share the same few files, so they landed together in ffe24812, with follow-ups after it.
