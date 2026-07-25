// Kai's Flow — "One Day" hybrid intro. 38s, 16:9, cut to Moonlit Gathering.
// Best of all three: live-action cold open (Higgsfield) → match-cut on the
// drop into the Today page (Kinetik) → capture beat → soil-line camera
// journey with hard whips (v2) → night garden → wide garden reveal → sign-off.
// Built on animations.jsx globals.

const { Stage, Sprite, useTime, useTimeline, Easing: E, clamp: cl, interpolate, VideoSprite } = window;

// ── palette (ds/tokens, verbatim) ────────────────────────────────────────────
const C = {
  linen: '#EFE9DB', parchment: '#FBF6E9', bone: '#F6F0E1', sidebar: '#EAE3D2', goal: '#F8EFD3',
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

// the live-action slot — Higgsfield export. CDN first (reliable ranged video
// serving in preview), local copy as fallback for offline/export.
const CLIP = 'https://d8j0ntlcm91z4.cloudfront.net/user_3GPDN3hzoBL6biyce1iRdT7ZcWb/hf_20260712_141242_c27f1465-912b-4e0e-a7fc-c7fe8ed13965.mp4';
const CLIP_LOCAL = 'uploads/higgsfield-press.mp4';
const AUDIO = 'uploads/Moonlit%20Gathering-597ee8fb.mp3';

// ── signature easings (Motion.dc.html) ───────────────────────────────────────
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
const EASE_PRIMARY = cubicBezier(0.32, 0.72, 0, 1);
const EASE_BLOOM = cubicBezier(0.3, 1.3, 0.45, 1);

// ── beat map (real onsets in the track; drop = 132.45s lands at t=5.0) ───────
const DURATION = 38.0;
const AUDIO_START = 127.45;
const B = {
  drop: 5.00,                                  // match-cut, PLANT.
  today: 7.07, todayFill: 7.55,
  capture: 10.69, parse: 12.75, filed: 13.80,
  journey: 15.34,                              // TEND. — whip into the world
  sched: 18.62, blocks: [19.05, 19.55, 20.02],
  vine: 21.08,
  night: 23.40, write: 25.69, nothing: 27.75,
  wide: 29.31,                                 // GATHER. — pull back
  sign: 31.9, end: 38.0,
};

// ── math ─────────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const rl = (t, t0, d) => cl((t - t0) / d, 0, 1);
const rp = (t, t0, d) => EASE_PRIMARY(rl(t, t0, d));
const rb = (t, t0, d) => EASE_BLOOM(rl(t, t0, d));
const rc = (t, t0, d) => E.easeOutCubic(rl(t, t0, d));
const rio = (t, t0, d) => E.easeInOutCubic(rl(t, t0, d));
const rback = (t, t0, d) => E.easeOutBack(rl(t, t0, d));
const rexpo = (t, t0, d) => E.easeOutExpo(rl(t, t0, d));
const win = (t, a, b2, fin, fout) => { if (t < a || t > b2) return 0; let o = 1; if (t < a + fin) o = (t - a) / fin; else if (t > b2 - fout) o = (b2 - t) / fout; return E.easeInOutSine(cl(o, 0, 1)); };

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
function Petal({ x, y, r, s, color, o }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: 13 * (s || 1), height: 17 * (s || 1), background: color || C.blossom, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', transform: 'rotate(' + (r || 0) + 'deg)', opacity: o == null ? 0.9 : o, filter: 'drop-shadow(0 1px 1px rgba(60,52,38,0.15))' }} />;
}
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
    items.push(<Petal key={i} x={px} y={py} r={rot} s={0.7 + Math.abs(sy) * 0.6} color={color} o={0.55 * (1 - fallT)} />);
  }
  return <React.Fragment>{items}</React.Fragment>;
}
function Grain() { return <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.5, pointerEvents: 'none', zIndex: 90 }} />; }
function Vignette() { return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 91, background: 'radial-gradient(125% 125% at 50% 42%, transparent 56%, rgba(40,34,26,0.16) 100%)' }} />; }
function Bg({ color }) {
  return <div style={{ position: 'absolute', inset: 0, background: color }}>
    <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
  </div>;
}

// ── slam word (one per act, lands on an onset) ───────────────────────────────
function Slam({ at, word, light }) {
  const t = useTime();
  if (t < at || t > at + 1.05) return null;
  const inn = rexpo(t, at, 0.18);
  const out = rl(t, at + 0.62, 0.38);
  return (
    <div style={{ position: 'absolute', left: 960, top: 490, transform: 'translate(-50%,-50%) scale(' + lerp(1.16, 1, inn) + ')', opacity: inn * (1 - out), zIndex: 66, pointerEvents: 'none' }}>
      <div style={{ fontFamily: F.disp, fontSize: 168, fontWeight: 500, color: light ? N.ink : C.ink, letterSpacing: '-0.02em', textShadow: light ? '0 2px 34px rgba(0,0,0,0.55)' : '0 2px 26px rgba(246,240,225,0.85)' }}>{word}</div>
    </div>
  );
}

