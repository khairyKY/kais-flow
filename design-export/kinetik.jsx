// Kai's Flow — "Kinetik" 30s product commercial. Fast, hard-cut, one calm hero beat.
// Cut to Moonlit Gathering.mp3 (115 BPM); every scene change lands on a real onset.
// Built on animations.jsx globals. Two exports: KinetikVideo (1920x1080),
// KinetikVideoVertical (1080x1920) — same movie, re-staged for 9:16.

const { Stage, Sprite, useTime, useTimeline, useSprite, Easing: E, clamp: cl, interpolate, VideoSprite } = window;

// ── palette (ds/tokens, verbatim) ────────────────────────────────────────────
const C = {
  linen: '#EFE9DB', parchment: '#FBF6E9', bone: '#F6F0E1', sidebar: '#EAE3D2', goal: '#F8EFD3', event: '#F3EDDA',
  ink: '#2a2420', muted: '#6b6455', faint: '#8b8471', hairline: '#a49d87',
  lineSolid: '#cfc7b0', lineDashed: '#d5cdb5', lineCard: '#e0d8c2', lineGoal: '#dcc48e',
  sage: '#8A9A7E', moss: '#7A946E', terra: '#B5654A', blossom: '#D4A8B0', lavender: '#A8A0BE',
  hydrangea: '#9AB4BE', buttercream: '#D4C78A', gold: '#9a7b3a', goldWarm: '#C9A55A',
  sageText: '#4d6650', bcText: '#9a8b52',
};
const N = { page: '#211D30', deep: '#191527', card: '#262233', ink: '#F0EBDD', muted: '#C9C0D8', faint: '#8E88A0', line: 'rgba(240,235,221,0.16)', accent: '#E29473', gold: '#E4C36B', firefly: '#F6E28C' };
const F = { disp: "'Source Serif 4', Georgia, serif", ui: "'Inter Tight', system-ui, sans-serif", mono: "'Courier Prime', ui-monospace, monospace", hand: "'Caveat', cursive" };
const A = 'ds/assets/';
const DROP = 'drop-shadow(0 3px 3px rgba(60,52,38,0.20))';
const NOISE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

// ── the two signature easings, from Motion.dc.html ───────────────────────────
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = t => ((ax * t + bx) * t + cx) * t;
  const fy = t => ((ay * t + by) * t + cy) * t;
  const dfx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = fx(t) - x; if (Math.abs(e) < 1e-5) break; const d = dfx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return fy(t);
  };
}
const EASE_PRIMARY = cubicBezier(0.32, 0.72, 0, 1);   // stack-push curve — snap in
const EASE_BLOOM = cubicBezier(0.3, 1.3, 0.45, 1);    // drag-overshoot — bloom

// ── beat map (video seconds → real onsets in the track) ──────────────────────
const DURATION = 30.0;
const AUDIO_START = 129.45;   // so the GATHER slam == the 132.45s drop
const B = {
  words: [1.17, 1.70, 2.22, 2.74],
  gather: 3.00, today: 5.07, todayFill: 5.55,
  capture: 8.69, parse: 10.75, filed: 11.80,
  flow: 13.34, snaps: [14.38, 15.41, 16.44],
  night: 17.20, nightLine: 18.51, nothing: 20.10,
  herb: 21.40, herbReveal: 23.69, herbPress: 25.75,
  sign: 27.31, end: 30.0,
};

// ── math ─────────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const rl = (t, t0, d) => cl((t - t0) / d, 0, 1);                 // linear ramp
const rp = (t, t0, d) => EASE_PRIMARY(rl(t, t0, d));            // primary snap
const rb = (t, t0, d) => EASE_BLOOM(rl(t, t0, d));              // bloom overshoot
const rc = (t, t0, d) => E.easeOutCubic(rl(t, t0, d));
const win = (t, a, b2, fin, fout) => { if (t < a || t > b2) return 0; let o = 1; if (t < a + fin) o = (t - a) / fin; else if (t > b2 - fout) o = (b2 - t) / fout; return E.easeInOutSine(cl(o, 0, 1)); };

// ── layout context (drives 16:9 vs 9:16) ─────────────────────────────────────
const LayoutCtx = React.createContext({ W: 1920, H: 1080, vert: false });
const useLayout = () => React.useContext(LayoutCtx);

