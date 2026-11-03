// Kai's Flow desktop widgets for Übersicht (free macOS desktop widgets), direction B "Paper on glass".
// Shared by the five widgets; tools/build.mjs bundles this with each src/<widget>.jsx into one standalone
// index.jsx per widget (Übersicht loads a widget folder on its own, so each one has to carry its own copy).
//
// Data: the Widget feed (docs/log/2026-10-29-2330-widget-feed-handoff.md), read by `command` with curl.
// The one setting file is kaisflow.config.json (the link, the theme, optional positions).
// Ticking: run() + curl -X POST. Clicks: the kaisflow:// link when the desktop app is installed, else the website.
import { run } from 'uebersicht'

const MARK = '@@KF@@'
const SCHEME = 'kaisflow'
const BUNDLE_ID = 'com.kaisflow.garden'
const WEB = 'https://kais-flow.kaidagoat.workers.dev'
const WEB_PATH = { today: 'today', calendar: 'calendar', focus: 'focus', capture: 'new' } // the web app has no /capture
const SIZE = { today: [360, 360], nownext: [360, 170], daybar: [360, 170], goal: [170, 170], next: [170, 170] }
const HOME = { today: [20, 44], nownext: [20, 424], daybar: [20, 614], goal: [20, 804], next: [210, 804] }
const DEFAULTS = { link: '', theme: 'auto', appUrl: WEB, nightFrom: 19, nightTo: 6 }

// ---------------------------------------------------------------- the command: config + app check + feed
// Runs in /bin/sh every minute. Output: marker lines, then the config on one line, the app flag, the feed body.
export const command = String.raw`cfg=""
for f in ./kaisflow.config.json ../kaisflow.config.json "$HOME/Library/Application Support/Übersicht/widgets/Kais-Flow/kaisflow.config.json" "$HOME/kaisflow.config.json"; do
  if [ -f "$f" ]; then cfg="$f"; break; fi
done
echo "${MARK}CFG $cfg"
echo "${MARK}JSON"
if [ -n "$cfg" ]; then tr -d '\n\r' < "$cfg"; fi
echo
link=""
if [ -n "$cfg" ]; then link=$(tr -d '\n\r' < "$cfg" | sed -n 's/.*"link"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'); fi
case "$link" in https://*|http://localhost*|http://127.0.0.1*) ;; *) link="" ;; esac
app=0
if [ -d "/Applications/Kai's Flow.app" ] || [ -d "$HOME/Applications/Kai's Flow.app" ]; then app=1
elif [ -n "$(mdfind "kMDItemCFBundleIdentifier == '${BUNDLE_ID}'" 2>/dev/null | head -n 1)" ]; then app=1; fi
echo "${MARK}APP $app"
echo "${MARK}FEED"
if [ -n "$link" ]; then curl -s -m 15 "$link"; fi`

export function parseOutput(out) {
  const text = String(out ?? '')
  const at = (m) => text.indexOf(MARK + m)
  const [c, j, a, f] = ['CFG', 'JSON', 'APP', 'FEED'].map(at)
  if (c < 0 || j < 0 || a < 0 || f < 0) return { ok: false, cfgPath: '', config: null, app: false, body: '' }
  const line = (from, to) => text.slice(from, to).split('\n').slice(1).join('\n')
  let config = null
  try { config = JSON.parse(line(j, a).trim() || 'null') } catch { config = false } // false = there but not JSON
  return {
    ok: true,
    cfgPath: text.slice(c + MARK.length + 4, text.indexOf('\n', c)).trim(),
    config,
    app: text.slice(a + MARK.length + 3, text.indexOf('\n', a)).trim() === '1',
    body: text.slice(f + MARK.length + 4).replace(/^\n/, '').trim(),
  }
}

// ---------------------------------------------------------------- the feed
export function parseFeed(body) {
  let t
  try { t = JSON.parse(body) } catch { return { err: 'bad' } }
  if (!t || typeof t !== 'object') return { err: 'bad' }
  if (t.error) return { err: t.error }
  if (t.v !== 1) return { err: 'bad' }
  t.top3 ||= []; t.tasks ||= []; t.next_blocks ||= []; t.day ||= []
  return { feed: t }
}

const nowMs = () => globalThis.__KF_NOW__ ?? Date.now() // the harness fixes the clock

export const initialState = { feed: null, problem: 'loading', pending: {}, cfg: { ...DEFAULTS }, cfgPath: '', app: false, note: null }

