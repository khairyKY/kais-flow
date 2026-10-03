// Kindle adapter — "My Clippings.txt" (documents/ on the Kindle over USB). Pure, no app imports.
//
// Each clipping:   Title (Author)
//                  - Your Highlight on page 12 | Location 170-172 | Added on Monday, 5 October 2026 07:12:44
//                  <blank>
//                  text
//                  ==========
// Highlights → quotes (by book), notes → notes on the book, bookmarks → skipped. Every book becomes
// a Library book ('reading'); one already in the Library (same title) is reused by the wizard.
// Kindle never rewrites the file: editing a highlight appends a new clipping, so the old version
// stays. A later highlight in the same book that contains an earlier one (or the reverse), or
// starts at the same location, replaces it — last edit wins.
// ponytail: an edit that moves both ends of a highlight survives as two quotes; tidy by hand.

import {
  type ImportBatch, type ImportBook, type ImportQuote, type ImportNote,
  stableHash, textKey, titleKey, eachChunked, emptyBatch,
} from './shared'

interface Clip extends ImportQuote { key: string; loc: number | null }

/** "Burkeman, Oliver" → "Oliver Burkeman"; several authors (";") stay as written. */
function authorName(a: string): string {
  const parts = a.split(',')
  return parts.length === 2 && !a.includes(';') ? `${parts[1].trim()} ${parts[0].trim()}` : a.trim()
}

export async function parseKindle(text: string): Promise<ImportBatch> {
  const blocks = text.replace(/^﻿/, '').split(/\r?\n?==========\r?\n?/)
  if (!/^\s*-\s.*\|/m.test(text)) throw new Error('not a My Clippings.txt')

  const books = new Map<string, ImportBook>()
  const clips = new Map<string, Clip[]>() // titleKey → that book's highlights, in file order
  const notes = new Map<string, ImportNote>()

  await eachChunked(blocks, (block) => {
    const lines = block.replace(/^﻿/, '').split(/\r?\n/)
    while (lines.length && !lines[0].trim()) lines.shift()
    const [head, meta, ...rest] = lines
    const body = rest.join('\n').trim()
    if (!head || !meta?.trim().startsWith('-') || !body || /bookmark/i.test(meta)) return

    const m = head.trim().match(/^(.*\S)\s*\(([^()]*[a-z][^()]*)\)$/i)
    const title = (m ? m[1] : head).replace(/^﻿/, '').trim()
    const author = m ? authorName(m[2]) : null
    const k = titleKey(title)
    if (!books.has(k)) books.set(k, { title, author, published_year: null, total_pages: null, shelf: 'reading' })
    const book = books.get(k)!.title

    const page = meta.match(/\bpage\s+([\w-]+)/i)?.[1] ?? null
    const locText = meta.match(/\b(?:location|loc\.)\s+([\d-]+)/i)?.[1] ?? null
    const where = page ?? (locText ? `loc ${locText}` : null)

    if (/\bnote\b/i.test(meta)) {
      const id = stableHash(`${k}|${locText ?? page ?? ''}|${body}`)
      notes.set(id, { title: null, body, tags: ['kindle'], book, external_ref: { source: 'kindle', id, raw: { book: head.trim(), meta: meta.trim(), text: body } } })
      return
    }

    const clip: Clip = { text: body, book, author, page: where, key: textKey(body), loc: locText ? parseInt(locText, 10) : null }
    const list = clips.get(k) ?? []
    // An edit never moves a highlight's start far, so only nearby clippings are compared (a 20k-clipping file stays fast).
    const near = (c: Clip) => c.loc == null || clip.loc == null || Math.abs(c.loc - clip.loc) <= 100
    const prev = list.findIndex((c) => near(c) && ((c.loc != null && c.loc === clip.loc) || c.key.includes(clip.key) || clip.key.includes(c.key)))
    if (prev >= 0) list.splice(prev, 1)
    list.push(clip)
    clips.set(k, list)
  })

  const quotes: ImportQuote[] = [...clips.values()].flat().map(({ text, book, author, page }) => ({ text, book, author, page }))
  return { ...emptyBatch('kindle'), books: [...books.values()], quotes, notes: [...notes.values()] }
}
