// Sections that appear on more than one page.
import { icon, img, btn, soon } from './lib.mjs'
import { APP_URL, LATEST, apkUrl, exeUrl, longDate } from './data.mjs'

// ── "Get it": web / Android / Windows ── the version is filled in live by site.js
const ver = () => `<span class="ver"><span data-release-tag>${LATEST.tag}</span> · <span data-release-date>${longDate(LATEST.date)}</span></span>`
export const getIt = ({ big = false } = {}) => `<div class="getit${big ? ' big' : ''}" data-release>
  <div class="card get"><div class="get-h"><span class="get-ic">${icon('globe', 26)}</span><div><h3>Web</h3>${ver()}</div></div>
    <p>Open it in any browser. Install it from the address bar to get its own window and offline use.</p>
    <div class="act">${btn('Open in browser', APP_URL)}</div></div>
  <div class="card get"><div class="get-h"><span class="get-ic">${icon('android', 26)}</span><div><h3>Android</h3>${ver()}</div></div>
    <p>An APK from our GitHub releases, about ${LATEST.apkMB} MB.</p>
    <p class="small">Your phone will ask once to allow installs from your browser — say yes, then install.</p>
    <div class="act">${btn('Download APK', apkUrl(LATEST.tag), { kind: 'secondary', attrs: 'data-asset="apk"' })}</div></div>
  <div class="card get"><div class="get-h"><span class="get-ic">${icon('windows', 26)}</span><div><h3>Windows</h3>${ver()}</div></div>
    <p>An installer for Windows 10 and 11, about ${LATEST.exeMB} MB. It installs just for you, so no admin password.</p>
    <div class="act">${btn('Download for Windows', exeUrl(LATEST.tag), { kind: 'secondary', attrs: 'data-asset="exe"' })}</div></div>
</div>`

// ── the eight things inside ──
export const FEATURES = [
  ['mic', 't-terra', 'Capture in two taps', 'Say it or type it. “Call Omar Friday 5pm” lands with the date already set.', '/features/capture/'],
  ['calendar', 't-lav', 'Your calendar, with time blocks', 'Drag tasks onto the day, in 15-minute steps. Google Calendar sync is on its way.', '/features/calendar/'],
  ['routine', 't-sage', 'Routines and streaks', 'Small daily habits, with a streak that forgives a missed day.', '/features/rituals/'],
  ['star', 't-terra', 'Top 3', 'Three things that make today a good day. One is the goal.', '/features/plan-and-today/'],
  ['journal', 't-butter', 'Journal and herbarium', 'Write the day down. Finished projects are pressed like flowers.', '/features/journal/'],
  ['people', 't-blossom', 'People', 'Birthdays, the last time you spoke, and notes on each person.', '/features/people/'],
  ['download', 't-hyd', 'Bring your lists', 'Import from Todoist, TickTick, Notion, Obsidian or Akiflow.', '/integrations/'],
  ['notebook', 't-butter', 'Notebook page and paper capture', 'Copy your day into a notebook, then photograph it back into tasks.', '/paper/', true],
]
export const fcell = ([ic, tone, title, line, href, isSoon], { link = false, more = '' } = {}) => `<div class="fcell"><span class="dot ${tone}">${icon(ic)}</span>
  <div class="fcell-t"><h3>${title}</h3>${isSoon ? soon() : ''}</div><p>${line}</p>${link ? `<a class="go" href="${href}">${more || title} →</a>` : ''}</div>`

// ── paper: the app's Notebook page beside a real notebook ──
export const notebookPage = () => `<div class="npage" role="img" aria-label="The Notebook page for Saturday 3 October: data, Top 3, schedule and tasks, laid out to copy by hand">
  ${img('fern-unfurl2', '', { w: 60, cls: 'fern' })}
  <div class="npage-d">Saturday, 3 October</div><div class="npage-m">Day 84 · 23° mostly clear</div>
  <div class="npage-h">Data</div>
  <div class="npage-r"><span class="k">Sleep</span><span class="line"></span> h</div>
  <div class="npage-r"><span class="k">Mood</span><span class="o"></span><span class="o"></span><span class="o"></span><span class="o"></span><span class="o"></span></div>
  <div class="npage-h">Top 3</div>
  <div class="npage-r"><span class="sq"></span><span class="star">✶</span>GCI homework 1 — NumPy</div>
  <div class="npage-r"><span class="sq"></span>Do GCI lecture 2’s survey</div>
  <div class="npage-r"><span class="sq"></span>Skim OS lectures 1 + 2</div>
  <div class="npage-h">Schedule</div>
  <div class="npage-r"><span class="t">09:00</span>Judge test</div>
  <div class="npage-r"><span class="t">13:30–15:00</span>GCI homework</div>
  <div class="npage-h">Tasks</div>
  <div class="npage-r"><span class="sq"></span>Shower + breakfast</div>
  <div class="npage-r"><span class="sq"></span>Reply to Omar</div>
  <div class="npage-r"><span class="sq"></span>Water the plants</div>
  <div class="npage-f"><span class="hand">written by hand ✿</span><span class="mono">kf·1003·a</span></div>
</div>`
export const linedPage = (cls = '') => `<div class="lined ${cls}" role="img" aria-label="The same day copied by hand into a lined notebook, with most boxes ticked"><div class="lined-in">
  <div class="u">Sat 3 Oct — Day 84</div><div>sleep 7½ h · mood ●●●●○</div><div>☑ ✶ GCI homework 1 — NumPy</div><div>☑ GCI lecture 2 survey</div>
  <div>☐ Skim OS lectures 1 + 2</div><div class="s">09:00 judge test · 13:30 GCI · 18:00 gym</div><div>☑ Shower + breakfast</div><div>☑ Reply to Omar</div>
  <div>☐ Water the plants</div><div class="x">→ call Omar back re Thursday</div></div></div>`
export const papers = () => `<div class="papers">
  <div class="npage-wrap">${notebookPage()}</div>
  <div class="lined-wrap">${linedPage()}</div>
  <span class="papers-hand" aria-hidden="true">the app → your notebook → the app</span>
</div>`

// ── private by default ──
export const promises = () => `<div>
  <div class="promise"><span class="ring">${icon('lock', 22)}</span><div><h3>No ads, no selling data</h3><p>There is nothing to sell. No trackers, no analytics scripts, no cookie banner.</p></div></div>
  <div class="promise"><span class="ring">${icon('up', 22)}</span><div><h3>AI that forgets</h3><p>Capture and chat use Groq, an AI provider that doesn’t train on your words and, with zero data retention, keeps nothing after replying.</p></div></div>
  <div class="promise"><span class="ring">${icon('download', 22)}</span><div><h3>Yours to take</h3><p>Your days belong to you. Ask, and we’ll send you everything you’ve written, or delete your account and all of it.</p></div></div>
  <a class="more" href="/privacy/">Read the privacy policy →</a>
</div>`
