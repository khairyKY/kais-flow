// Generator for Today Phone / Plan / Shutdown (.dc.html), 2026-09-28. Not loaded by any page.
// Every piece comes from the Sep 2026 kit generator (lib.js); this file only composes screens.
// Run from the repo root:  node design-export/_gen/screens.js
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8'));
const L = LIB;
const { ic, mono, btn, chip, sectionLabel, goalCard, metaI, taskRow, tabBar, topBar, phone, body, sheet, sheetHead, toast, nowSlip, hairline, sk, skRow, dim, field, segmented, iconBtn } = L;
const OUT = path.join(__dirname, '..');
const DOTS = iconBtn('dots', 'var(--ink-muted)');

// ---------- page chrome (same dv-* turn/option chrome as Today.dc.html / Rituals.dc.html) ----------
const DV = `.dv-turn{padding:44px 48px 36px}
.dv-thd{display:flex;align-items:baseline;gap:10px;margin:0 0 24px}
.dv-tid{font:600 10px var(--font-mono);padding:4px 8px;background:#2a2420;color:#F4F1EA;border-radius:4px;text-decoration:none;letter-spacing:0.08em}
.dv-tname{font:600 14px var(--font-ui);color:#2a2420}
.dv-opts{display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start}
.dv-opt{flex:none;display:flex;flex-direction:column;gap:12px;scroll-margin-top:16px}
.dv-oid{font:600 10.5px var(--font-mono);padding:3px 8px;background:rgba(42,36,32,0.1);color:#2a2420;border-radius:5px;text-decoration:none;letter-spacing:0.06em}
.dv-olabel{display:flex;align-items:center;gap:10px;font:400 12px var(--font-mono);letter-spacing:0.1em;text-transform:uppercase;color:#6b6455}
.dv-opt:target .dv-oid{background:var(--acc-terra);color:#fff}
.dv-next{margin:26px 0 0;max-width:1120px;font:13px/1.6 var(--font-ui);color:#6b6455}`;
function page(file, head, turns) {
  const tpl = L.helmet({ canvas: true }).replace('</style>', DV + '\n</style>') + '\n' + head + '\n' + turns.join('\n');
  fs.writeFileSync(path.join(OUT, file), L.dcFile(tpl));
  console.log('wrote', file);
}
const header = (kicker, h1, p) => `<header style="padding:64px 48px 0;display:flex;align-items:flex-end;gap:56px;flex-wrap:wrap"><div><div style="${mono(12, 'var(--ink-faint)', '0.2em')}">${kicker}</div><h1 style="margin:12px 0 0;font-family:var(--font-display);font-weight:500;font-size:48px;line-height:1;letter-spacing:-0.015em;color:var(--ink-body)">${h1}</h1></div><p style="margin:0;max-width:640px;font-size:15px;line-height:1.55;color:var(--ink-muted);text-wrap:pretty">${p}</p></header>`;
const turn = (n, name, opts, next) => `<section class="dv-turn" id="t${n}" data-screen-label="Turn ${n} · ${name}"><div class="dv-thd"><a class="dv-tid" href="#t${n}">${n}</a><span class="dv-tname">${name}</span></div><div class="dv-opts">${opts.join('\n')}</div>${next ? `<p class="dv-next">${next}</p>` : ''}</section>`;
const opt = (id, label, ...frames) => `<div class="dv-opt" id="${id}" data-screen-label="${id} ${label}"><div class="dv-olabel"><a class="dv-oid" href="#${id}">${id}</a>${label}</div><div data-audit="1" style="display:flex;gap:32px;align-items:flex-start">${frames.join('')}</div></div>`;
// phone frame from the kit, with the status-bar clock set to the scene's time; tall = whole scroll
const ph = (inner, theme = 'day', time = '9:41', tall) => {
  let h = phone(inner, theme).replace('<span>9:41</span>', `<span>${time}</span>`);
  if (tall) h = h.replace('height:844px', `height:${tall}px`).replace(`${theme} · 390×844`, `${theme} · whole scroll`);
  return h;
};

// ---------- shared bits ----------
const M = t => metaI(t);
const OD = t => metaI(t, 'var(--sig-overdue)');
const PJ = (t, dot = 'var(--acc-moss)') => metaI(t, 'var(--ink-faint)', dot);
const SAGE = t => metaI(t, 'var(--acc-sage-text)');
const GOLD = t => metaI(t, 'var(--acc-gold)');
const AMBER = t => metaI(t, 'var(--sig-amber)');
const SEED = `<span style="display:inline-flex;align-items:center;gap:4px;${mono(12, 'var(--acc-sage-text)')};white-space:nowrap">${ic('today', 16)}Seed</span>`;
const metas = items => `<div style="margin-top:3px;display:flex;flex-wrap:wrap;column-gap:12px;row-gap:2px">${items.join('')}</div>`;
const sec = (label, link, top = 8) => `<div style="padding:${top}px 16px 0">${sectionLabel(label, link || '')}</div>`;
const list = rows => `<div style="background:var(--paper-parchment);border-top:1px solid var(--line-card)">${rows.join('')}</div>`;
const hand = (t, sz = 20, c = 'var(--ink-hand)') => `<span style="font-family:var(--font-hand);font-size:${sz}px;line-height:1.3;color:${c}">${t}</span>`;
// one quiet line where an empty section collapses to ("Nothing carried over ✿")
const collapsed = (label, line) => `<div style="padding:8px 16px 0"><div style="display:flex;align-items:center;gap:12px;min-height:48px"><span style="${mono(12.5, 'var(--ink-faint)', '0.07em')};white-space:nowrap">${label}</span><span style="flex:1;border-bottom:1px dashed var(--line-dashed)"></span><span style="font-size:14px;color:var(--ink-muted);white-space:nowrap">${line}</span></div></div>`;
// sun / moon glyphs of the ritual card (app DayCard.tsx), token colours only
const SUN = `<svg width="26" height="26" viewBox="0 0 24 24" style="flex:none;display:block"><circle cx="12" cy="12" r="5" fill="var(--acc-gold-warm)"></circle><g stroke="var(--acc-gold-warm)" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"></path></g></svg>`;
const MOON = `<svg width="26" height="26" viewBox="0 0 24 24" style="flex:none;display:block"><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--acc-lavender)"></path></svg>`;

// =====================================================================================
// 02 · TODAY (PHONE)
// =====================================================================================
const T_TITLE = 'Sunday, Sep 27';
const sumLine = (text, extra = '') => `<div style="padding:0 16px 6px;display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--ink-muted)">${ic('clock', 20, 'var(--ink-faint)')}<span style="flex:1;min-width:0">${text}</span>${extra}</div>`;
const SYNCING = `<span style="display:inline-flex;align-items:center;gap:6px;${mono(12, 'var(--sig-offline)')};white-space:nowrap"><span style="width:7px;height:7px;border-radius:50%;background:var(--sig-offline)"></span>Syncing</span>`;

