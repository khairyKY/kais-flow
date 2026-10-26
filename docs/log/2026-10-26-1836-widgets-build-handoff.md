# widgets-build handoff — 2026-10-26 18:36 (Cairo)

Branch `claude/widgets-build` (worktree `.claude/worktrees/widgets-build`, from `claude/kai-bugs-1012`). Pushed, not merged, not released.

## What was built

- **Family style for every widget.** It follows `design-export/Phone home options.html`, "Existing widgets" (today-looks `b3104e85`).
  - The card is opaque paper. From Android 12 it uses the system corner radius (`values-v31/kfw_dimens.xml`).
  - Headers are sentence case, each with a line icon. The spaced mono caps are gone, except the goal's gold stamp.
  - Pills: terra for the main action, bone for the rest.
  - The grain overlay is gone.
- **Palette C.** The old five block tints (lavender, sage, blossom, hydrangea, goal) are gone.
  - `docs/log/assets/widgets-build/palette.mjs` reads `--blk-*` and `--blk-fill` from `app/src/styles/tokens/colors.css` and `colors.dark.css`. It writes `values{,-night}/kfw_palette.xml` and 16 `drawable/kfw_blk_*.xml`.
  - Each block gets its fill (the accent at 24%, or 20% at night, over the paper), its edge (45%) and its text tone.
  - No colour was invented, and the web palette is unchanged.
- **Real checkboxes on Android 12+.** `layout-v31/kfw_box*.xml` is a `CheckBox` that ticks on the home screen at once (`setOnCheckedChangeResponse`, then the same WidgetActions tick). Done items stay checked and disabled.
  - Below Android 12, `layout/kfw_box*.xml` is the old image with a PendingIntent.
  - Every row includes the box, so the two versions live in one place.
