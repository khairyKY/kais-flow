// Kai's Flow — landing-page intro v2: "One seed. One day. One garden."
// A single unbroken camera journey along one soil line, dawn -> night.
// UI blooms into plants; the final wide shot reveals the whole day as a garden.
// Built on animations.jsx (globals on window). 1920x1080, 44s.

const { Stage, useTime, Easing: E, clamp: cl, interpolate } = window;

// ── palette (ds/tokens) ──────────────────────────────────────────────────────
const C = {
  linen: '#EFE9DB', parchment: '#FBF6E9', bone: '#F6F0E1', sidebar: '#EAE3D2', goal: '#F8EFD3',
  ink: '#2a2420', muted: '#6b6455', faint: '#8b8471', hairline: '#a49d87',
  lineSolid: '#cfc7b0', lineDashed: '#d5cdb5', lineCard: '#e0d8c2', lineGoal: '#dcc48e',
  sage: '#8A9A7E', moss: '#7A946E', terra: '#B5654A', blossom: '#D4A8B0', lavender: '#A8A0BE',
  hydrangea: '#9AB4BE', buttercream: '#D4C78A', gold: '#9a7b3a', goldWarm: '#C9A55A',
  sageText: '#4d6650', bcText: '#9a8b52',
};
const N = {
  page: '#211D30', card: '#262233', ink: '#F0EBDD', muted: '#C9C0D8', faint: '#8E88A0',
  line: 'rgba(240,235,221,0.16)', accent: '#E29473', gold: '#E4C36B', firefly: '#F6E28C',
};
const F = {
  disp: "'Source Serif 4', Georgia, serif",
  ui: "'Inter Tight', system-ui, sans-serif",
  mono: "'Courier Prime', ui-monospace, monospace",
  hand: "'Caveat', cursive",
};
const A = 'ds/assets/';
const DROP = 'drop-shadow(0 3px 3px rgba(60,52,38,0.20))';
const NOISE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

// ── math ─────────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (t, t0, d) => E.easeOutCubic(cl((t - t0) / d, 0, 1));
const rampL = (t, t0, d) => cl((t - t0) / d, 0, 1);
const rampIO = (t, t0, d) => E.easeInOutCubic(cl((t - t0) / d, 0, 1));
const rampBack = (t, t0, d) => E.easeOutBack(cl((t - t0) / d, 0, 1));
const rampExpo = (t, t0, d) => E.easeOutExpo(cl((t - t0) / d, 0, 1));
const win = (t, a, b, fin, fout) => { // 0..1..0 window
  if (t < a || t > b) return 0;
  let o = 1;
  if (t < a + fin) o = (t - a) / fin;
  else if (t > b - fout) o = (b - t) / fout;
  return E.easeInOutSine(cl(o, 0, 1));
};

const DURATION = 44.0;
const SOIL = 1000;

// ── the camera (one continuous move) ─────────────────────────────────────────
const IOC = E.easeInOutCubic;
const camXf = interpolate(
  [0, 3.6, 4.8, 9.8, 11.2, 15.8, 17.2, 21.8, 23.2, 27.8, 29.2, 33.0, 35.4, 44],
  [900, 900, 1600, 1600, 2950, 2950, 4000, 4000, 5000, 5000, 5950, 5950, 3475, 3475], IOC);
const camYf = interpolate(
  [0, 3.6, 4.8, 24.0, 25.6, 27.0, 28.6, 33.0, 35.4, 44],
  [742, 742, 640, 640, 462, 462, 640, 640, 300, 300], IOC);
const camZf = interpolate(
  [0, 3.2, 4.8, 33.0, 35.4, 38, 44],
  [1.16, 1.045, 1.0, 1.0, 0.34, 0.34, 0.323], IOC);

function CamLayer({ children, z }) {
  const t = useTime();
  const cx = camXf(t), cy = camYf(t), cz = camZf(t);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: 'translate(' + (960 - cx * cz) + 'px,' + (540 - cy * cz) + 'px) scale(' + cz + ')', transformOrigin: '0 0', zIndex: z || 1 }}>
      {children}
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────
function Leafy({ src, style }) {
  return <img src={A + src} alt="" draggable={false} style={{ filter: DROP, display: 'block', ...style }} />;
}
function Kicker({ children, color, style }) {
  return <span style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: color || C.faint, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}
function Box({ done, size, color }) {
  size = size || 20;
  return done
    ? <span style={{ width: size, height: size, borderRadius: 5, background: color || C.sage, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.parchment, fontSize: size * 0.6 }}>✓</span>
    : <span style={{ width: size, height: size, borderRadius: 5, border: '1.5px solid #bfb8a3', flex: 'none', background: 'rgba(255,255,255,0.4)' }} />;
}
function Cursor({ x, y, down, o }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 50, opacity: o == null ? 1 : o, transform: 'scale(' + (down ? 0.9 : 1) + ')', filter: 'drop-shadow(0 3px 4px rgba(60,52,38,0.35))' }}>
      <svg width="30" height="38" viewBox="0 0 24 30"><path d="M2 2 L2 22 L7 17.5 L10.5 26 L14 24.3 L10.5 16 L17 16 Z" fill="#2a2420" stroke="#FBF6E9" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    </div>
  );
}
function LeafLogo({ size, glow }) {
  size = size || 104;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 0 18px rgba(168,192,154,0.45))' : 'none' }}>
      <path d="M50 6 C 82 34, 82 82, 50 114 C 18 82, 18 34, 50 6 Z" fill={C.sage} stroke={C.moss} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 12 L50 110" stroke={C.moss} strokeWidth="3" strokeLinecap="round" />
      <g stroke={C.moss} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9">
        <path d="M50 38 Q 64 40 71 52" /><path d="M50 38 Q 36 40 29 52" />
        <path d="M50 58 Q 66 60 73 74" /><path d="M50 58 Q 34 60 27 74" />
        <path d="M50 78 Q 62 80 68 92" /><path d="M50 78 Q 38 80 32 92" />
      </g>
      <path d="M50 110 L50 120" stroke={C.moss} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