export function updateState(event, prev) {
  switch (event.type) {
    case 'tick': return { ...prev, pending: { ...prev.pending, [event.id]: nowMs() } }
    case 'tickFailed': { const p = { ...prev.pending }; delete p[event.id]; return { ...prev, pending: p, note: { text: "That didn't tick. Try again in Kai's Flow.", until: nowMs() + 5000 } } }
    case 'note': return { ...prev, note: { text: event.text, until: nowMs() + 5000 } }
    case 'clearNote': return { ...prev, note: null }
    default:
      if (typeof event.output !== 'string' && !event.error) return prev // not a command result
  }
  // a command result (Übersicht's own, or ours after a tick or "Try again")
  const o = parseOutput(event.output)
  if (!o.ok) return { ...prev, problem: prev.feed ? null : 'offline' } // the command itself failed: keep what is on screen
  const next = { ...prev, cfgPath: o.cfgPath, app: o.app }
  if (o.config === false) return { ...next, cfg: { ...DEFAULTS }, feed: null, problem: 'badconfig' }
  next.cfg = { ...DEFAULTS, ...(o.config || {}) }
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(next.cfg.link || '')) return { ...next, feed: null, problem: 'nolink' }
  if (!o.body) return { ...next, problem: prev.feed ? null : 'offline' } // a bad fetch after a good one keeps the day
  const r = parseFeed(o.body)
  if (r.feed) {
    const pending = { ...prev.pending }
    const open = openIds(r.feed), t = nowMs()
    for (const id of Object.keys(pending)) if (!open[id] || t - pending[id] > 120000) delete pending[id]
    return { ...next, feed: r.feed, problem: null, pending }
  }
  if (r.err === 'unauthorized') return { ...next, feed: null, problem: 'unauthorized' }
  if (prev.feed) return { ...next, problem: null }
  return { ...next, problem: r.err === 'rate_limited' ? 'busy' : 'bad' }
}

function openIds(feed) {
  const ids = {}
  if (feed.goal && !feed.goal.done) ids[feed.goal.id] = true
  for (const it of feed.top3) if (!it.done) ids[it.id] = true
  for (const it of feed.tasks) ids[it.id] = true
  return ids
}

// ---------------------------------------------------------------- Kai's Flow's palette C (the same table widget.lua has)
const SWATCH = {
  E58F99: ['7F3F48', 'F4A4AD', 'FFDADD'], E29572: ['7D4328', 'F2AA8B', 'FFDCCD'], C9A658: ['694E01', 'DAB975', 'F3E3C1'],
  A0B569: ['4B5A1B', 'B3C882', 'DCE7C4'], '72BF8E': ['1D5E3A', '8BD0A3', 'C9EBD4'], '47BFC5': ['065C5F', '6BD0D6', 'BDEBEE'],
  '81ADED': ['325383', '98C0FB', 'D6E6FE'], B59CE3: ['5D497F', 'C7B0F2', 'E9DEFF'], B36670: ['743840', 'D38A92', 'F7CFD2'],
  B16C4C: ['723C23', 'D19072', 'F6D3C3'], '9C7B31': ['634902', 'BB9D5D', 'E8D9B9'], '768A42': ['435215', '98AB6A', 'D2DDBC'],
  '4A9266': ['1B5836', '72B289', 'C1E0CB'], '0D9298': ['035256', '53B3B8', 'B6E1E4'], '5A81BC': ['2F4D7B', '7EA3DA', 'C9DCF9'],
  '8972B3': ['574477', 'AA95D2', 'DFD5F5'],
}
const LEGACY = { A8A0BE: 'B59CE3', '8A9A7E': '768A42', '7A946E': '768A42', B5654A: 'B16C4C', D4A8B0: 'E58F99', '9AB4BE': '47BFC5', D4C78A: 'C9A658', C9A0A0: 'E58F99', C9A55A: 'C9A658' }