// ── chapter caption (bottom-left) ────────────────────────────────────────────
function Caption({ start, end, num, line, line2, light }) {
  const t = useTime();
  if (t < start - 0.05 || t > end + 0.05) return null;
  const lt = t - start, dur = end - start, fin = 0.38, fout = 0.34;
  let o = 1, ty = 0;
  if (lt < fin) { const e2 = E.easeOutCubic(cl(lt / fin, 0, 1)); o = e2; ty = (1 - e2) * 20; }
  else if (lt > dur - fout) { const e2 = E.easeInCubic(cl((lt - (dur - fout)) / fout, 0, 1)); o = 1 - e2; ty = -e2 * 8; }
  const ink = light ? N.ink : C.ink, dim = light ? N.faint : C.faint;
  return (
    <div style={{ position: 'absolute', left: 118, bottom: 112, opacity: o, transform: 'translateY(' + ty + 'px)', zIndex: 70 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <Kicker color={dim} style={{ fontSize: 13 }}>{num}</Kicker>
        <span style={{ width: 190, height: 1, borderBottom: '1px dashed ' + (light ? 'rgba(240,235,221,0.3)' : C.lineDashed) }} />
      </div>
      <div style={{ fontFamily: F.disp, fontSize: 72, fontWeight: 500, color: ink, letterSpacing: '-0.02em', lineHeight: 1.0 }}>{line}</div>
      {line2 && <div style={{ fontFamily: F.disp, fontSize: 72, fontWeight: 500, color: ink, letterSpacing: '-0.02em', lineHeight: 1.05, opacity: 0.9 }}>{line2}</div>}
    </div>
  );
}

// ═══ ACT 1 — LIVE ACTION [0, 5.0] ════════════════════════════════════════════
// Full-bleed Higgsfield clip. Falls back to a styled slot until the mp4 exists.
function LiveScene() {
  const t = useTime();
  // Render the clip optimistically; only fall back to the placeholder on a
  // definitive load error. A metadata probe on a freshly-served file can hang
  // forever, so we never gate the video on it — we only listen for errors.
  const [errored, setErrored] = React.useState(false);
  const kick = win(t, 1.0, 4.3, 0.6, 0.5);
  const ken = 1 + t * 0.006;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: '#1d1a14', overflow: 'hidden' }}>
        {/* the clip — always mounted so it starts loading immediately */}
        {!errored && (
          <div style={{ position: 'absolute', inset: 0, transform: 'scale(' + ken + ')', transformOrigin: '50% 45%' }}>
            <VideoSprite src={CLIP} start={0} end={5} speed={1} onError={() => setErrored(true)} style={{ width: 1920, height: 1080, objectFit: 'cover' }}>
              <source src={CLIP} type="video/mp4" />
              <source src={CLIP_LOCAL} type="video/mp4" />
            </VideoSprite>
          </div>
        )}
        {/* placeholder slot (only if the clip genuinely fails to load) */}
        {errored && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(-45deg, #201c15 0 26px, #1d1a14 26px 52px)' }}>
            <div style={{ border: '1.5px dashed rgba(240,235,221,0.35)', borderRadius: 6, padding: '44px 60px', textAlign: 'center' }}>
              <div style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(240,235,221,0.75)' }}>Live-action slot · 0:00 – 0:05</div>
              <div style={{ fontFamily: F.mono, fontSize: 13.5, letterSpacing: '0.08em', color: 'rgba(240,235,221,0.45)', marginTop: 14, lineHeight: 1.9 }}>hands pressing a sprig into a field journal<br />drop your Higgsfield clip at<br /><span style={{ color: N.gold }}>uploads/higgsfield-press.mp4</span></div>
            </div>
          </div>
        )}
        {/* warm cinematic grade over the clip */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 50% 40%, transparent 46%, rgba(20,14,8,0.5) 100%)', pointerEvents: 'none' }} />
      </div>
      {/* quiet kicker */}
      <div style={{ position: 'absolute', left: 118, bottom: 118, opacity: kick, transform: 'translateY(' + (1 - kick) * 14 + 'px)', zIndex: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <Kicker color="rgba(240,235,221,0.7)" style={{ fontSize: 13 }}>Kai's Flow</Kicker>
          <span style={{ width: 170, height: 1, borderBottom: '1px dashed rgba(240,235,221,0.3)' }} />
        </div>
        <div style={{ fontFamily: F.disp, fontSize: 56, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em', textShadow: '0 2px 24px rgba(0,0,0,0.6)' }}>Some days are worth keeping.</div>
      </div>
      {/* last-frame flash to sell the cut */}
      <div style={{ position: 'absolute', inset: 0, background: C.bone, opacity: rl(t, 4.9, 0.1) * 0.0, pointerEvents: 'none' }} />
    </React.Fragment>
  );
}

// ═══ ACT 2 — MATCH-CUT: THE PAGE BECOMES THE APP [5.0, 10.69] ════════════════
const PLANROWS = [
  { txt: 'Deliver the MVP of the forecasting app', goal: true },
  { txt: 'Plan & implement the forecasting logic' },
  { txt: 'Create official emails for Shaheen' },
];
function TodayBloom() {
  const t = useTime();
  const cardIn = rl(t, B.drop, 0.1);                     // hard paint on the cut
  const settle = rp(t, B.drop + 0.05, 1.15);             // page pulls back → it's a card
  const push = rc(t, B.today, 3.2);                      // slow push after
  const cardW = 980, cardH = 740;
  const cx = 960, cy = 530;
  const scale = lerp(1.62, 1.0, settle) * lerp(1, 1.05, push);
  const cherryStage = t < B.todayFill + 0.4 ? 'cherry/bud.png' : t < 9.4 ? 'cherry/opening.png' : 'cherry/bloom.png';
  return (
    <React.Fragment>
      <Bg color={C.bone} />
      <div style={{ position: 'absolute', left: cx, top: cy, width: cardW, height: cardH, transform: 'translate(-50%,-50%) scale(' + scale + ')', opacity: cardIn, zIndex: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 34px 70px rgba(60,52,38,0.20)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: -11, left: '50%', width: 92, height: 20, marginLeft: -46, background: 'rgba(138,154,126,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, opacity: settle }} />
          <div style={{ padding: '40px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Kicker>Today</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: 48, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 6 }}>Friday, July 10</div>
              </div>
              <img src={A + cherryStage} alt="" style={{ height: 108, filter: DROP, transform: 'scale(' + rb(t, B.todayFill, 0.6) + ')', transformOrigin: '50% 100%', opacity: rc(t, B.todayFill, 0.4) }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 12px' }}>
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
                    <div style={{ fontFamily: isG ? F.disp : F.ui, fontSize: isG ? 24 : 18, fontWeight: isG ? 600 : 400, color: isG ? '#4a3a1e' : C.ink, marginTop: isG ? 5 : 0 }}>{r.txt}</div>
                  </div>
                  {isG ? <div style={{ fontFamily: F.hand, fontSize: 17, color: C.gold, flex: 'none' }}>for luck</div> : <span style={{ color: C.terra, fontSize: 18, flex: 'none' }}>★</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Petals a={B.todayFill} b={10.69} n={12} x={cx - cardW / 2} y={cy - cardH / 2} w={cardW} h={cardH * 0.9} color={C.blossom} />
      <Caption start={B.today + 0.15} end={10.6} num="01 · One place" line="The day, as it blooms." />
    </React.Fragment>
  );
}

// ═══ ACT 3 — CAPTURE [10.69, 15.34] ══════════════════════════════════════════
const CAP_TEXT = 'call mom friday 6pm';
function Capture() {
  const t = useTime();
  const cx = 960, cy = 454;
  const barW = 1060;
  const barIn = rb(t, B.capture, 0.34);
  const typed = Math.round(rl(t, B.capture + 0.3, 1.4) * CAP_TEXT.length);
  const shown = CAP_TEXT.slice(0, typed);
  const parse = rp(t, B.parse, 0.7);
  const filed = rp(t, B.filed, 0.7);
  const chipStartX = cx - barW * 0.5 + 210, chipStartY = cy + 6;
  const gridX = cx + barW * 0.5 - 40, gridY = cy + 150;
  const chipX = lerp(chipStartX, gridX, parse), chipY = lerp(chipStartY, gridY, parse) - Math.sin(parse * Math.PI) * 90;
  return (
    <React.Fragment>
      <Bg color={C.linen} />
      <div style={{ position: 'absolute', left: cx, top: cy, width: barW, transform: 'translate(-50%,-50%) scale(' + lerp(0.96, 1, barIn) + ')', opacity: barIn, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Kicker>⌘ Quick capture</Kicker></div>
        <div style={{ background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 14, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 54px rgba(60,52,38,0.18)', padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.terra, flex: 'none', boxShadow: '0 0 0 6px rgba(181,101,74,0.14)' }} />
          <div style={{ flex: 1, fontFamily: F.ui, fontSize: 30, color: C.ink }}>
            {shown}<span style={{ opacity: (t * 2) % 1 > 0.5 ? 1 : 0.15, color: C.terra }}>|</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3.5, height: 30, opacity: 1 - filed }}>
            {[10, 22, 34, 16, 26, 14, 20].map((h, i) => <span key={i} style={{ width: 4, height: h + Math.abs(Math.sin(t * 4 + i)) * 12 * (1 - rl(t, B.parse, 0.5)), borderRadius: 2, background: C.terra, opacity: 0.6 }} />)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center', opacity: rc(t, B.parse - 0.1, 0.4) }}>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.moss, background: 'rgba(138,154,126,0.16)', padding: '5px 11px', borderRadius: 999 }}>◦ Task</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.lavender, background: 'rgba(168,160,190,0.18)', padding: '5px 11px', borderRadius: 999 }}>◷ Fri 6:00 PM</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A4A58', background: 'rgba(212,168,176,0.18)', padding: '5px 11px', borderRadius: 999 }}>♥ Mom</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: gridX, top: gridY, transform: 'translate(-50%,-40%)', width: 150, opacity: rc(t, B.parse - 0.2, 0.4), zIndex: 8 }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.faint, textAlign: 'center', marginBottom: 6 }}>Fri</div>
        <div style={{ height: 150, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 6, position: 'relative' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ position: 'absolute', left: 8, right: 8, top: 12 + i * 44, borderTop: '1px dashed ' + C.lineDashed }} />)}
          <div style={{ position: 'absolute', left: 8, right: 8, top: 100, height: 40, background: 'rgba(168,160,190,0.25)', border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, opacity: parse > 0.9 ? 1 : 0, transform: 'scale(' + (parse > 0.9 ? 1 : 0.9) + ')' }} />
        </div>
      </div>
      {parse > 0.02 && parse < 0.98 && (
        <div style={{ position: 'absolute', left: chipX, top: chipY, transform: 'translate(-50%,-50%) rotate(' + (1 - parse) * -8 + 'deg)', background: C.parchment, border: '1px solid ' + C.lavender, borderLeft: '3px solid ' + C.lavender, borderRadius: 4, boxShadow: '0 14px 30px rgba(60,52,38,0.26)', padding: '9px 13px', zIndex: 30 }}>
          <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.lavender }}>Fri · 6:00 PM</div>
          <div style={{ fontSize: 14, color: C.ink }}>Call mom</div>
        </div>
      )}
      <Caption start={B.capture + 0.25} end={15.25} num="02 · Capture" line="Say it once." line2="It files itself." />
    </React.Fragment>
  );
}

// ═══ ACT 4 — THE JOURNEY [15.34, 38] — one world, whip cuts, night, wide ═════
const SOIL = 1000;
const IOC = E.easeInOutCubic;
const camXf = interpolate([15.34, 18.1, 18.62, 20.55, 21.08, 29.31, 30.95, 38], [1040, 1040, 2240, 2240, 3320, 3320, 1890, 1890], IOC);
const camZf = interpolate([15.34, 29.31, 31.05, 38], [1, 1, 0.42, 0.42], IOC);
const CAM_Y = 700;
function CamLayer({ children, z }) {
  const t = useTime();
  const cx = camXf(t), cz = camZf(t);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: 'translate(' + (960 - cx * cz) + 'px,' + (540 - CAM_Y * cz) + 'px) scale(' + cz + ')', transformOrigin: '0 0', zIndex: z || 1 }}>
      {children}
    </div>
  );
}