// The ritual card: the NOW slip's anatomy (glyph · text · one action), flat — no tape, no tilt.
function ritualCard(o) {
  const glyph = `<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none">${o.glyph}</span>`;
  const txt = `<div style="flex:1;min-width:0"><div style="${mono(12, o.capC || 'var(--ink-faint)', '0.07em')}">${o.cap}</div><div style="margin-top:3px;font-size:15px;line-height:20px;font-weight:500;color:var(--ink-body);text-wrap:pretty">${o.title}</div>${o.meta ? metas(o.meta.map(t => M(t))) : ''}${o.extra || ''}${o.pct != null ? `<div style="margin-top:8px">${hairline(o.pct)}</div>` : ''}</div>`;
  const action = o.action ? `<span style="flex:none">${btn('secondary', 'default', o.action)}</span>` : '';
  return `<div style="margin:8px 16px 10px;box-sizing:border-box;background:var(--paper-parchment);border:1px solid var(--line-card);border-radius:3px;box-shadow:var(--shadow-crisp);display:flex;align-items:center;gap:12px;padding:10px 8px 10px 8px">${glyph}${txt}${action}</div>`;
}
const CARD_MORNING = (o = {}) => ritualCard({ glyph: SUN, cap: o.cap || 'Morning · not planned', title: 'Plan my day', meta: o.meta || ['~3 min', '2 in inbox', '7 overdue'], action: o.action || 'Plan', pct: o.pct });
const CARD_EVENING = ritualCard({ glyph: MOON, cap: 'Evening · 19:30', title: 'Shut down the day', meta: ['~2 min', '3 to sweep'], action: 'Shut down' });
const CARD_CLOSED = ritualCard({ glyph: MOON, cap: 'Evening ✓ · 21:50', title: 'Day closed ✿', meta: ['3 seeds planted for Mon'], extra: `<div style="margin-top:4px">${hand("The garden's closed. See you in the morning.", 18)}</div>` });

const GOAL = "Finish the Kai's Flow flow audit";
function goal(done, meta) {
  let h = goalCard(done ? 'selected' : 'default', 358).replace('Deliver the MVP of the forecasting app', GOAL);
  if (meta) h = h.replace(done ? 'Done 14:20 · a four-leaf day' : 'The one thing that makes today a win', meta);
  return `<div style="padding:14px 16px 14px">${h}</div>`;
}
const R_REVIEW = (o = {}) => taskRow({ title: 'Review Kai', meta: o.done ? [M('Done 11:05')] : [OD('Overdue 64d'), M('30m')], top3: true, done: o.done, pending: o.pending });
const R_NODE = (o = {}) => taskRow({ title: 'Search for a good node.js source', meta: o.done ? [M('Done 16:10')] : [PJ("Kai's Flow"), M('45m')], top3: true, done: o.done });

// Event row: time on the left, lavender (calendar) rule, title. Tap = open. No checkbox — it is an event.
const eventRow = (time, title, meta) => `<div style="display:flex;align-items:stretch;min-height:56px;padding:4px 16px 4px 4px;box-sizing:border-box;border-bottom:1px dashed var(--line-dashed)"><span style="width:56px;flex:none;display:flex;align-items:center;padding-left:12px;${mono(12.5, 'var(--ink-body)', '0.04em')}">${time}</span><span style="width:3px;margin:12px 12px 12px 0;border-radius:2px;background:var(--acc-lavender);flex:none"></span><div style="flex:1;min-width:0;padding:10px 0 8px"><div style="font-size:15px;line-height:20px;color:var(--ink-body);text-wrap:pretty">${title}</div>${metas(meta)}</div></div>`;
const E_DEEP = eventRow('09:00', 'Deep work — forecasting', [M('1h 30m'), M('in 1h 20m')]);
const E_CALL = rel => eventRow('15:00', 'Call the tyre supplier', rel ? [M('30m'), M(rel)] : [M('30m')]);
const E_GYM = eventRow('18:00', 'Gym — upper body', [M('1h')]);
const nothingTimed = t => `<div style="background:var(--paper-parchment);border-top:1px solid var(--line-card);border-bottom:1px dashed var(--line-dashed);min-height:56px;display:flex;align-items:center;padding:0 16px;font-size:14px;line-height:20px;color:var(--ink-faint)">${t}</div>`;
const routine = (name, done, meta) => taskRow({ title: name, meta: meta ? [M(meta)] : [], done, star: false }).replace(DOTS, '');
const ROUT_AM = [routine('Glass of water', true, 'Done 07:10'), routine('Stretch', false, '10m'), routine('Read 20 pages', false, '20m')];
const ROUT_PM = [routine('Tidy the desk', false, '5m'), routine('Phone on the charger', false, 'By 23:00')];
const fold = (n, open) => `<div style="padding:8px 16px 0"><div style="display:flex;align-items:center;gap:12px;min-height:48px"><span style="${mono(12.5, 'var(--ink-faint)', '0.07em')};white-space:nowrap">More for today · ${n}</span><span style="flex:1;border-bottom:1px dashed var(--line-dashed)"></span>${ic(open ? 'chevup' : 'chevdown', 20, 'var(--ink-muted)')}</div></div>`;

const top3 = (g, rows, after = '') => sec('Top 3', 'All tasks', 4) + g + list(rows) + after;
const upNext = rows => sec('Up next', 'Calendar') + (rows.length ? list(rows) : nothingTimed('Nothing else on the calendar today'));
const routines = (label, rows) => sec(label, 'Routines') + list(rows);

function today(o) {
  const content = (o.sum || '') + (o.card || '') + o.main;
  const bar = o.scrolled ? topBar(T_TITLE, { small: true, bg: 'var(--paper-linen)' }) : topBar(T_TITLE);
  const inner = bar + body(o.shift ? `<div style="margin-top:-${o.shift}px">${content}</div>` : content) + (o.toast || '') + (o.notes || '') + tabBar({ active: 'today', badges: o.badges === undefined ? { inbox: 2 } : o.badges, pressed: o.pressed });
  return ph(inner, o.theme, o.time);
}
const SUM = {
  morning: sumLine('Day 84 · not planned yet'),
  run: sumLine("Day 84 · ~5h planned · you'll finish ~17:30"),
  mid: sumLine("Day 84 · ~3h left · you'll finish ~17:30"),
  eve: sumLine('Day 84 · 2 of 3 done · 2h 10m focused'),
  closed: sumLine('Day 84 · 4 done · 2h 10m focused'),
  all: sumLine('Day 84 · all three done by 16:20'),
};
const MAIN = {
  morning: top3(goal(false, 'Seeded last night · 2h'), [R_REVIEW(), R_NODE()]) + upNext([E_DEEP, E_CALL(), E_GYM]) + routines('Routines · Morning 1/3', ROUT_AM) + fold(6),
  run: top3(goal(false, '13:30–15:00 · 1h 30m'), [R_REVIEW(), R_NODE()]) + upNext([E_CALL('in 5h 20m'), E_GYM]) + routines('Routines · Morning 1/3', ROUT_AM) + fold(6),
  mid: o => top3(goal(false, '13:30–15:00 · starts in 20m'), [R_REVIEW({ done: true, pending: o && o.pending }), R_NODE()]) + upNext([E_CALL('in 1h 50m'), E_GYM]) + routines('Routines · Morning 1/3', ROUT_AM) + fold(5),
  eve: top3(goal(true), [R_REVIEW({ done: true }), R_NODE()]) + upNext([]) + routines('Routines · Evening 0/2', ROUT_PM) + fold(4),
  closed: top3(goal(true), [R_REVIEW({ done: true }), taskRow({ title: 'Search for a good node.js source', meta: [SAGE('→ Mon 09:00'), M('45m')], top3: true })]) + upNext([]) + routines('Routines · Evening 2/2', [routine('Tidy the desk', true, 'Done 20:40'), routine('Phone on the charger', true, 'Done 21:45')]) + fold(3),
};

