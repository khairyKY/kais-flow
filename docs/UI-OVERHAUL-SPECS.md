# Kai's Flow — UI Overhaul Design Specs

> Design specifications for every item in [UI-OVERHAUL-NOTES.md](UI-OVERHAUL-NOTES.md). **Design-only document** — nothing here is routed into a build phase yet; when a design is approved it goes through `docs/ROADMAP.md` / `docs/PROMPT-BANK.md` like everything else.
>
> Conventions: same skeleton as `SCREENS.md` / `SCREENS-PART-TWO.md`. Component and route names are the real ones in the repo or forward-specced names. Visual language (colors, type, spacing, motion, paper aesthetic) comes from the attached design system — this doc deliberately never names it; it specs **structure, content, states, and metaphor** only. All items are day mode except item 16, which is the night-mode pass itself.
>
> **Two reading rules — this doc has no visibility into pages you've already designed:**
> 1. **Your existing designs win.** Wherever an item describes or adds to a surface you've already drawn (Today, Tasks, Calendar, Routines, Review, Projects, People, Settings, Focus/garden, the topbar strip, the command bar, the search overlay), treat this doc's description of that surface as *intent, not layout*. Reconcile the new piece into what you already built. If anything here contradicts your existing page — its structure, its current sections, what it "replaces" — your page is the source of truth. Check your own work before assuming a surface's current state from my words.
> 2. **Names and copy are proposals, not law — except Kai's own.** Keep as-authored (these are Kai's, from his notes): the concept names *Herbarium, A Year in the Garden, Gentle Rain, Weekly Letter, Closing Ritual, Sound Catalog, Garden Postcard, People Moments*, and the exact line **"it rained yesterday — the vine held on."** Everything else I named or wrote — "Perennials", "Trash & Compost", the four topbar sync strings, the six-sound catalog and its triggers, the Herbarium ledger labels, every section header and hand-script line — is a starting point. Keep it, sharpen it, or replace it as the design wants.
>
> Documented facts (from the design system + shipped specs, safe to rely on): left sidebar nav (Today · Tasks · Routines · Projects …), topbar metadata strip (`KAI'S FLOW · SAT 04 JUL · SYNCED ●`), command bar, per-surface flower assignments (Today = terrarium, Tasks = cherry blossom, Routines = streak vine, Projects = vine with leaves + per-project color, Review = fern, People = clover, Calendar = daisy/sunflower), day-phase daisy on Today, dusk effect in Focus, washi-tape accents, hand-script voice for warm copy, mono uppercase for metadata. Timezone is Africa/Cairo; the user is one person (Kai).

---

## Part A — New full screens

### 1. Search Results page

**Route** — `/search?q=…`. This is the full-page counterpart to the existing quick overlay (`SearchOverlay.tsx`, ⌘/), which stays for jump-to. However your overlay currently offers "see everything," give it a way to open this page with the query carried over (e.g. a "View all results ↵" footer row) — fit it to the overlay you already designed.

**Layout** — single reading column (max 920px). Header: large search input pre-filled with the query, result count under it in mono ("23 RESULTS FOR 'OMAR'"). Below the input, a filter chip row. Then grouped result sections.

**Components**

- **Filter chips** — one per entity type: All · Tasks · Events · Inbox · Projects · Routines · Journal · People · Library. Count badge on each. Single-select; "All" default. A second, right-aligned pair of quiet toggles: "Open only" and a date-range chip ("Any time ▾").
- **Result groups** — one section per entity type with matches, header "TASKS · 9" style, capped at 5 rows per group with "Show all 9 →" expanding inline. Rows reuse each entity's home-row anatomy: tasks with checkbox + priority flag + due chip; people with clover mark + last-touch; journal with date + first-line excerpt; projects with color dot + hours chip.
- **Match context** — under each row title, one excerpt line with the matched terms highlighted. When a row matched semantically rather than by keyword, a small mono hint "RELATED" replaces the highlight.
- **Empty state** — centered: a magnifying glass over bare soil, hand-script line "Nothing's come up for that — try fewer words, or let the chat dig deeper." with a secondary action "Ask the garden (chat) →" that opens the AI chat pre-filled with the query.

