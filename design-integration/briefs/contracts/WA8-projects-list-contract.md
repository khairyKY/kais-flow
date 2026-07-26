# WA-8 pixel contract — Projects 1a list view (extracted 2026-07-26)

> Reader-extracted verbatim. WA-8 builds the MAIN column only (punch item 41) — the sidebar/topbar markup in the source is the shell's job, ignore it. Prepend `/` to asset paths. Sample strings (project names, hours) bind to real data; label/microcopy strings are verbatim copy. Retainer numbers must be REAL month windows (punch item 42) — the sample "6.5h / 10h this month" / "renews 1 Aug" are data-bound, not literals.

## Main column markup (verbatim)

```html
<div style="flex:1;padding:34px 48px 40px;max-width:900px">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="ds/assets/wisteria/p60.png" alt="" style="height:52px;filter:var(--shadow-drop-sm)">
      <div>
        <div style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-faint)">Projects &amp; areas · the forest</div>
        <h1 style="margin:3px 0 0;font-family:var(--font-display);font-weight:500;font-size:40px;line-height:1;letter-spacing:-0.015em;color:var(--ink-body)">What's growing</h1>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="fhelp">3 active · 6 total</span>
      <button style="border:1px solid var(--line-solid);background:var(--paper-bone);color:var(--ink-body);font-family:inherit;font-size:12.5px;padding:9px 15px;border-radius:999px;cursor:pointer">+ New area</button>
      <button style="border:none;background:var(--acc-terra);color:var(--paper-parchment);font-family:inherit;font-size:12.5px;padding:9px 15px;border-radius:999px;box-shadow:var(--shadow-cta);cursor:pointer">+ New project</button>
    </div>
  </div>

  <!-- ACTIVE -->
  <div class="slabel" style="margin:26px 0 4px"><span style="color:var(--acc-sage-text)">Active</span><span class="r"></span><span style="color:var(--ink-hairline)">2</span></div>
  <a href="#1b" style="display:flex;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px dashed var(--line-dashed);text-decoration:none">
    <span style="width:12px;height:12px;border-radius:50%;background:var(--acc-terra);flex:none"></span>
    <div style="flex:1;min-width:0"><div style="font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--ink-body)">Forecasting App</div><div style="font-size:12px;color:var(--ink-muted);margin-top:2px">Freelance</div></div>
    <span class="mchip">11.5h logged</span>
    <span class="chip" style="background:rgba(122,148,110,0.18);color:var(--acc-sage-text)">1 / 6 milestones</span>
    <span class="mchip" style="width:96px;text-align:right">target 25 Jul</span>
  </a>
  <!-- (second Active row identical shape: moss dot · "Balcony garden rebuild"/"Personal" · "4h logged" · "3 / 5 milestones" · "target 2 Aug", no border-bottom on last) -->

  <!-- RETAINERS -->
  <div class="slabel" style="margin:24px 0 4px"><span>Retainers</span><span class="r"></span><span style="color:var(--ink-hairline)">1</span></div>
  <a href="#1b" style="display:flex;align-items:center;gap:14px;padding:14px 2px;text-decoration:none">
    <span style="width:12px;height:12px;border-radius:50%;background:var(--acc-lavender-deep);flex:none"></span>
    <div style="flex:1;min-width:0"><div style="font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--ink-body)">Shaheen website</div><div style="font-size:12px;color:var(--ink-muted);margin-top:2px">Freelance</div></div>
    <span class="mchip">6.5h / 10h this month</span>
    <span class="chip" style="background:rgba(168,160,190,0.22);color:var(--acc-lavender-text)">retainer</span>
    <span class="mchip" style="width:96px;text-align:right">renews 1 Aug</span>
  </a>

  <!-- AREAS -->
  <div class="slabel" style="margin:24px 0 4px"><span>Areas</span><span class="r"></span><span style="color:var(--ink-hairline)">3</span></div>
  <div style="display:flex;align-items:center;gap:14px;padding:12px 2px;border-bottom:1px dashed var(--line-dashed)">
    <span style="width:12px;height:12px;border-radius:50%;background:var(--acc-buttercream);flex:none"></span>
    <div style="flex:1;min-width:0"><span style="font-size:15px;color:var(--ink-body)">Home</span> <span style="font-size:12px;color:var(--ink-muted);margin-left:8px">Personal</span></div>
    <span class="chip" style="border:1px solid var(--line-solid);color:var(--ink-faint)">area</span>
    <span class="mchip" style="width:96px;text-align:right">2 open</span>
  </div>
  <!-- (area rows repeat; slipping area variant: chip style="background:rgba(181,101,74,0.14);color:var(--acc-terra)" text "slipping · 21d"; last row no border-bottom) -->

  <div style="margin-top:26px;font-family:var(--font-hand);font-size:16px;color:#7a745f;transform:rotate(-0.8deg)">projects finish; areas just keep going — both grow leaves as you tend them ✿</div>
</div>
```

## Verbatim copy (labels/microcopy — not data)
`Projects & areas · the forest` · `What's growing` · `{n} active · {n} total` · `+ New area` · `+ New project` · `Active` · `Retainers` · `Areas` · `area` · `retainer` · `slipping · {n}d` · `{n} / {n} milestones` · `{n}h logged` · `{n}h / {n}h this month` · `target {d MMM}` · `renews {d MMM}` · `{n} open` · `projects finish; areas just keep going — both grow leaves as you tend them ✿`

## Key values
Row: gap 14 · dot 12px circle (project color; areas use accent tokens) · name display 17/600 (projects) or 15 (areas) · domain 12 `--ink-muted` · right meta chips `mchip`, last fixed `width:96px;text-align:right` · dashed row dividers, none on section-last. Header wisteria = live stage (not always p60). Hand line `#7a745f` = `var(--ink-hand)` in the app. Chip tints: sage `rgba(122,148,110,0.18)`, lavender `rgba(168,160,190,0.22)`, terra `rgba(181,101,74,0.14)`.
