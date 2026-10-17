import { img, shot, btn, icon } from '../lib.mjs'
import { getIt, papers, promises } from '../parts.mjs'
import { APP_URL, RELEASES } from '../data.mjs'

// ── the hero: the real Today page, desk and phone ──
const hero = () => `<section class="hero wrap">
  <div class="hero-copy">
    <p class="hand hero-date" data-today aria-hidden="true">a fresh page</p>
    <h1>Your days, planned in one quiet place.</h1>
    <p class="sub">Tasks, time blocks, habits and your journal on one page. Plan it in the morning, tend it through the day, close it at night.</p>
    <div class="btns">${btn('Open the app', APP_URL, { size: 'lg' })}${btn('Download', '/download/', { kind: 'tonal', size: 'lg', ic: 'download' })}</div>
    <p class="hero-note">Free, on the web, Android and Windows.</p>
  </div>
  <div class="hero-art">
    ${img('wisteria-p100', '', { w: 150, cls: 'hero-wisteria', eager: true })}
    ${shot('today-desk', 'Today on a computer: the goal of the day on a taped page, the Top 3 with a task’s steps folded under it, the day’s timeline and the morning ritual', { eager: true })}
    ${shot('today-phone', 'Today on a phone: the date, Plan my day, the goal of the day and what’s up next', { eager: true, cls: 'hero-phone' })}
  </div>
</section>`

// ── the day, told by scrolling: every headline feature at the hour you'd use it ──
const chat = () => `<div class="chat" role="img" aria-label="An AI assistant connected to Kai’s Flow moves tomorrow’s study block to 16:00 and adds a task before it">
  <div class="chat-top"><span class="chat-dot"></span>Your assistant <small>connected to Kai’s Flow</small></div>
  <p class="chat-me">Move tomorrow’s study slot to 4pm and put “Print the sheet” just before it.</p>
  <div class="chat-tools"><span>${icon('calendar', 14)}edit_event</span><span>${icon('check', 14)}add_task</span></div>
  <p class="chat-it">Done. The Study slot is now 16:00–17:30 on Saturday, and “Print the sheet” is at 15:45. Your three tasks are still inside the slot.</p>
</div>`
const BEATS = [
  ['07:40', 'Morning', 'Plan my day', 'Three minutes with your tea. Pick a Top 3, star the goal, and each one gets a time that fits around your Google calendar.', shot('plan-phone', 'Plan my day on a phone: three picks, each with a suggested time'), 'daisy-morning'],
  ['10:10', 'Mid-morning', 'One page for today', 'The goal of the day gets its own taped page. Bigger tasks keep their steps folded underneath: one of three done, and you can see which.', shot('today-phone', 'Today on a phone: the goal of the day and a task with its steps'), 'daisy-midday'],
  ['13:00', 'After lunch', 'A slot for the study hour', 'A time block can hold tasks. Drag three into the Study slot and tick them off inside it, on your phone or at your desk.', shot('slot-phone', 'The phone calendar: a Study slot with its tasks inside it'), 'hydrangea-medium'],
  ['17:05', 'On the bus', 'Say it', 'Hold the button and talk. It listens, writes it down and files it, so “call Omar Friday at 5” lands on Friday at five.', shot('voice-phone', 'Voice capture on a phone: the Sotto pill listening hands-free over Today'), 'cherry-half-right'],
  ['20:00', 'Evening', 'Ask your assistant', 'Connect Claude, or any app that speaks MCP, and it can do what you can: move a block, add a task, plan tomorrow. Your journal and the people you keep stay out of it unless you say so.', chat(), 'fern-unfurl2'],
  ['21:30', 'Night', 'Shut down', 'Tick off what’s done, move what isn’t to tomorrow, and close the garden for the night.', shot('shutdown-phone', 'Shut down on a phone at night: what got done, and two things to move'), 'daisy-evening'],
]
const story = () => `<section class="story" id="how-it-works" aria-labelledby="story-h">
  <h2 id="story-h" class="sr">A day with Kai’s Flow, from morning to night</h2>
  <div class="story-stage">
    <ol class="story-nav" aria-hidden="true">${BEATS.map(([t, when], i) => `<li data-i="${i}"><b>${t}</b>${when}</li>`).join('')}</ol>
    ${BEATS.map(([t, when, title, line, pic, art], i) => `<article class="beat${i === BEATS.length - 1 ? ' night' : ''}"${i === BEATS.length - 1 ? ' data-theme="night"' : ''}>
      <div class="beat-text"><p class="beat-when"><b>${t}</b> ${when}</p><h3>${title}</h3><p>${line}</p></div>
      <div class="beat-pic">${pic}</div>
      ${img(art, '', { w: 260, cls: 'beat-art' })}
    </article>`).join('\n    ')}
  </div>
</section>`

