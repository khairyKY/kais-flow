# Live-judging register — session 3 (2026-07-29)

> Kai's walkthrough from punch item **27 onward**, plus loose observations. Continues sessions 1 (`JUDGING-2026-07-28.md`, J-1…J-4) and 2 (`JUDGING-SESSION-2.md`, J-5…J-15). **Flagged and root-caused only — nothing fixed.**
>
> **Newly passed:** 27, 29, 30\*, 32, 33, 34, 36, 37, 39\*, 40, 44\*, 52, 55, 59, 60, 65. (\* = passed with a comment, below.)

---

## J-16 · 🔴 A filed inbox item came back as "waiting"

**Symptom (Kai):** the item *"judge Kai's Flow through the punch list"* — which he filed as a task **yesterday**, successfully, with the toast and the task visible in its project — is sitting in the Inbox again today marked pending, timestamped 28 Jul 12:00. He did not re-create it.

**What is ruled OUT** (checked, don't re-investigate):
- `fileToTask` does set `status: 'filed'` (`features/inbox/api.ts:119`), and the pending list filters on `status === 'pending'` (`:21`) — the client logic is correct.
- `do_resurface()` (`0008_search.sql:190-210`) only inserts into `resurfaced_log`; it never touches `inbox_items.status`.
- The outbox already strips the generated `search_tsv` column before upserting (`lib/outbox.ts:186`), so that class of rejection isn't it.

**Most likely remaining cause:** the `status: 'filed'` write never reached the server — parked in the outbox dead-letter queue while the *task* write succeeded. The optimistic cache showed it filed all day yesterday; today's cold session refetched the server's truth (`pending`). The `embedding` column (`vector(384)`) is **not** stripped from the round-tripped row, which is one candidate for a rejected upsert, but that is a hypothesis, not a finding.

**[KAI] — 30-second check that turns this into a fact.** On the live app, DevTools → Console:
```js
(await import('https://esm.sh/idb-keyval')).get('kf-outbox-dead').then(console.log)
```
If that array is non-empty, every entry is a write the server refused — it will name the table and the reason, and that is the real bug. Please paste the output.

**Why this matters more than one stray item:** if inbox status writes are dead-lettering, then *filing and dismissing have never actually persisted* — they only looked like they did. That would also explain the "billion Shower + Breakfast" surviving triage.

## J-17 · 🟡 Keyboard shortcuts should render as keycaps everywhere

**Kai:** "I want the same keyboard shortcut templates like in the `?` overlay… each button written and designed as if it's a keyboard button. I want the same exact thing globally — anywhere you're using a keyboard shortcut — **and include them in right-click context menus as well.**"

Today `KeyChip` (`components/ShortcutOverlay.tsx:5-29`) is the only styled keycap; every other shortcut hint is plain mono text (Inbox strip, sidebar footer ⌘K/⌘//⌘J, ContextMenu's `shortcutHint()` right column, QuickCreate's `esc`/`Create ⏎`). **Ask:** promote `KeyChip` to the shared kit and use it at every one of those sites.

## J-18 · 🟡 The dedupe assistant is unfindable

**Kai:** "I couldn't find [item 28]… I see like a billion Shower + Breakfast tasks."

It exists and is built — but only at **Settings → Import (`/settings/import`) → "Tidy duplicates"**, which is two levels down and named nothing like the problem. The 76× duplication is visible on the *Tasks* page, so the affordance belongs where the mess is. **Ask:** surface it from Tasks (e.g. a quiet "N duplicate series found — tidy them" line when clusters exist), or at minimum link it from the Repeating view.

## Projects (item 41) — his side-by-side against the export

- **✅ List view reads as near-identical** to the export. He accepts the layout.
- **J-19 · 🟡 Slipping projects show no flag in the list view.** Confirmed in code: `ProjectsPage.tsx:289-301` renders the `slipping` chip for **areas only**; `isSlippingProject` (`:158`) is used exclusively by the **board** (`:554`). So a slipping *project* is unmarked in the list while a slipping *area* is marked — an internal inconsistency, and the export's contract does carry the chip.
- **J-20 · 🟡 The Active section gets cluttered** with a long project list — he questions whether one flat list is the right UX at his volume (28 projects). Design call, not a defect.
- **J-21 · 🟡 The nav controls sit under the page heading.** "Board / Finished / domain buttons shouldn't live under the heading of the page." This is the second row WA-8 introduced when it split the crowded header (which fixed his older "four big pills" note) — the split was right, the placement isn't. Needs a home that isn't beneath the h1.
- **✅ Board view: "looks great, I'm not going to lie."**
- **J-22 · 🟡 Board petal/leaf animation is in lockstep across cards.** Confirmed: the three amber leaves are staggered *within* a card by hardcoded delays (`0s / 3.4s / 6.2s`, `ProjectsPage.tsx:576-578`) — but those same three constants apply to **every** card, so all cards animate as one. Needs a per-card offset (card index or id hash) so the board breathes instead of pulsing.
- **J-23 · 🟡 Project titles look blurry on the board.** Not the F6 tilt cause — board cards carry no `rotate()`, and the only `filter` is `saturate(0.8)` on the *image*, not the text (`:585`). Suspect the J-5 zoom family or an animated-layer rasterisation from the amber leaves. **Needs his pointer at one specific card to chase properly.**
- **J-24 · 🟡 Possibly the wrong flower on board cards.** He isn't convinced the species matches the export. The header uses `getWisteriaImage(forestPct)`; the per-card image is a separate `imgSource` binding. Needs a check against `Projects.dc.html` 2a (the export's board = wisteria per card).

## Answers to his in-list questions (not defects)

- **Item 31 — "what rules, and where?"** The Edit-rule menu lives on **Perennials** (`/perennials`, reachable from Tasks → `↻ Repeating`), on each row's hover actions. If the row actions aren't discoverable, that's the finding, not the menu.
- **Item 35 — "I don't understand."** Three drag behaviours on the calendar: (a) drop a block somewhere invalid → it should shake and refuse rather than silently snap back; (b) drag a block's bottom edge shorter than 30 minutes → it should stop at 30; (c) drag a block's **top** edge → the start time should move while the end stays put. Rewritten in the punch list.
- **Item 56 — "freeze — in place, or disappear?"** **In place.** Effects-off means nothing moves; every plant, firefly and bar stays drawn exactly where it is. Nothing vanishes. (If anything disappears when you toggle it off, that's a bug — report it.)
- **Item 39 — "not sure all the states progress with the clock."** The day-header daisy takes `past` for earlier columns, `future` for later ones, and for *today* follows the clock via `daisyClockStage`: morning <11:00, midday 11:00–16:00, evening after 16:00. So within one day it only changes twice — nothing to see unless you look across those boundaries.

## Rulings he made

- **Item 38 — REJECTED as written.** "That shouldn't be here, we are our own app." The Akiflow-alignment benchmark is struck; the calendar is judged on its own terms. *(The item's real content — gutter widths, header alignment, block insets — is folded into J-13's calendar work rather than kept as a comparison exercise.)*
- **Item 30 — passes, but the Organize rail "needs to go a little bit up."**

## New requests logged (v1-or-v2 calls, not defects)

- **J-25 · Redesign every native picker.** "Anything that pops up another popover using the generic browser one, I don't like." He asked for the full list — here it is:

| Native control | Where |
|---|---|
| `type="date"` | `ScheduleMenu.tsx` ×2 · `SnoozeMenu.tsx` ×2 · `formFields.tsx` (DateInput — calendar quick-create) · `NewProjectModal.tsx` (target date) · `ProjectDetailPage.tsx` (milestone date) |
| `type="time"` | `TimeField.tsx` (already themed, still opens the OS picker) · `formFields.tsx` · `NewRoutineForm.tsx` (reminder time) |
| `type="range"` | `SettingsPage.tsx` (paper texture + the 3 resurfacing sliders — invisible input over a drawn track, so only the *thumb drag* is native) |
| raw `<select>` | `ImportPage.tsx` (column mapping) · `PeoplePage.tsx` · `PersonDetailPage.tsx` (fact type) · `NewProjectModal.tsx` · `PerennialsPage.tsx` · `ProjectsPage.tsx` — note `components/Select.tsx` is the *themed* one; these are the stragglers that never adopted it |

  The date pickers are the big win (7 sites, one component). The `<select>` stragglers are a smaller, separate cleanup — `Select.tsx` already exists and works.
- **J-26 · Icons instead of emoji** on project/area names — he parked this himself for later.
- **J-27 · Re-open a swept domain in Review.** "I should be able to open a swept one so I can edit the sweeping I've done… it's just collapsed with everything under it. I want to press it and have it expand." Currently a swept domain collapses to a summary row with no way back in.
- **J-28 · The streak vine looks static** (item 44 — screenshot `Pasted image 20260729100034.png` in the vault). Passed the number check, but the vine art may not be tracking the stage.
