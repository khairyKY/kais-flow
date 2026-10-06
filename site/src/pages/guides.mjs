import { head2, icon, btn, kmark } from '../lib.mjs'
import { APP_URL, REPO, RELEASES_URL, LATEST, apkUrl, exeUrl } from '../data.mjs'

const UPDATED = '4 Oct 2026'
// small step pictures (tiny phone/desktop dialogs)
const pic = {
  apk: `<div class="mini" role="img" aria-label="A download notification: the APK finished downloading, with Open"><div class="mini-d"><b>kais-flow-<span data-release-tag>${LATEST.tag}</span>.apk</b>${LATEST.apkMB} MB · Download complete<div class="row" style="margin-top:6px"><span class="lnk">Open</span></div></div></div>`,
  allow: `<div class="mini" role="img" aria-label="Android’s Install unknown apps screen with Allow from this source turned on"><div class="mini-d"><div class="row">Install unknown apps</div><div class="row">Allow from this source<span class="tg"></span></div></div></div>`,
  install: `<div class="mini" role="img" aria-label="Android asking whether to install Kai’s Flow, with Cancel and Install"><div class="mini-d"><div class="row" style="justify-content:flex-start"><span class="k">K</span><b>Kai’s Flow</b></div><div class="row" style="justify-content:flex-end;gap:14px"><span class="lnk">Cancel</span><span class="lnk">Install</span></div></div></div>`,
  exe: `<div class="mini" role="img" aria-label="The installer file in Downloads"><div class="mini-d dark"><b>kais-flow-<span data-release-tag>${LATEST.tag}</span>-windows-setup.exe</b>Downloads · ${LATEST.exeMB} MB</div></div>`,
  smart: `<div class="mini" role="img" aria-label="Windows SmartScreen: Windows protected your PC, with More info and Run anyway"><div class="mini-d" style="background:#2b5797;color:#fff"><b>Windows protected your PC</b><span style="text-decoration:underline">More info</span><div class="row" style="justify-content:flex-end;margin-top:8px"><span style="border:1px solid #fff;padding:2px 8px">Run anyway</span></div></div></div>`,
  running: `<div class="mini" role="img" aria-label="The Kai’s Flow installer running"><div class="mini-d dark"><span class="k">K</span><b style="display:inline">Installing Kai’s Flow…</b><div class="bar2"><i></i></div></div></div>`,
}
const kbd = (k) => k.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`

const GUIDES = [
  { slug: 'getting-started', group: 'Start here', ic: 'sprout', title: 'Getting started', blurb: 'Your first day, in ten minutes.', min: 5,
    intro: 'Kai’s Flow is one page for your day. Here is the shape of it, from signing up to closing the garden at night.',
    sections: [
      ['sign-up', 'Make an account', `<p>Open <a href="${APP_URL}">the app</a> and sign up with your email and a password. If an email asks you to confirm, tap the link in it. The same account works on the web, on Android and on Windows.</p>`],
      ['first-three', 'Your first three things', '<p>The first run asks for three things you want to do. They become your Top 3 for today, and you land on Today with them waiting.</p>'],
      ['plan', 'Plan my day, each morning', '<p>Plan my day takes about three minutes: pick your Top 3 from everything you have, star one as the goal, and keep or move the suggested times. <a href="/features/plan-and-today/">More about Plan & Today</a>.</p>'],
      ['capture', 'Catch things as they come', '<p>Tap the round button to type a thought, or hold it to talk. Dates like “Friday 5pm” are picked out for you, and everything waits in the Inbox until you sort it. <a href="/guides/capture-from-anywhere/">Capture from anywhere</a>.</p>'],
      ['shut-down', 'Shut down in the evening', '<p>From five in the evening, Shut down offers to close the day: tick what’s done, move what isn’t, and choose tomorrow’s three.</p>'],
      ['next', 'Where to go next', '<ul><li><a href="/guides/install-android/">Install on Android</a> or <a href="/guides/install-windows/">on Windows</a>.</li><li><a href="/guides/import/">Bring your old app’s tasks with you</a>.</li><li><a href="/guides/gestures/">Gestures</a> and <a href="/guides/keyboard-shortcuts/">keyboard shortcuts</a>.</li></ul>'],
    ] },
  { slug: 'import', group: 'Start here', ic: 'download', title: 'Import your old app', blurb: 'Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle, Goodreads.', min: 4,
    intro: 'Bring your tasks, projects and books with you. The file is read on your own device, and importing the same file twice doesn’t make doubles.',
    sections: [
      ['open', 'Open the importer', '<p>In the app, go to <b>Settings → Import data → Open importer</b>. Pick where you’re coming from, choose the file, check the preview, and import. There’s an Undo if it isn’t what you wanted.</p>'],
      ['files', 'Which file each app needs', table(['From', 'The file', 'Where to get it'], [
        ['Todoist', '<code>.csv</code>, one per project', 'Open a project → ⋯ → Export as a template → Download CSV. Several at once is fine.'],
        ['TickTick', 'backup <code>.csv</code>', 'TickTick on the web: Settings → Account → Backup & Restore → Generate backup.'],
        ['Notion', 'database <code>.csv</code>', 'Open the database → ⋯ → Export → Markdown & CSV, unzip, pick the .csv. You check the columns next.'],
        ['Obsidian / Markdown', '<code>.md</code> files or a vault folder', 'No export needed. Every “- [ ]” line becomes a task.'],
        ['Kindle highlights', '<code>My Clippings.txt</code>', 'Plug the Kindle in by USB, open its drive → documents → My Clippings.txt.'],
        ['Goodreads', 'library <code>.csv</code>', 'My Books → Import and export → Export Library, then download the .csv.'],
        ['Akiflow', '<code>akiflow-dump.json</code>', 'Akiflow has no export button, so the importer reads a JSON dump of your account. <span class="todo">[Kai writes this: how to make the dump]</span>'],
        ['Anything else', '<code>.csv</code> with a header row', 'Choose Generic CSV and match the columns yourself.'],
      ])],
      ['what-comes', 'What comes with it', '<p>Titles, notes, due dates, projects, labels and, where the app exports them, durations, priorities, subtasks and repeats. Books bring their highlights and reviews. Anything the importer can’t place is kept with the task, so nothing is thrown away.</p>'],
    ] },
  { slug: 'gestures', group: 'Using it', ic: 'menu', title: 'Gestures', blurb: 'Swipe, hold and ⋯ — every gesture has a tap.', min: 3,
    intro: 'On a phone, the fastest way through a list is your thumb. Every gesture also has a tap in the ⋯ menu, so nothing is hidden behind one.',
    sections: [
      ['rows', 'On a task row', table(['Gesture', 'What it does'], [
        ['Swipe right', 'Shows Tomorrow · Pick date · Project. Swipe past about 40% and it moves to <b>09:00 tomorrow</b>.'],
        ['Swipe left', 'Moves it to the Trash, with <b>Undo</b>. No “are you sure”.'],
        ['Hold', 'Selects the row and opens a bar for doing several at once.'],
        ['⋯', 'Every action for that task — the same list a right-click shows on a computer.'],
      ])],
      ['calendar', 'On the phone calendar', table(['Gesture', 'What it does'], [
        ['Swipe sideways', 'The next or previous days.'],
        ['Tap a gap', 'Make a new block there.'],
        ['Hold a block', 'Lifts it, with a bubble showing the time. Drop it somewhere else.'],
        ['Drag a handle', 'Makes it longer or shorter. Everything snaps to 15 minutes.'],
      ])],
      ['capture', 'The round button', '<p><b>Tap</b> to type a capture. <b>Hold</b> to talk instead.</p>'],
    ] },
  { slug: 'keyboard-shortcuts', group: 'Using it', ic: 'keyboard', title: 'Keyboard shortcuts', blurb: 'N, ?, ⌘K and the rest.', min: 2,
    intro: 'On a computer, Kai’s Flow can be driven from the keyboard. Press ? in the app to see this list any time.',
    sections: [
      ['everywhere', 'Everywhere', table(['Keys', 'Does'], [[kbd('⌘/Ctrl K'), 'Command bar'], [kbd('⌘/Ctrl /'), 'Search'], [kbd('⌘/Ctrl J'), 'Chat'], [kbd('n'), 'New task'], [kbd('?'), 'The shortcut list'], [kbd('Esc'), 'Close what’s open']])],
      ['tasks', 'In a task list', table(['Keys', 'Does'], [[kbd('j k'), 'Move up and down'], [kbd('e'), 'Complete'], [kbd('↵'), 'Open the task'], [kbd('t'), 'Add to or take off the Top 3'], [kbd('1 2 3'), 'Today · Tomorrow · Next week'], [kbd('p'), 'Move to a project'], [kbd('x'), 'Select several'], [kbd('Ctrl A'), 'Select all'], [kbd('#'), 'Delete']])],
      ['inbox', 'In the Inbox', table(['Keys', 'Does'], [[`${kbd('↑ ↓')} or ${kbd('j k')}`, 'Move up and down'], [kbd('e'), 'File it, with the AI’s suggestion'], [kbd('d'), 'Dismiss'], [kbd('s'), 'Snooze'], [kbd('↵'), 'Edit the title']])],
      ['command-bar', 'In the command bar', table(['Type', 'Does'], [[kbd('↵'), 'Quick add'], [kbd('⌘/Ctrl ↵'), 'Capture with the AI'], ['<code>!</code> <code>!!</code> <code>!!!</code>', 'Priority'], ['<code>#project</code>', 'Put it in a project'], ['<code>*label</code>', 'Add a label']])],
    ] },
  { slug: 'capture-from-anywhere', group: 'Using it', ic: 'mic', title: 'Capture from anywhere', blurb: 'The link, the share sheet, Shortcuts, Tasker.', min: 6,
    intro: 'Everything here lands in your Inbox, the same as a capture in the app. None of it costs anything or needs another account.',
    sections: [
      ['share', 'Android: the share sheet', '<p>Nothing to set up. In any app, tap <b>Share → Kai’s Flow</b> (the Android app or the web app installed from Chrome). You need to be signed in. Text and links work; photos come with Paper capture.</p>'],
      ['key', 'Your capture key and address', `<p>Everything else sends to one address with your own <b>capture key</b>.</p><ol><li>In the app: <b>Settings → External capture endpoint → Create key</b> (on a computer it’s under Settings → Integrations).</li><li>The key starts with <code>kf_</code> and is shown <b>once</b>. Copy it then; only a fingerprint of it is stored.</li><li>Under <b>How to send things here</b>, press <b>Copy address</b>.</li></ol><p>Keep the key in the <code>Authorization</code> header, never in the address. <b>New key</b> replaces it and <b>Turn off</b> deletes it. A leaked key can only add notes to your own Inbox, at most 200 a day.</p>`],
      ['iphone', 'iPhone and iPad: Shortcuts', '<ol><li>Shortcuts → <b>+</b> → name it “Add to Kai’s Flow”. In Details, turn on <b>Show in Share Sheet</b>.</li><li>Add <b>Get Contents of URL</b>: your address, Method <code>POST</code>, a header <code>Authorization</code> = <code>Bearer kf_…</code>, and a JSON body with a <code>text</code> field set to Shortcut Input.</li><li>Run it from the share sheet, the home screen, or Siri.</li></ol>'],
      ['android-auto', 'Android: HTTP Shortcuts or Tasker', '<p>For a home-screen button or a voice command, send a <code>POST</code> to your address with the header <code>Authorization: Bearer kf_…</code> and the body <code>{"text": "…"}</code>. HTTP Shortcuts (free, open source) and Tasker’s HTTP Request both do this.</p>'],
      ['bookmarklet', 'A desktop browser: the bookmarklet', '<p>Right after making a key, Settings offers <b>Copy bookmarklet</b>. Paste it as a new bookmark’s address. Clicking it sends the selected text (or the page title) and the page’s address.</p>'],
      ['curl', 'Scripts: curl or PowerShell', '<pre><code>curl -X POST https://&lt;project&gt;.supabase.co/functions/v1/capture \\\n  -H "Authorization: Bearer kf_…" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"text": "call the tyre supplier"}\'</code></pre><p>Add <code>?file=1</code> to the address to let the AI file it the next time the app is open. Without it, nothing you send touches the AI.</p>'],
    ] },
  { slug: 'install-android', group: 'Installing', ic: 'android', title: 'Install on Android', blurb: 'The APK, and the one “allow” step.', min: 4,
    intro: 'Kai’s Flow isn’t on the Play Store yet, so you install it yourself. It takes about a minute, and you only do the “allow” step once.',
    sections: [
      ['before', 'Before you start', `<p>You need an Android phone with a little room: the app is about ${LATEST.apkMB} MB.</p>`],
      ['download', 'Download the APK', `<p>On your phone, open <a href="/download/">the download page</a> and tap <b>Download APK</b>, or get <a href="${apkUrl(LATEST.tag)}" data-asset="apk">kais-flow-<span data-release-tag>${LATEST.tag}</span>.apk</a> straight from GitHub.</p>`, pic.apk],
      ['allow', 'Allow this one source', '<p>Android asks once whether your browser (or Files) may install apps. Turn on <b>Allow from this source</b>, then go back.</p>', pic.allow],
      ['install', 'Install and sign in', '<p>Tap <b>Install</b>, then <b>Open</b>. Sign in with the same account you use on the web; your days are already there. The first time you use voice capture, allow the microphone.</p>', pic.install],
      ['updating', 'Updating', '<p class="tip"><b>Updating:</b> Settings → App → Check for updates tells you when there’s a new version and downloads it. Install it over the old one, the same three steps.</p>'],
      ['trouble', 'If something goes wrong', '<p>If Android says the app <b>conflicts with an existing package</b>, that build was signed with a different key. Open the old app and check it says <b>Synced</b>, uninstall it, then install the new one. Nothing is lost — your data lives in your account. Reminders don’t come through the Android app yet; the web app installed from Chrome can send them.</p>'],
    ] },
  { slug: 'install-windows', group: 'Installing', ic: 'windows', title: 'Install on Windows', blurb: 'The installer, and the SmartScreen step.', min: 3,
    intro: 'The Windows app is the same Kai’s Flow in its own window. It installs just for you, so it never asks for an admin password.',
    sections: [
      ['download', 'Download the installer', `<p>Get it from <a href="/download/">the download page</a>, or <a href="${exeUrl(LATEST.tag)}" data-asset="exe">kais-flow-<span data-release-tag>${LATEST.tag}</span>-windows-setup.exe</a> from GitHub. It’s about ${LATEST.exeMB} MB and runs on Windows 10 and 11.</p>`, pic.exe],
      ['smartscreen', 'Say yes to SmartScreen', '<p>The installer isn’t code-signed (that costs money), so Windows may say <b>“Windows protected your PC”</b>. Click <b>More info → Run anyway</b>.</p>', pic.smart],
      ['run', 'Run it', '<p>It installs for you only — no admin needed. Then open <b>Kai’s Flow</b> from the Start menu and sign in.</p>', pic.running],
      ['updating', 'Updating and removing', '<p class="tip"><b>Updating:</b> Settings → App → Check for updates tells you when there’s a new version. Install it the same way.</p><p>To remove it: Windows Settings → Apps → Kai’s Flow → Uninstall. Your data stays in your account.</p>'],
    ] },
  { slug: 'your-data', group: 'Your data', ic: 'lock', title: 'Your data & privacy', blurb: 'Export, delete, and what the AI sees.', min: 3,
    intro: 'The short version of the privacy policy, with the practical bits: where your days live, what the AI sees, and how to take it all back.',
    sections: [
      ['where', 'Where it lives', '<p>Your account and everything you write are stored in a Supabase database in the EU (Frankfurt). Each account can only read its own rows. The app keeps a copy of your tasks and plans on your device so it works offline; your journal and notes about people are not kept in that copy.</p>'],
      ['ai', 'What the AI sees', '<p>Only what you send it on purpose: an AI capture, a voice note, a message in chat (with the items it looks up to answer you). It goes to Groq, which doesn’t train on it and, with zero data retention, keeps nothing after replying. A plain capture never touches the AI.</p>'],
      ['take', 'Getting a copy, or leaving', `<p>There’s no one-tap export yet. Write to the address on the <a href="/privacy/#contact">privacy page</a> and you’ll get everything you’ve written, or your account and all of it deleted.</p>`],
      ['more', 'The whole policy', '<p><a href="/privacy/">Read the privacy policy</a> — it’s short.</p>'],
    ] },
]
const GROUPS = ['Start here', 'Using it', 'Installing', 'Your data']

const index = {
  path: '/guides/',
  title: 'Guides',
  description: 'Help for Kai’s Flow: getting started, installing on Android and Windows, capture from anywhere, importing your old app, gestures, keyboard shortcuts and your data.',
  og: 'guides',
  body: `<section class="sec first"><div class="wrap">
  <div class="head" style="margin-inline:auto;text-align:center;align-items:center"><span class="eyebrow">Guides</span><h1>How can we help?</h1></div>
  <div class="gsearch" role="search"><label class="sr" for="guide-q">Search the guides</label>${icon('search', 20)}<input id="guide-q" type="search" placeholder="Search the guides — “install”, “import”, “swipe”…" autocomplete="off"></div>
  <div class="gcols">${GROUPS.map((g) => `<div class="gcol"><h2>${g}</h2><ul>${GUIDES.filter((x) => x.group === g).map((x) => `<li data-guide="${(x.title + ' ' + x.blurb + ' ' + x.sections.map((s) => s[1]).join(' ')).toLowerCase().replace(/"/g, '')}"><a class="card gcard" href="/guides/${x.slug}/">${icon(x.ic, 20)}<div><b>${x.title}</b><span>${x.blurb}</span></div></a></li>`).join('')}</ul></div>`).join('')}</div>
  <p class="gnone" hidden>Nothing matched. Try one word, or <a href="/privacy/#contact">ask us</a>.</p>
