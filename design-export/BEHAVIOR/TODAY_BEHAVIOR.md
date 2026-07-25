# TODAY — right-rail behavior spec

Source of truth: `Today.dc.html 1a` (desktop, right rail = the `264px` column) and its `1b` iPhone echo.
Cross-refs: `Motion.dc.html`, `Effects.dc.html`, `MOTION_RETROFIT.md`, `Routines.dc.html`, `Projects.dc.html`, `Overlays.dc.html`.

> Scope: this file defines the **right rail** the user asked about — the three stacked sections **Slipping**, **Routines · 2/4**, **From a while ago** — plus the **Goal of the day** card (which lives in the left column's *Top 3* but is the "goal" referenced). Every draggable/hover/press/overlay *grammar* is defined once in `MOTION_RETROFIT.md`; here we bind each rail control to its exact motion. Nothing invented — only what exists in `Today.dc.html`.

The rail is a `flex-direction:column; gap:26px` stack. Each section = a mono-uppercase label (10px, `letter-spacing:0.18em`) + a dashed rule, then its content. **Only "Slipping" uses `--acc-terra` for its label** — that terra is the app's single "needs your eyes" signal; the other two labels are `--ink-faint`.

---

## A. "Slipping" — a project going untouched

Anatomy: one placed card — `bg:#F8F1DC`, `border:1px solid --line-goal`, `--shadow-card`, `border-radius:3px`, `transform:rotate(0.4deg)`. Top-right: `wisteria/p20.png` (height 56px, `opacity:0.7`) = the project's live growth stage (p20 = ~20% weighted milestones). Title *Forecasting App*; meta *5 days untouched* in `--acc-gold` mono; a terra underlined text-button *reviewed*.

**When it appears:** only when a project (or starred task) has had no activity for ≥ the "slipping" threshold (set in Review/Settings). If nothing is slipping, **the whole section is absent** — never rendered empty, never grayed (States `1a` rule). Multiple slipping items stack as multiple cards.

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Hover the card** | Lifts −1px under a soft shadow; the wisteria does **not** animate. | `hp`: `translateY(-1px)`+shadow, `--dur-quick` 150ms `--ease-out` | Motion `4a` |
| **Press the card** | Gives to `scale(0.97)` in 80ms. | active `scale .97` · 80ms | Motion `4a` |
| **Click the card body** | Opens the **Project detail** via vertical stack push — detail rides up over Today, which recedes −26px / `scale .98` / 14% dim. `Esc` / back / swipe-down pops it. | `pushUp/pushBack` 380ms `cubic-bezier(0.32,0.72,0,1)` | Motion `2b`, `4e`; `Projects.dc.html 1b` |
| **Click "reviewed"** | The button gives (0.97), then the card **files out and the rail heals**: card slides 26px + fades, height collapses, the sections below rise to close the gap. A **toast** rises bottom-center — *"Marked reviewed · Undo"* (Undo restores the card). The wisteria stage is **unchanged** (reviewing isn't progress) — the item simply stops slipping. | `rowOut` 200ms slide + 180ms collapse; `toastIn` 220ms, dwell 4s, exit 160ms | Motion `3e`, `3d` |
| **"5 days untouched" counter** | Live text = days since the project's last activity; re-reads on view entry. Not interactive. | — | — |
| **Undo the toast** | Card breathes back into its slot. | `rowIn` 240ms | Motion `3e` |

**Do NOT:** turn "reviewed" into a destructive confirm (no dialog — reviewing is reversible via Undo, so it skips the confirm per house rules), and do not advance/regress the wisteria on review.

---

## B. "Routines · 2/4" — today's routine checklist

The header count is `completed / total for today` (re-computed live). Steps are grouped by time-of-day sub-labels (**Morning / Afternoon / Evening**, mono 9px `--ink-hairline`). Each step is a row: a 16px checkbox + label.
- **Done row:** box filled `--sig-done` with a `✓`, label `--ink-hairline` + `text-decoration:line-through`.
- **Open row:** `1.5px solid #bfb8a3` empty box, label `--ink-body`.

This is the **same routine data as `Routines.dc.html`** — checking here writes through to that page and to the streak.

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Check an open step** (click the box) | The **Check pop** sequence: box fills (90ms) → check overshoots in `scale 1.3→1` (180ms) → strike-through draws left→right (240ms) → label dims to `--ink-hairline` → the row dips 1.5px and settles (120ms). One-shot. Header count increments (2/4 → 3/4). Sound: *paper rustle*. | `boxFill` 90ms · `checkPop` 180ms overshoot · `strikeGrow` 240ms · `rowDip` 1.5px 120ms | Motion `3b`, `5a` |
| **Check the LAST remaining step** | Same check pop, **plus** a checkbox bloom sheds a single petal (petal-fall stacks on top *only* when it's the last). If this clears **all** of today's routines, the sidebar streak-vine ticks up and the **Day-complete** effect may fire (petal-burst + quiet banner). | bloom 260ms + petal 400ms; Effects `2d` petal-burst | Motion `5a`; Effects `2d` |
| **Uncheck a done step** | Reverse: strike retracts, box empties, label returns to `--ink-body`, count decrements. **No petal** on uncheck. | reverse of `3b` | Motion `3b` |
| **Hover a row** | Shares the resting layer — subtle −1px lift; box border warms slightly. | `hp` 150ms | Motion `4a` |
| **Click the label text** (not the box) | Opens that routine's detail on the **Routines** page (stack push). The box stays the toggle; the label is the link. | `pushUp` 380ms | Motion `2b`; `Routines.dc.html` |
| **Click the "Routines · 2/4" section header** | Navigates to the full **Routines** page (route cut). | route cut 160ms | Motion `2a` |

**Ordering:** completed steps stay in place within their group (no reflow on check) so the row the user clicked doesn't jump; the strike + dim is the only change. Reordering/removal is not a Today behavior.

---

## C. "From a while ago" — a resurfaced saved idea

Anatomy: one placed card — parchment bg, `border:1px solid --line-card`, `--shadow-card`, `transform:rotate(-0.3deg)`, with a clover-terra **washi tape** at top-right (`rgba(201,160,160,0.4)`, striped). Body: an italic display quote (*"Try the pricing model on the Cairo cohort first."*). Two chips: **Still relevant** (filled `--acc-terra`, white text) and **Later** (outline, `--ink-muted`).

Purpose: the app periodically resurfaces an old captured note/idea for a one-tap triage. The washi tape is correct here (house rule: tape only on *placed standalone cards*, never plain list rows).

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Hover the card** | −1px lift + soft shadow. | `hp` 150ms `--ease-out` | Motion `4a` |
| **Press either chip** | Chip gives to `scale .97` (80ms) before its action. | active `scale .97` · 80ms | Motion `4a` |
| **Click "Still relevant"** | Keeps the idea active: card presses, then **files out** (slide + collapse) and the rail heals; toast *"Kept · Undo"*. The idea returns to its live home (Inbox/Notes). If another resurfaced item is queued it **breathes into** the freed slot; otherwise the section goes absent. | `rowOut` 200+180ms; `rowIn` 240ms for the replacement; `toastIn` 220ms | Motion `3e`, `3d` |
| **Click "Later"** | Snoozes the idea: card slides 26px right, fades, collapses; toast *"Snoozed · Undo"*; it resurfaces after the snooze interval. | `rowOut` 200+180ms; `toastIn` 220ms | Motion `3e`, `3d` |
| **Click the quote body** | Opens the full note (stack push detail / sheet on mobile). | `pushUp` 380ms | Motion `2b` |
| **Undo any toast** | The card breathes back into place. | `rowIn` 240ms | Motion `3e` |

Both chips are non-destructive (reversible via Undo) → **no confirm dialog**.

---

## D. "Goal of the day" — the gold card (left column *Top 3*, referenced as "goals")

Anatomy: `--paper-goal` bg, `--line-goal` border, `--shadow-goal`, `rotate(-0.4deg)`, centered washi tape on top, a `19px` gold checkbox, the `✶ Goal of the day` kicker, the goal title (display 19px), a project chip + *Due today*, and `clover/four_leaf.png` + hand-script *"for luck"*.

| Trigger | Response | Tokens | Source |
|---|---|---|---|
| **Hover the card** | −1px lift. | `hp` 150ms | Motion `4a` |
| **Check the gold box** (complete the goal) | Full **Check pop**, then — because the goal is the day's keystone — a **Day-complete** celebration: a short petal-burst from the four-leaf clover + a quiet banner (*"The day's goal is done."*). The terrarium band's stage may advance. Never blocks; auto-dismisses. | `checkPop` 180ms; Effects `2d` petal-burst + banner; Effects `2e` milestone bloom (stage-up) | Motion `3b`; Effects `2d`, `2e` |
| **Click the goal title / project chip** | Opens the linked project (stack push). | `pushUp` 380ms | Motion `2b` |
| **The two ★ starred Top-3 rows below** | Checkbox = Check pop (`3b`); the terra `★` toggles the star (fills/empties, no petal); clicking the task text opens Task detail (`pushUp`). | `3b`; `pushUp` 380ms | Motion `3b`, `2b` |

---

## E. iPhone (`1b`) differences for these controls

- The rail collapses into the single scroll column; **Slipping** and **From a while ago** are not shown in the sample `1b` (space), but when present they behave identically with **horizontal** stack push for detail (`hPushIn/Back` 380ms, Motion `3a`) instead of vertical.
- The pinned **Morning / Evening** ritual cards are `<a href="Rituals">` — tap = route to Rituals (route cut 160ms); their mini progress bars are read-only reflections of the routine checklist.
- Checking routine steps uses the same Check pop; pull-to-refresh at the top of the scroll uses the **dew** motion (Motion `5c`).

---

## F. Rail motion budget (quick reference)

```
hover/press      translateY(-1px)+shadow @150ms ease-out · active scale .97 @80ms   (every card, row, chip, button)
check step       boxFill 90 · checkPop 180 overshoot · strikeGrow 240 · rowDip 1.5px 120   (routine + goal + top-3 boxes)
last-step bloom  + bloom 260 + petal 400   (only when it's the final open item)
file out         rowOut 200 slide + 180 collapse   ("reviewed", "Still relevant", "Later")
heal / replace   rowIn 240   (Undo restore, queued resurfaced item)
toast            toastIn 220 · dwell 4s · exit 160 · always carries Undo
open detail      pushUp/pushBack 380 cubic-bezier(0.32,0.72,0,1) · parent −26px/.98/14% dim
day complete     Effects 2d petal-burst + banner   (goal done / all routines done)
sound            paper rustle on check & on file-out drop; none elsewhere
reduced-motion   all of the above → instant state change, no travel
```

Everything resolves from `ds/tokens/*.css`. No confirm dialogs on this rail — every action here is reversible through the toast's Undo.
