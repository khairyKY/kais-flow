import { img, head2, icon, btn, live, coming } from '../lib.mjs'
import { RELEASES, ROADMAP, REPO, shortDate, apkUrl } from '../data.mjs'

// ── integrations & imports ──
const INTEGRATIONS = [
  [1, 'code', 't-hyd', 'GitHub issues → Inbox', 'Issues assigned to you, and issues in repos you watch, arrive as Inbox items with a link back.'],
  [1, 'link', 't-terra', 'The capture link', 'One private address for Shortcuts, Tasker, a bookmarklet or curl.'],
  [1, 'share', 't-sage', 'Android share sheet', 'Share a page or some text from any app straight into Kai’s Flow.'],
  [1, 'A', 't-lav', 'Akiflow', 'Tasks, projects and their dates, from a JSON dump of your account.'],
  [1, 'T', 't-terra', 'Todoist', 'Projects, sections, labels and recurring tasks, from its CSV export.'],
  [1, 'TT', 't-hyd', 'TickTick', 'Lists, dates, tags and checklists, from its backup file.'],
  [1, 'N', 't-butter', 'Notion', 'A task database becomes a project, one row per task.'],
  [1, 'Md', 't-lav', 'Obsidian / Markdown', 'Every “- [ ]” in a folder of notes becomes a task.'],
  [1, 'book', 't-butter', 'Kindle highlights', 'Your highlights land in the Library, by book.'],
  [1, 'G', 't-butter', 'Goodreads', 'Your shelves come in as books in the Library.'],
  [0, 'calendar', 't-lav', 'Google Calendar · two-way', 'Events in, time blocks out.'],
  [0, 'mail', 't-hyd', 'Email → Inbox', 'Forward an email to your own address and it becomes a task.'],
  [0, 'chat', 't-sage', 'Telegram bot', 'Message the bot, and it lands in your Inbox.'],
  [0, 'code', 't-blossom', 'MCP server', 'Let an AI assistant read and add to your days, with your permission.'],
]
const mono = (m) => (m.length <= 2 ? `<span aria-hidden="true">${m}</span>` : icon(m))
const integrations = {
  path: '/integrations/',
  title: 'Integrations & imports',
  description: 'Move in from Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle and Goodreads, and capture from GitHub, the Android share sheet or your own capture link.',
  og: 'integrations',
  body: `<section class="sec first"><div class="wrap">
  ${head2({ eyebrow: 'Integrations & imports', title: 'Bring what you have', lead: 'Move in from your old app in one go, and keep capturing from the tools you already use. Third-party names are theirs; we just read your exports.', h: 'h1' })}
  <div class="counts"><span class="chip live"><i aria-hidden="true"></i>Live · ${INTEGRATIONS.filter((i) => i[0]).length}</span><span class="chip soon">Coming · ${INTEGRATIONS.filter((i) => !i[0]).length}</span></div>
  <ul class="igrid" role="list">${INTEGRATIONS.map(([isLive, m, tone, name, line]) => `<li class="icell${isLive ? '' : ' coming'}"><div class="icell-top"><span class="dot ${tone}">${mono(m)}</span>${isLive ? live() : coming()}</div><h2 class="h3">${name}</h2><p>${line}</p></li>`).join('')}<li class="fill" aria-hidden="true"></li><li class="fill" aria-hidden="true"></li></ul>
  <p style="margin-top:28px" class="btns"><a class="more" href="/guides/import/">How to import your old app →</a><a class="more" href="/guides/capture-from-anywhere/">Capture from anywhere →</a></p>
</div></section>`,
}