const GRASS = Array.from({ length: 20 }).map((_, i) => ({
  x: 340 + i * 172 + ((i * 73) % 90), h: 14 + ((i * 37) % 12),
}));
function Ground() {
  const t = useTime();
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: -1400, top: SOIL, width: 6800, height: 1400, background: '#E7E0CC' }} />
      <div style={{ position: 'absolute', left: -1400, top: SOIL, width: 6800, borderTop: '1.5px dashed ' + C.lineDashed }} />
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

function PlantSpot({ x, at, src, h, label }) {
  const t = useTime();
  if (t < at) return null;
  const g = rback(t, at, 0.8);
  const sway = 1.3 * Math.sin(t * 0.9 + x * 0.01);
  const lab = rc(t, at + 0.6, 0.6);
  return (
    <div style={{ position: 'absolute', left: x, top: SOIL + 2 }}>
      <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) scale(' + cl(g, 0, 1.06) + ') rotate(' + sway + 'deg)', transformOrigin: '50% 100%' }}>
        <Leafy src={src} style={{ height: h }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: 14, transform: 'translateX(-50%)', opacity: lab, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <Kicker style={{ fontSize: 10.5 }}>{label}</Kicker>
      </div>
    </div>
  );
}

// station 1 — PLAN (x≈1040): the Top-3 page, seeds hop into rows, cherry stays
function PlanStation() {
  const t = useTime();
  const plant = <PlantSpot x={1500} at={17.75} src="cherry/bloom.png" h={265} label="Today" />;
  if (t > 19.2) return plant;
  const un = rexpo(t, 15.55, 0.6);
  const gone = 1 - rl(t, 18.35, 0.3);
  const W = 780, H = 540, left = 1040 - W / 2, top = SOIL - 4 - H;
  const gleam = win(t, 17.3, 18.2, 0.3, 0.4);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: left, top: top, width: W, height: H, transform: 'scale(' + un + ')', transformOrigin: '50% 100%', opacity: cl(un * 1.4, 0, 1) * gone, zIndex: 6 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 50px rgba(60,52,38,0.16)' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: -11, left: '50%', width: 84, height: 20, marginLeft: -42, background: 'rgba(138,154,126,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
          <div style={{ padding: '30px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Kicker>Plan · 8:30 AM</Kicker>
                <div style={{ fontFamily: F.disp, fontSize: 36, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', marginTop: 5 }}>Three that matter</div>
              </div>
              <Leafy src="clover/four_leaf.png" style={{ width: 42 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '22px 0 10px' }}>
              <Kicker style={{ fontSize: 10.5 }}>Top 3 for today</Kicker>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed ' + C.lineDashed }} />
            </div>
            {PLANROWS.map((r, i) => {
              const tin = rc(t, 16.1 + i * 0.4, 0.5);
              const isG = r.goal;
              return (
                <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: isG ? '14px 14px' : '12px 4px', marginBottom: isG ? 8 : 0, background: isG ? C.goal : 'transparent', border: isG ? '1px solid ' + C.lineGoal : 'none', borderBottom: isG ? '1px solid ' + C.lineGoal : '1px dashed ' + C.lineDashed, borderRadius: isG ? 3 : 0, boxShadow: isG ? '0 1px 2px rgba(60,52,38,0.12),0 6px 16px rgba(154,123,58,' + (0.14 + gleam * 0.2) + ')' : 'none', transform: isG ? 'rotate(-0.4deg) scale(' + (1 + gleam * 0.015) + ')' : 'none' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, flex: 'none', border: '1.5px solid ' + (isG ? C.gold : '#bfb8a3'), background: 'rgba(255,255,255,0.5)', opacity: tin }} />
                  <div style={{ flex: 1, opacity: tin, transform: 'translateY(' + lerp(8, 0, tin) + 'px)' }}>
                    {isG && <Kicker color={C.gold} style={{ fontSize: 9 }}>✶ Goal of the day</Kicker>}
                    <div style={{ fontFamily: isG ? F.disp : F.ui, fontSize: isG ? 21 : 16, fontWeight: isG ? 600 : 400, color: isG ? '#4a3a1e' : C.ink, marginTop: isG ? 4 : 0 }}>{r.txt}</div>
                  </div>
                  {isG
                    ? <div style={{ fontFamily: F.hand, fontSize: 14, color: C.gold, flex: 'none', opacity: tin }}>for luck</div>
                    : <span style={{ color: C.terra, fontSize: 16, opacity: tin }}>★</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* seeds hop from the soil into the rows */}
      {PLANROWS.map((r, i) => {
        const p = rio(t, 15.85 + i * 0.4, 0.55);
        if (p <= 0 || p >= 1) return null;
        const x0 = 920 + i * 90, y0 = SOIL - 8;
        const x1 = left + 50, y1 = top + 188 + (i === 0 ? 30 : 96 + (i - 1) * 47 + 30);
        const x = lerp(x0, x1, p), y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * 190;
        return <div key={'s' + i} style={{ position: 'absolute', left: x, top: y, width: 16, height: 21, transform: 'translate(-50%,-50%) rotate(' + p * -260 + 'deg)', background: C.ink, borderRadius: '50% 50% 46% 46%', zIndex: 8 }} />;
      })}
      {plant}
    </React.Fragment>
  );
}

// station 2 — SCHEDULE (x≈2240): blocks snap onto the grid on beats, daisy stays
function SchedStation() {
  const t = useTime();
  const plant = <PlantSpot x={2700} at={20.55} src="daisy/midday.png" h={280} label="Calendar" />;
  if (t < 18.4) return null;
  if (t > 21.8) return plant;
  const un = rexpo(t, 18.66, 0.55);
  const gone = 1 - rl(t, 20.95, 0.35);
  const W = 830, H = 520, left = 2240 - W / 2, top = SOIL - 4 - H;
  const blocks = [
    { at: B.blocks[0], y: 0.08, h: 0.30, color: C.lavender, tint: 'rgba(168,160,190,0.24)', title: 'Deep work — Forecasting', time: '9:00 – 11:00' },
    { at: B.blocks[1], y: 0.46, h: 0.18, color: C.hydrangea, tint: 'rgba(154,180,190,0.24)', title: 'Standup', time: '11:30' },
    { at: B.blocks[2], y: 0.68, h: 0.24, color: C.blossom, tint: 'rgba(212,168,176,0.22)', title: 'Call mom', time: '6:00 PM' },
  ];
  const hours = ['9', '10', '11', '12', '1'];
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: left, top: top, width: W, height: H, transform: 'scale(' + un + ')', transformOrigin: '50% 100%', opacity: cl(un * 1.4, 0, 1) * gone, zIndex: 6 }}>
        <div style={{ position: 'absolute', inset: 0, background: C.parchment, border: '1px solid ' + C.lineCard, borderRadius: 4, boxShadow: '0 2px 6px rgba(60,52,38,0.12),0 24px 50px rgba(60,52,38,0.16)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: NOISE, mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '22px 28px 10px' }}>
            <div><Kicker>Calendar · 9:12 AM</Kicker><div style={{ fontFamily: F.disp, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 4 }}>Everything gets a time</div></div>
          </div>
          <div style={{ position: 'relative', padding: '0 28px 18px', height: H - 92 }}>
            {hours.map((hh, i) => <div key={i} style={{ position: 'absolute', left: 28, right: 28, top: (i / hours.length) * (H - 112), display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 34, fontFamily: F.mono, fontSize: 12, color: C.faint }}>{hh}</span><span style={{ flex: 1, borderTop: '1px dashed ' + C.lineDashed }} /></div>)}
            {blocks.map((bk, i) => {
              const s = rb(t, bk.at, 0.34);
              const top2 = bk.y * (H - 126) + 6, h2 = bk.h * (H - 126);
              return <div key={i} style={{ position: 'absolute', left: 74, right: 32, top: top2, height: h2, background: bk.tint, border: '1px solid ' + bk.color, borderLeft: '3px solid ' + bk.color, borderRadius: 4, padding: '9px 14px', opacity: s, transform: 'scale(' + lerp(0.9, 1, s) + ')', transformOrigin: '50% 0%', boxShadow: '0 6px 16px rgba(60,52,38,0.10)' }}>
                <div style={{ fontSize: 15, color: C.ink, fontWeight: 500 }}>{bk.title}</div>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: bk.color, marginTop: 3 }}>{bk.time}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
      {plant}
    </React.Fragment>
  );
}

// station 3 — CULTIVATE (x≈3320): the streak vine climbs
function VineStation() {
  const t = useTime();
  if (t < 20.8) return null;
  const A0 = B.vine;
  const stages = ['vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png'];
  const marks = [A0, A0 + 0.65, A0 + 1.35, A0 + 2.0];
  const growP = rio(t, A0, 2.2);
  const vh = lerp(300, 640, growP);
  const uiO = win(t, A0 + 0.3, 29.31, 0.5, 0.8);
  const streak = Math.round(lerp(1, 30, rio(t, A0 + 0.3, 2.0)));
  const dots = 7; const filled = Math.round(lerp(0, dots, rio(t, A0 + 0.3, 2.0)));
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 3320, top: SOIL + 2 }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'translateX(-50%) rotate(' + 1.1 * Math.sin(t * 0.8) + 'deg)', transformOrigin: '50% 100%' }}>
          {stages.map((src, i) => {
            const nxt = marks[i + 1] != null ? marks[i + 1] : 1e9;
            let op = i === stages.length - 1 ? rl(t, marks[i], 0.55) : rl(t, marks[i], 0.5) * (1 - rl(t, nxt, 0.5));
            if (i === 0) op = rc(t, A0 - 0.2, 0.4) * (1 - rl(t, marks[1], 0.5));
            return <Leafy key={i} src={src} style={{ position: 'absolute', bottom: 0, left: '50%', height: vh, transform: 'translateX(-50%)', opacity: cl(op, 0, 1) }} />;
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, top: 14, transform: 'translateX(-50%)', opacity: rc(t, A0 + 1.8, 0.6), whiteSpace: 'nowrap' }}>
          <Kicker style={{ fontSize: 10.5 }}>Routines</Kicker>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 3480, top: 440, opacity: uiO, transform: 'translateY(' + lerp(16, 0, rc(t, A0 + 0.3, 0.6)) + 'px)' }}>
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
    </React.Fragment>
  );
}

// night lantern glows behind the garden row (world space)
function LanternGlows() {
  const t = useTime();
  const p = rl(t, B.night + 0.4, 1.4);
  if (p <= 0.01) return null;
  return (
    <React.Fragment>
      {[460, 1500, 2700, 3320].map((x, i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: SOIL - 170, width: 440, height: 440, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(246,226,140,0.14) 0%, rgba(246,226,140,0) 62%)', opacity: p }} />
      ))}
    </React.Fragment>
  );
}

