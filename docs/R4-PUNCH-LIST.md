# R4 Punch List

Everything still outstanding from Kai's audits, consolidated and ranked. Sources: the voice
transcript (`Kai's review.txt`, 53 numbered claims), the follow-up review, the 4c screenshot
round, and the checkbox/drag round. Full claim-by-claim history lives in
[KAI-AUDIT-2026-07-20.md](KAI-AUDIT-2026-07-20.md); this file is the actionable distillation.

**Status: 41 of 53 numbered claims closed + 8 follow-up items.** What's left is below.

---

## 🔴 Blocked on Kai (nothing can proceed without these)

| # | Item | Why it's blocked |
|---|---|---|
| B1 | **Run `supabase login`** | The CLI has no token on this machine. Unblocks the resurface-cooldown migration (P3 below). Browser sign-in doesn't help the CLI — it needs `supabase login` or a personal access token as `SUPABASE_ACCESS_TOKEN`. |
| B2 | **Verdict on the calendar** | 4c rebuild + checkbox, blue-drag, brown-bar and clock fixes are all in. Flagged OPEN deliberately — needs your eyes, not my say-so. Hard-reload, Day/Week view. |
| B3 | **Seed art, flowers 3 & 5** | Onboarding seed picker has no art for two options (claim 30). You generate. |

---

## 🟠 P1 — Do first (structural; affects everything below it)

### 1. Global sizing / zoom scale
> *"all of this audit was done while a 125 and 150% zoom was applied, things look most natural
> 110% but everything feels small"*

The single highest-leverage item left. If the app only reads correctly at 110% browser zoom, the
type/spacing scale is undersized against the export — and that plausibly sits behind several
"doesn't match the design" reactions I've been fixing one page at a time. **Worth doing before
any more per-page exactness work**, or that work gets redone.

Approach: measure the export's actual type/spacing rhythm against ours at 100%, then correct the
base scale in the token layer rather than per-surface.

### 2. Task detail reachable from anywhere
> *"I cant reach the full details page of a task from anywhere"*

Any task, anywhere (Today, Tasks, Calendar block, search result, project) should be clickable and
open the **Overlays "Task detail · Enter · expands"** popup — which already contains the
"Open full" button, so that one control covers the route to the full page.

### 3. Search → task navigation (4 sub-bugs)
> *"It doesn't take you to the task, but rather it takes you to the task in the task search where
> everything exists… I dont think that the highlight is working when you do it from the full
> search page"*

- (a) Lands on the task **list**, not the task
- (b) If the task lives in a project, it should open that project and highlight it there
- (c) Highlight doesn't fire at all from the full search page
- (d) The settle animation replays when you land mid-page — should start from just before the
  first item actually on screen, not from the top of the list

### 4. Projects page, exact to the export
> *"the projects page isnt implemented exactly like the projects page from claude design"*

Full-page diff against the export, same method that finally worked for the calendar: read the
export markup first, transcribe values, verify computed styles in-browser.

### 5. Collapsed nav — decluster on hover *(partially done)*
> *"maybe the cluster declusters on hover… and I want the options to also look exactly like the
> ones in the claude design export, for this state only"*

Label-flyout-on-hover shipped in `dc42249`. Still to confirm/build: the **cluster → decluster**
behaviour using Effects **2g** (texture · focus dim — hover a card, the rest of the room steps
back), and that the hovered item's styling matches the export exactly in this state.

---

## 🟡 P2 — Behaviour and plumbing

| # | Item | Note |
|---|---|---|
| 6 | **Resurface cooldowns** (claim 4) | "Later" is coded as a **+20 weight boost** — it makes items return *sooner*. Needs `resurface_cooldowns` setting + SQL. **Blocked on B1.** Your proposal adopted: high ≈1.5–2d, med ≈5d, low ≈10–14d, user-tunable. |
| 7 | **Collapse duplicate recurring imports** (claim 7) | 76 copies of "shower + breakfast" — recurrence wasn't reconstructed at import. Wants a detector + yes/no confirm. |
| 8 | **Settings dead controls** (claim 51) | Paper texture, accent swatches, sound preview are inert and *are* wireable now. Integrations / push / capture API stay P6-scoped. |
| 9 | **Filed-item destination** (claim 32) | *"where does it go? I don't really know"* — name the destination in the confirmation toast, with a jump link. |
| 10 | **Re-run onboarding from Settings** (claim 25b) | |
| 11 | **Motion 5c pull-to-refresh** (rest of claim 23) | A real mobile gesture + indicator build, not a restyle. 5b drag lift is done. |
| 12 | **Sort on other lists** (claim 53) | Tasks has it; the rest don't. |

---

## ✅ Parked by your ruling — do not touch

Planning board (removed from nav, route kept) · project-card hover · Journal page · Effects 2g
broad application (kept as a primitive for P1-5 above) · Motion 1a root transition (**banned** —
and verified never implemented, so nothing to remove).

---

## Recently closed (for reference)

**This round:** calendar task checkboxes + rail checkboxes · drag-turns-blue (ghost escaped `.fc`
scope → FullCalendar's default blue) · brown resize bar (`resizer-end` 4px border) · clock stuck
at "12:00 AM" (DateMarker double-shifted by the local offset) · emoji in calendar titles.

**Previous round:** the sync-failure toast → **journal `user_id: ''` was permanently rejected,
and a rejected row wedged the entire outbox queue forever** (very likely the real mechanism
behind the whole "my changes come back" cluster) · real **Apple** emoji (the first pass shipped
Twemoji — Twitter's set) · checkbox bloom now actually visible, Top-3/Goal only · finished Goal of
the day stays visible and struck through · divider on All open · Tasks nav icon → the export's
glyph · planning board out of nav.
