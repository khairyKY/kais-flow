# Kai's Flow v1.0 — Punch List

> **Ship date: 2026-08-15.** Frozen 2026-07-26 — nothing gets added; new wants go to the v2 parking lot (`V1-FEATURES.md` cut register / vault Deal note).
> **Judge: Kai, alone.** Every item has a **Judge:** line — the manual check that decides pass/fail. An item is done when its Judge line passes in the deployed build (not localhost), day theme and night theme, and on a phone where the item is phone-relevant.
> **Beta testers** (Mohamed Yasser, Ahmed Elkassrawy, Youssef Sanafawy, Mohamed Tagy, Reem) test the *product* after the list clears — they never see this list. Their impressions feed v2, not v1.
> Sources: The Deal items A1–D34 (vault) + drift audit + [K-26] review. Ordered by judging walkthrough, not by build order.

---

## 0. Decisions that unblock items below — **decide by Aug 1**

- [ ] **D-1 Journal model** — proposal: one daily page, unlimited timestamped entries, delete→Trash; titled notes → v2 with Library. *(blocks item 47)*
- [ ] **D-2 Evening ritual shape** — proposal: keep the 4-beat Closing Ritual, fold "sweep today" in as beat 1. *(blocks 43)*
- [ ] **D-3 Accent setting** — make real or remove the row. *(blocks 55)*
- [ ] **D-4 Route cut (Motion 2a)** — does the 1a ban cover the 160ms route cut? *(blocks 61)*
- [ ] **D-5 Go-to** — fold into ⌘K (type a view name → jump) or drop entirely from the cheatsheet. *(blocks 59)*

---

## 1. Public gate — a stranger can use it

- [ ] **1. Sign-up exists.** Page + logic + email verification per Supabase defaults.
  **Judge:** open the live URL in a private window, create a brand-new account end-to-end, land in onboarding.
- [ ] **2. Fresh-account first-run is clean.** Every surface shows its designed empty state; zero Kai-specific data, names, or sample literals anywhere.
  **Judge:** with the new account, visit every route; nothing looks broken, borrowed, or pre-filled.
- [ ] **3. Onboarding runs once.** Never reappears on refresh; re-editable from Settings.
  **Judge:** finish onboarding, refresh 3×, sign out/in — never see it again; change the name via Settings.
- [ ] **4. Public-safety pass.** RLS verified per table with a second account; Groq edge functions rate-limited; capture endpoints require auth.
  **Judge:** account B cannot read account A's data via the app or direct REST calls (spot-check 3 tables).
- [ ] **5. Performance.** Lighthouse ≥ 90 on the deployed build; initial JS ≤ 200KB gz; airplane-mode boot works.
  **Judge:** run Lighthouse on the live URL; toggle airplane mode and reload — app boots and shows cached data.

## 2. Cross-cutting behavior — the trust layer

- [ ] **6. Undo everywhere.** Complete, file, dismiss, delete, snooze, calendar drop/move/resize, slipping "reviewed", resurface chips — every one toasts with a working Undo.
  **Judge:** perform each of those 9 actions once; every toast has Undo; every Undo restores exactly.
- [ ] **7. Destination feedback.** Filing from Inbox says where it went ("Filed to Shaheen website — Undo").
  **Judge:** file 3 items (with date, without date, to a project) — each toast names the destination truthfully.
- [ ] **8. Nothing dead on screen.** Connect/Disconnect, search chips, People "later", Library keep/dismiss, Timeline tab, filter buttons — each works or is gone.
  **Judge:** click every visible control on every page; zero silent no-ops.
- [ ] **9. No design-sample literals.** Focus session strip, "subtask 2 of 3" fallback, Library "resurfaced twice" + chat-flag card, sun-dial dots, retainer "6.5h/10h · renews 1 Aug".
  **Judge:** each of those five spots shows real data or nothing.
- [ ] **10. Growth stages never lie.** One shared threshold module; hydrangea identical on Today/Inbox; vine lush = 30d everywhere; Slipping shows the project's real wisteria stage.
  **Judge:** with 4 inbox items, Today and Inbox show the same stage; a 60%-project's slipping card shows p60.
- [ ] **11. The word "error" never appears.** Calm-copy pass over outbox + settings toasts.
  **Judge:** kill the network mid-write and force a rejected write; the toast reads calm, no raw messages.
- [ ] **12. Keyboard truth.** `?` overlay lists only keys that work; list keys (S/P/X/1/2/3, Enter=detail) live on Today AND Tasks; one Inbox key set matching the strip; Esc closes everything including ⌘J chat.
  **Judge:** try every key the `?` overlay shows, on the page it claims — 100% must do what it says.
- [ ] **13. Escapes bug dead.** No literal `·`-style text anywhere.
  **Judge:** skim Activity, Herbarium, Trash — zero backslash artifacts.
- [ ] **14. Confirm cards, not `window.confirm`.** All 7 native confirm sites use the in-app ConfirmCard.
  **Judge:** delete a task from every entry point — never see a browser dialog.
