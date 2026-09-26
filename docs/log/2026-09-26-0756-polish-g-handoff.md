---
date: 2026-09-26 07:56 UTC
session: polish-g-worker
type: handoff
related: audit-newuser
---

# Polish G: the Journal page reads at 1280, has no copy of the topbar, and states nothing it doesn't know

**Branch:** `claude/polish-g`. It branches off `origin/claude/release-1` at `0519157`, which already contains P0-B's JournalPage save/hold changes. Nothing is merged and no PR is open. `release-1` has since gained Polish D (`ddfb21a`). Polish D doesn't touch `features/journal/**`, so the two shouldn't overlap.

**Commits (oldest first):**

| SHA | What |
|---|---|
| `421dab4` | Item 1: the columns follow the page's own width. Also adds the *before* screenshots. |
| `db32985` | Item 2: the in-page topbar strip and its hard-coded "Synced" are gone |
| `4d7e5c6` | Item 3: empty, loading, offline and failed states. Also adds state screenshots. |
| `e4c7d97` | Item 3 follow-up: the offline note survives the first keystroke. Also adds the final screenshots and typing evidence. |
| (this commit) | Handoff |

**Files:** only `app/src/features/journal/**`:
- `JournalPage.tsx` (still CRLF; `git ls-files --eol` shows `i/crlf w/crlf`)
- `journalDay.ts` (LF)
- `journalDay.test.ts` (LF)

Nothing outside that folder was changed. P0-B's `hold`/`holdRow`/`startFirstEntry` path is untouched.

Kai delegated the product calls for this batch to me. They're listed under "Decisions" so he can reverse any of them.

## 1. Journal at 1280px was crushed

**Root cause:**
- `Journal.dc.html` 1a has three **fixed** columns: a 230px entry tree, the writing page (max 660), and a 262px rail. The export draws them on a 1300px card.
- In the app they sit inside the shell, which takes a 242px sidebar and 40px of padding on each side.
- The default 125% interface size (`lib/uiScale.ts`, root `zoom`) lays a 1280px window out in 1024 CSS px. That leaves the Journal page 702 CSS px.
- The two fixed rails took 492 px and the writing padding took 80, which left the notebook **130 CSS px** wide. The title wrapped to three lines, clipped mid-word.
- Nothing in the page reacted to width at all. The only breakpoint was `useIsMobile`, a `(max-width: 767px)` **media query**, and media queries read the window, which root zoom doesn't shrink.

**Change:** the columns follow the page's own laid-out width, using container queries. This is the same mechanism Polish D used for Tasks. `.jn` is the container.

| Page width (CSS px) | Layout | Where it lands at 125% |
|---|---|---|
| ≥ 1000 | The export's three columns, verbatim (230 / page / 262) | 1920 window (measured: 1214 px); 1600 with the sidebar collapsed (computed: 1136 px) |
| 560–999 | The tree (200px) stays beside the page. The rail folds under the writing as a 2-up grid: *Quote of the day* on one side, *On this day* and *Kept* on the other | 1280, 1440, 1600 |
| < 560 | One column: the page, then the rail, then the tree. The card footer carries "＋ New entry", as 1b's footer does | 1024 window (measured: 497 px); computed range ~768–1150 |
| window ≤ 767 | The phone layout (1b), unchanged | 390 |

Also in this item:
- **Title:** `font-size: clamp(28px, 7.8cqi, 40px)`, measured against the writing column. It's the export's 40px wherever that fits, and eases down so the date stays on one line (34.8px at 1280). `text-wrap: balance` covers longer dates.
- **Mood chips:** they drop under "Today felt —" when they don't fit beside it.
- **Phone card footer:** the labels broke in two ("＋ NEW / ENTRY") because the card is only ~258 CSS px at 390. Labels now stay whole, and "Saved" takes its own line when it has to.

**Measured** on the production build, Cairo, 125%. The "before" build is `release-1` at `0519157`; the "after" build is `e4c7d97`.

| Window | Page width | Notebook, before → after | Title lines, before → after |
|---|---|---|---|
| 1280 | 702 | 130 → **446** | 3 → **1** |
| 1440 | 830 | 258 → **574** | 3 → **1** |
| 1600 | 958 | 386 → **660** | 2 → **1** |
| 390 | 280 | 240 → 240 | 1 → 1 |

There's no sideways scroll at any size, day or night.

## 2. The in-page strip was the export's mock of the shell topbar