// ── screen-space: dusk grade + night veil ────────────────────────────────────
const duskOf = interpolate([21.3, 23.4], [0, 0.14]);
const veilOf = interpolate([B.night, B.night + 1.3, 34.5, 37.6], [0, 0.56, 0.56, 0.72]);
function LightGrade() {
  const t = useTime();
  if (t < 21.0) return null;
  const dusk = duskOf(t) * (1 - rl(t, B.night, 1.3)), veil = veilOf(t);
  return (
    <React.Fragment>
      {dusk > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#C9803F', mixBlendMode: 'multiply', opacity: dusk, pointerEvents: 'none', zIndex: 40 }} />}
      {veil > 0.01 && <div style={{ position: 'absolute', inset: 0, background: N.page, opacity: veil, pointerEvents: 'none', zIndex: 41 }} />}
    </React.Fragment>
  );
}

// ── screen-space night sky: stars, moon, fireflies ───────────────────────────
function NightSky() {
  const t = useTime();
  const p = rl(t, B.night + 0.3, 1.4);
  if (p <= 0.01) return null;
  const moonY = lerp(220, 130, rc(t, B.night, 3));
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none' }}>
      {Array.from({ length: 40 }).map((_, i) => { const sx = (Math.sin(i * 12.9) * 43758) % 1, sy = (Math.sin(i * 78.2) * 43758) % 1; return <div key={i} style={{ position: 'absolute', left: Math.abs(sx) * 1920, top: Math.abs(sy) * 620, width: 2.5, height: 2.5, borderRadius: '50%', background: 'rgba(255,250,230,0.9)', boxShadow: '0 0 6px rgba(255,250,230,0.6)', opacity: p * (0.3 + 0.6 * Math.abs(Math.sin(t * 1.4 + i))) }} />; })}
      <div style={{ position: 'absolute', left: 1560, top: moonY, transform: 'translate(-50%,-50%)', opacity: p }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 380, height: 380, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,235,221,0.18), transparent 60%)' }} />
        <div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', background: '#F0EBDD', boxShadow: '0 0 44px rgba(240,235,221,0.5)' }}><div style={{ position: 'absolute', left: -23, top: -13, width: 96, height: 96, borderRadius: '50%', background: N.page, opacity: 0.92 }} /></div>
      </div>
      {Array.from({ length: 10 }).map((_, i) => { const bx = (0.1 + i * 0.088) * 1920, by = (0.6 + (Math.sin(i * 3.1) * 0.16)) * 1080; const dx = 42 * Math.sin(t * 0.7 + i), dy = 28 * Math.sin(t * 1.1 + i * 2); return <div key={'f' + i} style={{ position: 'absolute', left: bx + dx, top: by + dy, width: 7, height: 7, borderRadius: '50%', background: N.firefly, boxShadow: '0 0 14px rgba(246,226,140,0.9),0 0 30px rgba(246,226,140,0.4)', opacity: p * (0.35 + 0.6 * Math.abs(Math.sin(t * 1.8 + i))) }} />; })}
    </div>
  );
}