- [ ] **15. Blur cluster fixed.** Resurface quote, Slipping title, bulk bar render as sharp as the rest at 90/100/110% zoom.
  **Judge:** side-by-side squint test at 100% — no soft text anywhere.
- [ ] **16. Zoom-proof layout.** Projects buttons (and everything else) intact at 90–110%.
  **Judge:** walk all pages at 100% and 90% — nothing overlaps, clips, or misaligns.

## 3. Today

- [ ] **17. "All open" capped** (~50) with "View all →" into the Tasks **All** tab.
  **Judge:** with 60+ open tasks, list stops at cap and the link lands filtered correctly.
- [ ] **18. Row meta on All open** — overdue/due/↻ badges (reuse the Tasks row).
  **Judge:** an overdue task shows "Overdue Nd" in terra on Today, same as on Tasks.
- [ ] **19. Multi-select: click-away deselects** (Ctrl-click stays; Esc stays).
  **Judge:** select 2 rows, click empty page space — selection clears.
- [ ] **20. Slipping: all cards stack, undo on "reviewed".**
  **Judge:** with 2 slipping projects, both show; "reviewed" toasts with Undo.
- [ ] **21. Resurfacing cooldowns** — priority-based (high ~2d / med ~5d / low ~10–14d), tunable in Settings; "Later" actually snoozes.
  **Judge:** press Later, revisit Today — the card is gone and stays gone; sliders exist in Settings.
- [ ] **22. "Later" chip sized correctly**; "Open calendar →" has a terra hover; voice-capture button states.
  **Judge:** eyeball all three.
- [ ] **23. One day-complete celebration.** Single implementation, fires once per day.
  **Judge:** finish the day on Today, then visit Tasks — no second burst.

## 4. Capture & Inbox

- [ ] **24. Android share-target.** Share a URL from Chrome → lands in Inbox.
  **Judge:** on the phone (installed PWA), share any page to Kai's Flow; it's in Inbox in <5s.
- [ ] **25. 30-day auto-compost cron** live for dismissed items + Trash.
  **Judge:** pg_cron job exists and a backdated test row composts on next run.
- [ ] **26. Bulk bar sharp + triage keys = strip.** (covered by 12/15 — verify here in context.)
  **Judge:** run a 5-item triage entirely by keyboard using only the keys the strip shows.

## 5. Tasks

- [ ] **27. All tab.** New view listing every open task incl. undated project filings.
  **Judge:** file an undated item to a project from Inbox — findable in All within seconds.
- [ ] **28. Recurring-import dedupe assistant.** Detects duplicate-title clusters (the 76× problem), offers merge-into-recurring, user confirms.
  **Judge:** run it on the real data — shower/breakfast collapse to single recurring tasks; nothing merges without consent.
- [ ] **29. Enter opens task detail** from any focused row (Today + Tasks).
  **Judge:** arrow to a row, press Enter — detail opens; Esc returns.
- [ ] **30. Organize rail: centered header, Projects sticky unclipped.**
  **Judge:** eyeball at 100% zoom.
- [ ] **31. Perennials: Edit rule opens the real Repeat menu** (not a native select).
  **Judge:** click Edit rule — themed menu, works.

## 6. Calendar

- [ ] **32. View-options popover, Akiflow-style.** 1–6/W/M day buttons + density + weekends/declined/done toggles; replaces the N-day cycler; no text selection.
  **Judge:** against the reference screenshot — same capabilities, our skin; drag across the buttons selects no text.
- [ ] **33. Drag block → Unscheduled rail** unschedules it.
  **Judge:** drag a scheduled task block onto the rail — it returns to Unscheduled, toast + Undo.
- [ ] **34. Task details from a block.** Click-through (or explicit affordance) reaches the full task editor.
  **Judge:** from a task block, reach its editor in ≤2 clicks without right-click.
- [ ] **35. Drop feedback trio:** invalid-drop soft-no shake, 30-min minimum on resize, top-edge resize works.
  **Judge:** try each once.
- [ ] **36. All-day ↔ timed drag conversion.**
  **Judge:** drag a block into the all-day band → becomes all-day (persists after refresh); drag it back down → timed again.
- [ ] **37. Edge auto-scroll while dragging.**
  **Judge:** drag a block to the bottom edge — grid scrolls under it.
- [ ] **38. Alignment/polish pass vs Akiflow reference.** Bounded: gutter widths, header alignment, block insets.
  **Judge:** side-by-side with Akiflow — nothing feels visibly "off"; remaining gaps get named and accepted, not ignored.
- [ ] **39. Daisy stages in day headers** (the one designed calendar visual still missing that v1 keeps).
  **Judge:** past day muted daisy, today matches the clock, future = bud.

## 7. Projects

- [ ] **40. Milestone "edit" edits.** (Delete moves to an explicit control.)
  **Judge:** click edit — rename inline; the milestone survives.
- [ ] **41. List view verbatim vs export** (board + detail already accepted).
  **Judge:** side-by-side with Projects.dc.html 1a.
