// Generator for the Sep 2026 refresh pages. Not loaded by any page.
var LIB = (function () {
const P = d => `<path d="${d}"></path>`;
const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"></circle>`;
const R = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"></rect>`;
const ICON = {
  // navigation
  today: P('M12 20.5v-8') + P('M12 12.5C12 8.6 9.3 6 5 6c0 3.9 2.7 6.5 7 6.5z') + P('M12 15c0-3.3 2.4-5.6 6.5-5.6 0 3.3-2.4 5.6-6.5 5.6z') + P('M7.5 20.5h9'),
  inbox: P('M4 13.5 6.2 6.3A1.8 1.8 0 0 1 7.9 5h8.2a1.8 1.8 0 0 1 1.7 1.3L20 13.5v4.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2z') + P('M4 13.5h4.4l1.3 2.3h4.6l1.3-2.3H20'),
  calendar: R(4, 5.5, 16, 14.5, 2) + P('M4 10h16M8.5 3.5v4M15.5 3.5v4'),
  tasks: R(4.5, 4.5, 15, 15, 3) + P('M8.5 12.2l2.4 2.4 4.6-4.9'),
  projects: P('M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'),
  routines: P('M19.5 12a7.5 7.5 0 1 1-2.2-5.3') + P('M19.8 4.2v4.3h-4.3') + P('M12 15.5v-3.2c0-1.6 1.2-2.8 2.8-2.8 0 1.6-1.2 2.8-2.8 2.8'),
  focus: C(12, 12, 8) + C(12, 12, 4) + P('M12 12h.01'),
  review: P('M12 20.5v-6') + P('M12 14.5a4.5 4.5 0 1 1 4.5-4.5 2.8 2.8 0 0 1-2.8 2.8 1.7 1.7 0 0 1-1.7-1.7'),
  journal: P('M5.5 5.5A1.5 1.5 0 0 1 7 4h11.5v13.5H7a1.5 1.5 0 0 0-1.5 1.5z') + P('M5.5 19A1.5 1.5 0 0 0 7 20.5h11.5v-3') + P('M9.5 8h5.5'),
  people: C(9, 8.5, 3.2) + P('M3 19a6 6 0 0 1 12 0') + P('M16 5.8a3.2 3.2 0 0 1 0 6M17.2 14.3a6 6 0 0 1 3.8 4.7'),
  settings: P('M4.5 7.5h8M17.5 7.5h2M4.5 16.5h2M11.5 16.5h8') + C(15, 7.5, 2.3) + C(9, 16.5, 2.3),
  more: R(4.5, 4.5, 6, 6, 1.5) + R(13.5, 4.5, 6, 6, 1.5) + R(4.5, 13.5, 6, 6, 1.5) + R(13.5, 13.5, 6, 6, 1.5),
  // actions
  tomorrow: P('M3.5 18.5h17') + P('M7.2 18.5a4.8 4.8 0 0 1 9.6 0') + P('M12 10.5V4') + P('M9.5 6.5 12 4l2.5 2.5'),
  pickdate: R(4, 5.5, 16, 14.5, 2) + P('M4 10h16M8.5 3.5v4M15.5 3.5v4') + R(10.2, 13, 3.6, 3.6, 0.8),
  project: P('M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z') + P('M10 13.5h4.5M12.8 11.5l2 2-2 2'),
  priority: P('M6 21V4.5M6 5h11l-2.2 3.5L17 12H6'),
  repeat: P('M4 12a8 8 0 0 1 13-6l2 2M20 12a8 8 0 0 1-13 6l-2-2') + P('M19 4v4h-4M5 20v-4h4'),
  remind: P('M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10z') + P('M10 19.5a2 2 0 0 0 4 0'),
  label: P('M4 11.2V5h6.2l9 9-6.2 6.2z') + C(8.3, 9.3, 1.3),
  delete: P('M4 7h16M9.5 7V4.8h5V7M6 7l1 13h10l1-13') + P('M10 11v5M14 11v5'),
  undo: P('M9 6.5 4.5 11 9 15.5') + P('M4.5 11h10a5 5 0 0 1 0 10H12'),
  mic: R(9, 3.5, 6, 11, 3) + P('M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5'),
  search: C(11, 11, 6.5) + P('M16 16l4 4'),
  close: P('M6 6l12 12M18 6 6 18'),
  back: P('M19.5 12h-15M10.5 6l-6 6 6 6'),
  dots: C(5.5, 12, 1.1) + C(12, 12, 1.1) + C(18.5, 12, 1.1),
  drag: P('M5 9.5h14M5 14.5h14'),
  // utility (used by the kit)
  check: P('M5 12.5l4.5 4.5L19 7.5'),
  chevdown: P('M6 9.5l6 6 6-6'),
  chevup: P('M6 14.5l6-6 6 6'),
  chevright: P('M9.5 6l6 6-6 6'),
  chevleft: P('M14.5 6l-6 6 6 6'),
  plus: P('M12 5v14M5 12h14'),
  clock: C(12, 12, 8) + P('M12 7.8V12l3 2'),
  lock: R(5.5, 10.5, 13, 10, 2) + P('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5'),
  send: P('M12 19.5V5M6 11l6-6 6 6'),
  alert: C(12, 12, 8) + P('M12 7.8v5M12 16.2v.1'),
  offline: P('M7 18h9.5a3.8 3.8 0 0 0 .7-7.5A5.5 5.5 0 0 0 6.6 9.3 4.4 4.4 0 0 0 7 18z') + P('M4 4l16 16'),
  stop: R(7, 7, 10, 10, 1.5),
  star: P('M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z'),
};
const NAV = [['today','Today'],['inbox','Inbox'],['calendar','Calendar'],['tasks','Tasks'],['projects','Projects'],['routines','Routines'],['focus','Focus'],['review','Review'],['journal','Journal'],['people','People'],['settings','Settings'],['more','More']];
const ACT = [['tomorrow','Tomorrow'],['pickdate','Pick date'],['project','Project'],['priority','Priority'],['repeat','Repeat'],['remind','Remind'],['label','Label'],['delete','Delete'],['undo','Undo'],['focus','Focus'],['mic','Mic'],['search','Search'],['close','Close'],['back','Back'],['dots','More (⋯)'],['drag','Drag handle']];
const UTIL = [['check','Check'],['chevdown','Chevron down'],['chevright','Chevron right'],['plus','Plus'],['clock','Clock'],['lock','Lock'],['send','Send'],['stop','Stop'],['alert','Alert'],['offline','Offline'],['star','Star']];
const ic = (n, sz = 24, c = 'currentColor', sw = 1.6, fill = 'none') => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${ICON[n]}</svg>`;
const svgFile = n => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- contrast ----------
const rgb = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').substr(i, 2), 16));
const lum = c => { const v = c.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const over = (fg, a, bg) => { const f = rgb(fg), b = rgb(bg); return f.map((x, i) => Math.round(x * a + b[i] * (1 - a))); };
const ratio = (fg, bg, a = 1) => { const f = a < 1 ? over(fg, a, bg) : rgb(fg); const x = lum(f), y = lum(rgb(bg)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---------- type shorthands ----------
const mono = (sz = 12, c = 'var(--ink-faint)', ls = '0.06em') => `font-family:var(--font-mono);font-size:${sz}px;letter-spacing:${ls};text-transform:uppercase;color:${c}`;
const PRESS = 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));transform:scale(0.97);';
const stateMod = s => s === 'pressed' ? PRESS : s === 'focus' ? 'box-shadow:var(--focus-ring);' : s === 'disabled' ? 'opacity:0.42;' : '';
const spinner = (c = 'currentColor', sz = 16) => `<span style="width:${sz}px;height:${sz}px;border-radius:50%;border:2px solid ${c};border-right-color:transparent;flex:none;display:block;transform:rotate(-30deg)"></span>`;

// ---------- components (phone sizes) ----------
function btn(kind, state = 'default', label = 'Plan today', icon) {
  const base = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:999px;font-family:var(--font-ui);font-size:15px;font-weight:500;white-space:nowrap;flex:none;';
  const k = kind === 'primary' ? 'padding:0 22px;border:none;background:var(--acc-terra-ink);color:var(--on-terra);box-shadow:var(--shadow-cta);'
    : kind === 'secondary' ? 'padding:0 18px;border:1px solid var(--line-control);background:var(--paper-bone);color:var(--ink-body);'
    : 'padding:0 14px;border:none;background:transparent;color:var(--ink-muted);';
  let sel = '';
  if (state === 'selected') sel = 'background:var(--block-sage);border-color:var(--acc-sage-text);color:var(--acc-sage-text);';
  if (state === 'disabled' && kind === 'primary') sel = 'box-shadow:none;';
  const inner = state === 'loading' ? spinner() + (kind === 'primary' ? 'Saving' : 'Loading') : (state === 'selected' ? ic('check', 18) : icon ? ic(icon, 20) : '') + label;
  return `<span style="${base}${k}${stateMod(state)}${sel}">${inner}</span>`;
}
const CHIPS = {
  tasks: ['var(--block-blossom)', 'var(--acc-blossom-text)'], inbox: ['var(--block-hydrangea)', 'var(--acc-hydrangea-deep)'],
  routed: ['var(--block-sage)', 'var(--acc-sage-text)'], overdue: ['var(--block-terra)', 'var(--acc-terra-ink)'],
  date: ['var(--block-lavender)', 'var(--acc-lavender-text)'], project: ['var(--block-moss)', 'var(--acc-sage-text)'],
  duration: ['var(--block-buttercream)', 'var(--acc-buttercream-text)'], priority: ['var(--block-terra)', 'var(--acc-terra-ink)'],
};
function chip(kind, label, state = 'default', icon) {
  if (kind === 'meeting') return `<span style="display:inline-flex;align-items:center;height:32px;padding:0 10px;border:1px solid var(--line-control);border-radius:3px;${mono(12, 'var(--ink-muted)')};flex:none;${stateMod(state)}">${label}</span>`;
  if (kind === 'offline') return `<span style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border:1px solid var(--sig-offline);border-radius:999px;font-size:13px;color:var(--sig-offline);flex:none">${ic('offline', 16)}${label}</span>`;
  const [bg, fg] = CHIPS[kind];
  const sel = state === 'selected' ? `box-shadow:inset 0 0 0 1.5px ${fg};` : '';
  const lead = state === 'loading' ? spinner(fg, 14) : state === 'selected' ? ic('check', 16) : icon ? ic(icon, 16) : '';
  return `<span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;background:${bg};${mono(12, fg)};flex:none;white-space:nowrap;${stateMod(state)}${sel}">${lead}${label}</span>`;
}
const hitBox = (inner, extra = '') => `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:50%;position:relative;${extra}">${inner}</span>`;
function checkbox(state = 'default', checked = false, sz = 22, gold = false) {
  const on = checked || state === 'selected';
  const halo = state === 'pressed' ? 'background:var(--pressed-overlay);' : '';
  const box = `<span style="width:${sz}px;height:${sz}px;border-radius:6px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? `background:${gold ? 'var(--acc-gold)' : 'var(--check-fill)'};box-shadow:var(--check-glow);` : `border:1.5px solid ${gold ? 'var(--acc-gold)' : 'var(--check-border)'};background:var(--check-bg);`}${state === 'pressed' ? 'transform:scale(0.9);' : ''}${state === 'focus' ? 'box-shadow:var(--focus-ring);' : ''}${state === 'disabled' ? 'opacity:0.42;' : ''}">${on ? ic('check', sz - 6, gold ? 'var(--paper-parchment)' : 'var(--check-mark)', 2.2) : ''}</span>`;
  return hitBox(box, halo);
}
function star(state = 'default', on = false) {
  const lit = on || state === 'selected';
  const s = `<span style="display:flex;${state === 'focus' ? 'box-shadow:var(--focus-ring);border-radius:50%;' : ''}${state === 'disabled' ? 'opacity:0.42;' : ''}${state === 'pressed' ? 'transform:scale(0.9);' : ''}">${ic('star', 22, lit ? 'var(--star-on)' : 'var(--star-empty)', 1.6, lit ? 'var(--star-on)' : 'none')}</span>`;
  return hitBox(s, state === 'pressed' ? 'background:var(--pressed-overlay);' : '');
}
const iconBtn = (n, c = 'var(--ink-muted)', state) => hitBox(ic(n, 24, c), state === 'pressed' ? 'background:var(--pressed-overlay);' : state === 'focus' ? 'box-shadow:var(--focus-ring);' : '');
function field(kind, state = 'default', w = 172) {
  const focus = state === 'focus' || state === 'selected';
  const base = `display:flex;align-items:center;gap:8px;width:${w}px;height:48px;padding:0 10px 0 14px;box-sizing:border-box;border-radius:8px;background:var(--paper-bone);border:${focus ? '2px solid var(--focus)' : '1px solid var(--line-control)'};font-size:15px;color:var(--ink-body);${state === 'pressed' ? 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : ''}${state === 'disabled' ? 'opacity:0.42;' : ''}${state === 'focus' && kind === 'select' ? 'box-shadow:var(--focus-ring);border:1px solid var(--line-control);' : ''}`;
  if (kind === 'select') {
    const txt = state === 'loading' ? `<span style="flex:1;height:10px;border-radius:2px;background:var(--skeleton)"></span>` : `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Forecasting</span>`;
    return `<span style="${base}">${txt}${state === 'loading' ? spinner('var(--ink-faint)') : ic(state === 'selected' ? 'chevup' : 'chevdown', 20, 'var(--ink-muted)')}</span>`;
  }
  const val = state === 'selected' ? 'Call the bank' : '';
  const caret = state === 'focus' ? `<span style="width:1.5px;height:20px;background:var(--acc-terra-ink);flex:none"></span>` : '';
  const txt = val ? `<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden">${val}</span>` : `${caret}<span style="flex:1;min-width:0;color:var(--ink-faint);white-space:nowrap;overflow:hidden">Add a task…</span>`;
  const tail = state === 'loading' ? spinner('var(--ink-faint)') : val ? ic('close', 18, 'var(--ink-muted)') : '';
  return `<span style="${base}${state === 'focus' ? 'border:1px solid var(--line-control);box-shadow:var(--focus-ring);' : ''}">${txt}${tail}</span>`;
}
function toggle(state = 'default', on = false) {
  const lit = on || state === 'selected';
  const track = `<span style="position:relative;width:52px;height:32px;border-radius:999px;box-sizing:border-box;display:block;${lit ? 'background:var(--check-fill);' : 'background:var(--paper-bone);border:2px solid var(--line-control);'}${state === 'focus' ? 'box-shadow:var(--focus-ring);' : ''}${state === 'disabled' ? 'opacity:0.42;' : ''}"><span style="position:absolute;top:50%;${lit ? 'right:4px;width:24px;height:24px;margin-top:-12px;background:var(--paper-parchment);' : `left:${state === 'pressed' ? 4 : 6}px;width:${state === 'pressed' ? 24 : 16}px;height:${state === 'pressed' ? 24 : 16}px;margin-top:-${state === 'pressed' ? 12 : 8}px;background:var(--line-control);`}border-radius:50%;display:block;${state === 'pressed' ? 'box-shadow:0 0 0 8px var(--pressed-overlay);' : ''}"></span></span>`;
  return `<span style="height:48px;display:flex;align-items:center;flex:none">${track}</span>`;
}
function segmented(state = 'default', items = ['Day', '3 day', 'Week'], selIdx = 0) {
  const segs = items.map((t, i) => {
    const sel = i === selIdx;
    const pr = state === 'pressed' && i === 1 ? 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : '';
    const fo = state === 'focus' && i === 1 ? 'box-shadow:var(--focus-ring);' : '';
    return `<span style="display:flex;align-items:center;justify-content:center;gap:4px;height:40px;padding:0 ${sel ? 10 : 12}px;border-radius:999px;font-size:14px;font-weight:${sel ? 600 : 500};white-space:nowrap;${sel ? 'background:var(--block-sage);color:var(--acc-sage-text);' : 'color:var(--ink-muted);'}${pr}${fo}">${sel ? ic('check', 16) : ''}${t}</span>`;
  }).join('');
  return `<span style="height:48px;display:flex;align-items:center;flex:none"><span style="display:flex;align-items:center;padding:3px;border:1px solid var(--line-control);border-radius:999px;background:var(--paper-bone);${state === 'disabled' ? 'opacity:0.42;' : ''}">${segs}</span></span>`;
}
function sectionLabel(label = 'Up next', link = 'View all', state = 'default', w = '100%') {
  const lk = link ? `<span style="height:48px;display:flex;align-items:center;gap:4px;padding:0 4px 0 8px;border-radius:3px;${mono(12.5, 'var(--ink-muted)', '0.06em')};${state === 'pressed' ? 'background:var(--pressed-overlay);' : ''}${state === 'focus' ? 'box-shadow:var(--focus-ring);' : ''}">${link}${ic('chevright', 16)}</span>` : '';
  return `<div style="display:flex;align-items:center;gap:12px;width:${w};min-height:48px"><span style="${mono(12.5, 'var(--ink-faint)', '0.07em')};white-space:nowrap">${label}</span><span style="flex:1;border-bottom:1px dashed var(--line-dashed)"></span>${lk}</div>`;
}
const tape = (w, h, bg, rot, pos) => `<span style="position:absolute;${pos};width:${w}px;height:${h}px;background:${bg};background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px);border-radius:1px;box-shadow:var(--shadow-crisp);transform:rotate(${rot}deg);z-index:2"></span>`;
function goalCard(state = 'default', w = 340) {
  const done = state === 'selected';
  const title = state === 'loading' ? `<span style="display:block;height:14px;width:88%;border-radius:2px;background:var(--skeleton)"></span><span style="display:block;margin-top:8px;height:14px;width:60%;border-radius:2px;background:var(--skeleton)"></span>`
    : `<span style="display:block;font-family:var(--font-display);font-size:18px;font-weight:600;line-height:1.3;color:${done ? 'var(--ink-faint)' : 'var(--ink-body)'};${done ? 'text-decoration:line-through;text-decoration-color:var(--ink-hairline);' : ''}text-wrap:pretty">Deliver the MVP of the forecasting app</span>`;
  return `<div style="position:relative;width:${w}px;max-width:100%;box-sizing:border-box;background:var(--paper-goal);border:1px solid var(--line-goal);box-shadow:${state === 'focus' ? 'var(--focus-ring)' : 'var(--shadow-goal)'};border-radius:3px;padding:14px 12px 14px 4px;transform:rotate(-0.4deg)${state === 'pressed' ? ' scale(0.98)' : ''};${state === 'pressed' ? 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : ''}${state === 'disabled' ? 'opacity:0.42;' : ''}">
${tape(72, 17, 'rgba(201,165,90,0.42)', -2, 'top:-9px;left:50%;margin-left:-36px')}
<div style="padding-left:12px"><span style="display:inline-block;${mono(12, 'var(--paper-parchment)', '0.07em')};background:var(--acc-gold);padding:3px 8px;border-radius:2px">✶ Goal of the day</span></div>
<div style="display:flex;align-items:flex-start;gap:4px;margin-top:6px">${checkbox('default', done, 22, true)}<div style="flex:1;min-width:0;padding-top:12px">${title}<span style="display:block;margin-top:6px;${mono(12, 'var(--acc-gold)', '0.06em')}">${done ? 'Done 14:20 · a four-leaf day' : 'The one thing that makes today a win'}</span></div><img src="ds/assets/clover/${done ? 'four_leaf' : 'awake'}.png" alt="" style="width:34px;height:auto;margin-top:12px;filter:var(--shadow-drop-sm)"></div></div>`;
}
const metaI = (t, c = 'var(--ink-faint)', dot) => `<span style="display:inline-flex;align-items:center;gap:6px;${mono(12, c)};white-space:nowrap">${dot ? `<span style="width:7px;height:7px;border-radius:50%;background:${dot};flex:none"></span>` : ''}${t}</span>`;
function selCircle(on) {
  const c = `<span style="width:24px;height:24px;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? 'background:var(--acc-hydrangea-deep);' : 'border:1.5px solid var(--line-control);'}">${on ? ic('check', 16, 'var(--paper-parchment)', 2.2) : ''}</span>`;
  return hitBox(c);
}
function taskRow(o = {}) {
  const t = o.title || 'Plan and implement the forecasting logic';
  const meta = o.meta || [metaI('Forecasting', 'var(--ink-faint)', 'var(--acc-moss)'), metaI('30m')];
  const bg = o.selected ? 'background:var(--select-bg);' : o.state === 'pressed' ? 'background:var(--pressed-overlay);' : o.bg ? `background:${o.bg};` : '';
  const lead = o.select !== undefined ? selCircle(o.select) : checkbox('default', o.done);
  const title = `<div style="font-size:15px;line-height:20px;color:${o.done ? 'var(--ink-faint)' : 'var(--ink-body)'};${o.done ? 'text-decoration:line-through;text-decoration-color:var(--ink-hairline);' : ''}text-wrap:pretty">${t}</div>`;
  const subs = o.subs ? `<div style="margin:2px 0 0 -8px">${o.subs.map(s => `<div style="display:flex;align-items:center;min-height:44px">${checkbox('default', s[1], 18)}<span style="font-size:14px;line-height:19px;color:${s[1] ? 'var(--ink-faint)' : 'var(--ink-body)'};${s[1] ? 'text-decoration:line-through;text-decoration-color:var(--ink-hairline);' : ''}">${s[0]}</span></div>`).join('')}</div>` : '';
  const trail = o.select !== undefined ? '' : (o.star === false ? '' : star('default', o.top3)) + iconBtn('dots', 'var(--ink-muted)');
  return `<div style="position:relative;display:flex;align-items:flex-start;min-height:56px;padding:4px 4px;box-sizing:border-box;${o.noBorder ? '' : 'border-bottom:1px dashed var(--line-dashed);'}${bg}${o.state === 'focus' ? 'box-shadow:inset 0 0 0 2px var(--focus);' : ''}${o.style || ''}">${lead}<div style="flex:1;min-width:0;padding:14px 4px 12px 0">${title}<div style="margin-top:4px;display:flex;flex-wrap:wrap;column-gap:12px;row-gap:2px">${meta.join('')}${o.pending ? `<span style="display:inline-flex;align-items:center;gap:5px;${mono(12, 'var(--sig-offline)')}"><span style="width:7px;height:7px;border-radius:50%;border:1.5px solid var(--sig-offline);box-sizing:border-box"></span>Pending sync</span>` : ''}</div>${subs}</div>${trail}</div>`;
}

// ---------- phone chrome ----------
const TABS = [['today', 'Today', 'var(--block-sage)'], ['inbox', 'Inbox', 'var(--block-hydrangea)'], ['cap'], ['calendar', 'Calendar', 'var(--block-lavender)'], ['more', 'More', 'var(--block-buttercream)']];
function captureBtn(state = 'idle') {
  if (state === 'recording' || state === 'lockdrag') return `<span style="position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center;flex:none"><span style="position:absolute;inset:-14px;border-radius:50%;background:var(--block-terra)"></span><span style="position:relative;width:72px;height:72px;border-radius:50%;background:var(--acc-terra-ink);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-cta)">${ic('mic', 28, 'var(--on-terra)')}</span></span>`;
  const pr = state === 'pressed' ? 'transform:scale(0.94);background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : '';
  const fo = state === 'focus' ? 'box-shadow:var(--focus-ring);' : 'box-shadow:var(--shadow-cta);';
  return `<span style="width:56px;height:56px;border-radius:50%;background:var(--acc-terra-ink);display:flex;align-items:center;justify-content:center;flex:none;${fo}${pr}">${ic(state === 'locked' ? 'stop' : 'mic', 24, 'var(--on-terra)')}</span>`;
}
function tabBar(o = {}) {
  const active = o.active || 'today', badges = o.badges || {};
  const items = TABS.map(([n, l, tint]) => {
    if (n === 'cap') return `<div style="width:72px;flex:none;display:flex;align-items:center;justify-content:center">${o.hideCap ? '' : captureBtn(o.cap)}</div>`;
    const act = n === active, pr = o.pressed === n;
    const b = badges[n] ? `<span style="position:absolute;top:-3px;left:30px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:var(--badge-bg);color:var(--badge-ink);font-size:12px;font-weight:600;line-height:20px;text-align:center;box-shadow:0 0 0 2px var(--paper-parchment)">${badges[n]}</span>` : '';
    return `<div style="flex:1;min-width:0;height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><span style="position:relative;width:56px;height:32px;border-radius:999px;display:flex;align-items:center;justify-content:center;${act ? `background:${tint};` : ''}${pr ? 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));transform:scale(0.95);' : ''}">${ic(n, 24, act ? 'var(--ink-body)' : 'var(--ink-faint)')}${b}</span><span style="font-size:12px;line-height:16px;font-weight:${act ? 600 : 500};color:${act ? 'var(--ink-body)' : 'var(--ink-faint)'}">${l}</span></div>`;
  }).join('');
  const pos = o.static ? 'position:relative;' : 'position:absolute;left:0;right:0;bottom:0;z-index:10;';
  return `<div style="${pos}height:${o.static ? 64 : 80}px;background:var(--paper-parchment);box-shadow:var(--shadow-tabbar);"><div style="height:64px;display:flex;align-items:stretch;padding:0 4px">${items}</div></div>`;
}
function bulkBar() {
  const it = [['check', 'Done'], ['tomorrow', 'Tomorrow'], ['pickdate', 'Pick date'], ['project', 'Project'], ['delete', 'Delete']];
  return `<div style="position:absolute;left:0;right:0;bottom:0;height:80px;z-index:10;background:var(--paper-parchment);box-shadow:var(--shadow-tabbar)"><div style="height:64px;display:flex;padding:0 4px">${it.map(([n, l]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${n === 'delete' ? 'var(--acc-terra-ink)' : 'var(--ink-body)'}">${ic(n, 24)}<span style="font-size:12px;line-height:16px;font-weight:500">${l}</span></div>`).join('')}</div></div>`;
}
function topBar(title, o = {}) {
  const acts = (o.actions || ['search', 'dots']).map(a => iconBtn(a, 'var(--ink-muted)')).join('');
  const lead = o.lead ? iconBtn(o.lead, 'var(--ink-body)') : '';
  return `<div style="position:absolute;top:32px;left:0;right:0;height:56px;display:flex;align-items:center;padding:0 4px 0 ${o.lead ? 4 : 16}px;z-index:6;${o.bg ? `background:${o.bg};` : ''}">${lead}<div style="flex:1;min-width:0;font-family:${o.small ? 'var(--font-ui)' : 'var(--font-display)'};font-weight:${o.small ? 600 : 500};font-size:${o.small ? 18 : 26}px;letter-spacing:${o.small ? '0' : '-0.015em'};line-height:1.15;color:var(--ink-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>${acts}</div>`;
}
const statusBar = () => `<div style="position:absolute;top:0;left:0;right:0;height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 26px;font-size:13px;font-weight:500;color:var(--ink-body);z-index:50"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><span style="width:14px;height:10px;border-radius:2px;background:var(--ink-muted)"></span><span style="width:22px;height:11px;border-radius:3px;border:1.5px solid var(--ink-muted);box-sizing:border-box;padding:1.5px"><span style="display:block;width:70%;height:100%;background:var(--ink-muted);border-radius:1px"></span></span></span></div>`;
function phone(inner, theme = 'day', o = {}) {
  const t = theme === 'night' ? ' data-theme="night"' : '';
  return `<div style="display:flex;flex-direction:column;gap:12px;flex:none;width:390px"><div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><span style="${mono(12, 'var(--ink-body)', '0.08em')}">${o.label || ''}</span><span style="${mono(12, 'var(--ink-faint)', '0.06em')}">${theme} · 390×844</span></div>
<div${t} style="position:relative;width:390px;height:844px;overflow:hidden;border-radius:28px;background:var(--paper-linen);color:var(--ink-body);font-family:var(--font-ui);box-shadow:0 0 0 1px var(--line-solid),var(--shadow-panel)">
${theme === 'day' ? '<div style="position:absolute;inset:0;background-image:var(--noise-url);mix-blend-mode:multiply;opacity:0.5;pointer-events:none;z-index:45"></div>' : ''}${statusBar()}${inner}<div style="position:absolute;bottom:6px;left:50%;width:108px;height:4px;margin-left:-54px;border-radius:2px;background:var(--ink-body);opacity:0.35;z-index:60"></div></div></div>`;
}
const body = (html, top = 88, bottom = 80, extra = '') => `<div style="position:absolute;top:${top}px;left:0;right:0;bottom:${bottom}px;overflow:hidden;${extra}">${html}</div>`;
const scrim = (op = 1) => `<div style="position:absolute;inset:0;background:var(--scrim);opacity:${op};z-index:15"></div>`;
const handle = (hit) => `<div style="position:relative;height:24px;display:flex;justify-content:center;align-items:center;flex:none"><span style="width:32px;height:4px;border-radius:2px;background:var(--ink-hairline)"></span>${hit ? `<span style="position:absolute;top:0;left:50%;width:120px;height:48px;margin-left:-60px;outline:1px dashed var(--focus);background:var(--select-bg)"></span><span style="position:absolute;top:14px;left:calc(50% + 70px);${mono(12, 'var(--focus)')};white-space:nowrap">32×4 · hit 48</span>` : ''}</div>`;
function sheet(content, h, o = {}) {
  return `<div style="position:absolute;left:0;right:0;${o.bottom != null ? `bottom:${o.bottom}px` : 'bottom:0'};height:${h}px;background:var(--paper-parchment);border-radius:8px 8px 0 0;box-shadow:var(--shadow-sheet);z-index:20;display:flex;flex-direction:column;overflow:hidden;${o.ty ? `transform:translateY(${o.ty}px);` : ''}">${o.noHandle ? '' : handle(o.hit)}${content}</div>`;
}
const sheetHead = (title, o = {}) => `<div style="display:flex;align-items:center;min-height:56px;padding:0 4px 0 ${o.lead ? 4 : 20}px;gap:4px;flex:none">${o.lead ? iconBtn(o.lead, 'var(--ink-body)') : ''}<div style="flex:1;min-width:0"><div style="font-family:var(--font-display);font-size:20px;font-weight:500;line-height:1.2;color:var(--ink-body)">${title}</div>${o.sub ? `<div style="margin-top:3px;${mono(12, 'var(--ink-faint)')}">${o.sub}</div>` : ''}</div>${o.right || ''}</div>`;
function toast(text, o = {}) {
  return `<div style="position:absolute;left:12px;right:12px;bottom:${o.bottom != null ? o.bottom : 88}px;min-height:48px;background:var(--toast-bg);color:var(--toast-ink);border-radius:3px;box-shadow:var(--shadow-toast);display:flex;align-items:center;gap:4px;padding:0 4px 0 16px;box-sizing:border-box;z-index:25;overflow:hidden;${o.op != null ? `opacity:${o.op};` : ''}${o.scale ? `transform:scale(${o.scale});` : ''}"><span style="flex:1;min-width:0;font-size:14px;line-height:20px;padding:14px 0;text-wrap:pretty">${text}</span>${o.action === false ? '' : `<span style="height:48px;padding:0 12px;display:flex;align-items:center;font-size:14px;font-weight:600;color:var(--toast-action);flex:none">${o.action || 'Undo'}</span>`}${o.life != null ? `<span style="position:absolute;left:0;bottom:0;height:2px;width:${o.life}%;background:var(--toast-action);opacity:0.7"></span>` : ''}</div>`;
}
const DAYS = [['S', '27'], ['M', '28'], ['T', '29'], ['W', '30'], ['T', '1'], ['F', '2'], ['S', '3']];
function weekStrip(o = {}) {
  const sel = o.sel ?? 0, dots = o.dots || [1, 1, 0, 1, 0, 0, 1];
  return `<div style="display:flex;padding:0 8px">${DAYS.map(([d, n], i) => {
    const isSel = i === sel, isToday = i === 0;
    const circ = isSel ? 'background:var(--ink-body);color:var(--paper-parchment);' : isToday ? 'box-shadow:inset 0 0 0 1.5px var(--acc-terra-ink);color:var(--acc-terra-ink);' : 'color:var(--ink-body);';
    return `<div style="flex:1;display:flex;justify-content:center"><div style="width:48px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><span style="${mono(12, isToday ? 'var(--acc-terra-ink)' : isSel ? 'var(--ink-body)' : 'var(--ink-faint)', '0.04em')}">${d}</span><span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:${isToday || isSel ? 600 : 500};${circ}">${n}</span><span style="width:4px;height:4px;border-radius:50%;background:${dots[i] ? 'var(--ink-faint)' : 'transparent'}"></span></div></div>`;
  }).join('')}</div>`;
}
function nowSlip(o = {}) {
  const pct = o.pct ?? 60, rc = o.ringC || 'var(--acc-sage-text)';
  const ring = o.loading ? `<span style="width:44px;height:44px;border-radius:50%;background:var(--skeleton);flex:none"></span>`
    : `<span style="position:relative;width:44px;height:44px;border-radius:50%;background:conic-gradient(${rc} 0 ${pct}%, var(--line-card) ${pct}% 100%);display:flex;align-items:center;justify-content:center;flex:none"><span style="width:36px;height:36px;border-radius:50%;background:var(--paper-parchment);display:flex;align-items:center;justify-content:center;${mono(12, o.ringLabelC || rc, '0.02em')}">${o.ringLabel ?? '45m'}</span></span>`;
  const act = o.action || 'done';
  const btnInner = act === 'undo' ? ic('undo', 20) : act === 'pick' ? ic('chevright', 20) : act === 'done-on' ? ic('check', 20, 'var(--paper-parchment)', 2.2) : ic('check', 20, 'currentColor', 2);
  const btnBox = act === 'done-on' ? 'background:var(--acc-sage-text);border:1px solid var(--acc-sage-text);' : 'background:var(--paper-bone);border:1px solid var(--line-control);';
  const btnPress = act === 'done-pressed' ? 'transform:scale(0.92);background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : '';
  const button = act === 'none' ? '' : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex:none;${act === 'done-pressed' ? 'border-radius:50%;background:var(--pressed-overlay);' : ''}"><span style="width:40px;height:40px;border-radius:50%;${btnBox}${btnPress}display:flex;align-items:center;justify-content:center;color:${act === 'undo' || act === 'pick' ? 'var(--ink-muted)' : 'var(--acc-sage-text)'}">${btnInner}</span></span>`;
  const body = o.loading ? `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">${sk('38%', 10)}${sk('86%', 14)}${sk('58%', 14)}</div>`
    : `<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="${mono(12, o.capC || 'var(--acc-sage-text)', '0.07em')};white-space:nowrap">${o.cap || 'Now · until 11:30'}</span>${o.pending ? `<span style="display:inline-flex;align-items:center;gap:5px;${mono(12, 'var(--sig-offline)')}"><span style="width:7px;height:7px;border-radius:50%;border:1.5px solid var(--sig-offline);box-sizing:border-box"></span>Pending</span>` : ''}</div><div style="margin-top:3px;font-size:15px;line-height:20px;font-weight:500;color:${o.done ? 'var(--ink-faint)' : o.titleC || 'var(--ink-body)'};${o.done ? 'text-decoration:line-through;text-decoration-color:var(--ink-hairline);' : ''}text-wrap:pretty">${o.title || 'Plan and implement the forecasting logic'}</div></div>`;
  return `<div style="position:relative;${o.w ? `width:${o.w}px;` : 'margin:0 16px;'}box-sizing:border-box;background:var(--paper-parchment);border:1px solid var(--line-card);border-radius:3px;box-shadow:${o.focus ? 'var(--focus-ring)' : 'var(--shadow-card)'};transform:rotate(-0.3deg)${o.pressed ? ' scale(0.98)' : ''};${o.pressed ? 'background-image:linear-gradient(var(--pressed-overlay),var(--pressed-overlay));' : ''}display:flex;align-items:center;gap:12px;padding:10px 4px 10px 12px">${tape(40, 13, 'rgba(138,154,126,0.45)', -4, 'top:-7px;left:18px')}${ring}${body}${button}</div>`;
}
const hairline = (pct, c = 'var(--acc-sage-text)') => `<div style="position:relative;height:2px;background:var(--line-card);border-radius:1px"><span style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${c};border-radius:1px"></span></div>`;
const workload = (amber) => amber
  ? `<div style="display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--sig-amber)">${ic('alert', 20)}<span style="flex:1;min-width:0">~9h planned · you'll finish ~22:10</span><span style="${mono(12, 'var(--sig-amber)')}">2h over</span></div>`
  : `<div style="display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--ink-muted)">${ic('clock', 20, 'var(--ink-faint)')}<span>~5h planned · you'll finish ~17:30</span></div>`;
