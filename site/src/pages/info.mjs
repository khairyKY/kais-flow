import { img, head2, icon, btn, kmark, kai, contact, screen, tape } from '../lib.mjs'
import { getIt } from '../parts.mjs'
import { APP_URL, REPO, RELEASES_URL, LATEST, longDate } from '../data.mjs'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// ── download ──
const mini = (aria, inner, dark = false) => `<div class="mini" role="img" aria-label="${aria}"><div class="mini-d${dark ? ' dark' : ''}">${inner}</div></div>`
const istep = (n, title, text, picture) => `<div class="istep">${picture}<h3><span>${n}</span>${title}</h3><p>${text}</p></div>`
const download = {
  path: '/download/',
  title: 'Download',
  description: `Get Kai’s Flow free on the web, Android (APK) and Windows (installer). Latest version ${LATEST.tag}, with install steps.`,
  og: 'download',
  body: `<section class="sec first"><div class="wrap" data-release>
  ${head2({ eyebrow: 'Download', title: 'Get Kai’s Flow', lead: `Latest version <span data-release-tag>${LATEST.tag}</span>, released <span data-release-date>${longDate(LATEST.date)}</span>. Free on every platform.`, h: 'h1' })}
  ${getIt({ big: true })}
</div></section>
<section class="sec" id="android"><div class="wrap">
  <div class="ihead">${icon('android', 28)}<h2>Installing on Android</h2></div>
  <div class="isteps">
    ${istep(1, 'Download the APK', 'Tap Download APK on your phone.', mini('A download notification for the Kai’s Flow APK', `<b>kais-flow-<span data-release-tag>${LATEST.tag}</span>.apk</b>${LATEST.apkMB} MB · Download complete<div class="row" style="margin-top:6px"><span class="lnk">Open</span></div>`))}
    ${istep(2, 'Allow this one source', 'Android asks once. Turn on “Allow from this source”.', mini('Install unknown apps, with Allow from this source switched on', '<div class="row">Install unknown apps</div><div class="row">Allow from this source<span class="tg"></span></div>'))}
    ${istep(3, 'Install and open', 'Tap Install. Sign in with the same account as the web.', mini('Android asking to install Kai’s Flow', '<div class="row" style="justify-content:flex-start"><span class="k">K</span><b>Kai’s Flow</b></div><div class="row" style="justify-content:flex-end;gap:14px"><span class="lnk">Cancel</span><span class="lnk">Install</span></div>'))}
  </div>
  <p style="margin-top:20px"><a class="more" href="/guides/install-android/">The full Android guide →</a></p>
</div></section>
<section class="sec" id="windows"><div class="wrap">
  <div class="ihead">${icon('windows', 28)}<h2>Installing on Windows</h2></div>
  <div class="isteps">
    ${istep(1, 'Download the installer', `About ${LATEST.exeMB} MB, for Windows 10 and 11.`, mini('The installer in Downloads', `<b>kais-flow-<span data-release-tag>${LATEST.tag}</span>-windows-setup.exe</b>Downloads · ${LATEST.exeMB} MB`, true))}
    ${istep(2, 'Say yes to SmartScreen', 'It isn’t code-signed yet, so Windows may warn you: More info → Run anyway.', mini('Windows SmartScreen with Run anyway', '<b>Windows protected your PC</b><span style="text-decoration:underline">More info</span><div class="row" style="justify-content:flex-end;margin-top:8px"><span style="border:1px solid currentColor;padding:2px 8px">Run anyway</span></div>', true))}
    ${istep(3, 'Run it', 'It installs for you only — no admin password. Then open it from the Start menu.', mini('The Kai’s Flow installer running', '<span class="k">K</span><b style="display:inline">Installing Kai’s Flow…</b><div class="bar2"><i></i></div>', true))}
  </div>
  <p style="margin-top:20px"><a class="more" href="/guides/install-windows/">The full Windows guide →</a></p>
</div></section>
<section class="sec"><div class="wrap dlfoot">
  <p>Older versions: <a href="${RELEASES_URL}">GitHub releases</a></p>
  <p>iPhone: use the web app in Safari and add it to your home screen.</p>
</div></section>`,
}

