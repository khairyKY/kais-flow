import { img, shot, icon } from '../lib.mjs'
import { getIt, papers, promises } from '../parts.mjs'
import { APP_URL, RELEASES, EXE_LATEST, DMG_LATEST, APK_LATEST } from '../data.mjs'

// ── the hero: A · "Title page" (Kai 2026-11-16, design-export/Site and mark.html) ──
// A version pill, a two-line promise, one download button for the visitor's system (site.js swaps it in;
// without JS it's "Download" → /download/), and a live product view with four tabs. Centred and calm.
const TABS = [
  ['today', 'Today', '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>'],
  ['cal', 'Calendar', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ['inbox', 'Inbox', '<path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>'],
  ['widgets', 'Widgets', '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'],
]
// both themes in the page; CSS shows the one that matches (the hidden one never loads: display:none + lazy)
const hshot = (n, w, h, alt, eager = false) => ['day', 'night'].map((t) =>
  `<img class="${t}" src="/shots/hero-${n}-${t}.webp" alt="${t === 'day' ? alt : ''}"${t === 'night' ? ' aria-hidden="true"' : ''} width="${w}" height="${h}"${eager && t === 'day' ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`).join('')
const OSES = [['win', 'Windows', EXE_LATEST], ['mac', 'Mac', DMG_LATEST], ['android', 'Android', APK_LATEST], ['ios', 'iPhone', '/download/'], ['web', 'Web', APP_URL]]
const hero = () => `<section class="ha" aria-labelledby="ha-h">
  ${img('wisteria-p100', 'A hanging spray of pale wisteria', { w: 150, cls: 'ha-art ha-wis', eager: true })}
  ${img('daisy-morning', '', { w: 120, cls: 'ha-art ha-dsy', eager: true })}
  <div class="ha-in">
    <a class="ha-vp" href="/whats-new/"><b>${RELEASES[0].v}</b><span>${RELEASES[0].title}</span>${icon('arrow', 14)}</a>
    <h1 id="ha-h" class="ha-pr">Plan the day in three minutes.<span>Tend it quietly, close it at night.</span></h1>
    <p class="ha-sub">Tasks, time blocks, habits and a journal on one page of paper. Free, on the web, Windows, Mac and Android.</p>
    <div class="ha-dl" data-dl ${OSES.map(([k, , href]) => `data-${k}="${href}"`).join(' ')}>
      <a class="btn primary lg" data-main href="/download/">${icon('download', 20)}<span>Download</span></a>
      <p class="ha-others" data-others>Also for ${OSES.map(([, n, href]) => `<a href="${href}">${n}</a>`).join(' · ')}</p>
    </div>
  </div>
  <div class="ha-stage" data-stage>
    <div class="ha-view">
      <figure class="ha-pane" data-pane="today" role="tabpanel" aria-label="Today">
        ${img('daisy-midday', '', { w: 150, cls: 'ha-bt l' })}${img('hydrangea-medium', '', { w: 150, cls: 'ha-bt r' })}
        <div class="ha-ph">${hshot('today', 390, 844, 'Today on a phone: the goal of the day, the Top 3 and what is up next')}</div>
      </figure>
      <figure class="ha-pane" data-pane="cal" role="tabpanel" aria-label="Calendar"><div class="ha-shotw">${hshot('cal', 1280, 800, 'The calendar on a computer, with colour blocks and a task running over', true)}</div></figure>
      <figure class="ha-pane" data-pane="inbox" role="tabpanel" aria-label="Inbox"><div class="ha-shotw">${hshot('inbox', 1280, 800, 'The Inbox on a computer: a voice note suggested as a task')}</div></figure>
      <figure class="ha-pane" data-pane="widgets" role="tabpanel" aria-label="Widgets">
        ${img('fern-unfurl2', '', { w: 90, cls: 'ha-bt l' })}${img('cherry-half-right', '', { w: 170, cls: 'ha-bt r' })}
        <div class="ha-wg">${hshot('widgets', 800, 970, 'Five Windows desktop widgets: Today, Now and next, Day bar, Goal and Next')}</div>
      </figure>
    </div>
    <div class="ha-tabs" role="tablist" aria-label="A look inside">${TABS.map(([k, label, p]) => `<button type="button" role="tab" data-tab="${k}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg><span>${label}</span><i></i></button>`).join('')}</div>
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
  ['Apps', 'Web, Android, Windows and Mac: widgets, a tray icon, offline, your own clock.', '/features/apps/'],
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
  description: 'A free planner that looks like a field journal: tasks, time blocks, habits and your journal on one page, with voice capture, Google Calendar and your AI assistant. Web, Android, Windows and Mac. No ads, no tracking.',
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