// a block's accent and its text tone for day or night; a custom colour keeps its hex (its text is the hex mixed into the ink)
function hue(hex, night) {
  let h = ((hex || '').match(/^#([0-9a-f]{6})$/i)?.[1] || 'B59CE3').toUpperCase()
  h = LEGACY[h] || h
  const s = SWATCH[h]
  if (s) return night ? { c: '#' + s[1], ink: '#' + s[2] } : { c: '#' + h, ink: '#' + s[0] }
  return { c: '#' + h, ink: `color-mix(in srgb, #${h} 55%, var(--ink))` }
}
const blockVars = (hex, night) => { const h = hue(hex, night); return { '--c': h.c, '--ci': h.ink } }

// ---------------------------------------------------------------- time and words
function zoneParts(ms, zone) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map((x) => [x.type, x.value]))
    return { hour: +p.hour, min: +p.minute }
  } catch { const d = new Date(ms); return { hour: d.getHours(), min: d.getMinutes() } }
}
const hm = (m) => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')}`
const ap = (m) => (Math.floor(m / 60) % 24 >= 12 ? 'PM' : 'AM')
const minOf = (s) => { const m = /^(\d+):(\d+)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0 }
const range = (a, b) => `${hm(a)}–${hm(b)} ${ap(b)}`
const dur = (m) => { m = Math.max(0, m); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` }
const dayOf = (feed, weekday) => {
  const d = new Date(`${feed.date}T12:00:00Z`)
  return `${d.toLocaleDateString('en-US', { weekday, timeZone: 'UTC' })} ${d.getUTCDate()}`
}

// ---------------------------------------------------------------- what to show (worked out from the feed, the clock and the ticks)
export function view(state) {
  const { feed, pending, cfg } = state
  const t = Math.floor(nowMs() / 1000)
  const zone = feed?.zone
  const { hour, min } = zoneParts(nowMs(), zone)
  const nowM = hour * 60 + min
  const night = cfg.theme === 'night' ? true : cfg.theme === 'day' ? false : (hour >= (+cfg.nightFrom || 19) || hour < (+cfg.nightTo || 6))
  const isDone = (it) => !!it && (it.done || pending[it.id] != null)
  let cur = null, nexts = []
  if (feed) {
    cur = feed.now_block && feed.now_block.end > t ? feed.now_block : null
    for (const b of feed.next_blocks) { if (b.start <= t && b.end > t) cur ||= b; else if (b.start > t) nexts.push(b) }
  }
  const blockOf = (id) => (!id || !feed ? null : feed.now_block?.task_id === id ? feed.now_block : feed.next_blocks.find((b) => b.task_id === id))
  const doneCount = () => {
    const open = openIds(feed)
    return `${(feed.done || 0) + Object.keys(pending).filter((id) => open[id]).length} of ${feed.total || 0} done`
  }
  const goalWhen = () => {
    const b = blockOf(feed.goal?.id)
    if (b) return range(minOf(b.start_hm), minOf(b.end_hm))
    const d = feed.day.find((x) => x.is_goal)
    return d ? range(d.from_min, d.to_min) : ''
  }
  return { feed, t, nowM, night, isDone, cur, nexts, blockOf, doneCount, goalWhen }
}

// ---------------------------------------------------------------- clicks
const safe = (s) => String(s).replace(/[^A-Za-z0-9:/._~?&=%-]/g, '')
export function openTarget(state, what) {
  const v = view(state)
  let path = what
  if (what === 'now' || what === 'next1' || what === 'next2') {
    const b = what === 'now' ? v.cur : v.nexts[what === 'next1' ? 0 : 1]
    path = b?.task_id ? `task/${b.task_id}` : 'calendar'
  }
  const id = /^task\/(.+)$/.exec(path)?.[1]
  const base = (state.cfg.appUrl || WEB).replace(/\/$/, '')
  return state.app ? `${SCHEME}://${path}` : `${base}/${id ? `tasks/${id}` : WEB_PATH[path] || 'today'}`
}
const go = (state, what) => run(`open "${safe(openTarget(state, what))}"`)

const refresh = (dispatch) => run(command).then((output) => dispatch({ type: 'ran', output }))

function tick(state, dispatch, it) {
  const v = view(state)
  if (!v.feed || v.isDone(it)) return
  if (!v.feed.can_tick) { dispatch({ type: 'note', text: "Ticking is off for this link. Turn it on in Kai's Flow." }); setTimeout(() => dispatch({ type: 'clearNote' }), 5200); return }
  dispatch({ type: 'tick', id: it.id })
  const url = `${safe(state.cfg.link)}&tick=${safe(it.id)}`
  run(`curl -s -f -m 20 -X POST '${url}'`)
    .then((out) => { if (!String(out).includes('"done"')) { dispatch({ type: 'tickFailed', id: it.id }); setTimeout(() => dispatch({ type: 'clearNote' }), 5200) } return refresh(dispatch) })
    .catch(() => { dispatch({ type: 'tickFailed', id: it.id }); setTimeout(() => dispatch({ type: 'clearNote' }), 5200) })
}