const NOW_SLIP = `<div style="padding:12px 0 14px">${nowSlip({ pct: 44, ringLabel: '50m', cap: 'Now · until 10:30', title: 'Deep work — forecasting' })}</div>`;

const T = {
  a: th => today({ theme: th, time: '07:40', sum: SUM.morning, card: CARD_MORNING(), main: MAIN.morning }),
  b: th => today({ theme: th, time: '09:40', sum: SUM.run, card: NOW_SLIP, main: MAIN.run }),
  c: () => today({ time: '13:10', sum: SUM.mid, main: MAIN.mid(), toast: toast('Review Kai — done', { life: 70 }) }),
  d: () => today({ time: '19:30', sum: SUM.eve, card: CARD_EVENING, main: MAIN.eve }),
  e: th => today({ theme: th, time: '21:50', sum: SUM.closed, card: CARD_CLOSED, main: MAIN.closed }),
  f: () => today({
    time: '08:15', badges: {}, sum: sumLine('Day 1 · a fresh page'),
    main: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:112px 40px 0;text-align:center"><img src="ds/assets/clover/seedling.png" alt="" style="width:120px;height:auto;filter:var(--shadow-drop-sm)"><div style="font-size:16px;line-height:1.45;color:var(--ink-muted);text-wrap:pretty">Nothing here yet. A day starts with three things.</div>${btn('secondary', 'default', 'Add your first three things')}</div>`,
  }),
  g: () => today({
    time: '09:40', badges: {},
    sum: `<div style="padding:4px 16px 12px">${sk('64%', 12)}</div>`,
    main: sec('Top 3', '', 4) + `<div style="padding:14px 16px 14px">${goalCard('loading', 358).replace('Deliver the MVP of the forecasting app', '')}</div>` + list([skRow('74%', '36%'), skRow('82%', '44%')]) + sec('Up next', '') + list([skRow('58%', '30%'), skRow('66%', '26%')]),
  }),
  h: () => today({ time: '13:10', sum: `<div style="padding:0 16px 8px">${chip('offline', 'Offline — changes will sync')}</div>`, main: MAIN.mid({ pending: true }) }),
  i: () => today({
    time: '16:20', sum: SUM.all,
    main: top3(goal(true), [R_REVIEW({ done: true }), R_NODE({ done: true })], `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 2px"><img src="ds/assets/clover/four_leaf.png" alt="" style="width:36px;height:auto;filter:var(--shadow-drop-sm)">${hand('All three tended. The rest is extra ✿')}</div>`) + upNext([E_GYM]) + routines('Routines · Morning 3/3', [routine('Glass of water', true, 'Done 07:10'), routine('Stretch', true, 'Done 07:30'), routine('Read 20 pages', true, 'Done 12:50')]) + fold(3),
  }),
  m: () => today({ time: '13:10', sum: sumLine("Day 84 · ~3h left · you'll finish ~17:30", SYNCING), main: MAIN.mid() }),
  n: () => {
    const more = `<div style="padding:4px 16px 0;${mono(12, 'var(--ink-faint)', '0.07em')}">Open · 3</div>` + list([
      taskRow({ title: 'Buy milk', meta: [PJ('Personal', 'var(--acc-blossom)'), M('10m')] }),
      taskRow({ title: 'Reply to Omar about lunch', meta: [M('5m')] }),
      taskRow({ title: 'Water the balcony plants', meta: [M('Due today'), M('10m')] }),
    ]) + `<div style="padding:14px 16px 0;${mono(12, 'var(--ink-faint)', '0.07em')}">Slipping</div><div style="display:flex;align-items:center;gap:12px;min-height:56px;padding:4px 16px;background:var(--paper-parchment);border-top:1px solid var(--line-card);border-bottom:1px dashed var(--line-dashed)"><img src="ds/assets/wisteria/p20.png" alt="" style="height:40px;width:auto;flex:none"><div style="flex:1;min-width:0"><div style="font-size:15px;line-height:20px;color:var(--ink-body)">Portfolio site</div>${metas([metaI('Untouched 9 days', 'var(--acc-buttercream-text)')])}</div>${ic('chevright', 20, 'var(--ink-muted)')}</div>` +
      `<div style="padding:14px 16px 0;${mono(12, 'var(--ink-faint)', '0.07em')}">From a while ago</div><div style="padding:6px 16px 0">${hand('“Write the audit as a letter to future Kai.”', 20)}<div style="margin-top:2px;display:flex;align-items:center;gap:4px">${M('Saved 12 Jul')}<span style="flex:1"></span>${btn('ghost', 'default', 'Later')}${btn('secondary', 'default', 'Still relevant')}</div></div>`;
    return today({
      time: '13:10', scrolled: true, shift: 760, pressed: 'today', sum: SUM.mid, main: MAIN.mid().replace(fold(5), fold(5, true)) + more,
      notes: dim('Re-tap Today → back to the top · 300ms', 'bottom:92px;left:10px'),
    });
  },
};

page('Today Phone.dc.html',
  header("Kai's Flow · Today (phone) · 28 Sep 2026", 'What now, what’s next, what’s left', 'Brief 02, read through Kai’s rulings: every item shows once, as what it is — a task row (checkbox = done, tap = open) or an event row (tap = open). No Done/Open buttons. Only two things can sit above Top 3: the <b>ritual card</b> when a ritual is due (Plan my day · Shut down · Day closed, action on the right) or the <b>NOW slip</b> (Mobile Kit 11, option 1b) while a calendar block is actually running — never both. Up next lists only what is still to come and skips anything already in Top 3. Sample day: Sunday 27 Sep, Day 84.'),
  [turn(1, 'Today (phone) — the day, state by state', [
    opt('2a', 'Morning · not planned · 07:40', T.a('day')),
    opt('2b', 'Block running · NOW slip · 09:40', T.b('day')),
    opt('2c', 'Midday · nothing running · 13:10', T.c()),
    opt('2d', 'Evening · Shut down · 19:30', T.d()),
    opt('2e', 'Day closed · 21:50', T.e('day')),
    opt('2f', 'Empty day · new user', T.f()),
    opt('2g', 'Loading · no cache only', T.g()),
    opt('2m', 'Cached · syncing dot', T.m()),
    opt('2h', 'Offline · cached + chip', T.h()),
    opt('2i', 'All done · quiet', T.i()),
    opt('2n', 'Scrolled · fold open · re-tap Today', T.n()),
  ], 'Order, top to bottom: date title (26) + one summary line → ritual card <i>or</i> NOW slip → Top 3 (goal card + two rows) → Up next → Routines → the quiet “More for today” fold. 2c shows a checkbox tap: the row stays, strikes through, and the Undo toast carries the way back. No pull-to-refresh anywhere — the app syncs live; re-tapping the Today tab scrolls to the top (<a class="dv-oid" href="#2n">2n</a>). Skeleton only when nothing is cached (<a class="dv-oid" href="#2g">2g</a>); otherwise the cache paints at once with a syncing dot (<a class="dv-oid" href="#2m">2m</a>).'),
  turn(2, 'Night', [
    opt('2j', 'Night · morning not planned', T.a('night')),
    opt('2k', 'Night · block running', T.b('night')),
    opt('2l', 'Night · day closed', T.e('night')),
  ], 'Same screens on the night tokens (Design System Dark). Nothing changes shape at night; the ritual glyphs and species keep their colours.')]);

