import { img, screen, head2, icon, tape, soon, btn } from '../lib.mjs'
import { getIt } from '../parts.mjs'
import { APP_URL } from '../data.mjs'

// The seven pillars (+ Paper people on the hub). [slug, icon, tone, name, line, link text]
const PILLARS = [
  ['plan-and-today', 'sprout', 't-sage', 'Plan & Today', 'Plan my day, a Top 3 with one goal, the NOW slip, Up next, and Plan… on any task.', 'Plan & Today'],
  ['calendar', 'calendar', 't-lav', 'Calendar', 'Your own calendar: time blocks, 15-minute steps, a touch calendar on the phone.', 'Calendar'],
  ['capture', 'mic', 't-terra', 'Capture', 'Tap to type, hold to talk, share from any app, or send a link.', 'Capture'],
  ['rituals', 'routine', 't-sage', 'Rituals & routines', 'Plan my day, Shut down, routines that fold by time of day, streaks.', 'Rituals'],
  ['journal', 'journal', 't-butter', 'Journal & herbarium', 'A line a day, and finished projects pressed into a herbarium.', 'Journal'],
  ['people', 'people', 't-blossom', 'People', 'Birthdays, and notes on the people you care about.', 'People'],
  ['apps', 'globe', 't-hyd', 'Apps', 'Web, Android and Windows: widgets, a tray icon, notifications, offline, and your own clock.', 'Apps'],
]

const hub = {
  path: '/features/',
  title: 'Features',
  description: 'Everything in Kai’s Flow: Plan my day and Today, your own calendar, capture, rituals and routines, the journal and herbarium, people, and the apps.',
  og: 'features',
  body: `<section class="sec first"><div class="wrap">
  ${head2({ eyebrow: 'Features', title: 'Everything that’s in the journal', lead: 'Seven parts, each small. Start anywhere.', h: 'h1' })}
  <div class="fgrid">${PILLARS.map(([slug, ic, tone, name, line, more]) => `<div class="fcell"><span class="dot ${tone}">${icon(ic)}</span><div class="fcell-t"><h2 class="h3">${name}</h2></div><p>${line}</p><a class="go" href="/features/${slug}/">${more} →</a></div>`).join('')}
    <div class="fcell"><span class="dot t-butter">${icon('notebook')}</span><div class="fcell-t"><h2 class="h3">Paper people</h2></div><p>Paper capture turns a photo of your notes into tasks. The Notebook page is being built.</p><a class="go" href="/paper/">Paper →</a></div>
  </div>
</div></section>`,
}

// one "how it works" block: text one side, a picture the other
const how = ({ eyebrow, title, text, steps, art, flip = false, id }) => `<section class="sec"${id ? ` id="${id}"` : ''}><div class="wrap how${flip ? ' flip' : ''}">
  <div>${head2({ eyebrow, title, lead: text })}${steps?.length > 1 ? `<ol class="steps">${steps.map((s) => `<li><span>${s}</span></li>`).join('')}</ol>` : steps ? `<p class="step1">${steps[0]}</p>` : ''}</div>
  <div class="how-art">${art}</div>
</div></section>`
const callout = ({ ic = 'sync', title, chip = soon(), text, href, more }) => `<section class="sec"><div class="wrap"><div class="card callout">
  <span class="dot">${icon(ic)}</span><div><h3>${title}${chip}</h3><p>${text}</p></div>${href ? `<a class="more" href="${href}">${more} →</a>` : ''}
</div></div></section>`
const others = (slug) => `<section class="sec"><div class="wrap">
  <span class="eyebrow faint">More of the journal</span>
  <nav class="pillar-next" aria-label="Other features">${PILLARS.filter((p) => p[0] !== slug).map((p) => `<a href="/features/${p[0]}/">${p[3]}</a>`).join('')}<a href="/paper/">Paper people</a></nav>
  <div class="btns" style="margin-top:28px">${btn('Open the app', APP_URL)}${btn('Download', '/download/', { kind: 'secondary', ic: 'download' })}</div>
</div></section>`
const pillarPage = ({ slug, title, lead, description, shot, sections, after = '' }) => {
  const p = PILLARS.find((x) => x[0] === slug)
  return {
    path: `/features/${slug}/`,
    title: `${p[3]} — ${title}`,
    description,
    og: `feature-${slug}`,
    body: `<section class="pillar-hero"><div class="wrap">
  <p class="crumbs"><a href="/features/">Features</a> › ${p[3]}</p>
  <div style="margin-top:16px">${head2({ eyebrow: p[3], title, lead, h: 'h1' })}</div>
  ${shot}
</div></section>
${sections.map(how).join('\n')}
${after}
${others(slug)}`,
  }
}

