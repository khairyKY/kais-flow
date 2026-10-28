import { head2, icon, btn, kmark, esc } from '../lib.mjs'
import { APP_URL, REPO, RELEASES_URL, LATEST, APK_LATEST, EXE_LATEST, DMG_LATEST } from '../data.mjs'

const UPDATED = '17 Oct 2026'
const pre = (t) => `<pre tabindex="0"><code>${esc(t)}</code></pre>`

// AI assistants over MCP — the same three setups the app's Settings card fills in with your key
// (app/src/features/settings/mcpKey.ts, docs/MCP.md), with placeholders here.
const MCP_URL = 'https://<project>.supabase.co/functions/v1/mcp'
const BEARER = 'Bearer <your key>'
const MCP = {
  code: `claude mcp add --transport http kais-flow ${MCP_URL} --header "Authorization: ${BEARER}"`,
  desktop: JSON.stringify({ mcpServers: { 'kais-flow': { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL, '--header', 'Authorization:${KF_AUTH}'], env: { KF_AUTH: BEARER } } } }, null, 2),
  other: JSON.stringify({ mcpServers: { 'kais-flow': { type: 'http', url: MCP_URL, headers: { Authorization: BEARER } } } }, null, 2),
}
// The Akiflow dump the importer reads (app/src/features/import/adapters/akiflow.ts).
const AKIFLOW_PROMPT = `Using my Akiflow connection, write my Akiflow data to a file called akiflow-dump.json for the Kai's Flow importer, in exactly this shape:

{"source": "akiflow",
 "projects": [{"id", "name"}],
 "tasks": [{"id", "title", "description", "date", "datetime", "deadline",
            "duration", "priority", "project_id", "tags", "status",
            "done", "done_at"}],
 "events": [{"id", "title", "start", "end", "all_day"}]}

Include all my projects and all my open and someday tasks. Dates as YYYY-MM-DD, times as
YYYY-MM-DDTHH:MM:SS on my own clock, duration in minutes, priority as Akiflow names it
(GOAL, HIGH, MEDIUM or LOW), tags as their names, status "someday" for someday tasks.
Leave out anything you don't have. Events are optional.`
// small step pictures (tiny phone/desktop dialogs)
const pic = {
  apk: `<div class="mini" role="img" aria-label="A download notification: the APK finished downloading, with Open"><div class="mini-d"><b>kais-flow.apk</b>${LATEST.apkMB} MB · Download complete<div class="row" style="margin-top:6px"><span class="lnk">Open</span></div></div></div>`,
  allow: `<div class="mini" role="img" aria-label="Android’s Install unknown apps screen with Allow from this source turned on"><div class="mini-d"><div class="row">Install unknown apps</div><div class="row">Allow from this source<span class="tg"></span></div></div></div>`,
  install: `<div class="mini" role="img" aria-label="Android asking whether to install Kai’s Flow, with Cancel and Install"><div class="mini-d"><div class="row" style="justify-content:flex-start"><span class="k">K</span><b>Kai’s Flow</b></div><div class="row" style="justify-content:flex-end;gap:14px"><span class="lnk">Cancel</span><span class="lnk">Install</span></div></div></div>`,
  exe: `<div class="mini" role="img" aria-label="The installer file in Downloads"><div class="mini-d dark"><b>kais-flow-<span data-release-tag>${LATEST.tag}</span>-windows-setup.exe</b>Downloads · ${LATEST.exeMB} MB</div></div>`,
  smart: `<div class="mini" role="img" aria-label="Windows SmartScreen: Windows protected your PC, with More info and Run anyway"><div class="mini-d" style="background:#2b5797;color:#fff"><b>Windows protected your PC</b><span style="text-decoration:underline">More info</span><div class="row" style="justify-content:flex-end;margin-top:8px"><span style="border:1px solid #fff;padding:2px 8px">Run anyway</span></div></div></div>`,
  dmg: `<div class="mini" role="img" aria-label="The disk image: drag Kai’s Flow onto Applications"><div class="mini-d"><div class="row"><span class="k">K</span><b style="display:inline">Kai’s Flow</b><span>→</span><b style="display:inline">Applications</b></div></div></div>`,
  blocked: `<div class="mini" role="img" aria-label="macOS: Kai’s Flow Not Opened, with Move to Trash and Done"><div class="mini-d"><b>“Kai’s Flow” Not Opened</b>Apple could not verify it is free of malware.<div class="row" style="justify-content:flex-end;gap:14px;margin-top:8px"><span class="lnk">Move to Trash</span><span class="lnk">Done</span></div></div></div>`,
  anyway: `<div class="mini" role="img" aria-label="System Settings, Privacy and Security: Kai’s Flow was blocked, with Open Anyway"><div class="mini-d"><div class="row">“Kai’s Flow” was blocked to protect your Mac.</div><div class="row" style="justify-content:flex-end"><span style="border:1px solid currentColor;padding:2px 8px">Open Anyway</span></div></div></div>`,
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
      ['capture', 'Catch things as they come', '<p>On a phone, tap the round button to type a thought, or hold it to talk. On a computer, press <b>Capture</b> or <kbd>⌘/Ctrl</kbd> <kbd>K</kbd>. Dates like “Friday 5pm” are picked out for you, and anything that isn’t a task yet waits in the Inbox until you sort it. <a href="/guides/capture-from-anywhere/">Capture from anywhere</a>.</p>'],
      ['shut-down', 'Shut down in the evening', '<p>From five in the evening, Shut down offers to close the day: tick what’s done, move what isn’t, and choose tomorrow’s three.</p>'],
      ['tour', 'A short tour, and the Guide', '<p>On your first day, a few garden notes point out the main things: capture, the Top 3, your tasks and Plan my day. Skip them any time. After that, the <b>Guide</b> inside the app has the how-to for everything, with search: <b>More → Guide</b> on a phone, <b>Guide</b> at the foot of the sidebar on a computer.</p>'],
      ['clock', 'Your own clock', '<p>Today, reminders and the morning digest follow your time zone. The app offers your device’s zone once; change it any time in <b>Settings → Time zone</b>.</p>'],
      ['next', 'Where to go next', '<ul><li><a href="/guides/install-android/">Install on Android</a>, <a href="/guides/install-windows/">on Windows</a> or <a href="/guides/install-mac/">on a Mac</a>.</li><li><a href="/guides/import/">Bring your old app’s tasks with you</a>.</li><li><a href="/guides/gestures/">Gestures</a> and <a href="/guides/keyboard-shortcuts/">keyboard shortcuts</a>.</li><li><a href="/guides/connect-an-ai-assistant/">Connect an AI assistant</a>.</li></ul>'],
    ] },
  { slug: 'import', group: 'Start here', ic: 'download', title: 'Import your old app', blurb: 'Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle, Goodreads.', min: 4,
    intro: 'Bring your tasks, projects and books with you. The file is read on your own device, and importing the same file twice doesn’t make doubles.',
    sections: [
      ['open', 'Open the importer', '<p>On a computer, go to <b>Settings → Your data → Open importer</b>. Pick where you’re coming from, choose the file, check the preview, and import. There’s an Undo if it isn’t what you wanted.</p>'],
      ['files', 'Which file each app needs', table(['From', 'The file', 'Where to get it'], [
        ['Todoist', '<code>.csv</code>, one per project', 'Open a project → ⋯ → Export as a template → Download CSV. Several at once is fine.'],
        ['TickTick', 'backup <code>.csv</code>', 'TickTick on the web: Settings → Account → Backup & Restore → Generate backup.'],
        ['Notion', 'database <code>.csv</code>', 'Open the database → ⋯ → Export → Markdown & CSV, unzip, pick the .csv. You check the columns next.'],
        ['Obsidian / Markdown', '<code>.md</code> files or a vault folder', 'No export needed. Every “- [ ]” line becomes a task.'],
        ['Kindle highlights', '<code>My Clippings.txt</code>', 'Plug the Kindle in by USB, open its drive → documents → My Clippings.txt.'],
        ['Goodreads', 'library <code>.csv</code>', 'My Books → Import and export → Export Library, then download the .csv.'],
        ['Akiflow', '<code>akiflow-dump.json</code>', 'Akiflow has no export button, so an AI assistant writes this file for you. <a href="#akiflow">How to make it ↓</a>'],
        ['Anything else', '<code>.csv</code> with a header row', 'Choose Generic CSV and match the columns yourself.'],
      ])],
      ['akiflow', 'Making the Akiflow file', `<p>Akiflow doesn’t export your tasks, but an AI assistant that can see your Akiflow account can write them down for you. Kai made his with Claude and an Akiflow connector.</p>
        <ol><li>Open the assistant that’s connected to your Akiflow account, and paste this:</li></ol>
        ${pre(AKIFLOW_PROMPT)}
        <ol start="2"><li>Save what it writes as <code>akiflow-dump.json</code>. It’s your whole task list, so keep it to yourself.</li>
        <li>In Kai’s Flow: <b>Settings → Your data → Open importer → Akiflow JSON</b>, choose the file, and check the preview. Done tasks and calendar events come in only if you turn them on.</li></ol>
        <p>Times without a zone are read on your own clock (Settings → Time zone). Anything else the assistant puts in the file is kept with each task, so nothing is lost.</p>`],
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
      ['capture', 'The round button', '<p><b>Tap</b> to type a capture. <b>Hold</b> to talk instead, and let go to send. While you hold, slide up onto the lock to keep talking hands-free, or slide left to throw the take away, with Undo.</p>'],
    ] },
  { slug: 'keyboard-shortcuts', group: 'Using it', ic: 'keyboard', title: 'Keyboard shortcuts', blurb: 'N, ?, ⌘K and the rest.', min: 2,
    intro: 'On a computer, Kai’s Flow can be driven from the keyboard. Press ? in the app to see this list any time.',
    sections: [
      ['everywhere', 'Everywhere', table(['Keys', 'Does'], [[kbd('⌘/Ctrl K'), 'Command bar'], [kbd('/'), 'Search'], [kbd('⌘/Ctrl /'), 'Search, even while typing'], [kbd('⌘/Ctrl J'), 'Chat'], [kbd('⌘/Ctrl Z'), 'Undo the last thing you did'], [kbd('⌘/Ctrl ,'), 'Settings'], [kbd('i'), 'Go to the Inbox'], [kbd('u'), 'Go to Upcoming'], [kbd('n'), 'New task'], [kbd('?'), 'The shortcut list'], [kbd('Esc'), 'Close what’s open']])],
      ['tasks', 'In a task list', table(['Keys', 'Does'], [[kbd('j k'), 'Move up and down'], [`${kbd('e')} or ${kbd('Space')}`, 'Complete'], [kbd('↵'), 'Open the task'], [kbd('t'), 'Add to or take off the Top 3'], [kbd('h'), 'Make it the goal of the day'], [kbd('1 2 3'), 'Today · Tomorrow · Next week'], [kbd('d'), 'Plan…'], [kbd('s'), 'Someday'], [kbd('p'), 'Move to a project'], [kbd('l'), 'Labels'], [kbd('!'), 'Priority'], [kbd('='), 'Duration'], [kbd('f'), 'Start focus'], [kbd('o'), 'Open its link'], [kbd('⌘/Ctrl ↑/↓'), 'Move it up or down the list'], [kbd('Alt ↑/↓'), 'Reorder the Top 3, on Today'], [kbd('x'), 'Select several'], [kbd('Ctrl A'), 'Select all'], [kbd('#'), 'Delete']])],
      ['calendar', 'On the calendar', table(['Keys', 'Does'], [[kbd('d w m'), 'Day · Week · Month'], [kbd('1 2–6 7'), 'One day · 2 to 6 days · the week'], [`${kbd('← →')} or ${kbd('- =')}`, 'Back · forward'], [kbd('t'), 'Today'], [kbd('0'), 'Fold the planning rail'], [kbd('⌘/Ctrl click'), 'A new task in that slot'], [kbd('⌫'), 'Delete the open event']])],
      ['inbox', 'In the Inbox', table(['Keys', 'Does'], [[`${kbd('↑ ↓')} or ${kbd('j k')}`, 'Move up and down'], [kbd('e'), 'File it, with the AI’s suggestion'], [kbd('Space'), 'Done now'], [kbd('p'), 'Plan: pick a date'], [kbd('d'), 'Dismiss'], [kbd('s'), 'Snooze'], [kbd('↵'), 'Edit the title'], [kbd('r'), 'Restore a dismissed or snoozed one']])],
      ['command-bar', 'In the command bar', table(['Type', 'Does'], [[kbd('↵'), 'Add it — the AI fills in what you didn’t type'], [kbd('⌘/Ctrl 2'), 'Make it an event (⌘/Ctrl 1: a task)'], ['<code>!</code> <code>!!</code> <code>!!!</code>', 'Priority'], ['<code>#project</code>', 'Put it in a project'], ['<code>*label</code>', 'Add a label'], ['<code>30m</code> <code>1h</code>', 'How long'], ['<code>every week</code>', 'Repeat it'], ['<code>&lt;friday</code>', 'A date'], ['<code>//</code>', 'The rest of the line is notes'], ['<code>&gt;Code block</code>', 'Into that Time slot'], [kbd('↓ ↵'), 'Jump to a view, project, area or label']])],
    ] },
  { slug: 'capture-from-anywhere', group: 'Using it', ic: 'mic', title: 'Capture from anywhere', blurb: 'The share sheet, widgets, the tray, the link, Shortcuts, Tasker.', min: 6,
    intro: 'Everything here lands in your Inbox, the same as a capture in the app. None of it costs anything or needs another account.',
    sections: [
      ['share', 'Android: the share sheet', '<p>Nothing to set up. In any app, tap <b>Share → Kai’s Flow</b> (the Android app or the web app installed from Chrome). You need to be signed in. Text and links work; photos don’t yet — for a photo of your notes, use the camera in the capture bar (<a href="/paper/">Paper capture</a>).</p>'],
      ['widget', 'Android: a capture widget', '<p>A capture widget on your home screen opens Kai’s Flow straight to the capture sheet, keyboard up. To add one, on most phones: hold an empty spot → <b>Widgets</b> → <b>Kai’s Flow</b>.</p>'],
      ['tray', 'Windows: the tray', '<p>Click the K by the clock. The little flyout has quick capture, so you don’t have to bring the window back.</p>'],
      ['assistant', 'An AI assistant', '<p>Connected over MCP with a read & write key, Claude or another assistant can add a note to your Inbox when you ask it to. <a href="/guides/connect-an-ai-assistant/">Connect an AI assistant</a>.</p>'],
      ['key', 'Your capture key and address', `<p>Everything else sends to one address with your own <b>capture key</b>.</p><ol><li>In <b>Settings → Advanced → External capture endpoint</b> (the last section, on a computer and a phone), press <b>Create key</b>.</li><li>The key starts with <code>kf_</code> and is shown <b>once</b>. Copy it then; only a fingerprint of it is stored.</li><li>Under <b>How to send things here</b>, press <b>Copy address</b>.</li></ol><p>Keep the key in the <code>Authorization</code> header, never in the address. <b>New key</b> replaces it and <b>Turn off</b> deletes it. A leaked key can only add notes to your own Inbox, at most 200 a day.</p>`],
      ['iphone', 'iPhone and iPad: Shortcuts', '<ol><li>Shortcuts → <b>+</b> → name it “Add to Kai’s Flow”. In Details, turn on <b>Show in Share Sheet</b>.</li><li>Add <b>Get Contents of URL</b>: your address, Method <code>POST</code>, a header <code>Authorization</code> = <code>Bearer kf_…</code>, and a JSON body with a <code>text</code> field set to Shortcut Input.</li><li>Run it from the share sheet, the home screen, or Siri.</li></ol>'],
      ['android-auto', 'Android: HTTP Shortcuts or Tasker', '<p>For a home-screen button or a voice command, send a <code>POST</code> to your address with the header <code>Authorization: Bearer kf_…</code> and the body <code>{"text": "…"}</code>. HTTP Shortcuts (free, open source) and Tasker’s HTTP Request both do this.</p>'],
      ['bookmarklet', 'A desktop browser: the bookmarklet', '<p>Right after making a key, Settings offers <b>Copy bookmarklet</b>. Paste it as a new bookmark’s address. Clicking it sends the selected text (or the page title) and the page’s address.</p>'],
      ['curl', 'Scripts: curl or PowerShell', '<pre><code>curl -X POST https://&lt;project&gt;.supabase.co/functions/v1/capture \\\n  -H "Authorization: Bearer kf_…" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"text": "call the tyre supplier"}\'</code></pre><p>Add <code>?file=1</code> to the address to let the AI file it the next time the app is open. Without it, nothing you send touches the AI.</p>'],
    ] },
  { slug: 'connect-an-ai-assistant', group: 'Using it', ic: 'chat', title: 'Connect an AI assistant', blurb: 'Claude Desktop, Claude Code or any MCP client.', min: 5,
    intro: 'Kai’s Flow runs a small MCP server — MCP is how Claude and other AI assistants talk to apps. Connect one with a key of your own, and it can tell you what’s on today and, if you let it, do what you can do in the app.',
    sections: [
      ['what', 'What it can do', '<p>Ask it “what’s on today?”, “find the tyre invoice task”, “add <i>call the bank</i> for Thursday” or “move the domain renewal to tomorrow”, and it works on your real lists: 51 actions in all. Kai’s Flow tells it to read freely and to change things only when you ask.</p>' + table(['It can', 'With'], [
        ['See today, search, and read your tasks, Inbox, projects, calendar (up to 31 days at a time), routines, Library, Trash and settings', 'Any key'],
        ['Add, change, reschedule and tick off tasks and subtasks, or move them to the Trash', 'Read & write'],
        ['Sort the Inbox: file, snooze or dismiss', 'Read & write'],
        ['Add, move or delete events and Time blocks, with reminders', 'Read & write'],
        ['Projects, checklists and their templates, areas, domains and labels', 'Read & write'],
        ['Routines, focus rounds, Plan my day and Shut down', 'Read & write'],
        ['The Library, and your settings (never keys or connections)', 'Read & write'],
        ['Your journal, or the people you keep', 'Only with that switch on for the key'],
      ])],
      ['key', 'Make a key', '<ol><li>On a computer: <b>Settings → Integrations</b>, then the <b>AI assistants (MCP)</b> card. On a phone: <b>Settings → Connections → AI assistants (MCP)</b>.</li><li>Choose <b>Read & write</b> (it can also add, change, tick off and delete — to the Trash) or <b>Read only</b> (it can look, never change anything), then <b>Create key</b>.</li><li>The key starts with <code>kf_ai_</code> and is shown <b>once</b>. Copy it then; only a fingerprint of it is stored.</li><li>Under the key, <b>Journal</b> and <b>People</b> start off. Switch one on only if this assistant should read and write it.</li></ol><p class="tip">Right after you make the key, the card’s <b>Connect an assistant</b> section shows each setup below with your address and key already filled in, each with its own copy button. <b>Copy server address</b> gives you the address on its own.</p>'],
      ['claude-code', 'Claude Code', '<p>Run this once in a terminal, with your address and key in place:</p>' + pre(MCP.code) + '<p>Then <code>claude mcp list</code> (or <code>/mcp</code> inside Claude Code) should show <b>kais-flow</b> as connected.</p>'],
      ['claude-desktop', 'Claude Desktop', '<ol><li>In Claude Desktop: <b>Settings → Developer → Edit Config</b>.</li><li>Add this to <code>claude_desktop_config.json</code> — on Windows it’s in <code>%APPDATA%\\Claude\\</code>, on a Mac in <code>~/Library/Application Support/Claude/</code>. If the file already has <code>mcpServers</code>, put <code>kais-flow</code> inside it.</li></ol>' + pre(MCP.desktop) + '<ol start="3"><li>Restart Claude Desktop.</li></ol><p>It needs <a href="https://nodejs.org/">Node.js</a>: Claude Desktop’s own <b>Add custom connector</b> only signs in with OAuth, so the key goes through a small bridge, <code>mcp-remote</code>. Leave <code>Authorization:${KF_AUTH}</code> exactly as it is; your key goes in <code>KF_AUTH</code>.</p>'],
      ['other', 'Any other MCP client', '<p>Anything that speaks remote MCP over HTTP with a header — Cursor, VS Code and others — takes the address and the header in the usual shape:</p>' + pre(MCP.other) + '<p>On claude.ai: only if your account shows <b>Request headers</b> under <b>Customize → Connectors → Add custom connector</b> (a beta, not on every account). Use the address as the server URL, choose <b>No sign-in</b>, and add the request header <code>authorization</code> = <code>Bearer</code> and your key. Without it, use Claude Desktop or Claude Code.</p>'],
      ['try', 'Try it', '<p>Ask “what’s on today?” first. Times are on your own clock, the one in <b>Settings → Time zone</b>, and a day without a time means 09:00. What the assistant changes shows up in the open app straight away, and counts like anything you do in the app.</p>'],
      ['privacy', 'What it sees, and turning it off', '<ul><li><b>It can see</b> your tasks, projects, areas, domains, your own calendar events (never the ones from Google), Inbox notes, routines, focus time, the Library, Trash and your settings.</li><li><b>Your journal and the people you keep</b> only if you switch them on for that key. Off, no tool or search reaches them.</li><li><b>Never</b> your keys, or your Google and GitHub connections.</li><li>What a tool returns is read by the assistant you connected, so its maker’s data policy covers it. Connect only an assistant you trust with your task list, and pick <b>Read only</b> if it should never change anything.</li><li><b>Turn off</b> (or <b>New key</b>) in the card stops it at once: its very next call is refused.</li><li>A key gets 500 tool calls a day, and every call runs as you, under the same rules that keep each account to its own rows.</li></ul>'],
    ] },
  { slug: 'install-android', group: 'Installing', ic: 'android', title: 'Install on Android', blurb: 'The APK, and the one “allow” step.', min: 4,
    intro: 'Kai’s Flow isn’t on the Play Store yet, so you install it yourself. It takes about a minute, and you only do the “allow” step once.',
    sections: [
      ['before', 'Before you start', `<p>You need an Android phone with a little room: the app is about ${LATEST.apkMB} MB.</p>`],
      ['download', 'Download the APK', `<p>On your phone, open <a href="/download/">the download page</a> and tap <b>Download APK</b>, or get <a href="${APK_LATEST}">kais-flow.apk</a> straight from GitHub (always the newest).</p>`, pic.apk],
      ['allow', 'Allow this one source', '<p>Android asks once whether your browser (or Files) may install apps. Turn on <b>Allow from this source</b>, then go back.</p>', pic.allow],
      ['install', 'Install and sign in', '<p>Tap <b>Install</b>, then <b>Open</b>. Sign in with the same account you use on the web; your days are already there. The first time you use voice capture, allow the microphone.</p>', pic.install],
      ['notifications', 'Notifications', '<p>The first time you open the app, Android asks whether Kai’s Flow may send notifications — say <b>Allow</b>. Reminders, the morning digest and the evening nudge are then lined up with Android for the next three days, each time you open the app. A reminder has <b>Done</b> and <b>Tomorrow</b> right on it.</p>'],
      ['widgets', 'Widgets', '<p>On most phones: hold an empty spot on the home screen → <b>Widgets</b> → <b>Kai’s Flow</b>, and drag one out. There are 34 — Today, the Top 3, capture, the calendar, focus, routines, the Inbox and more. To keep task names off the home screen, turn on <b>Settings → Notifications → Hide titles on the home screen</b>.</p>'],
      ['updating', 'Updating', '<p class="tip"><b>Updating:</b> Settings → App → Check for updates tells you when there’s a new version and downloads it. Install it over the old one, the same three steps.</p>'],
      ['trouble', 'If something goes wrong', '<p>If Android says the app <b>conflicts with an existing package</b>, that build was signed with a different key. Open the old app and check it says <b>Synced</b>, uninstall it, then install the new one. Nothing is lost — your data lives in your account.</p><p>If reminders don’t arrive, open <b>Settings → Notifications → Send a test notification</b>: it says what’s in the way. If notifications were turned down, switch them back on in Android Settings → Apps → Kai’s Flow → Notifications.</p>'],
    ] },
  { slug: 'install-windows', group: 'Installing', ic: 'windows', title: 'Install on Windows', blurb: 'The installer, and the SmartScreen step.', min: 3,
    intro: 'The Windows app is the same Kai’s Flow in its own window. It installs just for you, so it never asks for an admin password.',
    sections: [
      ['download', 'Download the installer', `<p>Get it from <a href="/download/">the download page</a>, or <a href="${EXE_LATEST}">kais-flow-windows-setup.exe</a> from GitHub (always the newest). It’s about ${LATEST.exeMB} MB and runs on Windows 10 and 11.</p>`, pic.exe],
      ['smartscreen', 'Say yes to SmartScreen', '<p>The installer isn’t code-signed (that costs money), so Windows may say <b>“Windows protected your PC”</b>. Click <b>More info → Run anyway</b>. Updates install themselves after that, so you see this only once.</p>', pic.smart],
      ['run', 'Run it', '<p>It installs for you only — no admin needed. Then open <b>Kai’s Flow</b> from the Start menu and sign in.</p>', pic.running],
      ['tray', 'The K by the clock', '<p>Kai’s Flow keeps a K in the tray by the clock. Click it for a little flyout: what’s on now and next, your Top 3, quick capture and focus. Right-click it for a menu. Close the window and it waits there. Reminders arrive as Windows notifications with <b>Done</b> and <b>Tomorrow</b>.</p><p>All of it is in <b>Settings → Notifications</b>: <b>Show in the system tray</b>, <b>Start with Windows</b> (it opens quietly to the tray), quiet hours, and <b>Send a test notification</b>.</p>'],
      ['updating', 'Updating and removing', '<p class="tip"><b>Updating:</b> Settings → App → Check for updates tells you when there’s a new version. Press <b>Update</b>: a progress line shows, and Kai’s Flow reopens on the new version.</p><p>To remove it: Windows Settings → Apps → Kai’s Flow → Uninstall. Your data stays in your account.</p>'],
    ] },
  { slug: 'install-mac', group: 'Installing', ic: 'laptop', title: 'Install on Mac', blurb: 'The .dmg, and Open Anyway once.', min: 3,
    intro: 'The Mac app is the same Kai’s Flow in its own window, with a K in the menu bar. One .dmg runs on Apple silicon and Intel Macs.',
    sections: [
      ['download', 'Download and drag to Applications', `<p>Get it from <a href="/download/">the download page</a>, or <a href="${DMG_LATEST}">kais-flow-mac.dmg</a> from GitHub (always the newest). It’s about ${LATEST.dmgMB} MB. Open it and drag <b>Kai’s Flow</b> onto <b>Applications</b>.</p>`, pic.dmg],
      ['first-open', 'The first time you open it', '<p>Double-click <b>Kai’s Flow</b> in Applications. The app isn’t notarized by Apple (that costs money), so macOS stops it: <b>“Kai’s Flow” Not Opened</b>, with only <b>Move to Trash</b> and <b>Done</b>. Click <b>Done</b>. Since macOS 15 Sequoia, right-click → Open no longer gets past this.</p>', pic.blocked],
      ['open-anyway', 'Open Anyway', '<ol><li>Open <b>System Settings → Privacy &amp; Security</b> and scroll down to <b>Security</b>. It says <b>“Kai’s Flow” was blocked to protect your Mac.</b></li><li>Click <b>Open Anyway</b>. The button only shows for about an hour after you tried to open the app; if it’s gone, double-click the app again first.</li><li>Enter your Mac’s password (or use Touch ID), then click <b>Open</b>.</li></ol><p class="tip">You do this <b>once</b>. Updates install themselves from inside the app and never ask again.</p><p>Comfortable in Terminal? <code>xattr -cr "/Applications/Kai\'s Flow.app"</code> does the same.</p>', pic.anyway],
      ['menu-bar', 'The K in the menu bar', '<p>Kai’s Flow keeps a K in the menu bar at the top of the screen. Click it for a little flyout: what’s on now and next, your Top 3, quick capture and focus. Right-click it for a menu. Close the window and it waits there; click the Dock icon to bring it back. Reminders arrive in Notification Center; if macOS asks whether Kai’s Flow may send notifications, say <b>Allow</b>.</p><p>All of it is in <b>Settings</b>: <b>Show in the menu bar</b>, <b>Open at login</b> (it opens quietly to the menu bar), quiet hours, and <b>Send a test notification</b>. Shortcuts use <kbd>⌘</kbd> where Windows uses Ctrl.</p>'],
      ['updating', 'Updating and removing', '<p class="tip"><b>Updating:</b> Settings → App → Check for updates tells you when there’s a new version. Press <b>Update</b>: a progress line shows, and Kai’s Flow reopens on the new version.</p><p>To remove it: quit it from the K in the menu bar, then drag Kai’s Flow from Applications to the Bin. Your data stays in your account.</p>'],
    ] },
  { slug: 'your-data', group: 'Your data', ic: 'lock', title: 'Your data & privacy', blurb: 'Export, delete, and what the AI sees.', min: 3,
    intro: 'The short version of the privacy policy, with the practical bits: where your days live, what the AI sees, and how to take it all back.',
    sections: [
      ['where', 'Where it lives', '<p>Your account and everything you write are stored in a Supabase database in the EU (Frankfurt). Each account can only read its own rows. The app keeps a copy of your tasks and plans on your device so it works offline; your journal and notes about people are not kept in that copy.</p>'],
      ['ai', 'What the AI sees', '<p>What you capture in the app — typed, spoken or photographed — so it can pick out the date, the time and the rest; and a message in chat, with the items from your account it looks up to answer you. It goes to Groq, which doesn’t train on it and, with zero data retention, keeps nothing after replying. Things sent to your capture link stay away from the AI unless you add <code>?file=1</code>. Nothing else in your account goes to Groq.</p>'],
      ['assistant', 'An AI assistant you connect', '<p>If you <a href="/guides/connect-an-ai-assistant/">connect Claude or another assistant</a>, it sees what its tools return: your tasks, projects, calendar, Inbox, routines, Library and settings. Your journal and the people you keep only if you switch them on for that key. Its maker’s policy covers what it sees. <b>Turn off</b> the key in Settings and it stops at once.</p>'],
      ['take', 'Getting a copy, or leaving', `<p>There’s no one-tap export yet. Write to the address on the <a href="/privacy/#contact">privacy page</a> and you’ll get everything you’ve written, or your account and all of it deleted.</p>`],
      ['more', 'The whole policy', '<p><a href="/privacy/">Read the privacy policy</a> — it’s short.</p>'],
    ] },
]
const GROUPS = ['Start here', 'Using it', 'Installing', 'Your data']

const index = {
  path: '/guides/',
  title: 'Guides',
  description: 'Help for Kai’s Flow: getting started, installing on Android, Windows and Mac, capture from anywhere, connecting an AI assistant, importing your old app, gestures, keyboard shortcuts and your data.',
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
