// Generates design-export/Phone Widgets.dc.html — a static, inline-styled Design Component.
import fs from 'node:fs'
const OUT = process.argv[2]

// ── grid: Android 4-column launcher, cell 76dp, gap 16 → 1=76 · 2=168 · 3=260 · 4=352 ──
const U = (n) => 76 * n + 16 * (n - 1)
const I = (name, s = 18, extra = '') => `<img src="ds/icons/kf-${name}.svg" alt="" style="width:${s}px;height:${s}px;flex:none;display:block;filter:var(--ikf,none);${extra}">`
const A = (p, h, extra = '') => `<img src="ds/assets/${p}.png" alt="" style="height:${h}px;width:auto;display:block;filter:var(--shadow-drop-sm);${extra}">`
const GRAIN = `<div style="position:absolute;inset:0;background-image:var(--noise-url);mix-blend-mode:multiply;opacity:var(--grain-op,0.45);pointer-events:none"></div>`
const cap = (t, color = 'var(--ink-faint)', extra = '') => `<span style="white-space:nowrap;font-family:var(--font-mono);font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${color};${extra}">${t}</span>`
const meta = (t, color = 'var(--ink-faint)') => `<span style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.04em;color:${color};white-space:nowrap">${t}</span>`
const box = (done = false, gold = false) => `<span style="width:44px;height:44px;margin:-11px;flex:none;display:flex;align-items:center;justify-content:center"><span style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1.5px solid ${gold ? 'var(--acc-gold)' : 'var(--check-border)'};background:${done ? 'var(--check-fill)' : 'var(--check-bg)'}">${done ? I('check', 14, 'filter:brightness(0) invert(1)') : ''}</span></span>`
const btn = (label, icon, cta = false) => `<span style="height:36px;padding:0 14px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;white-space:nowrap;${cta ? 'background:var(--acc-terra);color:var(--on-terra);box-shadow:var(--shadow-cta)' : 'background:var(--paper-bone);color:var(--ink-body);box-shadow:inset 0 0 0 1px var(--line-control)'}">${icon ? I(icon, 15, cta ? 'filter:brightness(0) invert(1)' : '') : ''}${label}</span>`
const round = (icon, size = 44, cta = false) => `<span style="width:${size}px;height:${size}px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;${cta ? 'background:var(--acc-terra);box-shadow:var(--shadow-cta)' : 'background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control)'}">${I(icon, size * 0.42, cta ? 'filter:brightness(0) invert(1)' : '')}</span>`
const serif = (t, size = 17, extra = '') => `<span style="font-family:var(--font-display);font-size:${size}px;font-weight:500;letter-spacing:-0.01em;line-height:1.2;color:var(--ink-body);${extra}">${t}</span>`
const hand = (t, size = 19, extra = '') => `<span style="font-family:var(--font-hand);font-size:${size}px;line-height:1.1;color:var(--ink-hand);${extra}">${t}</span>`
const dash = `<div style="height:0;border-top:1px dashed var(--line-dashed);margin:0 2px"></div>`
const tape = (left = '50%', tint = 'color-mix(in oklch, var(--acc-gold) 38%, transparent)') => `<span style="position:absolute;top:-6px;left:${left};width:58px;height:15px;transform:translateX(-50%) rotate(-2deg);background:${tint};background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px);box-shadow:var(--shadow-crisp);border-radius:1px"></span>`

function card(w, h, inner, o = {}) {
  const bg = o.bg ?? 'var(--paper-parchment)'
  const line = o.line ?? 'var(--line-card)'
  return `<div style="position:relative;width:${U(w)}px;height:${U(h)}px;flex:none;border-radius:22px;background:${bg};box-shadow:0 0 0 1px ${line},var(--shadow-crisp);overflow:hidden;color:var(--ink-body);font-family:var(--font-ui)">${GRAIN}<div style="position:relative;height:100%;box-sizing:border-box;${o.pad === false ? '' : `padding:${o.pad ?? '14px 16px'};`}display:flex;flex-direction:column;${o.style ?? ''}">${inner}</div></div>`
}
const row = (inner, extra = '') => `<div style="display:flex;align-items:center;gap:12px;min-width:0;${extra}">${inner}</div>`
const grow = (inner, extra = '') => `<div style="flex:1;min-width:0;${extra}">${inner}</div>`
const clip = (t, size = 15, extra = '') => `<span style="display:block;font-size:${size}px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${extra}">${t}</span>`

// ── sample day (Kai's own, Tue 7 Oct) ──
const GOAL = 'Crypto — heavy session'
const TOP = [['Skim OS lectures 1 + 2', '16:15–16:55'], ['Read 2 pages', '17:00–17:10']]

// ── the widgets ──────────────────────────────────────────────────────────────
const W = {}

W.goal1 = () => card(4, 1, row(box(false, true) + grow(cap('✶ Goal of the day', 'var(--acc-gold)') + clip(GOAL, 16, 'font-family:var(--font-display);font-weight:600;margin-top:3px')) + meta('14:45', 'var(--acc-gold)')), { bg: 'var(--paper-goal)', line: 'var(--line-goal)', pad: '0 18px', style: 'justify-content:center' })