// ---------------------------------------------------------------- the look: design-export/Desktop widgets.html, direction B
const CSS = `
.kf-w{--paper:#FBF6E9;--bone:#F6F0E1;--goal:#F8EFD3;--ink:#2a2420;--muted:#5f5849;--hair:#88816E;--line:#e0d8c2;--goal-line:#dcc48e;
  --terra:#B5654A;--on-terra:#FBF6E9;--gold:#7f6428;--gold-warm:#C9A55A;--over:#9C5139;
  --cb-border:#88816E;--cb-bg:#F6F0E1;--cb-fill:#4d6650;--cb-mark:#FBF6E9;--blk-fill:24%;--grain:1;
  position:absolute;box-sizing:border-box;border-radius:24px;overflow:hidden;isolation:isolate;
  font:13.5px/1.25 -apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;padding:16px;user-select:none;cursor:default}
.kf-w[data-theme=night]{--paper:#262233;--bone:#2E2942;--goal:#322B22;--ink:#F0EBDD;--muted:#C9C0D8;--hair:#7A748A;--line:rgba(240,235,221,.12);--goal-line:rgba(228,195,107,.45);
  --terra:#E29473;--on-terra:#211D30;--gold:#E4C36B;--over:#E29473;--cb-border:rgba(168,192,154,.65);--cb-bg:rgba(168,192,154,.08);--cb-fill:#A8C09A;--cb-mark:#211D30;--blk-fill:20%;--grain:0}
.kf-w *{box-sizing:border-box}
/* glass: the wallpaper blurred behind, then the paper sheet at 76%, its grain, and a bright rim */
.kf-w{-webkit-backdrop-filter:blur(36px) saturate(1.5) brightness(1.2);backdrop-filter:blur(36px) saturate(1.5) brightness(1.2);
  background:color-mix(in srgb,var(--paper) 76%,transparent);box-shadow:inset 0 0 0 5px rgba(255,255,255,.016)}
.kf-w::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:var(--grain);
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")}
.kf-w::after{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:20;
  background:linear-gradient(125deg,rgba(255,255,255,.55),rgba(255,255,255,.12) 40%,rgba(255,255,255,.12) 70%,rgba(255,255,255,.3));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.kf-w>*{position:relative;z-index:3}
:where(.kf-w button){font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.kf-sm{padding:14px}
.kf-hd{display:flex;align-items:center;gap:6px;font-size:13px;min-height:20px}
.kf-hd b{font-weight:600}.kf-dim{color:var(--muted)}.kf-hd .r{margin-left:auto}
.kf-ic{width:16px;height:16px;flex:none;fill:none;stroke:var(--muted);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;margin-left:auto}
.kf-hd .r+.kf-ic{margin-left:10px}
.kf-serif{font-family:'Source Serif 4','New York',Georgia,serif;font-weight:600}
.kf-big{font-size:21px;letter-spacing:-.015em;line-height:1.1}
.kf-cb{flex:none;width:17px;height:17px;border-radius:5px;display:grid;place-items:center;border:1.5px solid var(--cb-border);background:var(--cb-bg);color:transparent;transition:background .15s,border-color .15s}
.kf-cb svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.kf-row:hover .kf-cb,.kf-goal:hover .kf-cb{border-color:var(--muted);color:var(--hair)}
.kf-done>.kf-cb,.kf-goal.kf-done .kf-cb,.kf-cb.on{background:var(--cb-fill)!important;border-color:var(--cb-fill)!important;color:var(--cb-mark)!important}
.kf-pop .kf-cb{animation:kfpop .32s cubic-bezier(.3,1.6,.5,1)}@keyframes kfpop{0%{transform:scale(.7)}100%{transform:scale(1)}}
.kf-row{display:flex;align-items:center;gap:9px;height:30px;padding:0 6px;margin:0 -6px;border-radius:10px;transition:background .15s;cursor:pointer}
.kf-row .num{width:9px;font-size:11.5px;color:var(--hair);text-align:center;flex:none}
.kf-row .tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-row .meta{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px;flex:none}
.kf-row .meta i{width:6px;height:6px;border-radius:50%;background:var(--c)}
.kf-row .go{display:none;font-size:12px;color:var(--muted)}
.kf-row:hover{background:var(--bone)}.kf-row:hover .meta{display:none}.kf-row:hover .go{display:inline}
.kf-row.kf-done .tt{text-decoration:line-through;color:var(--hair)}
.kf-row+.kf-row{box-shadow:0 -1px 0 var(--line)}.kf-row:hover+.kf-row{box-shadow:none}
.kf-lbl{font-size:12.5px;font-weight:600;margin:8px 0 2px}.kf-lbl span{font-weight:400;color:var(--muted)}
.kf-ft{display:flex;align-items:center;gap:6px;margin-top:auto;font-size:12px;color:var(--muted)}.kf-ft .over{color:var(--over)}
.kf-add{margin-left:auto;width:26px;height:26px;border-radius:50%;background:var(--terra)!important;color:var(--on-terra)!important;font-size:17px;line-height:26px;text-align:center}
.kf-add:hover{filter:brightness(1.08)}
.kf-goal{position:relative;margin:10px 0 6px;padding:12px 12px 9px;border-radius:12px;display:flex;gap:10px;align-items:flex-start;cursor:pointer;
  background:var(--goal);border:1px solid var(--goal-line);box-shadow:0 1px 2px rgba(60,52,38,.14),0 8px 20px rgba(154,123,58,.14)}
.kf-goal:hover{filter:brightness(.985)}.kf-goal .kf-cb{margin-top:1px}.kf-goal .gt{flex:1;min-width:0}
.kf-goal .gtt{font-family:'Source Serif 4','New York',Georgia,serif;font-weight:600;font-size:15px;line-height:1.2}
.kf-goal .st{font-family:'Courier Prime','SF Mono',Menlo,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-goal.kf-done .gtt{text-decoration:line-through;text-decoration-thickness:1px;opacity:.6}
.kf-tape{position:absolute;top:-6px;left:50%;width:48px;height:11px;transform:translateX(-50%) rotate(-1.5deg);opacity:.75;
  background:repeating-linear-gradient(90deg,var(--gold-warm) 0 3px,color-mix(in srgb,var(--gold-warm) 55%,transparent) 3px 5px)}
.kf-blk{display:flex;align-items:center;gap:8px;height:28px;padding:0 10px;border-radius:9px;font-size:12.5px;white-space:nowrap;position:relative;cursor:pointer;
  background:color-mix(in srgb,var(--c) var(--blk-fill),var(--paper));border:1px solid color-mix(in srgb,var(--c) 45%,transparent);color:var(--ci)}
.kf-blk::before{content:'';position:absolute;left:-1px;top:4px;bottom:4px;width:3px;border-radius:2px;background:var(--c)}
.kf-blk .t{font-variant-numeric:tabular-nums;opacity:.85}.kf-blk .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.kf-blk .r{opacity:.8}
.kf-blk:hover{filter:brightness(.97)}.kf-blk+.kf-blk{margin-top:6px}.kf-blk.quiet{background:var(--bone);border-color:var(--line);color:var(--muted)}.kf-blk.quiet::before{display:none}
.kf-ttl{font-size:16.5px;font-weight:600;margin:6px 0 9px;display:flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer}.kf-ttl span{overflow:hidden;text-overflow:ellipsis}
.kf-ring{width:12px;height:12px;border-radius:50%;border:2px solid var(--c);flex:none}
.kf-prog{height:4px;border-radius:2px;background:var(--line);margin-bottom:12px}.kf-prog i{display:block;height:100%;border-radius:2px;background:var(--c)}
.kf-dbar{position:relative;height:50px;margin:10px 0 6px;cursor:pointer}
.kf-dbar .gl{position:absolute;top:0;font-size:11px;line-height:1;color:var(--gold)}
.kf-dbar .tr{position:absolute;left:0;right:0;top:14px;height:14px;border-radius:7px;background:var(--bone);box-shadow:inset 0 0 0 1px var(--line)}
.kf-dbar .bk{position:absolute;top:14px;height:14px;border-radius:4px;background:color-mix(in srgb,var(--c) 55%,var(--paper))}
.kf-dbar .bk.goalbk{box-shadow:inset 0 -3px 0 var(--gold)}.kf-dbar .bk.past{opacity:.45}
.kf-dbar .now{position:absolute;top:9px;width:2px;height:24px;border-radius:1px;background:var(--ink)}
.kf-dbar .hl{position:absolute;top:34px;font-size:10.5px;color:var(--muted);transform:translateX(-50%)}
.kf-sm .kf-goal{margin:8px 0 0;flex:1;flex-direction:column;gap:6px;padding:12px}
.kf-sm .kf-goal .gtt{font-size:15.5px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.kf-sm .kf-goal .foot{display:flex;align-items:center;gap:8px;margin-top:auto;width:100%;font-size:12px;color:var(--muted);white-space:nowrap}
.kf-sm .kf-goal .st{margin:0}
.kf-sn .ttl{font-size:15.5px;font-weight:600;line-height:1.2;margin:8px 0 4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;border-left:3px solid var(--c);padding-left:8px;cursor:pointer}
.kf-sn .when{font-size:12px;color:var(--muted)}.kf-sn .then{margin-top:auto;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-msg{margin:auto;text-align:center;max-width:280px;font-weight:500;font-size:13px}
.kf-btn{margin-top:10px;border-radius:15px;height:30px;padding:0 18px;background:var(--terra)!important;color:var(--on-terra)!important;font-weight:700;font-size:12.5px}
.kf-btn:hover{filter:brightness(1.08)}
.kf-note{position:absolute!important;left:50%;bottom:14px;transform:translateX(-50%);z-index:30!important;max-width:calc(100% - 24px);padding:5px 10px;border-radius:8px;font-size:12px;font-weight:500;background:var(--ink);color:var(--on-terra);text-align:center}
`
export const styleText = CSS