- [ ] **42. Detail open-tasks parity.** Bulk select, right-click, schedule from the project's task list; real month-window stats; no hardcoded retainer numbers.
  **Judge:** select 3 tasks inside a project and schedule them; "This month" changes when the month does.

## 8. Routines, Rituals, Review

- [ ] **43. Evening ritual per D-2**; "One line" lands in the Journal; `skip` doesn't count a step as done.
  **Judge:** write a line at night — it's on the Journal page in the morning; skip a morning step — Today's ritual bar doesn't advance.
- [ ] **44. One streak algorithm.** Row flame = trellis number; today's check draws today's leaf.
  **Judge:** check a routine — the last trellis column fills now; flame and trellis header agree.
- [ ] **45. Review sweep persists + real sweep UI** (per-project rows with still-moving / park-it / needs-a-look), flourish on completion.
  **Judge:** sweep a domain, reload — still swept; each project got an explicit verdict.

## 9. Remaining surfaces

- [ ] **46. People:** "later" nudge works (snoozes the nudge); call/text action varies.
  **Judge:** press later — nudge gone today, returns later.
- [ ] **47. Journal per D-1**, nav row restored.
  **Judge:** per the decided model — create, edit, delete→Trash, restore.
- [ ] **48. Activity rows navigate to their source**; Projects filter chip; correct range label.
  **Judge:** click a "Completed X" row — lands on that task.
- [ ] **49. Search index covers people/events/projects/journal** (+ tasks/inbox); overlay scrolls; chips filter or go.
  **Judge:** search a person's name in ⌘/ — they appear; 30 results scroll.
- [ ] **50. Trash reachable** (Settings row + sidebar ghost link) and fed by journal deletes.
  **Judge:** find Trash without typing a URL; a deleted journal entry is restorable there.
- [ ] **51. Herbarium: press then archive**, escapes fixed.
  **Judge:** complete a project — ceremony plays before it reads as archived.

## 10. Focus

- [ ] **52. Real session data.** Block time, session count, subtask line from actual state or hidden; gear icon for settings; chime plays or the toggle is gone.
  **Judge:** start a pomodoro on a real task — everything on screen is true.

## 11. Settings & theming

- [ ] **53. Paper texture slider works.**
  **Judge:** drag it — the grain visibly changes; persists.
- [ ] **54. Every remaining row functional or hidden.** Sounds section hidden (v2); capture API hidden; integrations page deduplicated vs in-page sections; push section says what it does.
  **Judge:** every visible settings control does something observable.
- [ ] **55. Accent per D-3.**
- [ ] **56. "Botanical animations" off = still garden.** All loops gated; toggle decoupled from OS reduced-motion; present on mobile settings.
  **Judge:** toggle off — waveform bars, fireflies, twinkles all freeze; toggle reads correctly on a reduced-motion OS.
- [ ] **57. Night sweep.** Grain visible at night (overlay blend); the ~12 hardcoded light-only clusters fixed.
  **Judge:** flip to night, walk every page — no white washes, no vanished grain, no maroon-on-dark chips.

## 12. Shell & motion

- [ ] **58. Collapsed rail: simple line icons** for Inbox/Projects/Routines/Focus/Review/Library-slot; hover labels verified.
  **Judge:** collapse — icon set is coherent and every icon identifies its page.
- [ ] **59. Go-to per D-5**; `n` key + cheatsheet consistent.
- [ ] **60. Topbar fixed:** date `Fri 15 Aug` format, single `◌` offline, syncing colors.
  **Judge:** eyeball online/offline/syncing.
- [ ] **61. Motion application wave** per "everything except 1a" (+ D-4 for 2a): the absent motions (list breathing rowIn/rowOut, drag-lift grammar on all draggables, seed plant, mobile stack, drag polish) wired with spec timings; check-pop timings corrected (boxFill 90 → pop 180 → strike 240 → dip 120).
  **Judge:** complete a task, create a task, file an inbox item, drag anything — each has its designed motion; nothing appears/vanishes with zero transition.
- [ ] **62. Overlay grammar:** 210ms in / 140ms out / 20% scrim, everywhere.
  **Judge:** open+close ⌘K, ⌘/, ?, sheets — exits animate, scrims match.

## 13. Mobile

- [ ] **63. Bottom sheets** for snooze/schedule + task detail (no desktop popovers on phones).
  **Judge:** on the phone: snooze a task and open a task — both are thumbable sheets.
- [ ] **64. Phone walkthrough clean.** Tab bar, More sheet, swipe actions, capture FAB, safe areas.
  **Judge:** full capture→triage→plan→do loop on the installed PWA without pinch-zooming once.

## 14. Removals (landing = they're gone)

- [ ] **65. Library out of nav** (route may stay URL-only) · **Sounds section hidden** · **Notifications stub route removed** (bell → Activity) · **Planning board hidden** · **Quick-Capture gallery route dev-only**.
  **Judge:** none of these reachable by a normal user.

---

**Counting:** 65 items + 5 decisions. ~20 days to Aug 15. The remediation plan (waves, sequencing, what runs parallel) is the next document — it gets written against this list, not against the audit.
