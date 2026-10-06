import { img, head2, icon, btn, soon } from '../lib.mjs'
import { papers, notebookPage, linedPage } from '../parts.mjs'

const lecture = `<div class="lined sm" role="img" aria-label="Handwritten lecture notes from OS lecture 3 on 4 October"><div class="lined-in">
  <div class="u">OS lecture 3 — 4 Oct</div><div>· Assignment 2 due Thu 11:59pm</div><div>· Read ch. 4 scheduling</div><div>· ask Dr. Hany re: lab groups</div>
  <div>· Quiz next Sun !</div><div class="s" style="margin-left:18px">idea: kai’s flow paper mode</div><div>· buy blue pens</div></div></div>`
const review = `<div class="card review" role="img" aria-label="What Kai’s Flow found on the page: three tasks and a note, with the unsure one marked Check this">
  <div class="review-h">From your page · 7 things</div>
  <div class="review-r"><span class="tag">Task</span>Assignment 2<span class="meta">Thu 8 Oct · 23:59</span></div>
  <div class="review-r"><span class="tag">Task</span>Read ch. 4 — scheduling<span class="meta">OS</span></div>
  <div class="review-r unsure"><span class="tag">Task</span>Ask Dr. Hany about lab groups<span class="meta">Check this</span></div>
  <div class="review-r"><span class="tag note">Note</span>Idea: Kai’s Flow paper mode<span class="meta">Kai’s Flow</span></div>
  <span class="btn primary" aria-hidden="true">Add all 7</span></div>`
const ticked = `<div class="card review" role="img" aria-label="Five boxes ticked on paper, ready to be marked done in the app">
  <div class="review-h">5 ticked on paper → mark done?</div>
  ${['GCI homework 1 — NumPy', 'Do GCI lecture 2’s survey', 'Shower + breakfast', 'Reply to Omar', 'Buy milk'].map((t) => `<div class="review-r"><span class="box">${icon('check', 15)}</span>${t}</div>`).join('')}
  <span class="btn primary" aria-hidden="true">Mark 5 done</span></div>`

const step = (n, eyebrow, title, text, art) => `<section class="sec"><div class="wrap paperstep">
  <div><div class="numrow"><span class="num" aria-hidden="true">${n}</span>${soon()}</div>${head2({ eyebrow, title, lead: text })}</div>
  <div class="pair">${art}</div>
</div></section>`

export const paper = {
  path: '/paper/',
  title: 'Paper people',
  description: 'For people who think on paper: the Notebook page lays out your day to copy by hand, Paper capture turns a photo of your notes into tasks, and the ticks loop marks them done. Coming soon.',
  og: 'paper',
  body: `<section class="sec first paper-hero"><div class="wrap split">
  <div>
    ${head2({ eyebrow: 'Paper people', title: 'For people who think on paper', lead: 'Some of us plan better with a pen. Kai’s Flow doesn’t try to cure that. It hands you the page, and takes the page back.', h: 'h1' })}
    <div class="btns" style="margin-top:28px;align-items:center">${btn('Follow Field notes', '/field-notes/feed.xml', { kind: 'secondary', size: 'lg', ic: 'rss' })}<span class="faint" style="font-size:14px">An RSS feed. No email needed.</span></div>
  </div>
  <div style="position:relative">${img('tools-pen', 'A fountain pen', { w: 220, cls: 'pen', eager: true })}${papers()}</div>
</div></section>
${step(1, 'Notebook page', 'Your day, the way you write it', 'Habits and data on top, the plan in the middle, boxes below — or any order you like. Copy it by hand, or print it on A5. Big type, aligned times, real boxes.', notebookPage())}
${step(2, 'Paper capture', 'A photo of your notes becomes tasks', 'Write in a lecture or a meeting. Later, take a photo. Kai’s Flow reads your handwriting and suggests tasks, events and notes — showing the line it read beside anything it isn’t sure of.', lecture + review)}
${step(3, 'The ticks loop', 'Tick it on paper, it’s done in the app', 'At night, photograph the page you ticked. The app finds each box by its line and asks once: mark these done?', linedPage('sm') + ticked)}
<section class="sec"><div class="wrap narrow" style="text-align:center">
  <p class="lead" style="margin-inline:auto">Paper capture is here (v1.0.20); the Notebook page and the ticks loop come next. Field notes will say the day each one lands.</p>
  <div class="btns" style="justify-content:center;margin-top:22px">${btn('Follow Field notes', '/field-notes/feed.xml', { kind: 'secondary', ic: 'rss' })}${btn('What’s growing', '/growing/', { kind: 'secondary' })}</div>
</div></section>`,
}
