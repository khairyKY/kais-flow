# WA-2 pixel contracts (extracted from the export, 2026-07-26)

> Reader-extracted verbatim markup. WA-2 builds from THIS file; punch items 32 (view-options popover — merge these visuals with the Akiflow capability set: 1–6/W/M day buttons where the design shows none, per [K-26]) and 39 (daisy day headers).
> Note for item 32: the design's popover has Density S/M/L, Week starts Mon/Sun, Show weekends/completed/declined, 24-hour time. Kai's Akiflow reference adds the 1–6/W/M **view selector row** — that row replaces the current N-day cycler and lives in this popover or beside it per WA-2's judgment against the screenshot (vault: `Pasted image 20260726094158.png` — View 1..6/W/M + Density S/M/L + Secondary time zone/Weekends/Declined events/Done tasks toggles).

## View options overlay (Overlays §05)

```html
<div class="pop" style="width:256px;padding:6px">
  <div style="font-family:var(--font-mono);font-size:8px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-hairline);padding:6px 10px 8px">View options</div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px">
    <span style="font-size:13px;color:var(--ink-body)">Density</span>
    <span style="display:inline-flex;background:var(--paper-bone);border:1px solid var(--line-card);border-radius:999px;overflow:hidden;font-family:var(--font-mono);font-size:9px;letter-spacing:0.06em;text-transform:uppercase"><span style="padding:5px 11px;color:var(--ink-muted)">S</span><span style="padding:5px 11px;background:var(--paper-parchment);color:var(--ink-body);box-shadow:var(--shadow-crisp)">M</span><span style="padding:5px 11px;color:var(--ink-muted)">L</span></span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px">
    <span style="font-size:13px;color:var(--ink-body)">Week starts</span>
    <span style="display:inline-flex;background:var(--paper-bone);border:1px solid var(--line-card);border-radius:999px;overflow:hidden;font-family:var(--font-mono);font-size:9px;letter-spacing:0.06em;text-transform:uppercase"><span style="padding:5px 11px;background:var(--paper-parchment);color:var(--ink-body);box-shadow:var(--shadow-crisp)">Mon</span><span style="padding:5px 11px;color:var(--ink-muted)">Sun</span></span>
  </div>
  <div style="height:1px;background:var(--line-dashed);margin:5px 8px"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px"><span style="font-size:13px;color:var(--ink-body)">Show weekends</span><span style="width:38px;height:22px;border-radius:999px;background:var(--acc-moss);position:relative;flex:none"><span style="position:absolute;top:2px;left:18px;width:18px;height:18px;border-radius:50%;background:var(--paper-parchment);box-shadow:var(--shadow-crisp)"></span></span></div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px"><span style="font-size:13px;color:var(--ink-body)">Show completed</span><span style="width:38px;height:22px;border-radius:999px;background:var(--line-card);position:relative;flex:none"><span style="position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--paper-parchment);box-shadow:var(--shadow-crisp)"></span></span></div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px"><span style="font-size:13px;color:var(--ink-body)">Show declined</span><span style="width:38px;height:22px;border-radius:999px;background:var(--line-card);position:relative;flex:none"><span style="position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--paper-parchment);box-shadow:var(--shadow-crisp)"></span></span></div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px"><span style="font-size:13px;color:var(--ink-body)">24-hour time</span><span style="width:38px;height:22px;border-radius:999px;background:var(--acc-moss);position:relative;flex:none"><span style="position:absolute;top:2px;left:18px;width:18px;height:18px;border-radius:50%;background:var(--paper-parchment);box-shadow:var(--shadow-crisp)"></span></span></div>
</div>
```

Toggle grammar: ON = `background:var(--acc-moss)`, knob `left:18px` · OFF = `background:var(--line-card)`, knob `left:2px`. Knob = 18px circle, parchment, `--shadow-crisp`. Trigger = ⚟ on the calendar header. Segmented active cell = parchment bg + `--shadow-crisp`.

## Day headers with daisy (Calendar 1a)

```html
<div style="display:flex;border-bottom:1.5px solid var(--line-solid);background:var(--paper-bone)">
  <div style="width:58px;flex:none;border-right:1px solid var(--line-card)"></div>
  <!-- past column -->
  <div style="flex:1;padding:10px 12px;border-right:1px solid var(--line-card);display:flex;align-items:center;gap:9px;opacity:0.62">
    <img src="ds/assets/daisy/past.png" alt="" style="height:26px">
    <div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-faint)">Thu</div><div style="font-family:var(--font-display);font-size:18px;color:var(--ink-muted);line-height:1">09</div></div>
  </div>
  <!-- today column -->
  <div style="flex:1;padding:10px 12px;border-right:1px solid var(--line-card);display:flex;align-items:center;gap:9px;background:rgba(168,160,190,0.1)">
    <img src="ds/assets/daisy/midday.png" alt="" style="height:30px;filter:var(--shadow-drop-sm)">
    <div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--acc-lavender-text)">Fri · Today</div><div style="font-family:var(--font-display);font-size:20px;font-weight:600;color:var(--acc-lavender-text);line-height:1">10</div></div>
  </div>
  <!-- future column -->
  <div style="flex:1;padding:10px 12px;border-right:1px solid var(--line-card);display:flex;align-items:center;gap:9px">
    <img src="ds/assets/daisy/future.png" alt="" style="height:26px">
    <div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-faint)">Sat</div><div style="font-family:var(--font-display);font-size:18px;color:var(--ink-body);line-height:1">11</div></div>
  </div>
</div>
```

Rules: past column → `daisy/past.png` 26px + whole cell opacity 0.62 · today → clock-driven stage (`morning`/`midday`/`evening` via `lib/growthStages.ts`) 30px + `filter:var(--shadow-drop-sm)` + lavender text/wash, day number 20px/600 · future → `daisy/future.png` 26px. Time gutter 58px. Asset paths get a leading `/` in the app.