// ── Google, both ways: the one desk-sized picture ──
const google = () => `<section class="sec google"><div class="wrap">
  <div class="head"><h2>Your Google calendar, both ways</h2>
    <p class="lead">Connect it in Settings and your Google events sit on the grid beside your own blocks. Your plan goes back to Google as private busy time, so nobody books over your study hour. Disconnect, and what it wrote is taken out again.</p></div>
  <div class="google-art">
    ${shot('week-desk', 'The week calendar on a computer: time blocks, a Study slot holding tasks, and events from Google Calendar')}
    <p class="google-notes hand"><span>Dhuhr and Jumu’ah come from Google, read-only</span><span>your own blocks go back to Google as “busy”</span></p>
  </div>
</div></section>`

// ── the little things ──
const dots = '<span class="lt-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
const little = () => `<section class="sec"><div class="wrap">
  <div class="head"><h2>Small, on purpose</h2></div>
  <div class="little">
    <figure><div class="card lt lt-swipe" role="img" aria-label="A task row sliding right to show Tomorrow underneath">
      <div class="lt-under">${icon('tomorrow', 22)}Tomorrow</div><div class="lt-row"><span class="box"></span>Water the plants</div>${dots}</div>
      <figcaption><h3>Swipe to tomorrow</h3><p>A task you can’t face today slides to tomorrow morning. Undo is right there.</p></figcaption></figure>
    <figure><div class="card lt lt-press" role="img" aria-label="A hydrangea being pressed between paper, labelled GCI course, pressed 3 Oct">
      ${img('hydrangea-medium', '', { w: 130 })}<div class="lt-sheet"></div><span class="lt-label">GCI course, pressed 3 Oct</span>${dots}</div>
      <figcaption><h3>Pressed when it’s done</h3><p>Finish a project and it’s pressed into the herbarium, like a flower in a book.</p></figcaption></figure>
    <figure><div class="card lt" role="img" aria-label="A clover growing over twelve days of a streak: a seedling, then a small clover, then a full four-leaf clover">
      <div class="lt-grow"><div>${img('clover-seedling', '', { w: 56, style: 'height:56px' })}<span>Day 1</span></div><div>${img('clover-awake', '', { w: 76, style: 'height:76px' })}<span>Day 5</span></div><div>${img('clover-four_leaf', '', { w: 100, style: 'height:100px' })}<span>Day 12</span></div></div>${dots}</div>
      <figcaption><h3>A streak that grows</h3><p>Keep a routine and its sprout grows. Miss one day and it waits for you.</p></figcaption></figure>
    <figure><div class="card lt lt-done" role="img" aria-label="A task ticked off with one soft note: tock">
      <div class="lt-row"><span class="box">${icon('check', 15)}<span class="lt-arcs"><i style="left:-14px;transform:rotate(-30deg)"></i><i style="left:2px"></i><i style="left:18px;transform:rotate(30deg)"></i></span></span><s>Buy milk</s></div><span class="lt-shh">tock…</span>${dots}</div>
      <figcaption><h3>The sound of done</h3><p>Ticking a task plays one soft note: felt piano, kalimba or glass. Off in Settings if you’d rather.</p></figcaption></figure>
  </div>
  <p class="proof"><span class="hand">built by one student, for himself first</span><a href="/field-notes/">${RELEASES.length} releases since 27 September</a></p>
</div></section>`

// ── paper people ──
const paper = () => `<section class="sec" id="paper"><div class="wrap split">
  <div>
    <div class="head"><h2>Some days want a pen</h2>
      <p class="lead">If you think better on paper, Kai’s Flow hands you the page: your habits, your plan and your boxes, laid out the way you’d write them. In the evening, photograph it, and the ticks come back as done.</p></div>
    <p class="more-line"><a href="/paper/">For people who think on paper</a></p>
  </div>
  ${papers()}
</div></section>`