// ── atoms ────────────────────────────────────────────────────────────────────
function Leafy({ src, style }) { return <img src={A + src} alt="" draggable={false} style={{ filter: DROP, display: 'block', ...style }} />; }
function Kicker({ children, color, style }) { return <span style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: color || C.faint, whiteSpace: 'nowrap', ...style }}>{children}</span>; }
function Box({ done, size, color }) {
  size = size || 20;
  return done
    ? <span style={{ width: size, height: size, borderRadius: 5, background: color || C.sage, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.parchment, fontSize: size * 0.6 }}>✓</span>
    : <span style={{ width: size, height: size, borderRadius: 5, border: '1.6px solid #bfb8a3', flex: 'none', background: 'rgba(255,255,255,0.4)', display: 'inline-block' }} />;
}
function LeafLogo({ size, glow, draw }) {
  size = size || 104; draw = draw == null ? 1 : draw;
  const dash = 260;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 0 18px rgba(168,192,154,0.45))' : DROP }}>
      <path d="M50 6 C 82 34, 82 82, 50 114 C 18 82, 18 34, 50 6 Z" fill={C.sage} stroke={C.moss} strokeWidth="2.5" strokeLinejoin="round" style={{ strokeDasharray: dash, strokeDashoffset: dash * (1 - draw), opacity: draw > 0.05 ? 1 : 0 }} />
      <path d="M50 12 L50 110" stroke={C.moss} strokeWidth="3" strokeLinecap="round" style={{ strokeDasharray: 100, strokeDashoffset: 100 * (1 - cl((draw - 0.2) / 0.8, 0, 1)) }} />
      <g stroke={C.moss} strokeWidth="2" fill="none" strokeLinecap="round" opacity={cl((draw - 0.55) / 0.45, 0, 1)}>
        <path d="M50 38 Q 64 40 71 52" /><path d="M50 38 Q 36 40 29 52" />
        <path d="M50 58 Q 66 60 73 74" /><path d="M50 58 Q 34 60 27 74" />
        <path d="M50 78 Q 62 80 68 92" /><path d="M50 78 Q 38 80 32 92" />
      </g>
    </svg>
  );
}
// a single drawn/soft petal
function Petal({ x, y, r, s, color, o }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: 13 * (s || 1), height: 17 * (s || 1), background: color || C.blossom, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', transform: 'rotate(' + (r || 0) + 'deg)', opacity: o == null ? 0.9 : o, filter: 'drop-shadow(0 1px 1px rgba(60,52,38,0.15))' }} />;
}
// falling-petal field, gated to [a,b]
function Petals({ a, b, n, x, y, w, h, color }) {
  const t = useTime();
  if (t < a || t > b) return null;
  n = n || 10;
  const items = [];
  for (let i = 0; i < n; i++) {
    const seed = i * 12.9898, sx = (Math.sin(seed) * 43758.5) % 1, sy = (Math.sin(seed + 1) * 43758.5) % 1;
    const px = x + Math.abs(sx) * w;
    const fallT = ((t - a) * (0.16 + Math.abs(sy) * 0.12) + Math.abs(sx)) % 1;
    const py = y + fallT * h;
    const rot = (t * 60 + i * 47) % 360;
    const o = win(a + fallT * (b - a), a, b, 0.2, 0.2) * (0.5 + 0.5 * Math.abs(sx));
    items.push(<Petal key={i} x={px} y={py} r={rot} s={0.7 + Math.abs(sy) * 0.6} color={color} o={0.55 * (1 - fallT)} />);
  }
  return <React.Fragment>{items}</React.Fragment>;
}
function Grain() { return <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 90 }} />; }
function Vignette({ dark }) { return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 91, background: dark ? 'radial-gradient(125% 125% at 50% 40%, transparent 48%, rgba(10,8,16,0.5) 100%)' : 'radial-gradient(125% 125% at 50% 42%, transparent 58%, rgba(40,34,26,0.16) 100%)' }} />; }

// caption: mono kicker + big serif line (+ optional second line)
function Caption({ show, num, time, line, line2, light, y }) {
  const { W, H, vert } = useLayout();
  if (show <= 0.01) return null;
  const ink = light ? N.ink : C.ink, dim = light ? N.faint : C.faint;
  const ty = (1 - show) * 22;
  const left = vert ? W * 0.5 : 118;
  const bottom = y != null ? y : (vert ? H * 0.16 : 116);
  const size = vert ? Math.min(W * 0.115, 128) : 78;
  return (
    <div style={{ position: 'absolute', left: left, bottom: bottom, transform: (vert ? 'translateX(-50%)' : '') + ' translateY(' + ty + 'px)', opacity: show, zIndex: 70, textAlign: vert ? 'center' : 'left', width: vert ? W * 0.86 : 'auto' }}>
      {(num || time) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, justifyContent: vert ? 'center' : 'flex-start' }}>
          <Kicker color={dim} style={{ fontSize: vert ? 15 : 13 }}>{num}{num && time ? ' · ' : ''}{time}</Kicker>
          {!vert && <span style={{ width: 190, height: 1, borderBottom: '1px dashed ' + (light ? 'rgba(240,235,221,0.3)' : C.lineDashed) }} />}
        </div>
      )}
      <div style={{ fontFamily: F.disp, fontSize: size, fontWeight: 500, color: ink, letterSpacing: '-0.02em', lineHeight: 1.0 }}>{line}</div>
      {line2 && <div style={{ fontFamily: F.disp, fontSize: size, fontWeight: 500, color: ink, letterSpacing: '-0.02em', lineHeight: 1.05, opacity: 0.9 }}>{line2}</div>}
    </div>
  );
}

// full-frame scene background (paints instantly on a hard cut)
function Bg({ color, fade, dark }) {
  return <div style={{ position: 'absolute', inset: 0, background: color, opacity: fade == null ? 1 : fade }}>
    <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: dark ? 'screen' : 'multiply', opacity: dark ? 0.12 : 0.4, pointerEvents: 'none' }} />
  </div>;
}