// =====================================================================================
// 06 · PLAN MY DAY
// =====================================================================================
const deleteGhost = label => btn('ghost', 'default', label, 'delete').replace('color:var(--ink-muted)', 'color:var(--acc-terra-ink)');
function carry(title, meta, sel, o = {}) {
  const segs = o.evening ? ['Tonight', 'Tomorrow', 'Someday'] : ['Today', 'Tomorrow', 'Someday'];
  const row = taskRow({ title, meta, top3: !!o.star, noBorder: true });
  const inner = `${row}<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 4px 8px 12px;margin-top:-6px">${segmented('default', segs, sel)}${deleteGhost('Drop')}</div>`;
  if (o.swipe) return `<div style="position:relative;overflow:hidden;border-bottom:1px dashed var(--line-dashed)"><div style="position:absolute;inset:0;background:var(--swipe-right-bg);color:var(--swipe-right-ink);display:flex;align-items:center;gap:10px;padding-left:20px">${ic('tomorrow', 24)}<span style="font-size:15px;font-weight:600">Tomorrow</span><span style="${mono(12, 'var(--swipe-right-ink)')};white-space:nowrap">Mon 09:00</span></div><div style="position:relative;transform:translateX(${o.swipe}px);background:var(--paper-parchment);box-shadow:var(--shadow-card)">${inner}</div></div>`;
  return `<div style="background:var(--paper-parchment);border-bottom:1px dashed var(--line-dashed)">${inner}</div>`;
}
const inboxRow = (text, proj, captured) => `<div style="background:var(--paper-parchment);border-bottom:1px dashed var(--line-dashed);padding:12px 12px 6px 16px"><div style="font-size:15px;line-height:20px;color:var(--ink-body);text-wrap:pretty">${text}</div>${metas([M(captured)])}<div style="display:flex;align-items:center;gap:4px;margin-top:2px"><span style="flex:1;min-width:0;height:48px;display:flex;align-items:center">${chip('project', proj, 'default', 'projects')}</span>${btn('ghost', 'default', 'Dismiss')}${btn('secondary', 'default', 'File')}</div></div>`;
const pick = (title, meta, on) => taskRow({ title, meta, top3: on });
// mini day timeline 09–18: calendar events (lavender), suggested (dashed sage), accepted (sage), being changed (focus)
function timeline(blocks, o = {}) {
  const x = h => ((h - 9) / 9 * 100).toFixed(2) + '%';
  const st = { event: 'background:var(--block-lavender);box-shadow:inset 0 0 0 1px var(--acc-lavender);', proposed: 'border:1.5px dashed var(--acc-sage-text);', accepted: 'background:var(--block-sage);box-shadow:inset 0 0 0 1.5px var(--acc-sage-text);', changing: 'border:2px solid var(--focus);' };
  const bl = blocks.map(([a, b, k]) => `<span style="position:absolute;top:5px;bottom:5px;left:${x(a)};width:${((b - a) / 9 * 100).toFixed(2)}%;border-radius:2px;box-sizing:border-box;${st[k]}"></span>`).join('');
  const ticks = [12, 15].map(h => `<span style="position:absolute;left:${x(h)};top:0;bottom:0;border-left:1px dashed var(--line-dashed)"></span>`).join('');
  const now = o.now ? `<span style="position:absolute;left:${x(o.now)};top:-3px;bottom:-3px;width:1.5px;background:var(--acc-terra-ink)"></span>` : '';
  const labels = [9, 12, 15, 18].map((h, i) => `<span style="position:absolute;top:0;left:${x(h)};transform:translateX(${i === 0 ? '0' : i === 3 ? '-100%' : '-50%'});${mono(12, 'var(--ink-faint)', '0.04em')}">${o.hours ? o.hours[i] : String(h).padStart(2, '0') + ':00'}</span>`).join('');
  const sw = s => `<span style="width:16px;height:12px;border-radius:2px;box-sizing:border-box;flex:none;${st[s]}"></span>`;
  const legend = [['event', 'Calendar'], ['proposed', 'Suggested'], ['accepted', 'Accepted']].map(([s, t]) => `<span style="display:inline-flex;align-items:center;gap:6px;${mono(12, 'var(--ink-faint)', '0.04em')}">${sw(s)}${t}</span>`).join('');
  return `<div style="padding:6px 16px 10px"><div style="position:relative;height:38px;background:var(--paper-bone);border:1px solid var(--line-card);border-radius:3px;overflow:hidden">${ticks}${bl}${now}</div><div style="position:relative;height:18px;margin-top:6px">${labels}</div><div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px">${legend}</div></div>`;
}
function timeRow(title, meta, slot, st) {
  const pill = st === 'noslot' ? btn('secondary', 'default', 'Pick one', 'clock')
    : `<span style="display:inline-flex;align-items:center;height:48px;padding:0 14px;box-sizing:border-box;border-radius:999px;font-size:14px;white-space:nowrap;flex:none;${st === 'accepted' ? 'background:var(--block-sage);box-shadow:inset 0 0 0 1.5px var(--acc-sage-text);color:var(--acc-sage-text);font-weight:600;' : st === 'changing' ? 'background:var(--paper-bone);border:2px solid var(--focus);color:var(--ink-body);font-weight:600;' : 'background:var(--paper-bone);border:1px solid var(--line-control);color:var(--ink-body);'}">${slot}</span>`;
  const on = st === 'accepted';
  const ok = st === 'noslot' ? '' : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex:none"><span style="width:40px;height:40px;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? 'background:var(--acc-sage-text);' : 'background:var(--paper-bone);border:1px solid var(--line-control);color:var(--acc-sage-text);'}">${ic('check', 20, on ? 'var(--paper-parchment)' : 'currentColor', on ? 2.2 : 2)}</span></span>`;
  return `<div style="display:flex;align-items:center;gap:8px;min-height:64px;padding:6px 4px 6px 16px;box-sizing:border-box;background:var(--paper-parchment);border-bottom:1px dashed var(--line-dashed)"><div style="flex:1;min-width:0"><div style="font-size:15px;line-height:20px;color:var(--ink-body);text-wrap:pretty">${title}</div>${metas(meta)}</div>${pill}${ok}</div>`;
}
function wl(text, over) {
  return over
    ? `<div style="display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--sig-amber)">${ic('alert', 20)}<span style="flex:1;min-width:0;text-wrap:pretty">${text}</span><span style="${mono(12, 'var(--sig-amber)')};white-space:nowrap">${over}</span></div>`
    : `<div style="display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--ink-muted)">${ic('clock', 20, 'var(--ink-faint)')}<span style="flex:1;min-width:0;text-wrap:pretty">${text}</span></div>`;
}
const sheetFoot = (wlHtml, status, cta) => `<div style="flex:none;padding:12px 16px 28px;border-top:1px dashed var(--line-dashed);background:var(--paper-parchment);display:flex;flex-direction:column;gap:6px">${wlHtml}<div style="display:flex;align-items:center;gap:12px"><span style="flex:1;min-width:0;${mono(12)}">${status}</span>${btn('primary', 'default', cta)}</div></div>`;
function fullSheet(o) {
  const scroll = `<div style="flex:1;min-height:0;overflow:hidden;position:relative"><div style="${o.shift ? `margin-top:-${o.shift}px;` : ''}padding-bottom:16px">${o.sections}</div></div>`;
  return sheet(sheetHead(o.title, { lead: 'close', sub: o.sub }) + scroll + (o.foot || ''), o.h || 796);
}
const sheetPhone = (o) => ph(topBar(T_TITLE) + L.scrim() + fullSheet(o) + (o.over || ''), o.theme, o.time, o.tall);