In `Journal.dc.html` 1a, the strip is `<main>`'s first child. It's 42px, dashed bottom border, 10px mono, 0.18em tracking, `--ink-faint`: exactly the topbar style. It reads "Kai's Flow · Fri 10 Jul · Synced ● / Africa/Cairo". Every one of those slots is what the real shell topbar already draws: owner name, today's date, live sync state and zone.

**Nothing on it was page-specific.** The app's copy printed the *selected* day there, but the export's date is today's, in the topbar's own short format. The selected day is the page title anyway.

So I removed it, the same call Polish C made for Activity, Herbarium, Trash and Library.

The page now shows no sync state of its own. The card's "Saved" / "Saved · just now" is the page's local save state, which the outbox keeps true offline. While offline, the real topbar read "Offline ◌ — 1 saved here" with nothing on the page contradicting it (typing run below).

## 3. Empty, loading and error states

**Root problem:** the page treated "not loaded" as "empty". While the list was loading, had failed, or was cold offline, a returning writer saw:
- "The first page is the hardest — one sentence counts."
- "Journal · Day 1"
- every day of the week marked "EMPTY"
- "Kept 0 days"

These appear in the `states-before-*` screenshots for `polish-g`, who has 3 written days and a 2-day streak.

After Polish E's S8 (journal never persisted), *every* cold load has a loading phase, and every cold offline load is "never loaded".

**Change:** `listState(query, online)` in `journalDay.ts` (tested) returns one of four states:

| State | Meaning |
|---|---|
| `ready` | The list arrived. A later failed refetch doesn't undo that. |
| `loading` | The list is on its way. |
| `away` | Offline, and the list never loaded on this device. |
| `resting` | The request failed and nothing is cached. |