// ── the scattered fragments (shared by SCATTER + GATHER) ─────────────────────
// fractional positions; multiplied by W,H so both aspects place them sanely
const FRAGS_H = [
  { fx: 0.20, fy: 0.30, rot: -7, type: 'task' },
  { fx: 0.76, fy: 0.26, rot: 6, type: 'cal' },
  { fx: 0.28, fy: 0.72, rot: 5, type: 'journal' },
  { fx: 0.72, fy: 0.70, rot: -5, type: 'contact' },
  { fx: 0.50, fy: 0.20, rot: 3, type: 'wave' },
];
const FRAGS_V = [
  { fx: 0.26, fy: 0.24, rot: -7, type: 'task' },
  { fx: 0.74, fy: 0.34, rot: 6, type: 'cal' },
  { fx: 0.28, fy: 0.60, rot: 5, type: 'journal' },
  { fx: 0.72, fy: 0.72, rot: -5, type: 'contact' },
  { fx: 0.50, fy: 0.14, rot: 3, type: 'wave' },
];
function Fragment({ type, dark }) {
  const inkc = dark ? N.ink : C.ink, sub = dark ? N.faint : C.faint;
  const cardBg = dark ? 'rgba(240,235,221,0.06)' : C.parchment;
  const border = dark ? '1px solid rgba(240,235,221,0.14)' : '1px solid ' + C.lineCard;
  const box = { background: cardBg, border, borderRadius: 8, boxShadow: dark ? 'none' : '0 2px 8px rgba(60,52,38,0.14)', padding: '13px 16px', backdropFilter: dark ? 'blur(2px)' : 'none' };
  if (type === 'task') return <div style={{ ...box, width: 232, display: 'flex', gap: 12, alignItems: 'center' }}><Box size={18} color={C.blossom} /><span style={{ fontSize: 15, color: inkc }}>Try the pricing model</span></div>;
  if (type === 'cal') return <div style={{ ...box, width: 176, borderLeft: '3px solid ' + C.lavender }}><Kicker color={dark ? N.muted : C.lavender} style={{ fontSize: 10 }}>Fri · 9:00</Kicker><div style={{ fontSize: 14.5, color: inkc, marginTop: 4 }}>Deep work</div></div>;
  if (type === 'journal') return <div style={{ ...box, width: 210, background: dark ? 'rgba(212,199,138,0.08)' : C.goal }}><span style={{ fontFamily: F.hand, fontSize: 22, color: dark ? N.gold : C.bcText }}>a quiet good day ✿</span></div>;
  if (type === 'contact') return <div style={{ ...box, width: 190, display: 'flex', gap: 11, alignItems: 'center' }}><span style={{ width: 30, height: 30, borderRadius: '50%', background: C.clover || '#C9A0A0', flex: 'none' }} /><div><div style={{ fontSize: 14.5, color: inkc }}>Omar</div><Kicker style={{ fontSize: 9 }} color={sub}>3 days quiet</Kicker></div></div>;
  // wave
  return <div style={{ ...box, width: 200, display: 'flex', alignItems: 'center', gap: 4, height: 54 }}>{[10, 20, 34, 16, 26, 40, 22, 30, 14, 24, 12].map((h, i) => <span key={i} style={{ width: 4, height: h, borderRadius: 2, background: C.terra, opacity: 0.65 }} />)}</div>;
}

