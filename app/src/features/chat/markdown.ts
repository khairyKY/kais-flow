// Queue item 5: the chat printed a markdown table as raw pipes. Its answers are read here into the
// little the model writes — paragraphs, lists, a table, a heading, **bold**, *italics*, `code` — and
// ChatPanel draws them as real elements. Text only, never HTML: nothing in a reply can inject markup
// or a link. Pure, so it's tested (planCard.test.ts).

export type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBER = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const tableAt = (lines: readonly string[], i: number) => lines[i].trim().startsWith('|') && isRule(lines[i + 1] ?? '')

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (tableAt(lines, i)) {
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      blocks.push({ type: 'table', head, rows })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'h', text: heading[1] })
      i++
      continue
    }
    const re = BULLET.test(line) ? BULLET : NUMBER.test(line) ? NUMBER : null
    if (re) {
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) items.push(re.exec(lines[i++])![1])
      blocks.push({ type: re === BULLET ? 'ul' : 'ol', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !HEADING.test(lines[i]) && !tableAt(lines, i)) para.push(lines[i++].trim())
    blocks.push({ type: 'p', lines: para })
  }
  return blocks
}

export type Inline = { t: 'text' | 'b' | 'i' | 'code'; s: string }

/** **bold**, *italics* / _italics_, `code`; the rest as text. */
export function inlineParts(text: string): Inline[] {
  const out: Inline[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|(?<![\p{L}\p{N}])_[^_\s][^_]*_(?![\p{L}\p{N}]))/gu
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) })
    const tok = m[0]
    out.push(tok.startsWith('**') ? { t: 'b', s: tok.slice(2, -2) } : tok.startsWith('`') ? { t: 'code', s: tok.slice(1, -1) } : { t: 'i', s: tok.slice(1, -1) })
    last = m.index + tok.length
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) })
  return out
}