// ── privacy (a book chapter) ──
const clause = (n, id, title, body, aside, cls = '') => `<section class="clause" aria-labelledby="${id}"><div><h2 id="${id}"><small>§${n}</small>${title}</h2>${body.replace('<p>', `<p class="${cls}">`)}</div><p class="aside">${aside}</p></section>`
const privacy = {
  path: '/privacy/',
  title: 'Privacy policy',
  description: 'What Kai’s Flow keeps, who else sees any of it, what the AI sees, and how to take it all back. No ads, no tracking, no selling data.',
  og: 'privacy',
  body: `<div class="chapter"><div class="wrap"><div class="chapter-in">
  ${head2({ eyebrow: 'Privacy policy · updated 4 Oct 2026', title: 'What happens to your days', lead: 'Kai’s Flow is a journal. This page says, in plain words, what it keeps, who else sees any of it, and how to take it all back.', h: 'h1', tone: 'faint' })}
  ${img('vine-leaf-right', 'A single pressed leaf', { w: 52, cls: 'leaf' })}
  ${clause(1, 'keep', 'What we keep', `<p>Your account email, and what you put in the app: tasks, projects, calendar blocks, routines, your journal, the people you add, books, notes and quotes. It lives in a database run by Supabase, in the EU (Frankfurt). Each account can read only its own rows. We open the database only to keep the service running, or when you ask us to.</p>
    <p>The app also keeps a working copy of your tasks and plans on your device so it opens and works offline. Your journal, notes about people and the Trash are left out of that copy.</p>
    <p>When a new version of the app is released, a copy of the database is saved to private storage in case something goes wrong. Something you delete can stay in those copies until they are cleared. ${'<span class="todo">[Kai: decide how long backups are kept, and say it here]</span>'}</p>`, 'In short: your email and your days, in the EU.', 'dropcap')}
  ${clause(2, 'ai', 'What the AI sees', `<p>Only what you send it on purpose: a capture you ask the AI to file, a voice note, or a message in chat (with the items from your account it looks up to answer you). We send it to Groq, which doesn’t train on it and, with zero data retention, keeps nothing after replying. Search inside the app runs in our own database, not through an AI company. A plain capture, and everything else in your account, never goes to any AI.</p>`, 'Only what you hand it, and it forgets.')}
  ${clause(3, 'google', 'Google Calendar', `<p>Kai’s Flow doesn’t connect to Google Calendar yet. When it does, and only if you connect it, we will read your events to show them beside your tasks and write the time blocks you ask us to. We won’t use your calendar for anything else, sell it, or show it to anyone, and you’ll be able to disconnect it any time from Settings. Kai’s Flow’s use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.</p>`, 'Read to show, write when asked.')}
  ${clause(4, 'never', 'What we never do', `<p>No ads. No selling or sharing your data. No tracking, analytics or fingerprinting, in the app or on this site. This site sets no cookies; the app keeps you signed in with your browser’s own storage.</p>
    <p>To work at all, a few services see a little: Cloudflare serves the app and this site, and sees your IP address like any web host. This site loads its fonts from Google Fonts and asks GitHub for the newest version number, so your browser talks to those two as well.</p>`, 'Nothing to sell.')}
  ${clause(5, 'leaving', 'Taking it with you, or leaving', `<p>There’s no export button yet. Write to us and we’ll send you everything you’ve written, as plain files — or delete your account and everything in it from the database. Things you put in the Trash are deleted for good after 30 days.</p>`, 'Ask, and it’s yours. Or gone.')}
  ${clause(6, 'contact', 'Talking to us', `<p>Write to ${contact()}. Kai’s Flow is made by one person, Kai, and he reads every message. If this policy changes, the date at the top changes and Field notes says what moved.</p>`, 'A person answers.')}
</div></div></div>`,
}

// ── terms ──
const terms = {
  path: '/terms/',
  title: 'Terms',
  description: 'The short terms for using Kai’s Flow: free for your own days, your content is yours, no warranty.',
  og: 'terms',
  body: `<div class="chapter"><div class="wrap"><div class="chapter-in" style="max-width:680px">
  ${head2({ eyebrow: 'Terms · updated 4 Oct 2026', title: 'The short terms', lead: 'Five things, so it fits on one page.', h: 'h1', tone: 'faint' })}
  <ol class="terms">
    <li><div><h2>Using it</h2><p>Kai’s Flow is free to use for your own days. Please don’t use it to break the law, or to harm the service or other people.</p></div></li>
    <li><div><h2>Your content</h2><p>What you write is yours. We store it only to run the app for you, as the <a href="/privacy/">privacy policy</a> explains.</p></div></li>
    <li><div><h2>No warranty</h2><p>We look after it carefully, but it comes as it is. Keep your own copy of anything you can’t lose.</p></div></li>
    <li><div><h2>Changes</h2><p>If these terms change, the date at the top changes and Field notes says so, before the new terms apply.</p></div></li>
    <li><div><h2>Ending</h2><p>You can stop and have your account deleted any time. We may close accounts that abuse the service.</p></div></li>
  </ol>
  <p style="margin-top:40px;font-size:15px" class="muted">Questions: ${contact()}</p>
</div></div></div>`,
}