// ═══ SCENE 1 — SCATTER [0, 3.0] ══════════════════════════════════════════════
function Scatter() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const frags = vert ? FRAGS_V : FRAGS_H;
  const wordIdx = t < B.words[1] ? 0 : t < B.words[2] ? 1 : t < B.words[3] ? 2 : 3;
  const words = ['Tasks.', 'Habits.', 'People.', 'Journals.'];
  const wStart = B.words[wordIdx];
  const wIn = rp(t, wStart, 0.16);
  const pull = rc(t, 2.55, 0.45); // fragments lean to center before the slam
  return (
    <React.Fragment>
      <Bg color={N.page} dark />
      {/* faint drifting stars */}
      {Array.from({ length: 26 }).map((_, i) => { const sx = (Math.sin(i * 12.9) * 43758) % 1, sy = (Math.sin(i * 5.7) * 43758) % 1; return <div key={i} style={{ position: 'absolute', left: Math.abs(sx) * W, top: Math.abs(sy) * H, width: 3, height: 3, borderRadius: '50%', background: 'rgba(240,235,221,0.5)', opacity: 0.2 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)) }} />; })}
      {frags.map((f, i) => {
        const bx = f.fx * W, by = f.fy * H;
        const dx = 12 * Math.sin(t * 0.7 + i) + (W / 2 - bx) * 0.10 * pull;
        const dy = 10 * Math.cos(t * 0.6 + i * 1.5) + (H / 2 - by) * 0.10 * pull;
        const jolt = 1 + 0.04 * Math.max(0, 1 - (t - wStart) / 0.12);
        return <div key={i} style={{ position: 'absolute', left: bx, top: by, transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) rotate(' + (f.rot + 3 * Math.sin(t * 0.5 + i)) + 'deg) scale(' + jolt * (1 - pull * 0.12) + ')', opacity: 0.9 - pull * 0.25 }}><Fragment type={f.type} dark /></div>;
      })}
      {/* one word per beat, centered */}
      <div style={{ position: 'absolute', left: W / 2, top: H / 2, transform: 'translate(-50%,-50%) translateY(' + (1 - wIn) * 14 + 'px) scale(' + lerp(0.92, 1, wIn) + ')', opacity: wIn * (1 - rl(t, wStart + 0.42, 0.12)), zIndex: 20 }}>
        <div style={{ fontFamily: F.disp, fontSize: vert ? Math.min(W * 0.16, 180) : 132, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em', textShadow: '0 2px 30px rgba(0,0,0,0.5)' }}>{words[wordIdx]}</div>
      </div>
    </React.Fragment>
  );
}

// ═══ SCENE 2 — GATHER → TODAY BLOOMS [3.0, 8.69] ═════════════════════════════
const PLANROWS = [
  { txt: 'Deliver the MVP of the forecasting app', goal: true },
  { txt: 'Plan & implement the forecasting logic' },
  { txt: 'Create official emails for Shaheen' },
];
function GatherToday() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const frags = vert ? FRAGS_V : FRAGS_H;
  const conv = rp(t, B.gather, 0.42);          // fragments rush to center
  const cardIn = rb(t, B.gather + 0.04, 0.5);  // Today card overshoots up
  const push = rc(t, B.today, 3.4);            // slow ken-burns push-in
  const cardW = Math.min(W * (vert ? 0.9 : 0.62), vert ? 900 : 900);
  const cardH = vert ? cardW * 1.18 : Math.min(H * 0.82, 720);
  const cx = W / 2, cy = H * (vert ? 0.46 : 0.48);
  const scale = lerp(0.82, 1, cardIn) * lerp(1, 1.06, push);
  const cherryStage = t < B.todayFill + 0.4 ? 'cherry/bud.png' : t < 6.9 ? 'cherry/opening.png' : 'cherry/bloom.png';
  return (
    <React.Fragment>
      <Bg color={C.bone} />
      {/* fragments converging into the surface */}
      {conv < 1 && frags.map((f, i) => {
        const bx = f.fx * W, by = f.fy * H;
        const x = lerp(bx, cx, conv), y = lerp(by, cy, conv);
        return <div key={i} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%) scale(' + (1 - conv * 0.7) + ') rotate(' + f.rot * (1 - conv) + 'deg)', opacity: (1 - conv) * 0.9, zIndex: 5 }}><Fragment type={f.type} /></div>;
      })}
      {/* the Today card */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: cardW, height: cardH, transform: 'translate(-50%,-50%) scale(' + scale + ')', opacity: cardIn, zIndex: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 34px 70px rgba(60,52,38,0.20)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: -11, left: '50%', width: 92, height: 20, marginLeft: -46, background: 'rgba(138,154,126,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
          <div style={{ padding: vert ? '40px 44px' : '38px 46px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Kicker>Today</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: vert ? 44 : 46, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 6 }}>Friday, July 10</div>
              </div>
              <img src={A + cherryStage} alt="" style={{ height: vert ? 92 : 104, filter: DROP, transform: 'scale(' + rb(t, B.todayFill, 0.6) + ')', transformOrigin: '50% 100%', opacity: rc(t, B.todayFill, 0.4) }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: vert ? '30px 0 14px' : '30px 0 12px' }}>
              <Kicker style={{ fontSize: 12 }}>Top 3 for today</Kicker>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + C.lineDashed }} />
            </div>
            {PLANROWS.map((r, i) => {
              const tin = rc(t, B.todayFill + i * 0.34, 0.5);
              const isG = r.goal;
              return (
                <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: isG ? '18px 16px' : '15px 4px', marginBottom: isG ? 10 : 0, background: isG ? C.goal : 'transparent', border: isG ? '1px solid ' + C.lineGoal : 'none', borderBottom: isG ? '1px solid ' + C.lineGoal : '1px dashed ' + C.lineDashed, borderRadius: isG ? 3 : 0, boxShadow: isG ? '0 1px 2px rgba(60,52,38,0.12),0 8px 20px rgba(154,123,58,0.16)' : 'none', transform: isG ? 'rotate(-0.4deg) translateY(' + (1 - tin) * 10 + 'px)' : 'translateY(' + (1 - tin) * 10 + 'px)', opacity: tin }}>
                  <span style={{ width: 22, height: 22, borderRadius: 5, flex: 'none', border: '1.6px solid ' + (isG ? C.gold : '#bfb8a3'), background: 'rgba(255,255,255,0.5)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isG && <Kicker color={C.gold} style={{ fontSize: 10 }}>✶ Goal of the day</Kicker>}
                    <div style={{ fontFamily: isG ? F.disp : F.ui, fontSize: isG ? 23 : 17.5, fontWeight: isG ? 600 : 400, color: isG ? '#4a3a1e' : C.ink, marginTop: isG ? 5 : 0 }}>{r.txt}</div>
                  </div>
                  {isG ? <div style={{ fontFamily: F.hand, fontSize: 17, color: C.gold, flex: 'none' }}>for luck</div> : <span style={{ color: C.terra, fontSize: 18, flex: 'none' }}>★</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Petals a={B.todayFill} b={8.69} n={12} x={cx - cardW / 2} y={cy - cardH / 2} w={cardW} h={cardH * 0.9} color={C.blossom} />
      <Caption show={win(t, B.gather, B.today - 0.05, 0.34, 0.2)} num="01" line="One place." />
      <Caption show={win(t, B.today + 0.1, 8.69, 0.34, 0.32)} num="02" line="The day, as it blooms." />
    </React.Fragment>
  );
}

// ═══ SCENE 3 — CAPTURE [8.69, 13.34] ═════════════════════════════════════════
const CAP_TEXT = 'call mom friday 6pm';
function Capture() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const cx = W / 2, cy = H * (vert ? 0.4 : 0.42);
  const barW = Math.min(W * (vert ? 0.9 : 0.6), 900);
  const barIn = rb(t, B.capture, 0.34);
  const typed = Math.round(rl(t, B.capture + 0.3, 1.4) * CAP_TEXT.length);
  const shown = CAP_TEXT.slice(0, typed);
  const parse = rp(t, B.parse, 0.7);       // chip flies to Friday
  const filed = rp(t, B.filed, 0.7);       // note files
  // chip flight
  const chipStartX = cx - barW * 0.5 + 210, chipStartY = cy + 6;
  const gridX = cx + (vert ? 0 : barW * 0.5 - 40), gridY = cy + (vert ? 210 : 150);
  const chipX = lerp(chipStartX, gridX, parse), chipY = lerp(chipStartY, gridY, parse) - Math.sin(parse * Math.PI) * 90;
  return (
    <React.Fragment>
      <Bg color={C.linen} />
      {/* command bar */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: barW, transform: 'translate(-50%,-50%) scale(' + lerp(0.96, 1, barIn) + ')', opacity: barIn, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Kicker>⌘ Quick capture</Kicker></div>
        <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 14, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 54px rgba(60,52,38,0.18)', padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.terra, flex: 'none', boxShadow: '0 0 0 6px rgba(181,101,74,0.14)' }} />
          <div style={{ flex: 1, fontFamily: F.ui, fontSize: vert ? 26 : 30, color: C.ink }}>
            {shown}<span style={{ opacity: (t * 2) % 1 > 0.5 ? 1 : 0.15, color: C.terra }}>|</span>
          </div>
          {/* live waveform resolving into a check */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3.5, height: 30, opacity: 1 - filed }}>
            {[10, 22, 34, 16, 26, 14, 20].map((h, i) => <span key={i} style={{ width: 4, height: h + Math.abs(Math.sin(t * 4 + i)) * 12 * (1 - rl(t, B.parse, 0.5)), borderRadius: 2, background: C.terra, opacity: 0.6 }} />)}
          </div>
        </div>
        {/* parsed tokens underline */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center', opacity: rc(t, B.parse - 0.1, 0.4) }}>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.moss, background: 'rgba(138,154,126,0.16)', padding: '5px 11px', borderRadius: 999 }}>◦ Task</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.lavender, background: 'rgba(168,160,190,0.18)', padding: '5px 11px', borderRadius: 999 }}>◷ Fri 6:00 PM</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A4A58', background: 'rgba(212,168,176,0.18)', padding: '5px 11px', borderRadius: 999 }}>♥ Mom</span>
        </div>
      </div>
      {/* mini Friday column the chip flies to */}
      <div style={{ position: 'absolute', left: gridX, top: gridY, transform: 'translate(-50%,-40%)', width: 150, opacity: rc(t, B.parse - 0.2, 0.4) * (vert ? 1 : 1), zIndex: 8 }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, textAlign: 'center', marginBottom: 6 }}>Fri</div>
        <div style={{ height: 150, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 6, position: 'relative' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ position: 'absolute', left: 8, right: 8, top: 12 + i * 44, borderTop: '1px dashed ' + C.lineDashed }} />)}
          <div style={{ position: 'absolute', left: 8, right: 8, top: 100, height: 40, background: 'rgba(168,160,190,0.25)', border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, opacity: parse > 0.9 ? 1 : 0, transform: 'scale(' + (parse > 0.9 ? 1 : 0.9) + ')' }} />
        </div>
      </div>
      {/* the flying calendar chip */}
      {parse > 0.02 && parse < 0.98 && (
        <div style={{ position: 'absolute', left: chipX, top: chipY, transform: 'translate(-50%,-50%) rotate(' + (1 - parse) * -8 + 'deg)', background: C.parchment, border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, boxShadow: '0 14px 30px rgba(60,52,38,0.26)', padding: '9px 13px', zIndex: 30 }}>
          <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.lavender }}>Fri · 6:00 PM</div>
          <div style={{ fontSize: 14, color: C.ink }}>Call mom</div>
        </div>
      )}
      <Caption show={win(t, B.capture + 0.2, 13.34, 0.34, 0.3)} num="03" line="Say it once." line2="It files itself." />
    </React.Fragment>
  );
}

