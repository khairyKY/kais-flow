---
date: 2026-10-15
session: bj-shell (builder, worktree .claude/worktrees/bj-shell, branch claude/bj-shell from claude/bound-journal)
type: handoff
related: the Bound Journal reskin (Design System B, Kai's answers of 15 Oct); parallel builders bj-calendar, bj-pages, bj-tasks, bj-today
---

# 2026-10-15 20:40 UTC · handoff · bj-shell (the shell, the shared kit, the tool pages)

Branch `claude/bj-shell` (pushed, not merged, no PR). Spec: `design-export/Design System B.html` — D11 = B, D9 denied (capture stays 56 with its shadow), **D13 open: not built**. No colour token changed; no file under `app/src/lib/outbox.ts` or `supabase/` touched.

## What changed

- **Shell** (`components/AppLayout.tsx`, `MobileTabBar.tsx`, `ToastHost.tsx`, `features/download`): nav rows untaped and untilted at 12px (the `tape` field is gone from the nav items); group labels, the Plan drawer label, the workspace line and the top bar in sentence case, untracked; every sidebar / top-bar divider solid; the sync popover a 16px card with a UI-face aside; the More sheet at `--sheet-radius` with the sheet shadow and 12px tiles; toasts 12px. The tab bar was already Kai's settled shape (own icons, flat, soft pill on the active one, the terra capture inline at 56 with its shadow) and is unchanged.
- **Kit** (`components/kit.css`, `kit.tsx`): buttons flat (no shadow declarations left), a selected secondary and every selected chip ink-filled (`--sel-bg` / `--sel-ink`, check kept), bordered chips pill with body ink (the `!important` folded into the tone), checkbox `--radius-check` (7) on both widths, segments pill, the back link sentence case.
- **Overlays and pickers** (`ActionSheet`, `BottomSheet`, `ContextMenu`, `Select`, `SnoozeMenu`, `ProjectPicker`, `pickers.css`, `ShortcutOverlay`, `States`, `BulkBar`, `RouteErrorPage`): popovers 16px with 12px rows, solid hairlines, sentence-case meta; the chosen day and the chosen time pill ink-filled, unselected time pills transparent with the 3:1 edge; the shortcuts sheet untaped with section labels (D6); skeleton / error card / retry on the new radii.
- **Tool pages**: Settings (group labels as section labels, status chips in body ink, asides in the UI face), Activity (section-label day headers, D12 filter chips, no grain, kit secondary for a notice's actions, category tags capitalised), Trash (age groups as section labels, no grain, 12px buttons, solid rows), Guide (flat 16px cards, section labels without rules, no tape), tour notes + hints, chat panel, What's new, sign-in / first run / onboarding (no grain, 12px inputs).
- **bound.css**: `.kf-nav-tape`, `.kf-tour-tape`, `.gd-tape` deleted (their elements are gone); `night.css`'s `.kf-nav-tape` rule too. Every other bound.css rule still has users outside this area, so the file stays (see "Left for others").
- **ds:check**: 0 NEW hits in the files of this area (37 NEW remain repo-wide, all in calendar / paper / library / herbarium / weekly review / TaskRow / bound.css).

## Judgement calls (Kai's to overrule)

1. **Handwriting off the tools** (D7, "Caveat only writes on pages"): a headline-like Caveat line became the serif lead (`--fs-lead`, Source Serif 500: the tour note's line, chat's empty line); an aside became the UI face, muted (Settings' foot line, the sync popover, Activity's empty / end line, Trash's empty line, the Guide's subtitle and "nothing found", the hint line, the shortcuts subtitle, the error page, sign-in's "Welcome to the garden", onboarding's "Let's plant something ✿"). Copy written lower-case for Caveat got a capital.
2. **Grain drawn by tool pages themselves** (Activity, Trash, first run) is gone (D7: no grain on tools).
3. **Section labels (D6) widened** to Settings' group labels, Activity's day headers (count kept on the right), Trash's age groups, the Guide's sections and the shortcuts sheet's columns. The sidebar's "Tend" / "Cultivate" stay quiet faint meta (nav group headers, not content sections).
4. **Dividers**: a tool's dashed divider became solid in its old colour (`--line-dashed` / `--line-sidebar`), exactly what bound.css drew — no hairline colour changed. Dashed kept on the tour's spotlight ring and stem (a pointer, not a divider) and Settings' "+ add repo" chip (an empty slot).
5. **Selection** (D2 / D12) inked on chips, the selected secondary button, Activity's filter chips, the chosen day and time pill. Rows that are "current" keep the sage wash + check (ActionSheet rows, the time list, the project picker) and Settings' sound-pack radio cards keep sage — an ink-filled 52px row read heavy; say if rows should ink too.
6. **The tab bar's active pill keeps its per-surface tint** (`--block-sage` on Today, `--block-lavender` on Calendar…), as the D9 "after" shot Kai saw. The spec page draws it in `--tab-active-bg` (bone, nearly invisible on parchment); changing it would be a colour change unasked.
7. **Radii for floating layers**: popovers, menus, the shortcuts sheet, What's new, the tour note, confirm cards → 16 (`--radius-card`); toasts, hints, inline error card → 12 (a row). The More sheet → 20 (`--sheet-radius`).
8. **Shadows**: the hint and the More sheet float, so they carry the popover / sheet shadow (they had the resting card shadow, which B made none).
9. **Buttons**: desktop sizes kept (the 125% interface size draws them ≈44); weights unchanged. Trash's destructive buttons keep their `--acc-terra` fill; only corner (12) and shadow (none) changed.
10. **Type sizes** on every line touched now come from tokens (`--fs-meta` 12 / 12.5 phone, `--fs-caption`, `--fs-body`, `--fs-lead`), so a few sizes moved by ≤ 0.5px (the ActionSheet / picker meta 12 → 12.5 on a phone, the toast action 14 → 13.5 on desktop).

## Left for others (not in this area)

- `kit.tsx` `TapeCard` (3px, tape, tilt) is a page component, but its callers are tools: `features/calendar/QuickCreate.tsx` (bj-calendar) and `features/tasks/TasksPage.tsx` (bj-tasks). bound.css still flattens it there; the callers should stop using it.
- `features/tasks/LabelManager.tsx` (shown in Settings → Labels, owned by Tasks) still has a Caveat line.
- `features/tray/tray.css` (the Windows tray flyout) still has grain, 3px corners and a Caveat line — no owner in this split.
- `features/focus` `.washi-tape-settings`, `.tp-tape` (Today), and the global attribute rules (caps, mono tabular numbers, 3px, terra pills, tilt, dashed) still have users in the other areas, so bound.css stays.

## Evidence

- Before / after (verify.mjs, mock backend, 14 Oct 12:10, 1920×1080 + 390×844, day + night): `docs/log/assets/bj-shell/before/` and `after/` — 80 shots each, 80/80 pass both times. New scenes in `docs/log/assets/bound-journal/verify.mjs`: `shell-*` (Activity, Trash + empty, Guide, Settings mid / low / end, sign-in, download bar, What's new, undo toast, More sheet, action sheet, chat, shortcuts, sync popover, collapsed rail, context menu) and `kit-ref-*` (/design-system).
- Old harnesses, rerun on this branch: HARNESS_RESULTS
- Gate: GATE_RESULTS