// ── about ──
const about = {
  path: '/about/',
  title: 'About',
  description: 'Why Kai’s Flow exists: a student’s field journal of days, built for himself first.',
  og: 'about',
  body: `<section class="sec first"><div class="wrap about">
  <div><div class="photo" role="img" aria-label="An empty photo slot: Kai at his desk, notebook open">${tape('gold', -4)}${icon('camera', 24)}<span>Photo slot · Kai at his desk, notebook open</span><span class="eyebrow faint">4 : 5 · 1200 × 1500</span></div>
    <p style="margin-top:14px">${kai('a caption for the photo')}</p></div>
  <div>
    ${head2({ eyebrow: 'About', title: 'Why I built this', h: 'h1' })}
    <div class="story-copy">
      <p>${kai('the moment it started — the app that overwhelmed you, the notebook that didn’t')}</p>
      <p>${kai('what a good day looks like for you, and what the app does about it')}</p>
      <p>${kai('why it looks like a field journal, and why it’s free')}</p>
      <p>${kai('what you’d like people to tell you')}</p>
      <p class="sig">— Kai</p>
    </div>
    <div class="btns" style="margin-top:28px">${btn('Open the app', APP_URL)}${btn('Field notes', '/field-notes/', { kind: 'secondary' })}</div>
  </div>
</div></section>`,
}

// ── press kit ──
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ZIP = 'public/press/kais-flow-press-kit.zip'
const zipMB = fs.existsSync(ROOT + ZIP) ? (fs.statSync(ROOT + ZIP).size / 1048576).toFixed(1) : '?'
const SWATCHES = [['Linen', '#EFE9DB'], ['Parchment', '#FBF6E9'], ['Bark ink', '#2A2420'], ['Terra ink', '#9C5139'], ['Sage', '#8A9A7E'], ['Lavender', '#A8A0BE'], ['Hydrangea', '#9AB4BE'], ['Blossom', '#D4A8B0']]
const SHOTS = [['today', 'Today · phone'], ['plan', 'Plan my day · phone'], ['calendar-phone', 'Calendar · phone'], ['voice', 'Capture by voice'], ['shutdown', 'Shut down'], ['calendar-week', 'Week calendar · desktop']]
const press = {
  path: '/press/',
  title: 'Press kit',
  description: 'The Kai’s Flow press kit: the K mark, colours, type, screenshots and a one-paragraph description, as a zip.',
  og: 'press',
  body: `<section class="sec first"><div class="wrap split even" style="align-items:end">
  ${head2({ eyebrow: 'Press kit', title: 'Everything you need to write about it', lead: 'Kai’s Flow is a free personal planner that looks and feels like a 19th-century botanical field journal. It brings tasks, time blocks, habits and a journal into one calm page, and works on the web, Android and Windows. It’s made by one student, Kai, who built it for himself first.', h: 'h1' })}
  <div style="display:flex;justify-content:flex-end">${btn(`Download press kit (.zip, ${zipMB} MB)`, '/press/kais-flow-press-kit.zip', { ic: 'zip', attrs: 'download' })}</div>
</div></section>
<section class="sec"><div class="wrap press-grid">
  <div><span class="eyebrow faint">The mark</span><div class="marks" style="margin-top:14px"><div class="markbox">${kmark(80)}</div><div class="markbox darkbox">${kmark(80)}</div></div>
    <p class="note">PNG at 1024 px, on light and dark. Please don’t recolour the K or the paper.</p></div>
  <div><span class="eyebrow faint">Type</span><div class="types" style="margin-top:14px">
    <div><span style="font-family:var(--font-display);font-size:24px">Source Serif 4</span><small>Headings and the page</small></div>
    <div><span style="font-size:19px">Inter Tight</span><small>Interface</small></div>
    <div><span style="font-family:var(--font-mono);font-size:16px">Courier Prime</span><small>Captions and times</small></div>
    <div><span style="font-family:var(--font-hand);font-size:24px">Caveat</span><small>Notes in the margin</small></div></div></div>
</div></section>
<section class="sec"><div class="wrap">
  <span class="eyebrow faint">Colours</span>
  <div class="swatches" style="margin-top:14px">${SWATCHES.map(([n, h]) => `<div class="sw"><i style="background:${h}"></i><b>${n}</b><code>${h}</code></div>`).join('')}</div>
</div></section>
<section class="sec"><div class="wrap">
  <span class="eyebrow faint">Screenshots · ${SHOTS.length}</span>
  <div class="shots6" style="margin-top:14px">${SHOTS.map(([s, cap]) => `<figure>${screen(s, cap, { s: s === 'calendar-week' ? 0.2 : 0.42 })}<figcaption>${cap}</figcaption></figure>`).join('')}</div>
  <p class="note">The zip has each one as a PNG at twice this size, plus the mark and this page’s words.</p>
</div></section>`,
}

// ── 404 ──
const notFound = {
  path: '/404',
  title: 'Not found',
  description: 'This page didn’t take root.',
  og: 'home',
  body: `<section class="wrap lost">
  ${img('clover-seedling', 'A small seedling, looking a little lost', { w: 120, eager: true })}
  <span class="eyebrow faint" style="letter-spacing:.3em">404</span>
  <h1>This page didn’t take root.</h1>
  <p>It may have moved, or it never grew here. Try the start, or the guides.</p>
  <div class="btns">${btn('Home', '/', { size: 'lg' })}${btn('Guides', '/guides/', { kind: 'secondary', size: 'lg' })}</div>
</section>`,
}

export const infoPages = [download, privacy, terms, about, press, notFound]