// ═══ SCENE 4 — FLOW [13.34, 17.7] ════════════════════════════════════════════
function Flow() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const cx = W / 2, cy = H * (vert ? 0.44 : 0.46);
  const gridW = Math.min(W * (vert ? 0.92 : 0.66), 1040), gridH = vert ? gridW * 1.0 : Math.min(H * 0.74, 640);
  const inn = rp(t, B.flow, 0.4);
  const blocks = [
    { at: B.snaps[0], y: 0.06, h: 0.26, color: C.lavender, tint: 'rgba(168,160,190,0.24)', title: 'Deep work — Forecasting', time: '9:00 – 11:00' },
    { at: B.snaps[1], y: 0.40, h: 0.16, color: C.hydrangea, tint: 'rgba(154,180,190,0.24)', title: 'Standup', time: '11:30' },
    { at: B.snaps[2], y: 0.60, h: 0.22, color: C.blossom, tint: 'rgba(212,168,176,0.22)', title: 'Emails for Shaheen', time: '2:00 – 3:30' },
  ];
  const hours = ['9', '10', '11', '12', '1', '2', '3'];
  return (
    <React.Fragment>
      <Bg color={C.bone} />
      <div style={{ position: 'absolute', left: cx, top: cy, width: gridW, height: gridH, transform: 'translate(-50%,-50%) scale(' + lerp(0.97, 1, inn) + ')', opacity: inn, zIndex: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 30px 64px rgba(60,52,38,0.18)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '26px 30px 14px' }}>
            <div><Kicker>Calendar · Friday</Kicker><div style={{ fontFamily: F.disp, fontSize: vert ? 34 : 34, fontWeight: 500, color: C.ink, marginTop: 4 }}>Everything gets a time</div></div>
            <img src={A + 'daisy/midday.png'} alt="" style={{ height: 76, filter: DROP }} />
          </div>
          <div style={{ position: 'relative', padding: '0 30px 20px', height: gridH - 96 }}>
            {hours.map((hh, i) => <div key={i} style={{ position: 'absolute', left: 30, right: 30, top: (i / hours.length) * (gridH - 116), display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 34, fontFamily: F.mono, fontSize: 12, color: C.faint }}>{hh}</span><span style={{ flex: 1, borderTop: '1px dashed ' + C.lineDashed }} /></div>)}
            {blocks.map((bk, i) => {
              const s = rb(t, bk.at, 0.34);
              const top = bk.y * (gridH - 130) + 6, h = bk.h * (gridH - 130);
              return <div key={i} style={{ position: 'absolute', left: 76, right: 34, top: top, height: h, background: bk.tint, border: '1px solid ' + bk.color, borderLeft: '3px solid ' + bk.color, borderRadius: 4, padding: '10px 14px', opacity: s, transform: 'scale(' + lerp(0.9, 1, s) + ')', transformOrigin: '50% 0%', boxShadow: '0 6px 16px rgba(60,52,38,0.10)' }}>
                <div style={{ fontSize: 15, color: C.ink, fontWeight: 500 }}>{bk.title}</div>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: bk.color, marginTop: 3 }}>{bk.time}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
      {/* routines vine growing at the edge */}
      {!vert && <img src={A + 'vine/flowering.png'} alt="" style={{ position: 'absolute', left: cx + gridW / 2 - 10, bottom: cy - gridH / 2, height: lerp(120, 300, rc(t, B.flow + 0.3, 2.6)), filter: DROP, transformOrigin: '50% 100%', zIndex: 6, opacity: 0.95 }} />}
      <Petals a={B.snaps[0]} b={17.7} n={9} x={cx - gridW / 2} y={cy - gridH / 2} w={gridW} h={gridH} color={C.blossom} />
      <Caption show={win(t, B.flow + 0.2, 17.5, 0.34, 0.3)} num="04" line="Everything, in flow." />
    </React.Fragment>
  );
}