// ---------------------------------------------------------------- pieces
const CHECK = <svg viewBox="0 0 12 12"><path d="M2.5 6.3 5 8.6l4.6-5" /></svg>
const rays = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a); return `M${(12 + 7 * c).toFixed(2)} ${(12 + 7 * s).toFixed(2)}L${(12 + 10 * c).toFixed(2)} ${(12 + 10 * s).toFixed(2)}` }).join('')
const ICONS = { // the app's line icons (kf-clock, kf-calendar), and a sun in the same style
  sun: <svg className="kf-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d={rays} /></svg>,
  clock: <svg className="kf-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7.8V12l3 2" /></svg>,
  calendar: <svg className="kf-ic" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>,
}
function Cb({ on, label, onClick }) {
  return <button type="button" className={`kf-cb${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${on ? 'Done' : 'Tick'}: ${label}`} onClick={(e) => { e.stopPropagation(); onClick() }}>{CHECK}</button>
}
function Block({ b, night, label, right, onClick }) {
  if (!b) return <div className="kf-blk quiet"><span className="n">{label}</span></div>
  return (
    <div className="kf-blk" style={blockVars(b.color, night)} onClick={onClick}>
      {label === 'Next' && <b style={{ fontWeight: 700 }}>Next</b>}
      <span className="t">{hm(minOf(b.start_hm))}</span>
      <span className="n">{b.is_goal ? '✶ ' : ''}{b.title}</span>
      <span className="r">{right}</span>
    </div>
  )
}