// ── night journal card (screen space) ────────────────────────────────────────
const NIGHT_HAND = "Shipped the model. Called mom.\nA good, full day. ✿";
function NightJournal() {
  const t = useTime();
  if (t < B.night + 0.8 || t > B.wide - 0.05) return null;
  const cardIn = rp(t, B.night + 1.0, 0.55) * (1 - rl(t, B.wide - 0.5, 0.45));
  const writeN = Math.round(rl(t, B.write, 1.7) * NIGHT_HAND.length);
  const shown = NIGHT_HAND.slice(0, writeN);
  return (
    <div style={{ position: 'absolute', left: 960, top: 460, width: 720, transform: 'translate(-50%,-50%) translateY(' + (1 - cardIn) * 20 + 'px)', opacity: cardIn, zIndex: 44 }}>
      <div style={{ background: N.card, border: '1px solid ' + N.line, borderRadius: 6, boxShadow: '0 30px 70px rgba(0,0,0,0.5)', padding: '28px 32px', backdropFilter: 'blur(2px)' }}>
        <Kicker color={N.faint} style={{ fontSize: 11 }}>Journal · Friday night</Kicker>
        <div style={{ fontFamily: F.hand, fontSize: 36, color: N.ink, lineHeight: 1.35, marginTop: 12, whiteSpace: 'pre-wrap', minHeight: 100 }}>{shown}<span style={{ opacity: (t * 2) % 1 > 0.5 && writeN < NIGHT_HAND.length ? 1 : 0, color: N.gold }}>|</span></div>
      </div>
    </div>
  );
}

