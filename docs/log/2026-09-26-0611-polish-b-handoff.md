---
date: 2026-09-26 06:11 UTC
session: polish-b-worker
type: handoff
related: audit-newuser ("Create routine" row, P1)
---

# Polish B: a new routine starts honest · handoff

Branch `claude/polish-b` off `origin/claude/release-1` (`e04114a`). Not merged, no PR.
Every code change is under `app/src/features/routines/`. Screenshots are in `docs/log/assets/polish-b/`.

| Commit | What |
|---|---|
| `cf4099f` | **fix(polish-b)**: neutral New routine defaults. The streak status separates *new* from *lost*. Only routines due today count in the tally. Days before a routine was planted are "off". +22 unit tests. |
| `a5dacfc` | **fix(polish-b)**: phone rows follow #1b (no zero-streak label). A never-tended routine's trellis caption says it starts bare. |
| (this entry) | docs: handoff + before/after screenshots |

## What changed

### 1. The New routine form opens neutral
**Audit finding:** the form opened on the export's filled example: Evening, Custom **M/W/F**, reminder **on at 21:30**. Typing only a name saved a Mon/Wed/Fri routine with a 21:30 push.

**What the export shows:** `Routines.dc.html` #2a/#2b show only the *filled example*: a routine being typed, "Evening stretch" in the name field, 3 sample steps with minutes, and Health as the domain. **There is no empty-form state in the export.** So the defaults follow the plainest existing options. Nothing in the design requires a default.

| Field | Was | Now | Why |
|---|---|---|---|
| Time of day | Evening | **Anytime** | This is the control's "no time" option (saves `time_of_day = null`, which lists under the existing "Anytime" group). A segmented control always shows one option selected, and this is the one that chooses nothing. |
| Repeats | Custom | **Every day** | This is `createRoutine`'s own default cadence (`DAILY_CADENCE` in `api.ts`) and the first pill. |
| Custom days | M, W, F | **none** | When you pick Custom, all 7 day chips start unselected. |
| Reminder | on, 21:30 | **off** | No push is scheduled unless the user turns it on. |

- **Saving Custom with no day picked** is now refused. Before, it would have saved a routine that no day ever schedules. It is refused silently, like the existing empty-name case.
- **Logic moved out of the view:** `newRoutine.ts` holds `NEW_ROUTINE_DEFAULTS`, `cadenceFor()` and `draftToRoutineFields()`. The form only holds state. `newRoutine.test.ts` locks the defaults so the sample can't come back quietly.

### 2. A routine with no history reads new, never lost
**Root cause.** Every place that showed a streak asked only `current === 0`. A routine that has never been tended also has a current streak of 0, so it got the export's *broken* treatment: "streak lost" and "Bare · start again". The same routine had two more false signals:
- **Day dots:** they tinted every scheduled day in the last week as a miss, including days before the routine existed and today while it's still open.
- **Trellis:** the grace walk treated yesterday (before the routine was planted) as a forgiven miss, so the trellis said "1 rain held · it rained Mon — the vine held on."

**Changes in the logic layer (`streaks.ts`, all pure, all tested):**
- **`routineStreak()`** returns `computeStreak()` plus a `status`:
  - `growing`: current > 0.
  - `lost`: current = 0, best > 0. A streak existed and broke.
  - `new`: no scheduled day has ever been checked off.
- **`routineStartKey(created_at, completions)`** returns the routine's first real day: the earlier of its planting day and its oldest check-off. Older history is never hidden.
- **`computeGraceStreak(…, since?)` and `computeTrellisDays(…, since?)`** now take an optional `since`. Days before it are "off", never rain and never a break. This can't change `current`, because no completion comes before `since` (there's a test for this).
- **`todayTally(routines, completions)`** returns `{ due, done, remaining }`. A routine counts when its cadence schedules today, or when it's already checked off today, so `done` never exceeds `due`. A routine whose cadence skips today is neither due nor remaining. Archived routines are skipped.
- **Timezone:** date keys stay device-local via `localDateKey`, the same as every other key in the file. The Cairo-day gap is T-2's and is neither widened nor fixed here.

**The view (`RoutinesPage.tsx`, `StreakTrellis.tsx`) only maps state to copy and tokens.**

| Status | Row label (desktop) | Garden card |
|---|---|---|
| `new` | "no streak yet" | "Bare · no streak yet" |
| `lost` | "streak lost" (as before) | "Bare · start again" (as before) |
| `growing` | flame + number (unchanged) | stage · Nd (unchanged) |