// ---------------------------------------------------------------- the five widgets
function GoalCard({ v, state, dispatch, small }) {
  const g = v.feed.goal, done = v.isDone(g), when = g ? v.goalWhen() : ''
  const stamp = `✶ ${done ? 'Done' : 'Goal of the day'}${!small && when ? ` · ${when}` : ''}`
  const open = () => go(state, g ? `task/${g.id}` : 'today')
  const cb = g && <Cb on={done} label={g.title} onClick={() => tick(state, dispatch, g)} />
  const title = g ? g.title : 'No goal picked yet'
  if (small) {
    return (
      <div className={`kf-goal${done ? ' kf-done' : ''}`} onClick={open}>
        <i className="kf-tape" />
        <div className="st">{stamp}</div>
        <div className="gtt" style={g ? null : { color: 'var(--muted)', fontWeight: 600 }}>{title}</div>
        <div className="foot">{cb}<span>{g ? when : "Pick one in Kai's Flow"}</span></div>
      </div>
    )
  }
  return (
    <div className={`kf-goal${done ? ' kf-done' : ''}`} onClick={open}>
      <i className="kf-tape" />{cb}
      <div className="gt"><div className="gtt" style={g ? null : { color: 'var(--muted)' }}>{title}</div><div className="st">{stamp}</div></div>
    </div>
  )
}