// ── everything else, as a contents page ──
const CONTENTS = [
  ['Plan & Today', 'Plan my day, a Top 3 with one goal, Up next, and Plan… on any task.', '/features/plan-and-today/'],
  ['Calendar', 'Time blocks in 15-minute steps, Time slots that hold tasks, reminders before events.', '/features/calendar/'],
  ['Capture', 'Type it, say it, share it from any app, or photograph a handwritten page.', '/features/capture/'],
  ['Rituals & routines', 'Plan my day, Shut down, and routines with a streak that forgives a missed day.', '/features/rituals/'],
  ['Journal & herbarium', 'A line a day, and finished projects pressed like flowers.', '/features/journal/'],
  ['People', 'Birthdays, the last time you spoke, and notes on each person.', '/features/people/'],
  ['Apps', 'Web, Android and Windows: widgets, a tray icon, offline, your own clock.', '/features/apps/'],
  ['Bring your lists', 'Import from Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle or Goodreads.', '/integrations/'],
  ['Your AI assistant', 'Connect Claude or any MCP app, and choose what it may read and change.', '/guides/connect-an-ai-assistant/'],
  ['Compared', 'How it sits next to the planners you might be using now.', '/compare/'],
]
const contents = () => `<section class="sec" id="features"><div class="wrap">
  <div class="head"><h2>Everything else in the book</h2></div>
  <ol class="contents">${CONTENTS.map(([t, line, href]) => `<li><a href="${href}"><b>${t}</b><span>${line}</span></a></li>`).join('')}</ol>
</div></section>`

const FAQ = [
  ['Is it really free?', 'Yes. There’s no paid plan waiting behind it, and no ads.'],
  ['Does it work offline?', 'Yes. What you change offline waits on your device and syncs when you’re back online.'],
  ['Does it work with Google Calendar?', 'Yes, if you connect it in Settings. The Google calendars you choose show on your grid, and your plan can go back to Google as private busy time. Disconnect any time.'],
  ['Will there be an iPhone app?', 'Not yet. The web app works on iPhone in Safari, and you can add it to your home screen.'],
  ['Where is my data?', 'In a Supabase database in the EU (Frankfurt). Each account can only read its own rows. The <a href="/privacy/">privacy policy</a> has the details.'],
  ['Can I import from Akiflow or Todoist?', 'Yes, and from TickTick, Notion, Obsidian, Kindle and Goodreads. Projects, due dates and notes come with it. <a href="/guides/import/">Here’s how</a>.'],
  ['Can I use it with Claude or another AI assistant?', 'Yes. Make a key in Settings and connect Claude Desktop, Claude Code or any MCP client. It can read and change what you allow. Your journal and people stay out of it unless you switch them on for that key. <a href="/guides/connect-an-ai-assistant/">Here’s how</a>.'],
  ['Is there a widget for my phone?', 'On Android, 34 of them: Today, the Top 3, capture, the calendar, focus, routines and more. Tick things off without opening the app. <a href="/features/apps/">The apps</a>.'],
]
export const faq = () => `<div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}${icon('chevron', 20)}</summary><p>${a}</p></details>`).join('')}</div>`

export const home = {
  path: '/',
  title: 'Kai’s Flow — your days, planned in one quiet place',
  description: 'A free planner that looks like a field journal: tasks, time blocks, habits and your journal on one page, with voice capture, Google Calendar and your AI assistant. Web, Android and Windows. No ads, no tracking.',
  og: 'home',
  alternates: true,
  body: `${hero()}
${story()}
${google()}
${little()}
${paper()}
${contents()}
<section class="sec" id="privacy"><div class="wrap private">
  <div><div class="head"><h2>Your days are nobody’s business</h2><p class="lead">Kai’s Flow is a journal, so it behaves like one.</p></div>${img('seal-intact', 'A wax seal pressed with a fern', { w: 120, cls: 'seal' })}</div>
  ${promises()}
</div></section>
<section class="sec" id="get"><div class="wrap getfree">
  <div class="head"><h2>Free, on everything you own</h2>
    <p class="lead">No trial, no tiers, no card. It’s a small project made by one person who needed it, and it stays free. Your days sync between all three.</p>
    ${img('cherry-bloom', '', { w: 120, cls: 'getfree-art' })}</div>
  ${getIt()}
</div></section>
<section class="sec" id="faq"><div class="wrap">
  <div class="head"><h2>Asked, answered</h2></div>
  ${faq()}
</div></section>`,
}
