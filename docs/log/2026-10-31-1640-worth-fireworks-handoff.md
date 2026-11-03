# 2026-10-31 16:40 · handoff · worth-fireworks: Worth a look as a deck (B), goal fireworks (C4), the goal stays the goal (P1)

Branch `claude/worth-fireworks` (from `claude/kai-bugs-1012`). Not merged, not released. Spec: `design-export/Worth a look and fireworks.html` (Kai's picks: Worth a look **B · A deck**, fireworks **C4 · C2 with arcs and a fall**).

## P1 · ticking the goal of the day lost its goal status — fixed first

**Root cause.** Completing clears `tasks.top3` (completion.ts, so a done task frees its slot). An unranked pick's place then lived only in the star log (`activity_log` task.starred), read by Today alone:
- the app lost it whenever this device's star-log read didn't hold the star (a pick starred this session — the read ran before the outbox flushed it — or offline): the done goal fell out of the Top 3 and the next pick became the goal;
- the widget feed keeps a finished pick only when it has a `top3_rank` ("finished picks stay only if ranked"), and the MCP `today` tool listed open picks only — so both dropped every unranked done goal.

**Fix — the place goes onto the rows, at the one place every tick routes through.**
- App: `tasks/api.ts completeOne` (box, swipe, menu, key, bulk, Tasks, Today, phone) ranks today's Top 3 as drawn (`rankWrites` over `currentTop3()`, only rows whose place changes) before it completes a pick. The done goal keeps `top3_rank = 1`, so `dayTop3`, the widget and the MCP all read it as the goal from the row alone. Undo puts every rank it wrote back (`CompletionUndo.ranked`; `planUndo`/`planUndoReopen` restore the row's own rank) — the Top 3 exactly as before the check.
- Server: `mcp/tools.ts completeTask` (also the widget's `&tick=`) does the same with `picksToday` before `markDone`.
- Readers: new `_shared/today.ts dayPicks(open, doneToday)` = the app's `top3Display` (goal first done or not, open picks, then finished). The widget feed uses it (its inline copy removed); the MCP `today` tool now lists today's finished picks too (new `Store.doneTasks`, the widget's query moved there) and marks the first as `goal: true`.
- Repeats untouched: the next round is still a new row with `top3: false, top3_rank: null`.
- Tests: `api.completion.test.ts` (unranked goal stays the goal with no star log; Undo restores every rank and the goal; a non-pick writes no rank), `completion.test.ts` (planUndo puts the rank back), `notifications/today.test.ts` (`dayPicks`), `mcp.test.ts` (complete_task on the goal → still the goal, done, ranks 1/2; `today` marks the first pick `goal: true`).

## Worth a look · B · A deck

`TodayPage.tsx WorthALook` (desktop rail and, new, phone Today), CSS in `today.css` (`.td-deck*`, `.td-car*`, `.td-worth-empty`), tokens only.
- One card at a time; real ‹ › buttons (Previous / Next, off at the ends), "1 of 7" (`aria-live`), dots (the current one gold and long).
- Desktop: up to two sheets stacked behind the card (as many as are left after it, max 2).
- Phone: its own section after the folds (it used to sit inside the "Also open" fold as "Slipping" + "From a while ago"); the next card peeks in from the right, cut at the screen edge; a sideways swipe steps (the click a swipe ends with never opens the card); 36 px arrows with 44 px hit areas; "swipe for the next".
- ←/→ step while the section has focus (Shift+←/→ day nav untouched).
- Data and rules unchanged: `useSlipping` (> 7 days, oldest first), a project in today's open Top 3 skipped (now on the phone too), plus the resurfaced pick last. Plan a step / Snooze a week are the existing ones (Add bar on "#Project "; an area or domain opens its page; Snooze slides out with Undo and writes the review only after the Undo window, so it returns after a week if still untouched). The resurfaced card keeps its own buttons.
- The card is keyed by its item, so a snoozed card's exit never leaves the next one faded (the old `key={at}` would have).
- One item: just the card. None: the dashed "Nothing slipping. Everything was touched this week." with the full wisteria.

## Goal fireworks · C4

`app/src/components/goalFireworks.ts` (one module, no libraries), called from `completeOne` only when the ticked task is the goal and the tick isn't a quiet subtask tick — so every real user tick (goal card, phone goal, a Top 3 row, Tasks) and never a load, sync or Undo.
- C4 ported one-for-one: C2's three bursts (14k sparks, 2×9k px, spread 20k→27k, opacity 0.9), 200 ms apart ±20; shells fly 340 ms arcs from the checkbox and along the title (leaning ±40–80 px), x steady, y quadratic ease-out; each burst sinks 38 px (t² curve) as it fades; glow at 700 ms for 640 ms (gold); ~1.35 s in all. Desktop bursts at −38/−52/−42 px above the card at 20/50/80 %; phone on the card's top edge at 20/44/68 %, as drawn.
- Colours: three different from palette C (`--blk-*`) + gold (`--acc-gold-warm`) each tick, none from the tick before.
- Drawn on a fixed layer appended to `<body>` (never clipped by a list or scroller), positioned in the root zoom's px (`uiZoom`); the glow is masked to the ring round the card so it never tints it; on the phone the layer is clipped at the top bar's bottom edge.
- Paused while the page is hidden; the layer is removed when the last animation finishes.
- Effects off or reduced motion: the glow only (900 ms fade).

**Deviation:** C4 is Web Animations on DOM pieces (the spec's own code), not a canvas — the harness checks the layer (`.kf-goal-fw`) instead of a canvas element.

## Verify

- Gate (`gate.ps1`): vitest 2731/2731 in Cairo, UTC, Los Angeles and Tokyo; lint 0 errors; build ok; ds:check 0 new. The first ds run flagged 4 new hits, all fixed: `--ink-faint` replaces `--ink-hairline` for text, the dots' width transition is dropped, and the palette C `var(--blk-${n})` is marked `ds-ok`. birthday_on 1/1 (`lib/types.ts`, `lib/settings.ts`).
- `deno check` clean: mcp, widget, chat, notify (the `_shared/today.ts` readers).
- `docs/log/assets/worth-fireworks/verify.mjs` (mock backend, port 5344, Playwright from the scratch dir): **45/45** — deck arrows/dots/sheets/keys/ends, Plan a step (#Sotto, area → its page), Snooze + Undo (no review) and Snooze left alone (review written), one item, empty, phone peek + swipe + 36 px arrows + no sideways scroll; fireworks: nothing on load, the layer on the body unclipped, sparks above the card, gone by 2 s, reduced motion = glow only, Undo plays nothing, phone layer clipped at the top bar; the unranked goal is ranked 1 on the tick, stays in the goal card struck through, and after a reload.
- Regression harnesses on the same server (5344): phone-today 94/94, today-shell 86/86 (its Worth a look Plan/Snooze checks included), motion-lists 82/82, rituals 210/210.
- Screenshots and results.json are next to the harness in `docs/log/assets/worth-fireworks/`.

## Left for later
- The fireworks layer is placed at the tick; if the page scrolls during the 1.4 s the sparks don't follow (fixed layer).
- Older done goals (ticked before this build, unranked) aren't back-filled: they stay as the app drew them (star log) and stay missing from widget/MCP for that day only.
