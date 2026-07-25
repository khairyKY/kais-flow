# R4 Punch List — full verification checklist

Every item Kai raised across all four audit sessions, organised the way he walks the app.
Each row says what he said, what was actually changed, and **how to check it**.

Sources: the voice transcript (`Kai's review.txt`, claims 1–53) · the follow-up review · the 4c
screenshot round · the checkbox/drag round. Claim-by-claim history:
[KAI-AUDIT-2026-07-20.md](KAI-AUDIT-2026-07-20.md).

**Legend** — ✅ done, verify it · ⬜ open · ⏸ parked by Kai's ruling · 🔴 blocked on Kai · 💬 answered (question, not a defect)

**Score: 48 done · 11 open · 6 parked · 3 blocked**

> ⚠️ **Before verifying anything:** hard-reload (`Ctrl+Shift+R`). Several rounds were judged on a
> stale dev server. Default interface size is now **110%** — if that reads too small or too big,
> Settings → Appearance → Interface size (100/110/125/150).

---

## 0. Global

| # | What you said | Status | Verify by |
|---|---|---|---|
| G1 | *"the audit was done at 125–150% zoom, most natural at 110%, but everything feels small"* | ✅ | App now renders at **110% by default**. Settings → Appearance → **Interface size**. Diagnosis: tokens were correct (they match the export's px values) — it's a render-scale issue, so the document scales via root `zoom`, not the design system. Chose `zoom` over `transform: scale` after testing: transform breaks fixed-position coords (every popover would mis-place). |
| G2 | *"Sync failed for journal_entries: invalid input syntax for type uuid"* on every refresh | ✅ | Toast should be gone. Journal writes sent `user_id: ''`, which Postgres rejects — **and a rejected row sat at the head of the outbox and blocked every write behind it, forever.** Very likely the real cause of the whole "my changes come back" cluster. Rejected rows are now parked in a dead-letter key so the queue keeps draining. |
| P0 | Dismissed inbox items return · filing "comes back waiting" · project colour resets · onboarding loops | ✅ | All four were **one bug**, twice over: (1) the outbox wedge above, (2) a refetch race where realtime invalidation reverted pending writes. Test: dismiss an inbox item, refresh — it should stay dismissed. |

---

## 1. Shell & navigation

| # | What you said | Status | Verify by |
|---|---|---|---|
| 1 | *"I don't see the cluster of icons when the sidebar collapses"* → then *"instead I see all the botanical icons, which is stupid… maybe the cluster declusters on hover"* | ⬜ **OPEN** | Icons + hover label flyout shipped, but the **decluster-on-hover using Effects 2g** is not built. Needs your spec confirmation. |
| N1 | *"the icon used in the nav bar for that page… tasks has a small flower icon while localhost has the entire rendered flower"* | ✅ | Tasks used `cherry/bloom.png`; the export specifies an 18px five-ellipse glyph (fill `#D4A8B0`, centre `#C98A4B`). Checked every page — Today/Calendar already correct, Routines/Inbox genuinely do specify PNGs. Tasks was the only wrong one. |
| 12 | *"planning board looks like shit, park it until I redesign it"* → *"planning board still there it is not removed"* | ✅ | Gone from the sidebar. Route kept so nothing is lost. |

---

## 2. Today

| # | What you said | Status | Verify by |
|---|---|---|---|
| 3 | *"I would like a devider between tasks"* → *"should apply to the All open section"* | ✅ | Dashed hairline between rows, **including All open** (those rows had no `border` prop, so it never appeared there). |
| 22 | *"5A checkbox bloom… only for Top-3 / goal of the day and milestones"* → *"claim #22 is not done, I dont see it"* | ✅ | It was invisible because Today's rows swap instantly to a static check, so a bloom-capable checkbox was never on screen in a checked state. A brief `checking` state now holds it for the animation. **Top-3 + Goal only**; All open stays plain. |
| T1 | *"when the goal of the day is finished it should still be displayed, just crossed out"* (Motion 3b) | ✅ | The card always struck it through, but `top3` sorts done-after-open, so `top3[0]` silently became a *different* task and the finished one vanished. The goal now stays the goal. |
| 5a | *"rituals shouldn't always be displayed… user should choose whether they stay pinned"* | ✅ | Pin/unpin toggle on each ritual card. |
| 5b | *"they should be accessible from the routines window"* | ✅ | Routines page has a launcher row for both rituals. |
| 5c | *"the icon next to 'pin' is not a pin"* | ✅ | Was `◧` (a half-filled square). Now a real push-pin. |
| 6 | *"what is the relationship between routines and rituals… the logic is flat"* | ✅ | Your ruling (a): **fully separate**. A routine tagged `morning` no longer moves the Morning-ritual bar; ritual progress is its own steps. |

---

## 3. Tasks

| # | What you said | Status | Verify by |
|---|---|---|---|
| 18 | *"there's no overdue filter… add an overdue tab"* | ✅ | Overdue tab, terra-coloured. |
| 20 | *"there should be a reschedule button… replan the tasks that I missed"* | ✅ | "Reschedule all to today" on the Overdue tab. |
| 19 | *"'organized' should be more of a header… same font as the page title… subtle but visible"* | ✅ | Was 9.5px uppercase mono in faint grey; now the display face at a quiet weight. |
| 52 | *"static filter button and the icon is fucked"* | ✅ | It was a dead `<span>` (no handler at all). Now a working **sort** cycler; the `⚟` glyph replaced with real funnel/sort icons everywhere. |
| 53 | *"add a sort button for places that can use it"* | ⬜ **OPEN** | Tasks has it; other lists don't. |
| 17 | *"make placeholders generic, I don't want names in them"* | ✅ | Every personal name swept from quick-add, quick-create, command bar, capture-API sample, onboarding. |

---

## 4. Calendar

| # | What you said | Status | Verify by |
|---|---|---|---|
| 21 | *"the calendar blocks look like absolute shit"* → *"even worse"* → *"I want 4c applied"* | 🔴 **NEEDS YOUR VERDICT** | Took 3 attempts because I was reading the wrong file. Your screenshot settled it: the real block **is** the 4c example, which supersedes `Calendar.dc.html`. Now transcribed from 4c verbatim: radius 6px · fill `rgba(168,160,190,0.24)` · **full 1px border, not a left accent bar** · padding 7px 10px · title 12px · time mono 8.5px · 28×3 grip. |
| C1 | *"apply the ghost feature too"* | ✅ | The free-floating ghost genuinely didn't exist — FullCalendar draws only ONE dragging element and it snaps, so the mirror was playing both roles. There's now a real ghost tracking the pointer, with FC's mirror demoted to the stepped placeholder. |
| C2 | *"when I drag it turns all blue"* | ✅ | The ghost is cloned onto `<body>` (so `position:fixed` stays viewport-relative). But all block rules are scoped `.fc …`, so a bare clone matched none of them and fell through to FullCalendar's own default `#3788d8`. Now wrapped in a `.fc` host. |
| C3 | *"weird brown rectangle at the bottom when extending/compressing"* | ✅ | `.fc-event-resizer-end` had a 4px border inheriting `--line-solid`. Now a bare hit area — 4c's only bottom affordance is the lavender grip. |
| C4 | *"the time label is constantly 12"* | ✅ | `arg.date` is a FullCalendar **DateMarker** (wall-clock encoded as UTC), so formatting shifted it a second time: 21:41 Cairo → 00:41. Reads the real clock now. |
| C5 | *"add a check box to tasks on the calendar and the unscheduled ones"* | ✅ | On task-linked blocks and rail cards. Both are draggable, so the checkbox binds native listeners to swallow the gesture — React's synthetic events run too late to stop FullCalendar. |
| 13 | *"I should be able to choose the starting time, not hard coded on where I clicked"* | ✅ | Switching to "task" rendered the start as static text. All three kinds edit it now. |
| 14 | *"it gets clipped, I don't see the escape nor the create"* | ✅ | `top` was clamped downward but never upward (went negative on short viewports) and the popover had no height bound. |
| 15 | *"I am selecting text by accident"* on the day-count button | ✅ | `user-select: none`. |
| 16 | *"drag the divider between unscheduled and calendar"* → *"the limit should be bigger"* | ✅ | Draggable, persisted, double-click resets. Range widened to **150–760px**. |
| C6 | *"the calendar should take more space vertically"* | ✅ | Surrounding chrome trimmed. |

---

## 5. Search

| # | What you said | Status | Verify by |
|---|---|---|---|
| 9 | *"there is no scrolling for the search overlay?!!"* | ✅ | Results scroll inside the card. |
| 10 | *"results are not highlighted after clicking them"* | ⬜ **OPEN (reopened)** | First fix made `?focus=` work, but you then found it deeper: **(a)** lands on the task *list*, not the task; **(b)** if the task is in a project it should open that project and highlight it there; **(c)** highlight doesn't fire from the **full search page**; **(d)** the settle animation replays when landing mid-page — should start from just before the first item on screen. |

---

## 6. Inbox

| # | What you said | Status | Verify by |
|---|---|---|---|
| 32 | *"when I file something as a task, where does it go? I don't really know"* | ⬜ **OPEN** | Needs the destination named in the confirmation toast + a jump link. (Today's answer: it becomes a task with whatever due date triage set — often none, so it lands in Tasks and never appears on Today.) |

---

## 7. Projects

| # | What you said | Status | Verify by |
|---|---|---|---|
| PR1 | *"the projects page isnt implemented exactly like the design export"* | ⬜ **OPEN** | Full page diff against the export, using the method that finally worked for the calendar. |
| 33a | *"four big pills of buttons"* | ✅ | "+ New project" is the only filled CTA; "Finished" is ghost text; "+ New area" outlined. |
| 33b | *"that drop down menu isn't our theme at all"* | ✅ | It was a styled div with a **transparent native `<select>` laid over it** — themed trigger, OS dropdown on open. Now the themed `Select`. |
| 36 | *"the weight input, these two arrows show up"* | ✅ | Browser spinners hidden; field keeps number semantics. |
| 37 | *"weird blue rectangle"* on one-shot | ✅ | Raw `<select>` → themed `Select`. |
| 38 | *"issue with all of the drop down menus"* (work log) | ✅ | Themed date input. |
| 39 | *"why am I only able to choose today and yesterday?"* | ✅ | Any past date, capped at today. |
| 46 | *"I dont thik that I can assing a domain to an already created project"* | ✅ | `reparentProject()` existed in the API but was never surfaced. Domain select added under Color. |
| 35 | *"park the hover animation until I redesign"* | ⏸ | Parked. |

---

## 8. Focus

| # | What you said | Status | Verify by |
|---|---|---|---|
| 40 | *"why is it all static, the rounds always show round 2 of 4"* | ✅ | It was literally `useState(2)` hardcoded to match the mockup. Real now. |
| 41 | *"the setting icon looks like a sun"* | ✅ | The component was *named* `GearIcon` but drew a circle with rays. Real cog now. |
| 42 | *"there is a wierd flower at the top of the timer"* | ✅ | A bud marker rode the progress ring and parked dead-centre at a full timer. Removed. |
| 43 | *"add a shortcut to the focus tab inside a full paged task"* | ✅ | MiniFocus on the task detail page. |
| 44 | *"rethink the logic… a mini version so the user can stay on that task with a tiny pomodoro"* | ✅ | Session moved into a store with one ticker in the shell, so it **survives navigation** and is shared between `/focus` and the mini widget. |
| 45 | *"where are the custom times in the pomodoro setting"* | ✅ | Custom minutes beside each preset. Also fixed two auto-start toggles that had UI but nothing read them. |

---

## 9. Onboarding

| # | What you said | Status | Verify by |
|---|---|---|---|
| 25a | *"every time I refresh it takes me to onboarding"* | ✅ | Fixed via P0 — the `onboarded_at` write was being reverted. |
| 25b | *"the user should be able to go back and edit these through settings"* | ⬜ **OPEN** | |
| 26 | *"if the name's too long… it gets bumped down"* | ✅ | Nothing bounded the echoed name; both sides shrink now and it ellipses. |
| 27 | *"not sure what choosing a seed would make of a difference"* | 💬 | **Cosmetic only** — picks your terrarium species, changes no behaviour. Say the word if it should mean something or be cut. |
| 28a | *"weird horizontal scroll on the third page"* | ✅ | `.ob-body` set `overflow-y:auto`, and per spec that computes the other axis to `auto` — the bleeding decorative plants opened an x-scrollbar. |
| 28b | *"there's even a vertical one here too"* | ✅ | Card was pinned to `height:600px`; now `min-height`. |
| 29 | *"the connect buttons are not functioning… disable them for now, keep the code"* | ✅ | Disabled with an honest "Soon". Push (which works) untouched. |
| 30 | *"there's no seed link for the third flower and the fifth"* | 🔴 | **You generate the art.** |

---

## 10. Journal — ⏸ parked ( *"drop the journal page (park)"* )

Nav entry removed, route and page intact. Claims 47–50 (delete/restore, multiple entries,
editable title, "where is the actual journaling part") all parked with it.

> Worth knowing when you revisit: `journal_entries` is keyed by `entry_date` with **no title
> column**, so "multiple entries per day" and "change the title" are schema changes, not UI work.

---

## 11. Settings

| # | What you said | Status | Verify by |
|---|---|---|---|
| 51 | *"mostly static except the theme… paper texture not functional, accent you cannot change, sounds not functioning… should basically be all reworked"* | ⬜ **OPEN** | Paper texture, accent swatches and sound preview are inert and **are** wireable now. Integrations / push / capture API stay P6-scoped. |
| G1 | — | ✅ | New **Interface size** control (see Global). |

---

## 12. Emoji

| # | What you said | Status | Verify by |
|---|---|---|---|
| 8 | *"I see the old Windows shitty emojis… switch it to iOS"* → *"the emojies are not ios"* | ✅ | You were right twice. The first pass shipped **Twemoji — Twitter's set**, not Apple's. Now genuine Apple artwork (3793 PNGs from `emoji-datasource-apple`). Renders in task/project/area names, search, inbox, subtasks **and calendar blocks**. |

---

## 13. Motion & effects

| # | What you said | Status | Verify by |
|---|---|---|---|
| 2 | *"the hover blur shouldn't apply everywhere… park it"* | ⏸ | Neutralised in one place; hooks left so a single surface can re-enable it later. |
| 23 | *"drag lift should be applied, pull to refresh 5C… every one of them"* | ⬜ **PARTIAL** | **5b drag lift ✅** (one shared grammar; draggables used to just fade to 40% opacity, which reads as *disabled*). **5c pull-to-refresh ⬜** — a real mobile gesture + indicator build. |
| 24 | *"root transition view to view, 1A — no-go, don't add it"* | 💬 | **Already absent.** An earlier note of mine wrongly said `.kf-route` was this and should be deleted — it carries no animation at all and the calendar depends on it for height. Nothing to remove. |

---

## 14. Still open — suggested order

1. **Task detail reachable from anywhere** — *"I cant reach the full details page of a task from anywhere"*; wants the Overlays "Task detail · Enter · expands" popup (its "Open full" button covers the route to the full page). ⬜
2. **Search → task navigation** (claim 10, four sub-bugs above). ⬜
3. **Projects page exact-to-export** (PR1). ⬜
4. **Collapsed-nav decluster on hover** (claim 1). ⬜
5. **Resurface cooldowns** (claim 4) — *"Later" is coded as a `+20` boost, so it returns things sooner.* 🔴 blocked on `supabase login`.
6. **Duplicate recurring imports** (claim 7) — 76 copies of "shower + breakfast". ⬜
7. **Settings dead controls** (claim 51). ⬜
8. **Filed-item destination** (claim 32) · **re-run onboarding** (25b) · **sort elsewhere** (53) · **pull-to-refresh** (23). ⬜

## Blocked on you

1. **`supabase login`** — unblocks #5 only; everything else is unblocked (a credential-free schema probe already confirmed all migrations are applied).
2. **Calendar verdict** (claim 21).
3. **Seed art**, flowers 3 & 5 (claim 30).