// small drawn pictures for the parts that have no app screen in the designs
const snap = `<div class="snap" role="img" aria-label="A calendar block for GCI homework from 10:30 to 12:30, its bottom edge pulled 15 minutes longer and snapped to the quarter hour">
  ${['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45'].map((t) => `<div>${t}</div>`).join('')}
  <div class="blk">GCI homework 1 — NumPy<small>10:30 – 12:30 · 2h</small></div><div class="ghost"></div><span class="handle"></span><span class="hand">+15 min, snapped</span></div>`
const shareSheet = `<div class="mini-stack" role="img" aria-label="The Android share sheet with Kai’s Flow in it, and a capture link sent with curl">
  <div class="mini-share"><b>Share</b><div class="apps"><span><i class="k">K</i>Kai’s Flow</span><span><i></i>Messages</span><span><i></i>Drive</span><span><i></i>Gmail</span></div></div>
  <pre class="mini-code">curl -X POST …/functions/v1/capture \\
  -H "Authorization: Bearer kf_…" \\
  -d '{"text": "call the tyre supplier"}'</pre></div>`
const inbox = `<div class="card mini-list" role="img" aria-label="The Inbox with three captured items waiting to be filed">
  <div class="mini-list-h">Inbox <span class="chip live" style="text-transform:none;letter-spacing:0">3</span></div>
  <div class="mini-row"><span class="box"></span><div>Call Omar about the lab groups<small>FRI 17:00 · from voice</small></div></div>
  <div class="mini-row"><span class="box"></span><div>Fix the export button<small>GITHUB · kais-flow · 2d</small></div></div>
  <div class="mini-row"><span class="box"></span><div>An article to read later<small>SHARED FROM CHROME</small></div></div></div>`
const herb = `<div class="herb card" role="img" aria-label="A herbarium sheet: a pressed hydrangea labelled GCI course, pressed 3 October">
  ${tape('gold', -3)}${img('hydrangea-medium', '', { w: 170 })}<div class="herb-label"><b>GCI course</b><span>pressed 3 Oct · 14 tasks · 6 weeks</span></div></div>`
const journalCard = `<div class="jcard card" role="img" aria-label="A journal page for Saturday 3 October with two short entries">
  <div class="jcard-d">Saturday, 3 October</div>
  <p><span class="t">08:10</span>Slept badly, but the plan for today is small. Three things, then the gym.</p>
  <p><span class="t">21:40</span>Judge test went well. Omar wants to meet Thursday.</p>
  ${img('fern-coil', '', { w: 48, cls: 'jcard-fern' })}</div>`
const bookCard = `<div class="card mini-list" role="img" aria-label="Walden in the Library, with a Kindle highlight">
  <div class="mini-list-h">Walden <small>Henry David Thoreau · reading</small></div>
  <blockquote>“I went to the woods because I wished to live deliberately.”</blockquote>
  <div class="mini-row" style="border:0"><small>KINDLE HIGHLIGHT · LOCATION 1271</small></div></div>`
const personCard = (name, chip, lines, aria) => `<div class="card person" role="img" aria-label="${aria}">
  <div class="person-h"><span class="avatar">${name[0]}</span><div><b>${name}</b><small>${chip}</small></div></div>
  ${lines.map(([t, d]) => `<div class="mini-row"><span class="t">${t}</span><div>${d}</div></div>`).join('')}</div>`