- **Shared pieces** in `Render`: the header (`kfw_head`), the paper goal strip (`kfw_goal_strip`), a row to tick (`kfw_row_task`), a palette C block row (`kfw_row_blk`), the Now card top (`kfw_nowhead`) and the capture bar (`kfw_capbar`).
- **Calendar column** (`Timeline`, Android 12+, used by W14 and W15): hour lines, blocks placed by time, and the now line. It positions them with `setViewLayoutMargin`/`Height`. Below 12 the blocks show as rows.
- **Day bar** (`DayBar`, family C: Kai's pick, direction 4 of `Day strip options.html`).
  - The day from 7 AM to 11 PM. Overlapping blocks go on a second lane. The goal gets a gold underline. A sun and a moon mark the rituals. A lavender tick marks now, with hours under the bar.
  - It is drawn as two bitmaps, one for day and one for night. `layout{,-night}/kfw_daybar.xml` picks which one shows, so dark mode needs no redraw.
  - Tapping it opens today's calendar.
  - W08 uses a slim version of the bar.
- **Snapshot** (`app/src/features/widgets/snapshot.ts`, `WidgetBridge.tsx`):
  - Block `color` is now the palette C swatch name, as `blockHue` draws it: a pre-C colour maps to its new swatch, a custom one to the nearest swatch, and no colour gives Iris for a task or Rose for an event. A new `goal` flag marks the goal block.
  - New fields: `tasks` (Today's tasks, apart from the Top 3, overdue and Also open), `alsoOpen`, and `hour24` (the app's clock, so the widgets show "1:30 PM" or "13:30" as the app does).
  - The project and domain colour fallback was dropped, because the calendar doesn't use it.
  - Java still reads old snapshots (old colour names and hexes are mapped), so widgets look right before the app's first push after an update.
- **Limits are kept.**
  - RemoteViews stock views only.
  - `updatePeriodMillis` stays at 30 minutes, plus the app's pushes and the existing one alarm at the next block start or end. No new periodic redraws were added.
  - Text fits by height: rows are counted from the size the launcher reports (`Render.fit`), and titles get 2 lines where there's room.

## Every widget

Previews are in `docs/log/assets/widgets-build/`. Each `wNN.png` shows before, after by day, and after at night.

| Old | New name | Size | Verdict | What changed | Preview |
|---|---|---|---|---|---|
| W01 Goal of the day · slim | same | 4×1 | keep · **redo** | paper strip, 2-line title, gold stamp with time | `w01.png` |
| W02 Goal of the day · card | same | 2×2 | keep · restyle | tape, stamp, 3-line title, time · length, real box | `w02.png` |
| W03 Top 3 · small | **Checklist · small** (family A) | 2×2 | keep · **redo** | ☆ Top 3 · 0/3, paper goal, picks to tick | `w03.png`, `families-*.png` |
| W04 Today · Top 3 | same | 4×2 | keep · **redo** | date · progress + add, goal (3 lines), Up next block, picks | `w04.png` |
| W05 Today · full page | **Now card · large** (family B) | 4×4 | keep · **redo** | Now card + times, next 2 blocks, goal, Top 3, capture | `w05.png`, `families-*.png` |
| W06 Now | same | 4×2 | keep · **redo** | Now card in the block's colour, Then block, Start focus / Done | `w06.png` |
| W07 Up next · tiny | same | 2×1 | keep · **redo** | palette C block, "Next · 11:00", 2-line title | `w07.png` |
| W08 Day progress | same | 4×1 | keep · restyle | slim Day bar in palette C (plain bar on an empty day) | `w08.png` |
| W09 Capture seal | same | 1×1 | keep · restyle | system radius | `w09.png` |
| W10 Capture pill | same | 2×1 | keep · restyle | "Type or talk" | `w10.png` |
| W11 Capture bar | same | 4×1 | keep · restyle | + field, line-icon mic and Paper | `w11.png` |
| W12 Paper capture | same | 1×1 | keep · restyle | pen drawing + "Paper" | `w12.png` |
| W13 Ask | same | 4×1 | keep · restyle | chat icon field, starter chip | `w13.png` |
| W14 Agenda | same | 4×3 | keep · **redo** | calendar column, palette C, now line (rows below Android 12) | `w14.png` |
| W15 Agenda + week | same | 4×4 | keep · **redo** | lavender "today" week row + calendar column | `w15.png` |
| W16 Week strip | same | 4×1 | keep · restyle | lavender today chip, serif dates, dots | `w16.png` |
| W17 Countdown | same | 2×1 | keep · restyle | "title · date", days in serif | `w17.png` |
| W18 Focus (+ its idle face, old W19) | same | 2×2 | keep · restyle | ring in the task's block colour, Stop / Done pills | `w18.png` |
| W20 Focus · slim | same | 2×1 | keep · **redo** | smaller ring, 2-line task | `w20.png` |
| W21 Routines | same | 2×2 | keep · restyle | header with icon, real boxes | `w21.png` |
| W22 Routines · week | same | 4×2 | keep · restyle | best streak in header, done-green squares | `w22.png` |
| W23 Streak plant | same | 2×2 (→1×1) | keep · restyle | header, plant, days in serif | `w23.png` |
| W24 Streak · tiny | W23 at 1×1 | 1×1 | **merged** into W23 | hidden from the picker (`widgetFeatures="hide_from_picker"`); placed ones keep working, bigger sprig | `w24.png` |
| W25 Inbox | same | 2×2 | keep · restyle | header, flower, count, Sort them | `w25.png` |
| W26 Inbox · tiny | same | 1×1 | keep · restyle | terra badge | `w26.png` |
| W27 Overdue | same | 2×2 | keep · restyle | terra label, count + oldest, Replan all | `w27.png` |
| W28 Slipping | same | 2×2 | keep · restyle | rows with days, "Quiet 5+ days" foot | `w28.png` |
| W29 Plan my day · Shut down (+ evening face, old W30) | same | 4×2 | keep · **redo** | one header line, title + one pill, the 4 steps as chips | `w29.png` |
| W31 One line | same | 4×2 | keep · restyle | journal header, hand line, mic + Write | `w31.png` |
| W32 From a while ago | same | 4×2 | keep · restyle | header with date, quote, "Open ›" | `w32.png` |
| W33 Pressed | same | 2×2 | keep · restyle | header with date, specimen on goal paper | `w33.png` |
| W34 Season | same | 2×1 | keep · restyle (spec had cut; nothing is cut) | daisy, season, title | `w34.png` |
| — | **Checklist · medium** W35 (A) | 4×2 | new | goal + picks and Today's tasks to tick | `families-*.png` |
| — | **Checklist · large** W36 (A) | 4×4 | new | Next, goal, picks, Today's tasks, Overdue / Also open, capture | `families-*.png` |
| — | **Now card · small** W37 (B) | 2×2 | new | Up next, progress, times, Then | `families-*.png` |
| — | **Now card · medium** W38 (B) | 4×2 | new | Now card + next two blocks | `families-*.png` |
| — | **Day bar · small** W39 (C) | 2×2 | new | bar + Next (+ Then when it fits) | `families-*.png` |
| — | **Day bar · medium** W40 (C) | 4×2 | new | the spec's widget: bar, Next with countdown, goal | `families-*.png` |
| — | **Day bar · large** W41 (C) | 4×4 | new | bar, Next, goal, Top 3, capture | `families-*.png` |

A widget still changes its face when resized.
- W03, W35 and W36 are one Checklist that changes with size. W37, W38 and W05 are one Now card. W39, W40 and W41 are one Day bar.
- W04 resized to 2×2 becomes the Checklist. At 4×4 it becomes the Now card.

## Verification

- **No Android SDK on this machine.** `ANDROID_HOME` is empty, there's no `%LOCALAPPDATA%\Android\Sdk` and no `sdkmanager`. I didn't install one.
  - Instead, I dispatched CI's Android build on this branch (`gh workflow run android.yml --ref claude/widgets-build`). It isn't a release. It is green: the APK builds and the emulator smoke test passes (see Notes).
- **`python docs/log/assets/widgets-build/check.py`: ok.** It checks:
  - every `R.*` in the Java and every `@type/name` in the XML exists;
  - each builder's ids are in the layouts it draws (includes expanded);
  - the -v31 and -night variants keep their base layout's ids;
  - KfWidget.ALL, the manifest receivers, the provider info XML, the labels, the descriptions and the previews all line up (39 receivers);
  - no dead `kfw_*` resources.
- **Previews:** `mock.html`, shot by `node docs/log/assets/widgets-build/shoot.mjs` (playwright-core + system Chrome). These are HTML mirrors of the layouts and what the Java fills in, not device renders.
  - Colours come from the app's tokens, so Day and Night are true.
  - `results.json`: no page errors and nothing overflowing its card.
  - The picker previews `res/drawable-nodpi/kfw_preview_w01…w41.webp` were regenerated from the day faces. The old ones are kept in `before/`.
  - The debug `WidgetGallery` is updated for the new kinds, so it can render the real widgets on a device.
- **Web gate** (`gate.ps1`): lint 0, build 0, ds-check 0 new.
  - vitest 2564/2564 in Cairo, Los Angeles and Tokyo. In UTC, one test failed once, then passed in two reruns (flaky, and not in the widget suites). `snapshot.test.ts` has 13 tests, including palette C mapping, Today's tasks / Also open, and the clock.

## Notes / deviations

- **W24 and W34.** The spec cut them; the task says nothing is cut.
  - W34 is kept and restyled.
  - W24 becomes W23's 1×1 face and is hidden from the picker. Its provider id stays registered, so W24 widgets already on a home screen keep working.
- **The goal block.** It keeps its own swatch, with the gold rule and ✶ added. In the Day bar it gets the gold underline. Before, it was drawn all in gold.
- **Day bar sun.** The morning ritual has no clock time in the app, so the ☀ sits at 7:30 as the spec draws it. The ☾ sits at 5 PM (SHUTDOWN_FROM).
- **Countdowns.** "in 19:42" is a live Chronometer, which shows minutes and seconds (as W06 did before). A widget can't show "in 20m" live.
- **Calendar column.** Overlapping blocks overlap; they aren't side by side. The now line moves with the 30-minute update and the app's pushes.
- **Ritual chips** (W29) are the four step names, with no ticks. The snapshot has no per-step state.
- **Progress lines.** The progress line, the focus ring and the Now ring take the block colour from Android 12 (tint lists). Below 12 they use the muted ink.
- **Left alone.** The focus round's one-minute ring redraw while a round runs is unchanged.
- **Other builders.** No notification files were touched. The only app/src changes are the three files in `features/widgets`.
- **Generators.** `design-integration/render_widget_res.py` ICON_NAMES now lists the icons in use: today, calendar, clock, activity and chat were added; check, stop, review, pickdate and send were removed.
- `app/node_modules` is a junction to `kai-bugs`' copy, which has the same lockfile. It is untracked.
- **CI:** the first dispatched build (run 40350922557) failed in `mergeReleaseResources`, because aapt refuses a `--` inside an XML comment (CSS token names in my comments). I fixed it, and `check.py` now parses every XML file. The second run, [40352350554](https://github.com/khairyKY/kais-flow/actions/runs/40352350554), is green: the release APK built with all 39 receivers (`android-native.sh`), and the emulator smoke test passed (API 34). Nothing was released or attached.
