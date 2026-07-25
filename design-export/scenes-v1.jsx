// Kai's Flow — landing-page intro video.
// Scenes composed on the animations.jsx timeline engine (globals on window).
// Plant -> Cultivate -> Yours.  16:9, ~36s, cinematic cut.

const { Stage, useTime, Easing: E, clamp: cl } = window;

// ── palette (from ds/tokens) ────────────────────────────────────────────────
const C = {
  linen: '#EFE9DB', parchment: '#FBF6E9', bone: '#F6F0E1', sidebar: '#EAE3D2', goal: '#F8EFD3',
  ink: '#2a2420', muted: '#6b6455', faint: '#8b8471', hairline: '#a49d87',
  lineSolid: '#cfc7b0', lineDashed: '#d5cdb5', lineCard: '#e0d8c2', lineGoal: '#dcc48e', lineSide: '#c9c1aa',
  sage: '#8A9A7E', moss: '#7A946E', terra: '#B5654A', blossom: '#D4A8B0', lavender: '#A8A0BE',
  hydrangea: '#9AB4BE', buttercream: '#D4C78A', clover: '#C9A0A0', gold: '#9a7b3a', goldWarm: '#C9A55A',
  sageText: '#4d6650', bcText: '#9a8b52',
};
const NIGHT = {
  page: '#211D30', card: '#262233', side: '#1C1929', ink: '#F0EBDD', muted: '#C9C0D8',
  faint: '#8E88A0', line: 'rgba(240,235,221,0.14)', accent: '#E29473', gold: '#E4C36B', firefly: '#F6E28C',
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

// ── math helpers (plain fns, never hooks) ────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (lt, t0, d) => E.easeOutCubic(cl((lt - t0) / d, 0, 1));
const rampL = (lt, t0, d) => cl((lt - t0) / d, 0, 1);
const rampIO = (lt, t0, d) => E.easeInOutCubic(cl((lt - t0) / d, 0, 1));
const rampBack = (lt, t0, d) => E.easeOutBack(cl((lt - t0) / d, 0, 1));
const rampExpo = (lt, t0, d) => E.easeOutExpo(cl((lt - t0) / d, 0, 1));
function env(lt, dur, fin, fout) {
  fin = fin == null ? 0.4 : fin; fout = fout == null ? 0.45 : fout;
  if (lt < 0 || lt > dur) return 0;
  let o = 1;
  if (lt < fin) o = lt / fin;
  else if (lt > dur - fout) o = (dur - lt) / fout;
  return E.easeInOutSine(cl(o, 0, 1));
}

// ── scene windows (faster cut) ───────────────────────────────────────────────
const T = {
  open:    [0.0, 2.8],
  capture: [2.8, 7.0],
  plan:    [7.0, 11.0],
  sched:   [11.0, 15.0],
  vine:    [15.0, 19.4],
  review:  [19.4, 23.6],
  garden:  [23.6, 27.2],
  yours:   [27.2, 30.6],
  end:     [30.6, 36.0],
};
const DURATION = 36.0;

// ── tiny atoms ───────────────────────────────────────────────────────────────
function Leafy({ src, style }) {
  return <img src={A + src} alt="" draggable={false}
    style={{ filter: DROP, display: 'block', ...style }} />;
}
function Kicker({ children, color, style }) {
  return <span style={{
    fontFamily: F.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase',
    color: color || C.faint, whiteSpace: 'nowrap', ...style,
  }}>{children}</span>;
}
function Dash({ color }) {
  return <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + (color || C.lineDashed) }} />;
}
function Box({ done, size, color }) {
  size = size || 20;
  return done
    ? <span style={{ width: size, height: size, borderRadius: 5, background: color || C.ink, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.parchment, fontSize: size * 0.6 }}>✓</span>
    : <span style={{ width: size, height: size, borderRadius: 5, border: '1.5px solid ' + (color || '#bfb8a3'), flex: 'none' }} />;
}

// ── caption (bottom-left, one per beat) ──────────────────────────────────────
function Caption({ start, end, num, kicker, line }) {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.05) return null;
  const lt = t - start, dur = end - start, fin = 0.42, fout = 0.4;
  let o = 1, ty = 0;
  if (lt < fin) { const e = E.easeOutCubic(cl(lt / fin, 0, 1)); o = e; ty = (1 - e) * 18; }
  else if (lt > dur - fout) { const e = E.easeInCubic(cl((lt - (dur - fout)) / fout, 0, 1)); o = 1 - e; ty = -e * 8; }
  return (
    <div style={{ position: 'absolute', left: 132, bottom: 108, opacity: o, transform: 'translateY(' + ty + 'px)', maxWidth: 920, zIndex: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, width: 360 }}>
        <Kicker style={{ fontSize: 14 }}>{num} · {kicker}</Kicker>
        <Dash />
      </div>
      <div style={{ fontFamily: F.disp, fontSize: 60, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.02, textWrap: 'balance' }}>{line}</div>
    </div>
  );
}