W.goal2 = () => card(2, 2, `${tape('50%')}<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:4px">${cap('✶ Goal', 'var(--acc-gold)')}${A('clover/four_leaf', 34, 'margin:-6px -4px 0 0')}</div>${serif(GOAL, 19, 'font-weight:600;margin-top:8px;text-wrap:pretty')}<div style="flex:1"></div>${row(box(false, true) + meta('14:45–16:15', 'var(--acc-gold)'), 'gap:14px;padding-left:11px')}`, { bg: 'var(--paper-goal)', line: 'var(--line-goal)', pad: '16px 16px 14px' })

const rowC = (done, title, time, gold = false, tstyle = '') => row(box(done, gold) + grow(clip(title, 14, (done ? 'color:var(--ink-faint);text-decoration:line-through;' : '') + tstyle)) + (time ? meta(time, gold ? 'var(--acc-gold)' : 'var(--ink-faint)') : ''), 'padding:7px 0 7px 11px')
const topRows = (n = 2) => TOP.slice(0, n).map(([t, m]) => row(box() + grow(clip(t, 15) + meta(m)) + I('star', 16, 'opacity:.9'), 'padding:6px 0 6px 11px')).join(dash)
W.top2 = () => card(2, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Top 3')}${cap('1 / 3', 'var(--acc-sage-text)')}</div><div style="margin-top:6px;display:flex;flex-direction:column">${rowC(false, GOAL, '', true, 'font-family:var(--font-display);font-weight:600')}${dash}${rowC(false, 'Skim OS lectures', '')}${dash}${rowC(true, 'Read 2 pages', '')}</div>`)

W.top42 = () => card(4, 2, `<div style="display:flex;justify-content:space-between;align-items:baseline">${serif('Tuesday, Oct 7', 18)}${cap('Day 83 · Top 3 · 0/3')}</div><div style="display:grid;grid-template-columns:1.15fr 1fr;gap:12px;margin-top:10px;flex:1;min-height:0"><div style="position:relative;background:var(--paper-goal);border-radius:12px;box-shadow:0 0 0 1px var(--line-goal);padding:12px 12px 10px;display:flex;flex-direction:column;transform:rotate(-0.4deg)">${tape('40%')}${cap('✶ Goal', 'var(--acc-gold)')}${serif(GOAL, 16, 'font-weight:600;margin-top:5px')}<div style="flex:1"></div>${row(box(false, true) + meta('14:45–16:15', 'var(--acc-gold)'), 'padding-left:11px;gap:14px')}</div><div style="display:flex;flex-direction:column;justify-content:center">${TOP.map(([t, m]) => row(box() + grow(clip(t, 14) + meta(m.split('–')[0])), 'padding:5px 0 5px 11px')).join(dash)}</div></div>`)

W.top44 = () => card(4, 4, `<div style="display:flex;justify-content:space-between;align-items:baseline">${serif('Tuesday, Oct 7', 20)}${round('plus', 40, true)}</div>${meta('~2h planned · finish ~17:10')}<div style="position:relative;margin-top:12px;background:var(--paper-goal);border-radius:12px;box-shadow:0 0 0 1px var(--line-goal);padding:12px 14px 10px;transform:rotate(-0.4deg)">${tape('50%')}${row(box(false, true) + grow(cap('✶ Goal of the day', 'var(--acc-gold)') + serif(GOAL, 17, 'display:block;font-weight:600;margin-top:3px') + meta('14:45–16:15 · in 20m', 'var(--acc-gold)')), 'padding-left:11px;gap:14px;align-items:flex-start')}</div><div style="margin-top:6px">${TOP.map(([t, m]) => rowC(false, t, m.split('–')[0])).join(dash)}</div>${dash}${row(cap('Up next') + grow(clip('Gym', 14)) + meta('18:00'), 'margin-top:8px;gap:10px')}<div style="flex:1"></div>${row(`<span style="flex:1;height:40px;border-radius:999px;background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control);display:flex;align-items:center;gap:8px;padding:0 14px;font-size:14px;color:var(--ink-faint)">${I('plus', 15)}Capture — tap to type</span>` + round('mic', 40))}`, { pad: '16px 16px 14px' })

W.capture11 = () => card(1, 1, `<div style="flex:1;display:flex;align-items:center;justify-content:center">${round('plus', 52, true)}</div>`, { pad: '12px' })
W.capture41 = () => card(4, 1, row(`<span style="flex:1;height:44px;border-radius:999px;background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control);display:flex;align-items:center;gap:10px;padding:0 16px;font-size:15px;color:var(--ink-faint);font-family:var(--font-display);font-style:italic">${I('plus', 16)}What’s on your mind?</span>` + round('mic', 44) + `<span style="width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control)">${A('tools/pen', 24, 'filter:none')}</span>`, 'gap:8px'), { pad: '0 12px', style: 'justify-content:center' })
W.capture21 = () => card(2, 1, row(round('plus', 44, true) + grow(serif('Capture', 16) + meta('tap · hold to talk'))), { pad: '0 14px', style: 'justify-content:center' })

W.now42 = () => card(4, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Now', 'var(--acc-terra-ink)')}${meta('14:52')}</div>${row(`<span style="width:4px;align-self:stretch;border-radius:2px;background:var(--acc-gold)"></span>` + grow(serif(GOAL, 19, 'display:block;font-weight:600') + meta('14:45–16:15 · 1h 23m left')), 'margin-top:8px;gap:12px;align-items:stretch')}<div style="margin-top:10px;height:5px;border-radius:3px;background:var(--line-card);overflow:hidden"><span style="display:block;width:8%;height:100%;background:var(--acc-gold)"></span></div><div style="flex:1"></div>${row(btn('Start focus', 'focus', true) + btn('Done', 'check'), 'gap:8px')}`, { pad: '14px 16px' })

W.next21 = () => card(2, 1, row(`<span style="width:4px;height:40px;border-radius:2px;background:var(--acc-sage)"></span>` + grow(cap('Next · 16:15') + clip('Skim OS lectures', 14, 'margin-top:3px'))), { pad: '0 14px', style: 'justify-content:center' })

const blocks = [
  ['10:00', '11:00', 'OS lecture', 'var(--block-lavender)', 'var(--acc-lavender-deep)', true],
  ['14:45', '16:15', GOAL, 'var(--paper-goal)', 'var(--acc-gold)', false],
  ['16:15', '16:55', 'Skim OS lectures 1 + 2', 'var(--block-sage)', 'var(--acc-sage-text)', false],
  ['17:00', '17:10', 'Read 2 pages', 'var(--block-blossom)', 'var(--acc-blossom-text)', false],
  ['18:00', '19:00', 'Gym', 'var(--block-hydrangea)', 'var(--acc-hydrangea-deep)', false],
]
const agendaRows = (n, from = 0) => blocks.slice(from, n).map(([s, e, t, bg, rule, past]) => `<div style="display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:stretch;${past ? 'opacity:.55' : ''}">${meta(s)}<div style="background:${bg};border-radius:8px;padding:7px 10px;border-left:3px solid ${rule};min-width:0">${clip(t, 14, past ? 'text-decoration:line-through' : '')}${meta(`${s}–${e}`)}</div></div>`).join('')
W.agenda43 = () => card(4, 3, `<div style="display:flex;justify-content:space-between;align-items:baseline">${serif('Today', 19)}${cap('4 left · 2 free hours')}</div><div style="position:relative;margin-top:10px;display:flex;flex-direction:column;gap:7px">${agendaRows(4, 1)}<div style="position:absolute;left:44px;right:0;top:14px;height:0;border-top:1.5px solid var(--acc-terra)"><span style="position:absolute;left:-6px;top:-4px;width:7px;height:7px;border-radius:50%;background:var(--acc-terra)"></span></div></div>`)
W.agenda44 = () => card(4, 4, `<div style="display:flex;justify-content:space-between;align-items:baseline">${serif('Tuesday, Oct 7', 19)}${round('plus', 36, true)}</div><div style="display:flex;justify-content:space-between;margin:10px 0 12px">${[['M', 6], ['T', 7], ['W', 8], ['T', 9], ['F', 10], ['S', 11], ['S', 12]].map(([d, n], i) => `<div style="width:40px;display:flex;flex-direction:column;align-items:center;gap:4px">${cap(d, i === 1 ? 'var(--acc-terra-ink)' : 'var(--ink-faint)', 'letter-spacing:0')}<span style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;${i === 1 ? 'background:var(--ink-body);color:var(--paper-parchment)' : ''}">${n}</span><span style="width:4px;height:4px;border-radius:50%;background:${[1, 2, 3, 5].includes(i) ? 'var(--ink-muted)' : 'transparent'}"></span></div>`).join('')}</div><div style="display:flex;flex-direction:column;gap:7px">${agendaRows(5)}</div>`)

W.week41 = () => card(4, 1, `<div style="display:flex;justify-content:space-between;align-items:center;height:100%">${[['M', 6, 2], ['T', 7, 5], ['W', 8, 3], ['T', 9, 1], ['F', 10, 0], ['S', 11, 2], ['S', 12, 0]].map(([d, n, c], i) => `<div style="width:42px;height:56px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${i === 1 ? 'background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control)' : ''}">${cap(d, i === 1 ? 'var(--acc-terra-ink)' : 'var(--ink-faint)', 'letter-spacing:0;font-size:10px')}<span style="font-size:15px;font-weight:${i === 1 ? 600 : 400}">${n}</span><span style="display:flex;gap:2px;height:4px">${Array.from({ length: Math.min(c, 3) }, () => '<span style="width:4px;height:4px;border-radius:50%;background:var(--ink-muted)"></span>').join('')}</span></div>`).join('')}</div>`, { pad: '0 12px' })

const ring = (pct, size, inner, color = 'var(--acc-sage-text)') => `<span style="position:relative;width:${size}px;height:${size}px;border-radius:50%;flex:none;background:conic-gradient(${color} 0 ${pct}%, var(--line-card) ${pct}% 100%);display:flex;align-items:center;justify-content:center"><span style="position:absolute;inset:6px;border-radius:50%;background:var(--paper-parchment)"></span><span style="position:relative;display:flex;flex-direction:column;align-items:center">${inner}</span></span>`
W.focus22 = () => card(2, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Focus', 'var(--acc-sage-text)')}${I('focus', 16)}</div><div style="flex:1;display:flex;align-items:center;justify-content:center">${ring(38, 74, `<span style="font-family:var(--font-display);font-size:20px;font-weight:600;font-variant-numeric:tabular-nums">18:42</span>${cap('left', 'var(--ink-faint)', 'font-size:10px')}`)}</div>${clip(GOAL, 12, 'text-align:center;color:var(--ink-muted)')}<div style="display:flex;justify-content:center;gap:10px;margin-top:6px">${round('stop', 36)}${round('check', 36, true)}</div>`, { pad: '14px 14px 12px' })
W.focus21 = () => card(2, 1, row(ring(38, 48, `<span style="font-size:11px;font-weight:600;font-variant-numeric:tabular-nums">18m</span>`) + grow(cap('Focusing', 'var(--acc-sage-text)') + clip('Crypto session', 14, 'margin-top:2px'))), { pad: '0 12px', style: 'justify-content:center' })
W.focusIdle22 = () => card(2, 2, `${cap('Focus')}<div style="flex:1;display:flex;align-items:center;justify-content:center">${A('fern/coil', 56)}</div>${clip('25 min on your goal', 13, 'text-align:center;color:var(--ink-muted)')}<div style="display:flex;justify-content:center;margin-top:8px">${btn('Start', 'focus', true)}</div>`, { pad: '14px 14px 12px' })

const dots = (pattern) => `<span style="display:flex;gap:3px">${pattern.map((p) => `<span style="width:9px;height:9px;border-radius:2px;background:${p === 2 ? 'var(--acc-sage)' : p === 1 ? 'color-mix(in oklch, var(--acc-blossom) 70%, transparent)' : 'var(--line-card)'}"></span>`).join('')}</span>`
W.routines22 = () => card(2, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Routines')}${cap('1 / 3', 'var(--acc-sage-text)')}</div><div style="margin-top:8px;display:flex;flex-direction:column">${[['Morning med', true, 'am'], ['Gym', false, '18:00'], ['Read', false, 'pm']].map(([t, d]) => rowC(d, t, '')).join(dash)}</div>`)
W.routines42 = () => card(4, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Routines · 1 / 3')}${row(`<img src="ds/icons/kf-routines.svg" alt="" style="width:14px;height:14px">` + meta('best streak 12', 'var(--sig-streak)'), 'gap:5px')}</div><div style="margin-top:6px">${[['Morning med', true, [2, 2, 1, 2, 2, 2, 2]], ['Gym', false, [2, 0, 2, 2, 0, 2, 0]], ['Read 2 pages', false, [2, 2, 2, 1, 0, 2, 0]]].map(([t, d, p]) => row(box(d) + grow(clip(t, 14, d ? 'color:var(--ink-faint);text-decoration:line-through' : '')) + dots(p), 'padding:6px 0 6px 11px')).join(dash)}</div>`)
W.streak22 = () => card(2, 2, `${cap('Gym · streak', 'var(--sig-streak)')}<div style="flex:1;display:flex;align-items:flex-end;justify-content:center">${A('vine/flowering', 92)}</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:6px">${serif('12 days', 18, 'font-weight:600')}${meta('goal 30')}</div>`, { pad: '14px 14px 12px' })
W.streak11 = () => card(1, 1, `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center">${A('vine/sprouting', 34)}<span style="font-family:var(--font-display);font-size:16px;font-weight:600;margin-top:2px">12</span></div>`, { pad: '8px' })

W.inbox22 = () => card(2, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Inbox')}${I('inbox', 16)}</div><div style="flex:1;display:flex;align-items:center;gap:6px">${A('hydrangea/medium', 70)}<div>${serif('3', 36, 'font-weight:600;display:block;line-height:1')}${meta('to sort')}</div></div>${btn('Sort them', 'review')}`, { pad: '14px 14px 12px' })
W.inbox11 = () => card(1, 1, `<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative">${A('hydrangea/light', 46)}<span style="position:absolute;top:2px;right:2px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--badge-bg);color:var(--badge-ink);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center">3</span></div>`, { pad: '8px' })
W.inboxZero22 = () => card(2, 2, `${cap('Inbox')}<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">${A('hydrangea/zero', 64)}${hand('all sorted ✿', 20)}</div>`, { pad: '14px 14px 12px' })

W.overdue22 = () => card(2, 2, `${cap('Overdue', 'var(--sig-overdue)')}<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px">${serif('4', 34, 'font-weight:600;color:var(--acc-terra-ink)')}${meta('oldest 9 days')}</div><div style="margin-top:4px">${clip('Call the tyre supplier', 13, 'color:var(--ink-muted)')}${clip('Renew the car licence', 13, 'color:var(--ink-muted)')}</div><div style="flex:1"></div>${btn('Replan all', 'pickdate', true)}`, { pad: '14px 14px 12px' })

W.plan42 = () => card(4, 2, row(`<span style="flex:none">${A('daisy/morning', 74)}</span>` + grow(cap('Morning · not planned', 'var(--acc-buttercream-text)') + serif('Plan my day', 21, 'display:block;font-weight:600;margin-top:4px') + meta('~5 min · 3 in Inbox · 4 overdue')) + btn('Plan', '', true), 'height:100%;gap:14px'), { pad: '0 16px', style: 'justify-content:center' })
W.shutdown42 = () => card(4, 2, row(`<span style="flex:none">${A('daisy/evening', 74)}</span>` + grow(cap('Evening · 4 of 5 done', 'var(--acc-lavender-text)') + serif('Shut down the day', 21, 'display:block;font-weight:600;margin-top:4px') + meta('~3 min · 1 to carry over')) + btn('Close', '', true), 'height:100%;gap:14px'), { pad: '0 16px', style: 'justify-content:center' })

W.journal42 = () => card(4, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('One line about today')}${I('journal', 16)}</div><div style="flex:1;display:flex;align-items:center;border-bottom:1px solid var(--line-dashed);margin:4px 0 10px">${hand('the OS lecture finally clicked…', 24, 'color:var(--ink-faint)')}</div>${row(`<span style="flex:1"></span>` + round('mic', 40) + btn('Write', 'send', true), 'gap:8px')}`, { pad: '14px 16px 12px' })

W.specimen22 = () => card(2, 2, `${cap('Pressed · Oct 3')}<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--paper-bone);border-radius:10px;margin:8px 0;box-shadow:inset 0 0 0 1px var(--line-card)">${A('wisteria/p80', 82)}</div>${clip('A week of mornings', 13, 'font-family:var(--font-display);font-style:italic;text-align:center;color:var(--ink-muted)')}`, { pad: '14px 14px 12px' })
W.memory42 = () => card(4, 2, `${cap('From a while ago · 3 Sep')}${serif('“Start the crypto notes with the questions, not the answers.”', 17, 'margin-top:8px;font-style:italic;text-wrap:pretty')}<div style="flex:1"></div>${row(meta('Journal · a month ago') + `<span style="flex:1"></span>` + cap('Open ›', 'var(--acc-lavender-text)'))}`, { pad: '14px 16px 12px' })
W.slipping22 = () => card(2, 2, `${cap('Slipping', 'var(--acc-gold)')}<div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">${[['Tyre supplier', '9d'], ['Guitar practice', '6d'], ['Email Dr. Hany', '5d']].map(([t, d]) => row(grow(clip(t, 14)) + meta(d, 'var(--acc-gold)'))).join('')}</div><div style="flex:1"></div>${meta('quiet 5+ days')}`, { pad: '14px 14px 12px', line: 'var(--line-goal)' })
W.season21 = () => card(2, 1, row(A('daisy/midday', 40) + grow(cap('Autumn') + serif('31° clear', 17, 'display:block;margin-top:2px'))), { pad: '0 14px', style: 'justify-content:center' })
W.progress41 = () => card(4, 1, row(grow(`<div style="display:flex;justify-content:space-between;align-items:baseline">${serif('3 of 7 done', 16, 'font-weight:600')}${meta('finish ~17:10')}</div><div style="margin-top:7px;height:6px;border-radius:3px;background:var(--line-card);overflow:hidden"><span style="display:block;width:43%;height:100%;background:var(--acc-moss)"></span></div>`) + A('wisteria/p40', 40)), { pad: '0 16px', style: 'justify-content:center' })
W.paper11 = () => card(1, 1, `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">${A('envelope/front', 34)}${cap('Paper', 'var(--ink-muted)', 'font-size:9px')}</div>`, { pad: '8px' })
W.countdown21 = () => card(2, 1, row(grow(cap('Midterm') + serif('in 9 days', 17, 'display:block;margin-top:2px;font-weight:600')) + meta('Thu 16')), { pad: '0 14px', style: 'justify-content:center' })
W.ask41 = () => card(4, 1, row(`<span style="flex:1;height:44px;border-radius:999px;background:var(--paper-bone);box-shadow:inset 0 0 0 1px var(--line-control);display:flex;align-items:center;padding:0 16px;font-size:14px;color:var(--ink-faint)">Ask about your day…</span>` + `<span style="flex:none;height:44px;padding:0 14px;border-radius:999px;display:flex;align-items:center;font-size:13px;color:var(--acc-lavender-text);box-shadow:inset 0 0 0 1px var(--line-control)">What should I drop?</span>`, 'gap:8px'), { pad: '0 12px', style: 'justify-content:center' })

// states
W.allDone22 = () => card(2, 2, `${cap('Top 3', 'var(--acc-sage-text)')}<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">${A('cherry/bloom', 66)}${hand('all three done', 20)}</div>${meta('shut down after 17')}`, { pad: '14px 14px 12px' })
W.empty22 = () => card(2, 2, `${cap('Top 3')}<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">${A('clover/seedling', 56)}${clip('Nothing starred yet', 13, 'color:var(--ink-muted)')}</div>${btn('Plan my day', '', true)}`, { pad: '14px 14px 12px' })
W.stale22 = () => card(2, 2, `<div style="display:flex;justify-content:space-between;align-items:center">${cap('Top 3')}${row(I('offline', 13) + meta('09:40', 'var(--sig-offline)'), 'gap:4px')}</div><div style="margin-top:8px;opacity:.7">${row(box(false, true) + grow(clip(GOAL, 14, 'font-family:var(--font-display);font-weight:600')), 'padding:6px 0 6px 11px')}${dash}${row(box() + grow(clip(TOP[0][0], 14)), 'padding:6px 0 6px 11px')}</div><div style="flex:1"></div>${meta('syncs when online', 'var(--sig-offline)')}`, { pad: '14px 14px 12px' })
W.signedOut22 = () => card(2, 2, `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center">${A('seal/intact', 48)}${clip('Sign in to see your day', 13, 'color:var(--ink-muted)')}${btn('Open Kai’s Flow', '', true)}</div>`, { pad: '14px' })
W.loading22 = () => card(2, 2, `${cap('Top 3')}${[70, 55, 62].map((w) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0 4px"><span style="width:22px;height:22px;border-radius:6px;background:var(--skeleton)"></span><span style="height:12px;width:${w}%;border-radius:6px;background:var(--skeleton)"></span></div>`).join('')}`, { pad: '14px 14px 12px' })

// ── page furniture ──
const label = (n, title, size, desc) => `<div style="display:flex;flex-direction:column;gap:6px;max-width:${Math.max(U(size[0]) * 2 + 40, 300)}px"><div style="display:flex;align-items:baseline;gap:12px">${cap(n, 'var(--acc-terra-ink)')}<span style="font-family:var(--font-display);font-size:21px;font-weight:500">${title}</span>${cap(`${size[0]}×${size[1]}`)}</div><p style="margin:0;font-size:14px;line-height:1.5;color:var(--ink-muted);text-wrap:pretty">${desc}</p></div>`
const pair = (fn) => `<div style="display:flex;gap:20px;align-items:flex-start"><div style="padding:20px;background:#5f6b60;border-radius:10px">${fn()}</div><div data-theme="night" style="--ikf:invert(.85) sepia(.15);padding:20px;background:#1f2226;border-radius:10px">${fn()}</div></div>`
const spec = (n, title, size, desc, fn) => `<div style="display:flex;flex-direction:column;gap:14px">${label(n, title, size, desc)}${pair(fn)}</div>`
const family = (name, note, specs) => `<div style="display:flex;flex-direction:column;gap:28px"><div style="display:flex;align-items:baseline;gap:18px;border-bottom:1px dashed var(--line-dashed);padding-bottom:12px"><span style="font-family:var(--font-display);font-size:30px;font-weight:500">${name}</span><span style="font-size:15px;color:var(--ink-muted);max-width:720px">${note}</span></div><div style="display:flex;flex-wrap:wrap;gap:56px 64px;align-items:flex-start;max-width:2280px">${specs.join('')}</div></div>`

function home(theme) {
  const wall = theme === 'night' ? '#1f2226' : '#5f6b60'
  const tint = theme === 'night' ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.92)'
  const icons = Array.from({ length: 4 }, () => `<span style="width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.16)"></span>`).join('')
  return `<div ${theme === 'night' ? 'data-theme="night"' : ''} style="${theme === 'night' ? '--ikf:invert(.85) sepia(.15);' : ''}position:relative;width:412px;height:892px;border-radius:40px;background:${wall};box-shadow:0 0 0 10px #111,0 30px 60px rgba(0,0,0,.3);overflow:hidden;flex:none"><div style="display:flex;justify-content:space-between;padding:16px 28px 0;font-size:13px;color:${tint};font-weight:500"><span>14:25</span><span>5G · 82%</span></div><div style="position:absolute;left:30px;top:56px;display:flex;flex-direction:column;gap:16px">${W.top42()}<div style="display:flex;gap:16px">${W.focus22()}<div style="display:flex;flex-direction:column;gap:16px">${W.inbox11.call()}${W.streak11()}</div>${W.capture11()}</div>${W.week41()}${W.capture41()}</div><div style="position:absolute;left:30px;right:30px;bottom:34px;display:flex;justify-content:space-between">${icons}</div></div>`
}

const S = []
S.push(family('Today', 'The day at a glance: the goal (the only gold), the Top 3, what’s now. Every checkbox ticks in place without opening the app.', [
  spec('W1', 'Goal of the day · slim', [4, 1], 'The one gold strip. Tick it from the home screen; tap the title to open the task.', W.goal1),
  spec('W2', 'Goal of the day · card', [2, 2], 'Taped gold card with the four-leaf clover. Its time, and the box.', W.goal2),
  spec('W3', 'Top 3 · small', [2, 2], 'Goal first, then the picks. Done rows strike through and stay until midnight.', W.top2),
  spec('W4', 'Today · Top 3', [4, 2], 'The everyday widget: date, the goal card, the two other picks with their start times.', W.top42),
  spec('W5', 'Today · full page', [4, 4], 'The whole Today in one paper page: goal, picks, up next, and a capture bar at the foot.', W.top44),
  spec('W6', 'Now', [4, 2], 'What’s running: block, time left, a thin progress line. Start focus or Done. Shows Next when nothing is running.', W.now42),
  spec('W7', 'Up next · tiny', [2, 1], 'One line: the next block and its time, coloured by its calendar.', W.next21),
  spec('W8', 'Day progress', [4, 1], 'Done count, the finish estimate, and the wisteria growing with it.', W.progress41),
]))
S.push(family('Capture', 'Tap to type, hold to talk — the same grammar as the app’s centre button. Opens the capture sheet with the keyboard up.', [
  spec('W9', 'Capture seal', [1, 1], 'The terra ＋. Tap = type sheet; long-press = record straight away.', W.capture11),
  spec('W10', 'Capture pill', [2, 1], 'The seal with a word, for people who like labels.', W.capture21),
  spec('W11', 'Capture bar', [4, 1], 'Type, talk, or write on paper (opens Paper capture’s camera).', W.capture41),
  spec('W12', 'Paper capture', [1, 1], 'One tap to photograph handwritten notes.', W.paper11),
  spec('W13', 'Ask', [4, 1], 'Opens the chat with the question typed; the chip sends a starter.', W.ask41),
]))
S.push(family('Calendar', 'Blocks in their calendar colours, the now line in terra. Past blocks fade.', [
  spec('W14', 'Agenda', [4, 3], 'Today’s blocks from the next one on, with the now line. Tap a block to open it.', W.agenda43),
  spec('W15', 'Agenda + week', [4, 4], 'The week strip on top (dots = days with things), the day below. Swipe-free: tap a day to open the calendar there.', W.agenda44),
  spec('W16', 'Week strip', [4, 1], 'Seven days; up to three dots each. Today is the inked chip.', W.week41),
  spec('W17', 'Countdown', [2, 1], 'Days until a pinned task or event.', W.countdown21),
]))
S.push(family('Focus', 'A running timer lives on the home screen; the widget stops or finishes it without opening the app.', [
  spec('W18', 'Focus timer', [2, 2], 'Ring, minutes left, the task, Stop and Done.', W.focus22),
  spec('W19', 'Focus · idle', [2, 2], 'The coiled fern, 25 / 50, Start on the goal.', W.focusIdle22),
  spec('W20', 'Focus · slim', [2, 1], 'A mini ring and the task while it runs.', W.focus21),
]))
S.push(family('Routines & streaks', 'Tend routines from the home screen. The vine grows with the streak.', [
  spec('W21', 'Routines', [2, 2], 'Today’s routines, ticked in place.', W.routines22),
  spec('W22', 'Routines · week', [4, 2], 'The same with each routine’s last seven days as petals and sage.', W.routines42),
  spec('W23', 'Streak plant', [2, 2], 'One routine’s vine, at its real stage, with the goal.', W.streak22),
  spec('W24', 'Streak · tiny', [1, 1], 'The sprout and the count.', W.streak11),
]))
S.push(family('Triage', 'The piles that need you: the Inbox and what’s overdue.', [
  spec('W25', 'Inbox', [2, 2], 'The hydrangea fills with the count. Sort them opens triage.', W.inbox22),
  spec('W26', 'Inbox · tiny', [1, 1], 'The hydrangea and its badge.', W.inbox11),
  spec('W27', 'Overdue', [2, 2], 'The count, the oldest, and Replan all (opens the Plan menu’s bulk sheet).', W.overdue22),
  spec('W28', 'Slipping', [2, 2], 'What hasn’t been touched in a while, in the gold of “needs attention”.', W.slipping22),
]))
S.push(family('Rituals & reflection', 'Phase-aware: the morning widget becomes the evening one after 17:00 (one widget, two faces).', [
  spec('W29', 'Plan my day', [4, 2], 'Mornings, until the day is planned.', W.plan42),
  spec('W30', 'Shut down', [4, 2], 'Evenings, until the day is closed.', W.shutdown42),
  spec('W31', 'One line', [4, 2], 'The journal’s line for today: write or say it.', W.journal42),
  spec('W32', 'From a while ago', [4, 2], 'A resurfaced note or line, once a day.', W.memory42),
  spec('W33', 'Pressed', [2, 2], 'The latest herbarium specimen.', W.specimen22),
  spec('W34', 'Season', [2, 1], 'The season and the weather where you are.', W.season21),
]))
S.push(family('States', 'Every list widget has these five. They never show a spinner on the home screen.', [
  spec('S1', 'All done', [2, 2], 'The cherry bloom, one Caveat line.', W.allDone22),
  spec('S2', 'Nothing yet', [2, 2], 'A seedling and the way in.', W.empty22),
  spec('S3', 'Offline / stale', [2, 2], 'Last known day, dimmed, with when it was fresh. Ticks queue and sync later.', W.stale22),
  spec('S4', 'Signed out', [2, 2], 'The intact seal and one button.', W.signedOut22),
  spec('S5', 'First paint', [2, 2], 'Skeleton rows, only before the very first sync.', W.loading22),
  spec('S6', 'Inbox zero', [2, 2], 'The empty hydrangea.', W.inboxZero22),
]))

const notes = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,360px));gap:28px;font-size:14px;line-height:1.55;color:var(--ink-muted)">
<div><div style="margin-bottom:6px">${cap('Grid & sizes', 'var(--ink-body)')}</div>4-column launcher. Cell 76dp, gap 16: 1 = 76 · 2 = 168 · 3 = 260 · 4 = 352dp. Every widget is responsive: it picks the nearest size from its family (Today W3 → W4 → W5) as the user resizes. Corners 22dp (Android 12 system radius), grain at the app’s strength.</div>
<div><div style="margin-bottom:6px">${cap('Touch', 'var(--ink-body)')}</div>Boxes 22dp drawn in 44dp hits. A tick is instant and optimistic (the widget re-draws from local data), then syncs. Tapping a title opens that task’s sheet; tapping empty paper opens the matching screen. No swipes inside widgets.</div>
<div><div style="margin-bottom:6px">${cap('Colour', 'var(--ink-body)')}</div>Gold only for the goal (and Slipping’s border). Terra for the one action per widget. Calendar blocks wear their calendar’s colour slot. Night follows the system dark mode, with the Night Garden tokens.</div>
<div><div style="margin-bottom:6px">${cap('Fresh without a background process', 'var(--ink-body)')}</div>The app writes a small snapshot whenever data changes and asks the widgets to redraw; Android’s own 30-minute refresh and the day rollover cover the rest. Times like “starts in 20m” are drawn as clock times plus Android’s own countdown text, so they stay right between refreshes.</div>
<div><div style="margin-bottom:6px">${cap('Build', 'var(--ink-body)')}</div>Jetpack Glance (Compose for widgets) inside the Capacitor Android shell. Everything here maps to Glance: rows, images, rounded paper, buttons, a progress bar, Chronometer for timers. The grain and tape are bitmaps. Fonts: Source Serif / Courier Prime / Caveat bundled as font resources.</div>
<div><div style="margin-bottom:6px">${cap('Privacy', 'var(--ink-body)')}</div>Widgets live on the home screen, so a “Hide titles on the home screen” setting swaps task names for “Your goal” / “2 picks” — the same rule as the lock-screen notifications.</div>
</div>`

const template = `<helmet>
<meta name="design_doc_mode" content="canvas">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,500&amp;family=Inter+Tight:wght@400;500;600&amp;family=Courier+Prime:ital,wght@0,400;0,700;1,400&amp;family=Caveat:wght@400;500;600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="ds/styles.css">
<style>
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--paper-linen);color:var(--ink-body);font-family:var(--font-ui);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
</style>
</helmet>
<section data-screen-label="19 Phone widgets" style="width:max-content;min-width:100%;padding:72px 64px 120px;display:flex;flex-direction:column;gap:88px">
<header style="display:flex;align-items:flex-end;gap:64px"><div><div style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-faint)">Kai’s Flow · 19 · Phone widgets · Oct 2026</div><h1 style="margin:14px 0 0;font-family:var(--font-display);font-size:56px;font-weight:500;letter-spacing:-0.02em;line-height:1">The garden on your home screen</h1><p style="margin:16px 0 0;max-width:640px;font-size:16px;line-height:1.55;color:var(--ink-muted);text-wrap:pretty">34 widgets in seven families plus their states, each in day and night. Pressed paper cards on the Android grid: tick, capture and focus without opening the app.</p></div></header>
<div data-screen-label="Home screen" style="display:flex;gap:56px;align-items:flex-start">${home('day')}${home('night')}<div style="max-width:420px;display:flex;flex-direction:column;gap:12px">${cap('A home screen, set up')}<span style="font-family:var(--font-display);font-size:24px;font-weight:500">Today 4×2 · Focus 2×2 · Inbox and streak 1×1 · Capture seal · Week strip · Capture bar</span><p style="margin:0;font-size:14px;line-height:1.55;color:var(--ink-muted)">The paper reads as one family on any wallpaper. Day on a green wallpaper, night on a dark one: the cards follow the system theme, not the wallpaper.</p></div></div>
${S.map((s, i) => `<div data-screen-label="Family ${i + 1}">${s}</div>`).join('\n')}
<div data-screen-label="Notes" style="display:flex;flex-direction:column;gap:20px"><span style="font-family:var(--font-display);font-size:30px;font-weight:500;border-bottom:1px dashed var(--line-dashed);padding-bottom:12px">How they behave</span>${notes}</div>
</section>`

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${template}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1600,"height":1000}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`
fs.writeFileSync(OUT, html)
console.log('wrote', OUT, html.length)
