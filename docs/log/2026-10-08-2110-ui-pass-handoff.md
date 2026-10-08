---
date: 2026-10-08T21:10+03:00
session: builder (ui-pass, Kai 2026-10-08 "This doesn't look good. Have an entire UI pass")
type: handoff
related: docs/log/assets/ui-pass/ · design-export/DS-CHANGELOG.md §3 · app/src/features/settings/settings.css
---

# UI pass: Settings redesigned, then the help/contrast/switch consistency fixes everywhere else

Branch `claude/ui-pass`, cut from `origin/master` (v1.0.26). Not merged, not deployed. Presentation, copy brevity and layout only — no data or behaviour changes beyond moving the plan glossary behind a link.

**Look first:** `docs/log/assets/ui-pass/overview.webp` (every before | after pair). The pairs are one WebP each in the same folder (`<screen>-<size>-<theme>.webp`; `tall-settings-*` show the whole page). `settings-glossary-*` show the new popover (computer) and sheet (phone). Make them again with `shoot.mjs` (screens on the mock backend) + `pairs.py`.

## Decisions (Kai asked for them)

- **One setting row pattern.** A label (Inter Tight 14, 15 on a phone) and one short help line (13, `--ink-muted`, sentence case — no more mono caps help). The control sits on the right at its natural width. It drops under the label only when the two don't fit side by side (flex-wrap, no breakpoint).
- **Plan-shortcut glossary → a popover/sheet, not the Guide.** The meanings are computed from *your* weekend ("the first day of your weekend (Fri + Sat)"). The Guide is static text, so moving them there would lose that. Reading seven lines shouldn't mean leaving Settings either. A quiet "What do these mean?" link in the Calendar card opens them:
  - on a computer, in the Plan menu's own popover (`Popover` from `DatePicker.tsx`, the same one Plan draws in);
  - on a phone, in a kit `BottomSheet`.
  - At its foot, "More in the Guide: Plan my day" links on to the article.
- **Card rhythm.** Every card has a Source Serif 20 title, at most one short line under it, 24px padding (16 on a phone), 20px apart (12 on a phone), and dashed rules between rows.
- **Washi tape rule.** Tape marks a placed, standalone note (the Goal card, the NOW slip). A stack of form cards carries none, so Settings has none. Before, it had tape on 4 of 13 cards.
- **Wide screens.** Two columns once the content area is ≥ 900 layout px. That's a container query, so it follows the real width at any interface size: ≈ 1920 at 125%, 1440+ at 100%.
  - Left column, how the garden looks and keeps time: Appearance · Sound · Calendar · Time zone · Resurfacing.
  - Right column, what it connects to and keeps: Notifications · Integrations · Organize · Your data · Profile · App.
  - Below 900 it is one 720px column in that same order. The section list is sticky and follows that order too.

## Changes, one line each

**Settings (desktop + phone)**
- Every row uses the one pattern above; the 30-odd mono-caps help lines are now sentence-case help (13, muted).
- The Calendar card is three rows: Opens on (Day / 3 days / Week), Weekend (four options at natural width, Custom opens the seven days under it), Plan shortcuts → "What do these mean?".
- The Sound card's last row reads "Silent after Shut down", not a wrapped mono sentence.
- Sound volume: the three 5px bars ("whisper ▮▮▮ full") are a Whisper / Soft / Full segmented control. Same values (0.34 / 0.67 / 1), same preview.
- Time zone: the paragraph is one help line; the zone and offset are the row label; the static "SAVED ✓" chip is gone.
- Import + Trash → one "Your data" card (Import · Open importer, Trash · Open trash). The section list has "Your data" (`#settings-Data`).
- Integrations summary: rows with a status dot, plus "Open integrations" in the card header.
- Notifications: kinds, Quiet hours (from–to on the row), lock screen and this device all use the row pattern. The test button stays in the card header, and the intro copy is unchanged.
- App: Version row (Check for updates) and The tour row (Show me around again), with the release notes under them.
- Profile: one row; "Rerun the welcome" is a quiet link (it was a Caveat line).
- Organize: the Add button is secondary (it was a second terra CTA), and its help is one short sentence (it was a 3-line mono paragraph).
- Phone Settings uses the same cards as the computer. The five read-out rows (Google Calendar / GitHub / Notifications / Capture API / Trash) repeated what the cards say, so they went; Trash lives in "Your data".
- Section list: real buttons (`aria-current`); it stays put while the page scrolls. Clicking a section from the Integrations page now scrolls once the cards are back (it used to do nothing).
- Kit: new `Toggle` (DS §3: bone off / `--check-fill` on, 36×20 desktop, 52×32 in a 48 hit on a phone) and `Segmented` (pill, `--block-sage` + `--acc-sage-text` 600 selected, 48 tall on a phone). The Settings switch was `--acc-sage` on `--line-solid` (2.8:1). The old Settings segmented buttons kept the browser's default border, because a comment had swallowed `border: 'none'`.