**Botanical** — no dedicated flower; results carry the flower/accent of their home surface, so the page reads as a cross-section of the whole garden.

**Copy** — placeholder "Search everything…"; groups in mono uppercase; footer of the quick overlay: "View all results ↵".

**Responsive** — chips scroll horizontally on mobile; groups stack identically; the search input stays pinned on scroll.

---

### 2. Integrations page

**Route** — `/settings/integrations` (Settings already lists "Integrations" in its nav — this fills the gap).

**Layout** — settings content column. Intro line, then a vertical stack of connection cards, one per source. Below the stack, a quieter "Capture from anywhere" card group.

**Components**

- **Connection card** — icon + source name + one-line description; right side: status and action. Three states:
  - *Disconnected* — quiet card, "Connect" primary button.
  - *Connected* — status dot + "CONNECTED · SYNCED 4 MIN AGO" mono line, "Disconnect" ghost action, and an expandable **rules panel**.
  - *Attention* — warm warning tint edge, "RECONNECT NEEDED — token expired" line, "Fix" button.
- **Rules panel (expanded, GitHub as the canonical example)** — repo multi-select ("Watching: kais-flow, shaheen_website"), per-source filing rule ("New issues land in → Inbox / straight to Tasks"), a ranking control ("Priority of this source in inbox ordering: High / Normal / Low"), and a per-source pause toggle.
- **Sources to draw** — GitHub (full rules panel, connected state), Google Calendar (connected state, description stresses invisible background sync — "your calendar stays ours; Google syncs silently underneath"), Pushover (reminders delivery, disconnected state), and one card in the attention state.
- **Capture from anywhere group** — two informational cards: *External capture endpoint* (a private URL with a copy button, regenerate ghost action, mono caption "anything POSTed here lands in your inbox") and *Share target* ("Share to Kai's Flow from any app on your phone" with a small phone glyph).

**Botanical** — seedling accent (shared with Settings). Connected sources get a tiny leaf on the status dot; the page is plumbing, keep it calm.

**Copy** — title "Integrations"; intro "Everything that feeds the inbox, and the rules it follows."

**Responsive** — cards full-width on mobile; rules panels stack their controls.

---

### 3. Recurring Tasks manager

**Route** — `/tasks/recurring`. Entry points: a "REPEATING · N" mono chip in the Tasks page header, and a row in the tasks context/⋯ menu ("Manage repeats…").

**Layout** — single column. Header "Perennials" + count. Sections grouped by cadence: DAILY · WEEKLY · MONTHLY · CUSTOM.

**Components**

- **Series row** — task title + human-readable rule in mono ("EVERY MON, WED", "MONTHLY ON THE 3RD") + next-occurrence chip ("NEXT: TUE 14 JUL") + a quiet "last done" timestamp. Row actions on hover / ⋯: Edit rule (opens the existing Repeat popover anchored to the row), Skip next, Pause, End series (confirm inline: "End this repeat? Past completions stay in the log.").
- **Paused state** — row dims, rule chip replaced by "PAUSED", leaf on the row icon droops slightly; "Resume" action.
- **Header summary** — one mono line: "9 SERIES · 3 DUE THIS WEEK".
- **Empty state** — a row of empty flowerpots, hand-script "Nothing on repeat yet. Perennials come back on their own — give one a rhythm from any task's Repeat menu."

**Botanical** — perennials framing: each cadence section header carries a small bulb/pot glyph; the metaphor is plants that return every season without replanting.

**Copy** — title "Perennials"; subtitle in mono "EVERYTHING THAT REPEATS, IN ONE BED".

**Responsive** — chips wrap to a second row under the title on phones.

---

### 4. Trash & Compost

**Route** — `/trash`. Entry: Settings nav row + a quiet "Trash" ghost link at the bottom of the sidebar's overflow area.

**Layout** — single column. Header + one merged reverse-chronological list grouped by deletion age: TODAY · THIS WEEK · OLDER. Header right: "Empty trash…" ghost-danger action.

**Components**