// ═══ SCENE 5 — NIGHT GARDEN [17.2, 21.9] (dissolve in) ═══════════════════════
const NIGHT_HAND = "Shipped the model. Called mom.\nA good, full day. ✿";
function NightGarden() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const fade = rc(t, B.night, 0.5);   // dissolve from Flow
  const cx = W / 2, cy = H * (vert ? 0.42 : 0.46);
  const cardW = Math.min(W * (vert ? 0.86 : 0.5), 720);
  const cardIn = rp(t, B.night + 0.35, 0.5);
  const writeN = Math.round(rl(t, B.nightLine, 1.7) * NIGHT_HAND.length);
  const shown = NIGHT_HAND.slice(0, writeN);
  const moonY = lerp(H * 0.12, H * 0.06, rc(t, B.night, 2));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
      <Bg color={N.page} dark />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 78% 8%, rgba(240,235,221,0.10), transparent 46%)' }} />
      {/* stars */}
      {Array.from({ length: 40 }).map((_, i) => { const sx = (Math.sin(i * 12.9) * 43758) % 1, sy = (Math.sin(i * 78.2) * 43758) % 1; return <div key={i} style={{ position: 'absolute', left: Math.abs(sx) * W, top: Math.abs(sy) * H * 0.7, width: 2.5, height: 2.5, borderRadius: '50%', background: 'rgba(255,250,230,0.9)', boxShadow: '0 0 6px rgba(255,250,230,0.6)', opacity: 0.3 + 0.6 * Math.abs(Math.sin(t * 1.4 + i)) }} />; })}
      {/* moon */}
      <div style={{ position: 'absolute', left: W * 0.8, top: moonY, transform: 'translate(-50%,-50%)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 360, height: 360, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,235,221,0.18), transparent 60%)' }} />
        <div style={{ position: 'relative', width: 92, height: 92, borderRadius: '50%', background: '#F0EBDD', boxShadow: '0 0 44px rgba(240,235,221,0.5)' }}><div style={{ position: 'absolute', left: -22, top: -12, width: 92, height: 92, borderRadius: '50%', background: N.page, opacity: 0.92 }} /></div>
      </div>
      {/* fireflies */}
      {Array.from({ length: 9 }).map((_, i) => { const bx = (0.14 + i * 0.093) * W, by = (0.62 + (Math.sin(i * 3.1) * 0.16)) * H; const dx = 40 * Math.sin(t * 0.7 + i), dy = 26 * Math.sin(t * 1.1 + i * 2); return <div key={i} style={{ position: 'absolute', left: bx + dx, top: by + dy, width: 7, height: 7, borderRadius: '50%', background: N.firefly, boxShadow: '0 0 14px rgba(246,226,140,0.9),0 0 30px rgba(246,226,140,0.4)', opacity: 0.35 + 0.6 * Math.abs(Math.sin(t * 1.8 + i)) }} />; })}
      {/* rim-lit fern */}
      <img src={A + 'fern/full.png'} alt="" style={{ position: 'absolute', left: W * 0.12, bottom: 0, height: H * 0.4, filter: 'brightness(0.5) drop-shadow(-6px 0 10px rgba(246,226,140,0.25))', zIndex: 4 }} />
      {/* journal card writing itself */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: cardW, transform: 'translate(-50%,-50%) translateY(' + (1 - cardIn) * 20 + 'px)', opacity: cardIn, zIndex: 10 }}>
        <div style={{ background: N.card, border: '1px solid ' + N.line, borderRadius: 6, boxShadow: '0 30px 70px rgba(0,0,0,0.5)', padding: '28px 32px', backdropFilter: 'blur(2px)' }}>
          <Kicker color={N.faint} style={{ fontSize: 11 }}>Journal · Friday night</Kicker>
          <div style={{ fontFamily: F.hand, fontSize: vert ? 34 : 34, color: N.ink, lineHeight: 1.35, marginTop: 12, whiteSpace: 'pre-wrap', minHeight: 96 }}>{shown}<span style={{ opacity: (t * 2) % 1 > 0.5 && writeN < NIGHT_HAND.length ? 1 : 0, color: N.gold }}>|</span></div>
        </div>
      </div>
      <Caption show={win(t, B.night + 0.4, B.nothing - 0.1, 0.34, 0.2)} num="05" line="When the day is done —" light />
      <Caption show={win(t, B.nothing, 21.9, 0.34, 0.28)} line="nothing slips." light />
    </div>
  );
}