const specimen = (art, name, meta, rot) => `<div class="herb card" style="transform:rotate(${rot}deg)" role="img" aria-label="A herbarium sheet: ${name}, ${meta}">${img(art, '', { w: 140 })}<div class="herb-label"><b>${name}</b><span>${meta}</span></div></div>`
const birthdayOnToday = `<div class="card mini-list" role="img" aria-label="Today, with a card saying Mama’s birthday is tomorrow">
  <div class="mini-list-h">Saturday, Oct 3</div>
  <div class="mini-row bday"><span class="avatar" style="width:32px;height:32px;font-size:15px">M</span><div>Mama’s birthday is tomorrow.<small>PEOPLE · FAMILY</small></div></div>
  <div class="mini-row"><span class="box"></span><div>Reply to Omar<small>PEOPLE · 5M</small></div></div></div>`
const growth = `<div class="card lt grow-lg" role="img" aria-label="A routine’s streak growing from a seedling to a four-leaf clover, with a goal of 12 of 30 days">
  <div class="lt-grow"><div>${img('clover-seedling', '', { w: 56, style: 'height:56px' })}<span class="eyebrow faint">Day 1</span></div><div>${img('clover-awake', '', { w: 76, style: 'height:76px' })}<span class="eyebrow faint">Day 5</span></div><div>${img('clover-four_leaf', '', { w: 100, style: 'height:100px' })}<span class="eyebrow faint">Day 12</span></div></div>
  <span class="goal">12 / 30</span></div>`
const swipe = `<div class="card lt lt-swipe wide" role="img" aria-label="A task row swiped right to show Tomorrow underneath"><div class="lt-under">${icon('tomorrow', 22)}Tomorrow</div><div class="lt-row"><span class="box"></span>Water the plants</div></div>`
// Where the app has no drawn screen, the garden's own art stands in (never a made-up screen).
const art = (name, alt, w = 150) => img(name, alt, { w })
const daisies = `<div class="card lt grow-lg" role="img" aria-label="Three daisies on your own clock: opening at 07:00, open at 13:00, closing at 21:30">
  <div class="lt-grow even">${[['daisy-morning', '07:00', 64], ['daisy-midday', '13:00', 84], ['daisy-evening', '21:30', 72]].map(([a, t, h]) => `<div>${img(a, '', { w: h, style: `height:${h}px` })}<span class="eyebrow faint">${t}</span></div>`).join('')}</div></div>`

