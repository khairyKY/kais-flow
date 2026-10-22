// Before / after table from two measure.mjs runs:   node compare.mjs <before/results.json> <after/results.json>
// Long tasks (ms, each >50 ms task on the main thread), dropped frames (>20 ms) and React commits.
import fs from 'node:fs'
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
const ROWS = [
  ['d1280x1', 'block-drag-3h·drop', 'Block drop (move 3h)'],
  ['d1280x1', 'resize-1h·drop', 'Resize drop'],
  ['d1280x1', 'rail-card-drag·drop', 'Rail card drop'],
  ['d1280x1', 'held-task-out·drop', 'Held task out of a slot'],
  ['d1280x1', 'write-complete-echo', 'Tick a block + server echo'],
  ['d1280x1', 'page-next', 'Page next'],
  ['d1280x1', 'page-prev', 'Page prev'],
  ['d1280x1', 'page-today', 'Today'],
  ['d1280x1', 'view-w', 'Week view'],
  ['d1280x1', 'view-m', 'Month view'],
  ['d1280x1', 'quickcreate-open', 'Quick create open'],
  ['d1280x1', 'quickcreate-close', 'Quick create close'],
  ['d1280x1', 'blockmenu-open', 'Block popover open'],
  ['d1280x1', 'blockmenu-close', 'Block popover close'],
  ['d1280x1', 'taskpopover-open', 'Task popover open'],
  ['d1280x1', 'taskpopover-close', 'Task popover close'],
  ['d1280x1', 'planning-on', 'Planning mode on'],
  ['d1280x1', 'planning-off', 'Planning mode off'],
  ['d1280x1', 'rail-splitter-drag·move', 'Rail splitter, 40 moves'],
  ['d1280x1', 'rail-fold', 'Rail fold'],
  ['d1280x1', 'rail-unfold', 'Rail unfold'],
  ['d1280x1', 'idle-62s-with-minute-ticks', '62 s idle (minute ticks)'],
  ['phone', 'swipe-next·move', 'Phone day swipe (move)'],
  ['phone', 'block-drag-3h·drop', 'Phone block drop'],
]
const cell = (r) => {
  if (!r) return 'n/a'
  const sum = r.longTasks.reduce((x, y) => x + y, 0)
  const lt = !r.longTasks.length ? 'none' : r.longTasks.length > 6 ? `${r.longTasks.length} long tasks (${sum})` : `${r.longTasks.join(' + ')} (${sum})`
  return `${lt} · ${r.dropped} dropped · ${r.commits} commits`
}
console.log('| Scenario | Before | After |\n|---|---|---|')
for (const [c, k, name] of ROWS) console.log(`| ${name} | ${cell(a[c]?.[k])} | ${cell(b[c]?.[k])} |`)