// ----- Plan sample data -----
const P_CARRY = (sel = [-1, -1], o = {}) => sec('Carry-over · 2', 'Roll all to tomorrow', 4) + carry('Review Kai', [OD('Overdue 64d'), M('30m')], sel[0], o) + carry('Untitled task', [M('From yesterday')], sel[1], o);
const P_INBOX = sec('Inbox · 2', '') + inboxRow('idea: dark mode for the herbarium', 'Kai’s Flow', 'Voice · last night 23:10') + inboxRow('book dentist', 'Health', 'Typed · Fri');
// the third pick: open by default; 6e swaps in a 4-hour task to overfill the day
const NODE3 = { title: 'Search for a good node.js source', meta: [PJ("Kai's Flow"), M('45m')], tmeta: [M('45m')], slot: '14:30–15:15', span: [14.5, 15.25] };
const BUDGET3 = { title: 'Draft the Q4 budget', meta: [PJ('Finance', 'var(--acc-hydrangea)'), M('4h')], tmeta: [M('4h'), AMBER('Runs past 18:00')], slot: '14:30–18:30', span: [14.5, 18.5] };
const P_PICKS = (third, p3 = NODE3) => sec(`Pick your 3 · ${third ? 3 : 2}/3`, 'All tasks') + pick('Finish the flow audit', [GOLD('✶ Goal'), SEED, M('2h')], true) + pick('Call the tyre supplier', [SEED, M('30m')], true) + pick(p3.title, p3.meta, !!third) + pick('Water the balcony plants', [M('Due today'), M('10m')], false);
const EV = [[9, 10.5, 'event'], [13, 14, 'event']];
const P_TIMES = (k = ['proposed', 'proposed'], thirdK, p3 = NODE3) => sec('Suggested times', '') + timeline([...EV, [10.5, 12.5, k[0]], [14, 14.5, k[1]], ...(thirdK ? [[...p3.span, thirdK]] : [])])
  + timeRow('Finish the flow audit', [M('2h'), M('after Deep work')], '10:30–12:30', k[0]) + timeRow('Call the tyre supplier', [M('30m')], '14:00–14:30', k[1]) + (thirdK ? timeRow(p3.title, p3.tmeta, p3.slot, thirdK) : '');
const P_FOOT = (text = "~5h planned · you'll finish around 17:30", status = '2 picked · 0 timed', over) => sheetFoot(wl(text, over), status, 'Start the day');
const PLAN = { title: 'Plan my day', sub: 'Sun 27 Sep · about 3 minutes', time: '07:40' };
const planAll = (o = {}) => P_CARRY(o.carrySel, o) + P_INBOX + P_PICKS(o.third, o.p3) + P_TIMES(o.k, o.thirdK, o.p3);
const END = 700; // scroll offset that lands on the end of the sheet (Suggested times in view)

// time picker (Mobile Kit 09), opened from a suggested time
function timePicker() {
  const lab = t => `<div style="padding:0 20px"><div style="display:flex;align-items:center;gap:12px;width:100%;min-height:48px"><span style="${mono(12.5, 'var(--ink-faint)', '0.07em')};white-space:nowrap">${t}</span><span style="flex:1;border-bottom:1px dashed var(--line-dashed)"></span></div></div>`;
  const pill = (t, sel) => `<span style="display:inline-flex;align-items:center;gap:6px;height:48px;padding:0 14px;border-radius:999px;${sel ? 'background:var(--block-lavender);box-shadow:inset 0 0 0 1.5px var(--acc-lavender-text);color:var(--acc-lavender-text);font-weight:600;' : 'background:var(--paper-bone);border:1px solid var(--line-control);color:var(--ink-body);'}font-size:14px;white-space:nowrap">${t}</span>`;
  const trow = (t, o = {}) => `<div style="display:flex;align-items:center;gap:12px;min-height:48px;padding:0 20px;${o.sel ? 'background:var(--block-sage);' : ''}"><span style="font-family:var(--font-mono);font-size:15px;color:${o.sel ? 'var(--acc-sage-text)' : o.busy ? 'var(--ink-faint)' : 'var(--ink-body)'};font-weight:${o.sel ? 700 : 400};width:56px">${t}</span>${o.busy ? chip('meeting', o.busy) : ''}<span style="flex:1"></span>${o.sel ? ic('check', 20, 'var(--acc-sage-text)') : ''}</div>`;
  const dur = ['15m', '30m', '45m', '1h', '1h30', '2h'].map(d => chip('duration', d, d === '45m' ? 'selected' : 'default')).join('');
  return sheetHead('Time', { sub: 'Search for a good node.js source · today' }) + lab('Free on your calendar') + `<div style="display:flex;gap:8px;padding:0 20px 4px;flex-wrap:wrap">${pill('14:30–15:15', true)}${pill('15:15–16:00')}${pill('16:30–17:15')}</div>` + lab('Every 15 minutes') + trow('14:00', { busy: 'Call' }) + trow('14:15', { busy: 'Call' }) + trow('14:30', { sel: true }) + trow('14:45') + trow('15:00') + lab('Duration') + `<div style="display:flex;gap:8px;padding:8px 20px;flex-wrap:wrap;align-items:center;min-height:48px">${dur}</div>` + `<div style="margin-top:auto;flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px 28px;border-top:1px dashed var(--line-dashed)">${btn('ghost', 'default', 'No time')}${btn('primary', 'default', 'Done')}</div>`;
}
const pickerOver = `<div style="position:absolute;inset:0;background:var(--scrim);z-index:21"></div>` + sheet(timePicker(), 796).replace('z-index:20;', 'z-index:22;');

