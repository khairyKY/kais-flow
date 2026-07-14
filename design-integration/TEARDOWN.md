# TEARDOWN — kill the old UI, rebuild exact (v4, 2026-07-12)

Kai's complaint, verified by file audit: **17 UI files still wear the old skin**, and the
worst offenders are the **shared overlays/menus/toasts that render on top of every page** —
so even rebuilt screens feel old the moment a menu opens. Separately, rebuilt surfaces
were ported by interpretation, not transcription, so they drift from the export.

This plan supersedes the wave ordering in PLAN.md (the waves themselves stand). Two tracks:
**demolition** (nothing old survives) and **exactness** (everything new is a transcription).

---

## The audited old-skin inventory (what "get rid of it all" means)

**Overlay layer (bleeds over every page) — R1, highest priority**
`components/`: ContextMenu, Select, SnoozeMenu, ScheduleMenu, ProjectPicker, BulkBar,
ShortcutOverlay, ToastHost · `features/`: command-bar/CommandBar, search/SearchOverlay,
chat/ChatPanel · icons: MenuIcons, NavIcons (old sets).

**Old pages — R2 (prompt-bank waves, already written)**
inbox/InboxPage (W4) · routines/RoutinesPage (W5) · rituals/MorningRitual + EveningRitual +
RitualChrome + WeeklyReviewPage (W6) · settings/SettingsPage (W7) · capture/VoiceCaptureButton
(W8) · notifications/NotificationsPage (N4 Activity absorbs it) · resurfacing/ResurfaceCard +
today/Terrarium (W1 remainder) · plus all N1–N6 new surfaces.

**No-contract stragglers (exist in app, no .dc.html of their own)**
calendar/PlanningBoard (nav row exists in Editor 1a; no dedicated canvas) · auth/SignInPage.
Rule: restyle to tokens + kit + house rules, minimal and quiet — these are the ONLY two
surfaces where judgment is allowed, and they get flagged for Kai's eye explicitly.

**Legacy plumbing — R3 purge**
`index.css` deprecated alias block (--bg-base, --paper-card, --text-ink, …) · old
`public/assets/` botanical tree (superseded by `public/ds/assets/`) · unused icon exports.

**Already rebuilt (re-audited in R4, not rebuilt again):** shell/AppLayout, kit, Today
desktop, Tasks (5 options), Calendar+Editor (W3, merged cbf4dd9).

---

## The exactness rule (now binding on every wave — added to _SHARED.md)

**Transcribe, don't interpret.** A rebuild ports the `.dc.html` markup **node-for-node**:
same element tree, same inline style values, same numbers, same copy. The ONLY allowed
substitutions: sample text → real data · static markup → handlers/loops · `ds/assets/…` →
`/ds/assets/…` · the canvas's embedded sidebar/topbar → omitted (the shell owns them).
If you're restructuring a layout "because React", you're doing it wrong.
**And the Kai gate:** no surface counts as done until Kai has eyeballed it in the logged-in
preview next to the original canvas; every deviation he flags becomes a fix commit. Kai
keeps a dev server standing at `http://localhost:5195` for this whole plan — agents use it
for their own visual QA during R1/R2 (see `_SHARED.md` Protocol); R4 is still the final
sign-off pass, not the first time anyone looks at the screen.

---

## Phases

### R1 — Overlay demolition (serial-ish, do FIRST — kills the "old UI everywhere" feel)
Rebuild the entire shared overlay layer as transcriptions of `Overlays.dc.html`:
- §01 menus/popovers → SnoozeMenu, ScheduleMenu, ProjectPicker, Priority, Repeat, Toast/ToastHost
- §02 modals/panels → CommandBar (⌘K), SearchOverlay (⌘/), ChatPanel (⌘J), Confirm, BulkBar, Notifications slide-over
- §04 → Bulk actions, ShortcutOverlay (?)
- §05 → Go to (G), Calendar/Board view options, Label picker/manager
- ContextMenu + Select: same API/portal/Escape-stack contracts, new §01 visual language.
Delete the old icon usages as they fall out. **The overlay files are unfrozen for R1 only;
after merge they refreeze.** Behavior contracts (overlayStack, portals, keyboard) preserved.
Exit: open any menu on any page — nothing old-skinned appears anywhere in the app chrome.

### R2 — Surface waves (parallel, prompt bank as-is + demolition DoD)
Run the remaining PROMPT-BANK blocks (W1-remainder, W4–W8, N1–N6). New DoD line for every
wave: **delete every file your surface replaces in the same commit** — no dead components,
no old fallbacks. W1-remainder additionally absorbs: ResurfaceCard + Terrarium + the
VoiceCaptureButton restyle (their designs live in Today.dc.html 1a).

### R3 — Legacy purge (forcing function; after R1+R2 merge)
1. Delete the `index.css` legacy alias block; migrate any remaining usages to real tokens.
2. Delete old `public/assets/` tree; delete unused NavIcons/MenuIcons exports; delete the
   two old auth-page styles if replaced.
3. **Grep gates (build must stay green after deletion):** zero hits for
   `--bg-base|--bg-hover|--paper-card|--sidebar-bg|--text-ink|--text-muted|--text-faint|--accent-sage|--accent-terra|--border-faint` (alias names), `IBM Plex`, `src="assets/`,
   old `gardenAssets` paths. Anything still referencing them didn't get rebuilt — fix it.
Old UI cannot survive R3: its aliases and assets no longer exist.

### R4 — Exactness audit (with Kai, logged in)
Side-by-side per surface: the served `.dc.html` canvas beside the live route, day + night,
desktop + phone. Covers the already-rebuilt surfaces FIRST (shell vs Editor 1a/1g, Today vs
1a, Tasks vs 1a/1b/2a/2b/2c, Calendar+Editor vs their contracts) since they predate the
transcription rule. Every flagged deviation = a fix commit on the surface's branch.
Then X1–X5 passes (effects, motion, night, mobile, states) run as already planned.

**Order: R1 → (R4-lite on existing four surfaces) → R2 in parallel → R3 → R4 full → X passes.**