// ── leaf logo mark ───────────────────────────────────────────────────────────
function LeafLogo({ size }) {
  size = size || 110;
  const h = size * 1.2;
  return (
    <svg width={size} height={h} viewBox="0 0 100 120" style={{ display: 'block', overflow: 'visible' }}>
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

// ── cursor ───────────────────────────────────────────────────────────────────
function Cursor({ x, y, down }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 50, transform: 'translate(-3px,-2px) scale(' + (down ? 0.9 : 1) + ')', filter: 'drop-shadow(0 3px 4px rgba(60,52,38,0.35))' }}>
      <svg width="30" height="38" viewBox="0 0 24 30"><path d="M2 2 L2 22 L7 17.5 L10.5 26 L14 24.3 L10.5 16 L17 16 Z" fill="#2a2420" stroke="#FBF6E9" strokeWidth="1.4" strokeLinejoin="round" /></svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 0 — COLD OPEN : a seed, planted
// ═══════════════════════════════════════════════════════════════════════════
function SceneOpen() {
  const t = useTime(); const [s, e] = T.open; if (t < s || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur, 0.5, 0.5);
  const baseY = 606;
  const fall = E.easeInQuad(cl((lt - 0.1) / 0.55, 0, 1));
  const seedY = lerp(300, baseY, fall);
  const seedO = fall < 1 ? 1 : (1 - rampL(lt, 0.7, 0.3));
  const grow = rampBack(lt, 0.65, 0.85);
  const soilO = ramp(lt, 0.45, 0.4) * (1 - rampL(lt, dur - 0.5, 0.5));
  const textO = ramp(lt, 1.0, 0.5) * (1 - rampL(lt, dur - 0.5, 0.5));
  const cam = 1 + 0.05 * rampIO(lt, 0.2, dur);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, transform: 'scale(' + cam + ')', transformOrigin: '50% 56%' }}>
      <div style={{ position: 'absolute', left: '50%', top: baseY + 4, width: 300, height: 1, transform: 'translateX(-50%)', borderBottom: '1px dashed ' + C.lineDashed, opacity: soilO }} />
      <div style={{ position: 'absolute', left: '50%', top: seedY, width: 20, height: 26, transform: 'translate(-50%,-50%)', background: C.ink, borderRadius: '50% 50% 46% 46%', opacity: seedO }} />
      <div style={{ position: 'absolute', left: '50%', top: baseY, transform: 'translate(-50%,-100%) scale(' + grow + ')', transformOrigin: '50% 100%', opacity: cl(grow, 0, 1) }}>
        <Leafy src="clover/seedling.png" style={{ height: 176 }} />
      </div>
      <div style={{ position: 'absolute', left: '50%', top: baseY + 44, transform: 'translateX(-50%)', textAlign: 'center', opacity: textO }}>
        <div style={{ fontFamily: F.disp, fontSize: 46, fontWeight: 500, color: C.ink, letterSpacing: '-0.015em' }}>Every day starts as a seed.</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 1 — CAPTURE
