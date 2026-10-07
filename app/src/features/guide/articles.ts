import type { IconName } from '../../components/icons/kf'
import CROPS from './crops.json'

// The Guide's articles (Tour and Help Guide.dc.html 14i/14j, Desktop 14k): eleven short ones, each
// 3–6 steps, each step one line and a crop of the real screen. Written from the app as it is now
// (docs/log/2026-10-07-*-tour-handoff.md lists the sources). `**word**` is bold. A step's crop is
// app/public/guide/<slug>-<n>.webp, made by docs/log/assets/tour/verify.mjs from the mock app;
// crops.json holds each one's size so the page doesn't jump while they load.

export interface Step {
  /** The short name "On this page" lists (desktop). */
  name: string
  text: string
}

export interface Article {
  slug: string
  title: string
  sub: string
  section: string
  icon: IconName | 'sun'
  tint: string
  min: number
  intro: string
  steps: Step[]
}

export const SECTIONS = ['Start here', 'Your day', 'Bringing things in', 'Your data'] as const

export const ARTICLES: Article[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    sub: 'Your first morning, in five minutes',
    section: 'Start here',
    icon: 'sprout',
    tint: 'var(--block-sage)',
    min: 2,
    intro: 'One morning is enough to learn the whole loop: catch it, pick three, plan, close.',
    steps: [
      { name: 'Catch it', text: 'Write whatever’s on your mind with the terra **capture** button — tap to type, hold to talk.' },
      { name: 'Pick three', text: '**Star** three things for today. They’re your Top 3; the first is the goal of the day.' },
      { name: 'Plan', text: 'Before five, **Plan my day** walks you through it and gives your three a time.' },
      { name: 'Close', text: 'From five, **Shut down** sweeps what’s left and seeds tomorrow.' },
      { name: 'Updates', text: 'After an update, **What’s new** says what changed. Settings → App → **Check for updates** looks any time.' },
      { name: 'Sounds', text: 'Settings → **Sound**: pick Felt, Kalimba or Glass, or turn each sound off.' },
    ],
  },
  {
    slug: 'capture',
    title: 'Capture',
    sub: 'Tap to write, hold to talk',
    section: 'Start here',
    icon: 'mic',
    tint: 'var(--block-blossom)',
    min: 1,
    intro: 'Get it out of your head first. Sorting can wait.',
    steps: [
      { name: 'On a phone', text: 'On a phone, **tap** the terra button to type, or **hold** it to talk.' },
      { name: 'On a computer', text: 'On a computer, press **⌘K / Ctrl+K**, or the **Capture** button at the top of Today.' },
      { name: 'Write it plainly', text: 'Write it plainly. The AI fills in the date, priority, length and notes.' },
      { name: 'Say it yourself', text: 'Or mark it yourself: **!** **!!** **!!!** for priority, **30m** for length, **#project**, ***label**.' },
      { name: 'Where it lands', text: 'A line with any detail becomes a task — with a time, a block on the calendar too; a plain one waits in the **Inbox**.' },
    ],
  },
  {
    slug: 'today',
    title: 'Today & Top 3',
    sub: 'What now, what next, and the three that matter',
    section: 'Start here',
    icon: 'star',
    tint: 'var(--block-buttercream)',
    min: 1,
    intro: 'Today answers two questions: what now, and what next.',
    steps: [
      { name: 'The day at a glance', text: 'The top line says how full the day is; a block that’s running shows as **Now**.' },
      { name: 'Top 3', text: '**Top 3** leads. The first one is your goal of the day.' },
      { name: 'Star one', text: 'Tap **☆** on any task to make it one of the three.' },
      { name: 'Up next', text: '**Up next** is what’s still on the calendar today; the rest rests under **More for today**.' },
    ],
  },
  {
    slug: 'gestures',
    title: 'Gestures',
    sub: 'Swipe, hold and drag',
    section: 'Start here',
    icon: 'tomorrow',
    tint: 'var(--block-sage)',
    min: 1,
    intro: 'Most of Kai’s Flow works with one thumb. Five moves cover nearly everything.',
    steps: [
      { name: 'Swipe right', text: 'Swipe a task **right** to move it to tomorrow — or stop halfway for Pick date or Project.' },
      { name: 'Swipe left', text: 'Swipe **left** to let it go. It rests in Trash for 30 days.' },
      { name: 'Undo', text: 'Changed your mind? Tap **Undo** before it fades.' },
      { name: 'Hold to select', text: '**Hold** a task to select it, then tap the others.' },
      { name: 'Hold to talk', text: '**Hold** the capture button to talk. Let go, and it’s written down.' },
    ],
  },
  {
    slug: 'plan',
    title: 'Plan my day & Shut down',
    sub: 'Open the day, close the garden',
    section: 'Your day',
    icon: 'sun',
    tint: 'var(--block-buttercream)',
    min: 2,
    intro: 'Five minutes in the morning, three in the evening. Today offers each at its hour.',
    steps: [
      { name: 'Carry-over', text: '**Carry-over** first: send each late task to Today, Tomorrow or Someday — or drop it.' },
      { name: 'Inbox', text: '**Inbox**: file or dismiss each new capture.' },
      { name: 'Pick your 3', text: '**Pick your 3**: star them, or search everything you have.' },
      { name: 'Times', text: 'Times are suggestions — tap one to change it. **Start the day** puts them on your calendar.' },
      { name: 'Shut down', text: 'In the evening, **Shut down**: sweep each task to Done or Tomorrow, then write one line.' },
      { name: 'Seeds', text: 'Star tomorrow’s three, then **Close the day**. Goodnight ✿' },
    ],
  },
  {
    slug: 'calendar',
    title: 'Calendar',
    sub: 'Blocks, drags and 15-minute snaps',
    section: 'Your day',
    icon: 'calendar',
    tint: 'var(--block-lavender)',
    min: 2,
    intro: 'Your day as a bed of blocks. Tasks become time when you put them somewhere.',
    steps: [
      { name: 'Time or date', text: 'Give a task a **time** and it goes on the calendar; a **date** alone keeps it in that day’s list.' },
      { name: 'From the rail', text: 'The rail keeps **Overdue · Today · Inbox** ready. Drag a card onto a time to plant it.' },
      { name: 'Move and resize', text: '**Drag** a block to move it, or pull an edge to resize. It snaps every 15 minutes.' },
      { name: 'On the phone', text: 'On a phone, **hold** a block to lift it, then drag it or pull its handles.' },
      { name: 'Turn the day', text: 'Swipe sideways to turn the day, or tap one in the week strip.' },
    ],
  },
  {
    slug: 'routines',
    title: 'Routines',
    sub: 'Small habits, forgiving streaks',
    section: 'Your day',
    icon: 'routines',
    tint: 'var(--block-sage)',
    min: 1,
    intro: 'The small things you do again and again, and a vine that grows with them.',
    steps: [
      { name: 'Plant one', text: '**＋ New routine**: give it a name, a time of day and the days it repeats.' },
      { name: 'Tick it off', text: 'Check it off on **Today** or on Routines.' },
      { name: 'Forgiving streaks', text: 'Streaks are forgiving: one missed day a month just rains, and the vine holds.' },
      { name: 'The vine', text: 'The vine grows with your streak — bare, sprouting, flowering, lush.' },
    ],
  },
  {
    slug: 'projects',
    title: 'Projects & the Herbarium',
    sub: 'Big things, pressed when they’re done',
    section: 'Your day',
    icon: 'projects',
    tint: 'var(--block-blossom)',
    min: 2,
    intro: 'A project is a plant you tend for weeks. When it’s done, you keep it.',
    steps: [
      { name: 'Milestones', text: 'Give a project **milestones**; each one carries a weight.' },
      { name: 'Wisteria', text: 'Its wisteria grows as the milestones are finished.' },
      { name: 'Archive', text: 'Done? **Archive project…** at the foot of its page.' },
      { name: 'The Herbarium', text: 'It’s pressed into the **Herbarium**, filed by season. Restore it any time.' },
      { name: 'Perennials', text: '**Perennials** keeps your repeating tasks: pause, skip, or change the rhythm.' },
    ],
  },
  {
    slug: 'import',
    title: 'Import',
    sub: 'From Todoist, TickTick, Notion and more',
    section: 'Bringing things in',
    icon: 'inbox',
    tint: 'var(--block-hydrangea)',
    min: 1,
    intro: 'Bring your old lists with you. Nothing is doubled, and the summary has Undo.',
    steps: [
      { name: 'Open it', text: 'On a computer, Settings → **Import data** → Open importer.' },
      { name: 'Where from', text: 'Pick where from: Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle, Goodreads or a CSV.' },
      { name: 'Bring it in', text: 'Check the preview, then bring it in. Importing twice never makes doubles.' },
    ],
  },
  {
    slug: 'anywhere',
    title: 'Capture from anywhere',
    sub: 'Share sheet, Shortcuts, Tasker, a link',
    section: 'Bringing things in',
    icon: 'link',
    tint: 'var(--block-hydrangea)',
    min: 2,
    intro: 'The garden gate is never far: share to it, send to it, or photograph a page.',
    steps: [
      { name: 'Share', text: '**Share** any text or link to Kai’s Flow; it lands in your Inbox.' },
      { name: 'A capture key', text: 'Settings → **Capture from anywhere**: make a key for iPhone Shortcuts, Tasker or a bookmarklet.' },
      { name: 'Recipes', text: '**How to send things here** has the recipes, ready to copy.' },
      { name: 'Windows', text: 'On Windows, click the **K** by the clock and write it down.' },
      { name: 'Paper', text: '**Scan paper**: photograph a list, and each line becomes a task, event or note.' },
    ],
  },
  {
    slug: 'data',
    title: 'Your data & privacy',
    sub: 'What’s stored where, and who reads it',
    section: 'Your data',
    icon: 'lock',
    tint: 'var(--paper-bone)',
    min: 1,
    intro: 'Your garden is yours. Here’s where it lives and who else ever sees it.',
    steps: [
      { name: 'Your account', text: 'Everything lives in your own account, and only you can read it.' },
      { name: 'Offline', text: 'Changes made offline wait on this device and sync when you’re back.' },
      { name: 'The AI', text: 'The AI runs through Groq, which doesn’t train on your words or keep them.' },
      { name: 'Signing out', text: 'Signing out with changes that haven’t synced asks first — staying is the default.' },
      { name: 'Trash', text: 'Deleted things rest in **Trash** for 30 days; restore them, or let them go for good.' },
    ],
  },
]

const SIZES = CROPS as Record<string, [number, number]>

/** A step's crop, with its size; null when the harness hasn't made one. */
export function cropOf(slug: string, i: number): { src: string; w: number; h: number } | null {
  const name = `${slug}-${i + 1}`
  const size = SIZES[name]
  return size ? { src: `/guide/${name}.webp`, w: size[0], h: size[1] } : null
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'")

/** Search: every word must appear somewhere in the article — title, line, intro or a step. */
export function searchArticles(articles: readonly Article[], q: string): Article[] {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return [...articles]
  return articles.filter((a) => {
    const hay = fold([a.title, a.sub, a.intro, ...a.steps.flatMap((s) => [s.name, s.text])].join(' ').replace(/\*\*/g, ''))
    return words.every((w) => hay.includes(w))
  })
}