`away` reads the connection (TanStack's `onlineManager`) as well as the query. The real run showed why that's needed: `writeRow` cancels the table's queries before its optimistic write, so after the first offline keystroke the query reads `idle`, not `paused`.

| State | Before | After |
|---|---|---|
| Loading | First-page line, "Day 1", "EMPTY" ×7, "0 days" | Label reads "Journal". Week markers keep their line but say nothing. *On this day* and *Kept* wait. The normal "a quiet page, only for you ✿" line. The notebook is writable. |
| Offline, never loaded | Same lies | Same as loading, plus a hand line: **"Your earlier pages will be here when you're back online — what you write now is kept."** When the connection returns, the list loads without a reload. |
| Failed (500, nothing cached) | Same lies | Same, plus **"Your earlier pages didn't come through just now — what you write now is still kept."** and one **Try again** (kit `Button`, secondary; reads "Trying…" while retrying). Try again loads "Day 3" and the markers. Never the word "error" (tested). |
| Empty (new account, States 1d) | The first-page line only | The same line, now only once the list has arrived empty. Adds 1d's **resting pencil** on the blank page (token colours) and the **terra cursor**. |
| *On this day*, nothing | Grey italic UI text "No entries on this day in past years." | Hand line: "Nothing from this day in past years — yet." |
| *Kept* | "1 days"; the full fern at 0 | "1 day" (audit #30). A coiled fern at 0, the export's full fern otherwise. |
| Desktop tree, no notes or quotes | Two bare "NOTES" / "QUOTES" headings | Each heading shows only when there's something under it |
| Phone Notes / Quotes tab, empty | Grey italic "No notes kept yet." | Coiled fern + hand line "No notes on the shelf yet.". Offline and failed get their own lines, and failed also gets Try again. |

## Decisions (Kai may reverse)

1. **1600 at 125% gets two columns, not three.** Three columns there would leave the notebook 386 px and wrap the title. Two give a full 660px page, with the rail folded underneath. Three columns return at ≥1000 CSS px of page: 1920, or 1600 with the sidebar collapsed. The threshold is one number in the `@container journal (min-width: 1000px)` rule.
2. **Mid-width tree is 200px** (export: 230). It keeps the 1280 title on one line; the 230 comes back with the three-column layout.
3. **Folded rail order:** Quote on the left; *On this day* over *Kept* on the right.
4. **Below 560px of page on a desktop window:** writing comes first, the tree goes to the bottom, and "＋ New entry" moves into the card footer. I chose this over the phone layout, so day navigation stays available.
5. **No "go to the Library" CTA in empty shelves**, and the desktop Notes/Quotes groups hide when empty. The Library is parked (K-26), and pointing new users at it would undo that.
6. **Loading shows no spinner.** The notebook is usable at once, and only the data-derived claims wait.
7. **Copy:** the two past-state lines, "Nothing from this day in past years — yet.", "No notes/quotes on the shelf yet.", "The shelf will be here when you're back online.", "The shelf didn't come through just now.", and "Try again"/"Trying…".

## Evidence (all run in this session)

**Automated checks**, from `app/`:
- `TZ=UTC npx vitest run`: **Test Files 38 passed (38) · Tests 495 passed (495)**
- `TZ=Africa/Cairo npx vitest run`: **Test Files 38 passed (38) · Tests 495 passed (495)**
- `journalDay.test.ts` is 26 tests, all passing. New `describe` blocks:
  - `listState`, including offline-after-cancel
  - past-state copy never says "error"
  - `daysLabel`
- `npm run lint`: **2 errors**, both the baseline in `features/projects/ProjectsPage.tsx:23–24`. 26 warnings, none in `features/journal`. One `exhaustive-deps` warning I introduced mid-way was fixed before its commit.
- `npm run build`: exit 0.

**Real run setup:**
- Production build (`vite preview --port 5236 --strictPort`), `/version.json` = `{"commit":"e4c7d97…"}`.
- Before-build on 5238 = `0519157`.
- 5237 belonged to another worker, so I didn't use it.
- Local stack at `127.0.0.1:54321`: no reset, no stop. Chromium 1194, `timezoneId: 'Africa/Cairo'`, default 125%.
- Accounts:
  - `polish-g@example.com`: 3 seeded entries (Sep 26 Grateful, Sep 25 Focused, Sep 23 Stretched), 1 quote, 1 note.
  - `polish-g-new@example.com`: empty, used for the first-run and blank-day runs.
- Both were seeded through auth + REST with their own JWTs.

**Screenshots** (`docs/log/assets/polish-g/`):
- `before-{day,night}-{d1280,d1440,d1600,p390}.png`
- `after-{day,night}-{d1280,d1440,d1600,p390}.png`, plus `after-*-{d1280,p390}-bottom.png` (folded rail)
- `states-before-*` and `states-after-*`:
  - `empty-{day,night}` at 1280 and 390
  - the 390 Notes tab
  - `loading`
  - `failed` and `failed-*-retried`
  - `offline`
- `typing-*.png`

**Typing saves exactly one entry** (P0-B must survive):

| Run | Result |
|---|---|
| Online, desktop, polish-g, empty past day (Sep 21; again at HEAD on Sep 20) | 1 row, 1 `journal.created` |
| Online, phone, new account, today | 1 row, 1 `journal.created` |
| Offline, desktop, new account, list never loaded | Outbox held 1 journal write (1 id). Topbar read "Offline ◌ — 1 saved here". The note stayed after typing. Drained on reconnect; the page read "Journal · Day 1" without a reload. Server: 1 row, 1 `journal.created`. Re-run at HEAD `e4c7d97`: same. |
| Offline, desktop, polish-g, Sep 22 | 1 row, 1 `journal.created` |
| Offline, phone, polish-g, today | 1 row, 1 `journal.created`; after reconnect "Journal · Day 5" |

**Console:** clean apart from the expected open-meteo `ERR_TUNNEL_CONNECTION_FAILED`, with three exceptions:
- the **500s I injected** for the failed-state run;
- one aborted image request (`vine/sprouting.png`, `ERR_ABORTED`) during sign-in navigation;
- aborted `/rest/v1/tasks` fetches when the offline run went offline mid-load.

None of these are app errors.

## Found, outside this scope (not touched)

- **The whole shell is 125% of the viewport tall at the default interface size.**
  - Measured on the before-build: at 1280×800 the document is 1000 px; at 390×844 it's 1055. Same on `/today` and `/settings`.
  - Cause: `.app-shell { height: 100dvh }` sits under the root `zoom: 1.25`, and the zoom scales it past the window.
  - Effect: the page scrolls at document level on top of `.app-main-content`, and the bottom fifth sits below the fold. That hides the sidebar footer on desktop. On the phone, the last card (Journal's quote) sits behind the tab bar.
  - Fix belongs in `components/AppLayout.tsx` / `lib/uiScale.ts`, e.g. `height: calc(100dvh / var(--kf-ui-scale, 1))`.
- **Phone topbar clips:** "MIRA'S FLOW · SAT 26 SEP' AFRICA/CAIRO" runs the date into the zone, and the sync state isn't visible at 390. This is shell, `AppLayout.tsx`.
- **The phone Journal (1b) has no way to reach another day.** That's the export's design; flagging it for Phase C.