// ═══════════════════════════════════════════════════════════════════════════
function Phone({ lt }) {
  const inp = rampExpo(lt, 0.0, 0.5);
  const listen = rampL(lt, 0.5, 0.35);
  const line = ramp(lt, 0.9, 0.5);
  const lift = rampL(lt, 1.95, 0.35);
  const W = 320, H = 660;
  const pulse = 1 + 0.06 * Math.sin(lt * 5.0);
  return (
    <div style={{ position: 'absolute', left: 560, top: 540, transform: 'translate(-50%,-50%) translateX(' + lerp(-70, 0, inp) + 'px)', opacity: inp, zIndex: 10 }}>
      <div style={{ width: W, height: H, background: '#211d18', borderRadius: 46, padding: 11, boxShadow: '0 30px 70px rgba(60,52,38,0.34)' }}>
        <div style={{ width: '100%', height: '100%', background: C.linen, borderRadius: 36, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 5 }} />
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 96, height: 28, background: '#0d0b09', borderRadius: 16, zIndex: 6 }} />
          <div style={{ height: 46, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 5px', fontFamily: F.mono, fontSize: 12, color: C.ink }}>
            <span>9:41</span><span style={{ letterSpacing: 2 }}>▪▪▪ ⏽</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 22px 0' }}>
            <Kicker style={{ fontSize: 10 }}>Quick capture</Kicker>
            <div style={{ position: 'relative', marginTop: 40, width: 132, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => {
                const p = ((lt * 0.6 + i / 3) % 1);
                return <div key={i} style={{ position: 'absolute', width: 92, height: 92, borderRadius: '50%', border: '2px solid ' + C.terra, opacity: (1 - p) * 0.5 * listen, transform: 'scale(' + (1 + p * 0.9) + ')' }} />;
              })}
              <div style={{ width: 92, height: 92, borderRadius: '50%', background: C.terra, boxShadow: '0 8px 20px rgba(120,60,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(' + pulse + ')' }}>
                <svg width="34" height="36" viewBox="0 0 24 24" fill="none"><rect x="9" y="2.5" width="6" height="11.5" rx="3" fill={C.parchment} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" stroke={C.parchment} strokeWidth="1.8" strokeLinecap="round" /></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, marginTop: 22, opacity: listen * (1 - line * 0.4) }}>
              {[10, 18, 26, 14, 22, 8, 16, 24, 12, 20, 9].map((base, i) => {
                const hgt = base + Math.abs(Math.sin(lt * 3 + i)) * 16;
                return <span key={i} style={{ width: 4, height: hgt, borderRadius: 2, background: C.terra, opacity: 0.55 }} />;
              })}
            </div>
            <div style={{ marginTop: 20, width: '100%', opacity: line * (1 - lift), transform: 'translateY(' + (-lift * 26) + 'px) scale(' + (1 - lift * 0.12) + ')' }}>
              <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 12, boxShadow: '0 1px 2px rgba(60,52,38,0.14)', padding: '13px 15px' }}>
                <div style={{ fontSize: 15.5, color: C.ink, lineHeight: 1.35 }}>Try the pricing model on the Cairo cohort first</div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.hydrangea }} />
                  <Kicker style={{ fontSize: 9.5 }}>→ Inbox</Kicker>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function SceneCapture() {
  const t = useTime(); const [s, e] = T.capture; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur);
  const cardIn = rampExpo(lt, 0.35, 0.55);
  const flyP = rampIO(lt, 2.05, 0.9);
  const landed = rampL(lt, 2.9, 0.35);
  const count = flyP > 0.95 ? 3 : 2;
  const bump = landed > 0 ? 1 + 0.12 * Math.sin(cl(landed, 0, 1) * Math.PI) : 1;
  const sx = lerp(560, 1360, flyP);
  const sy = lerp(430, 470, flyP) - Math.sin(flyP * Math.PI) * 150;
  const flying = flyP > 0.02 && flyP < 0.99;
  const cam = 1 + 0.03 * rampIO(lt, 0, dur);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, transform: 'scale(' + cam + ')', transformOrigin: '46% 52%' }}>
      <Phone lt={lt} />
      <div style={{ position: 'absolute', left: 1160, top: 300, width: 470, opacity: cardIn, transform: 'translate(' + lerp(46, 0, cardIn) + 'px,' + lerp(20, 0, cardIn) + 'px) scale(' + bump + ')', transformOrigin: '50% 40%' }}>
        <div style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 20px 44px rgba(60,52,38,0.14)', padding: '26px 30px 30px', transform: 'rotate(-0.4deg)' }}>
          <div style={{ position: 'absolute', top: -11, left: 40, width: 78, height: 20, background: 'rgba(154,180,190,0.5)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Kicker>Inbox</Kicker>
              <div style={{ fontFamily: F.disp, fontSize: 34, fontWeight: 500, color: C.ink, marginTop: 4 }}>To triage</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: F.mono, fontSize: 26, color: C.terra }}>{count}</span>
              <Leafy src="hydrangea/light.png" style={{ height: 92 }} />
            </div>
          </div>
          <div style={{ borderTop: '1px dashed ' + C.lineDashed, marginTop: 16, paddingTop: 6 }}>
            {['Reply to Omar about the deck', 'Book the venue for Shaheen'].map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '1px dashed ' + C.lineDashed }}>
                <Box /><span style={{ fontSize: 15, color: C.ink }}>{x}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', opacity: landed, transform: 'translateX(' + lerp(-10, 0, landed) + 'px)' }}>
              <Box color={C.hydrangea} /><span style={{ fontSize: 15, color: C.ink }}>Try the pricing model on the Cairo cohort</span>
            </div>
          </div>
        </div>
      </div>
      {flying && (
        <div style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%,-50%) rotate(' + flyP * 220 + 'deg)', zIndex: 30 }}>
          <Leafy src="clover/seedling.png" style={{ height: 40 }} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 2 — PLAN
// ═══════════════════════════════════════════════════════════════════════════
function MiniNav({ active }) {
  const items = [['Today', C.sage], ['Inbox', C.hydrangea], ['Tasks', C.blossom], ['Calendar', C.lavender]];
  const cult = [['Routines', C.moss], ['Review', C.buttercream]];
  const row = (label, col, on) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', borderRadius: 6, background: on ? C.parchment : 'transparent', border: on ? '1px solid ' + C.lineCard : '1px solid transparent' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: col }} />
      <span style={{ fontSize: 14.5, color: on ? C.ink : C.muted, fontWeight: on ? 600 : 400 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ width: 210, flex: 'none', background: C.sidebar, borderRight: '1px solid ' + C.lineSide, padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ padding: '0 12px 16px' }}>
        <div style={{ fontFamily: F.disp, fontSize: 19, fontWeight: 600, color: C.ink }}>✿ Field Journal</div>
      </div>
      <Kicker style={{ fontSize: 9.5, padding: '4px 12px' }}>Plan</Kicker>
      {items.map(([l, c]) => row(l, c, l === active))}
      <Kicker style={{ fontSize: 9.5, padding: '12px 12px 4px' }}>Cultivate</Kicker>
      {cult.map(([l, c]) => row(l, c, l === active))}
    </div>
  );
}
function ScenePlan() {
  const t = useTime(); const [s, e] = T.plan; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur);
  const inn = rampExpo(lt, 0.0, 0.55);
  const push = 1 + 0.12 * rampIO(lt, 0.35, dur - 0.8);
  const goalIn = rampBack(lt, 0.75, 0.6);
  const check = rampL(lt, 2.05, 0.4);
  const petal = rampL(lt, 2.35, 1.0);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) translateY(' + lerp(28, 0, inn) + 'px) scale(' + push + ')', transformOrigin: '44% 62%', opacity: inn }}>
        <div style={{ width: 1240, height: 800, background: C.linen, border: '1px solid ' + C.lineSolid, borderRadius: 8, boxShadow: '0 30px 80px rgba(60,52,38,0.22)', overflow: 'hidden', display: 'flex', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 40 }} />
          <MiniNav active="Today" />
          <div style={{ flex: 1, padding: '30px 40px' }}>
            <div style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 3, boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 5px 12px rgba(60,52,38,0.08)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 22, marginBottom: 24, transform: 'rotate(-0.3deg)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                <Leafy src="cherry/bloom.png" style={{ height: 56 }} />
                <Leafy src="hydrangea/light.png" style={{ height: 52 }} />
                <Leafy src="vine/sprouting.png" style={{ height: 50 }} />
              </div>
              <div style={{ flex: 1 }}>
                <Kicker style={{ fontSize: 10 }}>The terrarium · Day 42</Kicker>
                <div style={{ fontFamily: F.hand, fontSize: 20, color: '#7a745f', marginTop: 2 }}>pressed &amp; kept, one day at a time</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Kicker>Today</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: 46, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 6 }}>Friday, July 10</div>
              </div>
              <div style={{ background: C.terra, color: C.parchment, fontSize: 14, padding: '11px 18px', borderRadius: 999, boxShadow: '0 2px 4px rgba(120,60,40,0.3)', display: 'flex', alignItems: 'center', gap: 9 }}>
                <svg width="15" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="2.5" width="6" height="11.5" rx="3" fill={C.parchment} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" stroke={C.parchment} strokeWidth="1.8" strokeLinecap="round" /></svg>
                Voice capture
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '26px 0 16px' }}><Kicker>Top 3 for today</Kicker><Dash /></div>
            <div style={{ position: 'relative', background: C.goal, border: '1px solid ' + C.lineGoal, boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 8px 20px rgba(154,123,58,0.16)', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, transform: 'rotate(-0.4deg) scale(' + lerp(0.98, 1, goalIn) + ')', borderRadius: 3, marginBottom: 10, opacity: goalIn }}>
              <div style={{ position: 'absolute', top: -10, left: '50%', width: 84, height: 19, marginLeft: -42, background: 'rgba(201,165,90,0.44)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-1.5deg)', borderRadius: 1 }} />
              <span style={{ width: 22, height: 22, border: '1.5px solid ' + C.gold, borderRadius: 5, flex: 'none', marginTop: 20, background: 'rgba(255,255,255,0.5)' }} />
              <div style={{ flex: 1 }}>
                <Kicker color={C.gold} style={{ fontSize: 10 }}>✶ Goal of the day</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: 25, fontWeight: 600, color: '#4a3a1e', lineHeight: 1.25, marginTop: 6 }}>Deliver the MVP of the forecasting app</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12 }}><Kicker color={C.gold} style={{ fontSize: 9.5 }}>● Forecasting App</Kicker><Kicker color={C.gold} style={{ fontSize: 9.5 }}>Due today</Kicker></div>
              </div>
              <div style={{ textAlign: 'center', flex: 'none' }}>
                <Leafy src="clover/four_leaf.png" style={{ width: 46 }} />
                <div style={{ fontFamily: F.hand, fontSize: 15, color: C.gold, marginTop: -2 }}>for luck</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 4px', borderBottom: '1px dashed ' + C.lineDashed, position: 'relative' }}>
              <Box done={check > 0.5} color={C.sage} size={19} />
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ fontSize: 16, color: check > 0.5 ? C.hairline : C.ink }}>Plan &amp; implement the forecasting logic</span>
                <span style={{ position: 'absolute', left: 0, top: '55%', height: 1.5, background: C.hairline, width: (check * 100) + '%', maxWidth: '100%' }} />
              </div>
              <span style={{ color: C.terra, fontSize: 17 }}>★</span>
              {petal > 0 && petal < 1 && (
                <div style={{ position: 'absolute', left: 6, top: 10, transform: 'translateY(' + petal * 60 + 'px) rotate(' + petal * 160 + 'deg)', opacity: 1 - petal }}>
                  <div style={{ width: 12, height: 14, background: C.blossom, borderRadius: '0 60% 0 60%' }} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 4px' }}>
              <Box size={19} /><span style={{ flex: 1, fontSize: 16, color: C.ink }}>Create official emails for Shaheen</span><span style={{ color: C.terra, fontSize: 17 }}>★</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 3 — SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════
function SceneSched() {
  const t = useTime(); const [s, e] = T.sched; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur);
  const inn = rampExpo(lt, 0.0, 0.5);
  const chipX = 470, chipY = 372, slotX = 1180, slotY = 470;
  const grab = rampL(lt, 1.0, 0.1);
  const move = rampIO(lt, 1.15, 0.95);
  const drop = rampL(lt, 2.15, 0.3);
  const held = grab > 0.5 && drop < 1;
  const cx = lt < 1.15 ? lerp(760, chipX, ramp(lt, 0.3, 0.75)) : lerp(chipX, slotX, move);
  const cy = lt < 1.15 ? lerp(640, chipY, ramp(lt, 0.3, 0.75)) : lerp(chipY, slotY, move);
  const ghostX = lerp(chipX, slotX, move), ghostY = lerp(chipY, slotY, move);
  const placed = drop;
  const hours = ['9', '10', '11', '12', '1'];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1320, height: 760, transform: 'translate(-50%,-50%) translateY(' + lerp(24, 0, inn) + 'px)', opacity: inn }}>
        <div style={{ position: 'absolute', right: 24, top: -6, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Leafy src="daisy/midday.png" style={{ height: 78, transform: 'rotate(' + (2 * Math.sin(lt * 1.1)) + 'deg)', transformOrigin: '50% 90%' }} />
          <div><Kicker style={{ fontSize: 11 }}>Calendar</Kicker><div style={{ fontFamily: F.disp, fontSize: 30, color: C.ink, fontWeight: 500 }}>Friday</div></div>
        </div>
        <div style={{ display: 'flex', gap: 40, marginTop: 84 }}>
          <div style={{ width: 420, flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}><Kicker>Unscheduled</Kicker><Dash /></div>
            {[['Plan & implement the forecasting logic', C.moss, true], ['Create official emails for Shaheen', C.blossom, false], ['Audit ads performance', C.buttercream, false]].map(([x, col, isDrag], i) => {
              const gone = isDrag && grab > 0.5;
              return (
                <div key={i} style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 3, boxShadow: '0 1px 2px rgba(60,52,38,0.12)', padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: gone ? 0.35 : 1, borderStyle: gone ? 'dashed' : 'solid' }}>
                  <Box size={18} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15.5, color: gone ? C.hairline : C.ink }}>{x}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} /><Kicker style={{ fontSize: 9 }}>30m</Kicker></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 6, boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 5px 12px rgba(60,52,38,0.08)', padding: '10px 0', position: 'relative', overflow: 'hidden' }}>
            {hours.map((hh, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', height: 116, borderTop: i ? '1px dashed ' + C.lineDashed : 'none', padding: '6px 20px' }}>
                <span style={{ width: 54, fontFamily: F.mono, fontSize: 12, color: C.faint }}>{hh}:00</span>
              </div>
            ))}
            <div style={{ position: 'absolute', left: 84, top: 20, right: 26, height: 214, background: 'rgba(168,160,190,0.24)', border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, padding: '12px 16px', opacity: placed, transform: 'scale(' + lerp(0.96, 1, placed) + ')', transformOrigin: '50% 20%' }}>
              <div style={{ fontSize: 15.5, color: C.ink, fontWeight: 500 }}>Deep work — Forecasting</div>
              <Kicker color={C.lavender} style={{ fontSize: 10 }}>9:00 – 11:00</Kicker>
            </div>
          </div>
        </div>
      </div>
      {held && (
        <div style={{ position: 'absolute', left: ghostX, top: ghostY, width: 300, background: C.parchment, border: '1px solid ' + C.lavender, borderRadius: 4, boxShadow: '0 14px 30px rgba(60,52,38,0.26)', padding: '13px 15px', transform: 'rotate(-2deg) scale(1.03)', zIndex: 45, opacity: 1 - drop }}>
          <div style={{ fontSize: 15, color: C.ink }}>Plan &amp; implement the forecasting logic</div>
          <Kicker style={{ fontSize: 9 }}>30m · drop to schedule</Kicker>
        </div>
      )}
      <Cursor x={cx} y={cy} down={held} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 4 — CULTIVATE : the streak vine grows (camera pushes up with it)
// ═══════════════════════════════════════════════════════════════════════════
function SceneVine() {
  const t = useTime(); const [s, e] = T.vine; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur, 0.4, 0.5);
  const inn = ramp(lt, 0.0, 0.45);
  const camG = rampIO(lt, 0.15, 3.6);
  const stages = ['vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png'];
  const marks = [0.15, 1.0, 2.0, 3.0];
  const vineGrow = rampIO(lt, 0.15, 3.4);
  const vh = lerp(360, 640, vineGrow);
  const streak = Math.round(lerp(1, 30, rampIO(lt, 0.4, 3.3)));
  const dots = 14; const filled = Math.round(lerp(0, dots, rampIO(lt, 0.4, 3.2)));
  const items = ['Check email', 'Journal entry', 'Move the body', 'Plan tomorrow'];
  const cardIn = rampExpo(lt, 0.3, 0.6);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, transform: 'translateY(' + (-16 * camG) + 'px) scale(' + (1 + 0.05 * camG) + ')', transformOrigin: '46% 74%' }}>
      <div style={{ position: 'absolute', left: 470, top: 1010, transform: 'translate(-50%,-100%)', opacity: inn }}>
        {stages.map((src, i) => {
          const next = marks[i + 1] != null ? marks[i + 1] : 99;
          let op = i === stages.length - 1 ? rampL(lt, marks[i], 0.6) : rampL(lt, marks[i], 0.5) * (1 - rampL(lt, next, 0.5));
          if (i === 0) op = 1 - rampL(lt, marks[1], 0.5);
          return <Leafy key={i} src={src} style={{ position: 'absolute', bottom: 0, left: '50%', height: vh, transform: 'translateX(-50%)', opacity: cl(op, 0, 1) }} />;
        })}
      </div>
      <div style={{ position: 'absolute', left: 250, right: 0, top: 1010, borderBottom: '1px dashed ' + C.lineDashed, opacity: inn * 0.8 }} />
      <div style={{ position: 'absolute', left: 820, top: 250, width: 720, opacity: cardIn, transform: 'translateX(' + lerp(46, 0, cardIn) + 'px)' }}>
        <Kicker style={{ fontSize: 12 }}>Routines</Kicker>
        <div style={{ fontFamily: F.disp, fontSize: 44, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', margin: '6px 0 4px' }}>A quiet daily streak</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '18px 0 14px' }}>
          <span style={{ fontFamily: F.disp, fontSize: 72, fontWeight: 600, color: C.sageText, lineHeight: 1 }}>{streak}</span>
          <span style={{ fontFamily: F.disp, fontSize: 26, color: C.muted }}>days in a row</span>
        </div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 26 }}>
          {Array.from({ length: dots }).map((_, i) => (
            <span key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: i < filled ? C.sage : 'transparent', border: '1.5px solid ' + (i < filled ? C.sage : C.lineSolid), transform: 'scale(' + (i === filled - 1 ? 1.18 : 1) + ')' }} />
          ))}
        </div>
        <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 5px 12px rgba(60,52,38,0.08)', padding: '18px 24px' }}>
          <Kicker style={{ fontSize: 10 }}>Morning ritual</Kicker>
          <div style={{ marginTop: 10 }}>
            {items.map((x, i) => {
              const on = rampL(lt, 0.7 + i * 0.45, 0.35) > 0.5;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 0', borderTop: i ? '1px dashed ' + C.lineDashed : 'none' }}>
                  <Box done={on} color={C.sage} size={18} />
                  <span style={{ fontSize: 16, color: on ? C.hairline : C.ink, textDecoration: on ? 'line-through' : 'none' }}>{x}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 5 — REVIEW : the weekly letter
// ═══════════════════════════════════════════════════════════════════════════
function SceneReview() {
  const t = useTime(); const [s, e] = T.review; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur, 0.4, 0.5);
  const envIn = rampExpo(lt, 0.0, 0.5);
  const rise = rampIO(lt, 0.6, 1.1);
  const letterTop = lerp(560, 150, rise);
  const content = ramp(lt, 1.6, 0.55);
  const fernStages = ['fern/coil.png', 'fern/unfurl1.png', 'fern/unfurl2.png', 'fern/full.png'];
  const fmark = [1.7, 2.1, 2.5, 2.9];
  const write = rampL(lt, 2.5, 1.0);
  const handText = 'a good week. ✿';
  const shown = handText.slice(0, Math.round(write * handText.length));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <div style={{ position: 'absolute', left: '50%', top: 120, transform: 'translateX(-50%)', width: 700, height: 800 }}>
        <div style={{ position: 'absolute', left: '50%', top: letterTop, transform: 'translateX(-50%)', width: 520, opacity: envIn }}>
          <div style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: '4px 4px 2px 2px', boxShadow: '0 2px 6px rgba(60,52,38,0.14),0 20px 44px rgba(60,52,38,0.18)', padding: '30px 34px 150px', minHeight: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Kicker color={C.bcText}>Weekly letter · Wk 27</Kicker>
              <Leafy src="tools/pen.png" style={{ height: 30, opacity: 0.9 }} />
            </div>
            <div style={{ fontFamily: F.disp, fontSize: 34, fontWeight: 500, color: C.ink, marginTop: 10, opacity: content }}>Dear Kai,</div>
            <div style={{ marginTop: 12, opacity: content }}>
              {['You closed 23 tasks and kept the streak alive.', 'The forecasting app climbed to 60%.', 'You wrote on four of seven evenings.'].map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', fontSize: 16, color: C.muted, lineHeight: 1.4 }}><span style={{ color: C.sage }}>—</span>{x}</div>
              ))}
            </div>
            <div style={{ position: 'absolute', left: 34, bottom: 34, fontFamily: F.hand, fontSize: 30, color: C.terra }}>{shown}<span style={{ opacity: write < 1 ? (Math.sin(lt * 8) > 0 ? 1 : 0) : 0 }}>|</span></div>
            <div style={{ position: 'absolute', right: 26, bottom: 22 }}>
              {fernStages.map((src, i) => {
                const next = fmark[i + 1] != null ? fmark[i + 1] : 99;
                let op = i === fernStages.length - 1 ? rampL(lt, fmark[i], 0.5) : rampL(lt, fmark[i], 0.4) * (1 - rampL(lt, next, 0.4));
                if (i === 0) op = content * (1 - rampL(lt, fmark[1], 0.4));
                return <Leafy key={i} src={src} style={{ position: 'absolute', right: 0, bottom: 0, height: 150, opacity: cl(op, 0, 1) }} />;
              })}
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: 420, transform: 'translateX(-50%) scale(' + lerp(0.96, 1, envIn) + ')', width: 620, opacity: envIn }}>
          <Leafy src="envelope/back-open-full.png" style={{ width: 620 }} />
          <div style={{ position: 'absolute', left: '50%', top: -18, transform: 'translateX(-50%)' }}>
            <Leafy src={rise > 0.35 ? 'seal/broken-left.png' : 'seal/intact.png'} style={{ height: 60 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 6 — LIVING GARDEN : camera dollies across the whole row
// ═══════════════════════════════════════════════════════════════════════════
const GARDEN = [
  { src: 'cherry/bloom.png', h: 260, label: 'Tasks', dx: -720 },
  { src: 'hydrangea/medium.png', h: 240, label: 'Inbox', dx: -480 },
  { src: 'daisy/midday.png', h: 300, label: 'Calendar', dx: -250 },
  { src: 'vine/flowering.png', h: 380, label: 'Routines', dx: 20 },
  { src: 'fern/full.png', h: 360, label: 'Review', dx: 300 },
  { src: 'wisteria/p60.png', h: 340, label: 'Projects', dx: 560 },
  { src: 'clover/awake.png', h: 200, label: 'Chat', dx: 770 },
];
const POLLEN = [
  { x: 380, o: 0.0, s: 7 }, { x: 720, o: 0.35, s: 5 }, { x: 1080, o: 0.6, s: 8 },
  { x: 1360, o: 0.15, s: 6 }, { x: 560, o: 0.8, s: 5 }, { x: 1550, o: 0.5, s: 7 },
];
function SceneGarden() {
  const t = useTime(); const [s, e] = T.garden; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur, 0.45, 0.5);
  const baseY = 830;
  const panP = rampIO(lt, 0, dur);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <div style={{ position: 'absolute', inset: 0, transform: 'translateX(' + lerp(90, -90, panP) + 'px) scale(' + lerp(1.07, 1.0, panP) + ')', transformOrigin: '50% 80%' }}>
        <div style={{ position: 'absolute', left: 120, right: 120, top: baseY + 6, borderBottom: '1.5px dashed ' + C.lineDashed, opacity: 0.8 }} />
        {GARDEN.map((g, i) => {
          const pop = rampBack(lt, 0.1 + i * 0.09, 0.6);
          const sway = 1.6 * Math.sin(lt * 1.0 + i * 0.9);
          return (
            <div key={i} style={{ position: 'absolute', left: '50%', top: baseY, transform: 'translate(-50%,-100%) translateX(' + g.dx + 'px)', opacity: cl(pop, 0, 1) }}>
              <div style={{ transform: 'scale(' + lerp(0.6, 1, pop) + ') rotate(' + sway + 'deg)', transformOrigin: '50% 100%' }}>
                <Leafy src={g.src} style={{ height: g.h }} />
              </div>
              <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', opacity: ramp(lt, 0.8 + i * 0.06, 0.5) }}>
                <Kicker style={{ fontSize: 10.5 }}>{g.label}</Kicker>
              </div>
            </div>
          );
        })}
      </div>
      {POLLEN.map((p, i) => {
        const tt = (lt * 0.16 + p.o) % 1;
        const x = p.x + Math.sin(tt * 6.28 + i) * 40;
        const y = lerp(880, 180, tt);
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: p.s, height: p.s, borderRadius: '50%', background: C.goldWarm, opacity: Math.sin(tt * Math.PI) * 0.6 }} />;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 7 — MAKE IT YOURS : day flips to night
// ═══════════════════════════════════════════════════════════════════════════
function MiniToday({ th }) {
  const isN = th.night;
  return (
    <div style={{ width: 760, height: 470, background: th.page, borderRadius: 10, overflow: 'hidden', position: 'relative', boxShadow: isN ? '0 30px 70px rgba(0,0,0,0.5)' : '0 30px 70px rgba(60,52,38,0.24)', border: '1px solid ' + th.line }}>
      <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: isN ? 'screen' : 'multiply', opacity: isN ? 0.16 : 0.5, pointerEvents: 'none' }} />
      <div style={{ padding: '30px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <Kicker color={th.faint}>Today · Day 42</Kicker>
            <div style={{ fontFamily: F.disp, fontSize: 40, fontWeight: 500, color: th.ink, letterSpacing: '-0.02em', marginTop: 4 }}>Friday, July 10</div>
          </div>
          <Leafy src="cherry/bloom.png" style={{ height: 66, filter: isN ? 'drop-shadow(0 0 16px rgba(233,191,197,0.5))' : DROP }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 6px' }}>
          <Kicker color={th.faint} style={{ fontSize: 11 }}>Top 3</Kicker>
          <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + th.line }} />
        </div>
        {[['Deliver the forecasting MVP', true], ['Emails for Shaheen', false], ['Review the portfolio', false]].map(([x, done], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '1px dashed ' + th.line }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', border: '1.5px solid ' + (done ? th.accent : th.faint), background: done ? th.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.page, fontSize: 11, boxShadow: done && isN ? '0 0 8px rgba(226,148,115,0.6)' : 'none' }}>{done ? '✓' : ''}</span>
            <span style={{ fontSize: 16, color: done ? th.faint : th.ink, textDecoration: done ? 'line-through' : 'none' }}>{x}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function SceneYours() {
  const t = useTime(); const [s, e] = T.yours; if (t < s - 0.3 || t > e + 0.3) return null;
  const lt = t - s, dur = e - s, o = env(lt, dur, 0.4, 0.45);
  const inn = rampExpo(lt, 0.0, 0.45);
  const sweep = rampIO(lt, 0.65, 1.25);
  const cam = 1 + 0.03 * rampIO(lt, 0, dur);
  const dayTh = { night: false, page: C.linen, card: C.parchment, ink: C.ink, muted: C.muted, faint: C.faint, line: C.lineDashed, accent: C.sage };
  const nightTh = { night: true, page: NIGHT.page, card: NIGHT.card, ink: NIGHT.ink, muted: NIGHT.muted, faint: NIGHT.faint, line: NIGHT.line, accent: NIGHT.accent };
  const cardW = 760, cardH = 470;
  const seamX = sweep * cardW;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, transform: 'scale(' + cam + ')', transformOrigin: '50% 50%' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: cardW, height: cardH, transform: 'translate(-50%,-50%) translateY(' + lerp(22, 0, inn) + 'px)', opacity: inn }}>
        <div style={{ position: 'absolute', inset: 0 }}><MiniToday th={dayTh} /></div>
        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 ' + ((1 - sweep) * 100) + '% 0 0)' }}>
          <MiniToday th={nightTh} />
          {[[110, 120], [210, 300], [330, 90], [420, 360], [560, 180], [660, 320]].map((p, i) => {
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(lt * 2 + i));
            return <div key={i} style={{ position: 'absolute', left: p[0], top: p[1], width: 6, height: 6, borderRadius: '50%', background: NIGHT.firefly, boxShadow: '0 0 12px rgba(246,226,140,0.85)', opacity: tw * sweep }} />;
          })}
        </div>
        {sweep > 0.02 && sweep < 0.99 && (
          <div style={{ position: 'absolute', left: seamX - 2, top: -10, width: 4, height: cardH + 20, background: 'linear-gradient(' + NIGHT.firefly + ',rgba(246,226,140,0.2))', boxShadow: '0 0 24px rgba(246,226,140,0.7)', borderRadius: 2 }} />
        )}
        <div style={{ position: 'absolute', top: -58, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, background: sweep > 0.5 ? NIGHT.card : C.parchment, border: '1px solid ' + (sweep > 0.5 ? NIGHT.line : C.lineCard), borderRadius: 999, padding: '7px 9px', boxShadow: '0 6px 16px rgba(60,52,38,0.18)' }}>
          <span style={{ fontSize: 15, opacity: sweep > 0.5 ? 0.4 : 1 }}>☀</span>
          <div style={{ width: 44, height: 22, borderRadius: 999, background: sweep > 0.5 ? NIGHT.accent : C.lineSolid, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 2, left: lerp(2, 24, sweep), width: 18, height: 18, borderRadius: '50%', background: C.parchment }} />
          </div>
          <span style={{ fontSize: 14, opacity: sweep > 0.5 ? 1 : 0.4, color: sweep > 0.5 ? NIGHT.ink : C.ink }}>☾</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE 8 — ENDING : plant your first seed -> Kai's struck & gone -> "Your" scribbled
// ═══════════════════════════════════════════════════════════════════════════
const YOUR = 'Your';
function SceneEnd() {
  const t = useTime(); const [s, e] = T.end; if (t < s - 0.2) return null;
  const lt = t - s;
  // phase 1 — "Plant your first seed."
  const p1o = ramp(lt, 0.2, 0.4) * (1 - rampL(lt, 1.5, 0.4));
  const sproutG = rampBack(lt, 0.3, 0.75);
  // phase 2 — wordmark
  const markIn = rampExpo(lt, 1.9, 0.5);
  const logoIn = rampBack(lt, 2.0, 0.6);
  const strike = rampIO(lt, 2.6, 0.4);          // scribble line draws over Kai's
  const kaisO = 1 - rampL(lt, 3.0, 0.4);        // then Kai's disappears
  const writeP = rampL(lt, 3.35, 1.3);          // "Your" scribbled letter-by-letter
  const penO = ramp(lt, 3.4, 0.18) * (1 - rampL(lt, 4.55, 0.25));
  const penX = writeP * 214;
  const signOff = ramp(lt, 4.4, 0.6);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {p1o > 0.01 && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: p1o }}>
          <div style={{ transform: 'scale(' + sproutG + ')', transformOrigin: '50% 100%', display: 'inline-block' }}>
            <Leafy src="clover/seedling.png" style={{ height: 120, margin: '0 auto' }} />
          </div>
          <div style={{ fontFamily: F.disp, fontSize: 62, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 18 }}>Plant your first seed.</div>
        </div>
      )}
      {markIn > 0.01 && (
        <React.Fragment>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 900, height: 520, transform: 'translate(-50%,-50%)', background: 'radial-gradient(closest-side, rgba(201,165,90,0.14), transparent)', opacity: markIn }} />
          <div style={{ position: 'absolute', left: '50%', top: 348, transform: 'translate(-50%,-50%) scale(' + logoIn + ')', opacity: cl(logoIn, 0, 1) }}>
            <LeafLogo size={104} />
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 560, transform: 'translate(-50%,-50%) translateY(' + lerp(18, 0, markIn) + 'px)', opacity: markIn, display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <div style={{ position: 'relative' }}>
              {/* Kai's — struck through, then gone */}
              <span style={{ fontFamily: F.disp, fontSize: 104, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', opacity: kaisO }}>Kai’s</span>
              <div style={{ position: 'absolute', left: -8, right: -8, top: '52%', height: 7, background: C.terra, borderRadius: 4, transform: 'rotate(-1.5deg) scaleX(' + strike + ')', transformOrigin: 'left center', opacity: kaisO }} />
              {/* Your — scribbled letter-by-letter over the vacated slot */}
              <div style={{ position: 'absolute', left: '50%', top: '-30%', transform: 'translateX(-50%)' }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'pre' }}>
                  {YOUR.split('').map((ch, i) => {
                    const lp = cl(writeP * YOUR.length - i, 0, 1);
                    const ez = E.easeOutBack(lp);
                    return <span key={i} style={{ fontFamily: F.hand, fontSize: 132, fontWeight: 600, color: C.terra, opacity: cl(lp * 1.6, 0, 1), display: 'inline-block', transformOrigin: '50% 92%', transform: 'translateY(' + (1 - ez) * 16 + 'px) rotate(' + (1 - lp) * -7 + 'deg) scale(' + lerp(0.55, 1, ez) + ')' }}>{ch}</span>;
                  })}
                  {/* the writing pen (nib rides the frontier) */}
                  <div style={{ position: 'absolute', left: penX - 6, top: -66, opacity: penO, transform: 'rotate(' + (5 + 2 * Math.sin(lt * 22)) + 'deg)', transformOrigin: '10% 92%' }}>
                    <Leafy src="tools/pen.png" style={{ height: 150 }} />
                  </div>
                </div>
              </div>
            </div>
            <span style={{ fontFamily: F.disp, fontSize: 104, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em' }}>Flow</span>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 694, transform: 'translateX(-50%)', opacity: signOff }}>
            <Kicker style={{ fontSize: 14, letterSpacing: '0.28em' }}>Pressed &amp; kept, one day at a time</Kicker>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── ambient overlays ─────────────────────────────────────────────────────────
function Grain() {
  return <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 55 }} />;
}
function Vignette() {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 56, background: 'radial-gradient(125% 125% at 50% 42%, transparent 56%, rgba(60,52,38,0.13) 100%)' }} />;
}
function Preload() {
  const all = ['clover/seedling.png', 'clover/four_leaf.png', 'clover/awake.png', 'hydrangea/light.png', 'hydrangea/medium.png', 'cherry/bloom.png', 'daisy/midday.png', 'vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png', 'fern/coil.png', 'fern/unfurl1.png', 'fern/unfurl2.png', 'fern/full.png', 'envelope/back-open-full.png', 'seal/intact.png', 'seal/broken-left.png', 'tools/pen.png', 'wisteria/p60.png'];
  return <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>{all.map((s, i) => <img key={i} src={A + s} alt="" />)}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
function IntroVideo() {
  return (
    <Stage width={1920} height={1080} duration={DURATION} background={C.linen} persistKey="kaisflow-intro">
      <Preload />
      <SceneOpen />
      <SceneCapture />
      <ScenePlan />
      <SceneSched />
      <SceneVine />
      <SceneReview />
      <SceneGarden />
      <SceneYours />
      <SceneEnd />
      <Grain />
      <Vignette />
      <Caption start={3.3} end={6.8} num="01" kicker="Capture" line="Catch it before it drifts away." />
      <Caption start={7.6} end={10.8} num="02" kicker="Plan" line="Plan the day that matters." />
      <Caption start={11.6} end={14.8} num="03" kicker="Schedule" line="Give your work a time." />
      <Caption start={15.7} end={19.2} num="04" kicker="Cultivate" line="Tend it, day by day." />
      <Caption start={20.1} end={23.4} num="05" kicker="Review" line="Reflect, once a week." />
      <Caption start={24.2} end={27.0} num="06" kicker="Your garden" line="Your work, quietly growing." />
      <Caption start={27.8} end={30.4} num="07" kicker="Make it yours" line="Shape it your way." />
    </Stage>
  );
}
window.IntroVideo = IntroVideo; // v1 (frozen)