- **Copy source:** "no streak yet" is the export's own caption for the bare vine (`Design System.dc.html`, Vine → bare → "no streak yet"). The export has no "new routine" state on the Routines screen, so I used the design system's wording for this exact species and stage.
- **"N of M tended"** and the progress bar now use `todayTally`.
- **Group counts** (`MORNING · 0/2`) count only routines due today. A group with nothing due today shows no count rather than "0 / 0".
- **Day dots** now use `computeTrellisDays(…, 7, today, since)`, the same states as the trellis. "Off" means not scheduled, before planting, or today while it's still open, and stays neutral. Only real misses are tinted. The export's own rows (Meditate, Plan tomorrow) also keep today's open dot neutral.
- **Trellis:** the start day is passed in. When a routine has never been tended and there's no real miss to show, the caption is "starts bare, grows with the streak ✿" (the #2a "Its plant" hint) instead of "the vine kept growing".
- **Phone rows:** no zero-streak label (see taste call 3).

## Evidence

### Automated (from `app/`, after both commits)
- `TZ=UTC npx vitest run`: **26 files, 287 tests passed** (baseline on `e04114a`: 25 files, 265).
- `TZ=Africa/Cairo npx vitest run`: **26 files, 287 tests passed**.
- **New tests** (22):
  - `streaks.test.ts`:
    - `routineStreak`: planted today → `new`; never tended → `new`; **a real broken streak (7 days tended, then two misses in the month) → `lost`**; live → `growing`; checked today → `growing` at 1.
    - `todayTally`: planted today and scheduled → 1 left; **not scheduled today → due 0, remaining 0**; a mix; a check-off on a skipped day (done ≤ due); archived routines skipped.
    - `routineStartKey`: 3 cases.
    - `since`: a routine planted today shows 7 "off" days, not six misses; no phantom rain; real misses after planting still show and `current` is unchanged.
  - `newRoutine.test.ts`: 6 cases. A name alone gives every day, no time, and no reminder; custom starts empty and the reminder starts off; a reminder time is saved only when the switch is on; explicit choices are kept; empty name or Custom with no days → refused; Weekdays = Mon–Fri.
- `npm run lint`: **2 errors** (the baseline `features/projects/ProjectsPage.tsx:23–24`) and 30 warnings. Both counts are the same as the baseline. Nothing in `features/routines`.
- `npm run build` (`tsc -b` + vite + PWA): exit 0.
- **Bundle:** `index-*.js` grew 574 B raw (`streaks.ts` is shared with Today, AppLayout and Focus). `RoutinesPage-*.js` grew 579 B.

### Real run: production build against the local Supabase stack
**Setup**
- `vite build` + `vite preview --port 5231 --strictPort`.
- `app/.env.local` points at `http://127.0.0.1:54321`.
- Account `polish-b@example.com`, signed up through the auth API.
- Playwright with Chromium 1194, `timezoneId: 'Africa/Cairo'`, run on **Sat 26 Sep 2026, ~09:00 Cairo**.
- The script is based on the conductor's `smoke.mjs`:
  1. Reset this account's routines through the REST API.
  2. Open New routine and read the form state from the DOM.
  3. Type only "Drink water" and plant it.
  4. Read the saved row back from the database.
  5. Seed three routines through the REST API:
     - "Swim": Mon/Wed/Fri, no history, so not scheduled on a Saturday.
     - "Morning pages": daily, planted Sep 10, done Sep 14–21, missed Sep 22–25. **A genuinely broken streak.**
     - "Stretch": daily, done Sep 20–25. A live 6-day streak.
  6. Read the list from the DOM at desktop 1280 and phone 390, in day and night.

The "before" bundle is the same files at `e04114a`, built separately and run through the same script.

| Check | Before (`e04114a`) | After (`a5dacfc`) |
|---|---|---|
| Form defaults (desktop) | Evening · Custom · M/W/F on · reminder `true` · 21:30 | **Anytime · Every day · no day chips · reminder `false` · no time field** |
| Form defaults (phone) | Eve · Custom · M/W/F · reminder on 21:30 | **Any · Every day · no chips · reminder off** |
| Saved row, name only | `evening`, `[1,3,5]`, `21:30` | **`null`, `[0..6]`, `null`** |
| Hero on Saturday | "0 of 4 tended · 4 left before the day's done" | **"0 of 3 tended · 3 left"**. Swim (M/W/F) isn't counted. |
| Group counts | Morning 0/2 · Afternoon 0/1 · Evening 0/1 | Morning 0/2 · **Afternoon (no count, Swim rests today)** · Anytime 0/1 |
| Brand-new routine row | "streak lost" | **"no streak yet"** |
| Brand-new garden card | "BARE · START AGAIN" | **"BARE · NO STREAK YET"** |
| Brand-new day dots | its 3 scheduled days (Mon/Wed/Fri) tinted as misses | **all 7 neutral** |
| Brand-new trellis | "0 days · 1 RAIN HELD · it rained Mon — the vine held on." | **"0 days · starts bare, grows with the streak ✿"** |
| **Broken streak (Morning pages)** | "streak lost" · "BARE · START AGAIN" | **"streak lost" · "BARE · START AGAIN"**, still lost ✓. Dots: 2 grew, 4 missed, today neutral. |
| Live streak (Stretch) | flame 6 · "SPROUTING · 6D" | flame 6 · "SPROUTING · 6D" (unchanged) |
| Console / network | 8 `api.open-meteo.com` request failures + 8 matching `ERR_TUNNEL_CONNECTION_FAILED` console lines, nothing else | the same, nothing else |

