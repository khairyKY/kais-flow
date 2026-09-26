---
date: 2026-09-26 07:24 UTC
session: bohr
type: decision
related: Polish D (handoff 2026-09-26-0720-polish-d-handoff.md), Polish F2a, Polish F2b, conductor-decides
supersedes: none
---

# Polish D merged into release-1 (`ddfb21a`); its open questions decided (Kai delegated all UX calls)

Batch checks: 45 files / 568 tests under UTC, Cairo and LA; lint 2 (baseline); build green. CRLF files still consistent.

| Question / finding | Decision |
|---|---|
| Tasks Organize rail hides below 760 CSS px | Accept. The list matters more than the rail at that width. |
| Calendar rail auto-folds at 1280/1440; columns down to 80px | Accept. 7/7 days visible beats a permanent rail. |
| "Up next" still lists events that already ended today | **Hide ended events.** Up next = running + upcoming. → F2a |
| "nothing on repeat today ✿" wording | Accept. |
| Undo hard-deletes the spawned repeat copy (not Trash) | Accept. The copy was created by the action being undone. |
| Next occurrence of a repeating task never reminds (copies `reminder_sent`) | **Fix:** the next occurrence resets `reminder_sent` and shifts `reminder_at` by the same offset from its due time. → F2a |
| Clicking a just-checked task on Today re-completes it | **Fix:** a second click on a done row reopens it (with Undo). → F2a |
| The Tasks checkbox petal never shows | Fix (cosmetic). → F2a |
| Calendar-block, Focus, editor and Planning completions have no Undo | **Wire `completeTaskWithUndo` everywhere a task completes.** → F2a (Focus/editor/Planning), F2b (calendar block) |
| Review card 30-cell rows are ~1px wide at 1280 and 390 | Fix the layout. → F2b |
| **Phones default to 125% UI scale (≈312 CSS px at 390)** | **Default 100% on phones and small touch screens; keep 125% on desktop.** The phone `.dc.html` designs are drawn at 390 CSS px. A user's explicit scale choice still wins. → F2b |

**F2b also carries the earlier decided items:**
- calendar: a dropped block stays visible; phone rail collapsed by default with a 1h lead; midnight rollover; QuickCreate reads typed times as Cairo (T-4);
- phone Inbox card width;
- keycaps in CommandBar/Onboarding.

**F2a also carries** the sort-control caret and the TaskEditorPage keycap.
