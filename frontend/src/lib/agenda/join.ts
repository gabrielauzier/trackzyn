import type { Piece } from './layout'

const startOf = (piece: Piece) => Date.parse(piece.session.started_at)
const endOf = (piece: Piece) => Date.parse(piece.session.ended_at!)

/** Whether `piece` may join a block: a closed session that lies whole on its day and is not the one set apart (MERGE-18, MERGE-29). */
function joinable(piece: Piece, apartId: string | null): boolean {
  if (piece.running || piece.session.ended_at === null || piece.session.id === apartId) return false
  return Math.floor((endOf(piece) - startOf(piece)) / 1000) === piece.seconds
}

/**
 * The visible pieces of one day with the near sessions joined (MERGE-11 to MERGE-18): closed sessions of one list and
 * kind whose gap, from the latest end of the block so far to the next start, is `gapMinutes` × 60 s or less, measured
 * on the sessions' own instants, become one piece from the first start to the latest end, with `members` in start order.
 * Every other piece comes back as it was; a null gap gives the pieces back unchanged (MERGE-22).
 */
export function joinPieces(pieces: Piece[], gapMinutes: number | null, apartId: string | null): Piece[] {
  if (gapMinutes === null) return pieces
  const gapMs = gapMinutes * 60_000
  const result: Piece[] = []
  const blocks: Piece[][] = []
  const open = new Map<string, { block: Piece[]; end: number }>()
  const candidates: Piece[] = []
  for (const piece of pieces) (joinable(piece, apartId) ? candidates : result).push(piece)
  candidates.sort((a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b))
  for (const piece of candidates) {
    const key = `${piece.session.list_id}:${piece.session.kind}`
    const current = open.get(key)
    if (current && startOf(piece) - current.end <= gapMs) {
      current.block.push(piece)
      current.end = Math.max(current.end, endOf(piece))
    } else {
      const block = [piece]
      blocks.push(block)
      open.set(key, { block, end: endOf(piece) })
    }
  }
  for (const block of blocks) {
    if (block.length === 1) {
      result.push(block[0]!)
      continue
    }
    const [first] = block as [Piece]
    result.push({
      session: first.session,
      day: first.day,
      start: first.start,
      end: Math.max(...block.map((piece) => piece.end)),
      running: false,
      seconds: block.reduce((sum, piece) => sum + piece.seconds, 0),
      members: block.map((piece) => piece.session),
    })
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end)
}