// ----- desktop panel (centred, 1440×900) -----
const NAV8 = L.NAV.slice(0, 8);
function desktop(inner, theme = 'day') {
  const t = theme === 'night' ? ' data-theme="night"' : '';
  const side = `<div style="position:absolute;left:0;top:0;bottom:0;width:232px;background:var(--paper-sidebar);border-right:1px solid var(--line-sidebar);padding:28px 12px">${NAV8.map(([n, l], i) => `<div style="display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border-radius:3px;${i === 0 ? 'background:var(--block-sage);' : ''}font-size:15px;color:var(--ink-body)">${ic(n, 20, 'var(--ink-muted)')}${l}</div>`).join('')}</div>`;
  const main = `<div style="position:absolute;left:232px;right:0;top:0;bottom:0;padding:40px 64px"><div style="font-family:var(--font-display);font-size:44px;font-weight:500;letter-spacing:-0.015em">${T_TITLE}</div><div style="margin-top:12px;width:520px">${wl("~5h planned · you'll finish ~17:30")}</div><div style="margin-top:24px;width:760px">${sectionLabel('Top 3', '')}${goal(false, 'Seeded last night · 2h')}${list([R_REVIEW(), R_NODE()])}</div></div>`;
  return `<div style="display:flex;flex-direction:column;gap:12px;flex:none;width:1440px"><div style="display:flex;justify-content:flex-end"><span style="${mono(12, 'var(--ink-faint)', '0.06em')}">${theme} · desktop 1440×900</span></div><div${t} style="position:relative;width:1440px;height:900px;overflow:hidden;border-radius:10px;background:var(--paper-linen);color:var(--ink-body);font-family:var(--font-ui);box-shadow:0 0 0 1px var(--line-solid),var(--shadow-panel)">${theme === 'day' ? '<div style="position:absolute;inset:0;background-image:var(--noise-url);mix-blend-mode:multiply;opacity:0.5;pointer-events:none;z-index:45"></div>' : ''}${side}${main}<div style="position:absolute;inset:0;background:var(--scrim);z-index:15"></div>${inner}</div></div>`;
}
const deskPanel = o => `<div style="position:absolute;left:50%;top:24px;bottom:24px;width:1080px;margin-left:-540px;z-index:20;background:var(--paper-parchment);border-radius:8px;box-shadow:var(--shadow-popover);display:flex;flex-direction:column;overflow:hidden"><div style="display:flex;align-items:center;gap:4px;padding:16px 12px 4px 28px;flex:none"><div style="flex:1;min-width:0"><div style="font-family:var(--font-display);font-size:26px;font-weight:500;line-height:1.15;color:var(--ink-body)">${o.title}</div><div style="margin-top:4px;${mono(12)}">${o.sub}</div></div>${iconBtn('close', 'var(--ink-body)')}</div><div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:4px 12px 12px;overflow:hidden"><div style="min-width:0">${o.left}</div><div style="min-width:0">${o.right}</div></div><div style="flex:none;display:flex;align-items:center;gap:24px;padding:14px 20px 16px 28px;border-top:1px dashed var(--line-dashed)"><div style="flex:1;min-width:0">${o.wl}</div><span style="${mono(12)}">Esc closes · keeps progress</span>${btn('primary', 'default', o.cta)}</div></div>`;

const P = {
  a: (th = 'day') => sheetPhone({ ...PLAN, theme: th, sections: planAll(), foot: P_FOOT() }),
  b: () => sheetPhone({
    ...PLAN, sections: sec('Carry-over · 3', 'Roll all to tomorrow', 4) + carry('Review Kai', [OD('Overdue 64d'), M('30m')], 0) + carry('Reply to Omar about lunch', [M('From yesterday'), M('5m')], -1, { swipe: 214 }) + carry('Untitled task', [M('From yesterday')], -1) + P_INBOX,
    foot: P_FOOT(undefined, '1 of 3 decided'),
  }),
  c: () => sheetPhone({ ...PLAN, shift: 500, sections: planAll(), foot: P_FOOT() }),
  d: () => [sheetPhone({ ...PLAN, shift: END, sections: planAll({ third: true, k: ['accepted', 'accepted'], thirdK: 'changing' }), foot: P_FOOT("~5h 45m planned · you'll finish around 17:45", '3 picked · 2 timed') }),
    sheetPhone({ ...PLAN, shift: END, sections: planAll({ third: true, k: ['accepted', 'accepted'], thirdK: 'changing' }), foot: P_FOOT("~5h 45m planned · you'll finish around 17:45", '3 picked · 2 timed'), over: pickerOver })].join(''),
  e: () => sheetPhone({
    ...PLAN, shift: END, sections: planAll({ third: true, k: ['accepted', 'accepted'], thirdK: 'proposed', p3: BUDGET3 }),
    foot: P_FOOT("~9h planned · you'd finish around 20:00", '3 picked · 2 timed', '2h over'),
  }),
  f: () => sheetPhone({
    ...PLAN, sections: collapsed('Carry-over', 'Nothing carried over ✿') + collapsed('Inbox', 'Inbox zero ✿') + sec('Pick your 3 · 0/3', '') + `<div style="padding:4px 16px 0"><div style="font-family:var(--font-display);font-size:20px;line-height:1.25;color:var(--ink-body)">Clear morning — pick your 3.</div><div style="margin-top:6px;font-size:14px;line-height:20px;color:var(--ink-muted)">Nothing is due and nothing is starred. Type three things; each gets a time below.</div><div style="margin-top:12px">${field('input', 'focus', 358)}</div></div>` + collapsed('Suggested times', 'Pick something first'),
    foot: sheetFoot(wl('Nothing planned yet · the day is open'), '0 picked', 'Start the day'),
  }),
  g: () => sheetPhone({
    title: 'Plan tomorrow', sub: 'Mon 28 Sep · planned the night before', time: '20:15',
    sections: sec('Carry-over · 2', 'Roll all to tomorrow', 4) + carry('Review Kai', [OD('Overdue 64d'), M('30m')], 1, { evening: true, star: true }) + carry('Search for a good node.js source', [PJ("Kai's Flow"), M('45m')], -1, { evening: true }) + collapsed('Inbox', 'Inbox zero ✿')
      + sec('Pick your 3 · 2/3', 'All tasks') + pick('Call the tyre supplier', [GOLD('✶ Goal'), M('Due tomorrow'), M('30m')], true) + pick('Water the balcony plants', [M('Due Tue'), M('10m')], false) + pick('Reply to Omar about lunch', [M('Starred'), M('5m')], false)
      + sec('Suggested times · Mon', '') + timeline([[9.5, 10, 'event'], [16, 17, 'event'], [10, 10.5, 'proposed'], [10.5, 11, 'proposed']]) + timeRow('Call the tyre supplier', [M('30m')], '10:00–10:30', 'proposed') + timeRow('Review Kai', [M('30m')], '10:30–11:00', 'proposed'),
    foot: sheetFoot(wl("~1h planned for Monday · finish around 11:00"), '2 picked · 0 timed', 'Set tomorrow'),
  }),
  h: () => desktop(deskPanel({
    title: 'Plan my day', sub: 'Sun 27 Sep · about 3 minutes', cta: 'Start the day', wl: wl("~5h planned · you'll finish around 17:30"),
    left: P_CARRY([0, -1]).replace('padding:4px 16px 0', 'padding:0 16px 0') + P_INBOX, right: P_PICKS(true).replace('padding:8px 16px 0', 'padding:0 16px 0') + P_TIMES(['accepted', 'proposed'], 'proposed'),
  })),
  j: () => sheetPhone({
    ...PLAN, shift: END, sections: P_CARRY() + P_INBOX + P_PICKS(true)
      + sec('Suggested times', '') + `<div style="padding:0 16px 4px;display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--sig-amber)">${ic('alert', 20)}<span>Your calendar is full from 09:00 to 18:00.</span></div>` + timeline([[9, 12, 'event'], [12, 13.5, 'event'], [13.5, 16, 'event'], [16, 18, 'event']])
      + timeRow('Finish the flow audit', [M('2h'), AMBER('No free slot')], '', 'noslot') + timeRow('Call the tyre supplier', [M('30m'), AMBER('No free slot')], '', 'noslot') + timeRow('Search for a good node.js source', [M('45m'), AMBER('No free slot')], '', 'noslot'),
    foot: P_FOOT('~9h of meetings · the 3 picks don’t fit', '3 picked · 0 timed', '3h 15m over'),
  }),
  k: () => sheetPhone({ ...PLAN, tall: 1540, h: 1492, sections: planAll(), foot: P_FOOT() }),
  l: () => sheetPhone({ ...PLAN, shift: 500, sections: planAll({ third: true }).replace(pick('Water the balcony plants', [M('Due today'), M('10m')], false), taskRow({ title: 'Water the balcony plants', meta: [M('Due today'), M('10m')], top3: false, state: 'pressed' })), foot: P_FOOT(undefined, '3 picked · 0 timed'), over: toast('Top 3 is full — swap one out?', { action: 'Swap', life: 60, bottom: 128 }) }),
  m: () => today({ time: '08:05', sum: SUM.morning, card: CARD_MORNING({ cap: 'Morning · 2 of 4 done', meta: ['~1 min left', 'Pick your 3 next'], action: 'Resume', pct: 50 }), main: MAIN.morning }),
};

