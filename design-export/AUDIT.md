# Readiness audit — Jul 2026

Scope: all 29 `*.dc.html` pages. These are **high-fidelity design prototypes on
sample data** — the design source of truth, not the app. "Ready for handoff"
below means the design is settled; it does **not** mean it's wired to data.

## How to read the turns
Turns stack newest-on-top. Across this project they are almost always
**additive** — each turn adds screens, states, or a sub-feature that all belong
in the app. So "the last turn is best" does **not** mean discard the earlier
turns; you keep them all **except** where a later turn explicitly redid the same
thing. That only happened in one place (Review's letter).

---

## Per-page status

### ✅ Settled single design — ready for handoff (sample data only)
| Page | Notes |
|---|---|
| Today | anchor page, two intensities (both keep) |
| Tasks | t1 list + t2 Done/Someday states — all keep |
| Calendar | desktop + iPhone |
| Activity | one ledger, desktop + mobile |
| Inbox | t1 triage + t2 Dismissed state — all keep |
| Journal | desktop + mobile |
| Quick Capture | mobile capture flow |
| Onboarding | 7-step first-run flow |
| People | t1 detail + t2 Moments — all keep |
| Rituals | t1 wizard + t2 mobile closing ritual — all keep |
| Routines | t1 garden + t2 new-routine form + t3 Gentle Rain — all keep |
| Herbarium | completed-projects field guide (4 views) |
| Perennials | repeating items bed |
| Search | full results page |
| Seasons | year-phase + sky header |
| Trash | 30-day compost |
| Focus | t1 timer + garden = the real design (t2 parked, below) |

### 🔵 Reference / spec / library — ready to hand a dev, but they describe work, not a finished screen
| Page | What it is | Build implication |
|---|---|---|
| Design System | tokens + components reference | the contract to build components against |
| Screens | index/overview of the app | map, not a screen |
| Overlays | overlay/component gallery | each overlay gets built where used |
| Effects | 22 botanical effect recipes | **catalog only — not yet applied to real screens** |
| Motion | micro-interaction spec (5 sheets) | per-moment motion spec to implement |
| Settings | t1 appearance + t2 Integrations + t3 Sound Catalog — 3 areas, all keep | build as 3 settings sections |
| States | t1 empty/first-run + t2 offline/sync — state families | the rules devs apply everywhere |
| Night | moonlit theme (6 studies) | dark token set is now complete (`colors.dark.css`, every light token covered) with a living reference page — `Design System Dark.dc.html`; remaining work is the runtime theme toggle |

### 🟡 One small decision before handoff
| Page | Decision |
|---|---|
| Projects | **Decided:** t1 and t2 are combined — both kept as two switchable views of the cluster. |
| Review | Letter is **parked** (t4). Ship = t1 base sweep + t2 (2a kept for a future improvement pass) + t3's "season so far" (3c). Dead letter attempts 3a/3b deleted. |

### ⚑ Parked (documented in FUTURE_WORK.md)
- **Focus t2** — A Year in the Garden (year-scrub mode).
- **Review t4** — the Weekly Letter arrival animation (built & correct; needs live data + first-open-once teaser + real photo + cherry-tip logic to ship).

---

## Cross-cutting gaps — true for every page, do before/as you wire
1. **Data contract.** Every page shows hard-coded sample content. The real build
   is deciding what each page binds to (tasks, sessions, streaks, projects,
   journal, people) and in what shape. This is the bulk of the work.
2. **Effects & Motion are libraries, not applications.** They're documented but
   "nothing is applied to existing screens." Wiring = choosing which effect/motion
   fires on which real interaction.
3. **Night theme** needs to become an actual theme toggle over the token layer,
   not a set of static studies.
4. **Navigation.** Pages are standalone canvases; routes/transitions between them
   aren't wired.
5. **Non-happy-path.** Empty/loading/error/offline are designed in `States` as
   rules — they still need applying per page.
6. **Mobile coverage.** Some real pages have iPhone variants (Today, Tasks,
   Calendar, Inbox, Journal, Quick Capture, People, Rituals, Routines, Projects,
   Activity, Onboarding); others are desktop-only (Search, Seasons, Herbarium,
   Perennials, Library, Trash). Confirm which need mobile for v1.

## Bottom line
Design-wise you're in good shape to start wiring the ✅ pages now. Before a dev
starts, settle the two 🟡 decisions, and treat the 🔵 pages as specs the build
implements rather than screens to port. The single biggest remaining design-
adjacent task is defining the **data contract** per page — that's what turns
these prototypes into an app.