function TodayBody({ v, state, dispatch }) {
  const { feed } = v
  const open = (it) => go(state, `task/${it.id}`)
  const Row = ({ it, num }) => {
    const done = v.isDone(it), b = v.blockOf(it.id)
    return (
      <div className={`kf-row${done ? ' kf-done' : ''}`} onClick={() => open(it)}>
        {num ? <span className="num">{num}</span> : null}
        <Cb on={done} label={it.title} onClick={() => tick(state, dispatch, it)} />
        <span className="tt">{it.title}</span>
        <span className="meta">{b ? <><i style={blockVars(b.color, v.night)} />{hm(minOf(b.start_hm))} {ap(minOf(b.start_hm))}</> : null}</span>
        <span className="go">Open ↗</span>
      </div>
    )
  }
  // how many rows fit under the goal card (the Rainmeter skin's arithmetic: rows are 30 high, the card grows with a second title line)
  const lines = feed.goal && feed.goal.title.length > 32 ? 2 : 1
  let y = 67 + (12 + lines * 18 + 4 + 12 + 9) + 6
  const BOTTOM = 314
  const picks = feed.top3.slice(feed.goal ? 1 : 0).map((it, i) => ({ it, num: i + (feed.goal ? 2 : 1) }))
  const showPicks = []
  for (const p of picks) if (showPicks.length < 6 && y + 30 <= BOTTOM) { showPicks.push(p); y += 30 }
  const left = feed.tasks.filter((it) => !v.isDone(it)).length
  const tasks = []
  const withLabel = feed.tasks.length > 0 && y + 26 + 30 <= BOTTOM
  if (withLabel) { y += 26; for (const it of feed.tasks) if (showPicks.length + tasks.length < 6 && y + 30 <= BOTTOM) { tasks.push(it); y += 30 } }
  const more = feed.tasks.length - tasks.length + (feed.tasks_more || 0)
  return (
    <>
      <div className="kf-hd" style={{ alignItems: 'flex-start' }}>
        <div><div className="kf-serif kf-big">{dayOf(feed, 'long')}</div><div className="kf-dim" style={{ marginTop: 2 }}>Today · {v.doneCount()}</div></div>
        {ICONS.sun}
      </div>
      <GoalCard v={v} state={state} dispatch={dispatch} />
      {showPicks.map((p) => <Row key={p.it.id} it={p.it} num={p.num} />)}
      {withLabel && <div className="kf-lbl">Today's tasks <span>{left}</span></div>}
      {tasks.map((it) => <Row key={it.id} it={it} />)}
      <div className="kf-ft">
        {feed.overdue > 0 && <span className="over">Overdue {feed.overdue}</span>}
        {more > 0 && <span>{feed.overdue > 0 ? '· ' : ''}Also open {more} ›</span>}
        <button type="button" className="kf-add" aria-label="Add a task" onClick={() => go(state, 'capture')}>+</button>
      </div>
    </>
  )
}

function NowNextBody({ v, state }) {
  const { cur, nexts, night, t } = v
  const style = cur ? blockVars(cur.color, night) : { '--c': 'var(--hair)' }
  const pct = cur ? Math.min(1, Math.max(0, (t - cur.start) / Math.max(1, cur.end - cur.start))) * 100 : 0
  return (
    <>
      <div className="kf-hd">
        <b>Now</b><span className="kf-dim">· {cur ? range(minOf(cur.start_hm), minOf(cur.end_hm)) : 'free'}</span>
        <span className="r kf-dim">{cur ? `${dur(Math.ceil((cur.end - t) / 60))} left` : ''}</span>{ICONS.clock}
      </div>
      <div className="kf-ttl" style={style} onClick={() => go(state, 'now')}>
        <i className="kf-ring" /><span style={cur ? null : { color: 'var(--muted)' }}>{cur ? `${cur.is_goal ? '✶ ' : ''}${cur.title}` : 'Nothing on the calendar'}</span>
      </div>
      <div className="kf-prog" style={style}><i style={{ width: `${pct}%` }} /></div>
      {[0, 1].map((i) => (nexts[i] || i === 0) && (
        <Block key={i} b={nexts[i]} night={night} label="Nothing else today" right={nexts[i] ? dur(Math.floor((nexts[i].end - nexts[i].start) / 60)) : ''} onClick={() => go(state, `next${i + 1}`)} />
      ))}
    </>
  )
}

function DayBarBody({ v, state }) {
  const { feed, nexts, night, nowM, t } = v
  const x = (m) => ((Math.min(Math.max(m, 420), 1380) - 420) / 960) * 328
  const n = nexts[0]
  return (
    <>
      <div className="kf-hd"><b>{dayOf(feed, 'short')}</b><span className="kf-dim">· {v.doneCount()}</span>{ICONS.calendar}</div>
      <div className="kf-dbar" onClick={() => go(state, 'calendar')}>
        <span className="gl" style={{ left: 0 }}>☀</span><span className="gl" style={{ left: x(17 * 60 + 5) - 4 }}>☾</span>
        <i className="tr" />
        {feed.day.map((d, i) => (
          <i key={i} className={`bk${d.is_goal ? ' goalbk' : ''}${d.to_min <= nowM ? ' past' : ''}`} style={{ ...blockVars(d.color, night), left: x(d.from_min), width: Math.max(x(d.to_min) - x(d.from_min), 4) }} />
        ))}
        <i className="now" style={{ left: x(nowM) - 1 }} />
        {[8, 12, 16, 20].map((hr) => <span key={hr} className="hl" style={{ left: x(hr * 60) }}>{hr % 12 || 12}{hr < 12 ? 'am' : 'pm'}</span>)}
      </div>
      <Block b={n} night={night} label={n ? 'Next' : 'Nothing else today'} right={n ? `in ${dur(Math.ceil((n.start - t) / 60))}` : ''} onClick={() => go(state, 'next1')} />
    </>
  )
}

function NextBody({ v, state }) {
  const { nexts, night, t } = v
  const [n, after] = nexts
  return (
    <>
      <div className="kf-hd"><b>Next</b>{n && <span className="kf-dim">· in {dur(Math.ceil((n.start - t) / 60))}</span>}{ICONS.calendar}</div>
      {n ? (
        <>
          <div className="ttl" style={blockVars(n.color, night)} onClick={() => go(state, 'next1')}>{n.is_goal ? '✶ ' : ''}{n.title}</div>
          <div className="when">{range(minOf(n.start_hm), minOf(n.end_hm))}</div>
          <div className="then">{after ? `Then ${hm(minOf(after.start_hm))} · ${after.title}` : 'Then nothing else today'}</div>
        </>
      ) : <div className="ttl" style={{ '--c': 'var(--hair)', color: 'var(--muted)' }}>Nothing else today</div>}
    </>
  )
}

const BODY = {
  today: TodayBody, nownext: NowNextBody, daybar: DayBarBody, next: NextBody,
  goal: ({ v, state, dispatch }) => <GoalCard v={v} state={state} dispatch={dispatch} small />,
}

const MESSAGE = {
  nolink: ["Add your Kai's Flow Widget link to kaisflow.config.json", 'Open it'],
  badconfig: ["kaisflow.config.json isn't valid JSON", 'Open it'],
  unauthorized: ['This link was turned off or mistyped', 'Open kaisflow.config.json'],
  bad: ["Can't read Kai's Flow right now", 'Try again'],
  offline: ['Offline', 'Try again'],
  busy: ['Too many refreshes. Back in a bit', null],
  loading: ['Loading your day', null],
}

// ---------------------------------------------------------------- Übersicht's exports, per widget
export function makeWidget(kind) {
  const [w, h] = SIZE[kind]
  const Body = BODY[kind]
  const small = w === 170
  return {
    command,
    refreshFrequency: 60000,
    // the widget sits at the corner; render() puts the sheet where kaisflow.config.json's "positions" says (or the default)
    className: 'top: 0; left: 0;',
    initialState,
    updateState,
    render: (props) => {
      const s = { ...initialState, ...props }
      const { dispatch } = props
      const pos = s.cfg.positions?.[kind] || {}
      const left = Number.isFinite(pos.x) ? pos.x : HOME[kind][0], top = Number.isFinite(pos.y) ? pos.y : HOME[kind][1]
      const v = s.feed ? view(s) : null
      const night = v ? v.night : s.cfg.theme === 'night'
      let m = !s.feed && MESSAGE[s.problem || 'loading']
      if (m && s.problem === 'nolink' && !s.cfgPath) m = ["Can't find kaisflow.config.json. Put it in the Kais-Flow widgets folder.", null]
      const clear = s.note && s.note.until > nowMs()
      return (
        <div className={`kf-w${small ? ' kf-sm' : ''}${kind === 'next' ? ' kf-sn' : ''}`} data-widget={kind} data-theme={night ? 'night' : 'day'} style={{ left, top, width: w, height: h }}>
          <style>{CSS}</style>
          {m ? (
            <div className="kf-msg">
              {m[0]}
              {m[1] && <div><button type="button" className="kf-btn" onClick={() => (m[1] === 'Try again' ? refresh(dispatch) : s.cfgPath ? run(`open -t "${safe(s.cfgPath)}"`) : null)}>{m[1]}</button></div>}
            </div>
          ) : <Body v={v} state={s} dispatch={dispatch} />}
          {clear && <div className="kf-note">{s.note.text}</div>}
        </div>
      )
    },
  }
}