// ── captions: plain & confident ──────────────────────────────────────────────
function Caption({ start, end, num, time, word, sub, light }) {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.05) return null;
  const lt = t - start, dur = end - start, fin = 0.42, fout = 0.38;
  let o = 1, ty = 0;
  if (lt < fin) { const e2 = E.easeOutCubic(cl(lt / fin, 0, 1)); o = e2; ty = (1 - e2) * 18; }
  else if (lt > dur - fout) { const e2 = E.easeInCubic(cl((lt - (dur - fout)) / fout, 0, 1)); o = 1 - e2; ty = -e2 * 8; }
  const ink = light ? N.ink : C.ink;
  const dim = light ? N.faint : C.faint;
  return (
    <div style={{ position: 'absolute', left: 132, bottom: 104, opacity: o, transform: 'translateY(' + ty + 'px)', zIndex: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, width: 300 }}>
        <Kicker color={dim} style={{ fontSize: 13 }}>{num} · {time}</Kicker>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + (light ? 'rgba(240,235,221,0.3)' : C.lineDashed) }} />
      </div>
      <div style={{ fontFamily: F.disp, fontSize: 76, fontWeight: 500, color: ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{word}</div>
      {sub && <div style={{ marginTop: 12, fontFamily: F.mono, fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: dim }}>{sub}</div>}
    </div>
  );
}

// ── world dressing ───────────────────────────────────────────────────────────
const GRASS = Array.from({ length: 26 }).map((_, i) => ({
  x: 560 + i * 232 + ((i * 73) % 90), h: 14 + ((i * 37) % 12), f: ((i * 53) % 100) / 100,
}));
function Ground() {
  const t = useTime();
  return (
    <React.Fragment>
      {/* below-soil earth */}
      <div style={{ position: 'absolute', left: -400, top: SOIL, width: 8200, height: 1800, background: '#E7E0CC' }} />
      <div style={{ position: 'absolute', left: -400, top: SOIL, width: 8200, borderTop: '1.5px dashed ' + C.lineDashed }} />
      {/* grass tufts */}
      {GRASS.map((g, i) => (
        <svg key={i} width="26" height={g.h + 4} viewBox={'0 0 26 ' + (g.h + 4)} style={{ position: 'absolute', left: g.x, top: SOIL - g.h - 2, opacity: 0.75, transform: 'rotate(' + 3 * Math.sin(t * 0.8 + i) + 'deg)', transformOrigin: '50% 100%' }}>
          <g stroke={C.sage} strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d={'M13 ' + (g.h + 2) + ' C 12 ' + (g.h * 0.5) + ', 11 ' + (g.h * 0.3) + ', 9 2'} />
            <path d={'M13 ' + (g.h + 2) + ' C 14 ' + (g.h * 0.5) + ', 16 ' + (g.h * 0.4) + ', 19 4'} />
            <path d={'M13 ' + (g.h + 2) + ' L 13 ' + (g.h * 0.25)} />
          </g>
        </svg>
      ))}
    </React.Fragment>
  );
}

// the sun — one warm disc traveling the whole sky
const sunXf = interpolate([0, 4.8, 11.2, 17.2, 23.2, 29.2, 32.0, 34.5], [1150, 1950, 3200, 4260, 5240, 6150, 6480, 6700]);
const sunYf = interpolate([0, 4.8, 11.2, 17.2, 23.2, 29.2, 32.0, 34.5], [845, 500, 290, 235, 285, 520, 780, 1060]);
const sunOf = interpolate([0, 0.6, 31.5, 34.3], [0.0, 1, 1, 0]);
function Sun() {
  const t = useTime();
  const x = sunXf(t), y = sunYf(t), o = sunOf(t);
  if (o <= 0.01) return null;
  const warm = interpolate([0, 6, 24, 29, 34], [1, 0.35, 0.35, 0.9, 1])(t); // rosier at dawn/dusk
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', opacity: o }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 560, height: 560, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(233,200,126,' + (0.34 + 0.2 * warm) + ') 0%, rgba(233,200,126,0) 62%)' }} />
      <div style={{ width: 92, height: 92, borderRadius: '50%', background: warm > 0.6 ? '#E4B278' : '#EFD9A0', boxShadow: '0 0 60px rgba(228,178,120,0.7)', transform: 'translate(-50%,-50%)', position: 'absolute' }} />
    </div>
  );
}

// ── persistent plants along the soil ─────────────────────────────────────────
function PlantSpot({ x, at, src, h, num, label }) {
  const t = useTime();
  if (t < at) return null;
  const g = rampBack(t, at, 0.8);
  const sway = 1.3 * Math.sin(t * 0.9 + x * 0.01);
  const lab = ramp(t, at + 0.6, 0.6);
  return (
    <div style={{ position: 'absolute', left: x, top: SOIL + 2 }}>
      <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) scale(' + cl(g, 0, 1.06) + ') rotate(' + sway + 'deg)', transformOrigin: '50% 100%' }}>
        <Leafy src={src} style={{ height: h }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: 14, transform: 'translateX(-50%)', opacity: lab, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <Kicker style={{ fontSize: 10.5 }}>{num} · {label}</Kicker>
      </div>
    </div>
  );
}

