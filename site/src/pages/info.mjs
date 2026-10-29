import { img, head2, icon, btn, kmark, kai, contact, screen, tape } from '../lib.mjs'
import { getIt } from '../parts.mjs'
import { APP_URL, REPO, RELEASES_URL, LATEST, longDate } from '../data.mjs'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// ── download ──
const mini = (aria, inner, dark = false) => `<div class="mini" role="img" aria-label="${aria}"><div class="mini-d${dark ? ' dark' : ''}">${inner}</div></div>`
const istep = (n, title, text, picture) => `<div class="istep">${picture}<h3><span aria-hidden="true">${n}</span>${title}</h3><p>${text}</p></div>`
const download = {
  path: '/download/',
  title: 'Download',
  description: `Get Kai’s Flow free on the web, Android (APK), Windows (installer) and Mac (.dmg). Latest version ${LATEST.tag}, with install steps.`,
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
  <p style="margin-top:20px"><a class="more" href="/guides/install-android/">The full Android guide</a></p>
</div></section>
<section class="sec" id="windows"><div class="wrap">
  <div class="ihead">${icon('windows', 28)}<h2>Installing on Windows</h2></div>
  <div class="isteps">
    ${istep(1, 'Download the installer', `About ${LATEST.exeMB} MB, for Windows 10 and 11.`, mini('The installer in Downloads', `<b>kais-flow-<span data-release-tag>${LATEST.tag}</span>-windows-setup.exe</b>Downloads · ${LATEST.exeMB} MB`, true))}
    ${istep(2, 'Say yes to SmartScreen', 'It isn’t code-signed yet, so Windows may warn you: More info → Run anyway. Only this once: updates install themselves.', mini('Windows SmartScreen with Run anyway', '<b>Windows protected your PC</b><span style="text-decoration:underline">More info</span><div class="row" style="justify-content:flex-end;margin-top:8px"><span style="border:1px solid currentColor;padding:2px 8px">Run anyway</span></div>', true))}
    ${istep(3, 'Run it', 'It installs for you only — no admin password. Then open it from the Start menu.', mini('The Kai’s Flow installer running', '<span class="k">K</span><b style="display:inline">Installing Kai’s Flow…</b><div class="bar2"><i></i></div>', true))}
  </div>
  <p style="margin-top:20px"><a class="more" href="/guides/install-windows/">The full Windows guide</a></p>
</div></section>
<section class="sec" id="mac"><div class="wrap">
  <div class="ihead">${icon('laptop', 28)}<h2>Installing on Mac</h2></div>
  <div class="isteps">
    ${istep(1, 'Drag it to Applications', `Open the .dmg (about ${LATEST.dmgMB} MB) and drag Kai’s Flow onto Applications. One file for Apple silicon and Intel.`, mini('The disk image: Kai’s Flow beside the Applications folder', '<div class="row"><span class="k">K</span><b style="display:inline">Kai’s Flow</b><span>→</span><b style="display:inline">Applications</b></div>'))}
    ${istep(2, 'Open it once', 'Double-click it in Applications. The first time, macOS stops it with “Kai’s Flow Not Opened”, because it isn’t notarized by Apple (that costs money). Click Done.', mini('macOS: Kai’s Flow Not Opened, with Move to Trash and Done', '<b>“Kai’s Flow” Not Opened</b><div class="row" style="justify-content:flex-end;gap:14px;margin-top:8px"><span class="lnk">Move to Trash</span><span class="lnk">Done</span></div>'))}
    ${istep(3, 'Open Anyway', 'System Settings → Privacy & Security, scroll down to Security: “Kai’s Flow was blocked”. Click Open Anyway, enter your password, then Open. Only this once: updates install themselves.', mini('Privacy and Security: Kai’s Flow was blocked, with Open Anyway', '<div class="row">“Kai’s Flow” was blocked to protect your Mac.</div><div class="row" style="justify-content:flex-end"><span style="border:1px solid currentColor;padding:2px 8px">Open Anyway</span></div>'))}
  </div>
  <p style="margin-top:20px"><a class="more" href="/guides/install-mac/">The full Mac guide</a></p>
</div></section>
<section class="sec"><div class="wrap dlfoot">
  <p>Older versions: <a href="${RELEASES_URL}">GitHub releases</a></p>
  <p>iPhone: use the web app in Safari and add it to your home screen.</p>
</div></section>`,
}

// The policies' dates: the versions the app asks people to agree to, read out of the one file that
// holds them (supabase/functions/_shared/legal.ts — docs/LEGAL.md says how to bump them).
const LEGAL_SRC = fs.readFileSync(new URL('../../../supabase/functions/_shared/legal.ts', import.meta.url), 'utf8')
const legalDate = (name) => {
  const m = LEGAL_SRC.match(new RegExp(`export const ${name} = '([0-9]{4}-[0-9]{2}-[0-9]{2})'`))
  if (!m) throw new Error(`${name} not found in supabase/functions/_shared/legal.ts`)
  return longDate(m[1])
}

// ── privacy (a book chapter) ──
const clause = (n, id, title, body, aside, cls = '') => `<section class="clause" aria-labelledby="${id}"><div><h2 id="${id}"><small>§${n}</small>${title}</h2>${body.replace('<p>', `<p class="${cls}">`)}</div><p class="aside">${aside}</p></section>`
const privacy = {
  path: '/privacy/',
  title: 'Privacy policy',
  description: 'What Kai’s Flow keeps, who else sees any of it, what the AI sees, where it travels, how long it stays, and how to take it all back. No ads, no tracking, no selling data.',
  og: 'privacy',
  body: `<div class="chapter"><div class="wrap"><div class="chapter-in">
  ${head2({ eyebrow: `Privacy policy · updated ${legalDate('PRIVACY_VERSION')}`, title: 'What happens to your days', lead: 'Kai’s Flow is a journal. This page says, in plain words, what it keeps, who else sees any of it, where it travels, and how to take it all back.', h: 'h1', tone: 'faint' })}
  ${img('vine-leaf-right', 'A single pressed leaf', { w: 52, cls: 'leaf' })}
  ${clause(1, 'who', 'Who looks after it', `<p>Kai’s Flow is made and run by one person: Khairy Islam Shaheen (“Kai”), an individual in Egypt — not a company. He decides what happens to your data and is responsible for it (in data-protection words, the “controller”). “We” on this page means him. Write to ${contact()} about anything here.</p>`, 'One person, with a name.', 'dropcap')}
  ${clause(2, 'keep', 'What we keep', `<p>Your account email and password (stored only as a one-way hash), and what you put in the app: tasks, projects, calendar blocks, routines and their check-ins, focus rounds, your journal (its words, mood, photos and the transcripts of what you said into it), the people you add and your notes about them, books, notes and quotes, your Inbox, and your settings. The app also keeps a log of what happened — this task was done, that routine was checked — because streaks, reviews and Undo are built from it, and an index of your words so search can find things by meaning.</p>
    <p>A few things to make the service work: which version of these terms and of this policy you agreed to, and when; the devices you turned notifications on for; and, if you make them, your capture and assistant keys (only a fingerprint of each key is stored, never the key itself) and when a key was last used. When you sign in, Supabase records your IP address, device type and the time, for security.</p>
    <p>Some of what you write may be sensitive — your health, your faith, how you feel, other people. You choose what to write; we treat all of it as private and use it only as this page says. Please keep what you write about other people to what you’d be comfortable with them knowing you wrote down.</p>`, 'Your email and your days. Nothing from elsewhere unless you connect it.')}
  ${clause(3, 'why', 'Why, and on what grounds', `<p>We use your data only to run Kai’s Flow for you: show your days back to you, sync them between your devices, remind you, and do what you ask the AI to do. Not for ads, not to profile you, not to train any AI.</p>
    <p>For the app itself, the ground is our agreement with you (the Terms of Use): we can’t run your planner without holding what’s in it. The optional parts — the AI, Google Calendar, GitHub, notifications, an assistant key — run only because you switch them on or use them, and stop when you switch them off. Keeping the service safe and recoverable (the backups in §8, the limits that stop abuse) is our legitimate interest in not losing your days. Two things also rest on your explicit consent, given with the box you tick at sign-up (or the “I agree” after a change): keeping sensitive things you choose to write, and keeping and handling your data outside your country (§6). Kai’s Flow can’t run without them, so taking that consent back means closing your account (Settings → Your data → Delete account); it doesn’t undo what was lawful before.</p>`, 'Only to run it for you.')}
  ${clause(4, 'ai', 'What the AI sees', `<p>The AI is Groq, a US company. It sees what you send it when you use an AI feature: what you capture — typed, spoken (the recording, to turn it into words), or a photo of your notes — with the names of your projects, so it can pick out the date, the time and where it belongs; what you say into your journal, to write it down; and a message in chat, with a short summary of your today and tomorrow (tasks, your own events, your Inbox) and the items from your account the chat looks up to answer you — these can include lines from your journal and your notes about people, when they match what you asked. We don’t store your recordings: once they’re words, the sound is gone. Groq doesn’t train on any of it, and our account is set to Groq’s zero data retention, so Groq doesn’t store what we send once it has replied. Search inside the app, and the “related items” it finds, run in our own database, not through an AI company. Things sent to your capture link stay away from the AI unless you turn on “File captures for me” or the link you set up asks for it, and nothing else in your account goes to Groq.</p>
    <p>The AI can be wrong. It can misread a date, mishear a word, or answer from the wrong item. In chat it can add, move or finish things — but only after showing you exactly what it will do and you confirm, and one Undo takes it back. Check what matters before you rely on it.</p>
    <p>If you connect an AI assistant of your own (Claude, ChatGPT and the like) with a key from Settings, it can do through that key what you can do in the app: read and change your tasks, projects, calendar, Inbox, routines, library and settings, move things to the Trash, and delete a few things for good (a library item, and a person if you’ve allowed People). Your journal and the people you keep stay out of its reach unless you switch them on for that key, one switch each. What it reads goes to that assistant’s maker, under their policy, not ours — choose one you trust. Turn the key off and it stops at once.</p>`, 'Only when you use it, and it doesn’t keep it.')}
  ${clause(5, 'google', 'Google Calendar and GitHub', `<p>Only if you connect it in Settings, Kai’s Flow reads the events of the Google calendars you choose (Google’s permission: see your calendars) and shows them on your calendar beside your tasks, so you can plan around them. Connecting asks Google for both permissions named here. With “Show my plan in Google as busy” — on unless you turn it off (Google’s permission: events on calendars you own), it writes your time blocks, scheduled tasks and your own events to your main Google calendar under their own names, marked private and busy — people you share your calendar with see that you’re busy, not what you’re doing (unless they can edit your calendar) — and keeps them up to date. It never changes or deletes any other event in your Google Calendar: only the ones it wrote. Everything refreshes every 15 minutes. The access Google gives us stays on our server, with a copy of the events it has shown you (their names and times; not their descriptions, places or guests). Disconnect any time from Settings, and the events it wrote are removed from Google, together with its access and the copies it kept (backups catch up, §8).</p>
    <p>What comes from Google is used only to show your calendar and keep your busy blocks in step. It isn’t sent to the AI, isn’t sold or shared, isn’t used for ads, and isn’t used to develop, improve or train any AI or machine-learning model. No person reads it, unless you ask us to look into a problem with it, or security or the law requires it. Kai’s Flow’s use and transfer of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
    <p>GitHub works the same way: only if you connect it in Settings with a token you make. The token stays on our server, and every 30 minutes Kai’s Flow brings the open issues assigned to you, or from the repositories you pick, into your Inbox. Disconnect any time, and the token is deleted from the app (backups catch up, §8) — delete it on GitHub too, to be sure.</p>`, 'Read to show; your plan goes out as busy unless you turn it off.')}
  ${clause(6, 'who-else', 'Who else sees a little, and where', `<p>No ads. No selling your data, and no sharing it beyond the short list below. No tracking, analytics or fingerprinting, in the app or on this site. This site sets no cookies; the app keeps you signed in with your device’s own storage. To work at all, a few services handle some of it for us, each only for this:</p>
    <ul>
      <li><b>Supabase</b> (a US company) — the database, sign-in, photo storage and the server code. Your data is stored in the EU (Frankfurt); the server code that handles a request may run in a data centre nearer you. </li>
      <li><b>Gmail</b> (Google) — the emails that confirm your address or reset your password are sent from Kai’s Gmail address, so Google handles your email address and that message, under Google’s own terms; a copy stays in that account’s sent mail until Kai clears it.</li>
      <li><b>Groq</b> (US) — the AI, as §4 says, in the US or another country Groq runs in.</li>
      <li><b>Cloudflare</b> (US, worldwide) — serves the app and this site, so it sees your IP address and which page you asked for, like any web host.</li>
      <li><b>Push services</b> — if you turn notifications on in a browser or the Windows or Mac app, they travel through that browser’s push service (Google, Mozilla, Microsoft or Apple), encrypted so it can’t read them. With “Show task names on the lock screen” off — the default — they carry no names at all. The Android app schedules its reminders on the phone itself.</li>
      <li><b>GitHub</b> (US) — the apps and this site ask it for the newest version number, and the apps download from it. The release machinery that makes the backups in §8 also runs there for a few minutes; the copy goes straight to Supabase and isn’t kept on GitHub.</li>
      <li><b>Google Fonts</b> — this site (not the app) loads its fonts from Google, which sees your IP address. The site remembers the newest version number in your browser for an hour; nothing about you.</li>
      <li><b>Google, GitHub, and your own AI assistant</b> — only if you connect them (§4, §5).</li>
    </ul>
    <p>So your data leaves your country: it’s kept in the EU, and parts of it are handled in the US and wherever these services run, where the law may protect it less than at home. These are established services with their own data-protection terms; Supabase and Groq say in their terms that they use it only to provide their service to us. Agreeing at sign-up includes agreeing to this. We give your data to no one else, unless the law makes us — and then we’ll tell you, unless the law forbids it.</p>`, 'Nothing to sell. A short list of helpers.')}
  ${clause(7, 'device', 'On your device', `<p>The app keeps a working copy of your tasks and plans on your device so it opens and works offline, and holds changes and photos you made offline until they’re sent. Your journal, notes about people and the Trash are left out of that copy (except a change you made offline, until it’s sent). The chat keeps your last 100 messages on this device only, not on our server (Clear empties it). Signing out clears all of this. On Android, the home-screen and lock-screen widgets keep a small copy of today’s tasks and routines on the phone; “Hide titles on the home screen” hides their names. Notifications and the Android lock-screen card show names only if you turn on “Show task names on the lock screen” — otherwise anyone who sees your locked phone sees “A reminder”.</p>`, 'A copy that works offline. Gone when you sign out.')}
  ${clause(8, 'how-long', 'How long it stays', `<ul>
      <li>Your account and what’s in it: until you delete it, or your account.</li>
      <li>The Trash: deleted for good after 30 days.</li>
      <li>Photos of your handwritten pages (Paper capture): 7 days so you can look back at them — or within the hour after you review them, if you choose that in Settings. The words read from a page stay with it until you delete that page. Journal photos: until you remove them.</li>
      <li>Voice recordings: not kept; only the words are.</li>
      <li>The log of what happened (the one streaks and Undo use), and the notifications you were sent: as long as your account. It keeps the names it noted at the time, even after you delete the thing itself.</li>
      <li>Error logs on our server, which can hold a fragment of what was being processed when something failed: kept briefly by Supabase, then gone.</li>
      <li>Google’s events: refreshed every 15 minutes; gone when you disconnect (backups catch up).</li>
      <li>Sign-in records (IP address, device type, time): kept by Supabase for security while your account exists.</li>
      <li>Backups: when a new version of the app is released, a copy of the database is saved to private storage in case something goes wrong. Only the 14 newest are kept: each new one clears the oldest. So something you delete — including a disconnected Google or GitHub access — stays in those copies until 14 more versions have come out, and then it’s gone. We open them only to put things back after an accident.</li>
    </ul>`, 'Each thing says how long.')}
  ${clause(9, 'rights', 'Your rights, and taking it with you', `<p>You can see everything in the app, correct it, and delete it. Settings → Your data → Export your data saves everything you’ve written, as plain files: all of it as JSON, your tasks as a spreadsheet (CSV), your calendar as .ics. (Photos aren’t in the export yet: write to us and we’ll send them.) Delete account, just below it, deletes your account and everything in it — photos included — at once and for good; the backups (§8) catch up after 14 more releases. You can turn off “File captures for me”, disconnect Google or GitHub, turn off any key, and turn off notifications any time.</p>
    <p>You can also write to ${contact()} to ask what we hold about you, to correct or delete it, to get a copy, to object to or limit something we do with it, or to take back your consent. We’ll answer within 30 days, and we don’t charge. If you think we’ve got it wrong, tell us first if you can — and you may also complain to the data-protection authority where you live (in Egypt, the Personal Data Protection Centre; in the EU or UK, your country’s regulator).</p>`, 'It’s yours to take. Or gone.')}
  ${clause(10, 'safe', 'Keeping it safe', `<p>Everything travels encrypted (HTTPS). Supabase encrypts the database at rest, and each account can read only its own rows — the database itself enforces that, not just the app. Secrets like Google’s access, the AI’s key and your GitHub token stay on the server and are never sent to the app. We open your data only to keep the service running, to fix a problem you’ve asked about, or when you ask us to. No system is perfect: if something ever goes wrong in a way that puts your data at risk, we’ll tell you within 3 working days of finding out, say what happened and what to do, and tell the authorities the law requires us to.</p>`, 'Locked, and we’d tell you.')}
  ${clause(11, 'age', 'Age', `<p>Kai’s Flow is for people 16 and over. If you’re under the age of majority where you live (21 in Egypt), a parent or guardian must agree to these terms for you. If you think a child under 16 has made an account, write to us and we’ll delete it.</p>`, '16 and over.')}
  ${clause(12, 'contact', 'Changes, and talking to us', `<p>Write to ${contact()}. Kai reads every message. If this policy changes, the date at the top changes, Field notes says what moved, and the app asks you to read and agree to the new version the next time you open it — with a notification too, if you’ve turned them on. If you’d rather not agree, you can export your data and delete your account instead.</p>`, 'A person answers.')}
</div></div></div>`,
}

// ── terms ──
const terms = {
  path: '/terms/',
  title: 'Terms',
  description: 'The terms for using Kai’s Flow: free for your own days, your content is yours, the AI can be wrong, no warranty, Egyptian law.',
  og: 'terms',
  body: `<div class="chapter"><div class="wrap"><div class="chapter-in" style="max-width:680px">
  ${head2({ eyebrow: `Terms of Use · updated ${legalDate('TERMS_VERSION')}`, title: 'The terms', lead: 'Short, in plain words: the agreement between you and Kai, the person who makes Kai’s Flow.', h: 'h1', tone: 'faint' })}
  <ol class="terms">
    <li><div><h2>Who and what</h2><p>Kai’s Flow — the web app, the Windows, Mac and Android apps, and this site — is made and run by Khairy Islam Shaheen (“Kai”, “we”), an individual in Egypt. Creating an account, or using the app, means you agree to these terms and the <a href="/privacy/">privacy policy</a>. If you don’t, please don’t use it.</p></div></li>
    <li><div><h2>Your account</h2><p>You need to be 16 or over. If you’re under the age of majority where you live (21 in Egypt), a parent or guardian must agree to these terms for you. One account is for one person. Keep your password to yourself, and treat a capture or assistant key like a password: anyone who has it can do what it allows. You’re responsible for what happens through your account and your keys; turn a key off the moment you think it’s leaked.</p></div></li>
    <li><div><h2>Free to use</h2><p>Kai’s Flow is free. We give you a personal, non-transferable right to use the apps for your own days, for as long as these terms last. The software stays ours: the source code you may see on GitHub is shown for reference only, and its licence doesn’t let you copy, change, resell or host it. Parts made by others keep their own licences (Settings → App &amp; updates → Open-source licences). The AI has daily limits so it can stay free.</p></div></li>
    <li><div><h2>Your content</h2><p>What you write is yours. You let us store, copy and process it only to run the app for you — sync it, show it, back it up, and send it where the privacy policy says (the AI, Google, your assistant) — as the <a href="/privacy/">privacy policy</a> explains. That permission ends when you delete it or your account, once the backups catch up.</p></div></li>
    <li><div><h2>The AI</h2><p>The AI reads what you capture and helps you plan, and in chat it can change your things once you confirm. It can be wrong: a misheard word, the wrong date, a confident answer that isn’t true. Check what matters before you rely on it. It isn’t medical, legal, financial or any other professional advice. An assistant you connect with a key acts for you, under its maker’s terms.</p></div></li>
    <li><div><h2>Please don’t</h2><p>Use it to break the law or to harm, harass or spy on anyone; store anything you have no right to; try to get into other people’s data or around the limits; overload, probe or attack the service; or copy or resell it. We may limit or close an account that does, and we’ll tell you why unless that would make things worse.</p></div></li>
    <li><div><h2>Other services</h2><p>Google Calendar, GitHub and your own AI assistant are run by others, under their own terms. We’re not responsible for them, and they may change or stop working with Kai’s Flow.</p></div></li>
    <li><div><h2>No warranty</h2><p>We look after it carefully, but it comes as it is and as available: it may have bugs, go down, miss a reminder, or change. Don’t rely on it alone for anything where a missed reminder could hurt you or someone else — medicine, safety, deadlines that can’t slip. Keep your own copy (Export) of anything you can’t lose.</p></div></li>
    <li><div><h2>Limits of our responsibility</h2><p>As far as the law allows, we aren’t liable for indirect or knock-on losses (a missed meeting, lost profit, data you could have exported), and because Kai’s Flow is free, our total liability to you under this agreement is limited to 100 Egyptian pounds. This doesn’t limit liability for fraud or gross fault, for harm outside this agreement, for harm to a person, or anything else the law (including Egypt’s Personal Data Protection Law) doesn’t let us limit — nor your rights as a consumer where you live.</p></div></li>
    <li><div><h2>Changes</h2><p>We may change the app at any time. If these terms change, the date at the top changes, Field notes says so, and the app asks you to agree to the new version before you carry on. If you’d rather not, you can export your data and delete your account instead.</p></div></li>
    <li><div><h2>Ending</h2><p>You can stop any time, and delete your account yourself in Settings → Your data. We may close an account that breaks these terms (point 6). If we ever stop running Kai’s Flow, we’ll tell you at least 30 days before and keep Export working until then.</p></div></li>
    <li><div><h2>Law</h2><p>These terms are governed by the law of the Arab Republic of Egypt, and the courts of Egypt decide any dispute, unless the law where you live lets you go to your own courts — without taking away the protection of the mandatory laws where you live. If one part of these terms turns out not to be valid, the rest still applies. Please write to us first: most things are fixed by a message.</p></div></li>
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