function nowCard(o = {}) {
  const n = o.num ? (k) => `<span style="position:absolute;${k[1]};width:20px;height:20px;border-radius:50%;background:var(--focus);color:var(--paper-parchment);font-size:12px;font-weight:600;line-height:20px;text-align:center;z-index:3">${k[0]}</span>` : () => '';
  return `<div style="position:relative;background:var(--paper-parchment);border:1px solid var(--line-card);border-radius:3px;box-shadow:var(--shadow-card);transform:rotate(-0.3deg);padding:14px 16px 0">
${tape(52, 15, 'rgba(138,154,126,0.42)', -3, 'top:-8px;left:22px')}
${n(['1', 'top:12px;right:-10px'])}${n(['2', 'top:40px;right:-10px'])}${n(['3', 'top:92px;right:-10px'])}${n(['4', 'top:122px;right:-10px'])}${n(['5', 'top:150px;right:-10px'])}${n(['6', 'bottom:14px;right:-10px'])}
<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--acc-sage-text)"></span><span style="${mono(12, 'var(--acc-sage-text)', '0.07em')}">Now · 10:30–11:30</span><span style="flex:1"></span><span style="${mono(12, 'var(--ink-faint)')}">45m left</span></div>
<div style="margin-top:8px;font-family:var(--font-display);font-size:20px;font-weight:500;line-height:1.25;color:var(--ink-body);text-wrap:pretty">Plan and implement the forecasting logic</div>
<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:12px">${metaI('Forecasting app', 'var(--ink-faint)', 'var(--acc-moss)')}${metaI('2/5 subtasks')}</div>
<div style="margin:12px 0 12px">${hairline(40)}</div>
<div style="display:flex;gap:8px">${btn('secondary', 'default', 'Done', 'check')}${btn('secondary', 'default', '+15m')}${btn('secondary', 'default', 'Tomorrow')}</div>
<div style="margin-top:8px;border-top:1px dashed var(--line-dashed);display:flex;align-items:center;min-height:48px;gap:4px"><span style="height:48px;display:flex;align-items:center;padding-right:10px;font-size:14px;color:var(--ink-muted)">Notes</span><span style="height:48px;display:flex;align-items:center;padding:0 10px;font-size:14px;color:var(--ink-muted)">Subtasks</span><span style="flex:1"></span><span style="height:48px;display:flex;align-items:center;gap:6px;padding-left:10px;font-size:14px;font-weight:600;color:var(--acc-sage-text)">${ic('focus', 20)}Focus</span></div></div>`;
}
const sk = (w, h = 12, extra = '') => `<span style="display:block;width:${w};height:${h}px;border-radius:2px;background:var(--skeleton);${extra}"></span>`;
const skRow = (w1 = '78%', w2 = '40%') => `<div style="display:flex;align-items:flex-start;gap:12px;padding:18px 16px 16px;border-bottom:1px dashed var(--line-dashed)"><span style="width:22px;height:22px;border-radius:6px;background:var(--skeleton);flex:none"></span><div style="flex:1;display:flex;flex-direction:column;gap:9px;padding-top:3px">${sk(w1, 13)}${sk(w2, 10, 'background:var(--skeleton-hi)')}</div></div>`;
const kitWrap = (inner) => `<div style="padding:8px 16px 0">${inner}</div>`;
const dim = (t, pos, c = 'var(--focus)') => `<span style="position:absolute;${pos};${mono(12, c, '0.04em')};background:var(--paper-parchment);padding:1px 5px;border:1px dashed ${c};border-radius:2px;white-space:nowrap;z-index:70">${t}</span>`;