page('Plan.dc.html',
  header("Kai's Flow · Plan my day · 28 Sep 2026", 'Plan the day on one page', 'Brief 06: the four-step wizard becomes one scrolling sheet — Carry-over, Inbox, Pick your 3, Suggested times — with a sticky footer that always shows the workload and the one terra action. About 3 minutes and 3–6 taps. Times are always suggested (tap ✓ to accept, tap the time to change it); dragging on the timeline is optional, never required. ✕, Back or a swipe down closes it and keeps every choice; reopening resumes. Nothing is deleted without Undo. Sample: Deep work 09:00–10:30, Lunch with Omar 13:00, Gym 18:00; day length 09:00–18:00.'),
  [turn(1, 'Plan my day — phone', [
    opt('6a', 'At open · day', P.a()),
    opt('6b', 'Carry-over · 3 items · one mid-swipe', P.b()),
    opt('6c', 'Pick your 3 · seeds pre-selected', P.c()),
    opt('6d', 'Suggested times · 2 accepted · 1 being changed → time picker', P.d()),
    opt('6e', 'Over-full workload · amber', P.e()),
    opt('6f', 'Everything empty · clear morning', P.f()),
    opt('6g', 'After 17:00 · plans tomorrow', P.g()),
    opt('6j', 'Calendar busy all day · no free slot', P.j()),
    opt('6l', '4th pick · Top 3 is full', P.l()),
    opt('6m', 'Closed half-way · Today card resumes', P.m()),
  ], 'Carry-over and Inbox choices apply at once and stay visible on the row (tap another to change your mind); only Drop removes the row, straight to Trash with Undo. Swipe right = Tomorrow (Mon 09:00), swipe left = Drop, long-press = select, ⋯ = the same by tap. “Start the day” writes the picks and accepted times and closes the sheet; Today then shows the NOW slip when the first block begins. Android Back closes the top layer first: time picker → Plan → Today.'),
  turn(2, 'Whole scroll · desktop · night', [
    opt('6k', 'Whole scroll · phone', P.k()),
    opt('6i', 'Night · at open', P.a('night')),
    opt('6h', 'Desktop · centred panel', P.h()),
  ], 'Desktop uses the same pieces in a centred panel over a dimmed Today, in two columns so the whole plan fits without scrolling; Esc = ✕ and keeps progress.')]);

// =====================================================================================
// 08 · SHUT DOWN (night first)
// =====================================================================================
function sweepRow(title, meta, st) {
  const rolled = st === 'rolled', done = st === 'done';
  const r = taskRow({ title, meta: rolled ? [...meta, SAGE('→ Mon 09:00')] : meta, done, star: false });
  return r.replace(DOTS, done ? '' : `<span style="flex:none;align-self:center;padding-right:8px">${btn('secondary', rolled ? 'selected' : 'default', 'Tomorrow', rolled ? undefined : 'tomorrow')}</span>`);
}
const S_SWEEP = (rows, n = '3 left') => sec(`Sweep · ${n}`, 'Roll all to tomorrow', 4) + rows.join('');
const S_ROWS3 = [sweepRow('Review Kai', [OD('Overdue 64d'), M('Top 3')], 'open'), sweepRow('Search for a node.js source', [PJ("Kai's Flow"), M('Top 3')], 'open'), sweepRow('Buy milk', [PJ('Personal', 'var(--acc-blossom)'), M('10m')], 'open')];
const past = (d, t) => `<div style="display:flex;align-items:baseline;gap:12px"><span style="${mono(12)};width:52px;flex:none">${d}</span>${hand(t, 18, 'var(--ink-faint)')}</div>`;
const S_LINE = (o = {}) => sec('One line', '') + `<div style="padding:0 16px 8px"><div style="display:flex;flex-direction:column;gap:0;margin:0 0 10px">${past('Sat 26', 'Slow start, good finish.')}${past('Fri 25', 'The audit took longer than I planned.')}</div>${o.saved
  ? `<div style="display:flex;align-items:center;gap:8px;min-height:48px"><span style="${mono(12)};width:52px;flex:none">Sun 27</span><div style="flex:1;min-width:0">${hand('Tired, but the audit finally has a shape.', 20, 'var(--ink-hand)')}</div>${btn('ghost', 'default', 'Edit')}</div>${metas([SAGE('Saved to journal ✓')])}`
  : `<div style="display:flex;align-items:center;gap:8px">${field('input', o.typing ? 'focus' : 'default', 274).replace('Add a task…', 'How did today go?')}${btn('secondary', 'default', 'Save')}</div>`}</div>`;