// ═══ 0 — COLD OPEN: the first seed (persists forever) ════════════════════════
function OpenStation() {
  const t = useTime();
  const fall = E.easeInQuad(rampL(t, 0.25, 0.6));
  const seedY = lerp(400, SOIL - 10, fall);
  const seedO = fall < 1 ? 1 : (1 - rampL(t, 0.95, 0.3));
  const grow = rampBack(t, 0.95, 0.9);
  const noteO = win(t, 1.5, 3.4, 0.45, 0.45);
  return (
    <React.Fragment>
      {fall > 0 && seedO > 0 && <div style={{ position: 'absolute', left: 900, top: seedY, width: 19, height: 25, transform: 'translate(-50%,-50%) rotate(' + fall * 40 + 'deg)', background: C.ink, borderRadius: '50% 50% 46% 46%', opacity: seedO }} />}
      {grow > 0 && (
        <div style={{ position: 'absolute', left: 900, top: SOIL + 2, transform: 'translateX(-50%)' }}>
          <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) scale(' + cl(grow, 0, 1.06) + ') rotate(' + 1.5 * Math.sin(t * 1.1) + 'deg)', transformOrigin: '50% 100%' }}>
            <Leafy src="clover/seedling.png" style={{ height: 132 }} />
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', left: 900, top: SOIL + 40, transform: 'translateX(-50%)', opacity: noteO, textAlign: 'center' }}>
        <div style={{ fontFamily: F.disp, fontSize: 40, fontWeight: 500, color: C.ink, letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>Every day starts as a seed.</div>
        <div style={{ marginTop: 10 }}><Kicker style={{ fontSize: 12 }}>Day 1 · dawn</Kicker></div>
      </div>
    </React.Fragment>
  );
}

// ═══ 1 — CAPTURE (7:04 AM): phone → card folds into a seed → inbox blooms ═══
function CaptureStation() {
  const t = useTime();
  const on = win(t, 4.5, 10.0, 0.55, 0.6);
  if (on <= 0 && (t < 4.5 || t > 10.0)) return t >= 8.45 ? <PlantSpot x={2000} at={8.45} src="hydrangea/light.png" h={235} num="01" label="Inbox" /> : null;
  const inp = rampExpo(t, 4.6, 0.7);
  const listen = rampL(t, 5.0, 0.35);
  const card = ramp(t, 6.1, 0.45);
  const fold = rampIO(t, 7.05, 0.45);          // card folds into a seed
  const flyP = rampIO(t, 7.45, 0.85);          // seed arcs to the soil
  const bob = 8 * Math.sin(t * 1.4);
  const px = 1430, pW = 272, pH = 560, pTop = SOIL - 4 - pH;
  const cardCX = px, cardCY = pTop + 388;
  const landX = 2000, landY = SOIL - 12;
  const sx = lerp(cardCX, landX, flyP);
  const sy = lerp(cardCY, landY, flyP) - Math.sin(flyP * Math.PI) * 160;
  const flying = flyP > 0.01 && flyP < 0.995;
  const pulse = 1 + 0.06 * Math.sin(t * 5);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: px, top: pTop + bob, transform: 'translateX(-50%) translateX(' + lerp(-60, 0, inp) + 'px)', opacity: inp * on, zIndex: 6 }}>
        <div style={{ width: pW, height: pH, background: '#211d18', borderRadius: 40, padding: 10, boxShadow: '0 26px 60px rgba(60,52,38,0.32)' }}>
          <div style={{ width: '100%', height: '100%', background: C.linen, borderRadius: 31, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.45, pointerEvents: 'none', zIndex: 5 }} />
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 82, height: 24, background: '#0d0b09', borderRadius: 14, zIndex: 6 }} />
            <div style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 22px 4px', fontFamily: F.mono, fontSize: 11, color: C.ink }}>
              <span>7:04</span><span style={{ letterSpacing: 2 }}>▪▪▪</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 18px 0' }}>
              <Kicker style={{ fontSize: 9 }}>Quick capture</Kicker>
              <div style={{ position: 'relative', marginTop: 26, width: 110, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {[0, 1, 2].map(i => {
                  const p = ((t * 0.6 + i / 3) % 1);
                  return <div key={i} style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', border: '2px solid ' + C.terra, opacity: (1 - p) * 0.5 * listen, transform: 'scale(' + (1 + p * 0.9) + ')' }} />;
                })}
                <div style={{ width: 78, height: 78, borderRadius: '50%', background: C.terra, boxShadow: '0 7px 18px rgba(120,60,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(' + pulse + ')' }}>
                  <svg width="29" height="31" viewBox="0 0 24 24" fill="none"><rect x="9" y="2.5" width="6" height="11.5" rx="3" fill={C.parchment} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" stroke={C.parchment} strokeWidth="1.8" strokeLinecap="round" /></svg>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3.5, height: 26, marginTop: 18, opacity: listen * (1 - card * 0.5) }}>
                {[9, 15, 22, 12, 19, 7, 14, 20, 10, 17, 8].map((b, i) => (
                  <span key={i} style={{ width: 3.5, height: b + Math.abs(Math.sin(t * 3 + i)) * 13, borderRadius: 2, background: C.terra, opacity: 0.55 }} />
                ))}
              </div>
              {/* captured card — folds into a seed */}
              <div style={{ marginTop: 16, width: '100%', opacity: card * (1 - rampL(t, 7.3, 0.25)), transform: 'scale(' + lerp(1, 0.1, fold) + ') translateY(' + fold * 40 + 'px)', transformOrigin: '50% 60%' }}>
                <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 10, boxShadow: '0 1px 2px rgba(60,52,38,0.14)', padding: '11px 13px' }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.35 }}>Try the pricing model on the Cairo cohort</div>
                  <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.hydrangea }} />
                    <Kicker style={{ fontSize: 8.5 }}>→ Inbox</Kicker>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {flying && (
        <div style={{ position: 'absolute', left: sx, top: sy, width: 19, height: 25, transform: 'translate(-50%,-50%) rotate(' + flyP * 300 + 'deg)', background: C.ink, borderRadius: '50% 50% 46% 46%', zIndex: 8 }} />
      )}
      <PlantSpot x={2000} at={8.45} src="hydrangea/light.png" h={235} num="01" label="Inbox" />
    </React.Fragment>
  );
}

