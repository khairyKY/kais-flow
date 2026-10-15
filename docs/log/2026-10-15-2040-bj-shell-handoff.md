---
date: 2026-10-15
session: bj-shell (builder, worktree .claude/worktrees/bj-shell, branch claude/bj-shell from claude/bound-journal)
type: handoff
status: IN PROGRESS
---

# 2026-10-15 20:40 UTC · handoff · bj-shell (Bound Journal reskin: the shell, the kit, the tool pages)

Spec: `design-export/Design System B.html` (Kai's answers of 15 Oct: D11 = B, D9 denied, D13 open — not built).

## Progress (updated as each group lands)

Done and pushed: verify.mjs shell scenes · Settings · Activity + Trash · Guide · tour notes + hints · chat panel · What's new · sign-in / first run.
To do: kit (kit.css / kit.tsx) · ActionSheet / BottomSheet / ContextMenu / pickers / Select / ShortcutOverlay / States · shell (AppLayout, MobileTabBar, ToastHost, DownloadBar) · bound.css folds for .kf-nav-tape · old harnesses · after shots · gate.

## Judgement calls (Kai's to overrule)

- Handwriting off the tools (D7, "Caveat only writes on pages"): a headline-like Caveat line on a tool became the serif lead (tour note line, chat's empty line: Source Serif 500, 20px); an aside became the UI face, 13–15px, muted (Settings' foot line, Activity's empty / end line, Trash's empty line, the Guide's subtitle and "nothing found", the hint line, sign-in's "Welcome to the garden", onboarding's "Let's plant something ✿"). Copy written lower-case for Caveat got a capital.
- Grain overlays drawn by tool pages themselves (Activity, Trash, first run) are gone (D7: no grain on tools).
- Section labels (D6) now also: Settings' group labels, Activity's day headers (count kept on the right), Trash's age groups, the Guide's sections — rules after them removed.
- A tool's dashed divider became solid in its old colour (`--line-dashed`), exactly what bound.css drew — no hairline colour changed. Dashed kept on: the tour's spotlight ring and stem (a pointer, not a divider), the "+ add repo" chip (an empty slot).
- Selection inked (D2/D12) on filter chips (Activity) and their range control; Settings' sound-pack radio cards keep their sage selection (a radio card, not a chip).
- The hint (gold paper) is a floating layer, so it carries the popover shadow (was the resting card shadow, which B made none).
- Trash's destructive buttons keep their terra fill; only their corner (12) and shadow (none) changed.
