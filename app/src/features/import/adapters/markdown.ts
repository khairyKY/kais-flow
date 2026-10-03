// Obsidian / Markdown adapter — one or many .md files (or a whole vault folder). Pure, no app imports.
//
//   "- [ ] task" / "- [x] done" (also *, +, "1." bullets; "[-]" cancelled counts as done) → tasks
//   Obsidian Tasks emoji:  📅 due → due_at · ⏳ scheduled / 🛫 start → due_at when there's no 📅
//                          (the app's scheduled_start is a timed calendar block, a bare date isn't one)
//                          ✅ / ❌ date → completed_at · 🔁 "every week" → recurrence_rule
//                          🔺⏫ / 🔼 / 🔽⏬ → priority 1 / 2 / 3 · ➕ 🆔 ⛔ → dropped from the title
//   #tag → labels (#123 stays text) · [[Note|alias]] → alias · indented task → subtask of the one above
//   project: none, the nearest heading, or the file name — the user picks (MarkdownOptions)
//   plain paragraphs (and plain bullets) → skipped, or pending Inbox notes on opt-in
//   front matter and fenced code are ignored.
// Ids: hash(file path + title + nth repeat of that title in the file) — editing a task's date
// keeps its id; renaming its file or its text makes a new one.

import {
  type ImportBatch, type ImportTask, type ImportInboxItem,
  naiveLocalToUtc, parseRecurrence, todayMidnight, stableHash, eachChunked, emptyBatch,
} from './shared'

export interface MarkdownOptions {
  /** Where a task's project comes from: nowhere, the heading above it, or its file's name. */
  projectFrom: 'none' | 'heading' | 'file'
  /** Plain paragraphs → pending Inbox notes (off: skipped). */
  paragraphsToInbox: boolean
}

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/
const RULE = /^\s*([-*_]\s*){3,}$/
const dated = (emoji: string) => new RegExp(`(?:${emoji})\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u')
const DUE = dated('📅|📆|🗓')
const SCHEDULED = dated('⏳|⌛')
const START = dated('🛫')
const DONE = dated('✅|❌')
const REPEAT = /🔁️?\s*([^📅📆🗓⏳⌛🛫✅➕❌⏫🔼🔽🔺⏬🆔⛔#]*)/u
const PRIORITY: [RegExp, number][] = [[/🔺|⏫/u, 1], [/🔼/u, 2], [/🔽|⏬/u, 3]]
const TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu

function clean(s: string): string {
  return s
    .replace(/(?:📅|📆|🗓|⏳|⌛|🛫|✅|➕|❌)️?\s*\d{4}-\d{2}-\d{2}/gu, '')
    .replace(new RegExp(REPEAT.source, 'gu'), '')
    .replace(/[🔺⏫🔼🔽⏬]️?/gu, '')
    .replace(/(?:🆔|⛔)️?\s*\S+/gu, '')
    .replace(TAG, (m, pre: string, tag: string) => (/^\d+$/.test(tag) ? m : pre))
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseMarkdown(
  files: { path: string; text: string }[],
  opts: MarkdownOptions,
  now: Date = new Date(),
): Promise<ImportBatch> {
  const tasks: ImportTask[] = []
  const inbox: ImportInboxItem[] = []
  const projects = new Set<string>()

  await eachChunked(files, ({ path, text }) => {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/)
    let i = 0
    if (lines[0]?.trim() === '---') {
      const end = lines.findIndex((l, j) => j > 0 && l.trim() === '---')
      if (end > 0) i = end + 1
    }
    const fileName = (path.split('/').pop() ?? path).replace(/\.(md|markdown)$/i, '')
    let heading: string | null = null
    let inCode = false
    let para: string[] = []
    const parents: { indent: number; id: string }[] = []
    const seen = new Map<string, number>()
    const flush = () => {
      const body = para.join('\n').trim()
      para = []
      if (opts.paragraphsToInbox && body) inbox.push({ raw_text: body, external_ref: { source: 'markdown', id: stableHash(`${path}|${body}`), raw: { file: path, heading } } })
    }

    for (; i < lines.length; i++) {
      const line = lines[i]
      if (FENCE.test(line)) { flush(); inCode = !inCode; continue }
      if (inCode) continue
      const h = line.match(HEADING)
      if (h) { flush(); heading = clean(h[1]) || null; parents.length = 0; continue }
      const t = line.match(TASK)
      if (!t) {
        if (!line.trim() || RULE.test(line)) flush()
        else para.push(line.trim())
        continue
      }
      flush()
      const body = t[3]
      const title = clean(body)
      if (!title) continue
      const indent = t[1].replace(/\t/g, '    ').length
      while (parents.length && parents[parents.length - 1].indent >= indent) parents.pop()
      const n = (seen.get(title) ?? 0) + 1
      seen.set(title, n)
      const id = stableHash(`${path}|${title}|${n}`)
      const day = (re: RegExp) => body.match(re)?.[1] ?? null
      const due = day(DUE) ?? day(SCHEDULED) ?? day(START)
      const repeat = body.match(REPEAT)?.[1]?.trim()
      const rule = repeat ? parseRecurrence(repeat) : null
      const done = /[xX-]/.test(t[2])
      const doneDay = day(DONE)
      const project = opts.projectFrom === 'file' ? fileName : opts.projectFrom === 'heading' ? heading : null
      if (project) projects.add(project)
      tasks.push({
        title,
        notes: null,
        priority: PRIORITY.find(([re]) => re.test(body))?.[1] ?? null,
        duration_min: null,
        due_at: due ? naiveLocalToUtc(due) : rule ? todayMidnight(now) : null,
        scheduled_start: null,
        scheduled_end: null,
        someday: false,
        done,
        completed_at: done && doneDay ? naiveLocalToUtc(doneDay) : null,
        labels: [...body.matchAll(TAG)].map((m) => m[2]).filter((tag) => !/^\d+$/.test(tag)),
        sourceProjectId: project ? `project:${project}` : null,
        recurrence_rule: rule,
        sourceParentId: parents[parents.length - 1]?.id ?? null,
        external_ref: { source: 'markdown', id, raw: { file: path, line: line.trim(), heading } },
      })
      parents.push({ indent, id })
    }
    flush()
  }, 20)

  return {
    ...emptyBatch('markdown'),
    projects: [...projects].map((name) => ({ name, external_ref: { source: 'markdown', id: `project:${name}`, raw: { name } } })),
    tasks,
    inbox,
  }
}
