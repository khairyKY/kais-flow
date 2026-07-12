# <WS> — <Surface>

> Read `_SHARED.md` first. This adds only what's specific to <Surface>.

**Pixel contract:** `design-export/<File>.dc.html` — options **<ids>** (each = a
state/variant/breakpoint; reproduce all, reachable via the affordance shown).
**Species / growth:** <plant> — stage ← <data mapping>.

**You own:** `app/src/features/<feature>/**` + <any extra files>.
**Route:** orchestrator swaps `<Stub name="…"/>` at `/<path>` for your page.

**Data (reuse as-is):** hooks/mutations in `app/src/features/<feature>/api.ts`
(<name the ones you'll use>) + pure logic `<modules>`. New-surface only: migration
`<n>_<name>.sql` + `api.ts` + `logActivity('<event>')`.

**Kit:** compose `<Button/Chip/SectionLabel/TapeCard/Checkbox>` from `components/kit.tsx`.
**Overlays used:** <e.g. Snooze (S), Schedule, Task detail (Enter)> — already built; rewire.
**Effects/motion for this surface:** <e.g. Effects 2d day-complete; Motion 1b petal-fall on last Top-3 check; 5a checkbox bloom> — gate via `useMotionEnabled()`.

**Options to reproduce:**
- <id> — <what it is> → <route/state/affordance>
- …

**Done when:** every option pixel-faithful on real data, day+night, mobile variant(s)
<ids>, build green, fidelity note in PR. (See `_SHARED.md` DoD.)