</div></section>`,
}

const feedback = (t) => `${REPO}/issues/new?title=${encodeURIComponent(`Guide feedback: ${t}`)}`
const article = (g) => { let n = 0; const num = g.sections.map((s) => (s[3] ? ++n : 0)); return {
  path: `/guides/${g.slug}/`,
  title: g.title,
  description: `${g.blurb} ${g.intro}`.slice(0, 300),
  og: `guide-${g.slug}`,
  body: `<div class="wrap article">
  <nav class="toc" aria-label="On this page"><span class="eyebrow faint">On this page</span><ol>${g.sections.map(([id, t], i) => `<li><a href="#${id}">${num[i] ? `${num[i]} · ` : ''}${t}</a></li>`).join('')}</ol></nav>
  <article class="prose">
    <p class="crumbs" style="text-transform:none;letter-spacing:0;font-family:var(--font-ui);font-size:13px"><a href="/guides/">Guides</a> › ${g.group}</p>
    <h1>${g.title}</h1>
    <p class="meta">${g.min} min · updated ${UPDATED}</p>
    <p class="intro">${g.intro}</p>
    ${g.sections.map(([id, t, html, p], i) => p
      ? `<section class="astep"><div><h2 id="${id}"><small>${num[i]}</small>${t}</h2>${html}</div>${p}</section>`
      : `<section><h2 id="${id}">${t}</h2>${html}</section>`).join('\n    ')}
    <p class="helpful">Was this helpful? <a href="${feedback(g.title + ' — yes')}">Yes</a><a href="${feedback(g.title + ' — not really')}">Not really</a></p>
  </article>
</div>`,
} }

export const guidePages = [index, ...GUIDES.map(article)]
export { GUIDES }