// ═══ SCENE 6 — THE HERBARIUM [21.4, 27.4] · hero, hold longest ════════════════
const SPECIMENS = [
  { src: 'wisteria/p100.png', name: 'Forecasting App', tape: 'rgba(201,165,90,0.42)', big: true },
  { src: 'cherry/bloom.png', name: 'Portfolio refresh', tape: 'rgba(212,168,176,0.42)' },
  { src: 'hydrangea/heavy.png', name: 'Tax season, survived', tape: 'rgba(154,180,190,0.42)' },
  { src: 'fern/full.png', name: 'Reading habit, rebuilt', tape: 'rgba(168,160,190,0.4)' },
];
function Herbarium() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const fade = rc(t, B.herb, 0.55);
  const push = rc(t, B.herb, 5.6);              // slow, proud push-in
  const press = rb(t, B.herbPress, 0.5);        // final cinch on the 1.0 hit
  const cx = W / 2, cy = H * (vert ? 0.44 : 0.47);
  const cols = vert ? 2 : 4;
  const specW = vert ? W * 0.4 : 300, gap = vert ? 26 : 34;
  const scale = lerp(1.0, 1.06, push) * lerp(1, 0.99, press);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fade, zIndex: 5 }}>
      <Bg color={C.linen} />
      <div style={{ position: 'absolute', left: cx, top: H * (vert ? 0.12 : 0.13), transform: 'translate(-50%,0) scale(' + lerp(1, 1.03, push) + ')', textAlign: 'center' }}>
        <Kicker style={{ fontSize: 12 }}>Since May 2026 · 7 specimens</Kicker>
        <div style={{ fontFamily: F.disp, fontSize: vert ? 60 : 66, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 8 }}>The Herbarium</div>
        <div style={{ fontFamily: F.hand, fontSize: 22, color: '#7a745f', marginTop: 6 }}>what bloomed, kept flat &amp; forever ✿</div>
      </div>
      <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%) scale(' + scale + ')', display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', ' + specW + 'px)', gap: gap, zIndex: 6 }}>
        {SPECIMENS.map((sp, i) => {
          const rev = rb(t, B.herbReveal - 0.5 + i * 0.18, 0.6);
          return (
            <div key={i} style={{ position: 'relative', background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 3, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 16px 34px rgba(60,52,38,0.14)', padding: '24px 22px 20px', opacity: rev, transform: 'translateY(' + (1 - rev) * 22 + 'px) rotate(' + (i % 2 ? 0.6 : -0.6) + 'deg)' }}>
              <span style={{ position: 'absolute', top: -8, left: 24, width: 54, height: 16, background: sp.tape, backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-4deg)', borderRadius: 1 }} />
              <span style={{ position: 'absolute', top: -8, right: 24, width: 54, height: 16, background: sp.tape, backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(3deg)', borderRadius: 1 }} />
              <div style={{ height: vert ? 150 : 180, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid ' + C.lineCard, paddingBottom: 14 }}>
                <img src={A + sp.src} alt="" style={{ height: vert ? 145 : 172, filter: 'saturate(0.35) sepia(0.28) contrast(0.88) brightness(1.04)', transform: 'scaleY(0.94) rotate(' + (i % 2 ? 1.2 : -1.2) + 'deg)' }} />
              </div>
              <div style={{ fontFamily: F.hand, fontSize: 23, color: C.ink, marginTop: 12 }}>{sp.name}</div>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, marginTop: 4, lineHeight: 1.9 }}>Pressed · 6/6 milestones</div>
            </div>
          );
        })}
      </div>
      {/* gold thread cinching across, glimmering on the press hit */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none' }}>
        <path d={'M ' + (cx - specW * (vert ? 1.0 : 1.9)) + ' ' + (cy - 8) + ' Q ' + cx + ' ' + (cy + 26) + ' ' + (cx + specW * (vert ? 1.0 : 1.9)) + ' ' + (cy - 8)} fill="none" stroke={C.goldWarm} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" style={{ opacity: rc(t, B.herbReveal, 0.6) * (0.5 + 0.5 * press), filter: 'drop-shadow(0 0 ' + (2 + press * 8) + 'px rgba(201,165,90,' + (0.3 + press * 0.5) + '))' }} />
      </svg>
      <Caption show={win(t, B.herbReveal + 0.1, 27.4, 0.4, 0.3)} num="06" line="A life, well kept." y={vert ? H * 0.1 : 92} />
    </div>
  );
}

// ═══ SCENE 7 — SIGN-OFF [27.31, 30] ══════════════════════════════════════════
function SignOff() {
  const t = useTime();
  const { W, H, vert } = useLayout();
  const cx = W / 2, cy = H * (vert ? 0.44 : 0.46);
  const draw = rc(t, B.sign + 0.05, 1.0);
  const markIn = rb(t, B.sign + 0.1, 0.7);
  const tagIn = rc(t, B.sign + 1.1, 0.6);
  return (
    <React.Fragment>
      <Bg color={C.parchment} />
      <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(' + lerp(0.7, 1, markIn) + ')', opacity: markIn }}><LeafLogo size={vert ? 96 : 104} draw={draw} /></div>
        <div style={{ fontFamily: F.disp, fontSize: vert ? 84 : 104, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 22, opacity: markIn, transform: 'translateY(' + (1 - markIn) * 16 + 'px)' }}>Kai’s Flow</div>
        <div style={{ fontFamily: F.mono, fontSize: vert ? 16 : 15, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.faint, marginTop: 20, opacity: tagIn }}>Your whole life. One quiet place.</div>
      </div>
      {/* one last petal falls */}
      {t > B.sign + 0.6 && (() => { const p = rl(t, B.sign + 0.6, 2.4); return <Petal x={cx + 40} y={lerp(H * 0.2, H * 0.7, p)} r={p * 200} s={1.1} color={C.blossom} o={0.8 * (1 - p)} />; })()}
      <Petals a={B.sign + 0.2} b={30} n={5} x={cx - W * 0.25} y={-20} w={W * 0.5} h={H} color={C.blossom} />
    </React.Fragment>
  );
}

// ── audio: audible <audio> for preview + muted mp3-in-video for export mix ────
function AudioLayer() {
  const { time, playing } = useTimeline();
  const aRef = React.useRef(null);
  React.useEffect(() => { const a = aRef.current; if (!a) return; const target = AUDIO_START + time; if (Math.abs(a.currentTime - target) > 0.24) { try { a.currentTime = target; } catch (e) {} } }, [time]);
  React.useEffect(() => { const a = aRef.current; if (!a) return; if (playing) a.play().catch(() => {}); else a.pause(); }, [playing]);
  React.useEffect(() => {
    const unlock = () => { const a = aRef.current; if (a && playing) a.play().catch(() => {}); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [playing]);
  return (
    <React.Fragment>
      <audio ref={aRef} src="uploads/Moonlit%20Gathering.mp3" preload="auto" style={{ display: 'none' }} />
      {VideoSprite && <VideoSprite src="uploads/Moonlit%20Gathering.mp3" start={AUDIO_START} end={AUDIO_START + DURATION} speed={1} style={{ position: 'absolute', left: 0, bottom: 0, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }} />}
    </React.Fragment>
  );
}

// ── second-marker for comment targeting ──────────────────────────────────────
function SecondMarker() {
  const t = useTime();
  return <div data-screen-label={'kinetik · t=' + Math.floor(t) + 's'} style={{ position: 'absolute', width: 1, height: 1, left: 0, top: 0, opacity: 0 }} />;
}

// ── the movie (shared by both aspects) ───────────────────────────────────────
function Movie() {
  return (
    <React.Fragment>
      <SecondMarker />
      <Sprite start={0} end={B.gather}><Scatter /></Sprite>
      <Sprite start={B.gather} end={B.capture}><GatherToday /></Sprite>
      <Sprite start={B.capture} end={B.flow}><Capture /></Sprite>
      <Sprite start={B.flow} end={17.7}><Flow /></Sprite>
      <Sprite start={B.night} end={21.95}><NightGarden /></Sprite>
      <Sprite start={B.herb} end={27.45}><Herbarium /></Sprite>
      <Sprite start={B.sign} end={30.01}><SignOff /></Sprite>
      <Vignette />
      <Grain />
      <AudioLayer />
    </React.Fragment>
  );
}

function Preload() {
  const all = ['cherry/bud.png', 'cherry/opening.png', 'cherry/bloom.png', 'daisy/midday.png', 'vine/flowering.png', 'fern/full.png', 'hydrangea/heavy.png', 'wisteria/p100.png'];
  return <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>{all.map((s, i) => <img key={i} src={A + s} alt="" />)}</div>;
}

function KinetikVideo() {
  return (
    <LayoutCtx.Provider value={{ W: 1920, H: 1080, vert: false }}>
      <Stage width={1920} height={1080} duration={DURATION} background={C.linen} persistKey="kaisflow-kinetik-16x9">
        <Preload />
        <Movie />
      </Stage>
    </LayoutCtx.Provider>
  );
}
function KinetikVideoVertical() {
  return (
    <LayoutCtx.Provider value={{ W: 1080, H: 1920, vert: true }}>
      <Stage width={1080} height={1920} duration={DURATION} background={C.linen} persistKey="kaisflow-kinetik-9x16">
        <Preload />
        <Movie />
      </Stage>
    </LayoutCtx.Provider>
  );
}
window.KinetikVideo = KinetikVideo;
window.KinetikVideoVertical = KinetikVideoVertical;