// ── ending: logo draws, wordmark, tagline (screen space, over the wide) ──────
function Ending() {
  const t = useTime();
  if (t < B.sign - 0.1) return null;
  const draw = rc(t, B.sign + 0.05, 1.1);
  const markIn = rb(t, B.sign + 0.1, 0.7);
  const tagIn = rc(t, B.sign + 1.7, 0.7);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 960, top: 400, transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(' + lerp(0.7, 1, markIn) + ')', opacity: markIn }}><LeafLogo size={96} glow draw={draw} /></div>
        <div style={{ fontFamily: F.disp, fontSize: 100, fontWeight: 500, color: N.ink, letterSpacing: '-0.02em', marginTop: 20, opacity: markIn, transform: 'translateY(' + (1 - markIn) * 16 + 'px)', textShadow: '0 2px 30px rgba(0,0,0,0.4)' }}>Kai’s Flow</div>
        <div style={{ fontFamily: F.hand, fontSize: 44, color: N.gold, marginTop: 14, opacity: tagIn, textShadow: '0 0 26px rgba(228,195,107,0.3)' }}>plant your day ✿</div>
      </div>
    </div>
  );
}

// ── audio: audible <audio> for preview + mp3-in-video for export mix ─────────
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
      <audio ref={aRef} src={AUDIO} preload="auto" style={{ display: 'none' }} />
      {VideoSprite && <VideoSprite src={AUDIO} start={AUDIO_START} end={AUDIO_START + DURATION} speed={1} style={{ position: 'absolute', left: 0, bottom: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: 'none' }} />}
    </React.Fragment>
  );
}

