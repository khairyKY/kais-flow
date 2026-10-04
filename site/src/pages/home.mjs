import { img, screen, btn, head2, icon } from '../lib.mjs'
import { getIt, FEATURES, fcell, papers, promises } from '../parts.mjs'
import { APP_URL, RELEASES } from '../data.mjs'

const BEATS = [
  ['07:40 · Morning', 'Plan my day', 'Three minutes with your tea. Pick a Top 3, star the goal, and each one gets a suggested time.', 'plan', 'Plan my day on a phone: three picks with suggested times and a Start the day button', 'daisy-morning', 'A daisy opening in the morning'],
  ['10:10 · Mid-morning', 'Today', 'What you’re doing now sits on a small taped slip. What’s next is right below it.', 'today', 'Today on a phone: the NOW slip with a countdown, the Top 3 and what’s up next', 'daisy-midday', 'A daisy fully open at midday'],
  ['11:30 · Plans change', 'Drag it later', 'Hold a block and move it. It snaps to the quarter hour, and its reminder moves with it.', 'calendar-phone', 'The phone calendar with a block being dragged to 11:45, snapping to 15 minutes', 'hydrangea-medium', 'A hydrangea head'],
  ['17:05 · On the bus', 'Say it', 'Hold the button and talk. The day and the time are picked out for you.', 'voice', 'Voice capture listening: “Call Omar Friday at 5 about the lab groups”', 'cherry-half-right', 'A cherry blossom half open'],
  ['21:30 · Night', 'Shut down', 'Tick off what’s done, move what isn’t, and close the garden for the night.', 'shutdown', 'Shut down on a phone at 21:30: four done, two left to move', 'daisy-evening', 'A daisy closing at night'],
]

const story = () => `<section class="story" id="how-it-works" aria-labelledby="story-h">
  <h2 id="story-h" class="sr">A day with Kai’s Flow, start to finish</h2>
  <div class="story-stage">
    <div class="story-wash w0"></div><div class="story-wash w2"></div><div class="story-wash w3"></div><div class="story-wash w4"></div>
    <ol class="story-nav" aria-hidden="true">${BEATS.map((b, i) => `<li data-i="${i}">${b[0]}</li>`).join('')}</ol>
    <div class="story-bars" aria-hidden="true">${BEATS.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
    ${BEATS.map(([time, title, line, scr, label, art, alt], i) => `<article class="beat${i === 4 ? ' night' : ''}"${i === 4 ? ' data-theme="night"' : ''}>
      <div class="beat-text"><span class="eyebrow">${time}</span><h3>${title}</h3><p>${line}</p></div>
      ${screen(scr, label)}
      ${img(art, alt, { w: 300, cls: 'beat-art' })}
    </article>`).join('\n    ')}
    <p class="story-hint" aria-hidden="true">scroll ↓ · <b>1</b> / 5</p>
  </div>
</section>`

const dots = '<span class="lt-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
const little = () => `<section class="sec"><div class="wrap">
  ${head2({ eyebrow: 'Notice the little things', title: 'Small, on purpose' })}
  <div class="little">
    <figure><div class="card lt lt-swipe" role="img" aria-label="A task row sliding right to show Tomorrow underneath">
      <div class="lt-under">${icon('tomorrow', 22)}Tomorrow</div><div class="lt-row"><span class="box"></span>Water the plants</div>${dots}</div>
      <figcaption><h3>Swipe to tomorrow</h3><p>A task you can’t face today slides to 09:00 tomorrow. Undo is right there.</p></figcaption></figure>
    <figure><div class="card lt lt-press" role="img" aria-label="A hydrangea being pressed between paper, labelled GCI course, pressed 3 Oct">
      ${img('hydrangea-medium', '', { w: 130 })}<div class="lt-sheet"></div><span class="lt-label eyebrow">GCI course · pressed 3 Oct</span>${dots}</div>
      <figcaption><h3>Pressed when it’s done</h3><p>Finish a project and it’s pressed into the herbarium, like a flower in a book.</p></figcaption></figure>
    <figure><div class="card lt" role="img" aria-label="A clover growing over twelve days of a streak: a seedling, then a small clover, then a full four-leaf clover">
      <div class="lt-grow"><div>${img('clover-seedling', '', { w: 56, style: 'height:56px' })}<span class="eyebrow faint">Day 1</span></div><div>${img('clover-awake', '', { w: 76, style: 'height:76px' })}<span class="eyebrow faint">Day 5</span></div><div>${img('clover-four_leaf', '', { w: 100, style: 'height:100px' })}<span class="eyebrow faint">Day 12</span></div></div>${dots}</div>
      <figcaption><h3>A streak that grows</h3><p>Keep a routine and its sprout grows. Miss one day and it waits for you.</p></figcaption></figure>
    <figure><div class="card lt lt-done" role="img" aria-label="A task ticked off with a soft paper sound: shhff">
      <div class="lt-row"><span class="box">${icon('check', 15)}<span class="lt-arcs"><i style="left:-14px;transform:rotate(-30deg)"></i><i style="left:2px"></i><i style="left:18px;transform:rotate(30deg)"></i></span></span><s>Buy milk</s></div><span class="lt-shh">shhff…</span>${dots}</div>
      <figcaption><h3>The sound of done</h3><p>Ticking a task makes a soft paper rustle. Off in Settings if you’d rather.</p></figcaption></figure>
  </div>
  <p class="proof"><span class="hand">built by one student, for himself first</span><a class="eyebrow faint" href="/field-notes/">${RELEASES.length} releases since 27 September</a></p>
</div></section>`

