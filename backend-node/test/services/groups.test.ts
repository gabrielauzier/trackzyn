import { describe, expect, it } from 'vitest'
import { normalizeBlocks } from '../../src/services/groups.ts'

/** `normalizeBlocks` over ids whose group is told by a map; an id out of the map has no group. */
const normalize = (ids: string[], groups: Record<string, string>) => normalizeBlocks(ids, (id) => groups[id] ?? null)

describe('normalizeBlocks (AD-013)', () => {
  it('an empty column stays empty', () => {
    expect(normalize([], {})).toEqual([])
  })

  it('a column without groups keeps its order', () => {
    expect(normalize(['a', 'b', 'c'], {})).toEqual(['a', 'b', 'c'])
  })

  it('joins the tasks of one group at the place of its first task, in their order, and leaves the loose tasks in place', () => {
    expect(normalize(['a', 'g1', 'b', 'g2', 'c', 'g3'], { g1: 'G', g2: 'G', g3: 'G' })).toEqual(['a', 'g1', 'g2', 'g3', 'b', 'c'])
  })

  it('a group already contiguous does not move', () => {
    expect(normalize(['a', 'g1', 'g2', 'b'], { g1: 'G', g2: 'G' })).toEqual(['a', 'g1', 'g2', 'b'])
  })

  it('two interleaved groups each join at the place of their own first task', () => {
    expect(normalize(['x1', 'y1', 'x2', 'a', 'y2', 'x3'], { x1: 'X', x2: 'X', x3: 'X', y1: 'Y', y2: 'Y' })).toEqual([
      'x1',
      'x2',
      'x3',
      'y1',
      'y2',
      'a',
    ])
  })
})