// ═══ 2 — PLAN (8:30 AM): seeds become the Top 3 → cherry blooms ══════════════
const PLANROWS = [
  { y: 0, txt: 'Deliver the MVP of the forecasting app', goal: true },
  { y: 1, txt: 'Plan & implement the forecasting logic' },
  { y: 2, txt: 'Create official emails for Shaheen' },
];
function PlanStation() {
  const t = useTime();
  const A0 = 11.15, FOLD = 14.95;
  const plant = <PlantSpot x={3050} at={15.25} src="cherry/bloom.png" h={265} num="02" label="Today" />;
  if (t < A0 - 0.1 || t > 16.2) return t >= 15.25 ? plant : null;
  const un = rampExpo(t, A0, 0.65);           // page unfolds up from the soil
  const fold = rampIO(t, FOLD, 0.5);          // presses back down
  const W = 780, H = 560, left = 2950 - W / 2, top = SOIL - 4 - H;
  const gleam = win(t, 13.5, 14.6, 0.3, 0.4);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: left, top: top, width: W, height: H, transform: 'scaleY(' + (un * (1 - fold)) + ')', transformOrigin: '50% 100%', opacity: cl(un * 1.4, 0, 1) * (1 - rampL(t, FOLD + 0.3, 0.25)), zIndex: 6 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 50px rgba(60,52,38,0.16)' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: -11, left: '50%', width: 84, height: 20, marginLeft: -42, background: 'rgba(138,154,126,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
          <div style={{ padding: '30px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Kicker>Today</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: 38, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 5 }}>Friday, July 10</div>
              </div>
              <Leafy src="clover/four_leaf.png" style={{ width: 42 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '22px 0 10px' }}>
              <Kicker style={{ fontSize: 10.5 }}>Top 3 for today</Kicker>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + C.lineDashed }} />
            </div>
            {PLANROWS.map((r, i) => {
              const tin = ramp(t, 12.05 + i * 0.42, 0.5);   // row appears as its seed lands
              const isG = r.goal;
              return (
                <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: isG ? '14px 14px' : '12px 4px', marginBottom: isG ? 8 : 0, background: isG ? C.goal : 'transparent', border: isG ? '1px solid ' + C.lineGoal : 'none', borderBottom: isG ? '1px solid ' + C.lineGoal : '1px dashed ' + C.lineDashed, borderRadius: isG ? 3 : 0, boxShadow: isG ? '0 1px 2px rgba(60,52,38,0.12),0 6px 16px rgba(154,123,58,' + (0.14 + gleam * 0.2) + ')' : 'none', transform: isG ? 'rotate(-0.4deg) scale(' + (1 + gleam * 0.015) + ')' : 'none' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, flex: 'none', border: '1.5px solid ' + (isG ? C.gold : '#bfb8a3'), background: 'rgba(255,255,255,0.5)', opacity: tin }} />
                  <div style={{ flex: 1, opacity: tin, transform: 'translateY(' + lerp(8, 0, tin) + 'px)' }}>
                    {isG && <Kicker color={C.gold} style={{ fontSize: 9 }}>✶ Goal of the day</Kicker>}
                    <div style={{ fontFamily: isG ? F.disp : F.ui, fontSize: isG ? 21 : 16, fontWeight: isG ? 600 : 400, color: isG ? '#4a3a1e' : C.ink, marginTop: isG ? 4 : 0 }}>{r.txt}</div>
                  </div>
                  {isG
                    ? <div style={{ textAlign: 'center', flex: 'none', opacity: tin }}><div style={{ fontFamily: F.hand, fontSize: 14, color: C.gold }}>for luck</div></div>
                    : <span style={{ color: C.terra, fontSize: 16, opacity: tin }}>★</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* seeds hop up from the soil into the rows */}
      {PLANROWS.map((r, i) => {
        const p = rampIO(t, 11.75 + i * 0.42, 0.55);
        if (p <= 0 || p >= 1) return null;
        const x0 = 2830 + i * 90, y0 = SOIL - 8;
        const x1 = left + 50, y1 = top + 158 + (i === 0 ? 30 : 96 + (i - 1) * 51 + 30);
        const x = lerp(x0, x1, p), y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * 190;
        return <div key={'s' + i} style={{ position: 'absolute', left: x, top: y, width: 16, height: 21, transform: 'translate(-50%,-50%) rotate(' + p * -260 + 'deg)', background: C.ink, borderRadius: '50% 50% 46% 46%', zIndex: 8 }} />;
      })}
      {plant}
    </React.Fragment>
  );
}

// ═══ 3 — SCHEDULE (9:12 AM): drag to a slot → the grid tilts into beds ═══════
function SchedStation() {
  const t = useTime();
  const A0 = 17.2;
  const plant = <PlantSpot x={4100} at={21.3} src="daisy/midday.png" h={280} num="03" label="Calendar" />;
  if (t < A0 - 0.1 || t > 22.4) return t >= 21.3 ? plant : null;
  const un = rampExpo(t, A0, 0.6);
  const W = 830, H = 520, left = 4000 - W / 2, top = SOIL - 4 - H;
  // drag choreography
  const chipX = left + 116, chipY = top + 100;
  const slotX = left + 470, slotY = top + 205;
  const grab = rampL(t, 18.15, 0.1);
  const move = rampIO(t, 18.3, 0.85);
  const drop = rampL(t, 19.2, 0.3);
  const held = grab > 0.5 && drop < 1;
  const cx = t < 18.3 ? lerp(left + W + 60, chipX + 130, ramp(t, 17.55, 0.7)) : lerp(chipX + 130, slotX + 150, move);
  const cy = t < 18.3 ? lerp(top + H + 40, chipY + 24, ramp(t, 17.55, 0.7)) : lerp(chipY + 24, slotY + 40, move);
  const gx = lerp(chipX, slotX - 140, move), gy = lerp(chipY, slotY - 14, move);
  // tilt-to-beds
  const tilt = rampIO(t, 20.55, 0.75);
  const cardO = cl(un * 1.4, 0, 1) * (1 - rampL(t, 20.9, 0.4));
  const furrow = ramp(t, 20.9, 0.5);
  const hours = ['9:00', '10:00', '11:00', '12:00'];
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: left, top: top, width: W, height: H, opacity: cardO, transform: 'perspective(1400px) rotateX(' + tilt * 74 + 'deg) translateY(' + tilt * 240 + 'px) scale(' + (un * (1 - tilt * 0.25)) + ')', transformOrigin: '50% 100%', zIndex: 6 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 50px rgba(60,52,38,0.16)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 10px' }}>
            <div><Kicker>Calendar</Kicker><div style={{ fontFamily: F.disp, fontSize: 27, fontWeight: 500, color: C.ink, marginTop: 3 }}>Friday morning</div></div>
            {/* the task chip (docked until grabbed) */}
            <div style={{ opacity: held || drop > 0 ? 0.3 : 1, border: '1px dashed ' + (held ? C.lineSolid : 'transparent'), borderRadius: 4 }}>
              <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 1px 2px rgba(60,52,38,0.12)', padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10, opacity: held || drop > 0 ? 0.35 : 1 }}>
                <Box size={16} />
                <div>
                  <div style={{ fontSize: 13.5, color: C.ink }}>Plan the forecasting logic</div>
                  <Kicker style={{ fontSize: 8.5 }}>● Forecasting · 2h</Kicker>
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: '4px 28px 0' }}>
            {hours.map((hh, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', height: 92, borderTop: '1px dashed ' + C.lineDashed, padding: '6px 0' }}>
                <span style={{ width: 58, fontFamily: F.mono, fontSize: 11.5, color: C.faint }}>{hh}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', left: 116, top: 205, right: 40, height: 170, background: 'rgba(168,160,190,0.25)', border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, padding: '11px 15px', opacity: drop, transform: 'scale(' + lerp(0.96, 1, drop) + ')', transformOrigin: '50% 15%' }}>
              <div style={{ fontSize: 14.5, color: C.ink, fontWeight: 500 }}>Deep work — Forecasting</div>
              <Kicker color={C.lavender} style={{ fontSize: 9.5 }}>9:00 – 11:00</Kicker>
            </div>
          </div>
        </div>
      </div>
      {held && (
        <div style={{ position: 'absolute', left: gx, top: gy, width: 260, background: C.parchment, border: '1px solid ' + C.lavender, borderRadius: 4, boxShadow: '0 14px 30px rgba(60,52,38,0.28)', padding: '11px 13px', transform: 'rotate(-2.5deg) scale(1.04)', zIndex: 45, opacity: 1 - drop }}>
          <div style={{ fontSize: 13.5, color: C.ink }}>Plan the forecasting logic</div>
          <Kicker style={{ fontSize: 8.5 }}>drop to schedule</Kicker>
        </div>
      )}
      {win(t, 17.5, 20.4, 0.3, 0.4) > 0 && <Cursor x={cx} y={cy} down={held} o={win(t, 17.5, 20.4, 0.3, 0.4)} />}
      {/* furrows the card tilted into */}
      {furrow > 0 && [0, 1, 2].map(i => (
        <div key={i} style={{ position: 'absolute', left: 3880, top: SOIL - 26 + i * 12, width: 250 * furrow, borderTop: '2px dashed rgba(122,116,95,0.5)', transform: 'rotate(-1deg)' }} />
      ))}
      {plant}
    </React.Fragment>
  );
}

// ═══ 4 — CULTIVATE (midday): the streak vine climbs, camera cranes up ════════
function VineStation() {
  const t = useTime();
  const A0 = 23.2;
  if (t < A0 - 0.2) return null;
  const stages = ['vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png'];
  const marks = [23.2, 24.1, 25.1, 26.1];
  const growP = rampIO(t, A0, 3.3);
  const vh = lerp(300, 660, growP);
  const uiO = win(t, 23.6, 27.6, 0.5, 0.5);
  const streak = Math.round(lerp(1, 30, rampIO(t, 23.6, 3.1)));
  const dots = 7; const filled = Math.round(lerp(0, dots, rampIO(t, 23.6, 3.0)));
  const items = [['Check email', 24.3], ['Journal entry', 25.1], ['Plan tomorrow', 25.9]];
  const labO = ramp(t, 27.0, 0.6);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 5000, top: SOIL + 2 }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) rotate(' + 1.1 * Math.sin(t * 0.8) + 'deg)', transformOrigin: '50% 100%' }}>
          {stages.map((src, i) => {
            const nxt = marks[i + 1] != null ? marks[i + 1] : 1e9;
            let op = i === stages.length - 1 ? rampL(t, marks[i], 0.55) : rampL(t, marks[i], 0.5) * (1 - rampL(t, nxt, 0.5));
            if (i === 0) op = ramp(t, A0 - 0.2, 0.4) * (1 - rampL(t, marks[1], 0.5));
            return <Leafy key={i} src={src} style={{ position: 'absolute', bottom: 0, left: '50%', height: vh, transform: 'translateX(-50%)', opacity: cl(op, 0, 1) }} />;
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, top: 14, transform: 'translateX(-50%)', opacity: labO, whiteSpace: 'nowrap' }}>
          <Kicker style={{ fontSize: 10.5 }}>04 · Routines</Kicker>
        </div>
      </div>
      {/* streak readout */}
      <div style={{ position: 'absolute', left: 5205, top: 430, opacity: uiO, transform: 'translateY(' + lerp(16, 0, ramp(t, 23.6, 0.6)) + 'px)' }}>
        <Kicker style={{ fontSize: 11 }}>Streak</Kicker>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <span style={{ fontFamily: F.disp, fontSize: 96, fontWeight: 600, color: C.sageText, lineHeight: 1 }}>{streak}</span>
          <span style={{ fontFamily: F.disp, fontSize: 24, color: C.muted }}>days</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {Array.from({ length: dots }).map((_, i) => (
            <span key={i} style={{ width: 17, height: 17, borderRadius: '50%', background: i < filled ? C.sage : 'transparent', border: '1.5px solid ' + (i < filled ? C.sage : C.lineSolid) }} />
          ))}
        </div>
      </div>
      {/* morning ritual chip */}
      <div style={{ position: 'absolute', left: 4530, top: 600, width: 270, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 8px 18px rgba(60,52,38,0.1)', padding: '14px 18px', opacity: uiO, transform: 'rotate(-0.6deg)' }}>
        <Kicker style={{ fontSize: 9.5 }}>Morning ritual</Kicker>
        <div style={{ marginTop: 6 }}>
          {items.map(([x, at], i) => {
            const on = rampL(t, at, 0.3) > 0.5;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0', borderTop: i ? '1px dashed ' + C.lineDashed : 'none' }}>
                <Box done={on} size={16} />
                <span style={{ fontSize: 14, color: on ? C.hairline : C.ink, textDecoration: on ? 'line-through' : 'none' }}>{x}</span>
              </div>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

// ═══ 5 — REVIEW (6:45 PM): the weekly letter → fern stays ════════════════════
function ReviewStation() {
  const t = useTime();
  const A0 = 29.1;
  if (t < A0 - 0.2) return null;
  const envIn = rampExpo(t, A0, 0.55);
  const rise = rampIO(t, 29.75, 1.05);
  const sink = rampIO(t, 32.35, 0.6);
  const gone = 1 - rampL(t, 32.55, 0.45);
  const letterTop = lerp(SOIL - 240, SOIL - 585, rise) + sink * 200;
  const content = ramp(t, 30.5, 0.5);
  const fmark = [30.4, 31.0, 31.5, 32.0];
  const fstages = ['fern/coil.png', 'fern/unfurl1.png', 'fern/unfurl2.png', 'fern/full.png'];
  const write = rampL(t, 31.15, 0.95);
  const handText = 'a good week. ✿';
  const shown = handText.slice(0, Math.round(write * handText.length));
  const ex = 5950;
  return (
    <React.Fragment>
      {gone > 0 && (
        <div style={{ position: 'absolute', left: ex, top: 0, opacity: envIn * gone }}>
          {/* the letter */}
          <div style={{ position: 'absolute', left: 0, top: letterTop, transform: 'translateX(-50%)', width: 430, zIndex: 1 }}>
            <div style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: '4px 4px 2px 2px', boxShadow: '0 2px 6px rgba(60,52,38,0.14),0 18px 40px rgba(60,52,38,0.18)', padding: '24px 28px 20px', minHeight: 330 }}>
              <Kicker color={C.bcText} style={{ fontSize: 10 }}>Weekly letter · Wk 27</Kicker>
              <div style={{ fontFamily: F.disp, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 8, opacity: content }}>Dear Kai,</div>
              <div style={{ marginTop: 8, opacity: content }}>
                {['23 tasks closed, streak intact.', 'Forecasting climbed to 60%.'].map((x, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, padding: '6px 0', fontSize: 14.5, color: C.muted, lineHeight: 1.4 }}><span style={{ color: C.sage }}>—</span>{x}</div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontFamily: F.hand, fontSize: 27, color: C.terra, minHeight: 36 }}>{shown}<span style={{ opacity: write > 0 && write < 1 ? (Math.sin(t * 9) > 0 ? 1 : 0) : 0 }}>|</span></div>
            </div>
          </div>
          {/* the envelope pocket */}
          <div style={{ position: 'absolute', left: 0, top: SOIL - 320, transform: 'translateX(-50%)', width: 470, zIndex: 2 }}>
            <Leafy src="envelope/back-open-full.png" style={{ width: 470 }} />
            <div style={{ position: 'absolute', left: '50%', top: -16, transform: 'translateX(-50%)' }}>
              <Leafy src={rise > 0.3 ? 'seal/broken-left.png' : 'seal/intact.png'} style={{ height: 52 }} />
            </div>
          </div>
        </div>
      )}
      <PlantSpot x={6180} at={30.4} src="fern/coil.png" h={0} num="" label="" />
      {/* fern unfurls beside the envelope and stays */}
      <div style={{ position: 'absolute', left: 6180, top: SOIL + 2 }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) rotate(' + 1.2 * Math.sin(t * 0.85 + 2) + 'deg)', transformOrigin: '50% 100%' }}>
          {fstages.map((src, i) => {
            const nxt = fmark[i + 1] != null ? fmark[i + 1] : 1e9;
            let op = i === fstages.length - 1 ? rampL(t, fmark[i], 0.45) : rampL(t, fmark[i], 0.4) * (1 - rampL(t, nxt, 0.4));
            if (i === 0) op = ramp(t, fmark[0] - 0.15, 0.35) * (1 - rampL(t, fmark[1], 0.4));
            return <Leafy key={i} src={src} style={{ position: 'absolute', bottom: 0, left: '50%', height: 295, transform: 'translateX(-50%)', opacity: cl(op, 0, 1) }} />;
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, top: 14, transform: 'translateX(-50%)', opacity: ramp(t, 32.2, 0.6), whiteSpace: 'nowrap' }}>
          <Kicker style={{ fontSize: 10.5 }}>05 · Review</Kicker>
        </div>
      </div>
    </React.Fragment>
  );
}

// ── night sky layer (above the veil) ─────────────────────────────────────────
const STARS = Array.from({ length: 46 }).map((_, i) => ({
  x: 700 + (i * 137.5) % 5600, y: -1250 + (i * 89.7) % 1520, s: 2 + (i % 3), p: i * 0.7,
}));
const FLIES = Array.from({ length: 10 }).map((_, i) => ({
  x: 1250 + i * 512, y: 690 + (i * 67) % 240, p: i * 1.3,
}));
const nightPf = interpolate([33.4, 35.6], [0, 1]);
function NightLayer() {
  const t = useTime();
  const p = nightPf(t);
  if (p <= 0.01) return null;
  const moonY = interpolate([33.8, 36.2], [-60, -560], E.easeOutCubic)(t);
  const moonO = rampL(t, 33.9, 1.2);
  return (
    <React.Fragment>
      {STARS.map((st, i) => (
        <div key={i} style={{ position: 'absolute', left: st.x, top: st.y, width: st.s * 2.4, height: st.s * 2.4, borderRadius: '50%', background: 'rgba(255,250,230,0.95)', boxShadow: '0 0 8px rgba(255,250,230,0.7)', opacity: p * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + st.p))) }} />
      ))}
      {/* moon */}
      <div style={{ position: 'absolute', left: 4870, top: moonY, transform: 'translate(-50%,-50%)', opacity: p * moonO }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 620, height: 620, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,235,221,0.22) 0%, rgba(240,235,221,0) 60%)' }} />
        <div style={{ position: 'relative', width: 150, height: 150 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#F0EBDD', boxShadow: '0 0 50px rgba(240,235,221,0.55)' }} />
          <div style={{ position: 'absolute', left: -34, top: -20, width: 150, height: 150, borderRadius: '50%', background: '#3A3450', opacity: 0.92 }} />
        </div>
      </div>
      {/* fireflies near the garden row */}
      {FLIES.map((f, i) => {
        const dx = 44 * Math.sin(t * 0.7 + f.p), dy = 30 * Math.sin(t * 1.1 + f.p * 2);
        return <div key={'f' + i} style={{ position: 'absolute', left: f.x + dx, top: f.y + dy, width: 7, height: 7, borderRadius: '50%', background: N.firefly, boxShadow: '0 0 14px rgba(246,226,140,0.9), 0 0 30px rgba(246,226,140,0.4)', opacity: p * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.8 + f.p))) }} />;
      })}
      {/* soft lantern glows behind each plant */}
      {[900, 2000, 3050, 4100, 5000, 6180].map((x, i) => (
        <div key={'g' + i} style={{ position: 'absolute', left: x, top: SOIL - 170, width: 420, height: 420, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(246,226,140,0.13) 0%, rgba(246,226,140,0) 62%)', opacity: p }} />
      ))}
    </React.Fragment>
  );
}

// ── screen-space light: dawn tint, dusk tint, night veil ─────────────────────
const dawnOf = interpolate([0, 1.2, 5.2, 7.2], [0.15, 0.15, 0.15, 0]);
const duskOf = interpolate([26, 29.2, 33.2, 35.6], [0, 0.13, 0.2, 0]);
const veilOf = interpolate([33.3, 35.7, 38.2, 39.6], [0, 0.56, 0.56, 0.82]);
function LightGrade() {
  const t = useTime();
  const dawn = dawnOf(t), dusk = duskOf(t), veil = veilOf(t);
  return (
    <React.Fragment>
      {dawn > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#E2A87A', mixBlendMode: 'multiply', opacity: dawn, pointerEvents: 'none', zIndex: 40 }} />}
      {dusk > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#C9803F', mixBlendMode: 'multiply', opacity: dusk, pointerEvents: 'none', zIndex: 40 }} />}
      {veil > 0.01 && <div style={{ position: 'absolute', inset: 0, background: N.page, opacity: veil, pointerEvents: 'none', zIndex: 41 }} />}
    </React.Fragment>
  );
}

// ═══ ENDING (screen-space, over the night garden) ════════════════════════════
const YOUR = 'Your';
function Ending() {
  const t = useTime();
  if (t < 38.2) return null;
  const lt = t - 38.2;
  const p1o = ramp(lt, 0.25, 0.45) * (1 - rampL(lt, 1.55, 0.4));
  const markIn = rampExpo(lt, 2.0, 0.55);
  const logoIn = rampBack(lt, 2.1, 0.65);
  const strike = rampIO(lt, 2.85, 0.4);
  const kaisO = 1 - rampL(lt, 3.25, 0.4);
  const writeP = rampL(lt, 3.6, 1.25);
  const penO = ramp(lt, 3.62, 0.18) * (1 - rampL(lt, 4.72, 0.25));
  const penX = writeP * 214;
  const signOff = ramp(lt, 4.7, 0.6);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      {p1o > 0.01 && (
        <div style={{ position: 'absolute', left: '50%', top: 470, transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: p1o }}>
          <div style={{ fontFamily: F.disp, fontSize: 66, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Plant your first seed.</div>
        </div>
      )}
      {markIn > 0.01 && (
        <React.Fragment>
          <div style={{ position: 'absolute', left: '50%', top: 330, transform: 'translate(-50%,-50%) scale(' + cl(logoIn, 0, 1.2) + ')', opacity: cl(logoIn, 0, 1) }}>
            <LeafLogo size={100} glow />
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 540, transform: 'translate(-50%,-50%) translateY(' + lerp(18, 0, markIn) + 'px)', opacity: markIn, display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ fontFamily: F.disp, fontSize: 100, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em', opacity: kaisO }}>Kai’s</span>
              <div style={{ position: 'absolute', left: -8, right: -8, top: '52%', height: 7, background: N.accent, borderRadius: 4, transform: 'rotate(-1.5deg) scaleX(' + strike + ')', transformOrigin: 'left center', opacity: kaisO }} />
              <div style={{ position: 'absolute', left: '50%', top: '-30%', transform: 'translateX(-50%)' }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'pre' }}>
                  {YOUR.split('').map((ch, i) => {
                    const lp = cl(writeP * YOUR.length - i, 0, 1);
                    const ez = E.easeOutBack(lp);
                    return <span key={i} style={{ fontFamily: F.hand, fontSize: 126, fontWeight: 600, color: N.gold, textShadow: '0 0 26px rgba(228,195,107,0.35)', opacity: cl(lp * 1.6, 0, 1), display: 'inline-block', transformOrigin: '50% 92%', transform: 'translateY(' + (1 - ez) * 16 + 'px) rotate(' + (1 - lp) * -7 + 'deg) scale(' + lerp(0.55, 1, ez) + ')' }}>{ch}</span>;
                  })}
                  <div style={{ position: 'absolute', left: penX - 6, top: -64, opacity: penO, transform: 'rotate(' + (5 + 2 * Math.sin(lt * 22)) + 'deg)', transformOrigin: '10% 92%' }}>
                    <Leafy src="tools/pen.png" style={{ height: 146, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }} />
                  </div>
                </div>
              </div>
            </div>
            <span style={{ fontFamily: F.disp, fontSize: 100, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em' }}>Flow</span>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 672, transform: 'translateX(-50%)', opacity: signOff }}>
            <Kicker color={N.faint} style={{ fontSize: 13.5, letterSpacing: '0.28em' }}>Pressed &amp; kept, one day at a time</Kicker>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── overlays ─────────────────────────────────────────────────────────────────
function Grain() {
  return <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 55 }} />;
}
function Vignette() {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 56, background: 'radial-gradient(125% 125% at 50% 42%, transparent 56%, rgba(40,34,26,0.15) 100%)' }} />;
}
function Preload() {
  const all = ['clover/seedling.png', 'clover/four_leaf.png', 'hydrangea/light.png', 'cherry/bloom.png', 'daisy/midday.png', 'vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png', 'fern/coil.png', 'fern/unfurl1.png', 'fern/unfurl2.png', 'fern/full.png', 'envelope/back-open-full.png', 'seal/intact.png', 'seal/broken-left.png', 'tools/pen.png'];
  return <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>{all.map((s, i) => <img key={i} src={A + s} alt="" />)}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
function IntroVideo() {
  return (
    <Stage width={1920} height={1080} duration={DURATION} background={C.linen} persistKey="kaisflow-intro-v2">
      <Preload />
      <CamLayer z={1}>
        <Sun />
        <Ground />
        <OpenStation />
        <CaptureStation />
        <PlanStation />
        <SchedStation />
        <VineStation />
        <ReviewStation />
      </CamLayer>
      <LightGrade />
      <CamLayer z={42}>
        <NightLayer />
      </CamLayer>
      <Caption start={5.8} end={9.4} num="01" time="7:04 AM" word="Capture." sub="voice or text, from anywhere" />
      <Caption start={11.9} end={15.3} num="02" time="8:30 AM" word="Plan." sub="three things that matter" />
      <Caption start={17.9} end={21.3} num="03" time="9:12 AM" word="Schedule." sub="every task gets a time" />
      <Caption start={23.9} end={27.5} num="04" time="Midday" word="Cultivate." sub="a little, every day" />
      <Caption start={29.9} end={32.9} num="05" time="6:45 PM" word="Review." sub="a letter, once a week" />
      <Caption start={35.6} end={38.0} num="06" time="Night" word="It adds up." sub="however you work" light />
      <Ending />
      <Grain />
      <Vignette />
    </Stage>
  );
}
window.IntroVideo = IntroVideo;