- **Aborted image requests:** I ran the after-bundle six times while iterating. One run logged `bare.png net::ERR_ABORTED` three times: those requests were cancelled by a navigation or context close while the image was still loading. The asset serves 200 (checked with curl), and the other five runs, including the final one, were clean.

**Screenshots** (`docs/log/assets/polish-b/`)
- Before:
  - `before-desktop-day-form.png`
  - `before-desktop-day-rows.png`
  - `before-desktop-day-trellis-new.png`
  - `before-phone-day-list.png` (shows "streak lost" wrapped over the names)
- After:
  - `after-desktop-day-form.png` and `after-desktop-night-form.png`
  - `after-desktop-day-rows.png` and `after-desktop-night-rows.png`
  - `after-desktop-day-trellis-new.png`
  - `after-phone-day-form.png` and `after-phone-night-form.png`
  - `after-phone-day-list.png` and `after-phone-night-list.png`

## Taste calls for Kai
1. **Anytime + Every day + reminder off as the empty form.** The export has no empty state, so this is my reading of "nothing chosen for you". When the reminder is turned on, the time field shows the export's 21:30. It's visible and editable, and never saved while the switch is off.
2. **"no streak yet" / "Bare · no streak yet"** for a routine that has never been tended. The wording is the design system's vine caption. It's the same hairline mono style as "streak lost", and the garden card wraps to two lines at 1280, just as "start again" does. Another option would be "just planted", which the export uses for a calendar block in `Rituals.dc.html`.
3. **Phone rows drop the zero-streak label** (both new and lost). The export's iPhone row (#1b) has none: "Meditate · 07:30". The phone row is ~300px, and checkbox, label, 7 dots and "archive" already fill it. The label used to wrap *over* the routine's name (see `before-phone-day-list.png`), and "no streak yet" would have been worse. On phone the difference between new and lost now shows in the day dots (neutral vs tinted). The compact garden card reads "0d" for both, as before.
4. **A group with nothing due today shows no count** ("AFTERNOON", not "AFTERNOON · 0/0").
5. **Resting day hero.** When routines exist but none is due today, the code gives "0 of 0 tended · all tended for today ✿", using the existing copy. The export has no rest-day line. This is read from the code: the real run always had routines due.
6. **Today's open dot is now neutral** in the 7-dot row. It used to be tinted as a miss. This matches the trellis and the export's rows.

## Found, not fixed (outside this brief)
- **Today page counts the same way the old Routines page did:** `features/today/TodayPage.tsx:281–282` shows "Routines · done/total" over *all* active routines, whatever the cadence. `todayTally()` is ready to reuse there, but `features/today` was outside my files.
- **A broken streak's trellis caption reads "it rained Sun — the vine held on." with "1 RAIN HELD"** for a 0-day streak (seeded Morning pages). This is the same before and after:
  - The caption prefers the most recent *rain* over a later *break*.
  - The header's rain count comes from the backward walk, which spends the month's rain on the latest miss (Sep 25), while the forward trellis window spent it on Sep 13.
  - This belongs to the Gentle Rain mechanic itself and needs Kai's call on which event the caption should name.
- **`WeeklyReviewPage` still calls `computeTrellisDays` without `since`**, so its 30-day view can still show pre-planting days as misses. It sits outside `features/routines`, and the fix is one argument: `routineStartKey(r.created_at, dates)`.
- **Pre-existing layout, unchanged:**
  - At 1280 the list column is ~370px, so names wrap ("Drink / water"). This is the audit's separate layout finding.
  - The phone row still carries dots + "archive", which #1b doesn't have.
  - The desktop New routine modal is clipped at the top at 800px height.
- **The Routines query cache survives a reload:** rows inserted through REST didn't appear after `page.reload()` within 3 s, only in a fresh context. Probably the persisted TanStack cache. Not investigated.

## Not done here
- No ROADMAP, P4 Notes or TEST-LEDGER edits. The brief limited me to `features/routines/**` plus this entry. Suggested P4 Notes line: "Polish B: `routineStreak` status new/lost, `todayTally`, `since` for pre-planting days; New routine defaults neutral."
