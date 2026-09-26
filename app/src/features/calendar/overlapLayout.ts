// CALENDAR.md §6 Layout — overlap geometry (J-13). FullCalendar's own answer to overlapping
// blocks is its shingle, which overprinted titles and times ("unreadable", Kai 2026-07-28).
// This decides, per block, which of the spec's two geometries it takes; CalendarGrid turns the
// answer into classes and CalendarGrid.css draws them.
//
//   overlap (2)  → side by side, each calc(50% − 2px), 4px gutter
//   stacked (3+) → shingle 56% wide, offset 22% per index, later on top; a block that would sit
//                  past the third index is fully hidden, and the topmost reads "+N more"
//
// Pure: no DOM, no FullCalendar — so it is unit-tested directly.

export interface OverlapInput {
  id: string
  /** epoch ms */
  start: number
  /** epoch ms, exclusive */
  end: number
}

export type OverlapSlot =
  /** Two lanes: 0 = left, 1 = right. */
  | { kind: 'pair'; lane: 0 | 1 }
  /** Three+ lanes: shingle index 0–2. `hidden` (topmost only) = blocks drawn under it, not at all. */
  | { kind: 'stack'; lane: 0 | 1 | 2; hidden: string[] }
  /** Past the third shingle index — not drawn; reachable from `under`'s "+N more". */
  | { kind: 'hidden'; under: string }

/** The spec's visible shingle depth: 3 × 22% offset + 56% width = exactly the column. */
const STACK_DEPTH = 3

/** Clusters overlapping blocks, packs each cluster into lanes, and maps every block that shares
 * time with another to its slot. Blocks that overlap nothing are absent from the map.
 *
 * `keepVisible` (Polish F2b, conductor decision 2026-09-26: "the block you just dropped always
 * stays visible"): if that block would be hidden past the third index, it takes the topmost
 * visible lane instead, and the topmost block(s) it overlaps there go under it — together with
 * whatever they were hiding, so its "+N more" still reaches every block. The caller keeps it
 * pinned only until the next interaction, then the plain §6 order comes back. */
export function layoutOverlaps(blocks: OverlapInput[], keepVisible?: string | null): Map<string, OverlapSlot> {
  const out = new Map<string, OverlapSlot>()
  // §6: "earlier start left, longer wins ties" — sort once, then lanes fill left to right.
  const sorted = [...blocks]
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  let cluster: { id: string; start: number; end: number; lane: number; under: string | null }[] = []
  let laneEnd: number[] = [] // end of the latest block in each lane
  let laneLast: string[] = [] // id of that block
  let clusterEnd = -Infinity

  const flush = () => {
    const lanes = laneEnd.length
    if (lanes === 2) {
      for (const b of cluster) out.set(b.id, { kind: 'pair', lane: b.lane as 0 | 1 })
    } else if (lanes > 2) {
      for (const b of cluster) {
        if (b.lane < STACK_DEPTH) out.set(b.id, { kind: 'stack', lane: b.lane as 0 | 1 | 2, hidden: [] })
      }
      for (const b of cluster) {
        if (b.lane < STACK_DEPTH || !b.under) continue
        out.set(b.id, { kind: 'hidden', under: b.under })
        const top = out.get(b.under)
        if (top?.kind === 'stack') top.hidden.push(b.id)
      }
      const pinned = keepVisible ? cluster.find((b) => b.id === keepVisible && b.lane >= STACK_DEPTH) : undefined
      if (pinned) promote(pinned)
    }
    cluster = []
    laneEnd = []
    laneLast = []
  }

  /** `keepVisible`: the pinned block takes the topmost lane where it sits; every topmost-lane block
   * sharing its time goes under it, handing over the blocks it was hiding. */
  const promote = (pinned: (typeof cluster)[number]) => {
    const hidden: string[] = []
    for (const top of cluster) {
      if (top.lane !== STACK_DEPTH - 1 || top.start >= pinned.end || pinned.start >= top.end) continue
      const slot = out.get(top.id)
      const under = slot?.kind === 'stack' ? slot.hidden.filter((id) => id !== pinned.id) : []
      hidden.push(top.id, ...under)
      out.set(top.id, { kind: 'hidden', under: pinned.id })
      for (const id of under) out.set(id, { kind: 'hidden', under: pinned.id })
    }
    out.set(pinned.id, { kind: 'stack', lane: (STACK_DEPTH - 1) as 2, hidden })
  }

  for (const b of sorted) {
    if (b.start >= clusterEnd) flush()
    let lane = laneEnd.findIndex((end) => end <= b.start)
    if (lane === -1) lane = laneEnd.length
    // Lane ≥ 3 only happens when lanes 0–2 are all still busy at b.start, so the block in the
    // topmost visible lane covers b's start — that is the block whose "+N more" owns it.
    cluster.push({ id: b.id, start: b.start, end: b.end, lane, under: lane >= STACK_DEPTH ? laneLast[STACK_DEPTH - 1] : null })
    laneEnd[lane] = b.end
    laneLast[lane] = b.id
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  flush()
  return out
}