const pillars = [
  pillarPage({
    slug: 'plan-and-today', title: 'A plan you can finish',
    lead: 'Plan my day in the morning, then one page all day: what you’re doing now, what’s next, and what can wait.',
    description: 'Plan my day picks a Top 3 with one goal and suggested times. Today shows what you’re doing now on the NOW slip, and what’s up next.',
    shot: `<div class="shot duo">${tape('sage', -4)}${screen('plan', 'Plan my day on a phone: pick your Top 3, each with a suggested time')}${screen('today', 'Today on a phone: the NOW slip, the Top 3 and Up next')}</div>`,
    sections: [
      { eyebrow: 'Plan my day', title: 'Three minutes with your tea', text: 'Plan my day walks you through the morning. Pick your Top 3 from everything you have, star one as the goal, and each one gets a suggested time on your calendar.', steps: ['Search all your tasks and pick in place.', 'Star one as the goal of the day.', 'Keep the suggested times, or move them.'], art: screen('plan', 'Plan my day: three picks with suggested times', { s: 0.62 }) },
      { eyebrow: 'Today', title: 'What now, what’s next', text: 'Today is one page. While something is running it sits on a small taped slip with a countdown, the NOW slip. Your Top 3 sit under it, and Up next shows what comes after.', art: screen('today', 'Today: the NOW slip with a countdown, then the Top 3', { s: 0.62 }), flip: true },
      { eyebrow: 'When plans change', title: 'Tomorrow is one swipe away', text: 'Swipe a task right and it moves to 09:00 tomorrow. Swipe left and it goes to the Trash, with Undo. Hold a row to select several at once, or use ⋯ for everything else.', art: swipe },
      { eyebrow: 'Plan or Replan', title: 'Find it a time', text: 'Plan… on any task looks at your real calendar: the next free slot (it asks before it moves anything), tomorrow first thing, this weekend on your own weekend days, next week, or a date you pick. A time puts the task on the calendar.', steps: ['Make any task the goal of the day.', 'Put your Top 3 in your own order — the same on your phone and your computer.'], art: art('hydrangea-light', 'A pale hydrangea head', 170), flip: true },
      { eyebrow: 'From a while ago', title: 'Old things, settled kindly', text: 'Now and then Today brings back something you saved weeks ago, and says what it is and how old. Tap it to open it. Every button settles it: Plan, Done, Let it go, or Not now — with the real wait shown. Put something off twice and it asks once: keep it, or let it go?', art: art('fern-unfurl1', 'A fern frond unfurling', 130) },
    ],
    after: callout({ ic: 'routine', title: 'Shut down closes the day', chip: '', text: 'In the evening, tick off what’s done, move what isn’t, and pick tomorrow’s three.', href: '/features/rituals/', more: 'Rituals & routines' }),
  }),
  pillarPage({
    slug: 'calendar', title: 'A calendar that’s yours',
    lead: 'Your own week, with your tasks on it as time blocks. No second app, no switching.',
    description: 'Kai’s Flow has its own calendar: drag tasks onto the week as time blocks, resize them in 15-minute steps, and use a touch calendar made for phones.',
    shot: `<div class="shot">${tape('sage', -4)}${screen('calendar-week', 'The week from Monday 28 September to Sunday 4 October, with colour-coded time blocks')}</div>`,
    sections: [
      { eyebrow: 'Time blocks', title: 'Give a task its hour', text: 'Drag a task onto the calendar. Pull the bottom edge to make it longer. Everything snaps to 15 minutes, so the day stays tidy.', steps: ['Drag a task onto a time.', 'Pull its edge to resize — it snaps every 15 minutes.', 'Its reminder moves with it.'], art: snap },
      { eyebrow: 'On the phone', title: 'Made for thumbs', text: 'Swipe between days. Hold a block to lift it, drop it somewhere else. Grab the handle to resize. Nothing needs two hands.', art: screen('calendar-phone', 'The phone calendar for Saturday 3 October, with a block being moved to 11:45', { s: 0.6 }), flip: true },
      { eyebrow: 'The side rail', title: 'Everything waiting, beside the week', text: 'On a computer, a rail next to the calendar holds what’s overdue, what’s for today, and your Inbox. Drag a card onto a time: a task’s block moves there, and an Inbox note is filed and blocked in one go, with one Undo.', steps: ['Plan ▾ on any card offers the next free slot or tomorrow first thing.', 'A time you type in a capture — “Friday 5pm” — puts it on the calendar too.'], art: art('cherry-bud', 'A cherry bud about to open', 120) },
      { eyebrow: 'Events', title: 'Change it right where it is', text: 'Click an event and a small menu opens beside it: the date, how long, the project, the colour and whether it repeats. Each choice saves as you pick it, with no Save button. An event can repeat every day, week or month, or on your own rule; drag one occurrence and only that one moves.', steps: ['Click an event to open its menu.', 'Repeat it from the ↻ row.', 'Delete asks only one thing on a repeat: this event, or all of them.'], art: art('clover-awake', 'A clover, awake', 150) },
      { eyebrow: 'Planning mode', title: 'Lay out the next two days', text: 'Widen the side rail and the calendar folds to one or two days. Your tasks sit beside it, grouped by project with their total time, and the free gaps are marked, so you can drop each task where it fits.', art: art('wisteria-p40', 'Wisteria, partly in bloom', 150), flip: true },
    ],
    after: callout({ title: 'Google Calendar sync', text: 'Your Google events beside your blocks, and the blocks you plan sent back, so your other calendar stays true.', href: '/field-notes/', more: 'Follow it in Field notes' }),
  }),
  pillarPage({
    slug: 'capture', title: 'Get it out of your head',
    lead: 'Tap to type, hold to talk, or share from any app. It lands in your Inbox, ready when you are.',
    description: 'Capture in two taps: type it, say it, share it from any Android app, or send it to your private capture link from Shortcuts, Tasker, a bookmarklet or curl.',
    shot: `<div class="shot duo">${tape('blossom', 3)}${screen('voice', 'Voice capture listening: “Call Omar Friday at 5 about the lab groups”')}${screen('today', 'Today, where the new task lands with its date')}</div>`,
    sections: [
      { eyebrow: 'Tap or hold', title: 'Type it or say it', text: 'Tap Capture and type — on a phone the keyboard comes up with the sheet; on a computer it’s the Capture button or ⌘/Ctrl K. Write it the way you’d say it: the date, time, priority, length and notes are picked out for you. Or hold the button and talk.', steps: ['Tap and type, or hold and talk.', '“Call Omar Friday 5pm” lands with its date.', 'Whatever the AI filled in shows in a note with Undo, and what you typed yourself always wins.'], art: screen('voice', 'Voice capture listening on a phone', { s: 0.6 }) },
      { eyebrow: 'From anywhere', title: 'Share from any app', text: 'On Android, Kai’s Flow is in the share sheet: share a page or some text and it lands in your Inbox. Everywhere else there’s your capture link, one private address that Shortcuts, Tasker, a bookmarklet or curl can send to.', steps: ['<a href="/guides/capture-from-anywhere/">Set up the capture link</a> — two minutes.'], art: shareSheet, flip: true },
      { eyebrow: 'The Inbox', title: 'Sort it later', text: 'Everything waits in the Inbox until you file it: a task with a date, a note, or nothing at all. GitHub issues assigned to you arrive here too.', art: inbox },
    ],
    after: `<section class="sec"><div class="wrap duo-callouts">
  <div class="card callout"><span class="dot">${icon('mail')}</span><div><h3>Email → Inbox${soon()}</h3><p>Forward an email to your own address and it becomes a task.</p></div></div>
  <div class="card callout"><span class="dot">${icon('camera')}</span><div><h3>Paper capture</h3><p>A photo of your handwritten notes becomes tasks, events and notes — Arabic too. <a href="/paper/">For paper people →</a></p></div></div>
  <div class="card callout"><span class="dot">${icon('android')}</span><div><h3>From your home screen</h3><p>On Android, a capture widget opens straight to the keyboard. On Windows, the tray’s flyout has quick capture. <a href="/features/apps/">The apps →</a></p></div></div>
  <div class="card callout"><span class="dot">${icon('chat')}</span><div><h3>From your AI assistant</h3><p>Connect Claude or another assistant, and “add call the bank for Thursday” lands on your list. <a href="/guides/connect-an-ai-assistant/">Connect one →</a></p></div></div>
</div></section>`,
  }),
  pillarPage({
    slug: 'rituals', title: 'Small rituals at both ends of the day',
    lead: 'Plan my day in the morning, Shut down at night, and routines in between that fold away by time of day.',
    description: 'Plan my day in the morning, Shut down in the evening, and routines grouped by time of day with streaks that forgive a missed day.',
    shot: `<div class="shot duo">${tape('gold', 3)}${screen('plan', 'Plan my day in the morning')}${screen('shutdown', 'Shut down at 21:30: four done, two left to move')}</div>`,
    sections: [
      { eyebrow: 'Morning', title: 'Plan my day', text: 'About three minutes: choose your Top 3, star the goal, and give each one a time. A morning digest can remind you, at the hour you choose. <a href="/features/plan-and-today/">More about Plan & Today →</a>', art: screen('plan', 'Plan my day on a phone', { s: 0.6 }) },
      { eyebrow: 'Evening', title: 'Shut down', text: 'From five in the evening, Shut down offers to close the day: tick what’s done, move what isn’t, and pick tomorrow’s three. An evening nudge can call you to it. Then the garden closes for the night.', art: screen('shutdown', 'Shut down on a phone: done tasks ticked, the rest moving to tomorrow', { s: 0.6 }), flip: true },
      { eyebrow: 'Routines', title: 'Habits that fold by time of day', text: 'Routines sit under Morning, Afternoon, Evening and Anytime, so you only see what fits the hour. Each one keeps a streak that forgives one missed day a month, and you can give it a goal.', steps: ['Group a routine by the time you do it.', 'Keep it going and its sprout grows.', 'Set a goal — say, 30 days — and watch the count.'], art: growth },
      { eyebrow: 'Sounds', title: 'Small sounds, in one key', text: 'A soft note when you tick something off, a short chord when you start or close the day, a chime when a focus round ends. Three sets to choose from: Felt (the default), Kalimba and Glass.', steps: ['Pick a set and a volume, or switch sound off, in Settings → Sound.', 'They go quiet after Shut down until morning, and in quiet hours.'], art: art('cherry-half-right', 'A cherry blossom half open', 150), flip: true },
    ],
  }),
  pillarPage({
    slug: 'journal', title: 'Write the day down',
    lead: 'A journal for any day, a library for what you read, and a herbarium where finished projects are pressed like flowers.',
    description: 'A journal with as many entries a day as you like, a Library for books and highlights, and a herbarium where finished projects are pressed like flowers.',
    shot: `<div class="shot pics shelf">${tape('gold', -3)}${specimen('hydrangea-medium', 'GCI course', 'pressed 3 Oct · 14 tasks', -2)}${specimen('cherry-bloom', 'Spring reading list', 'pressed 12 Sep · 9 books', 1.5)}${specimen('fern-unfurl1', 'Kai’s Flow v1', 'pressed 26 Sep · 61 tasks', -1)}</div>`,
    sections: [
      { eyebrow: 'Journal', title: 'A line, or a page', text: 'Write as much or as little as the day deserves. A day can hold more than one entry, so the morning and the evening each get their own.', art: journalCard },
      { eyebrow: 'Herbarium', title: 'Pressed when it’s done', text: 'Finish a project and it’s pressed into the herbarium, like a flower in a book. The pressing ceremony waits until you’re there to watch.', art: herb, flip: true },
      { eyebrow: 'Library', title: 'What you read, and what stayed with you', text: 'Books, quotes and notes live in the Library. Bring your Kindle highlights and your Goodreads shelves with you.', steps: ['<a href="/guides/import/">Import Kindle highlights or Goodreads</a>.'], art: bookCard },
    ],
  }),
  pillarPage({
    slug: 'people', title: 'The people you care about',
    lead: 'Birthdays, the last time you spoke, and notes — so you show up for the people who matter.',
    description: 'Keep the people in your life close: birthdays on Today, a page per person with notes, and a log of when you last spoke.',
    shot: `<div class="shot pics">${tape('blossom', -3)}${personCard('Omar', 'Lab partner · birthday 14 Oct', [['THU', 'Coffee — talked about the lab groups']], 'Omar: lab partner, birthday on 14 October')}${personCard('Mama', 'Family · birthday tomorrow', [['SUN', 'Called — she’s visiting in November']], 'Mama: family, birthday tomorrow')}${personCard('Layla', 'Study group · birthday 2 Feb', [['28 SEP', 'Lent her the OS notes']], 'Layla: study group, birthday on 2 February')}</div>`,
    sections: [
      { eyebrow: 'People', title: 'Everyone in one place', text: 'Add the people in your life with their birthday and how you know them. When a birthday is today or tomorrow, Today tells you.', art: birthdayOnToday },
      { eyebrow: 'The person page', title: 'Notes, and the last time you spoke', text: 'Log a call, a coffee or a message. Each person’s page keeps the history and your notes, so the next conversation picks up where the last one ended.', art: personCard('Omar', 'Lab partner · birthday 14 Oct', [['THU', 'Coffee — talked about the lab groups'], ['2 OCT', 'Sent him the NumPy notes']], 'Omar’s page with two logged conversations'), flip: true },
      { eyebrow: 'Kept close', title: 'Not left lying around', text: 'Notes about people, like your journal, aren’t kept in the app’s offline cache on your device. They stay in your account. <a href="/privacy/">How your data is kept →</a>', art: img('seal-intact', 'A wax seal pressed with a fern', { w: 140 }) },
    ],
  }),
  pillarPage({
    slug: 'apps', title: 'One garden, three doors',
    lead: 'The web app, an Android app and a Windows app — the same days in all three, synced.',
    description: 'Kai’s Flow runs on the web (installable, works offline), as an Android app with home-screen widgets, and as a Windows app with a tray icon. Notifications on all three, on your own clock. Free everywhere.',
    shot: `<div style="margin-top:44px">${getIt({ big: true })}</div>`,
    sections: [
      { eyebrow: 'Web', title: 'Open it anywhere', text: 'It runs in any modern browser. Install it from the address bar in Chrome or Edge, or with Share → Add to Home Screen in Safari on an iPhone, and it gets its own window and works offline.', art: screen('today', 'Today, as the web app shows it on a phone', { s: 0.56 }) },
      { eyebrow: 'Android', title: 'In your pocket', text: 'The touch calendar, the swipes, the share sheet, widgets and notifications. Updates come as a new APK: Settings → App → Check for updates finds the latest one.', steps: ['<a href="/guides/install-android/">Install on Android</a> — about a minute.'], art: screen('calendar-phone', 'The touch calendar on Android', { s: 0.56 }), flip: true },
      { eyebrow: 'Widgets', title: 'The garden on your home screen', text: '34 Android widgets: Today, the Top 3 and the goal, capture, the calendar, focus, routines and streaks, the Inbox and Overdue, and the rituals. Tick tasks and routines, and stop or finish a focus round, right on the widget; capture opens straight to the keyboard.', steps: ['On most phones: hold an empty spot on the home screen → Widgets → Kai’s Flow.', 'They follow your phone’s dark mode. Settings → Notifications can hide task names on the home screen.'], art: art('wisteria-p40', 'A short spray of wisteria', 150) },
      { eyebrow: 'Windows', title: 'On your desk', text: 'A small installer that installs just for you, no admin password. It opens in its own window, with the same right-click menu and keyboard shortcuts as the web. A K sits by the clock: click it for a little flyout with what’s on now and next, your Top 3, quick capture and focus, or right-click it for a menu. Close the window and it waits there.', steps: ['<a href="/guides/install-windows/">Install on Windows</a>.', '<a href="/guides/keyboard-shortcuts/">The keyboard shortcuts</a>.'], art: `<div class="mini"><div class="mini-d dark"><span class="k">K</span><b style="display:inline">Installing Kai’s Flow…</b><div class="bar2"><i></i></div></div></div>`, flip: true },
      { eyebrow: 'Notifications', title: 'Reminders that arrive', text: 'Reminders, the morning digest and the evening nudge reach the Windows app, your Android phone, and the web app once you allow notifications. A reminder carries Done and Tomorrow, so you can answer it where it lands. Quiet hours keep the night quiet, and task names stay off the lock screen until you choose.', steps: ['Settings → Notifications → Send a test notification shows what’s in the way on this device.'], art: art('clover-awake', 'A small clover, awake', 140) },
      { eyebrow: 'Offline', title: 'Works without a signal', text: 'Changes you make offline wait in a queue on your device and sync when you’re back. Your journal and notes about people aren’t kept on the device.', art: img('fern-unfurl1', 'A fern frond unfurling', { w: 120 }), flip: true },
      { eyebrow: 'Your own clock', title: 'Wherever you are', text: 'Today, reminders, the morning digest — and what an AI assistant sees — follow your own time zone. The app offers your device’s zone once; change it any time in Settings → Time zone.', art: daisies },
    ],
    after: callout({ ic: 'chat', title: 'Your AI assistant, too', chip: '', text: 'Claude Desktop, Claude Code or any MCP client can read your tasks, projects and calendar — and add or tick off tasks only if you allow it. Your journal and people are never shared.', href: '/guides/connect-an-ai-assistant/', more: 'Connect one' }),
  }),
]

export const featurePages = [hub, ...pillars]
export { PILLARS }