// ── compare ──
const COLS = ['Kai’s Flow', 'Akiflow', 'Todoist', 'Notion', 'A paper notebook']
const ROWS = [
  ['Best at', 'A calm day, start to finish', 'Pulling many inboxes into one timeline', 'Fast, dependable task lists', 'Docs and databases for anything', 'Thinking slowly, by hand'],
  ['Price', 'Free', 'Paid subscription', 'Free plan + paid', 'Free plan + paid', 'A few euros'],
  ['Calendar + time blocks', 'Built in', 'Built in', 'Calendar views', 'Through Notion Calendar', 'If you draw it'],
  ['Morning / evening rituals', 'Built in', 'Built in', '—', 'Build your own', 'Your own habit'],
  ['Journal', 'Built in', '—', '—', 'Build your own', 'That’s the point'],
  ['Paper loop', 'Coming', '—', '—', '—', 'It is paper'],
  ['iPhone app', 'Not yet · web works', 'Yes', 'Yes', 'Yes', 'Fits a pocket'],
  ['Teams', 'No', 'Some', 'Yes', 'Yes', 'Pass it round'],
]
const compare = {
  path: '/compare/',
  title: 'Compare',
  description: 'Kai’s Flow next to Akiflow, Todoist, Notion and a paper notebook — what each does well, where Kai’s Flow is different, and what it doesn’t do yet.',
  og: 'compare',
  body: `<section class="sec first"><div class="wrap">
  ${head2({ eyebrow: 'Compare', title: 'Kai’s Flow, next to the others', lead: 'Honestly. Every one of these is good at something. Here’s where Kai’s Flow is different, and where it isn’t there yet.', h: 'h1' })}
  <div class="tablewrap" role="region" aria-label="Comparison table" tabindex="0"><table class="ctable">
    <thead><tr><td></td>${COLS.map((c, i) => `<th scope="col"${i === 0 ? ' class="us"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${ROWS.map(([h, ...cells]) => `<tr><th scope="row">${h}</th>${cells.map((c, i) => `<td${i === 0 ? ' class="us"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <p class="note">As we understand each one in October 2026. If we got yours wrong, tell us and we’ll fix it.</p>
</div></section>
<section class="sec"><div class="wrap lists">
  <div>${head2({ eyebrow: 'Where it’s different', title: 'What you get here' })}<ul class="ticks">
    <li>${icon('check', 20)}Free, with no plan waiting behind it.</li>
    <li>${icon('check', 20)}Calm on purpose: paper, plants, one terra button.</li>
    <li>${icon('check', 20)}A paper loop — copy your day out, photograph it back (coming soon).</li>
    <li>${icon('check', 20)}Your own calendar, not a view of someone else’s.</li></ul></div>
  <div>${head2({ eyebrow: 'Not yet', title: 'What it doesn’t do' })}<ul class="ticks no">
    <li>No iPhone app. The web app works in Safari.</li>
    <li>No teams, sharing or assigning.</li>
    <li>No Google Calendar sync yet — it’s next.</li>
    <li>No one-tap export yet. Ask, and we’ll send you your data.</li></ul></div>
</div></section>`,
}

// ── field notes (the changelog) ──
const entry = (r, i) => {
  const shown = r.lines.slice(0, 4), rest = r.lines.slice(4)
  const lis = (ls) => `<ul>${ls.map((l) => `<li>${l}</li>`).join('')}</ul>`
  return `<article class="entry${i === 0 ? ' card' : ''}" id="${r.v}" aria-labelledby="${r.v}-h">
  <div class="entry-side">${img(r.art, '', { w: 56 })}<div><h2 class="entry-date" id="${r.v}-h">${shortDate(r.date)}</h2><span class="entry-v">${r.v}</span></div></div>
  <div>${lis(shown)}${rest.length ? `<details><summary>+ ${rest.length} more</summary>${lis(rest)}</details>` : ''}
  ${i === 0 ? `<p class="entry-links"><a href="${apkUrl(r.v)}">Download ${r.v}</a><a href="${REPO}/releases/tag/${r.v}">Read on GitHub</a></p>` : ''}</div>
</article>`
}
const fieldNotes = {
  path: '/field-notes/',
  title: 'Field notes',
  description: 'Every Kai’s Flow release, written down like a journal entry. Newest first, with an RSS feed.',
  og: 'field-notes',
  body: `<section class="sec first"><div class="wrap narrow">
  ${head2({ eyebrow: 'Field notes', title: 'What changed, and when', lead: 'Every release, written down like a journal entry. Newest first.', h: 'h1' })}
  <div class="btns" style="margin-top:22px">${btn('RSS feed', '/field-notes/feed.xml', { kind: 'secondary', ic: 'rss' })}</div>
</div></section>
<section style="padding-bottom:100px"><div class="wrap narrow notes">${RELEASES.map(entry).join('')}
  <p class="note" style="margin-top:24px">Older builds and checksums are on <a href="${REPO}/releases">GitHub releases</a>.</p>
</div></section>`,
}

// ── what's growing (the public roadmap) ──
const bed = (cls, art, alt, name, sub, items) => `<div><div class="bed-h">${img(art, alt, { w: 80, style: 'height:90px' })}<div><h2>${name}</h2><span class="eyebrow">${sub}</span></div></div>
  <div class="bed ${cls}"><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></div></div>`
const growing = {
  path: '/growing/',
  title: 'What’s growing',
  description: 'The Kai’s Flow roadmap as a garden: what’s being built now, what’s next, and what’s still a seed.',
  og: 'growing',
  body: `<section class="sec first"><div class="wrap">
  ${head2({ eyebrow: 'What’s growing', title: 'The roadmap, as a garden', lead: 'What’s being built now, what’s next, and what’s still a seed. Plans change with the weather.', h: 'h1' })}
  <div class="beds">
    ${bed('now', 'cherry-bloom', 'A cherry blossom in full bloom', 'Now', 'In bloom · being built this month', ROADMAP.now)}
    ${bed('next', 'cherry-bud', 'A cherry bud about to open', 'Next', 'Budding · after that', ROADMAP.next)}
    ${bed('later', 'clover-seedling', 'A small seedling', 'Later', 'Seeds · one day', ROADMAP.later)}
  </div>
  <p style="margin-top:36px"><a class="more" href="/field-notes/">What already grew: Field notes →</a></p>
</div></section>`,
}

export const morePages = [integrations, compare, fieldNotes, growing]