function dcFile(tpl, js, props) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${tpl}
</x-dc>
<script type="text/x-dc" data-dc-script${props ? ` data-props='${props}'` : ''}>
${js || 'class Component extends DCLogic {\n  renderVals() { return {}; }\n}'}
</script>
</body>
</html>
`;
}
const helmet = (o = {}) => `<helmet>
${o.canvas ? '<meta name="design_doc_mode" content="canvas">\n' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400;1,8..60,500&amp;family=Inter+Tight:wght@400;500;600&amp;family=Courier+Prime:ital,wght@0,400;0,700;1,400&amp;family=Caveat:wght@400;500;600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="ds/styles.css">
<style>
*{box-sizing:border-box}
html,body{margin:0}
body{background:${o.night ? '#17141f' : 'var(--paper-linen)'};color:var(--ink-body);font-family:var(--font-ui);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
a{color:var(--acc-lavender-deep);text-decoration-color:var(--line-control)}a:hover{color:var(--ink-body)}
</style>
</helmet>`;

return { ICON, NAV, ACT, UTIL, ic, svgFile, esc, ratio, mono, PRESS, stateMod, spinner, btn, chip, checkbox, star, iconBtn, field, toggle, segmented, sectionLabel, tape, goalCard, metaI, selCircle, taskRow, captureBtn, tabBar, bulkBar, topBar, statusBar, phone, body, scrim, handle, sheet, sheetHead, toast, weekStrip, nowSlip, hairline, workload, nowCard, sk, skRow, kitWrap, dim, dcFile, helmet, hitBox };
})();