function SecondMarker() {
  const t = useTime();
  return <div data-screen-label={'hybrid · t=' + Math.floor(t) + 's'} style={{ position: 'absolute', width: 1, height: 1, left: 0, top: 0, opacity: 0 }} />;
}

function Journey() {
  const t = useTime();
  return (
    <React.Fragment>
      <Bg color={C.linen} />
      <CamLayer z={1}>
        <Ground />
        <PlantSpot x={460} at={15.6} src="hydrangea/light.png" h={225} label="Inbox" />
        <PlanStation />
        <SchedStation />
        <VineStation />
        <LanternGlows />
      </CamLayer>
      <LightGrade />
      <NightSky />
      <NightJournal />
      {/* petals over the wide reveal */}
      {t > B.wide + 0.6 && <Petals a={B.wide + 0.6} b={35.5} n={12} x={300} y={-20} w={1320} h={900} color={C.blossom} />}
      <Caption start={15.95} end={18.3} num="03 · Plan" line="Three things that matter." />
      <Caption start={19.1} end={20.85} num="04 · Schedule" line="Everything gets a time." />
      <Caption start={21.5} end={23.25} num="05 · Cultivate" line="A little, every day." />
      <Caption start={B.nothing} end={B.wide - 0.15} num="06 · Keep" line="Nothing is lost." light />
    </React.Fragment>
  );
}