// Tomorrow's 3 rows are seeds, not tasks: star (= pick) + title + why it is suggested. No checkbox, no ⋯.
const seedRow = (title, meta, on, pressed) => `<div style="display:flex;align-items:flex-start;min-height:56px;padding:4px 16px 4px 4px;box-sizing:border-box;border-bottom:1px dashed var(--line-dashed);${pressed ? 'background:var(--pressed-overlay);' : ''}">${L.star('default', on)}<div style="flex:1;min-width:0;padding:14px 0 12px"><div style="font-size:15px;line-height:20px;color:var(--ink-body);text-wrap:pretty">${title}</div>${metas(meta)}</div></div>`;
const S_T3 = (o = {}) => sec(`Tomorrow's 3 · ${o.empty ? 1 : 3}/3`, 'All tasks') + (o.empty ? [
  seedRow('Call the tyre supplier', [GOLD('✶ Goal'), M('Due tomorrow'), M('30m')], true),
  seedRow('Reply to Omar about lunch', [M('Starred'), M('5m')], false),
  seedRow('Water the balcony plants', [M('Due Tue'), M('10m')], false),
] : [
  seedRow('Call the tyre supplier', [GOLD('✶ Goal'), M('Due tomorrow'), M('30m')], true),
  seedRow('Review Kai', [M('Left today'), M('30m')], true),
  seedRow('Search for a node.js source', [M('Left today'), M('45m')], true),
  seedRow('Buy milk', [M('Left today'), M('10m')], false, o.pressed),
  o.more ? seedRow('Reply to Omar about lunch', [M('Starred'), M('5m')], false) : '',
]).join('') + `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px 4px"><img src="ds/assets/clover/seedling.png" alt="" style="width:36px;height:auto;flex:none;filter:var(--shadow-drop-sm)">${hand('Planted for Monday — the morning plan opens with these ✿', 18)}</div>`;
const SHUT = { title: 'Shut down', sub: 'Sun 27 Sep · 4 done · 2h 10m focused', time: '21:40' };
const S_FOOT = (status = '3 seeds for Mon') => sheetFoot('', status, 'Close the day').replace('display:flex;flex-direction:column;gap:6px">', 'display:flex;flex-direction:column;gap:0">');
const shutAll = (o = {}) => S_SWEEP(o.rows || S_ROWS3, o.n) + S_LINE(o) + S_T3(o);
const closedMoment = th => ph(topBar(T_TITLE) + L.scrim() + sheet(`<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 32px 24px;text-align:center"><img src="ds/assets/clover/resting.png" alt="" style="width:120px;height:auto;filter:var(--shadow-drop-sm)"><div style="font-family:var(--font-display);font-size:26px;font-weight:500;line-height:1.15;color:var(--ink-body)">The garden's closed.</div>${hand('See you in the morning ✿', 20)}<div style="display:flex;flex-wrap:wrap;justify-content:center;column-gap:16px;row-gap:4px;margin-top:6px">${[M('4 done'), M('2h 10m focused'), M('3 seeded')].join('')}</div></div><div style="flex:none;display:flex;justify-content:center;padding:12px 16px 28px">${btn('primary', 'default', 'Goodnight')}</div>`, 796), th, '21:44');

const S = {
  a: (th = 'night') => sheetPhone({ ...SHUT, theme: th, sections: shutAll(), foot: S_FOOT() }),
  b: () => sheetPhone({ ...SHUT, theme: 'night', sections: shutAll({ n: '2 of 4 left', rows: [sweepRow('Review Kai', [OD('Overdue 64d'), M('Top 3')], 'rolled'), sweepRow('Search for a node.js source', [PJ("Kai's Flow"), M('Top 3')], 'open'), sweepRow('Buy milk', [PJ('Personal', 'var(--acc-blossom)'), M('10m')], 'open'), sweepRow('Reply to Omar about lunch', [M('5m')], 'done')] }), foot: S_FOOT() }),
  c: () => sheetPhone({ ...SHUT, sub: 'Sun 27 Sep · 7 done · 3h 05m focused', theme: 'night', sections: collapsed('Sweep', 'Everything tended ✿') + S_LINE({ saved: true }) + S_T3({ empty: true }), foot: S_FOOT('1 seed for Mon') }),
  d: () => sheetPhone({ ...SHUT, theme: 'night', shift: 360, sections: shutAll({ saved: true, pressed: true, more: true }), foot: S_FOOT(), over: toast("Tomorrow's 3 is full — swap one out?", { action: 'Swap', life: 60, bottom: 104 }) }),
  e: () => closedMoment('night') + today({ theme: 'night', time: '21:45', sum: SUM.closed, card: CARD_CLOSED, main: MAIN.closed }),
  f: () => desktop(deskPanel({
    title: 'Shut down', sub: 'Sun 27 Sep · 4 done · 2h 10m focused', cta: 'Close the day', wl: `<span style="${mono(12)}">3 seeds for Mon</span>`,
    left: S_SWEEP(S_ROWS3).replace('padding:4px 16px 0', 'padding:0 16px 0') + S_LINE(), right: S_T3().replace('padding:8px 16px 0', 'padding:0 16px 0'),
  }), 'night'),
  h: () => sheetPhone({ ...SHUT, theme: 'night', tall: 1200, h: 1152, sections: shutAll(), foot: S_FOOT() }),
};

page('Shutdown.dc.html',
  header("Kai's Flow · Shut down · 28 Sep 2026", 'Close the day in one pass', 'Brief 08, night first: one sheet — Sweep (Done · Tomorrow, or roll them all), One line (optional, saves to the journal), Tomorrow’s 3 (pre-suggested; these pre-fill the morning plan) — then Close the day and a small summary on the way out. About 2 minutes and 3–4 taps. Nothing here deletes anything. ✕, Back or a swipe down keeps progress.'),
  [turn(1, 'Shut down — phone (night first)', [
    opt('8a', 'Full screen · night', S.a('night')),
    opt('8b', 'Sweep · 4 left · one rolled · one done', S.b()),
    opt('8c', 'Everything already done · sweep collapsed', S.c()),
    opt('8d', "Tomorrow's 3 · suggestions · 4th tap", S.d()),
    opt('8e', 'After Close · the summary moment → Today', S.e()),
    opt('8g', 'Day version of 8a', S.a('day')),
  ], 'Sweep rows: checkbox = Done, the Tomorrow button (or swipe right) = Mon 09:00; the choice stays on the row and a second tap undoes it. There is no ⋯ and no swipe-left here — nothing on this screen deletes. Close the day writes the line, plants Tomorrow’s 3 as seeds, shows the summary (tap Goodnight or wait ~3s) and Today’s card becomes “Day closed ✿”.'),
  turn(2, 'Whole scroll · desktop', [
    opt('8h', 'Whole scroll · night', S.h()),
    opt('8f', 'Desktop · centred panel · night', S.f()),
  ], 'Desktop: the same sections in two columns in a centred panel over a dimmed Today; Esc = ✕ and keeps progress.')]);