**Everywhere else**
- Task editor, quick create, event panel: field help (`FHelp`) is a 13px muted sentence, not tiny mono. "click title to edit · saves on blur" reads "Click the title to edit · saves when you leave it".
- Shut down / Plan my day (phone): a long project name wraps inside the row instead of running under the Tomorrow button.
- Tasks (phone): the gesture hint is a help sentence, not 2 lines of mono caps.
- Inbox, Routines: page eyebrows use the same token as Tasks and Journal. On a phone they were 9px.
- 121 text colours on `--ink-hairline` (the DS says non-text only; 3.6:1) → `--ink-faint` (5.5:1 day, 5.6 night). Today's Top-3 star uses `--star-on` / `--star-empty`.
- Labels under 10px → `--fs-meta` (10 desktop / 12 phone): routine garden captions, streak trellis ticks, weekly review, inbox Restore, people chips, quick capture. So do the phone-only 8–9.5px ones (Activity, Inbox, Routines, new-routine form).
- Task editor Someday, calendar view options, new-routine reminder: all use the kit `Toggle`, so there is one switch look app-wide.
- Person detail: "last touch 3d ago" stays together at 12px (360px wide).

## Audit notes (looked at, left alone)

I shot every listed screen: 1920 × 125% and 390, day + night; Today / Tasks / Inbox / Calendar / Projects / Routines / People / Library / Focus / Guide / Plan / Shut down / task editor also at 1280 and 1440 × 125% and 1920 × 100%. No sideways scroll anywhere. Today, Calendar (day/3-day/week), Projects + detail, Journal, Library, Herbarium, Focus, Guide, What's new and the task sheet already read calm and consistent, so I didn't touch them.

## Gate

- vitest from PowerShell × 4 TZ (Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata): 119 files / 1461 tests each, all pass.
- `npm run lint`: exit 0 (21 pre-existing warnings, none new). `npm run build`: OK, and `app/dist` is removed.

**Harnesses** (`node <script> <outDir> http://localhost:5279`, final runs):

| Harness | Result |
|---|---|
| sounds | 126/126 |
| plan-replan | 103/103 |
| user-tz | 33/33 |
| whats-new (app) | 73/73 |
| desktop-polish | 150/150 |
| projects-fixes | 222/222 |
| mcp | 35/35 |
| tour | 123/123 |
| capture-anywhere | 30/30 |
| tasks-noise | 210/210 |
| phone-polish | 716/718 → the 2 fails (person-detail 360 word-wrap) fixed; that audit re-run 30/30 |
| small-gaps | 154/154 |
| today-phone | 158/158 |
| task-sheet | 147/147 |
| calendar-phone | 175/175 |
| calendar-rail | 115/115 |
| rituals | 207/207 |
| tray-notify | 57/57 |
| paper-capture | 122/122 |
| resurface | 320/320 |

**Expectations updated (all intentional):**
- `plan-replan` — the glossary is read from "What do these mean?" (popover/sheet), not the card text, and "tomorrow at 09:00" is case-insensitive (first letters are raised now).
- `user-tz` — the card reads `America/New_York · GMT-4` (its row label), not "current · …".
- `whats-new/verify-app` — the App card is `#settings-App`. It was found by the old title "App · Kai's Flow".
- `mcp` — the card is the title's `<section>`; "not set up yet" / "key made …" are matched case-insensitively.
- `capture-anywhere` — the same card locator. The phone's "Capture API" read-out row is gone, so the state is read off the card.
- `rituals` — not an expectation change. It now seeds the one-time "Updated to vX" toast away, the recipe task-sheet already uses. That toast covered 6d's third pill on a slow run; I checked against a master build.

## For other owners

- **notify-fix builder:** in Settings → Notifications only the frame changed: `SCard` title/sub/aside, `NotificationRow` → the shared `Row`, kit `Toggle` with labels. `handleTest` / `handleSubscribe` and every write are untouched. The "Send a test notification" button sits in the card's `aside` slot, so put your status line beside or under it. The intro and the lock-screen copy are unchanged.
- `settings.css` is the one place the Settings look lives (`.st-card`, `.st-row`, `.st-help`, …). `kit.css` gained `.kf-toggle`, `.kf-seg`, `.kf-help`.

## For Kai to decide

1. **Inbox on a phone shows a terra "File as task" on every card**, so three terra CTAs on one screen (the house rule is one per view). Making it secondary changes the triage feel, so I left it for you.
2. **Card titles are serif now (Source Serif 20)** in place of the tiny mono-caps headers, and Settings has no washi tape. Same identity, clearer hierarchy, but it is a visible shift.
3. **The phone's five read-out rows in Settings went.** They repeated what the cards say. Say if you liked the at-a-glance list.
4. **Sound packs** in the two-column layout wrap their blurb to three lines. They could become a one-column list if that bothers you.