- **Deleted row** — entity type badge in mono (TASK / EVENT / INBOX / JOURNAL) + title (struck-through, muted) + "deleted 2h ago" + primary "Restore" text button + "Delete forever" ghost that confirms inline.
- **Restore feedback** — the row lifts out and a toast confirms "Restored to Tasks" with a jump link.
- **Auto-purge notice** — a quiet full-width strip above OLDER: "Items compost after 30 days — gone for good, feeding nothing in particular."
- **Empty trash confirm** — inline expansion under the header action: "Empty everything? 14 items, no way back." with Cancel / "Empty" danger button.
- **Empty state** — a small compost heap with one sprout, hand-script "The heap is empty. Deleted things rest here for 30 days before they compost."

**Botanical** — compost metaphor: fallen-leaf texture behind the group headers; restore = the leaf lifts back onto the branch.

**Copy** — title "Trash"; the word "compost" appears only in the notice and empty state (the nav says Trash — findability beats poetry).

**Responsive** — actions collapse into the row's ⋯ menu on mobile.

---

### 5. The Herbarium

The payoff of the whole plant metaphor: completed projects are pressed into a field guide that only ever grows.

**Route** — `/herbarium`. Entry points: a "Herbarium" tab or link on the Projects page header, and the pressing ceremony (below) ends here.

**Layout** — a field-guide spread. Header: "The Herbarium" in display type + count in mono ("7 SPECIMENS · SINCE MAY 2026"). Body: a grid of pressed-specimen cards (2-up desktop, 1-up mobile) with seasonal divider rows between groups ("SUMMER 2026" in mono with a thin rule).

**Components**

- **Specimen card** — reads as a page from a botanist's press: the project's plant rendered *pressed* — flattened, dried, slightly desaturated toward the project's own color, held by two washi-tape corners on paper. Below the specimen: project name in hand-script, then a mono ledger block — "PLANTED 12 MAY · BLOOMED 03 JUL · 46 HOURS · 6/6 MILESTONES". At the bottom, the one handwritten line Kai wrote when it finished, in quotes.
- **Specimen detail (click)** — the card opens to a full spread: larger pressed plant, the ledger, the handwritten line, and a small "life in numbers" strip (tasks completed under it, longest focus day). Ghost action: "Edit the line…".
- **Pressing ceremony (modal, part of this item)** — triggered when a project is marked complete. Three beats in one modal: (1) the project's living plant appears and gently flattens onto paper (the press closes), (2) the ledger stamps itself line by line, (3) an input in hand-script placeholder: "One line for the field guide…" with Skip ghost and "Press it" primary. Confirm lands on the new Herbarium page with the fresh specimen settling into the grid.
- **Empty state** — an open, empty flower press, hand-script "The press is waiting. Finish a project and it lives here forever."

**Botanical** — this IS the botanical element. Rule: pressed plants are permanently muted/dried — they must never look alive again; the contrast with the living garden is the point.

**Copy** — ledger labels exactly: PLANTED (created), BLOOMED (completed), HOURS, MILESTONES. Ceremony title: "Ready for the press".

**Responsive** — 1-up cards on mobile; ceremony modal goes full-screen.

---

### 6. A Year in the Garden

**Route** — lives inside the Focus/Garden view as a mode toggle: "Now ↔ The year". Could also be reached from the Herbarium ("see the garden as it was →").

**Layout** — the garden canvas takes the full stage. Along the bottom: a scrub rail spanning 12 months with month initials in mono; a draggable handle; a date chip floating above the handle ("MARCH 2026"). Top-right: a small play button (auto-scrubs a month per second) and the exit toggle back to "Now".

**Components**

- **Garden playback** — as the handle moves, the garden re-renders as it was: plants that existed then at their then-size, blooms that had happened, the streak vine at its then-length, that month's season tint (item 17's palette). Plants that didn't exist yet are absent; completed/pressed ones appear alive until their bloom date, then show a small pressed marker.
- **Month card** — a quiet caption card bottom-left, updating with the scrub: "MARCH — 3 projects growing · vine 21 days long · 41 focused hours".
- **Sparse-history state** — months before the app existed render as bare prepared soil with the caption "before the garden".

**Botanical** — the garden itself; the scrub rail is a wooden ruler / plant stake with month notches.