const FAQ = [
  ['Is it really free?', 'Yes. There’s no paid plan waiting behind it, and no ads.'],
  ['Does it work offline?', 'Yes. What you change offline waits on your device and syncs when you’re back online.'],
  ['Will there be an iPhone app?', 'Not yet. The web app works on iPhone in Safari, and you can add it to your home screen.'],
  ['Where is my data?', 'In a Supabase database in the EU (Frankfurt). Each account can only read its own rows. The <a href="/privacy/">privacy policy</a> has the details.'],
  ['Can I import from Akiflow or Todoist?', 'Yes — and from TickTick, Notion, Obsidian, Kindle and Goodreads. Projects, due dates and notes come with it. <a href="/guides/import/">Here’s how.</a>'],
  ['Does it read my Google Calendar?', 'Not yet. Google Calendar sync is coming; it will stay off until you connect it, and you’ll be able to disconnect it any time.'],
]
export const faq = () => `<div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}${icon('chevron', 20)}</summary><p>${a}</p></details>`).join('')}</div>`

export const home = {
  path: '/',
  title: 'Kai’s Flow — your days, planned in one quiet place',
  description: 'A free planner that looks like a field journal: tasks, time blocks, habits and your journal on one page. Web, Android and Windows. No ads, no tracking.',
  og: 'home',
  alternates: true,
  body: `<section class="wrap hero">
  ${img('wisteria-p100', 'A hanging spray of pale wisteria', { w: 150, cls: 'hero-wisteria', eager: true })}
  <div class="hero-copy">
    <span class="eyebrow faint">A field journal of days</span>
    <h1>Your days, planned in one quiet place.</h1>
    <p class="sub">Tasks, time blocks, habits and your journal on one page of paper. Plan in the morning, tend it through the day, close it at night.</p>
    <div class="btns">${btn('Open the app', APP_URL, { size: 'lg' })}${btn('Download', '/download/', { kind: 'secondary', size: 'lg', ic: 'download' })}</div>
    <p class="hero-note">Free · Web, Android and Windows</p>
  </div>
  <div class="hero-mock">
    ${screen('calendar-week', 'The week calendar on a desktop, with colour-coded time blocks from Monday to Sunday')}
    ${screen('today', 'Today on a phone: what you’re doing now, your Top 3, and what’s up next', { cls: 'phone' })}
    <span class="hero-hand" aria-hidden="true">← what now, what’s next</span>
  </div>
</section>
${story()}
${little()}
<section class="sec" id="features"><div class="wrap">
  ${head2({ eyebrow: 'What’s inside', title: 'Everything a day needs, nothing it doesn’t' })}
  <div class="fgrid">${FEATURES.map((f) => fcell(f)).join('')}</div>
  <p style="margin-top:28px"><a class="more" href="/features/">See every feature →</a></p>
</div></section>
<section class="sec" id="paper"><div class="wrap split">
  <div>
    ${head2({ eyebrow: 'Made for paper people', title: 'Some days want a pen', lead: 'If you think better on paper, Kai’s Flow hands you the page. Your habits, your plan and your boxes, laid out the way you write them. In the evening, photograph the page, and the ticks come back as done.' })}
    <div class="soonline"><span class="chip soon">Coming soon</span>Notebook page · Paper capture</div>
    <p style="margin-top:22px"><a class="more" href="/paper/">For people who think on paper →</a></p>
  </div>
  ${papers()}
</div></section>
<section class="sec" id="privacy"><div class="wrap private">
  <div>${head2({ eyebrow: 'Private by default', title: 'Your days are nobody’s business', lead: 'Kai’s Flow is a journal, so it behaves like one.' })}${img('seal-intact', 'A wax seal pressed with a fern', { w: 120, cls: 'seal' })}</div>
  ${promises()}
</div></section>
<section class="sec tint"><div class="wrap free">
  ${img('cherry-bloom', 'A single cherry blossom', { w: 130 })}
  <h2>Kai’s Flow is free.</h2>
  <p>No trial, no tiers, no card. It’s a small project made by one person who needed it, and it stays free.</p>
</div></section>
<section class="sec" id="get"><div class="wrap">
  ${head2({ eyebrow: 'Get it', title: 'On the web, your phone, your desk', lead: 'Your days sync between all three.' })}
  ${getIt()}
</div></section>
<section class="sec" id="faq"><div class="wrap">
  ${head2({ eyebrow: 'Questions', title: 'Asked, answered' })}
  ${faq()}
</div></section>`,
}