function Preload() {
  const all = ['cherry/bud.png', 'cherry/opening.png', 'cherry/bloom.png', 'daisy/midday.png', 'clover/four_leaf.png', 'hydrangea/light.png', 'vine/bare.png', 'vine/sprouting.png', 'vine/flowering.png', 'vine/lush.png'];
  return <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>{all.map((s, i) => <img key={i} src={A + s} alt="" />)}</div>;
}

function IntroVideoHybrid() {
  return (
    <Stage width={1920} height={1080} duration={DURATION} background={C.linen} persistKey="kaisflow-hybrid-16x9">
      <Preload />
      <SecondMarker />
      <Sprite start={0} end={B.drop}><LiveScene /></Sprite>
      <Sprite start={B.drop} end={B.capture}><TodayBloom /></Sprite>
      <Sprite start={B.capture} end={B.journey}><Capture /></Sprite>
      <Sprite start={B.journey} end={DURATION + 0.01}><Journey /></Sprite>
      <Slam at={B.drop} word="Plant." />
      <Slam at={B.journey} word="Tend." />
      <Slam at={B.wide} word="Gather." light />
      <Sprite start={B.sign - 0.1} end={DURATION + 0.01}><Ending /></Sprite>
      <Vignette />
      <Grain />
      <AudioLayer />
    </Stage>
  );
}
window.IntroVideoHybrid = IntroVideoHybrid;
