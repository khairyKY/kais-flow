---
date: 2026-10-12 18:39 UTC
session: local (kai-bugs-1012)
type: decision
related: 2026-10-12 design-coverage review; design-integration/V1-FEATURES.md (out-of-v1 register, [K-26]); Kai 2026-10-12 "also build the unbuilt designs"
---

# "Build the unbuilt designs" — what that covers, and the order

Kai, 2026-10-12: "also build the unbuilt designs" (after the design-coverage review and a check of
his Downloads — every Kai's Flow design there is already in `design-export/`, identical or older).

## Root cause of the gap
`design-integration/PLAN.md` §0.2 (Jul 12) was the only full section inventory. Two later export
landings added sections to files that already existed — 2026-07-25 (`0f92fe6e`: Calendar §3, §4)
and 2026-09-28 (`19283141`: Calendar §5, Today 2a, Inbox t3). New FILES got briefs and builders;
new SECTIONS in old files didn't. From now on, every design landing gets a section-level diff
against the previous export, and each new section gets a tracker line.

## Un-parked by this instruction (supersedes [K-26] lines; Kai can veto with one word)
- **Library** — [K-26] "parked to v2 — feature + nav row out of v1. Code stays." v1 shipped;
  the design (Library 1a/1b) exists and the code works. It gets its nav row back and joins Search.
- **Labels picker + manager** (Overlays) — out of v1; labels came back on rows in v1.0.17.
  Precedent: Sounds were cut from v1 "not designed yet", then designed and shipped (v1.0.23).

## Still out (Kai's own cuts/parks — not built)
Garden Postcard · Notifications slide-over (history lives on Activity) · Board view-options ·
seasonal drift / time-of-day paper / idle life / parasol header (Effects 2a/2b/2c/2h) · Effects 2g
focus dim · Motion 1a · pull-to-refresh (5c) · Focus 2a/2b · Routines 3a/3b (Q6) · States 2c
conflict card (outbox is last-write-wins) · Weekly Letter (dropped) · Projects v2 (prompt 16,
shelved by Kai 2026-10-06). Google-only states (RSVP, attendees, read-only) wait for Google sync.

## Not buildable yet — no design exists
Claude Design prompts written but never exported: **10 Notebook page** (being built now as a
no-design v1 from Kai's brainstorm, restyled when the export lands), **15 Themes**, **17 iOS skin &
polish**, **18 Calendars & colour packs**. [KAI] run them in Claude Design and save to the
`save-as` paths each prompt names.

## The build order (each waits for the builder that owns its files)
| Design | Owner files | Starts after |
|---|---|---|
| Search 1a/1b (filters, Library group, Show all, Related) | features/search, migration 0064 | now (`claude/search-design`) |
| Calendar §5 block detail + repeats | calendar | in flight (`claude/event-detail`) |
| Today 2a + MK Now Card states + MK Workload | today | in flight (`claude/fix-today`) |
| Inbox t3a/t3b | inbox | in flight (`claude/fix-inbox`) |
| Overlays task detail popover; Repeat custom rule | tasks | in flight (`claude/fix-tasks`) |
| Library nav row | AppLayout / More sheet | in flight (`claude/fix-grammar`) |
| **Calendar §4 collapsed planning mode (4a/4b)**; Calendar 3e multi-day «» + midnight ⌄/⌃; Editor 1b–1d full create page + Notes on create; Editor 1e phone create (Time block kind + task fields) | calendar | `claude/event-detail` merged |
| **Labels picker (L key) + manager** (Overlays) | tasks + settings | `claude/fix-tasks` + `claude/fix-grammar` merged |
| **Routines 2a/2b** (step minutes + total, step reorder, plant species picker) | routines | `claude/fix-grammar` merged |
| **Settings 2a GitHub rules panel** (watched repos, Inbox vs Tasks, inbox priority, Pause) | settings + github-sync | `claude/fix-grammar` + `claude/fix-backend` merged |
| **Tray notices** (paper ready, birthday, sync problem) | notifications + notify | `claude/fix-backend` merged |
| **Paper capture** 11d lock-screen notice, page reorder, long-press select, HEIC | paper | `claude/notebook-page` merged |
| **Motion** 2b/4e/3a stack push/pop; 2c/2d list drag-and-drop + filing drag; 4d drag polish · **Effects** 2j soft-no beyond the calendar, 2k boundary resistance, 2l long-press bloom | cross-cutting | all of the above merged |
| **Night 1a–1f** (frosted cards, moonflower + fireflies on Today, rim-lit vine, glowing calendar hairlines) | tokens + per-surface CSS | Today, Inbox, calendar merged (last — touches every surface) |

Every one goes through the same gate: side-by-side screenshots vs its `.dc.html` frame (desktop
1280 + phone 390, day + night), `ds:check` with no new drift, tests ×4 TZ, lint 0, build, and a
real-browser run. Nothing lands on `master` without Kai's "looks good, push it".
