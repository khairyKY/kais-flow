# Screens · 2026-09-28 · sheets, phone calendar, first run

Three new screen files built from briefs 04, 07 and 09 (Kai's vault, `Claude Design Prompts/`). They use the refreshed design system (DS-CHANGELOG 2026-09-27) and the Mobile Kit. Every kit piece comes from `_gen/lib.js`, the generator the MK pages were built from, so the markup matches the MK sheets exactly. The page chrome is the same `dv-turn` / `dv-opt` / `dv-olabel` canvas used by Onboarding.dc.html and Calendar.dc.html. Frames are 390 × 844. Night frames put `data-theme="night"` on the device. Rendered in Chromium: no console errors, and no text under 12px inside any frame.

## Files and options

### `Task Sheet.dc.html` (brief 04)
- **4a** Medium (60%), a typical task, with the "Saved" flicker
- **4b** Full height: notes, 3 subtasks, the block card and the Focus pill
- **4c** Editing the title with the keyboard up
- **4n** Swiping down mid-drag (edits are already saved) *(extra)*
- **4m** Not on the calendar yet → Suggest a time, showing 3 slots *(extra)*
- **4d** The project picker sheet over the task sheet
- **4e** The ⋯ menu (Duplicate, Copy link, Delete)
- **4f** Delete → the sheet closes and a toast shows "Deleted · Undo"
- **4g** Recurring: "Every weekday", with the next dates shown
- **4h** Completed, with Reopen
- **4i** Loading skeleton inside the sheet
- **4j** Not found (deleted on another device)
- **4k** Offline edits
- **4l-a / 4l-b** Night versions of 4a and 4b

### `Calendar Phone.dc.html` (brief 07)
- **7a** Day view: 4 events, the now line (13:40), the unscheduled strip
- **7b** Swipe to the next day (transition frame)
- **7h** 3-day view
- **7n** Tap the title → Day / 3 days / Week *(extra)*
- **7c** Tap an empty slot → quick-create sheet (keyboard up)
- **7d** Tap a block → block sheet
- **7g** Tap an unscheduled chip → Schedule sheet with the next 3 free slots
- **7g2** Schedule sheet for a task too long for today *(extra)*
- **7e** Long-press → block lifted and moving, with the time bubble
- **7f** Resizing with the handles
- **7m** Dropped → toast "Moved to 16:15 · Undo" *(extra)*
- **7i** Empty day
- **7j** Loading (no cache)
- **7k** Offline
- **7l-a / 7l-d** Night versions of 7a and 7d

### `First Run.dc.html` (brief 09)
- **9a** Sign up · **9c** Check your email · **9f** Email confirmed ✿ · **9g** Onboarding, empty · **9h** Onboarding, filled (date chip) · **9i** First Today with 3 items and the hint
- **9b-1** Email in use · **9b-2** Weak password · **9b-3** Offline · **9d** Resend cooling down · **9e** Link expired
- **9j** Sign in · **9k-1** Reset link sent · **9k-2** Set a new password · **9k-3** Reset link expired
- **9l-a / 9l-g** Night versions of 9a and 9g · **9m-a / 9m-g** Desktop versions (1200 × 760) of 9a and 9g

The happy path is 7 steps: open the app · Create account · Open email app · tap the link · (confirmed, automatic) · type 3 things · Start.

## Decisions the briefs didn't cover

### Task sheet
- **Save feedback.** The footer's left side is two lines of small mono. The top line flickers "✓ Saved" (sage) for about 1.5s after each change, then reads "Edited 15:02". The bottom line reads "Created …". Offline, the top line reads "○ Pending sync". No Save or Cancel buttons anywhere.
- **Full height.** The ✕ sits in the handle row (a 48px row) rather than adding a separate header, so the title row looks the same at both heights.
- **Keyboard up.** The footer hides and the sheet's bottom sits at the top of the keyboard. Back closes the keyboard first.
- **Chip looks.**
  - Unset fields are dashed outline pills. This reuses the dashed "+ LABEL" / "CUSTOM" chips from Editor 1a.
  - Labels are an outlined pill, as in the Editor.
  - Repeat and Remind reuse the lavender date parse chip ("when" attributes).
  - The project chip is always moss, per the DS parse chip. The project's own hue shows as a dot in the picker.
- **⋯ glyphs.** The 39-icon set has no duplicate or link glyph, so ⋯ uses `plus` for Duplicate and `send` for Copy link. **Ask for two glyphs in the next Icons pass.** The Focus pill uses the kit's focus glyph, since there is no ▶ glyph.
- **Project picker.**
  - Tapping a row applies it and closes the picker; there is no Done button.
  - The search field doubles as create.
  - "No project" is the chip's Remove.
- **Unschedule.** It is not in the task sheet. The block card opens the block sheet (07d), where Unschedule and Delete live.
- **Suggest a time.** It shows 3 slots inline that fit the duration before the due time. The first is pre-selected; one tap places the block.
- **Delete copy.** The toast says "Deleted" + Undo, as the brief asks. The DS swipe row says "Moved to Trash · Undo". **Pick one wording for both.**
- **Recurring.** The primary button becomes "Done for today", which completes this occurrence. The next two dates are listed under the chips.
- **Completed.** The primary button disappears and "Reopen" (secondary) replaces it. The chips keep full contrast; they are not dimmed.
- **Not found.** Uses `cherry/fallen.png` as the task species at its zero stage.

### Calendar (phone)
- **Grid.** Hours are 64px and snapping is every 15 min (16px), both from the MK Now line / Week Strip. Blocks use the MK Week Strip look: fill only, radius 3.
- **Block colour.** Colour comes from the block's kind (CALENDAR.md §3):
  - task with a project: the project's hue
  - meeting: blossom
  - ritual: sage with the hatch
  - task with no project: lavender
- **Past and in-progress blocks.** Past blocks are shown at 55% opacity and 0.6 saturation. A block in progress reads "Now · 20m left".
- **Partly visible blocks.** A block scrolled half off keeps its title in the visible part. Task blocks always show an 18px checkbox, never on hover only.
- **Header.** The title plus a chevron is the view switch. A "Today" ghost button is always there and re-centres on the now line. There is no search or ⋯ in the header.
- **Unscheduled strip.** A 56px strip holding the 1b paper cards at kit sizes (40px tall), led by the label "Unscheduled · N".
- **Day swipe.** Only the day column slides; the hour labels stay put. A swipe past 40% (`--swipe-commit`) or a fling commits. The title and the week strip change after the commit.
- **3-day view.** A 32px day-header row is added. The week strip washes the visible range with `--select-bg`. Blocks shorter than 56px show their title only.
- **Quick create.**
  - The keyboard opens straight away.
  - The grid scrolls so the tapped slot, drawn above the scrim, stays in view.
  - The default is 30 minutes and a Task.
  - Save stays disabled until there is a title.
- **Block sheet.**
  - Its checkbox marks the task done.
  - Delete removes the block only; the task stays.
  - Unschedule sends the task back to the strip, with Undo.
- **Lift and move.**
  - The lift is scale 1.04, +1.2° and `--shadow-popover` (Motion 5b drag lift). The block's old place stays as a dashed outline.
  - The time bubble sits in the hour gutter, using the inverted `--toast-bg` / `--toast-ink` pair.
- **Resize handles.** They sit *outside* the block's top and bottom edges, each with its own 48px target, so a 30-min block still has a body to drag. If you release without moving, the block stays lifted until you tap elsewhere or press Back.
- **Schedule sheet.** One tap on a slot schedules the task and shows a toast with Undo. If nothing fits today, the sheet says so and offers the next days.
- **Empty day.** Uses `daisy/future.png` (the calendar's species at its zero stage) and a "Plan my day" secondary button (links to brief 06).
- **Flag:** at night the ritual hatch keeps the day recipe (white at 28%) and reads strong. **Kai to judge.**

### First run
- **Show/Hide.** The password toggle is the word "Show", because there is no eye glyph.
- **Password rule.** The only rule is 8+ characters, shown live. Supabase's leaked-password check needs a paid plan, so it isn't assumed.
- **Email links.** The copy says "Links last an hour and work once", which is Supabase's default expiry. If the expiry is raised (the maximum is 24h), change the copy.
- **Resend.** 9c shows Resend available, because the 60s cooldown has run out. On first arrival the button already counts down (9d without the toast). A spinner line, "Waiting for the link…", tells you the screen will notice the confirmation by itself. A hint line reads "Not there? Check Spam or Promotions."
- **Onboarding Start button.** Start stays disabled until one line has text; Skip is the path for an empty screen.
- **Dates in the 3 things.**
  - Every line becomes `top3 = true`.
  - A line with a date keeps that date, so Today's Top 3 can show "Tomorrow 15:00".
  - The parsed date words are removed from the title.
- **First-visit hint.** One Caveat line under the NOW slip, which is in its Free state. It goes away after the first tap anywhere.
- **Forgot password.** If the email is already typed, the reset link is sent straight away (one tap). Setting the new password signs you in and goes to Today.
- **Illustrations** (existing assets only):
  - clover seedling: sign up
  - envelope with an intact seal: check email and reset sent
  - broken seal with a seedling (the one flourish): confirmed
  - envelope back: expired
  - clover awake: onboarding
  - clover resting: sign in
  - fern unfurling: new password
- **Desktop.** Keeps the Onboarding.dc.html layout: wordmark top-left, fern watermark, one centred column (400 / 460).
