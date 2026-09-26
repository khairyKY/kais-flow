---
date: 2026-09-26 07:52 UTC
session: bohr
type: handoff
related: repeat-reminder bug (suggested task from Polish D, started by Kai 2026-09-26), Polish F2a, polish-d-followups
supersedes: none
---

# Repeat-reminder bug: already fixed on `claude/polish-f2a` (`e73e627`); verified, not duplicated

Kai started the suggested task "next occurrence of a repeating task never reminds". The same fix was already item 2 of the running Polish F2a worker, per the Polish D follow-up decision. It was committed and pushed before this task arrived, so the conductor verified it against the task's spec instead of building a second branch that would conflict in `completion.ts`.

**Fix (in `e73e627`):**
- `recurrence.ts` gains the pure `nextReminderAt(reminderAt, fromDue, toDue)`: the same lead before the NEW due time; `null` stays `null`.
- `planCompletion()` writes it with `reminder_sent: false`. The completed row keeps its own reminder history.
- Perennials "Skip next" had the same bug and now moves the reminder too.
- `supabase/functions/notify` is unchanged, as the task required.

**Spec check:**

| Task spec | In `e73e627` |
|---|---|
| Shift `reminder_at` by `next − due` | yes: lead = due − reminder, applied to the new due |
| `reminder_sent: false` on the spawn | yes |
| No reminder stays null | yes (test "no reminder on the original → none on the copy") |
| Test: weekly, due Sat 09:00 Cairo, reminder 08:45 already sent → spawn Tue 08:45, unsent | yes: `2026-09-26T05:45Z` sent → `2026-09-29T05:45Z`, `reminder_sent` false |

**Checks run by the conductor on `origin/claude/polish-f2a` (detached worktree):**
- `completion.test.ts` + `recurrence.test.ts`: 2 files, 33 passed
- `TZ=UTC npx vitest run`: 45 files / 603 tests passed
- `TZ=Africa/Cairo npx vitest run`: 45 files / 603 tests passed
- `npm run lint`: exactly the 2 baseline errors (`ProjectsPage.tsx:23:35`, `:24:3`)
- `npm run build`: green

**Live check:** the F2a worker's brief includes reading the spawned row back over REST on the local stack; its handoff will carry that evidence. **Not merged:** F2a merges into `claude/release-1` through the release gate with the rest of its branch.