**Copy** — mode toggle labels "Now / The year"; month captions as above.

**Responsive** — on mobile the rail thickens for touch; the month card moves above the rail.

---

## Part B — Additions to existing screens

### 7. Insights, inside Review

**Where** — a new section on the Review page, placed among the weekly content wherever it sits best in the Review you've already designed; proposed header "The season so far".

**Layout** — section header + a 2×2 widget grid + one full-width trend band under it.

**Components**

- **Hours by area (weekly)** — horizontal bars, one per area/domain, this week vs a ghost of last week; mono value labels ("DEEP WORK · 14H (+3)").
- **Focus trend** — a thin line/area over the last 8 weeks of focused hours; the current week's point is a small bud.
- **Routine consistency** — a heat strip per routine (last 30 days as tiny squares), completion % at the right.
- **Blooms this week** — big-number tile: tasks completed, with last week's number quiet beneath.
- **Full-width band: hours per project** — top 5 projects as labeled rows with proportional bars in each project's own color; "everything else" as a final muted row.

**Botanical** — restrained: the fern (Review's plant) frames the section header only; the charts stay clean and legible — data first, garden second.

**Copy** — header "The season so far"; every widget gets a one-line mono caption of its timeframe ("LAST 8 WEEKS").

**Responsive** — grid stacks 1-up; bars stay horizontal (they survive narrow screens).

---

### 8. The Weekly Letter

**Where** — the very top of the Review page, above everything, as the page's opening — reconcile with however your Review currently opens.

**Layout** — a letter on pressed paper, slightly rotated, one washi-tape corner, max ~560px wide, centered. Below it the normal Review content begins.

**Components**

- **The letter** — hand-script throughout. Salutation "Dear Kai —", 4–6 sentences of AI-written field notes grounded in the week's real data: one thing that grew (best streak/most-advanced project), one honest observation (a slipping area, phrased gently), one number worth keeping, one line looking at next week. Signed "— the garden".
- **Writing state** — while the letter generates: the paper is present with a pen-line shimmer and mono caption "the garden is writing…". Never a spinner.
- **Fold control** — a small fold-corner toggle; folded, it collapses to just "Dear Kai — …" as a teaser strip so repeat visits aren't dominated by it.
- **Fallback state** — if generation fails: the paper carries a short printed (not hand-script) line "The letter didn't arrive this week — the numbers below still tell the story."

**Botanical** — a small fern frond pressed at the letter's foot, like a keepsake slipped into an envelope.

**Copy** — exactly one sentence per data point; no bullet lists inside the letter; warm but never saccharine.

**Responsive** — full-width card on mobile, rotation removed.

---

### 9. People Moments

**Where** — three touchpoints: People list, Person Detail, Today.

**Components**

- **People list row** — when a person has a moment within 14 days, a clover-bloom badge appears on their row with a mono chip: "BIRTHDAY · IN 3 DAYS". The bloom sits beside the existing last-touch metadata; warmth next to hygiene.
- **Person Detail — Moments section** — a small editable list: Birthday, Anniversary, + "Add a moment…" (label + date + repeat-yearly toggle). Upcoming moment renders as a banner at the top of the detail page: blooming clover + "Omar turns a year older on Friday" + ghost action "Plan something →" (opens command bar pre-filled "task: for Omar's birthday").
- **Today card** — on the day (and one day before), a quiet card in the Today flow: clover bloom + "Omar's birthday is tomorrow." + the same "Plan something →" ghost. Dismissible; never blocks.

**Botanical** — the clover (People's plant) finally blooms — this is the only place clover is allowed a full bloom.

**Copy** — human phrasing, never "EVENT: BIRTHDAY_OMAR"; dates as "on Friday", "tomorrow".

**Responsive** — the Today card matches existing Today card anatomy at all sizes.

---

### 10. Gentle Rain (grace day)

**Where** — the streak vine (Routines page + Today's vine) and one morning-after moment.

**Components**

- **Rain-day node** — when a missed day is forgiven, that day's node on the vine renders as a rain droplet instead of a leaf — visibly different from both a leaf (done) and a bare gap (broken), so honesty is preserved: it *rained*, you didn't *grow*.
- **Morning-after caption** — the first time the vine is seen after a grace day, an inline caption under it in hand-script: "it rained yesterday — the vine held on." Fades after being seen once.
- **Streak counter** — unchanged number (the streak holds); a tiny droplet glyph next to the count for the day it covers.
- **Rule surfaced in Settings** — one line near the Effects/streaks settings: "Gentle rain: one missed day a month is forgiven." (design the settings row; the cadence copy is placeholder).

**Botanical** — droplet on the vine; if the seasons layer (item 17) is active that day, a brief soft rain over the Routines header ties them together.

**Copy** — exactly the note's line: "it rained yesterday — the vine held on."

**Responsive** — no special behavior; the droplet node must stay legible at the vine's mobile size.

---

## Part C — Overlays, moments & states

### 11. Closing Ritual

**Where** — a "Close the garden" affordance appears on Today after sunset (Cairo time): a quiet dusk-tinted button near the day header. Launches a full-screen sequence, four beats, skippable at every step (ghost "skip" top-right throughout).

**Frames**

1. **The day's garden** — full-screen garden view of *today only*: what bloomed (tasks completed as fallen petals collected in a small pile), focused hours as sun-hours on a dial, routines as today's vine leaves. One mono summary line: "TODAY · 7 BLOOMS · 3H FOCUSED · VINE +1".
2. **One line** — a single hand-script input on paper: "One line about today…". Saves to the journal. Enter advances.
3. **Tomorrow's three** — the open-task list, condensed; tap three (or fewer) to star them as tomorrow's top 3. Selected ones get a seed glyph and drop into a small seed envelope at the bottom labeled "FOR TOMORROW".
4. **Goodnight** — the dusk veil (already in Focus) draws across the garden; a closing card: "The garden's closed. See you in the morning." with a single "Done" that returns to a dimmed Today.

**Botanical** — dusk veil + seed envelope; the ritual reuses the existing dusk effects rather than inventing new weather.

**Copy** — as written per frame; total words on any frame ≤ 20.

**Responsive** — designed mobile-first; this is most likely used from bed.

---

### 12. Garden Postcard

**Where** — a "Send a postcard" ghost action on Review (near the weekly letter) and in the garden view.

**Layout** — a modal: postcard preview center-stage, actions beneath.

**Components**

- **The postcard (landscape, exportable image)** — front only: this week's garden scene as the artwork; a postmark-style stamp top-right with the week's dates ("WK 28 · 6–12 JUL 2026"); two or three stat "stamps" along an edge ("14 TASKS BLOOMED", "6H FOCUSED", "VINE: 23 DAYS"); one hand-script line across the bottom — auto-suggested from the week, editable inline before export.
- **Actions** — "Download PNG" primary, "Copy image" secondary, Cancel ghost. A regenerate glyph on the hand-script line suggests a different line.
- **Personal-by-default note** — a quiet mono caption under the actions: "Postcards contain only what you see here." (no task titles or private text unless in the visible line).

**Botanical** — the garden is the artwork; stats styled as postage stamps with perforated edges.

**Copy** — stat stamps in mono uppercase; the hand-script line is the only warm text.

**Responsive** — modal goes full-screen on mobile; postcard stays landscape (scrolls/scales, never re-crops).

---

### 13. Empty & first-run states

**Where** — three drawn vignettes plus one pattern rule the designer applies to any future surface.

**The pattern rule** — every empty state = the surface's own flower as a *seed or sprout* + one hand-script line + exactly one primary action. Never a gray illustration, never two buttons.

**Vignettes**

- **Empty Today** — the terrarium holds prepared soil and one seedling; day-phase light still applies (an empty morning glows like any morning). Line: "Nothing planted for today yet." Action: "Plan today" (opens the planning flow). Distinct sub-state when everything's *done* rather than *unplanned*: petals collected in a pile, line "All done. The garden can rest." — no action.
- **Unplanted Projects** — a row of empty pots on a shelf, one bag of soil leaning against them. Line: "No projects growing yet." Action: "+ Plant the first one".
- **First journal entry** — an open blank pressed-paper notebook, a pencil resting on it, one faint washi tape ready in the corner. Line: "The first page is the hardest — one sentence counts." Action: the input itself is the action (focused cursor, no button).

**Botanical** — seedling versions of each surface's assigned plant; the empty state must clearly be the *same species* as the full state.

**Responsive** — vignettes center in the content area at all sizes.

---

### 14. Offline & sync states

**Where** — the topbar metadata strip (currently always `SYNCED ●`), a click-to-open queue popover, and one conflict card.

**Components**

- **Topbar states** — four: `SYNCED ●` (current) · `SYNCING ↻ 3` (writes flushing, count live) · `OFFLINE ◌ — 5 SAVED HERE` (outbox holding writes; the wording promises nothing is lost) · `NEEDS A LOOK ⚠` (conflict waiting). Each is a pure text/glyph swap in the strip — no banners, no color floods; offline is calm by design.
- **Queue popover** — clicking the status opens a small anchored popover: list of queued writes, each as "TASK · 'buy milk' · completed · 4 MIN AGO" mono rows; footer line "Everything here syncs the moment you're back." In the SYNCED state the popover simply says "All caught up." with the last-sync time.
- **Conflict card** — shown in the popover (and as a Today card if unresolved for a day): "This changed in two places." Two stacked versions labeled "HERE (offline, 2:14 PM)" and "SERVER (2:31 PM)", the differing fields highlighted, two equal buttons: "Keep this one" on each. Never auto-picks.
- **Reconnect moment** — when sync completes after offline, the status flips through `SYNCING ↻` to `SYNCED ●` with a single subtle dewdrop glint on the dot — the only celebration.

**Botanical** — nearly none, deliberately: sync is infrastructure. The dewdrop glint is the entire flourish.

**Copy** — exactly as quoted; the word "error" never appears.

**Responsive** — popover becomes a bottom sheet on mobile.

---

### 15. Mobile quick-capture mock

**Where** — a presentation mock (two phone frames), not an in-app screen: the story of capturing without opening the app.

**Frames**

1. **Lock-screen widget** — a phone lock screen with a small Kai's Flow widget: the wordmark leaf, a text field ghost ("Catch a thought…"), and a mic button. A second sub-frame shows it activated: keyboard up, a thought half-typed, a single "→ Inbox" send affordance.
2. **Share sheet** — a webpage/screenshot being shared on the phone's native share sheet; "Kai's Flow" sits among the targets with the leaf icon; a confirmation pill after tapping: "Saved to your inbox 🌱-style sprout glyph (not emoji)".

**Botanical** — the sprout glyph on the confirmation is the only garden element; lock-screen surfaces stay OS-native in feel.

**Copy** — field placeholder "Catch a thought…"; confirmation "Saved to your inbox".

**Responsive** — n/a (phone frames by definition).

---

## Part D — System layers

### 16. Night theme, drawn

**What** — Settings already offers Day/Night/Auto, but no product screen has ever been drawn in night mode. This item is a full night-mode pass over five canonical screens: **Today, Tasks, Calendar, Routines, Settings**, plus the **command bar** overlay on one of them.

**The night ambience (define once, apply to all five)**

- Night is a *moonlit garden*, not an inverted stylesheet: deep warm ground, surfaces as frosted glass, plants rendered as gently lit silhouettes with their accent color carried in the rim light.
- Paper noise softens; hairlines glow faintly rather than darken.
- The day-phase daisy on Today yields to a night bloom (moonflower) — the one plant that only appears at night; morning users never see it.
- One or two fireflies drift on Today only; every other screen stays still.
- Warm copy (hand-script) lightens but keeps its ink feel; mono metadata dims a step.
- Auto mode note for the designer: night follows Cairo sunset — design the *moment* of the crossfade on Today (dusk veil sweeps once; ~all other screens just swap).

**Deliverable** — the five screens + command bar at desktop width, one of them (Today) also at mobile width.

---

### 17. Seasons & weather layer

**What** — the garden already has day-phases; this adds year-phases and sky. An ambient layer over the Today header/terrarium (primary) with quiet echoes on the garden view. Content legibility always wins; the layer sits behind and never fogs text.

**The matrix (design as one sheet of Today-header variants)**

- **Seasons (from the Cairo calendar):** Spring — extra blossom density, fresh greens · Summer — high warm light, slight heat shimmer at the header's horizon · Autumn — leaf-tint shift, one drifting leaf · Winter — cooler, damper light, morning dew on leaves.
- **Weather (from live local conditions):** Clear — the current default · Rain — soft rain over the header, plants glisten, droplet sounds if item 18 is on · Overcast — flattened light, no shadows · Wind — occasional leaf/petal drift sideways.
- Draw the full seasons row plus three composites: *rainy summer day*, *clear winter morning*, *windy autumn evening* — enough to prove the matrix without drawing all 16.
- **Topbar echo** — the metadata strip gains one segment: `CAIRO · 34° CLEAR` in the same mono style.
- **Effects toggle** — the whole layer sits behind the existing Effects/motion toggle; with effects off, only the topbar weather segment remains.

**Copy** — none beyond the topbar segment.

---

### 18. Sound catalog

**Where** — a "Sound" section in Settings, directly beside the existing Effects (motion) toggle.

**Layout** — section header + master row + a documented list of every sound the app makes.

**Components**

- **Master row** — "Sound" toggle + a small volume slider (three notches: whisper / room / full).
- **Catalog rows** — one per sound, each: name in hand-script, trigger description in mono, a play-preview button. The launch set: *Paper rustle* — COMPLETING A TASK · *Petal fall* — A BLOOM MOMENT (PROJECT/STREAK MILESTONE) · *Distant chime* — A RITUAL BEGINS · *Birdsong* — FIRST OPEN OF THE MORNING · *Rain patter* — GENTLE RAIN / RAINY WEATHER · *Pencil scratch* — SAVING A JOURNAL LINE.
- **Per-row toggles** — each sound individually deactivatable; the design should make "a couple on, most off" look intentional, not broken.
- **Quiet-hours note** — one caption row: "The garden is silent after you close it." (ties to item 11 — no sounds post-ritual).

**Botanical** — none; the section borrows the Effects section's existing anatomy so they read as siblings.

**Responsive** — standard settings stacking.

---

### 19. Micro-interaction sheet

**What** — a companion design sheet (like the Effects sheet) specifying the app's interaction *moments* — not ambience. One card per moment; each card: the trigger, a 2–3 frame storyboard, a feel note, and its sound pairing from item 18 if any.

**The moments to card**

- **Checkbox bloom** — checking a task: the box blooms a five-petal flower for a beat, then one petal falls and the row settles into done. Feel: quick, never delays the strike-through.
- **Drag lift** — picking up any draggable row/card: it lifts like a picked leaf — soft shadow, slight tilt toward the cursor. Drop: settles with a paper tap.
- **Pull-to-refresh dew** — mobile lists: pulling forms a dew drop that swells and drops to trigger. Feel: surface tension, not rubber-band.
- **Hover lean** — small plants/sprigs lean a few degrees toward the cursor on hover (already the chat sprig's behavior — generalize it).
- **Toast petal-fall** — toasts release a single petal from the corner flower as they dismiss (flagged in the Motion phase; carded here so the sheet is complete).
- **Seed plant** — creating anything (task, project, journal line): the submit affordance drops a seed that lands with a tiny soil puff.

**Rule on the sheet** — every moment ≤ ~600ms, all interruptible, all gone under the reduced-motion setting.

---

## Coverage map (notes → specs)

| Note item | Spec |
|---|---|
| Full search results page | 1 |
| Night theme, drawn | 16 |
| Integrations page | 2 |
| Recurring tasks manager | 3 |
| Trash / archive + restore | 4 |
| Empty & first-run states | 13 |
| Offline / sync-conflict state | 14 |
| Insights/Stats | 7 |
| Mobile quick-capture surface | 15 |
| Seasons & weather | 17 |
| The Herbarium | 5 |
| A year in the garden | 6 |
| Gentle rain (grace day) | 10 |
| The weekly letter | 8 |
| Closing ritual | 11 |
| Sound catalog | 18 |
| Micro-interaction spec | 19 |
| Garden postcard | 12 |
| People moments | 9 |
